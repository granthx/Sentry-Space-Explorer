from __future__ import annotations

import asyncio
import datetime as dt
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from .. import __version__
from ..config import Settings, get_settings
from ..deps import get_nasa
from ..errors import ApiError
from ..modules import CURRENT_PHASE
from ..nasa_client import NasaClient

router = APIRouter(tags=["health"])

PROBE_TTL_SECONDS = 120  # repeated clicks should not burn your NASA quota


@router.get("/health", summary="Is the backend up? (does not call NASA)")
async def health(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": __version__,
        "phase": CURRENT_PHASE,
        "time": dt.datetime.now(dt.timezone.utc).isoformat(),
        "api_key_mode": "demo" if settings.using_demo_key else "registered",
        "rate_limit": {
            "limit": nasa.rate_limit_limit,
            "remaining": nasa.rate_limit_remaining,
        },
        "cache": nasa.cache.stats(),
    }


async def _probe(
    nasa: NasaClient,
    name: str,
    path: str,
    params: dict[str, Any] | None = None,
    base_url: str | None = None,
    use_key: bool = True,
) -> tuple[str, dict[str, Any]]:
    started = time.perf_counter()
    error: str | None = None
    try:
        await nasa.get_json(path, params, base_url=base_url, ttl=PROBE_TTL_SECONDS, use_key=use_key)
    except ApiError as exc:
        error = exc.message
    except Exception:  # noqa: BLE001 - a probe must never crash the endpoint
        error = "Unexpected error while contacting NASA."
    return name, {
        "ok": error is None,
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "error": error,
    }


@router.get("/health/upstream", summary="Check which NASA services are reachable right now")
async def health_upstream(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    today = dt.date.today().isoformat()
    results = await asyncio.gather(
        _probe(nasa, "apod", "planetary/apod"),
        _probe(nasa, "neows", "neo/rest/v1/feed", {"start_date": today, "end_date": today}),
        _probe(nasa, "mars_rover_photos", "mars-photos/api/v1/manifests/curiosity"),
        _probe(
            nasa,
            "nasa_image_library",
            "search",
            {"q": "mars", "media_type": "image", "page_size": 1},
            base_url=settings.nasa_images_base_url,
            use_key=False,
        ),
    )
    services = dict(results)
    return {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "all_ok": all(s["ok"] for s in services.values()),
        "services": services,
    }
