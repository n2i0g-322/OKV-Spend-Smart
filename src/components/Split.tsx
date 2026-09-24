import { useState } from 'react';
import { Modal } from './Modal';
import type { Column, Entry, Tab } from '../types';
import { formatMoney } from '../date';

interface SplitLine {
  columnId: string;
  amount: string;
  memo: string;
}

interface Props {
  entry: Entry;
  tabs: Tab[];
  columns: Column[];
  onConfirm: (lines: { columnId: string; amount: number; memo: string }[]) => void;
  onClose: () => void;
}

export function SplitModal({ entry, tabs, columns, onConfirm, onClose }: Props) {
  // Income splits across income columns; expenses/refunds across expense columns.
  const wantIncome = entry.type === 'income';
  const expenseCols = columns.filter((c) => {
    const t = tabs.find((x) => x.id === c.tabId);
    return t && !!t.isIncome === wantIncome;
  });
  // Halve in whole cents so the two default parts always add back to the original ($10.01 → 5.00 + 5.01).
  const totalCents = Math.round(entry.amount * 100);
  const halfCents = Math.floor(totalCents / 2);
  const [lines, setLines] = useState<SplitLine[]>([
    { columnId: entry.columnId, amount: (halfCents / 100).toFixed(2), memo: entry.memo },
    {
      columnId: expenseCols.find((c) => c.id !== entry.columnId)?.id ?? entry.columnId,
      amount: ((totalCents - halfCents) / 100).toFixed(2),
      memo: entry.memo,
    },
  ]);

  const partsCents = lines.reduce((s, l) => s + Math.round((Number(l.amount) || 0) * 100), 0);
  const total = partsCents / 100;
  const ok = partsCents === totalCents && lines.every((l) => Number(l.amount) > 0);

  return (
    <Modal title={`Split ${formatMoney(entry.amount)}`} onClose={onClose} wide>
      <p className="muted small">Replace this entry with parts that sum to the original.</p>
      {lines.map((line, i) => (
        <div className="split-row" key={i}>
          <select
            value={line.columnId}
            onChange={(e) => {
              const next = [...lines];
              next[i] = { ...line, columnId: e.target.value };
              setLines(next);
            }}
          >
            {expenseCols.map((c) => {
              const t = tabs.find((x) => x.id === c.tabId);
              return (
                <option key={c.id} value={c.id}>
                  {t?.name} → {c.name}
                </option>
              );
            })}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            value={line.amount}
            onChange={(e) => {
              const next = [...lines];
              next[i] = { ...line, amount: e.target.value };
              setLines(next);
            }}
          />
          <input
            type="text"
            value={line.memo}
            placeholder="Memo"
            onChange={(e) => {
              const next = [...lines];
              next[i] = { ...line, memo: e.target.value };
              setLines(next);
            }}
          />
          {lines.length > 2 && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn ghost"
        onClick={() =>
          setLines([
            ...lines,
            { columnId: expenseCols[0]?.id ?? entry.columnId, amount: '0.00', memo: '' },
          ])
        }
      >
        + Add part
      </button>
      <p className={ok ? 'muted' : 'warn'}>
        Parts total {formatMoney(total)} / {formatMoney(entry.amount)}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!ok}
          onClick={() =>
            onConfirm(
              lines.map((l) => ({
                columnId: l.columnId,
                amount: Math.round(Number(l.amount) * 100) / 100,
                memo: l.memo,
              })),
            )
          }
        >
          Confirm split
        </button>
      </div>
    </Modal>
  );
}
