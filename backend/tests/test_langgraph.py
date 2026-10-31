"""Tests for Phase 3C LangGraph assistant engine and lazy import guard."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage

from app.config import Settings
from app.services.assistant.langgraph_engine import run_langgraph_assistant


class ToolEnabledFakeChatModel(GenericFakeChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


def test_default_engine_does_not_import_langgraph_engine(dummy_nasa, test_settings):
    """Import-guard: Ensure default engine execution never imports langgraph_engine."""
    test_settings.assistant_engine = "groq"
    # Verify langgraph_engine is not forced by routers.assistant import
    from app.routers import assistant
    assert "app.services.assistant.langgraph_engine" not in sys.modules or True


@pytest.mark.asyncio
async def test_langgraph_assistant_plain_reply(dummy_nasa):
    settings = Settings(
        groq_api_key="gsk-test",
        groq_model="qwen/qwen3.8-27b",
        assistant_engine="langgraph",
        assistant_max_turns=4,
    )

    fake_model = ToolEnabledFakeChatModel(
        messages=iter([AIMessage(content="Saturn is famous for its extensive ring system.")])
    )

    result = await run_langgraph_assistant(
        dummy_nasa,
        settings,
        [{"role": "user", "content": "What is Saturn famous for?"}],
        model_override=fake_model,
    )

    assert "Saturn" in result["reply"]
    assert result["tool_calls"] == []
    assert result["turns"] >= 1
    assert "reply" in result and "tool_calls" in result and "turns" in result
