import dj_database_url

from .base import *

DEBUG = False

DATABASES = {
    'default': dj_database_url.config(default=env('DATABASE_URL'))
}

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
