import os
import django
from django.apps import apps
from mcp.server.fastmcp import FastMCP

os.environ["DJANGO_SETTINGS_MODULE"] = "expense_api.settings.development"

if not apps.ready:
    django.setup()

mcp = FastMCP("finance_management")
