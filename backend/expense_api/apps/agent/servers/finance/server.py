import sys

# 1. Import the instance (This instantly triggers the Django setup safely)
from expense_api.apps.agent.servers.finance.mcp_instance import mcp

# 2. Import tools, resources, and prompts so they attach to the instance
from expense_api.apps.agent.servers.finance import tools, resources, prompts

print("Django and MCP initialized successfully.", file=sys.stderr)

if __name__ == "__main__":
    mcp.run()