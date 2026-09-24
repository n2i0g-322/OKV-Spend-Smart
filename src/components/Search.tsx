import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import type { AppState } from '../types';
import { formatMoney, formatShortDate } from '../date';

interface Props {
  state: AppState;
  onJump: (date: string, entryId: string) => void;
  onClose: () => void;
}

export function SearchModal({ state, onJump, onClose }: Props) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return state.entries
      .filter((e) => {
        const tab = state.tabs.find((t) => t.id === e.tabId)?.name ?? '';
        const col = state.columns.find((c) => c.id === e.columnId)?.name ?? '';
        const hay = `${e.memo} ${tab} ${col} ${e.amount} ${e.type}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 40);
  }, [q, state]);

  return (
    <Modal title="Search" onClose={onClose} wide>
      <input
        className="search-input"
        autoFocus
        placeholder="Memo, tab, column, amount…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="search-results">
        {results.map((e) => {
          const tab = state.tabs.find((t) => t.id === e.tabId)?.name ?? '';
          const col = state.columns.find((c) => c.id === e.columnId)?.name ?? '';
          return (
            <li key={e.id}>
              <button
                type="button"
                className="search-hit"
                onClick={() => onJump(e.date, e.id)}
              >
                <span>{formatShortDate(e.date)}</span>
                <span>
                  {tab} → {col}
                </span>
                <span>{formatMoney(e.amount)}</span>
                <span className="muted">{e.memo || e.type}</span>
              </button>
            </li>
          );
        })}
        {q && results.length === 0 && <li className="muted">No matches.</li>}
      </ul>
    </Modal>
  );
}
