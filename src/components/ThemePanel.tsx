import { THEME_PICKERS, THEME_PRESETS, type ThemeColors, type ThemeState } from '../theme';
import { Modal } from './Modal';

interface Props {
  theme: ThemeState;
  onApplyPreset: (id: string) => void;
  onUpdateColor: (key: keyof ThemeColors, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export function ThemePanel({
  theme,
  onApplyPreset,
  onUpdateColor,
  onReset,
  onClose,
}: Props) {
  return (
    <Modal title="Theme" onClose={onClose} wide>
      <section className="theme-section">
        <h3 className="theme-section-title">Presets</h3>
        <div className="theme-presets" role="list">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className={`theme-preset${theme.presetId === p.id ? ' active' : ''}`}
              onClick={() => onApplyPreset(p.id)}
              aria-pressed={theme.presetId === p.id}
            >
              <span className="theme-preset-swatches" aria-hidden>
                <span style={{ background: p.colors.bg }} />
                <span style={{ background: p.colors.card }} />
                <span style={{ background: p.colors.green }} />
                <span style={{ background: p.colors.purple }} />
                <span style={{ background: p.colors.blue }} />
                <span style={{ background: p.colors.red }} />
              </span>
              <span className="theme-preset-name">{p.name}</span>
              <span className="theme-preset-mode muted tiny">{p.mode}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="theme-section">
        <h3 className="theme-section-title">Custom colors</h3>
        <div className="theme-pickers">
          {THEME_PICKERS.map(({ key, label }) => {
            const value = theme.colors[key];
            const hex = value.startsWith('#') ? value.slice(0, 7) : '#000000';
            return (
              <label key={key} className="theme-picker">
                <span>{label}</span>
                <span className="theme-picker-controls">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => onUpdateColor(key, e.target.value)}
                    aria-label={label}
                  />
                  <input
                    type="text"
                    className="theme-hex"
                    value={hex}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) onUpdateColor(key, v);
                    }}
                    spellCheck={false}
                  />
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="modal-actions theme-actions">
        <button type="button" className="btn ghost" onClick={onReset}>
          Reset to default
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
