"""
Finance MCP Server - Refactored

Provides tools for managing financial data through the Model Context Protocol.
Cleaner, more modular implementation with better error handling.
"""

import os
import sys
import json
from typing import Optional
import asyncio

# Django setup
current_script_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(current_script_dir, "..", "..", "..", "..")
backend_path = os.path.abspath(backend_path)
sys.path.insert(0, backend_path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'expense_api.settings.development')

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

# Initialize server and logger
mcp = FastMCP("finance_management")
logger = OperationLogger()


class FinanceToolsManager:
    """Manages finance-related tools."""
    
    def __init__(self):
        self.validator = DataValidator()
        self.logger = logger
    
    @staticmethod
    async def get_user_tables(user_id: int) -> str:
        """Get all tables for a user."""
        try:
            user_exists = await sync_to_async(User.objects.filter(id=user_id).exists)()
            if not user_exists:
                return ResponseBuilder.not_found("User", user_id)
            
            user = await sync_to_async(User.objects.get)(id=user_id)
            tables = await sync_to_async(lambda: list(DynamicTableData.objects.filter(user=user)))()
            
            serializer_data = await sync_to_async(
                lambda: DynamicTableSerializer(tables, many=True).data
            )()
            
            return ResponseBuilder.success(
                f"Found {len(tables)} tables",
                serializer_data
            )
            
        except Exception as e:
            logger.log_operation("get_user_tables", user_id, {"error": str(e)}, False)
            return ResponseBuilder.error("Failed to get tables", str(e))
    
    @staticmethod
    async def create_table(user_id: int, table_name: str, description: str, headers) -> str:
        """Create a new table."""
        try:
            # Validate input
            if isinstance(headers, str):
                headers_list = json.loads(headers)
            else:
                headers_list = headers
            
            valid, msg = DataValidator.validate_table_data(table_name, headers_list, {})
            if not valid:
                return ResponseBuilder.error("Invalid table data", msg)
            
            user = await sync_to_async(User.objects.get)(id=user_id)
            
            @sync_to_async
            def create_table_sync():
                with transaction.atomic():
                    table = DynamicTableData.objects.create(
                        table_name=table_name.strip(),
                        description=description.strip() if description else "",
                        user=user,
                        pending_count=0
                    )
                    JsonTable.objects.create(table=table, headers=headers_list)
                    return table
            
            table = await create_table_sync()
            logger.log_operation(
                "create_table",
                user_id,
                {"table_id": table.id, "table_name": table_name},
                True
            )
            
            return ResponseBuilder.success(
                "Table created successfully",
                {
                    "table_id": table.id,
                    "table_name": table.table_name,
                    "headers": headers_list,
                    "created_at": table.created_at.isoformat()
                }
            )
            
        except User.DoesNotExist:
            return ResponseBuilder.not_found("User", user_id)
        except Exception as e:
            logger.log_operation("create_table", user_id, {"error": str(e)}, False)
            return ResponseBuilder.error("Failed to create table", str(e))
    
    @staticmethod
    async def add_table_row(table_id: int, row_data) -> str:
        """Add a row to a table."""
        try:
            # Parse row data
            if isinstance(row_data, str):
                row_dict = json.loads(row_data)
            else:
                row_dict = row_data
            
            json_table = await sync_to_async(JsonTable.objects.get)(table_id=table_id)
            
            # Validate
            valid, msg = DataValidator.validate_row_data(row_dict, json_table.headers)
            if not valid:
                return ResponseBuilder.error("Invalid row data", msg)
            
            await sync_to_async(JsonTableRow.objects.create)(table=json_table, data=row_dict)
            
            logger.log_operation(
                "add_table_row",
                0,  # user_id not available
                {"table_id": table_id},
                True
            )
            
            return ResponseBuilder.success(
                "Row added successfully",
                row_dict
            )
            
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to add row", str(e))
    
    @staticmethod
    async def update_table_row(table_id: int, row_id: str, new_data) -> str:
        """Update a table row."""
        try:
            if isinstance(new_data, str):
                new_data_dict = json.loads(new_data)
            else:
                new_data_dict = new_data
            
            row = await sync_to_async(JsonTableRow.objects.get)(
                table__table_id=table_id,
                data__id=row_id
            )
            
            @sync_to_async
            def update_row():
                current_data = row.data or {}
                current_data.update(new_data_dict)
                row.data = current_data
                row.save()
                return row.data
            
            updated_data = await update_row()
            
            logger.log_operation(
                "update_table_row",
                0,
                {"table_id": table_id, "row_id": row_id},
                True
            )
            
            return ResponseBuilder.success(
                "Row updated successfully",
                updated_data
            )
            
        except JsonTableRow.DoesNotExist:
            return ResponseBuilder.not_found("Row", row_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to update row", str(e))
    
    @staticmethod
    async def delete_table_row(table_id: int, row_id: str) -> str:
        """Delete a table row."""
        try:
            json_table = await sync_to_async(JsonTable.objects.get)(pk=table_id)
            
            @sync_to_async
            def delete_row():
                for row in json_table.rows.all():
                    if str(row.data.get("id")) == str(row_id):
                        row.delete()
                        return True
                return False
            
            deleted = await delete_row()
            
            if not deleted:
                return ResponseBuilder.not_found("Row", row_id)
            
            logger.log_operation(
                "delete_table_row",
                0,
                {"table_id": table_id, "row_id": row_id},
                True
            )
            
            return ResponseBuilder.success(f"Row {row_id} deleted successfully")
            
        except JsonTable.DoesNotExist:
            return ResponseBuilder.not_found("Table", table_id)
        except Exception as e:
            return ResponseBuilder.error("Failed to delete row", str(e))


# Register tools
tools_mgr = FinanceToolsManager()


@mcp.tool()
async def get_user_tables(user_id: int) -> str:
    """Get all dynamic tables for a user."""
    return await tools_mgr.get_user_tables(user_id)


@mcp.tool()
async def create_table(user_id: int, table_name: str, description: str, headers) -> str:
    """Create a new table with headers."""
    return await tools_mgr.create_table(user_id, table_name, description, headers)


@mcp.tool()
async def add_table_row(table_id: int, row_data) -> str:
    """Add a new row to a table."""
    return await tools_mgr.add_table_row(table_id, row_data)


@mcp.tool()
async def update_table_row(table_id: int, row_id: str, new_data) -> str:
    """Update an existing row."""
    return await tools_mgr.update_table_row(table_id, row_id, new_data)


@mcp.tool()
async def delete_table_row(table_id: int, row_id: str) -> str:
    """Delete a row from a table."""
    return await tools_mgr.delete_table_row(table_id, row_id)


if __name__ == "__main__":
    mcp.run()
