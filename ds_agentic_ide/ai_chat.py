import os
from together import Together
import google.generativeai as genai
from dotenv import load_dotenv
import logging
import time
from collections import deque
from datetime import datetime, timedelta

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
logger.info("Environment variables loaded")

class RateLimiter:
    def __init__(self, max_requests, time_window):
        self.max_requests = max_requests
        self.time_window = time_window  # in seconds
        self.requests = deque()
    
    def can_make_request(self):
        now = datetime.now()
        # Remove old requests
        while self.requests and (now - self.requests[0]) > timedelta(seconds=self.time_window):
            self.requests.popleft()
        
        return len(self.requests) < self.max_requests
    
    def add_request(self):
        self.requests.append(datetime.now())

class GeminiKeyManager:
    def __init__(self):
        # Collect all Google API keys (base key and numbered keys)
        self.api_keys = []
        
        # Check base key
        base_key = os.getenv('GOOGLE_API_KEY')
        if base_key:
            self.api_keys.append(base_key)
        
        # Check numbered keys (1 through 5)
        for i in range(1, 6):
            key = os.getenv(f'GOOGLE_API_KEY_{i}')
            if key:
                self.api_keys.append(key)
        
        if not self.api_keys:
            logger.warning("No Google API keys found in environment variables")
        else:
            logger.info(f"Loaded {len(self.api_keys)} Google API key(s)")
        
        # Initialize rate limiters for each key (60 requests per minute per key)
        self.rate_limiters = {
            key: RateLimiter(max_requests=60, time_window=60)
            for key in self.api_keys
        }
        
        self.current_key_index = 0
    
    def get_available_key(self):
        if not self.api_keys:
            return None
        
        # Try each key in rotation
        attempts = len(self.api_keys)
        while attempts > 0:
            key = self.api_keys[self.current_key_index]
            rate_limiter = self.rate_limiters[key]
            
            if rate_limiter.can_make_request():
                rate_limiter.add_request()
                return key
            
            # Move to next key
            self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
            attempts -= 1
        
        return None  # All keys are rate limited

class AIChat:
    def __init__(self):
        logger.info("Initializing AIChat...")
        
        # Initialize Together AI client
        together_api_key = os.getenv('TOGETHER_API_TOKEN')
        if not together_api_key:
            logger.error("TOGETHER_API_TOKEN not found in environment variables")
            raise ValueError("TOGETHER_API_TOKEN not found in environment variables")
        
        self.together_client = Together(api_key=together_api_key)
        self.together_model = "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"
        
        # Initialize Gemini key manager
        self.gemini_manager = GeminiKeyManager()
        
        # Initialize conversation history
        self.conversation_history = []
        
        logger.info("AIChat initialized successfully")
    
    async def send_message(self, message, model_preference="gemini"):
        """
        Send a message to the AI chat system
        
        Args:
            message (str): The user's message
            model_preference (str): Preferred model to use ("gemini" or "together")
            
        Returns:
            dict: Response containing the AI's reply and metadata
        """
        try:
            logger.info(f"Processing message with {model_preference} preference")
            
            # Try Gemini first if it's the preference and keys are available
            if model_preference == "gemini":
                gemini_key = self.gemini_manager.get_available_key()
                if gemini_key:
                    try:
                        response = await self._send_to_gemini(message, gemini_key)
                        return {
                            "status": "success",
                            "data": {
                                "response": response,
                                "model_used": "gemini"
                            }
                        }
                    except Exception as e:
                        logger.warning(f"Gemini request failed, falling back to Together: {str(e)}")
            
            # Fall back to Together AI
            response = await self._send_to_together(message)
            return {
                "status": "success",
                "data": {
                    "response": response,
                    "model_used": "together"
                }
            }
            
        except Exception as e:
            logger.error(f"Error in send_message: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e)}
    
    async def _send_to_gemini(self, message, api_key):
        """Send message to Gemini"""
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        # Include relevant conversation history
        context = self._get_conversation_context()
        prompt = f"{context}\n\nUser: {message}\nAssistant:"
        
        response = await model.generate_content_async(prompt)
        reply = response.text
        
        # Update conversation history
        self.conversation_history.append({"role": "user", "content": message})
        self.conversation_history.append({"role": "assistant", "content": reply})
        
        return reply
    
    async def _send_to_together(self, message):
        """Send message to Together AI"""
        # Include relevant conversation history
        context = self._get_conversation_context()
        prompt = f"{context}\n\nUser: {message}\nAssistant:"
        
        response = self.together_client.chat.completions.create(
            model=self.together_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.7,
            top_p=0.7,
            top_k=50,
            repetition_penalty=1,
            stop=["<|eot_id|>", "<|eom_id|>", "User:", "\n\n"],
            stream=True
        )
        
        reply = ""
        for token in response:
            if hasattr(token, 'choices'):
                reply += token.choices[0].delta.content
        
        # Update conversation history
        self.conversation_history.append({"role": "user", "content": message})
        self.conversation_history.append({"role": "assistant", "content": reply})
        
        return reply
    
    def _get_conversation_context(self):
        """Get the relevant conversation history as context"""
        # Keep only last 10 messages for context
        recent_history = self.conversation_history[-10:] if len(self.conversation_history) > 10 else self.conversation_history
        
        context = ""
        for msg in recent_history:
            role = msg["role"].capitalize()
            content = msg["content"]
            context += f"{role}: {content}\n"
        
        return context.strip()
    
    def clear_history(self):
        """Clear the conversation history"""
        self.conversation_history = []
        return {"status": "success", "message": "Conversation history cleared"}

# Create a singleton instance
logger.info("Creating AIChat singleton instance")
ai_chat = AIChat() 