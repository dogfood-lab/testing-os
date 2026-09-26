const vscode = require('vscode');

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('kinds.hello', () => vscode.window.showInformationMessage('hello')));
}

module.exports = { activate };
