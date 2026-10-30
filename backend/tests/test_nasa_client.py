from __future__ import annotations

import httpx
import pytest

from app.cache import TTLCache
from app.config import Settings
from app.nasa_client import NasaAPIError, NasaClient


def make_client(handler, key="MYKEY"):
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = Settings(nasa_api_key=key)
    return NasaClient(settings, TTLCache(60), http)


async def test_adds_key_drops_none_params_and_caches():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"ok": True}, headers={"X-RateLimit-Remaining": "998"})

    client = make_client(handler)
    first = await client.get_json("planetary/apod", {"date": None, "thumbs": "true"})
    second = await client.get_json("planetary/apod", {"thumbs": "true", "date": None})

    assert first == second == {"ok": True}
    assert len(seen) == 1  # second call was served from cache
    assert seen[0].url.params["api_key"] == "MYKEY"
    assert "date" not in seen[0].url.params
    assert client.rate_limit_remaining == 998


async def test_ttl_zero_skips_the_cache():
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={})

    client = make_client(handler)
    await client.get_json("x", ttl=0)
    await client.get_json("x", ttl=0)
    assert calls == 2


async def test_use_key_false_sends_no_key():
    def handler(request):
        assert "api_key" not in request.url.params
        return httpx.Response(200, json={})

    await make_client(handler).get_json("search", {"q": "mars"}, use_key=False)


async def test_429_mentions_demo_key():
    client = make_client(lambda r: httpx.Response(429, json={}), key="DEMO_KEY")
    with pytest.raises(NasaAPIError) as info:
        await client.get_json("x")
    assert info.value.status_code == 429
    assert "DEMO_KEY" in info.value.message


async def test_5xx_becomes_502():
    client = make_client(lambda r: httpx.Response(503, text="down"))
    with pytest.raises(NasaAPIError) as info:
        await client.get_json("x")
    assert info.value.status_code == 502


async def test_4xx_uses_nasa_message():
    body = {"error": {"code": "API_KEY_INVALID", "message": "An invalid api_key was supplied."}}
    client = make_client(lambda r: httpx.Response(403, json=body))
    with pytest.raises(NasaAPIError) as info:
        await client.get_json("x")
    assert info.value.status_code == 403
    assert info.value.message == "An invalid api_key was supplied."


async def test_timeout_becomes_504():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(NasaAPIError) as info:
        await make_client(handler).get_json("x")
    assert info.value.status_code == 504


async def test_errors_are_not_cached():
    responses = iter([httpx.Response(503), httpx.Response(200, json={"ok": 1})])
    client = make_client(lambda r: next(responses))
    with pytest.raises(NasaAPIError):
        await client.get_json("x")
    assert await client.get_json("x") == {"ok": 1}
