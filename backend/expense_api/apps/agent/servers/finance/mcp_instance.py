import os
import django
from django.apps import apps  # Explicitly import apps
from mcp.server.fastmcp import FastMCP

# 1. Force the settings module 
os.environ["DJANGO_SETTINGS_MODULE"] = "expense_api.settings.development"

# 2. Ironclad check: If Django isn't ready, set it up right now.
if not apps.ready:
    django.setup()

# 3. Create the instance ONLY after Django is completely loaded
mcp = FastMCP("finance_management")