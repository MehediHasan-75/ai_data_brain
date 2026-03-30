# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Setup

```bash
pip install -r requirements.txt
cp .env.example .env  # then fill in values
python manage.py migrate
python manage.py runserver
```

Set `DJANGO_SETTINGS_MODULE=expense_api.settings.development` in `.env`.

## Common Commands

```bash
python manage.py runserver           # Start dev server
python manage.py makemigrations      # Generate migrations
python manage.py migrate             # Apply migrations
python manage.py createsuperuser     # Create admin user
python manage.py shell               # Django shell
python verify_agent_refactoring.py   # Integration verification
```

There is no automated test suite; use `verify_agent_refactoring.py` and the Postman collection for integration testing.

## Architecture

**Django project:** `expense_api/` with three apps under `expense_api/apps/`:

### Apps

**`user_auth`** — JWT authentication with HttpOnly cookie-based token storage. Custom `UserProfile` extends Django's built-in `User` with a friends list. Refresh token rotation is enabled.

**`agent`** — AI chat system. Key layers:
- **Models:** `ChatSession` (per-user conversation threads) and `ChatMessage` (user/bot messages with `agent_data` JSON field for tool metadata)
- **Services:** `ChatSessionService`, `ChatMessageService`, `AgentQueryService` — business logic is kept out of views
- **MCP client** (`client/client.py`): async client that sends queries to Claude (Anthropic) or Gemini (Google) via LangChain's ReAct agent pattern with MCP tool adapters
- **MCP servers** (`servers/`): expose finance table operations as tools via the Model Context Protocol; `FinanceDataAnalyzer` handles semantic column/table matching

**`FinanceManagement`** — Dynamic spreadsheet-style tables stored as JSON. Three models: `DynamicTableData` (table metadata + sharing), `JsonTable` (headers as JSON list), `JsonTableRow` (row data as JSON object). Tables can be shared between users (friends list).

### URL Structure

```
/admin/           → Django admin
/api/auth/        → user_auth app
/api/agent/       → agent app (chat sessions, messages)
/api/main/        → FinanceManagement app (tables, rows, columns)
```

### Settings

Split settings in `expense_api/settings/`: `base.py` → `development.py` / `testing.py` / `production.py`. Select via `DJANGO_SETTINGS_MODULE` env var.

### Data Flow

```
Frontend (React @ localhost:3000)
    ↓
Django REST Framework (JWT auth via cookies)
    ├── Agent app → MCP Client → Claude/Gemini LLM + MCP tools → Finance tables
    └── FinanceManagement app → SQLite/PostgreSQL
```

### LLM / MCP Integration

- LangChain ReAct agent wraps Claude (`claude-sonnet-*`) or Gemini
- MCP servers expose finance operations as callable tools
- `client/mcpConfig.json` configures which MCP servers are available; `{BASE_DIR}` is resolved at runtime
- Streaming responses supported (see `streaming_response_example.py`)
