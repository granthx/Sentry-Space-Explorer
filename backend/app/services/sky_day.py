"""Service for inspecting what was happening in the sky on any given Earth date.

Combines APOD (Astronomy Picture of the Day) and Asteroid close approaches
for that specific Earth date, executed concurrently with independent failure isolation.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any

from ..errors import ApiError
from ..nasa_client import NasaClient
from .apod import APOD_FIRST_DATE, fetch_apod
from .asteroids import fetch_window


async def fetch_day(nasa: NasaClient, earth_date: dt.date) -> dict[str, Any]:
    """Fetch APOD and Asteroid passes for a single Earth date concurrently."""
    apod_task = None
    apod_skip_error: str | None = None

    if earth_date < APOD_FIRST_DATE:
        apod_skip_error = f"APOD archives start on {APOD_FIRST_DATE.isoformat()}."
    else:
        apod_task = fetch_apod(nasa, earth_date)

    # Asteroid window for this single day
    asteroids_task = fetch_window(nasa, earth_date, earth_date)

    tasks: list[Any] = []
    if apod_task is not None:
        tasks.append(apod_task)
    tasks.append(asteroids_task)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Unpack APOD result
    apod_data: dict[str, Any] | None = None
    apod_error: str | None = apod_skip_error

    if apod_task is not None:
        apod_res = results[0]
        ast_res = results[1]
        if isinstance(apod_res, Exception):
            apod_error = getattr(apod_res, "message", str(apod_res))
        else:
            apod_data = apod_res
    else:
        ast_res = results[0]

    # Unpack Asteroids result
    asteroids_data: dict[str, Any] | None = None
    asteroids_error: str | None = None

    if isinstance(ast_res, Exception):
        asteroids_error = getattr(ast_res, "message", str(ast_res))
    elif ast_res:
        closest = (ast_res.get("highlights") or {}).get("closest")
        asteroids_data = {
            "count": ast_res.get("count", 0),
            "closest": closest,
        }

    return {
        "earth_date": earth_date.isoformat(),
        "apod": apod_data,
        "asteroids": asteroids_data,
        "errors": {
            "apod": apod_error,
            "asteroids": asteroids_error,
        },
    }

