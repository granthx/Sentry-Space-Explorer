from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Request

from ..services import terrain as terrain_service

router = APIRouter(prefix="/terrain", tags=["terrain"])


@router.post("/segment", summary="Segment a Mars surface image into terrain classes")
async def segment_terrain(
    request: Request,
    payload: Annotated[dict, Body()],
) -> dict[str, Any]:
    """Classify every pixel of a Mars rover image as soil, bedrock, sand, or big rock.

    ``image_source`` can be:
    - A public HTTPS URL to a JPEG or PNG image
    - A ``data:image/jpeg;base64,...`` data URI
    - A raw base-64 encoded string
    """
    image_source = (payload or {}).get("image_source", "")
    if not image_source:
        from ..errors import ApiError
        raise ApiError(422, "image_source is required in the request body.")

    http = request.app.state.nasa.http
    return await terrain_service.segment(image_source, http)


@router.get("/classes", summary="List terrain class definitions and their palette colours")
async def list_classes() -> dict[str, Any]:
    """Return the four terrain classes and their RGB palette colours."""
    return {
        "classes": [
            {"id": 0, "name": "soil",     "description": "Loose fine-grained material, safe for driving", "rgb": [222, 184, 135]},
            {"id": 1, "name": "bedrock",  "description": "Exposed rock surface, generally driveable",     "rgb": [139, 125, 107]},
            {"id": 2, "name": "sand",     "description": "Sandy terrain, traction risk",                  "rgb": [210, 180, 140]},
            {"id": 3, "name": "big_rock", "description": "Large rocks, obstacle for rover",               "rgb": [105,  92,  78]},
        ],
        "safe_classes": ["soil", "bedrock"],
        "note": "Spirit rover was lost in 2009 after getting stuck in soft sand.",
    }

