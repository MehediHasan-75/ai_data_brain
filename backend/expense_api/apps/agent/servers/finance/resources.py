"""MCP resource definitions for finance management."""

import os
import django

# 1. Ensure Django is configured before accessing the ORM
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "expense_api.settings")
django.setup()

from .mcp_instance import mcp
from .services import SchemaService


@mcp.resource(
    "schema://tables/{user_id}",
    mime_type="text/plain"
)
async def get_user_table_schema(user_id: str) -> str:
    """
    Fetch the database schema for a specific user to provide context to the LLM.
    This resource is fetched by the client before the LLM starts reasoning.
    """
    try:
        numeric_user_id = int(user_id)
    except ValueError:
        return f"Error: Invalid user_id format. Expected an integer, got '{user_id}'."

    return await SchemaService.get_user_table_schema(numeric_user_id)