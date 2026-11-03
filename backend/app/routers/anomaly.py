from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from ..services import anomaly as anomaly_service

router = APIRouter(prefix="/anomaly", tags=["anomaly"])


@router.get("/detect", summary="Detect anomalies in a NASA spacecraft sensor channel")
async def detect_anomalies(
    dataset: Annotated[
        str,
        Query(description="Dataset name: 'smap' (NASA SMAP satellite) or 'msl' (Curiosity rover)."),
    ] = "smap",
    channel: Annotated[
        str,
        Query(description="Sensor channel ID. Use GET /api/anomaly/channels to list available channels."),
    ] = "T-1",
) -> dict[str, Any]:
    """Run the LSTM autoencoder anomaly detector on a named spacecraft sensor channel.

    Reconstruction error is computed per 25-step sliding window; windows whose
    error exceeds the 95th-percentile threshold are flagged as anomalies.
    """
    return await anomaly_service.detect(dataset, channel)


@router.get("/channels", summary="List available sensor channels per dataset")
async def list_channels() -> dict[str, Any]:
    """Return the sensor channels bundled with the application."""
    return {
        "datasets": {
            "smap": {
                "name": "NASA SMAP Satellite",
                "description": "Soil Moisture Active Passive satellite telemetry",
                "channels": anomaly_service.KNOWN_CHANNELS["smap"],
            },
            "msl": {
                "name": "Curiosity Rover (MSL)",
                "description": "Mars Science Laboratory rover housekeeping telemetry",
                "channels": anomaly_service.KNOWN_CHANNELS["msl"],
            },
        }
    }

