import * as vscode from 'vscode';
import { WhiteboardPanel } from './WhiteboardPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('whiteboard.open', () => {
            WhiteboardPanel.createOrShow(context);
        })
    );
}

export function deactivate() {
    // Cleanup
}