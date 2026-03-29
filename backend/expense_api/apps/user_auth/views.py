import logging

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth.models import User

from .authentication import IsAuthenticatedCustom, decode_refresh_token
from .permission import JWTAuthentication
from .serializers import UserSerializer
from .services import AuthService, UserService
from .exceptions import (
    InvalidCredentials,
    UserNotFound,
    DuplicateEmail,
    DuplicateUsername,
    PasswordMismatch,
    WrongCurrentPassword,
    AlreadyFriends,
    NotFriends,
    UserAuthException,
)

logger = logging.getLogger(__name__)


class UserRegisterView(APIView):
    def post(self, request):
        user, errors = AuthService.register(request.data)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        access_token, refresh_token = AuthService.generate_tokens(user)
        response = Response({
            'message': "User registered successfully.",
            'user': UserSerializer(user).data,
            'access_token': access_token,
            'refresh_token': refresh_token,
        })
        AuthService.set_auth_cookies(response, access_token, refresh_token)
        return response


class UserListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request):
        try:
            search = request.query_params.get('search', '')
            qs = User.objects.filter(username__icontains=search).exclude(id=request.user.id)
            paginator = PageNumberPagination()
            paginator.page_size = 20
            page = paginator.paginate_queryset(qs, request)
            return paginator.get_paginated_response(UserSerializer(page, many=True).data)
        except Exception as e:
            return Response(
                {"error": "An error occurred while fetching user data.", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class LoginView(APIView):
    def post(self, request):
        try:
            user = AuthService.login(
                request.data.get('username'),
                request.data.get('password'),
            )
        except InvalidCredentials:
            return Response({'message': "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

        access_token, refresh_token = AuthService.generate_tokens(user)
        response = Response({
            'message': "Login successful.",
            'user': UserSerializer(user).data,
            'access_token': access_token,
            'refresh_token': refresh_token,
        })
        AuthService.set_auth_cookies(response, access_token, refresh_token)
        return response


class LogoutView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        response = Response({'message': 'Logged out successfully'})
        AuthService.clear_auth_cookies(response)
        return response


class UserDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request, *args, **kwargs):
        try:
            user = UserService.get_user(self.kwargs.get('user_id'))
            return Response(UserSerializer(user).data)
        except UserNotFound as e:
            return Response(
                {"error": "User Not Found", "details": str(e)},
                status=status.HTTP_404_NOT_FOUND,
            )


class UpdateUserDetails(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        try:
            UserService.update_details(
                request.user,
                request.data.get('password'),
                request.data.get('newpassword'),
                request.data.get('newpassword2'),
            )
            return Response({"message": "Password updated successfully"}, status=status.HTTP_200_OK)
        except UserAuthException as e:
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PasswordMismatch as e:
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except WrongCurrentPassword as e:
            return Response({"message": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class UpdateAccessToken(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({'message': "Refresh token not provided."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            user_id = decode_refresh_token(refresh_token)
            user = UserService.get_user(user_id)
            access_token, _ = AuthService.generate_tokens(user)
            response = Response({
                'message': "Access token update successful.",
                'user': UserSerializer(user).data,
                'access_token': access_token,
            })
            AuthService.set_access_cookie(response, access_token)
            return response
        except UserNotFound:
            return Response({'message': "User not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {'message': "Invalid refresh token.", 'error': str(e)},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class MeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request, *args, **kwargs):
        try:
            return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": "Failed to retrieve user info", "details": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class UpdateUserProfile(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        try:
            UserService.update_profile(
                request.user,
                password=request.data.get('password'),
                email=request.data.get('email'),
                username=request.data.get('username'),
            )
            return Response({
                "message": "Profile updated successfully",
                "user": UserSerializer(request.user).data,
            }, status=status.HTTP_200_OK)
        except WrongCurrentPassword as e:
            return Response({"message": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except (DuplicateEmail, DuplicateUsername, UserAuthException) as e:
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FriendsListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def get(self, request):
        try:
            friends_data = UserService.get_friends(request.user)
            return Response({
                "message": "Friends list fetched successfully",
                "data": friends_data,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("FriendsListView error: %s", e)
            return Response({
                "error": "Failed to fetch friends list",
                "details": str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ManageFriendView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticatedCustom]

    def post(self, request):
        friend_id = request.data.get('friend_id')
        action = request.data.get('action')

        if not friend_id or not action:
            return Response(
                {"error": "friend_id and action are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            UserService.manage_friend(request.user, friend_id, action)
            message = "Friend added successfully" if action == 'add' else "Friend removed successfully"
            return Response({"message": message}, status=status.HTTP_200_OK)
        except UserNotFound as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except (AlreadyFriends, NotFriends) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except UserAuthException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error("ManageFriendView error: %s", e)
            return Response({
                "error": "Failed to manage friend",
                "details": str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
