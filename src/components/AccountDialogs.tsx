import { useState } from 'react';
import { Modal } from './Modal';

/** A new random small addition each time (1–9 + 1–9). */
export function randomMathQuestion(rand: () => number = Math.random): { a: number; b: number } {
  return { a: 1 + Math.floor(rand() * 9), b: 1 + Math.floor(rand() * 9) };
}

interface DeleteProps {
  accountName: string;
  entryCount: number;
  billCount: number;
  onCancel: () => void;
  onDelete: () => void;
}

/**
 * Guarded delete: 3 confirmation steps → a random addition question (must be right)
 * → type DELETE (case-sensitive) to enable the final button. Cancel at every step.
 */
export function DeleteAccountFlow({ accountName, entryCount, billCount, onCancel, onDelete }: DeleteProps) {
  const [step, setStep] = useState(0);
  const [q, setQ] = useState(() => randomMathQuestion());
  const [answer, setAnswer] = useState('');
  const [mathError, setMathError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const checkMath = () => {
    if (answer.trim() !== '' && Number(answer.trim()) === q.a + q.b) {
      setMathError(null);
      setStep(4);
      return;
    }
    setMathError('That’s not right. Here is a new question — try again.');
    setQ(randomMathQuestion());
    setAnswer('');
  };

  const cancelBtn = (
    <button type="button" className="btn ghost" onClick={onCancel} data-testid="del-cancel">
      Cancel
    </button>
  );

  return (
    <Modal title={`Delete account — step ${step + 1} of 5`} onClose={onCancel} backdropClose={false} testId="delete-flow">
      {step === 0 && (
        <div data-testid="del-step-1">
          <p>
            Delete account <strong>“{accountName}”</strong>?
          </p>
          <div className="modal-actions">
            {cancelBtn}
            <button type="button" className="btn danger" onClick={() => setStep(1)} data-testid="del-continue">
              Yes, delete “{accountName}”
            </button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div data-testid="del-step-2">
          <p>
            This removes all <strong>{entryCount}</strong> entr{entryCount === 1 ? 'y' : 'ies'} and{' '}
            <strong>{billCount}</strong> bill{billCount === 1 ? '' : 's'} in this account (plus its tabs, rules,
            charts and pay schedule). Continue?
          </p>
          <div className="modal-actions">
            {cancelBtn}
            <button type="button" className="btn danger" onClick={() => setStep(2)} data-testid="del-continue">
              Continue
            </button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div data-testid="del-step-3">
          <p>
            <strong>Last chance</strong> — really delete “{accountName}”? You won’t be able to open it from the app
            again (a hidden backup copy stays in this browser’s storage).
          </p>
          <div className="modal-actions">
            {cancelBtn}
            <button type="button" className="btn danger" onClick={() => setStep(3)} data-testid="del-continue">
              Really delete
            </button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div data-testid="del-step-math">
          <p>Quick check so this can’t happen by accident:</p>
          <label className="field">
            <span data-testid="del-math-question">
              {q.a} + {q.b} = ?
            </span>
            <input
              inputMode="numeric"
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && checkMath()}
              data-testid="del-math-answer"
            />
          </label>
          {mathError && (
            <p className="form-error" data-testid="del-math-error">
              {mathError}
            </p>
          )}
          <div className="modal-actions">
            {cancelBtn}
            <button type="button" className="btn danger" onClick={checkMath} data-testid="del-math-check">
              Check answer
            </button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div data-testid="del-step-type">
          <label className="field">
            <span>
              Type <code>DELETE</code> (capital letters) to permanently delete “{accountName}”.
            </span>
            <input
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="del-type"
            />
          </label>
          {typed.length > 0 && typed !== 'DELETE' && (
            <p className="form-error">Type DELETE exactly, in capital letters.</p>
          )}
          <div className="modal-actions">
            {cancelBtn}
            <button
              type="button"
              className="btn danger"
              disabled={typed !== 'DELETE'}
              onClick={() => typed === 'DELETE' && onDelete()}
              data-testid="del-final"
            >
              Delete account forever
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface ResetProps {
  accountName: string;
  entryCount: number;
  billCount: number;
  onCancel: () => void;
  onReset: () => void;
}

export function ResetAccountConfirm({ accountName, entryCount, billCount, onCancel, onReset }: ResetProps) {
  return (
    <Modal title={`Reset “${accountName}”?`} onClose={onCancel} testId="reset-confirm">
      <p>
        This clears <strong>{entryCount}</strong> entr{entryCount === 1 ? 'y' : 'ies'},{' '}
        <strong>{billCount}</strong> bill{billCount === 1 ? '' : 's'}, custom tabs, rules, charts and the pay
        schedule in <strong>{accountName}</strong> and starts it fresh (the name stays). Other accounts are not
        touched.
      </p>
      <p className="muted small">
        A backup copy of the current data is kept in this browser’s storage. The setup wizard opens next.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel} data-testid="reset-cancel">
          Cancel
        </button>
        <button type="button" className="btn danger" onClick={onReset} data-testid="reset-confirm-btn">
          Reset account
        </button>
      </div>
    </Modal>
  );
}

interface RenameProps {
  current: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export function RenameAccount({ current, onCancel, onSave }: RenameProps) {
  const [name, setName] = useState(current);
  const ok = name.trim().length > 0;
  return (
    <Modal title="Rename account" onClose={onCancel} testId="rename-account">
      <label className="field">
        Account name
        <input
          autoFocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onSave(name.trim())}
          data-testid="rename-input"
        />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ok} onClick={() => onSave(name.trim())} data-testid="rename-save">
          Save
        </button>
      </div>
    </Modal>
  );
}
