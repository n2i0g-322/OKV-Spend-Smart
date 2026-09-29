import { useMemo, useState } from 'react';
import type { AppState, BillFrequency, PayFrequency } from '../types';
import { Modal } from './Modal';
import { PAY_FREQ_LABEL } from './BillsView';
import { addDays, formatMoney, formatShortDate, isValidYMD, localToday } from '../date';
import { parseAmount, scheduledPaydays } from '../money';
import { addSetupBills, applyPaySetup, expectedFromPaycheck, type BillDraftRow } from '../setup';

/**
 * First-run / new-account setup wizard. Planning only: sets the Box 3 payday schedule and
 * creates bill reminders through the normal bill model. It NEVER creates income or expense entries.
 * Each "Next" commits (and saves) that step immediately; Skip moves on without changing anything.
 * Finishing, skipping to the end, or closing marks setup done for this account.
 */

interface Props {
  accountName: string;
  state: AppState;
  onRename: (name: string) => void;
  onCommit: (next: AppState) => void;
  /** Finish / close: mark setupDone for this account. */
  onDone: () => void;
  /** "Restore from a backup instead": close (setup done) and open Import. */
  onRestore: () => void;
}

const FREQS: PayFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const BILL_FREQ: { id: BillFrequency; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'once', label: 'One-time' },
];
const STEP_TITLES = ['Welcome', 'Paycheck', 'Bills', 'Summary'];

interface Row {
  key: string;
  name: string;
  amount: string;
  dueDate: string;
  frequency: BillFrequency;
  payMethod: string;
  columnId: string;
}

const newRow = (today: string): Row => ({
  key: Math.random().toString(36).slice(2),
  name: '',
  amount: '',
  dueDate: today,
  frequency: 'monthly',
  payMethod: '',
  columnId: '',
});

export function SetupWizard({ accountName, state, onRename, onCommit, onDone, onRestore }: Props) {
  const today = localToday();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(accountName);
  const [payAmount, setPayAmount] = useState(
    state.paySchedule?.amount ? state.paySchedule.amount.toFixed(2) : '',
  );
  const [payFreq, setPayFreq] = useState<PayFrequency>(state.paySchedule?.frequency ?? 'biweekly');
  const [payAnchor, setPayAnchor] = useState(state.paySchedule?.anchor ?? today);
  const [payError, setPayError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => [newRow(today)]);
  const [billErrors, setBillErrors] = useState<Record<string, string>>({});
  const [addedBillIds, setAddedBillIds] = useState<string[]>([]);

  const billsTab = state.tabs.find((t) => t.name === 'Bills' && !t.isIncome);
  const billColumns = state.columns.filter((c) => c.tabId === billsTab?.id).sort((a, b) => a.order - b.order);
  const addedBills = state.bills.filter((b) => addedBillIds.includes(b.id));

  const nextPaydays = useMemo(
    () => (state.paySchedule ? scheduledPaydays(state.paySchedule, today, addDays(today, 62)).slice(0, 3) : []),
    [state.paySchedule, today],
  );

  const commitName = () => {
    const n = name.trim();
    if (n && n !== accountName) onRename(n);
  };

  const commitPay = (): boolean => {
    const amt = payAmount.trim() === '' ? 0 : parseAmount(payAmount);
    if (amt == null) {
      setPayError('Enter an amount like 1250.00, or Skip.');
      return false;
    }
    if (!isValidYMD(payAnchor)) {
      setPayError('Pick a payday date, or Skip.');
      return false;
    }
    setPayError(null);
    onCommit(applyPaySetup(state, { amount: amt, frequency: payFreq, anchor: payAnchor }));
    return true;
  };

  const commitBills = (): boolean => {
    const errs: Record<string, string> = {};
    const ready: { row: Row; draft: BillDraftRow }[] = [];
    for (const r of rows) {
      const blank = !r.name.trim() && !r.amount.trim() && !r.payMethod.trim();
      if (blank) continue;
      const amt = r.amount.trim() === '' ? 0 : parseAmount(r.amount);
      if (!r.name.trim()) errs[r.key] = 'Give this bill a name.';
      else if (amt == null) errs[r.key] = 'Amount must be a number like 89.99.';
      else if (!isValidYMD(r.dueDate)) errs[r.key] = 'Pick a due date.';
      else
        ready.push({
          row: r,
          draft: {
            name: r.name,
            amount: amt,
            dueDate: r.dueDate,
            frequency: r.frequency,
            payMethod: r.payMethod,
            columnId: r.columnId || undefined,
          },
        });
    }
    setBillErrors(errs);
    if (Object.keys(errs).length) return false;
    if (ready.length) {
      const res = addSetupBills(state, ready.map((x) => x.draft), { today });
      onCommit(res.state);
      setAddedBillIds((ids) => [...ids, ...res.billIds]);
    }
    setRows([newRow(today)]);
    return true;
  };

  const next = () => {
    if (step === 0) commitName();
    if (step === 1 && !commitPay()) return;
    if (step === 2 && !commitBills()) return;
    setStep((s) => Math.min(3, s + 1));
  };
  const skip = () => {
    setPayError(null);
    setBillErrors({});
    setStep((s) => Math.min(3, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const payPreview = (() => {
    const amt = parseAmount(payAmount);
    if (!amt) return null;
    const exp = expectedFromPaycheck({ amount: amt, frequency: payFreq, anchor: payAnchor });
    return `Box 3 plan: ${formatMoney(exp.amount)} ${exp.frequency === 'daily' ? 'per day' : 'per month'}`;
  })();

  return (
    <Modal
      title={step === 0 ? 'Welcome to OKV Spend Smart' : `Setup — ${STEP_TITLES[step]}`}
      onClose={onDone}
      wide
      backdropClose={false}
      testId="setup-wizard"
    >
      <ol className="wizard-steps" aria-label="Setup steps">
        {STEP_TITLES.map((t, i) => (
          <li key={t} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <span className="num">{i + 1}</span> <span className="lbl">{t}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div data-testid="wizard-step-welcome">
          <p>
            Let’s set up <strong>{accountName}</strong> in under a minute: your paycheck schedule and a few
            bills. Everything here is <strong>planning only</strong> — no money is added until you record it.
          </p>
          <label className="field">
            Account name
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              data-testid="wizard-name"
              onKeyDown={(e) => e.key === 'Enter' && next()}
            />
          </label>
          <p className="muted small">
            Already have a backup file?{' '}
            <button type="button" className="linkish" onClick={onRestore} data-testid="wizard-restore">
              Restore from a backup instead
            </button>
          </p>
        </div>
      )}

      {step === 1 && (
        <div data-testid="wizard-step-pay">
          <p className="muted small">
            Your expected paycheck puts <strong>payday markers</strong> on the calendars (Box 3 schedule). It is
            not income — use “Add funds received” when the money actually arrives.
          </p>
          <div className="wizard-grid">
            <label className="field">
              Paycheck amount (CAD)
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                data-testid="wizard-pay-amount"
              />
            </label>
            <label className="field">
              How often
              <select
                value={payFreq}
                onChange={(e) => setPayFreq(e.target.value as PayFrequency)}
                data-testid="wizard-pay-freq"
              >
                {FREQS.map((f) => (
                  <option key={f} value={f}>
                    {PAY_FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Next (or last) payday
              <input
                type="date"
                value={payAnchor}
                onChange={(e) => setPayAnchor(e.target.value)}
                data-testid="wizard-pay-anchor"
              />
            </label>
          </div>
          {payPreview && <p className="muted small">{payPreview} (planning only)</p>}
          {payError && <p className="form-error">{payError}</p>}
        </div>
      )}

      {step === 2 && (
        <div data-testid="wizard-step-bills">
          <p className="muted small">
            Add the bills you pay regularly. They show on the Bills calendar with reminders — no expense is
            recorded until you mark one paid and choose to record it.
          </p>
          {addedBills.length > 0 && (
            <ul className="wizard-added" data-testid="wizard-added">
              {addedBills.map((b) => (
                <li key={b.id}>
                  ✓ {b.name} — {formatMoney(b.amountExpected)} · {b.frequency === 'once' ? 'one-time' : b.frequency} from{' '}
                  {b.nextDueDate}
                </li>
              ))}
            </ul>
          )}
          {rows.map((r, i) => (
            <div key={r.key} className="wizard-bill-row" data-testid="wizard-bill-row">
              <label className="field">
                Bill name
                <input
                  value={r.name}
                  placeholder={i === 0 ? 'Rent' : 'Phone'}
                  onChange={(e) => patchRow(r.key, { name: e.target.value })}
                  data-testid="wizard-bill-name"
                />
              </label>
              <label className="field">
                Amount
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={r.amount}
                  onChange={(e) => patchRow(r.key, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                  data-testid="wizard-bill-amount"
                />
              </label>
              <label className="field">
                Due date
                <input
                  type="date"
                  value={r.dueDate}
                  onChange={(e) => patchRow(r.key, { dueDate: e.target.value })}
                  data-testid="wizard-bill-due"
                />
              </label>
              <label className="field">
                Repeats
                <select
                  value={r.frequency}
                  onChange={(e) => patchRow(r.key, { frequency: e.target.value as BillFrequency })}
                  data-testid="wizard-bill-freq"
                >
                  {BILL_FREQ.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Pay method (optional)
                <input
                  value={r.payMethod}
                  placeholder="e.g. Rent Cafe"
                  onChange={(e) => patchRow(r.key, { payMethod: e.target.value })}
                  data-testid="wizard-bill-method"
                />
              </label>
              {billColumns.length > 0 && (
                <label className="field">
                  Bills column
                  <select value={r.columnId} onChange={(e) => patchRow(r.key, { columnId: e.target.value })}>
                    <option value="">Auto (Bills → bill name)</option>
                    {billColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                className="btn ghost sm wizard-remove"
                aria-label={`Remove bill row ${i + 1}`}
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow(today)]))}
              >
                Remove
              </button>
              {billErrors[r.key] && <p className="form-error wizard-row-error">{billErrors[r.key]}</p>}
            </div>
          ))}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setRows((rs) => [...rs, newRow(today)])}
            data-testid="wizard-add-bill"
          >
            + Add another bill
          </button>
        </div>
      )}

      {step === 3 && (
        <div data-testid="wizard-step-summary">
          <ul className="wizard-summary">
            <li>
              <strong>Account:</strong> {accountName}
            </li>
            <li>
              <strong>Paycheck:</strong>{' '}
              {state.paySchedule
                ? `${state.paySchedule.amount ? formatMoney(state.paySchedule.amount) + ' · ' : ''}${PAY_FREQ_LABEL[state.paySchedule.frequency]} from ${state.paySchedule.anchor}`
                : 'Not set (you can set it later in Box 3)'}
              {nextPaydays.length > 0 && (
                <span className="muted small"> — next markers: {nextPaydays.map(formatShortDate).join(', ')}</span>
              )}
            </li>
            <li>
              <strong>Bills:</strong>{' '}
              {state.bills.length
                ? state.bills.map((b) => `${b.name} ${formatMoney(b.amountExpected)}`).join(', ')
                : 'None yet (add them any time in the Bills view)'}
            </li>
          </ul>
          <p className="muted small">
            Nothing above is money: your totals stay at {formatMoney(0)} until you add real entries.
          </p>
        </div>
      )}

      <div className="modal-actions wizard-actions">
        {step > 0 && (
          <button type="button" className="btn ghost" onClick={back} data-testid="wizard-back">
            Back
          </button>
        )}
        <span className="spacer" />
        {step < 3 && (
          <button type="button" className="btn ghost" onClick={skip} data-testid="wizard-skip">
            Skip
          </button>
        )}
        {step < 3 ? (
          <button type="button" className="btn primary" onClick={next} data-testid="wizard-next">
            {step === 0 ? 'Start' : step === 2 ? 'Save bills & continue' : 'Save & continue'}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onDone} data-testid="wizard-finish">
            Finish
          </button>
        )}
      </div>
    </Modal>
  );
}
