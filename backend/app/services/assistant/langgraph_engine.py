"""Optional LangGraph engine for the Space Explorer AI Assistant (Phase 3C).

Uses LangGraph prebuilt ReAct agent wrapping the exact same domain tools
from services/assistant/tools.py without duplicating logic.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent

from ...config import Settings
from ...nasa_client import NasaClient
from .loop import SYSTEM_PROMPT_TEMPLATE
from .tools import execute_tool

log = logging.getLogger("space_explorer.assistant.langgraph")


def build_langchain_tools(nasa: NasaClient, tool_calls_log: list[dict[str, Any]]) -> list[StructuredTool]:
    """Wrap existing services/assistant/tools.py tools as LangChain StructuredTools."""

    async def _asteroids(start_date: str, end_date: str) -> str:
        args = {"start_date": start_date, "end_date": end_date}
        res, ok = await execute_tool(nasa, "get_asteroids", args)
        tool_calls_log.append({"name": "get_asteroids", "input": args, "ok": ok})
        return json.dumps(res)

    async def _asteroid_details(asteroid_id: str) -> str:
        args = {"asteroid_id": asteroid_id}
        res, ok = await execute_tool(nasa, "get_asteroid_details", args)
        tool_calls_log.append({"name": "get_asteroid_details", "input": args, "ok": ok})
        return json.dumps(res)

    async def _mars_photos(rover: str, query: str = "", page: int = 1) -> str:
        args = {"rover": rover, "query": query, "page": page}
        res, ok = await execute_tool(nasa, "get_mars_photos", args)
        tool_calls_log.append({"name": "get_mars_photos", "input": args, "ok": ok})
        return json.dumps(res)

    async def _rover_manifest(rover: str) -> str:
        args = {"rover": rover}
        res, ok = await execute_tool(nasa, "get_rover_manifest", args)
        tool_calls_log.append({"name": "get_rover_manifest", "input": args, "ok": ok})
        return json.dumps(res)

    async def _compare_rovers(rovers: list[str]) -> str:
        args = {"rovers": rovers}
        res, ok = await execute_tool(nasa, "compare_rovers", args)
        tool_calls_log.append({"name": "compare_rovers", "input": args, "ok": ok})
        return json.dumps(res)

    async def _apod(date: str | None = None) -> str:
        args = {"date": date}
        res, ok = await execute_tool(nasa, "get_apod", args)
        tool_calls_log.append({"name": "get_apod", "input": args, "ok": ok})
        return json.dumps(res)

    return [
        StructuredTool.from_function(
            coroutine=_asteroids,
            name="get_asteroids",
            description="Fetch near-Earth asteroids passing Earth in a given date window (up to 7 days).",
        ),
        StructuredTool.from_function(
            coroutine=_asteroid_details,
            name="get_asteroid_details",
            description="Retrieve orbit data and approach observations for an asteroid by ID.",
        ),
        StructuredTool.from_function(
            coroutine=_mars_photos,
            name="get_mars_photos",
            description="Search photographs taken on Mars by Curiosity, Perseverance, Opportunity, or Spirit.",
        ),
        StructuredTool.from_function(
            coroutine=_rover_manifest,
            name="get_rover_manifest",
            description="Get mission lifetime statistics for a Mars rover.",
        ),
        StructuredTool.from_function(
            coroutine=_compare_rovers,
            name="compare_rovers",
            description="Compare mission productivity and photo counts across multiple Mars rovers.",
        ),
        StructuredTool.from_function(
            coroutine=_apod,
            name="get_apod",
            description="Fetch NASA Astronomy Picture of the Day for a given Earth date.",
        ),
    ]


async def run_langgraph_assistant(
    nasa: NasaClient,
    settings: Settings,
    messages: list[dict[str, str]],
    model_override: Any = None,
) -> dict[str, Any]:
    """Execute the multi-turn assistant workflow via LangGraph ReAct agent."""
    today_str = dt.date.today().isoformat()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(today_str=today_str)

    tool_calls_log: list[dict[str, Any]] = []
    tools = build_langchain_tools(nasa, tool_calls_log)

    if model_override:
        llm = model_override
    else:
        llm = ChatGroq(
            model=settings.groq_model,
            groq_api_key=settings.groq_api_key,
            max_tokens=settings.assistant_max_tokens,
            temperature=0.2,
        )

    agent = create_react_agent(
        llm,
        tools=tools,
        prompt=system_prompt,
    )

    lc_messages = []
    for m in messages:
        if m["role"] == "user":
            lc_messages.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            lc_messages.append(AIMessage(content=m["content"]))

    # Recursion limit corresponds to assistant_max_turns
    recursion_limit = (settings.assistant_max_turns * 2) + 2

    try:
        final_state = await agent.ainvoke(
            {"messages": lc_messages},
            config={"recursion_limit": recursion_limit},
        )
    except Exception as exc:
        if "recursion limit" in str(exc).lower():
            return {
                "reply": "This question required too many investigation steps to complete. Please try narrowing your inquiry.",
                "tool_calls": tool_calls_log,
                "turns": settings.assistant_max_turns,
            }
        raise exc

    messages_out = final_state.get("messages", [])
    reply = ""
    for msg in reversed(messages_out):
        if isinstance(msg, AIMessage) and msg.content:
            reply = str(msg.content)
            break

    # Calculate turns based on AI message exchanges
    ai_turns = sum(1 for m in messages_out if isinstance(m, AIMessage))
    turns = max(1, ai_turns)

    return {
        "reply": reply.strip(),
        "tool_calls": tool_calls_log,
        "turns": turns,
    }

