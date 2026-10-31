from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pytest

from app.errors import ApiError
from app.nasa_client import NasaAPIError, NasaClient
from app.services.asteroids import (
    fetch_object,
    fetch_window,
    normalize_object,
    validate_asteroid_id,
    validate_window,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8-sig"))


# ==============================================================================
# Unit tests: normalize_object
# ==============================================================================

def test_normalize_object_parses_strings_and_strips_parens():
    raw = {
        "id": "12345",
        "name": " (2024 AB1) ",
        "nasa_jpl_url": "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=12345",
        "absolute_magnitude_h": "22.5",
        "is_potentially_hazardous_asteroid": False,
        "is_sentry_object": False,
        "estimated_diameter": {
            "meters": {
                "estimated_diameter_min": "100.5",
                "estimated_diameter_max": "200.5",
            }
        },
        "close_approach_data": [
            {
                "close_approach_date": "2026-11-01",
                "epoch_date_close_approach": 1793491200000,
                "relative_velocity": {"kilometers_per_second": "15.75"},
                "miss_distance": {
                    "lunar": "12.345",
                    "kilometers": "4745000.12",
                },
                "orbiting_body": "Earth",
            }
        ],
    }
    obj = normalize_object(raw, "2026-11-01")
    assert obj["id"] == "12345"
    assert obj["name"] == "2024 AB1"  # Parentheses stripped
    assert obj["date"] == "2026-11-01"
    assert obj["diameter_m_min"] == 100.5
    assert obj["diameter_m_max"] == 200.5
    assert obj["diameter_m_avg"] == 150.5
    assert obj["velocity_kms"] == 15.75
    assert obj["miss_lunar"] == 12.345
    assert obj["miss_km"] == 4745000.12
    assert obj["hazardous"] is False
    assert obj["sentry"] is False
    assert obj["absolute_magnitude"] == 22.5
    assert obj["orbiting_body"] == "Earth"
    assert obj["approach_time"] is not None


def test_normalize_object_missing_optional_fields():
    raw = {
        "id": 999,
        "name": "Asteroid Without Data",
    }
    obj = normalize_object(raw, "2026-10-31")
    assert obj["id"] == "999"
    assert obj["name"] == "Asteroid Without Data"
    assert obj["date"] == "2026-10-31"
    assert obj["approach_time"] is None
    assert obj["diameter_m_min"] is None
    assert obj["diameter_m_max"] is None
    assert obj["diameter_m_avg"] is None
    assert obj["velocity_kms"] is None
    assert obj["miss_lunar"] is None
    assert obj["miss_km"] is None
    assert obj["hazardous"] is False
    assert obj["sentry"] is False
    assert obj["absolute_magnitude"] is None
    assert obj["orbiting_body"] is None


# ==============================================================================
# Unit tests: validate_window & validate_asteroid_id
# ==============================================================================

def test_validate_window_valid_ranges():
    # Same day
    today = dt.date(2026, 10, 1)
    validate_window(today, today)
    # 7-calendar-day window (diff = 6 days)
    validate_window(today, today + dt.timedelta(days=6))


def test_validate_window_reversed_dates():
    start = dt.date(2026, 10, 10)
    end = dt.date(2026, 10, 5)
    with pytest.raises(ApiError) as exc:
        validate_window(start, end)
    assert exc.value.status_code == 422
    assert "earlier" in exc.value.message.lower()


def test_validate_window_exceeds_seven_days():
    start = dt.date(2026, 10, 1)
    end = dt.date(2026, 10, 8)  # 8 days diff (9 calendar days)
    with pytest.raises(ApiError) as exc:
        validate_window(start, end)
    assert exc.value.status_code == 422
    assert "7 days" in exc.value.message


def test_validate_asteroid_id():
    validate_asteroid_id("3718277")
    validate_asteroid_id("1")
    validate_asteroid_id("123456789012")

    for bad in ["", "   ", "abc", "12a3", "1234567890123", "-5"]:
        with pytest.raises(ApiError) as exc:
            validate_asteroid_id(bad)
        assert exc.value.status_code == 422


# ==============================================================================
# Service tests: fetch_window & fetch_object
# ==============================================================================

async def test_fetch_window_sorting_and_highlights(monkeypatch):
    feed_data = {
        "near_earth_objects": {
            "2026-10-31": [
                {
                    "id": "1",
                    "name": "(Object A)",
                    "is_potentially_hazardous_asteroid": False,
                    "estimated_diameter": {"meters": {"estimated_diameter_min": 10, "estimated_diameter_max": 20}},
                    "close_approach_data": [{"relative_velocity": {"kilometers_per_second": "25.0"}, "miss_distance": {"lunar": "15.0"}}],
                },
                {
                    "id": "2",
                    "name": "(Object B - Closest)",
                    "is_potentially_hazardous_asteroid": True,
                    "estimated_diameter": {"meters": {"estimated_diameter_min": 50, "estimated_diameter_max": 100}},
                    "close_approach_data": [{"relative_velocity": {"kilometers_per_second": "10.0"}, "miss_distance": {"lunar": "2.0"}}],
                },
            ],
            "2026-11-01": [
                {
                    "id": "3",
                    "name": "(Object C - Fastest & Largest)",
                    "is_potentially_hazardous_asteroid": True,
                    "estimated_diameter": {"meters": {"estimated_diameter_min": 500, "estimated_diameter_max": 1000}},
                    "close_approach_data": [{"relative_velocity": {"kilometers_per_second": "45.0"}, "miss_distance": {"lunar": "25.0"}}],
                }
            ],
        }
    }

    class FakeClient:
        async def get_json(self, path, params=None, **kwargs):
            return feed_data

    res = await fetch_window(FakeClient(), dt.date(2026, 10, 31), dt.date(2026, 11, 1))
    assert res["count"] == 3
    assert res["hazardous_count"] == 2
    # Verify sorted by miss_lunar ascending: Object B (2.0), Object A (15.0), Object C (25.0)
    assert res["objects"][0]["id"] == "2"
    assert res["objects"][1]["id"] == "1"
    assert res["objects"][2]["id"] == "3"

    assert res["highlights"]["closest"]["id"] == "2"
    assert res["highlights"]["fastest"]["id"] == "3"
    assert res["highlights"]["largest"]["id"] == "3"


async def test_fetch_window_empty_feed(monkeypatch):
    class FakeClient:
        async def get_json(self, path, params=None, **kwargs):
            return {"near_earth_objects": {}}

    res = await fetch_window(FakeClient(), dt.date(2026, 10, 31), dt.date(2026, 10, 31))
    assert res["count"] == 0
    assert res["hazardous_count"] == 0
    assert res["objects"] == []
    assert res["highlights"]["closest"] is None
    assert res["highlights"]["fastest"] is None
    assert res["highlights"]["largest"] is None


async def test_fetch_object_limits_approaches_to_12_closest_to_today():
    today = dt.date.today()
    # Create 20 approaches scattered around today
    approaches = []
    for offset in range(-10, 15):
        d_str = (today + dt.timedelta(days=offset * 100)).isoformat()
        approaches.append({
            "close_approach_date": d_str,
            "relative_velocity": {"kilometers_per_second": "10.0"},
            "miss_distance": {"lunar": "10.0", "kilometers": "3844000.0"},
            "orbiting_body": "Earth",
        })

    raw = {
        "id": "12345",
        "name": "(Test Asteroid)",
        "nasa_jpl_url": "https://jpl.nasa.gov",
        "is_potentially_hazardous_asteroid": True,
        "is_sentry_object": False,
        "absolute_magnitude_h": 20.0,
        "estimated_diameter": {"meters": {"estimated_diameter_min": 100, "estimated_diameter_max": 200}},
        "orbital_data": {
            "orbit_class": {"orbit_class_type": "APO", "orbit_class_description": "Apollo"},
            "eccentricity": "0.25",
            "semi_major_axis": "1.5",
            "inclination": "5.4",
            "orbital_period": "670.5",
            "observations_used": "150",
        },
        "close_approach_data": approaches,
    }

    class FakeClient:
        async def get_json(self, path, **kwargs):
            return raw

    detail = await fetch_object(FakeClient(), "12345")
    assert detail["name"] == "Test Asteroid"
    assert detail["hazardous"] is True
    assert detail["orbit"]["orbit_class_type"] == "APO"
    assert detail["orbit"]["eccentricity"] == 0.25
    assert detail["orbit"]["observations_used"] == 150
    assert len(detail["approaches"]) == 12
    # Verify the first approach is the one with offset 0 (closest in time to today)
    assert detail["approaches"][0]["date"] == today.isoformat()


# ==============================================================================
# Contract tests: loaded from real fixtures
# ==============================================================================

def test_contract_neows_feed_fixture():
    feed = load_fixture("neows_feed.json")
    assert "near_earth_objects" in feed
    neo_dict = feed["near_earth_objects"]
    assert len(neo_dict) > 0

    for date_str, objects in neo_dict.items():
        for raw in objects:
            norm = normalize_object(raw, date_str)
            assert norm["id"] is not None
            assert norm["name"] is not None
            assert not norm["name"].startswith("(")
            assert not norm["name"].endswith(")")
            assert norm["date"] is not None


def test_contract_neows_lookup_fixture():
    lookup = load_fixture("neows_lookup.json")
    asteroid_id = str(lookup["id"])

    class FakeClient:
        async def get_json(self, path, **kwargs):
            return lookup

    import asyncio
    detail = asyncio.run(fetch_object(FakeClient(), asteroid_id))
    assert detail["id"] == asteroid_id
    assert not detail["name"].startswith("(")
    assert detail["orbit"] is not None
    assert len(detail["approaches"]) <= 12


# ==============================================================================
# Router / API tests via TestClient
# ==============================================================================

def test_api_asteroids_default_window(api):
    feed = load_fixture("neows_feed.json")
    api.payload = feed

    r = api.http.get("/api/asteroids")
    assert r.status_code == 200
    body = r.json()
    assert "count" in body
    assert "objects" in body
    assert "highlights" in body
    assert len(api.calls) == 1
    path, params, _ = api.calls[0]
    assert path == "neo/rest/v1/feed"
    assert "start_date" in params
    assert "end_date" in params


def test_api_asteroids_explicit_dates(api):
    feed = load_fixture("neows_feed.json")
    api.payload = feed

    r = api.http.get("/api/asteroids?start=2026-10-01&end=2026-10-05")
    assert r.status_code == 200
    _, params, _ = api.calls[0]
    assert params["start_date"] == "2026-10-01"
    assert params["end_date"] == "2026-10-05"


def test_api_asteroids_window_too_large_422(api):
    r = api.http.get("/api/asteroids?start=2026-01-01&end=2026-01-20")
    assert r.status_code == 422
    assert "7 days" in r.json()["error"]["message"]


def test_api_asteroids_invalid_date_format_422(api):
    r = api.http.get("/api/asteroids?start=invalid-date")
    assert r.status_code == 422
    assert r.json()["error"]["status"] == 422


def test_api_asteroid_detail_endpoint(api):
    lookup = load_fixture("neows_lookup.json")
    api.payload = lookup

    r = api.http.get("/api/asteroids/3718277")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "3718277"
    assert "orbit" in body
    assert "approaches" in body


def test_api_asteroid_detail_invalid_id_422(api):
    r = api.http.get("/api/asteroids/not-digits-123")
    assert r.status_code == 422
    assert r.json()["error"]["status"] == 422


def test_api_asteroids_429_passthrough(api):
    api.error = NasaAPIError(429, "NASA's rate limit was reached.", upstream_status=429, retry_after="120")
    r = api.http.get("/api/asteroids")
    assert r.status_code == 429
    assert r.json()["error"]["status"] == 429
    assert r.headers["retry-after"] == "120"

