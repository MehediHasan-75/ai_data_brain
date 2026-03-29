"""
Constants for the Agent application.
"""

# Sender choices
SENDER_CHOICES = [
    ('user', 'User'),
    ('bot', 'Bot'),
]

# Agent configuration
AGENT_CONFIG = {
    'DEFAULT_TIMEOUT': 30,
    'MAX_RETRIES': 3,
    'RETRY_DELAY': 2,
}

# Response limits
RESPONSE_LIMITS = {
    'MAX_RESPONSE_LENGTH': 5000,
    'MESSAGE_PREVIEW_LENGTH': 100,
    'TEXT_TRUNCATION_SUFFIX': '...',
}

# Error messages
ERROR_MESSAGES = {
    'AUTH_FAILED': "Authentication credentials were not provided or are invalid.",
    'INVALID_INPUT': "Invalid input provided.",
    'AGENT_ERROR': "An error occurred while processing your request.",
    'SESSION_NOT_FOUND': "Chat session not found.",
    'MESSAGE_NOT_FOUND': "Message not found.",
    'PERMISSION_DENIED': "You don't have permission to access this resource.",
}

# Success messages
SUCCESS_MESSAGES = {
    'SESSION_CREATED': "Chat session created successfully.",
    'MESSAGE_CREATED': "Message created successfully.",
    'SESSION_DELETED': "Chat session deleted successfully.",
    'MESSAGE_DELETED': "Message deleted successfully.",
}
