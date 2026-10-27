from __future__ import annotations

from fastapi import Request

from .nasa_client import NasaClient


def get_nasa(request: Request) -> NasaClient:
    """FastAPI dependency: the shared NasaClient created at startup."""
    return request.app.state.nasa
