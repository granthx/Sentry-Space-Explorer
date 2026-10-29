"""Tools definitions and execution registry for the Space Explorer AI Assistant.

Each tool wraps existing normalized services, ensuring the assistant only interacts
with validated domain data rather than raw NASA APIs.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any, Callable

from ...errors import ApiError
from ...nasa_client import NasaClient
from .. import analysis, apod, asteroids, mars_library

log = logging.getLogger("space_explorer.assistant.tools")

MAX_TOOL_RESULT_CHARS = 6000


def truncate_tool_result(result: dict[str, Any], max_chars: int = MAX_TOOL_RESULT_CHARS) -> dict[str, Any]:
    """Ensure tool output is JSON-serializable and under max_chars without cutting JSON."""
    encoded = json.dumps(result)
    if len(encoded) <= max_chars:
        return result

    # Truncate lists inside the result
    truncated = dict(result)
    for key, val in list(truncated.items()):
        if isinstance(val, list) and len(val) > 3:
            truncated[key] = val[:3]
            truncated[f"_{key}_truncated"] = f"Showing 3 of {len(val)} items due to length."

    encoded2 = json.dumps(truncated)
    if len(encoded2) <= max_chars:
        return truncated

    # If still too long, summarize
    return {
        "summary": "Data was truncated to stay within size bounds.",
        "keys_available": list(result.keys()),
        "truncated": True,
    }


# ---------------- Tool Implementations ----------------

async def tool_get_asteroids(nasa: NasaClient, start_date: str, end_date: str) -> dict[str, Any]:
    """Look up asteroids passing Earth in a date window (up to 7 days)."""
    try:
        start_dt = dt.date.fromisoformat(start_date)
        end_dt = dt.date.fromisoformat(end_date)
    except Exception:
        raise ApiError(422, "Dates must be valid YYYY-MM-DD format")

    data = await asteroids.fetch_window(nasa, start_dt, end_dt)
    # Return at most 10 closest objects
    closest_10 = data.get("objects", [])[:10]
    return {
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "count": data.get("count"),
        "hazardous_count": data.get("hazardous_count"),
        "highlights": data.get("highlights"),
        "closest_objects": closest_10,
    }


async def tool_get_asteroid_details(nasa: NasaClient, asteroid_id: str) -> dict[str, Any]:
    """Retrieve detailed orbital parameters and closest approach observations for an asteroid."""
    return await asteroids.fetch_object(nasa, asteroid_id)


async def tool_get_mars_photos(
    nasa: NasaClient,
    rover: str,
    query: str = "",
    page: int = 1,
) -> dict[str, Any]:
    """Search photographs taken on Mars by a specific rover."""
    slug = rover.lower().strip()
    if slug not in mars_library.ROVERS:
        raise ApiError(422, f"Unknown rover '{rover}'. Expected one of: curiosity, perseverance, opportunity, spirit")

    search_query = f"{rover} {query}".strip()
    data = await mars_library.search_images(nasa, query=search_query, page=page)
    # Return at most 8 photos
    items = data.get("items", [])[:8]
    return {
        "rover": slug,
        "query": search_query,
        "page": data.get("page"),
        "total_hits": data.get("total_hits"),
        "photos": items,
    }


async def tool_get_rover_manifest(nasa: NasaClient, rover: str) -> dict[str, Any]:
    """Retrieve mission statistics and operational overview for a Mars rover."""
    slug = rover.lower().strip()
    manifest = await analysis.fetch_manifest(nasa, slug)
    return analysis.rover_stats(manifest)


async def tool_compare_rovers(nasa: NasaClient, rovers: list[str]) -> dict[str, Any]:
    """Compare photo production and mission milestones across multiple rovers."""
    if not isinstance(rovers, list) or len(rovers) < 2 or len(rovers) > 4:
        raise ApiError(422, "Specify between 2 and 4 distinct rovers to compare (e.g. ['curiosity', 'perseverance'])")

    manifest_map = {}
    for r in rovers:
        slug = r.lower().strip()
        manifest_map[slug] = await analysis.fetch_manifest(nasa, slug)

    res = analysis.compare(manifest_map)
    return {
        "rovers": res.get("rovers"),
        "same_age": res.get("same_age"),
    }


async def tool_get_apod(nasa: NasaClient, date: str | None = None) -> dict[str, Any]:
    """Get the Astronomy Picture of the Day (APOD) for today or a specific historical date."""
    target_date = None
    if date:
        try:
            target_date = dt.date.fromisoformat(date)
        except Exception:
            raise ApiError(422, "Date must be YYYY-MM-DD format")
    return await apod.fetch_apod(nasa, target_date)


# ---------------- Tool Registry & Schemas ----------------

TOOL_REGISTRY: dict[str, Callable] = {
    "get_asteroids": tool_get_asteroids,
    "get_asteroid_details": tool_get_asteroid_details,
    "get_mars_photos": tool_get_mars_photos,
    "get_rover_manifest": tool_get_rover_manifest,
    "compare_rovers": tool_compare_rovers,
    "get_apod": tool_get_apod,
}

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_asteroids",
            "description": "Fetch near-Earth asteroids passing Earth in a given date window (up to 7 days). Returns total count, potentially hazardous count, highlight objects (closest pass, fastest), and the 10 closest asteroids with distances in lunar distances (1 LD = 384,400 km).",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD format (within 7 days of start_date)",
                    },
                },
                "required": ["start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_asteroid_details",
            "description": "Retrieve comprehensive orbit data and upcoming close approach observations for a specific near-Earth asteroid using its SPK-ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "asteroid_id": {
                        "type": "string",
                        "description": "The NASA SPK-ID / NeoWs ID of the asteroid (e.g. '3542519')",
                    },
                },
                "required": ["asteroid_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mars_photos",
            "description": "Search and retrieve photos taken on Mars by Curiosity, Perseverance, Opportunity, or Spirit. Returns photo titles, dates, descriptions, and thumbnail URLs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rover": {
                        "type": "string",
                        "enum": ["curiosity", "perseverance", "opportunity", "spirit"],
                        "description": "Name of the Mars rover",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional search keyword (e.g. 'sol 300', 'panorama', 'selfie', 'Jezero', 'drill')",
                    },
                    "page": {
                        "type": "integer",
                        "description": "Page number (1..100)",
                        "default": 1,
                    },
                },
                "required": ["rover"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_rover_manifest",
            "description": "Get mission lifetime statistics for a Mars rover, including total photos taken, active Martian sols, quiet stretch durations, activity rate %, and camera utilization.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rover": {
                        "type": "string",
                        "enum": ["curiosity", "perseverance", "opportunity", "spirit"],
                        "description": "Name of the Mars rover",
                    },
                },
                "required": ["rover"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_rovers",
            "description": "Compare mission productivity, photo production rates, and cumulative photos by mission age across multiple Mars rovers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rovers": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["curiosity", "perseverance", "opportunity", "spirit"],
                        },
                        "description": "List of 2 to 4 rover slugs to compare",
                    },
                },
                "required": ["rovers"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_apod",
            "description": "Fetch NASA's Astronomy Picture of the Day (APOD) for a given Earth date (or today if omitted). Returns image/video URL, title, and scientific explanation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Optional Earth date in YYYY-MM-DD format (must be on or after 1995-06-16)",
                    },
                },
            },
        },
    },
]


async def execute_tool(nasa: NasaClient, name: str, arguments: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Execute a registered tool by name with arguments.
    
    Returns:
      (result_dict, is_success)
    """
    func = TOOL_REGISTRY.get(name)
    if not func:
        return {"error": f"Unknown tool '{name}'", "status": 404}, False

    try:
        raw_res = await func(nasa, **arguments)
        return truncate_tool_result(raw_res), True
    except ApiError as exc:
        log.warning("Tool %s validation error: %s", name, exc.message)
        return {"error": exc.message, "status": exc.status_code}, False
    except Exception as exc:
        log.exception("Unexpected error executing tool %s: %s", name, exc)
        return {"error": f"Execution failed: {exc}", "status": 500}, False

