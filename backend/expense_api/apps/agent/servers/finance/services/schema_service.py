"""Schema operations: add and remove columns."""
from django.db import transaction

from expense_api.apps.FinanceManagement.models import JsonTable
from expense_api.apps.agent.servers.base import OperationLogger, ResponseBuilder

from ._base import owns_table

logger = OperationLogger()


class SchemaService:
    @staticmethod
    async def add_table_column(user_id: int, table_id: int, header: str) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            json_table = await JsonTable.objects.aget(pk=table_id)
            if header in json_table.headers:
                return ResponseBuilder.error("Column already exists", f"Header '{header}' already present")

            async with transaction.atomic():
                json_table.headers = json_table.headers + [header]
                await json_table.asave()
                async for row in json_table.rows.all():
                    row.data[header] = None
                    await row.asave()

            logger.log_operation("add_table_column", user_id, {"table_id": table_id, "header": header}, True)
            return ResponseBuilder.success(
                f"Column '{header}' added",
                {"table_id": table_id, "headers": json_table.headers},
            )
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to add column", str(e))

    @staticmethod
    async def delete_table_columns(user_id: int, table_id: int, headers_to_remove: list) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            json_table = await JsonTable.objects.aget(pk=table_id)

            async with transaction.atomic():
                new_headers = [h for h in json_table.headers if h not in headers_to_remove]
                json_table.headers = new_headers
                await json_table.asave()
                async for row in json_table.rows.all():
                    for h in headers_to_remove:
                        row.data.pop(h, None)
                    await row.asave()

            logger.log_operation("delete_table_columns", user_id, {"table_id": table_id, "removed": headers_to_remove}, True)
            return ResponseBuilder.success(
                f"Removed {len(headers_to_remove)} column(s)",
                {"table_id": table_id, "headers": json_table.headers},
            )
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to remove columns", str(e))
