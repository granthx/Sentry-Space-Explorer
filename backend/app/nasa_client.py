"""The single doorway to NASA.

Every call to api.nasa.gov (and images-api.nasa.gov) goes through NasaClient so
that caching, the API key, timeouts, rate-limit tracking and error mapping live
in exactly one place. Routers and services never talk to httpx directly.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .cache import MISSING, TTLCache
from .config import Settings
from .errors import ApiError

log = logging.getLogger("space_explorer.nasa")


class NasaAPIError(ApiError):
    """An ApiError that came from (or while talking to) NASA."""

    def __init__(self, status_code: int, message: str, *, upstream_status: int | None = None, retry_after: str | None = None):
        headers = {"Retry-After": retry_after} if retry_after else None
        super().__init__(status_code, message, headers=headers)
        self.upstream_status = upstream_status


class NasaClient:
    def __init__(self, settings: Settings, cache: TTLCache, http: httpx.AsyncClient):
        self.settings = settings
        self.cache = cache
        self.http = http
        self.upstream_calls = 0
        self.rate_limit_limit: int | None = None
        self.rate_limit_remaining: int | None = None

    async def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        base_url: str | None = None,
        ttl: float | None = None,
        use_key: bool = True,
    ) -> Any:
        """GET a JSON document from NASA.

        path     e.g. "planetary/apod"
        params   query parameters; None values are dropped
        base_url override (used for images-api.nasa.gov)
        ttl      cache lifetime in seconds. None = default, 0 = do not cache
        use_key  append the api_key (the NASA Image Library does not need one)
        """
        base = (base_url or self.settings.nasa_base_url).rstrip("/")
        url = f"{base}/{path.lstrip('/')}"
        clean = {k: v for k, v in (params or {}).items() if v is not None}

        cache_key = (url, tuple(sorted((k, str(v)) for k, v in clean.items())))
        cached = self.cache.get(cache_key, MISSING)
        if cached is not MISSING:
            return cached

        query = dict(clean)
        if use_key:
            query["api_key"] = self.settings.nasa_api_key

        try:
            response = await self.http.get(url, params=query)
        except httpx.TimeoutException as exc:
            raise NasaAPIError(504, "NASA took too long to respond. Please try again in a moment.") from exc
        except httpx.HTTPError as exc:
            raise NasaAPIError(502, "Could not reach NASA's servers.") from exc

        self.upstream_calls += 1
        self._track_rate_limit(response)
        status = response.status_code

        if status == 429:
            hint = (
                " You are on DEMO_KEY (30 requests/hour) - add your own free key to backend/.env."
                if self.settings.using_demo_key
                else " Please wait a little before trying again."
            )
            raise NasaAPIError(
                429,
                "NASA's rate limit was reached." + hint,
                upstream_status=429,
                retry_after=response.headers.get("Retry-After"),
            )
        if status >= 500:
            raise NasaAPIError(502, f"NASA's service returned an error ({status}).", upstream_status=status)
        if status >= 400:
            raise NasaAPIError(status, self._extract_message(response), upstream_status=status)

        try:
            data = response.json()
        except ValueError as exc:
            raise NasaAPIError(502, "NASA returned a response that could not be read.") from exc

        self.cache.set(cache_key, data, ttl)
        return data

    # ------------------------------------------------------------------ helpers

    def _track_rate_limit(self, response: httpx.Response) -> None:
        for header, attr in (("X-RateLimit-Remaining", "rate_limit_remaining"), ("X-RateLimit-Limit", "rate_limit_limit")):
            raw = response.headers.get(header)
            if raw is not None:
                try:
                    setattr(self, attr, int(raw))
                except ValueError:
                    pass

    @staticmethod
    def _extract_message(response: httpx.Response) -> str:
        fallback = f"NASA rejected the request (status {response.status_code})."
        try:
            body = response.json()
        except ValueError:
            return fallback
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            if isinstance(err, str) and err:
                return err
            for key in ("msg", "message", "error_message", "detail"):
                value = body.get(key)
                if isinstance(value, str) and value:
                    return value
        return fallback
