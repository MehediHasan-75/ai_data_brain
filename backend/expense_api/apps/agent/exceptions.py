"""
Custom exceptions for the Agent application.
"""


class AgentException(Exception):
    """Base exception for Agent app."""
    pass


class AuthenticationError(AgentException):
    """Raised when authentication fails."""
    pass


class ValidationError(AgentException):
    """Raised when validation fails."""
    pass


class ChatSessionNotFound(AgentException):
    """Raised when chat session is not found."""
    pass


class ChatMessageNotFound(AgentException):
    """Raised when chat message is not found."""
    pass


class MCPClientError(AgentException):
    """Raised when MCP client encounters an error."""
    pass


class QueryProcessingError(AgentException):
    """Raised when query processing fails."""
    pass


class PermissionDenied(AgentException):
    """Raised when user doesn't have permission."""
    pass
