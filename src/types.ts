export type ViewName = 'day' | 'week' | 'month' | 'year' | 'bills' | 'statistics';

export type EntryType = 'income' | 'expense' | 'refund';
export type EntrySource = 'grid' | 'quick-add' | 'add-funds' | 'bills-overview' | 'split';

export type BudgetPeriod = 'week' | 'month';
export type ExpectedFrequency = 'daily' | 'monthly' | 'yearly';
export type BillFrequency = 'weekly' | 'monthly' | 'yearly' | 'once';
export type BillStatus = 'upcoming' | 'due' | 'paid' | 'skipped' | 'overdue';

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
  statusByDate: Record<string, BillStatus>;
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
  version: 1;
  tabs: Tab[];
  columns: Column[];
  entries: Entry[];
  bills: Bill[];
  rules: Rule[];
  expectedIncome: ExpectedIncome;
  charts: ChartConfig[];
  lastBackupAt: string | null; // ISO timestamp
  hasSeenWelcome: boolean;
  activeTabId: string | null;
}
