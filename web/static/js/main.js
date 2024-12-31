let editor = null;
let openFiles = new Map();
let currentFile = null;

document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners
    document.getElementById('setWorkspaceBtn').addEventListener('click', setWorkspace);
    document.getElementById('new-file-btn').addEventListener('click', () => createNew('file'));
    document.getElementById('new-folder-btn').addEventListener('click', () => createNew('folder'));

    // Load initial file tree
    loadFileTree();
});

function initializeEditor() {
    if (!editor) {
        editor = CodeMirror(document.getElementById('editor-container'), {
            mode: 'javascript',
            theme: 'dracula',
            lineNumbers: true,
            indentUnit: 4,
            autoCloseBrackets: true,
            matchBrackets: true,
            lineWrapping: true,
            tabSize: 4,
            indentWithTabs: true,
            extraKeys: {
                "Ctrl-S": function(cm) {
                    saveCurrentFile();
                }
            }
        });
    }
}

async function setWorkspace() {
    // Using the native file dialog
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;

    input.onchange = async function(e) {
        if (e.target.files.length > 0) {
            const path = e.target.files[0].path.replace(/\/[^\/]*$/, '');
            const result = await eel.set_workspace(path)();
            if (result.success) {
                loadFileTree();
            } else {
                alert('Error setting workspace: ' + result.error);
            }
        }
    };

    input.click();
}

async function loadFileTree() {
    const data = await eel.get_files()();
    const fileTree = document.getElementById('file-tree');
    fileTree.innerHTML = renderFileTree(data.files);
    addFileTreeListeners();
}

function renderFileTree(items, level = 0) {
    if (!items) return '';
    
    return items.map(item => {
        const indent = '  '.repeat(level);
        const icon = item.type === 'directory' ? 'fa-folder' : 'fa-file-code';
        
        return `
            <div class="file-tree-item" data-path="${item.path}" data-type="${item.type}" style="padding-left: ${level * 20}px">
                <i class="fas ${icon}"></i>
                <span>${item.name}</span>
            </div>
            ${item.type === 'directory' ? renderFileTree(item.children, level + 1) : ''}
        `;
    }).join('');
}

function addFileTreeListeners() {
    document.querySelectorAll('.file-tree-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            const type = item.dataset.type;
            
            if (type === 'file') {
                openFile(path);
            }
        });
    });
}

async function createNew(type) {
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;
    
    const result = await eel.create_item(name, type)();
    if (result.success) {
        loadFileTree();
        if (type === 'file') {
            openFile(name);
        }
    }
}

async function openFile(path) {
    if (openFiles.has(path)) {
        switchToFile(path);
        return;
    }

    const result = await eel.read_file(path)();
    if (result.content !== undefined) {
        openFiles.set(path, result.content);
        addEditorTab(path);
        switchToFile(path);
    }
}

// ... rest of the functions remain the same, but update saveCurrentFile:

async function saveCurrentFile() {
    if (!currentFile || !editor) return;
    
    const content = editor.getValue();
    const result = await eel.write_file(currentFile, content)();
    
    if (result.success) {
        openFiles.set(currentFile, content);
    }
} 