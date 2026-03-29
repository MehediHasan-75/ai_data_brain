from expense_api.apps.agent.servers.finance.mcp_instance import mcp

# 2. Import tools, resources, and prompts so they attach to the instance
from expense_api.apps.agent.servers.finance import tools, resources, prompts


if __name__ == "__main__":
    mcp.run()