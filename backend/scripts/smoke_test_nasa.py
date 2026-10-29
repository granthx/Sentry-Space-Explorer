"""Check your API key and see which NASA services are reachable from your machine.

Run from the backend folder:

    python scripts/smoke_test_nasa.py

Nothing is written anywhere. Takes about 10 seconds and uses ~6 requests of your quota.
"""

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.config import get_settings  # noqa: E402


def main() -> int:
    settings = get_settings()
    key = settings.nasa_api_key
    base = settings.nasa_base_url.rstrip("/")
    images = settings.nasa_images_base_url.rstrip("/")
    today = date.today().isoformat()

    checks = [
        ("APOD", f"{base}/planetary/apod", {"api_key": key}),
        ("NeoWs feed", f"{base}/neo/rest/v1/feed", {"start_date": today, "end_date": today, "api_key": key}),
        ("Rover manifest - Curiosity", f"{base}/mars-photos/api/v1/manifests/curiosity", {"api_key": key}),
        ("Rover manifest - Perseverance", f"{base}/mars-photos/api/v1/manifests/perseverance", {"api_key": key}),
        ("Rover latest photos - Curiosity", f"{base}/mars-photos/api/v1/rovers/curiosity/latest_photos", {"api_key": key}),
        ("NASA Image Library", f"{images}/search", {"q": "mars", "media_type": "image", "page_size": 1}),
    ]

    mode = "DEMO_KEY (30 requests/hour)" if settings.using_demo_key else "your own key (1,000 requests/hour)"
    print(f"\nSpace Explorer - NASA smoke test\nUsing: {mode}\n")

    failures = 0
    last_remaining = None
    with httpx.Client(timeout=settings.request_timeout_seconds, follow_redirects=True) as client:
        for name, url, params in checks:
            started = time.perf_counter()
            try:
                response = client.get(url, params=params)
                ms = round((time.perf_counter() - started) * 1000)
                last_remaining = response.headers.get("X-RateLimit-Remaining", last_remaining)
                ok = response.status_code == 200
                note = ""
                if not ok:
                    note = f"  <- {response.text[:90].strip()!r}"
                print(f"  [{'OK' if ok else 'FAIL':>4}] {name:<34} HTTP {response.status_code}  {ms:>5} ms{note}")
                failures += 0 if ok else 1
            except httpx.HTTPError as exc:
                failures += 1
                print(f"  [FAIL] {name:<34} {type(exc).__name__}: {exc}")

    if last_remaining is not None:
        print(f"\nRequests remaining this hour: {last_remaining}")
    if failures:
        print(
            "\nSome services failed. Rate limit (HTTP 429)? Add your own key to backend/.env."
            "\nIf only the Mars Rover Photos checks fail, Phase 2 will fall back to the NASA Image Library."
        )
    else:
        print("\nAll services reachable. You are ready for Phase 1.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
