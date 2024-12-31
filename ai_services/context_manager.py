"""
Context Manager for AI Services
Handles file context collection and analysis for AI operations.
"""

import os
import difflib
from typing import List, Dict, Tuple, Optional
from .search import SearchService
from .diff_highlighter import DiffHighlighter

class FileContext:
    def __init__(self, path: str, content: str, relevance_score: float = 0.0):
        self.path = path
        self.content = content
        self.relevance_score = relevance_score

class ContextManager:
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.file_contexts: Dict[str, FileContext] = {}
        self.search_service = SearchService()
        self.diff_highlighter = DiffHighlighter()
        self.search_service.index_workspace(workspace_path)
    
    def collect_file_contexts(self, query: str) -> List[FileContext]:
        """
        Collect and analyze files that are relevant to the given query.
        Returns a list of FileContext objects sorted by relevance.
        """
        # Search for relevant files
        relevant_files = self.search_service.search(query)
        
        # Create FileContext objects for each relevant file
        contexts = []
        for file_path, score in relevant_files:
            abs_path = os.path.join(self.workspace_path, file_path)
            content = self._read_file(abs_path)
            if content:
                context = FileContext(file_path, content, score)
                self.file_contexts[file_path] = context
                contexts.append(context)
        
        return sorted(contexts, key=lambda x: x.relevance_score, reverse=True)
    
    def analyze_changes_needed(self, query: str) -> List[str]:
        """
        Analyze which files need to be modified based on the query.
        Returns a list of file paths that should be modified.
        """
        files_to_modify = []
        
        # Check each file in the context for relevant sections
        for file_path, context in self.file_contexts.items():
            sections = self.search_service.get_relevant_sections(
                os.path.join(self.workspace_path, file_path),
                query
            )
            
            # If any section has high relevance, the file might need modification
            if sections and any(score > 0.5 for _, score in sections):
                files_to_modify.append(file_path)
        
        return files_to_modify
    
    def generate_diff(self, original: str, modified: str, filename: str = "") -> str:
        """
        Generate a syntax-highlighted diff between original and modified content.
        """
        # First generate the unified diff
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            modified.splitlines(keepends=True),
            fromfile='Original',
            tofile='Modified',
            n=3  # Number of context lines
        )
        diff_text = ''.join(diff)
        
        # Then apply syntax highlighting
        return self.diff_highlighter.highlight_diff(diff_text, filename)
    
    def apply_changes(self, changes: Dict[str, str]) -> Dict[str, str]:
        """
        Apply the proposed changes and generate diffs.
        Returns a dictionary of file paths to their highlighted diffs.
        """
        diffs = {}
        for path, new_content in changes.items():
            if path in self.file_contexts:
                original = self.file_contexts[path].content
                diffs[path] = self.generate_diff(original, new_content, path)
        return diffs
    
    def get_diff_css(self) -> str:
        """Get the CSS required for diff highlighting."""
        return self.diff_highlighter.get_css()
    
    def _read_file(self, file_path: str) -> Optional[str]:
        """Read file content with multiple encoding attempts."""
        encodings = ['utf-8', 'latin1', 'cp1252']
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    return f.read()
            except (UnicodeDecodeError, IOError):
                continue
        return None 