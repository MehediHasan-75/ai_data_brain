from django.db import models


class DynamicTableDataManager(models.Manager):
    def for_user(self, user):
        """Tables owned by or shared with the given user."""
        return self.filter(
            models.Q(user=user) | models.Q(shared_with=user)
        ).distinct()

    def owned_by(self, user):
        return self.filter(user=user)


class JsonTableRowManager(models.Manager):
    def bulk_rename_key(self, json_table, old_key, new_key):
        """
        Rename a JSON data key across all rows of a table.
        Returns the number of rows updated.
        """
        rows_to_update = []
        for row in self.filter(table=json_table):
            if old_key in row.data:
                row.data[new_key] = row.data.pop(old_key)
                rows_to_update.append(row)
        if rows_to_update:
            self.bulk_update(rows_to_update, ['data'])
        return len(rows_to_update)
