"""
MCP Prompt definitions for finance management.

Prompts are predefined workflows triggered by the user (button click, slash command).
Unlike tools (LLM-controlled) or resources (context injection), prompts hand the LLM
a fully-formed instruction so the behaviour is consistent and reproducible every time.
"""
from mcp.server.fastmcp import Context

from .mcp_instance import mcp


@mcp.prompt()
def new_expense_table(month: str, year: str) -> str:
    """Create a standard monthly expense tracking table."""
    return (
        f"Create a new expense tracking table for {month} {year}. "
        f"Use exactly these columns: Date, Category, Description, Amount, Payment Method. "
        f"After creating it, tell me the table ID."
    )


@mcp.prompt()
def import_csv_rows(table_id: int, csv_text: str) -> str:
    """Parse raw CSV text and insert each line as a row into an existing table."""
    return (
        f"I have CSV data to import into table ID {table_id}. "
        f"Parse each line below as a row and call add_table_row for each one. "
        f"Skip the header row if present. Report how many rows were inserted.\n\n"
        f"{csv_text}"
    )


@mcp.prompt()
def summarise_table(table_id: int) -> str:
    """Fetch a table and produce a human-readable summary with totals."""
    return (
        f"Fetch the full content of table ID {table_id} using get_table_content. "
        f"Then write a short summary: total rows, column names, and — if there is a numeric "
        f"column called Amount or similar — calculate the total and average."
    )
