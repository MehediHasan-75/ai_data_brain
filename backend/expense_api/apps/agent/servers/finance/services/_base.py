"""Shared utilities for finance services."""
import contextvars

from expense_api.apps.FinanceManagement.models import DynamicTableData

# Holds the authenticated user's ID for the current async context.
# Must be set via _current_user_id.set(user_id) before invoking any tool.
_current_user_id: contextvars.ContextVar[int] = contextvars.ContextVar(
    "_current_user_id", default=1
)


async def owns_table(table_id: int, user_id: int) -> bool:
    """Return True if user_id is the owner of table_id."""
    return await DynamicTableData.objects.filter(id=table_id, user_id=user_id).aexists()
