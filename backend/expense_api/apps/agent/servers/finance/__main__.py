"""Entry point for: python -m expense_api.apps.agent.servers.finance"""
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "..", ".."))
sys.path.insert(0, backend_path)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "expense_api.settings.development")

import django
from django.conf import settings

if not settings.configured:
    django.setup()

import expense_api.apps.agent.servers.finance.tools  # noqa: F401
import expense_api.apps.agent.servers.finance.resources  # noqa: F401
import expense_api.apps.agent.servers.finance.prompts  # noqa: F401

from expense_api.apps.agent.servers.finance.server import mcp

mcp.run()
