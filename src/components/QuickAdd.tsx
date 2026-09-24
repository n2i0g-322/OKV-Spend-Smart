import { useEffect, useState } from 'react';
import { isValidYMD, localToday } from '../date';

interface Props {
  defaultDate: string;
  onAdd: (amount: number, memo: string, date: string) => void;
}

export function QuickAdd({ defaultDate, onAdd }: Props) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(defaultDate || localToday());

  // Keep the date in sync when the selected day changes (previously it stayed on the
  // first day the view was opened, so entries silently landed on the wrong date).
  useEffect(() => {
    setDate(defaultDate || localToday());
  }, [defaultDate]);

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    const d = isValidYMD(date) ? date : defaultDate;
    onAdd(Math.round(n * 100) / 100, memo.trim(), d);
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
