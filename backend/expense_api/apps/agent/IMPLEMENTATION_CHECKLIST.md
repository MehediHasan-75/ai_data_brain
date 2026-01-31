# Agent App Refactoring - Implementation Checklist

## Pre-Implementation

- [ ] Review ARCHITECTURE_SUMMARY.md
- [ ] Review REFACTORING_GUIDE.md
- [ ] Back up current code
  ```bash
  git add -A
  git commit -m "backup: before agent app refactoring"
  ```
- [ ] Verify tests pass with current code
  ```bash
  python manage.py test agent
  ```

---

## Phase 1: Integration (Day 1)

### Update URLs
- [ ] Update main `expense_api/urls.py`:
  ```python
  # Change:
  path('agent/', include('expense_api.apps.agent.urls')),
  # To:
  path('agent/', include('expense_api.apps.agent.urls_new')),
  ```

### Verify Imports
- [ ] Check models.py imports correctly
- [ ] Check views_new.py imports correctly
- [ ] Check services.py imports correctly
- [ ] Run lint check:
  ```bash
  python -m flake8 expense_api/apps/agent/
  ```

### Basic Testing
- [ ] Start development server
  ```bash
  python manage.py runserver
  ```
- [ ] Test GET /agent/query/ endpoint (should return 200 with status)
- [ ] Check for import errors in console

---

## Phase 2: Endpoint Testing (Day 1-2)

### Test Agent Query Endpoint
- [ ] POST /agent/query/ with valid query
  ```bash
  curl -X POST http://localhost:8000/agent/query/ \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query": "List my tables"}'
  ```
- [ ] POST /agent/query/ with invalid token (should 401)
- [ ] POST /agent/query/ without query field (should 400)
- [ ] GET /agent/query/ (should return status)

### Test Chat Session Endpoints
- [ ] GET /agent/sessions/ (list sessions)
- [ ] POST /agent/sessions/ (create new session)
- [ ] GET /agent/sessions/{id}/ (get specific session)
- [ ] PATCH /agent/sessions/{id}/ (update session)
- [ ] DELETE /agent/sessions/{id}/ (delete session)

### Test Chat Message Endpoints
- [ ] GET /agent/sessions/{id}/messages/ (list messages)
- [ ] POST /agent/sessions/{id}/messages/ (add message)
- [ ] GET /agent/messages/{id}/ (get message)
- [ ] DELETE /agent/messages/{id}/ (delete message)

### Error Cases
- [ ] Try accessing another user's session (should 403)
- [ ] Try accessing non-existent session (should 400)
- [ ] Try with invalid session ID format (should 400)

---

## Phase 3: Frontend Integration (Day 2-3)

### Verify Compatibility
- [ ] Frontend can authenticate and get token
- [ ] Frontend can call /agent/query/ endpoint
- [ ] Frontend receives expected response format
- [ ] Error messages display correctly

### Test WebSocket (if applicable)
- [ ] Connect to WebSocket endpoint
- [ ] Send/receive messages in real-time
- [ ] Disconnect and reconnect works

### Test UI Components
- [ ] Chat input works
- [ ] Messages display correctly
- [ ] Loading states work
- [ ] Error notifications work
- [ ] Session list refreshes correctly

---

## Phase 4: Database Validation (Day 3)

### Check Data Integrity
- [ ] Run migrations:
  ```bash
  python manage.py makemigrations agent
  python manage.py migrate agent
  ```
- [ ] Verify tables exist and have correct structure
  ```bash
  python manage.py dbshell
  \d agent_chatsession
  \d agent_chatmessage
  ```

### Verify Existing Data
- [ ] Old data still accessible
- [ ] Indexes created correctly
- [ ] No data loss

### Test Managers
- [ ] Verify manager methods work:
  ```python
  from agent.models import ChatSession
  sessions = ChatSession.objects.get_user_active_sessions(user)
  ```

---

## Phase 5: Testing Suite (Day 4-5)

### Unit Tests for Services
- [ ] Create `tests/test_services.py`:
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
      
      def test_get_session_permission(self):
          # Test permission checking
          pass
  ```

- [ ] Create `tests/test_managers.py`:
  ```python
  class ChatSessionManagerTests(TestCase):
      def test_get_user_active_sessions(self):
          # Test manager methods
          pass
  ```

- [ ] Create `tests/test_views.py`:
  ```python
  from rest_framework.test import APITestCase
  
  class AgentQueryViewTests(APITestCase):
      def test_query_endpoint(self):
          # Test full request/response
          pass
  ```

### Run Full Test Suite
- [ ] Run all tests:
  ```bash
  python manage.py test agent --verbosity=2
  ```
- [ ] Verify coverage:
  ```bash
  coverage run --source='agent' manage.py test agent
  coverage report
  ```

---

## Phase 6: Performance Testing (Day 5-6)

### Load Testing
- [ ] Test with 100 concurrent users
  ```bash
  locust -f locustfile.py
  ```
- [ ] Monitor response times
- [ ] Monitor database queries
- [ ] Check for N+1 query problems

### Query Optimization
- [ ] Profile slow queries
- [ ] Verify indexes are used
- [ ] Check database connection pooling

### Memory & CPU
- [ ] Monitor memory usage under load
- [ ] Monitor CPU usage
- [ ] Check for memory leaks

---

## Phase 7: Documentation & Cleanup (Week 2)

### Documentation
- [ ] Update API documentation
- [ ] Add examples to README
- [ ] Document breaking changes (if any)
- [ ] Add deployment notes

### Code Cleanup
- [ ] Remove old files (after verification):
  ```bash
  rm expense_api/apps/agent/views.py
  rm expense_api/apps/agent/urls.py
  ```
- [ ] Or rename:
  ```bash
  mv expense_api/apps/agent/views_new.py expense_api/apps/agent/views.py
  mv expense_api/apps/agent/urls_new.py expense_api/apps/agent/urls.py
  ```

### Update Main URLs
- [ ] If renamed, update main urls.py:
  ```python
  path('agent/', include('expense_api.apps.agent.urls')),
  ```

### Final Verification
- [ ] All tests pass
- [ ] Frontend works
- [ ] Deployment steps verified
- [ ] Team trained

---

## Phase 8: Production Deployment (Week 2-3)

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Database migrations tested
- [ ] Monitoring setup
- [ ] Backup strategy in place
- [ ] Rollback plan documented

### Deployment Steps
- [ ] Pull code to production
- [ ] Run migrations:
  ```bash
  python manage.py migrate agent
  ```
- [ ] Collect static files (if needed):
  ```bash
  python manage.py collectstatic
  ```
- [ ] Restart services:
  ```bash
  systemctl restart gunicorn
  systemctl restart nginx
  ```
- [ ] Verify all endpoints working
- [ ] Monitor error logs
- [ ] Monitor performance metrics

### Post-Deployment
- [ ] Monitor application for 24 hours
- [ ] Check error logs
- [ ] Check performance metrics
- [ ] Get user feedback
- [ ] Document any issues

---

## Testing Checklist

### Functional Testing
- [ ] All endpoints work
- [ ] Authentication works
- [ ] Permissions enforced
- [ ] Errors handled correctly
- [ ] Data saved correctly

### Integration Testing
- [ ] Frontend ↔ Backend communication
- [ ] Database operations
- [ ] External API calls (MCP client)
- [ ] Session management
- [ ] Message threading

### Non-Functional Testing
- [ ] Performance acceptable (<500ms per request)
- [ ] No memory leaks
- [ ] Scalable to 1000+ users
- [ ] Can handle concurrent requests
- [ ] Recovery from failures

### Security Testing
- [ ] Authentication required
- [ ] Authorization enforced
- [ ] No data leakage between users
- [ ] SQL injection prevention
- [ ] CSRF protection

---

## Rollback Plan

If issues occur:

### Step 1: Immediate Rollback
```bash
# Revert code to previous version
git revert HEAD

# Restart services
systemctl restart gunicorn
systemctl restart nginx

# Monitor logs
tail -f /var/log/gunicorn.log
```

### Step 2: Investigate
- [ ] Check error logs
- [ ] Check database state
- [ ] Check user reports
- [ ] Identify root cause

### Step 3: Fix & Redeploy
- [ ] Fix identified issue
- [ ] Test in staging
- [ ] Deploy to production
- [ ] Monitor closely

### Step 4: Communication
- [ ] Notify stakeholders
- [ ] Update status page
- [ ] Document incident
- [ ] Plan preventive measures

---

## Success Metrics

### Performance
- [ ] Response time < 500ms (95th percentile)
- [ ] Database queries < 100ms
- [ ] Memory usage < 500MB
- [ ] CPU usage < 70%

### Reliability
- [ ] 99.9% uptime
- [ ] Zero data loss
- [ ] All errors logged
- [ ] Alerts working

### User Experience
- [ ] No API downtime
- [ ] Error messages clear
- [ ] Features working as expected
- [ ] User feedback positive

---

## Sign-Off

- [ ] QA Manager: _____________________ Date: _______
- [ ] Backend Lead: __________________ Date: _______
- [ ] Frontend Lead: _________________ Date: _______
- [ ] DevOps/Infra: _________________ Date: _______
- [ ] Product Owner: ________________ Date: _______

---

## Post-Implementation Review

### Week 1
- [ ] All systems stable
- [ ] No critical issues
- [ ] Performance metrics good
- [ ] Team feedback positive

### Week 4
- [ ] Code quality metrics improved
- [ ] Test coverage > 80%
- [ ] Documentation complete
- [ ] Team fully trained

### Month 3
- [ ] No regressions
- [ ] Performance consistent
- [ ] New features easy to add
- [ ] Team productivity improved

---

## Notes

```
[Space for implementation notes, issues encountered, resolutions, etc.]




```

---

**Document Version**: 1.0  
**Last Updated**: February 1, 2026  
**Owner**: Backend Team  
**Status**: ✅ Ready to Use
