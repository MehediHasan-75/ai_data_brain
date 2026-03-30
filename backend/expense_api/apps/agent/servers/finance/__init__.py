"""
Finance MCP package.

Safe to import only after Django has been configured.
Exports tools_mgr and _current_user_id for use by in_process_client.
"""

# Lazy-load the _current_user_id to avoid importing models too early
_current_user_id = None
tools_mgr = None

def get_current_user_id():
    global _current_user_id
    if _current_user_id is None:
        from .services._base import _current_user_id as _uid
        _current_user_id = _uid
    return _current_user_id

def get_tools_mgr():
    global tools_mgr
    if tools_mgr is None:
        from .manager import FinanceToolsManager
        tools_mgr = FinanceToolsManager()
    return tools_mgr

__all__ = ["get_tools_mgr", "get_current_user_id"]