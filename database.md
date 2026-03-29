# Database Reference

## Engine & Config

Configured in `expense_api/settings/development.py`:

```python
DATABASES = {
    'default': {
        'ENGINE': env('DB_ENGINE'),   # e.g. django.db.backends.sqlite3
        'NAME': BASE_DIR / env('DB_NAME'),
    }
}
```

Set `DB_ENGINE` and `DB_NAME` in your `.env` file.
Production uses the same pattern via `settings/production.py`.

---

## Tables Overview

| Table | App | Rows represent |
|---|---|---|
| `auth_user` | Django built-in | Every registered user account |
| `user_auth_userprofile` | user_auth | Extended profile + friends list per user |
| `agent_chatsession` | agent | One conversation thread per user |
| `agent_chatmessage` | agent | One message inside a session |
| `financemanagement_dynamictabledata` | FinanceManagement | A user-created spreadsheet (metadata) |
| `financemanagement_jsontable` | FinanceManagement | The column headers of one spreadsheet |
| `financemanagement_jsontablerow` | FinanceManagement | One data row inside a spreadsheet |
| `financemanagement_dynamictabledata_shared_with` | FinanceManagement | M2M join: which users can see a shared table |

---

## App: user_auth

### UserProfile
`expense_api/apps/user_auth/models.py`

Extends Django's built-in `User` with a profile and a friends list.

```
user_auth_userprofile
┌─────────────┬──────────────────────────────────────────┐
│ id          │ PK, auto                                 │
│ user_id     │ FK → auth_user.id  (OneToOne, CASCADE)   │
│ created_at  │ DateTimeField, auto_now_add              │
│ updated_at  │ DateTimeField, auto_now                  │
└─────────────┴──────────────────────────────────────────┘

user_auth_userprofile_friends  (M2M join table)
┌──────────────────┬──────────────────────────────────────┐
│ userprofile_id   │ FK → user_auth_userprofile.id        │
│ user_id          │ FK → auth_user.id                    │
└──────────────────┴──────────────────────────────────────┘
```

**Relationships**
- `user` → `auth_user` (OneToOne, CASCADE delete) — one profile per user
- `friends` → `auth_user` (M2M, blank=True) — user's friend list

**Migrations**
```
0001_initial.py  — creates UserProfile + M2M friends table
```

---

## App: agent

### ChatSession
`expense_api/apps/agent/models.py`

One conversation thread. A user can have many sessions.

```
agent_chatsession
┌─────────────┬──────────────────────────────────────────────────────┐
│ id          │ PK, auto                                             │
│ user_id     │ FK → auth_user.id  (CASCADE)                        │
│ session_id  │ CharField(255), unique, db_index                    │
│ title       │ CharField(255), default="New Chat"                   │
│ created_at  │ DateTimeField, auto_now_add                          │
│ updated_at  │ DateTimeField, auto_now                              │
│ is_active   │ BooleanField, default=True, db_index                 │
└─────────────┴──────────────────────────────────────────────────────┘
```

**Indexes**
```
(user_id, -updated_at)   — fast "my recent sessions" query
(session_id)             — fast session lookup by string ID
(user_id, is_active)     — fast "my active sessions" query
```

**Relationships**
- `user` → `auth_user` (FK, CASCADE)
- reverse: `messages` → `ChatMessage` set

---

### ChatMessage
One message inside a session — either from the user or the AI.

```
agent_chatmessage
┌────────────────┬──────────────────────────────────────────────────────┐
│ id             │ PK, auto                                             │
│ chat_session_id│ FK → agent_chatsession.id  (CASCADE)                │
│ user_id        │ FK → auth_user.id  (CASCADE)                        │
│ message_id     │ CharField(255), unique, db_index                    │
│ text           │ TextField  — raw message content                    │
│ sender         │ CharField(10), choices: 'user' | 'bot'              │
│ timestamp      │ DateTimeField, auto_now_add                          │
│ is_typing      │ BooleanField, default=False                          │
│ displayed_text │ TextField, blank/null — formatted display version   │
│ agent_data     │ JSONField, blank/null — tool call metadata          │
└────────────────┴──────────────────────────────────────────────────────┘
```

**Indexes**
```
(chat_session_id, timestamp)  — fast "messages in order for this session"
(user_id, timestamp)          — fast "all messages by this user"
(message_id)                  — fast lookup by client-generated ID
```

**Relationships**
- `chat_session` → `ChatSession` (FK, CASCADE)
- `user` → `auth_user` (FK, CASCADE)

**`agent_data` JSON shape** (when populated by the agent)
```json
{
  "tool": "add_table_row",
  "table_id": 3,
  "result": { "success": true, "message": "Row added" }
}
```

**Migrations**
```
0001_initial.py  — creates ChatSession, ChatMessage, all indexes
```

---

## App: FinanceManagement

Three models form a 3-layer structure:
**metadata → schema → rows**

```
DynamicTableData  (metadata: name, owner, sharing)
      │  OneToOne
      ▼
JsonTable         (schema: list of column headers)
      │  FK (one-to-many)
      ▼
JsonTableRow      (data: one JSON object per row)
```

---

### DynamicTableData
The top-level table record. Stores who owns it and whether it is shared.

```
financemanagement_dynamictabledata
┌──────────────┬──────────────────────────────────────────────────────┐
│ id           │ PK, auto                                             │
│ table_name   │ CharField(255)                                       │
│ user_id      │ FK → auth_user.id  (CASCADE)  — owner               │
│ created_at   │ DateTimeField, auto_now_add                          │
│ modified_at  │ DateTimeField, auto_now                              │
│ description  │ TextField, blank/null                                │
│ pending_count│ IntegerField, default=0                              │
│ is_shared    │ BooleanField, default=False                          │
└──────────────┴──────────────────────────────────────────────────────┘

financemanagement_dynamictabledata_shared_with  (M2M join)
┌─────────────────────────┬──────────────────────────────────────────┐
│ dynamictabledata_id     │ FK → financemanagement_dynamictabledata  │
│ user_id                 │ FK → auth_user.id                        │
└─────────────────────────┴──────────────────────────────────────────┘
```

**Relationships**
- `user` → `auth_user` (FK, CASCADE) — owner
- `shared_with` → `auth_user` (M2M, blank=True) — collaborators
- reverse `jsontable` → `JsonTable` (OneToOne)
- reverse `owned_tables` on `User`
- reverse `shared_tables` on `User`

---

### JsonTable
Stores the column headers for one `DynamicTableData`.
Uses `DynamicTableData.id` as its own primary key (OneToOne + primary_key=True).

```
financemanagement_jsontable
┌──────────┬──────────────────────────────────────────────────────────┐
│ table_id │ PK + FK → financemanagement_dynamictabledata.id (CASCADE)│
│ headers  │ JSONField  — list of strings, e.g. ["Date","Amount"]     │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Note:** Because `table` is both the PK and the FK, `jsontable.pk == dynamictabledata.pk`.
Lookup: `JsonTable.objects.aget(pk=table_id)` or `JsonTable.objects.aget(table_id=table_id)`.

---

### JsonTableRow
One row of data. Stores the entire row as a JSON object.

```
financemanagement_jsontablerow
┌──────────┬──────────────────────────────────────────────────────────┐
│ id       │ PK, auto                                                 │
│ table_id │ FK → financemanagement_jsontable.table_id  (CASCADE)     │
│ data     │ JSONField  — e.g. {"id":"a1b2","Date":"2026-03-29",...}  │
└──────────┴──────────────────────────────────────────────────────────┘
```

**`data` JSON shape**
```json
{
  "id": "a1b2c3d4",
  "Date": "2026-03-29",
  "Amount": 500,
  "Category": "Food",
  "Payment Method": "Cash"
}
```

`id` inside `data` is an 8-character UUID fragment generated by `DataValidator.validate_row_data()`
in `servers/base.py`. It is **not** the DB `id` column — it is stored inside the JSON and used
by the agent to identify rows for update/delete.

**Migrations**
```
0001_initial.py  — creates DynamicTableData, JsonTable, JsonTableRow, shared_with M2M
```

---

## Full Entity Relationship Diagram

```
auth_user (Django built-in)
    │
    ├──[OneToOne]──► UserProfile
    │                    └──[M2M]──► auth_user  (friends)
    │
    ├──[FK]──► ChatSession
    │               └──[FK]──► ChatMessage
    │
    └──[FK]──► DynamicTableData  (owner)
    │               ├──[M2M]──► auth_user  (shared_with)
    │               └──[OneToOne]──► JsonTable
    │                                   └──[FK]──► JsonTableRow
    │                                              (many rows per table)
    └──[M2M reverse: shared_tables]──► DynamicTableData
```

---

## How the Agent Reads and Writes Data

```
Agent tool call
      │
      ▼
owns_table(table_id, user_id)
  → DynamicTableData.objects.filter(id=table_id, user_id=user_id).aexists()
      │
      ▼ (if True)
Service method
  ├── TableService  → DynamicTableData + JsonTable
  ├── RowService    → JsonTableRow  (lookup via data__id JSON field filter)
  ├── SchemaService → JsonTable.headers + backfills JsonTableRow.data
  └── QueryService  → JsonTable + all JsonTableRow.data for that table
```

**Row lookup by `row_id`** (used in update/delete):
```python
# row_id is the 'id' key inside the JSON data field, not the DB PK
JsonTableRow.objects.aget(table__table_id=table_id, data__id=row_id)
```
This uses Django's JSONField lookup `data__id` which translates to a
SQL `->>'id'` extraction on the JSON column.

---

## Serializers

### user_auth
| Serializer | Model | Purpose |
|---|---|---|
| `UserSerializer` | User | Read-only: id, username, email, first/last name |
| `userRegisterSerializer` | User | Registration: creates user via `create_user()` |
| `UserProfileSerializer` | UserProfile | Nested User + friends list |

### agent
| Serializer | Model | Purpose |
|---|---|---|
| `ChatSessionSerializer` | ChatSession | CRUD sessions, auto-generates `session_id` on create |
| `ChatMessageSerializer` | ChatMessage | CRUD messages, validates sender, attaches to session |
| `QuerySerializer` | — | Input: `query` string + optional `session_id`, `llm_provider`, `llm_model` |
| `ResponseSerializer` | — | Parses LLM response — extracts text, type, streaming steps, thinking process |

### FinanceManagement
| Serializer | Model | Purpose |
|---|---|---|
| `DynamicTableSerializer` | DynamicTableData | Table list returned to frontend and to the agent's `get_user_tables` tool |

---

## Migrations State

Each app has a single initial migration. No subsequent schema changes have been applied.

```
user_auth/migrations/
  └── 0001_initial.py       2026-01-31

agent/migrations/
  └── 0001_initial.py       2026-01-31

FinanceManagement/migrations/
  └── 0001_initial.py       2026-01-31
```

To add a field: edit the model, then run:
```bash
python manage.py makemigrations
python manage.py migrate
```
