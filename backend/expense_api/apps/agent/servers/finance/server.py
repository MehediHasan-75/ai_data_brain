"""Finance MCP server entry point."""
from expense_api.apps.agent.servers.finance.mcp_instance import mcp

# Side-effect imports: registering tools, resources, and prompts against the mcp instance.
from expense_api.apps.agent.servers.finance import tools, resources, prompts  # noqa: F401


if __name__ == "__main__":
    mcp.run()
