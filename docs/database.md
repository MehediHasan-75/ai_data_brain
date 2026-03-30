# Database Layer — A Complete Guide

This document explains every database concept used in this Django project: how models are structured, why JSON fields are used for dynamic data, how the ORM translates Python into SQL, and how custom managers clean up repetitive query code.

---

## Table of Contents

- [The Big Picture](#the-big-picture)
- [Django ORM 101: Python Objects as Database Rows](#django-orm-101)
- [The 3-Tier Dynamic Schema Pattern](#the-3-tier-dynamic-schema-pattern)
- [Model Reference](#model-reference)
- [JSON Fields: When Your Schema Changes at Runtime](#json-fields)
- [Relationships: ForeignKey, OneToOne, ManyToMany](#relationships)
- [The `on_delete` Options Explained](#the-on_delete-options-explained)
- [Custom Managers: Reusable Query Logic](#custom-managers)
- [Indexing: Why Some Fields Have `db_index=True`](#indexing)
- [Auto Timestamps: `auto_now_add` and `auto_now`](#auto-timestamps)
- [Querying with Q Objects: OR Conditions](#querying-with-q-objects)
- [The `select_related` and `prefetch_related` Performance Tools](#select_related-and-prefetch_related)
- [Transactions: All or Nothing](#transactions)

---

## The Big Picture

Think of the database layer as a translator:

```
Your Python Code
       │
       │  user.profile.friends.all()
       ▼
  Django ORM  (translates Python → SQL)
       │
       │  SELECT auth_user.* FROM auth_user
       │  JOIN user_auth_userprofile_friends
       │  WHERE user_auth_userprofile_friends.from_userprofile_id = 1
       ▼
  PostgreSQL / SQLite  (executes SQL, returns rows)
       │
       ▼
  Python objects  (Django wraps each row in a User instance)
```

You write Python. Django writes SQL. The database runs it. Django wraps the results back into Python objects. You never need to write raw SQL for standard operations.

---

## Django ORM 101

### Models Are Classes, Rows Are Instances

Every database table is a Python class that inherits from `django.db.models.Model`. Every row in that table is an instance of that class.

```python
# models.py — defines the table structure
class DynamicTableData(models.Model):
    table_name = models.CharField(max_length=255)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_tables')
    created_at = models.DateTimeField(auto_now_add=True)
```

```python
# Creating a row (INSERT INTO)
table = DynamicTableData.objects.create(table_name="My Expenses", user=request.user)

# Reading a row (SELECT WHERE id = ...)
table = DynamicTableData.objects.get(id=5)

# Updating a row (UPDATE SET ...)
table.table_name = "Monthly Budget"
table.save()

# Deleting a row (DELETE WHERE id = ...)
table.delete()
```

### `objects` Is the QuerySet Manager

`DynamicTableData.objects` is the **manager** — a Python object that lives on the class (not on instances) and gives you query methods. Every model gets a default manager named `objects` automatically. You can also add custom managers (see [Custom Managers](#custom-managers)).

### Lazy Evaluation: Queries Don't Run Until You Need the Data

```python
# This does NOT hit the database yet
qs = DynamicTableData.objects.filter(user=request.user)

# The database is queried here (when you iterate)
for table in qs:
    print(table.table_name)

# Or here (when you convert to a list)
tables = list(qs)

# Or here (when you access a single item)
first = qs.first()
```

This is called **lazy evaluation**. Django builds up a description of the query in Python, and only executes it when you actually need the data. It means you can chain `.filter()`, `.order_by()`, `.select_related()` etc. without hitting the database multiple times.

---

## The 3-Tier Dynamic Schema Pattern

Traditional relational databases require you to define your columns upfront. Want to add a column? Write a migration, deploy it, wait. This project solves that with three models that together form a flexible spreadsheet:

```
Tier 1: DynamicTableData — the "spreadsheet file"
  table_name: "Monthly Expenses"
  user: Alice
  description: "Tracking all expenses"
  is_shared: False

Tier 2: JsonTable — the "column header row"
  table: → DynamicTableData (above)
  headers: ["Date", "Category", "Amount", "Notes"]
           ↑ A Python list stored as JSON in the database

Tier 3: JsonTableRow — each "data row"
  table: → JsonTable (above)
  data: {"Date": "2026-03-01", "Category": "Rent", "Amount": 25000, "Notes": ""}
        ↑ A Python dict stored as JSON in the database
```

**Why this works for dynamic schemas:**
- Adding a new column = append to `JsonTable.headers` + add a key to each existing `JsonTableRow.data`
- No `ALTER TABLE`. No migration. Runs in under 100ms.
- The LLM can create any structure the user asks for without knowing about it upfront.

**The trade-offs:**
- No relational integrity between column names and row keys — a typo in a row key won't fail with a DB error
- You can't do efficient `WHERE data->>'Amount' > 1000` queries at scale (though PostgreSQL's JSONField supports this)
- Sorting and filtering across rows requires Python-side logic or JSONField lookups

---

## Model Reference

### `DynamicTableData` — The Table Container

| Field | Type | Purpose |
|-------|------|---------|
| `table_name` | CharField(255) | The human name: "Monthly Expenses", "Client List". Shown in the UI. |
| `user` | ForeignKey → User | The owner. Every query that lists tables filters by this. |
| `shared_with` | ManyToManyField → User | Other users who can see (but not own) this table. |
| `description` | TextField | Optional longer explanation of what the table tracks. |
| `pending_count` | IntegerField | Counter for pending operations. Defaults to `0`. |
| `is_shared` | BooleanField | Quick flag: is this table currently shared with anyone? Avoids a `.count()` query just to show a sharing icon in the UI. |
| `created_at` | DateTimeField(auto_now_add) | Set once at creation, never changes. |
| `modified_at` | DateTimeField(auto_now) | Updated every time `.save()` is called. |

### `JsonTable` — The Header Row

| Field | Type | Purpose |
|-------|------|---------|
| `table` | OneToOneField → DynamicTableData (primary_key=True) | This is both the foreign key AND the primary key. There is exactly one `JsonTable` per `DynamicTableData`. |
| `headers` | JSONField | A list of strings: `["Date", "Category", "Amount"]`. |

**Why `primary_key=True` on the OneToOneField?**
Normally a model gets an auto-generated `id` integer as its primary key. By setting `primary_key=True` on the `table` field, `JsonTable`'s primary key IS the `DynamicTableData` id. This means `JsonTable.objects.get(pk=5)` and `DynamicTableData.objects.get(pk=5)` refer to the same logical entity. It also eliminates a useless second integer column.

### `JsonTableRow` — Each Data Row

| Field | Type | Purpose |
|-------|------|---------|
| `table` | ForeignKey → JsonTable | Which table this row belongs to. |
| `data` | JSONField | A dict: `{"Date": "2026-03-01", "Amount": 500, "id": "abc123"}`. The `id` key is a short random hex string stored inside the JSON — not the database row ID. |

**Why store an `id` inside `data`?**
Rows are identified by the value inside their JSON `data`, not by the database integer `id`. This is because the LLM works with row IDs like `"45ec8494"` — opaque strings that don't reveal database internals. The service looks up rows with `rows.get(data__id=row_id)` which uses Django's JSONField key lookup syntax.

### `UserProfile` — Extended User Data

| Field | Type | Purpose |
|-------|------|---------|
| `user` | OneToOneField → User | Links to Django's built-in `auth_user` table. |
| `friends` | ManyToManyField → User | The friends list. Stored in an auto-generated join table. |
| `created_at` | DateTimeField(auto_now_add) | Profile creation time. |
| `updated_at` | DateTimeField(auto_now) | Last modification. |

### `ChatSession` — A Conversation Thread

| Field | Type | Purpose |
|-------|------|---------|
| `user` | ForeignKey → User | Owner of this conversation. |
| `session_id` | CharField(unique) | UUID string used in URLs. Not the database `id`. |
| `title` | CharField | Shown in the conversation list. |
| `is_active` | BooleanField | Soft-delete flag. `False` = "deleted" but still in DB. |

**Indexes on `ChatSession`:**
```python
class Meta:
    indexes = [
        models.Index(fields=['user', '-updated_at']),  # list sessions by user, newest first
        models.Index(fields=['session_id']),             # URL lookups
        models.Index(fields=['user', 'is_active']),      # filter active sessions per user
    ]
```

These composite indexes are carefully chosen. `['user', '-updated_at']` is the index that powers the session list page — it can look up "all sessions for user X, ordered newest first" in a single index scan.

### `ChatMessage` — A Single Message

| Field | Type | Purpose |
|-------|------|---------|
| `chat_session` | ForeignKey → ChatSession | Which session this belongs to. |
| `user` | ForeignKey → User | Who sent it (even bot messages reference the user whose session it's in). |
| `message_id` | CharField(unique) | Client-generated UUID so the frontend can detect duplicates before saving. |
| `text` | TextField | The actual message content. |
| `sender` | CharField(choices) | `"user"` or `"bot"`. |
| `agent_data` | JSONField | Tool call metadata — which MCP tools were called, their inputs/outputs. Optional. |

---

## JSON Fields

### What Is a JSONField?

`models.JSONField()` tells Django: "store this Python value as JSON text in the database, and automatically convert it back to Python when you read it."

```python
# Setting a JSON field
json_table.headers = ["Date", "Category", "Amount"]
json_table.save()
# Database stores: '["Date", "Category", "Amount"]'

# Reading it back
headers = json_table.headers
# headers is a Python list: ['Date', 'Category', 'Amount']
```

No manual `json.dumps()` or `json.loads()` needed. Django handles serialization automatically.

### Querying Inside JSON

Django lets you filter on JSON field contents using double-underscore key paths:

```python
# Find a row by its embedded id
row = JsonTableRow.objects.get(data__id="45ec8494")
# Generates: WHERE data->>'id' = '45ec8494' (PostgreSQL)

# Find rows where Amount > 1000
rows = JsonTableRow.objects.filter(data__Amount__gt=1000)
```

This works in both PostgreSQL and SQLite (SQLite uses JSON functions internally). PostgreSQL is significantly faster for complex JSON queries.

### Mutating JSON Fields — A Gotcha

```python
# WRONG — Django can't detect this mutation
row.data["Amount"] = 500
row.save()  # might not actually save the change!

# RIGHT — reassign the entire field
data = dict(row.data)
data["Amount"] = 500
row.data = data
row.save()
```

Django tracks field changes by detecting that a field's value has changed since it was loaded. If you mutate the dict in-place (`row.data["key"] = value`), the `id(row.data)` hasn't changed, so Django might think the field is unchanged. Reassigning (`row.data = new_dict`) makes the change explicit. Alternatively, you can call `row.save(update_fields=['data'])` to force the save.

---

## Relationships

### ForeignKey — Many-to-One

```python
class JsonTableRow(models.Model):
    table = models.ForeignKey(JsonTable, related_name='rows', on_delete=models.CASCADE)
```

Many rows belong to one `JsonTable`. The `related_name='rows'` means you can do `json_table.rows.all()` — Django creates this reverse accessor automatically.

### OneToOneField — Exactly One-to-One

```python
class JsonTable(models.Model):
    table = models.OneToOneField(DynamicTableData, on_delete=models.CASCADE, primary_key=True)
```

Every `DynamicTableData` has exactly one `JsonTable`. Access the reverse: `dynamic_table_data.jsontable` (Django lowercases the model name for the reverse accessor).

```python
# Access JsonTable from DynamicTableData
json_table = table_data.jsontable

# Access DynamicTableData from JsonTable
dynamic_data = json_table.table
```

### ManyToManyField — Many-to-Many

```python
class DynamicTableData(models.Model):
    shared_with = models.ManyToManyField(User, related_name='shared_tables', blank=True)
```

A table can be shared with many users. A user can have many tables shared with them. Django creates a join table automatically: `financemanagement_dynamictabledata_shared_with`.

```python
# Share a table with Alice
table.shared_with.add(alice)

# Get all users this table is shared with
table.shared_with.all()

# Get all tables shared with Alice
alice.shared_tables.all()
```

---

## The `on_delete` Options Explained

When you delete a `DynamicTableData`, what should happen to its related `JsonTable` and `JsonTableRow` records? The `on_delete` argument controls this.

| Option | Behavior | Use When |
|--------|----------|---------|
| `CASCADE` | Delete all related rows automatically | Children have no meaning without their parent (`JsonTableRow` without `JsonTable`) |
| `SET_NULL` | Set the FK to NULL | The child can exist independently (`nullable=True` required) |
| `PROTECT` | Prevent deletion if children exist | You want to force manual cleanup first |
| `SET_DEFAULT` | Set to a default value | You have a meaningful fallback |
| `DO_NOTHING` | Leave orphaned rows (dangerous!) | Almost never — leads to integrity violations |

**In this project:**
- `JsonTable → DynamicTableData`: `CASCADE` — no table metadata, no headers
- `JsonTableRow → JsonTable`: `CASCADE` — no table structure, no rows
- `UserProfile → User`: `CASCADE` — no user, no profile
- `ChatSession → User`: `CASCADE` — user deleted, conversations go with them
- `ChatMessage → ChatSession`: `CASCADE` — session cleared, messages go with it

This chain means: deleting a `DynamicTableData` triggers a cascade that wipes the `JsonTable` AND all `JsonTableRow` objects automatically. You don't need to delete them manually.

---

## Custom Managers

A manager is a class that lives on the model (as `Model.objects`) and provides query methods. Instead of scattering the same filter logic across multiple views and services, you put it in the manager once.

### `DynamicTableDataManager`

```python
class DynamicTableDataManager(models.Manager):
    def for_user(self, user):
        """Tables owned by or shared with the given user."""
        return self.filter(
            models.Q(user=user) | models.Q(shared_with=user)
        ).distinct()

    def owned_by(self, user):
        return self.filter(user=user)
```

**Why `Q` objects instead of chaining `.filter()`?**

```python
# Two separate .filter() calls = AND logic
qs.filter(user=user).filter(shared_with=user)
# Generates: WHERE user_id = 1 AND shared_with CONTAINS 1
# This returns nothing (a table can't be both)

# Q objects = OR logic
qs.filter(Q(user=user) | Q(shared_with=user))
# Generates: WHERE user_id = 1 OR id IN (shared_with join)
# Returns all tables you own + all tables shared with you
```

**Why `.distinct()`?** Without it, a table shared with multiple users could appear multiple times in join results. `.distinct()` deduplicates.

**Why not `.union()` instead of `Q`?** We previously used `.union()` but it creates an "unmanageable" queryset — you can't chain `.prefetch_related()`, `.order_by()`, or other methods on it. `Q` objects produce a single composable queryset.

### `JsonTableRowManager`

```python
class JsonTableRowManager(models.Manager):
    def bulk_rename_key(self, json_table, old_key, new_key):
        rows_to_update = []
        for row in self.filter(table=json_table):
            if old_key in row.data:
                row.data[new_key] = row.data.pop(old_key)
                rows_to_update.append(row)
        if rows_to_update:
            self.bulk_update(rows_to_update, ['data'])
        return len(rows_to_update)
```

**Why `bulk_update` instead of `row.save()` in a loop?**

```python
# BAD — N database queries for N rows
for row in rows:
    row.data[new_key] = row.data.pop(old_key)
    row.save()  # 1 UPDATE per row

# GOOD — 1 database query regardless of row count
rows = [modify(r) for r in rows]
JsonTableRow.objects.bulk_update(rows, ['data'])  # single batch UPDATE
```

With 1,000 rows, the loop approach sends 1,000 SQL queries. `bulk_update` sends 1. This is critical for large tables.

---

## Indexing

Database indexes work like a book's index — instead of scanning every row to find what you want, you jump directly to the location.

```python
class ChatSession(models.Model):
    session_id = models.CharField(max_length=255, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', '-updated_at']),
            models.Index(fields=['user', 'is_active']),
        ]
```

| Index | Why It Exists |
|-------|---------------|
| `session_id` | URL lookups: `GET /chat/sessions/<session_id>/` runs `WHERE session_id = '...'` constantly |
| `is_active` | Every session query filters `is_active=True`; without an index this scans all sessions |
| `['user', '-updated_at']` | The session list page: "give me all active sessions for user X, newest first" — this composite index makes it a single index scan |
| `['user', 'is_active']` | Filtering active sessions per user — common enough to warrant its own index |

**When NOT to add an index:** Indexes speed up reads but slow down writes (the index must be updated on every INSERT/UPDATE). Don't index every field — focus on columns that appear in `WHERE`, `JOIN`, and `ORDER BY` clauses for common queries.

---

## Auto Timestamps

```python
created_at = models.DateTimeField(auto_now_add=True)
updated_at = models.DateTimeField(auto_now=True)
```

| Parameter | When It Fires | Editable? |
|-----------|---------------|-----------|
| `auto_now_add=True` | Only on `INSERT` (row creation) | No — you cannot override it |
| `auto_now=True` | On every `INSERT` and `UPDATE` | No — Django always overwrites it |

Django sets these automatically using `datetime.now()` on the Python side before writing to the database. You never set `created_at` manually — attempting to do so will have no effect.

**A common gotcha:** `auto_now=True` makes the field uneditable and read-only even in forms and serializers. If you ever need to set `updated_at` manually (e.g., during a data migration), use a plain `DateTimeField` with `default=timezone.now` instead and manage updates yourself.

---

## Querying with Q Objects

Q objects let you build complex filter conditions with `OR`, `AND`, and `NOT` logic:

```python
from django.db.models import Q

# Owned OR shared with the user
DynamicTableData.objects.filter(
    Q(user=user) | Q(shared_with=user)
).distinct()

# Not deleted AND (owned by user OR shared with user)
DynamicTableData.objects.filter(
    ~Q(is_shared=False) & (Q(user=user) | Q(shared_with=user))
)
```

| Operator | Meaning |
|----------|---------|
| `Q(x) | Q(y)` | OR: x or y |
| `Q(x) & Q(y)` | AND: x and y (same as `.filter(x).filter(y)`) |
| `~Q(x)` | NOT: not x |

---

## `select_related` and `prefetch_related`

These tools prevent the N+1 query problem — where loading N objects causes N additional queries to load their relationships.

### The N+1 Problem

```python
# This runs 1 query to get tables, then 1 query per table to get its JsonTable
# = 1 + N queries total (N+1)
tables = DynamicTableData.objects.all()
for table in tables:
    print(table.jsontable.headers)  # NEW QUERY each iteration
```

### `select_related` — For ForeignKey and OneToOneField (JOIN)

```python
# One SQL query with a JOIN — fetches table + jsontable together
json_table = JsonTable.objects.select_related("table").get(pk=table_id)
# Now json_table.table.table_name is FREE — no extra query
```

Use `select_related` when you know you'll access a related object, and the relationship is ForeignKey or OneToOne.

### `prefetch_related` — For ManyToMany and reverse FK (separate query + Python join)

```python
# 2 queries: one for tables, one for all their rows
# Then Django matches them in Python — far better than N+1
accessible = DynamicTableData.objects.prefetch_related('jsontable__rows').filter(user=user)

for table in accessible:
    rows = table.jsontable.rows.all()  # FREE — already fetched
```

Use `prefetch_related` for ManyToMany and reverse ForeignKey relationships.

---

## Transactions

A transaction is an "all or nothing" unit of work. Either all the changes succeed, or none of them do. This is critical when creating a table — you need both the `DynamicTableData` and the `JsonTable` to exist, or neither should.

```python
@transaction.atomic
def create_table(cls, user, name, description, headers):
    table_data = DynamicTableData.objects.create(...)  # step 1
    JsonTable.objects.create(table=table_data, headers=headers)  # step 2
    return table_data
```

If `step 2` fails (e.g., a database error), `@transaction.atomic` rolls back `step 1` automatically. Without it, you'd end up with a `DynamicTableData` row but no `JsonTable` — a broken state.

**For async code:** The `@transaction.atomic` decorator only works in synchronous code. For async services, use `sync_to_async`:

```python
def _create_sync():
    with transaction.atomic():
        t = DynamicTableData.objects.create(...)
        JsonTable.objects.create(table=t, headers=headers)
        return t

table = await sync_to_async(_create_sync)()
```

See [`async-sync-django.md`](async-sync-django.md) for the full explanation of why async and transactions require this pattern.
