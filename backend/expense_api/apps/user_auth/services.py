from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from .authentication import generate_access_token, generate_refresh_token
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
from .serializers import userRegisterSerializer


class AuthService:
    @classmethod
    def register(cls, data):
        """Validate and create a new user. Returns (user, None) or (None, errors)."""
        serializer = userRegisterSerializer(data=data)
        if serializer.is_valid():
            return serializer.save(), None
        return None, serializer.errors

    @classmethod
    def login(cls, username, password):
        """Authenticate user by credentials. Raises InvalidCredentials on failure."""
        user = authenticate(username=username, password=password)
        if not user:
            raise InvalidCredentials("Invalid credentials.")
        return user

    @staticmethod
    def generate_tokens(user):
        """Return (access_token, refresh_token) for the given user."""
        return generate_access_token(user), generate_refresh_token(user)

    @staticmethod
    def set_auth_cookies(response, access_token, refresh_token):
        """Write both auth cookies onto an existing response object."""
        secure = not settings.DEBUG
        response.set_cookie(
            'refresh_token', refresh_token,
            httponly=True, path='/', samesite='Lax',
            secure=secure, max_age=7 * 24 * 60 * 60,
        )
        response.set_cookie(
            'access_token', access_token,
            httponly=True, path='/', samesite='Lax',
            secure=secure, max_age=60 * 60,
        )

    @staticmethod
    def set_access_cookie(response, access_token):
        """Write only the access-token cookie (used when rotating access token)."""
        response.set_cookie(
            'access_token', access_token,
            httponly=True, path='/', samesite='Lax',
            secure=not settings.DEBUG, max_age=60 * 60,
        )

    @staticmethod
    def clear_auth_cookies(response):
        """Delete both auth cookies from an existing response object."""
        response.delete_cookie('refresh_token')
        response.delete_cookie('access_token')


class UserService:
    @classmethod
    def get_user(cls, user_id):
        """Fetch a user by PK. Raises UserNotFound if missing."""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise UserNotFound(f"User {user_id} not found")

    @classmethod
    def get_user_by_email_or_username(cls, email=None, username=None):
        """Look up a user by email or username. Raises UserNotFound / UserAuthException."""
        if email:
            try:
                return User.objects.get(email=email)
            except User.DoesNotExist:
                raise UserNotFound("User with this email not found")
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise UserNotFound("User with this username not found")
        raise UserAuthException("Username or email is required")

    @classmethod
    def update_details(cls, user, current_password, new_password, confirm_password):
        """Change a user's password after verifying the current one."""
        if new_password != confirm_password:
            raise PasswordMismatch("New passwords do not match")
        if not authenticate(username=user.username, password=current_password):
            raise WrongCurrentPassword("Authentication failed")
        user.set_password(new_password)
        user.save()

    @classmethod
    def update_profile(cls, user, password, email=None, username=None):
        """Update email/username for an authenticated user."""
        if not authenticate(username=user.username, password=password):
            raise WrongCurrentPassword("Authentication failed")
        if not email and not username:
            raise UserAuthException("Email or username is required")
        if email and email != user.email:
            if User.objects.filter(email=email).exists():
                raise DuplicateEmail("Email is already taken")
        if username and username != user.username:
            if User.objects.filter(username=username).exists():
                raise DuplicateUsername("Username is already taken")
        if email:
            user.email = email
        if username:
            user.username = username
        user.save()

    @classmethod
    def get_friends(cls, user):
        """
        Return a list of dicts for all friends (bidirectional), each with an
        'added_by_me' flag indicating which side initiated the friendship.
        """
        from .models import UserProfile

        UserProfile.objects.get_or_create_for_user(user)

        added_by_me_ids = set(user.profile.friends.values_list('id', flat=True))

        friends_data = [
            {
                'id': f.id,
                'username': f.username,
                'email': f.email,
                'first_name': f.first_name,
                'last_name': f.last_name,
                'added_by_me': True,
            }
            for f in user.profile.friends.all()
        ]

        for f in User.objects.filter(profile__friends=user):
            if f.id not in added_by_me_ids:
                friends_data.append({
                    'id': f.id,
                    'username': f.username,
                    'email': f.email,
                    'first_name': f.first_name,
                    'last_name': f.last_name,
                    'added_by_me': False,
                })

        return friends_data

    @classmethod
    def manage_friend(cls, user, friend_id, action):
        """Add or remove a friend. Raises UserNotFound / AlreadyFriends / NotFriends."""
        from .models import UserProfile

        try:
            friend = User.objects.get(id=friend_id)
        except User.DoesNotExist:
            raise UserNotFound("Friend not found")

        UserProfile.objects.get_or_create_for_user(user)
        UserProfile.objects.get_or_create_for_user(friend)

        if action == 'add':
            already_friends = (
                user.profile.friends.filter(id=friend.id).exists()
                or friend.profile.friends.filter(id=user.id).exists()
            )
            if already_friends:
                raise AlreadyFriends("Already friends")
            user.profile.friends.add(friend)
        elif action == 'remove':
            if not user.profile.friends.filter(id=friend.id).exists():
                raise NotFriends("Cannot remove friend who added you")
            user.profile.friends.remove(friend)
        else:
            raise UserAuthException("Invalid action. Use 'add' or 'remove'")
