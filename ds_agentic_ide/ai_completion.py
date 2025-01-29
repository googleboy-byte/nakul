import os
from together import Together
from dotenv import load_dotenv
import logging
import re

# Set up logging with more detailed format
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
logger.info("Environment variables loaded")

class AICompletion:
    def __init__(self):
        logger.info("Initializing AICompletion...")
        api_key = os.getenv('TOGETHER_API_TOKEN')
        if not api_key:
            logger.error("TOGETHER_API_TOKEN not found in environment variables")
            raise ValueError("TOGETHER_API_TOKEN not found in environment variables")
        
        logger.info("Creating Together client...")
        self.client = Together(api_key=api_key)
        self.model = "Qwen/Qwen2.5-Coder-32B-Instruct"
        logger.info("AICompletion initialized successfully")
        
    def get_completion(self, code_context, cursor_position, file_type):
        """
        Get code completion suggestions based on the current context
        
        Args:
            code_context (str): The code before and after the cursor
            cursor_position (int): Current cursor position
            file_type (str): Type of file (python, javascript, etc.)
            
        Returns:
            str: The completion suggestion
        """
        try:
            logger.info(f"Getting completion for file type: {file_type}")
            logger.debug(f"Cursor position: {cursor_position}")
            logger.debug(f"Total code length: {len(code_context)}")
            
            # Extract code before cursor for better context
            code_before = code_context[:cursor_position]
            code_after = code_context[cursor_position:]
            
            # Get the current line and indentation
            current_line = code_before.split('\n')[-1] if code_before else ""
            indentation = len(current_line) - len(current_line.lstrip())
            
            # Get the previous few lines for better context
            lines_before = code_before.split('\n')
            context_lines = lines_before[-10:] if len(lines_before) > 10 else lines_before
            
            # Get function/class context if we're inside one
            function_context = self._get_function_context(lines_before)
            class_context = self._get_class_context(lines_before)
            
            logger.debug(f"Current indentation: {indentation}")
            logger.debug(f"Function context: {function_context}")
            logger.debug(f"Class context: {class_context}")
            
            # Create a prompt that includes file type and context
            prompt = f"""You are a code completion AI. Complete the following {file_type} code. Important rules:
1. Only output the code completion itself, no markdown, no explanations, no comments
2. Maintain the current indentation level of {indentation} spaces
3. Complete the entire logical block or function
4. The completion must be syntactically correct
5. Follow the established coding style
6. Do not include any explanatory comments in the code
7. Do not wrap the code in backticks or markdown

Current context:
- File type: {file_type}
- Inside function: {function_context if function_context else 'No'}
- Inside class: {class_context if class_context else 'No'}

Previous code:
{''.join(context_lines)}

Complete from here (no comments or explanations):
{code_after[:200] if code_after else '[End of file]'}
"""
            
            logger.info("Sending request to Together API...")
            logger.debug(f"Using model: {self.model}")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500,  # Increased max tokens for longer completions
                temperature=0.7,
                top_p=0.7,
                top_k=50,
                repetition_penalty=1,
                stop=["<|eot_id|>", "<|eom_id|>"],
                stream=True
            )
            
            logger.info("Received streaming response from Together API")
            
            completion = ""
            for token in response:
                if hasattr(token, 'choices'):
                    completion += token.choices[0].delta.content
                    logger.debug(f"Received token: {token.choices[0].delta.content}")
            
            # Clean up the completion
            completion = self._clean_completion(completion)
            
            # Post-process the completion to maintain indentation
            completion = self._post_process_completion(completion, indentation)
            
            logger.info(f"Generated completion (length: {len(completion)})")
            logger.debug(f"Complete completion text: {completion}")
            
            return {"status": "success", "data": completion}
            
        except Exception as e:
            logger.error(f"Error generating completion: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e)}
    
    def _clean_completion(self, completion):
        """Clean up the completion by removing markdown and unnecessary elements"""
        # Remove markdown code blocks
        completion = re.sub(r'```[\w]*\n?', '', completion)
        completion = re.sub(r'```\n?', '', completion)
        
        # Remove trailing comments that explain the code
        lines = completion.split('\n')
        cleaned_lines = []
        for line in lines:
            # Remove comments that are explanatory (usually longer)
            if '#' in line:
                comment_start = line.find('#')
                comment_text = line[comment_start:].strip()
                # Keep short comments like "# noqa" or "# type: ignore"
                if len(comment_text) > 20:  # Arbitrary length for explanatory comments
                    line = line[:comment_start].rstrip()
            if line.strip():  # Only add non-empty lines
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
            
    def _get_function_context(self, lines):
        """Extract the current function name if we're inside a function"""
        for line in reversed(lines):
            line = line.strip()
            if line.startswith('def '):
                return line[4:line.find('(')]
        return None
        
    def _get_class_context(self, lines):
        """Extract the current class name if we're inside a class"""
        for line in reversed(lines):
            line = line.strip()
            if line.startswith('class '):
                return line[6:line.find('(') if '(' in line else -1]
        return None
        
    def _post_process_completion(self, completion, base_indentation):
        """Post-process the completion to maintain proper indentation"""
        if not completion:
            return completion
            
        lines = completion.split('\n')
        processed_lines = []
        
        for i, line in enumerate(lines):
            if not line.strip():  # Empty line
                processed_lines.append('')
                continue
                
            # Calculate the relative indentation of this line
            relative_indent = len(line) - len(line.lstrip())
            
            # For the first line, use the base indentation
            if i == 0:
                processed_lines.append(' ' * base_indentation + line.lstrip())
            else:
                # For subsequent lines, maintain relative indentation from the first line
                processed_lines.append(' ' * (base_indentation + relative_indent) + line.lstrip())
        
        return '\n'.join(processed_lines)

# Create a singleton instance
logger.info("Creating AICompletion singleton instance")
ai_completion = AICompletion() 