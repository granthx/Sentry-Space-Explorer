from __future__ import annotations

import datetime as dt
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from ..deps import get_nasa
from ..nasa_client import NasaClient
from ..services import asteroids as asteroid_service

router = APIRouter(prefix="/asteroids", tags=["asteroids"])


@router.get("", summary="Near-Earth objects in a date window (up to 7 days)")
async def get_asteroids(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    start: Annotated[
        dt.date | None,
        Query(description="Window start date (YYYY-MM-DD). Defaults to today."),
    ] = None,
    end: Annotated[
        dt.date | None,
        Query(description="Window end date (YYYY-MM-DD). Defaults to start + 6 days (max 7-day window)."),
    ] = None,
) -> dict[str, Any]:
    start_date = start or dt.date.today()
    end_date = end or (start_date + dt.timedelta(days=6))
    return await asteroid_service.fetch_window(nasa, start_date, end_date)


@router.get("/{asteroid_id}", summary="Lookup a single asteroid's orbital facts and close approaches")
async def get_asteroid_detail(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    asteroid_id: str,
) -> dict[str, Any]:
    return await asteroid_service.fetch_object(nasa, asteroid_id)

