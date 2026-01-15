import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

interface WhiteboardElement {
	id: string;
	type: "pen" | "line" | "rectangle" | "circle" | "arrow" | "text";
	points?: { x: number; y: number }[];
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	color: string;
	strokeWidth: number;
	text?: string;
	roughness?: number;
}

interface WhiteboardState {
	elements: WhiteboardElement[];
	lastModified: number;
	viewOffset: { x: number; y: number };
	zoom: number;
}

export class WhiteboardPanel {
	public static currentPanel: WhiteboardPanel | undefined;
	public static readonly viewType = "whiteboard";

	private readonly _panel: vscode.WebviewPanel;
	private readonly _context: vscode.ExtensionContext;
	private _disposables: vscode.Disposable[] = [];
	private _autoSaveInterval: NodeJS.Timeout | undefined;

	public static createOrShow(context: vscode.ExtensionContext) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (WhiteboardPanel.currentPanel) {
			WhiteboardPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			WhiteboardPanel.viewType,
			"Whiteboard",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(
						path.join(context.extensionPath, "src", "webview")
					),
				],
			}
		);

		WhiteboardPanel.currentPanel = new WhiteboardPanel(panel, context);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext
	) {
		this._panel = panel;
		this._context = context;

		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			(message) => {
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
			},
			null,
			this._disposables
		);

		// Auto-save setup
		this._autoSaveInterval = setInterval(() => {
			this._panel.webview.postMessage({ command: "requestSave" });
		}, 3000);
	}

	private _saveState(data: WhiteboardState) {
		this._context.workspaceState.update("whiteboardState", {
			...data,
			lastModified: Date.now(),
		});
	}

	private _sendSavedState() {
		const savedState =
			this._context.workspaceState.get<WhiteboardState>(
				"whiteboardState"
			);
		this._panel.webview.postMessage({
			command: "loadState",
			state: savedState,
		});
	}

	private _update() {
		this._panel.webview.html = this._getHtmlForWebview();
	}

	public dispose() {
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

	private _getHtmlForWebview(): string {
		const webview = this._panel.webview;
		// 1. Get paths to the files
		const webviewPath = path.join(
			this._context.extensionPath,
			"src",
			"webview"
		);

		// 2. Read the HTML file
		const htmlPath = path.join(webviewPath, "whiteboard.html");
		let html = fs.readFileSync(htmlPath, "utf8");

		// 3. Convert local paths to Webview URIs
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.file(path.join(webviewPath, "main.js"))
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.file(path.join(webviewPath, "styles.css"))
		);

		// 4. Inject URIs and the CSP Source
		return html
			.replace(/\${webview\.cspSource}/g, webview.cspSource) // Matches the placeholder in the HTML
			.replace("{{scriptUri}}", scriptUri.toString())
			.replace("{{styleUri}}", styleUri.toString());
	}
}
