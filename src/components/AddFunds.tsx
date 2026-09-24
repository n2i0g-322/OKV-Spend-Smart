import { useState } from 'react';
import { Modal } from './Modal';
import { localToday } from '../date';

interface Props {
  defaultAmount: number;
  defaultDate: string;
  onConfirm: (amount: number, date: string, memo: string) => void;
  onClose: () => void;
}

export function AddFunds({ defaultAmount, defaultDate, onConfirm, onClose }: Props) {
  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : '',
  );
  const [date, setDate] = useState(defaultDate || localToday());
  const [memo, setMemo] = useState('');

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
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </label>
      <label className="field">
        <span>Date received</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const n = Number(amount);
            if (!Number.isFinite(n) || n <= 0) return;
            onConfirm(Math.round(n * 100) / 100, date, memo.trim());
          }}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
