# MCP Backend Cleanup Report

**Date:** 2026-03-29
**Branch:** mehedi
**Scope:** `expense_api/apps/agent/`

---

## Summary

The agent subsystem was built as an early prototype. The core idea (FastMCP + LangGraph ReAct + Django) is sound, but several issues accumulated over time: a critical IDOR security flaw, five tools advertised in the system prompt but never implemented, a subprocess-per-request performance problem, outdated async patterns, and a non-functional streaming endpoint. This report documents each issue and the remediation applied.

---

## Issues Found
Defining prompts.pdf
### A — IDOR via user_id in Tool Arguments (Critical)

Every MCP tool accepted `user_id: int` as a parameter controlled by the LLM. A prompt-injected or hallucinated value would let any authenticated user read or modify another user's tables. The numeric ID was also embedded directly in the query string passed to the agent.

**Fix:** Introduced a `ContextVar[int]` (`_current_user_id`) that is set once per session via a new `set_request_context()` tool called programmatically by the client before the agent runs. All tools now call `get_current_user_id()` internally. Row-level operations also verify table ownership before touching data.

### B — Five Missing Tools (High)

`SYSTEM_PROMPT` listed ten tools. The server implemented only five. The LLM would attempt to call the missing ones and receive no-op failures with no feedback.

**Fix:** Implemented `get_table_content`, `add_table_column`, `delete_table_columns`, `update_table_metadata`, and `delete_table`. All apply the same ownership check pattern.

### C — Subprocess Per Request (High)

`run_query()` opened a full stdio MCP subprocess for every HTTP request: spawn process → handshake → run → teardown. This added roughly 500 ms of fixed overhead per request and prevented any form of connection reuse.

**Fix:** Replaced the subprocess transport with an in-process client (`client/in_process_client.py`). Tool methods from `FinanceToolsManager` are wrapped as LangChain tools and handed directly to `create_react_agent`. The ContextVar identity mechanism works transparently because everything runs in the same process.

### D — Outdated Async ORM Patterns (Medium)

Views used `async_to_sync()` to call async agent methods from sync DRF handlers, adding thread pool overhead on every request. The server used `sync_to_async(lambda: list(...))` wrappers everywhere instead of the native async ORM available in Django 4.1+.

**Fix:** Converted `AgentAPIView` and `AgentStreamingAPIView` to `async def` handlers. Replaced all `sync_to_async` ORM wrappers with `.aget()`, `.acreate()`, `.asave()`, `.adelete()`, `aexists()`, and async iteration. DRF serializer calls remain wrapped as they are not async-aware.

### E — Streaming Endpoint Was Not Streaming (Medium)

`AgentStreamingAPIView` returned a complete buffered response — identical to the regular endpoint. LangGraph's `.astream_events()` API was never used.

**Fix:** Added `stream_query()` async generator to the in-process client. `AgentStreamingAPIView` now returns a `StreamingHttpResponse` emitting newline-delimited JSON (NDJSON) with token, tool-start, tool-end, and done event types.

### F — Runaway Recursion Limit (Low)

The recursion limit was set to 100, allowing the agent to loop through up to 100 reasoning steps. Combined with a missing circuit breaker, a stuck agent would exhaust the limit before returning anything useful.

**Fix:** Reduced to 15. Added post-invoke error detection that returns a user-friendly message after three consecutive tool failures.

### G — Stale Duplicate Files (Low)

`servers/finance_mcp_server_refactored.py` and `client/client_refactored.py` were leftover drafts not imported anywhere.

**Fix:** Deleted both files.

---

## Files Changed

| File | Change |
|------|--------|
| `servers/finance_mcp_server.py` | ContextVar identity, ownership checks, 5 new tools, native async ORM |
| `client/client.py` | Removed user_id from prompt, set ContextVar before invoke, recursion limit 15, circuit breaker |
| `client/in_process_client.py` | New — in-process LangChain tool wrappers, singleton agent |
| `views.py` | Converted to async def, StreamingHttpResponse on streaming endpoint |
| `servers/finance_mcp_server_refactored.py` | Deleted |
| `client/client_refactored.py` | Deleted |

---

## Verification

```bash
cd backend && source .venv/bin/activate
python manage.py runserver

# Security: crafted prompt with a different user_id should be rejected
# Missing tools: "add a column called Notes to table X" should succeed
# Performance: response time should drop by ~500 ms
# Streaming: curl -N -X POST /api/agent/streaming/ should emit tokens incrementally
python verify_agent_refactoring.py
```
