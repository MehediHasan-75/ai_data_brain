"""
Finance MCP package.

Safe to import only after Django has been configured.
Exports tools_mgr and _current_user_id for use by in_process_client.
"""
from .services._base import _current_user_id
from .manager import FinanceToolsManager

tools_mgr = FinanceToolsManager()

__all__ = ["tools_mgr", "_current_user_id"]
