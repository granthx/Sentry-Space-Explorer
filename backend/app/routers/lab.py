"""API router for Mars Data Lab statistics, trends, and comparisons."""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from ..deps import get_nasa
from ..errors import ApiError
from ..nasa_client import NasaClient
from ..services import analysis
from ..services.analysis import VALID_ROVER_SLUGS, fetch_manifest

router = APIRouter(prefix="/lab", tags=["lab"])


@router.get("/overview")
async def get_overview(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
) -> dict:
    """Return mission statistics overview across all four rovers."""
    return await analysis.overview(nasa)


@router.get("/rovers/{rover}/stats")
async def get_rover_stats(
    rover: str,
    nasa: Annotated[NasaClient, Depends(get_nasa)],
) -> dict:
    """Return detailed mission statistics for a single rover."""
    manifest = await fetch_manifest(nasa, rover)
    return analysis.rover_stats(manifest)


@router.get("/rovers/{rover}/series")
async def get_rover_series(
    rover: str,
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    bucket: int = Query(default=50, ge=5, le=500, description="Sol bucket size (5..500)"),
) -> list[dict]:
    """Return sol-bucketed photo production series over mission time."""
    manifest = await fetch_manifest(nasa, rover)
    return analysis.photos_series(manifest, bucket=bucket)


@router.get("/compare")
async def compare_rovers(
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    rovers: str = Query(
        default="curiosity,perseverance",
        description="Comma-separated list of 2 to 4 distinct rover slugs",
    ),
) -> dict:
    """Compare photo production and mission progression across 2 to 4 rovers."""
    raw_slugs = [s.strip().lower() for s in rovers.split(",") if s.strip()]
    distinct_slugs = list(dict.fromkeys(raw_slugs))  # preserve order without duplicates

    if len(distinct_slugs) < 2 or len(distinct_slugs) > 4:
        raise ApiError(
            422,
            "Please specify between 2 and 4 distinct rover names (e.g. ?rovers=curiosity,perseverance)",
        )

    for slug in distinct_slugs:
        if slug not in VALID_ROVER_SLUGS:
            raise ApiError(
                422,
                f"Unknown rover '{slug}'. Expected one of: {', '.join(VALID_ROVER_SLUGS)}",
            )

    # Fetch manifests concurrently
    manifest_results = await asyncio.gather(
        *(fetch_manifest(nasa, s) for s in distinct_slugs)
    )

    manifest_dict = {
        slug: manifest for slug, manifest in zip(distinct_slugs, manifest_results)
    }

    return analysis.compare(manifest_dict)
