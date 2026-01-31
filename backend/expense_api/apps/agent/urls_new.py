"""
URL configuration for the Agent application.
"""

from django.urls import path
from .views_new import (
    AgentQueryView,
    ChatSessionListView,
    ChatSessionDetailView,
    ChatMessageListView,
    ChatMessageDetailView,
)

app_name = 'agent'

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
