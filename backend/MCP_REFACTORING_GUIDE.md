# MCP Client & Server Refactoring Guide

## Overview

The MCP (Model Context Protocol) client and server have been completely refactored for improved maintainability, modularity, and support for multiple LLM providers (Claude, Gemini).

## Architecture

### New Directory Structure

```
agent/
├── client/
│   ├── __init__.py
│   ├── config.py              # Configuration and LLM providers
│   ├── analyzer.py            # Data analysis and matching
│   ├── client_refactored.py   # Main MCP client
│   ├── client.py              # Original (deprecated)
│   └── mcpConfig.json         # MCP server configuration
│
├── servers/
│   ├── __init__.py
│   ├── base.py                # Base classes and utilities
│   ├── finance_mcp_server_refactored.py  # Refactored server
│   ├── finance_mcp_server.py  # Original (deprecated)
│   └── test_server.py         # Original (deprecated)
```

## Components

### 1. **config.py** - Configuration Management

**Classes:**
- `LLMConfig` - Configuration dataclass for LLM providers
- `LLMProvider` - Base class for LLM integration
- `AnthropicProvider` - Claude/Anthropic implementation
- `GoogleProvider` - Gemini/Google implementation
- `MCPClientConfig` - Configuration loader

**Usage:**
```python
from client.config import LLMProvider

# Create provider
provider = LLMProvider.create_provider('google', api_key, 'gemini-2.0-flash')
llm = provider.get_client()

# Or with Anthropic
provider = LLMProvider.create_provider('anthropic', api_key, 'claude-3-5-sonnet')
```

**Key Features:**
- ✅ Multiple LLM provider support
- ✅ Easy switching between Claude and Gemini
- ✅ Centralized configuration
- ✅ API key management

### 2. **analyzer.py** - Data Analysis & Intelligence

**Classes:**
- `DataAnalyzer` - Core analysis engine
  - Intent detection (create, retrieve, add, update, delete, analyze)
  - Category detection (expenses, income, location, time, inventory)
  - Entity extraction (amounts, dates)
  - Confidence scoring

- `TableMatcher` - Intelligent table matching
  - Semantic query-table matching
  - Match score calculation
  - Reasoning explanation

- `ResponseFormatter` - Standardized response formatting
  - Success/error formatting
  - Step visualization
  - Data presentation

**Usage:**
```python
from client.analyzer import DataAnalyzer, TableMatcher

# Initialize
analyzer = DataAnalyzer(DATA_CATEGORIES)
matcher = TableMatcher()

# Analyze query
intent = analyzer.extract_intent("add 500 tk expense today")
# Returns: {
#   'type': 'add',
#   'categories': ['expenses', 'time'],
#   'entities': {'amount': 500},
#   'time_references': {'period': 'daily'},
#   'confidence': 0.85
# }

# Find matching table
best_match = matcher.find_best_match(tables, query)
```

### 3. **client_refactored.py** - Main MCP Client

**Classes:**
- `MCPClient` - Main client class
  - Supports multiple LLM providers
  - Connects to MCP servers
  - Processes queries with analysis
  - Maintains operation history

**Key Features:**
- ✅ Provider-agnostic LLM integration
- ✅ Automatic server discovery and connection
- ✅ Query analysis before processing
- ✅ Comprehensive error handling
- ✅ Async/await support

**Usage:**
```python
from client.client_refactored import MCPClient, run_query

# Using async context manager
async with MCPClient(llm_provider='google') as client:
    result = await client.process_query("add 100 tk expense")
    print(result)

# Or run single query
result = await run_query(
    query="show my expenses",
    llm_provider='google',
    llm_model='gemini-2.0-flash'
)
```

### 4. **base.py** - Server Base Classes

**Classes:**
- `DataValidator` - Input validation
  - Table data validation
  - Row data validation
  - Schema compliance

- `OperationLogger` - Audit trail
  - Logs all operations
  - Success/failure tracking
  - Operation history

- `ResponseBuilder` - Standardized responses
  - Success responses
  - Error responses
  - Not found responses

- `ToolRegistry` - Tool registration
- `MCPServerBase` - Base server class

**Usage:**
```python
from servers.base import ResponseBuilder, DataValidator

# Validate data
valid, msg = DataValidator.validate_table_data(name, headers, data)

# Build responses
success_resp = ResponseBuilder.success("Created table", data)
error_resp = ResponseBuilder.error("Invalid input", error_msg)
```

### 5. **finance_mcp_server_refactored.py** - Refactored Finance Server

**Classes:**
- `FinanceToolsManager` - Manages finance tools
  - `get_user_tables()`
  - `create_table()`
  - `add_table_row()`
  - `update_table_row()`
  - `delete_table_row()`

**Key Improvements:**
- ✅ Modular tool management
- ✅ Consistent error handling
- ✅ Better response formatting
- ✅ Operation logging
- ✅ Input validation

## Migration Guide

### Switching from Claude to Gemini

**Before (old client.py):**
```python
from langchain_anthropic import ChatAnthropic

client = ExpenseMCPClient(anthropic_api_key="...")
```

**After (client_refactored.py):**
```python
async with MCPClient(
    llm_provider='google',
    llm_model='gemini-2.0-flash'
) as client:
    result = await client.process_query("your query")

# Or use Claude
async with MCPClient(
    llm_provider='anthropic',
    llm_model='claude-3-5-sonnet-20240620'
) as client:
    result = await client.process_query("your query")
```

### API Compatibility

**Old client methods → New methods:**

| Old | New | Status |
|-----|-----|--------|
| `ExpenseMCPClient.connect()` | `MCPClient.connect()` | ✅ |
| `process_query()` | `process_query()` | ✅ |
| `disconnect()` | `disconnect()` | ✅ |
| `get_operation_history()` | Not implemented yet | ⏳ |

## Configuration

### mcpConfig.json

Update server script path:
```json
{
  "mcpServers": {
    "finance_server": {
      "command": "python",
      "args": ["finance_mcp_server_refactored.py"]
    }
  }
}
```

## Usage Examples

### Basic Query Processing

```python
import asyncio
from expense_api.apps.agent.client.client_refactored import run_query

async def main():
    result = await run_query(
        query="I spent 500 tk on books today",
        user_id=1,
        llm_provider='google'
    )
    
    if result['success']:
        print(f"✅ {result['message']}")
        print(f"Intent: {result['intent']['type']}")
        print(f"Categories: {result['intent']['categories']}")
        print(f"Response: {result['response']}")
    else:
        print(f"❌ {result['error']}")

asyncio.run(main())
```

### Custom Provider Setup

```python
from expense_api.apps.agent.client.config import LLMProvider

# Create Google provider
provider = LLMProvider.create_provider(
    'google',
    api_key='your-gemini-api-key',
    model='gemini-2.0-flash'
)

llm = provider.get_client()
# Use llm with LangChain or any framework
```

### Data Analysis

```python
from expense_api.apps.agent.client.analyzer import FinanceDataAnalyzer

analyzer = FinanceDataAnalyzer()

# Analyze Bengali/English mixed query
intent = analyzer.extract_intent("ami ajk 500 tk khoroch korechi")

print(f"Intent: {intent['type']}")  # 'add'
print(f"Categories: {intent['categories']}")  # ['expenses', 'time']
print(f"Amount: {intent['entities'].get('amount')}")  # 500
print(f"Confidence: {intent['confidence']:.0%}")
```

## Benefits of Refactoring

| Aspect | Before | After |
|--------|--------|-------|
| **LLM Support** | Claude only | Claude + Gemini |
| **Code Organization** | 800+ lines, mixed concerns | Modular, ~150 lines per file |
| **Configurability** | Hard-coded | Configuration-driven |
| **Error Handling** | Inconsistent | Standardized responses |
| **Testing** | Difficult | Modular, easy to test |
| **Maintainability** | Hard to extend | Easy to add providers/tools |
| **Documentation** | Minimal | Comprehensive |

## Environment Variables

```bash
# Google Gemini
export GOOGLE_API_KEY="your-gemini-api-key"

# Anthropic Claude
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Debug mode
export MCP_DEBUG="true"
```

## Backward Compatibility

- ✅ Old `client.py` still available (deprecated)
- ✅ Old `finance_mcp_server.py` still available (deprecated)
- ⚠️ New code should use refactored versions

## Future Enhancements

- [ ] Operation history tracking
- [ ] Caching for repeated queries
- [ ] Rate limiting
- [ ] Batch query processing
- [ ] Advanced analytics
- [ ] Multi-language support improvements
- [ ] Custom tool registration API

## Support

For issues or questions, refer to:
- [LangChain Documentation](https://python.langchain.com)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Gemini API](https://ai.google.dev)
- [Anthropic Documentation](https://docs.anthropic.com)
