"""
Service layer for Agent application business logic.
"""

import logging
from typing import Dict, Any, Optional, List
from asgiref.sync import async_to_sync

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import ChatSession, ChatMessage
from .client.client import ExpenseMCPClient
from .exceptions import (
    ChatSessionNotFound,
    ChatMessageNotFound,
    PermissionDenied,
    QueryProcessingError,
)
from .constants import ERROR_MESSAGES, SUCCESS_MESSAGES

logger = logging.getLogger(__name__)


class ChatSessionService:
    """Service for managing chat sessions."""
    
    @staticmethod
    def get_user_sessions(user: User, is_active: Optional[bool] = None) -> List[ChatSession]:
        """Get all chat sessions for a user."""
        return ChatSession.objects.get_user_sessions(user, is_active)
    
    @staticmethod
    def get_session(session_id: str, user: User) -> ChatSession:
        """Get a specific chat session with permission check."""
        try:
            session = ChatSession.objects.get(session_id=session_id)
            if session.user != user:
                raise PermissionDenied(ERROR_MESSAGES['PERMISSION_DENIED'])
            return session
        except ChatSession.DoesNotExist:
            raise ChatSessionNotFound(ERROR_MESSAGES['SESSION_NOT_FOUND'])
    
    @staticmethod
    @transaction.atomic
    def create_session(user: User, title: str = "New Chat") -> ChatSession:
        """Create a new chat session."""
        session = ChatSession.objects.create_session(user, title)
        logger.info(f"Created chat session {session.session_id} for user {user.id}")
        return session
    
    @staticmethod
    @transaction.atomic
    def delete_session(session_id: str, user: User) -> bool:
        """Delete a chat session."""
        session = ChatSessionService.get_session(session_id, user)
        session.delete()
        logger.info(f"Deleted chat session {session_id} for user {user.id}")
        return True
    
    @staticmethod
    @transaction.atomic
    def update_session(session_id: str, user: User, **kwargs) -> ChatSession:
        """Update a chat session."""
        session = ChatSessionService.get_session(session_id, user)
        allowed_fields = ['title', 'is_active']
        
        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(session, field, value)
        
        session.save()
        logger.info(f"Updated chat session {session_id}")
        return session


class ChatMessageService:
    """Service for managing chat messages."""
    
    @staticmethod
    def get_session_messages(session_id: str, user: User, limit: int = 50) -> List[ChatMessage]:
        """Get messages from a chat session."""
        session = ChatSessionService.get_session(session_id, user)
        return ChatMessage.objects.get_session_messages(session)[:limit]
    
    @staticmethod
    def get_message(message_id: str, user: User) -> ChatMessage:
        """Get a specific message with permission check."""
        try:
            message = ChatMessage.objects.get(message_id=message_id)
            if message.user != user:
                raise PermissionDenied(ERROR_MESSAGES['PERMISSION_DENIED'])
            return message
        except ChatMessage.DoesNotExist:
            raise ChatMessageNotFound(ERROR_MESSAGES['MESSAGE_NOT_FOUND'])
    
    @staticmethod
    @transaction.atomic
    def create_message(
        session_id: str,
        user: User,
        text: str,
        sender: str,
        agent_data: Optional[Dict[str, Any]] = None
    ) -> ChatMessage:
        """Create a new message in a chat session."""
        session = ChatSessionService.get_session(session_id, user)
        message = ChatMessage.objects.create_message(
            chat_session=session,
            user=user,
            text=text,
            sender=sender,
            agent_data=agent_data
        )
        
        # Update session's updated_at timestamp
        session.save(update_fields=['updated_at'])
        
        logger.info(f"Created message {message.message_id} in session {session_id}")
        return message


class AgentQueryService:
    """Service for processing agent queries."""
    
    @staticmethod
    def _clean_response(response_obj: Dict[str, Any]) -> Dict[str, Any]:
        """Clean and format agent response."""
        import re
        
        cleaned_response = {
            "response": "",
            "tools_called": []
        }
        
        if isinstance(response_obj, dict):
            if 'response' in response_obj:
                response_text = str(response_obj['response'])
            elif 'message' in response_obj:
                response_text = str(response_obj['message'])
            else:
                response_text = str(response_obj)
            
            if 'tools' in response_obj:
                cleaned_response['tools_called'] = response_obj['tools']
            
            # Remove step prefixes
            steps = response_text.split('\n')
            cleaned_steps = []
            
            for step in steps:
                step_pattern = r'^\*?\*?Step \d+:?\*?\*?\s*'
                cleaned_step = re.sub(step_pattern, '', step)
                if cleaned_step.strip():
                    cleaned_steps.append(cleaned_step)
            
            cleaned_response["response"] = '\n'.join(cleaned_steps)
        
        return cleaned_response
    
    @staticmethod
    async def process_query_async(query_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process agent query asynchronously."""
        try:
            response = await ExpenseMCPClient.create_and_run_query(query_data)
            return response
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            raise QueryProcessingError(f"Failed to process query: {str(e)}")
    
    @staticmethod
    def process_query(query_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process agent query synchronously."""
        try:
            response = async_to_sync(AgentQueryService.process_query_async)(query_data)
            return AgentQueryService._clean_response(response)
        except QueryProcessingError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in query processing: {str(e)}")
            raise QueryProcessingError(ERROR_MESSAGES['AGENT_ERROR'])
    
    @staticmethod
    @transaction.atomic
    def process_and_save_query(
        session_id: str,
        user: User,
        query_text: str,
        **additional_data
    ) -> tuple[ChatMessage, ChatMessage]:
        """Process a query and save user and bot messages."""
        # Save user message
        user_message = ChatMessageService.create_message(
            session_id=session_id,
            user=user,
            text=query_text,
            sender='user'
        )
        
        # Prepare query data
        query_data = {
            'user_id': user.id,
            'query': query_text,
            **additional_data
        }
        
        # Process query
        response = AgentQueryService.process_query(query_data)
        
        # Save bot message
        bot_message = ChatMessageService.create_message(
            session_id=session_id,
            user=user,
            text=response.get('response', ''),
            sender='bot',
            agent_data=response
        )
        
        logger.info(f"Processed and saved query for user {user.id} in session {session_id}")
        
        return user_message, bot_message
