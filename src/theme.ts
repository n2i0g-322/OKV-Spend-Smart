/** Theme presets, persistence, and CSS-variable application for OKV Spend Smart. */

export const THEME_KEY = 'okvSpendSmart:theme';

export interface ThemeColors {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  green: string;
  purple: string;
  blue: string;
  red: string;
  primary: string;
  shadow: string;
  surface2: string;
  inputBg: string;
  greenBg: string;
  greenBorder: string;
  greenText: string;
  purpleBg: string;
  purpleBorder: string;
  purpleText: string;
  blueBg: string;
  blueBorder: string;
  blueText: string;
  redBg: string;
  redBorder: string;
  redText: string;
  warnBg: string;
  warnText: string;
  onAccent: string;
}

export type ThemeMode = 'light' | 'dark';

export interface ThemeState {
  mode: ThemeMode;
  presetId: string | null;
  colors: ThemeColors;
}

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
}

const classicLight: ThemeColors = {
  bg: '#f6f7fb',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  green: '#16a34a',
  purple: '#7c3aed',
  blue: '#2563eb',
  red: '#dc2626',
  primary: '#16a34a',
  shadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  surface2: '#eef2ff',
  inputBg: '#ffffff',
  greenBg: '#ecfdf5',
  greenBorder: '#bbf7d0',
  greenText: '#166534',
  purpleBg: '#f5f3ff',
  purpleBorder: '#ddd6fe',
  purpleText: '#5b21b6',
  blueBg: '#eff6ff',
  blueBorder: '#bfdbfe',
  blueText: '#1d4ed8',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
  redText: '#b91c1c',
  warnBg: '#fef3c7',
  warnText: '#92400e',
  onAccent: '#ffffff',
};

const midnight: ThemeColors = {
  bg: '#0b1220',
  card: '#141c2e',
  text: '#e2e8f0',
  muted: '#94a3b8',
  border: '#1e293b',
  green: '#22c55e',
  purple: '#a78bfa',
  blue: '#60a5fa',
  red: '#f87171',
  primary: '#22c55e',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  surface2: '#1a2438',
  inputBg: '#0f172a',
  greenBg: '#052e16',
  greenBorder: '#14532d',
  greenText: '#86efac',
  purpleBg: '#1e1b4b',
  purpleBorder: '#4c1d95',
  purpleText: '#c4b5fd',
  blueBg: '#0c1a3a',
  blueBorder: '#1e3a8a',
  blueText: '#93c5fd',
  redBg: '#3f0a0a',
  redBorder: '#7f1d1d',
  redText: '#fca5a5',
  warnBg: '#422006',
  warnText: '#fcd34d',
  onAccent: '#0b1220',
};

const forest: ThemeColors = {
  bg: '#0f1a14',
  card: '#16241c',
  text: '#e7f0e9',
  muted: '#8fa894',
  border: '#24382c',
  green: '#34d399',
  purple: '#a3e635',
  blue: '#2dd4bf',
  red: '#fb7185',
  primary: '#34d399',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  surface2: '#1a2e22',
  inputBg: '#0c1510',
  greenBg: '#064e3b',
  greenBorder: '#065f46',
  greenText: '#6ee7b7',
  purpleBg: '#1a2e05',
  purpleBorder: '#3f6212',
  purpleText: '#bef264',
  blueBg: '#042f2e',
  blueBorder: '#115e59',
  blueText: '#5eead4',
  redBg: '#4c0519',
  redBorder: '#9f1239',
  redText: '#fda4af',
  warnBg: '#365314',
  warnText: '#d9f99d',
  onAccent: '#0f1a14',
};

const ocean: ThemeColors = {
  bg: '#0a1628',
  card: '#102038',
  text: '#e0f2fe',
  muted: '#7dd3fc',
  border: '#1e3a5f',
  green: '#2dd4bf',
  purple: '#818cf8',
  blue: '#38bdf8',
  red: '#fb7185',
  primary: '#38bdf8',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  surface2: '#132a44',
  inputBg: '#0c1929',
  greenBg: '#042f2e',
  greenBorder: '#0f766e',
  greenText: '#5eead4',
  purpleBg: '#1e1b4b',
  purpleBorder: '#3730a3',
  purpleText: '#a5b4fc',
  blueBg: '#0c4a6e',
  blueBorder: '#0369a1',
  blueText: '#7dd3fc',
  redBg: '#4c0519',
  redBorder: '#9f1239',
  redText: '#fda4af',
  warnBg: '#164e63',
  warnText: '#a5f3fc',
  onAccent: '#0a1628',
};

const sunset: ThemeColors = {
  bg: '#1a0f14',
  card: '#2a1520',
  text: '#fde8e8',
  muted: '#d4a5a5',
  border: '#4a2030',
  green: '#fbbf24',
  purple: '#e879f9',
  blue: '#fb923c',
  red: '#f43f5e',
  primary: '#f97316',
  shadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  surface2: '#321820',
  inputBg: '#140a10',
  greenBg: '#422006',
  greenBorder: '#92400e',
  greenText: '#fcd34d',
  purpleBg: '#4a044e',
  purpleBorder: '#86198f',
  purpleText: '#f0abfc',
  blueBg: '#431407',
  blueBorder: '#c2410c',
  blueText: '#fdba74',
  redBg: '#4c0519',
  redBorder: '#be123c',
  redText: '#fda4af',
  warnBg: '#451a03',
  warnText: '#fdba74',
  onAccent: '#1a0f14',
};

const highContrast: ThemeColors = {
  bg: '#000000',
  card: '#0a0a0a',
  text: '#ffffff',
  muted: '#d4d4d4',
  border: '#ffffff',
  green: '#00ff66',
  purple: '#cc66ff',
  blue: '#66ccff',
  red: '#ff3355',
  primary: '#ffff00',
  shadow: '0 0 0 2px rgba(255,255,255,0.4)',
  surface2: '#1a1a1a',
  inputBg: '#000000',
  greenBg: '#003311',
  greenBorder: '#00ff66',
  greenText: '#00ff66',
  purpleBg: '#220033',
  purpleBorder: '#cc66ff',
  purpleText: '#e0aaff',
  blueBg: '#001a33',
  blueBorder: '#66ccff',
  blueText: '#99ddff',
  redBg: '#330011',
  redBorder: '#ff3355',
  redText: '#ff6680',
  warnBg: '#332200',
  warnText: '#ffcc00',
  onAccent: '#000000',
};


export const THEME_PRESETS: ThemePreset[] = [
  { id: 'classic-light', name: 'Classic Light', mode: 'light', colors: classicLight },
  { id: 'midnight', name: 'Midnight', mode: 'dark', colors: midnight },
  { id: 'forest', name: 'Forest', mode: 'dark', colors: forest },
  { id: 'ocean', name: 'Ocean', mode: 'dark', colors: ocean },
  { id: 'sunset', name: 'Sunset', mode: 'dark', colors: sunset },
  { id: 'high-contrast', name: 'High Contrast', mode: 'dark', colors: highContrast },
];

export const DEFAULT_THEME: ThemeState = {
  mode: 'light',
  presetId: 'classic-light',
  colors: { ...classicLight },
};

const COLOR_KEYS: (keyof ThemeColors)[] = [
  'bg',
  'card',
  'text',
  'muted',
  'border',
  'green',
  'purple',
  'blue',
  'red',
  'primary',
  'shadow',
  'surface2',
  'inputBg',
  'greenBg',
  'greenBorder',
  'greenText',
  'purpleBg',
  'purpleBorder',
  'purpleText',
  'blueBg',
  'blueBorder',
  'blueText',
  'redBg',
  'redBorder',
  'redText',
  'warnBg',
  'warnText',
  'onAccent',
];

function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
}

function normalizeColors(partial: Partial<ThemeColors> | null | undefined): ThemeColors {
  const base = { ...classicLight };
  if (!partial || typeof partial !== 'object') return base;
  for (const key of COLOR_KEYS) {
    const val = partial[key];
    if (key === 'shadow') {
      if (typeof val === 'string' && val.trim()) base[key] = val;
    } else if (isHex(val)) {
      base[key] = val;
    }
  }
  return base;
}

export function loadTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return { ...DEFAULT_THEME, colors: { ...classicLight } };
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    const mode: ThemeMode = parsed.mode === 'dark' ? 'dark' : 'light';
    const colors = normalizeColors(parsed.colors);
    const presetId =
      typeof parsed.presetId === 'string' || parsed.presetId === null
        ? parsed.presetId ?? null
        : null;
    return { mode, colors, presetId };
  } catch {
    return { ...DEFAULT_THEME, colors: { ...classicLight } };
  }
}

export function saveTheme(theme: ThemeState): void {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
}

/** Map ThemeColors keys to CSS custom property names (without --). */
const CSS_MAP: Record<keyof ThemeColors, string> = {
  bg: 'bg',
  card: 'card',
  text: 'text',
  muted: 'muted',
  border: 'border',
  green: 'green',
  purple: 'purple',
  blue: 'blue',
  red: 'red',
  primary: 'primary',
  shadow: 'shadow',
  surface2: 'surface-2',
  inputBg: 'input-bg',
  greenBg: 'green-bg',
  greenBorder: 'green-border',
  greenText: 'green-text',
  purpleBg: 'purple-bg',
  purpleBorder: 'purple-border',
  purpleText: 'purple-text',
  blueBg: 'blue-bg',
  blueBorder: 'blue-border',
  blueText: 'blue-text',
  redBg: 'red-bg',
  redBorder: 'red-border',
  redText: 'red-text',
  warnBg: 'warn-bg',
  warnText: 'warn-text',
  onAccent: 'on-accent',
};

export function applyTheme(theme: ThemeState): void {
  const root = document.documentElement;
  root.dataset.theme = theme.mode;
  root.classList.toggle('dark', theme.mode === 'dark');
  for (const key of COLOR_KEYS) {
    root.style.setProperty(`--${CSS_MAP[key]}`, theme.colors[key]);
  }
}

export function applyPreset(presetId: string): ThemeState {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return loadTheme();
  const next: ThemeState = {
    mode: preset.mode,
    presetId: preset.id,
    colors: { ...preset.colors },
  };
  applyTheme(next);
  saveTheme(next);
  return next;
}

export function resetTheme(): ThemeState {
  const next: ThemeState = {
    mode: 'light',
    presetId: 'classic-light',
    colors: { ...classicLight },
  };
  applyTheme(next);
  saveTheme(next);
  return next;
}

/** Flip light ↔ dark, preferring Classic Light / Midnight when switching sides. */
export function toggleMode(current: ThemeState): ThemeState {
  const goingDark = current.mode !== 'dark';
  if (goingDark) {
    const darkPreset =
      THEME_PRESETS.find((p) => p.id === 'midnight') ?? THEME_PRESETS[1];
    const next: ThemeState = {
      mode: 'dark',
      presetId: darkPreset.id,
      colors: { ...darkPreset.colors },
    };
    applyTheme(next);
    saveTheme(next);
    return next;
  }
  const lightPreset =
    THEME_PRESETS.find((p) => p.id === 'classic-light') ?? THEME_PRESETS[0];
  const next: ThemeState = {
    mode: 'light',
    presetId: lightPreset.id,
    colors: { ...lightPreset.colors },
  };
  applyTheme(next);
  saveTheme(next);
  return next;
}

export function updateColors(
  current: ThemeState,
  patch: Partial<ThemeColors>,
): ThemeState {
  const colors = normalizeColors({ ...current.colors, ...patch });
  const next: ThemeState = {
    mode: current.mode,
    presetId: 'custom',
    colors,
  };
  applyTheme(next);
  saveTheme(next);
  return next;
}

/** Picker fields shown in the Theme panel. */
export const THEME_PICKERS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'card', label: 'Card' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'border', label: 'Border' },
  { key: 'green', label: 'Accent green (Box1)' },
  { key: 'purple', label: 'Purple (Box2)' },
  { key: 'blue', label: 'Blue (Box3)' },
  { key: 'red', label: 'Red (Box4)' },
  { key: 'primary', label: 'Primary (buttons/tabs)' },
];
