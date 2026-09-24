import { useMemo, useState } from 'react';
import type { AppState, Bill, BillFrequency, BillStatus, Entry } from '../types';
import {
  addDays,
  eachDay,
  formatMoney,
  formatMonthYear,
  formatShortDate,
  localToday,
  monthBounds,
  monthCalendarGrid,
  parseLocalDate,
  toYMD,
  weekRangeMonSun,
  weekdayMon0,
} from '../date';
import { paydayMarkersInRange } from '../money';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ChipWithMenu } from './ChipWithMenu';
import { Modal } from './Modal';

type BillsSub = 'month' | 'week' | 'day';

interface Props {
  state: AppState;
  selectedDate: string;
  onState: (s: AppState) => void;
  onDate: (d: string) => void;
  onAddFunds: (date: string) => void;
  pushUndo: () => void;
  forceDay?: boolean;
}

function statusFor(bill: Bill, date: string): BillStatus {
  const stored = bill.statusByDate[date];
  if (stored) return stored;
  const today = localToday();
  if (date < today && date === bill.nextDueDate) return 'overdue';
  if (date === today && (date === bill.nextDueDate || dueOn(bill, date))) return 'due';
  if (dueOn(bill, date)) return date < today ? 'overdue' : 'upcoming';
  return 'upcoming';
}

function dueOn(bill: Bill, date: string): boolean {
  if (bill.frequency === 'once') return bill.nextDueDate === date;
  if (bill.frequency === 'monthly') {
    const day = parseLocalDate(date).getDate();
    const dim = new Date(
      parseLocalDate(date).getFullYear(),
      parseLocalDate(date).getMonth() + 1,
      0,
    ).getDate();
    return day === Math.min(bill.dueDay, dim);
  }
  if (bill.frequency === 'weekly') {
    // dueDay 1=Mon … 7=Sun
    const mon0 = weekdayMon0(date); // 0=Mon
    return mon0 + 1 === bill.dueDay;
  }
  if (bill.frequency === 'yearly') {
    const d = parseLocalDate(date);
    const n = parseLocalDate(bill.nextDueDate);
    return d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  return false;
}

function billsOnDate(bills: Bill[], date: string): Bill[] {
  return bills.filter((b) => dueOn(b, date) || b.statusByDate[date] === 'overdue');
}

function openOverdue(bills: Bill[], asOf: string): Bill[] {
  const today = localToday();
  return bills.filter((b) => {
    // show overdue items that are still open relative to asOf
    if (b.nextDueDate < asOf && !['paid', 'skipped'].includes(b.statusByDate[b.nextDueDate] ?? '')) {
      if (b.nextDueDate < today) return true;
    }
    // also any date status overdue
    return Object.entries(b.statusByDate).some(
      ([d, s]) => s === 'overdue' && d <= asOf && d !== asOf,
    );
  });
}

export function BillsView({
  state,
  selectedDate,
  onState,
  onDate,
  onAddFunds,
  pushUndo,
  forceDay,
}: Props) {
  const [sub, setSub] = useState<BillsSub>(forceDay ? 'day' : 'month');
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);
  const [recordPrompt, setRecordPrompt] = useState<{
    bill: Bill;
    date: string;
  } | null>(null);
  const [paydayNote, setPaydayNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );

  const month = monthBounds(selectedDate);
  const week = weekRangeMonSun(selectedDate);
  const grid = monthCalendarGrid(selectedDate);

  const incomeDates = useMemo(
    () =>
      state.entries.filter((e) => e.type === 'income').map((e) => e.date),
    [state.entries],
  );

  const paydays = useMemo(
    () =>
      paydayMarkersInRange(
        state.expectedIncome,
        sub === 'week' ? week.start : month.start,
        sub === 'week' ? week.end : month.end,
        incomeDates,
      ),
    [state.expectedIncome, month, week, incomeDates, sub],
  );

  const billsTab = state.tabs.find((t) => t.name === 'Bills' && !t.isIncome);
  const billColumns = state.columns.filter((c) => c.tabId === billsTab?.id);

  const saveBill = () => {
    if (!editing?.name || !editing.nextDueDate) return;
    pushUndo();
    if (editing.id) {
      onState({
        ...state,
        bills: state.bills.map((b) =>
          b.id === editing.id ? ({ ...b, ...editing } as Bill) : b,
        ),
      });
    } else {
      const bill: Bill = {
        id: crypto.randomUUID(),
        name: editing.name!,
        columnId: editing.columnId,
        amountExpected: Number(editing.amountExpected) || 0,
        dueDay: editing.dueDay ?? parseLocalDate(editing.nextDueDate!).getDate(),
        frequency: (editing.frequency as BillFrequency) || 'monthly',
        nextDueDate: editing.nextDueDate!,
        payee: editing.payee ?? '',
        payMethod: editing.payMethod ?? '',
        payUrl: editing.payUrl ?? '',
        notes: editing.notes ?? '',
        color: editing.color ?? '#ef4444',
        statusByDate: {},
      };
      onState({ ...state, bills: [...state.bills, bill] });
    }
    setEditing(null);
  };

  const setStatus = (bill: Bill, date: string, status: BillStatus) => {
    pushUndo();
    const next = {
      ...bill,
      statusByDate: { ...bill.statusByDate, [date]: status },
    };
    onState({
      ...state,
      bills: state.bills.map((b) => (b.id === bill.id ? next : b)),
    });
    if (status === 'paid') {
      setRecordPrompt({ bill: next, date });
    }
  };

  const recordExpense = (bill: Bill, date: string) => {
    let columns = state.columns;
    let columnId = bill.columnId;
    let tabs = state.tabs;
    let tabId = billsTab?.id;
    if (!tabId) {
      // should exist from seed
      return;
    }
    if (!columnId) {
      const existing = columns.find((c) => c.tabId === tabId && c.name === bill.name);
      if (existing) columnId = existing.id;
      else {
        columnId = crypto.randomUUID();
        columns = [
          ...columns,
          {
            id: columnId,
            tabId,
            name: bill.name,
            color: bill.color,
            order: columns.filter((c) => c.tabId === tabId).length,
          },
        ];
      }
    }
    pushUndo();
    const entry: Entry = {
      id: crypto.randomUUID(),
      date,
      tabId,
      columnId,
      amount: bill.amountExpected,
      type: 'expense',
      memo: bill.name,
      source: 'bills-overview',
    };
    onState({ ...state, columns, tabs, entries: [...state.entries, entry] });
    setRecordPrompt(null);
  };

  const billMenu = (bill: Bill, x: number, y: number) => {
    setMenu({
      x,
      y,
      items: [
        { label: 'Edit', onClick: () => setEditing(bill) },
        {
          label: 'Delete',
          danger: true,
          onClick: () => {
            if (!confirm(`Delete bill “${bill.name}?`)) return;
            pushUndo();
            onState({ ...state, bills: state.bills.filter((b) => b.id !== bill.id) });
          },
        },
      ],
    });
  };

  const dayBills = [
    ...billsOnDate(state.bills, selectedDate),
    ...openOverdue(state.bills, selectedDate).filter(
      (b) => !billsOnDate(state.bills, selectedDate).some((x) => x.id === b.id),
    ),
  ];

  return (
    <div className="bills-view">
      <div className="bills-subnav">
        {(['month', 'week', 'day'] as BillsSub[]).map((s) => (
          <button
            key={s}
            type="button"
            className={sub === s ? 'active' : ''}
            onClick={() => setSub(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button type="button" className="btn primary sm" onClick={() => setEditing({
          name: '',
          amountExpected: 0,
          frequency: 'monthly',
          nextDueDate: selectedDate,
          dueDay: parseLocalDate(selectedDate).getDate(),
          payee: '',
          payMethod: '',
          payUrl: '',
          notes: '',
          color: '#ef4444',
        })}>
          + Add bill
        </button>
      </div>

      {sub === 'month' && (
        <div className="bills-calendar card">
          <h3>{formatMonthYear(selectedDate)}</h3>
          <div className="cal-head">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {grid.flat().map((cell, i) => {
              if (!cell) return <div key={`e${i}`} className="cal-cell empty" />;
              const bills = billsOnDate(state.bills, cell);
              const isPayday = paydays.includes(cell);
              const overdue = bills.filter((b) => statusFor(b, cell) === 'overdue').length;
              return (
                <div
                  key={cell}
                  className={`cal-cell${cell === localToday() ? ' today' : ''}`}
                  onClick={() => {
                    onDate(cell);
                    setSub('day');
                  }}
                >
                  <span className="cal-day">{parseLocalDate(cell).getDate()}</span>
                  {isPayday && (
                    <button
                      type="button"
                      className="chip payday"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaydayNote(cell);
                      }}
                    >
                      Payday
                    </button>
                  )}
                  {bills.map((b) => (
                    <ChipWithMenu
                      key={b.id}
                      className="chip bill"
                      onMenu={(x, y) => billMenu(b, x, y)}
                    >
                      <button
                        type="button"
                        style={{ background: `${b.color}22`, color: b.color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDate(cell);
                          setSub('day');
                        }}
                      >
                        {b.name} {formatMoney(b.amountExpected)}
                      </button>
                    </ChipWithMenu>
                  ))}
                  {overdue > 0 && <span className="overdue-count">{overdue} overdue</span>}
                </div>
              );
            })}
          </div>
          <div className="cal-legend">
            <span>
              <i className="leg payday" /> Payday = marker only, not income
            </span>
            <span>
              <i className="leg bill" /> Bill chip = due reminder, not an expense until logged
            </span>
          </div>
        </div>
      )}

      {sub === 'week' && (
        <div className="bills-week">
          {eachDay(week.start, week.end).map((d) => (
            <div key={d} className="bills-week-col card">
              <h4>
                <button type="button" className="linkish" onClick={() => { onDate(d); setSub('day'); }}>
                  {formatShortDate(d)}
                </button>
              </h4>
              {paydays.includes(d) && (
                <button type="button" className="chip payday" onClick={() => setPaydayNote(d)}>
                  Payday
                </button>
              )}
              {billsOnDate(state.bills, d).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="chip bill"
                  style={{ background: `${b.color}22`, color: b.color }}
                  onClick={() => { onDate(d); setSub('day'); }}
                >
                  {b.name} {formatMoney(b.amountExpected)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {sub === 'day' && (
        <div className="bills-day card">
          <h3>Bills — {formatShortDate(selectedDate)}</h3>
          {paydays.includes(selectedDate) && (
            <button type="button" className="chip payday" onClick={() => setPaydayNote(selectedDate)}>
              Payday marker
            </button>
          )}
          {dayBills.length === 0 && <p className="muted">No bills due.</p>}
          <ul className="bill-detail-list">
            {dayBills.map((b) => {
              const st = statusFor(b, selectedDate);
              return (
                <li key={b.id}>
                  <div className="bill-detail-head">
                    <strong style={{ color: b.color }}>{b.name}</strong>
                    <span>{formatMoney(b.amountExpected)}</span>
                    <span className={`status ${st}`}>{st}</span>
                    <button
                      type="button"
                      className="icon-btn tiny"
                      onClick={(e) => billMenu(b, e.clientX, e.clientY)}
                    >
                      ⋯
                    </button>
                  </div>
                  <p className="muted small">
                    {b.payee && <>Payee: {b.payee} · </>}
                    {b.payMethod && <>Method: {b.payMethod} · </>}
                    {b.notes}
                  </p>
                  <div className="row-actions">
                    {b.payUrl && (
                      <a className="btn ghost sm" href={b.payUrl} target="_blank" rel="noreferrer">
                        Open pay URL
                      </a>
                    )}
                    {(['upcoming', 'due', 'paid', 'skipped'] as BillStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`btn sm${st === s ? ' primary' : ' ghost'}`}
                        onClick={() => setStatus(b, selectedDate, s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit bill' : 'Add bill'} onClose={() => setEditing(null)}>
          <label className="field">
            <span>Name</span>
            <input
              value={editing.name ?? ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Expected amount</span>
            <input
              type="number"
              step="0.01"
              value={editing.amountExpected ?? 0}
              onChange={(e) =>
                setEditing({ ...editing, amountExpected: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>Frequency</span>
            <select
              value={editing.frequency ?? 'monthly'}
              onChange={(e) =>
                setEditing({ ...editing, frequency: e.target.value as BillFrequency })
              }
            >
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
              <option value="once">once</option>
            </select>
          </label>
          <label className="field">
            <span>Next due date</span>
            <input
              type="date"
              value={editing.nextDueDate ?? selectedDate}
              onChange={(e) => {
                const d = e.target.value;
                setEditing({
                  ...editing,
                  nextDueDate: d,
                  dueDay: parseLocalDate(d).getDate(),
                });
              }}
            />
          </label>
          <label className="field">
            <span>Link to Bills column (optional)</span>
            <select
              value={editing.columnId ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, columnId: e.target.value || undefined })
              }
            >
              <option value="">—</option>
              {billColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Payee</span>
            <input
              value={editing.payee ?? ''}
              onChange={(e) => setEditing({ ...editing, payee: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Pay method</span>
            <input
              value={editing.payMethod ?? ''}
              onChange={(e) => setEditing({ ...editing, payMethod: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Pay URL</span>
            <input
              value={editing.payUrl ?? ''}
              onChange={(e) => setEditing({ ...editing, payUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <input
              value={editing.notes ?? ''}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={saveBill}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {recordPrompt && (
        <Modal title="Record expense?" onClose={() => setRecordPrompt(null)}>
          <p>
            Also record {formatMoney(recordPrompt.bill.amountExpected)} under Bills →{' '}
            {billColumns.find((c) => c.id === recordPrompt.bill.columnId)?.name ??
              recordPrompt.bill.name}{' '}
            on {recordPrompt.date}?
          </p>
          <p className="muted small">Default is No — Paid is checklist only.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setRecordPrompt(null)}
            >
              No
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => recordExpense(recordPrompt.bill, recordPrompt.date)}
            >
              Yes, record expense
            </button>
          </div>
        </Modal>
      )}

      {paydayNote && (
        <Modal title="Payday marker" onClose={() => setPaydayNote(null)}>
          <p>Expected pay date (planning only).</p>
          <p className="muted small">Nothing is saved until you confirm Add funds.</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setPaydayNote(null)}>
              Close
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const d = paydayNote;
                setPaydayNote(null);
                onAddFunds(d);
              }}
            >
              Add funds received
            </button>
          </div>
        </Modal>
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

// silence unused import warning helpers
void addDays;
void toYMD;
