"""Service for querying and normalizing NASA NeoWs (Near Earth Object Web Service) data."""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

from ..errors import ApiError
from ..nasa_client import NasaClient
from .common import PAST_TTL_SECONDS

FEED_PATH = "neo/rest/v1/feed"
LOOKUP_PATH = "neo/rest/v1/neo"


def _strip_parentheses(name: str | None) -> str | None:
    if not name:
        return None
    cleaned = " ".join(str(name).split())
    cleaned = cleaned.replace("(", "").replace(")", "").strip()
    return " ".join(cleaned.split()) or None


def _to_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def normalize_object(raw: dict[str, Any], date_str: str | None = None) -> dict[str, Any]:
    """Map NASA's raw NeoWs feed object to flat documented shape.

    Keys:
      id, name, date, approach_time, diameter_m_min, diameter_m_max,
      diameter_m_avg, velocity_kms, miss_lunar, miss_km, hazardous,
      sentry, absolute_magnitude, jpl_url, orbiting_body
    """
    diam_m = (raw.get("estimated_diameter") or {}).get("meters") or {}
    diam_min = _to_float(diam_m.get("estimated_diameter_min"))
    diam_max = _to_float(diam_m.get("estimated_diameter_max"))
    if diam_min is not None and diam_max is not None:
        diam_avg = round((diam_min + diam_max) / 2.0, 2)
    elif diam_min is not None:
        diam_avg = diam_min
    else:
        diam_avg = diam_max

    approaches = raw.get("close_approach_data") or []
    first_approach = approaches[0] if approaches else {}

    approach_date = first_approach.get("close_approach_date") or date_str

    # Extract approach_time as ISO string or None
    approach_time: str | None = None
    epoch = first_approach.get("epoch_date_close_approach")
    if epoch is not None:
        try:
            approach_time = dt.datetime.fromtimestamp(epoch / 1000.0, tz=dt.timezone.utc).isoformat()
        except (ValueError, OSError, OverflowError):
            approach_time = None
    elif first_approach.get("close_approach_date_full"):
        approach_time = str(first_approach["close_approach_date_full"])

    rel_vel = first_approach.get("relative_velocity") or {}
    velocity_kms = _to_float(rel_vel.get("kilometers_per_second"))

    miss_dist = first_approach.get("miss_distance") or {}
    miss_lunar = _to_float(miss_dist.get("lunar"))
    miss_km = _to_float(miss_dist.get("kilometers"))

    return {
        "id": str(raw.get("id")) if raw.get("id") is not None else None,
        "name": _strip_parentheses(raw.get("name")),
        "date": approach_date,
        "approach_time": approach_time,
        "diameter_m_min": diam_min,
        "diameter_m_max": diam_max,
        "diameter_m_avg": diam_avg,
        "velocity_kms": velocity_kms,
        "miss_lunar": miss_lunar,
        "miss_km": miss_km,
        "hazardous": bool(raw.get("is_potentially_hazardous_asteroid", False)),
        "sentry": bool(raw.get("is_sentry_object", False)),
        "absolute_magnitude": _to_float(raw.get("absolute_magnitude_h")),
        "jpl_url": raw.get("nasa_jpl_url"),
        "orbiting_body": first_approach.get("orbiting_body"),
    }


def validate_window(start: dt.date, end: dt.date) -> None:
    if end < start:
        raise ApiError(422, "End date cannot be earlier than start date.")
    if (end - start).days > 6:
        raise ApiError(422, "Date window may be at most 7 days (end date - start date <= 6 days).")


def validate_asteroid_id(asteroid_id: str) -> None:
    clean = (asteroid_id or "").strip()
    if not clean.isdigit() or not (1 <= len(clean) <= 12):
        raise ApiError(422, "Asteroid ID must be numeric and between 1 and 12 digits.")


async def fetch_window(nasa: NasaClient, start: dt.date, end: dt.date) -> dict[str, Any]:
    validate_window(start, end)
    is_past = end < dt.date.today()
    ttl = PAST_TTL_SECONDS if is_past else None

    params = {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    raw = await nasa.get_json(FEED_PATH, params, ttl=ttl)

    neo_dict = (raw or {}).get("near_earth_objects") or {}
    all_objects: list[dict[str, Any]] = []

    for date_key in sorted(neo_dict.keys()):
        day_list = neo_dict[date_key] or []
        for obj_raw in day_list:
            all_objects.append(normalize_object(obj_raw, date_key))

    # Sort by miss_lunar ascending (unknown/None placed at end)
    all_objects.sort(key=lambda o: (o["miss_lunar"] is None, o["miss_lunar"] or float("inf")))

    hazardous_count = sum(1 for o in all_objects if o["hazardous"])

    # Compute highlights
    closest: dict[str, Any] | None = None
    fastest: dict[str, Any] | None = None
    largest: dict[str, Any] | None = None

    valid_miss = [o for o in all_objects if o["miss_lunar"] is not None]
    if valid_miss:
        closest = min(valid_miss, key=lambda o: o["miss_lunar"])

    valid_speed = [o for o in all_objects if o["velocity_kms"] is not None]
    if valid_speed:
        fastest = max(valid_speed, key=lambda o: o["velocity_kms"])

    valid_size = [o for o in all_objects if o["diameter_m_avg"] is not None]
    if valid_size:
        largest = max(valid_size, key=lambda o: o["diameter_m_avg"])

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "count": len(all_objects),
        "hazardous_count": hazardous_count,
        "objects": all_objects,
        "highlights": {
            "closest": closest,
            "fastest": fastest,
            "largest": largest,
        },
    }


async def fetch_object(nasa: NasaClient, asteroid_id: str) -> dict[str, Any]:
    validate_asteroid_id(asteroid_id)
    clean_id = asteroid_id.strip()

    raw = await nasa.get_json(f"{LOOKUP_PATH}/{clean_id}")
    if not raw:
        raise ApiError(404, f"Asteroid {clean_id} not found.")

    diam_m = (raw.get("estimated_diameter") or {}).get("meters") or {}
    diam_min = _to_float(diam_m.get("estimated_diameter_min"))
    diam_max = _to_float(diam_m.get("estimated_diameter_max"))

    orbit_raw = raw.get("orbital_data") or {}
    orbit_class_raw = orbit_raw.get("orbit_class") or {}

    orbit = {
        "orbit_class_type": orbit_class_raw.get("orbit_class_type"),
        "orbit_class_description": orbit_class_raw.get("orbit_class_description"),
        "first_observation_date": orbit_raw.get("first_observation_date"),
        "last_observation_date": orbit_raw.get("last_observation_date"),
        "observations_used": _to_int(orbit_raw.get("observations_used")),
        "data_arc_in_days": _to_int(orbit_raw.get("data_arc_in_days")),
        "eccentricity": _to_float(orbit_raw.get("eccentricity")),
        "semi_major_axis": _to_float(orbit_raw.get("semi_major_axis")),
        "inclination": _to_float(orbit_raw.get("inclination")),
        "orbital_period": _to_float(orbit_raw.get("orbital_period")),
        "perihelion_distance": _to_float(orbit_raw.get("perihelion_distance")),
        "aphelion_distance": _to_float(orbit_raw.get("aphelion_distance")),
    }

    raw_approaches = raw.get("close_approach_data") or []
    today = dt.date.today()

    def _days_from_today(appr: dict[str, Any]) -> float:
        d_str = appr.get("close_approach_date")
        if not d_str:
            return float("inf")
        try:
            d_val = dt.date.fromisoformat(d_str[:10])
            return abs((d_val - today).days)
        except ValueError:
            return float("inf")

    sorted_by_closeness = sorted(raw_approaches, key=_days_from_today)
    selected_approaches = sorted_by_closeness[:12]

    approaches_list: list[dict[str, Any]] = []
    for appr in selected_approaches:
        rel_vel = appr.get("relative_velocity") or {}
        miss_dist = appr.get("miss_distance") or {}
        approaches_list.append({
            "date": appr.get("close_approach_date"),
            "miss_lunar": _to_float(miss_dist.get("lunar")),
            "miss_km": _to_float(miss_dist.get("kilometers")),
            "velocity_kms": _to_float(rel_vel.get("kilometers_per_second")),
            "orbiting_body": appr.get("orbiting_body"),
        })

    return {
        "id": str(raw.get("id")) if raw.get("id") is not None else clean_id,
        "name": _strip_parentheses(raw.get("name")),
        "jpl_url": raw.get("nasa_jpl_url"),
        "hazardous": bool(raw.get("is_potentially_hazardous_asteroid", False)),
        "sentry": bool(raw.get("is_sentry_object", False)),
        "absolute_magnitude": _to_float(raw.get("absolute_magnitude_h")),
        "diameter_m_min": diam_min,
        "diameter_m_max": diam_max,
        "orbit": orbit,
        "approaches": approaches_list,
    }
