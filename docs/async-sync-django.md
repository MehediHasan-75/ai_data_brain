# Async & Sync Django — A Complete Guide

This document explains one of the trickiest parts of this codebase: why Django's ORM is synchronous, what happens when you try to use it in an async context, and the two patterns this project uses to bridge the gap.

---

## Table of Contents

- [The Big Picture](#the-big-picture)
- [Why Django's ORM Is Synchronous](#why-djangos-orm-is-synchronous)
- [What Goes Wrong Without the Bridge](#what-goes-wrong-without-the-bridge)
- [Django's Native Async ORM Methods](#djangos-native-async-orm-methods)
- [The async for Pattern](#the-async-for-pattern)
- [When Native Async Isn't Enough: sync_to_async](#when-native-async-isnt-enough-sync_to_async)
- [The Two Patterns Side by Side](#the-two-patterns-side-by-side)
- [Transaction Handling in Async Code](#transaction-handling-in-async-code)
- [The ContextVar Pattern for User Identity](#the-contextvar-pattern-for-user-identity)
- [async_to_sync: The Opposite Direction](#async_to_sync-the-opposite-direction)
- [Where Each Pattern Is Used in This Project](#where-each-pattern-is-used-in-this-project)
- [Common Errors and Fixes](#common-errors-and-fixes)

---

## The Big Picture

```
MCP Server (async world)          Django ORM (sync world)
        │                                   │
        │   Direct call? ✗ CRASH            │
        │                                   │
        │   aget() / asave() / adelete()     │
        │   ─────────────────────────────► │
        │   Async wrappers built into Django │
        │                                   │
        │   sync_to_async(fn)()              │
        │   ─────────────────────────────► │
        │   Run sync fn in thread pool      │
        │                                   │
```

The MCP server runs in an **async** event loop (asyncio). Django's ORM was built for **synchronous** Django views. You cannot call synchronous ORM methods directly inside async functions without a bridge. This document explains the bridge.

---

## Why Django's ORM Is Synchronous

Django was designed in 2005, years before Python's `asyncio` module existed (Python 3.4, 2014). The ORM makes synchronous database calls using `psycopg2` (PostgreSQL) or `sqlite3` — libraries that block the calling thread while waiting for the database.

```python
# This blocks the thread until the DB responds
user = User.objects.get(id=1)  # Thread waits here
```

In a synchronous Django view, that's fine — each request runs in its own thread. But in an async context (like our MCP server), there's only **one thread** managing many coroutines. If one coroutine blocks the thread, all other coroutines freeze too.

**Analogy:** Imagine a restaurant with one waiter (the event loop). If the waiter stands at one table waiting for a customer to decide for 5 minutes without doing anything else, all other tables go unserved. In async programming, a waiter never waits — they check in, take partial orders, and keep moving. A blocking database call is the waiter standing frozen.

Django added native async support starting in Django 3.1 (2020) and has been expanding it ever since. This project uses Django's async ORM where possible, and `sync_to_async` for operations that aren't yet natively async.

---

## What Goes Wrong Without the Bridge

If you call a synchronous ORM method inside an async function, Django raises:

```
django.core.exceptions.SynchronousOnlyOperation:
You cannot call this from an async context - use a thread or
sync_to_async.
```

This was the exact error that appeared before the fix in this codebase:

```python
# BROKEN — accessing a ForeignKey field lazily in async code
async def get_table_content(user_id, table_id):
    json_table = await JsonTable.objects.aget(pk=table_id)
    table_name = json_table.table.table_name  # ← CRASH: lazy FK access is sync!
```

The `json_table.table` attribute is a `ForeignKey` to `DynamicTableData`. Django fetches it lazily — the first time you access `.table`, it fires a synchronous SQL query. In an async context, that crashes.

**The fix:** Use `select_related("table")` so the FK is fetched eagerly in the same `aget()` call:

```python
# FIXED
json_table = await JsonTable.objects.select_related("table").aget(pk=table_id)
table_name = json_table.table.table_name  # already loaded, no extra query
```

---

## Django's Native Async ORM Methods

Django provides async versions of common queryset operations. They all start with `a`:

| Sync | Async | Description |
|------|-------|-------------|
| `.get()` | `.aget()` | Fetch single object, raises DoesNotExist if not found |
| `.save()` | `.asave()` | Save an instance to the database |
| `.delete()` | `.adelete()` | Delete an instance |
| `.create()` | `.acreate()` | Create and save a new instance |
| `.exists()` | `.aexists()` | Check if any matching rows exist |
| `.count()` | `.acount()` | Count matching rows |
| `.first()` | `.afirst()` | Fetch first matching row |
| `.update()` | `.aupdate()` | Bulk-update matching rows |

**Usage in this project:**

```python
# Fetch a user
user = await User.objects.aget(id=user_id)

# Check ownership
exists = await DynamicTableData.objects.filter(id=table_id, user_id=user_id).aexists()

# Update and save
table.table_name = "New Name"
await table.asave()

# Create a row
await JsonTableRow.objects.acreate(table=json_table, data=row_dict)

# Delete
await table.adelete()
```

These methods run the SQL query asynchronously — the event loop can process other coroutines while waiting for the database.

---

## The async for Pattern

To iterate a queryset asynchronously, Django provides `async for`. This replaces `for row in queryset:`.

```python
# SYNC version (cannot use in async context)
for row in json_table.rows.all():
    if str(row.data.get("id")) == str(row_id):
        row.delete()

# ASYNC version
async for row in json_table.rows.all():
    if str(row.data.get("id")) == str(row_id):
        await row.adelete()
        break
```

`async for` fetches rows from the database on demand without blocking the event loop. Each `next()` call yields the next row asynchronously.

**From `row_service.py` in this project:**

```python
async for row in json_table.rows.all():
    if str(row.data.get("id")) == str(row_id):
        await row.adelete()
        deleted = True
        break
```

**When to use `async for` vs `list()`:** If you need to iterate once, use `async for`. If you need random access or to pass the data to a function expecting a list, use `[item async for item in queryset]` (async list comprehension):

```python
tables = [t async for t in DynamicTableData.objects.filter(user=user)]
```

---

## When Native Async Isn't Enough: sync_to_async

Some operations can't yet be done with native async ORM calls. The most common case is **`transaction.atomic`**. There is no `async with transaction.aatomic()` for complex synchronous operations — Django's atomic blocks use thread-local state, which doesn't work across async context switches.

The solution: wrap the entire synchronous block in `sync_to_async()`. This runs the sync function in a **thread pool executor**, keeping the event loop free.

```python
from asgiref.sync import sync_to_async
from django.db import transaction

@staticmethod
async def add_table_column(user_id: int, table_id: int, header: str) -> str:
    # 1. Async ownership check (no transaction needed)
    if not await owns_table(table_id, user_id):
        return ResponseBuilder.error("Access denied", ...)

    # 2. Check for duplicate header (async)
    json_table = await JsonTable.objects.aget(pk=table_id)
    if header in json_table.headers:
        return ResponseBuilder.error("Column already exists", ...)

    # 3. Atomic multi-step operation — must be sync
    def _add_column_sync():
        with transaction.atomic():
            jt = JsonTable.objects.get(pk=table_id)  # sync .get()
            jt.headers = jt.headers + [header]
            jt.save()
            for row in jt.rows.all():  # sync iteration
                row.data[header] = None
                row.save()
            return jt.headers

    # 4. Run the sync block in a thread pool
    new_headers = await sync_to_async(_add_column_sync)()
```

**What happens under the hood:**

1. `sync_to_async(_add_column_sync)` creates an async-compatible wrapper.
2. When `await`ed, Django submits `_add_column_sync` to a thread pool.
3. The event loop continues serving other coroutines while the thread runs.
4. When the thread finishes, the result is passed back to the awaiting coroutine.

**Analogy:** It's like a restaurant manager (async event loop) handing off a complex special order to a back-kitchen chef (thread). The manager doesn't stand and watch — they keep working while the chef handles it. When the chef is done, they ring a bell and the manager delivers the result.

---

## The Two Patterns Side by Side

```python
# Pattern A: Native async ORM (preferred when available)
# Use for simple queries, single object operations
async def delete_table(user_id: int, table_id: int) -> str:
    if not await owns_table(table_id, user_id):          # aexists()
        return ResponseBuilder.error("Access denied", ...)

    table = await DynamicTableData.objects.aget(id=table_id)  # aget()
    await table.adelete()                                       # adelete()
    return ResponseBuilder.success(f"Table {table_id} deleted")


# Pattern B: sync_to_async wrapping transaction.atomic
# Use when you need multiple ORM operations in a single transaction
async def create_table(user_id: int, table_name: str, headers) -> str:
    user = await User.objects.aget(id=user_id)

    def _create_sync():
        with transaction.atomic():
            t = DynamicTableData.objects.create(
                table_name=table_name,
                user=user,
            )
            JsonTable.objects.create(table=t, headers=headers)
            return t

    table = await sync_to_async(_create_sync)()
    return ResponseBuilder.success("Table created", {"table_id": table.id})
```

**How to decide which pattern to use:**

| Situation | Pattern to use |
|-----------|---------------|
| Single `get`, `save`, `delete`, `create` | Native async (`.aget()`, `.asave()`, etc.) |
| Iterating a queryset | `async for` or `[x async for x in qs]` |
| Multiple operations in one transaction | `sync_to_async(_sync_fn)()` |
| Checking existence | `.aexists()` |

---

## Transaction Handling in Async Code

Django's `@transaction.atomic` decorator and `with transaction.atomic():` context manager use **thread-local storage** to track the current transaction. Thread-local storage doesn't work across async context switches — different parts of the same coroutine might run on different threads (or none).

**The wrong approach:**

```python
# THIS DOES NOT WORK in async code — transaction may not cover all operations
@transaction.atomic  # ← broken in async context
async def create_table(user_id, name, headers):
    t = await DynamicTableData.objects.acreate(...)
    await JsonTable.objects.acreate(table=t, ...)
```

**The correct approach:**

```python
# Wrap the sync transaction in sync_to_async
async def create_table(user_id, name, headers):
    def _sync():
        with transaction.atomic():
            t = DynamicTableData.objects.create(...)
            JsonTable.objects.create(table=t, ...)
            return t
    return await sync_to_async(_sync)()
```

The `sync_to_async` wrapper ensures all the synchronous ORM calls inside `_sync()` run in the **same thread**, which is required for `transaction.atomic()` to work correctly.

---

## The ContextVar Pattern for User Identity

The MCP server is async and handles multiple requests concurrently. A naive implementation might pass `user_id` as a parameter to every function:

```python
# Works but verbose — user_id threaded through every call
await TableService.get_user_tables(user_id)
await RowService.add_row(user_id, table_id, row_data)
```

This project uses a `ContextVar` — a variable that holds a different value for each async context (think: each request has its own copy):

```python
# In services/_base.py
import contextvars
_current_user_id: contextvars.ContextVar[int] = contextvars.ContextVar(
    "_current_user_id", default=1
)
```

Before the agent runs a query, the client sets the current user:

```python
# In local_client.py
def set_current_user(user_id: int) -> None:
    _current_user_id.set(user_id)
```

Then every service reads it from context:

```python
# In manager.py
class FinanceToolsManager:
    def _uid(self) -> int:
        return _current_user_id.get()

    async def get_user_tables(self) -> str:
        return await TableService.get_user_tables(self._uid())
```

**Why ContextVar instead of a global variable?** A global variable would be shared across all requests. Request A sets `user_id=3`, then request B sets it to `user_id=7`, and now request A accidentally acts as user 7. `ContextVar` gives each concurrent async task its own isolated value — no request can overwrite another's user context.

**The security guarantee:** The LLM never sees or controls `user_id`. It's set programmatically by `set_current_user(request.user.id)` before the agent starts. Even if an attacker crafted a malicious query like "delete all tables for user 999", the LLM has no tool parameter for `user_id` — the actual user is always read from the server-side context.

---

## async_to_sync: The Opposite Direction

Sometimes you need to call async code from a synchronous context. The `AgentQueryService` in `services.py` does this:

```python
from asgiref.sync import async_to_sync

class AgentQueryService:
    @staticmethod
    def process_query(query_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process agent query synchronously."""
        # Calls the async function from sync code
        response = async_to_sync(AgentQueryService.process_query_async)(query_data)
        return AgentQueryService._clean_response(response)
```

`async_to_sync(fn)` creates a synchronous wrapper that:
1. Creates a new event loop (or uses an existing one if available).
2. Runs the async function to completion.
3. Returns the result.

**When you'd use this:** Django REST Framework views are synchronous by default. If you need to call an async function from a DRF view, `async_to_sync` is the bridge in the other direction.

---

## Where Each Pattern Is Used in This Project

| File | Pattern | Why |
|------|---------|-----|
| `services/table_service.py` — `get_user_tables` | `async for` + `select_related` | Iterating tables with related data |
| `services/table_service.py` — `create_table` | `sync_to_async` + `transaction.atomic` | Two creates must be atomic |
| `services/table_service.py` — `delete_table` | `aget()` + `adelete()` | Simple single-object delete |
| `services/row_service.py` — `add_table_row` | `aget()` + `acreate()` | Simple two-step with no transaction needed |
| `services/row_service.py` — `delete_table_row` | `async for` + `adelete()` | Iterating to find the row by logical ID |
| `services/schema_service.py` — `add_table_column` | `sync_to_async` + `transaction.atomic` | Header + all rows must update atomically |
| `services/schema_service.py` — `delete_table_columns` | `sync_to_async` + `transaction.atomic` | Same — atomic multi-object update |
| `agent/services.py` — `process_query` | `async_to_sync` | Calling async agent from sync DRF view |

---

## Common Errors and Fixes

### SynchronousOnlyOperation

```
django.core.exceptions.SynchronousOnlyOperation:
You cannot call this from an async context - use a thread or sync_to_async.
```

**Cause:** You called a sync ORM method (`.get()`, `.save()`, `.filter()`, etc.) directly in an `async def` function.

**Fix:** Replace with the async equivalent (`.aget()`, `.asave()`) or wrap in `sync_to_async`.

---

### Lazy ForeignKey Access in Async Context

```
SynchronousOnlyOperation: ...
```

**Cause:** Accessing a ForeignKey field that wasn't fetched yet triggers a lazy sync query.

```python
# BROKEN
json_table = await JsonTable.objects.aget(pk=table_id)
name = json_table.table.table_name  # lazy FK load → crash!
```

**Fix:** Use `select_related` to load the FK eagerly in the initial query.

```python
# FIXED
json_table = await JsonTable.objects.select_related("table").aget(pk=table_id)
name = json_table.table.table_name  # already loaded, no extra query
```

---

### Transaction Not Applied

**Cause:** Using `@transaction.atomic` on an `async def` function. The decorator runs, but thread-local transaction tracking breaks across async context switches.

**Fix:** Move the ORM operations into a nested sync function and wrap with `sync_to_async`:

```python
async def my_operation():
    def _sync():
        with transaction.atomic():
            # All sync ORM calls here
            pass
    await sync_to_async(_sync)()
```

---

### RuntimeError: no running event loop

**Cause:** Calling `async_to_sync` from code that's already inside an event loop.

**Fix:** Use `await` directly instead of `async_to_sync`. Only use `async_to_sync` from truly synchronous code (no event loop running).
