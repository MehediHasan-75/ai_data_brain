# MCP Server — A Complete Guide

This document explains the Model Context Protocol (MCP) layer of this project: what MCP is, how FastMCP works, how tools/resources/prompts are defined, and the critical engineering decisions that make everything work correctly.

---

## Table of Contents

- [What Is MCP?](#what-is-mcp)
- [The Three Primitives: Tools, Resources, Prompts](#the-three-primitives-tools-resources-prompts)
- [Project Structure: How the Server Is Organized](#project-structure-how-the-server-is-organized)
- [The mcp_instance.py Bootstrap File](#the-mcp_instancepy-bootstrap-file)
- [Tools: Giving the LLM Actions](#tools-giving-the-llm-actions)
  - [The Annotated Parameter Fix — Why It Matters](#the-annotated-parameter-fix--why-it-matters)
  - [Hiding user_id from the LLM](#hiding-user_id-from-the-llm)
  - [All 10 Tools Reference](#all-10-tools-reference)
- [Resources: Context the LLM Reads](#resources-context-the-llm-reads)
- [Prompts: Predefined Workflows](#prompts-predefined-workflows)
- [The Finance MCP Services Layer](#the-finance-mcp-services-layer)
  - [ResponseBuilder: Standardized Responses](#responsebuilder-standardized-responses)
  - [OperationLogger: Audit Trail](#operationlogger-audit-trail)
  - [DataValidator: Input Checking](#datavalidator-input-checking)
- [Running the MCP Server](#running-the-mcp-server)
- [Two Modes: stdio vs In-Process](#two-modes-stdio-vs-in-process)
- [Common Issues](#common-issues)

---

## What Is MCP?

The **Model Context Protocol (MCP)** is an open standard (developed by Anthropic) that defines how an AI model communicates with external tools and data sources. It's like a USB standard for AI — any MCP-compatible client (Claude Desktop, a LangChain agent, a custom app) can connect to any MCP-compatible server and discover what it can do.

**Analogy:** Imagine you're a chef (the LLM). Without MCP, you can only work with ingredients in your head. With MCP, you have a kitchen with tools: a fridge (resource) you can open to read what's available, knives and pots (tools) you can use to manipulate things, and recipe cards (prompts) that tell you exactly how to make specific dishes. The chef doesn't know how the fridge works internally — it just knows "I can ask the fridge for its contents."

**In this project:**
- The LLM is the chef (Claude, running via LangGraph).
- The MCP server (`finance/server.py`) is the kitchen.
- Tools are actions: `add_table_row`, `delete_table`, etc.
- Resources are context: the user's table schema, fetched before the LLM reasons.
- Prompts are workflow shortcuts: "set up a monthly expense table."

---

## The Three Primitives: Tools, Resources, Prompts

| Primitive | Initiated by | Purpose | Example |
|-----------|-------------|---------|---------|
| **Tool** | LLM (decides when to call) | Perform an action, read/write data | `add_table_row`, `delete_table` |
| **Resource** | Client (fetched before LLM reasoning) | Inject context into the LLM's view | User's table schema |
| **Prompt** | User (triggers a predefined workflow) | Consistent, reproducible LLM behavior | "Create monthly expense table" |

**The key distinction:** Tools are dynamic — the LLM decides what to call and when, based on the user's message. Resources are static context injected _before_ the LLM starts thinking. Prompts are templates that the user or frontend triggers, giving the LLM a complete instruction with no ambiguity.

---

## Project Structure: How the Server Is Organized

```
servers/finance/
├── mcp_instance.py     ← FastMCP singleton + Django bootstrap
├── server.py           ← Entry point; imports tools/resources/prompts
├── tools.py            ← @mcp.tool definitions (10 tools)
├── resources.py        ← @mcp.resource definitions (schema endpoint)
├── prompts.py          ← @mcp.prompt definitions (workflow templates)
├── manager.py          ← FinanceToolsManager (in-process facade)
└── services/
    ├── _base.py        ← owns_table() + _current_user_id ContextVar
    ├── table_service.py
    ├── row_service.py
    ├── schema_service.py
    └── query_service.py
```

**Why split into multiple files?** Python registers `@mcp.tool` / `@mcp.resource` / `@mcp.prompt` decorators at import time. Splitting the definitions into separate files keeps each file focused on one concern. `server.py` is the entry point that imports them all:

```python
# server.py
from expense_api.apps.agent.servers.finance.mcp_instance import mcp
# Side-effect imports: registering tools, resources, and prompts against the mcp instance.
from expense_api.apps.agent.servers.finance import tools, resources, prompts  # noqa: F401

if __name__ == "__main__":
    mcp.run()
```

The `# noqa: F401` comment tells linters "I know these imports appear unused — they're intentional side effects."

---

## The mcp_instance.py Bootstrap File

```python
import os
import django
from django.apps import apps
from mcp.server.fastmcp import FastMCP

os.environ["DJANGO_SETTINGS_MODULE"] = "expense_api.settings.development"

if not apps.ready:
    django.setup()

mcp = FastMCP("finance_management")
```

**Why `if not apps.ready`?** When the MCP server is imported as a subprocess (via `mcp dev` or `mcp run`), `django.setup()` hasn't been called yet. But when running via the in-process client (where Django is already running), calling `django.setup()` again would raise an error. The `if not apps.ready` guard makes it safe in both contexts.

**Why a single `mcp` instance?** All decorators (`@mcp.tool`, `@mcp.resource`, `@mcp.prompt`) need to register against the same `FastMCP` object. By creating it in `mcp_instance.py` and importing it everywhere else, we avoid circular imports and guarantee a single source of truth.

**The circular import trap:** An early version imported `mcp` from `server.py`. But `server.py` imports `tools.py`, `resources.py`, and `prompts.py`. If `prompts.py` imported from `server.py`, Python would see a cycle: `server → prompts → server`. The fix: every file imports `mcp` from `mcp_instance.py`, which imports nothing from the server.

```
WRONG:                           RIGHT:
server.py ←── prompts.py        server.py ──→ mcp_instance.py
    │                               │              ▲
    └──→ prompts.py             tools.py ──────────┘
                                resources.py ──────┘
                                prompts.py ─────────┘
```

---

## Tools: Giving the LLM Actions

Tools are Python async functions decorated with `@mcp.tool`. The LLM can call them during its reasoning loop. FastMCP inspects the function signature to build a JSON schema that the LLM sees — the schema tells the LLM what parameters the tool expects.

```python
@mcp.tool(
    name="add_table_row",
    description="Add a new row to a table. Ownership is verified automatically."
)
async def add_table_row(
    table_id: Annotated[int, Field(description="The numeric ID of the table to insert a row into.")],
    row_data: Annotated[Dict[str, Any], Field(description='A JSON object mapping column names to values.')],
    user_id: Annotated[int, Field(exclude=True)] = 1,
) -> str:
    return await RowService.add_table_row(user_id, table_id, row_data)
```

The LLM sees a tool called `add_table_row` with two parameters: `table_id` (int, described) and `row_data` (dict, described). It does **not** see `user_id` — that's handled server-side.

---

### The Annotated Parameter Fix — Why It Matters

This is one of the most important implementation details in the project. Understanding it will save you hours of debugging.

**The problem:** FastMCP uses Python's `inspect.signature` to parse function parameters and build Pydantic models from them. When you write:

```python
# BROKEN
async def add_row(table_id: int = Field(description="The table ID.")):
    ...
```

Python reports `param.default = FieldInfo(description="The table ID.")` — a `FieldInfo` object, not `inspect.Parameter.empty`. FastMCP sees "this parameter has a default value" and passes `(int, FieldInfo(...))` to Pydantic's `create_model`. Pydantic then coerces the `FieldInfo` object to an int, getting `0`. **Every integer parameter defaults to 0 regardless of what the LLM sends.**

**The root cause:** `Field(description="...")` looks like a default value to Python, but it's actually metadata. Pydantic knows how to handle it when used correctly, but FastMCP's parameter parsing sends it down the wrong code path.

**The fix:** Use `Annotated[type, Field(...)]` syntax. With this, `param.default` is `inspect.Parameter.empty` (meaning "no default"), and the `Field` metadata lives inside the type annotation where Pydantic expects it:

```python
# FIXED
async def add_row(
    table_id: Annotated[int, Field(description="The table ID.")],
    # ↑ default is inspect.Parameter.empty → FastMCP takes the "required" code path
):
    ...
```

**The rule for this codebase:**
- Required parameters: `param: Annotated[type, Field(description="...")]` — no `= default`
- Optional parameters: `param: Annotated[type, Field(description="...")] = default_value` — plain scalar after `=`
- Hidden parameters: `param: Annotated[type, Field(exclude=True)] = default` — excluded from LLM schema

---

### Hiding user_id from the LLM

Every tool has a `user_id` parameter, but the LLM must never control it. If the LLM could set `user_id`, a malicious prompt like "delete all rows for user 999" could potentially succeed.

**The defense:** `Field(exclude=True)` removes the parameter from the JSON schema that FastMCP sends to the LLM. The LLM doesn't know `user_id` exists.

```python
user_id: Annotated[int, Field(exclude=True)] = 1
```

The `= 1` default is a fallback only. In production, the actual user ID is always injected via `_current_user_id.set(request.user.id)` before the tool runs. The tools-as-subprocess path reads `user_id` from the tool parameter (but it's set by the server, not the LLM). The in-process path reads it from the `ContextVar`.

---

### All 10 Tools Reference

| Tool name | Parameters (visible to LLM) | Description |
|-----------|----------------------------|-------------|
| `get_user_tables` | _(none)_ | List all tables for the authenticated user |
| `get_table_content` | `table_id?` | Get headers + rows for one or all tables |
| `create_table` | `table_name`, `description`, `headers` | Create a new table with given columns |
| `add_table_row` | `table_id`, `row_data` | Insert a row into a table |
| `update_table_row` | `table_id`, `row_id`, `new_data` | Update specific fields in an existing row |
| `delete_table_row` | `table_id`, `row_id` | Remove a row from a table |
| `add_table_column` | `table_id`, `header` | Add a new column (backfills existing rows) |
| `delete_table_columns` | `table_id`, `headers_to_remove` | Remove one or more columns |
| `update_table_metadata` | `table_id`, `table_name?`, `description?` | Rename or redescribe a table |
| `delete_table` | `table_id` | Permanently delete a table and all its rows |

All tools return a JSON string with shape `{"success": bool, "message": str, "data": ..., "timestamp": str}`.

---

## Resources: Context the LLM Reads

Resources are URI-addressed data that the client fetches before the LLM starts reasoning. They give the LLM background knowledge without requiring a tool call.

```python
# resources.py
@mcp.resource(
    "schema://tables/{user_id}",
    mime_type="text/plain"
)
async def get_user_table_schema(user_id: str) -> str:
    """
    Fetch the database schema for a specific user.
    This resource is fetched by the client before the LLM starts reasoning.
    """
    numeric_user_id = int(user_id)
    return await SchemaService.get_user_table_schema(numeric_user_id)
```

The URI template `schema://tables/{user_id}` means a client can request `schema://tables/3` to get user 3's table schema. The response looks like:

```
User's Database Tables:
- Table ID: 7 | Name: Monthly Expenses | Columns: ['Date', 'Amount', 'Category', 'Notes']
- Table ID: 12 | Name: Savings Goals | Columns: ['Goal', 'Target', 'Current', 'Deadline']
```

By injecting this schema before the LLM reasons, the LLM immediately knows what tables exist and what columns they have. This reduces the number of tool calls needed — the LLM doesn't have to call `get_user_tables` to discover what's available.

---

## Prompts: Predefined Workflows

Prompts are function templates that produce a complete LLM instruction when triggered. They're different from tools (LLM-initiated) — prompts are _user_-initiated, triggered by a button click or slash command in the frontend.

```python
# prompts.py
@mcp.prompt()
def new_expense_table(month: str, year: str) -> str:
    """Create a standard monthly expense tracking table."""
    return (
        f"Create a new expense tracking table for {month} {year}. "
        f"Use exactly these columns: Date, Category, Description, Amount, Payment Method. "
        f"After creating it, tell me the table ID."
    )
```

**Why prompts?** Without a prompt, two users asking "create a monthly expense table" might get different column names depending on how the LLM interprets the request. Prompts enforce consistency — the frontend triggers `new_expense_table(month="March", year="2026")` and the LLM always receives the same exact instruction with the same column names.

**The three prompts defined:**

| Prompt | Parameters | What it does |
|--------|-----------|--------------|
| `new_expense_table` | `month`, `year` | Creates a table with the standard 5-column expense schema |
| `import_csv_rows` | `table_id`, `csv_text` | Parses CSV and inserts each line as a row |
| `summarise_table` | `table_id` | Fetches table content and produces a human-readable summary with totals |

---

## The Finance MCP Services Layer

The MCP tools delegate all actual work to service classes in `servers/finance/services/`. These are **async** services that talk to the Django ORM.

### ResponseBuilder: Standardized Responses

All service methods return a JSON string (not a Python object). The LLM receives text, so we serialize everything before returning:

```python
class ResponseBuilder:
    @staticmethod
    def success(message: str, data: Any = None) -> str:
        response = {"success": True, "message": message, "timestamp": ...}
        if data is not None:
            response["data"] = data
        return json.dumps(response)

    @staticmethod
    def error(message: str, error: str = "", code: int = 400) -> str:
        return json.dumps({"success": False, "message": message, "error": error, ...})

    @staticmethod
    def not_found(resource_type: str, identifier: Any) -> str:
        return ResponseBuilder.error(f"{resource_type} not found", ...)
```

**Why return JSON strings instead of raising exceptions?** The LLM receives tool return values as text. If a tool raises an exception, FastMCP catches it and returns an error message — but the format is less predictable. By always returning structured JSON, the LLM can reliably parse whether an operation succeeded and extract the relevant data.

### OperationLogger: Audit Trail

```python
class OperationLogger:
    def log_operation(self, operation_type, user_id, details, success):
        self.operations.append({
            "timestamp": datetime.now().isoformat(),
            "type": operation_type,
            "user_id": user_id,
            "details": details,
            "success": success,
        })
```

Every service method calls `logger.log_operation(...)`. This builds an in-memory audit trail of all operations during the server's lifetime. Useful for debugging — if a tool call fails, you can inspect what sequence of operations led to it.

### DataValidator: Input Checking

```python
class DataValidator:
    @staticmethod
    def validate_table_data(table_name, headers, data) -> tuple[bool, str]:
        if not table_name or not table_name.strip():
            return False, "Table name cannot be empty"
        if not headers or not isinstance(headers, list):
            return False, "Headers must be a non-empty list"
        ...
        return True, "Valid"

    @staticmethod
    def validate_row_data(row_dict, headers) -> tuple[bool, str]:
        if 'id' not in row_dict:
            row_dict['id'] = str(uuid.uuid4())[:8]  # auto-assign short ID
        return True, "Valid"
```

Note that `validate_row_data` **mutates** `row_dict` by injecting an `id` if one isn't present. This auto-generated 8-character ID is how rows are later referenced by `row_id` in update/delete operations.

---

## Running the MCP Server

### Via mcp dev (for development/testing)

```bash
cd backend
mcp dev expense_api/apps/agent/servers/finance/server.py
```

This starts the MCP Inspector UI at `http://localhost:5173`. You can:
- Browse available tools, resources, and prompts
- Call tools directly with JSON arguments
- Inspect responses

### Via mcp run (for production stdio)

```bash
mcp run expense_api/apps/agent/servers/finance/server.py
```

Starts the server in stdio mode — it reads MCP messages from stdin and writes responses to stdout. Claude Desktop and other MCP clients connect to it this way.

---

## Two Modes: stdio vs In-Process

The project supports two ways to run the finance tools:

### stdio Mode (subprocess)

```
Django app
    │
    │ spawns subprocess
    ▼
MCP server (server.py) ← stdio ← MCP client (stdio_client.py)
```

The MCP client starts a subprocess running `server.py`. Messages are serialized as JSON-RPC over stdin/stdout. This is the standard MCP transport and works with any MCP client (Claude Desktop, etc.).

### In-Process Mode (local_client.py)

```
Django app
    │
    │ direct Python calls (no subprocess)
    ▼
FinanceToolsManager → services → Django ORM
```

The in-process client bypasses the MCP protocol entirely. It wraps the same service methods as LangChain tools and passes them directly to a LangGraph ReAct agent. This is faster (no subprocess overhead, no JSON serialization) and simpler to deploy.

**How user identity works in each mode:**

| Mode | How user_id reaches tools |
|------|--------------------------|
| stdio | `user_id` parameter (set by the calling code, not the LLM — `exclude=True` hides it from LLM schema) |
| in-process | `_current_user_id` ContextVar, set by `set_current_user(request.user.id)` before agent runs |

In both modes, the LLM never controls user identity. The server-side code always determines which user's data is accessed.

---

## Common Issues

### Tool always receives 0 for integer parameters

**Cause:** Using `param: int = Field(description="...")` syntax. The `FieldInfo` object gets coerced to `0` by Pydantic.

**Fix:** Use `param: Annotated[int, Field(description="...")]` syntax. See [The Annotated Parameter Fix](#the-annotated-parameter-fix--why-it-matters).

### "Access denied" / table_id treated as wrong user's table

**Cause:** `user_id` is defaulting to `1` (the fallback) instead of the real authenticated user.

**Fix (in-process mode):** Ensure `set_current_user(request.user.id)` is called before `run_query()` or `stream_query()`.

**Fix (stdio mode):** Ensure the calling code passes the correct `user_id` as a tool parameter (it's excluded from LLM schema but the server code can still access it).

### Circular import error on server startup

**Cause:** A file imported `mcp` from `server.py` instead of `mcp_instance.py`.

**Fix:** Always import `mcp` from `mcp_instance.py`:
```python
from .mcp_instance import mcp  # correct
from .server import mcp        # wrong — creates circular import
```

### django.core.exceptions.ImproperlyConfigured: Apps aren't loaded yet

**Cause:** Django ORM was called before `django.setup()` ran.

**Fix:** `mcp_instance.py` calls `django.setup()` automatically when the server starts. Ensure all service imports happen after `mcp_instance.py` is imported.

### Tool changes not reflected after code edit

**Cause:** The MCP dev server is still running the old code.

**Fix:** Stop the server (`Ctrl+C`) and restart it. FastMCP does not hot-reload.
