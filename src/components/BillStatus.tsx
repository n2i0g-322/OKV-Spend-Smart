import { useMemo, useState } from 'react';
import type { AppState, Bill, BillLogEntry, Entry, OccurrenceStatus } from '../types';
import { daysBetween, formatLocalDateTime, formatMoney, formatShortDate, isValidYMD, localToday } from '../date';
import { parseAmount } from '../money';
import {
  defaultPaymentDate,
  findSimilarEntriesForOccurrence,
  lastPaid,
  linkExistingEntry,
  markPaidRecord,
  markPaidReminder,
  occurrenceAmount,
  setOccurrenceStatus,
  viewOf,
  type OccurrenceView,
  type SimilarMatch,
} from '../bills';
import { Modal } from './Modal';

export const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  scheduled: 'scheduled',
  due: 'due',
  overdue: 'overdue',
  paid: 'paid',
  skipped: 'skipped',
  cancelled: 'cancelled',
};

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function lastPaidText(bill: Bill): string {
  const lp = lastPaid(bill);
  if (!lp) return 'Never paid';
  if (lp.at) return `Last paid: ${formatLocalDateTime(lp.at)} (due ${lp.dueDate})`;
  return `Last paid: due ${lp.dueDate} (time not recorded)`;
}

function describeLog(l: BillLogEntry): string {
  const parts = [formatLocalDateTime(l.at), l.action];
  if (l.dueDate) parts.push(`due ${l.dueDate}`);
  if (typeof l.amount === 'number') parts.push(formatMoney(l.amount));
  if (l.note) parts.push(l.note);
  return parts.join(' · ');
}

/** Append-only action log (newest last). */
export function BillLog({ bill, limit = 10, occurrenceId }: { bill: Bill; limit?: number; occurrenceId?: string }) {
  const [all, setAll] = useState(false);
  const lines = occurrenceId ? bill.log : bill.log;
  const shown = all ? lines : lines.slice(-limit);
  return (
    <div className="bill-log">
      <div className="bill-log-head">
        <strong>Action log</strong>
        <span className="muted tiny">
          {lines.length === 0 ? 'no entries' : all ? `all ${lines.length}` : `last ${shown.length} of ${lines.length}`}
        </span>
        {lines.length > limit && (
          <button type="button" className="linkish tiny" onClick={() => setAll(!all)}>
            {all ? 'show last 10' : 'show all'}
          </button>
        )}
      </div>
      <ol className="bill-log-lines">
        {shown.map((l, i) => (
          <li key={`${l.at}-${i}`} className={occurrenceId && l.occurrenceId === occurrenceId ? 'hl' : ''}>
            {describeLog(l)}
          </li>
        ))}
      </ol>
    </div>
  );
}

interface OccProps {
  state: AppState;
  billId: string;
  dueDate: string;
  onCommit: (s: AppState) => void;
  onClose: () => void;
  onOpenEntry?: (date: string, entryId: string) => void;
}

/** Open / correct one bill occurrence. Shows status, last paid, and the log. */
export function OccurrenceModal({ state, billId, dueDate, onCommit, onClose, onOpenEntry }: OccProps) {
  const today = localToday();
  const bill = state.bills.find((b) => b.id === billId);
  const occ = bill ? viewOf(bill, dueDate, today) : null;
  const [mode, setMode] = useState<'record' | 'reminder'>('record');
  const [amount, setAmount] = useState(bill ? bill.amountExpected.toFixed(2) : '');
  const [date, setDate] = useState(defaultPaymentDate(dueDate, today));
  const [similar, setSimilar] = useState<Entry[] | null>(null);
  const [removePayment, setRemovePayment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entryById = useMemo(() => new Map(state.entries.map((e) => [e.id, e])), [state.entries]);
  if (!bill || !occ) return null;
  const linked = occ.linkedEntryId ? entryById.get(occ.linkedEntryId) : undefined;
  const extras = (occ.extraEntryIds ?? []).map((id) => entryById.get(id)).filter(Boolean) as Entry[];
  const late = occ.effective === 'overdue' ? daysBetween(occ.dueDate, today) : 0;

  const doRecord = (force = false) => {
    const n = parseAmount(amount);
    if (n == null || n <= 0) return setError('Enter an amount greater than $0.00.');
    if (!isValidYMD(date)) return setError('Pick the payment date.');
    if (!force) {
      const sim = findSimilarEntriesForOccurrence(state, bill.id, dueDate);
      if (sim.length) {
        setSimilar(sim);
        return;
      }
    }
    const r = markPaidRecord(state, bill.id, dueDate, { amount: n, date, force: force && !!occ.linkedEntryId });
    if (r) onCommit(r.state);
    setSimilar(null);
  };

  const describe = (e: Entry) => {
    const tab = state.tabs.find((t) => t.id === e.tabId)?.name ?? '?';
    const col = state.columns.find((c) => c.id === e.columnId)?.name ?? '?';
    return `${tab} → ${col} ${formatMoney(e.amount)} on ${formatShortDate(e.date)} (${e.source})`;
  };

  return (
    <Modal title={`${bill.name} — due ${dueDate}`} onClose={onClose} wide>
      <div className="occ-summary" data-testid="occ-summary">
        <strong style={{ color: bill.color }}>🔔 {bill.name}</strong>
        <span>{formatMoney(occurrenceAmount(state, occ, bill))}</span>
        <span>due {formatShortDate(dueDate)}, {dueDate.slice(0, 4)}</span>
        <StatusBadge status={occ.effective} />
        {late > 0 && <span className="muted small">{late} day{late === 1 ? '' : 's'} overdue</span>}
      </div>
      <p className="small">{lastPaidText(bill)}</p>
      <p className="muted small">
        Bill reminders and overdue items are not money. Only a recorded payment enters the ledger.
        {bill.payee && <> · Payee: {bill.payee}</>}
        {bill.payMethod && <> · Method: {bill.payMethod}</>}
      </p>
      {linked && (
        <p className="small linked-row">
          🔗 Payment: {describe(linked)}{' '}
          {onOpenEntry && (
            <button type="button" className="linkish" onClick={() => onOpenEntry(linked.date, linked.id)}>
              open in Day view
            </button>
          )}
        </p>
      )}
      {extras.map((e) => (
        <p key={e.id} className="small linked-row">
          ➕ Extra payment (user override): {describe(e)}
        </p>
      ))}

      {occ.status !== 'paid' && !similar && (
        <fieldset className="markpaid">
          <legend>Mark paid</legend>
          <label className="radio">
            <input type="radio" name="mp" checked={mode === 'record'} onChange={() => setMode('record')} /> Record payment
            (default) — creates one expense
          </label>
          <label className="radio">
            <input type="radio" name="mp" checked={mode === 'reminder'} onChange={() => setMode('reminder')} /> Reminder only —
            no money
          </label>
          {mode === 'record' && (
            <div className="row-actions">
              <label className="field inline">
                <span>Amount</span>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} />
              </label>
              <label className="field inline">
                <span>Paid on</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions">
            <button
              type="button"
              className="btn primary sm"
              data-testid="mark-paid"
              autoFocus
              onClick={() => (mode === 'record' ? doRecord() : onCommit(markPaidReminder(state, bill.id, dueDate)))}
            >
              Mark paid
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'skipped'))}>
              Skip
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'cancelled'))}>
              Cancel occurrence
            </button>
            {occ.status !== 'scheduled' && (
              <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'scheduled'))}>
                Reopen (scheduled)
              </button>
            )}
          </div>
        </fieldset>
      )}

      {similar && (
        <div className="dup-warning" role="alert">
          <strong>A similar expense is already in the ledger.</strong>
          <ul>
            {similar.map((e) => (
              <li key={e.id}>{describe(e)}</li>
            ))}
          </ul>
          <p className="small">Recording another payment would count this bill twice.</p>
          <div className="row-actions">
            <button
              type="button"
              className="btn primary sm"
              autoFocus
              onClick={() => {
                const s = linkExistingEntry(state, bill.id, dueDate, similar[0].id);
                if (s) onCommit(s);
                setSimilar(null);
              }}
            >
              Link existing entry
            </button>
            <button type="button" className="btn ghost sm" onClick={() => doRecord(true)}>
              Record another payment
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setSimilar(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {occ.status === 'paid' && (
        <fieldset className="markpaid">
          <legend>Correct</legend>
          {linked?.source === 'bill-paid' && (
            <label className="radio">
              <input type="checkbox" checked={removePayment} onChange={(e) => setRemovePayment(e.target.checked)} /> Also remove
              the recorded payment ({formatMoney(linked.amount)}) if I reopen/skip/cancel
            </label>
          )}
          <div className="row-actions">
            <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'scheduled', { removePayment }))}>
              Not paid — reopen
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'skipped', { removePayment }))}>
              Mark skipped
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onCommit(setOccurrenceStatus(state, bill.id, dueDate, 'cancelled', { removePayment }))}>
              Mark cancelled
            </button>
          </div>
        </fieldset>
      )}

      <BillLog bill={bill} occurrenceId={occ.occurrenceId} />
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

interface DupProps {
  state: AppState;
  entry: Entry;
  matches: SimilarMatch[];
  onOpenExisting: (m: SimilarMatch) => void;
  onLink: (m: SimilarMatch) => void;
  onAddAnother: (m: SimilarMatch) => void;
  onCancel: () => void;
}

/** Blocks a manual save that looks like an existing bill occurrence. Never silently double-counts. */
export function DuplicateDialog({ state, entry, matches, onOpenExisting, onLink, onAddAnother, onCancel }: DupProps) {
  const [i, setI] = useState(0);
  const m = matches[Math.min(i, matches.length - 1)];
  const bill = state.bills.find((b) => b.id === m.occ.billId) ?? m.occ.bill;
  const occ = viewOf(bill, m.occ.dueDate);
  const tab = state.tabs.find((t) => t.id === entry.tabId)?.name ?? '?';
  const col = state.columns.find((c) => c.id === entry.columnId)?.name ?? '?';
  const alreadyLinked = !!occ.linkedEntryId;
  return (
    <Modal title="Possible duplicate — not saved yet" onClose={onCancel} wide>
      <div className="dup-dialog" data-testid="dup-dialog">
        <p>
          You are adding <strong>{formatMoney(entry.amount)}</strong> to {tab} → {col} on {entry.date}. It looks like this bill
          ({m.reasonText}):
        </p>
        <div className="occ-summary">
          <strong style={{ color: bill.color }}>🔔 {bill.name}</strong>
          <span>{formatMoney(m.amount)}</span>
          <span>due {occ.dueDate}</span>
          <StatusBadge status={occ.effective} />
        </div>
        <p className="small" data-testid="dup-lastpaid">{lastPaidText(bill)}</p>
        {matches.length > 1 && (
          <p className="muted small">
            {matches.length} similar bill occurrences.{' '}
            <button type="button" className="linkish" onClick={() => setI((i + 1) % matches.length)}>
              show next
            </button>
          </p>
        )}
        <BillLog bill={bill} occurrenceId={occ.occurrenceId} />
        <div className="modal-actions">
          <button type="button" className="btn primary" autoFocus data-testid="dup-open" onClick={() => onOpenExisting(m)}>
            Open existing
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={alreadyLinked}
            title={alreadyLinked ? 'This occurrence already has its payment — use Open existing or Add another payment' : ''}
            onClick={() => onLink(m)}
          >
            Link to this bill
          </button>
          <button type="button" className="btn ghost" data-testid="dup-another" onClick={() => onAddAnother(m)}>
            Add another payment
          </button>
          <button type="button" className="btn ghost" data-testid="dup-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Bills banner "N overdue" + list that stays the same when the viewed month/year changes. */
export function OverduePanel({
  list,
  state,
  onOpen,
}: {
  list: OccurrenceView[];
  state: AppState;
  onOpen: (billId: string, dueDate: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const today = localToday();
  if (!list.length) return null;
  return (
    <div className="overdue-panel card" data-testid="overdue-panel">
      <button type="button" className="overdue-banner" onClick={() => setOpen(!open)}>
        ⚠ {list.length} overdue <span className="muted small">(as of today {today} — not money until paid)</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="overdue-list">
          {list.map((o) => (
            <li key={o.occurrenceId}>
              <strong style={{ color: o.bill.color }}>{o.bill.name}</strong>
              <span>{formatMoney(occurrenceAmount(state, o, o.bill))}</span>
              <span>due {o.dueDate}</span>
              <StatusBadge status={o.effective} />
              <span className="muted tiny">{daysBetween(o.dueDate, today)} days</span>
              <button type="button" className="btn ghost sm" onClick={() => onOpen(o.billId, o.dueDate)}>
                Open / correct
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
