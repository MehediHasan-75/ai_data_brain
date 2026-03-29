"""LLM provider configuration and MCP config loader."""
import os
import json
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class LLMConfig:
    provider: str
    model: str
    api_key: str
    temperature: float = 0
    max_tokens: Optional[int] = None


class LLMProvider:
    def __init__(self, config: LLMConfig):
        self.config = config

    def get_client(self):
        raise NotImplementedError

    @staticmethod
    def create_provider(provider: str, api_key: str, model: str) -> "LLMProvider":
        provider = provider.lower()
        if provider == "anthropic":
            return AnthropicProvider(
                LLMConfig(provider="anthropic", model=model or "claude-sonnet-4-6", api_key=api_key)
            )
        if provider == "google":
            return GoogleProvider(
                LLMConfig(provider="google", model=model or "gemini-2.0-flash", api_key=api_key)
            )
        if provider == "deepseek":
            return DeepSeekProvider(
                LLMConfig(provider="deepseek", model=model or "deepseek-chat", api_key=api_key)
            )
        raise ValueError(f"Unsupported LLM provider: {provider}")


class AnthropicProvider(LLMProvider):
    def get_client(self):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=self.config.model,
            temperature=self.config.temperature,
            anthropic_api_key=self.config.api_key,
        )


class GoogleProvider(LLMProvider):
    def get_client(self):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=self.config.model,
            temperature=self.config.temperature,
            google_api_key=self.config.api_key,
        )


class DeepSeekProvider(LLMProvider):
    def get_client(self):
        from langchain_deepseek import ChatDeepSeek
        return ChatDeepSeek(
            model=self.config.model,
            temperature=self.config.temperature,
            api_key=self.config.api_key,
        )


class MCPClientConfig:
    @staticmethod
    def load_config(config_path: str) -> Dict[str, Any]:
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"MCP config not found at: {config_path}")
        with open(config_path) as f:
            return json.load(f)

    @staticmethod
    def resolve_server_paths(config: Dict[str, Any], base_dir: str) -> Dict[str, Any]:
        for server_config in config.get("mcpServers", {}).values():
            if "args" in server_config:
                server_config["args"] = [
                    arg.replace("{BASE_DIR}", base_dir) if arg.startswith("{") else arg
                    for arg in server_config["args"]
                ]
        return config


DATA_CATEGORIES: Dict[str, list] = {
    "expenses": ["khoroch", "expense", "cost", "spent", "buy", "purchase"],
    "location": ["sylhet", "dhaka", "chittagong", "travel", "home", "work"],
    "time": ["daily", "monthly", "yearly", "ajk", "today", "gotokal", "yesterday"],
    "inventory": ["inventory", "stock", "supplies", "count", "quantity"],
    "health": ["exercise", "workout", "fitness", "meal", "weight", "sleep"],
    "productivity": ["task", "project", "work", "deadline", "meeting"],
}
