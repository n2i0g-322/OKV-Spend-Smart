import type { AppState } from './types';
import { createSeedState, ensureExtraFundsColumn } from './seed';

const KEY = 'okvSpendSmart';
const KEY_STATE = `${KEY}:state`;

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY_STATE);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== 1) return createSeedState();
    return ensureExtraFundsColumn(parsed);
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(state: AppState): string {
  const headers = [
    'id',
    'date',
    'tab',
    'column',
    'amount',
    'type',
    'memo',
    'source',
  ];
  const lines = [headers.join(',')];
  for (const e of state.entries) {
    const tab = state.tabs.find((t) => t.id === e.tabId)?.name ?? '';
    const col = state.columns.find((c) => c.id === e.columnId)?.name ?? '';
    const row = [
      e.id,
      e.date,
      csvEscape(tab),
      csvEscape(col),
      e.amount.toFixed(2),
      e.type,
      csvEscape(e.memo),
      e.source,
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function markBackup(state: AppState): AppState {
  return { ...state, lastBackupAt: new Date().toISOString() };
}

export function mergeStates(current: AppState, incoming: AppState): AppState {
  const tabIds = new Set(current.tabs.map((t) => t.id));
  const colIds = new Set(current.columns.map((c) => c.id));
  const entryIds = new Set(current.entries.map((e) => e.id));
  const billIds = new Set(current.bills.map((b) => b.id));
  const ruleIds = new Set(current.rules.map((r) => r.id));
  const chartIds = new Set(current.charts.map((c) => c.id));

  return {
    ...current,
    tabs: [...current.tabs, ...incoming.tabs.filter((t) => !tabIds.has(t.id))],
    columns: [
      ...current.columns,
      ...incoming.columns.filter((c) => !colIds.has(c.id)),
    ],
    entries: [
      ...current.entries,
      ...incoming.entries.filter((e) => !entryIds.has(e.id)),
    ],
    bills: [...current.bills, ...incoming.bills.filter((b) => !billIds.has(b.id))],
    rules: [...current.rules, ...incoming.rules.filter((r) => !ruleIds.has(r.id))],
    charts: [
      ...current.charts,
      ...incoming.charts.filter((c) => !chartIds.has(c.id)),
    ],
    expectedIncome:
      incoming.expectedIncome.amount > 0
        ? incoming.expectedIncome
        : current.expectedIncome,
    lastBackupAt: current.lastBackupAt,
    hasSeenWelcome: current.hasSeenWelcome || incoming.hasSeenWelcome,
  };
}

export function parseImport(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tabs)) return null;
    return ensureExtraFundsColumn(parsed);
  } catch {
    return null;
  }
}

export { KEY };
