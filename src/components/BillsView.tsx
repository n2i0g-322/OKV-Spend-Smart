import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Bill, BillFrequency, Entry, PayFrequency, Tab } from '../types';
import {
  eachDay,
  formatMoney,
  formatMonthYear,
  formatShortDate,
  isValidYMD,
  localToday,
  monthBounds,
  monthCalendarGrid,
  parseLocalDate,
  weekRangeMonSun,
} from '../date';
import { incomeAmount, netSaved, parseAmount, paydayMarkers, spentAmount, type PaydayMarker } from '../money';
import {
  createBill,
  occurrenceAmount,
  occurrenceIndexByEntry,
  occurrencesOn,
  overdueList,
  updateBill,
  type OccurrenceView,
} from '../bills';
import { BillLog, OverduePanel, StatusBadge, lastPaidText } from './BillStatus';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ChipWithMenu } from './ChipWithMenu';
import { Modal } from './Modal';

export type BillsSub = 'month' | 'week' | 'day';

interface Props {
  state: AppState;
  selectedDate: string;
  sub: BillsSub;
  onSub: (s: BillsSub) => void;
  onState: (s: AppState) => void;
  onDate: (d: string) => void;
  onAddFunds: (date: string) => void;
  onOpenDayEntry: (date: string, entryId: string | null) => void;
  onToast?: (msg: string) => void;
  pushUndo: () => void;
  /** Add a manual entry through the duplicate guard. */
  onAddEntry: (prepared: AppState, entry: Entry) => 'saved' | 'blocked';
  onOpenOccurrence: (billId: string, dueDate: string) => void;
}

export const PAY_FREQ_LABEL: Record<PayFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

type Focus = { kind: 'bill' | 'entry'; id: string } | null;

const MAX_ENTRY_CHIPS = 3;
const BILL_RED = '#dc2626';
const FUNDS_GREEN = '#16a34a';

/** Readable text colour on a solid background. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#111827' : '#ffffff';
}

function entryLabel(e: Entry): string {
  if (e.type === 'income') return `+${formatMoney(e.amount)}`;
  if (e.type === 'refund') return `↩ ${formatMoney(e.amount)}`;
  return formatMoney(e.amount);
}

export function BillsView({
  state,
  selectedDate,
  sub,
  onSub,
  onState,
  onDate,
  onAddFunds,
  onOpenDayEntry,
  onToast,
  pushUndo,
  onAddEntry,
  onOpenOccurrence,
}: Props) {
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);
  const [paydayNote, setPaydayNote] = useState<PaydayMarker | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [actionDate, setActionDate] = useState<string | null>(null);
  const [tabEntry, setTabEntry] = useState<{
    date: string;
    tabId: string;
    columnId: string;
    newColumnName: string;
    amount: string;
    memo: string;
    error?: string;
  } | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const focusRef = useRef<HTMLLIElement | null>(null);

  const month = monthBounds(selectedDate);
  const week = weekRangeMonSun(selectedDate);
  const grid = monthCalendarGrid(selectedDate);
  const today = localToday();

  const tabsSorted = useMemo(
    () => state.tabs.slice().sort((a, b) => a.order - b.order),
    [state.tabs],
  );
  const tabById = useMemo(() => new Map(state.tabs.map((t) => [t.id, t])), [state.tabs]);
  const colById = useMemo(() => new Map(state.columns.map((c) => [c.id, c])), [state.columns]);
  const tabOrder = useMemo(
    () => new Map(tabsSorted.map((t, i) => [t.id, i])),
    [tabsSorted],
  );

  const incomeDates = useMemo(
    () => state.entries.filter((e) => e.type === 'income').map((e) => e.date),
    [state.entries],
  );

  const rangeStart = sub === 'week' ? week.start : month.start;
  const rangeEnd = sub === 'week' ? week.end : month.end;
  const paydayList = useMemo(
    () => paydayMarkers(state.paySchedule, rangeStart, rangeEnd, incomeDates),
    [state.paySchedule, rangeStart, rangeEnd, incomeDates],
  );
  const paydayByDate = useMemo(() => new Map(paydayList.map((p) => [p.date, p])), [paydayList]);
  const overdue = useMemo(() => overdueList(state.bills, today), [state.bills, today]);
  const occByEntry = useMemo(() => occurrenceIndexByEntry(state.bills, today), [state.bills, today]);

  /** Entries grouped by date: income first, then by tab order. */
  const entriesByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of state.entries) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if ((a.type === 'income') !== (b.type === 'income')) return a.type === 'income' ? -1 : 1;
        return (tabOrder.get(a.tabId) ?? 99) - (tabOrder.get(b.tabId) ?? 99);
      });
    }
    return map;
  }, [state.entries, tabOrder]);

  const billsTab = state.tabs.find((t) => t.name === 'Bills' && !t.isIncome);
  const billColumns = state.columns.filter((c) => c.tabId === billsTab?.id);

  useEffect(() => {
    if (sub === 'day' && focus && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [sub, focus, selectedDate]);

  const openDay = (date: string, f: Focus = null) => {
    onDate(date);
    setFocus(f);
    onSub('day');
  };

  const newBillDraft = (date: string): Partial<Bill> => ({
    name: '',
    amountExpected: 0,
    frequency: 'monthly',
    nextDueDate: date,
    dueDay: parseLocalDate(date).getDate(),
    payee: '',
    payMethod: '',
    payUrl: '',
    notes: '',
    color: '#ef4444',
  });

  const saveBill = () => {
    if (!editing?.name?.trim() || !isValidYMD(editing.nextDueDate)) return;
    pushUndo();
    const amount = Math.round((Number(editing.amountExpected) || 0) * 100) / 100;
    if (editing.id) {
      const { occurrences: _o, log: _l, id: _id, ...patch } = editing;
      void _o;
      void _l;
      void _id;
      onState(updateBill(state, editing.id, { ...patch, name: editing.name.trim(), amountExpected: amount }));
    } else {
      const { state: next, bill } = createBill(
        state,
        {
          name: editing.name.trim(),
          columnId: editing.columnId,
          amountExpected: amount,
          dueDay: editing.dueDay ?? parseLocalDate(editing.nextDueDate!).getDate(),
          frequency: (editing.frequency as BillFrequency) || 'monthly',
          nextDueDate: editing.nextDueDate!,
          payee: editing.payee ?? '',
          payMethod: editing.payMethod ?? '',
          payUrl: editing.payUrl ?? '',
          notes: editing.notes ?? '',
          color: editing.color ?? '#ef4444',
        },
        { visibleStart: rangeStart, visibleEnd: rangeEnd, today },
      );
      onState(next);
      onToast?.(`Bill reminder “${bill.name}” added — no money logged.`);
    }
    setEditing(null);
  };

  const setPayday = (date: string, freq: PayFrequency, on: boolean) => {
    pushUndo();
    onState({ ...state, paySchedule: on ? { ...(state.paySchedule ?? {}), frequency: freq, anchor: date } : null });
    onToast?.(on ? `Payday markers: ${PAY_FREQ_LABEL[freq]} from ${formatShortDate(date)} (markers only, not income).` : 'Payday schedule cleared.');
  };

  const startTabEntry = (date: string, tab: Tab) => {
    const cols = state.columns
      .filter((c) => c.tabId === tab.id)
      .sort((a, b) => a.order - b.order);
    setActionDate(null);
    setTabEntry({
      date,
      tabId: tab.id,
      columnId: cols[0]?.id ?? '',
      newColumnName: cols.length ? '' : 'General',
      amount: '',
      memo: '',
    });
  };

  const saveTabEntry = () => {
    if (!tabEntry) return;
    const tab = tabById.get(tabEntry.tabId);
    if (!tab) return;
    const amount = parseAmount(tabEntry.amount);
    if (amount == null || amount <= 0) {
      setTabEntry({ ...tabEntry, error: 'Enter an amount greater than $0.00.' });
      return;
    }
    let columns = state.columns;
    let columnId = tabEntry.columnId;
    if (!columnId || !colById.has(columnId)) {
      const name = tabEntry.newColumnName.trim() || 'General';
      const existing = columns.find((c) => c.tabId === tab.id && c.name === name);
      if (existing) columnId = existing.id;
      else {
        columnId = crypto.randomUUID();
        columns = [
          ...columns,
          {
            id: columnId,
            tabId: tab.id,
            name,
            color: tab.color,
            order: columns.filter((c) => c.tabId === tab.id).length,
          },
        ];
      }
    }
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: tabEntry.date,
      tabId: tab.id,
      columnId,
      amount,
      type: tab.isIncome ? 'income' : 'expense',
      memo: tabEntry.memo.trim(),
      source: 'bills-overview',
    };
    const result = onAddEntry({ ...state, columns }, entry);
    if (result === 'saved') {
      const colName = columns.find((c) => c.id === columnId)?.name ?? '';
      onToast?.(`Added ${formatMoney(amount)} to ${tab.name} → ${colName} on ${formatShortDate(entry.date)}.`);
    }
    setTabEntry(null);
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
            if (!confirm(`Delete bill “${bill.name}”?`)) return;
            pushUndo();
            onState({ ...state, bills: state.bills.filter((b) => b.id !== bill.id) });
          },
        },
      ],
    });
  };

  // Only occurrences due ON this day. Earlier overdue items appear under "Overdue from earlier" on Today only.
  const dayOccs = occurrencesOn(state.bills, selectedDate, today);
  const dayEntries = entriesByDate.get(selectedDate) ?? [];

  const renderEntryChip = (e: Entry, date: string) => {
    const tab = tabById.get(e.tabId);
    const color = tab?.color ?? '#94a3b8';
    return (
      <button
        key={e.id}
        type="button"
        className="chip entry"
        title={`${tab?.name ?? '?'} → ${colById.get(e.columnId)?.name ?? '?'} ${entryLabel(e)}${e.memo ? ` · ${e.memo}` : ''}`}
        style={{ background: `${color}22`, color, borderLeft: `3px solid ${color}` }}
        onClick={(ev) => {
          ev.stopPropagation();
          openDay(date, { kind: 'entry', id: e.id });
        }}
      >
        {tab?.name ?? '?'} {entryLabel(e)}
      </button>
    );
  };

  const renderBillChip = (o: OccurrenceView, date: string) => {
    const b = o.bill;
    const st = o.effective;
    const color = b.color || BILL_RED;
    return (
      <ChipWithMenu key={o.occurrenceId} className="chip bill" onMenu={(x, y) => billMenu(b, x, y)}>
        <button
          type="button"
          className={`bill-chip-btn status-${st}`}
          style={{ background: `${color}22`, color, borderLeft: `3px dashed ${color}` }}
          title={`Bill ${b.name} — ${st}${st === 'paid' ? '' : ' — not money until a payment is recorded'}`}
          data-status={st}
          onClick={(e) => {
            e.stopPropagation();
            openDay(date, { kind: 'bill', id: b.id });
          }}
        >
          {st === 'paid' ? '✓ ' : st === 'overdue' ? '⚠ ' : '🔔 '}
          {b.name} {formatMoney(occurrenceAmount(state, o, b))}
          <span className={`chip-status ${st}`}>{st}</span>
        </button>
      </ChipWithMenu>
    );
  };

  const paydayChip = (m: PaydayMarker, label?: string) => (
    <button
      type="button"
      className={`chip payday${m.income ? ' received' : ''}`}
      title={m.income ? 'Income received this day (marker)' : 'Scheduled payday (planning only, not income)'}
      onClick={(e) => {
        e.stopPropagation();
        setPaydayNote(m);
      }}
    >
      ● {label ?? (m.income && m.scheduled ? 'Payday ✓' : m.income ? 'Paid in ✓' : 'Payday')}
    </button>
  );

  const renderOccDetail = (o: OccurrenceView) => {
    const b = o.bill;
    const focused = focus?.kind === 'bill' && focus.id === b.id && o.dueDate === selectedDate;
    const linked = o.linkedEntryId ? state.entries.find((e) => e.id === o.linkedEntryId) : undefined;
    return (
      <li key={o.occurrenceId} ref={focused ? focusRef : undefined} className={focused ? 'focused' : ''} data-testid="occ-detail">
        <div className="bill-detail-head">
          <strong style={{ color: b.color }}>🔔 {b.name}</strong>
          <span>{formatMoney(occurrenceAmount(state, o, b))}</span>
          <span className="muted small">due {o.dueDate}</span>
          <StatusBadge status={o.effective} />
          <span className="muted tiny">{b.frequency}</span>
          <button type="button" className="icon-btn tiny" onClick={(e) => billMenu(b, e.clientX, e.clientY)}>
            ⋯
          </button>
        </div>
        <p className="muted small">
          {b.payee && <>Payee: {b.payee} · </>}
          {b.payMethod && <>Method: {b.payMethod} · </>}
          {b.notes && <>Notes: {b.notes} · </>}
          {lastPaidText(b)}
          {linked && <> · 🔗 payment {formatMoney(linked.amount)} on {linked.date} ({linked.source})</>}
        </p>
        <div className="row-actions">
          {b.payUrl && (
            <a className="btn ghost sm" href={b.payUrl} target="_blank" rel="noreferrer">
              Open pay URL
            </a>
          )}
          <button type="button" className="btn primary sm" onClick={() => onOpenOccurrence(b.id, o.dueDate)}>
            {o.status === 'paid' ? 'Open / correct' : 'Mark paid / skip / cancel…'}
          </button>
        </div>
      </li>
    );
  };

  const actionTabs = tabsSorted;

  return (
    <div className="bills-view">
      <div className="bills-subnav">
        {(['month', 'week', 'day'] as BillsSub[]).map((s) => (
          <button
            key={s}
            type="button"
            className={sub === s ? 'active' : ''}
            onClick={() => {
              setFocus(null);
              onSub(s);
            }}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          type="button"
          className="btn primary sm"
          onClick={() => setEditing(newBillDraft(selectedDate))}
        >
          + Add bill
        </button>
      </div>

      <OverduePanel list={overdue} state={state} onOpen={onOpenOccurrence} />

      {sub === 'month' && (
        <div className="bills-calendar card">
          <h3>{formatMonthYear(selectedDate)}</h3>
          <p className="muted small cal-hint">
            Click an empty part of a day to add a bill, funds received, or an expense for that date.
          </p>
          <div className="cal-head">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {grid.flat().map((cell, i) => {
              if (!cell) return <div key={`e${i}`} className="cal-cell empty" />;
              const occs = occurrencesOn(state.bills, cell, today);
              const pay = paydayByDate.get(cell);
              const entries = entriesByDate.get(cell) ?? [];
              const shown = entries.slice(0, MAX_ENTRY_CHIPS);
              const more = entries.length - shown.length;
              return (
                <div
                  key={cell}
                  role="button"
                  tabIndex={0}
                  aria-label={`Actions for ${formatShortDate(cell)}`}
                  className={`cal-cell${cell === today ? ' today' : ''}${cell === selectedDate ? ' selected' : ''}`}
                  onClick={() => setActionDate(cell)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) setActionDate(cell);
                  }}
                >
                  <button
                    type="button"
                    className="cal-day linkish"
                    title="Open day detail"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDay(cell);
                    }}
                  >
                    {parseLocalDate(cell).getDate()}
                  </button>
                  {pay && paydayChip(pay)}
                  {occs.map((o) => renderBillChip(o, cell))}
                  {shown.map((e) => renderEntryChip(e, cell))}
                  {more > 0 && (
                    <button
                      type="button"
                      className="chip more"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDay(cell);
                      }}
                    >
                      +{more} more
                    </button>
                  )}
                  {cell === today && overdue.length > 0 && (
                    <span className="overdue-count" title="Overdue bills as of today">
                      ⚠ {overdue.length} overdue
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="cal-legend">
            <span>
              <i className="leg payday" /> Payday = marker only, not income
              {state.paySchedule
                ? ` (${PAY_FREQ_LABEL[state.paySchedule.frequency]} from ${state.paySchedule.anchor})`
                : ' (no schedule — income dates only)'}
            </span>
            <span>
              <i className="leg bill" /> 🔔 Bill = reminder, not an expense until logged
            </span>
            <span>
              <i className="leg entry" /> Coloured chip = real entry (tab colour)
            </span>
          </div>
        </div>
      )}

      {sub === 'week' && (
        <div className="bills-week">
          {eachDay(week.start, week.end).map((d) => (
            <div
              key={d}
              className="bills-week-col card"
              onClick={() => setActionDate(d)}
              role="button"
              tabIndex={0}
            >
              <h4>
                <button
                  type="button"
                  className="linkish"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDay(d);
                  }}
                >
                  {formatShortDate(d)}
                </button>
              </h4>
              {paydayByDate.get(d) && paydayChip(paydayByDate.get(d)!)}
              {occurrencesOn(state.bills, d, today).map((o) => renderBillChip(o, d))}
              {(entriesByDate.get(d) ?? []).map((e) => renderEntryChip(e, d))}
            </div>
          ))}
        </div>
      )}

      {sub === 'day' && (
        <div className="bills-day card">
          <div className="bills-day-head">
            <h3>Bills &amp; activity — {formatShortDate(selectedDate)}</h3>
            <button type="button" className="btn primary sm" onClick={() => setActionDate(selectedDate)}>
              + Add for this day
            </button>
          </div>
          {(() => {
            const m = paydayMarkers(state.paySchedule, selectedDate, selectedDate, incomeDates)[0];
            return m ? paydayChip(m, m.income ? 'Income received (marker)' : 'Payday marker (planning only)') : null;
          })()}

          <h4 className="bills-day-section">Bills due this day</h4>
          {dayOccs.length === 0 && <p className="muted">No bills due.</p>}
          <ul className="bill-detail-list">
            {dayOccs.map((o) => renderOccDetail(o))}
          </ul>
          {selectedDate === today && overdue.length > 0 && (
            <>
              <h4 className="bills-day-section">Overdue from earlier ({overdue.length})</h4>
              <ul className="bill-detail-list">{overdue.map((o) => renderOccDetail(o))}</ul>
            </>
          )}

          <h4 className="bills-day-section">Money activity (real entries)</h4>
          {dayEntries.length === 0 ? (
            <p className="muted">No entries on this day.</p>
          ) : (
            <>
              <p className="muted small">
                Income {formatMoney(incomeAmount(dayEntries))} · spent{' '}
                {formatMoney(spentAmount(dayEntries))} · net {formatMoney(netSaved(dayEntries))}
              </p>
              <ul className="bill-detail-list">
                {dayEntries.map((e) => {
                  const tab = tabById.get(e.tabId);
                  const col = colById.get(e.columnId);
                  const link = occByEntry.get(e.id);
                  const bill = link?.occ.bill;
                  const focused = focus?.kind === 'entry' && focus.id === e.id;
                  return (
                    <li
                      key={e.id}
                      ref={focused ? focusRef : undefined}
                      className={focused ? 'focused' : ''}
                    >
                      <div className="bill-detail-head">
                        <span className="dot" style={{ background: tab?.color ?? '#94a3b8' }} />
                        <strong style={{ color: tab?.color }}>
                          {tab?.name ?? 'Unknown'} → {col?.name ?? '—'}
                        </strong>
                        <span className={`amt ${e.type}`}>{entryLabel(e)}</span>
                        <span className="status">{e.type}</span>
                        <span className="muted tiny">via {e.source}</span>
                        {link && (
                          <button
                            type="button"
                            className="linkish small"
                            onClick={() => onOpenOccurrence(link.occ.billId, link.occ.dueDate)}
                          >
                            🔗 {link.occ.bill.name} due {link.occ.dueDate}
                            {link.role === 'extra' ? ' (extra payment)' : ''} <StatusBadge status={link.occ.effective} />
                          </button>
                        )}
                      </div>
                      <p className="muted small">
                        {e.memo ? <>Memo: {e.memo}</> : <>No memo</>}
                        {bill?.payee && <> · Payee: {bill.payee}</>}
                        {bill?.payMethod && <> · Method: {bill.payMethod}</>}
                      </p>
                      <div className="row-actions">
                        {bill?.payUrl && (
                          <a className="btn ghost sm" href={bill.payUrl} target="_blank" rel="noreferrer">
                            Open pay URL
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => onOpenDayEntry(e.date, e.id)}
                        >
                          Edit in Day view
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {actionDate && (
        <Modal title={`Add for ${formatShortDate(actionDate)}, ${actionDate.slice(0, 4)}`} onClose={() => setActionDate(null)}>
          <div className="action-grid">
            <button
              type="button"
              className="btn action-btn"
              style={{ background: BILL_RED, borderColor: BILL_RED, color: '#fff' }}
              onClick={() => {
                const d = actionDate;
                setActionDate(null);
                setEditing(newBillDraft(d));
              }}
            >
              Add bill
              <small>reminder only — no money</small>
            </button>
            <button
              type="button"
              className="btn action-btn"
              style={{ background: FUNDS_GREEN, borderColor: FUNDS_GREEN, color: '#fff' }}
              onClick={() => {
                const d = actionDate;
                setActionDate(null);
                onAddFunds(d);
              }}
            >
              Add funds received
              <small>income, after you confirm</small>
            </button>
            {actionTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn action-btn"
                style={{ background: t.color, borderColor: t.color, color: textOn(t.color) }}
                onClick={() => startTabEntry(actionDate, t)}
              >
                Add {t.name}
                <small>{t.isIncome ? 'income entry' : 'expense entry'}</small>
              </button>
            ))}
          </div>
          <fieldset className="payday-boxes" data-testid="payday-boxes">
            <legend>Payday markers — this day is the anchor (markers only, not income)</legend>
            {(['daily', 'weekly', 'biweekly', 'monthly'] as PayFrequency[]).map((f) => {
              const checked = state.paySchedule?.frequency === f && state.paySchedule.anchor === actionDate;
              return (
                <label key={f} className="radio">
                  <input type="checkbox" checked={checked} onChange={(e) => setPayday(actionDate, f, e.target.checked)} />{' '}
                  {PAY_FREQ_LABEL[f]}
                </label>
              );
            })}
            {state.paySchedule && state.paySchedule.anchor !== actionDate && (
              <p className="muted tiny">
                Current: {PAY_FREQ_LABEL[state.paySchedule.frequency]} from {state.paySchedule.anchor}. Checking a box moves the
                anchor here.
              </p>
            )}
          </fieldset>
          <div className="modal-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const d = actionDate;
                setActionDate(null);
                openDay(d);
              }}
            >
              Open day detail
            </button>
            <button type="button" className="btn ghost" onClick={() => setActionDate(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {tabEntry && (() => {
        const tab = tabById.get(tabEntry.tabId);
        const cols = state.columns
          .filter((c) => c.tabId === tabEntry.tabId)
          .sort((a, b) => a.order - b.order);
        return (
          <Modal
            title={`Add ${tab?.name ?? ''} — ${formatShortDate(tabEntry.date)}`}
            onClose={() => setTabEntry(null)}
          >
            <p className="muted small" style={{ borderLeft: `4px solid ${tab?.color}`, paddingLeft: 8 }}>
              Creates a real {tab?.isIncome ? 'income' : 'expense'} entry on {tabEntry.date}. It shows in
              Day view and Boxes 1–4.
            </p>
            <label className="field">
              <span>Column</span>
              <select
                value={tabEntry.columnId}
                onChange={(e) => setTabEntry({ ...tabEntry, columnId: e.target.value })}
              >
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="">+ New column…</option>
              </select>
            </label>
            {!tabEntry.columnId && (
              <label className="field">
                <span>New column name</span>
                <input
                  value={tabEntry.newColumnName}
                  onChange={(e) => setTabEntry({ ...tabEntry, newColumnName: e.target.value })}
                />
              </label>
            )}
            <label className="field">
              <span>Amount (CAD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                autoFocus
                value={tabEntry.amount}
                onChange={(e) => setTabEntry({ ...tabEntry, amount: e.target.value, error: undefined })}
                onKeyDown={(e) => e.key === 'Enter' && saveTabEntry()}
              />
            </label>
            <label className="field">
              <span>Memo (optional)</span>
              <input
                value={tabEntry.memo}
                onChange={(e) => setTabEntry({ ...tabEntry, memo: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveTabEntry()}
              />
            </label>
            {tabEntry.error && <p className="form-error">{tabEntry.error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setTabEntry(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={tab ? { background: tab.color, borderColor: tab.color, color: textOn(tab.color) } : undefined}
                onClick={saveTabEntry}
              >
                Save
              </button>
            </div>
          </Modal>
        );
      })()}

      {editing && (
        <Modal title={editing.id ? 'Edit bill' : 'Add bill (reminder)'} onClose={() => setEditing(null)}>
          {!editing.id && (
            <p className="muted small">A bill is a reminder. It never logs money by itself.</p>
          )}
          <label className="field">
            <span>Name</span>
            <input
              value={editing.name ?? ''}
              autoFocus
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Expected amount</span>
            <input
              type="number"
              step="0.01"
              value={editing.amountExpected ?? 0}
              onChange={(e) => setEditing({ ...editing, amountExpected: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Frequency</span>
            <select
              value={editing.frequency ?? 'monthly'}
              onChange={(e) => setEditing({ ...editing, frequency: e.target.value as BillFrequency })}
            >
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
              <option value="once">once</option>
            </select>
          </label>
          <label className="field">
            <span>{editing.frequency === 'once' ? 'Due date' : 'First / next due date'}</span>
            <input
              type="date"
              value={editing.nextDueDate ?? selectedDate}
              onChange={(e) => {
                const d = e.target.value;
                if (!isValidYMD(d)) return;
                setEditing({ ...editing, nextDueDate: d, dueDay: parseLocalDate(d).getDate() });
              }}
            />
          </label>
          <label className="field">
            <span>Link to Bills column (optional)</span>
            <select
              value={editing.columnId ?? ''}
              onChange={(e) => setEditing({ ...editing, columnId: e.target.value || undefined })}
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
          <label className="field">
            <span>Colour</span>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(editing.color ?? '') ? editing.color : '#ef4444'}
              onChange={(e) => setEditing({ ...editing, color: e.target.value })}
            />
          </label>
          {editing.id && (() => {
            const b = state.bills.find((x) => x.id === editing.id);
            return b ? (
              <>
                <p className="small">{lastPaidText(b)}</p>
                <BillLog bill={b} />
              </>
            ) : null;
          })()}
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

      {paydayNote && (
        <Modal title={`Payday — ${formatShortDate(paydayNote.date)}, ${paydayNote.date.slice(0, 4)}`} onClose={() => setPaydayNote(null)}>
          <p>
            {paydayNote.scheduled && state.paySchedule
              ? `Scheduled payday (${PAY_FREQ_LABEL[state.paySchedule.frequency]} from ${state.paySchedule.anchor}).`
              : 'Marked because income was received this day.'}
          </p>
          {paydayNote.income && (
            <p className="small">
              Received this day:{' '}
              {formatMoney(incomeAmount((entriesByDate.get(paydayNote.date) ?? []).filter((e) => e.type === 'income')))}
            </p>
          )}
          {state.expectedIncome.amount > 0 && (
            <p className="muted small">
              Box 3 plan: {formatMoney(state.expectedIncome.amount)} {state.expectedIncome.frequency}.
            </p>
          )}
          <p className="muted small">Planning note only. Nothing is saved until you confirm Add funds.</p>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setPaydayNote(null)}>
              Close
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const d = paydayNote.date;
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
