import * as vscode from 'vscode';

const MATCH_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];

const MAXIMUM_GROW_ATTEMPTS = 3;

const growSelectionToArgsList = async (editor: vscode.TextEditor): Promise<boolean> => {
  // FIXME: i wish i could reflect on the scope analysis without actually messing with the active selection
  for (let i = 0; i < MAXIMUM_GROW_ATTEMPTS; ++i) {
    await vscode.commands.executeCommand('editor.action.smartSelect.expand');
    const text = editor.document.getText(editor.selection);
    for (const pair of MATCH_PAIRS) {
      if (text.charAt(0) == pair[0] && text.charAt(text.length - 1) == pair[1]) {
        return true;
      }
    }
  }
  return false;
};

const joinArgs = async (editor: vscode.TextEditor): Promise<string> => {
  return editor.document.getText(editor.selection).replace(/,\n\s*/g, ', ').replace(/\n\s*/g, '');
};

const splitArgs = async (editor: vscode.TextEditor): Promise<string> => {
  const origSelection = editor.selection;
  const text = editor.document.getText(origSelection);
  const startOffset = editor.document.offsetAt(origSelection.start);

  const argSeparators = [];
  for (let idx = 0; idx < text.length; ++idx) {
    if (text.charAt(idx) == ",") {
      const pos = editor.document.positionAt(startOffset + idx);
      editor.selection = new vscode.Selection(pos, pos);
      await growSelectionToArgsList(editor);
      if (editor.selection.isEqual(origSelection)) {
        argSeparators.push(idx);
      }
    }
  }

  const args = [];
  for (let x = 0; x <= argSeparators.length; ++x) {
    const argStart = (x == 0 ? 1 : argSeparators[x-1]+1);
    const argEnd = (x < argSeparators.length ? argSeparators[x] : text.length - 1);
    args.push(text.slice(argStart, argEnd).trim());
  }

  const indentSelection = new vscode.Selection(new vscode.Position(origSelection.anchor.line, 0), origSelection.active);
  const indentMatches = editor.document.getText(indentSelection).match(/^\s+/) || [];
  const outerIndent = indentMatches.length > 0 ? indentMatches[0] : "";
  const argIndent = outerIndent + (editor.options.insertSpaces ? " ".repeat(editor.options.tabSize as number) : "\t");

  const splitText = text.charAt(0) + `\n${argIndent}` + args.join(`,\n${argIndent}`) + `\n${outerIndent}` + text.charAt(text.length - 1);
  return splitText;
};

const argwrapToggle = async () => {
  const editor = vscode.window.activeTextEditor;
  if (editor == undefined) { return; }
  const document = editor.document;

  const success = await growSelectionToArgsList(editor);
  if (success) {
    const targetSelection = editor.selection;
    const text = document.getText(editor.selection);
    const newText = await (text.includes("\n") ?  joinArgs(editor) : splitArgs(editor));

    await editor.edit(builder => {
      builder.replace(targetSelection, newText);
    })
  }

  // FIXME: Vim extension is still messing up cursor position
  try {
    await vscode.commands.executeCommand('extension.vim_escape');
  } catch (error) {
    // Ignore missing vim extension
    await vscode.commands.executeCommand('cancelSelection');
  }
};

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('argwrap.toggle', argwrapToggle);
	context.subscriptions.push(disposable);
}

export function deactivate() {}
