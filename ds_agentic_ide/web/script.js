// Global variables
let editor = null;
let openFiles = new Map(); // Map of filepath to tab element
let currentFile = null;
let draggedTab = null;
let modalCallback = null;
let completion = null;  // Add this line to store the completion instance

// Context Menu Variables
let contextMenuTarget = null;

// Add to global variables at the top
let expandedFolders = new Set();
let tabHistory = [];
let isTabSwitching = false;
let selectedTabIndex = 0;
let currentChatId = null;
let chatHistory = new Map(); // Map of chat ID to chat data

// Initialize Ace editor
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, initializing editor...");
    
    // Initialize Ace editor
    editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.session.setMode("ace/mode/python");
    
    // Enable Ace language tools
    ace.require("ace/ext/language_tools");
    
    // Initialize code completion
    console.log("Initializing code completion...");
    completion = new CodeCompletion(editor);
    
    // Set up editor options
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: false,  // We handle this in CodeCompletion
        enableSnippets: true,
        showPrintMargin: false,
        fontSize: "14px",
        fontFamily: "JetBrains Mono, Consolas, 'Courier New', monospace",
        showLineNumbers: true,
        showGutter: true,
        highlightActiveLine: true,
        displayIndentGuides: true,
        wrap: true,
        tabSize: 4,
        useSoftTabs: true,
        navigateWithinSoftTabs: true
    });
    
    // Check for existing workspace
    checkWorkspace();
    
    // Set up tab bar drag and drop
    setupTabDragAndDrop();
    
    // Initialize resizers
    setupResizers();
    
    // Initialize keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Save IDE state before page reload
    window.addEventListener('beforeunload', saveIDEState);
    
    // Restore IDE state
    restoreIDEState();
    
    // Initialize editor with status bar updates
    setupEditorStatusBar();
    
    // Create initial chat
    newChat();
    
    console.log("Editor initialization complete");
});

// Expose the file system change handler to Python
window.handleFileSystemChanged = async function() {
    await refreshFileTree();
    
    // Check all open files
    for (const [filepath, tab] of openFiles.entries()) {
        const fileExists = await checkFileExists(filepath);
        tab.classList.toggle('missing', !fileExists);
        
        // Update content if the current file is missing
        if (!fileExists && currentFile === filepath) {
            editor.session.setValue(`File '${filepath}' does not exist or has been deleted.`);
        }
    }
};

// Workspace Management
async function checkWorkspace() {
    const workspace = await eel.get_current_workspace()();
    if (workspace) {
        showIDE(workspace);
    } else {
        showNoWorkspace();
    }
}

async function selectWorkspace() {
    try {
        console.log("Selecting workspace...");
        const result = await eel.select_workspace()();
        console.log("Workspace selection result:", result);
        if (result.status === "success") {
            showIDE(result.data);
        } else {
            console.error("Error selecting workspace:", result.message);
        }
    } catch (error) {
        console.error("Error in selectWorkspace:", error);
    }
}

function showIDE(workspace) {
    document.getElementById('no-workspace').style.display = 'none';
    document.getElementById('ide-container').style.display = 'flex';
    document.getElementById('current-workspace').textContent = workspace.split('/').pop();
    refreshFileTree();
}

function showNoWorkspace() {
    document.getElementById('no-workspace').style.display = 'flex';
    document.getElementById('ide-container').style.display = 'none';
}

// File System Event Handler
function handleFileSystemChanged() {
    refreshFileTree();
}

// File Tree Functions
async function refreshFileTree() {
    const result = await eel.get_directory_structure()();
    if (result.status === "success") {
        const fileTree = document.getElementById("file-tree");
        const scrollTop = fileTree.scrollTop;  // Save scroll position
        
        // Clear and rebuild the entire tree
        fileTree.innerHTML = '';
        renderFileTree(result.data, fileTree);
        
        // Restore scroll position
        fileTree.scrollTop = scrollTop;
        
        // Re-add root context menu listener
        fileTree.addEventListener('contextmenu', (e) => {
            if (e.target === fileTree) {
                e.preventDefault();
                showContextMenu(e, { 
                    type: 'directory', 
                    name: 'root',
                    path: '.' 
                });
            }
        });
    }
    return result;
}

function getFileIcon(item) {
    if (item.type === "directory") {
        return "fas fa-folder";
    }

    const iconMap = {
        'js': 'fab fa-js',
        'py': 'fab fa-python',
        'html': 'fab fa-html5',
        'css': 'fab fa-css3',
        'json': 'fas fa-code',
        'md': 'fas fa-file-alt',
        'txt': 'fas fa-file-alt',
        'jpg': 'fas fa-file-image',
        'jpeg': 'fas fa-file-image',
        'png': 'fas fa-file-image',
        'gif': 'fas fa-file-image',
        'pdf': 'fas fa-file-pdf',
        'zip': 'fas fa-file-archive',
        'rar': 'fas fa-file-archive',
        '7z': 'fas fa-file-archive',
        'mp3': 'fas fa-file-audio',
        'wav': 'fas fa-file-audio',
        'mp4': 'fas fa-file-video',
        'avi': 'fas fa-file-video',
        'doc': 'fas fa-file-word',
        'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel',
        'xlsx': 'fas fa-file-excel',
        'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint'
    };

    return iconMap[item.extension] || 'fas fa-file';
}

function renderFileTree(items, container, parentPath = '.') {
    // Clear the container first if it's the root
    if (parentPath === '.') {
        container.innerHTML = '';
    }

    items.sort((a, b) => {
        // Directories first, then files
        if (a.type === "directory" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "directory") return 1;
        return a.name.localeCompare(b.name);
    });

    items.forEach(item => {
        const itemElement = document.createElement("div");
        itemElement.className = "file-tree-item";
        itemElement.setAttribute('data-path', item.path); // Add data-path attribute
        
        const icon = document.createElement("i");
        icon.className = getFileIcon(item);
        
        const name = document.createElement("span");
        name.textContent = item.name;
        
        itemElement.appendChild(icon);
        itemElement.appendChild(name);
        
        if (item.type === "file") {
            itemElement.onclick = () => openFile(item.path);
        } else {
            itemElement.onclick = async (e) => {
                // Don't toggle if clicking on context menu
                if (e.button === 2) return;
                
                const isExpanded = expandedFolders.has(item.path);
                const folderContents = itemElement.nextElementSibling;
                
                if (folderContents && folderContents.className === "folder-contents") {
                    folderContents.remove();
                    expandedFolders.delete(item.path);
                    icon.className = getFileIcon(item);
                } else {
                    const result = await eel.get_directory_structure(item.path)();
                    if (result.status === "success") {
                        const contents = document.createElement("div");
                        contents.className = "folder-contents";
                        renderFileTree(result.data, contents, item.path);
                        itemElement.parentNode.insertBefore(contents, itemElement.nextSibling);
                        expandedFolders.add(item.path);
                        icon.className = "fas fa-folder-open";
                    }
                }
            };
        }
        
        itemElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, item);
        });
        
        container.appendChild(itemElement);
        
        // If this folder was previously expanded, expand it again
        if (item.type === "directory" && expandedFolders.has(item.path)) {
            itemElement.click();
        }
    });

    // Re-add root context menu listener if this is the root container
    if (parentPath === '.') {
        container.addEventListener('contextmenu', (e) => {
            if (e.target === container) {
                e.preventDefault();
                showContextMenu(e, { 
                    type: 'directory', 
                    name: 'root',
                    path: '.' 
                });
            }
        });
    }
}

// Modal Dialog Functions
function showModal(title, placeholder, callback) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    
    modalTitle.textContent = title;
    modalInput.placeholder = placeholder;
    modalInput.value = '';
    modalCallback = callback;
    
    modal.classList.add('show');
    modalInput.focus();
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('show');
    modalCallback = null;
}

function handleModalConfirm() {
    const input = document.getElementById('modal-input');
    const value = input.value.trim();
    
    if (value && modalCallback) {
        modalCallback(value);
    }
    
    closeModal();
}

// File Creation
function showCreateFileDialog() {
    showModal('Create New File', 'Enter file name', createNewFile);
}

function showCreateFolderDialog() {
    showModal('Create New Folder', 'Enter folder name', createNewFolder);
}

async function createNewFile(filename) {
    const result = await eel.create_file(filename)();
    if (result.status === "success") {
        refreshFileTree();
        openFile(filename);
    }
}

async function createNewFolder(foldername) {
    const result = await eel.create_directory(foldername)();
    if (result.status === "success") {
        refreshFileTree();
    }
}

// File Operations
async function openFile(filepath) {
    if (openFiles.has(filepath)) {
        await activateTab(filepath);
        return;
    }

    const result = await eel.read_file(filepath)();
    if (result.status === "success") {
        createTab(filepath);
        editor.session.setValue(result.data);
        currentFile = filepath;
        
        // Set mode based on file extension
        const extension = filepath.split('.').pop().toLowerCase();
        const modeMap = {
            'js': 'javascript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'md': 'markdown',
            'txt': 'text',
            'xml': 'xml',
            'sql': 'sql',
            'sh': 'sh',
            'yaml': 'yaml',
            'yml': 'yaml',
            'ini': 'ini',
            'conf': 'ini'
        };
        editor.session.setMode(`ace/mode/${modeMap[extension] || 'text'}`);
        
        // Update status bar
        updateFileType();
        updateFileStatus();
    }
}

async function saveCurrentFile() {
    if (!currentFile) return;
    
    const content = editor.getValue();
    const result = await eel.save_file(currentFile, content)();
    
    if (result.status === "success") {
        // Visual feedback
        const tab = openFiles.get(currentFile);
        if (tab) {
            tab.classList.add('saved');
            setTimeout(() => tab.classList.remove('saved'), 1000);
        }
    }
}

// Tab Management
function createTab(filepath) {
    const tabBar = document.getElementById("tab-bar");
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.draggable = true;
    
    const filename = filepath.split('/').pop();
    const extension = filename.split('.').pop().toLowerCase();
    
    tab.innerHTML = `
        <span class="tab-title">
            <i class="${getFileIcon({type: 'file', extension})}"></i>
            ${filename}
        </span>
        <span class="tab-close" onclick="closeTab('${filepath}')">×</span>
    `;
    
    tab.onclick = async (e) => {
        if (!e.target.classList.contains('tab-close')) {
            await activateTab(filepath);
        }
    };
    
    openFiles.set(filepath, tab);
    tabBar.appendChild(tab);
    activateTab(filepath);
}

async function activateTab(filepath) {
    const tab = openFiles.get(filepath);
    if (!tab) return;
    
    // Update tab history
    tabHistory = [filepath, ...tabHistory.filter(file => file !== filepath)];
    
    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // Activate selected tab
    tab.classList.add('active');
    currentFile = filepath;

    // Check if file exists
    const fileExists = await checkFileExists(filepath);
    tab.classList.toggle('missing', !fileExists);

    // Load the file content if it exists
    if (fileExists) {
        const result = await eel.read_file(filepath)();
        if (result.status === "success") {
            editor.session.setValue(result.data);
            
            const extension = filepath.split('.').pop().toLowerCase();
            const modeMap = {
                'js': 'javascript',
                'py': 'python',
                'html': 'html',
                'css': 'css',
                'json': 'json',
                'md': 'markdown',
                'txt': 'text',
                'xml': 'xml',
                'sql': 'sql',
                'sh': 'sh',
                'yaml': 'yaml',
                'yml': 'yaml',
                'ini': 'ini',
                'conf': 'ini'
            };
            editor.session.setMode(`ace/mode/${modeMap[extension] || 'text'}`);
        }
    } else {
        editor.session.setValue(`File '${filepath}' does not exist or has been deleted.`);
    }
}

function closeTab(filepath) {
    const tab = openFiles.get(filepath);
    if (!tab) return;
    
    tab.remove();
    openFiles.delete(filepath);
    
    if (currentFile === filepath) {
        currentFile = null;
        editor.setValue('');
        
        // Activate last tab if available
        const remainingTabs = Array.from(openFiles.keys());
        if (remainingTabs.length > 0) {
            activateTab(remainingTabs[remainingTabs.length - 1]);
        }
    }
}

// Tab Drag and Drop
function setupTabDragAndDrop() {
    const tabBar = document.getElementById("tab-bar");
    
    tabBar.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('tab')) {
            draggedTab = e.target;
            e.target.style.opacity = '0.5';
        }
    });
    
    tabBar.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('tab')) {
            e.target.style.opacity = '1';
            draggedTab = null;
        }
    });
    
    tabBar.addEventListener('dragover', (e) => {
        e.preventDefault();
        const tab = e.target.closest('.tab');
        if (tab && draggedTab && tab !== draggedTab) {
            const rect = tab.getBoundingClientRect();
            const midpoint = rect.x + rect.width / 2;
            
            if (e.clientX < midpoint) {
                tab.parentNode.insertBefore(draggedTab, tab);
            } else {
                tab.parentNode.insertBefore(draggedTab, tab.nextSibling);
            }
        }
    });
}

// AI Help Functions
function sendAiMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();
    if (!message) return;
    
    // Add message to chat container
    const chatContainer = document.getElementById('ai-chat');
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message user-message';
    messageElement.textContent = message;
    chatContainer.appendChild(messageElement);
    
    // Clear input
    input.value = '';
    
    // TODO: Implement AI response handling
    // This is where you would integrate with your AI backend
}

// Panel Resizing
function setupResizers() {
    const leftPanel = document.querySelector('.file-explorer');
    const rightPanel = document.querySelector('.ai-help');
    const leftResizer = document.querySelector('.left-resizer');
    const rightResizer = document.querySelector('.right-resizer');

    setupResizer(leftResizer, leftPanel, 'width', 200, 500);
    setupResizer(rightResizer, rightPanel, 'width', 200, 500);
}

function setupResizer(resizer, panel, dimension, minSize, maxSize) {
    let startSize, startPos;

    function startResize(e) {
        resizer.classList.add('resizing');
        startPos = e[`page${dimension === 'width' ? 'X' : 'Y'}`];
        startSize = parseInt(window.getComputedStyle(panel)[dimension]);
        
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
    }

    function resize(e) {
        const currentPos = e[`page${dimension === 'width' ? 'X' : 'Y'}`];
        const diff = currentPos - startPos;
        
        // Determine if we're resizing from the right or left
        const newSize = resizer.classList.contains('right-resizer') 
            ? startSize - diff 
            : startSize + diff;
        
        if (newSize >= minSize && newSize <= maxSize) {
            panel.style[dimension] = `${newSize}px`;
        }
    }

    function stopResize() {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }

    resizer.addEventListener('mousedown', startResize);
}

// Menu Functions
function closeCurrentTab() {
    if (currentFile) {
        closeTab(currentFile);
    }
}

function closeAllTabs() {
    const tabs = Array.from(openFiles.keys());
    tabs.forEach(filepath => closeTab(filepath));
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    saveCurrentFile();
                    break;
                case 'w':
                    e.preventDefault();
                    closeCurrentTab();
                    break;
                case 'n':
                    e.preventDefault();
                    showCreateFileDialog();
                    break;
                case 'f':
                    e.preventDefault();
                    editor.execCommand('find');
                    break;
                case 'h':
                    e.preventDefault();
                    editor.execCommand('replace');
                    break;
                case 'a':
                    if (document.activeElement !== editor.textInput.getElement()) {
                        e.preventDefault();
                        editor.selectAll();
                    }
                    break;
                case 'tab':
                    e.preventDefault();
                    handleTabSwitch(e.shiftKey);
                    break;
            }
        } else if (e.key === 'F3') {
            e.preventDefault();
            editor.findNext();
        } else if (e.key === 'Escape' && isTabSwitching) {
            hideTabSwitcher();
        }
        
        // Handle Ctrl+K chord
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const handler = (e2) => {
                if (e2.key.toLowerCase() === 'w') {
                    closeAllTabs();
                } else if (e2.key.toLowerCase() === 'o') {
                    selectWorkspace();
                }
                document.removeEventListener('keydown', handler);
            };
            document.addEventListener('keydown', handler);
        }
    });

    // Handle tab switching key up
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control' && isTabSwitching) {
            switchToSelectedTab();
        }
    });
}

// Context Menu Functions
function showContextMenu(e, item) {
    const fileMenu = document.getElementById('file-context-menu');
    const folderMenu = document.getElementById('folder-context-menu');
    const menu = item.type === 'directory' ? folderMenu : fileMenu;
    
    // Hide any visible context menu
    hideContextMenus();
    
    // Position the menu
    const x = e.pageX;
    const y = e.pageY;
    
    // Check if menu would go off screen
    const menuWidth = 160; // Minimum width of context menu
    const menuHeight = menu.offsetHeight || 200; // Approximate height if not yet shown
    
    // Adjust position if menu would go off screen
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);
    
    menu.style.top = `${adjustedY}px`;
    menu.style.left = `${adjustedX}px`;
    
    // Show the menu
    menu.classList.add('show');
    
    // Store the target
    contextMenuTarget = item;
    
    // Add click handler to hide menu
    document.addEventListener('click', hideContextMenus);
}

function hideContextMenus() {
    document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.remove('show');
    });
    contextMenuTarget = null;
    document.removeEventListener('click', hideContextMenus);
}

// Context Menu Actions
function openContextFile() {
    if (contextMenuTarget && contextMenuTarget.type === 'file') {
        openFile(contextMenuTarget.path);
    }
}

function createFileInFolder() {
    if (contextMenuTarget && contextMenuTarget.type === 'directory') {
        const basePath = contextMenuTarget.path;
        showModal('Create New File', 'Enter file name', (filename) => {
            const fullPath = basePath === '.' ? filename : `${basePath}/${filename}`;
            createNewFile(fullPath);
        });
    }
}

function createFolderInFolder() {
    if (contextMenuTarget && contextMenuTarget.type === 'directory') {
        const basePath = contextMenuTarget.path;
        showModal('Create New Folder', 'Enter folder name', (foldername) => {
            const fullPath = basePath === '.' ? foldername : `${basePath}/${foldername}`;
            createNewFolder(fullPath);
        });
    }
}

async function renameContextItem() {
    if (!contextMenuTarget) return;
    
    const oldPath = contextMenuTarget.path;
    const oldName = contextMenuTarget.name;
    
    showModal('Rename', 'Enter new name', async (newName) => {
        if (newName === oldName) return;
        
        const parentPath = oldPath.substring(0, oldPath.length - oldName.length);
        const newPath = parentPath + newName;
        
        try {
            // For files, we need to read the content first
            let content = '';
            if (contextMenuTarget.type === 'file') {
                const result = await eel.read_file(oldPath)();
                if (result.status === 'success') {
                    content = result.data;
                }
            }
            
            // Create the new item
            if (contextMenuTarget.type === 'file') {
                await eel.create_file(newPath)();
                await eel.save_file(newPath, content)();
            } else {
                await eel.create_directory(newPath)();
            }
            
            // Delete the old item
            await eel.delete_item(oldPath)();
            
            // Refresh the file tree
            refreshFileTree();
            
            // Update any open tabs
            if (contextMenuTarget.type === 'file') {
                const tab = openFiles.get(oldPath);
                if (tab) {
                    openFiles.delete(oldPath);
                    openFiles.set(newPath, tab);
                    if (currentFile === oldPath) {
                        currentFile = newPath;
                    }
                    const filename = newPath.split('/').pop();
                    const extension = filename.split('.').pop().toLowerCase();
                    tab.querySelector('.tab-title').innerHTML = `
                        <i class="${getFileIcon({type: 'file', extension})}"></i>
                        ${filename}
                    `;
                }
            }
        } catch (error) {
            console.error('Error renaming item:', error);
        }
    });
}

function copyContextPath() {
    if (!contextMenuTarget) return;
    
    const path = contextMenuTarget.path;
    navigator.clipboard.writeText(path).then(() => {
        // Optional: Show a notification that the path was copied
        console.log('Path copied to clipboard');
    });
}

async function deleteContextItem() {
    if (!contextMenuTarget) return;
    
    // Store the target since it will be cleared when we hide the menu
    const target = { ...contextMenuTarget };
    
    // Hide the context menu first
    hideContextMenus();
    
    // Show confirmation dialog with appropriate message
    const itemType = target.type === 'directory' ? 'folder' : 'file';
    const confirmed = window.confirm(`Are you sure you want to delete this ${itemType}: ${target.name}?`);
    
    if (confirmed) {
        try {
            // Delete the item
            const result = await eel.delete_item(target.path)();
            if (result.status === 'success') {
                // If it's a file and it's open, mark it as missing
                if (target.type === 'file' && openFiles.has(target.path)) {
                    const tab = openFiles.get(target.path);
                    tab.classList.add('missing');
                    if (currentFile === target.path) {
                        editor.session.setValue(`File '${target.path}' has been deleted.`);
                    }
                }
                
                // If it's a directory, remove it from expanded folders
                if (target.type === 'directory') {
                    expandedFolders.delete(target.path);
                }
                
                // Get the parent folder's path
                const pathParts = target.path.split('/');
                pathParts.pop(); // Remove the file/folder name
                const parentPath = pathParts.join('/') || '.';
                
                // Refresh the file tree
                await refreshFileTree();
            }
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    }
}

// Tab Switching Functions
function handleTabSwitch(reverse = false) {
    if (!isTabSwitching) {
        // Initialize tab switching
        isTabSwitching = true;
        tabHistory = Array.from(openFiles.keys());
        if (currentFile) {
            // Move current file to the start of the history
            tabHistory = [currentFile, ...tabHistory.filter(file => file !== currentFile)];
        }
        selectedTabIndex = 0;
        showTabSwitcher();
    }

    // Update selected tab
    selectedTabIndex = reverse ? 
        (selectedTabIndex - 1 + tabHistory.length) % tabHistory.length :
        (selectedTabIndex + 1) % tabHistory.length;
    
    updateTabSwitcherSelection();
}

function showTabSwitcher() {
    const switcher = document.getElementById('tab-switcher');
    const list = document.getElementById('tab-switcher-list');
    list.innerHTML = '';

    // Create tab items
    tabHistory.forEach((filepath, index) => {
        const item = document.createElement('div');
        item.className = 'tab-switcher-item' + (index === selectedTabIndex ? ' selected' : '');
        
        const filename = filepath.split('/').pop();
        const extension = filename.split('.').pop().toLowerCase();
        
        item.innerHTML = `
            <i class="${getFileIcon({type: 'file', extension})}"></i>
            <span class="filename">${filename}</span>
            <span class="path">${filepath}</span>
        `;
        
        item.onclick = () => {
            selectedTabIndex = index;
            switchToSelectedTab();
        };
        
        list.appendChild(item);
    });

    switcher.classList.add('show');
}

function updateTabSwitcherSelection() {
    const items = document.querySelectorAll('.tab-switcher-item');
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedTabIndex);
    });
}

function hideTabSwitcher() {
    const switcher = document.getElementById('tab-switcher');
    switcher.classList.remove('show');
    isTabSwitching = false;
}

async function switchToSelectedTab() {
    if (selectedTabIndex >= 0 && selectedTabIndex < tabHistory.length) {
        const filepath = tabHistory[selectedTabIndex];
        await activateTab(filepath);
    }
    hideTabSwitcher();
}

// Add to the file operations section
async function checkFileExists(filepath) {
    const result = await eel.read_file(filepath)();
    return result.status === "success";
}

// Add these new functions for state persistence
function saveIDEState() {
    const state = {
        openFiles: Array.from(openFiles.keys()),
        currentFile: currentFile,
        expandedFolders: Array.from(expandedFolders),
        workspace: document.getElementById('current-workspace').textContent
    };
    localStorage.setItem('ideState', JSON.stringify(state));
}

async function restoreIDEState() {
    const savedState = localStorage.getItem('ideState');
    if (savedState) {
        const state = JSON.parse(savedState);
        
        // Restore workspace if it exists
        if (state.workspace && state.workspace !== 'No Folder Selected') {
            showIDE(state.workspace);
        }
        
        // Restore expanded folders
        expandedFolders = new Set(state.expandedFolders);
        
        // Restore open files
        if (state.openFiles) {
            for (const filepath of state.openFiles) {
                await openFile(filepath);
            }
        }
        
        // Restore current file
        if (state.currentFile) {
            await activateTab(state.currentFile);
        }
    }
}

// Add these new functions for status bar
function setupEditorStatusBar() {
    // Update cursor position on change
    editor.selection.on('changeCursor', () => {
        updateCursorPosition();
    });

    // Update file status on change
    editor.session.on('change', () => {
        updateFileStatus();
    });

    // Initial status updates
    updateFileType();
    updateCursorPosition();
    updateFileStatus();
}

function updateCursorPosition() {
    const pos = editor.getCursorPosition();
    const line = pos.row + 1;
    const column = pos.column + 1;
    document.getElementById('cursor-position').innerHTML = 
        `<i class="fas fa-map-marker-alt"></i> Ln ${line}, Col ${column}`;
}

function updateFileStatus() {
    const fileStatus = document.getElementById('file-status');
    if (!currentFile) {
        fileStatus.innerHTML = '<i class="fas fa-file"></i> No File';
        fileStatus.className = 'status-item';
        return;
    }

    const isClean = editor.session.getUndoManager().isClean();
    if (isClean) {
        fileStatus.innerHTML = '<i class="fas fa-check"></i> Saved';
        fileStatus.className = 'status-item saved';
    } else {
        fileStatus.innerHTML = '<i class="fas fa-circle"></i> Modified';
        fileStatus.className = 'status-item modified';
    }
}

function updateFileType() {
    const fileType = document.getElementById('file-type');
    if (!currentFile) {
        fileType.innerHTML = '<i class="fas fa-code"></i> Plain Text';
        return;
    }

    const extension = currentFile.split('.').pop().toLowerCase();
    const typeMap = {
        'js': 'JavaScript',
        'py': 'Python',
        'html': 'HTML',
        'css': 'CSS',
        'json': 'JSON',
        'md': 'Markdown',
        'txt': 'Plain Text',
        'xml': 'XML',
        'sql': 'SQL',
        'sh': 'Shell Script',
        'yaml': 'YAML',
        'yml': 'YAML',
        'ini': 'INI',
        'conf': 'Config'
    };

    const type = typeMap[extension] || 'Plain Text';
    fileType.innerHTML = `<i class="fas fa-code"></i> ${type}`;
}

// Add preferences dialog
function showPreferences() {
    showModal('Editor Preferences', '', (value) => {
        // TODO: Implement preferences dialog
        console.log('Preferences dialog to be implemented');
    });
}

// Add AI tab switching function
function switchAiTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.ai-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.toLowerCase() === tabName);
    });
    
    // Update panels
    document.querySelectorAll('.ai-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `ai-${tabName}-panel`);
    });
}

// Add build functions
function startBuild() {
    const output = document.getElementById('build-output');
    output.textContent = 'Building...\n';
    // TODO: Implement build functionality
}

function stopBuild() {
    const output = document.getElementById('build-output');
    output.textContent += 'Build stopped.\n';
    // TODO: Implement build stop functionality
}

// Add these new functions
async function formatCurrentCode(silent = false) {
    try {
        const code = editor.getValue();
        const fileType = currentFile ? currentFile.split('.').pop().toLowerCase() : 'text';
        
        // Show formatting indicator
        const statusBar = document.getElementById('file-status');
        statusBar.innerHTML = '<i class="fas fa-sync fa-spin"></i> Formatting...';
        
        // Use await here to properly handle the async call
        const result = await eel.format_code(code, fileType)();
        
        if (result.status === 'success') {
            const { formatted_code, diff } = result.data;
            
            if (silent) {
                // Apply formatting immediately without preview
                editor.setValue(formatted_code);
                editor.selection.clearSelection();
                
                // Update status
                statusBar.innerHTML = '<i class="fas fa-check"></i> Formatted';
                setTimeout(() => {
                    updateFileStatus();
                }, 2000);
            } else {
                // Show diff preview dialog
                showDiffPreview(diff, () => {
                    // Apply formatting when confirmed
                    editor.setValue(formatted_code);
                    editor.selection.clearSelection();
                    
                    // Update status
                    statusBar.innerHTML = '<i class="fas fa-check"></i> Formatted';
                    setTimeout(() => {
                        updateFileStatus();
                    }, 2000);
                    
                    // Show formatting summary
                    showFormattingSummary(diff);
                });
            }
        } else {
            console.error('Error formatting code:', result.message);
            statusBar.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Format Error';
            setTimeout(() => {
                updateFileStatus();
            }, 2000);
        }
    } catch (error) {
        console.error('Error in formatCurrentCode:', error);
        const statusBar = document.getElementById('file-status');
        statusBar.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Format Error';
        setTimeout(() => {
            updateFileStatus();
        }, 2000);
    }
}

function showDiffPreview(diff, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="width: 80%; max-width: 1000px;">
            <div class="modal-header">
                <h3>Format Code Preview</h3>
                <span class="modal-close">&times;</span>
            </div>
            <div class="modal-body">
                <div class="diff-summary">
                    <span>Changes: ${diff.total_changes}</span>
                    <span>Added: ${diff.lines_added}</span>
                    <span>Removed: ${diff.lines_removed}</span>
                    <span>Modified: ${diff.lines_modified}</span>
                </div>
                <div class="diff-content">
                    ${diff.changes.map(change => `
                        <div class="diff-line ${change.type}">
                            <div class="line-number">${change.line}</div>
                            <div class="line-content">
                                ${change.type === 'removed' ? 
                                    `<div class="removed">${escapeHtml(change.original)}</div>` :
                                    change.type === 'added' ?
                                    `<div class="added">${escapeHtml(change.formatted)}</div>` :
                                    `<div class="removed">${escapeHtml(change.original)}</div>
                                     <div class="added">${escapeHtml(change.formatted)}</div>`
                                }
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="secondary-button">Cancel</button>
                <button class="primary-button">Apply Formatting</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.secondary-button');
    const applyBtn = modal.querySelector('.primary-button');
    
    closeBtn.onclick = cancelBtn.onclick = () => {
        modal.remove();
    };
    
    applyBtn.onclick = () => {
        onConfirm();
        modal.remove();
    };
}

function showFormattingSummary(diff) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-check-circle"></i>
            <div class="toast-message">
                Code formatted successfully<br>
                <small>${diff.total_changes} changes made</small>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showEditorContextMenu(e) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    
    menu.innerHTML = `
        <div class="menu-item" onclick="editor.execCommand('cut')">
            <i class="fas fa-cut"></i> Cut
        </div>
        <div class="menu-item" onclick="editor.execCommand('copy')">
            <i class="fas fa-copy"></i> Copy
        </div>
        <div class="menu-item" onclick="editor.execCommand('paste')">
            <i class="fas fa-paste"></i> Paste
        </div>
        <div class="menu-separator"></div>
        <div class="menu-item" onclick="formatCurrentCode().catch(error => console.error('Error formatting:', error))">
            <i class="fas fa-magic"></i> Format Code
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking outside
    const removeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', removeMenu);
        }
    };
    
    document.addEventListener('click', removeMenu);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add a silent format function
async function silentFormat() {
    await formatCurrentCode(true);
}

// Chat functionality
function newChat() {
    // Clear the messages area
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    
    // Generate a new chat ID
    currentChatId = Date.now().toString();
    
    // Initialize new chat in history with empty context
    chatHistory.set(currentChatId, {
        title: 'New Chat',
        messages: [],
        model: document.getElementById('model-selector').value,
        contextFiles: new Set() // Store active context files
    });
    
    // Update chat history sidebar
    updateChatHistoryList();
    
    // Clear the input and context files
    document.getElementById('chat-input-text').value = '';
    updateContextFilesList();
    updateActiveContextFiles();
}

function toggleChatHistory() {
    const sidebar = document.getElementById('chat-history-sidebar');
    const container = document.querySelector('.chat-container');
    sidebar.classList.toggle('show');
    container.classList.toggle('sidebar-open');
}

function updateChatHistoryList() {
    const historyList = document.getElementById('chat-history-list');
    historyList.innerHTML = '';
    
    // Sort chats by most recent first
    const sortedChats = Array.from(chatHistory.entries()).sort((a, b) => b[0] - a[0]);
    
    sortedChats.forEach(([chatId, chat]) => {
        const item = document.createElement('div');
        item.className = `chat-history-item${chatId === currentChatId ? ' active' : ''}`;
        
        item.innerHTML = `
            <i class="fas fa-comments"></i>
            <span class="title">${chat.title}</span>
            <button onclick="deleteChat('${chatId}')" class="icon-button delete" title="Delete Chat">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        item.onclick = (e) => {
            if (!e.target.closest('.delete')) {
                loadChat(chatId);
            }
        };
        
        historyList.appendChild(item);
    });
}

function loadChat(chatId) {
    const chat = chatHistory.get(chatId);
    if (!chat) return;
    
    currentChatId = chatId;
    
    // Update messages
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    chat.messages.forEach(msg => {
        addChatMessage(msg.content, msg.role, false);
    });
    
    // Update model selector
    document.getElementById('model-selector').value = chat.model;
    
    // Update context files
    updateContextFilesList();
    updateActiveContextFiles();
    
    // Update chat history sidebar
    updateChatHistoryList();
}

function deleteChat(chatId) {
    chatHistory.delete(chatId);
    
    if (currentChatId === chatId) {
        if (chatHistory.size > 0) {
            loadChat(chatHistory.keys().next().value);
        } else {
            newChat();
        }
    }
    
    updateChatHistoryList();
}

// Update the existing sendChatMessage function
async function sendChatMessage() {
    const input = document.getElementById('chat-input-text');
    const message = input.value.trim();
    const modelSelector = document.getElementById('model-selector');
    const selectedModel = modelSelector.value;
    
    if (!message) return;
    
    // Clear input and reset height
    input.value = '';
    input.style.height = 'auto';
    
    // Get current chat and its context files
    const currentChat = chatHistory.get(currentChatId);
    if (!currentChat) return;
    
    // Add user message
    addChatMessage(message, 'user', true);
    
    try {
        // Prepare context from files
        const contextFiles = await Promise.all(
            Array.from(currentChat.contextFiles).map(async filepath => {
                const result = await eel.read_file(filepath)();
                return result.status === 'success' ? result.data : null;
            })
        );
        
        // Filter out failed reads and join with file paths
        const context = Array.from(currentChat.contextFiles).map((filepath, index) => ({
            path: filepath,
            content: contextFiles[index]
        })).filter(file => file.content !== null);
        
        // Send message with context
        const result = await eel.send_chat_message(message, selectedModel, context)();
        
        if (result.status === 'success') {
            // Add AI response
            addChatMessage(result.data.response, 'assistant', true);
            
            // Update chat title if it's the first message
            if (currentChat.messages.length === 2 && currentChat.title === 'New Chat') {
                currentChat.title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
                updateChatHistoryList();
            }
            
            // Update model selector silently if fallback occurred
            if (selectedModel !== result.data.model_used) {
                modelSelector.value = result.data.model_used;
                currentChat.model = result.data.model_used;
            }
        }
    } catch (error) {
        console.error('Error sending chat message:', error);
    }
}

// Update the existing addChatMessage function
function addChatMessage(message, role, saveToHistory = true) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    
    // Process message content for code blocks
    const processedMessage = message.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'plaintext';
        const uniqueId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return `<div class="code-block">
            <div class="code-header">
                <span class="language">${language}</span>
                <button onclick="copyCode(this)" data-code="${encodeURIComponent(code.trim())}">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
            <div id="${uniqueId}" class="code-content">${escapeHtml(code.trim())}</div>
        </div>`;
    });
    
    messageDiv.innerHTML = processedMessage;
    
    // Apply syntax highlighting to code blocks
    messageDiv.querySelectorAll('.code-content').forEach(block => {
        const language = block.closest('.code-block').querySelector('.language').textContent;
        const editor = ace.edit(block.id, {
            maxLines: Infinity,
            minLines: 1,
            readOnly: true,
            printMargin: false,
            highlightActiveLine: false,
            highlightGutterLine: false,
            showGutter: true,
            showLineNumbers: true,
            fadeFoldWidgets: true,
            showPrintMargin: false,
            fixedWidthGutter: true,
            tabSize: 4,
            useSoftTabs: true,
            navigateWithinSoftTabs: true,
            displayIndentGuides: true,
            showInvisibles: false,
            theme: 'ace/theme/monokai'
        });
        
        // Set the language mode
        const modeMap = {
            'python': 'python',
            'javascript': 'javascript',
            'js': 'javascript',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'plaintext': 'text',
            'text': 'text'
        };
        editor.session.setMode(`ace/mode/${modeMap[language.toLowerCase()] || 'text'}`);
        
        // Adjust editor size to content
        editor.setAutoScrollEditorIntoView(true);
        editor.renderer.setScrollMargin(0, 0, 0, 0);
        
        // Disable editing
        editor.setReadOnly(true);
        editor.renderer.$cursorLayer.element.style.display = "none";
    });
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Save to chat history if needed
    if (saveToHistory && currentChatId) {
        const chat = chatHistory.get(currentChatId);
        if (chat) {
            chat.messages.push({ role, content: message });
        }
    }
}

function copyCode(button) {
    const code = decodeURIComponent(button.getAttribute('data-code'));
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            button.innerHTML = originalText;
        }, 2000);
    });
}

// Add event listeners for chat input
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input-text');
    if (chatInput) {
        // Handle Enter key
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }
});

// Add context files management
function toggleContextFiles() {
    const dropdown = document.getElementById('context-files-dropdown');
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        updateContextFilesList();
        // Add click outside listener
        document.addEventListener('click', closeContextDropdown);
    }
}

function closeContextDropdown(e) {
    const dropdown = document.getElementById('context-files-dropdown');
    const button = document.querySelector('.context-dropdown button');
    
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.classList.remove('show');
        document.removeEventListener('click', closeContextDropdown);
    }
}

async function updateContextFilesList() {
    const filesList = document.getElementById('context-files-list');
    const searchInput = document.getElementById('context-search');
    const result = await eel.get_directory_structure()();
    
    if (result.status === "success") {
        const files = getAllFiles(result.data);
        renderContextFiles(files);
        
        // Add search functionality
        searchInput.oninput = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredFiles = files.filter(file => 
                file.path.toLowerCase().includes(searchTerm)
            );
            renderContextFiles(filteredFiles);
        };
    }
}

function getAllFiles(items, path = '') {
    let files = [];
    items.forEach(item => {
        if (item.type === 'file') {
            files.push(item);
        } else if (item.children) {
            files = files.concat(getAllFiles(item.children, item.path + '/'));
        }
    });
    return files;
}

function renderContextFiles(files) {
    const filesList = document.getElementById('context-files-list');
    filesList.innerHTML = '';
    
    const currentChat = chatHistory.get(currentChatId);
    const activeFiles = currentChat ? currentChat.contextFiles : new Set();
    
    files.forEach(file => {
        const item = document.createElement('div');
        item.className = `context-file-item${activeFiles.has(file.path) ? ' selected' : ''}`;
        item.setAttribute('data-path', file.path);
        
        item.innerHTML = `
            <i class="${getFileIcon(file)}"></i>
            <span>${file.path}</span>
        `;
        
        // Add click handler directly to the item
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleContextFile(file.path);
            return false;
        });
        
        filesList.appendChild(item);
    });
}

async function toggleContextFile(filepath) {
    console.log('Toggling file:', filepath); // Debug log
    
    const currentChat = chatHistory.get(currentChatId);
    if (!currentChat) {
        console.log('No current chat found'); // Debug log
        return;
    }
    
    // Toggle the file in the context
    if (currentChat.contextFiles.has(filepath)) {
        currentChat.contextFiles.delete(filepath);
        console.log('Removed file from context'); // Debug log
    } else {
        currentChat.contextFiles.add(filepath);
        console.log('Added file to context'); // Debug log
    }
    
    // Update the UI
    const fileItems = document.querySelectorAll(`.context-file-item[data-path="${filepath}"]`);
    fileItems.forEach(item => {
        item.classList.toggle('selected');
    });
    
    // Update active files list
    updateActiveContextFiles();
    
    // Prevent the dropdown from closing
    event.stopPropagation();
}

function updateActiveContextFiles() {
    const activeFilesList = document.getElementById('active-context-files');
    activeFilesList.innerHTML = '';
    
    const currentChat = chatHistory.get(currentChatId);
    if (!currentChat) return;
    
    currentChat.contextFiles.forEach(filepath => {
        const item = document.createElement('div');
        item.className = 'active-context-file';
        const filename = filepath.split('/').pop();
        
        item.innerHTML = `
            <i class="${getFileIcon({type: 'file', extension: filepath.split('.').pop()})}"></i>
            <span>${filename}</span>
            <span class="remove" onclick="toggleContextFile('${filepath}')">
                <i class="fas fa-times"></i>
            </span>
        `;
        
        activeFilesList.appendChild(item);
    });
} 