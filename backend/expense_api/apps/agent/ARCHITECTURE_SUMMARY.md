# Agent App Modular Architecture - Summary

## What Changed?

The agent app has been refactored from a monolithic structure to a **modular, industry-standard Django application** following clean architecture principles.

---

## New Architecture Layers

```
┌─────────────────────────────────────┐
│     HTTP Layer (Views)              │  Handle requests/responses
│  - AgentQueryView                   │  - Input validation
│  - ChatSessionListView              │  - Permission checks
│  - ChatMessageListView              │  - Response formatting
└────────────────┬────────────────────┘
                 │ calls
┌────────────────▼────────────────────┐
│     Business Logic (Services)       │  Process queries
│  - ChatSessionService               │  - Manage sessions
│  - ChatMessageService               │  - Process messages
│  - AgentQueryService                │  - Handle agent logic
└────────────────┬────────────────────┘
                 │ uses
┌────────────────▼────────────────────┐
│    Data Access (Managers + Models)  │  Query & store data
│  - ChatSessionManager               │  - Custom queries
│  - ChatMessageManager               │  - Optimized lookups
│  - ChatSession Model                │  - Business rules
│  - ChatMessage Model                │
└────────────────┬────────────────────┘
                 │ uses
┌────────────────▼────────────────────┐
│     Infrastructure Layer            │  Configuration
│  - Database                         │  - Constants
│  - MCP Client                       │  - Exceptions
│  - Settings                         │  - Utils
└─────────────────────────────────────┘
```

---

## File Organization

### Core Files (New/Updated)

| File | Purpose | Status |
|------|---------|--------|
| `services.py` | Business logic (ChatSessionService, ChatMessageService, AgentQueryService) | 🆕 **New** |
| `managers.py` | Database query managers for models | 🆕 **New** |
| `constants.py` | Centralized constants, error/success messages | 🆕 **New** |
| `exceptions.py` | Custom exception classes for error handling | 🆕 **New** |
| `utils.py` | Utility functions, decorators, helpers | 🆕 **New** |
| `views_new.py` | Refactored views (cleaner, DRY) | 🆕 **New** |
| `urls_new.py` | Organized URL patterns with app_name | 🆕 **New** |
| `models.py` | Updated with managers and type hints | ✏️ **Updated** |

### Legacy Files (Keep for Reference)

- `views.py` - Old monolithic views (can be removed after verification)
- `urls.py` - Old URL patterns (can be removed after verification)

---

## Key Benefits

### 1. **Modularity**
- Each component has a single responsibility
- Easy to test individual pieces
- Easy to reuse code (services in multiple contexts)

### 2. **Maintainability**
- Clear separation between layers
- Easy to find and modify functionality
- Consistent patterns throughout app

### 3. **Testability**
- Services can be unit tested without HTTP requests
- Models have methods that are easily testable
- Mock external dependencies easily

### 4. **Scalability**
- Can use services in Celery tasks
- Easy to add new endpoints
- Ready for microservices migration

### 5. **Code Quality**
- Type hints for better IDE support
- Comprehensive logging
- Centralized error handling
- DRY principle throughout

---

## How to Use

### For Frontend Developers

Use these API endpoints:

```bash
# Query Agent
POST /agent/query/
{
  "query": "What are my recent expenses?"
}

# List Chat Sessions
GET /agent/sessions/?is_active=true

# Create Chat Session
POST /agent/sessions/
{
  "title": "My Chat"
}

# Get Session Messages
GET /agent/sessions/{session_id}/messages/?limit=50

# Add Message to Session
POST /agent/sessions/{session_id}/messages/
{
  "text": "Show my expenses"
}
```

### For Backend Developers

Use services directly:

```python
from agent.services import ChatSessionService, AgentQueryService

# List sessions
sessions = ChatSessionService.get_user_sessions(user)

# Create session
session = ChatSessionService.create_session(user, "Title")

# Process query
response = AgentQueryService.process_query({
    'user_id': user.id,
    'query': 'What are my expenses?'
})
```

### For Testing

```python
from agent.services import ChatSessionService
from agent.models import ChatSession
from agent.exceptions import ChatSessionNotFound

def test_session_creation():
    session = ChatSessionService.create_session(user, "Test")
    assert session.user == user
    assert session.title == "Test"

def test_session_not_found():
    with pytest.raises(ChatSessionNotFound):
        ChatSessionService.get_session("invalid", user)
```

---

## Migration Steps

### Step 1: Update Main URLs
```python
# In expense_api/urls.py

# Change from:
path('agent/', include('expense_api.apps.agent.urls')),

# To:
path('agent/', include('expense_api.apps.agent.urls_new')),
```

### Step 2: Test in Development
```bash
# Run tests
python manage.py test agent

# Test endpoints
curl -X GET http://localhost:8000/agent/sessions/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 3: Verify Frontend Works
- Test API endpoints with frontend
- Check WebSocket connections (if using)
- Verify authentication works

### Step 4: Cleanup (Optional)
```bash
# After verification, optionally remove old files
rm expense_api/apps/agent/views.py  # Old views
rm expense_api/apps/agent/urls.py   # Old urls
mv expense_api/apps/agent/views_new.py expense_api/apps/agent/views.py
mv expense_api/apps/agent/urls_new.py expense_api/apps/agent/urls.py
```

---

## Architecture Decisions

### Why Managers?
- **Centralized queries**: All complex queries in one place
- **Reusable**: Can use from services, management commands, etc.
- **Testable**: Easy to test query logic
- **Performant**: Single place to optimize queries

### Why Services?
- **Business logic separation**: HTTP layer doesn't know business rules
- **Reusability**: Same code used in views, Celery tasks, management commands
- **Transaction management**: Atomic operations handled here
- **Error handling**: Consistent error handling across app

### Why Constants?
- **No magic strings**: All messages in one place
- **Easier i18n**: Can translate all messages at once
- **DRY principle**: Change message once, used everywhere
- **Configuration**: All app config in one file

### Why Exceptions?
- **Specific error handling**: Catch specific errors, not generic ones
- **Semantic**: Code is self-documenting (AgentException, ChatSessionNotFound)
- **Consistent responses**: Caught by decorators for standard HTTP responses

### Why Base View?
- **DRY authentication**: Set auth classes once
- **Consistent error handling**: Use @handle_exceptions decorator
- **Standard response format**: All views respond similarly

---

## Error Handling Flow

```
View receives request
    ↓
@handle_exceptions decorator catches errors
    ↓
Try to process request (calls service)
    ↓
Service raises specific exception (ChatSessionNotFound, PermissionDenied, etc.)
    ↓
@handle_exceptions catches and converts to HTTP response
    ↓
Return standard error response with status code
```

Example:
```python
@handle_exceptions
def get(self, request, session_id):
    session = ChatSessionService.get_session(session_id, request.user)
    # If not found: ChatSessionNotFound → 400 Bad Request
    # If wrong user: PermissionDenied → 403 Forbidden
    serializer = ChatSessionSerializer(session)
    return Response(serializer.data)
```

---

## Logging

All services log important events:

```python
logger.info(f"Created chat session {session.session_id} for user {user.id}")
logger.error(f"Error processing query: {str(e)}")
logger.warning(f"Permission denied: user tried to access another user's data")
```

Check logs in production to monitor:
- Query failures
- Permission violations
- Performance issues
- User activity

---

## Performance Optimizations Built-In

### Database Queries
- Models have indexes on frequently-queried fields
- Managers use select_related/prefetch_related
- Pagination support in list endpoints

### Response Format
- Configurable message truncation (100 chars default)
- Optional fields in serializers
- Only requested fields returned

### Caching Ready
- Can easily add Redis caching to services
- Session lookup can be cached
- Message fetch can be cached

---

## Next Steps

### Immediate (Week 1)
1. Review refactoring guide
2. Update main URLs
3. Test endpoints
4. Update frontend if needed

### Short Term (Week 2-3)
1. Add unit tests for services
2. Add integration tests for views
3. Document any custom logic
4. Train team on new structure

### Medium Term (Month 1-2)
1. Add caching layer
2. Implement rate limiting
3. Add WebSocket support
4. Monitoring and alerts

### Long Term (Future)
1. Split into microservices
2. Add async task processing
3. GraphQL API support
4. Mobile app support

---

## Support & Questions

For questions about:
- **Architecture**: See REFACTORING_GUIDE.md
- **Services**: See services.py docstrings
- **Models**: See models.py docstrings
- **Views**: See views_new.py docstrings
- **Testing**: Create test_services.py and test_views.py
- **Exceptions**: See exceptions.py for custom exceptions

---

## Quick Reference

### Services API

```python
# Chat Sessions
ChatSessionService.get_user_sessions(user)
ChatSessionService.get_session(session_id, user)
ChatSessionService.create_session(user, title)
ChatSessionService.delete_session(session_id, user)
ChatSessionService.update_session(session_id, user, **kwargs)

# Chat Messages
ChatMessageService.get_session_messages(session_id, user, limit=50)
ChatMessageService.get_message(message_id, user)
ChatMessageService.create_message(session_id, user, text, sender, agent_data)

# Agent Queries
AgentQueryService.process_query(query_data)
AgentQueryService.process_and_save_query(session_id, user, query_text, **data)
```

### URL Patterns

```
POST   /agent/query/                          # Process query
GET    /agent/sessions/                       # List sessions
POST   /agent/sessions/                       # Create session
GET    /agent/sessions/{id}/                  # Get session
PATCH  /agent/sessions/{id}/                  # Update session
DELETE /agent/sessions/{id}/                  # Delete session
GET    /agent/sessions/{id}/messages/         # List messages
POST   /agent/sessions/{id}/messages/         # Add message
GET    /agent/messages/{id}/                  # Get message
DELETE /agent/messages/{id}/                  # Delete message
```

---

**Version**: 1.0  
**Last Updated**: February 1, 2026  
**Status**: ✅ Ready for Integration
