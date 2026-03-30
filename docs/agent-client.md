# Agent & Client — A Complete Guide

This document covers the AI query system: how user messages travel from the Django view to the LLM, how the LangGraph ReAct agent works, how streaming responses are delivered, and how LLM providers are configured.

---

## Table of Contents

- [The Big Picture](#the-big-picture)
- [How a Query Flows Through the System](#how-a-query-flows-through-the-system)
- [The LangGraph ReAct Agent](#the-langgraph-react-agent)
  - [What Is ReAct?](#what-is-react)
  - [The Agent Singleton](#the-agent-singleton)
  - [The Recursion Limit](#the-recursion-limit)
  - [The Circuit Breaker](#the-circuit-breaker)
- [User Identity Security](#user-identity-security)
- [LLM Provider System](#llm-provider-system)
  - [Supported Providers](#supported-providers)
  - [How to Switch Providers](#how-to-switch-providers)
- [The System Prompt](#the-system-prompt)
- [Streaming Responses](#streaming-responses)
  - [How Server-Sent Events Work](#how-server-sent-events-work)
  - [Event Types](#event-types)
- [Chat Sessions and Messages](#chat-sessions-and-messages)
- [Prompt Templates](#prompt-templates)
- [REST API Endpoints Reference](#rest-api-endpoints-reference)
- [Request & Response Examples](#request--response-examples)
- [Common Issues](#common-issues)

---

## The Big Picture

```
User types: "Add an expense of 500 taka for lunch today"
         │
         ▼
POST /api/agent/query/
AgentAPIView (Django async view)
         │  validates, extracts request.user.id
         ▼
run_query(query, user_id, llm_provider, llm_model)
         │  sets _current_user_id ContextVar
         │  gets agent singleton (or builds it)
         ▼
LangGraph ReAct agent (LLM + 10 tools)
         │
         │  LLM thinks: "I need to find the right table, then add a row"
         │
         ├─► get_user_tables() → [{"id": 7, "name": "Monthly Expenses", ...}]
         │
         │  LLM thinks: "Table 7 looks right. Now I'll add the row."
         │
         ├─► add_table_row(table_id=7, row_data={"Date": "2026-03-30", "Amount": "500", ...})
         │   → {"success": true, "message": "Row added successfully", ...}
         │
         │  LLM generates final response:
         │  "Done! I've added your 500 taka lunch expense to 'Monthly Expenses' (table 7)."
         │
         ▼
Response back to user
```

The LLM is like a smart assistant that can read and write your spreadsheets. You talk to it in natural language; it decides which tools to use and in what order to fulfill your request.

---

## How a Query Flows Through the System

### Step 1: View receives the request

```python
# views.py
class AgentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def post(self, request):
        serializer = QuerySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        data = serializer.validated_data
        result = await run_query(
            query=data["query"],
            user_id=request.user.id,      # from JWT, never from request body
            llm_provider=data.get("llm_provider", "anthropic"),
            llm_model=data.get("llm_model", "claude-sonnet-4-6"),
        )
        return Response(_clean_response(result))
```

The view is async (`async def post`) because the entire agent call chain is async. Django supports async views in ASGI mode.

### Step 2: run_query sets context and invokes the agent

```python
# local_client.py
async def run_query(query, user_id, llm_provider, llm_model) -> Dict[str, Any]:
    set_current_user(user_id)          # bind user_id to this async context
    agent = get_agent(llm_provider, llm_model)

    response = await agent.ainvoke(
        {"messages": query},
        {"recursion_limit": 15},       # max 15 reasoning steps
    )
    # ... extract final message, apply circuit breaker
    return {"success": True, "response": final_message_content}
```

### Step 3: Agent reasons and calls tools

LangGraph's `create_react_agent` runs a loop:
1. LLM receives the user's message + available tools + system prompt.
2. LLM produces either a `tool_call` (with arguments) or a final text response.
3. If `tool_call`: run the tool, append the result as a tool message, go back to step 1.
4. If final text: return it.

### Step 4: Response is cleaned and returned

```python
def _clean_response(response_obj):
    text = str(response_obj.get("response") or ...)
    # Strip "Step 1: ..." prefixes that some models add
    text = re.sub(r"^Step \d+:.*\n?", "", text, flags=re.MULTILINE).strip()
    return {"response": text, "success": response_obj.get("success", True)}
```

---

## The LangGraph ReAct Agent

### What Is ReAct?

**ReAct** (Reasoning + Acting) is an agent pattern where the LLM alternates between thinking and taking actions. A normal LLM just produces text given an input. A ReAct agent can:

1. **Think:** "The user wants to see their expenses. I should first list their tables to find the right one."
2. **Act:** Call `get_user_tables()`.
3. **Observe:** See the result: `[{"id": 7, "name": "Monthly Expenses"}]`.
4. **Think:** "Table 7 is called Monthly Expenses. That's probably it."
5. **Act:** Call `get_table_content(table_id=7)`.
6. **Observe:** See all the rows.
7. **Respond:** Write a summary to the user.

Without ReAct, the LLM would have to guess everything in one shot. With ReAct, it can be methodical and correct.

**Analogy:** ReAct is like a detective. A bad detective guesses who did it without investigating. A ReAct detective checks clues one at a time (`get_user_tables`), forms a hypothesis, gathers more evidence (`get_table_content`), and only concludes when they have all the facts.

### The Agent Singleton

```python
_agent = None

def get_agent(llm_provider="anthropic", llm_model="claude-sonnet-4-6"):
    global _agent
    if _agent is None:
        api_key = os.getenv(f"{llm_provider.upper()}_API_KEY")
        llm = LLMProvider.create_provider(llm_provider, api_key, llm_model).get_client()
        _agent = create_react_agent(llm, TOOLS, prompt=SYSTEM_PROMPT)
    return _agent
```

The agent is created once and reused for all subsequent requests. This is called the **singleton pattern**. Creating an LLM client on every request would be slow (API client initialization, loading credentials, etc.). The singleton avoids that overhead.

**Important note:** The agent singleton is stateless with respect to user data. It doesn't store which user is making the request — that's handled by the `ContextVar` (`_current_user_id`), which is set fresh before each request. Different concurrent requests get different ContextVar values even though they share the same agent object.

### The Recursion Limit

```python
response = await agent.ainvoke(
    {"messages": query},
    {"recursion_limit": 15},
)
```

LangGraph will run at most 15 reasoning steps. This prevents infinite loops. If the agent is still going after 15 steps (e.g. a tool keeps failing and the LLM keeps retrying), LangGraph stops and returns whatever it has.

A typical query takes 2–5 steps. Complex multi-table operations might take 8–10.

### The Circuit Breaker

```python
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
```

If the same tool fails three times in a row (e.g. the table doesn't exist and the LLM keeps trying), the circuit breaker trips and returns a user-friendly error. Without this, the agent would consume all 15 recursion steps hammering a broken tool, wasting time and API tokens.

---

## User Identity Security

This is the most important security property of the agent system: **the LLM never knows, sees, or controls which user's data it's operating on.**

**How it works:**

1. `AgentAPIView` extracts `request.user.id` from the JWT cookie (set by `JWTAuthentication`, never from the request body).
2. `run_query` calls `set_current_user(user_id)`, which sets `_current_user_id.set(user_id)` in the current async context.
3. Every tool wraps a `FinanceToolsManager` method, which reads `_current_user_id.get()` to find the user.
4. Service methods call `owns_table(table_id, user_id)` before any mutation.

```python
# In manager.py
class FinanceToolsManager:
    def _uid(self) -> int:
        return _current_user_id.get()   # never from LLM input

    async def delete_table(self, table_id: int) -> str:
        return await TableService.delete_table(self._uid(), table_id)
```

**What this prevents:** An attacker can't prompt the LLM to act on another user's data. Even if a malicious query says "delete all tables for user 999", the LLM has no parameter to set user identity — the actual user is always read from the server-side context, which was set to the authenticated user's ID by the view.

**The `user_id` parameter in `tools.py`:** The tool functions do have a `user_id` parameter with `Field(exclude=True)`. This hides it from the LLM's tool schema — the LLM doesn't know the parameter exists. In the in-process path, this parameter is never used; `_uid()` is called instead. It exists as documentation of the intent.

---

## LLM Provider System

The system supports three LLM providers. The architecture uses the **Strategy pattern** — each provider is a class that knows how to build the right LangChain client.

```python
class LLMProvider:
    @staticmethod
    def create_provider(provider: str, api_key: str, model: str) -> "LLMProvider":
        if provider == "anthropic":
            return AnthropicProvider(LLMConfig(...))
        if provider == "google":
            return GoogleProvider(LLMConfig(...))
        if provider == "deepseek":
            return DeepSeekProvider(LLMConfig(...))
        raise ValueError(f"Unsupported LLM provider: {provider}")
```

Each provider class returns a LangChain-compatible `ChatModel` via `.get_client()`. LangGraph's `create_react_agent` works with any LangChain chat model, so switching providers requires no changes to the agent logic.

### Supported Providers

| Provider | Default Model | Environment Variable | LangChain Package |
|----------|--------------|---------------------|-------------------|
| `anthropic` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` | `langchain-anthropic` |
| `google` | `gemini-2.0-flash` | `GOOGLE_API_KEY` | `langchain-google-genai` |
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` | `langchain-deepseek` |

**Temperature is always 0.** The agent needs to be deterministic and precise. Setting temperature to 0 makes the LLM pick the most likely token at each step rather than sampling randomly. You want predictable behavior when the LLM is writing structured tool arguments.

### How to Switch Providers

Send the `llm_provider` and `llm_model` fields in your request:

```json
{
  "query": "Show me my tables",
  "llm_provider": "google",
  "llm_model": "gemini-2.0-flash"
}
```

If omitted, the defaults are `anthropic` and `claude-sonnet-4-6`.

**Important:** The agent singleton is built on first use. If you send a request with `anthropic`, the singleton is built with `ChatAnthropic`. A later request with `llm_provider: "google"` will still use the `ChatAnthropic` singleton because `_agent is not None`. To use a different provider, the server process must be restarted. (This is a known limitation — the singleton would need to be keyed by `(provider, model)` to support runtime switching.)

---

## The System Prompt

The system prompt is injected into every agent session to shape the LLM's behavior:

```python
SYSTEM_PROMPT = """
You are a personal data management assistant. The user's identity is already verified by the
system — never ask for it and never expose it.

## How to respond
- Be concise. Confirm what you did, not what you are about to do.
- When you create or modify data, always tell the user the table name and ID so they can
  reference it in follow-up requests.
- If the user's request is ambiguous (e.g. "my expenses"), call get_user_tables first to find
  the best match rather than guessing.

## Language
- Understand Bengali, English, and mixed queries.
  Common shorthands: ajk = today, gotokal = yesterday, এই মাস = this month.
- Always reply in the same language the user wrote in.

## Data integrity
- Never delete a table or column without confirming with the user first.
- When adding rows, map the user's words to the correct column names — do not invent new columns.
"""
```

**Key design decisions in the system prompt:**

1. **"Never ask for user identity"** — The LLM doesn't need it; the server provides it securely.
2. **"Confirm what you did, not what you are about to do"** — Avoids verbose "I'm going to..." prefixes; just reports the result.
3. **"If ambiguous, call get_user_tables first"** — Prevents hallucinating table names. The LLM is told to look before it acts.
4. **Bengali/English bilingual** — The system handles mixed-language inputs. `ajk` = today in Bengali colloquial. The LLM replies in the same language the user used.
5. **"Never delete without confirming"** — A safety net for destructive operations. Even if the user says "delete my expenses", the LLM should ask "Are you sure?" first.

---

## Streaming Responses

For real-time feedback (typing indicator, token-by-token output), the streaming endpoint delivers events as they happen using **NDJSON** (Newline-Delimited JSON) over a `StreamingHttpResponse`.

```python
# views.py
class AgentStreamingAPIView(APIView):
    async def post(self, request):
        user_id = request.user.id

        async def event_generator():
            async for event in stream_query(query, user_id, llm_provider, llm_model):
                yield json.dumps(event) + "\n"  # one JSON object per line

        return StreamingHttpResponse(event_generator(), content_type="application/x-ndjson")
```

### How Server-Sent Events Work

NDJSON streaming works like this:

1. The HTTP connection stays open after the response headers are sent.
2. The server sends one JSON object per line as events occur.
3. The client reads the stream line by line and processes each event.
4. When the server is done, it closes the connection.

```
← HTTP/1.1 200 OK
← Content-Type: application/x-ndjson
←
← {"type": "tool_start", "tool": "get_user_tables"}
← {"type": "tool_end", "tool": "get_user_tables"}
← {"type": "token", "content": "I found"}
← {"type": "token", "content": " 3 tables"}
← {"type": "token", "content": " in your account."}
← {"type": "done", "response": "I found 3 tables in your account."}
```

The frontend can use this to show:
- A "thinking" indicator when `tool_start` arrives
- Token-by-token text output as `token` events arrive
- Clean final response when `done` arrives

### Event Types

```python
# local_client.py — stream_query()
async for event in agent.astream_events({"messages": query}, ..., version="v2"):
    kind = event["event"]

    if kind == "on_chat_model_stream":
        # Partial LLM token output
        yield {"type": "token", "content": chunk.content}

    elif kind == "on_tool_start":
        # A tool is being invoked
        yield {"type": "tool_start", "tool": event["name"]}

    elif kind == "on_tool_end":
        # A tool finished
        yield {"type": "tool_end", "tool": event["name"]}

    elif kind == "on_chain_end" and event.get("name") == "LangGraph":
        # The agent has finished — send the final response
        yield {"type": "done", "response": msgs[-1].content}
```

| Event type | When it fires | Fields |
|------------|--------------|--------|
| `tool_start` | Agent is about to call a tool | `tool`: tool name |
| `tool_end` | Tool call completed | `tool`: tool name |
| `token` | LLM generated a text chunk | `content`: partial text |
| `done` | Agent finished | `response`: complete final text |

---

## Chat Sessions and Messages

The agent app includes a full chat history system so users can have persistent conversations.

### Models

**`ChatSession`** — A named conversation thread per user:
- `session_id` — UUID, used as URL parameter
- `user` — ForeignKey to Django User
- `title` — Display name for the session
- `is_active` — Soft delete flag
- `created_at`, `updated_at` — Timestamps

**`ChatMessage`** — A single message in a session:
- `message_id` — UUID
- `chat_session` — ForeignKey to ChatSession
- `user` — ForeignKey to Django User
- `text` — The message content
- `sender` — `"user"` or `"bot"`
- `agent_data` — JSONField storing tool call metadata and LLM response details
- `timestamp` — When the message was created

### How the Frontend Uses This

The frontend manages messages independently:
1. User sends a query → `POST /api/agent/query/` (or streaming endpoint).
2. Agent responds.
3. Frontend saves both messages → `POST /api/agent/sessions/{id}/messages/save/`.

This separation means the chat UI doesn't wait for persistence before showing the response. The agent query and the message save are independent operations.

---

## Prompt Templates

Beyond free-form queries, the agent supports **named prompt templates** — predefined workflows with parameters.

**Listing available templates:**

```http
GET /api/agent/prompts/
```

**Response:**
```json
{
  "prompts": [
    {"name": "new_expense_table", "description": "Create a standard monthly expense tracking table"},
    {"name": "summarise_table", "description": "Fetch a table and produce a human-readable summary"},
    {"name": "import_csv_rows", "description": "Parse raw CSV text and insert each line as a row"}
  ]
}
```

**Invoking a template:**

```http
POST /api/agent/prompts/new_expense_table/invoke/
Content-Type: application/json

{
  "month": "March",
  "year": "2026"
}
```

The view renders the template with the provided parameters and passes the result to `run_query()`. The LLM receives a precise, fully-formed instruction — not the user's raw query — ensuring consistent behavior every time the template is used.

---

## REST API Endpoints Reference

All endpoints live under `/api/agent/` and require authentication.

### Query Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/api/agent/query/` | Send a query, get a single response |
| `POST` | `/api/agent/query/stream/` | Send a query, get streaming NDJSON events |
| `GET` | `/api/agent/query/` | Health check — returns `{user_id, status: "active"}` |

### Chat Session Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/api/agent/sessions/` | List all active sessions for the current user |
| `POST` | `/api/agent/sessions/` | Create a new chat session |
| `GET` | `/api/agent/sessions/{session_id}/` | Get session details |
| `PUT` | `/api/agent/sessions/{session_id}/` | Update session title or status |
| `DELETE` | `/api/agent/sessions/{session_id}/` | Soft-delete a session (sets `is_active=False`) |
| `GET` | `/api/agent/sessions/{session_id}/messages/` | Get all messages in a session |
| `DELETE` | `/api/agent/sessions/{session_id}/messages/` | Clear all messages in a session |
| `POST` | `/api/agent/sessions/{session_id}/messages/save/` | Save a message to a session |

### Prompt Template Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/api/agent/prompts/` | List all available prompt templates |
| `POST` | `/api/agent/prompts/{name}/invoke/` | Invoke a named prompt template |

---

## Request & Response Examples

### Standard Query

**Request:**
```http
POST /api/agent/query/
Content-Type: application/json

{
  "query": "Add my lunch expense of 350 taka to my expenses table",
  "llm_provider": "anthropic",
  "llm_model": "claude-sonnet-4-6"
}
```

**Response:**
```json
{
  "response": "Done! I've added your 350 taka lunch expense to 'Monthly Expenses' (table 7) for today, March 30, 2026.",
  "success": true
}
```

---

### Streaming Query

**Request:**
```http
POST /api/agent/query/stream/
Content-Type: application/json

{"query": "Show me my tables"}
```

**Response stream (NDJSON):**
```
{"type": "tool_start", "tool": "get_user_tables"}
{"type": "tool_end", "tool": "get_user_tables"}
{"type": "token", "content": "You have"}
{"type": "token", "content": " 2 tables:"}
{"type": "token", "content": "\n- Monthly Expenses (ID: 7)"}
{"type": "token", "content": "\n- Savings Goals (ID: 12)"}
{"type": "done", "response": "You have 2 tables:\n- Monthly Expenses (ID: 7)\n- Savings Goals (ID: 12)"}
```

---

### Create Chat Session

**Request:**
```http
POST /api/agent/sessions/
Content-Type: application/json

{"title": "March 2026 Expenses"}
```

**Response (201):**
```json
{
  "message": "Chat session created successfully.",
  "data": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "March 2026 Expenses",
    "is_active": true,
    "created_at": "2026-03-30T10:00:00Z"
  }
}
```

---

## Common Issues

### Agent always responds about a different user's data

**Cause:** `_current_user_id` was not set before the agent ran.

**Fix:** Ensure `set_current_user(user_id)` is called inside `run_query()` before `agent.ainvoke()`. Check that `request.user.id` is being passed correctly from the view.

### "Missing environment variable: ANTHROPIC_API_KEY"

**Cause:** The API key for the selected provider is not in the environment.

**Fix:** Add the appropriate key to your `.env` file:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
DEEPSEEK_API_KEY=...
```

### LLM keeps calling tools in a loop

**Cause:** A tool keeps returning an error and the LLM keeps retrying. The circuit breaker should stop this after 3 consecutive errors.

**Fix:** Check the tool's return value. If it's always returning an error, debug the underlying service method. The circuit breaker is at 3 consecutive errors — if the LLM alternates between a good tool call and a bad one, it won't trip.

### Streaming endpoint returns empty chunks

**Cause:** The ASGI server (Daphne, Uvicorn) may not be configured for streaming responses, or the `Content-Type: application/x-ndjson` header isn't being passed through a proxy.

**Fix:** Ensure you're running Django in ASGI mode (`ASGI_APPLICATION = "expense_api.asgi.application"`). If using Nginx as a proxy, disable buffering: `proxy_buffering off;`.

### Agent gives a different response in Bengalk than English

**Expected behavior:** The system prompt instructs the LLM to reply in the same language the user wrote in. If you ask in Bengali, you get Bengali back. Mixed Bengali/English input is handled too — common shorthands like `ajk` (today) and `gotokal` (yesterday) are understood.
