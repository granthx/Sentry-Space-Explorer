from __future__ import annotations

import datetime as dt
import random
from typing import Any

from ..data.curated_apod import CURATED_APOD_GALLERY, get_curated_apod_for_date
from ..errors import ApiError
from ..nasa_client import NasaClient
from .common import PAST_TTL_SECONDS

APOD_PATH = "planetary/apod"
APOD_FIRST_DATE = dt.date(1995, 6, 16)


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def is_placeholder(raw: dict[str, Any] | None) -> bool:
    """Detect whether a response is NASA's generic broken placeholder logo."""
    if not raw or not isinstance(raw, dict):
        return True
    url = str(raw.get("url") or "")
    hd_url = str(raw.get("hdurl") or raw.get("hd_url") or "")
    title = str(raw.get("title") or "").strip()
    if "nasa-logo" in url or "nasa-logo" in hd_url or "themes/nasa-child" in url:
        return True
    if title == "NASA Science" and ("nasa-logo" in url or "nasa-child" in url or not hd_url):
        return True
    return False


def normalize_apod(raw: dict[str, Any]) -> dict[str, Any]:
    """Map NASA's APOD fields to the shape the frontend uses."""
    return {
        "date": raw.get("date"),
        "title": _clean(raw.get("title")),
        "explanation": _clean(raw.get("explanation")),
        "media_type": raw.get("media_type") or "image",  # "image" | "video" | "other"
        "url": raw.get("url"),
        "hd_url": raw.get("hdurl") or raw.get("hd_url"),
        "thumbnail_url": raw.get("thumbnail_url"),
        "copyright": _clean(raw.get("copyright")),
    }


def validate_apod_date(on: dt.date | None) -> None:
    if on is None:
        return
    if on < APOD_FIRST_DATE:
        raise ApiError(422, f"APOD archives start on {APOD_FIRST_DATE.isoformat()}.")
    if on > dt.date.today() + dt.timedelta(days=1):
        raise ApiError(422, "That date is in the future.")


async def fetch_apod(nasa: NasaClient, on: dt.date | None = None) -> dict[str, Any]:
    validate_apod_date(on)
    target_date = on.isoformat() if on else dt.date.today().isoformat()
    is_past = on is not None and on < dt.date.today() - dt.timedelta(days=2)

    try:
        raw = await nasa.get_json(
            APOD_PATH,
            {"date": on.isoformat() if on else None, "thumbs": "true"},
            ttl=PAST_TTL_SECONDS if is_past else None,
        )
        if isinstance(raw, list):
            raw = raw[0] if raw else {}
    except ApiError as err:
        status_code = getattr(err, "status_code", getattr(err, "status", None))
        # Re-raise user credential or quota errors (400, 403, 422, 429)
        if status_code in (400, 403, 422, 429):
            raise
        # NASA's 5xx service outage: fall back to authentic curated space imagery
        return get_curated_apod_for_date(target_date)

    if not raw or is_placeholder(raw):
        return get_curated_apod_for_date(target_date)

    return normalize_apod(raw)


async def fetch_random_apod(nasa: NasaClient, count: int = 1) -> list[dict[str, Any]]:
    valid_items: list[dict[str, Any]] = []
    try:
        raw = await nasa.get_json(APOD_PATH, {"count": count, "thumbs": "true"}, ttl=0)
        items = raw if isinstance(raw, list) else [raw]
        for item in items:
            if item and isinstance(item, dict) and not is_placeholder(item):
                valid_items.append(normalize_apod(item))
    except (ApiError, Exception):
        valid_items = []

    # If NASA returned placeholder logos (nasa-logo@2x.png) or failed, fill with authentic curated photos
    if len(valid_items) < count:
        needed = count - len(valid_items)
        pool = list(CURATED_APOD_GALLERY)
        random.shuffle(pool)
        for choice in pool[:needed]:
            item_copy = dict(choice)
            valid_items.append(item_copy)

    return valid_items[:count]
