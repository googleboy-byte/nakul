import eel
import os
import json
from pathlib import Path
from tkinter import Tk, filedialog
import sys
import fnmatch
from ai_services.context_manager import ContextManager
from ai_services.ai_model import AIModelService, AIServiceError, ConfigurationError

# Initialize eel with your web files directory
eel.init('web')

# Store the current workspace
current_workspace = {
    'path': None,
    'open_files': []
}

# Initialize context manager
context_manager = None

# Initialize AI service
ai_service = None

def is_valid_path(path):
    """Check if a path is valid and within the workspace"""
    try:
        # Convert to absolute path
        full_path = os.path.abspath(os.path.join(current_workspace['path'], path))
        # Check if the path is within the workspace
        return os.path.commonpath([full_path, current_workspace['path']]) == current_workspace['path']
    except (ValueError, TypeError):
        # Handle invalid path characters more gracefully
        return True

@eel.expose
def choose_folder():
    """Open a folder dialog and return the selected path"""
    root = Tk()
    root.withdraw()  # Hide the main window
    root.attributes('-topmost', True)  # Bring dialog to front
    folder_path = filedialog.askdirectory()
    root.destroy()
    
    if folder_path:
        current_workspace['path'] = folder_path
        return {
            'path': folder_path,
            'files': get_directory_structure(folder_path)
        }
    return None

@eel.expose
def get_directory_structure(path):
    """Get the directory structure as a nested dictionary"""
    structure = []
    try:
        for entry in os.scandir(path):
            if entry.name.startswith('.'):
                continue
            
            item = {
                'name': entry.name,
                'path': str(Path(entry.path).relative_to(current_workspace['path'])).replace('\\', '/'),
                'type': 'folder' if entry.is_dir() else 'file'
            }
            
            if entry.is_dir():
                item['children'] = get_directory_structure(entry.path)
            
            structure.append(item)
        
        # Sort folders first, then files, both alphabetically
        return sorted(structure, key=lambda x: (x['type'] != 'folder', x['name'].lower()))
    except Exception as e:
        print(f"Error reading directory: {e}")
        return []

@eel.expose
def read_file(file_path):
    """Read the contents of a file"""
    try:
        full_path = os.path.join(current_workspace['path'], file_path)
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {'success': True, 'content': content}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def save_file(file_path, content):
    """Save content to a file"""
    try:
        full_path = os.path.join(current_workspace['path'], file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def create_folder(folder_path):
    """Create a new folder"""
    try:
        if not current_workspace['path']:
            return {'success': False, 'error': 'No workspace open'}
        
        # Clean the folder path
        folder_path = folder_path.strip().replace('\\', '/')
        
        full_path = os.path.join(current_workspace['path'], folder_path)
        
        if os.path.exists(full_path):
            return {'success': False, 'error': 'Folder already exists'}
        
        # Create all necessary parent directories
        os.makedirs(full_path, exist_ok=True)
        return {
            'success': True,
            'path': folder_path
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def create_file(file_path):
    """Create a new file"""
    try:
        if not current_workspace['path']:
            return {'success': False, 'error': 'No workspace open'}
        
        # Clean the file path
        file_path = file_path.strip().replace('\\', '/')
        
        full_path = os.path.join(current_workspace['path'], file_path)
        
        if os.path.exists(full_path):
            return {'success': False, 'error': 'File already exists'}
        
        # Create parent directories if they don't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Create empty file
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write('')
        
        return {
            'success': True,
            'path': file_path
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def delete_file(file_path):
    """Delete a file"""
    try:
        full_path = os.path.join(current_workspace['path'], file_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            return {'success': True}
        return {'success': False, 'error': 'File does not exist'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def search_files(query):
    """Search for files in the workspace"""
    if not current_workspace['path'] or not query:
        return []
    
    results = []
    query = query.lower()
    
    try:
        for root, _, files in os.walk(current_workspace['path']):
            for file in files:
                if query in file.lower():
                    full_path = os.path.join(root, file)
                    rel_path = str(Path(full_path).relative_to(current_workspace['path'])).replace('\\', '/')
                    results.append({
                        'name': file,
                        'path': rel_path
                    })
        
        return sorted(results, key=lambda x: x['name'].lower())
    except Exception as e:
        print(f"Error searching files: {e}")
        return []

@eel.expose
def rename_item(old_path, new_name):
    """Rename a file or folder"""
    try:
        if not current_workspace['path']:
            return {'success': False, 'error': 'No workspace open'}
            
        old_full_path = os.path.join(current_workspace['path'], old_path)
        new_path = os.path.join(os.path.dirname(old_path), new_name)
        new_full_path = os.path.join(current_workspace['path'], new_path)
        
        if not os.path.exists(old_full_path):
            return {'success': False, 'error': 'Item does not exist'}
            
        if os.path.exists(new_full_path):
            return {'success': False, 'error': 'An item with that name already exists'}
            
        os.rename(old_full_path, new_full_path)
        return {
            'success': True,
            'old_path': old_path,
            'new_path': new_path
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
def delete_item(path):
    """Delete a file or folder"""
    try:
        if not current_workspace['path']:
            return {'success': False, 'error': 'No workspace open'}
            
        full_path = os.path.join(current_workspace['path'], path)
        if not os.path.exists(full_path):
            return {'success': False, 'error': 'Item does not exist'}
            
        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
            
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

@eel.expose
async def process_build_prompt(prompt):
    global ai_service, context_manager
    
    try:
        if not current_workspace['path']:
            return {'message': 'Please open a folder first.'}
        
        # Initialize services if needed
        if not ai_service:
            try:
                ai_service = AIModelService()
            except ConfigurationError as e:
                return {'message': f'AI service configuration error: {str(e)}. Please check your .env file.'}
            except AIServiceError as e:
                return {'message': f'Failed to initialize AI service: {str(e)}'}
        
        if not context_manager:
            try:
                context_manager = ContextManager(current_workspace['path'])
            except Exception as e:
                return {'message': f'Failed to initialize context manager: {str(e)}'}
        
        # Collect relevant file contexts
        try:
            contexts = context_manager.collect_file_contexts(prompt)
            if not contexts:
                return {'message': 'No relevant files found for the given prompt.'}
        except Exception as e:
            return {'message': f'Error collecting file contexts: {str(e)}'}
        
        # Analyze which files need changes
        try:
            files_to_modify = context_manager.analyze_changes_needed(prompt)
            if not files_to_modify:
                return {'message': 'No changes needed based on the prompt.'}
        except Exception as e:
            return {'message': f'Error analyzing changes needed: {str(e)}'}
        
        # Generate changes using AI model
        try:
            file_contexts = [
                {'path': ctx.path, 'content': ctx.content}
                for ctx in contexts
                if ctx.path in files_to_modify
            ]
            changes = await ai_service.generate_changes(prompt, file_contexts)
        except AIServiceError as e:
            return {'message': f'AI service error: {str(e)}'}
        except Exception as e:
            return {'message': f'Error generating changes: {str(e)}'}
        
        # Apply changes and generate diffs
        try:
            diffs = context_manager.apply_changes(changes)
            return {
                'changes': [
                    {
                        'file_path': path,
                        'diff': diff
                    }
                    for path, diff in diffs.items()
                ]
            }
        except Exception as e:
            return {'message': f'Error applying changes: {str(e)}'}
        
    except Exception as e:
        print(f"Unexpected error in process_build_prompt: {str(e)}")
        return {'message': 'An unexpected error occurred. Please try again.'}

# Start the application
if __name__ == '__main__':
    try:
        eel.start('index.html', size=(1200, 800))
    except (SystemExit, MemoryError, KeyboardInterrupt):
        # Handle application exit
        pass 