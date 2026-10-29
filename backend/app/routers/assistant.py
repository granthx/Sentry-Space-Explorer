"""API router for Space Explorer AI Assistant."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field

from ..config import Settings, get_settings
from ..deps import get_nasa
from ..errors import ApiError
from ..nasa_client import NasaClient
from ..services.assistant.loop import run_assistant

router = APIRouter(prefix="/assistant", tags=["assistant"])

# In-memory per-IP request tracker: ip -> list of timestamps
_RATE_TRACKER: dict[str, list[float]] = defaultdict(list)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


def check_rate_limit(client_ip: str, limit_per_minute: int) -> None:
    """Enforce a sliding-window rate limit per IP."""
    now = time.time()
    cutoff = now - 60.0
    timestamps = [t for t in _RATE_TRACKER[client_ip] if t > cutoff]
    if len(timestamps) >= limit_per_minute:
        raise ApiError(
            429,
            "Too many assistant questions. Please wait a minute before asking again.",
            headers={"Retry-After": "60"},
        )
    timestamps.append(now)
    _RATE_TRACKER[client_ip] = timestamps


@router.post("/chat", summary="Chat with the Space Explorer AI assistant")
async def chat(
    payload: ChatRequest,
    request: Request,
    response: Response,
    nasa: Annotated[NasaClient, Depends(get_nasa)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """Execute a chat turn with tool-calling capabilities."""
    # 1. Check configuration
    if not settings.groq_api_key.strip():
        raise ApiError(
            503,
            "The assistant is not configured. Add GROQ_API_KEY to backend/.env.",
        )

    # 2. Validate conversation messages
    if payload.messages[-1].role != "user":
        raise ApiError(422, "The final message in the conversation must be from the user.")

    # 3. Rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    check_rate_limit(client_ip, settings.assistant_rate_limit_per_minute)

    # 4. Resolve client
    groq_client = getattr(request.app.state, "groq", None)
    if groq_client is None:
        from groq import AsyncGroq
        groq_client = AsyncGroq(api_key=settings.groq_api_key)
        request.app.state.groq = groq_client

    # 5. Run assistant loop with exception mapping (lazy import for langgraph)
    messages_data = [{"role": m.role, "content": m.content} for m in payload.messages]

    try:
        if settings.assistant_engine.lower() == "langgraph":
            from ..services.assistant.langgraph_engine import run_langgraph_assistant
            return await run_langgraph_assistant(nasa, settings, messages_data)
        else:
            return await run_assistant(groq_client, nasa, settings, messages_data)
    except ApiError:
        raise
    except Exception as exc:
        exc_str = str(exc)
        if "AuthenticationError" in exc_str or "invalid_api_key" in exc_str:
            raise ApiError(502, "Assistant authentication failed. Please check the configured API key.")
        if "RateLimitError" in exc_str or "rate_limit_exceeded" in exc_str:
            response.headers["Retry-After"] = "60"
            raise ApiError(429, "The AI provider rate limit was reached. Please try again shortly.")
        if "APITimeoutError" in exc_str:
            raise ApiError(504, "The assistant request timed out.")
        if "APIConnectionError" in exc_str:
            raise ApiError(502, "Could not connect to the assistant service.")
        raise ApiError(500, f"Assistant encountered an error processing your question.")
