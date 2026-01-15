"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhiteboardPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class WhiteboardPanel {
    static createOrShow(context) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (WhiteboardPanel.currentPanel) {
            WhiteboardPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(WhiteboardPanel.viewType, "Whiteboard", column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, "src", "webview")),
            ],
        });
        WhiteboardPanel.currentPanel = new WhiteboardPanel(panel, context);
    }
    constructor(panel, context) {
        this._disposables = [];
        this._panel = panel;
        this._context = context;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case "saveState":
                    this._saveState(message.data);
                    break;
                case "getState":
                    this._sendSavedState();
                    break;
                case "log":
                    console.log("[Whiteboard]", message.data);
                    break;
            }
        }, null, this._disposables);
        // Auto-save setup
        this._autoSaveInterval = setInterval(() => {
            this._panel.webview.postMessage({ command: "requestSave" });
        }, 3000);
    }
    _saveState(data) {
        this._context.workspaceState.update("whiteboardState", {
            ...data,
            lastModified: Date.now(),
        });
    }
    _sendSavedState() {
        const savedState = this._context.workspaceState.get("whiteboardState");
        this._panel.webview.postMessage({
            command: "loadState",
            state: savedState,
        });
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }
    dispose() {
        WhiteboardPanel.currentPanel = undefined;
        if (this._autoSaveInterval) {
            clearInterval(this._autoSaveInterval);
        }
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _getHtmlForWebview() {
        const webview = this._panel.webview;
        // 1. Get paths to the files
        const webviewPath = path.join(this._context.extensionPath, "src", "webview");
        // 2. Read the HTML file
        const htmlPath = path.join(webviewPath, "whiteboard.html");
        let html = fs.readFileSync(htmlPath, "utf8");
        // 3. Convert local paths to Webview URIs
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, "main.js")));
        const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, "styles.css")));
        // 4. Inject URIs and the CSP Source
        return html
            .replace(/\${webview\.cspSource}/g, webview.cspSource) // Matches the placeholder in the HTML
            .replace("{{scriptUri}}", scriptUri.toString())
            .replace("{{styleUri}}", styleUri.toString());
    }
}
exports.WhiteboardPanel = WhiteboardPanel;
WhiteboardPanel.viewType = "whiteboard";
//# sourceMappingURL=WhiteboardPanel.js.map