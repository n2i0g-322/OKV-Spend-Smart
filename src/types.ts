export type ViewName = 'day' | 'week' | 'month' | 'year' | 'bills' | 'statistics';

export type EntryType = 'income' | 'expense' | 'refund';
export type EntrySource = 'grid' | 'quick-add' | 'add-funds' | 'bills-overview' | 'split' | 'bill-paid';

export type BudgetPeriod = 'week' | 'month';
export type ExpectedFrequency = 'daily' | 'monthly' | 'yearly';
export type BillFrequency = 'weekly' | 'monthly' | 'yearly' | 'once';
/** Legacy (schema ≤2) per-date status. Only read during migration. */
export type LegacyBillStatus = 'upcoming' | 'due' | 'paid' | 'skipped' | 'overdue';
/** Status shown everywhere for a bill occurrence. `due`/`overdue` are derived from today's local date. */
export type OccurrenceStatus = 'scheduled' | 'due' | 'overdue' | 'paid' | 'skipped' | 'cancelled';
/** Status the user committed. `scheduled` = still open (becomes due/overdue by date). */
export type StoredOccurrenceStatus = 'scheduled' | 'due' | 'paid' | 'skipped' | 'cancelled';
/** @deprecated alias kept for older imports. */
export type BillStatus = OccurrenceStatus;

export type BillLogAction =
  | 'created'
  | 'scheduled'
  | 'marked-due'
  | 'marked-overdue'
  | 'paid-recorded'
  | 'paid-reminder-only'
  | 'skipped'
  | 'cancelled'
  | 'manual-blocked-similar'
  | 'linked-manual'
  | 'user-corrected';

export interface BillLogEntry {
  /** ISO timestamp of the action. */
  at: string;
  action: BillLogAction;
  occurrenceId?: string;
  dueDate?: string;
  entryId?: string;
  amount?: number;
  note?: string;
}

/** A single due date of a bill. Persisted only when it has non-default state. */
export interface BillOccurrence {
  occurrenceId: string; // `${billId}:${dueDate}`
  billId: string;
  dueDate: string; // YYYY-MM-DD local
  status: StoredOccurrenceStatus;
  linkedEntryId: string | null;
  /** Extra payments the user explicitly added on top of the linked one ("Add another payment"). */
  extraEntryIds?: string[];
  /** ISO time the occurrence was marked paid. */
  paidAt?: string | null;
}

export type PayFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** Payday markers (planning only — never income). */
export interface PaySchedule {
  frequency: PayFrequency;
  anchor: string; // YYYY-MM-DD local
}

export type MatchType = 'contains' | 'starts with' | 'exact';
export type RuleAppliesTo = 'expenses' | 'income' | 'both';

export type ChartType = 'pie' | 'bar' | 'line';
export type ChartMetric = 'spent' | 'saved' | 'income';
export type ChartGroupBy = 'tab' | 'column' | 'day' | 'week' | 'month';
export type ChartRange =
  | 'this week'
  | 'last week'
  | 'last 3 weeks'
  | 'this month'
  | 'last month'
  | 'last 3 months'
  | 'last 12 months'
  | 'this year'
  | 'last year'
  | 'last 3 years';

export interface Budget {
  period: BudgetPeriod;
  limit: number;
}

export interface Tab {
  id: string;
  name: string;
  color: string;
  isIncome: boolean;
  isSystem?: boolean; // Uncategorized
  order: number;
  budget?: Budget;
}

export interface Column {
  id: string;
  tabId: string;
  name: string;
  color: string;
  order: number;
  budget?: Budget;
}

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD local
  tabId: string;
  columnId: string;
  amount: number; // positive
  type: EntryType;
  memo: string;
  source: EntrySource;
  /** Set on entries created by "Mark paid → Record payment" (source bill-paid). */
  billId?: string;
  occurrenceId?: string;
}

export interface Bill {
  id: string;
  name: string;
  columnId?: string;
  amountExpected: number;
  dueDay: number; // 1–31, or weekday 0–6 if weekly (Monday=1…Sunday=0 convention: we store Mon=1…Sun=7)
  frequency: BillFrequency;
  nextDueDate: string;
  payee: string;
  payMethod: string;
  payUrl: string;
  notes: string;
  color: string;
  /** Persisted occurrences (any with non-default status, link, or log). */
  occurrences: BillOccurrence[];
  /** Append-only action log. */
  log: BillLogEntry[];
  /** Original schema-2 per-date statuses, kept verbatim after migration (never deleted). */
  legacyStatusByDate?: Record<string, LegacyBillStatus>;
}

export interface Rule {
  id: string;
  name: string;
  matchField: 'memo';
  matchType: MatchType;
  matchValue: string;
  destinationTabId: string;
  destinationColumnId: string;
  appliesTo: RuleAppliesTo;
  priority: number;
  enabled: boolean;
}

export interface ExpectedIncome {
  frequency: ExpectedFrequency;
  amount: number;
}

export interface ChartConfig {
  id: string;
  name: string;
  type: ChartType;
  metric: ChartMetric;
  groupBy: ChartGroupBy;
  range: ChartRange;
}

export interface AppState {
  version: 2;
  tabs: Tab[];
  columns: Column[];
  entries: Entry[];
  bills: Bill[];
  rules: Rule[];
  expectedIncome: ExpectedIncome;
  /** Payday marker schedule (Box 3 settings / day-click checkbox). null = only real income dates. */
  paySchedule: PaySchedule | null;
  charts: ChartConfig[];
  /** ISO timestamp of the last successful save of the app blob (shown as "Saved …"). */
  lastBackupAt: string | null;
  /** ISO timestamp of the last Export JSON/CSV download (drives the 14-day export reminder). */
  lastExportAt?: string | null;
  hasSeenWelcome: boolean;
  activeTabId: string | null;
}
