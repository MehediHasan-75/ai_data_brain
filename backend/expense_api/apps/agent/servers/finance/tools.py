"""MCP tool definitions for finance management."""

from typing import Optional
from pydantic import Field

# Import from our new instance file, NOT from server.py
from .mcp_instance import mcp

def get_services():
    from .services import TableService, RowService, SchemaService, QueryService
    return TableService, RowService, SchemaService, QueryService


@mcp.tool()
async def get_user_tables(user_id: int = Field(default=1, exclude=True)) -> str:
    """Get all dynamic tables belonging to the authenticated user."""
    TableService, _, _, _ = get_services()
    return await TableService.get_user_tables(user_id)


@mcp.tool()
async def create_table(
    table_name: str = Field(description="The name for the new table, e.g. 'Monthly Expenses'."),
    description: str = Field(description="A short description of what this table tracks."),
    headers: list = Field(description='A JSON array of column header strings, e.g. ["Date", "Amount", "Category"].'),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Create a new table with the given name, description, and column headers."""
    TableService, _, _, _ = get_services()
    return await TableService.create_table(user_id, table_name, description, headers)


@mcp.tool()
async def add_table_row(
    table_id: int = Field(description="The numeric ID of the table to insert a row into."),
    row_data: dict = Field(description='A JSON object mapping column names to values, e.g. {"Date": "2026-03-29", "Amount": 500}.'),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Add a new row to a table. Ownership is verified automatically."""
    _, RowService, _, _ = get_services()
    return await RowService.add_table_row(user_id, table_id, row_data)


@mcp.tool()
async def update_table_row(
    table_id: int = Field(description="The numeric ID of the table containing the row."),
    row_id: str = Field(description="The unique ID of the row to update (found in the 'id' field of the row data)."),
    new_data: dict = Field(description="A JSON object with the fields to update. Only provided keys are changed."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Update an existing row in a table. Ownership is verified automatically."""
    _, RowService, _, _ = get_services()
    return await RowService.update_table_row(user_id, table_id, row_id, new_data)


@mcp.tool()
async def delete_table_row(
    table_id: int = Field(description="The numeric ID of the table containing the row."),
    row_id: str = Field(description="The unique ID of the row to delete."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Delete a row from a table. Ownership is verified automatically."""
    _, RowService, _, _ = get_services()
    return await RowService.delete_table_row(user_id, table_id, row_id)


@mcp.tool()
async def get_table_content(
    table_id: Optional[int] = Field(default=None, description="The numeric ID of the table to retrieve. Omit to get content for all user tables."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Return the full content (headers + rows) of a table. If table_id is omitted, returns content for all tables owned by the user."""
    _, _, _, QueryService = get_services()
    return await QueryService.get_table_content(user_id, table_id)


@mcp.tool()
async def add_table_column(
    table_id: int = Field(description="The numeric ID of the table to add a column to."),
    header: str = Field(description="The name of the new column to add, e.g. 'Notes'."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Add a new column to a table. Existing rows are backfilled with null."""
    _, _, SchemaService, _ = get_services()
    return await SchemaService.add_table_column(user_id, table_id, header)


@mcp.tool()
async def delete_table_columns(
    table_id: int = Field(description="The numeric ID of the table to remove columns from."),
    headers_to_remove: list = Field(description='A JSON array of column names to delete, e.g. ["Notes", "Tags"].'),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Remove one or more columns from a table and strip their data from all rows."""
    _, _, SchemaService, _ = get_services()
    return await SchemaService.delete_table_columns(user_id, table_id, headers_to_remove)


@mcp.tool()
async def update_table_metadata(
    table_id: int = Field(description="The numeric ID of the table to update."),
    table_name: Optional[str] = Field(default=None, description="The new name for the table. Omit to leave unchanged."),
    description: Optional[str] = Field(default=None, description="The new description for the table. Omit to leave unchanged."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Update a table's name, description, or both. Omit a field to leave it unchanged."""
    TableService, _, _, _ = get_services()
    return await TableService.update_table_metadata(user_id, table_id, table_name, description)


@mcp.tool()
async def delete_table(
    table_id: int = Field(description="The numeric ID of the table to permanently delete, including all its rows."),
    user_id: int = Field(default=1, exclude=True),
) -> str:
    """Delete an entire table along with all its rows. This action is irreversible."""
    TableService, _, _, _ = get_services()
    return await TableService.delete_table(user_id, table_id)