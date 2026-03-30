"""
Stdio MCP Client.

Connects to MCP servers over subprocess stdio transport.
Use this for external MCP servers (e.g. a separate Node.js service).
"""
import os
from typing import Dict, Any, Optional
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.tools import load_mcp_tools

from ..config.providers import LLMProvider, MCPClientConfig
from ..prompts.system import SYSTEM_PROMPT


DEBUG = os.environ.get("MCP_DEBUG", "false").lower() == "true"


def _debug(*args, **kwargs):
    if DEBUG:
        print("[DEBUG]", *args, **kwargs)


class MCPClient:
    """Connects to MCP servers via stdio and runs a LangGraph ReAct agent."""

    def __init__(
        self,
        llm_provider: str = "google",
        llm_model: str = "gemini-2.0-flash",
        api_key: Optional[str] = None,
        config_path: Optional[str] = None,
    ):
        self.llm_provider_name = llm_provider
        self.api_key = api_key or os.getenv(f"{llm_provider.upper()}_API_KEY")

        if not self.api_key:
            raise ValueError(f"API key required for {llm_provider}")

        self.llm_provider = LLMProvider.create_provider(llm_provider, self.api_key, llm_model)
        self.config_path = config_path or self._get_config_path()

        self.mcp_config = None
        self.exit_stack = None
        self.client = None
        self.agent = None
        self.tools = []
        self.sessions = {}

    def _get_config_path(self) -> str:
        config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config")
        return os.path.join(config_dir, "mcpConfig.json")

    async def connect(self) -> bool:
        try:
            self.mcp_config = MCPClientConfig.load_config(self.config_path)
            base_dir = os.path.dirname(os.path.abspath(self.config_path))
            self.mcp_config = MCPClientConfig.resolve_server_paths(self.mcp_config, base_dir)

            _debug(f"Config loaded: {self.mcp_config}")

            self.exit_stack = AsyncExitStack()
            servers = self.mcp_config.get("mcpServers", {})

            if not servers:
                print("No MCP servers configured")
                await self.disconnect()
                return False

            for server_name, server_info in servers.items():
                await self._connect_to_server(server_name, server_info)

            if not self.tools:
                print("No tools loaded from servers")
                await self.disconnect()
                return False

            llm = self.llm_provider.get_client()
            self.agent = create_react_agent(llm, self.tools)
            print(f"Agent initialised with {len(self.tools)} tools")
            return True

        except Exception as e:
            print(f"Connection failed: {e}")
            await self.disconnect()
            return False

    async def _connect_to_server(self, server_name: str, server_info: Dict) -> None:
        try:
            print(f"Connecting to {server_name}...")
            params = StdioServerParameters(
                command=server_info["command"],
                args=server_info["args"],
            )
            read, write = await self.exit_stack.enter_async_context(stdio_client(params))
            session = await self.exit_stack.enter_async_context(ClientSession(read, write))
            await session.initialize()

            tools = await load_mcp_tools(session)
            self.tools.extend(tools)
            self.sessions[server_name] = session
            print(f"Connected to {server_name}: {len(tools)} tools loaded")

        except Exception as e:
            print(f"Failed to connect to {server_name}: {e}")

    async def process_query(self, query: str, user_id: int = 1, **context) -> Dict[str, Any]:
        if not self.agent:
            if not await self.connect():
                return {"success": False, "error": "Agent not initialized"}

        try:
            response = await self.agent.ainvoke(
                {"messages": query},
                {"recursion_limit": 15},
            )
            return {
                "success": True,
                "query": query,
                "response": self._extract_response(response),
                "llm_provider": self.llm_provider_name,
            }
        except Exception as e:
            return {"success": False, "error": str(e), "query": query}

    def _extract_response(self, response: Any) -> str:
        if isinstance(response, dict) and "messages" in response:
            for message in reversed(response["messages"]):
                if hasattr(message, "content"):
                    return message.content
        elif hasattr(response, "content"):
            return response.content
        return str(response)

    async def disconnect(self) -> str:
        if self.exit_stack:
            try:
                self.sessions.clear()
                try:
                    await self.exit_stack.aclose()
                except Exception as e:
                    if "cancel scope" not in str(e).lower():
                        _debug(f"Warning: {e}")
            finally:
                self.exit_stack = None
                self.client = None
                self.tools = []
                self.sessions = {}
                self.agent = None
            return "Disconnected"
        return "Not connected"

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()
        return False


# Backward compatibility alias
ExpenseMCPClient = MCPClient
