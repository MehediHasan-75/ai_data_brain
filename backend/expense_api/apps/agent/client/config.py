"""
MCP Client Configuration and Base Classes

Provides base client configuration, constants, and abstractions for different LLM providers.
"""

import os
import json
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class LLMConfig:
    """Configuration for LLM providers."""
    provider: str  # 'anthropic', 'google'
    model: str
    api_key: str
    temperature: float = 0
    max_tokens: Optional[int] = None


class LLMProvider:
    """Base class for LLM provider integration."""
    
    def __init__(self, config: LLMConfig):
        self.config = config
    
    def get_client(self):
        """Get the LLM client instance."""
        raise NotImplementedError
    
    @staticmethod
    def create_provider(provider: str, api_key: str, model: str) -> 'LLMProvider':
        """Factory method to create LLM provider."""
        if provider.lower() == 'anthropic':
            return AnthropicProvider(
                LLMConfig(
                    provider='anthropic',
                    model=model or 'claude-3-5-sonnet-20240620',
                    api_key=api_key
                )
            )
        elif provider.lower() == 'google':
            return GoogleProvider(
                LLMConfig(
                    provider='google',
                    model=model or 'gemini-2.0-flash',
                    api_key=api_key
                )
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")


class AnthropicProvider(LLMProvider):
    """Anthropic (Claude) LLM provider."""
    
    def get_client(self):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=self.config.model,
            temperature=self.config.temperature,
            anthropic_api_key=self.config.api_key
        )


class GoogleProvider(LLMProvider):
    """Google (Gemini) LLM provider."""
    
    def get_client(self):
        import google.generativeai as genai
        
        # Configure Gemini with the API key
        genai.configure(api_key=self.config.api_key)
        
        # Create a custom Gemini chat model using LangChain's ChatGenerate
        
        # Use the direct google-generativeai library
        class GeminiLLM:
            def __init__(self, model, api_key, temperature):
                self.model = genai.GenerativeModel(model)
                self.temperature = temperature
            
            def invoke(self, messages):
                # Format messages for Gemini
                prompt_text = ""
                for msg in messages:
                    if hasattr(msg, 'content'):
                        prompt_text += msg.content + "\n"
                    else:
                        prompt_text += str(msg) + "\n"
                
                response = self.model.generate_content(
                    prompt_text,
                    generation_config=genai.types.GenerationConfig(
                        temperature=self.temperature,
                        max_output_tokens=2048
                    )
                )
                return response.text
        
        return GeminiLLM(self.config.model, self.config.api_key, self.config.temperature)


class MCPClientConfig:
    """MCP Client configuration loader."""
    
    @staticmethod
    def load_config(config_path: str) -> Dict[str, Any]:
        """Load MCP configuration from JSON file."""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"MCP config not found at: {config_path}")
        
        with open(config_path, 'r') as f:
            return json.load(f)
    
    @staticmethod
    def resolve_server_paths(config: Dict[str, Any], base_dir: str) -> Dict[str, Any]:
        """Resolve server script paths in configuration."""
        for server_name, server_config in config.get("mcpServers", {}).items():
            if "args" in server_config:
                server_config["args"] = [
                    arg.replace("{BASE_DIR}", base_dir) 
                    if arg.startswith("{") else arg
                    for arg in server_config["args"]
                ]
        return config


# Constants for data analysis and matching
DATA_CATEGORIES = {
    'expenses': ['khoroch', 'expense', 'cost', 'spent', 'buy', 'purchase'],
    'location': ['sylhet', 'dhaka', 'chittagong', 'travel', 'home', 'work'],
    'time': ['daily', 'monthly', 'yearly', 'ajk', 'today', 'gotokal', 'yesterday'],
    'inventory': ['inventory', 'stock', 'supplies', 'count', 'quantity'],
    'health': ['exercise', 'workout', 'fitness', 'meal', 'weight', 'sleep'],
    'productivity': ['task', 'project', 'work', 'deadline', 'meeting'],
}

RESPONSE_TEMPLATES = {
    'success': "🎯 **Success:** {message}",
    'error': "❌ **Error:** {message}",
    'info': "ℹ️ **Info:** {message}",
    'analysis': "🧠 **Analysis:** {message}",
}
