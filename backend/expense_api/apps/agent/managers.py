"""
Custom managers for the Agent application.
"""

from django.db import models
from django.utils import timezone


class ChatSessionManager(models.Manager):
    """Manager for ChatSession model."""
    
    def get_user_active_sessions(self, user):
        """Get all active chat sessions for a user."""
        return self.filter(user=user, is_active=True).order_by('-updated_at')
    
    def get_user_sessions(self, user, is_active=None):
        """Get chat sessions for a user with optional filter."""
        qs = self.filter(user=user)
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        return qs.order_by('-updated_at')
    
    def create_session(self, user, title="New Chat"):
        """Create a new chat session for a user."""
        import time
        session_id = f"chat_{user.id}_{int(time.time())}"
        return self.create(
            user=user,
            session_id=session_id,
            title=title,
            is_active=True
        )
    
    def get_or_create_default_session(self, user):
        """Get or create a default session for a user."""
        session, created = self.get_or_create(
            user=user,
            title="Default Chat",
            defaults={'is_active': True}
        )
        return session


class ChatMessageManager(models.Manager):
    """Manager for ChatMessage model."""
    
    def get_session_messages(self, chat_session):
        """Get all messages for a chat session."""
        return self.filter(chat_session=chat_session).order_by('timestamp')
    
    def get_user_messages(self, user):
        """Get all messages for a user."""
        return self.filter(user=user).order_by('-timestamp')
    
    def get_recent_messages(self, chat_session, limit=50):
        """Get recent messages from a chat session."""
        return self.filter(chat_session=chat_session).order_by('-timestamp')[:limit]
    
    def create_message(self, chat_session, user, text, sender, agent_data=None):
        """Create a new message."""
        import uuid
        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        return self.create(
            chat_session=chat_session,
            user=user,
            message_id=message_id,
            text=text,
            sender=sender,
            agent_data=agent_data
        )
    
    def get_user_bot_interaction(self, user, chat_session):
        """Get the last user-bot interaction for a chat session."""
        return self.filter(
            user=user,
            chat_session=chat_session
        ).order_by('-timestamp').first()
