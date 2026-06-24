// Helpers de avatar reutilizados pelas páginas (lógica, sem estilo).
const PALETTE: Record<string, string> = {
  A: '#3f6f52', B: '#6a5a3d', C: '#9a6b3d', D: '#4d7a6a', E: '#7a5a86',
  F: '#5a6f9a', G: '#5a8a86', H: '#3f6f52', I: '#7a4d4d', J: '#5a6f9a',
  K: '#6a5a3d', L: '#86577a', M: '#7a5a86', N: '#4d7a6a', O: '#9a6b3d',
  P: '#5a8a86', Q: '#6a5a3d', R: '#7a4d4d', S: '#5a6f9a', T: '#4d7a6a',
  U: '#7a5a86', V: '#5a8a86', W: '#6a5a3d', X: '#7a4d4d', Y: '#86577a', Z: '#3f6f52',
};

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase();
}

export function avatarColor(name: string): string {
  return PALETTE[initials(name)[0]] || '#5a6f9a';
}
