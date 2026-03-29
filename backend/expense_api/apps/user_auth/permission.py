from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .authentication import decode_access_token
from django.contrib.auth.models import User


class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get('access_token')
        if not token:
            return None

        try:
            user_id = decode_access_token(token)
            user = User.objects.get(id=user_id)
            return (user, None)
        except Exception:
            raise AuthenticationFailed("Invalid or expired token")
