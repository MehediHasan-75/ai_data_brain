import re
import json

from django.http import StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from ..user_auth.authentication import IsAuthenticatedCustom
from ..user_auth.permission import JWTAuthentication
from .serializers import (
    QuerySerializer,
    ChatSessionSerializer,
    ChatMessageSerializer,
)
from .models import ChatSession, ChatMessage
from .client.in_process_client import run_query, stream_query


def _clean_response(response_obj: dict) -> dict:
    """Strip LLM step-prefix noise and return a normalised response dict."""
    if isinstance(response_obj, dict):
        text = str(response_obj.get("response") or response_obj.get("message") or response_obj)
    else:
        text = str(response_obj)

    text = re.sub(r"^Step \d+:.*\n?", "", text, flags=re.MULTILINE).strip()
    return {"response": text, "success": response_obj.get("success", True)}


@method_decorator(csrf_exempt, name="dispatch")
class AgentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def post(self, request):
        serializer = QuerySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        query = data["query"]
        llm_provider = data.get("llm_provider", "anthropic")
        llm_model = data.get("llm_model", "claude-sonnet-4-6")

        result = await run_query(query, request.user.id, llm_provider, llm_model)
        return Response(_clean_response(result), status=status.HTTP_200_OK)

    async def get(self, request):
        return Response({"user_id": request.user.id, "status": "active"}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class AgentStreamingAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def post(self, request):
        serializer = QuerySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        query = data["query"]
        llm_provider = data.get("llm_provider", "anthropic")
        llm_model = data.get("llm_model", "claude-sonnet-4-6")
        user_id = request.user.id

        async def event_generator():
            async for event in stream_query(query, user_id, llm_provider, llm_model):
                yield json.dumps(event) + "\n"

        return StreamingHttpResponse(event_generator(), content_type="application/x-ndjson")


@method_decorator(csrf_exempt, name="dispatch")
class AgentHistoryAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def get(self, request):
        return Response({"user_id": request.user.id, "history": []}, status=status.HTTP_200_OK)


# ── Chat session views ────────────────────────────────────────────────────────

@method_decorator(csrf_exempt, name="dispatch")
class ChatSessionListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def get(self, request):
        sessions = [s async for s in ChatSession.objects.filter(user=request.user, is_active=True)]
        serializer = ChatSessionSerializer(sessions, many=True)
        return Response(
            {"message": "Chat sessions retrieved successfully.", "data": serializer.data},
            status=status.HTTP_200_OK,
        )

    async def post(self, request):
        serializer = ChatSessionSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(
                {"message": "Invalid data.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        await serializer.asave()
        return Response(
            {"message": "Chat session created successfully.", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class ChatSessionDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def get(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)
        return Response(
            {"message": "Chat session retrieved successfully.", "data": ChatSessionSerializer(session).data},
            status=status.HTTP_200_OK,
        )

    async def put(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)
        serializer = ChatSessionSerializer(session, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {"message": "Invalid data.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        await serializer.asave()
        return Response(
            {"message": "Chat session updated successfully.", "data": serializer.data},
            status=status.HTTP_200_OK,
        )

    async def delete(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)
        session.is_active = False
        await session.asave()
        return Response({"message": "Chat session deleted successfully."}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name="dispatch")
class ChatSessionMessagesView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def get(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)
        messages = [
            m async for m in ChatMessage.objects.filter(chat_session=session).order_by("timestamp")
        ]
        return Response(
            {
                "message": "Chat messages retrieved successfully.",
                "session_info": {"session_id": session.session_id, "title": session.title},
                "data": ChatMessageSerializer(messages, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    async def delete(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)
        deleted_count, _ = await ChatMessage.objects.filter(chat_session=session).adelete()
        return Response(
            {"message": f"Cleared {deleted_count} messages from chat session."},
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_exempt, name="dispatch")
class SaveSessionMessageView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    async def post(self, request, session_id):
        session = await ChatSession.objects.aget(session_id=session_id, user=request.user)

        message_id = request.data.get("message_id")
        if message_id and await ChatMessage.objects.filter(message_id=message_id).aexists():
            existing = await ChatMessage.objects.aget(message_id=message_id)
            return Response(
                {"message": "Message already exists.", "data": ChatMessageSerializer(existing).data},
                status=status.HTTP_200_OK,
            )

        for field in ("message_id", "text", "sender"):
            if field not in request.data:
                return Response(
                    {"message": "Invalid data.", "errors": {field: ["This field is required."]}},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = ChatMessageSerializer(
            data=request.data, context={"request": request, "chat_session": session}
        )
        if not serializer.is_valid():
            return Response(
                {"message": "Invalid data.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        await serializer.asave()
        await session.asave()
        return Response(
            {"message": "Message saved successfully.", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )
