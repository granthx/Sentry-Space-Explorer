"""Single source of truth for the project's modules and build phase.

The frontend renders its module cards from GET /api/modules. When a phase is
finished, flip that module's status to "live" and add its "href".
"""

from __future__ import annotations

CURRENT_PHASE = 3

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
]
