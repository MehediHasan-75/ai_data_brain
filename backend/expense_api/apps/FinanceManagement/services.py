from django.db import models, transaction
from django.contrib.auth.models import User

from .models import DynamicTableData, JsonTable, JsonTableRow
from .exceptions import (
    TableNotFound,
    PermissionDenied,
    RowNotFound,
    DuplicateHeader,
    InvalidRowData,
    NotAFriend,
    FinanceException,
)


class TableService:
    @classmethod
    def list_tables(cls, user):
        """Return all tables owned by or shared with the user."""
        return DynamicTableData.objects.for_user(user)

    @classmethod
    @transaction.atomic
    def create_table(cls, user, name, description, headers):
        """Create a DynamicTableData + JsonTable together. Returns the DynamicTableData."""
        table_data = DynamicTableData.objects.create(
            table_name=name,
            user=user,
            description=description,
        )
        JsonTable.objects.create(table=table_data, headers=headers)
        return table_data

    @classmethod
    def get_table(cls, user, table_id):
        """
        Fetch a table by ID that the user owns.
        Raises TableNotFound or PermissionDenied.
        """
        try:
            return DynamicTableData.objects.get(id=table_id, user=user)
        except DynamicTableData.DoesNotExist:
            raise TableNotFound("Table not found or you don't have permission.")

    @classmethod
    def get_all_tables_content(cls, user):
        """Return a list of {id, data: {headers, rows}} for all accessible tables."""
        accessible = DynamicTableData.objects.filter(
            models.Q(user=user) | models.Q(shared_with=user)
        ).prefetch_related('jsontable__rows').distinct()

        result = []
        for table_data in accessible:
            try:
                jt = table_data.jsontable
            except JsonTable.DoesNotExist:
                continue
            result.append({
                "id": table_data.id,
                "data": {
                    "headers": jt.headers,
                    "rows": [{"id": row.id, **row.data} for row in jt.rows.all()],
                },
            })
        return result

    @classmethod
    def update_table_metadata(cls, user, table_id, **kwargs):
        """
        Update name/description/pendingCount on a table the user owns.
        Returns (table, updated) where updated=False means no fields were changed.
        """
        try:
            table = DynamicTableData.objects.get(id=table_id, user=user)
        except DynamicTableData.DoesNotExist:
            raise TableNotFound("Table not found for the current user.")

        updated = False
        if 'table_name' in kwargs:
            table.table_name = kwargs['table_name']
            updated = True
        if 'description' in kwargs:
            table.description = kwargs['description']
            updated = True
        if 'pendingCount' in kwargs:
            table.pendingCount = kwargs['pendingCount']
            updated = True

        if updated:
            table.save()
        return table, updated

    @classmethod
    @transaction.atomic
    def delete_table(cls, user, table_id):
        """Delete a table (and all related data via CASCADE) that the user owns."""
        try:
            table_data = DynamicTableData.objects.get(id=table_id, user=user)
        except DynamicTableData.DoesNotExist:
            raise TableNotFound("Table not found or you don't have permission to delete it.")

        table_name = table_data.table_name
        table_data.delete()  # CASCADE removes JsonTable and JsonTableRow
        return table_name


class RowService:
    @classmethod
    def add_row(cls, user, table_id, row_data):
        """Add a row to a JsonTable. Raises TableNotFound / InvalidRowData."""
        try:
            json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

        if not all(key in json_table.headers for key in row_data.keys()):
            raise InvalidRowData(
                f"Row keys do not match table headers. Expected: {json_table.headers}"
            )

        return JsonTableRow.objects.create(table=json_table, data=row_data)

    @classmethod
    def update_row(cls, user, table_id, row_id, new_data):
        """Update an existing row's data. Raises TableNotFound / RowNotFound."""
        try:
            json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

        try:
            row = json_table.rows.get(data__id=row_id) if isinstance(row_id, str) else json_table.rows.get(pk=row_id)
        except JsonTableRow.DoesNotExist:
            raise RowNotFound(f"Row {row_id} not found.")

        row.data.update(new_data)
        row.save()
        return row

    @classmethod
    def delete_row(cls, user, table_id, row_id):
        """Delete a row. Raises TableNotFound / RowNotFound."""
        try:
            json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

        try:
            row = json_table.rows.get(data__id=row_id) if isinstance(row_id, str) else json_table.rows.get(pk=row_id)
            row.delete()
        except JsonTableRow.DoesNotExist:
            raise RowNotFound(f"Row with ID '{row_id}' not found in table.")


class ColumnService:
    @classmethod
    @transaction.atomic
    def add_column(cls, user, table_id, header):
        """Add a new column and backfill existing rows with empty string. Returns new headers."""
        try:
            json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

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

    @classmethod
    @transaction.atomic
    def delete_column(cls, user, table_id, header):
        """Remove a column from headers and strip its key from all rows. Returns new headers."""
        try:
            json_table = JsonTable.objects.get(pk=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

        if header not in json_table.headers:
            raise FinanceException(f"Header '{header}' does not exist in the table.")

        json_table.headers.remove(header)
        json_table.save()

        rows = list(json_table.rows.all())
        for row in rows:
            row.data.pop(header, None)
        if rows:
            JsonTableRow.objects.bulk_update(rows, ['data'])

        return json_table.headers

    @classmethod
    @transaction.atomic
    def rename_column(cls, user, table_id, old_header, new_header):
        """Rename a column in headers + update all row keys via the manager. Returns new headers."""
        try:
            json_table = JsonTable.objects.get(table_id=table_id, table__user=user)
        except JsonTable.DoesNotExist:
            raise TableNotFound(f"Table {table_id} not found or not owned by you.")

        if new_header in json_table.headers:
            raise DuplicateHeader(f"Header '{new_header}' already exists.")

        header_index = json_table.headers.index(old_header)
        json_table.headers[header_index] = new_header
        json_table.save()

        JsonTableRow.objects.bulk_rename_key(json_table, old_header, new_header)
        return json_table.headers


class SharingService:
    @classmethod
    def share_table(cls, owner, table_id, friend_ids):
        """Share a table with one or more friends. Raises TableNotFound / NotAFriend."""
        try:
            table = DynamicTableData.objects.get(id=table_id, user=owner)
        except DynamicTableData.DoesNotExist:
            raise TableNotFound("Table not found or you don't have permission.")

        if not friend_ids:
            raise FinanceException("friend_ids are required for sharing.")

        owner_friend_ids = set(
            owner.profile.friends.values_list('id', flat=True)
        ) if hasattr(owner, 'profile') else set()
        friends_who_added_me_ids = set(
            User.objects.filter(profile__friends=owner).values_list('id', flat=True)
        )
        all_friend_ids = owner_friend_ids | friends_who_added_me_ids

        # Fetch all candidate users in one query
        candidate_users = {u.id: u for u in User.objects.filter(id__in=friend_ids)}
        already_shared_ids = set(table.shared_with.values_list('id', flat=True))

        friends_to_add = []
        for fid in friend_ids:
            friend = candidate_users.get(fid)
            if not friend:
                continue
            if friend.id not in all_friend_ids:
                raise NotAFriend(f"{friend.username} is not your friend.")
            if friend.id not in already_shared_ids:
                friends_to_add.append(friend)

        if friends_to_add:
            table.shared_with.add(*friends_to_add)
            if not table.is_shared:
                table.is_shared = True
                table.save()

    @classmethod
    def unshare_table(cls, owner, table_id, friend_ids=None):
        """Remove sharing for specified friends (or all if friend_ids is empty/None)."""
        try:
            table = DynamicTableData.objects.get(id=table_id, user=owner)
        except DynamicTableData.DoesNotExist:
            raise TableNotFound("Table not found or you don't have permission.")

        if not friend_ids:
            table.shared_with.clear()
        else:
            table.shared_with.remove(*User.objects.filter(id__in=friend_ids))

        if not table.shared_with.exists():
            table.is_shared = False
            table.save()
