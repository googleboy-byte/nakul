import os
from together import Together
from dotenv import load_dotenv
import logging
import re

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
logger.info("Environment variables loaded")

class AIFormatter:
    def __init__(self):
        logger.info("Initializing AIFormatter...")
        api_key = os.getenv('TOGETHER_API_TOKEN')
        if not api_key:
            logger.error("TOGETHER_API_TOKEN not found in environment variables")
            raise ValueError("TOGETHER_API_TOKEN not found in environment variables")
        
        logger.info("Creating Together client...")
        self.client = Together(api_key=api_key)
        self.model = "Qwen/Qwen2.5-Coder-32B-Instruct"
        logger.info("AIFormatter initialized successfully")
    
    async def format_code(self, code, file_type):
        """
        Format the given code block using AI suggestions
        
        Args:
            code (str): The code to format
            file_type (str): The type of file (python, javascript, etc.)
            
        Returns:
            dict: A dictionary containing the formatted code and diff information
        """
        try:
            logger.info(f"Formatting code for file type: {file_type}")
            logger.debug(f"Code length: {len(code)}")
            
            # Create the formatting prompt
            prompt = f"""You are a code formatting AI. Format the following {file_type} code according to best practices. Important rules:
1. Only output the formatted code, no explanations or comments
2. Maintain the same functionality - do not change the logic
3. Follow language-specific style guides:
   - Python: PEP 8
   - JavaScript: Standard JS
   - HTML/CSS: Standard web formatting
4. Improve:
   - Indentation and spacing
   - Line breaks and grouping
   - Variable/function naming (if clearly improper)
   - Code organization
5. Do not:
   - Add or remove functionality
   - Add comments
   - Change correct variable names
   - Wrap in markdown blocks

Here's the code to format:

{code}

Formatted version (no explanations, just the formatted code):"""
            
            logger.info("Sending format request to Together API...")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,  # Large token limit for whole files
                temperature=0.3,  # Lower temperature for more consistent formatting
                top_p=0.2,
                top_k=40,
                repetition_penalty=1,
                stop=["<|eot_id|>", "<|eom_id|>"],
                stream=True
            )
            
            logger.info("Received streaming response from Together API")
            
            formatted_code = ""
            for token in response:
                if hasattr(token, 'choices'):
                    formatted_code += token.choices[0].delta.content
            
            # Clean up the formatted code
            formatted_code = self._clean_formatting(formatted_code)
            
            # Generate diff information
            diff_info = self._generate_diff(code, formatted_code)
            
            logger.info(f"Formatting complete. Changes: {len(diff_info['changes'])}")
            
            return {
                "status": "success",
                "data": {
                    "formatted_code": formatted_code,
                    "diff": diff_info
                }
            }
            
        except Exception as e:
            logger.error(f"Error formatting code: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e)}
    
    def _clean_formatting(self, code):
        """Clean up the formatted code by removing any markdown or unnecessary elements"""
        # Remove markdown code blocks
        code = re.sub(r'```[\w]*\n?', '', code)
        code = re.sub(r'```\n?', '', code)
        
        # Remove any trailing whitespace
        lines = code.split('\n')
        cleaned_lines = [line.rstrip() for line in lines]
        
        return '\n'.join(cleaned_lines)
    
    def _generate_diff(self, original, formatted):
        """Generate a diff between original and formatted code"""
        original_lines = original.split('\n')
        formatted_lines = formatted.split('\n')
        
        changes = []
        for i, (orig, new) in enumerate(zip(original_lines, formatted_lines)):
            if orig != new:
                changes.append({
                    "line": i + 1,
                    "original": orig,
                    "formatted": new,
                    "type": "modified"
                })
        
        # Handle added/removed lines
        len_diff = len(formatted_lines) - len(original_lines)
        if len_diff > 0:
            # Lines were added
            for i in range(len(original_lines), len(formatted_lines)):
                changes.append({
                    "line": i + 1,
                    "original": "",
                    "formatted": formatted_lines[i],
                    "type": "added"
                })
        elif len_diff < 0:
            # Lines were removed
            for i in range(len(formatted_lines), len(original_lines)):
                changes.append({
                    "line": i + 1,
                    "original": original_lines[i],
                    "formatted": "",
                    "type": "removed"
                })
        
        return {
            "changes": changes,
            "total_changes": len(changes),
            "lines_added": len([c for c in changes if c["type"] == "added"]),
            "lines_removed": len([c for c in changes if c["type"] == "removed"]),
            "lines_modified": len([c for c in changes if c["type"] == "modified"])
        }

# Create a singleton instance
logger.info("Creating AIFormatter singleton instance")
ai_formatter = AIFormatter() 