"""
MCP Server Base and Tools Manager

Provides base classes and utilities for MCP server implementations.
"""

import json
import uuid
from typing import Dict, Any, List, Optional, Callable
from functools import wraps
from datetime import datetime


def async_tool(description: str = ""):
    """Decorator for async MCP tools."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                result = await func(*args, **kwargs)
                return json.dumps({
                    "success": True,
                    "data": result,
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                return json.dumps({
                    "success": False,
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                })
        wrapper.__doc__ = description or func.__doc__
        return wrapper
    return decorator


class ToolRegistry:
    """Registry for managing MCP tools."""
    
    def __init__(self):
        self.tools = {}
    
    def register(self, name: str, func: Callable, description: str = ""):
        """Register a tool."""
        self.tools[name] = {
            "func": func,
            "description": description,
            "name": name
        }
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all registered tools."""
        return list(self.tools.values())


class MCPServerBase:
    """Base class for MCP servers."""
    
    def __init__(self, name: str):
        self.name = name
        self.registry = ToolRegistry()
        self._setup_tools()
    
    def _setup_tools(self):
        """Setup tools. Override in subclass."""
        pass
    
    def get_tools(self):
        """Get all tools."""
        return self.registry.get_all()


class DataValidator:
    """Validates data before operations."""
    
    @staticmethod
    def validate_table_data(table_name: str, headers: List[str], data: Dict) -> tuple[bool, str]:
        """Validate table data."""
        if not table_name or not table_name.strip():
            return False, "Table name cannot be empty"
        
        if not headers or not isinstance(headers, list):
            return False, "Headers must be a non-empty list"
        
        if not all(isinstance(h, str) for h in headers):
            return False, "All headers must be strings"
        
        # Validate data keys match headers (if data provided)
        if data:
            data_keys = set(data.keys())
            header_keys = set(headers)
            if not data_keys.issubset(header_keys):
                return False, f"Data keys don't match headers. Extra keys: {data_keys - header_keys}"
        
        return True, "Valid"
    
    @staticmethod
    def validate_row_data(row_data: Dict, headers: List[str]) -> tuple[bool, str]:
        """Validate row data against headers."""
        if not isinstance(row_data, dict):
            return False, "Row data must be a dictionary"
        
        # Add generated ID if not present
        if 'id' not in row_data:
            row_data['id'] = str(uuid.uuid4())[:8]
        
        return True, "Valid"


class OperationLogger:
    """Logs all operations for audit trail."""
    
    def __init__(self):
        self.operations = []
    
    def log_operation(
        self,
        operation_type: str,
        user_id: int,
        details: Dict[str, Any],
        success: bool
    ):
        """Log an operation."""
        self.operations.append({
            "timestamp": datetime.now().isoformat(),
            "type": operation_type,
            "user_id": user_id,
            "details": details,
            "success": success
        })
    
    def get_operations(self, limit: int = 100) -> List[Dict]:
        """Get recent operations."""
        return self.operations[-limit:]


class ResponseBuilder:
    """Builds standardized responses."""
    
    @staticmethod
    def success(message: str, data: Any = None, steps: List[Dict] = None) -> str:
        """Build success response."""
        response = {
            "success": True,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        
        if data is not None:
            response["data"] = data
        
        if steps:
            response["steps"] = steps
        
        return json.dumps(response)
    
    @staticmethod
    def error(message: str, error: str = "", code: int = 400) -> str:
        """Build error response."""
        return json.dumps({
            "success": False,
            "message": message,
            "error": error,
            "code": code,
            "timestamp": datetime.now().isoformat()
        })
    
    @staticmethod
    def not_found(resource_type: str, identifier: Any) -> str:
        """Build not found response."""
        return ResponseBuilder.error(
            f"{resource_type} not found",
            f"Could not find {resource_type.lower()} with identifier: {identifier}",
            404
        )
