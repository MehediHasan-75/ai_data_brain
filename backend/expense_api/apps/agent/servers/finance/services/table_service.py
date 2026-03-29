"""Table-level operations: list, create, update metadata, delete."""
import json
from typing import Optional

from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import transaction

from expense_api.apps.FinanceManagement.models import DynamicTableData, JsonTable
from expense_api.apps.FinanceManagement.serializers import DynamicTableSerializer
from expense_api.apps.agent.servers.base import DataValidator, OperationLogger, ResponseBuilder

from ._base import owns_table

logger = OperationLogger()


class TableService:
    @staticmethod
    async def get_user_tables(user_id: int) -> str:
        try:
            user = await User.objects.aget(id=user_id)
            tables = [t async for t in DynamicTableData.objects.filter(user=user).select_related("user").prefetch_related("shared_with")]
            data = await sync_to_async(lambda: DynamicTableSerializer(tables, many=True).data)()
            return ResponseBuilder.success(f"Found {len(tables)} tables", data)
        except User.DoesNotExist:
            return ResponseBuilder.not_found("User", user_id)
        except Exception as e:
            logger.log_operation("get_user_tables", user_id, {"error": str(e)}, False)
            return ResponseBuilder.error("Failed to get tables", str(e))

    @staticmethod
    async def create_table(user_id: int, table_name: str, description: str, headers) -> str:
        try:
            headers_list = json.loads(headers) if isinstance(headers, str) else headers
            valid, msg = DataValidator.validate_table_data(table_name, headers_list, {})
            if not valid:
                return ResponseBuilder.error("Invalid table data", msg)

            user = await User.objects.aget(id=user_id)

            async with transaction.atomic():
                table = await DynamicTableData.objects.acreate(
                    table_name=table_name.strip(),
                    description=description.strip() if description else "",
                    user=user,
                    pending_count=0,
                )
                await JsonTable.objects.acreate(table=table, headers=headers_list)

            logger.log_operation("create_table", user_id, {"table_id": table.id}, True)
            return ResponseBuilder.success(
                "Table created successfully",
                {
                    "table_id": table.id,
                    "table_name": table.table_name,
                    "headers": headers_list,
                    "created_at": table.created_at.isoformat(),
                },
            )
        except User.DoesNotExist:
            return ResponseBuilder.not_found("User", user_id)
        except Exception as e:
            logger.log_operation("create_table", user_id, {"error": str(e)}, False)
            return ResponseBuilder.error("Failed to create table", str(e))

    @staticmethod
    async def update_table_metadata(
        user_id: int,
        table_id: int,
        table_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            table = await DynamicTableData.objects.aget(id=table_id)
            if table_name is not None:
                table.table_name = table_name.strip()
            if description is not None:
                table.description = description.strip()
            await table.asave()
            logger.log_operation("update_table_metadata", user_id, {"table_id": table_id}, True)
            return ResponseBuilder.success(
                "Table metadata updated",
                {"table_id": table_id, "table_name": table.table_name, "description": table.description},
            )
        except DynamicTableData.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to update metadata", str(e))

    @staticmethod
    async def delete_table(user_id: int, table_id: int) -> str:
        try:
            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            table = await DynamicTableData.objects.aget(id=table_id)
            await table.adelete()
            logger.log_operation("delete_table", user_id, {"table_id": table_id}, True)
            return ResponseBuilder.success(f"Table {table_id} deleted successfully")
        except DynamicTableData.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to delete table", str(e))
