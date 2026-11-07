// Shared CSS tokens keep MUI sx styles and Tailwind on the same palette.
export const C = {
  bg: 'var(--background)',
  surface: 'var(--surface)',
  surfaceHover: 'var(--surface-hover)',
  border: 'var(--border)',
  accent: 'var(--accent)',
  accentDim: 'var(--accent-soft)',
  textPrimary: 'var(--foreground)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  inputBg: 'var(--input)',
  green: 'var(--success)',
  greenDim: 'var(--success-soft)',
  red: 'var(--danger)',
  redDim: 'var(--danger-soft)',
  blue: 'var(--info)',
  blueDim: 'var(--info-soft)',
  purple: 'var(--accent)',
  purpleDim: 'var(--accent-soft)',
  yellow: 'var(--warning)',
  yellowDim: 'var(--warning-soft)',
  button: 'var(--button)',
  buttonHover: 'var(--button-hover)',
  onButton: 'var(--on-button)',
} as const;

export const FONT = 'Arial, Helvetica, sans-serif';
