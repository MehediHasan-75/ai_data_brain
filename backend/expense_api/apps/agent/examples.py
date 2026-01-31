"""
Example Usage of Refactored MCP Client

Demonstrates how to use the new modular client with different LLM providers.
"""

import asyncio
import os
from pathlib import Path


# Example 1: Basic query with Gemini
async def example_gemini():
    """Process a query using Google Gemini."""
    from expense_api.apps.agent.client.client_refactored import run_query
    
    print("=" * 60)
    print("Example 1: Using Google Gemini")
    print("=" * 60)
    
    result = await run_query(
        query="I spent 500 tk on books today",
        user_id=1,
        llm_provider='google',
        llm_model='gemini-2.0-flash'
    )
    
    if result['success']:
        print(f"✅ Success: {result['message']}")
        print(f"Query: {result['query']}")
        print(f"LLM Provider: {result['llm_provider']}")
        print(f"Intent Type: {result['intent']['type']}")
        print(f"Categories: {result['intent']['categories']}")
        print(f"Confidence: {result['intent']['confidence']:.0%}")
    else:
        print(f"❌ Error: {result['error']}")


# Example 2: Using Claude
async def example_claude():
    """Process a query using Anthropic Claude."""
    from expense_api.apps.agent.client.client_refactored import run_query
    
    print("\n" + "=" * 60)
    print("Example 2: Using Anthropic Claude")
    print("=" * 60)
    
    result = await run_query(
        query="ami ajk 500 tk khoroch korechi",  # Bengali: I spent 500 tk today
        user_id=1,
        llm_provider='anthropic',
        llm_model='claude-3-5-sonnet-20240620'
    )
    
    if result['success']:
        print(f"✅ Success: {result['message']}")
        print(f"Query: {result['query']}")
        print(f"LLM Provider: {result['llm_provider']}")
    else:
        print(f"❌ Error: {result['error']}")


# Example 3: Context manager usage
async def example_context_manager():
    """Use the client with async context manager."""
    from expense_api.apps.agent.client.client_refactored import MCPClient
    
    print("\n" + "=" * 60)
    print("Example 3: Context Manager Usage")
    print("=" * 60)
    
    async with MCPClient(
        llm_provider='google',
        llm_model='gemini-2.0-flash'
    ) as client:
        print("✅ Client connected")
        
        # Process multiple queries
        queries = [
            "Create a table for tracking daily expenses",
            "Add an entry for 250 tk food expense",
            "Show me all my tables"
        ]
        
        for query in queries:
            print(f"\nProcessing: {query}")
            result = await client.process_query(query, user_id=1)
            if result['success']:
                print(f"✅ {result['message']}")


# Example 4: Data analysis without LLM
async def example_data_analysis():
    """Demonstrate data analysis capabilities."""
    from expense_api.apps.agent.client.analyzer import FinanceDataAnalyzer, TableMatcher
    
    print("\n" + "=" * 60)
    print("Example 4: Data Analysis & Table Matching")
    print("=" * 60)
    
    analyzer = FinanceDataAnalyzer()
    matcher = TableMatcher()
    
    # Analyze query
    query = "I spent 500 tk on books at Dhaka today"
    intent = analyzer.extract_intent(query)
    
    print(f"\n📊 Query Analysis:")
    print(f"Query: {query}")
    print(f"Intent Type: {intent['type']}")
    print(f"Categories: {intent['categories']}")
    print(f"Entities: {intent['entities']}")
    print(f"Time References: {intent['time_references']}")
    print(f"Confidence: {intent['confidence']:.0%}")
    
    # Simulate table matching
    sample_tables = [
        {
            "id": 1,
            "table_name": "Daily Expenses",
            "description": "Daily expense tracking"
        },
        {
            "id": 2,
            "table_name": "Book Collection",
            "description": "Track books I've read"
        },
        {
            "id": 3,
            "table_name": "Travel Expenses",
            "description": "Track travel costs"
        }
    ]
    
    best_match = matcher.find_best_match(sample_tables, query)
    
    if best_match:
        print(f"\n🎯 Best Table Match:")
        print(f"Table: {best_match['table']['table_name']}")
        print(f"Match Score: {best_match['score']:.0%}")
        print(f"Reasoning: {best_match['reasoning']}")


# Example 5: Provider setup
async def example_provider_setup():
    """Demonstrate LLM provider setup."""
    from expense_api.apps.agent.client.config import LLMProvider, LLMConfig
    
    print("\n" + "=" * 60)
    print("Example 5: LLM Provider Setup")
    print("=" * 60)
    
    # Get API keys
    google_api_key = os.getenv('GOOGLE_API_KEY')
    anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')
    
    if not google_api_key:
        print("❌ GOOGLE_API_KEY not set")
    else:
        print("✅ Google API key found")
        
        try:
            google_provider = LLMProvider.create_provider(
                'google',
                google_api_key,
                'gemini-2.0-flash'
            )
            print("✅ Google provider created")
        except Exception as e:
            print(f"❌ Failed to create Google provider: {e}")
    
    if not anthropic_api_key:
        print("❌ ANTHROPIC_API_KEY not set")
    else:
        print("✅ Anthropic API key found")
        
        try:
            anthropic_provider = LLMProvider.create_provider(
                'anthropic',
                anthropic_api_key,
                'claude-3-5-sonnet-20240620'
            )
            print("✅ Anthropic provider created")
        except Exception as e:
            print(f"❌ Failed to create Anthropic provider: {e}")


# Example 6: Error handling
async def example_error_handling():
    """Demonstrate error handling."""
    from expense_api.apps.agent.client.client_refactored import MCPClient
    
    print("\n" + "=" * 60)
    print("Example 6: Error Handling")
    print("=" * 60)
    
    try:
        # Try with invalid provider
        client = MCPClient(
            llm_provider='invalid_provider',
            api_key='dummy-key'
        )
        print("❌ Should have raised error for invalid provider")
    except ValueError as e:
        print(f"✅ Caught expected error: {e}")
    
    try:
        # Try without API key
        client = MCPClient(
            llm_provider='google',
            api_key=None
        )
        print("❌ Should have raised error for missing API key")
    except ValueError as e:
        print(f"✅ Caught expected error: {e}")


# Example 7: Batch processing
async def example_batch_processing():
    """Process multiple queries efficiently."""
    from expense_api.apps.agent.client.client_refactored import MCPClient
    
    print("\n" + "=" * 60)
    print("Example 7: Batch Query Processing")
    print("=" * 60)
    
    queries = [
        "Show my daily expenses",
        "Add 500 tk food expense",
        "List all tables",
        "Create expense tracker",
        "Delete old entries"
    ]
    
    async with MCPClient(llm_provider='google') as client:
        results = []
        
        for query in queries:
            print(f"Processing: {query}...", end=" ")
            result = await client.process_query(query, user_id=1)
            results.append(result)
            
            if result['success']:
                print("✅")
            else:
                print("❌")
        
        # Summary
        successful = sum(1 for r in results if r['success'])
        print(f"\n📊 Summary: {successful}/{len(queries)} queries successful")


# Main execution
async def main():
    """Run all examples."""
    
    print("""
    ╔════════════════════════════════════════════════════════════╗
    ║       Refactored MCP Client - Usage Examples              ║
    ║                                                            ║
    ║  This demonstrates the new modular client with:           ║
    ║  • Multiple LLM provider support (Claude, Gemini)          ║
    ║  • Data analysis and intelligent matching                 ║
    ║  • Clean error handling                                   ║
    ║  • Async/await support                                    ║
    ╚════════════════════════════════════════════════════════════╝
    """)
    
    # Run examples
    examples = [
        ("Gemini Example", example_gemini),
        ("Claude Example", example_claude),
        ("Context Manager", example_context_manager),
        ("Data Analysis", example_data_analysis),
        ("Provider Setup", example_provider_setup),
        ("Error Handling", example_error_handling),
        ("Batch Processing", example_batch_processing),
    ]
    
    # Note: Only run data analysis and provider setup (don't need API calls)
    # Uncomment others when you have API keys set up
    
    print("\n" + "=" * 60)
    print("Running examples (non-API examples)...")
    print("=" * 60)
    
    try:
        await example_data_analysis()
        await example_provider_setup()
        await example_error_handling()
    except Exception as e:
        print(f"❌ Error running examples: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    import django
    from django.conf import settings
    
    # Django setup
    if not settings.configured:
        django.setup()
    
    # Run examples
    asyncio.run(main())
