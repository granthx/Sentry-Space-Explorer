"""Service for Mars Data Lab statistical analysis and rover comparisons.

Pure functions operating on rover manifest data, plus async fetch wrappers
with caching and offline manifest fallback.
"""

from __future__ import annotations

import asyncio
import json
import logging
import statistics
from pathlib import Path
from typing import Any

from ..errors import ApiError
from ..nasa_client import NasaClient
from .mars_library import ROVERS

log = logging.getLogger("space_explorer.analysis")

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "manifests"
MANIFEST_ACTIVE_TTL = 3600       # 1 hour for active rovers
MANIFEST_RETIRED_TTL = 86400     # 24 hours for retired rovers

VALID_ROVER_SLUGS = ("curiosity", "perseverance", "opportunity", "spirit")


def _extract_manifest_root(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize manifest payload whether wrapped in 'photo_manifest' or bare."""
    if "photo_manifest" in raw and isinstance(raw["photo_manifest"], dict):
        return raw["photo_manifest"]
    return raw


def load_local_manifest(rover: str) -> dict[str, Any]:
    """Load authentic local curated manifest fixture for a rover."""
    slug = rover.lower().strip()
    path = DATA_DIR / f"{slug}.json"
    if not path.is_file():
        raise ApiError(404, f"No local manifest data available for rover '{rover}'")
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            return _extract_manifest_root(data)
    except Exception as exc:
        log.error("Failed to read local manifest %s: %s", path, exc)
        raise ApiError(500, f"Error reading manifest file for '{rover}': {exc}")


async def fetch_manifest(nasa: NasaClient, rover: str) -> dict[str, Any]:
    """Fetch rover manifest with caching, falling back to curated local data.
    
    Attempts live NASA API call if available; gracefully falls back to local
    curated dataset when NASA returns 404 or connection fails.
    """
    slug = rover.lower().strip()
    if slug not in VALID_ROVER_SLUGS:
        raise ApiError(
            422,
            f"Unknown rover '{rover}'. Expected one of: {', '.join(VALID_ROVER_SLUGS)}",
        )

    rover_meta = ROVERS.get(slug, {})
    is_active = rover_meta.get("status", "").lower().startswith("active")
    ttl = MANIFEST_ACTIVE_TTL if is_active else MANIFEST_RETIRED_TTL

    cache_key = f"manifest:{slug}"
    cached = nasa.cache.get(cache_key)
    if cached is not None:
        return cached

    # Attempt live NASA endpoint
    try:
        raw = await nasa.get_json(f"/mars-photos/api/v1/manifests/{slug}", ttl=ttl)
        manifest = _extract_manifest_root(raw)
        if not manifest or "photos" not in manifest or not manifest.get("name"):
            manifest = load_local_manifest(slug)
        nasa.cache.set(cache_key, manifest, ttl=ttl)
        return manifest
    except Exception as exc:
        log.info("Live manifest fetch for %s unavailable (%s); using curated local manifest", slug, exc)
        manifest = load_local_manifest(slug)
        nasa.cache.set(cache_key, manifest, ttl=ttl)
        return manifest


def rover_stats(manifest: dict[str, Any]) -> dict[str, Any]:
    """Compute comprehensive statistical metrics over a rover's manifest.
    
    Returns:
      {
        rover, status, landing_date, max_sol, total_photos, active_sols,
        quiet_sols, activity_rate, avg_photos_per_active_sol,
        median_photos_per_active_sol, busiest_sols, longest_gaps, camera_sols
      }
    """
    manifest = _extract_manifest_root(manifest)
    rover_name = manifest.get("name", "Unknown")
    slug = rover_name.lower()
    status = manifest.get("status", "unknown")
    landing_date = manifest.get("landing_date", "")
    max_sol = int(manifest.get("max_sol", 0))

    raw_photos = manifest.get("photos", [])
    
    # Filter active sols with total_photos > 0
    active_sols_data = [
        s for s in raw_photos
        if isinstance(s, dict) and int(s.get("total_photos", 0)) > 0
    ]
    # Sort active sols by sol ascending for gap and series calculations
    active_sols_data.sort(key=lambda x: int(x.get("sol", 0)))

    active_sols = len(active_sols_data)
    total_photos = sum(int(s.get("total_photos", 0)) for s in active_sols_data)

    # Mission span in sols is max_sol + 1 (from sol 0 through max_sol inclusive)
    total_mission_sols = max_sol + 1 if max_sol >= 0 else 0
    quiet_sols = max(0, total_mission_sols - active_sols)
    activity_rate = round(active_sols / total_mission_sols, 4) if total_mission_sols > 0 else 0.0

    avg_photos_per_active_sol = (
        round(total_photos / active_sols, 2) if active_sols > 0 else 0.0
    )

    photo_counts = [int(s.get("total_photos", 0)) for s in active_sols_data]
    median_photos_per_active_sol = (
        round(float(statistics.median(photo_counts)), 2) if photo_counts else 0.0
    )

    # Top 10 busiest sols: sorted by total_photos desc, sol asc
    sorted_by_photos = sorted(
        active_sols_data,
        key=lambda x: (-int(x.get("total_photos", 0)), int(x.get("sol", 0))),
    )
    busiest_sols = [
        {
            "sol": int(s.get("sol", 0)),
            "earth_date": s.get("earth_date", ""),
            "total_photos": int(s.get("total_photos", 0)),
        }
        for s in sorted_by_photos[:10]
    ]

    # Top 5 longest quiet gaps: between consecutive active sols
    # gap length = to_sol - from_sol - 1 (only gaps > 0)
    gaps: list[dict[str, Any]] = []
    for i in range(len(active_sols_data) - 1):
        from_sol = int(active_sols_data[i].get("sol", 0))
        to_sol = int(active_sols_data[i + 1].get("sol", 0))
        length = to_sol - from_sol - 1
        if length > 0:
            gaps.append({
                "from_sol": from_sol,
                "to_sol": to_sol,
                "length_sols": length,
            })
    gaps.sort(key=lambda g: (-g["length_sols"], g["from_sol"]))
    longest_gaps = gaps[:5]

    # Camera usage across active sols
    # IMPORTANT: The manifest tells which cameras were used on each sol,
    # NOT how many photos each camera took.
    camera_counts: dict[str, int] = {}
    for s in active_sols_data:
        cams = set(s.get("cameras", []))
        for c in cams:
            camera_counts[c] = camera_counts.get(c, 0) + 1

    camera_sols = [
        {
            "camera": cam,
            "sols_used": count,
            "share": round(count / active_sols, 4) if active_sols > 0 else 0.0,
        }
        for cam, count in camera_counts.items()
    ]
    camera_sols.sort(key=lambda x: (-x["sols_used"], x["camera"]))

    return {
        "rover": slug,
        "name": rover_name,
        "status": status,
        "landing_date": landing_date,
        "max_sol": max_sol,
        "total_photos": total_photos,
        "active_sols": active_sols,
        "quiet_sols": quiet_sols,
        "activity_rate": activity_rate,
        "avg_photos_per_active_sol": avg_photos_per_active_sol,
        "median_photos_per_active_sol": median_photos_per_active_sol,
        "busiest_sols": busiest_sols,
        "longest_gaps": longest_gaps,
        "camera_sols": camera_sols,
    }


def photos_series(manifest: dict[str, Any], bucket: int = 50) -> list[dict[str, Any]]:
    """Group photo production into sol intervals (0..bucket-1, bucket..2*bucket-1, ...).
    
    Bucket size must be >= 1. The last bucket is partial up to max_sol.
    """
    if bucket < 1:
        raise ApiError(422, "Bucket size must be at least 1 sol")

    manifest = _extract_manifest_root(manifest)
    max_sol = int(manifest.get("max_sol", 0))
    if max_sol < 0:
        return []

    # Map sol -> total_photos for quick lookup
    raw_photos = manifest.get("photos", [])
    sol_photo_map: dict[int, int] = {}
    for s in raw_photos:
        if isinstance(s, dict):
            sol_num = int(s.get("sol", 0))
            photos = int(s.get("total_photos", 0))
            if photos > 0:
                sol_photo_map[sol_num] = photos

    series: list[dict[str, Any]] = []
    start_sol = 0
    while start_sol <= max_sol:
        end_sol = min(start_sol + bucket - 1, max_sol)
        span = end_sol - start_sol + 1

        bucket_photos = 0
        bucket_active = 0
        for s in range(start_sol, end_sol + 1):
            if s in sol_photo_map:
                bucket_photos += sol_photo_map[s]
                bucket_active += 1

        avg_per_sol = round(bucket_photos / span, 2) if span > 0 else 0.0

        series.append({
            "start_sol": start_sol,
            "end_sol": end_sol,
            "photos": bucket_photos,
            "active_sols": bucket_active,
            "avg_per_sol": avg_per_sol,
        })
        start_sol += bucket

    return series


def compare(manifests: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Compare multiple rovers side-by-side and by cumulative mission age.
    
    Returns:
      {
        rovers: [rover_stats...],
        per_rover_series: {slug: photos_series},
        same_age: {n_sols: {slug: cumulative_photos}}
      }
    """
    stats_list = []
    series_map = {}
    sol_lookup: dict[str, dict[int, int]] = {}

    for key, manifest in manifests.items():
        stats = rover_stats(manifest)
        slug = stats["rover"]
        stats_list.append(stats)
        series_map[slug] = photos_series(manifest, bucket=100)

        # Build sol-to-photos map for cumulative same_age calculation
        root = _extract_manifest_root(manifest)
        sol_map: dict[int, int] = {}
        for s in root.get("photos", []):
            if isinstance(s, dict):
                sol_map[int(s.get("sol", 0))] = int(s.get("total_photos", 0))
        sol_lookup[slug] = sol_map

    # Compare at equal mission age milestones
    milestones = [50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]
    same_age: dict[int, dict[str, int]] = {}

    for m in milestones:
        m_entry: dict[str, int] = {}
        for stats in stats_list:
            slug = stats["rover"]
            if stats["max_sol"] >= m:
                # Cumulative photos up to sol m
                cumulative = sum(
                    photos for sol, photos in sol_lookup[slug].items()
                    if sol <= m
                )
                m_entry[slug] = cumulative
        if m_entry:
            same_age[m] = m_entry

    return {
        "rovers": stats_list,
        "per_rover_series": series_map,
        "same_age": same_age,
    }


async def overview(nasa: NasaClient) -> dict[str, Any]:
    """Fetch manifests for all four rovers concurrently and return their stats.
    
    Partial failures are captured in 'errors' without failing the overall request.
    """
    results = await asyncio.gather(
        *(fetch_manifest(nasa, slug) for slug in VALID_ROVER_SLUGS),
        return_exceptions=True,
    )

    rovers_data = []
    errors: dict[str, str] = {}

    for slug, res in zip(VALID_ROVER_SLUGS, results):
        if isinstance(res, Exception):
            errors[slug] = str(res)
        else:
            try:
                stats = rover_stats(res)
                rovers_data.append(stats)
            except Exception as exc:
                errors[slug] = f"Error computing statistics: {exc}"

    return {
        "rovers": rovers_data,
        "errors": errors,
    }
