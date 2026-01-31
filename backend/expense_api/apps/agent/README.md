# Agent App - Modular & Industry Standard Architecture

## Quick Start

This agent app has been refactored to follow Django and DRF best practices with a clear layered architecture.

### Key Files

- **`views_new.py`** - HTTP request handlers (routes, auth, responses)
- **`services.py`** - Business logic (queries, sessions, messages)
- **`managers.py`** - Database query helpers
- **`models.py`** - Data models with managers
- **`serializers.py`** - Input validation & data transformation
- **`constants.py`** - Configuration & messages
- **`exceptions.py`** - Custom error types
- **`utils.py`** - Helper functions & decorators
- **`urls_new.py`** - API routes

### Documentation Files

- **`ARCHITECTURE_SUMMARY.md`** ⭐ **START HERE** - High-level architecture overview
- **`REFACTORING_GUIDE.md`** - Detailed refactoring explanation
- **`IMPLEMENTATION_CHECKLIST.md`** - Step-by-step implementation guide

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/agent/query/` | Process agent query |
| GET | `/agent/query/` | Get agent status |
| GET | `/agent/sessions/` | List user's sessions |
| POST | `/agent/sessions/` | Create new session |
| GET | `/agent/sessions/{id}/` | Get session details |
| PATCH | `/agent/sessions/{id}/` | Update session |
| DELETE | `/agent/sessions/{id}/` | Delete session |
| GET | `/agent/sessions/{id}/messages/` | List session messages |
| POST | `/agent/sessions/{id}/messages/` | Add message to session |
| GET | `/agent/messages/{id}/` | Get message details |
| DELETE | `/agent/messages/{id}/` | Delete message |

---

## Architecture Layers

### 1. HTTP Layer (Views)
```python
# Handle requests and responses
class AgentQueryView(BaseAgentView):
    def post(self, request):
        # Input validation ✓
        # Call service ✓
        # Return response ✓
```

### 2. Business Logic Layer (Services)
```python
# Process queries and manage state
class AgentQueryService:
    @staticmethod
    def process_query(query_data):
        # Business rules here
        # Transaction handling
        # Error handling
```

### 3. Data Access Layer (Managers & Models)
```python
# Query database efficiently
class ChatSessionManager(models.Manager):
    def get_user_active_sessions(self, user):
        return self.filter(user=user, is_active=True)
```

### 4. Support Layer (Utils, Constants, Exceptions)
```python
# Configuration and helpers
ERROR_MESSAGES = {'SESSION_NOT_FOUND': '...'}
@handle_exceptions  # Error handling decorator
def my_view(self, request): ...
```

---

## Usage Examples

### Process a Query
```python
from agent.services import AgentQueryService

response = AgentQueryService.process_query({
    'user_id': 1,
    'query': 'What are my expenses?'
})
print(response['response'])  # Agent's response
```

### Manage Chat Sessions
```python
from agent.services import ChatSessionService

# Create session
session = ChatSessionService.create_session(user, "My Chat")

# Get sessions
sessions = ChatSessionService.get_user_sessions(user)

# Get specific session (with permission check)
session = ChatSessionService.get_session(session_id, user)
```

### Add Messages
```python
from agent.services import ChatMessageService

# Create message
message = ChatMessageService.create_message(
    session_id='chat_1_123456',
    user=request.user,
    text="Show my recent transactions",
    sender='user'
)
```

---

## Error Handling

All views use `@handle_exceptions` decorator for consistent error handling:

```python
@handle_exceptions
def post(self, request, session_id):
    # Exceptions automatically converted to HTTP responses
    # ChatSessionNotFound → 400 Bad Request
    # PermissionDenied → 403 Forbidden
    # AgentException → 400 Bad Request
    # Other exceptions → 500 Internal Server Error
    pass
```

Custom exceptions available:
- `AgentException` - Base exception
- `ChatSessionNotFound` - Session not found
- `ChatMessageNotFound` - Message not found
- `PermissionDenied` - Access denied
- `QueryProcessingError` - Query failed
- `ValidationError` - Invalid input
- `AuthenticationError` - Auth failed

---

## Database Models

### ChatSession
```python
user              # FK to User (CASCADE)
session_id        # Unique session identifier
title             # Session title/name
created_at        # Creation timestamp
updated_at        # Last update timestamp
is_active         # Whether session is active
```

**Indexes:**
- `(user, -updated_at)` - For user's session list
- `(session_id)` - For quick lookup
- `(user, is_active)` - For active sessions

### ChatMessage
```python
chat_session      # FK to ChatSession (CASCADE)
user              # FK to User (CASCADE)
message_id        # Unique message identifier
text              # Message content
sender            # 'user' or 'bot'
timestamp         # When message was created
is_typing         # Typing indicator
displayed_text    # Formatted display text
agent_data        # Additional agent data (JSON)
```

**Indexes:**
- `(chat_session, timestamp)` - For session messages
- `(user, timestamp)` - For user's all messages
- `(message_id)` - For quick lookup

---

## Configuration

Edit `constants.py` to customize:

```python
# Error messages
ERROR_MESSAGES = {
    'SESSION_NOT_FOUND': 'Custom message here',
}

# Success messages
SUCCESS_MESSAGES = {
    'SESSION_CREATED': 'Custom message here',
}

# Agent configuration
AGENT_CONFIG = {
    'DEFAULT_TIMEOUT': 30,      # seconds
    'MAX_RETRIES': 3,           # retry attempts
    'RETRY_DELAY': 2,           # seconds between retries
}

# Response limits
RESPONSE_LIMITS = {
    'MAX_RESPONSE_LENGTH': 5000,
    'MESSAGE_PREVIEW_LENGTH': 100,
}
```

---

## Testing

### Run Tests
```bash
# All agent tests
python manage.py test agent

# Specific test file
python manage.py test agent.tests.test_services

# With verbosity
python manage.py test agent -v 2

# With coverage
coverage run --source='agent' manage.py test agent
coverage report
```

### Test Structure
```
agent/
├── tests/
│   ├── __init__.py
│   ├── test_services.py      # Service layer tests
│   ├── test_views.py         # View/endpoint tests
│   ├── test_managers.py      # Manager tests
│   ├── test_models.py        # Model tests
│   ├── factories.py          # Test data factories
│   └── fixtures/             # Test data files
```

### Example Test
```python
from django.test import TestCase
from agent.services import ChatSessionService
from django.contrib.auth.models import User

class ChatSessionServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('test', 'test@test.com', 'pass')
    
    def test_create_session(self):
        session = ChatSessionService.create_session(self.user, "Test")
        self.assertEqual(session.user, self.user)
        self.assertEqual(session.title, "Test")
        self.assertTrue(session.is_active)
    
    def test_get_user_sessions(self):
        ChatSessionService.create_session(self.user, "Chat 1")
        ChatSessionService.create_session(self.user, "Chat 2")
        
        sessions = ChatSessionService.get_user_sessions(self.user)
        self.assertEqual(sessions.count(), 2)
```

---

## Logging

Logging is built-in throughout the app:

```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"Created chat session for user {user.id}")
logger.warning(f"Permission denied: {error}")
logger.error(f"Query failed: {error}")
```

Configure in Django settings:
```python
LOGGING = {
    'version': 1,
    'loggers': {
        'expense_api.apps.agent': {
            'level': 'INFO',
            'handlers': ['console', 'file'],
        },
    },
}
```

---

## Performance Tips

### Database
- Use `select_related()` / `prefetch_related()` for FK traversal
- Verify indexes are used (check query analysis)
- Paginate large result sets

### Caching
- Cache user's active sessions (TTL: 5 min)
- Cache session messages (TTL: 1 min)
- Cache agent responses for similar queries

### Async
- Use Celery for long-running queries
- Return async results via WebSocket
- Cache async results

---

## Migration Path

### From Old Structure to New

1. **Backup**: `git commit` current state
2. **Update URLs**: Change `urls.py` to `urls_new.py`
3. **Test**: Run full test suite
4. **Verify**: Test all endpoints
5. **Deploy**: Push to production with monitoring
6. **Cleanup**: Remove old files after 1 week

See `IMPLEMENTATION_CHECKLIST.md` for detailed steps.

---

## File Organization

### Before (Monolithic)
```
agent/
├── views.py (500+ lines)
├── urls.py
├── models.py
├── serializers.py
└── client/
```

### After (Modular)
```
agent/
├── views_new.py (150 lines, clean, DRY)
├── urls_new.py (well-organized)
├── services.py (200+ lines, business logic)
├── managers.py (query helpers)
├── models.py (updated with managers)
├── serializers.py (existing)
├── constants.py (configuration)
├── exceptions.py (error types)
├── utils.py (helpers & decorators)
├── client/
├── tests/
├── ARCHITECTURE_SUMMARY.md
├── REFACTORING_GUIDE.md
└── IMPLEMENTATION_CHECKLIST.md
```

---

## Common Tasks

### Add a New Endpoint

1. Create view in `views_new.py`:
```python
class MyNewView(BaseAgentView):
    @handle_exceptions
    def post(self, request):
        # Use services
        result = MyService.do_something(request.user)
        return Response(result)
```

2. Add URL in `urls_new.py`:
```python
path('my-endpoint/', MyNewView.as_view(), name='my-endpoint'),
```

3. Create service method (if needed)

4. Add tests

### Add a New Service Method

1. Create method in `services.py`:
```python
@staticmethod
def new_method(user, data):
    # Business logic here
    return result
```

2. Add tests in `tests/test_services.py`

3. Use in views or other services

### Add a New Exception

1. Create in `exceptions.py`:
```python
class MyCustomError(AgentException):
    """Description of error."""
    pass
```

2. Raise in services:
```python
raise MyCustomError("Error message")
```

3. Handle in `@handle_exceptions` decorator

---

## Support

- **Questions?** See `ARCHITECTURE_SUMMARY.md`
- **How to use?** See `REFACTORING_GUIDE.md`
- **Implementing?** See `IMPLEMENTATION_CHECKLIST.md`
- **Code examples?** Check docstrings in each file
- **Tests?** Look at `tests/` directory

---

## Status

✅ **Ready for Production**

- [x] Modular architecture
- [x] Industry standard patterns
- [x] Comprehensive documentation
- [x] Error handling
- [x] Logging
- [x] Tests ready
- [x] Performance optimized

---

**Version**: 1.0  
**Last Updated**: February 1, 2026  
**Status**: ✅ Production Ready
