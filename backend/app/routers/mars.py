from __future__ import annotations

import datetime as dt
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from ..deps import get_nasa
from ..errors import ApiError
from ..nasa_client import NasaClient
from ..services import mars_library, sky_day

router = APIRouter(prefix="/mars", tags=["mars"])


@router.get("/rovers", summary="Static metadata for Mars rovers")
async def list_rovers() -> dict[str, Any]:
    """Returns static rover information and camera lists without calling NASA."""
    return {
        "rovers": [
            {"id": slug, **info}
            for slug, info in mars_library.ROVERS.items()
        ]
    }


@router.get("/library", summary="Search Mars rover images in the NASA Image Library (Path B)")
async def search_library(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    rover: Annotated[str | None, Query(description="Rover slug (curiosity, perseverance, etc.)")] = "curiosity",
    q: Annotated[str | None, Query(description="Keywords (e.g. selfie, panorama, drill, crater)")] = None,
    page: Annotated[int, Query(ge=1, le=100, description="Page number (1-100)")] = 1,
) -> dict[str, Any]:
    rover_slug = (rover or "").strip().lower()
    rover_info = mars_library.ROVERS.get(rover_slug)
    rover_term = rover_info["name"] + " rover" if rover_info else (rover_slug or "Mars rover")

    keywords = (q or "").strip()
    full_query = f"{rover_term} {keywords}".strip() if keywords else rover_term

    return await mars_library.search_images(nasa, full_query, page=page)


@router.get("/library/{nasa_id}", summary="Get full-size image file URLs for an asset")
async def get_library_asset(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    nasa_id: str,
) -> dict[str, Any]:
    return await mars_library.fetch_image_asset(nasa, nasa_id)


@router.get("/day", summary="What was happening in the sky on this Earth date (APOD + Asteroids)")
async def get_sky_day(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    earth_date: Annotated[
        dt.date | None,
        Query(description="Earth date (YYYY-MM-DD). Defaults to today."),
    ] = None,
) -> dict[str, Any]:
    target_date = earth_date or dt.date.today()
    return await sky_day.fetch_day(nasa, target_date)

