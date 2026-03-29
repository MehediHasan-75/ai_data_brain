"""
In-process agent client.

Replaces the subprocess MCP transport with direct Python calls.
Each tool method on FinanceToolsManager is wrapped as a LangChain tool
and handed to a LangGraph ReAct agent. The agent singleton is created
once on first use and reused across all requests.

User identity is resolved through set_current_user(), which is called
programmatically by run_query()/stream_query() before the agent is invoked.
The LLM never sees or controls the user_id — it is not in the tool list.
"""

import os
from typing import Optional, Any, Dict, AsyncGenerator

from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from ...servers.finance import tools_mgr, _current_user_id
from ..config.providers import LLMProvider
from ..prompts.system import SYSTEM_PROMPT


def set_current_user(user_id: int) -> None:
    """Bind user_id to the current async context before invoking the agent."""
    _current_user_id.set(user_id)


# Tool definitions — thin async wrappers around FinanceToolsManager methods.
# NOTE: set_request_context is intentionally excluded — user identity is
# injected programmatically via set_current_user() before the agent runs.

@tool
async def get_user_tables() -> str:
    """Get all dynamic tables belonging to the authenticated user."""
    return await tools_mgr.get_user_tables()


@tool
async def get_table_content(table_id: Optional[int] = None) -> str:
    """
    Return the full content (headers + rows) of a table.
    If table_id is omitted, returns content for all tables owned by the user.
    """
    return await tools_mgr.get_table_content(table_id)


@tool
async def create_table(table_name: str, description: str, headers: list) -> str:
    """Create a new table with the given name, description, and column headers."""
    return await tools_mgr.create_table(table_name, description, headers)


@tool
async def add_table_row(table_id: int, row_data: dict) -> str:
    """Add a new row to a table."""
    return await tools_mgr.add_table_row(table_id, row_data)


@tool
async def update_table_row(table_id: int, row_id: str, new_data: dict) -> str:
    """Update an existing row in a table."""
    return await tools_mgr.update_table_row(table_id, row_id, new_data)


@tool
async def delete_table_row(table_id: int, row_id: str) -> str:
    """Delete a row from a table."""
    return await tools_mgr.delete_table_row(table_id, row_id)


@tool
async def add_table_column(table_id: int, header: str) -> str:
    """Add a new column to a table. Existing rows are backfilled with null."""
    return await tools_mgr.add_table_column(table_id, header)


@tool
async def delete_table_columns(table_id: int, headers_to_remove: list) -> str:
    """Remove one or more columns from a table and strip their data from all rows."""
    return await tools_mgr.delete_table_columns(table_id, headers_to_remove)


@tool
async def update_table_metadata(
    table_id: int,
    table_name: Optional[str] = None,
    description: Optional[str] = None,
) -> str:
    """Update a table's name, description, or both. Omit a field to leave it unchanged."""
    return await tools_mgr.update_table_metadata(table_id, table_name, description)


@tool
async def delete_table(table_id: int) -> str:
    """Delete an entire table along with all its rows. This action is irreversible."""
    return await tools_mgr.delete_table(table_id)


TOOLS = [
    get_user_tables,
    get_table_content,
    create_table,
    add_table_row,
    update_table_row,
    delete_table_row,
    add_table_column,
    delete_table_columns,
    update_table_metadata,
    delete_table,
]

# Singleton agent — built once, reused across all requests.
_agent = None


def get_agent(llm_provider: str = "anthropic", llm_model: str = "claude-sonnet-4-6"):
    global _agent
    if _agent is None:
        api_key = os.getenv(f"{llm_provider.upper()}_API_KEY")
        if not api_key:
            raise RuntimeError(f"Missing environment variable: {llm_provider.upper()}_API_KEY")
        llm = LLMProvider.create_provider(llm_provider, api_key, llm_model).get_client()
        _agent = create_react_agent(llm, TOOLS, prompt=SYSTEM_PROMPT)
    return _agent


async def run_query(
    query: str,
    user_id: int,
    llm_provider: str = "anthropic",
    llm_model: str = "claude-sonnet-4-6",
) -> Dict[str, Any]:
    """
    Run a query against the in-process agent.

    Sets the user context before invoking so all tool calls operate on
    the correct user's data without the user_id ever being LLM-controlled.
    """
    set_current_user(user_id)
    agent = get_agent(llm_provider, llm_model)

    response = await agent.ainvoke(
        {"messages": query},
        {"recursion_limit": 15},
    )

    messages = response.get("messages", [])

    # Circuit breaker: bail out after three consecutive tool errors.
    consecutive_errors = 0
    for msg in messages:
        if getattr(msg, "status", None) == "error":
            consecutive_errors += 1
            if consecutive_errors >= 3:
                return {
                    "success": False,
                    "message": "I encountered repeated errors. Please try rephrasing your request.",
                }
        else:
            consecutive_errors = 0

    final = next(
        (msg.content for msg in reversed(messages) if hasattr(msg, "content") and msg.content),
        "",
    )

    return {"success": True, "response": final}


async def stream_query(
    query: str,
    user_id: int,
    llm_provider: str = "anthropic",
    llm_model: str = "claude-sonnet-4-6",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stream agent events as they occur.

    Yields dicts with a 'type' key:
      token      — partial LLM output
      tool_start — a tool is being called
      tool_end   — a tool call completed
      done       — final response
    """
    set_current_user(user_id)
    agent = get_agent(llm_provider, llm_model)

    async for event in agent.astream_events(
        {"messages": query},
        {"recursion_limit": 15},
        version="v2",
    ):
        kind = event["event"]

        if kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                yield {"type": "token", "content": chunk.content}

        elif kind == "on_tool_start":
            yield {"type": "tool_start", "tool": event["name"]}

        elif kind == "on_tool_end":
            yield {"type": "tool_end", "tool": event["name"]}

        elif kind == "on_chain_end" and event.get("name") == "LangGraph":
            msgs = event["data"]["output"].get("messages", [])
            if msgs:
                yield {"type": "done", "response": msgs[-1].content}
