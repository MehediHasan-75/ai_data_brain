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
You are an advanced intelligent data management and tracking assistant with sophisticated analysis capabilities.

Your job is to understand natural language queries and intelligently manage any type of data through smart analysis and organization.

You have access to the following tools for managing data:

1. `get_user_tables(user_id: int)` - Get all tables belonging to a user
2. `create_table(user_id: int, table_name: str, description: str, headers: list)` - Create new data tracking table
3. `add_table_row(table_id: int, row_data: dict)` - Add data entry to a table
4. `update_table_row(table_id: int, row_id: str, new_data: dict)` - Update existing data entry
5. `delete_table_row(table_id: int, row_id: str)` - Delete a data entry
6. `get_table_content(user_id: int, table_id?: int)` - Get table data for analysis
7. `add_table_column(table_id: int, header: str)` - Add new column to table
8. `delete_table_columns(table_id: int, new_headers: list)` - Remove columns from table
9. `update_table_metadata(user_id: int, table_id: int, ...)` - Update table name/description
10. `delete_table(user_id: int, table_id: int)` - Delete entire table

## INTELLIGENT PROCESSING:
- Always analyze user's data patterns and tracking behaviors
- Identify categories, frequency, trends, and anomalies
- Use semantic similarity to match queries with existing tables
- Consider data type, tracking period, context, and measurement units
- Provide comprehensive feedback with insights and recommendations

## MULTI-LANGUAGE SUPPORT:
- Parse Bengali, English, and mixed language queries
- Extract context-specific information (dates: ajk=today, gotokal=yesterday)
- Handle various measurement units and counting systems

## RESPONSE FORMAT:
Always provide clear feedback explaining:
- Why specific tables were chosen
- Data organization insights
- Suggestions for better data management
- Confidence levels in recommendations
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
                print("❌ No MCP servers configured")
                return False
            
            for server_name, server_info in servers.items():
                await self._connect_to_server(server_name, server_info)
            
            if not self.tools:
                print("❌ No tools loaded from servers")
                return False
            
            # Initialize agent
            llm = self.llm_provider.get_client()
            self.agent = create_react_agent(llm, self.tools)
            print(f"✅ Agent initialized with {len(self.tools)} tools")
            
            return True
            
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
    
    async def _connect_to_server(self, server_name: str, server_info: Dict) -> None:
        """Connect to a single MCP server."""
        try:
            print(f"\n🔗 Connecting to {server_name}...")
            
            params = StdioServerParameters(
                command=server_info["command"],
                args=server_info["args"]
            )
            
            read, write = await self.exit_stack.enter_async_context(stdio_client(params))
            session = await self.exit_stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
            
            tools = await load_mcp_tools(session)
            self.tools.extend(tools)
            self.sessions[server_name] = session
            
            print(f"✅ Connected to {server_name}: {len(tools)} tools loaded")
            
        except Exception as e:
            print(f"⚠️  Failed to connect to {server_name}: {e}")
    
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
            # Analyze query
            intent = self.analyzer.extract_intent(query)
            
            # Build context
            full_query = f"""
User ID: {user_id}
Query: {query}
Intent Type: {intent['type']}
Detected Categories: {', '.join(intent['categories'])}
Confidence: {intent['confidence']:.0%}

Please process this request intelligently, using appropriate tools and providing detailed analysis.
"""
            
            # Run agent
            response = await self.agent.ainvoke(
                {"messages": full_query},
                {"recursion_limit": 100}
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
        """Disconnect from servers."""
        if self.exit_stack:
            try:
                await self.exit_stack.aclose()
                self.sessions.clear()
                self.agent = None
                self.tools = []
                return "✅ Disconnected"
            except Exception as e:
                debug_print(f"Warning during disconnect: {e}")
                return f"⚠️ Disconnect completed with warnings"
        return "ℹ️ Not connected"
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.disconnect()
        return False


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
