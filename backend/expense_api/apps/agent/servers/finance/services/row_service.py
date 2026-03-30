"""Row-level operations: add, update, delete."""
import json

from expense_api.apps.FinanceManagement.models import JsonTable, JsonTableRow
from expense_api.apps.agent.servers.base import DataValidator, OperationLogger, ResponseBuilder

from ._base import owns_table

logger = OperationLogger()


class RowService:
    @staticmethod
    async def add_table_row(user_id: int, table_id: int, row_data) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            row_dict = json.loads(row_data) if isinstance(row_data, str) else row_data
            json_table = await JsonTable.objects.aget(table_id=table_id)
            valid, msg = DataValidator.validate_row_data(row_dict, json_table.headers)
            if not valid:
                return ResponseBuilder.error("Invalid row data", msg)

            await JsonTableRow.objects.acreate(table=json_table, data=row_dict)
            logger.log_operation("add_table_row", user_id, {"table_id": table_id}, True)
            return ResponseBuilder.success("Row added successfully", row_dict)
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to add row", str(e))

    @staticmethod
    async def update_table_row(user_id: int, table_id: int, row_id: str, new_data) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            new_data_dict = json.loads(new_data) if isinstance(new_data, str) else new_data
            row = await JsonTableRow.objects.aget(table__table_id=table_id, data__id=row_id)
            current = row.data or {}
            current.update(new_data_dict)
            row.data = current
            await row.asave()
            logger.log_operation("update_table_row", user_id, {"table_id": table_id, "row_id": row_id}, True)
            return ResponseBuilder.success("Row updated successfully", row.data)
        except JsonTableRow.DoesNotExist:
            return ResponseBuilder.not_found("Row", row_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to update row", str(e))

    @staticmethod
    async def delete_table_row(user_id: int, table_id: int, row_id: str) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            json_table = await JsonTable.objects.aget(pk=table_id)
            deleted = False
            async for row in json_table.rows.all():
                if str(row.data.get("id")) == str(row_id):
                    await row.adelete()
                    deleted = True
                    break

            if not deleted:
                return ResponseBuilder.not_found("Row", row_id)

            logger.log_operation("delete_table_row", user_id, {"table_id": table_id, "row_id": row_id}, True)
            return ResponseBuilder.success(f"Row {row_id} deleted successfully")
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to delete row", str(e))
