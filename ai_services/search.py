"""
Search Service
Provides search functionality for finding relevant code files.
Uses advanced keyword matching and code-aware text analysis.
"""

import os
import re
from typing import List, Tuple, Set, Dict
from collections import Counter

class SearchService:
    def __init__(self):
        self.file_cache = {}
        self.code_extensions = {
            '.py', '.js', '.html', '.css', '.java', '.cpp', '.h',
            '.jsx', '.ts', '.tsx', '.vue', '.php', '.rb', '.go'
        }
        # Common programming terms that shouldn't be filtered out
        self.code_terms = {
            'def', 'class', 'function', 'var', 'let', 'const', 'import',
            'from', 'return', 'if', 'else', 'for', 'while', 'try',
            'catch', 'async', 'await', 'public', 'private', 'static',
            'int', 'str', 'bool', 'void', 'null', 'true', 'false'
        }
        # Words to ignore in search
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'as', 'is', 'was', 'be', 'this',
            'that', 'are', 'were', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could'
        }
    
    def _should_index_file(self, filename: str) -> bool:
        """Check if a file should be indexed based on its extension."""
        return os.path.splitext(filename)[1].lower() in self.code_extensions
    
    def _get_file_content(self, file_path: str) -> str:
        """Read file content with multiple encoding attempts."""
        encodings = ['utf-8', 'latin1', 'cp1252']
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    return f.read()
            except (UnicodeDecodeError, IOError):
                continue
        return ''
    
    def _extract_code_identifiers(self, text: str) -> Set[str]:
        """Extract code identifiers like variable names, function names, etc."""
        # Match common code patterns (camelCase, snake_case, PascalCase)
        patterns = [
            r'\b[a-z]+(?:[A-Z][a-z]*)*\b',  # camelCase
            r'\b[a-z]+(?:_[a-z]+)*\b',      # snake_case
            r'\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b',  # PascalCase
            r'\b[A-Z]+(?:_[A-Z]+)*\b'       # UPPER_CASE
        ]
        
        identifiers = set()
        for pattern in patterns:
            identifiers.update(re.findall(pattern, text))
        return identifiers
    
    def _extract_keywords(self, text: str) -> Dict[str, float]:
        """
        Extract relevant keywords from text with importance weights.
        Returns a dictionary of {keyword: weight}.
        """
        # Convert to lowercase and split into words
        words = re.findall(r'\b\w+\b', text.lower())
        
        # Count word frequencies
        word_freq = Counter(words)
        
        # Calculate weights for each word
        keywords = {}
        max_freq = max(word_freq.values()) if word_freq else 1
        
        for word, freq in word_freq.items():
            # Skip stop words unless they're code terms
            if word in self.stop_words and word not in self.code_terms:
                continue
            
            # Skip very short words unless they're code terms
            if len(word) <= 2 and word not in self.code_terms:
                continue
            
            # Calculate base weight from frequency
            weight = freq / max_freq
            
            # Boost weights for:
            # - Code terms
            if word in self.code_terms:
                weight *= 1.5
            # - Longer words (likely more meaningful)
            if len(word) > 5:
                weight *= 1.2
            # - Words with mixed case (likely identifiers)
            if any(c.isupper() for c in word):
                weight *= 1.3
            
            keywords[word] = weight
        
        # Add code identifiers with high weight
        identifiers = self._extract_code_identifiers(text)
        for identifier in identifiers:
            keywords[identifier.lower()] = 1.5
        
        return keywords
    
    def index_workspace(self, workspace_path: str):
        """Index all relevant files in the workspace."""
        self.file_cache.clear()
        
        for root, _, files in os.walk(workspace_path):
            for file in files:
                if self._should_index_file(file):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, workspace_path)
                    content = self._get_file_content(full_path)
                    
                    if content:
                        self.file_cache[rel_path] = {
                            'content': content,
                            'keywords': self._extract_keywords(content)
                        }
    
    def _calculate_relevance_score(self, query_keywords: Dict[str, float], 
                                 file_keywords: Dict[str, float]) -> float:
        """
        Calculate a weighted relevance score between query and file keywords.
        Uses both keyword presence and importance weights.
        """
        if not query_keywords or not file_keywords:
            return 0.0
        
        score = 0.0
        total_weight = 0.0
        
        # Calculate weighted score for matching keywords
        for word, query_weight in query_keywords.items():
            if word in file_keywords:
                # Combine weights from query and file
                combined_weight = (query_weight + file_keywords[word]) / 2
                score += combined_weight
            total_weight += query_weight
        
        # Normalize score
        if total_weight > 0:
            score = score / total_weight
        
        return score
    
    def search(self, query: str, limit: int = 10) -> List[Tuple[str, float]]:
        """
        Search for relevant files based on weighted keyword matching.
        Returns a list of (file_path, relevance_score) tuples.
        """
        query_keywords = self._extract_keywords(query)
        if not query_keywords:
            return []
        
        results = []
        for path, data in self.file_cache.items():
            score = self._calculate_relevance_score(query_keywords, data['keywords'])
            if score > 0:
                results.append((path, score))
        
        # Sort by score and return top matches
        return sorted(results, key=lambda x: x[1], reverse=True)[:limit]
    
    def get_relevant_sections(self, file_path: str, query: str, context_lines: int = 3) -> List[Tuple[str, float]]:
        """
        Find relevant sections within a file based on weighted keyword matching.
        Returns a list of (section_text, relevance_score) tuples.
        """
        if file_path not in self.file_cache:
            return []
        
        content = self.file_cache[file_path]['content']
        query_keywords = self._extract_keywords(query)
        
        if not query_keywords:
            return []
        
        # Split content into lines and analyze each section
        lines = content.splitlines()
        sections = []
        
        # Use a sliding window to analyze sections
        window_size = 5  # Analyze 5 lines at a time
        for i in range(len(lines)):
            # Get the window of lines
            window_start = max(0, i - window_size // 2)
            window_end = min(len(lines), i + window_size // 2 + 1)
            window_text = '\n'.join(lines[window_start:window_end])
            
            # Extract keywords from the window
            window_keywords = self._extract_keywords(window_text)
            
            # Calculate relevance score
            score = self._calculate_relevance_score(query_keywords, window_keywords)
            
            if score > 0.3:  # Only keep sections with good relevance
                # Get context lines
                context_start = max(0, window_start - context_lines)
                context_end = min(len(lines), window_end + context_lines)
                section = '\n'.join(lines[context_start:context_end])
                
                sections.append((section, score))
        
        # Merge overlapping sections with similar scores
        merged_sections = []
        sections.sort(key=lambda x: x[1], reverse=True)
        
        for section, score in sections:
            # Check if this section overlaps with any existing merged section
            overlap = False
            for i, (merged_section, merged_score) in enumerate(merged_sections):
                if section in merged_section or merged_section in section:
                    # Take the longer section with the higher score
                    if len(section) > len(merged_section) and score >= merged_score:
                        merged_sections[i] = (section, score)
                    overlap = True
                    break
            
            if not overlap:
                merged_sections.append((section, score))
        
        return merged_sections 