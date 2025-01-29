class CodeCompletion {
    constructor(editor) {
        console.log('Initializing CodeCompletion system...');
        this.editor = editor;
        this.debounceTimeout = null;
        this.currentCompletion = null;
        this.isShowingCompletion = false;
        
        // Configure Ace editor for completions
        console.log('Configuring Ace editor for completions...');
        this.editor.setOptions({
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,  // We'll handle this ourselves
            enableSnippets: true
        });
        
        // Add custom CSS for ghost text
        this.addGhostTextStyles();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('CodeCompletion system initialized');
    }
    
    addGhostTextStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ace_ghost-text {
                color: #8e8e8e !important;
                opacity: 0.8;
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        console.log('Setting up completion event listeners...');
        
        // Listen for any changes in the editor
        this.editor.on('change', (e) => {
            console.log('Editor change event triggered:', e);
            
            // Get current state
            const cursor = this.editor.getCursorPosition();
            const currentLine = this.editor.session.getLine(cursor.row);
            
            console.log('Current state:', {
                cursor,
                currentLine,
                changeType: e.action,
                lines: e.lines
            });
            
            // Only trigger completion on insertText events
            if (e.action === 'insert') {
                this.clearCurrentCompletion();
                this.debounceGetCompletion();
            }
        });
        
        // Listen for cursor movements
        this.editor.selection.on('changeCursor', () => {
            console.log('Cursor position changed');
            this.clearCurrentCompletion();
        });
        
        // Handle tab key for accepting completions
        this.editor.container.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                console.log('Tab key pressed, completion state:', {
                    isShowingCompletion: this.isShowingCompletion,
                    hasCurrentCompletion: !!this.currentCompletion
                });
                
                if (this.isShowingCompletion && this.currentCompletion) {
                    e.preventDefault();  // Prevent default tab behavior
                    e.stopPropagation(); // Stop event bubbling
                    this.acceptCompletion();
                }
            }
        }, true);  // Use capture phase to handle event before Ace editor
        
        console.log('Event listeners setup complete');
    }
    
    debounceGetCompletion() {
        console.log('Debouncing completion request...');
        if (this.debounceTimeout) {
            console.log('Clearing existing debounce timeout');
            clearTimeout(this.debounceTimeout);
        }
        
        this.debounceTimeout = setTimeout(() => {
            console.log('Debounce timeout triggered, requesting completion');
            this.getCompletion();
        }, 300);  // 300ms debounce
    }
    
    async getCompletion() {
        console.log('Getting completion...');
        const session = this.editor.getSession();
        const cursor = this.editor.getCursorPosition();
        const code = session.getValue();
        const cursorOffset = session.doc.positionToIndex(cursor);
        
        console.log('Current editor state:', {
            cursor,
            cursorOffset,
            totalLength: code.length,
            currentLine: session.getLine(cursor.row),
            mode: session.getMode().$id
        });
        
        // Don't get completion if we're not at the end of a line
        const currentLine = session.getLine(cursor.row);
        if (cursor.column < currentLine.length) {
            console.log('Skipping completion - cursor not at end of line');
            return;
        }
        
        // Get file type based on mode
        const mode = session.getMode().$id;
        const fileType = mode.split('/').pop();  // e.g., 'ace/mode/python' -> 'python'
        
        try {
            console.log('Requesting completion from backend...', {
                fileType,
                codeLength: code.length,
                cursorOffset
            });
            
            const result = await eel.get_code_completion(code, cursorOffset, fileType)();
            console.log('Received completion result:', result);
            
            if (result.status === 'success' && result.data) {
                console.log('Showing completion:', result.data);
                this.showCompletion(result.data);
            } else {
                console.error('Error getting completion:', result.message);
            }
        } catch (error) {
            console.error('Error requesting completion:', error);
        }
    }
    
    showCompletion(completionText) {
        console.log('Attempting to show completion:', completionText);
        if (!completionText || this.isShowingCompletion) {
            console.log('Skipping completion display:', {
                hasCompletionText: !!completionText,
                isShowingCompletion: this.isShowingCompletion
            });
            return;
        }
        
        const cursor = this.editor.getCursorPosition();
        const session = this.editor.getSession();
        
        console.log('Creating ghost text at position:', cursor);
        
        // Create a temporary marker for the ghost text
        const range = new ace.Range(
            cursor.row,
            cursor.column,
            cursor.row,
            cursor.column + completionText.length
        );
        
        this.currentCompletion = {
            text: completionText,
            marker: session.addMarker(range, "ace_ghost-text", "text", true)
        };
        
        this.isShowingCompletion = true;
        
        // Insert the completion text as ghost text
        const ghostText = document.createElement('span');
        ghostText.className = 'ace_ghost-text';
        ghostText.textContent = completionText;
        
        const coords = this.editor.renderer.textToScreenCoordinates(cursor.row, cursor.column);
        ghostText.style.position = 'absolute';
        ghostText.style.left = `${coords.pageX}px`;
        ghostText.style.top = `${coords.pageY}px`;
        
        this.editor.container.appendChild(ghostText);
        this.currentCompletion.element = ghostText;
        console.log('Ghost text displayed');
    }
    
    acceptCompletion() {
        if (this.currentCompletion) {
            console.log("Accepting completion:", this.currentCompletion);
            
            // Insert the completion text
            this.editor.insert(this.currentCompletion.text);
            
            // Clear the completion state
            this.clearCurrentCompletion();
            
            // Format the code silently after completion
            silentFormat().catch(error => {
                console.error('Error formatting after completion:', error);
            });
        }
    }
    
    clearCurrentCompletion() {
        console.log('Clearing current completion...');
        if (this.currentCompletion) {
            console.log('Removing completion elements');
            // Remove the marker
            this.editor.session.removeMarker(this.currentCompletion.marker);
            
            // Remove the ghost text element
            if (this.currentCompletion.element) {
                this.currentCompletion.element.remove();
            }
            
            this.currentCompletion = null;
            this.isShowingCompletion = false;
            console.log('Completion cleared');
        }
    }
}

// Export the class
window.CodeCompletion = CodeCompletion; 