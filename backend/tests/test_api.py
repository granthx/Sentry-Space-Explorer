from __future__ import annotations

import datetime as dt

from app.nasa_client import NasaAPIError

APOD_RAW = {
    "date": "2026-10-27",
    "title": "  The   Pillars  ",
    "explanation": "Gas\nand dust.",
    "media_type": "image",
    "url": "https://apod.nasa.gov/a.jpg",
    "hdurl": "https://apod.nasa.gov/a_hd.jpg",
    "copyright": "Someone",
}


def test_health_does_not_call_nasa(api):
    r = api.http.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["phase"] == 6
    assert body["api_key_mode"] in {"demo", "registered"}
    assert api.calls == []


def test_modules_lists_three_modules(api):
    body = api.http.get("/api/modules").json()
    ids = [m["id"] for m in body["modules"]]
    assert ids == ["asteroids", "mars-images", "mars-data", "exoplanets", "terrain", "anomaly"]
    assert body["modules"][0]["status"] == "live"
    assert body["modules"][0]["href"] == "/asteroids.html"
    assert body["modules"][1]["status"] == "live"
    assert body["modules"][1]["href"] == "/mars.html"
    assert body["modules"][2]["status"] == "live"
    assert body["modules"][2]["href"] == "/lab.html"
    assert body["modules"][3]["status"] == "live"
    assert body["modules"][3]["href"] == "/exoplanets.html"
    assert body["modules"][4]["status"] == "live"
    assert body["modules"][4]["href"] == "/terrain.html"
    assert body["modules"][5]["status"] == "live"
    assert body["modules"][5]["href"] == "/anomaly.html"


def test_apod_is_normalised(api):
    api.payload = APOD_RAW
    r = api.http.get("/api/apod")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "The Pillars"
    assert body["explanation"] == "Gas and dust."
    assert body["hd_url"].endswith("a_hd.jpg")
    path, params, _ = api.calls[0]
    assert path == "planetary/apod"
    assert params["thumbs"] == "true"


def test_apod_passes_the_date_through(api):
    api.payload = APOD_RAW
    api.http.get("/api/apod?date=2024-05-01")
    assert api.calls[0][1]["date"] == "2024-05-01"


def test_apod_rejects_dates_before_the_archive(api):
    r = api.http.get("/api/apod?date=1990-01-01")
    assert r.status_code == 422
    assert r.json()["error"]["status"] == 422
    assert api.calls == []


def test_apod_rejects_future_dates(api):
    future = (dt.date.today() + dt.timedelta(days=30)).isoformat()
    assert api.http.get(f"/api/apod?date={future}").status_code == 422


def test_apod_rejects_a_malformed_date(api):
    r = api.http.get("/api/apod?date=not-a-date")
    assert r.status_code == 422
    assert "error" in r.json()


def test_apod_random_returns_items(api):
    api.payload = [APOD_RAW, APOD_RAW]
    body = api.http.get("/api/apod/random?count=2").json()
    assert len(body["items"]) == 2
    assert api.calls[0][2]["ttl"] == 0  # random results must not be cached


def test_apod_random_count_is_limited(api):
    assert api.http.get("/api/apod/random?count=50").status_code == 422


def test_upstream_errors_become_clean_json(api):
    api.error = NasaAPIError(429, "NASA's rate limit was reached.", upstream_status=429, retry_after="60")
    r = api.http.get("/api/apod")
    assert r.status_code == 429
    assert r.json() == {"error": {"status": 429, "message": "NASA's rate limit was reached."}}
    assert r.headers["retry-after"] == "60"


def test_unknown_api_route_is_a_json_404(api):
    r = api.http.get("/api/nope")
    assert r.status_code == 404
    assert r.json()["error"]["status"] == 404


def test_upstream_health_reports_each_service(api):
    api.payload = {}
    api.fail_paths = ("mars-photos",)
    body = api.http.get("/api/health/upstream").json()
    assert set(body["services"]) == {"apod", "neows", "mars_rover_photos", "nasa_image_library"}
    assert body["services"]["mars_rover_photos"]["ok"] is False
    assert body["services"]["apod"]["ok"] is True
    assert body["all_ok"] is False


def test_security_headers_present(api):
    r = api.http.get("/api/health")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert "https://cdnjs.cloudflare.com" in r.headers["content-security-policy"]
