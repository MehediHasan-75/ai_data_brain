"""
API views for the Agent application.
"""

import logging
from typing import Dict, Any

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from ..user_auth.authentication import IsAuthenticatedCustom
from ..user_auth.permission import JWTAuthentication

from .serializers import (
    QuerySerializer,
    ChatSessionSerializer,
    ChatMessageSerializer,
)
from .services import (
    ChatSessionService,
    ChatMessageService,
    AgentQueryService,
)
from .utils import handle_exceptions, format_error_response
from .exceptions import AgentException
from .constants import ERROR_MESSAGES, SUCCESS_MESSAGES

logger = logging.getLogger(__name__)


class BaseAgentView(APIView):
    """Base view with common authentication and error handling."""
    
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]


@method_decorator(csrf_exempt, name='dispatch')
class AgentQueryView(BaseAgentView):
    """
    View for processing agent queries.
    POST: Process a new query
    GET: Get agent status
    """
    
    @handle_exceptions
    def post(self, request):
        """Process a new agent query."""
        # Validate input
        serializer = QuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        query_data = serializer.validated_data
        query_data['user_id'] = request.user.id
        
        # Add optional context
        if 'table_id' in request.data:
            query_data['table_id'] = request.data['table_id']
        if 'context_type' in request.data:
            query_data['context_type'] = request.data['context_type']
        
        # Process query
        response = AgentQueryService.process_query(query_data)
        
        logger.info(f"Query processed for user {request.user.id}")
        return Response(response, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def get(self, request):
        """Get agent status."""
        return Response(
            {
                "user_id": request.user.id,
                "status": "active",
                "message": "Agent is ready to process queries"
            },
            status=status.HTTP_200_OK
        )


class ChatSessionListView(BaseAgentView):
    """
    View for managing chat sessions.
    GET: List all sessions
    POST: Create a new session
    """
    
    @handle_exceptions
    def get(self, request):
        """Get all chat sessions for the user."""
        is_active = request.query_params.get('is_active')
        is_active_bool = None if is_active is None else is_active.lower() == 'true'
        
        sessions = ChatSessionService.get_user_sessions(request.user, is_active_bool)
        serializer = ChatSessionSerializer(sessions, many=True)
        
        logger.info(f"Retrieved {sessions.count()} sessions for user {request.user.id}")
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def post(self, request):
        """Create a new chat session."""
        title = request.data.get('title', 'New Chat')
        session = ChatSessionService.create_session(request.user, title)
        serializer = ChatSessionSerializer(session)
        
        logger.info(f"Created new chat session for user {request.user.id}")
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )


class ChatSessionDetailView(BaseAgentView):
    """
    View for managing individual chat sessions.
    GET: Get session details
    PATCH: Update session
    DELETE: Delete session
    """
    
    @handle_exceptions
    def get(self, request, session_id):
        """Get a specific chat session."""
        session = ChatSessionService.get_session(session_id, request.user)
        serializer = ChatSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def patch(self, request, session_id):
        """Update a chat session."""
        session = ChatSessionService.update_session(
            session_id,
            request.user,
            **request.data
        )
        serializer = ChatSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def delete(self, request, session_id):
        """Delete a chat session."""
        ChatSessionService.delete_session(session_id, request.user)
        return Response(
            {'message': SUCCESS_MESSAGES['SESSION_DELETED']},
            status=status.HTTP_204_NO_CONTENT
        )


class ChatMessageListView(BaseAgentView):
    """
    View for managing messages in a chat session.
    GET: List all messages
    POST: Create a new message (query)
    """
    
    @handle_exceptions
    def get(self, request, session_id):
        """Get all messages in a chat session."""
        limit = int(request.query_params.get('limit', 50))
        messages = ChatMessageService.get_session_messages(session_id, request.user, limit)
        serializer = ChatMessageSerializer(messages, many=True)
        
        logger.info(f"Retrieved {len(messages)} messages for session {session_id}")
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def post(self, request, session_id):
        """Create a new message (user query) and get bot response."""
        query_text = request.data.get('text')
        if not query_text:
            return Response(
                {'error': 'Text field is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Process and save query
        user_msg, bot_msg = AgentQueryService.process_and_save_query(
            session_id=session_id,
            user=request.user,
            query_text=query_text,
            **request.data
        )
        
        return Response(
            {
                'user_message': ChatMessageSerializer(user_msg).data,
                'bot_message': ChatMessageSerializer(bot_msg).data,
            },
            status=status.HTTP_201_CREATED
        )


class ChatMessageDetailView(BaseAgentView):
    """
    View for managing individual messages.
    GET: Get message details
    DELETE: Delete message
    """
    
    @handle_exceptions
    def get(self, request, message_id):
        """Get a specific message."""
        message = ChatMessageService.get_message(message_id, request.user)
        serializer = ChatMessageSerializer(message)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @handle_exceptions
    def delete(self, request, message_id):
        """Delete a specific message."""
        message = ChatMessageService.get_message(message_id, request.user)
        message.delete()
        
        logger.info(f"Deleted message {message_id}")
        return Response(
            {'message': SUCCESS_MESSAGES['MESSAGE_DELETED']},
            status=status.HTTP_204_NO_CONTENT
        )
