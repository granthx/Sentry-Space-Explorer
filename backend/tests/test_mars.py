from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.errors import ApiError
from app.nasa_client import NasaAPIError
from app.services import mars_library, sky_day

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8-sig"))


# ==============================================================================
# Unit tests: mars_library service
# ==============================================================================

def test_validate_search_params():
    mars_library.validate_search_params("curiosity rover", 1)
    mars_library.validate_search_params("a" * 80, 100)

    with pytest.raises(ApiError) as exc:
        mars_library.validate_search_params("a" * 81, 1)
    assert exc.value.status_code == 422
    assert "80 characters" in exc.value.message

    with pytest.raises(ApiError) as exc2:
        mars_library.validate_search_params("mars", 0)
    assert exc2.value.status_code == 422

    with pytest.raises(ApiError) as exc3:
        mars_library.validate_search_params("mars", 101)
    assert exc3.value.status_code == 422


async def test_search_images_normalizes_and_forces_https():
    raw_collection = {
        "collection": {
            "metadata": {"total_hits": 100},
            "items": [
                {
                    "data": [
                        {
                            "nasa_id": "PIA12345",
                            "title": "  Curiosity   Selfie  ",
                            "description": "A" * 400,
                            "date_created": "2021-05-10T12:00:00Z",
                            "keywords": ["Mars", "Rover"],
                            "center": "JPL",
                        }
                    ],
                    "links": [
                        {
                            "href": "http://images-assets.nasa.gov/thumb.jpg",
                            "rel": "preview",
                        }
                    ],
                }
            ],
        }
    }

    class FakeClient:
        settings = SimpleNamespace(nasa_images_base_url="https://images-api.nasa.gov")

        async def get_json(self, path, params=None, **kwargs):
            return raw_collection

    res = await mars_library.search_images(FakeClient(), "curiosity selfie", page=1, page_size=24)
    assert res["total_hits"] == 100
    assert res["has_more"] is True
    assert len(res["items"]) == 1

    item = res["items"][0]
    assert item["nasa_id"] == "PIA12345"
    assert item["title"] == "Curiosity Selfie"
    assert len(item["description"]) <= 303  # trimmed with ellipsis
    assert item["date"] == "2021-05-10"
    assert item["thumb_url"].startswith("https://")  # http -> https forced


async def test_fetch_image_asset_picks_largest():
    asset_raw = {
        "collection": {
            "items": [
                {"href": "http://images-assets.nasa.gov/PIA123~thumb.jpg"},
                {"href": "http://images-assets.nasa.gov/PIA123~small.jpg"},
                {"href": "http://images-assets.nasa.gov/PIA123~orig.jpg"},
                {"href": "http://images-assets.nasa.gov/PIA123~large.jpg"},
                {"href": "http://images-assets.nasa.gov/metadata.json"},
            ]
        }
    }

    class FakeClient:
        settings = SimpleNamespace(nasa_images_base_url="https://images-api.nasa.gov")

        async def get_json(self, path, **kwargs):
            return asset_raw

    detail = await mars_library.fetch_image_asset(FakeClient(), "PIA123")
    assert detail["nasa_id"] == "PIA123"
    assert "large.jpg" in detail["image_url"]
    assert detail["image_url"].startswith("https://")
    assert len(detail["all_urls"]) == 5


# ==============================================================================
# Unit tests: sky_day service (APOD + Asteroids concurrent)
# ==============================================================================

async def test_fetch_day_both_succeed(monkeypatch):
    async def fake_apod(nasa, on):
        return {"date": on.isoformat(), "title": "Sky Picture", "url": "https://apod/a.jpg"}

    async def fake_window(nasa, start, end):
        return {"count": 5, "highlights": {"closest": {"name": "Ast 1", "miss_lunar": 3.2}}}

    monkeypatch.setattr(sky_day, "fetch_apod", fake_apod)
    monkeypatch.setattr(sky_day, "fetch_window", fake_window)

    res = await sky_day.fetch_day(None, dt.date(2024, 5, 1))
    assert res["earth_date"] == "2024-05-01"
    assert res["apod"]["title"] == "Sky Picture"
    assert res["asteroids"]["count"] == 5
    assert res["asteroids"]["closest"]["miss_lunar"] == 3.2
    assert res["errors"]["apod"] is None
    assert res["errors"]["asteroids"] is None


async def test_fetch_day_apod_fails_asteroids_succeeds(monkeypatch):
    async def fake_apod(nasa, on):
        raise ApiError(502, "APOD service unavailable")

    async def fake_window(nasa, start, end):
        return {"count": 2, "highlights": {"closest": None}}

    monkeypatch.setattr(sky_day, "fetch_apod", fake_apod)
    monkeypatch.setattr(sky_day, "fetch_window", fake_window)

    res = await sky_day.fetch_day(None, dt.date(2024, 5, 1))
    assert res["apod"] is None
    assert "unavailable" in res["errors"]["apod"]
    assert res["asteroids"]["count"] == 2
    assert res["errors"]["asteroids"] is None


async def test_fetch_day_asteroids_fails_apod_succeeds(monkeypatch):
    async def fake_apod(nasa, on):
        return {"date": on.isoformat(), "title": "Good APOD"}

    async def fake_window(nasa, start, end):
        raise ApiError(504, "NeoWs timeout")

    monkeypatch.setattr(sky_day, "fetch_apod", fake_apod)
    monkeypatch.setattr(sky_day, "fetch_window", fake_window)

    res = await sky_day.fetch_day(None, dt.date(2024, 5, 1))
    assert res["apod"]["title"] == "Good APOD"
    assert res["errors"]["apod"] is None
    assert res["asteroids"] is None
    assert "timeout" in res["errors"]["asteroids"]


async def test_fetch_day_pre_archive_date(monkeypatch):
    async def fake_window(nasa, start, end):
        return {"count": 0, "highlights": {"closest": None}}

    monkeypatch.setattr(sky_day, "fetch_window", fake_window)

    res = await sky_day.fetch_day(None, dt.date(1990, 1, 1))
    assert res["apod"] is None
    assert "1995-06-16" in res["errors"]["apod"]
    assert res["asteroids"]["count"] == 0


# ==============================================================================
# Contract test: real NASA Image Library fixture
# ==============================================================================

def test_contract_nasa_images_search_mars_fixture():
    fixture = load_fixture("nasa_images_search_mars.json")
    coll = fixture.get("collection") or {}
    items = coll.get("items") or []
    assert len(items) > 0

    class FakeClient:
        settings = SimpleNamespace(nasa_images_base_url="https://images-api.nasa.gov")

        async def get_json(self, path, params=None, **kwargs):
            return fixture

    import asyncio
    res = asyncio.run(mars_library.search_images(FakeClient(), "mars", page=1, page_size=3))
    assert res["total_hits"] > 0
    assert len(res["items"]) == len(items)
    for it in res["items"]:
        assert it["nasa_id"] is not None
        assert it["title"] is not None


# ==============================================================================
# Router / API tests via TestClient
# ==============================================================================

def test_api_mars_rovers_makes_zero_nasa_calls(api):
    r = api.http.get("/api/mars/rovers")
    assert r.status_code == 200
    body = r.json()
    assert "rovers" in body
    slugs = [rv["id"] for rv in body["rovers"]]
    assert "curiosity" in slugs
    assert "perseverance" in slugs
    assert "opportunity" in slugs
    assert "spirit" in slugs
    # Must make 0 NASA calls
    assert api.calls == []


def test_api_mars_library_search(api):
    fixture = load_fixture("nasa_images_search_mars.json")
    api.payload = fixture

    r = api.http.get("/api/mars/library?rover=curiosity&q=selfie&page=1")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert len(api.calls) == 1
    path, params, kwargs = api.calls[0]
    assert path == "search"
    assert "Curiosity rover selfie" in params["q"]
    assert kwargs.get("use_key") is False


def test_api_mars_library_page_bounds_422(api):
    assert api.http.get("/api/mars/library?page=0").status_code == 422
    assert api.http.get("/api/mars/library?page=101").status_code == 422


def test_api_mars_library_asset_detail(api):
    api.payload = {
        "collection": {
            "items": [
                {"href": "https://images-assets.nasa.gov/PIA123~large.jpg"},
                {"href": "https://images-assets.nasa.gov/PIA123~orig.jpg"},
            ]
        }
    }
    r = api.http.get("/api/mars/library/PIA123")
    assert r.status_code == 200
    body = r.json()
    assert body["nasa_id"] == "PIA123"
    assert "large.jpg" in body["image_url"]


def test_api_mars_day(api, monkeypatch):
    async def fake_fetch_day(nasa, date_val):
        return {
            "earth_date": date_val.isoformat(),
            "apod": {"title": "APOD title"},
            "asteroids": {"count": 1, "closest": None},
            "errors": {"apod": None, "asteroids": None},
        }

    monkeypatch.setattr(sky_day, "fetch_day", fake_fetch_day)
    r = api.http.get("/api/mars/day?earth_date=2024-05-01")
    assert r.status_code == 200
    assert r.json()["apod"]["title"] == "APOD title"

