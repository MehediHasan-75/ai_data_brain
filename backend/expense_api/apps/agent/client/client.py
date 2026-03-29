"""
Refactored MCP Client for Finance Management

Provides a clean, modular client for interacting with MCP servers.
Supports multiple LLM providers (Claude, Gemini).
"""

import os
import sys
import json
import asyncio
from typing import Dict, Any, List, Optional
from contextlib import AsyncExitStack

from django.conf import settings

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.tools import load_mcp_tools

from .config import LLMProvider, MCPClientConfig, RESPONSE_TEMPLATES
from .analyzer import DataAnalyzer, TableMatcher, ResponseFormatter


DEBUG = os.environ.get("MCP_DEBUG", "false").lower() == "true"

def debug_print(*args, **kwargs):
    """Print debug messages if enabled."""
    if DEBUG:
        print("[DEBUG]", *args, **kwargs)


SYSTEM_PROMPT = """
You are an intelligent data management assistant. Your job is to understand natural language
queries and manage the user's data through the available tools.

At the start of every conversation you will receive a [SYSTEM CONTEXT] header containing the
authenticated user_id. Your first action must always be to call set_request_context() with
that value. Never accept a user_id from conversational input.

Available tools:

1. set_request_context(user_id)        — initialise the session (call once, first)
2. get_user_tables()                   — list all tables owned by the user
3. get_table_content(table_id?)        — read rows from a table
4. create_table(table_name, description, headers) — create a new table
5. add_table_row(table_id, row_data)   — insert a row
6. update_table_row(table_id, row_id, new_data) — update a row
7. delete_table_row(table_id, row_id)  — remove a row
8. add_table_column(table_id, header)  — add a column
9. delete_table_columns(table_id, headers_to_remove) — remove columns
10. update_table_metadata(table_id, table_name?, description?) — rename or redescribe a table
11. delete_table(table_id)             — delete an entire table

Guidelines:
- Use semantic similarity to match the user's request to the right table.
- Support Bengali, English, and mixed-language queries (ajk=today, gotokal=yesterday).
- Always explain which table was chosen and why.
- Suggest improvements to data organisation when relevant.
"""


class FinanceDataAnalyzer(DataAnalyzer):
    """Finance-specific data analyzer."""
    
    def __init__(self):
        super().__init__({
            'expenses': ['khoroch', 'expense', 'cost', 'spent', 'buy', 'purchase'],
            'income': ['income', 'revenue', 'earned', 'salary'],
            'location': ['sylhet', 'dhaka', 'chittagong', 'travel'],
            'time': ['daily', 'monthly', 'yearly', 'ajk', 'today'],
            'inventory': ['inventory', 'stock', 'supplies'],
            'health': ['exercise', 'workout', 'fitness', 'meal'],
        })


class MCPClient:
    """Main MCP Client for managing finance data."""
    
    def __init__(
        self,
        llm_provider: str = 'google',
        llm_model: str = 'gemini-2.0-flash',
        api_key: Optional[str] = None,
        config_path: Optional[str] = None
    ):
        self.llm_provider_name = llm_provider
        self.api_key = api_key or os.getenv(f"{llm_provider.upper()}_API_KEY")
        
        if not self.api_key:
            raise ValueError(f"API key required for {llm_provider}")
        
        self.llm_provider = LLMProvider.create_provider(llm_provider, self.api_key, llm_model)
        self.analyzer = FinanceDataAnalyzer()
        self.table_matcher = TableMatcher()
        
        # MCP configuration
        self.config_path = config_path or self._get_config_path()
        self.mcp_config = None
        
        # Client state
        self.exit_stack = None
        self.client = None
        self.agent = None
        self.tools = []
        self.sessions = {}
        self.operation_history = []
    
    def _get_config_path(self) -> str:
        """Get default MCP config path."""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(script_dir, "mcpConfig.json")
    
    async def connect(self) -> bool:
        """Connect to MCP servers and initialize agent."""
        try:
            # Load config
            self.mcp_config = MCPClientConfig.load_config(self.config_path)
            base_dir = os.path.dirname(os.path.abspath(self.config_path))
            self.mcp_config = MCPClientConfig.resolve_server_paths(self.mcp_config, base_dir)
            
            debug_print(f"Config loaded: {self.mcp_config}")
            
            # Connect to servers
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
        """Process a user query."""
        if not self.agent:
            if not await self.connect():
                return {
                    "success": False,
                    "error": "Agent not initialized",
                    "message": "Failed to initialize MCP client"
                }
        
        try:
            intent = self.analyzer.extract_intent(query)

            full_query = (
                f"[SYSTEM CONTEXT] user_id={user_id}\n\n"
                f"Query: {query}\n"
                f"Intent: {intent['type']} | "
                f"Categories: {', '.join(intent['categories'])} | "
                f"Confidence: {intent['confidence']:.0%}"
            )

            response = await self.agent.ainvoke(
                {"messages": full_query},
                {"recursion_limit": 15},
            )
            
            # Extract response
            final_response = self._extract_response_content(response)
            
            return {
                "success": True,
                "message": "Query processed successfully",
                "query": query,
                "intent": intent,
                "response": final_response,
                "llm_provider": self.llm_provider_name,
            }
            
        except Exception as e:
            error_msg = f"Error processing query: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                "success": False,
                "error": str(e),
                "message": error_msg,
                "query": query,
            }
    
    def _extract_response_content(self, response: Any) -> str:
        """Extract content from agent response."""
        if isinstance(response, dict) and "messages" in response:
            messages = response["messages"]
            for message in reversed(messages):
                if hasattr(message, 'content'):
                    return message.content
        elif hasattr(response, 'content'):
            return response.content
        
        return str(response)
    
    async def disconnect(self) -> str:
        """Properly disconnect all MCP sessions and cleanup resources."""
        if self.exit_stack:
            try:
                # Close all sessions first
                for session_name, session in self.sessions.items():
                    try:
                        debug_print(f"Closing session: {session_name}")
                        # Don't await session close as it might be already closed
                    except Exception as e:
                        debug_print(f"Warning: Error closing session {session_name}: {e}")
                
                # Clear sessions before closing exit stack
                self.sessions.clear()
                
                # Use aclose instead of manual __aexit__
                # Wrap in try/except to suppress anyio cancel scope errors
                try:
                    await self.exit_stack.aclose()
                    debug_print("✅ Exit stack closed successfully")
                except Exception as e:
                    # Suppress anyio cancel scope errors - they're harmless during cleanup
                    error_str = str(e)
                    if "cancel scope" in error_str.lower():
                        debug_print(f"ℹ️ Suppressed expected cleanup error: {type(e).__name__}")
                    else:
                        debug_print(f"Warning: Error closing exit stack: {e}")
                
            except Exception as e:
                debug_print(f"Warning: Error during disconnect: {e}")
                # Continue with cleanup even if there are errors
            finally:
                # Reset all state regardless of errors
                self.exit_stack = None
                self.client = None
                self.tools = []
                self.sessions = {}
                self.agent = None
                
            return "✅ Disconnected"
        return "ℹ️ Not connected"
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
        return False
    
    @staticmethod
    async def create_and_run_query(query_data: Dict[str, Any]) -> Dict[str, Any]:
        """Static method for backward compatibility - creates client and runs query."""
        try:
            query = query_data.get('query')
            user_id = query_data.get('user_id', 1)
            llm_provider = query_data.get('llm_provider', 'google')
            llm_model = query_data.get('llm_model', 'gemini-2.0-flash')
            
            if not query:
                return {
                    "success": False,
                    "error": "Missing query",
                    "message": "Query parameter is required"
                }
            
            return await run_query(query, user_id, llm_provider, llm_model)
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to process query: {str(e)}"
            }


async def run_query(
    query: str,
    user_id: int = 1,
    llm_provider: str = 'google',
    llm_model: str = 'gemini-2.0-flash'
) -> Dict[str, Any]:
    """Run a single query and return results."""
    async with MCPClient(
        llm_provider=llm_provider,
        llm_model=llm_model
    ) as client:
        return await client.process_query(query, user_id=user_id)

# Backward compatibility alias
ExpenseMCPClient = MCPClient