"""
Models for the Agent application.
"""

from django.db import models
from django.contrib.auth.models import User

from .managers import ChatSessionManager, ChatMessageManager
from .constants import SENDER_CHOICES


class ChatSession(models.Model):
    """Chat session model for storing user conversations with the agent."""
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    session_id = models.CharField(max_length=255, unique=True, db_index=True)
    title = models.CharField(max_length=255, default="New Chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, db_index=True)
    
    objects = ChatSessionManager()
    
    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', '-updated_at']),
            models.Index(fields=['session_id']),
            models.Index(fields=['user', 'is_active']),
        ]
    
    def __str__(self) -> str:
        return f"{self.user.username} - {self.title}"
    
    def get_message_count(self) -> int:
        """Get count of messages in this session."""
        return self.messages.count()
    
    def get_last_message(self):
        """Get the last message in this session."""
        return self.messages.last()


class ChatMessage(models.Model):
    """Chat message model for storing individual messages in a session."""
    
    chat_session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_messages')
    message_id = models.CharField(max_length=255, unique=True, db_index=True)
    text = models.TextField()
    sender = models.CharField(max_length=10, choices=SENDER_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_typing = models.BooleanField(default=False)
    displayed_text = models.TextField(blank=True, null=True)
    agent_data = models.JSONField(blank=True, null=True)
    
    objects = ChatMessageManager()
    
    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['chat_session', 'timestamp']),
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['message_id']),
        ]
    
    def __str__(self) -> str:
        truncated_text = self.text[:50] + "..." if len(self.text) > 50 else self.text
        return f"{self.sender}: {truncated_text}" 