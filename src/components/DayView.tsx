import { useEffect, useMemo, useState } from 'react';
import type { AppState, Column, Entry, Tab } from '../types';
import { formatMoney } from '../date';
import {
  columnTotalForDate,
  filterByDate,
  filterByTab,
  incomeAmount,
  netSaved,
  spentAmount,
} from '../money';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ChipWithMenu } from './ChipWithMenu';
import { QuickAdd } from './QuickAdd';

interface Props {
  state: AppState;
  selectedDate: string;
  highlightEntryId: string | null;
  dueTodayCount: number;
  dueTodayLabel: string;
  onState: (s: AppState) => void;
  onQuickAdd: (amount: number, memo: string, date: string) => void;
  onOpenBillsDay: () => void;
  onSplit: (entry: Entry) => void;
  onRequestDeleteTab: (tab: Tab) => void;
  onRequestDeleteColumn: (col: Column) => void;
  pushUndo: () => void;
}

export function DayView({
  state,
  selectedDate,
  highlightEntryId,
  dueTodayCount,
  dueTodayLabel,
  onState,
  onQuickAdd,
  onOpenBillsDay,
  onSplit,
  onRequestDeleteTab,
  onRequestDeleteColumn,
  pushUndo,
}: Props) {
  const activeTab =
    state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  const columns = state.columns
    .filter((c) => c.tabId === activeTab?.id)
    .sort((a, b) => a.order - b.order);
  const dayEntries = filterByDate(state.entries, selectedDate);
  const tabEntries = filterByTab(dayEntries, activeTab?.id ?? '');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});

  const tabTotal = useMemo(() => {
    if (!activeTab) return 0;
    if (activeTab.isIncome) return incomeAmount(tabEntries);
    return spentAmount(tabEntries);
  }, [activeTab, tabEntries]);

  const dayIncome = incomeAmount(dayEntries);
  const daySpend = spentAmount(dayEntries);
  const dayNet = netSaved(dayEntries);

  const setActive = (id: string) => onState({ ...state, activeTabId: id });

  const addTab = () => {
    const name = prompt('Tab name?');
    if (!name?.trim()) return;
    const color = prompt('Color (hex)?', '#6366f1') || '#6366f1';
    pushUndo();
    const tab: Tab = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color,
      isIncome: false,
      order: state.tabs.length,
    };
    onState({ ...state, tabs: [...state.tabs, tab], activeTabId: tab.id });
  };

  const addColumn = () => {
    if (!activeTab) return;
    const name = prompt('Column name?');
    if (!name?.trim()) return;
    const color = prompt('Color (hex)?', activeTab.color) || activeTab.color;
    pushUndo();
    const col: Column = {
      id: crypto.randomUUID(),
      tabId: activeTab.id,
      name: name.trim(),
      color,
      order: columns.length,
    };
    onState({ ...state, columns: [...state.columns, col] });
  };

  const commitLine = (columnId: string, raw: string, memo = '') => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !activeTab) return;
    pushUndo();
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: selectedDate,
      tabId: activeTab.id,
      columnId,
      amount: Math.round(n * 100) / 100,
      type: activeTab.isIncome ? 'income' : 'expense',
      memo,
      source: 'grid',
    };
    onState({ ...state, entries: [...state.entries, entry] });
    setDraftAmounts((d) => ({ ...d, [columnId]: '' }));
    setExpanded((e) => ({ ...e, [columnId]: true }));
  };

  const updateEntry = (id: string, patch: Partial<Entry>) => {
    const cur = state.entries.find((e) => e.id === id);
    if (!cur) return;
    // skip no-op commits (keeps undo history clean)
    if (Object.entries(patch).every(([k, v]) => cur[k as keyof Entry] === v)) return;
    pushUndo();
    onState({
      ...state,
      entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  };

  const deleteEntry = (id: string) => {
    pushUndo();
    onState({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  };

  const moveTab = (tab: Tab, dir: -1 | 1) => {
    const sorted = [...state.tabs].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((t) => t.id === tab.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    pushUndo();
    const a = sorted[i];
    const b = sorted[j];
    const tabs = state.tabs.map((t) => {
      if (t.id === a.id) return { ...t, order: b.order };
      if (t.id === b.id) return { ...t, order: a.order };
      return t;
    });
    onState({ ...state, tabs });
  };

  const moveCol = (col: Column, dir: -1 | 1) => {
    const sorted = [...columns];
    const i = sorted.findIndex((c) => c.id === col.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    pushUndo();
    const a = sorted[i];
    const b = sorted[j];
    const cols = state.columns.map((c) => {
      if (c.id === a.id) return { ...c, order: b.order };
      if (c.id === b.id) return { ...c, order: a.order };
      return c;
    });
    onState({ ...state, columns: cols });
  };

  const tabMenu = (tab: Tab, x: number, y: number) => {
    const items: MenuItem[] = [
      {
        label: 'Rename',
        onClick: () => {
          const name = prompt('Rename tab', tab.name);
          if (!name?.trim()) return;
          pushUndo();
          onState({
            ...state,
            tabs: state.tabs.map((t) =>
              t.id === tab.id ? { ...t, name: name.trim() } : t,
            ),
          });
        },
      },
      {
        label: 'Change color',
        onClick: () => {
          const color = prompt('Color (hex)', tab.color);
          if (!color) return;
          pushUndo();
          onState({
            ...state,
            tabs: state.tabs.map((t) => (t.id === tab.id ? { ...t, color } : t)),
          });
        },
      },
      { label: 'Move up', onClick: () => moveTab(tab, -1) },
      { label: 'Move down', onClick: () => moveTab(tab, 1) },
      {
        label: 'Delete',
        danger: true,
        disabled: !!tab.isSystem,
        onClick: () => onRequestDeleteTab(tab),
      },
    ];
    setMenu({ x, y, items });
  };

  const colMenu = (col: Column, x: number, y: number) => {
    setMenu({
      x,
      y,
      items: [
        {
          label: 'Rename',
          onClick: () => {
            const name = prompt('Rename column', col.name);
            if (!name?.trim()) return;
            pushUndo();
            onState({
              ...state,
              columns: state.columns.map((c) =>
                c.id === col.id ? { ...c, name: name.trim() } : c,
              ),
            });
          },
        },
        {
          label: 'Change color',
          onClick: () => {
            const color = prompt('Color (hex)', col.color);
            if (!color) return;
            pushUndo();
            onState({
              ...state,
              columns: state.columns.map((c) =>
                c.id === col.id ? { ...c, color } : c,
              ),
            });
          },
        },
        {
          label: 'Set soft budget',
          onClick: () => {
            const limit = prompt('Monthly limit ($)', String(col.budget?.limit ?? ''));
            if (limit == null) return;
            const n = Number(limit);
            pushUndo();
            onState({
              ...state,
              columns: state.columns.map((c) =>
                c.id === col.id
                  ? {
                      ...c,
                      budget:
                        Number.isFinite(n) && n > 0
                          ? { period: 'month', limit: n }
                          : undefined,
                    }
                  : c,
              ),
            });
          },
        },
        { label: 'Move up', onClick: () => moveCol(col, -1) },
        { label: 'Move down', onClick: () => moveCol(col, 1) },
        {
          label: 'Delete',
          danger: true,
          onClick: () => onRequestDeleteColumn(col),
        },
      ],
    });
  };

  const budgetBar = (col: Column) => {
    if (!col.budget) return null;
    // soft budget for selected month period — approximate with day total * rough; use month spent
    const monthStart = selectedDate.slice(0, 7);
    const spent = spentAmount(
      state.entries.filter(
        (e) => e.columnId === col.id && e.date.startsWith(monthStart),
      ),
    );
    const pct = Math.min(100, (spent / col.budget.limit) * 100);
    const over = spent > col.budget.limit;
    return (
      <div className={`budget-bar${over ? ' over' : ''}`}>
        <div className="budget-fill" style={{ width: `${pct}%` }} />
        <span>
          {formatMoney(spent)} / {formatMoney(col.budget.limit)}
        </span>
      </div>
    );
  };

  return (
    <div className="day-view">
      <QuickAdd defaultDate={selectedDate} onAdd={onQuickAdd} />

      <div className="box5">
        <div className="tabs-row">
          {state.tabs
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((tab) => (
                <ChipWithMenu
                  key={tab.id}
                  className="tab-chip-wrap"
                  onMenu={(x, y) => tabMenu(tab, x, y)}
                >
                  <button
                    type="button"
                    className={`tab-chip${activeTab?.id === tab.id ? ' active' : ''}`}
                    style={
                      activeTab?.id === tab.id
                        ? { background: tab.color, borderColor: tab.color, color: '#fff' }
                        : { borderColor: tab.color, color: tab.color }
                    }
                    onClick={() => setActive(tab.id)}
                  >
                    {tab.name}
                  </button>
                  <button
                    type="button"
                    className="icon-btn tiny"
                    aria-label="Tab menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      tabMenu(tab, e.clientX, e.clientY);
                    }}
                  >
                    ⋯
                  </button>
                </ChipWithMenu>
              ))}
          <button type="button" className="tab-chip add" onClick={addTab}>
            +
          </button>
        </div>
        {dueTodayCount > 0 && (
          <button type="button" className="due-chip" onClick={onOpenBillsDay}>
            Due today · {dueTodayLabel}
          </button>
        )}
      </div>

      <div className="day-body">
        <aside className="box6">
          <h3>{activeTab?.name ?? 'Columns'}</h3>
          <ul className="col-list">
            {columns.map((col) => (
                <ChipWithMenu
                  key={col.id}
                  as="li"
                  className="col-item"
                  onMenu={(x, y) => colMenu(col, x, y)}
                >
                  <span className="dot" style={{ background: col.color }} />
                  <span>{col.name}</span>
                  <button
                    type="button"
                    className="icon-btn tiny"
                    onClick={(e) => colMenu(col, e.clientX, e.clientY)}
                  >
                    ⋯
                  </button>
                  {budgetBar(col)}
                </ChipWithMenu>
              ))}
          </ul>
          <button type="button" className="add-col" onClick={addColumn}>
            + Add column
          </button>
          {activeTab?.budget && (
            <div className="budget-bar">
              <span>
                Tab budget {formatMoney(activeTab.budget.limit)} / {activeTab.budget.period}
              </span>
            </div>
          )}
        </aside>

        <section className="day-grid">
          <div className="grid-head">
            <span>CAD totals</span>
            <span style={{ color: activeTab?.color }}>
              {activeTab?.name} {formatMoney(tabTotal)}
            </span>
          </div>
          <div className="grid-meta">
            Day income {formatMoney(dayIncome)} · expenses {formatMoney(daySpend)} · net{' '}
            {formatMoney(dayNet)}
          </div>
          {columns.length === 0 && (
            <p className="muted">Add a column to start entering amounts.</p>
          )}
          {columns.map((col) => {
            const total = columnTotalForDate(state.entries, col.id, selectedDate);
            const lines = dayEntries.filter((e) => e.columnId === col.id);
            const open = expanded[col.id] ?? lines.length > 0;
            return (
              <div key={col.id} className="grid-row">
                <button
                  type="button"
                  className="row-toggle"
                  onClick={() => setExpanded((e) => ({ ...e, [col.id]: !open }))}
                >
                  <span className="dot" style={{ background: col.color }} />
                  <strong>{col.name}</strong>
                  <span>{formatMoney(total)}</span>
                  <span className="chev">{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div className="row-lines">
                    {lines.map((e) => (
                      <div
                        key={e.id}
                        className={`line${highlightEntryId === e.id ? ' highlight' : ''}`}
                      >
                        <CommitInput
                          type="number"
                          value={e.amount.toFixed(2)}
                          onCommit={(raw) => {
                            const n = Number(raw);
                            // amounts must stay positive; invalid/0 reverts instead of saving $0
                            if (!Number.isFinite(n) || n <= 0) return false;
                            updateEntry(e.id, { amount: Math.round(n * 100) / 100 });
                            return true;
                          }}
                        />
                        <CommitInput
                          type="text"
                          value={e.memo}
                          placeholder="Memo"
                          onCommit={(raw) => {
                            updateEntry(e.id, { memo: raw });
                            return true;
                          }}
                        />
                        {activeTab?.isIncome ? (
                          <span className="muted tiny">{e.type}</span>
                        ) : (
                          <select
                            className="type-select"
                            value={e.type === 'refund' ? 'refund' : 'expense'}
                            aria-label="Entry type"
                            title="Refund reduces this column's spend (it is not income)"
                            onChange={(ev) =>
                              updateEntry(e.id, { type: ev.target.value as Entry['type'] })
                            }
                          >
                            <option value="expense">expense</option>
                            <option value="refund">refund</option>
                          </select>
                        )}
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => onSplit(e)}
                        >
                          Split
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => deleteEntry(e.id)}
                          aria-label="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div className="line new">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={draftAmounts[col.id] ?? ''}
                        onChange={(e) =>
                          setDraftAmounts((d) => ({ ...d, [col.id]: e.target.value }))
                        }
                        onBlur={(e) => commitLine(col.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            commitLine(col.id, (e.target as HTMLInputElement).value);
                        }}
                      />
                      <span className="muted">Add line — blur or Enter</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

/** Text/number input that keeps a local draft and commits on blur or Enter (Esc reverts). */
function CommitInput({
  type,
  value,
  placeholder,
  onCommit,
}: {
  type: 'text' | 'number';
  value: string;
  placeholder?: string;
  onCommit: (raw: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft === value) return;
    if (!onCommit(draft)) setDraft(value);
  };
  return (
    <input
      type={type}
      step={type === 'number' ? '0.01' : undefined}
      min={type === 'number' ? '0' : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}
