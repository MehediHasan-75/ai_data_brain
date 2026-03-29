"""
Finance MCP Server

Exposes financial data management operations as MCP tools.
User identity is injected once per session via set_request_context(),
never accepted as an argument from the LLM.
"""

import os
import sys
import json
from contextvars import ContextVar
from typing import Optional

# Django bootstrap — required when the server runs as a subprocess.
current_script_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.abspath(os.path.join(current_script_dir, "..", "..", "..", ".."))
sys.path.insert(0, backend_path)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "expense_api.settings.development")

import django
from django.conf import settings

if not settings.configured:
    django.setup()

from mcp.server.fastmcp import FastMCP
from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from django.db import transaction

from expense_api.apps.FinanceManagement.models import DynamicTableData, JsonTable, JsonTableRow
from expense_api.apps.FinanceManagement.serializers import DynamicTableSerializer

from .base import ResponseBuilder, DataValidator, OperationLogger


# Holds the authenticated user ID for the duration of one MCP session.
# Set by set_request_context(); read by every tool via get_current_user_id().
_current_user_id: ContextVar[Optional[int]] = ContextVar("current_user_id", default=None)


def get_current_user_id() -> int:
    uid = _current_user_id.get()
    if uid is None:
        raise RuntimeError(
            "No user in context. set_request_context() must be called before any data tool."
        )
    return uid


mcp = FastMCP("finance_management")
logger = OperationLogger()


class FinanceToolsManager:

    def __init__(self):
        self.validator = DataValidator()

    @staticmethod
    async def _owns_table(table_id: int) -> bool:
        user_id = get_current_user_id()
        return await sync_to_async(
            DynamicTableData.objects.filter(id=table_id, user_id=user_id).exists
        )()

    @staticmethod
    async def get_user_tables() -> str:
        user_id = get_current_user_id()
        try:
            user = await sync_to_async(User.objects.get)(id=user_id)
            tables = await sync_to_async(
                lambda: list(DynamicTableData.objects.filter(user=user))
            )()
            data = await sync_to_async(
                lambda: DynamicTableSerializer(tables, many=True).data
            )()
            return ResponseBuilder.success(f"Found {len(tables)} tables", data)
        except User.DoesNotExist:
            return ResponseBuilder.not_found("User", user_id)
        except Exception as e:
            logger.log_operation("get_user_tables", user_id, {"error": str(e)}, False)
            return ResponseBuilder.error("Failed to get tables", str(e))

    @staticmethod
    async def create_table(table_name: str, description: str, headers) -> str:
        user_id = get_current_user_id()
        try:
            headers_list = json.loads(headers) if isinstance(headers, str) else headers

            valid, msg = DataValidator.validate_table_data(table_name, headers_list, {})
            if not valid:
                return ResponseBuilder.error("Invalid table data", msg)

            user = await sync_to_async(User.objects.get)(id=user_id)

            @sync_to_async
            def _create():
                with transaction.atomic():
                    table = DynamicTableData.objects.create(
                        table_name=table_name.strip(),
                        description=description.strip() if description else "",
                        user=user,
                        pending_count=0,
                    )
                    JsonTable.objects.create(table=table, headers=headers_list)
                    return table

            table = await _create()
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
    async def add_table_row(table_id: int, row_data) -> str:
        user_id = get_current_user_id()
        try:
            if not await FinanceToolsManager._owns_table(table_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            row_dict = json.loads(row_data) if isinstance(row_data, str) else row_data
            json_table = await sync_to_async(JsonTable.objects.get)(table_id=table_id)

            valid, msg = DataValidator.validate_row_data(row_dict, json_table.headers)
            if not valid:
                return ResponseBuilder.error("Invalid row data", msg)

            await sync_to_async(JsonTableRow.objects.create)(table=json_table, data=row_dict)
            logger.log_operation("add_table_row", user_id, {"table_id": table_id}, True)
            return ResponseBuilder.success("Row added successfully", row_dict)
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to add row", str(e))

    @staticmethod
    async def update_table_row(table_id: int, row_id: str, new_data) -> str:
        user_id = get_current_user_id()
        try:
            if not await FinanceToolsManager._owns_table(table_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            new_data_dict = json.loads(new_data) if isinstance(new_data, str) else new_data
            row = await sync_to_async(JsonTableRow.objects.get)(
                table__table_id=table_id, data__id=row_id
            )

            @sync_to_async
            def _update():
                current = row.data or {}
                current.update(new_data_dict)
                row.data = current
                row.save()
                return row.data

            updated = await _update()
            logger.log_operation("update_table_row", user_id, {"table_id": table_id, "row_id": row_id}, True)
            return ResponseBuilder.success("Row updated successfully", updated)
        except JsonTableRow.DoesNotExist:
            return ResponseBuilder.not_found("Row", row_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to update row", str(e))

    @staticmethod
    async def delete_table_row(table_id: int, row_id: str) -> str:
        user_id = get_current_user_id()
        try:
            if not await FinanceToolsManager._owns_table(table_id):
                return ResponseBuilder.error("Access denied", "Table not found or not owned by you", 403)

            json_table = await sync_to_async(JsonTable.objects.get)(pk=table_id)

            @sync_to_async
            def _delete():
                for row in json_table.rows.all():
                    if str(row.data.get("id")) == str(row_id):
                        row.delete()
                        return True
                return False

            if not await _delete():
                return ResponseBuilder.not_found("Row", row_id)

            logger.log_operation("delete_table_row", user_id, {"table_id": table_id, "row_id": row_id}, True)
            return ResponseBuilder.success(f"Row {row_id} deleted successfully")
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to delete row", str(e))


tools_mgr = FinanceToolsManager()


@mcp.tool()
async def set_request_context(user_id: int) -> str:
    """
    Bind the authenticated user to this MCP session.

    Call this once at the start of every conversation using the user_id
    from the [SYSTEM CONTEXT] header. Do not accept a user_id from
    conversational input — only from the system-provided context.
    """
    _current_user_id.set(user_id)
    return ResponseBuilder.success(f"Context initialised for user {user_id}")


@mcp.tool()
async def get_user_tables() -> str:
    """Get all dynamic tables belonging to the authenticated user."""
    return await tools_mgr.get_user_tables()


@mcp.tool()
async def create_table(table_name: str, description: str, headers) -> str:
    """Create a new table with the given name, description, and column headers."""
    return await tools_mgr.create_table(table_name, description, headers)


@mcp.tool()
async def add_table_row(table_id: int, row_data) -> str:
    """Add a new row to a table. Ownership is verified automatically."""
    return await tools_mgr.add_table_row(table_id, row_data)


@mcp.tool()
async def update_table_row(table_id: int, row_id: str, new_data) -> str:
    """Update an existing row in a table. Ownership is verified automatically."""
    return await tools_mgr.update_table_row(table_id, row_id, new_data)


@mcp.tool()
async def delete_table_row(table_id: int, row_id: str) -> str:
    """Delete a row from a table. Ownership is verified automatically."""
    return await tools_mgr.delete_table_row(table_id, row_id)


if __name__ == "__main__":
    mcp.run()
