from __future__ import annotations

import datetime as dt
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from ..deps import get_nasa
from ..nasa_client import NasaClient
from ..services import apod as apod_service

router = APIRouter(prefix="/apod", tags=["apod"])


@router.get("", summary="Astronomy Picture of the Day")
async def get_apod(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    on: Annotated[
        dt.date | None,
        Query(alias="date", description="YYYY-MM-DD (1995-06-16 or later). Omit for the latest picture."),
    ] = None,
) -> dict[str, Any]:
    return await apod_service.fetch_apod(nasa, on)


@router.get("/random", summary="Random Astronomy Pictures of the Day")
async def get_random_apod(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    count: Annotated[int, Query(ge=1, le=6, description="How many random pictures")] = 1,
) -> dict[str, Any]:
    return {"items": await apod_service.fetch_random_apod(nasa, count)}
