import type {
  AppState,
  Bill,
  BillLogAction,
  BillLogEntry,
  BillOccurrence,
  Column,
  Entry,
  LegacyBillStatus,
  OccurrenceStatus,
  StoredOccurrenceStatus,
} from './types';
import {
  addDays,
  daysBetween,
  daysInMonth,
  isValidYMD,
  localToday,
  parseLocalDate,
  toYMD,
  weekdayMon0,
} from './date';

/**
 * Bills own their status. A bill is a schedule; each due date is an
 * occurrence `{ occurrenceId, billId, dueDate, status, linkedEntryId }`.
 *
 * - Occurrences are generated deterministically from the schedule
 *   (occurrenceId = `${billId}:${dueDate}`), so re-rendering never duplicates.
 * - Only occurrences with non-default state (a status, link, or log line) are
 *   persisted on the bill.
 * - `due` / `overdue` are derived from today's LOCAL date. Overdue is never money.
 * - Money only enters the ledger when the user records a payment
 *   (one `bill-paid` expense per occurrence unless the user explicitly adds another).
 */

export const occId = (billId: string, dueDate: string): string => `${billId}:${dueDate}`;

const nowIso = () => new Date().toISOString();
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const cents = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) : 0);
const TERMINAL: StoredOccurrenceStatus[] = ['paid', 'skipped', 'cancelled'];

// ---------------------------------------------------------------- schedule

/** Is this bill scheduled on `date`? Recurring bills start at `nextDueDate` (first due date). */
export function dueOn(bill: Bill, date: string): boolean {
  if (!isValidYMD(bill.nextDueDate)) return false;
  if (bill.frequency === 'once') return bill.nextDueDate === date;
  if (date < bill.nextDueDate) return false;
  if (bill.frequency === 'monthly') {
    const day = parseLocalDate(date).getDate();
    const anchor = bill.dueDay || parseLocalDate(bill.nextDueDate).getDate();
    return day === Math.min(anchor, daysInMonth(date));
  }
  if (bill.frequency === 'weekly') {
    return weekdayMon0(date) === weekdayMon0(bill.nextDueDate);
  }
  if (bill.frequency === 'yearly') {
    const d = parseLocalDate(date);
    const n = parseLocalDate(bill.nextDueDate);
    if (d.getMonth() !== n.getMonth()) return false;
    return d.getDate() === Math.min(n.getDate(), daysInMonth(date));
  }
  return false;
}

/** Scheduled due dates of a bill within [start, end] (inclusive). */
export function scheduleDates(bill: Bill, start: string, end: string): string[] {
  if (!isValidYMD(bill.nextDueDate) || !isValidYMD(start) || !isValidYMD(end) || start > end) return [];
  if (bill.frequency === 'once') {
    return bill.nextDueDate >= start && bill.nextDueDate <= end ? [bill.nextDueDate] : [];
  }
  const s = start < bill.nextDueDate ? bill.nextDueDate : start;
  if (s > end) return [];
  const out: string[] = [];
  if (bill.frequency === 'weekly') {
    const shift = (weekdayMon0(bill.nextDueDate) - weekdayMon0(s) + 7) % 7;
    for (let d = addDays(s, shift); d <= end; d = addDays(d, 7)) out.push(d);
    return out;
  }
  if (bill.frequency === 'monthly') {
    const anchor = bill.dueDay || parseLocalDate(bill.nextDueDate).getDate();
    const sd = parseLocalDate(s);
    for (let y = sd.getFullYear(), m = sd.getMonth(); ; m++) {
      const first = new Date(y, m, 1);
      const ym = toYMD(first);
      if (ym > end) break;
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const d = toYMD(new Date(first.getFullYear(), first.getMonth(), Math.min(anchor, dim)));
      if (d >= s && d <= end) out.push(d);
    }
    return out;
  }
  // yearly
  const n = parseLocalDate(bill.nextDueDate);
  for (let y = parseLocalDate(s).getFullYear(); ; y++) {
    if (`${y}-01-01` > end) break;
    const dim = new Date(y, n.getMonth() + 1, 0).getDate();
    const d = toYMD(new Date(y, n.getMonth(), Math.min(n.getDate(), dim)));
    if (d >= s && d <= end) out.push(d);
  }
  return out;
}

/** First scheduled due date on or after `from`. */
export function nextUpcoming(bill: Bill, from: string): string | null {
  return scheduleDates(bill, from, addDays(from, 800))[0] ?? null;
}

// ---------------------------------------------------------------- occurrences

export interface OccurrenceView extends BillOccurrence {
  bill: Bill;
  /** Status shown to the user (due/overdue derived from today). */
  effective: OccurrenceStatus;
  /** true when this occurrence is persisted on the bill. */
  stored: boolean;
}

export function effectiveStatus(
  stored: StoredOccurrenceStatus,
  dueDate: string,
  today: string = localToday(),
): OccurrenceStatus {
  if (TERMINAL.includes(stored)) return stored;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'due';
  return stored; // scheduled, or 'due' if the user marked it due early
}

export function defaultOccurrence(bill: Bill, dueDate: string): BillOccurrence {
  return {
    occurrenceId: occId(bill.id, dueDate),
    billId: bill.id,
    dueDate,
    status: 'scheduled',
    linkedEntryId: null,
  };
}

export function getOccurrence(bill: Bill, dueDate: string): BillOccurrence {
  return bill.occurrences.find((o) => o.dueDate === dueDate) ?? defaultOccurrence(bill, dueDate);
}

export function viewOf(bill: Bill, dueDate: string, today: string = localToday()): OccurrenceView {
  const stored = bill.occurrences.find((o) => o.dueDate === dueDate);
  const o = stored ?? defaultOccurrence(bill, dueDate);
  return { ...o, bill, effective: effectiveStatus(o.status, dueDate, today), stored: !!stored };
}

/** Scheduled + persisted occurrences of a bill within [start, end], sorted by date. */
export function occurrencesInRange(
  bill: Bill,
  start: string,
  end: string,
  today: string = localToday(),
): OccurrenceView[] {
  const dates = new Set(scheduleDates(bill, start, end));
  for (const o of bill.occurrences) if (o.dueDate >= start && o.dueDate <= end) dates.add(o.dueDate);
  return [...dates].sort().map((d) => viewOf(bill, d, today));
}

/** Every bill occurrence that falls on `date` (its own due day only — never painted on later days). */
export function occurrencesOn(bills: Bill[], date: string, today: string = localToday()): OccurrenceView[] {
  return bills.flatMap((b) => occurrencesInRange(b, date, date, today));
}

/** @deprecated kept for compatibility: bills with an occurrence on `date`. */
export function billsOnDate(bills: Bill[], date: string): Bill[] {
  return occurrencesOn(bills, date).map((o) => o.bill);
}

/** Effective status of a bill on a date (scheduled if not an occurrence). */
export function statusFor(bill: Bill, date: string, today: string = localToday()): OccurrenceStatus {
  return viewOf(bill, date, today).effective;
}

function billStart(bill: Bill): string {
  let s = isValidYMD(bill.nextDueDate) ? bill.nextDueDate : '9999-12-31';
  for (const o of bill.occurrences) if (o.dueDate < s) s = o.dueDate;
  return s;
}

/**
 * Every overdue occurrence as of `today` — independent of the viewed month/year.
 * dueDate < today and status not paid/skipped/cancelled.
 */
export function overdueList(bills: Bill[], today: string = localToday()): OccurrenceView[] {
  const yesterday = addDays(today, -1);
  const out: OccurrenceView[] = [];
  for (const b of bills) {
    const s = billStart(b);
    if (s > yesterday) continue;
    for (const o of occurrencesInRange(b, s, yesterday, today)) if (o.effective === 'overdue') out.push(o);
  }
  return out.sort((a, b) => (a.dueDate === b.dueDate ? a.bill.name.localeCompare(b.bill.name) : a.dueDate < b.dueDate ? -1 : 1));
}

/** @deprecated use overdueList. Bills that have ≥1 overdue occurrence as of today. */
export function openOverdue(bills: Bill[], _asOf?: string): Bill[] {
  const ids = new Set(overdueList(bills).map((o) => o.billId));
  return bills.filter((b) => ids.has(b.id));
}

/** Map entryId → the bill occurrence it pays (linked) or was added to (extra). */
export function occurrenceIndexByEntry(
  bills: Bill[],
  today: string = localToday(),
): Map<string, { occ: OccurrenceView; role: 'payment' | 'extra' }> {
  const m = new Map<string, { occ: OccurrenceView; role: 'payment' | 'extra' }>();
  for (const b of bills) {
    for (const o of b.occurrences) {
      const v = viewOf(b, o.dueDate, today);
      if (o.linkedEntryId) m.set(o.linkedEntryId, { occ: v, role: 'payment' });
      for (const id of o.extraEntryIds ?? []) m.set(id, { occ: v, role: 'extra' });
    }
  }
  return m;
}

/** Last time any occurrence of this bill was marked paid. */
export function lastPaid(bill: Bill): { at: string | null; dueDate: string } | null {
  const paid = bill.occurrences.filter((o) => o.status === 'paid');
  if (!paid.length) return null;
  paid.sort((a, b) => {
    const ka = a.paidAt ?? '';
    const kb = b.paidAt ?? '';
    if (ka !== kb) return ka < kb ? 1 : -1;
    return a.dueDate < b.dueDate ? 1 : -1;
  });
  return { at: paid[0].paidAt ?? null, dueDate: paid[0].dueDate };
}

// ---------------------------------------------------------------- state helpers

function mapBill(state: AppState, billId: string, fn: (b: Bill) => Bill): AppState {
  return { ...state, bills: state.bills.map((b) => (b.id === billId ? fn(b) : b)) };
}

function upsertOcc(bill: Bill, occ: BillOccurrence): Bill {
  const has = bill.occurrences.some((o) => o.dueDate === occ.dueDate);
  const occurrences = has
    ? bill.occurrences.map((o) => (o.dueDate === occ.dueDate ? occ : o))
    : [...bill.occurrences, occ].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return { ...bill, occurrences };
}

function withLog(bill: Bill, line: BillLogEntry): Bill {
  return { ...bill, log: [...bill.log, line] };
}

function logLine(
  action: BillLogAction,
  at: string,
  occ?: { occurrenceId: string; dueDate: string } | null,
  extra: Partial<BillLogEntry> = {},
): BillLogEntry {
  return {
    at,
    action,
    ...(occ ? { occurrenceId: occ.occurrenceId, dueDate: occ.dueDate } : {}),
    ...extra,
  };
}

export function billsTabId(state: AppState): string | undefined {
  return (state.tabs.find((t) => t.name === 'Bills' && !t.isIncome) ?? state.tabs.find((t) => !t.isIncome && !t.isSystem))?.id;
}

/** Tab a bill's payments land in. */
export function billTabId(state: AppState, bill: Bill): string | undefined {
  const col = bill.columnId ? state.columns.find((c) => c.id === bill.columnId) : undefined;
  return col?.tabId ?? billsTabId(state);
}

/** Column a recorded payment goes to (bill column, else Bills → <bill name>, created if missing). */
export function billExpenseTarget(
  state: AppState,
  bill: Bill,
): { state: AppState; tabId: string; columnId: string } | null {
  const linked = bill.columnId ? state.columns.find((c) => c.id === bill.columnId) : undefined;
  if (linked) return { state, tabId: linked.tabId, columnId: linked.id };
  const tabId = billsTabId(state);
  if (!tabId) return null;
  const existing = state.columns.find(
    (c) => c.tabId === tabId && c.name.trim().toLowerCase() === bill.name.trim().toLowerCase(),
  );
  if (existing) return { state, tabId, columnId: existing.id };
  const col: Column = {
    id: uuid(),
    tabId,
    name: bill.name,
    color: bill.color,
    order: state.columns.filter((c) => c.tabId === tabId).length,
  };
  return { state: { ...state, columns: [...state.columns, col] }, tabId, columnId: col.id };
}

/** Does this entry look like a payment of this bill (same column, or memo/column names the bill)? */
export function entryMatchesBillIdentity(state: AppState, bill: Bill, entry: Entry): boolean {
  if (bill.columnId && entry.columnId === bill.columnId) return true;
  const name = bill.name.trim().toLowerCase();
  if (name.length < 3) return false;
  if ((entry.memo ?? '').toLowerCase().includes(name)) return true;
  const col = state.columns.find((c) => c.id === entry.columnId);
  return !!col && col.name.trim().toLowerCase() === name;
}

/** Expected money for an occurrence: the linked payment's amount, else the bill's expected amount. */
export function occurrenceAmount(state: AppState, occ: BillOccurrence, bill: Bill): number {
  const e = occ.linkedEntryId ? state.entries.find((x) => x.id === occ.linkedEntryId) : undefined;
  return e ? e.amount : bill.amountExpected;
}

/** Default ledger date for a recorded payment: the due date, or today if the due date is in the future. */
export function defaultPaymentDate(dueDate: string, today: string = localToday()): string {
  return dueDate <= today ? dueDate : today;
}

// ---------------------------------------------------------------- actions (all append to the bill log)

export function createBill(
  state: AppState,
  draft: Omit<Bill, 'id' | 'occurrences' | 'log'> & { id?: string },
  opts: { visibleStart: string; visibleEnd: string; today?: string; now?: string },
): { state: AppState; bill: Bill } {
  const today = opts.today ?? localToday();
  const at = opts.now ?? nowIso();
  let bill: Bill = { ...draft, id: draft.id ?? uuid(), occurrences: [], log: [] };
  bill = withLog(bill, logLine('created', at, null, { amount: bill.amountExpected, note: `${bill.frequency} from ${bill.nextDueDate}` }));
  const dates = new Set(scheduleDates(bill, opts.visibleStart, opts.visibleEnd));
  const nxt = nextUpcoming(bill, today);
  if (nxt) dates.add(nxt);
  for (const d of [...dates].sort()) {
    const o = defaultOccurrence(bill, d);
    bill = upsertOcc(bill, o);
    bill = withLog(bill, logLine('scheduled', at, o));
  }
  return { state: { ...state, bills: [...state.bills, bill] }, bill };
}

/** Edit bill fields. Open, unlinked occurrences that fall off the new schedule are dropped (logged). */
export function updateBill(state: AppState, billId: string, patch: Partial<Bill>, now: string = nowIso()): AppState {
  return mapBill(state, billId, (b) => {
    const changed = (Object.keys(patch) as (keyof Bill)[]).filter(
      (k) => !['id', 'occurrences', 'log'].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(patch[k]),
    );
    if (!changed.length) return b;
    let next: Bill = { ...b, ...patch, id: b.id, occurrences: b.occurrences, log: b.log };
    const dropped = next.occurrences.filter(
      (o) =>
        !TERMINAL.includes(o.status) &&
        !o.linkedEntryId &&
        !(o.extraEntryIds ?? []).length &&
        !dueOn(next, o.dueDate),
    );
    if (dropped.length) {
      next = { ...next, occurrences: next.occurrences.filter((o) => !dropped.includes(o)) };
    }
    next = withLog(
      next,
      logLine('user-corrected', now, null, {
        note: `Bill edited (${changed.join(', ')})${dropped.length ? `; removed open occurrence(s) ${dropped.map((o) => o.dueDate).join(', ')} no longer on schedule` : ''}`,
      }),
    );
    return next;
  });
}

/** Mark Paid → Record payment (default). Creates exactly ONE bill-paid expense. */
export function markPaidRecord(
  state: AppState,
  billId: string,
  dueDate: string,
  opts: { amount?: number; date?: string; today?: string; now?: string; force?: boolean } = {},
): { state: AppState; entryId: string } | null {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return null;
  const occ = getOccurrence(bill, dueDate);
  if (occ.linkedEntryId && !opts.force) return null; // already has its one payment
  const today = opts.today ?? localToday();
  const at = opts.now ?? nowIso();
  const target = billExpenseTarget(state, bill);
  if (!target) return null;
  const amount = Math.round((opts.amount ?? bill.amountExpected) * 100) / 100;
  if (!(amount > 0)) return null;
  const entry: Entry = {
    id: uuid(),
    date: opts.date && isValidYMD(opts.date) ? opts.date : defaultPaymentDate(dueDate, today),
    tabId: target.tabId,
    columnId: target.columnId,
    amount,
    type: 'expense',
    memo: bill.name,
    source: 'bill-paid',
    billId: bill.id,
    occurrenceId: occ.occurrenceId,
  };
  const prev = occ.status;
  const nextOcc: BillOccurrence = occ.linkedEntryId
    ? { ...occ, status: 'paid', extraEntryIds: [...(occ.extraEntryIds ?? []), entry.id], paidAt: occ.paidAt ?? at }
    : { ...occ, status: 'paid', linkedEntryId: entry.id, paidAt: at };
  let s: AppState = { ...target.state, entries: [...target.state.entries, entry] };
  s = mapBill(s, billId, (b) =>
    withLog(
      upsertOcc(b, nextOcc),
      logLine('paid-recorded', at, occ, {
        entryId: entry.id,
        amount,
        note: `${occ.linkedEntryId ? 'Additional payment (user override)' : 'Payment recorded'} on ${entry.date}${prev !== 'scheduled' ? ` (was ${prev})` : ''}`,
      }),
    ),
  );
  return { state: s, entryId: entry.id };
}

/** Mark Paid → Reminder only. Status paid, no money. */
export function markPaidReminder(state: AppState, billId: string, dueDate: string, now: string = nowIso()): AppState {
  return mapBill(state, billId, (b) => {
    const occ = getOccurrence(b, dueDate);
    if (occ.status === 'paid') return b;
    return withLog(
      upsertOcc(b, { ...occ, status: 'paid', paidAt: now }),
      logLine('paid-reminder-only', now, occ, { note: `No money logged${occ.status !== 'scheduled' ? ` (was ${occ.status})` : ''}` }),
    );
  });
}

/**
 * Set status skipped / cancelled / scheduled / due (corrections included).
 * Leaving `paid`: a linked `bill-paid` payment is removed when removePayment is true;
 * a linked manual entry is only unlinked (kept). History is never erased.
 */
export function setOccurrenceStatus(
  state: AppState,
  billId: string,
  dueDate: string,
  status: Exclude<StoredOccurrenceStatus, 'paid'>,
  opts: { now?: string; removePayment?: boolean; note?: string } = {},
): AppState {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return state;
  const at = opts.now ?? nowIso();
  const occ = getOccurrence(bill, dueDate);
  if (occ.status === status && !opts.note) return state;
  let s = state;
  const notes: string[] = [];
  let nextOcc: BillOccurrence = { ...occ, status };
  if (occ.status === 'paid') {
    nextOcc.paidAt = null;
    if (occ.linkedEntryId) {
      const e = s.entries.find((x) => x.id === occ.linkedEntryId);
      if (e && e.source === 'bill-paid' && opts.removePayment) {
        s = { ...s, entries: s.entries.filter((x) => x.id !== e.id) };
        notes.push(`removed recorded payment $${e.amount.toFixed(2)} (${e.date})`);
      } else if (e) {
        notes.push(`unlinked entry $${e.amount.toFixed(2)} (${e.date}) — entry kept`);
      }
      nextOcc = { ...nextOcc, linkedEntryId: null };
    }
  }
  const wasTerminal = TERMINAL.includes(occ.status);
  const action: BillLogAction = wasTerminal
    ? 'user-corrected'
    : status === 'skipped'
      ? 'skipped'
      : status === 'cancelled'
        ? 'cancelled'
        : status === 'due'
          ? 'marked-due'
          : 'user-corrected';
  const note = [`${occ.status} → ${status}`, ...notes, opts.note].filter(Boolean).join('; ');
  return mapBill(s, billId, (b) => withLog(upsertOcc(b, nextOcc), logLine(action, at, occ, { note })));
}

/**
 * Time-driven log lines: append `marked-due` / `marked-overdue` once per occurrence
 * (idempotent). Returns the same object when nothing changed.
 */
export function reconcileBills(state: AppState, today: string = localToday(), now: string = nowIso()): AppState {
  let changed = false;
  const bills = state.bills.map((b) => {
    const s = billStart(b);
    if (s > today) return b;
    let nb = b;
    for (const o of occurrencesInRange(b, s, today, today)) {
      const action: BillLogAction | null =
        o.effective === 'overdue' ? 'marked-overdue' : o.effective === 'due' && o.dueDate === today ? 'marked-due' : null;
      if (!action) continue;
      if (nb.log.some((l) => l.occurrenceId === o.occurrenceId && l.action === action)) continue;
      const base = nb.occurrences.find((x) => x.dueDate === o.dueDate) ?? defaultOccurrence(nb, o.dueDate);
      nb = withLog(upsertOcc(nb, base), logLine(action, now, base, { note: 'automatic (by date)' }));
    }
    if (nb !== b) changed = true;
    return nb;
  });
  return changed ? { ...state, bills } : state;
}

// ---------------------------------------------------------------- duplicate guard

export type SimilarReason = 'same-bill-date' | 'same-date-tab-amount' | 'tab-amount-near' | 'future-occurrence';

export interface SimilarMatch {
  occ: OccurrenceView;
  reason: SimilarReason;
  reasonText: string;
  amount: number;
}

const REASON_RANK: Record<SimilarReason, number> = {
  'same-bill-date': 0,
  'same-date-tab-amount': 1,
  'tab-amount-near': 2,
  'future-occurrence': 3,
};

/**
 * Is a manual expense similar to a bill occurrence?
 *  (a) same bill + dueDate, (b) same date + tab + amount ±$0.01,
 *  (c) same tab + amount ±$0.01 and dueDate within 5 days,
 *  (d) the next future occurrence (≤35 days ahead, not yet due) of the same bill.
 */
export function findSimilarOccurrences(state: AppState, entry: Entry, today: string = localToday()): SimilarMatch[] {
  if (entry.type !== 'expense') return [];
  const found = new Map<string, SimilarMatch>();
  const put = (m: SimilarMatch) => {
    const cur = found.get(m.occ.occurrenceId);
    if (!cur || REASON_RANK[m.reason] < REASON_RANK[cur.reason]) found.set(m.occ.occurrenceId, m);
  };
  for (const bill of state.bills) {
    const tab = billTabId(state, bill);
    const identity = entryMatchesBillIdentity(state, bill, entry);
    for (const occ of occurrencesInRange(bill, addDays(entry.date, -5), addDays(entry.date, 5), today)) {
      if (occ.linkedEntryId === entry.id) continue;
      const amount = occurrenceAmount(state, occ, bill);
      const amountEq = Math.abs(cents(entry.amount) - cents(amount)) <= 1;
      const gap = Math.abs(daysBetween(occ.dueDate, entry.date));
      if (identity && occ.dueDate === entry.date) {
        put({ occ, amount, reason: 'same-bill-date', reasonText: `same bill (${bill.name}) and due date` });
      } else if (occ.dueDate === entry.date && tab === entry.tabId && amountEq) {
        put({ occ, amount, reason: 'same-date-tab-amount', reasonText: 'same date, tab and amount' });
      } else if (tab === entry.tabId && amountEq && gap <= 5) {
        put({ occ, amount, reason: 'tab-amount-near', reasonText: `same tab and amount, due ${gap} day${gap === 1 ? '' : 's'} apart` });
      }
    }
    if (identity) {
      const nxt = scheduleDates(bill, addDays(entry.date, 1), addDays(entry.date, 35))[0];
      if (nxt && nxt >= today) {
        const occ = viewOf(bill, nxt, today);
        if (occ.linkedEntryId !== entry.id) {
          put({
            occ,
            amount: occurrenceAmount(state, occ, bill),
            reason: 'future-occurrence',
            reasonText: `matches the upcoming ${bill.name} due ${nxt}`,
          });
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => {
    const r = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (r) return r;
    const pa = a.occ.linkedEntryId ? 0 : 1;
    const pb = b.occ.linkedEntryId ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return Math.abs(daysBetween(a.occ.dueDate, entry.date)) - Math.abs(daysBetween(b.occ.dueDate, entry.date));
  });
}

function describeEntry(state: AppState, e: Entry): string {
  const tab = state.tabs.find((t) => t.id === e.tabId)?.name ?? '?';
  const col = state.columns.find((c) => c.id === e.columnId)?.name ?? '?';
  return `${tab} → ${col} $${e.amount.toFixed(2)} on ${e.date}`;
}

/** Log that a manual save was blocked. The entry is NOT saved. */
export function logBlockedSimilar(state: AppState, m: SimilarMatch, entry: Entry, now: string = nowIso()): AppState {
  return mapBill(state, m.occ.billId, (b) =>
    withLog(
      b,
      logLine('manual-blocked-similar', now, m.occ, {
        amount: entry.amount,
        note: `Manual ${describeEntry(state, entry)} blocked: ${m.reasonText}`,
      }),
    ),
  );
}

/** "Link to this bill": save the manual entry as this occurrence's one payment. */
export function linkManualEntry(state: AppState, m: SimilarMatch, entry: Entry, now: string = nowIso()): AppState | null {
  const bill = state.bills.find((b) => b.id === m.occ.billId);
  if (!bill) return null;
  const occ = getOccurrence(bill, m.occ.dueDate);
  if (occ.linkedEntryId) return null; // would double count — caller must use Open existing / Add another
  const e: Entry = { ...entry, billId: bill.id, occurrenceId: occ.occurrenceId };
  let s: AppState = { ...state, entries: [...state.entries, e] };
  s = mapBill(s, bill.id, (b) =>
    withLog(
      upsertOcc(b, { ...occ, status: 'paid', linkedEntryId: e.id, paidAt: occ.paidAt ?? now }),
      logLine('linked-manual', now, occ, { entryId: e.id, amount: e.amount, note: `Linked manual ${describeEntry(state, e)}` }),
    ),
  );
  return s;
}

/** Link an entry that is ALREADY in the ledger as this occurrence's payment (no new money). */
export function linkExistingEntry(
  state: AppState,
  billId: string,
  dueDate: string,
  entryId: string,
  now: string = nowIso(),
  note = 'Linked existing entry',
): AppState | null {
  const bill = state.bills.find((b) => b.id === billId);
  const e = state.entries.find((x) => x.id === entryId);
  if (!bill || !e) return null;
  const occ = getOccurrence(bill, dueDate);
  if (occ.linkedEntryId) return null;
  return mapBill(state, billId, (b) =>
    withLog(
      upsertOcc(b, { ...occ, status: 'paid', linkedEntryId: e.id, paidAt: occ.paidAt ?? now }),
      logLine('linked-manual', now, occ, { entryId: e.id, amount: e.amount, note: `${note}: ${describeEntry(state, e)}` }),
    ),
  );
}

/** "Add another payment": the user explicitly says this is an additional payment. */
export function addAnotherPayment(state: AppState, m: SimilarMatch, entry: Entry, now: string = nowIso()): AppState {
  const bill = state.bills.find((b) => b.id === m.occ.billId);
  if (!bill) return { ...state, entries: [...state.entries, entry] };
  const occ = getOccurrence(bill, m.occ.dueDate);
  const e: Entry = { ...entry, billId: bill.id, occurrenceId: occ.occurrenceId };
  let s: AppState = { ...state, entries: [...state.entries, e] };
  s = mapBill(s, bill.id, (b) =>
    withLog(
      upsertOcc(b, { ...occ, extraEntryIds: [...(occ.extraEntryIds ?? []), e.id] }),
      logLine('user-corrected', now, occ, {
        entryId: e.id,
        amount: e.amount,
        note: `Added another payment (user override): ${describeEntry(state, e)}`,
      }),
    ),
  );
  return s;
}

/** Existing unlinked ledger expenses that look like a payment of this occurrence (reverse guard for Mark paid). */
export function findSimilarEntriesForOccurrence(state: AppState, billId: string, dueDate: string): Entry[] {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return [];
  const linked = new Set(occurrenceIndexByEntry(state.bills).keys());
  const tab = billTabId(state, bill);
  return state.entries.filter((e) => {
    if (e.type !== 'expense' || linked.has(e.id)) return false;
    const gap = Math.abs(daysBetween(dueDate, e.date));
    if (gap > 5) return false;
    const identity = entryMatchesBillIdentity(state, bill, e);
    const amountEq = Math.abs(cents(e.amount) - cents(bill.amountExpected)) <= 1;
    return (identity && (gap === 0 || amountEq)) || (tab === e.tabId && amountEq);
  });
}

// ---------------------------------------------------------------- migration (schema ≤2 → 3)

type RawBill = Partial<Bill> & { statusByDate?: Record<string, LegacyBillStatus> };

/**
 * Convert a stored bill into the occurrence model. Old per-date statuses become
 * occurrences (nothing lost; the original map is kept in legacyStatusByDate).
 * A migrated `paid` occurrence is auto-linked only to a single unambiguous
 * matching expense (same bill, amount ±$0.01, within 5 days). Entries are never modified.
 */
export function migrateBills(rawBills: unknown[], state: AppState, now: string = nowIso()): Bill[] {
  const claimed = new Set<string>();
  const fromLegacy = new Set<string>();
  const out: Bill[] = [];
  for (const r of rawBills) {
    if (!r || typeof r !== 'object') continue;
    const raw = r as RawBill;
    const base: Bill = {
      id: String(raw.id ?? uuid()),
      name: String(raw.name ?? 'Bill'),
      columnId: raw.columnId,
      amountExpected: Number.isFinite(Number(raw.amountExpected)) ? Number(raw.amountExpected) : 0,
      dueDay: Number(raw.dueDay) || 0,
      frequency: (['weekly', 'monthly', 'yearly', 'once'] as const).includes(raw.frequency as never)
        ? (raw.frequency as Bill['frequency'])
        : 'monthly',
      nextDueDate: isValidYMD(raw.nextDueDate) ? raw.nextDueDate : localToday(),
      payee: raw.payee ?? '',
      payMethod: raw.payMethod ?? '',
      payUrl: raw.payUrl ?? '',
      notes: raw.notes ?? '',
      color: raw.color ?? '#ef4444',
      occurrences: [],
      log: [],
      ...(raw.legacyStatusByDate ? { legacyStatusByDate: raw.legacyStatusByDate } : {}),
    };
    if (Array.isArray(raw.occurrences)) {
      base.occurrences = raw.occurrences
        .filter((o) => o && isValidYMD(o.dueDate))
        .map((o) => ({
          ...o,
          occurrenceId: occId(base.id, o.dueDate),
          billId: base.id,
          status: (['scheduled', 'due', 'paid', 'skipped', 'cancelled'] as const).includes(o.status) ? o.status : 'scheduled',
          linkedEntryId: typeof o.linkedEntryId === 'string' ? o.linkedEntryId : null,
        }));
      base.log = Array.isArray(raw.log) ? raw.log.filter((l) => l && typeof l.action === 'string') : [];
      for (const o of base.occurrences) if (o.linkedEntryId) claimed.add(o.linkedEntryId);
      out.push(base);
      continue;
    }
    // ---- legacy statusByDate
    const legacy = raw.statusByDate && typeof raw.statusByDate === 'object' ? raw.statusByDate : {};
    let bill: Bill = Object.keys(legacy).length ? { ...base, legacyStatusByDate: { ...legacy } } : base;
    fromLegacy.add(bill.id);
    for (const [date, st] of Object.entries(legacy).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!isValidYMD(date)) continue;
      const o = defaultOccurrence(bill, date);
      const migrated = `migrated from saved status "${st}"`;
      if (st === 'paid') {
        bill = withLog(upsertOcc(bill, { ...o, status: 'paid', paidAt: null }), logLine('paid-reminder-only', now, o, { note: `${migrated} (time not recorded)` }));
      } else if (st === 'skipped') {
        bill = withLog(upsertOcc(bill, { ...o, status: 'skipped' }), logLine('skipped', now, o, { note: migrated }));
      } else if (st === 'due') {
        bill = withLog(upsertOcc(bill, { ...o, status: 'due' }), logLine('marked-due', now, o, { note: migrated }));
      } else if (st === 'overdue') {
        bill = withLog(upsertOcc(bill, o), logLine('marked-overdue', now, o, { note: migrated }));
      } else {
        bill = withLog(upsertOcc(bill, o), logLine('scheduled', now, o, { note: migrated }));
      }
    }
    out.push(bill);
  }
  // Auto-link migrated paid occurrences to one unambiguous existing expense.
  const tmp: AppState = { ...state, bills: out };
  for (let i = 0; i < out.length; i++) {
    let bill = out[i];
    const legacy = bill.legacyStatusByDate;
    if (!legacy || !fromLegacy.has(bill.id)) continue;
    for (const o of bill.occurrences) {
      if (o.status !== 'paid' || o.linkedEntryId || legacy[o.dueDate] !== 'paid') continue;
      const cands = state.entries.filter(
        (e) =>
          e.type === 'expense' &&
          !claimed.has(e.id) &&
          Math.abs(daysBetween(o.dueDate, e.date)) <= 5 &&
          Math.abs(cents(e.amount) - cents(bill.amountExpected)) <= 1 &&
          entryMatchesBillIdentity(tmp, bill, e),
      );
      if (cands.length !== 1) continue;
      claimed.add(cands[0].id);
      bill = withLog(
        upsertOcc(bill, { ...o, linkedEntryId: cands[0].id }),
        logLine('linked-manual', now, o, {
          entryId: cands[0].id,
          amount: cands[0].amount,
          note: `auto-linked during migration: ${describeEntry(state, cands[0])} (same bill, amount, within 5 days)`,
        }),
      );
    }
    out[i] = bill;
  }
  return out;
}
