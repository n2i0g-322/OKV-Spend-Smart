import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}

export function FirstOpen({ onClose }: Props) {
  return (
    <Modal title="Welcome to OKV Spend Smart" onClose={onClose}>
      <ol className="welcome-list">
        <li>Create or pick a tab (categories are seeded for you).</li>
        <li>Add one expense with Quick add or the day grid.</li>
        <li>Use <strong>Add funds received</strong> when money actually arrives.</li>
        <li>Export a backup so your data stays safe.</li>
      </ol>
      <p className="muted small">
        Expected income and bill due dates are planning only — they never create money
        until you confirm an entry.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onClose}>
          Get started
        </button>
      </div>
    </Modal>
  );
}
