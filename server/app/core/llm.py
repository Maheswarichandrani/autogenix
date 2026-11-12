"""
core/llm.py

Unified LLM abstraction layer supporting multiple AI providers.
Provides consistent interface for streaming and non-streaming operations.
Handles model versioning, configuration, and provider-specific differences.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Union, Iterator, AsyncIterator
from dataclasses import dataclass
from enum import Enum
import json
import asyncio
import time
import logging
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)

# Provider-specific imports
try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import openai
except ImportError:
    openai = None

try:
    from groq import Groq
except ImportError:
    Groq = None

from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from app.core.config import settings


class LLMProvider(Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    GROQ = "groq"


@dataclass
class LLMConfig:
    provider: LLMProvider
    model: str
    api_key: str
    max_tokens: int = 4096
    temperature: float = 0.0
    timeout: int = 30
    # Set for models with always-on adaptive thinking (Claude Sonnet 5.5).
    # The Anthropic provider then sends output_config.effort, sends no
    # temperature (non-default sampling values are a 400 on these models),
    # never lowers max_tokens below this config's value (thinking counts
    # toward it), and enables server-side refusal fallback.
    effort: Optional[str] = None


@dataclass
class StreamChunk:
    content: str
    role: str = "assistant"
    done: bool = False
    
    
@dataclass
class LLMResponse:
    content: str
    role: str = "assistant"
    tool_calls: List[Dict] = None
    # Anthropic only: every response content block as a dict, including
    # thinking blocks. Callers building tool-loop history must send this
    # back unchanged as the assistant turn (preserved thinking).
    raw_content: Optional[List[Dict]] = None

    def __post_init__(self):
        if self.tool_calls is None:
            self.tool_calls = []


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers"""
    
    @abstractmethod
    def chat_completion(self, messages: List[Dict], **kwargs) -> LLMResponse:
        pass
    
    @abstractmethod
    def chat_completion_stream(self, messages: List[Dict], **kwargs) -> Iterator[StreamChunk]:
        pass
    
    @abstractmethod
    def chat_completion_with_tools(self, messages: List[Dict], tools: List[Dict], **kwargs) -> LLMResponse:
        pass


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider"""
    
    def __init__(self, config: LLMConfig):
        if anthropic is None:
            raise ImportError("anthropic package not installed")
        
        self.config = config
        self.client = anthropic.Anthropic(api_key=config.api_key)
    
    def _convert_messages(self, messages: List[Dict]) -> tuple[str, List[Dict]]:
        """
        Convert to Anthropic format: separate system message.
        
        IMPORTANT: Anthropic tool-calling uses structured content blocks —
        assistant messages have [{"type":"tool_use", ...}] and user messages
        have [{"type":"tool_result", ...}].  We must pass those through
        unchanged.  Only plain-string content gets the simple {"role","content"}
        treatment.  Dropping list content silently breaks the tool-call loop.
        """
        system = ""
        anthropic_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                # Anthropic system is a top-level kwarg, not a message
                system = msg["content"] if isinstance(msg["content"], str) else str(msg["content"])
            else:
                # Preserve the full message dict — this keeps 'content' whether
                # it's a plain string or a list of content blocks (tool_use /
                # tool_result).  Also preserves any extra keys like 'tool_calls'.
                clean = {"role": msg["role"], "content": msg["content"]}
                anthropic_messages.append(clean)
        
        return system, anthropic_messages
    
    def chat_completion(self, messages: List[Dict], **kwargs) -> LLMResponse:
        system, anthropic_messages = self._convert_messages(messages)
        
        response = self.client.messages.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            system=system,
            messages=anthropic_messages,
        )
        
        return LLMResponse(
            content=response.content[0].text if response.content else "",
            role="assistant"
        )
    
    def chat_completion_stream(self, messages: List[Dict], **kwargs) -> Iterator[StreamChunk]:
        system, anthropic_messages = self._convert_messages(messages)
        
        with self.client.messages.stream(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            system=system,
            messages=anthropic_messages,
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, 'text'):
                        yield StreamChunk(content=event.delta.text)
                elif event.type == "message_stop":
                    yield StreamChunk(content="", done=True)
    
    def chat_completion_with_tools(self, messages: List[Dict], tools: List[Dict], **kwargs) -> LLMResponse:
        system, anthropic_messages = self._convert_messages(messages)
        
        # Convert tools to Anthropic format
        anthropic_tools = []
        for tool in tools:
            anthropic_tools.append({
                "name": tool["name"],
                "description": tool["description"],
                "input_schema": tool["parameters"]
            })
        
        params: Dict[str, Any] = {
            "model":       self.config.model,
            "max_tokens":  kwargs.get("max_tokens", self.config.max_tokens),
            "system":      system,
            "messages":    anthropic_messages,
            "tools":       anthropic_tools,
            "tool_choice": {"type": "auto"},
        }
        if self.config.effort:
            # Thinking model: no sampling params, effort instead, and room
            # for thinking + reply. Refusals fall back server-side to a model
            # that may accept the request (e.g. Guardian's injection payloads).
            params["max_tokens"]    = max(params["max_tokens"], self.config.max_tokens)
            params["output_config"] = {"effort": self.config.effort}
            create = lambda: self.client.beta.messages.create(  # noqa: E731
                betas=["server-side-fallback-2026-07-01"],
                extra_body={"fallbacks": "default"},
                **params,
            )
        else:
            params["temperature"] = kwargs.get("temperature", self.config.temperature)
            create = lambda: self.client.messages.create(**params)  # noqa: E731

        # Retry with exponential backoff on real 429s only.
        max_retries = 5
        for attempt in range(max_retries):
            try:
                response = create()
                break
            except anthropic.RateLimitError:
                if attempt == max_retries - 1:
                    raise
                wait = 2 ** attempt * 5  # 5s, 10s, 20s, 40s
                log.warning(
                    "Anthropic 429 rate-limit on attempt %d/%d — retrying in %ds",
                    attempt + 1, max_retries, wait,
                )
                time.sleep(wait)

        if response.stop_reason == "refusal":
            details  = getattr(response, "stop_details", None)
            category = getattr(details, "category", None) or "unknown"
            reason   = getattr(details, "explanation", None) or "no explanation given"
            raise RuntimeError(f"Model declined the request ({category}): {reason}")

        # Read blocks by type: a response can start with thinking blocks.
        # Capture ALL tool_use blocks — each needs its own tool_result.
        tool_calls = []
        content = ""

        for block in response.content:
            if block.type == "text":
                content += block.text
            elif block.type == "tool_use":
                tool_calls.append({
                    "id":   block.id,
                    "name": block.name,
                    "args": block.input,
                })

        return LLMResponse(
            content=content,
            role="assistant",
            tool_calls=tool_calls,
            raw_content=[b.model_dump(mode="json", exclude_none=True) for b in response.content],
        )


class OpenAIProvider(BaseLLMProvider):
    """OpenAI GPT provider"""
    
    def __init__(self, config: LLMConfig):
        if openai is None:
            raise ImportError("openai package not installed")
        
        self.config = config
        self.client = openai.OpenAI(api_key=config.api_key)
    
    def chat_completion(self, messages: List[Dict], **kwargs) -> LLMResponse:
        response = self.client.chat.completions.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            messages=messages,
        )
        
        return LLMResponse(
            content=response.choices[0].message.content or "",
            role="assistant"
        )
    
    def chat_completion_stream(self, messages: List[Dict], **kwargs) -> Iterator[StreamChunk]:
        response = self.client.chat.completions.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            messages=messages,
            stream=True,
        )
        
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield StreamChunk(content=chunk.choices[0].delta.content)
            if chunk.choices[0].finish_reason:
                yield StreamChunk(content="", done=True)
    
    def chat_completion_with_tools(self, messages: List[Dict], tools: List[Dict], **kwargs) -> LLMResponse:
        # Convert tools to OpenAI format
        openai_tools = [{"type": "function", "function": tool} for tool in tools]
        
        # Sanitise: ensure content is string|None, preserve tool_calls, etc.
        clean_messages = []
        for msg in messages:
            m = {"role": msg["role"]}
            content = msg.get("content")
            if isinstance(content, list):
                # Anthropic-style blocks → flatten for OpenAI
                parts = []
                for block in content:
                    if isinstance(block, dict) and "text" in block:
                        parts.append(block["text"])
                    elif isinstance(block, dict) and "content" in block:
                        parts.append(str(block["content"]))
                    elif isinstance(block, str):
                        parts.append(block)
                m["content"] = "\n".join(parts) if parts else ""
            else:
                m["content"] = content
            if "tool_calls" in msg:
                m["tool_calls"] = msg["tool_calls"]
            if msg["role"] == "tool":
                m["tool_call_id"] = msg.get("tool_call_id", "")
                m["name"] = msg.get("name", "")
            clean_messages.append(m)
        
        response = self.client.chat.completions.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            messages=clean_messages,
            tools=openai_tools,
        )
        
        message = response.choices[0].message
        tool_calls = []
        
        if message.tool_calls:
            for tc in message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {"raw": tc.function.arguments}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "args": args,
                })
        
        return LLMResponse(
            content=message.content or "",
            role="assistant",
            tool_calls=tool_calls
        )


class GroqProvider(BaseLLMProvider):
    """Groq provider"""
    
    def __init__(self, config: LLMConfig):
        if Groq is None:
            raise ImportError("groq package not installed")
        
        self.config = config
        self.client = Groq(api_key=config.api_key)
    
    def chat_completion(self, messages: List[Dict], **kwargs) -> LLMResponse:
        response = self.client.chat.completions.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            messages=messages,
        )
        
        return LLMResponse(
            content=response.choices[0].message.content or "",
            role="assistant"
        )
    
    def chat_completion_stream(self, messages: List[Dict], **kwargs) -> Iterator[StreamChunk]:
        response = self.client.chat.completions.create(
            model=self.config.model,
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
            temperature=kwargs.get("temperature", self.config.temperature),
            messages=messages,
            stream=True,
        )
        
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield StreamChunk(content=chunk.choices[0].delta.content)
            if chunk.choices[0].finish_reason:
                yield StreamChunk(content="", done=True)
    
    def chat_completion_with_tools(self, messages: List[Dict], tools: List[Dict], **kwargs) -> LLMResponse:
        # Convert tools to Groq format (same as OpenAI)
        groq_tools = [{"type": "function", "function": tool} for tool in tools]
        
        # Sanitise messages: strip any keys Groq doesn't understand.
        # Groq follows the OpenAI format — assistant messages may carry
        # "tool_calls" and tool-result messages have role="tool".
        # We must NOT accidentally drop the "tool_calls" key from
        # assistant messages, or Groq will reject subsequent "role":"tool"
        # messages that reference those call IDs.
        clean_messages = []
        for msg in messages:
            m = {"role": msg["role"]}
            # content — must be a string (or None for tool-calling assistant msgs)
            content = msg.get("content")
            if isinstance(content, list):
                # Anthropic-style content blocks → flatten to string for Groq
                parts = []
                for block in content:
                    if isinstance(block, dict) and "text" in block:
                        parts.append(block["text"])
                    elif isinstance(block, dict) and "content" in block:
                        parts.append(str(block["content"]))
                    elif isinstance(block, str):
                        parts.append(block)
                m["content"] = "\n".join(parts) if parts else ""
            else:
                m["content"] = content
            # Preserve tool_calls on assistant messages
            if "tool_calls" in msg:
                m["tool_calls"] = msg["tool_calls"]
            # Preserve tool-result fields
            if msg["role"] == "tool":
                m["tool_call_id"] = msg.get("tool_call_id", "")
                m["name"] = msg.get("name", "")
            clean_messages.append(m)
        
        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
                temperature=kwargs.get("temperature", self.config.temperature),
                messages=clean_messages,
                tools=groq_tools,
                tool_choice="auto",
                parallel_tool_calls=False,   # serialise calls — more reliable
            )
        except Exception as e:
            # If the API rejects tool-calling (e.g. unsupported model), fall
            # back to a plain completion so we at least get text back.
            import logging
            logging.getLogger(__name__).warning(
                "Groq tool-calling request failed (%s), falling back to plain chat", e
            )
            response = self.client.chat.completions.create(
                model=self.config.model,
                max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
                temperature=kwargs.get("temperature", self.config.temperature),
                messages=clean_messages,
            )
        
        message = response.choices[0].message
        tool_calls = []
        
        if message.tool_calls:
            for tc in message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {"raw": tc.function.arguments}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "args": args,
                })
        
        return LLMResponse(
            content=message.content or "",
            role="assistant",
            tool_calls=tool_calls
        )


class UnifiedLLM:
    """
    Unified LLM client supporting multiple providers with consistent interface.
    Handles provider selection, model versioning, and feature normalization.
    """
    
    # Predefined model configurations
    MODELS = {
        # Anthropic models
        "claude-sonnet-5-5": LLMConfig(
            provider=LLMProvider.ANTHROPIC,
            model="claude-sonnet-5-5",
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=16000,      # thinking counts toward it; non-streaming ceiling
            effort="medium",       # guide's starting point for agentic coding / tool use
        ),
        "claude-haiku-4-5": LLMConfig(
            provider=LLMProvider.ANTHROPIC,
            model="claude-haiku-4-5",
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=8192,
            temperature=0.0
        ),
        "claude-3-5-sonnet": LLMConfig(
            provider=LLMProvider.ANTHROPIC,
            model="claude-3-5-sonnet-20241022",
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=8192,
            temperature=0.0
        ),
        "claude-3-opus": LLMConfig(
            provider=LLMProvider.ANTHROPIC,
            model="claude-3-opus-20240229", 
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        
        # OpenAI models
        "gpt-4o": LLMConfig(
            provider=LLMProvider.OPENAI,
            model="gpt-4o-2024-11-20",
            api_key=settings.OPENAI_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        "gpt-4-turbo": LLMConfig(
            provider=LLMProvider.OPENAI,
            model="gpt-4-turbo-2024-04-09",
            api_key=settings.OPENAI_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        "gpt-3.5-turbo": LLMConfig(
            provider=LLMProvider.OPENAI,
            model="gpt-3.5-turbo-0125",
            api_key=settings.OPENAI_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        
        # Groq models
        "llama-3.1-70b": LLMConfig(
            provider=LLMProvider.GROQ,
            model="llama-3.1-70b-versatile",
            api_key=settings.GROQ_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        "llama-3.1-8b": LLMConfig(
            provider=LLMProvider.GROQ,
            model="llama-3.1-8b-instant",
            api_key=settings.GROQ_API_KEY,
            max_tokens=4096,
            temperature=0.0
        ),
        "mixtral-8x7b": LLMConfig(
            provider=LLMProvider.GROQ,
            model="mixtral-8x7b-32768",
            api_key=settings.GROQ_API_KEY,
            max_tokens=8192,
            temperature=0.0
        ),
        "gemma2-9b": LLMConfig(
            provider=LLMProvider.GROQ,
            model="gemma2-9b-it",
            api_key=settings.GROQ_API_KEY,
            max_tokens=4096,
            temperature=0.0
        )
    }
    
    def __init__(self, model_name: str = "claude-3-5-sonnet"):
        """
        Initialize with a model name from MODELS dict.
        
        Args:
            model_name: Key from MODELS dict (e.g., "claude-3-5-sonnet", "gpt-4o")
        """
        if model_name not in self.MODELS:
            available = ", ".join(self.MODELS.keys())
            raise ValueError(f"Model '{model_name}' not available. Choose from: {available}")
        
        self.config = self.MODELS[model_name]
        self.model_name = model_name
        
        # Initialize provider
        if self.config.provider == LLMProvider.ANTHROPIC:
            self.provider = AnthropicProvider(self.config)
        elif self.config.provider == LLMProvider.OPENAI:
            self.provider = OpenAIProvider(self.config)
        elif self.config.provider == LLMProvider.GROQ:
            self.provider = GroqProvider(self.config)
        else:
            raise ValueError(f"Unsupported provider: {self.config.provider}")
    
    def chat(self, messages: Union[List[Dict], str], **kwargs) -> LLMResponse:
        """
        Simple chat completion.
        
        Args:
            messages: Either a list of message dicts or a single string (converted to user message)
            **kwargs: Override config parameters (max_tokens, temperature, etc.)
        """
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        return self.provider.chat_completion(messages, **kwargs)
    
    def chat_stream(self, messages: Union[List[Dict], str], **kwargs) -> Iterator[StreamChunk]:
        """
        Streaming chat completion.
        
        Args:
            messages: Either a list of message dicts or a single string
            **kwargs: Override config parameters
        """
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        return self.provider.chat_completion_stream(messages, **kwargs)
    
    def chat_with_tools(self, messages: Union[List[Dict], str], tools: List[Union[Dict, BaseTool]], **kwargs) -> LLMResponse:
        """
        Chat completion with tool calling support.
        
        Args:
            messages: Message history
            tools: List of tool definitions or LangChain BaseTool objects
            **kwargs: Override config parameters
        """
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        
        # Convert LangChain tools to dict format
        tool_defs = []
        for tool in tools:
            if isinstance(tool, BaseTool):
                schema = tool.args_schema.model_json_schema() if tool.args_schema else {"type": "object", "properties": {}}
                # Clean Pydantic JSON Schema for OpenAI/Groq compatibility:
                # Remove 'title' at top level and from each property (Groq can choke on them),
                # remove '$defs' (unused in flat tool schemas).
                schema.pop("title", None)
                schema.pop("$defs", None)
                schema.pop("definitions", None)
                for prop in schema.get("properties", {}).values():
                    if isinstance(prop, dict):
                        prop.pop("title", None)
                # Ensure 'type' is present
                schema.setdefault("type", "object")
                tool_defs.append({
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": schema,
                })
            else:
                tool_defs.append(tool)
        
        return self.provider.chat_completion_with_tools(messages, tool_defs, **kwargs)
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model"""
        return {
            "name": self.model_name,
            "provider": self.config.provider.value,
            "model": self.config.model,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
    
    @classmethod
    def list_models(cls) -> List[str]:
        """List all available model names"""
        return list(cls.MODELS.keys())
    
    @classmethod
    def create_custom(cls, provider: LLMProvider, model: str, api_key: str, **kwargs) -> 'UnifiedLLM':
        """Create UnifiedLLM with custom configuration"""
        config = LLMConfig(
            provider=provider,
            model=model,
            api_key=api_key,
            **kwargs
        )
        
        llm = cls.__new__(cls)
        llm.config = config
        llm.model_name = f"custom-{model}"
        
        if provider == LLMProvider.ANTHROPIC:
            llm.provider = AnthropicProvider(config)
        elif provider == LLMProvider.OPENAI:
            llm.provider = OpenAIProvider(config)
        elif provider == LLMProvider.GROQ:
            llm.provider = GroqProvider(config)
        else:
            raise ValueError(f"Unsupported provider: {provider}")
        
        return llm


# Convenience functions for common use cases
def get_llm(model: str = "claude-3-5-sonnet") -> UnifiedLLM:
    """Get a UnifiedLLM instance with specified model"""
    return UnifiedLLM(model)


def chat(prompt: str, model: str = "claude-3-5-sonnet", **kwargs) -> str:
    """Quick chat function - returns just the text content"""
    llm = get_llm(model)
    response = llm.chat(prompt, **kwargs)
    return response.content


def chat_stream(prompt: str, model: str = "claude-3-5-sonnet", **kwargs) -> Iterator[str]:
    """Quick streaming chat - yields text content only"""
    llm = get_llm(model)
    for chunk in llm.chat_stream(prompt, **kwargs):
        if not chunk.done:
            yield chunk.content
