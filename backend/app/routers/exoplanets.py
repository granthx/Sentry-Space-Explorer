from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request

from ..services import exoplanets as exoplanet_service

router = APIRouter(prefix="/exoplanets", tags=["exoplanets"])


@router.get("/predict", summary="Classify a Kepler object as planet or false positive")
async def predict_transit(
    request: Request,
    kepid: Annotated[
        int,
        Query(description="Kepler Input Catalog ID (e.g. 11442793 = Kepler-90)."),
    ] = 11442793,
) -> dict[str, Any]:
    """Run the 1-D CNN on the Kepler light curve for *kepid*.

    Returns the classification label, confidence score, and a 64-point
    down-sampled flux array suitable for rendering a chart.
    """
    http = request.app.state.nasa.http
    return await exoplanet_service.predict(kepid, http)


@router.get("/samples", summary="List the Kepler objects bundled as offline samples")
async def list_samples() -> dict[str, Any]:
    """Return the small set of pre-loaded Kepler IDs available without network access."""
    return {
        "samples": [
            {
                "kepid": 11442793,
                "name": "Kepler-90 (KIC 11442793)",
                "note": "8-planet system — confirmed planet host",
            },
            {
                "kepid": 10666592,
                "name": "KIC 10666592",
                "note": "Known false positive — eclipsing binary",
            },
        ]
    }

