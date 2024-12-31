"""
AI Pipeline for Code Modifications
Orchestrates context-aware code modifications using AI models.
"""

import os
from typing import List, Dict, Optional
from .context_manager import ContextManager, FileContext
from .ai_model import AIModelService, AIModelConfig

class CodeChange:
    def __init__(self, file_path: str, original: str, modified: str, diff: str):
        self.file_path = file_path
        self.original = original
        self.modified = modified
        self.diff = diff
        self.accepted = False

class AIPipeline:
    def __init__(self, workspace_path: str, config_path: Optional[str] = None):
        self.workspace_path = workspace_path
        self.context_manager = ContextManager(workspace_path)
        self.current_changes: List[CodeChange] = []
        self.ai_config = AIModelService.load_config(config_path)
    
    async def process_query(self, query: str) -> List[CodeChange]:
        """
        Process a user query and generate proposed code changes.
        """
        # 1. Collect relevant file contexts
        relevant_files = self.context_manager.collect_file_contexts(query)
        
        # 2. Analyze which files need changes
        files_to_modify = self.context_manager.analyze_changes_needed(query)
        
        # 3. Generate AI-powered changes
        changes = await self._generate_changes(query, files_to_modify, relevant_files)
        
        # 4. Create CodeChange objects with diffs
        self.current_changes = []
        for path, new_content in changes.items():
            original = self.context_manager.file_contexts[path].content
            diff = self.context_manager.generate_diff(original, new_content)
            change = CodeChange(path, original, new_content, diff)
            self.current_changes.append(change)
        
        return self.current_changes
    
    async def _generate_changes(
        self, 
        query: str, 
        files_to_modify: List[str],
        context_files: List[FileContext]
    ) -> Dict[str, str]:
        """
        Generate changes using AI model (GPT-4 or Gemini).
        Returns a dictionary of file paths to their modified content.
        """
        # Convert FileContext objects to dictionary format expected by AIModelService
        context_data = [
            {"path": fc.path, "content": fc.content}
            for fc in context_files
        ]
        
        # Use AIModelService to generate changes
        async with AIModelService(self.ai_config) as ai_service:
            return await ai_service.generate_changes(query, context_data, files_to_modify)
    
    def accept_all_changes(self) -> None:
        """Accept all current changes."""
        for change in self.current_changes:
            change.accepted = True
    
    def reject_all_changes(self) -> None:
        """Reject all current changes."""
        for change in self.current_changes:
            change.accepted = False
    
    def accept_change(self, file_path: str) -> None:
        """Accept changes for a specific file."""
        for change in self.current_changes:
            if change.file_path == file_path:
                change.accepted = True
                break
    
    def reject_change(self, file_path: str) -> None:
        """Reject changes for a specific file."""
        for change in self.current_changes:
            if change.file_path == file_path:
                change.accepted = False
                break
    
    async def apply_accepted_changes(self) -> Dict[str, bool]:
        """
        Apply all accepted changes to the files.
        Returns a dictionary of file paths to success status.
        """
        results = {}
        for change in self.current_changes:
            if change.accepted:
                try:
                    with open(os.path.join(self.workspace_path, change.file_path), 'w') as f:
                        f.write(change.modified)
                    results[change.file_path] = True
                except Exception as e:
                    print(f"Error applying changes to {change.file_path}: {e}")
                    results[change.file_path] = False
        return results 