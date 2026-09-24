import type { AppState } from './types';

const MAX = 20;

export class UndoStack {
  private stack: AppState[] = [];

  push(state: AppState): void {
    this.stack.push(structuredClone(state));
    if (this.stack.length > MAX) this.stack.shift();
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }

  undo(current: AppState): AppState | null {
    if (!this.stack.length) return null;
    const prev = this.stack.pop()!;
    void current;
    return prev;
  }

  clear(): void {
    this.stack = [];
  }

  size(): number {
    return this.stack.length;
  }
}
