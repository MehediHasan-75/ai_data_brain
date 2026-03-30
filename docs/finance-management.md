# Finance Management — A Complete Guide

This document covers everything about the dynamic table system: how data is structured, how ownership is enforced, how every REST endpoint works, and how the service layer keeps the code clean and testable.

---

## Table of Contents

- [The Big Picture](#the-big-picture)
- [Why Dynamic Tables? The Design Philosophy](#why-dynamic-tables)
- [The 3-Tier Data Model in Action](#the-3-tier-data-model-in-action)
- [Ownership and Access Control](#ownership-and-access-control)
- [The Service Layer](#the-service-layer)
  - [TableService](#tableservice)
  - [RowService](#rowservice)
  - [ColumnService](#columnservice)
  - [SharingService](#sharingservice)
- [The Exception Hierarchy](#the-exception-hierarchy)
- [Custom Managers](#custom-managers)
- [REST API Endpoints Reference](#rest-api-endpoints-reference)
- [Request & Response Examples](#request--response-examples)
- [The Sharing System](#the-sharing-system)
- [Performance: N+1 Queries and How We Avoid Them](#performance-n1-queries-and-how-we-avoid-them)
- [Common Errors](#common-errors)

---

## The Big Picture

```
HTTP Request (authenticated user)
         │
         ▼
    View (views.py)
    ├── Parse & validate request shape
    ├── Extract request.user
    └── Call Service method(user, ...)
              │
              ▼
         Service (services.py)
         ├── Verify ownership via ORM query
         ├── Apply business rules
         ├── Mutate DB atomically
         └── Return data or raise exception
                   │
                   ▼
              Models (3-tier JSON schema)
              DynamicTableData → JsonTable → JsonTableRow
```

The `View` only handles HTTP concerns (parsing JSON, building responses, mapping exceptions to status codes). All business logic lives in the **Service** classes.

---

## Why Dynamic Tables?

Traditional relational databases require you to define a schema upfront with `ALTER TABLE` statements to change it. That's fine for stable data like user accounts, but terrible for personal finance tracking where everyone has different column needs.

**The problem:** One user might track `[Date, Amount, Category]`. Another tracks `[Date, Vendor, Amount, Currency, Receipt URL, Notes]`. You can't pre-define all possible column combinations.

**The solution:** Store the schema (headers) as a JSON list and the row data as JSON objects. Now adding a column is just updating a list and backfilling rows — no migration required.

Think of it like a Google Sheets spreadsheet stored inside a database. The spreadsheet can have any columns its creator wants.

---

## The 3-Tier Data Model in Action

```
DynamicTableData (table metadata + ownership)
    id: 7
    table_name: "Monthly Expenses"
    user: User(id=3)
    is_shared: True
    shared_with: [User(id=5)]
         │
         │ OneToOne (CASCADE)
         ▼
    JsonTable (the schema)
        table_id: 7   ← same PK as DynamicTableData
        headers: ["Date", "Amount", "Category", "Notes"]
              │
              │ ForeignKey (CASCADE)
              ▼
         JsonTableRow (each spreadsheet row)
             id: 101, data: {"Date": "2026-03-01", "Amount": 500, "Category": "Food", "Notes": ""}
             id: 102, data: {"Date": "2026-03-02", "Amount": 1200, "Category": "Rent", "Notes": "March"}
             id: 103, data: {"Date": "2026-03-05", "Amount": 85, "Category": "Food", "Notes": ""}
```

**Why three tables instead of one?**

| Concern | Where it lives |
|---|---|
| Who owns the table, sharing, timestamps | `DynamicTableData` |
| What columns the table has | `JsonTable` |
| Actual row data | `JsonTableRow` |

Splitting these concerns means you can fetch just the metadata (e.g. for listing tables in a sidebar) without pulling all row data. `JsonTable` uses `table_id` as its primary key — the same integer as `DynamicTableData.id` — so the join is always free.

---

## Ownership and Access Control

Every service method accepts a `user` argument and verifies ownership before touching data.

**Ownership check pattern:**

```python
# In TableService.get_table():
try:
    return DynamicTableData.objects.get(id=table_id, user=user)
except DynamicTableData.DoesNotExist:
    raise TableNotFound("Table not found or you don't have permission.")
```

This single query does double duty: it verifies existence AND ownership simultaneously. There's no separate "does this table exist?" query followed by "does this user own it?" — that two-step pattern is vulnerable to TOCTOU (time-of-check-time-of-use) races.

**Never trust the client:** Views pass `request.user` (set by `JWTAuthentication`) to service methods. They never pass a user ID from the request body. If a client sends `{"user_id": 999, ...}`, that field is ignored entirely.

**The rule:** A user can modify data if `DynamicTableData.user == request.user`. A user can _read_ data if they own it OR if they're in `shared_with`.

---

## The Service Layer

### TableService

Handles table-level operations: creating, listing, updating metadata, and deleting.

```python
class TableService:
    @classmethod
    def list_tables(cls, user):
        """Return all tables owned by or shared with the user."""
        return DynamicTableData.objects.for_user(user)
```

`for_user()` is a custom manager method (see [Custom Managers](#custom-managers)). It uses `Q` objects to handle both owned and shared tables in one query.

```python
    @classmethod
    @transaction.atomic
    def create_table(cls, user, name, description, headers):
        """Create DynamicTableData + JsonTable together."""
        table_data = DynamicTableData.objects.create(
            table_name=name,
            user=user,
            description=description,
        )
        JsonTable.objects.create(table=table_data, headers=headers)
        return table_data
```

`@transaction.atomic` ensures both `DynamicTableData` and `JsonTable` are created together — or neither is. If the second `create()` fails, the first is rolled back. You never end up with a `DynamicTableData` orphaned without its `JsonTable`.

```python
    @classmethod
    @transaction.atomic
    def delete_table(cls, user, table_id):
        """Delete a table (and all related data via CASCADE)."""
        table_data = DynamicTableData.objects.get(id=table_id, user=user)
        table_name = table_data.table_name
        table_data.delete()  # CASCADE removes JsonTable → JsonTableRow
        return table_name
```

Because `JsonTable` has `on_delete=CASCADE` and `JsonTableRow` has `on_delete=CASCADE`, deleting the parent `DynamicTableData` automatically removes the entire chain. No manual row deletion needed.

---

### RowService

Handles adding, updating, and deleting individual rows.

```python
class RowService:
    @classmethod
    def add_row(cls, user, table_id, row_data):
        json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        if not all(key in json_table.headers for key in row_data.keys()):
            raise InvalidRowData(
                f"Row keys do not match table headers. Expected: {json_table.headers}"
            )
        return JsonTableRow.objects.create(table=json_table, data=row_data)
```

Notice `JsonTable.objects.get(pk=table_id, table__user=user)` — the `table__user=user` part traverses the `JsonTable → DynamicTableData` foreign key to check ownership in a single SQL query:

```sql
SELECT * FROM finance_jsontable
INNER JOIN finance_dynamictabledata ON jsontable.table_id = dynamictabledata.id
WHERE jsontable.table_id = 5 AND dynamictabledata.user_id = 3
```

**The header validation:** Before inserting a row, we confirm every key in `row_data` exists in `json_table.headers`. This prevents row data from drifting out of sync with the schema.

---

### ColumnService

Handles structural changes to the table schema. All methods are `@transaction.atomic` because they modify both the header list and all existing row data.

**Adding a column:**

```python
@classmethod
@transaction.atomic
def add_column(cls, user, table_id, header):
    json_table = JsonTable.objects.get(pk=table_id, table__user=user)
    if header in json_table.headers:
        raise DuplicateHeader(f"Header '{header}' already exists.")

    json_table.headers.append(header)
    json_table.save()

    rows = list(json_table.rows.all())
    for row in rows:
        row.data[header] = ""
    if rows:
        JsonTableRow.objects.bulk_update(rows, ['data'])

    return json_table.headers
```

After adding the header to `JsonTable`, we **backfill** all existing rows with an empty string for the new column. This keeps data consistent: every row always has a value for every header. `bulk_update` sends a single SQL `UPDATE` statement for all rows instead of one per row.

**Renaming a column:**

```python
@classmethod
@transaction.atomic
def rename_column(cls, user, table_id, old_header, new_header):
    # 1. Update the header list in JsonTable
    header_index = json_table.headers.index(old_header)
    json_table.headers[header_index] = new_header
    json_table.save()

    # 2. Rename the key in every row's JSON object
    JsonTableRow.objects.bulk_rename_key(json_table, old_header, new_header)
```

The custom `bulk_rename_key` manager method iterates all rows and renames the key in each row's `data` dict, then uses `bulk_update`. See [Custom Managers](#custom-managers) for the implementation.

---

### SharingService

Controls who can see a table beyond its owner.

```python
@classmethod
def share_table(cls, owner, table_id, friend_ids):
    table = DynamicTableData.objects.get(id=table_id, user=owner)

    # Build the full set of friends (bidirectional friendship)
    owner_friend_ids = set(owner.profile.friends.values_list('id', flat=True))
    friends_who_added_me = set(
        User.objects.filter(profile__friends=owner).values_list('id', flat=True)
    )
    all_friend_ids = owner_friend_ids | friends_who_added_me

    # Batch-fetch all candidate users in one query
    candidate_users = {u.id: u for u in User.objects.filter(id__in=friend_ids)}

    for fid in friend_ids:
        friend = candidate_users.get(fid)
        if friend.id not in all_friend_ids:
            raise NotAFriend(f"{friend.username} is not your friend.")

    table.shared_with.add(*friends_to_add)
    if not table.is_shared:
        table.is_shared = True
        table.save()
```

**Bidirectional friendship:** The friend system is directional — User A adding User B doesn't automatically mean User B added User A. But for sharing purposes, we treat the relationship as bidirectional. If A added B **or** B added A, A can share with B.

**Batch user lookup:** Instead of one SQL query per `friend_id`, we fetch all candidate users in a single `User.objects.filter(id__in=friend_ids)` call, then look them up from a local dict. This is the [N+1 query pattern](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-object-relational-mapping) prevention in action.

---

## The Exception Hierarchy

```
FinanceException (base)
├── TableNotFound       → 404 Not Found
├── PermissionDenied    → 403 Forbidden
├── RowNotFound         → 404 Not Found
├── DuplicateHeader     → 400 Bad Request
├── InvalidRowData      → 400 Bad Request
└── NotAFriend          → 403 Forbidden
```

Every service method raises a typed exception instead of returning `None` or an error string. Views catch specific exception types and map them to HTTP status codes:

```python
try:
    table = TableService.get_table(request.user, table_id)
except TableNotFound as e:
    return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
except PermissionDenied as e:
    return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
```

This keeps views thin — they never contain ownership logic, they just handle HTTP. And it makes service methods independently testable.

---

## Custom Managers

### DynamicTableDataManager

```python
class DynamicTableDataManager(models.Manager):
    def for_user(self, user):
        return self.filter(
            models.Q(user=user) | models.Q(shared_with=user)
        ).distinct()
```

**Why `.distinct()`?** Without it, a user could appear multiple times in results if they're both the owner and in `shared_with`. The `DISTINCT` SQL clause removes duplicate rows.

**Why `Q()` instead of `.union()`?** `.union()` returns a non-chainable queryset — you can't call `.prefetch_related()` or `.order_by()` on it. `Q()` produces a real queryset that supports all further ORM operations.

### JsonTableRowManager

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
```

This iterates rows in Python (to rename the dict key) and then issues a single batched SQL update. Renaming a JSON object key can't be done in pure SQL portably, so the Python loop is the right approach here.

---

## REST API Endpoints Reference

All endpoints live under `/api/main/` and require authentication (JWT cookie).

| Method | URL | View | Description |
|--------|-----|------|-------------|
| `GET` | `/api/main/tables/` | `DynamicTableListView` | List all accessible tables |
| `POST` | `/api/main/create-table/` | `CreateTableWithHeadersView` | Create a new table |
| `PUT` | `/api/main/update-table/` | `DynamicTableUpdateView` | Update table metadata |
| `DELETE` | `/api/main/delete-table/<id>/` | `DeleteTableView` | Delete a table |
| `GET` | `/api/main/get-table-content/` | `GetTableContentView` | Get all tables with data |
| `POST` | `/api/main/add-row/` | `AddRowView` | Add a row to a table |
| `PATCH` | `/api/main/update-row/` | `UpdateTableView` | Update an existing row |
| `POST` | `/api/main/delete-row/` | `DeleteRowView` | Delete a row |
| `POST` | `/api/main/add-column/` | `AddColumnView` | Add a column |
| `POST` | `/api/main/delete-column/` | `DeleteColumnView` | Delete a column |
| `POST` | `/api/main/edit-header/` | `EditHeaderView` | Rename a column |
| `POST` | `/api/main/share-table/` | `ShareTableView` | Share/unshare a table |

---

## Request & Response Examples

### Create a Table

**Request:**
```http
POST /api/main/create-table/
Content-Type: application/json

{
  "table_name": "Monthly Expenses",
  "description": "Track all expenses for March 2026",
  "headers": ["Date", "Amount", "Category", "Notes"]
}
```

**Response (201):**
```json
{
  "message": "Table created successfully.",
  "data": {
    "id": 7,
    "table_name": "Monthly Expenses",
    "headers": ["Date", "Amount", "Category", "Notes"],
    "created_at": "2026-03-30T10:00:00Z",
    "description": "Track all expenses for March 2026"
  }
}
```

---

### Add a Row

**Request:**
```http
POST /api/main/add-row/
Content-Type: application/json

{
  "tableId": 7,
  "row": {
    "Date": "2026-03-30",
    "Amount": "500",
    "Category": "Food",
    "Notes": "Lunch"
  }
}
```

**Response (201):**
```json
{
  "message": "Row added successfully.",
  "data": {
    "id": 101,
    "Date": "2026-03-30",
    "Amount": "500",
    "Category": "Food",
    "Notes": "Lunch"
  }
}
```

---

### Update a Row

**Request:**
```http
PATCH /api/main/update-row/
Content-Type: application/json

{
  "tableId": 7,
  "rowId": 101,
  "newRowData": {
    "Amount": "550",
    "Notes": "Lunch + coffee"
  }
}
```

**Response (200):**
```json
{
  "status": "success",
  "updated_row": {
    "Date": "2026-03-30",
    "Amount": "550",
    "Category": "Food",
    "Notes": "Lunch + coffee"
  }
}
```

---

### Add a Column

**Request:**
```http
POST /api/main/add-column/
Content-Type: application/json

{
  "tableId": 7,
  "header": "Receipt URL"
}
```

**Response (200):**
```json
{
  "message": "Column added successfully.",
  "headers": ["Date", "Amount", "Category", "Notes", "Receipt URL"]
}
```

All existing rows are now backfilled: `{"Date": "...", "Amount": "...", "Category": "...", "Notes": "...", "Receipt URL": ""}`.

---

### Share a Table

**Request:**
```http
POST /api/main/share-table/
Content-Type: application/json

{
  "table_id": 7,
  "friend_ids": [5, 8],
  "action": "share"
}
```

**Response (200):**
```json
{
  "message": "Table shared successfully.",
  "table": {
    "id": 7,
    "table_name": "Monthly Expenses",
    "is_shared": true,
    "shared_with": [
      {"id": 5, "username": "alice"},
      {"id": 8, "username": "bob"}
    ]
  }
}
```

To unshare, send `"action": "unshare"`. To remove all shares at once, send `"action": "unshare"` with `"friend_ids": []`.

---

## The Sharing System

```
User A (owner)                 User B (friend)
     │                               │
     ├── DynamicTableData            │
     │   ├── user = A                │
     │   ├── is_shared = True        │
     │   └── shared_with = [B] ◄────┘
     │
     └── B can now GET /api/main/tables/ and see this table
         B can GET /api/main/get-table-content/ for this table
         B CANNOT delete, rename columns, or share it further
```

Shared users have **read access** only via `DynamicTableData.objects.for_user(user)`. Mutation operations (`delete_table`, `add_column`, etc.) use `DynamicTableData.objects.get(id=table_id, user=user)` — they require ownership, not just access.

**Friendship is a prerequisite for sharing.** You can only share with users in your friends list (bidirectional). Attempting to share with a non-friend raises `NotAFriend` → HTTP 403.

---

## Performance: N+1 Queries and How We Avoid Them

### The N+1 Problem

Imagine fetching 20 tables and printing each table's rows. The naive approach:

```python
# BAD — 1 query for tables + N queries (one per table) for rows = N+1 total
tables = DynamicTableData.objects.all()
for table in tables:
    rows = table.jsontable.rows.all()  # new SQL query per table!
```

With 20 tables, this fires 21 SQL queries. With 200 tables, 201 queries. This is called the N+1 problem.

### The Fix: prefetch_related

```python
# GOOD — 1 query for tables, 1 query for JsonTables, 1 query for all rows = 3 total
accessible = DynamicTableData.objects.filter(...).prefetch_related('jsontable__rows')
```

`prefetch_related('jsontable__rows')` tells Django to fetch all `JsonTable` and `JsonTableRow` records in two extra queries, then stitch them together in Python. Accessing `table.jsontable.rows.all()` after this never touches the database again.

### The Fix: bulk_update

Column operations modify all rows. The naive approach:

```python
# BAD — one SQL UPDATE per row
for row in rows:
    row.data[header] = ""
    row.save()  # N queries!
```

The correct approach:

```python
# GOOD — one SQL UPDATE for all rows
for row in rows:
    row.data[header] = ""
JsonTableRow.objects.bulk_update(rows, ['data'])  # 1 query
```

`bulk_update` is the Django equivalent of `UPDATE ... WHERE id IN (...)`.

---

## Common Errors

| Error | HTTP Status | Cause |
|-------|-------------|-------|
| `"Table not found or you don't have permission."` | 404 | `table_id` doesn't exist or belongs to another user |
| `"Header 'X' already exists."` | 400 | Trying to add a duplicate column name |
| `"Row keys do not match table headers."` | 400 | Row data has keys not in the table's headers list |
| `"X is not your friend."` | 403 | Trying to share with a user who isn't a friend |
| `"table_id and action are required."` | 400 | Missing required fields in share/unshare request |
| `"Invalid action. Use 'share' or 'unshare'."` | 400 | `action` field has wrong value |
| `"Table name and headers are required."` | 400 | Creating a table without a name or headers |
