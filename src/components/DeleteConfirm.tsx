import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  name: string;
  onConfirm: (alsoDeleteHistory: boolean) => void;
  onClose: () => void;
}

export function DeleteConfirm({ name, onConfirm, onClose }: Props) {
  const [alsoDelete, setAlsoDelete] = useState(false);
  return (
    <Modal title={`Delete ${name}?`} onClose={onClose}>
      <p>This cannot be undone.</p>
      <p className="muted small">Default: Keep past amounts in Uncategorized.</p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={alsoDelete}
          onChange={(e) => setAlsoDelete(e.target.checked)}
        />
        Also delete all historical amounts.
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => onConfirm(alsoDelete)}
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
