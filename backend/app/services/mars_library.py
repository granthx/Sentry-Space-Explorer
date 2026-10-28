"""Service for searching Mars rover images via the NASA Image and Video Library.

Path B fallback for Phase 2 when the legacy Mars Rover Photos API is unavailable.
"""

from __future__ import annotations

import logging
from typing import Any

from ..errors import ApiError
from ..nasa_client import NasaClient

log = logging.getLogger("space_explorer.mars_library")

LIBRARY_TTL_SECONDS = 3600  # Cache image search results for 1 hour

ROVERS: dict[str, dict[str, Any]] = {
    "curiosity": {
        "name": "Curiosity",
        "landing_date": "2012-08-06",
        "status": "Active",
        "cameras": {
            "FHAZ": "Front Hazard Avoidance Camera",
            "RHAZ": "Rear Hazard Avoidance Camera",
            "MAST": "Mast Camera",
            "CHEMCAM": "Chemistry and Camera Complex",
            "MAHLI": "Mars Hand Lens Imager",
            "MARDI": "Mars Descent Imager",
            "NAVCAM": "Navigation Camera",
        },
        "blurb": "Exploring Gale Crater and Mount Sharp to determine if Mars was ever able to support microbial life.",
    },
    "perseverance": {
        "name": "Perseverance",
        "landing_date": "2021-02-18",
        "status": "Active",
        "cameras": {
            "NAVCAM_LEFT": "Navigation Camera Left",
            "NAVCAM_RIGHT": "Navigation Camera Right",
            "MCZ_RIGHT": "Mastcam-Z Right",
            "MCZ_LEFT": "Mastcam-Z Left",
            "FRONT_HAZCAM_LEFT_A": "Front Hazard Avoidance Left",
            "FRONT_HAZCAM_RIGHT_A": "Front Hazard Avoidance Right",
            "REAR_HAZCAM_LEFT": "Rear Hazard Avoidance Left",
            "REAR_HAZCAM_RIGHT": "Rear Hazard Avoidance Right",
            "SKYCAM": "Skycam",
            "SHERLOC_WATSON": "SHERLOC WATSON Camera",
        },
        "blurb": "Searching for signs of ancient microbial life and collecting samples in Jezero Crater.",
    },
    "opportunity": {
        "name": "Opportunity",
        "landing_date": "2004-01-25",
        "status": "Retired (2018)",
        "cameras": {
            "FHAZ": "Front Hazard Avoidance Camera",
            "RHAZ": "Rear Hazard Avoidance Camera",
            "NAVCAM": "Navigation Camera",
            "PANCAM": "Panoramic Camera",
            "MINITES": "Miniature Thermal Emission Spectrometer",
        },
        "blurb": "Traveled over 45 km across Meridiani Planum, operating for nearly 15 years before a global dust storm.",
    },
    "spirit": {
        "name": "Spirit",
        "landing_date": "2004-01-04",
        "status": "Retired (2010)",
        "cameras": {
            "FHAZ": "Front Hazard Avoidance Camera",
            "RHAZ": "Rear Hazard Avoidance Camera",
            "NAVCAM": "Navigation Camera",
            "PANCAM": "Panoramic Camera",
            "MINITES": "Miniature Thermal Emission Spectrometer",
        },
        "blurb": "Explored Gusev Crater for over 6 years, uncovering signs of past water and geothermal activity.",
    },
}


def _force_https(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if url.startswith("http://"):
        return "https://" + url[7:]
    return url


def _clean_text(val: Any, max_len: int = 300) -> str | None:
    if not val:
        return None
    text = " ".join(str(val).split())
    if len(text) > max_len:
        text = text[:max_len].rsplit(" ", 1)[0] + "..."
    return text or None


def validate_search_params(query: str, page: int) -> None:
    if len(query.strip()) > 80:
        raise ApiError(422, "Search query must be 80 characters or fewer.")
    if not (1 <= page <= 100):
        raise ApiError(422, "Page must be between 1 and 100.")


async def search_images(
    nasa: NasaClient,
    query: str,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    """Search images in the NASA Image and Video Library."""
    clean_query = query.strip()
    validate_search_params(clean_query, page)

    params = {
        "q": clean_query,
        "media_type": "image",
        "page": page,
        "page_size": page_size,
    }

    raw = await nasa.get_json(
        "search",
        params=params,
        base_url=nasa.settings.nasa_images_base_url,
        ttl=LIBRARY_TTL_SECONDS,
        use_key=False,
    )

    collection = (raw or {}).get("collection") or {}
    metadata = collection.get("metadata") or {}
    total_hits = int(metadata.get("total_hits", 0))

    raw_items = collection.get("items") or []
    items: list[dict[str, Any]] = []

    for item in raw_items:
        data_list = item.get("data") or []
        first_data = data_list[0] if data_list else {}

        links_list = item.get("links") or []
        thumb_url = None
        for link in links_list:
            if link.get("rel") in ("preview", "alternate") and link.get("href"):
                thumb_url = _force_https(link["href"])
                break
        if not thumb_url and links_list:
            thumb_url = _force_https(links_list[0].get("href"))

        date_created = first_data.get("date_created")
        iso_date = str(date_created)[:10] if date_created else None

        items.append({
            "nasa_id": first_data.get("nasa_id"),
            "title": _clean_text(first_data.get("title"), max_len=120) or "Mars Image",
            "description": _clean_text(first_data.get("description"), max_len=300),
            "date": iso_date,
            "thumb_url": thumb_url,
            "keywords": first_data.get("keywords") or [],
            "center": first_data.get("center"),
        })

    has_more = (page * page_size) < total_hits

    return {
        "query": clean_query,
        "page": page,
        "page_size": page_size,
        "total_hits": total_hits,
        "has_more": has_more,
        "items": items,
    }


async def fetch_image_asset(nasa: NasaClient, nasa_id: str) -> dict[str, Any]:
    """Retrieve full-size image file URLs for an asset from the NASA Image Library."""
    clean_id = (nasa_id or "").strip()
    if not clean_id or len(clean_id) > 64:
        raise ApiError(422, "Invalid NASA ID.")

    raw = await nasa.get_json(
        f"asset/{clean_id}",
        base_url=nasa.settings.nasa_images_base_url,
        ttl=LIBRARY_TTL_SECONDS,
        use_key=False,
    )

    items = (raw or {}).get("collection", {}).get("items") or []
    file_urls = [_force_https(it.get("href")) for it in items if it.get("href")]

    # Pick largest .jpg: prefer ~large.jpg, ~orig.jpg, or largest jpg in list
    jpg_urls = [u for u in file_urls if u and u.lower().endswith((".jpg", ".jpeg"))]

    best_url: str | None = None
    for u in jpg_urls:
        if "large" in u.lower():
            best_url = u
            break
    if not best_url:
        for u in jpg_urls:
            if "orig" in u.lower():
                best_url = u
                break
    if not best_url and jpg_urls:
        best_url = jpg_urls[0]
    if not best_url and file_urls:
        best_url = file_urls[0]

    if not best_url:
        raise ApiError(404, f"No image asset files found for {clean_id}.")

    return {
        "nasa_id": clean_id,
        "image_url": best_url,
        "all_urls": file_urls,
    }

