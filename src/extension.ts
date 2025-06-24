import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Whiteboard extension is now active!');

    // Register command to open whiteboard
    const disposable = vscode.commands.registerCommand('whiteboard.open', () => {
        WhiteboardPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

class WhiteboardPanel {
    public static currentPanel: WhiteboardPanel | undefined;
    public static readonly viewType = 'whiteboard';

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WhiteboardPanel.currentPanel) {
            WhiteboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            WhiteboardPanel.viewType,
            'Whiteboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        WhiteboardPanel.currentPanel = new WhiteboardPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        this._panel.webview.html = getWhiteboardHtml();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        WhiteboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

function getWhiteboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whiteboard</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: var(--vscode-editor-background, #ffffff);
            color: var(--vscode-editor-foreground, #000000);
            font-family: var(--vscode-font-family);
        }
        
        .toolbar {
            position: fixed;
            top: 10px;
            left: 10px;
            background: var(--vscode-panel-background, #f3f3f3);
            border: 1px solid var(--vscode-panel-border, #ccc);
            border-radius: 8px;
            padding: 8px;
            display: flex;
            gap: 8px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .tool-btn {
            background: var(--vscode-button-background, #007acc);
            color: var(--vscode-button-foreground, white);
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        }
        
        .tool-btn:hover {
            background: var(--vscode-button-hoverBackground, #005a9e);
        }
        
        .tool-btn.active {
            background: var(--vscode-button-secondaryBackground, #5a5d5e);
        }
        
        .color-picker, .size-slider {
            margin: 0 4px;
        }
        
        .size-slider {
            width: 60px;
        }
        
        #canvas {
            cursor: crosshair;
            display: block;
        }
        
        .canvas-container {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
        }
        
        .size-display {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #717171);
            margin-left: 4px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button class="tool-btn active" data-tool="pen">✏️ Pen</button>
        <button class="tool-btn" data-tool="eraser">🧽 Eraser</button>
        <button class="tool-btn" data-tool="line">📏 Line</button>
        <button class="tool-btn" data-tool="rectangle">⬜ Rectangle</button>
        <button class="tool-btn" data-tool="circle">⭕ Circle</button>
        <input type="color" class="color-picker" value="#000000" title="Color">
        <input type="range" class="size-slider" min="1" max="20" value="2" title="Size">
        <span class="size-display">2px</span>
        <button class="tool-btn" onclick="clearCanvas()">🗑️ Clear</button>
        <button class="tool-btn" onclick="downloadCanvas()">💾 Save</button>
    </div>
    
    <div class="canvas-container">
        <canvas id="canvas"></canvas>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const colorPicker = document.querySelector('.color-picker');
        const sizeSlider = document.querySelector('.size-slider');
        const sizeDisplay = document.querySelector('.size-display');
        const toolButtons = document.querySelectorAll('[data-tool]');
        
        let isDrawing = false;
        let currentTool = 'pen';
        let startX, startY;
        let currentPath = [];
        
        // Set canvas size
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            // Set default styles
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Update stroke color based on theme
        function updateStrokeColor() {
            const computedStyle = getComputedStyle(document.body);
            const bgColor = computedStyle.getPropertyValue('--vscode-editor-background') || '#ffffff';
            const isLight = bgColor === '#ffffff' || bgColor.includes('255');
            
            if (colorPicker.value === '#000000' && !isLight) {
                colorPicker.value = '#ffffff';
            } else if (colorPicker.value === '#ffffff' && isLight) {
                colorPicker.value = '#000000';
            }
        }
        
        updateStrokeColor();
        
        // Tool selection
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTool = btn.dataset.tool;
                
                if (currentTool === 'eraser') {
                    canvas.style.cursor = 'grab';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            });
        });
        
        // Size slider
        sizeSlider.addEventListener('input', (e) => {
            sizeDisplay.textContent = e.target.value + 'px';
        });
        
        // Drawing functions
        function startDrawing(e) {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            
            if (currentTool === 'pen') {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                currentPath = [{x: startX, y: startY}];
            }
        }
        
        function draw(e) {
            if (!isDrawing) return;
            
            const rect = canvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            ctx.lineWidth = sizeSlider.value;
            
            if (currentTool === 'pen') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = colorPicker.value;
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
                currentPath.push({x: currentX, y: currentY});
            } else if (currentTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(currentX, currentY, sizeSlider.value, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        function stopDrawing(e) {
            if (!isDrawing) return;
            isDrawing = false;
            
            const rect = canvas.getBoundingClientRect();
            const endX = e.clientX - rect.left;
            const endY = e.clientY - rect.top;
            
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = colorPicker.value;
            ctx.lineWidth = sizeSlider.value;
            
            if (currentTool === 'line') {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            } else if (currentTool === 'rectangle') {
                ctx.beginPath();
                ctx.rect(startX, startY, endX - startX, endY - startY);
                ctx.stroke();
            } else if (currentTool === 'circle') {
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                ctx.beginPath();
                ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }
        
        // Event listeners
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        
        // Touch events for mobile support
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });
        
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            canvas.dispatchEvent(mouseEvent);
        });
        
        // Utility functions
        function clearCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        function downloadCanvas() {
            const link = document.createElement('a');
            link.download = 'whiteboard-' + new Date().getTime() + '.png';
            link.href = canvas.toDataURL();
            link.click();
        }
        
        // Prevent scrolling when drawing
        document.body.addEventListener('touchstart', (e) => {
            if (e.target === canvas) {
                e.preventDefault();
            }
        }, { passive: false });
        
        document.body.addEventListener('touchend', (e) => {
            if (e.target === canvas) {
                e.preventDefault();
            }
        }, { passive: false });
        
        document.body.addEventListener('touchmove', (e) => {
            if (e.target === canvas) {
                e.preventDefault();
            }
        }, { passive: false });
    </script>
</body>
</html>`;
}

export function deactivate() {}