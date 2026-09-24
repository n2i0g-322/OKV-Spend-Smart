import type { AppState, Bill, ChartConfig, Column, Entry, Rule, Tab, ViewName } from './types';
import { createSeedState, ensureExtraFundsColumn } from './seed';
import { DEFAULT_THEME, normalizeTheme, type ThemeState } from './theme';
import { isValidYMD, localToday } from './date';

/**
 * Persistence for OKV Spend Smart.
 *
 * ONE blob lives in localStorage under `okvSpendSmart`. It holds the whole
 * AppState (tabs, columns + budgets, entries, bills + statuses, rules, charts,
 * Box 3 expected income, lastBackupAt …) plus the theme and the last view/date.
 *
 * Legacy keys (`okvSpendSmart:state`, `okvSpendSmart:theme`) are read as a
 * fallback and migrated into the blob; they are never deleted.
 */
const KEY = 'okvSpendSmart';
const LEGACY_STATE_KEY = `${KEY}:state`;
const LEGACY_THEME_KEY = `${KEY}:theme`;
export const BLOB_SCHEMA = 2;

const VIEWS: ViewName[] = ['day', 'week', 'month', 'year', 'bills', 'statistics'];

export interface UiPrefs {
  view: ViewName;
  selectedDate: string;
}

export interface StoredBlob {
  schema: number;
  savedAt: string;
  state: AppState;
  theme: ThemeState;
  ui: UiPrefs;
}

export type LoadSource = 'blob' | 'legacy' | 'seed';

export interface LoadResult {
  state: AppState;
  theme: ThemeState;
  ui: UiPrefs;
  source: LoadSource;
  savedAt: string | null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // corrupt
  }
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Accept any previously saved/exported AppState-like object and fill gaps with
 * defaults. Never discards user data because of a version number.
 * Returns null only when the object has no usable tabs array.
 */
export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<AppState> & Record<string, unknown>;
  if (!Array.isArray(p.tabs) || p.tabs.length === 0) return null;
  const seed = createSeedState();
  const tabs = [...arr<Tab>(p.tabs)];
  // Uncategorized system tab must always exist.
  if (!tabs.some((t) => t.isSystem || t.name === 'Uncategorized')) {
    const unc = seed.tabs.find((t) => t.isSystem)!;
    tabs.push({ ...unc, order: tabs.length });
  }
  const exp = (p.expectedIncome ?? {}) as Partial<AppState['expectedIncome']>;
  const freq = exp.frequency === 'daily' || exp.frequency === 'yearly' ? exp.frequency : 'monthly';
  const amount = Number(exp.amount);
  const state: AppState = {
    version: 1,
    tabs,
    columns: arr<Column>(p.columns),
    entries: arr<Entry>(p.entries).filter(
      (e) => e && typeof e === 'object' && Number.isFinite(Number(e.amount)),
    ).map((e) => ({ ...e, amount: Number(e.amount) })),
    bills: arr<Bill>(p.bills).map((b) => ({ ...b, statusByDate: b.statusByDate ?? {} })),
    rules: arr<Rule>(p.rules),
    expectedIncome: { frequency: freq, amount: Number.isFinite(amount) && amount > 0 ? amount : 0 },
    charts: Array.isArray(p.charts) ? arr<ChartConfig>(p.charts) : seed.charts,
    lastBackupAt: typeof p.lastBackupAt === 'string' ? p.lastBackupAt : null,
    lastExportAt: typeof p.lastExportAt === 'string' ? p.lastExportAt : null,
    hasSeenWelcome: !!p.hasSeenWelcome,
    activeTabId:
      typeof p.activeTabId === 'string' && tabs.some((t) => t.id === p.activeTabId)
        ? p.activeTabId
        : (tabs[0]?.id ?? null),
  };
  return ensureExtraFundsColumn(state);
}

function normalizeUi(raw: unknown): UiPrefs {
  const u = (raw ?? {}) as Partial<UiPrefs>;
  return {
    view: VIEWS.includes(u.view as ViewName) ? (u.view as ViewName) : 'day',
    selectedDate: isValidYMD(u.selectedDate) ? u.selectedDate : localToday(),
  };
}

/** Boot: READ storage first. Seeds only when nothing usable is stored. */
export function loadAll(): LoadResult {
  const ls = storage();
  const defaultUi: UiPrefs = { view: 'day', selectedDate: localToday() };
  if (!ls) {
    return { state: createSeedState(), theme: normalizeTheme(null), ui: defaultUi, source: 'seed', savedAt: null };
  }

  const blobRaw = ls.getItem(KEY);
  const blob = safeParse(blobRaw) as Partial<StoredBlob> | null | undefined;
  if (blob && typeof blob === 'object') {
    // Blob may be the wrapped format, or (defensively) a bare AppState.
    const st = normalizeState('state' in blob ? blob.state : blob);
    if (st) {
      const legacyTheme = safeParse(ls.getItem(LEGACY_THEME_KEY));
      return {
        state: st,
        theme: normalizeTheme(blob.theme ?? legacyTheme ?? null),
        ui: normalizeUi(blob.ui),
        source: 'blob',
        savedAt: typeof blob.savedAt === 'string' ? blob.savedAt : null,
      };
    }
  }
  if (blobRaw && blob === undefined) {
    // Corrupt blob: keep a copy so a seed write can never destroy it silently.
    try {
      ls.setItem(`${KEY}:corrupt-${Date.now()}`, blobRaw);
    } catch {
      /* ignore */
    }
  }

  // Legacy migration: okvSpendSmart:state + okvSpendSmart:theme
  const legacyState = normalizeState(safeParse(ls.getItem(LEGACY_STATE_KEY)));
  const legacyThemeRaw = safeParse(ls.getItem(LEGACY_THEME_KEY));
  if (legacyState) {
    return {
      state: legacyState,
      theme: normalizeTheme(legacyThemeRaw ?? null),
      ui: defaultUi,
      source: 'legacy',
      savedAt: null,
    };
  }

  return {
    state: createSeedState(),
    theme: normalizeTheme(legacyThemeRaw ?? null),
    ui: defaultUi,
    source: 'seed',
    savedAt: null,
  };
}

/** Synchronous write of the single blob. Returns the ISO time written, or throws. */
export function saveAll(state: AppState, theme: ThemeState, ui: UiPrefs, now = new Date()): string {
  const ls = storage();
  if (!ls) throw new Error('localStorage unavailable');
  const savedAt = now.toISOString();
  const blob: StoredBlob = {
    schema: BLOB_SCHEMA,
    savedAt,
    state: { ...state, lastBackupAt: savedAt },
    theme,
    ui,
  };
  ls.setItem(KEY, JSON.stringify(blob));
  return savedAt;
}

/** Parse a blob string written by another browser tab (storage event). */
export function parseBlob(raw: string | null): LoadResult | null {
  const blob = safeParse(raw) as Partial<StoredBlob> | null | undefined;
  if (!blob || typeof blob !== 'object') return null;
  const st = normalizeState('state' in blob ? blob.state : blob);
  if (!st) return null;
  return {
    state: st,
    theme: normalizeTheme(blob.theme ?? null),
    ui: normalizeUi(blob.ui),
    source: 'blob',
    savedAt: typeof blob.savedAt === 'string' ? blob.savedAt : null,
  };
}

/** Back-compat helpers (used by tests/tools). */
export function loadState(): AppState {
  return loadAll().state;
}

export function saveState(state: AppState): void {
  const cur = loadAll();
  saveAll(state, cur.source === 'seed' ? DEFAULT_THEME : cur.theme, cur.ui);
}

export function exportJSON(state: AppState, theme?: ThemeState): string {
  return JSON.stringify(theme ? { ...state, theme } : state, null, 2);
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
  const headers = ['id', 'date', 'tab', 'column', 'amount', 'type', 'memo', 'source'];
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
      csvEscape(e.memo ?? ''),
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

export function markExport(state: AppState): AppState {
  return { ...state, lastExportAt: new Date().toISOString() };
}

/** @deprecated kept for compatibility; exports now stamp lastExportAt. */
export const markBackup = markExport;

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
    columns: [...current.columns, ...incoming.columns.filter((c) => !colIds.has(c.id))],
    entries: [...current.entries, ...incoming.entries.filter((e) => !entryIds.has(e.id))],
    bills: [...current.bills, ...incoming.bills.filter((b) => !billIds.has(b.id))],
    rules: [...current.rules, ...incoming.rules.filter((r) => !ruleIds.has(r.id))],
    charts: [...current.charts, ...incoming.charts.filter((c) => !chartIds.has(c.id))],
    expectedIncome:
      incoming.expectedIncome.amount > 0 ? incoming.expectedIncome : current.expectedIncome,
    lastBackupAt: current.lastBackupAt,
    hasSeenWelcome: current.hasSeenWelcome || incoming.hasSeenWelcome,
  };
}

export function parseImport(raw: string): AppState | null {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  // Accept an export (bare AppState) or a raw storage blob ({ state: … }).
  return normalizeState('state' in p && !('tabs' in p) ? p.state : p);
}

/** Theme embedded in an exported JSON, if any. */
export function parseImportTheme(raw: string): ThemeState | null {
  const parsed = safeParse(raw) as Record<string, unknown> | null | undefined;
  if (!parsed || typeof parsed !== 'object' || !parsed.theme) return null;
  return normalizeTheme(parsed.theme);
}

export { KEY, LEGACY_STATE_KEY, LEGACY_THEME_KEY };
