"""URL patterns for Agent and Chat endpoints."""
from django.urls import path
from .views import (
    AgentAPIView,
    AgentStreamingAPIView,
    AgentHistoryAPIView,
    ChatSessionListView,
    ChatSessionDetailView,
    ChatSessionMessagesView,
    SaveSessionMessageView,
    PromptListView,
    PromptInvokeView,
)

urlpatterns = [
    # Agent
    path("query/", AgentAPIView.as_view(), name="agent-query"),
    path("streaming/", AgentStreamingAPIView.as_view(), name="agent-streaming"),
    path("history/", AgentHistoryAPIView.as_view(), name="agent-history"),

    # Prompt templates
    path("prompts/", PromptListView.as_view(), name="prompt-list"),
    path("prompts/<str:prompt_name>/", PromptInvokeView.as_view(), name="prompt-invoke"),

    # Chat sessions
    path("chat/sessions/", ChatSessionListView.as_view(), name="chat-sessions"),
    path("chat/sessions/<str:session_id>/", ChatSessionDetailView.as_view(), name="chat-session-detail"),
    path("chat/sessions/<str:session_id>/messages/", ChatSessionMessagesView.as_view(), name="session-messages"),
    path("chat/sessions/<str:session_id>/messages/save/", SaveSessionMessageView.as_view(), name="save-session-message"),
]