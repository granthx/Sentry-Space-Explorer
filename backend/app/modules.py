"""Single source of truth for the project's modules and build phase.

The frontend renders its module cards from GET /api/modules. When a phase is
finished, flip that module's status to "live" and add its "href".
"""

from __future__ import annotations

CURRENT_PHASE = 6

MODULES: list[dict] = [
    {
        "id": "asteroids",
        "name": "Asteroid Tracker",
        "tagline": "Near-Earth objects passing by this week, plotted by size, speed and distance.",
        "phase": 1,
        "status": "live",
        "href": "/asteroids.html",
        "api": "NASA NeoWs",
        "features": [
            "Close approaches for any 7-day window",
            "Distance radar in lunar distances",
            "Hazard flags and size comparisons",
        ],
    },
    {
        "id": "mars-images",
        "name": "Mars Image Explorer",
        "tagline": "Browse rover photographs by sol and camera, then see the sky on that same day.",
        "phase": 2,
        "status": "live",
        "href": "/mars.html",
        "api": "NASA Image and Video Library",
        "features": [
            "Curiosity, Perseverance, Spirit and Opportunity",
            "Search rover imagery with responsive gallery & lightbox",
            "APOD and asteroid pass for each Earth date",
        ],
    },
    {
        "id": "mars-data",
        "name": "Mars Data Lab",
        "tagline": "Mission statistics and trends across the rovers, with an AI assistant on top.",
        "phase": 3,
        "status": "live",
        "href": "/lab.html",
        "api": "Rover manifests + Groq AI",
        "features": [
            "Photos per sol, cameras and quiet periods",
            "Rover-to-rover comparisons",
            "Ask questions in plain language",
        ],
    },
    {
        "id": "exoplanets",
        "name": "Exoplanet Finder",
        "tagline": "A 1-D CNN reads NASA Kepler light curves and decides whether the dip is a real planet.",
        "phase": 4,
        "status": "live",
        "href": "/exoplanets.html",
        "api": "NASA Exoplanet Archive + ONNX",
        "features": [
            "Transit classification: PLANET vs FALSE POSITIVE",
            "Confidence score and 64-point flux chart",
            "Google's Kepler-90i approach replicated",
        ],
    },
    {
        "id": "terrain",
        "name": "Mars Terrain Segmentation",
        "tagline": "Pixel-wise segmentation of Mars rover images into soil, bedrock, sand and big rocks.",
        "phase": 5,
        "status": "live",
        "href": "/terrain.html",
        "api": "NASA JPL AI4Mars + ONNX",
        "features": [
            "Four terrain classes with colour overlay",
            "Safe-to-drive assessment",
            "NASA JPL AI4Mars dataset approach",
        ],
    },
    {
        "id": "anomaly",
        "name": "Spacecraft Anomaly Detection",
        "tagline": "An LSTM autoencoder flags unusual sensor readings in real NASA SMAP and Curiosity telemetry.",
        "phase": 6,
        "status": "live",
        "href": "/anomaly.html",
        "api": "NASA SMAP / MSL + ONNX",
        "features": [
            "Sliding-window reconstruction error",
            "SMAP satellite and Curiosity rover channels",
            "Severity classification: none → high",
        ],
    },
]
