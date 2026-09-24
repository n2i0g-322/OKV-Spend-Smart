import { useState } from 'react';
import { Modal } from './Modal';
import type { AppState, MatchType, Rule, RuleAppliesTo } from '../types';
import { testRuleMemo } from '../rules';

interface Props {
  state: AppState;
  onChange: (rules: Rule[]) => void;
  onApplyPast: () => void;
  onClose: () => void;
}

const empty = (): Omit<Rule, 'id'> => ({
  name: '',
  matchField: 'memo',
  matchType: 'contains',
  matchValue: '',
  destinationTabId: '',
  destinationColumnId: '',
  appliesTo: 'expenses',
  priority: 10,
  enabled: true,
});

export function RulesModal({ state, onChange, onApplyPast, onClose }: Props) {
  const [draft, setDraft] = useState<Omit<Rule, 'id'> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [testMemo, setTestMemo] = useState('');
  const [testKind, setTestKind] = useState<'expense' | 'income'>('expense');

  const colsFor = (tabId: string) => state.columns.filter((c) => c.tabId === tabId);
  const hit = testMemo ? testRuleMemo(state.rules, testMemo, testKind) : null;

  const save = () => {
    if (!draft || !draft.name || !draft.matchValue || !draft.destinationTabId || !draft.destinationColumnId)
      return;
    if (editId) {
      onChange(state.rules.map((r) => (r.id === editId ? { ...draft, id: editId } : r)));
    } else {
      onChange([...state.rules, { ...draft, id: crypto.randomUUID() }]);
    }
    setDraft(null);
    setEditId(null);
  };

  return (
    <Modal title="Categorization rules" onClose={onClose} wide>
      <ul className="rules-list">
        {state.rules
          .slice()
          .sort((a, b) => a.priority - b.priority)
          .map((r) => {
            const tab = state.tabs.find((t) => t.id === r.destinationTabId)?.name;
            const col = state.columns.find((c) => c.id === r.destinationColumnId)?.name;
            return (
              <li key={r.id} className="rules-item">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) =>
                      onChange(
                        state.rules.map((x) =>
                          x.id === r.id ? { ...x, enabled: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <strong>{r.name}</strong>
                </label>
                <span className="muted small">
                  {r.matchType} “{r.matchValue}” → {tab} → {col} (prio {r.priority})
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const { id: _id, ...rest } = r;
                      setDraft(rest);
                      setEditId(r.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      if (confirm(`Delete rule “${r.name}”? Already-filed entries stay put.`))
                        onChange(state.rules.filter((x) => x.id !== r.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        {state.rules.length === 0 && <li className="muted">No rules yet.</li>}
      </ul>

      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setDraft({
            ...empty(),
            destinationTabId: state.tabs[0]?.id ?? '',
            destinationColumnId: state.columns[0]?.id ?? '',
            priority: (state.rules.length + 1) * 10,
          });
          setEditId(null);
        }}
      >
        + New rule
      </button>

      {draft && (
        <div className="rule-form">
          <label className="field">
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Match type</span>
            <select
              value={draft.matchType}
              onChange={(e) =>
                setDraft({ ...draft, matchType: e.target.value as MatchType })
              }
            >
              <option value="contains">contains</option>
              <option value="starts with">starts with</option>
              <option value="exact">exact</option>
            </select>
          </label>
          <label className="field">
            <span>Match value</span>
            <input
              value={draft.matchValue}
              onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Applies to</span>
            <select
              value={draft.appliesTo}
              onChange={(e) =>
                setDraft({ ...draft, appliesTo: e.target.value as RuleAppliesTo })
              }
            >
              <option value="expenses">expenses</option>
              <option value="income">income</option>
              <option value="both">both</option>
            </select>
          </label>
          <label className="field">
            <span>Destination tab</span>
            <select
              value={draft.destinationTabId}
              onChange={(e) => {
                const tabId = e.target.value;
                const first = colsFor(tabId)[0]?.id ?? '';
                setDraft({ ...draft, destinationTabId: tabId, destinationColumnId: first });
              }}
            >
              {state.tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Destination column</span>
            <select
              value={draft.destinationColumnId}
              onChange={(e) =>
                setDraft({ ...draft, destinationColumnId: e.target.value })
              }
            >
              {colsFor(draft.destinationTabId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority (lower first)</span>
            <input
              type="number"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={save}>
              Save rule
            </button>
          </div>
        </div>
      )}

      <div className="test-box">
        <h3>Test box</h3>
        <div className="quick-add">
          <input
            placeholder="Sample memo"
            value={testMemo}
            onChange={(e) => setTestMemo(e.target.value)}
          />
          <select
            value={testKind}
            onChange={(e) => setTestKind(e.target.value as 'expense' | 'income')}
          >
            <option value="expense">expense</option>
            <option value="income">income</option>
          </select>
        </div>
        <p className="muted">
          {hit
            ? `Would fire: ${hit.name}`
            : testMemo
              ? 'No rule would fire → Uncategorized'
              : 'Type a memo to preview.'}
        </p>
      </div>

      <button type="button" className="btn ghost" onClick={onApplyPast}>
        Apply to past Uncategorized entries
      </button>
    </Modal>
  );
}
