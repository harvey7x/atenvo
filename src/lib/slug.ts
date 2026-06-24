/** Gera um slug seguro a partir de um nome livre:
 *  - remove acentos, baixa-caixa, troca não-alfanumérico por hífen
 *  - colapsa hifens, remove das pontas, limita o tamanho
 *  Sempre retorna algo válido (fallback "empresa"). */
export function slugify(input: string): string {
  const base = (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base || 'empresa';
}

/** Sufixo curto aleatório (a-z0-9) para desempatar slugs em conflito. */
export function randomSuffix(len = 4): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
