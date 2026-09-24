import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { isValidYMD, localToday } from '../date';
import { parseAmount } from '../money';
import type { ExpectedFrequency } from '../types';

interface Props {
  defaultAmount: number;
  expectedFrequency?: ExpectedFrequency;
  defaultDate: string;
  onConfirm: (amount: number, date: string, memo: string) => void;
  onClose: () => void;
}

export function AddFunds({
  defaultAmount,
  expectedFrequency,
  defaultDate,
  onConfirm,
  onClose,
}: Props) {
  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : '',
  );
  const [date, setDate] = useState(defaultDate || localToday());
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  const submit = () => {
    if (submitted.current) return; // guard against double-click creating two income entries
    const n = parseAmount(amount);
    if (n == null || n <= 0) {
      setError('Enter an amount greater than $0.00.');
      return;
    }
    if (!isValidYMD(date)) {
      setError('Pick the date the money was received.');
      return;
    }
    submitted.current = true;
    onConfirm(n, date, memo.trim());
  };

  return (
    <Modal title="Add funds received" onClose={onClose}>
      <p className="muted small">
        Creates actual income. Expected income in Box 3 is not changed.
      </p>
      <label className="field">
        <span>Amount</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
      </label>
      {defaultAmount > 0 && expectedFrequency && expectedFrequency !== 'monthly' && (
        <p className="muted tiny">
          Pre-filled from your {expectedFrequency} expected amount — change it to what you actually
          received.
        </p>
      )}
      <label className="field">
        <span>Date received</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
        />
      </label>
      <label className="field">
        <span>Memo (optional)</span>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Paycheque, transfer…"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={submit}>
          Confirm
        </button>
      </div>
    </Modal>
  );
}
