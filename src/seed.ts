import type { AppState, ChartConfig, Column, Tab } from './types';

function id(): string {
  return crypto.randomUUID();
}

const COLORS = {
  bills: '#ef4444',
  food: '#22c55e',
  entertainment: '#a855f7',
  social: '#ec4899',
  gas: '#f59e0b',
  work: '#3b82f6',
  income: '#10b981',
  uncategorized: '#94a3b8',
};

export function createSeedState(): AppState {
  const tabs: Tab[] = [
    { id: id(), name: 'Bills', color: COLORS.bills, isIncome: false, order: 0 },
    { id: id(), name: 'Food', color: COLORS.food, isIncome: false, order: 1 },
    { id: id(), name: 'Entertainment', color: COLORS.entertainment, isIncome: false, order: 2 },
    { id: id(), name: 'Social', color: COLORS.social, isIncome: false, order: 3 },
    { id: id(), name: 'Gas', color: COLORS.gas, isIncome: false, order: 4 },
    { id: id(), name: 'Work', color: COLORS.work, isIncome: false, order: 5 },
    { id: id(), name: 'Income', color: COLORS.income, isIncome: true, order: 6 },
    {
      id: id(),
      name: 'Uncategorized',
      color: COLORS.uncategorized,
      isIncome: false,
      isSystem: true,
      order: 7,
    },
  ];

  const food = tabs.find((t) => t.name === 'Food')!;
  const income = tabs.find((t) => t.name === 'Income')!;

  const columns: Column[] = [
    { id: id(), tabId: food.id, name: 'Groceries', color: '#16a34a', order: 0 },
    { id: id(), tabId: food.id, name: 'Coffee', color: '#92400e', order: 1 },
    { id: id(), tabId: food.id, name: 'Restaurants', color: '#ea580c', order: 2 },
    { id: id(), tabId: income.id, name: 'Extra funds', color: '#059669', order: 0 },
  ];

  const charts: ChartConfig[] = [
    {
      id: id(),
      name: 'Spent per day',
      type: 'bar',
      metric: 'spent',
      groupBy: 'day',
      range: 'this week',
    },
    {
      id: id(),
      name: 'Saved per day',
      type: 'bar',
      metric: 'saved',
      groupBy: 'day',
      range: 'this week',
    },
    {
      id: id(),
      name: 'Spend by tab',
      type: 'pie',
      metric: 'spent',
      groupBy: 'tab',
      range: 'this week',
    },
  ];

  return {
    version: 2,
    tabs,
    columns,
    entries: [],
    bills: [],
    rules: [],
    expectedIncome: { frequency: 'monthly', amount: 0 },
    paySchedule: null,
    charts,
    lastBackupAt: null,
    hasSeenWelcome: false,
    activeTabId: food.id,
  };
}

export function ensureExtraFundsColumn(state: AppState): AppState {
  const income = state.tabs.find((t) => t.isIncome && t.name === 'Income');
  if (!income) return state;
  const has = state.columns.some(
    (c) => c.tabId === income.id && c.name === 'Extra funds',
  );
  if (has) return state;
  return {
    ...state,
    columns: [
      ...state.columns,
      {
        id: crypto.randomUUID(),
        tabId: income.id,
        name: 'Extra funds',
        color: '#059669',
        order: state.columns.filter((c) => c.tabId === income.id).length,
      },
    ],
  };
}

export function getUncategorizedTab(state: AppState) {
  return state.tabs.find((t) => t.isSystem || t.name === 'Uncategorized')!;
}

export function getOrCreateUncategorizedColumn(state: AppState): {
  state: AppState;
  columnId: string;
} {
  const tab = getUncategorizedTab(state);
  let col = state.columns.find((c) => c.tabId === tab.id);
  if (col) return { state, columnId: col.id };
  col = {
    id: crypto.randomUUID(),
    tabId: tab.id,
    name: 'General',
    color: tab.color,
    order: 0,
  };
  return { state: { ...state, columns: [...state.columns, col] }, columnId: col.id };
}
