# Agent App Refactoring - Modular & Industry Standard Architecture

## Overview

The Agent app has been refactored to follow industry-standard Django best practices and achieve better modularity, testability, and maintainability.

---

## New Structure

```
agent/
├── __init__.py
├── apps.py
├── constants.py          # 🆕 Centralized configuration and constants
├── exceptions.py         # 🆕 Custom exception classes
├── managers.py           # 🆕 Database managers for models
├── models.py             # ✏️ UPDATED: Uses managers and constants
├── serializers.py        # ✅ Existing serializers
├── services.py           # 🆕 Business logic layer
├── utils.py              # 🆕 Utility functions and decorators
├── views_new.py          # 🆕 Refactored views (cleaner, modular)
├── urls_new.py           # 🆕 Better URL organization
├── client/
│   ├── client.py         # MCP client implementation
│   └── mcpConfig.json
├── servers/
│   ├── finance_mcp_server.py
│   └── test_server.py
└── migrations/
```

---

## Key Improvements

### 1. **Separation of Concerns**

**Before:**
- Views handled authentication, validation, business logic, and response formatting all in one place
- Hard to test individual components
- Code duplication across views

**After:**
- **Views**: Only handle HTTP request/response
- **Services**: Contain business logic
- **Models**: Define data with managers for complex queries
- **Serializers**: Handle validation and data transformation
- **Utils**: Reusable functions and decorators
- **Constants**: Centralized configuration

### 2. **Custom Managers** (`managers.py`)

```python
# Easy, reusable queries
ChatSession.objects.get_user_active_sessions(user)
ChatMessage.objects.get_session_messages(session)
ChatMessage.objects.create_message(session, user, text, sender)
```

**Benefits:**
- Encapsulates complex queries
- Reusable across views and services
- Easier to test query logic
- Single place to optimize queries

### 3. **Service Layer** (`services.py`)

Three main services:

#### **ChatSessionService**
- `get_user_sessions(user, is_active=None)` - Get user's sessions
- `get_session(session_id, user)` - Get with permission check
- `create_session(user, title)` - Create new session
- `delete_session(session_id, user)` - Delete session
- `update_session(session_id, user, **kwargs)` - Update session

#### **ChatMessageService**
- `get_session_messages(session_id, user, limit=50)` - Get messages
- `get_message(message_id, user)` - Get single message with permission check
- `create_message(session_id, user, text, sender, agent_data)` - Create message

#### **AgentQueryService**
- `process_query(query_data)` - Process query synchronously
- `process_query_async(query_data)` - Process asynchronously
- `process_and_save_query(session_id, user, query_text, **data)` - Process and save
- `_clean_response(response_obj)` - Clean response format

**Benefits:**
- Business logic isolated from HTTP layer
- Easy to reuse in management commands, tasks, etc.
- Unit testable
- Transaction management built-in
- Consistent error handling

### 4. **Custom Exceptions** (`exceptions.py`)

```python
from .exceptions import (
    AgentException,
    ChatSessionNotFound,
    ChatMessageNotFound,
    PermissionDenied,
    QueryProcessingError,
)
```

**Benefits:**
- Specific exception handling
- Clear error semantics
- Consistent error responses
- Easy to catch specific errors

### 5. **Constants & Configuration** (`constants.py`)

```python
ERROR_MESSAGES = {
    'AUTH_FAILED': "...",
    'SESSION_NOT_FOUND': "...",
}

AGENT_CONFIG = {
    'DEFAULT_TIMEOUT': 30,
    'MAX_RETRIES': 3,
}
```

**Benefits:**
- Single source of truth for constants
- Easy to update messages/config
- No magic strings scattered in code
- Better for internationalization (i18n)

### 6. **Utility Functions & Decorators** (`utils.py`)

```python
@handle_exceptions
def get(self, request):
    """Automatically handles all exceptions."""
    pass
```

**Benefits:**
- Reusable error handling
- DRY principle
- Consistent error responses
- Less boilerplate

### 7. **Refactored Views** (`views_new.py`)

**Before:**
- 500+ lines in single views.py
- Mixed concerns (HTTP + business logic)
- Repeated error handling
- Hard to find specific functionality

**After:**
```python
class BaseAgentView(APIView):
    """Common auth and error handling"""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

class AgentQueryView(BaseAgentView):
    """Process agent queries only"""
    
class ChatSessionListView(BaseAgentView):
    """Manage sessions only"""

class ChatMessageListView(BaseAgentView):
    """Manage messages only"""
```

**Benefits:**
- Single responsibility per view
- Cleaner, more readable code
- Easier to add new endpoints
- Better for team collaboration

### 8. **Better URL Organization** (`urls_new.py`)

```python
urlpatterns = [
    # Agent query endpoints
    path('query/', AgentQueryView.as_view(), name='query'),
    
    # Chat session endpoints
    path('sessions/', ChatSessionListView.as_view(), name='session-list'),
    path('sessions/<str:session_id>/', ChatSessionDetailView.as_view(), name='session-detail'),
    
    # Chat message endpoints
    path('sessions/<str:session_id>/messages/', ChatMessageListView.as_view(), name='message-list'),
    path('messages/<str:message_id>/', ChatMessageDetailView.as_view(), name='message-detail'),
]
```

---

## Migration Guide

### Step 1: Backup Current State
```bash
git add -A
git commit -m "backup: before agent app refactoring"
```

### Step 2: Update Main URLs
```python
# expense_api/urls.py

# OLD
path('agent/', include('expense_api.apps.agent.urls')),

# NEW
path('agent/', include('expense_api.apps.agent.urls_new')),
```

### Step 3: Run Migrations (if needed)
```bash
python manage.py makemigrations agent
python manage.py migrate agent
```

### Step 4: Test the New API
```bash
# Test agent query
curl -X POST http://localhost:8000/agent/query/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "List my tables"}'

# List sessions
curl -X GET http://localhost:8000/agent/sessions/ \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create session
curl -X POST http://localhost:8000/agent/sessions/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title": "My Chat"}'
```

### Step 5: Update Frontend (if needed)
Ensure frontend uses new endpoints:
- `/agent/query/` - POST queries
- `/agent/sessions/` - GET/POST sessions
- `/agent/sessions/{id}/` - GET/PATCH/DELETE session
- `/agent/sessions/{id}/messages/` - GET/POST messages
- `/agent/messages/{id}/` - GET/DELETE message

---

## Usage Examples

### In Views
```python
from .services import ChatSessionService, AgentQueryService

# Get user's active sessions
sessions = ChatSessionService.get_user_active_sessions(request.user)

# Create a session
session = ChatSessionService.create_session(request.user, "New Chat")

# Process query
response = AgentQueryService.process_query({
    'user_id': request.user.id,
    'query': 'What are my expenses?'
})
```

### In Management Commands
```python
from django.core.management.base import BaseCommand
from agent.services import AgentQueryService

class Command(BaseCommand):
    def handle(self, *args, **options):
        response = AgentQueryService.process_query({
            'user_id': 1,
            'query': 'Summarize my data'
        })
        print(response)
```

### In Tests
```python
from django.test import TestCase
from agent.services import ChatSessionService
from django.contrib.auth.models import User

class ChatSessionServiceTests(TestCase):
    def test_create_session(self):
        user = User.objects.create_user('test', 'test@test.com', 'pass')
        session = ChatSessionService.create_session(user, "Test")
        assert session.user == user
        assert session.title == "Test"
```

---

## Testing Strategy

### Unit Tests
```python
# test_services.py
class ChatSessionServiceTests(TestCase):
    def test_get_user_sessions(self):
        # Test service layer
        
    def test_create_session(self):
        # Test session creation
```

### Integration Tests
```python
# test_views.py
class AgentQueryViewTests(APITestCase):
    def test_query_endpoint(self):
        # Test full request/response cycle
```

### Test Utilities
```python
# tests/factories.py
class UserFactory:
    @staticmethod
    def create_user():
        return User.objects.create_user(...)

class ChatSessionFactory:
    @staticmethod
    def create_session(user=None):
        user = user or UserFactory.create_user()
        return ChatSessionService.create_session(user)
```

---

## Logging

The app includes logging throughout:

```python
logger = logging.getLogger(__name__)

logger.info(f"Query processed for user {request.user.id}")
logger.error(f"Error processing query: {str(e)}")
logger.warning(f"Permission denied for user {user.id}")
```

Configure in settings:
```python
LOGGING = {
    'version': 1,
    'loggers': {
        'expense_api.apps.agent': {
            'level': 'INFO',
        },
    },
}
```

---

## Future Improvements

1. **Caching**
   - Cache frequently accessed sessions
   - Invalidate on updates

2. **Async Processing**
   - Use Celery for long-running queries
   - WebSocket support for real-time updates

3. **Rate Limiting**
   - Limit queries per user
   - Prevent abuse

4. **Advanced Permissions**
   - Share sessions with other users
   - Fine-grained access control

5. **Monitoring**
   - Track query performance
   - Monitor MCP client health
   - Alert on errors

---

## File Changes Summary

| File | Status | Changes |
|------|--------|---------|
| `models.py` | ✏️ Updated | Added managers, type hints, docstrings |
| `views.py` | ⚠️ Legacy | Kept for reference (use `views_new.py`) |
| `urls.py` | ⚠️ Legacy | Kept for reference (use `urls_new.py`) |
| `views_new.py` | 🆕 New | Refactored, modular views |
| `urls_new.py` | 🆕 New | Better organized URL patterns |
| `services.py` | 🆕 New | Business logic layer |
| `managers.py` | 🆕 New | Custom database managers |
| `constants.py` | 🆕 New | Centralized constants |
| `exceptions.py` | 🆕 New | Custom exception classes |
| `utils.py` | 🆕 New | Utility functions and decorators |

---

## Questions?

For more information, refer to:
- Django best practices: https://docs.djangoproject.com/en/stable/
- DRF documentation: https://www.django-rest-framework.org/
- Service layer pattern: https://github.com/axilaryapps/django-rest-service-layer
