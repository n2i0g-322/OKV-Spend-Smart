import type { AppState, ChartConfig, Column, Entry, PaySchedule, Rule, Tab, ViewName } from './types';
import { migrateBills } from './bills';
import { createSeedState, ensureExtraFundsColumn } from './seed';
import { DEFAULT_THEME, normalizeTheme, type ThemeState } from './theme';
import { isValidYMD, localToday } from './date';

/**
 * Persistence for OKV Spend Smart.
 *
 * ONE blob lives in localStorage under `okvSpendSmart`. Schema 4 holds several
 * fully separate ACCOUNTS (each its own AppState: tabs, columns + budgets,
 * entries, bills + occurrences + logs, rules, charts, Box 3 / pay schedule,
 * last view/date) plus the global theme and the active account id.
 *
 * Legacy keys (`okvSpendSmart:state`, `okvSpendSmart:theme`) are read as a
 * fallback and migrated into the blob; they are never deleted.
 */
const KEY = 'okvSpendSmart';
const LEGACY_STATE_KEY = `${KEY}:state`;
const LEGACY_THEME_KEY = `${KEY}:theme`;
/**
 * 4 = multiple accounts (accounts[] + activeAccountId).
 * 3 = bill occurrences + action log + payday schedule (fix pass 2).
 * Loading an older blob migrates in memory and keeps a verbatim copy under
 * `okvSpendSmart:pre-schema3-backup` / `okvSpendSmart:pre-schema4-backup`
 * (each written once, never deleted).
 */
export const BLOB_SCHEMA = 4;
const PRE_MIGRATION_KEY = `${KEY}:pre-schema3-backup`;
const PRE_SCHEMA4_KEY = `${KEY}:pre-schema4-backup`;
export const RESET_BACKUP_PREFIX = `${KEY}:reset-backup-`;
export const DELETED_BACKUP_PREFIX = `${KEY}:deleted-backup-`;
/** Marker on an "all accounts" export file. */
export const ALL_ACCOUNTS_KIND = 'okvSpendSmart-all-accounts';

const VIEWS: ViewName[] = ['day', 'week', 'month', 'year', 'bills', 'statistics', 'accounts'];

export interface UiPrefs {
  view: ViewName;
  selectedDate: string;
}

/** One fully separate dataset. */
export interface AccountRecord {
  id: string;
  name: string;
  /** ISO time the account was created. */
  createdAt: string;
  /** ISO time this account's data was last written. */
  savedAt: string | null;
  /** true once the setup wizard was finished / skipped / closed for this account. */
  setupDone?: boolean;
  data: AppState;
  ui: UiPrefs;
}

export interface StoredBlob {
  schema: number;
  version: number;
  savedAt: string;
  activeAccountId: string;
  accounts: AccountRecord[];
  theme: ThemeState;
}

/** Schema ≤3 wrapped blob (read-only, for migration). */
interface LegacyBlob {
  schema?: number;
  savedAt?: string;
  state?: unknown;
  theme?: unknown;
  ui?: unknown;
}

export type LoadSource = 'blob' | 'legacy' | 'seed';

export interface LoadResult {
  /** Active account's data (convenience). */
  state: AppState;
  theme: ThemeState;
  /** Active account's last view/date. */
  ui: UiPrefs;
  /** 'blob' = already schema 4; 'legacy' = migrated from an older blob/key (needs a save); 'seed' = nothing stored. */
  source: LoadSource;
  savedAt: string | null;
  accounts: AccountRecord[];
  activeAccountId: string;
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

export function newAccountId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `acct-${crypto.randomUUID()}`
    : `acct-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** "Account N" with the next free number. */
export function nextAccountName(accounts: { name: string }[]): string {
  let max = 0;
  for (const a of accounts) {
    const m = /^Account (\d+)$/.exec(a.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = Math.max(max + 1, 1);
  const names = new Set(accounts.map((a) => a.name.trim()));
  while (names.has(`Account ${n}`)) n++;
  return `Account ${n}`;
}

export function makeAccount(
  name: string,
  data: AppState = createSeedState(),
  opts: { id?: string; createdAt?: string; setupDone?: boolean; ui?: UiPrefs; savedAt?: string | null } = {},
): AccountRecord {
  return {
    id: opts.id ?? newAccountId(),
    name,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    savedAt: opts.savedAt ?? null,
    ...(opts.setupDone !== undefined ? { setupDone: opts.setupDone } : {}),
    data,
    ui: opts.ui ?? { view: 'day', selectedDate: localToday() },
  };
}

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
  const ps = (p.paySchedule ?? null) as Partial<PaySchedule> | null;
  const paySchedule: PaySchedule | null =
    ps && ['daily', 'weekly', 'biweekly', 'monthly'].includes(ps.frequency as string) && isValidYMD(ps.anchor)
      ? {
          frequency: ps.frequency as PaySchedule['frequency'],
          anchor: ps.anchor,
          ...(Number.isFinite(Number(ps.amount)) && Number(ps.amount) > 0 ? { amount: Number(ps.amount) } : {}),
        }
      : null;
  const state: AppState = {
    version: 2,
    tabs,
    columns: arr<Column>(p.columns),
    entries: arr<Entry>(p.entries).filter(
      (e) => e && typeof e === 'object' && Number.isFinite(Number(e.amount)),
    ).map((e) => ({ ...e, amount: Number(e.amount) })),
    bills: [],
    rules: arr<Rule>(p.rules),
    expectedIncome: { frequency: freq, amount: Number.isFinite(amount) && amount > 0 ? amount : 0 },
    paySchedule,
    charts: Array.isArray(p.charts) ? arr<ChartConfig>(p.charts) : seed.charts,
    lastBackupAt: typeof p.lastBackupAt === 'string' ? p.lastBackupAt : null,
    lastExportAt: typeof p.lastExportAt === 'string' ? p.lastExportAt : null,
    hasSeenWelcome: !!p.hasSeenWelcome,
    activeTabId:
      typeof p.activeTabId === 'string' && tabs.some((t) => t.id === p.activeTabId)
        ? p.activeTabId
        : (tabs[0]?.id ?? null),
  };
  // Bills: schema ≤2 per-date statuses → occurrences (idempotent for schema 3).
  state.bills = migrateBills(arr<unknown>(p.bills), state);
  return ensureExtraFundsColumn(state);
}

/** Keep one verbatim copy of a pre-schema-3 blob before the first migrated save overwrites it. */
function keepPreMigrationCopy(ls: Storage, raw: string | null, blob: LegacyBlob | null | undefined) {
  if (!raw || !blob || typeof blob !== 'object') return;
  const schema = typeof blob.schema === 'number' ? blob.schema : 0;
  const bills = ('state' in blob ? (blob.state as Record<string, unknown>)?.bills : (blob as Record<string, unknown>).bills) as unknown[] | undefined;
  const hasLegacyBills = Array.isArray(bills) && bills.some((b) => b && typeof b === 'object' && !Array.isArray((b as Record<string, unknown>).occurrences));
  if (schema >= 3 && !hasLegacyBills) return;
  try {
    if (!ls.getItem(PRE_MIGRATION_KEY)) ls.setItem(PRE_MIGRATION_KEY, raw);
  } catch {
    /* ignore quota */
  }
}

/** Keep one verbatim copy of a pre-schema-4 (single-account) blob before the first multi-account save. */
function keepPreSchema4Copy(ls: Storage, raw: string | null) {
  if (!raw) return;
  try {
    if (!ls.getItem(PRE_SCHEMA4_KEY)) ls.setItem(PRE_SCHEMA4_KEY, raw);
  } catch {
    /* ignore quota */
  }
}

function normalizeUi(raw: unknown): UiPrefs {
  const u = (raw ?? {}) as Partial<UiPrefs>;
  return {
    view: VIEWS.includes(u.view as ViewName) ? (u.view as ViewName) : 'day',
    selectedDate: isValidYMD(u.selectedDate) ? u.selectedDate : localToday(),
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Normalize a stored account list. Accounts whose data is unusable are dropped (caller keeps a copy of the raw blob). */
export function normalizeAccounts(raw: unknown): AccountRecord[] {
  const out: AccountRecord[] = [];
  const ids = new Set<string>();
  for (const r of arr<Record<string, unknown>>(raw)) {
    if (!r || typeof r !== 'object') continue;
    const data = normalizeState(r.data ?? r.state);
    if (!data) continue;
    let id = isStr(r.id) ? r.id : newAccountId();
    if (ids.has(id)) id = newAccountId();
    ids.add(id);
    out.push({
      id,
      name: isStr(r.name) && r.name.trim() ? r.name.trim() : nextAccountName(out),
      createdAt: isStr(r.createdAt) ? r.createdAt : new Date().toISOString(),
      savedAt: isStr(r.savedAt) ? r.savedAt : null,
      ...(r.setupDone === true ? { setupDone: true } : {}),
      data,
      ui: normalizeUi(r.ui),
    });
  }
  return out;
}

/** Wrap a single (schema ≤3) dataset as "Account 1". Existing data never sees the setup wizard. */
function accountFromLegacy(state: AppState, ui: UiPrefs, savedAt: string | null): AccountRecord {
  const hasData = state.entries.length > 0 || state.bills.length > 0;
  return makeAccount('Account 1', state, {
    ui,
    savedAt,
    createdAt: savedAt ?? new Date().toISOString(),
    ...(hasData ? { setupDone: true } : {}),
  });
}

function resultFor(
  accounts: AccountRecord[],
  activeId: string | undefined,
  theme: ThemeState,
  source: LoadSource,
  savedAt: string | null,
): LoadResult {
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  return {
    state: active.data,
    theme,
    ui: active.ui,
    source,
    savedAt,
    accounts,
    activeAccountId: active.id,
  };
}

/**
 * Parse any blob string (schema 4 multi-account, or an older single-account blob / bare AppState).
 * Returns null when nothing usable is inside.
 */
function interpretBlob(raw: string | null, ls: Storage | null): LoadResult | null {
  const blob = safeParse(raw) as Record<string, unknown> | null | undefined;
  if (!blob || typeof blob !== 'object') return null;
  const savedAt = isStr(blob.savedAt) ? blob.savedAt : null;
  if (Array.isArray(blob.accounts)) {
    const accounts = normalizeAccounts(blob.accounts);
    if (!accounts.length) return null;
    return resultFor(accounts, blob.activeAccountId as string, normalizeTheme(blob.theme ?? null), 'blob', savedAt);
  }
  // Schema ≤3: wrapped { schema, state, theme, ui } or (defensively) a bare AppState.
  const st = normalizeState('state' in blob ? blob.state : blob);
  if (!st) return null;
  if (ls) {
    keepPreMigrationCopy(ls, raw, blob as LegacyBlob);
    keepPreSchema4Copy(ls, raw);
  }
  const legacyTheme = ls ? safeParse(ls.getItem(LEGACY_THEME_KEY)) : null;
  const acct = accountFromLegacy(st, normalizeUi(blob.ui), savedAt);
  return resultFor([acct], acct.id, normalizeTheme(blob.theme ?? legacyTheme ?? null), 'legacy', savedAt);
}

/** Boot: READ storage first. Seeds only when nothing usable is stored. */
export function loadAll(): LoadResult {
  const ls = storage();
  const seedResult = (theme: ThemeState): LoadResult => {
    const acct = makeAccount('Account 1');
    return resultFor([acct], acct.id, theme, 'seed', null);
  };
  if (!ls) return seedResult(normalizeTheme(null));

  const blobRaw = ls.getItem(KEY);
  const fromBlob = interpretBlob(blobRaw, ls);
  if (fromBlob) return fromBlob;
  if (blobRaw) {
    // Corrupt / unusable blob: keep a copy so a seed write can never destroy it silently.
    try {
      ls.setItem(`${KEY}:corrupt-${Date.now()}`, blobRaw);
    } catch {
      /* ignore */
    }
  }

  // Legacy migration: okvSpendSmart:state + okvSpendSmart:theme
  const legacyRaw = ls.getItem(LEGACY_STATE_KEY);
  const legacyState = normalizeState(safeParse(legacyRaw));
  const legacyThemeRaw = safeParse(ls.getItem(LEGACY_THEME_KEY));
  if (legacyState) {
    keepPreMigrationCopy(ls, legacyRaw, { schema: 0, state: safeParse(legacyRaw) } as LegacyBlob);
    const acct = accountFromLegacy(legacyState, { view: 'day', selectedDate: localToday() }, null);
    return resultFor([acct], acct.id, normalizeTheme(legacyThemeRaw ?? null), 'legacy', null);
  }

  return seedResult(normalizeTheme(legacyThemeRaw ?? null));
}

/** Build the schema-4 blob object. */
export function buildBlob(accounts: AccountRecord[], activeAccountId: string, theme: ThemeState, savedAt: string): StoredBlob {
  return {
    schema: BLOB_SCHEMA,
    version: BLOB_SCHEMA,
    savedAt,
    activeAccountId: accounts.some((a) => a.id === activeAccountId) ? activeAccountId : accounts[0]?.id,
    accounts,
    theme,
  };
}

/**
 * Synchronous write of the single blob. The active account gets `savedAt` (and its
 * AppState.lastBackupAt) stamped. Returns the accounts as written.
 */
export function saveBlob(
  accounts: AccountRecord[],
  activeAccountId: string,
  theme: ThemeState,
  now = new Date(),
): { savedAt: string; accounts: AccountRecord[] } {
  const ls = storage();
  if (!ls) throw new Error('localStorage unavailable');
  if (!accounts.length) throw new Error('No accounts to save');
  const savedAt = now.toISOString();
  const stamped = accounts.map((a) =>
    a.id === activeAccountId ? { ...a, savedAt, data: { ...a.data, lastBackupAt: savedAt } } : a,
  );
  ls.setItem(KEY, JSON.stringify(buildBlob(stamped, activeAccountId, theme, savedAt)));
  return { savedAt, accounts: stamped };
}

/**
 * Back-compat single-account write: replaces the ACTIVE account's data/ui in the stored
 * blob (creating "Account 1" when nothing is stored). Returns the ISO time written.
 */
export function saveAll(state: AppState, theme: ThemeState, ui: UiPrefs, now = new Date()): string {
  const cur = loadAll();
  const accounts = cur.accounts.map((a) => (a.id === cur.activeAccountId ? { ...a, data: state, ui } : a));
  return saveBlob(accounts, cur.activeAccountId, theme, now).savedAt;
}

/** Parse a blob string written by another browser tab (storage event). */
export function parseBlob(raw: string | null): LoadResult | null {
  return interpretBlob(raw, null);
}

/** Write a verbatim backup copy (reset / delete). Returns false if storage refused it. */
export function writeBackupCopy(key: string, value: unknown): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Back-compat helpers (used by tests/tools). */
export function loadState(): AppState {
  return loadAll().state;
}

export function saveState(state: AppState): void {
  const cur = loadAll();
  saveAll(state, cur.source === 'seed' ? DEFAULT_THEME : cur.theme, cur.ui);
}

/** Single-account export: a bare AppState (+ theme, + account name) — old app versions can still import it. */
export function exportJSON(state: AppState, theme?: ThemeState, accountName?: string): string {
  return JSON.stringify({ ...state, ...(accountName ? { accountName } : {}), ...(theme ? { theme } : {}) }, null, 2);
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
    paySchedule: current.paySchedule ?? incoming.paySchedule ?? null,
    lastBackupAt: current.lastBackupAt,
    hasSeenWelcome: current.hasSeenWelcome || incoming.hasSeenWelcome,
  };
}

export function parseImport(raw: string): AppState | null {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (Array.isArray(p.accounts)) {
    // An all-accounts export / schema-4 blob: the single-account path takes its active account.
    const multi = parseImportAccounts(raw);
    if (!multi) return null;
    return (multi.accounts.find((a) => a.id === multi.activeAccountId) ?? multi.accounts[0]).data;
  }
  // Accept an export (bare AppState) or a raw storage blob ({ state: … }).
  return normalizeState('state' in p && !('tabs' in p) ? p.state : p);
}

/** Accounts inside an all-accounts export (or a raw schema-4 blob). null for a single-account file. */
export function parseImportAccounts(raw: string): { accounts: AccountRecord[]; activeAccountId: string | null } | null {
  const parsed = safeParse(raw) as Record<string, unknown> | null | undefined;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accounts)) return null;
  const accounts = normalizeAccounts(parsed.accounts);
  if (!accounts.length) return null;
  return { accounts, activeAccountId: isStr(parsed.activeAccountId) ? parsed.activeAccountId : null };
}

/** All accounts as one JSON file (OKV-Spend-Smart-backup-all-accounts.json). */
export function exportAllJSON(accounts: AccountRecord[], activeAccountId: string, theme: ThemeState): string {
  return JSON.stringify(
    {
      app: 'OKV Spend Smart',
      kind: ALL_ACCOUNTS_KIND,
      schema: BLOB_SCHEMA,
      exportedAt: new Date().toISOString(),
      activeAccountId,
      accounts,
      theme,
    },
    null,
    2,
  );
}

/** Theme embedded in an exported JSON, if any. */
export function parseImportTheme(raw: string): ThemeState | null {
  const parsed = safeParse(raw) as Record<string, unknown> | null | undefined;
  if (!parsed || typeof parsed !== 'object' || !parsed.theme) return null;
  return normalizeTheme(parsed.theme);
}

export { KEY, LEGACY_STATE_KEY, LEGACY_THEME_KEY, PRE_MIGRATION_KEY, PRE_SCHEMA4_KEY };
