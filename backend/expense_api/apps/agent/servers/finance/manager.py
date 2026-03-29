"""
FinanceToolsManager — in-process facade over the service layer.

User identity is resolved from the _current_user_id context variable,
never from LLM-controlled parameters. Call _current_user_id.set(user_id)
(via set_current_user in in_process_client) before invoking the agent.
"""
from typing import Optional

from .services import TableService, RowService, SchemaService, QueryService
from .services._base import _current_user_id


class FinanceToolsManager:
    """Stateless facade. Reads user_id from async context on every call."""

    def _uid(self) -> int:
        return _current_user_id.get()

    async def get_user_tables(self) -> str:
        return await TableService.get_user_tables(self._uid())

    async def create_table(self, table_name: str, description: str, headers) -> str:
        return await TableService.create_table(self._uid(), table_name, description, headers)

    async def update_table_metadata(
        self,
        table_id: int,
        table_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        return await TableService.update_table_metadata(self._uid(), table_id, table_name, description)

    async def delete_table(self, table_id: int) -> str:
        return await TableService.delete_table(self._uid(), table_id)

    async def add_table_row(self, table_id: int, row_data) -> str:
        return await RowService.add_table_row(self._uid(), table_id, row_data)

    async def update_table_row(self, table_id: int, row_id: str, new_data) -> str:
        return await RowService.update_table_row(self._uid(), table_id, row_id, new_data)

    async def delete_table_row(self, table_id: int, row_id: str) -> str:
        return await RowService.delete_table_row(self._uid(), table_id, row_id)

    async def add_table_column(self, table_id: int, header: str) -> str:
        return await SchemaService.add_table_column(self._uid(), table_id, header)

    async def delete_table_columns(self, table_id: int, headers_to_remove: list) -> str:
        return await SchemaService.delete_table_columns(self._uid(), table_id, headers_to_remove)

    async def get_table_content(self, table_id: Optional[int] = None) -> str:
        return await QueryService.get_table_content(self._uid(), table_id)
