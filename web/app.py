import os
import eel
from ai_services import ContextManager
from typing import Optional
from dataclasses import dataclass

@dataclass
class State:
    workspace: Optional[str] = None
    context_manager = None

# Initialize global state
state = State()

@eel.expose
def handle_build_prompt(prompt: str) -> str:
    """Handle prompts from the Build tab."""
    try:
        if not state.workspace:
            return "Please open a workspace first."
        
        if not os.path.exists(state.workspace):
            state.workspace = None
            return "Workspace no longer exists. Please open a valid folder."
        
        # Initialize context manager if not exists
        if not state.context_manager:
            state.context_manager = ContextManager(state.workspace)
        
        # Collect relevant file contexts
        contexts = state.context_manager.collect_file_contexts(prompt)
        
        # Analyze which files need changes
        files_to_modify = state.context_manager.analyze_changes_needed(prompt)
        
        # For now, just return a confirmation message
        if files_to_modify:
            return f"Found {len(files_to_modify)} files that might need modifications: {', '.join(files_to_modify)}"
        else:
            return "No files found that need modifications based on your prompt."
            
    except Exception as e:
        return f"Error processing your request: {str(e)}"

@eel.expose
def choose_folder() -> Optional[dict]:
    """Choose a folder and return its structure."""
    try:
        # Your existing folder selection code here
        # When setting the workspace, ensure it's a valid path
        if state.workspace and os.path.exists(state.workspace):
            files = get_directory_structure(state.workspace)
            return {"path": state.workspace, "files": files}
    except Exception as e:
        print(f"Error choosing folder: {e}")
    return None

# ... rest of your existing code ... 