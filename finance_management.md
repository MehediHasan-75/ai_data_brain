# FinanceManagement App — Architecture Reference

## Purpose

REST API for user-created spreadsheet-style tables. Users can create tables with
custom column headers, insert JSON rows, share tables with friends, and manage
schema changes (add/rename/delete columns). The Agent app also reads and writes
these same tables via MCP tools.

---

## Folder Structure

```
expense_api/apps/FinanceManagement/
├── models.py      — 3 models: DynamicTableData, JsonTable, JsonTableRow
├── serializers.py — DynamicTableSerializer
├── views.py       — 12 view classes (all table/row/column operations)
├── urls.py        — 12 URL patterns under /api/main/
└── admin.py       — Django admin registration with HTML preview
```

---

## Models

Three models form a layered structure:

```
DynamicTableData   (metadata: name, owner, sharing settings)
      │ OneToOne
      ▼
JsonTable          (schema: list of column header strings)
      │ FK one-to-many
      ▼
JsonTableRow       (data: one JSON object per row)
```

### DynamicTableData

```
financemanagement_dynamictabledata
┌───────────────┬──────────────────────────────────────────────────┐
│ id            │ PK, auto (BigAutoField)                          │
│ table_name    │ CharField(255)                                   │
│ user_id       │ FK → auth_user.id  (CASCADE)  — owner           │
│ created_at    │ DateTimeField, auto_now_add                      │
│ modified_at   │ DateTimeField, auto_now                          │
│ description   │ TextField, blank/null                            │
│ pending_count │ IntegerField, default=0                          │
│ is_shared     │ BooleanField, default=False                      │
└───────────────┴──────────────────────────────────────────────────┘

financemanagement_dynamictabledata_shared_with  (auto M2M join)
┌──────────────────────────┬────────────────────────────────────────┐
│ dynamictabledata_id      │ FK → financemanagement_dynamictabledata│
│ user_id                  │ FK → auth_user.id                      │
└──────────────────────────┴────────────────────────────────────────┘
```

**Relationships**
- `user` → `auth_user` FK (owner, CASCADE delete)
- `shared_with` → `auth_user` M2M (collaborators, blank=True)
- reverse `jsontable` → `JsonTable` (OneToOne, set by child)
- reverse name on User: `owned_tables`, `shared_tables`

---

### JsonTable

Stores the column schema for one table. Uses DynamicTableData's PK as its own PK
so `jsontable.pk == dynamictabledata.pk` always.

```
financemanagement_jsontable
┌──────────┬──────────────────────────────────────────────────────────┐
│ table_id │ PK + FK → financemanagement_dynamictabledata.id (CASCADE)│
│ headers  │ JSONField — list of strings, e.g. ["Date","Amount"]      │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Lookup patterns used across the codebase**
```python
JsonTable.objects.get(pk=table_id)            # by numeric ID
JsonTable.objects.get(table_id=table_id)      # same thing, explicit FK name
JsonTable.objects.get(table=table_data_obj)   # by related DynamicTableData
```

---

### JsonTableRow

One row of data. The entire row is a single JSON object.

```
financemanagement_jsontablerow
┌──────────┬──────────────────────────────────────────────────────────┐
│ id       │ PK, auto (DB row identity, not exposed to frontend)      │
│ table_id │ FK → financemanagement_jsontable.table_id (CASCADE)      │
│ data     │ JSONField — the full row as a dict                       │
└──────────┴──────────────────────────────────────────────────────────┘
```

**`data` field shape (REST API rows)**
```json
{
  "Date": "2026-03-29",
  "Amount": 500,
  "Category": "Food"
}
```
Note: The REST API does **not** embed an `id` key inside `data`. Row identity is
the DB `id` column, passed back to the frontend as `row.id` in responses.

**`data` field shape (Agent-inserted rows)**
```json
{
  "id": "a1b2c3d4",
  "Date": "2026-03-29",
  "Amount": 500,
  "Category": "Food"
}
```
The agent's `DataValidator` injects an 8-char UUID fragment as `data["id"]`
so rows can be addressed by the LLM without knowing the DB PK.

**Row lookup patterns**
```python
# By DB PK (REST API)
json_table.rows.get(pk=row_id)

# By embedded JSON id (REST API — when row_id is a string)
json_table.rows.get(data__id=row_id)

# By embedded JSON id (Agent service)
JsonTableRow.objects.aget(table__table_id=table_id, data__id=row_id)
```

---

## Serializer

### DynamicTableSerializer

Used by the REST API to return table lists, and by the Agent's `get_user_tables`
tool to give the LLM the schema context.

```python
fields = [
  'id', 'table_name', 'user_id', 'owner',
  'is_shared', 'shared_with',
  'created_at', 'modified_at', 'description', 'pendingCount'
]
```

`owner` → `{"id": 1, "username": "mehedi"}`
`shared_with` → `[{"id": 2, "username": "alice"}, ...]`
`pendingCount` → maps to `pending_count` field (snake_case ↔ camelCase)

---

## API Endpoints

Base path: `/api/main/`

| Method | URL | View | What it does |
|---|---|---|---|
| GET | `tables/` | `DynamicTableListView` | List all tables owned by or shared with user |
| DELETE | `tables/<table_id>/` | `DeleteTableView` | Delete table + all rows (owner only) |
| PUT | `tables/update/` | `DynamicTableUpdateView` | Update table name / description / pendingCount |
| GET | `table-contents/` | `GetTableContentView` | All accessible tables with headers + rows |
| POST | `create-tableContent/` | `CreateTableWithHeadersView` | Create table with headers |
| POST | `add-row/` | `AddRowView` | Insert a row (validates against headers) |
| PATCH | `update-row/` | `UpdateTableView` | Update fields on an existing row |
| POST | `delete-row/` | `DeleteRowView` | Delete a row by DB id or data.id |
| POST | `add-column/` | `AddColumnView` | Add column header + backfill `""` on all rows |
| POST | `delete-column/` | `DeleteColumnView` | Remove column from headers + all rows |
| POST | `edit-header/` | `EditHeaderView` | Rename column — updates header list + all row keys |
| POST | `share-table/` | `ShareTableView` | Share / unshare table with friends |

---

## How Each View Works

### DynamicTableListView — GET `tables/`
1. Reads `refresh_token` cookie → decodes user_id
2. Fetches `owned_tables` + `shared_with` tables separately
3. Unions both querysets (`.union()`) to avoid duplicates
4. Returns serialized list

### GetTableContentView — GET `table-contents/`
1. Fetches all tables where `user=me OR shared_with=me` using `Q()`
2. For each table, fetches its `JsonTable` and all `JsonTableRow.rows`
3. Returns `[{id, data: {headers, rows: [{id, ...rowData}]}}]`

### CreateTableWithHeadersView — POST `create-tableContent/`
1. Creates `DynamicTableData` (metadata)
2. Creates `JsonTable` (schema) linked to it
3. No rows created — table starts empty

### AddRowView — POST `add-row/`
1. Validates all row keys exist in `json_table.headers`
2. Creates `JsonTableRow` with provided dict as `data`
3. Returns `{id: db_pk, ...rowData}`

### AddColumnView — POST `add-column/`
1. Appends new header to `json_table.headers`
2. Loops all existing rows and sets `row.data[new_header] = ""`
3. Saves each row individually

### DeleteColumnView — POST `delete-column/`
1. Removes header from `json_table.headers`
2. Loops all rows and `del row.data[header]`

### EditHeaderView — POST `edit-header/`
1. Replaces header string in `json_table.headers` at the same index position
2. Loops all rows: `row.data[new_name] = row.data.pop(old_name)`

### ShareTableView — POST `share-table/`
Two actions: `"share"` or `"unshare"`

**share:**
1. Verifies requester owns the table
2. Checks each `friend_id` is in the bidirectional friends list
3. Bulk-adds friends with `table.shared_with.add(*friends_to_share)`
4. Sets `is_shared = True` if not already

**unshare:**
1. Removes specified friends (or all if `friend_ids` is empty)
2. Sets `is_shared = False` if no one remains in `shared_with`

---

## Authentication

All views use:
```python
authentication_classes = [JWTAuthentication]   # from user_auth.permission
permission_classes = [IsAuthenticatedCustom]   # from user_auth.authentication
```

Most views also manually re-decode the `refresh_token` cookie to get `user_id`
(a pattern carried from early development — the authenticated `request.user`
would give the same result).

---

## Relationship to the Agent App

The Agent's MCP tools (`servers/finance/services/`) operate on the **same three
models** via the Django ORM directly — not via these REST endpoints. Both paths
write to the same database tables.

```
Frontend REST          Agent MCP tool
      │                      │
      ▼                      ▼
FinanceManagement       servers/finance/
   views.py             services/*.py
      │                      │
      └──────────┬───────────┘
                 ▼
      DynamicTableData / JsonTable / JsonTableRow
```

Key difference: The REST API uses `row.id` (DB PK) to identify rows. The Agent
uses `data["id"]` (embedded UUID in the JSON field). Both approaches work because
`DeleteRowView` and `UpdateTableView` already handle both cases:
```python
if isinstance(row_id, str):
    row = json_table.rows.get(data__id=row_id)   # agent-style
else:
    row = json_table.rows.get(pk=row_id)          # REST-style
```
