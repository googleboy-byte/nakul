// Global state
const state = {
    currentFile: null,
    openFiles: new Map(), // path -> {content, editor}
    workspace: null,
    aiPanelOpen: true,
    currentPanel: 'explorer',
    expandedFolders: new Set(), // Store expanded folder paths
    tabOrder: [] // Store tab order
};

// Initialize CodeMirror
let editor = CodeMirror(document.getElementById("editor"), {
    mode: "python",
    theme: "dracula",
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Ctrl-S": function(cm) {
            saveCurrentFile();
        },
        "Tab": function(cm) {
            if (cm.somethingSelected()) {
                cm.indentSelection("add");
            } else {
                cm.replaceSelection(cm.getOption("indentWithTabs") ? "\t" :
                    Array(cm.getOption("indentUnit") + 1).join(" "), "end", "+input");
            }
        }
    },
    hintOptions: {
        completeSingle: false,
        alignWithWord: true,
        closeOnUnfocus: true
    }
});

// Enable auto close brackets and auto complete
editor.on("inputRead", function(cm, change) {
    if (change.origin !== "+input" || change.text[0] === " ") return;
    const pos = cm.getCursor();
    const line = cm.getLine(pos.line);
    const token = cm.getTokenAt(pos);

    // Don't show hints inside strings or comments
    if (token.type === "string" || token.type === "comment") return;

    // Show hints after typing 2 characters or after typing a dot
    if (change.text[0] === "." || 
        (token.string.length >= 2 && /[\w_]/.test(change.text[0]))) {
        CodeMirror.commands.autocomplete(cm, null, { completeSingle: false });
    }
});

// Hide editor initially and show welcome screen
document.getElementById('editor').style.display = 'none';

// File Tree Management
async function openFolder() {
    const result = await eel.choose_folder()();
    if (result) {
        // Clear previous state when opening a new workspace
        state.expandedFolders.clear();
        state.workspace = result.path;
        renderFileTree(result.files, result.path);
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('editor').style.display = 'block';
        updateExplorerHeader();
        saveState();
    }
}

function renderFileTree(files, rootPath, parentElement = document.getElementById('file-tree'), level = 0) {
    parentElement.innerHTML = '';
    
    if (level === 0 && rootPath) {
        // Create root folder item
        const rootItem = document.createElement('div');
        rootItem.className = 'file-tree-item expanded';
        
        const rootContent = document.createElement('div');
        rootContent.className = 'file-tree-content';
        
        const rootIcon = document.createElement('i');
        rootIcon.className = 'fas fa-folder-open';
        
        const rootName = document.createElement('span');
        rootName.className = 'file-tree-label';
        rootName.textContent = rootPath.split(/[\\/]/).pop();
        
        rootContent.appendChild(rootIcon);
        rootContent.appendChild(rootName);
        rootItem.appendChild(rootContent);
        
        rootContent.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, 'folder', '');
        });
        
        const rootContents = document.createElement('div');
        rootContents.className = 'folder-contents';
        rootContents.style.display = 'block';
        rootItem.appendChild(rootContents);
        
        parentElement.appendChild(rootItem);
        
        renderFileTree(files, null, rootContents, level + 1);
        return;
    }
    
    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-tree-item';
        
        const content = document.createElement('div');
        content.className = 'file-tree-content';
        
        const icon = document.createElement('i');
        if (file.type === 'folder') {
            icon.className = 'fas fa-folder';
        } else {
            // Get file extension and corresponding icon
            const fileExt = file.name.split('.').pop().toLowerCase();
            const iconClass = fileTypeIcons[fileExt] || fileTypeIcons.default;
            icon.className = iconClass;
        }
        
        const name = document.createElement('span');
        name.className = 'file-tree-label';
        name.textContent = file.name;
        
        content.appendChild(icon);
        content.appendChild(name);
        item.appendChild(content);
        
        content.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, file.type, file.path);
        });
        
        if (file.type === 'folder') {
            const contents = document.createElement('div');
            contents.className = 'folder-contents';
            
            // Check if folder was expanded
            const isExpanded = state.expandedFolders.has(file.path);
            contents.style.display = isExpanded ? 'block' : 'none';
            if (isExpanded) {
                icon.className = 'fas fa-folder-open';
                item.classList.add('expanded');
            }
            
            content.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = contents.style.display !== 'none';
                icon.className = isOpen ? 'fas fa-folder' : 'fas fa-folder-open';
                contents.style.display = isOpen ? 'none' : 'block';
                item.classList.toggle('expanded', !isOpen);
                
                // Track expanded state
                if (!isOpen) {
                    state.expandedFolders.add(file.path);
                } else {
                    state.expandedFolders.delete(file.path);
                }
                saveState(); // Save state when folder is expanded/collapsed
            });
            
            if (file.children) {
                renderFileTree(file.children, null, contents, level + 1);
            }
            item.appendChild(contents);
        } else {
            content.addEventListener('click', (e) => {
                e.stopPropagation();
                openFile(file.path);
            });
        }
        
        parentElement.appendChild(item);
    });
}

// Add file type icon mapping
const fileTypeIcons = {
    // Programming Languages
    'js': 'fab fa-js',
    'py': 'fab fa-python',
    'html': 'fab fa-html5',
    'css': 'fab fa-css3-alt',
    'java': 'fab fa-java',
    'php': 'fab fa-php',
    'rb': 'fas fa-gem',
    'rs': 'fas fa-cog',
    'go': 'fas fa-code',
    'ts': 'fas fa-code',
    'jsx': 'fab fa-react',
    'tsx': 'fab fa-react',
    'vue': 'fab fa-vuejs',
    'swift': 'fab fa-swift',
    'kt': 'fas fa-k',
    
    // Data Files
    'json': 'fas fa-brackets-curly',
    'xml': 'fas fa-code',
    'yaml': 'fas fa-file-code',
    'yml': 'fas fa-file-code',
    'csv': 'fas fa-table',
    'sql': 'fas fa-database',
    
    // Documents
    'md': 'fab fa-markdown',
    'txt': 'fas fa-file-alt',
    'pdf': 'fas fa-file-pdf',
    'doc': 'fas fa-file-word',
    'docx': 'fas fa-file-word',
    
    // Config Files
    'env': 'fas fa-cog',
    'ini': 'fas fa-cog',
    'config': 'fas fa-cog',
    'toml': 'fas fa-cog',
    
    // Default
    'default': 'fas fa-file-code'
};

// Update createTab function
function createTab(path, activate = true) {
    const tabsContainer = document.getElementById('tabs-container');
    
    // Check if tab already exists
    const existingTab = tabsContainer.querySelector(`[data-path="${path}"]`);
    if (existingTab) {
        if (activate) activateTab(existingTab);
        return;
    }
    
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.path = path;
    tab.draggable = true;
    
    // Get file extension and corresponding icon
    const fileName = path.split('/').pop();
    const fileExt = fileName.split('.').pop().toLowerCase();
    const iconClass = fileTypeIcons[fileExt] || fileTypeIcons.default;
    
    // Create icon element
    const icon = document.createElement('i');
    icon.className = iconClass;
    
    const name = document.createElement('span');
    name.textContent = fileName;
    
    const closeBtn = document.createElement('i');
    closeBtn.className = 'fas fa-times';
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab);
    });
    
    tab.appendChild(icon);
    tab.appendChild(name);
    tab.appendChild(closeBtn);
    
    tab.addEventListener('click', () => activateTab(tab));
    
    // Add drag and drop handlers
    tab.addEventListener('dragstart', handleDragStart);
    tab.addEventListener('dragover', handleDragOver);
    tab.addEventListener('drop', handleDrop);
    tab.addEventListener('dragend', handleDragEnd);
    
    tabsContainer.appendChild(tab);
    if (activate) activateTab(tab);
    
    // Update tab order
    state.tabOrder = Array.from(tabsContainer.children).map(tab => tab.dataset.path);
    saveState();
}

function activateTab(tab) {
    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // Activate the clicked tab
    tab.classList.add('active');
    
    // Show the corresponding file
    const path = tab.dataset.path;
    showFile(path);
}

function closeTab(tab) {
    const path = tab.dataset.path;
    state.openFiles.delete(path);
    state.tabOrder = state.tabOrder.filter(p => p !== path);
    
    // If this was the active tab, activate another one
    if (tab.classList.contains('active')) {
        const nextTab = tab.nextElementSibling || tab.previousElementSibling;
        if (nextTab) {
            activateTab(nextTab);
        } else {
            // No more tabs, show welcome screen
            state.currentFile = null;
            document.getElementById('editor').style.display = 'none';
            document.getElementById('welcome-screen').style.display = 'flex';
        }
    }
    
    tab.remove();
    saveState();
}

// File Operations
async function openFile(path) {
    if (state.openFiles.has(path)) {
        createTab(path);
        return;
    }
    
    const result = await eel.read_file(path)();
    if (result.success) {
        // Make sure editor is visible when opening files
        document.getElementById('editor').style.display = 'block';
        document.getElementById('welcome-screen').style.display = 'none';
        
        state.openFiles.set(path, {
            content: result.content,
            editor: editor
        });
        createTab(path);
    }
}

function showFile(path) {
    const file = state.openFiles.get(path);
    if (file) {
        state.currentFile = path;
        editor.setValue(file.content);
        editor.refresh();
    }
}

async function saveCurrentFile() {
    if (!state.currentFile) return;
    
    const content = editor.getValue();
    const result = await eel.save_file(state.currentFile, content)();
    
    if (result.success) {
        state.openFiles.get(state.currentFile).content = content;
        updateStatusBar('File saved');
    } else {
        updateStatusBar('Error saving file');
    }
}

// Input UI
function createInputBox(placeholder, initialValue = '', parentElement = document.body) {
    const overlay = document.createElement('div');
    overlay.className = 'input-overlay';
    
    const container = document.createElement('div');
    container.className = 'input-container';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vs-input';
    input.placeholder = placeholder;
    input.value = initialValue;
    
    container.appendChild(input);
    overlay.appendChild(container);
    parentElement.appendChild(overlay);
    
    input.focus();
    if (initialValue) {
        // Select filename without extension for rename
        const lastDotIndex = initialValue.lastIndexOf('.');
        if (lastDotIndex > 0) {
            input.setSelectionRange(0, lastDotIndex);
        } else {
            input.select();
        }
    }
    
    return new Promise((resolve) => {
        function handleSubmit() {
            const value = input.value.trim();
            overlay.remove();
            resolve(value);
        }
        
        function handleCancel() {
            overlay.remove();
            resolve(null);
        }
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        });
    });
}

// File and Folder Creation
async function createNewFile(parentPath = '') {
    if (!state.workspace) {
        alert('Please open a folder first');
        return;
    }

    const fileName = await createInputBox('Enter file name');
    if (!fileName) return;
    
    const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const result = await eel.create_file(filePath)();
    
    if (result.success) {
        openFile(result.path);
        // Refresh file tree with root path
        const workspace = await eel.get_directory_structure(state.workspace)();
        renderFileTree(workspace, state.workspace);
    } else {
        alert(result.error || 'Failed to create file');
    }
}

async function createNewFolder(parentPath = '') {
    if (!state.workspace) {
        alert('Please open a folder first');
        return;
    }

    const folderName = await createInputBox('Enter folder name');
    if (!folderName) return;
    
    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
    const result = await eel.create_folder(folderPath)();
    
    if (result.success) {
        // Refresh file tree with root path
        const workspace = await eel.get_directory_structure(state.workspace)();
        renderFileTree(workspace, state.workspace);
    } else {
        alert(result.error || 'Failed to create folder');
    }
}

async function renameItem(path, isFolder) {
    const oldName = path.split('/').pop();
    const newName = await createInputBox('Enter new name', oldName);
    if (!newName || newName === oldName) return;
    
    const result = await eel.rename_item(path, newName)();
    
    if (result.success) {
        if (!isFolder) {
            const openFile = state.openFiles.get(path);
            if (openFile) {
                state.openFiles.delete(path);
                state.openFiles.set(result.new_path, openFile);
                
                const tab = document.querySelector(`[data-path="${path}"]`);
                if (tab) {
                    tab.dataset.path = result.new_path;
                    tab.querySelector('span').textContent = newName;
                }
            }
        }
        
        // Refresh file tree with root path
        const workspace = await eel.get_directory_structure(state.workspace)();
        renderFileTree(workspace, state.workspace);
    } else {
        alert(result.error || 'Failed to rename item');
    }
}

async function deleteItem(path, isFolder) {
    const itemType = isFolder ? 'folder' : 'file';
    const confirmed = confirm(`Are you sure you want to delete this ${itemType}?`);
    if (!confirmed) return;
    
    const result = await eel.delete_item(path)();
    
    if (result.success) {
        if (!isFolder) {
            const tab = document.querySelector(`[data-path="${path}"]`);
            if (tab) {
                closeTab(tab);
            }
        }
        
        // Refresh file tree with root path
        const workspace = await eel.get_directory_structure(state.workspace)();
        renderFileTree(workspace, state.workspace);
    } else {
        alert(result.error || 'Failed to delete item');
    }
}

// Status Bar
function updateStatusBar(message) {
    document.querySelector('.status-left').innerHTML = 
        `<span><i class="fas fa-check-circle"></i> ${message}</span>`;
}

// AI Panel
function toggleAIPanel() {
    const panel = document.querySelector('.ai-panel');
    const button = document.getElementById('toggle-ai-panel');
    
    state.aiPanelOpen = !state.aiPanelOpen;
    panel.style.width = state.aiPanelOpen ? '300px' : '0px';
    button.querySelector('i').className = state.aiPanelOpen ? 
        'fas fa-chevron-right' : 'fas fa-chevron-left';
}

// Panel Management
function switchPanel(panelName) {
    // Hide all panels
    document.querySelector('.explorer').classList.remove('active');
    document.querySelector('.search-container').classList.remove('active');
    
    // Show selected panel
    if (panelName === 'explorer') {
        document.querySelector('.explorer').classList.add('active');
    } else if (panelName === 'search') {
        document.querySelector('.search-container').classList.add('active');
    }
    
    // Update icons
    document.querySelectorAll('.sidebar-icons .icon').forEach(icon => {
        icon.classList.remove('active');
        if (icon.dataset.panel === panelName) {
            icon.classList.add('active');
        }
    });
    
    state.currentPanel = panelName;
}

// Search functionality
let searchTimeout = null;
async function handleSearch(query) {
    if (!state.workspace) return;
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(async () => {
        const results = await eel.search_files(query)();
        displaySearchResults(results);
    }, 300);
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
        return;
    }
    
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-file-code';
        
        const content = document.createElement('div');
        content.innerHTML = `
            ${result.name}
            <div class="search-result-path">${result.path}</div>
        `;
        
        item.appendChild(icon);
        item.appendChild(content);
        item.addEventListener('click', () => openFile(result.path));
        
        container.appendChild(item);
    });
}

// Context Menu for File Tree
function showContextMenu(e, type, path = '') {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove any existing context menus
    removeContextMenu();
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    
    // Create menu items first
    let menuItems;
    if (type === 'folder') {
        menuItems = [
            { label: 'New File', icon: 'fa-plus', action: () => createNewFile(path) },
            { label: 'New Folder', icon: 'fa-folder-plus', action: () => createNewFolder(path) }
        ];
        
        // Add rename and delete options for non-root folders
        if (path) {
            menuItems.push(
                { label: 'Rename', icon: 'fa-pencil', action: () => renameItem(path, true) },
                { label: 'Delete', icon: 'fa-trash', action: () => deleteItem(path, true) }
            );
        } else {
            // Add close option for root folder
            menuItems.push(
                { label: 'Close Folder', icon: 'fa-times', action: closeWorkspace }
            );
        }
    } else if (type === 'file') {
        menuItems = [
            { label: 'Rename', icon: 'fa-pencil', action: () => renameItem(path, false) },
            { label: 'Delete', icon: 'fa-trash', action: () => deleteItem(path, false) }
        ];
    } else {
        // Root context menu (empty space)
        menuItems = [
            { label: 'New File', icon: 'fa-plus', action: () => createNewFile('') },
            { label: 'New Folder', icon: 'fa-folder-plus', action: () => createNewFolder('') }
        ];
    }
    
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
        menuItem.addEventListener('click', () => {
            item.action();
            removeContextMenu();
        });
        contextMenu.appendChild(menuItem);
    });
    
    // Add menu to body and get its dimensions
    document.body.appendChild(contextMenu);
    
    // Position the menu at the cursor, but keep it within viewport
    let x = e.clientX;
    let y = e.clientY;
    
    // Adjust position if menu would go off screen
    const rightEdge = x + contextMenu.offsetWidth;
    const bottomEdge = y + contextMenu.offsetHeight;
    
    if (rightEdge > window.innerWidth) {
        x = window.innerWidth - contextMenu.offsetWidth;
    }
    if (bottomEdge > window.innerHeight) {
        y = window.innerHeight - contextMenu.offsetHeight;
    }
    
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    
    // Close context menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', removeContextMenu);
        document.addEventListener('contextmenu', removeContextMenu);
    }, 0);
}

function removeContextMenu() {
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    document.removeEventListener('click', removeContextMenu);
    document.removeEventListener('contextmenu', removeContextMenu);
}

// Event Listeners
document.getElementById('open-folder').addEventListener('click', openFolder);
document.getElementById('welcome-open-folder').addEventListener('click', openFolder);
document.getElementById('new-file').addEventListener('click', createNewFile);
document.getElementById('new-folder').addEventListener('click', createNewFolder);
document.getElementById('welcome-new-file').addEventListener('click', createNewFile);
document.getElementById('toggle-ai-panel').addEventListener('click', toggleAIPanel);
document.getElementById('new-tab').addEventListener('click', createNewFile);

document.querySelectorAll('.sidebar-icons .icon').forEach(icon => {
    icon.addEventListener('click', () => {
        if (icon.dataset.panel) {
            switchPanel(icon.dataset.panel);
        }
    });
});

document.getElementById('search-input').addEventListener('input', (e) => {
    handleSearch(e.target.value);
});

// Initialize
editor.on('change', () => {
    if (state.currentFile) {
        state.openFiles.get(state.currentFile).content = editor.getValue();
    }
});

// Panel Resizing
function initializeResizing() {
    const sidebarHandle = document.getElementById('sidebar-handle');
    const aiPanelHandle = document.getElementById('ai-panel-handle');
    const sidebar = document.querySelector('.sidebar');
    const aiPanel = document.querySelector('.ai-panel');
    
    let isResizing = false;
    let currentHandle = null;
    let startX = 0;
    let startWidth = 0;
    
    function startResize(e, handle, panel) {
        isResizing = true;
        currentHandle = handle;
        startX = e.pageX;
        startWidth = panel.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        
        // Prevent text selection while resizing
        document.body.style.userSelect = 'none';
    }
    
    function stopResize() {
        if (!isResizing) return;
        
        isResizing = false;
        currentHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
    
    function resize(e) {
        if (!isResizing) return;
        
        const dx = e.pageX - startX;
        
        if (currentHandle === sidebarHandle) {
            const newWidth = Math.max(50, Math.min(800, startWidth + dx));
            sidebar.style.width = newWidth + 'px';
        } else if (currentHandle === aiPanelHandle) {
            const newWidth = Math.max(200, Math.min(800, startWidth - dx));
            aiPanel.style.width = newWidth + 'px';
        }
        
        // Refresh editor to prevent display issues
        editor.refresh();
    }
    
    // Sidebar resize
    sidebarHandle.addEventListener('mousedown', e => {
        startResize(e, sidebarHandle, sidebar);
    });
    
    // AI Panel resize
    aiPanelHandle.addEventListener('mousedown', e => {
        startResize(e, aiPanelHandle, aiPanel);
    });
    
    // Global mouse events
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('mouseleave', stopResize);
}

// Initialize resizing after the page loads
document.addEventListener('DOMContentLoaded', initializeResizing);

// Add CSS for context menu
const contextMenuStyle = document.createElement('style');
contextMenuStyle.textContent = `
.context-menu {
    position: fixed;
    background: #252526;
    border: 1px solid #404040;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    padding: 4px 0;
    min-width: 180px;
    z-index: 1000;
}

.context-menu-item {
    padding: 6px 12px;
    padding-right: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #d4d4d4;
    font-size: 12px;
    white-space: nowrap;
}

.context-menu-item:hover {
    background: #094771;
}

.context-menu-item i {
    width: 16px;
    font-size: 14px;
}
`;
document.head.appendChild(contextMenuStyle);

// Add CSS for input UI
const inputStyle = document.createElement('style');
inputStyle.textContent = `
.input-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
    z-index: 1000;
}

.input-container {
    background: #252526;
    border: 1px solid #404040;
    border-radius: 2px;
    padding: 10px;
    min-width: 300px;
}

.vs-input {
    width: 100%;
    background: #3c3c3c;
    border: 1px solid #404040;
    color: #d4d4d4;
    padding: 8px;
    font-size: 13px;
    outline: none;
}

.vs-input:focus {
    border-color: #007acc;
}
`;
document.head.appendChild(inputStyle);

// Update CSS for file tree
const fileTreeStyle = document.createElement('style');
fileTreeStyle.textContent = `
/* Explorer panel styles */
.explorer {
    padding: 0 !important;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.explorer-header {
    padding: 4px !important;
    flex-shrink: 0;
}

.sidebar-content {
    padding: 0 !important;
    height: 100%;
    overflow: hidden;
}

#file-tree {
    padding: 0;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
}

.file-tree-item {
    user-select: none;
    display: flex;
    flex-direction: column;
}

.file-tree-content {
    display: flex;
    align-items: center;
    padding: 3px 2px;
    cursor: pointer;
    gap: 4px;
    min-width: 0;
}

.file-tree-content:hover {
    background-color: #2d2d2d;
}

.file-tree-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
}

.folder-contents {
    position: relative;
    padding-left: 8px;
    border-left: 1px solid #404040;
}

.file-tree-item.expanded > .file-tree-content > i.fa-folder {
    color: #dcb67a;
}

.file-tree-item .fa-file-code {
    color: #519aba;
}

.file-tree-item:not(:last-child) {
    margin-bottom: 1px;
}

/* Root folder specific styles */
#file-tree > .file-tree-item > .folder-contents {
    padding-left: 8px;
    display: block !important;
}

#file-tree > .file-tree-item > .file-tree-content {
    padding-left: 2px;
}

/* Icon sizes */
.file-tree-content i {
    font-size: 14px;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
}

/* Scrollbar styles */
#file-tree::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

#file-tree::-webkit-scrollbar-track {
    background: transparent;
}

#file-tree::-webkit-scrollbar-thumb {
    background: #424242;
    border: 2px solid transparent;
    background-clip: padding-box;
    border-radius: 5px;
}

#file-tree::-webkit-scrollbar-thumb:hover {
    background: #4f4f4f;
    border: 2px solid transparent;
    background-clip: padding-box;
}

/* Search panel styles */
.search-container {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.search-input-container {
    padding: 8px;
    flex-shrink: 0;
}

#search-results {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}
`;
document.head.appendChild(fileTreeStyle);

// Drag and drop functionality for tabs
let draggedTab = null;

function handleDragStart(e) {
    draggedTab = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    const tab = e.currentTarget;
    if (draggedTab && tab !== draggedTab) {
        const tabRect = tab.getBoundingClientRect();
        const midPoint = tabRect.x + tabRect.width / 2;
        
        if (e.clientX < midPoint) {
            tab.classList.add('drop-left');
            tab.classList.remove('drop-right');
        } else {
            tab.classList.add('drop-right');
            tab.classList.remove('drop-left');
        }
    }
    
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const tab = e.currentTarget;
    if (draggedTab && tab !== draggedTab) {
        const tabRect = tab.getBoundingClientRect();
        const midPoint = tabRect.x + tabRect.width / 2;
        
        if (e.clientX < midPoint) {
            tab.parentNode.insertBefore(draggedTab, tab);
        } else {
            tab.parentNode.insertBefore(draggedTab, tab.nextSibling);
        }
        
        // Update tab order after drag
        state.tabOrder = Array.from(tab.parentNode.children).map(tab => tab.dataset.path);
        saveState();
    }
    
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.classList.remove('drop-left', 'drop-right');
    });
    draggedTab = null;
}

// Add CSS for draggable tabs
const tabStyle = document.createElement('style');
tabStyle.textContent = `
.tab {
    position: relative;
}

.tab.dragging {
    opacity: 0.5;
}

.tab.drop-left::before,
.tab.drop-right::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #007acc;
}

.tab.drop-left::before {
    left: -1px;
}

.tab.drop-right::after {
    right: -1px;
}
`;
document.head.appendChild(tabStyle);

// Load saved state
function loadSavedState() {
    const savedState = localStorage.getItem('editorState');
    if (savedState) {
        const parsed = JSON.parse(savedState);
        
        // Only restore expanded folders if it's the same workspace
        if (parsed.workspace === state.workspace) {
            state.expandedFolders = new Set(parsed.expandedFolders || []);
        } else {
            state.expandedFolders = new Set();
        }
        
        state.workspace = parsed.workspace;
        state.tabOrder = parsed.tabOrder || [];
        state.aiPanelOpen = parsed.aiPanelOpen !== undefined ? parsed.aiPanelOpen : true;
        
        if (state.workspace) {
            // Reload workspace
            eel.get_directory_structure(state.workspace)().then(files => {
                if (files && state.workspace) {  // Check if workspace is still valid
                    renderFileTree(files, state.workspace);
                    document.getElementById('welcome-screen').style.display = 'none';
                    document.getElementById('editor').style.display = 'block';
                    updateExplorerHeader();
                }
                
                // Restore AI panel state
                const aiPanel = document.querySelector('.ai-panel');
                const aiButton = document.getElementById('toggle-ai-panel');
                if (aiPanel && aiButton) {
                    aiPanel.style.width = state.aiPanelOpen ? '300px' : '0px';
                    aiButton.querySelector('i').className = state.aiPanelOpen ? 
                        'fas fa-chevron-right' : 'fas fa-chevron-left';
                }
            }).catch(() => {
                // If there's an error loading the workspace, reset to welcome screen
                closeWorkspace();
            });
            
            // Reload open files
            state.tabOrder.forEach(path => {
                eel.read_file(path)().then(result => {
                    if (result.success) {
                        state.openFiles.set(path, {
                            content: result.content,
                            editor: editor
                        });
                        createTab(path, false); // Don't activate tab immediately
                    }
                });
            });
            
            // Activate last active tab
            if (parsed.currentFile) {
                setTimeout(() => {
                    const tab = document.querySelector(`[data-path="${parsed.currentFile}"]`);
                    if (tab) activateTab(tab);
                }, 100);
            }
        } else {
            // No workspace, ensure we're in welcome screen state
            closeWorkspace();
        }
    }
}

// Save state
function saveState() {
    const saveData = {
        workspace: state.workspace,
        expandedFolders: Array.from(state.expandedFolders),
        currentFile: state.currentFile,
        tabOrder: state.tabOrder,
        aiPanelOpen: state.aiPanelOpen
    };
    localStorage.setItem('editorState', JSON.stringify(saveData));
}

// Add close workspace function
function closeWorkspace() {
    state.workspace = null;
    state.expandedFolders.clear();
    state.openFiles.clear();
    state.tabOrder = [];
    state.currentFile = null;
    
    // Clear UI
    document.getElementById('file-tree').innerHTML = '';
    document.getElementById('tabs-container').innerHTML = '';
    document.getElementById('editor').style.display = 'none';
    document.getElementById('welcome-screen').style.display = 'flex';
    
    // Update explorer header
    updateExplorerHeader();
    
    saveState();
}

// Add close workspace button to explorer header
function updateExplorerHeader() {
    const header = document.querySelector('.explorer-header');
    const closeButton = header.querySelector('.close-workspace');
    
    if (state.workspace && !closeButton) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-workspace';
        closeBtn.title = 'Close Folder';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', closeWorkspace);
        header.appendChild(closeBtn);
    } else if (!state.workspace && closeButton) {
        closeButton.remove();
    }
}

// Add CSS for close workspace button
const explorerStyle = document.createElement('style');
explorerStyle.textContent = `
.close-workspace {
    background: none;
    border: none;
    color: #858585;
    cursor: pointer;
    padding: 4px;
    font-size: 12px;
}

.close-workspace:hover {
    color: #ffffff;
}
`;
document.head.appendChild(explorerStyle);

// Initialize state on load
document.addEventListener('DOMContentLoaded', () => {
    loadSavedState();
    initializeResizing();
    updateExplorerHeader();
});

// Update tab styles
const updatedTabStyle = document.createElement('style');
updatedTabStyle.textContent = `
.tab {
    position: relative;
    display: flex !important;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    min-width: 120px;
    max-width: 200px;
    height: 32px;
    box-sizing: border-box;
}

.tab i:first-child {
    font-size: 14px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    display: inline-block !important;
    opacity: 1 !important;
}

.tab span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
}

.tab i.fa-times {
    font-size: 12px;
    opacity: 0;
    margin-left: auto;
    flex-shrink: 0;
    transition: opacity 0.1s;
}

.tab:hover i.fa-times {
    opacity: 0.7;
}

.tab i.fa-js {
    color: #f7df1e !important;
}

.tab i.fa-python {
    color: #3776ab !important;
}

.tab i.fa-html5 {
    color: #e34f26 !important;
}

.tab i.fa-css3-alt {
    color: #264de4 !important;
}

.tab i.fa-react {
    color: #61dafb !important;
}

.tab i.fa-vuejs {
    color: #42b883 !important;
}

.tab i.fa-java {
    color: #007396 !important;
}

.tab i.fa-php {
    color: #777bb4 !important;
}

.tab i.fa-swift {
    color: #ffac45 !important;
}

.tab i.fa-markdown {
    color: #ffffff !important;
}

.tab i.fa-gem {
    color: #cc342d !important;
}

.tab i.fa-file-code {
    color: #519aba !important;
}

.tab i.fa-file-alt {
    color: #d4d4d4 !important;
}

.tab i.fa-file-word {
    color: #2b579a !important;
}

.tab i.fa-file-pdf {
    color: #f40f02 !important;
}

.tab i.fa-database {
    color: #dad8d8 !important;
}

.tab i.fa-cog {
    color: #6d6d6d !important;
}

.tab i.fa-table {
    color: #7cbb00 !important;
}

.tab.dragging {
    opacity: 0.5;
}

.tab.drop-left::before,
.tab.drop-right::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #007acc;
}

.tab.drop-left::before {
    left: -1px;
}

.tab.drop-right::after {
    right: -1px;
}
`;
document.head.appendChild(updatedTabStyle);

// Update file tree styles to match tab icons
const updatedFileTreeStyle = document.createElement('style');
updatedFileTreeStyle.textContent = `
.file-tree-content i {
    font-size: 14px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
}

/* File type icons colors */
.file-tree-content i.fa-js {
    color: #f7df1e !important;
}

.file-tree-content i.fa-python {
    color: #3776ab !important;
}

.file-tree-content i.fa-html5 {
    color: #e34f26 !important;
}

.file-tree-content i.fa-css3-alt {
    color: #264de4 !important;
}

.file-tree-content i.fa-react {
    color: #61dafb !important;
}

.file-tree-content i.fa-vuejs {
    color: #42b883 !important;
}

.file-tree-content i.fa-java {
    color: #007396 !important;
}

.file-tree-content i.fa-php {
    color: #777bb4 !important;
}

.file-tree-content i.fa-swift {
    color: #ffac45 !important;
}

.file-tree-content i.fa-markdown {
    color: #ffffff !important;
}

.file-tree-content i.fa-gem {
    color: #cc342d !important;
}

.file-tree-content i.fa-file-code {
    color: #519aba !important;
}

.file-tree-content i.fa-file-alt {
    color: #d4d4d4 !important;
}

.file-tree-content i.fa-file-word {
    color: #2b579a !important;
}

.file-tree-content i.fa-file-pdf {
    color: #f40f02 !important;
}

.file-tree-content i.fa-database {
    color: #dad8d8 !important;
}

.file-tree-content i.fa-cog {
    color: #6d6d6d !important;
}

.file-tree-content i.fa-table {
    color: #7cbb00 !important;
}

.file-tree-content i.fa-folder,
.file-tree-content i.fa-folder-open {
    color: #dcb67a !important;
}
`;
document.head.appendChild(updatedFileTreeStyle);

// AI Panel Tab Management
function switchAITab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.ai-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab contents
    document.querySelectorAll('.ai-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

// Initialize AI Panel
function initializeAIPanel() {
    // Add tab switching functionality
    document.querySelectorAll('.ai-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            console.log('Tab clicked:', tab.dataset.tab);
            switchAITab(tab.dataset.tab);
        });
    });
    
    // Initialize Build Chat
    const buildInput = document.getElementById('build-input');
    const buildSubmit = document.getElementById('build-submit');
    const buildMessages = document.getElementById('build-messages');

    if (!buildInput || !buildSubmit || !buildMessages) {
        console.error('Build chat elements not found:', {
            input: buildInput,
            submit: buildSubmit,
            messages: buildMessages
        });
        return;
    }

    console.log('Initializing build chat handlers');
    
    // Event listeners for build chat
    buildSubmit.addEventListener('click', () => {
        console.log('Build submit clicked');
        handleBuildPrompt();
    });
    
    buildInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            console.log('Enter pressed in build input');
            e.preventDefault();
            handleBuildPrompt();
        }
    });
}

// Handle build prompts
async function handleBuildPrompt() {
    const buildInput = document.getElementById('build-input');
    const prompt = buildInput.value.trim();
    
    console.log('Handling build prompt:', prompt);
    
    if (!prompt) return;

    // Add user message to chat
    addBuildMessage('user', prompt);
    buildInput.value = '';

    try {
        // Show loading message
        const loadingMessage = addBuildMessage('assistant', '<i class="fas fa-spinner fa-spin"></i> Processing...');

        // Send to backend
        const response = await eel.handle_build_prompt(prompt)();
        console.log('Build prompt response:', response);

        // Remove loading message
        if (loadingMessage && loadingMessage.parentNode) {
            loadingMessage.parentNode.removeChild(loadingMessage);
        }

        // Add response
        addBuildMessage('assistant', response);
    } catch (error) {
        console.error('Build prompt failed:', error);
        addBuildMessage('error', 'Error: ' + error.message);
    }
}

// Add build message to chat
function addBuildMessage(role, content) {
    const buildMessages = document.getElementById('build-messages');
    if (!buildMessages) {
        console.error('Build messages container not found');
        return null;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    messageDiv.innerHTML = content;
    buildMessages.appendChild(messageDiv);
    buildMessages.scrollTop = buildMessages.scrollHeight;
    return messageDiv;
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing AI panel');
    initializeAIPanel();
    // ... rest of your initialization code ...
});

// Diff View Management
function showDiffView(changes) {
    const buildTab = document.getElementById('build-tab');
    buildTab.innerHTML = `
        <div class="diff-view">
            <div class="diff-header">
                <h3>Proposed Changes</h3>
                <div class="diff-actions">
                    <button id="accept-all" class="diff-action-btn accept">
                        <i class="fas fa-check"></i> Accept All
                    </button>
                    <button id="reject-all" class="diff-action-btn reject">
                        <i class="fas fa-times"></i> Reject All
                    </button>
                </div>
            </div>
            <div class="diff-files"></div>
        </div>
    `;
    
    const diffFiles = buildTab.querySelector('.diff-files');
    changes.forEach((change, index) => {
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        diffContainer.innerHTML = `
            <div class="diff-file-header">
                <span class="diff-file-name">${change.file_path}</span>
                <div class="diff-file-actions">
                    <button class="diff-action-btn accept" data-index="${index}">
                        <i class="fas fa-check"></i> Accept
                    </button>
                    <button class="diff-action-btn reject" data-index="${index}">
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            </div>
            <div class="diff-content syntax-highlighted"></div>
        `;
        
        const diffContent = diffContainer.querySelector('.diff-content');
        // The diff is now HTML with syntax highlighting
        diffContent.innerHTML = change.diff;
        
        diffFiles.appendChild(diffContainer);
    });
    
    // Add event listeners
    document.getElementById('accept-all').addEventListener('click', acceptAllChanges);
    document.getElementById('reject-all').addEventListener('click', rejectAllChanges);
    
    document.querySelectorAll('.diff-action-btn.accept').forEach(btn => {
        if (btn.dataset.index) {  // Skip the "Accept All" button
            btn.addEventListener('click', () => acceptChange(parseInt(btn.dataset.index)));
        }
    });
    
    document.querySelectorAll('.diff-action-btn.reject').forEach(btn => {
        if (btn.dataset.index) {  // Skip the "Reject All" button
            btn.addEventListener('click', () => rejectChange(parseInt(btn.dataset.index)));
        }
    });
}

async function acceptAllChanges() {
    await eel.accept_all_changes()();
    await applyAcceptedChanges();
}

async function rejectAllChanges() {
    await eel.reject_all_changes()();
    resetBuildTab();
}

async function acceptChange(index) {
    await eel.accept_change(index)();
    updateDiffView();
}

async function rejectChange(index) {
    await eel.reject_change(index)();
    updateDiffView();
}

async function applyAcceptedChanges() {
    const results = await eel.apply_accepted_changes()();
    if (Object.values(results).every(success => success)) {
        addAIMessage('All changes applied successfully!', 'success');
        resetBuildTab();
    } else {
        addAIMessage('Some changes failed to apply. Please check the console for details.', 'error');
    }
}

function resetBuildTab() {
    const buildTab = document.getElementById('build-tab');
    buildTab.innerHTML = `
        <div class="build-content">
            <div class="build-options">
                <div class="build-section">
                    <h3>Project Analysis</h3>
                    <button class="build-option">
                        <i class="fas fa-search"></i>
                        Analyze Code
                    </button>
                    <button class="build-option">
                        <i class="fas fa-bug"></i>
                        Find Issues
                    </button>
                </div>
                <div class="build-section">
                    <h3>Suggestions</h3>
                    <button class="build-option">
                        <i class="fas fa-magic"></i>
                        Optimize Code
                    </button>
                    <button class="build-option">
                        <i class="fas fa-book"></i>
                        Generate Docs
                    </button>
                </div>
            </div>
            <div class="build-chat">
                <div class="build-messages" id="build-messages"></div>
                <div class="build-input-container">
                    <textarea 
                        id="build-input" 
                        class="build-input" 
                        placeholder="Type your request here..."
                        rows="3"
                    ></textarea>
                    <button id="build-submit" class="build-submit">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for build options
    document.querySelectorAll('.build-option').forEach(option => {
        option.addEventListener('click', handleBuildOption);
    });
    
    // Add event listeners for chat input
    const buildInput = document.getElementById('build-input');
    const buildSubmit = document.getElementById('build-submit');
    
    buildInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBuildPrompt();
        }
    });
    
    buildSubmit.addEventListener('click', handleBuildPrompt);
}

// Add function to handle build prompts
async function handleBuildPrompt() {
    const input = document.getElementById('build-input');
    const prompt = input.value.trim();
    
    if (!prompt) return;
    
    // Clear input
    input.value = '';
    
    // Add user message to chat
    addBuildMessage('user', prompt);
    
    try {
        // Show loading state
        addBuildMessage('assistant', '<i class="fas fa-spinner fa-spin"></i> Processing...');
        
        // Send prompt to backend
        const response = await eel.process_build_prompt(prompt)();
        
        // Remove loading message
        const messages = document.getElementById('build-messages');
        messages.removeChild(messages.lastChild);
        
        // Show response
        if (response.changes) {
            showDiffView(response.changes);
        } else {
            addBuildMessage(response.message || 'No changes needed.', 'assistant');
        }
    } catch (error) {
        console.error('Build prompt failed:', error);
        addBuildMessage('Error: ' + error.message, 'error');
    }
}

// Add function to display build messages
function addBuildMessage(content, type = 'assistant') {
    const messagesContainer = document.getElementById('build-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = content;
    
    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Add CSS for build chat
const buildChatStyle = document.createElement('style');
buildChatStyle.textContent = `
.build-content {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.build-options {
    flex-shrink: 0;
    padding: 16px;
}

.build-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-top: 1px solid #404040;
}

.build-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.build-input-container {
    display: flex;
    gap: 8px;
    padding: 16px;
    background: #1e1e1e;
    border-top: 1px solid #404040;
}

.build-input {
    flex: 1;
    background: #3c3c3c;
    border: 1px solid #404040;
    border-radius: 4px;
    color: #d4d4d4;
    padding: 8px;
    font-family: inherit;
    font-size: 13px;
    resize: none;
}

.build-input:focus {
    outline: none;
    border-color: #007acc;
}

.build-submit {
    background: #007acc;
    border: none;
    border-radius: 4px;
    color: white;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.build-submit:hover {
    background: #0098ff;
}

.message {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
}

.message.user .message-content {
    background: #2c2c2c;
    border: 1px solid #404040;
    border-radius: 4px;
    padding: 8px 12px;
    margin-left: auto;
    max-width: 80%;
}

.message.assistant .message-content {
    background: #094771;
    border: 1px solid #1b6ca8;
    border-radius: 4px;
    padding: 8px 12px;
    margin-right: auto;
    max-width: 80%;
}

.message.error .message-content {
    background: #6f1313;
    border: 1px solid #a31515;
    border-radius: 4px;
    padding: 8px 12px;
    margin-right: auto;
    max-width: 80%;
}
`;
document.head.appendChild(buildChatStyle);

// Build tab chat functionality
function initializeBuildChat() {
    const buildInput = document.getElementById('build-input');
    const buildSubmit = document.getElementById('build-submit');
    const buildMessages = document.getElementById('build-messages');

    if (!buildInput || !buildSubmit || !buildMessages) {
        console.error('Build chat elements not found');
        return;
    }

    async function handleBuildPrompt() {
        const prompt = buildInput.value.trim();
        if (!prompt) return;

        // Add user message to chat
        addBuildMessage('user', prompt);
        buildInput.value = '';

        try {
            // Show loading message
            const loadingMessage = addBuildMessage('assistant', '<i class="fas fa-spinner fa-spin"></i> Processing...');

            // Send to backend
            const response = await eel.handle_build_prompt(prompt)();

            // Remove loading message
            if (loadingMessage) {
                buildMessages.removeChild(loadingMessage);
            }

            // Add response
            addBuildMessage('assistant', response);
        } catch (error) {
            console.error('Build prompt failed:', error);
            addBuildMessage('error', 'Error: ' + error.message);
        }
    }

    // Event listeners
    buildSubmit.addEventListener('click', () => {
        console.log('Build submit clicked');
        handleBuildPrompt();
    });
    
    buildInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleBuildPrompt();
        }
    });
}

function addBuildMessage(role, content) {
    const buildMessages = document.getElementById('build-messages');
    if (!buildMessages) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    messageDiv.innerHTML = content;
    buildMessages.appendChild(messageDiv);
    buildMessages.scrollTop = buildMessages.scrollHeight;
    return messageDiv;
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    loadSavedState();
    initializeResizing();
    updateExplorerHeader();
    initializeBuildChat();
});

// Add CSS for the build chat
const style = document.createElement('style');
style.textContent = `
    .build-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }
    
    .messages-container {
        flex-grow: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .input-container {
        padding: 1rem;
        border-top: 1px solid #ccc;
        display: flex;
        gap: 0.5rem;
    }
    
    #buildInput {
        flex-grow: 1;
        padding: 0.5rem;
        border: 1px solid #ccc;
        border-radius: 4px;
        resize: none;
    }
    
    .submit-button {
        padding: 0.5rem 1rem;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .submit-button:hover {
        background-color: #0056b3;
    }
    
    .message {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        max-width: 80%;
    }
    
    .user-message {
        background-color: #007bff;
        color: white;
        align-self: flex-end;
    }
    
    .assistant-message {
        background-color: #f0f0f0;
        color: #333;
        align-self: flex-start;
    }
`;
document.head.appendChild(style); 