"""
Utility functions for the Agent application.
"""

import logging
import re
from typing import Dict, Any, Optional
from functools import wraps

from rest_framework.response import Response
from rest_framework import status

from .exceptions import AgentException
from .constants import ERROR_MESSAGES

logger = logging.getLogger(__name__)


def handle_exceptions(view_func):
    """Decorator to handle exceptions in views."""
    @wraps(view_func)
    def wrapper(self, request, *args, **kwargs):
        try:
            return view_func(self, request, *args, **kwargs)
        except AgentException as e:
            logger.warning(f"Agent exception: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except PermissionError as e:
            logger.warning(f"Permission denied: {str(e)}")
            return Response(
                {'error': ERROR_MESSAGES['PERMISSION_DENIED']},
                status=status.HTTP_403_FORBIDDEN
            )
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return Response(
                {'error': ERROR_MESSAGES['AGENT_ERROR']},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    return wrapper


def truncate_text(text: str, max_length: int, suffix: str = "...") -> str:
    """Truncate text to specified length."""
    if len(text) > max_length:
        return text[:max_length - len(suffix)] + suffix
    return text


def extract_text_summary(text: str, max_length: int = 100) -> str:
    """Extract a summary of text."""
    return truncate_text(text, max_length)


def format_response(data: Dict[str, Any], success: bool = True) -> Dict[str, Any]:
    """Format a standard response."""
    return {
        'success': success,
        'data': data,
    }


def format_error_response(error: str) -> Dict[str, Any]:
    """Format an error response."""
    return {
        'success': False,
        'error': error,
    }


def clean_step_markers(text: str) -> str:
    """Remove step markers from text."""
    step_pattern = r'^\*?\*?Step \d+:?\*?\*?\s*'
    return re.sub(step_pattern, '', text)


def extract_json_from_response(response_text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from response text."""
    import json
    try:
        # Try to find JSON in response
        json_pattern = r'\{.*\}'
        match = re.search(json_pattern, response_text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        pass
    return None


def validate_query(query: str, min_length: int = 1) -> bool:
    """Validate query input."""
    if not query or len(query.strip()) < min_length:
        return False
    return True
