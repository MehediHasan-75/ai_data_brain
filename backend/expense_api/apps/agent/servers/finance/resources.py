"""MCP resource definitions for finance management."""
from expense_api.apps.FinanceManagement.models import DynamicTableData, JsonTable

from .server import mcp


@mcp.resource("schema://tables/{user_id}", mime_type="text/plain")
async def get_user_table_schema(user_id: str) -> str:
    """
    Fetch the database schema for a specific user to provide context to the LLM.
    This resource is fetched by the Django app before the LLM starts reasoning.
    """
    try:
        lines = ["User's Database Tables:"]
        found = False
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
