from django.db import models


class DynamicTableDataManager(models.Manager):
    def for_user(self, user):
        """Tables owned by or shared with the given user."""
        owned = self.filter(user=user).distinct()
        shared = self.filter(shared_with=user).distinct()
        return owned.union(shared)

    def owned_by(self, user):
        return self.filter(user=user)


class JsonTableRowManager(models.Manager):
    def bulk_rename_key(self, json_table, old_key, new_key):
        """
        Rename a JSON data key across all rows of a table.
        Returns the number of rows updated.
        """
        rows = self.filter(table=json_table)
        count = 0
        for row in rows:
            if old_key in row.data:
                row.data[new_key] = row.data.pop(old_key)
                row.save(update_fields=['data'])
                count += 1
        return count
