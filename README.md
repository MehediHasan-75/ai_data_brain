<div align="center">

# AI Data Brain

**A production-grade Django + MCP backend. Talk to your data in natural language. Claude reads your tables, understands your intent, and writes back — in Bengali or English.**

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Django](https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white)](https://djangoproject.com)
[![DRF](https://img.shields.io/badge/DRF-3.16-red?style=flat-square)](https://www.django-rest-framework.org)
[![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-CC785C?style=flat-square)](https://anthropic.com)
[![MCP](https://img.shields.io/badge/MCP-FastMCP-6B4FBB?style=flat-square)](https://github.com/jlowin/fastmcp)
[![LangGraph](https://img.shields.io/badge/LangGraph-ReAct_Agent-1C3C3C?style=flat-square)](https://langchain-ai.github.io/langgraph/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Table of Contents

- [About / Why This Project](#about--why-this-project)
- [What This Is](#what-this-is)
- [How It Works Under the Hood](#how-it-works-under-the-hood)
- [Key Engineering Decisions](#key-engineering-decisions)
- [System Architecture](#system-architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Additional Documentation](#additional-documentation)
- [Environment Variables](#environment-variables)
- [Troubleshooting / FAQ](#troubleshooting--faq)

---

## About / Why This Project

Most AI demos talk to a fixed database schema: "here are my tables, ask me questions." This project flips that. The *schema itself is dynamic* — users create tables, columns, and rows through a conversation. There is no `ALTER TABLE`. There is no migration file. The entire spreadsheet-like data layer lives in JSON columns that reshape themselves at runtime.

**The core questions this project answers:**
- How do you connect an LLM to a live database so it can read, write, and reason across multiple steps without the user writing SQL?
- How do you safely bridge Django's synchronous ORM with Python's async world — in a production MCP server that runs fully async?
- How do you prevent a smart LLM from accessing another user's data even when it controls the tool calls?

**What this is not:** a finished product. Every architectural decision is documented with the problem it solves and the trade-off accepted. Built for learning, portfolio, and interview discussion.

---

## What This Is

AI Data Brain gives users a personal spreadsheet managed entirely through natural language. You say "create a table for my monthly expenses with columns Date, Category, and Amount" — and Claude creates it. You say "add a row: March rent, 25000 taka" — Claude parses and inserts it. You say "what did I spend most on last month?" — Claude reads your data and answers.

**What you can do with it:**

- Create dynamic tables with any columns you want — no predefined schema
- Add, update, and delete rows and columns through conversational requests
- Share tables with friends and control who sees what
- Query and summarize your data in Bengali or English
- Stream AI responses token-by-token for real-time feedback
- Access all operations via a standard REST API (for the frontend) or via MCP (for the AI)

The project has two parallel interfaces for data: a REST API that the frontend calls directly, and an MCP server that Claude calls when processing a natural language query. Both talk to the same service layer.

---

## How It Works Under the Hood

> A precise walkthrough of what happens from the moment you type a query to the moment Claude writes data back.

**1. User sends a query**
The frontend `POST /api/agent/query/` with a message like "add row: coffee 150 taka today". The `AgentAPIView` authenticates via JWT cookie, validates the request with a DRF serializer, and calls `run_query(query, user_id)`.

**2. LLM Provider selection**
`LLMProvider` creates a LangChain-compatible LLM client — Claude Sonnet, Gemini, or DeepSeek depending on the `llm_provider` field. All three implement the same interface, so the agent doesn't care which model is running.

**3. ReAct Agent kicks in**
`get_agent()` constructs a LangGraph `create_react_agent` — a loop that lets the LLM reason, pick a tool, observe the result, and repeat until it decides it's done. The agent has 10 finance tools available (create table, add row, update row, delete column, etc.) plus a schema resource that tells it what tables the user already has.

**4. Schema context injection**
Before the first LLM call, the agent fetches `schema://tables/{user_id}` — a live summary of all the user's tables and their column names. This means Claude always knows what exists before it tries to write.

**5. Tool execution**
When Claude picks a tool (e.g., `add_table_row`), FastMCP deserializes the arguments using the `Annotated[type, Field(...)]` parameter pattern, validates them via Pydantic, and calls the async Django service. The `user_id` is injected from the context variable — Claude cannot set it, only the server can.

**6. Async/sync bridge**
The Django ORM is synchronous. The MCP server runs fully async. The bridge is `sync_to_async` from `asgiref` — it runs the synchronous ORM call in a thread pool so the async event loop never blocks.

**7. Response back**
The tool returns a JSON string via `ResponseBuilder`. Claude reads it, decides if it's done, and writes a human-readable summary. That summary is returned to the view, cleaned of any LLM step noise, and sent back to the frontend. For streaming, `stream_query()` yields token-by-token SSE events.

---

## Key Engineering Decisions

> These are the non-obvious choices that shaped the system. Each solves a specific problem.

| Decision | Problem It Solves | Trade-off Accepted |
|----------|-------------------|--------------------|
| **3-tier JSON schema** — `DynamicTableData` + `JsonTable` (headers) + `JsonTableRow` (data) | Traditional relational columns need a schema defined upfront. Users want to create arbitrary columns at runtime | JSON columns lose relational integrity guarantees (no foreign keys between columns); row data is not type-validated at the DB level |
| **MCP over direct function calls** — Claude accesses data via typed MCP tools, not raw DB access | Without MCP, Claude would need to generate SQL or call a generic API; it couldn't reason across multi-step operations reliably | MCP server is a separate process; adds a network hop and startup overhead |
| **`Annotated[type, Field(...)]` for tool parameters** — not `param: int = Field(description="...")` | FastMCP inspects `inspect.signature`. `Field(...)` as a default causes Pydantic to receive `FieldInfo` as the int's default value → all ints arrive as `0`. `Annotated` puts the metadata in the type, not the default | Slightly more verbose parameter declarations |
| **`Field(exclude=True)` on `user_id`** — hidden from Claude's tool schema | If `user_id` is visible in the schema, a sufficiently clever LLM could pass `user_id=5` to access another user's tables | `user_id` is hardcoded to `1` in MCP tools (the HTTP layer handles real user injection via `_current_user_id` context var) |
| **`sync_to_async` wrapper instead of Django async ORM everywhere** — column operations use `sync_to_async(_sync_fn)()` | Django's async ORM is incomplete: `bulk_update`, complex transactions, and some queryset operations require the synchronous path. Wrapping preserves atomic transactions while staying on the async event loop | Slightly more boilerplate; sync code runs in a thread pool, not the main async loop |
| **Custom JWT in HttpOnly cookies** — not `Authorization: Bearer` header | Browser JS cannot access HttpOnly cookies, making XSS token theft impossible. Stateless JWT means no session storage needed | Requires custom `JWTAuthentication` backend; CSRF protection must be explicit; `secure=True` required in production |
| **Service layer between views and ORM** — all business logic in `services.py`, never in views | Fat views become untestable and impossible to reuse. Views should only handle HTTP — validate input, call service, return response | More files; junior developers must understand which layer to put code in |
| **`ContextVar` for user identity in MCP tools** — `_current_user_id.set(user_id)` before each agent call | If the LLM controls `user_id` as a tool parameter, a prompt-injection attack can read another user's data | Only works within the same async task; cross-task context variables need explicit propagation |
| **Ownership checks in every service method** — `JsonTable.objects.get(pk=table_id, table__user=user)` | Without ownership checks, any authenticated user can modify any table by guessing its integer ID | Slightly longer queries; must remember to pass `user` to every service call |
| **LangGraph ReAct agent over a simple LLM call** — multi-step reasoning loop | A single prompt can't handle "rename column X in my expenses table, then add a row" — it requires reading the table first, then acting | ReAct adds latency per step; each tool call is a round-trip to Claude |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                            │
│              (Next.js 15 + Tailwind CSS + Web Speech API)        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS  (JWT in HttpOnly cookies)
┌──────────────────────▼──────────────────────────────────────────┐
│                     Django + DRF                                  │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  user_auth app │  │ FinanceManagement │  │   agent app     │  │
│  │  /api/auth/    │  │   /api/main/     │  │  /api/agent/    │  │
│  └────────────────┘  └──────────────────┘  └────────┬────────┘  │
│                                                       │           │
│                              ┌────────────────────────▼────────┐ │
│                              │        LangGraph ReAct Agent    │ │
│                              │  (run_query / stream_query)     │ │
│                              └────────────────────────┬────────┘ │
└───────────────────────────────────────────────────────┼──────────┘
                                                         │ tool calls
┌───────────────────────────────────────────────────────▼──────────┐
│                    FastMCP Finance Server                          │
│  tools.py (10 tools)  resources.py (schema)  prompts.py          │
│                              │                                     │
│               ┌──────────────┴─────────────┐                      │
│          services/                     services/                   │
│      TableService  RowService  ColumnService  QueryService         │
│                              │                                     │
│                    sync_to_async bridge                            │
│                              │                                     │
└──────────────────────────────┼────────────────────────────────────┘
                                │ ORM queries
┌──────────────────────────────▼────────────────────────────────────┐
│                    PostgreSQL / SQLite                              │
│  DynamicTableData   JsonTable   JsonTableRow                       │
│  ChatSession        ChatMessage  UserProfile                       │
└────────────────────────────────────────────────────────────────────┘
```

**Two paths to the same data:**
- **REST path** — Frontend → DRF views → `FinanceManagement/services.py` → ORM
- **MCP path** — DRF Agent view → LangGraph → FastMCP tools → `agent/servers/finance/services/` → `sync_to_async` → ORM

Both paths hit the same database, but via separate service layers. The MCP services are async-first; the REST services are sync (Django's standard).

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+ (for frontend)
- PostgreSQL (or SQLite for development)
- An [Anthropic API key](https://console.anthropic.com/)

### Backend Setup

```bash
# 1. Clone and enter the backend directory
git clone https://github.com/MehediHasan-75/ai_data_brain.git
cd ai_data_brain/backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env — minimum required:
#   SECRET_KEY=<run: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())">
#   ANTHROPIC_API_KEY=<your key>
#   DJANGO_SETTINGS_MODULE=expense_api.settings.development

# 5. Run migrations
python manage.py migrate

# 6. Create a superuser (optional, for admin)
python manage.py createsuperuser

# 7. Start the Django server
python manage.py runserver
# API is now at http://localhost:8000/api/
```

### MCP Dev Server (for testing tools in isolation)

```bash
cd backend
mcp dev expense_api/apps/agent/servers/finance/server.py
# Opens the MCP Inspector at http://localhost:5173/
# Use it to call tools directly without the LLM in the loop
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# Frontend at http://localhost:3000
```

---

## Project Structure

```
ai_data_brain/
├── backend/
│   ├── expense_api/
│   │   ├── settings/
│   │   │   ├── base.py          — shared settings (SECRET_KEY, middleware, apps)
│   │   │   ├── development.py   — SQLite, DEBUG=True
│   │   │   ├── production.py    — PostgreSQL, HTTPS security headers
│   │   │   └── testing.py       — in-memory SQLite
│   │   ├── apps/
│   │   │   ├── user_auth/       — JWT auth, UserProfile, friends system
│   │   │   │   ├── models.py
│   │   │   │   ├── authentication.py  — JWT encode/decode (uses SECRET_KEY)
│   │   │   │   ├── permission.py      — JWTAuthentication (reads from cookie)
│   │   │   │   ├── services.py        — AuthService, UserService
│   │   │   │   ├── views.py
│   │   │   │   └── urls.py
│   │   │   ├── FinanceManagement/   — dynamic tables, rows, columns, sharing
│   │   │   │   ├── models.py         — DynamicTableData, JsonTable, JsonTableRow
│   │   │   │   ├── managers.py       — for_user(), bulk_rename_key()
│   │   │   │   ├── services.py       — TableService, RowService, ColumnService, SharingService
│   │   │   │   ├── views.py
│   │   │   │   └── urls.py
│   │   │   └── agent/               — AI chat, LLM integration, MCP client
│   │   │       ├── models.py         — ChatSession, ChatMessage
│   │   │       ├── services.py       — ChatSessionService, AgentQueryService
│   │   │       ├── views.py          — AgentAPIView, streaming, chat session CRUD
│   │   │       ├── client/
│   │   │       │   ├── core/
│   │   │       │   │   └── local_client.py   — run_query(), stream_query()
│   │   │       │   ├── config/
│   │   │       │   │   └── providers.py      — LLMProvider (Anthropic/Gemini/DeepSeek)
│   │   │       │   └── prompts/
│   │   │       │       └── system.py         — system prompt (Bengali + English)
│   │   │       └── servers/
│   │   │           └── finance/
│   │   │               ├── mcp_instance.py   — FastMCP("finance_management")
│   │   │               ├── tools.py          — 10 @mcp.tool definitions
│   │   │               ├── resources.py      — schema://tables/{user_id}
│   │   │               ├── prompts.py        — prompt templates
│   │   │               ├── server.py         — entry point for `mcp dev`
│   │   │               └── services/
│   │   │                   ├── _base.py      — owns_table(), _current_user_id ContextVar
│   │   │                   ├── table_service.py
│   │   │                   ├── row_service.py
│   │   │                   ├── schema_service.py
│   │   │                   └── query_service.py
│   │   └── urls.py              — root URL config
│   └── requirements.txt
├── frontend/                    — Next.js 15 app
└── docs/                        — this documentation
    ├── authentication.md
    ├── database.md
    ├── finance-management.md
    ├── async-sync-django.md
    ├── mcp-server.md
    └── agent-client.md
```

---

## API Reference

### Authentication (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/register/` | No | Create account, receive JWT cookies |
| `POST` | `/login/` | No | Login, receive JWT cookies |
| `POST` | `/logout/` | Yes | Clear JWT cookies |
| `GET` | `/me/` | Yes | Get current user profile |
| `POST` | `/update/` | Yes | Change own password |
| `POST` | `/update-profile/` | Yes | Update email or username |
| `GET` | `/updateAcessToken/` | No | Rotate access token using refresh cookie |
| `GET` | `/users-list/` | Yes | Search users (paginated, 20/page) |
| `GET` | `/users-list/<user_id>/` | Yes | Get specific user |
| `GET` | `/friends/` | Yes | List your friends (bidirectional) |
| `POST` | `/friends/manage/` | Yes | Add or remove a friend |

### Finance (`/api/main/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tables/` | Yes | List all owned + shared tables |
| `POST` | `/create-tableContent/` | Yes | Create table with headers |
| `PUT` | `/tables/update/` | Yes | Update table name/description |
| `DELETE` | `/tables/<table_id>/` | Yes | Delete table and all rows |
| `GET` | `/table-contents/` | Yes | All table data (headers + rows) |
| `POST` | `/add-row/` | Yes | Insert a row (ownership verified) |
| `PATCH` | `/update-row/` | Yes | Update a row by ID |
| `POST` | `/delete-row/` | Yes | Delete a row by ID |
| `POST` | `/add-column/` | Yes | Add column, backfill existing rows |
| `POST` | `/delete-column/` | Yes | Remove column and strip from all rows |
| `POST` | `/edit-header/` | Yes | Rename a column |
| `POST` | `/share-table/` | Yes | Share/unshare with friends |

### Agent (`/api/agent/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/query/` | Yes | Send a query, get full response |
| `POST` | `/streaming/` | Yes | Send a query, stream tokens via NDJSON |
| `GET` | `/chat/sessions/` | Yes | List active chat sessions |
| `POST` | `/chat/sessions/` | Yes | Create a chat session |
| `GET` | `/chat/sessions/<session_id>/` | Yes | Get session details |
| `PUT` | `/chat/sessions/<session_id>/` | Yes | Update session (e.g., rename) |
| `DELETE` | `/chat/sessions/<session_id>/` | Yes | Soft-delete session |
| `GET` | `/chat/sessions/<session_id>/messages/` | Yes | Get all messages in session |
| `DELETE` | `/chat/sessions/<session_id>/messages/` | Yes | Clear all messages |
| `POST` | `/chat/sessions/<session_id>/messages/` | Yes | Save a message |
| `GET` | `/prompts/` | Yes | List available prompt templates |
| `POST` | `/prompts/<prompt_name>/` | Yes | Invoke a prompt template |

---

## Additional Documentation

| Document | What It Covers |
|----------|----------------|
| [`docs/authentication.md`](docs/authentication.md) | JWT lifecycle, HttpOnly cookies, custom auth backend, permission system, security model |
| [`docs/database.md`](docs/database.md) | Django ORM, models, JSON fields, managers, the 3-tier dynamic schema pattern |
| [`docs/finance-management.md`](docs/finance-management.md) | Tables/rows/columns API, service layer, ownership checks, sharing system |
| [`docs/async-sync-django.md`](docs/async-sync-django.md) | Why Django ORM is sync, `sync_to_async`, `async for`, the async/sync bridge pattern |
| [`docs/mcp-server.md`](docs/mcp-server.md) | What MCP is, FastMCP, tool parameters (the `Annotated` fix), resources, prompts |
| [`docs/agent-client.md`](docs/agent-client.md) | LangGraph ReAct agent, LLM providers, streaming, the full query lifecycle |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **Yes** | — | Django secret key. Generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`. Used for JWT signing and CSRF. |
| `DEBUG` | No | `False` | Set `True` in development. Controls cookie `secure` flag, error pages, and SQL logging. **Never `True` in production.** |
| `ALLOWED_HOSTS` | **Yes** | — | Comma-separated hostnames Django will serve. E.g., `localhost,127.0.0.1` |
| `DJANGO_SETTINGS_MODULE` | **Yes** | — | Which settings file to use. `expense_api.settings.development` or `expense_api.settings.production` |
| `ANTHROPIC_API_KEY` | **Yes** | — | Your Anthropic API key. Get it at [console.anthropic.com](https://console.anthropic.com) |
| `GOOGLE_API_KEY` | No | — | Required only if using Gemini as the LLM provider |
| `DEEPSEEK_API_KEY` | No | — | Required only if using DeepSeek as the LLM provider |
| `DB_ENGINE` | Prod only | — | `django.db.backends.postgresql` |
| `DB_NAME` | Prod only | — | PostgreSQL database name |
| `DB_USER` | Prod only | — | PostgreSQL username |
| `DB_PASSWORD` | Prod only | — | PostgreSQL password |
| `DB_HOST` | Prod only | — | PostgreSQL host |
| `DB_PORT` | Prod only | `5432` | PostgreSQL port |

---

## Troubleshooting / FAQ

**Q: The MCP server starts but tools always return "Access denied"**
The MCP server was not restarted after a code change. Tools are registered at import time — stop the `mcp dev` process with `Ctrl+C` and rerun it.

**Q: Integer parameters arrive as `0` in MCP tools**
You are using `param: int = Field(description="...")`. FastMCP passes `FieldInfo` as Pydantic's default, which coerces to `0`. Fix: use `param: Annotated[int, Field(description="...")]` (no default) or `param: Annotated[int, Field(description="...")] = default_value` for optional parameters. See [`docs/mcp-server.md`](docs/mcp-server.md).

**Q: `SynchronousOnlyOperation` error in async views**
You called a synchronous Django ORM method (`.get()`, `.filter()`, `.save()`) inside an `async def` view or tool without wrapping it. Use `await sync_to_async(lambda: ...)()` or the `aget()`/`asave()` async ORM methods. See [`docs/async-sync-django.md`](docs/async-sync-django.md).

**Q: `You cannot call this from an async context` error**
Same root cause as above — a related object (e.g., `json_table.table.table_name`) was accessed synchronously inside async code. Use `select_related("table")` in the original query so the related object is fetched eagerly in the same DB call.

**Q: JWT cookies are set but requests still return 401**
Check that `CORS_ALLOW_CREDENTIALS = True` is set and that your frontend sends `credentials: "include"` in fetch requests. Also verify `CSRF_TRUSTED_ORIGINS` includes your frontend URL.

**Q: `populate() has already been called` on server startup**
Django's `setup()` was called twice. Remove the `os.environ.setdefault` + `django.setup()` block from any file that isn't the entry point — `mcp_instance.py` already handles this correctly with the `if not apps.ready:` guard.
