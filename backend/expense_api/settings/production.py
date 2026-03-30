import dj_database_url

from .base import *

DEBUG = False

DATABASES = {
    'default': dj_database_url.config(default=env('DATABASE_URL'))
}

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # Railway handles SSL termination externally
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
