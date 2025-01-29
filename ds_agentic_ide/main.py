import eel
import os
import json
import tkinter as tk
from tkinter import filedialog
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from ai_completion import ai_completion
from ai_formatter import ai_formatter
from ai_chat import ai_chat

# Initialize eel with your web files directory
web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
eel.init(web_dir)

# Global variables
current_workspace = None
observer = None

class FileSystemHandler(FileSystemEventHandler):
    def __init__(self):
        self.last_event_time = 0
        self.debounce_seconds = 0.1  # Debounce time in seconds

    def on_any_event(self, event):
        import time
        current_time = time.time()
        
        # Debounce the events
        if current_time - self.last_event_time < self.debounce_seconds:
            return
        
        self.last_event_time = current_time
        
        # Don't trigger on directory changes or .swp files
        if event.is_directory or event.src_path.endswith('.swp'):
            return
            
        try:
            # Call the JavaScript function directly
            eel.handleFileSystemChanged()  # This is a JavaScript function
        except:
            # If there's an error (like during shutdown), ignore it
            pass

@eel.expose
def select_workspace():
    """Open a folder dialog and return the selected path"""
    root = tk.Tk()
    root.withdraw()  # Hide the main window
    folder_path = filedialog.askdirectory()
    root.destroy()
    
    if folder_path:
        global current_workspace, observer
        current_workspace = os.path.abspath(folder_path)
        start_file_watcher(current_workspace)  # Start watching the new workspace
        return {"status": "success", "data": current_workspace}
    return {"status": "error", "message": "No folder selected"}

@eel.expose
def get_current_workspace():
    """Return the current workspace path"""
    return current_workspace

# File operations
@eel.expose
def get_directory_structure(path=None):
    """Returns the directory structure as a JSON object"""
    try:
        if path is None:
            if current_workspace is None:
                return {"status": "error", "message": "No workspace selected"}
            path = current_workspace
        else:
            # Make sure the path is within the current workspace
            path = os.path.abspath(os.path.join(current_workspace, path))
            if not path.startswith(current_workspace):
                return {"status": "error", "message": "Invalid path"}
            
        structure = []
        for entry in os.scandir(path):
            rel_path = os.path.relpath(entry.path, current_workspace)
            item = {
                "name": entry.name,
                "path": rel_path,
                "type": "directory" if entry.is_dir() else "file",
                "extension": os.path.splitext(entry.name)[1][1:] if not entry.is_dir() else None
            }
            if entry.is_dir():
                item["children"] = []
            structure.append(item)
            
        return {"status": "success", "data": structure}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def read_file(path):
    """Read and return the contents of a file"""
    try:
        if current_workspace is None:
            return {"status": "error", "message": "No workspace selected"}
        full_path = os.path.abspath(os.path.join(current_workspace, path))
        if not full_path.startswith(current_workspace):
            return {"status": "error", "message": "Invalid path"}
        
        with open(full_path, 'r', encoding='utf-8') as file:
            content = file.read()
        return {"status": "success", "data": content}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def save_file(path, content):
    """Save content to a file"""
    try:
        if current_workspace is None:
            return {"status": "error", "message": "No workspace selected"}
        full_path = os.path.abspath(os.path.join(current_workspace, path))
        if not full_path.startswith(current_workspace):
            return {"status": "error", "message": "Invalid path"}
        
        with open(full_path, 'w', encoding='utf-8') as file:
            file.write(content)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def create_file(path):
    """Create a new file"""
    try:
        if current_workspace is None:
            return {"status": "error", "message": "No workspace selected"}
        full_path = os.path.abspath(os.path.join(current_workspace, path))
        if not full_path.startswith(current_workspace):
            return {"status": "error", "message": "Invalid path"}
        
        Path(full_path).touch()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def create_directory(path):
    """Create a new directory"""
    try:
        if current_workspace is None:
            return {"status": "error", "message": "No workspace selected"}
        full_path = os.path.abspath(os.path.join(current_workspace, path))
        if not full_path.startswith(current_workspace):
            return {"status": "error", "message": "Invalid path"}
        
        os.makedirs(full_path, exist_ok=True)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def delete_item(path):
    """Delete a file or directory"""
    try:
        if current_workspace is None:
            return {"status": "error", "message": "No workspace selected"}
        full_path = os.path.abspath(os.path.join(current_workspace, path))
        if not full_path.startswith(current_workspace):
            return {"status": "error", "message": "Invalid path"}
        
        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)  # This will remove directory and all its contents
        else:
            os.remove(full_path)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def start_file_watcher(path):
    """Start watching a directory for changes"""
    global observer
    if observer:
        observer.stop()
        observer.join()
    
    event_handler = FileSystemHandler()
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()

@eel.expose
def get_code_completion(code_context, cursor_position, file_type):
    """Get AI-powered code completion suggestions"""
    try:
        return ai_completion.get_completion(code_context, cursor_position, file_type)
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def format_code(code, file_type):
    """Format code using AI suggestions"""
    try:
        # Since we can't use async/await with eel.expose directly,
        # we'll run the async function synchronously
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(ai_formatter.format_code(code, file_type))
        loop.close()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def send_chat_message(message, model_preference="gemini", context=None):
    """Send a message to the AI chat system"""
    try:
        # Run the async function synchronously
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(ai_chat.send_message(message, model_preference, context))
        loop.close()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def clear_chat_history():
    """Clear the chat conversation history"""
    return ai_chat.clear_history()

# Start the application
eel.start('index.html', size=(1200, 800))

# Stop the observer when the application closes
if observer:
    observer.stop()
    observer.join() 