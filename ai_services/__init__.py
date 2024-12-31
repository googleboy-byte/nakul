"""
AI Services Package
Contains modules for AI-powered code analysis and modification.
"""

from .search import SearchService
from .context_manager import ContextManager
from .diff_highlighter import DiffHighlighter

__all__ = ['SearchService', 'ContextManager', 'DiffHighlighter'] 