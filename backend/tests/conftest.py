from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.cache import TTLCache
from app.config import Settings
from app.main import create_app
from app.nasa_client import NasaAPIError, NasaClient


@pytest.fixture
def cache():
    return TTLCache(ttl_seconds=900, max_entries=512)


@pytest.fixture
def test_settings():
    return Settings(
        groq_api_key="gsk-test",
        groq_model="qwen/qwen3.8-27b",
        assistant_max_turns=6,
        assistant_max_tokens=1024,
    )


@pytest.fixture
def dummy_nasa(cache):
    return SimpleNamespace(cache=cache, get_json=AsyncMock(return_value={}))


@pytest.fixture
def api(monkeypatch):
    """A running app whose NASA calls are faked. No network is ever used.

    Tweak the returned object inside a test:
        api.payload     what NASA "returns"
        api.error       an exception to raise instead
        api.fail_paths  substrings of paths that should fail with a 502
        api.calls       list of (path, params, kwargs) the app made
        api.http        the TestClient
    """
    state = SimpleNamespace(calls=[], payload={}, error=None, fail_paths=(), http=None)

    async def fake_get_json(self, path, params=None, **kwargs):
        state.calls.append((path, params, kwargs))
        if state.error is not None:
            raise state.error
        if any(fragment in path for fragment in state.fail_paths):
            raise NasaAPIError(502, "boom")
        return state.payload

    monkeypatch.setattr(NasaClient, "get_json", fake_get_json)
    with TestClient(create_app()) as client:
        state.http = client
        yield state
