import type { AppState, BillFrequency, ExpectedIncome, PayFrequency, PaySchedule } from './types';
import { createBill } from './bills';
import { isValidYMD, localToday, monthBounds, parseLocalDate } from './date';

/**
 * Setup wizard helpers (pure). Everything here is PLANNING ONLY:
 * no income or expense entries are ever created.
 */

export interface PaySetup {
  amount: number; // per paycheck, CAD
  frequency: PayFrequency;
  anchor: string; // next or last payday, YYYY-MM-DD local
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Box 3 expected income equivalent of a paycheck (Box 3 only knows daily / monthly / yearly). */
export function expectedFromPaycheck(p: PaySetup): ExpectedIncome {
  const a = Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 0;
  if (p.frequency === 'daily') return { frequency: 'daily', amount: round2(a) };
  if (p.frequency === 'weekly') return { frequency: 'monthly', amount: round2((a * 52) / 12) };
  if (p.frequency === 'biweekly') return { frequency: 'monthly', amount: round2((a * 26) / 12) };
  return { frequency: 'monthly', amount: round2(a) };
}

/** Apply the paycheck step: payday marker schedule + Box 3 expected income. Entries untouched. */
export function applyPaySetup(state: AppState, p: PaySetup): AppState {
  if (!isValidYMD(p.anchor)) return state;
  const amount = Number.isFinite(p.amount) && p.amount > 0 ? round2(p.amount) : 0;
  const paySchedule: PaySchedule = { frequency: p.frequency, anchor: p.anchor, ...(amount > 0 ? { amount } : {}) };
  return {
    ...state,
    paySchedule,
    expectedIncome: amount > 0 ? expectedFromPaycheck({ ...p, amount }) : state.expectedIncome,
  };
}

export interface BillDraftRow {
  name: string;
  amount: number;
  dueDate: string;
  frequency: BillFrequency;
  payMethod?: string;
  columnId?: string;
}

/** Create bills through the normal bill model (log "created" + "scheduled" occurrences). No entries. */
export function addSetupBills(
  state: AppState,
  rows: BillDraftRow[],
  opts: { today?: string; now?: string } = {},
): { state: AppState; billIds: string[] } {
  const today = opts.today ?? localToday();
  const { start, end } = monthBounds(today);
  let s = state;
  const billIds: string[] = [];
  const palette = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name || !isValidYMD(r.dueDate)) continue;
    const res = createBill(
      s,
      {
        name,
        columnId: r.columnId || undefined,
        amountExpected: Number.isFinite(r.amount) && r.amount > 0 ? round2(r.amount) : 0,
        dueDay: parseLocalDate(r.dueDate).getDate(),
        frequency: r.frequency,
        nextDueDate: r.dueDate,
        payee: '',
        payMethod: (r.payMethod ?? '').trim(),
        payUrl: '',
        notes: '',
        color: palette[(s.bills.length) % palette.length],
      },
      { visibleStart: start, visibleEnd: end, today, now: opts.now },
    );
    s = res.state;
    billIds.push(res.bill.id);
  }
  return { state: s, billIds };
}

/** Should the wizard open automatically for this account? */
export function needsSetup(acct: { setupDone?: boolean; data: AppState }): boolean {
  return !acct.setupDone && acct.data.entries.length === 0 && acct.data.bills.length === 0;
}
