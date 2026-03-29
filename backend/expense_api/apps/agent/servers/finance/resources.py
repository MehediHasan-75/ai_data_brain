"""MCP resource definitions for finance management."""

import os
import django

# -----------------------
# Ensure Django is configured
# -----------------------
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "expense_api.settings")
django.setup()

from .mcp_instance import mcp


async def get_models():
    """Lazy import to avoid circular import issues."""
    from expense_api.apps.FinanceManagement.models import DynamicTableData, JsonTable
    return DynamicTableData, JsonTable


@mcp.resource("schema://tables/{user_id}", mime_type="text/plain")
async def get_user_table_schema(user_id: str) -> str:
    """
    Fetch the database schema for a specific user to provide context to the LLM.
    This resource is fetched by the Django app before the LLM starts reasoning.
    """
    try:
        DynamicTableData, JsonTable = await get_models()
        lines = ["User's Database Tables:"]
        found = False

        # Async iteration over tables
        async for t in DynamicTableData.objects.filter(user_id=int(user_id)).values("id", "table_name"):
            found = True
            try:
                jt = await JsonTable.objects.aget(table_id=t["id"])
                lines.append(f"- Table ID: {t['id']} | Name: {t['table_name']} | Columns: {jt.headers}")
            except JsonTable.DoesNotExist:
                lines.append(f"- Table ID: {t['id']} | Name: {t['table_name']} | Columns: []")

        if not found:
            return "The user currently has no tables."

        return "\n".join(lines)

    except Exception as e:
        return f"Could not fetch schema: {e}"