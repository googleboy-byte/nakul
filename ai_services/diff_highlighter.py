"""
Diff Highlighter Module
Provides syntax highlighting for code diffs using Pygments.
"""

import re
from typing import List, Tuple
from pygments import highlight
from pygments.lexers import get_lexer_for_filename, TextLexer, DiffLexer
from pygments.formatters import HtmlFormatter
from pygments.util import ClassNotFound

class DiffHighlighter:
    def __init__(self):
        self.formatter = HtmlFormatter(style='monokai', cssclass='source')
        self.diff_lexer = DiffLexer()
    
    def _get_lexer_for_file(self, filename: str):
        """Get the appropriate lexer for a given filename."""
        try:
            return get_lexer_for_filename(filename)
        except ClassNotFound:
            return TextLexer()
    
    def _split_diff_chunks(self, diff_text: str) -> List[Tuple[str, str]]:
        """Split diff into chunks of (type, content)."""
        chunks = []
        current_type = None
        current_lines = []
        
        for line in diff_text.splitlines(True):  # keepends=True
            if line.startswith('+++') or line.startswith('---'):
                line_type = 'meta'
            elif line.startswith('+'):
                line_type = 'add'
            elif line.startswith('-'):
                line_type = 'remove'
            elif line.startswith('@@'):
                line_type = 'header'
            else:
                line_type = 'context'
            
            if line_type != current_type:
                if current_lines:
                    chunks.append((current_type, ''.join(current_lines)))
                current_type = line_type
                current_lines = [line]
            else:
                current_lines.append(line)
        
        if current_lines:
            chunks.append((current_type, ''.join(current_lines)))
        
        return chunks
    
    def highlight_diff(self, diff_text: str, filename: str) -> str:
        """
        Highlight a diff with syntax highlighting for the code content.
        Returns HTML with appropriate CSS classes.
        """
        if not diff_text:
            return ''
        
        # Get the appropriate lexer for the file type
        code_lexer = self._get_lexer_for_file(filename)
        
        # Split the diff into chunks
        chunks = self._split_diff_chunks(diff_text)
        
        # Process each chunk
        highlighted_chunks = []
        for chunk_type, content in chunks:
            if chunk_type in ('add', 'remove'):
                # Remove the first character (+ or -) for syntax highlighting
                code = ''.join(line[1:] for line in content.splitlines(True))
                highlighted_code = highlight(code, code_lexer, self.formatter)
                
                # Wrap in appropriate div and add back the diff markers
                chunk_html = f'<div class="diff-chunk diff-{chunk_type}">'
                for line in highlighted_code.splitlines(True):
                    if line.strip():  # Skip empty lines
                        marker = '+' if chunk_type == 'add' else '-'
                        chunk_html += f'<div class="diff-line">{marker} {line}</div>'
                chunk_html += '</div>'
                highlighted_chunks.append(chunk_html)
            else:
                # Highlight meta information with diff lexer
                highlighted = highlight(content, self.diff_lexer, self.formatter)
                highlighted_chunks.append(
                    f'<div class="diff-chunk diff-{chunk_type}">{highlighted}</div>'
                )
        
        return ''.join(highlighted_chunks)
    
    def get_css(self) -> str:
        """Get the CSS required for the highlighted diff."""
        base_css = self.formatter.get_style_defs('.source')
        
        # Add custom CSS for diff display
        custom_css = """
            .diff-chunk { margin-bottom: 0.5em; }
            .diff-add { background-color: rgba(40, 100, 40, 0.5); }
            .diff-remove { background-color: rgba(100, 40, 40, 0.5); }
            .diff-header { color: #75715e; }
            .diff-meta { color: #75715e; }
            .diff-context { opacity: 0.7; }
            .diff-line { white-space: pre; }
            .diff-line:hover { background-color: rgba(255, 255, 255, 0.1); }
        """
        
        return base_css + custom_css 