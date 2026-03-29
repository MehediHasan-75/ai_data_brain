"""Query operations: fetch table content (headers + rows)."""
from typing import Optional

from django.contrib.auth.models import User

from expense_api.apps.FinanceManagement.models import DynamicTableData, JsonTable
from expense_api.apps.agent.servers.base import ResponseBuilder

from ._base import owns_table


class QueryService:
    @staticmethod
    async def get_table_content(user_id: int, table_id: Optional[int] = None) -> str:
        try:
            if table_id is None:
                user = await User.objects.aget(id=user_id)
                result = []
                async for table in DynamicTableData.objects.filter(user=user):
                    json_table = await JsonTable.objects.aget(pk=table.id)
                    rows = [r async for r in json_table.rows.all()]
                    result.append({
                        "table_id": table.id,
                        "table_name": table.table_name,
                        "headers": json_table.headers,
                        "rows": [r.data for r in rows],
                    })
                return ResponseBuilder.success(f"Returned content for {len(result)} tables", result)

            if not await owns_table(table_id, user_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            json_table = await JsonTable.objects.aget(pk=table_id)
            rows = [r async for r in json_table.rows.all()]
            return ResponseBuilder.success(
                f"Found {len(rows)} rows",
                {
                    "table_id": table_id,
                    "table_name": json_table.table.table_name,
                    "headers": json_table.headers,
                    "rows": [r.data for r in rows],
                },
            )
        except (JsonTable.DoesNotExist, User.DoesNotExist):
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to get table content", str(e))
