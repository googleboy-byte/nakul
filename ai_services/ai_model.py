"""
AI Model Service
Handles interactions with AI models (currently Gemini) for code analysis and modifications.
"""

import os
from dataclasses import dataclass
from typing import Dict, List, Optional
import google.generativeai as genai
from dotenv import load_dotenv

class AIServiceError(Exception):
    """Base exception class for AI service errors."""
    pass

class ConfigurationError(AIServiceError):
    """Raised when there are issues with the AI model configuration."""
    pass

class ModelInitializationError(AIServiceError):
    """Raised when the AI model fails to initialize."""
    pass

class PromptGenerationError(AIServiceError):
    """Raised when there are issues generating or processing prompts."""
    pass

class ModelResponseError(AIServiceError):
    """Raised when there are issues with the model's response."""
    pass

@dataclass
class AIModelConfig:
    model_name: str = "gemini-pro"
    api_key: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 1024

    def validate(self):
        """Validate the configuration settings."""
        if not self.api_key:
            raise ConfigurationError("API key is required but not provided")
        if not isinstance(self.temperature, (int, float)) or not 0 <= self.temperature <= 1:
            raise ConfigurationError("Temperature must be a float between 0 and 1")
        if not isinstance(self.max_tokens, int) or self.max_tokens <= 0:
            raise ConfigurationError("Max tokens must be a positive integer")

class AIModelService:
    def __init__(self, config: Optional[AIModelConfig] = None):
        try:
            self.config = config or self.load_config()
            self.config.validate()
            self._initialize_model()
        except Exception as e:
            raise ModelInitializationError(f"Failed to initialize AI model service: {str(e)}")
    
    @staticmethod
    def load_config() -> AIModelConfig:
        """Load configuration from environment variables."""
        try:
            load_dotenv()
            config = AIModelConfig(
                model_name=os.getenv('AI_MODEL_NAME', 'gemini-pro'),
                api_key=os.getenv('AI_API_KEY'),
                temperature=float(os.getenv('AI_TEMPERATURE', '0.7')),
                max_tokens=int(os.getenv('AI_MAX_TOKENS', '1024'))
            )
            return config
        except ValueError as e:
            raise ConfigurationError(f"Invalid configuration value: {str(e)}")
        except Exception as e:
            raise ConfigurationError(f"Failed to load configuration: {str(e)}")
    
    def _initialize_model(self):
        """Initialize the Gemini model."""
        try:
            genai.configure(api_key=self.config.api_key)
            self.model = genai.GenerativeModel(self.config.model_name)
        except Exception as e:
            raise ModelInitializationError(f"Failed to initialize Gemini model: {str(e)}")
    
    def _validate_context(self, file_contexts: List[Dict[str, str]]):
        """Validate the file contexts before processing."""
        if not file_contexts:
            raise PromptGenerationError("No file contexts provided")
        
        for ctx in file_contexts:
            if not isinstance(ctx, dict):
                raise PromptGenerationError("Invalid context format")
            if 'path' not in ctx or 'content' not in ctx:
                raise PromptGenerationError("Context missing required fields")
            if not isinstance(ctx['path'], str) or not isinstance(ctx['content'], str):
                raise PromptGenerationError("Invalid context field types")
    
    def _build_prompt(self, query: str, file_contexts: List[Dict[str, str]]) -> str:
        """Build a prompt for the AI model."""
        try:
            if not query.strip():
                raise PromptGenerationError("Empty query provided")
            
            self._validate_context(file_contexts)
            
            prompt = f"""You are a code assistant helping to modify a codebase. 
The user's request is: {query}

Here are the relevant files from the codebase:

"""
            for ctx in file_contexts:
                prompt += f"File: {ctx['path']}\n```\n{ctx['content']}\n```\n\n"
            
            prompt += """Please analyze these files and suggest changes to fulfill the user's request.
For each file that needs modifications, provide:
1. The file path
2. The exact changes needed in a unified diff format
3. A brief explanation of the changes

Respond in a structured format that can be parsed programmatically."""
            
            return prompt
            
        except Exception as e:
            raise PromptGenerationError(f"Failed to build prompt: {str(e)}")
    
    def _parse_response(self, response) -> Dict[str, str]:
        """Parse and validate the model's response."""
        try:
            # TODO: Implement response parsing
            if not response or not response.text:
                raise ModelResponseError("Empty response from model")
            
            # For now, return empty dict
            return {}
            
        except Exception as e:
            raise ModelResponseError(f"Failed to parse model response: {str(e)}")
    
    async def generate_changes(self, query: str, file_contexts: List[Dict[str, str]]) -> Dict[str, str]:
        """
        Generate changes for the given files based on the query.
        Returns a dictionary mapping file paths to their modified content.
        """
        try:
            prompt = self._build_prompt(query, file_contexts)
            
            response = await self.model.generate_content_async(prompt)
            return self._parse_response(response)
            
        except AIServiceError:
            # Re-raise AI service specific errors
            raise
        except Exception as e:
            raise ModelResponseError(f"Failed to generate changes: {str(e)}")
    
    def __str__(self):
        """String representation for debugging."""
        return f"AIModelService(model={self.config.model_name}, temperature={self.config.temperature})" 