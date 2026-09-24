import type { AppState, Entry, Rule } from './types';
import { getOrCreateUncategorizedColumn, getUncategorizedTab } from './seed';

function matches(rule: Rule, memo: string): boolean {
  const m = memo.toLowerCase();
  const v = rule.matchValue.toLowerCase();
  if (!v) return false;
  if (rule.matchType === 'contains') return m.includes(v);
  if (rule.matchType === 'starts with') return m.startsWith(v);
  return m === v;
}

export function findMatchingRule(
  rules: Rule[],
  memo: string,
  kind: 'expense' | 'income',
): Rule | null {
  const applicable = rules
    .filter((r) => r.enabled)
    .filter((r) => {
      if (r.appliesTo === 'both') return true;
      if (r.appliesTo === 'expenses') return kind === 'expense';
      return kind === 'income';
    })
    .filter((r) => matches(r, memo))
    .sort((a, b) => a.priority - b.priority);
  return applicable[0] ?? null;
}

export function applyRuleDestination(
  state: AppState,
  rule: Rule | null,
  kind: 'expense' | 'income',
): { tabId: string; columnId: string; state: AppState; ruled: boolean; label?: string } {
  if (rule) {
    const tab = state.tabs.find((t) => t.id === rule.destinationTabId);
    const col = state.columns.find((c) => c.id === rule.destinationColumnId);
    if (tab && col) {
      return {
        tabId: tab.id,
        columnId: col.id,
        state,
        ruled: true,
        label: `${tab.name} → ${col.name}`,
      };
    }
  }
  if (kind === 'income') {
    const income = state.tabs.find((t) => t.isIncome);
    const extra = state.columns.find(
      (c) => c.tabId === income?.id && c.name === 'Extra funds',
    );
    if (income && extra) {
      return { tabId: income.id, columnId: extra.id, state, ruled: false };
    }
  }
  const { state: s2, columnId } = getOrCreateUncategorizedColumn(state);
  const tab = getUncategorizedTab(s2);
  return { tabId: tab.id, columnId, state: s2, ruled: false };
}

export function applyRulesToUncategorized(state: AppState): {
  state: AppState;
  count: number;
} {
  const unc = getUncategorizedTab(state);
  let count = 0;
  const entries: Entry[] = state.entries.map((e) => {
    if (e.tabId !== unc.id) return e;
    const kind = e.type === 'income' ? 'income' : 'expense';
    const rule = findMatchingRule(state.rules, e.memo, kind);
    if (!rule) return e;
    const tab = state.tabs.find((t) => t.id === rule.destinationTabId);
    const col = state.columns.find((c) => c.id === rule.destinationColumnId);
    if (!tab || !col) return e;
    count++;
    return { ...e, tabId: tab.id, columnId: col.id };
  });
  return { state: { ...state, entries }, count };
}

export function testRuleMemo(
  rules: Rule[],
  memo: string,
  kind: 'expense' | 'income',
): Rule | null {
  return findMatchingRule(rules, memo, kind);
}
