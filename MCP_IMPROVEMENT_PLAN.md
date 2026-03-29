# MCP Backend Improvement Plan

## Context
The AI Data Brain backend MCP implementation is ~1 year old and shows early-stage design patterns. The core architecture is solid (FastMCP + LangGraph ReAct + Django) but has a critical security flaw, a severe performance bottleneck, 5 missing tools the system prompt already advertises, and several modernisation gaps. This plan addresses all issues in priority order.

---

## Delivery Order (Incremental, Non-Breaking)

### Step A — CRITICAL SECURITY: Remove user_id from Tool Arguments (IDOR Fix)

**Problem:** Every tool signature accepts `user_id: int` which the LLM controls. A prompt-injected or hallucinated `user_id` would let any user read/modify another user's financial data. The numeric ID is also injected into the prompt text itself.

**Files:**
- `expense_api/apps/agent/servers/finance_mcp_server.py`
- `expense_api/apps/agent/client/client.py`

**Changes:**

1. Add a `ContextVar` at the top of `finance_mcp_server.py`:
```python
from contextvars import ContextVar
_current_user_id: ContextVar[int] = ContextVar('current_user_id', default=None)

def get_current_user_id() -> int:
    uid = _current_user_id.get()
    if uid is None:
        raise RuntimeError("No authenticated user in context")
    return uid
```

2. Remove `user_id` parameter from all tool signatures that accept it (`get_user_tables`, `create_table`, `update_table_metadata`, `delete_table`). Each tool calls `get_current_user_id()` internally.

3. Add an **ownership check** to `add_table_row`, `update_table_row`, `delete_table_row` — verify `DynamicTableData.objects.filter(id=table_id, user_id=user_id).aexists()` before operating.

4. In `client.py` `process_query()`: remove `User ID: {user_id}` from the `full_query` prompt string. Set the ContextVar before invoking the agent:
```python
_current_user_id.set(user_id)
response = await self.agent.ainvoke(...)
```
> Note: ContextVar works in-process. This works perfectly once Step C (in-process) is done. Before that, use a session-init handshake: a one-time `set_request_context(user_id)` tool called by the client before any data tools.

5. Update `SYSTEM_PROMPT` in `client.py`: remove `user_id` from all 10 tool descriptions.

---

### Step B — HIGH: Add 5 Missing Tools

**Problem:** `SYSTEM_PROMPT` advertises 10 tools. Server only has 5. The LLM will attempt to call the missing ones and fail silently.

**File:** `expense_api/apps/agent/servers/finance_mcp_server.py`

Add to `FinanceToolsManager` and register with `@mcp.tool()`:

| Tool | Signature | Logic |
|------|-----------|-------|
| `get_table_content` | `(table_id: Optional[int] = None)` | Ownership check → fetch `JsonTable` + all `JsonTableRow` → return rows as list of dicts |
| `add_table_column` | `(table_id: int, header: str)` | Ownership check → append to `json_table.headers` (deduplicate) → backfill existing rows with `{header: None}` |
| `delete_table_columns` | `(table_id: int, headers_to_remove: list)` | Ownership check → update headers → strip keys from all rows → `transaction.atomic` |
| `update_table_metadata` | `(table_id: int, table_name: Optional[str], description: Optional[str])` | Ownership check → update only provided fields → `table.asave()` |
| `delete_table` | `(table_id: int)` | Ownership check → `table.adelete()` (CASCADE handles JsonTable + JsonTableRow) |

All use `get_current_user_id()` for the ownership check — no `user_id` parameter.

---

### Step C — HIGH: Eliminate Subprocess-Per-Request Bottleneck

**Problem:** Every HTTP request spawns a Python subprocess, performs MCP stdio handshake, runs query, then tears down. This adds ~500ms+ overhead and prevents scaling.

**Approach: In-Process Tool Calling** (no subprocess, no SSE server needed)

Create `expense_api/apps/agent/client/in_process_client.py`:

```python
from contextvars import ContextVar
from langchain_core.tools import tool as langchain_tool
from langgraph.prebuilt import create_react_agent
from ..servers.finance_mcp_server import tools_mgr, get_current_user_id, _current_user_id

# Wrap each server method as a LangChain tool directly
@langchain_tool
async def get_user_tables_tool() -> str:
    """Get all dynamic tables for the authenticated user."""
    return await tools_mgr.get_user_tables(get_current_user_id())

# ... same pattern for all 10 tools ...

TOOLS = [get_user_tables_tool, create_table_tool, ...]

# Singleton agent — initialized once on first use
_agent = None
def get_agent(llm_provider='google', llm_model='gemini-2.0-flash'):
    global _agent
    if _agent is None:
        llm = LLMProvider.create_provider(llm_provider, api_key, llm_model).get_client()
        _agent = create_react_agent(llm, TOOLS)
    return _agent
```

In `client.py`, update `run_query()` and `create_and_run_query()` to use the singleton via `get_agent()` instead of `async with MCPClient(...)` (which spawns a subprocess).

The ContextVar injection (`_current_user_id.set(user_id)`) now works natively because everything runs in the same process.

> **Why not SSE transport?** SSE keeps MCP protocol compatibility for external tooling but adds a separate process to manage. In-process is faster, simpler, and the ContextVar security fix works transparently. SSE can be added later if external MCP clients are needed.

---

### Step D — MEDIUM: Modernise Django Async Integration

**Problem:** Views use `async_to_sync()` bridge (thread pool overhead). Server uses `sync_to_async(lambda: list(...))` wrappers. Django 5.2 (in requirements.txt) has native async ORM.

**Files:**
- `expense_api/apps/agent/views.py`
- `expense_api/apps/agent/servers/finance_mcp_server.py`

**Views — convert to async def:**
```python
class AgentAPIView(APIView):
    async def post(self, request):   # was: def post + async_to_sync
        ...
        response_obj = await self._run_agent(query_data)  # direct await
```

**Server — replace sync_to_async wrappers with native async ORM:**
```python
# OLD
user = await sync_to_async(User.objects.get)(id=user_id)
tables = await sync_to_async(lambda: list(DynamicTableData.objects.filter(user=user)))()

# NEW
user = await User.objects.aget(id=user_id)
tables = [t async for t in DynamicTableData.objects.filter(user=user)]
```

Replace all `sync_to_async` ORM patterns:
- `.get()` → `.aget()`
- `.exists()` → `.aexists()`
- `.create()` → `.acreate()`
- `.save()` → `.asave()`
- `.delete()` → `.adelete()`
- `lambda: list(qs)` → `[x async for x in qs]`
- `with transaction.atomic()` → `async with transaction.atomic()`

> DRF serializers are not async-aware — the `DynamicTableSerializer(tables, many=True).data` call still needs `sync_to_async`. That is acceptable.

---

### Step E — MEDIUM: True Streaming (StreamingHttpResponse)

**Problem:** `AgentStreamingAPIView` returns a complete response — identical to the regular endpoint. LangGraph supports `.astream_events()`.

**Files:**
- `expense_api/apps/agent/client/client.py` (or `in_process_client.py`)
- `expense_api/apps/agent/views.py`

**Client — add `stream_query` generator:**
```python
async def stream_query(self, query: str, user_id: int):
    _current_user_id.set(user_id)
    async for event in self.agent.astream_events(
        {"messages": query}, {"recursion_limit": 15}, version="v2"
    ):
        if event["event"] == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                yield {"type": "token", "content": chunk.content}
        elif event["event"] == "on_tool_start":
            yield {"type": "tool_start", "tool": event["name"]}
        elif event["event"] == "on_tool_end":
            yield {"type": "tool_end", "tool": event["name"]}
        elif event["event"] == "on_chain_end" and event.get("name") == "LangGraph":
            msgs = event["data"]["output"].get("messages", [])
            if msgs:
                yield {"type": "done", "response": msgs[-1].content}
```

**View — replace with true StreamingHttpResponse:**
```python
from django.http import StreamingHttpResponse
import json

class AgentStreamingAPIView(APIView):
    async def post(self, request):
        # ... auth + validate ...
        async def event_generator():
            async for event in client.stream_query(query, user_id):
                yield json.dumps(event) + "\n"

        return StreamingHttpResponse(event_generator(), content_type="application/x-ndjson")
```

Frontend reads the response as newline-delimited JSON (NDJSON) and renders tokens as they arrive.

> Requires ASGI (uvicorn). Verify `expense_api/asgi.py` is the entrypoint, not wsgi.py. Uvicorn is already in requirements.txt.

---

### Step F — LOW: Fix Recursion Limit + Failure Circuit Breaker

**File:** `expense_api/apps/agent/client/client.py`

```python
# OLD
{"recursion_limit": 100}

# NEW
{"recursion_limit": 15}
```

Add post-response failure detection — after `agent.ainvoke` returns, check the message list for consecutive tool errors:
```python
consecutive_errors = 0
for msg in response["messages"]:
    if hasattr(msg, "status") and msg.status == "error":
        consecutive_errors += 1
        if consecutive_errors >= 3:
            return {"success": False, "message": "I encountered repeated errors. Please try rephrasing."}
    else:
        consecutive_errors = 0
```

---

### Step G — LOW: Delete Duplicate Files

```bash
git rm expense_api/apps/agent/servers/finance_mcp_server_refactored.py
git rm expense_api/apps/agent/client/client_refactored.py
```

Also review and remove any other stale files (`views_new.py`, `urls_new.py`, `streaming_response_example.py`, `test_streaming_format.py`) that are not imported anywhere.

---

### Step H — FEATURE: Add MCP Resources and Prompts

**File:** `expense_api/apps/agent/servers/finance_mcp_server.py`

**Resources** (app-controlled passive data reads):
```python
@mcp.resource("tables://list", mime_type="application/json")
async def list_tables_resource() -> str:
    """Expose all user tables as structured context."""
    user_id = get_current_user_id()
    tables = [t async for t in DynamicTableData.objects.filter(user_id=user_id)]
    return json.dumps([{"id": t.id, "name": t.table_name} for t in tables])

@mcp.resource("tables://{table_id}", mime_type="application/json")
async def get_table_resource(table_id: int) -> str:
    """Expose full table content as context."""
    user_id = get_current_user_id()
    table = await DynamicTableData.objects.aget(id=table_id, user_id=user_id)
    rows = [r async for r in JsonTableRow.objects.filter(table__table=table)]
    return json.dumps({"table": table.table_name, "rows": [r.data for r in rows]})
```

**Prompts** (user-triggered reusable templates):
```python
@mcp.prompt(name="analyze-expenses", description="Monthly expense analysis")
def analyze_expenses_prompt(month: str = "this month") -> list:
    return [base.UserMessage(f"""
        Analyze my expenses for {month}:
        1. Get my tables, identify expense-related ones
        2. Read the content, summarize by category
        3. Show top 3 spending categories and saving suggestions
    """)]

@mcp.prompt(name="summarize-data", description="Full data summary for a period")
def summarize_data_prompt(period: str = "this month") -> list:
    return [base.UserMessage(f"Generate a complete summary of all my tracked data for {period}.")]
```

Add a `/api/agent/prompts/` endpoint to list available prompts and a `/api/agent/prompts/{name}/` endpoint to invoke one.

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `servers/finance_mcp_server.py` | ContextVar + remove user_id from signatures + ownership checks + 5 new tools + async ORM + Resources + Prompts |
| `client/client.py` | Remove user_id from prompt + set ContextVar before ainvoke + in-process singleton + stream_query + recursion_limit 15 |
| `client/in_process_client.py` | **New file** — LangChain tool wrappers around server methods + agent singleton |
| `views.py` | Convert to `async def` + StreamingHttpResponse for streaming view |
| `servers/finance_mcp_server_refactored.py` | **Delete** |
| `client/client_refactored.py` | **Delete** |
| `servers/base.py` | Use `ResponseBuilder` pattern for all new tool responses (no changes needed) |
| `models.py` (FinanceManagement) | Reference only — `DynamicTableData.user` FK for ownership checks |

---

## Verification Steps

1. Activate venv: `cd backend && source .venv/bin/activate`
2. Start server: `python manage.py runserver`
3. **Security fix:** query endpoint with a crafted prompt trying to pass a different `user_id` — tools should reject it
4. **Missing tools:** ask agent to "add a column called Notes to table X" — should use `add_table_column`
5. **Performance:** measure response time before/after Step C — should drop by ~500ms+
6. **Streaming:** `curl -N -X POST /api/agent/streaming/` — should see tokens arrive incrementally
7. **Integration test:** run `python verify_agent_refactoring.py`
8. **Regression:** run full Postman collection
