import { useState } from 'react';
import { localToday } from '../date';

interface Props {
  defaultDate: string;
  onAdd: (amount: number, memo: string, date: string) => void;
}

export function QuickAdd({ defaultDate, onAdd }: Props) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(defaultDate || localToday());

  // keep date in sync when selected day changes
  if (date !== defaultDate && document.activeElement?.tagName !== 'INPUT') {
    // avoid fighting user — only sync via effect-like pattern below
  }

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    onAdd(Math.round(n * 100) / 100, memo.trim(), date || defaultDate);
    setAmount('');
    setMemo('');
  };

  return (
    <div className="quick-add">
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        type="text"
        placeholder="Memo / payee"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        type="date"
        value={date || defaultDate}
        onChange={(e) => setDate(e.target.value)}
      />
      <button type="button" className="btn primary" onClick={submit}>
        + Add
      </button>
    </div>
  );
}
