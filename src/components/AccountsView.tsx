import type { AccountRecord } from '../storage';
import { formatLocalDateTime } from '../date';

interface Props {
  accounts: AccountRecord[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
  onRunWizard: () => void;
}

const fmtCreated = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Accounts tab: each account is a fully separate dataset. */
export function AccountsView({ accounts, activeId, onSwitch, onCreate, onRename, onReset, onDelete, onRunWizard }: Props) {
  const only = accounts.length <= 1;
  return (
    <section className="accounts-view" data-testid="accounts-view">
      <div className="accounts-head">
        <div>
          <h2>Accounts</h2>
          <p className="muted small">
            Each account has its own tabs, entries, bills, rules, charts and pay schedule. Made a mess? Start a brand
            new account or reset one — your other accounts are never touched. The theme is shared.
          </p>
        </div>
        <div className="accounts-head-actions">
          <button type="button" className="btn primary" onClick={onCreate} data-testid="acct-create">
            + Create account
          </button>
          <button type="button" className="btn ghost" onClick={onRunWizard} data-testid="acct-run-wizard">
            Run setup wizard
          </button>
        </div>
      </div>
      <ul className="account-list">
        {accounts.map((a) => {
          const active = a.id === activeId;
          return (
            <li key={a.id} className={`card account-card${active ? ' active' : ''}`} data-testid="account-card" data-account-id={a.id}>
              <div className="account-card-top">
                <h3 className="account-name">
                  {a.name} {active && <span className="badge active-badge">Active</span>}
                </h3>
              </div>
              <dl className="account-facts">
                <div>
                  <dt>Created</dt>
                  <dd>{fmtCreated(a.createdAt)}</dd>
                </div>
                <div>
                  <dt>Entries</dt>
                  <dd data-testid="acct-entries">{a.data.entries.length}</dd>
                </div>
                <div>
                  <dt>Bills</dt>
                  <dd data-testid="acct-bills">{a.data.bills.length}</dd>
                </div>
                <div>
                  <dt>Last saved</dt>
                  <dd>{a.savedAt ? formatLocalDateTime(a.savedAt) : 'not yet'}</dd>
                </div>
              </dl>
              <div className="account-actions">
                {!active && (
                  <button type="button" className="btn primary sm" onClick={() => onSwitch(a.id)} data-testid="acct-switch">
                    Switch to
                  </button>
                )}
                <button type="button" className="btn ghost sm" onClick={() => onRename(a.id)} data-testid="acct-rename">
                  Rename
                </button>
                <button type="button" className="btn ghost sm" onClick={() => onReset(a.id)} data-testid="acct-reset">
                  Reset
                </button>
                <button
                  type="button"
                  className="btn ghost sm danger-text"
                  onClick={() => onDelete(a.id)}
                  disabled={only}
                  title={only ? 'You can’t delete the only account — use Reset instead.' : undefined}
                  data-testid="acct-delete"
                >
                  Delete
                </button>
              </div>
              {only && (
                <p className="muted tiny" data-testid="acct-last-note">
                  This is your only account, so it can’t be deleted — use Reset to start over.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
