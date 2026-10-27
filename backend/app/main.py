from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import __version__
from .cache import TTLCache
from .config import PROJECT_DIR, get_settings
from .errors import register_error_handlers
from .nasa_client import NasaClient
from .routers import apod, assistant, asteroids, health, lab, mars, modules


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    cache = TTLCache(settings.cache_ttl_seconds, settings.cache_max_entries)
    headers = {"User-Agent": f"space-explorer/{__version__}"}
    if settings.groq_api_key.strip():
        try:
            from groq import AsyncGroq
            app.state.groq = AsyncGroq(api_key=settings.groq_api_key)
        except Exception:
            app.state.groq = None
    else:
        app.state.groq = None

    async with httpx.AsyncClient(
        timeout=settings.request_timeout_seconds,
        headers=headers,
        follow_redirects=True,
    ) as http:
        app.state.nasa = NasaClient(settings, cache, http)
        yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://api.nasa.gov https://images-api.nasa.gov https://images-assets.nasa.gov https://api.groq.com; "
            "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;"
        )
        return response

    register_error_handlers(app)

    for router in (health.router, modules.router, apod.router, asteroids.router, mars.router, lab.router, assistant.router):
        app.include_router(router, prefix="/api")

    # Serve the ../frontend folder at "/" so one command runs everything.
    # Mounted last so every /api route above takes priority.
    frontend_dir = PROJECT_DIR / "frontend"
    if settings.serve_frontend and frontend_dir.is_dir():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()
