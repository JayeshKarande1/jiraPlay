import * as vscode from 'vscode';
import { findTodos } from '../shared/codeIssues';
import { lensTitle, type BoardLookup } from './todoLens';

/**
 * A lens over every TODO-style comment: the ones that already name an issue open it on the board, the rest
 * offer to create one. Nothing here talks to Jira — it reads the board the extension already has.
 */
export class TodoCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  constructor(private readonly board: BoardLookup) {}

  /** Called when a new board arrives, so lenses pick up status changes without an edit. */
  refresh() {
    this.changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration('jiraPlay').get<boolean>('todoCodeLens', true)) return [];
    if (document.uri.scheme !== 'file') return [];

    return findTodos(document.getText(), this.board.projects()).map((todo) => {
      const found = todo.key ? this.board.quest(todo.key) : undefined;
      return new vscode.CodeLens(document.lineAt(todo.line).range, {
        title: lensTitle(todo, found),
        tooltip: found?.summary,
        command: todo.key ? 'jiraPlay.openIssue' : 'jiraPlay.createIssueFromCode',
        arguments: todo.key ? [todo.key] : [document.uri, todo.line],
      });
    });
  }

  dispose() {
    this.changed.dispose();
  }
}
