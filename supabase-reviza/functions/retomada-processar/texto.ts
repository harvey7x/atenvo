// O TEXTO da retomada: as variáveis {nome}, {primeiro_nome} e {atendente}. CÓPIA de renderizarTexto() de
// src/data/retomada.ts — o Edge roda em Deno e não importa de src/. Sem nada de Deno aqui: o vitest
// (src/data/retomada.test.ts) roda os mesmos casos nas duas cópias e confere que dão o mesmo resultado.
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del']);
const maiuscula = (p: string) => p.split('-').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('-');
export function nomeBonito(bruto: string | null | undefined): string {
  const s = (bruto ?? '').replace(/\s+/g, ' ').trim();
  if (!s || !/\p{L}/u.test(s)) return '';
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().split(' ').map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : maiuscula(p))).join(' ');
}
const SEM_ATENDENTE = 'nossa equipe';
const RE_VARIAVEL = /\{\s*(nome|primeiro_nome|atendente)\s*\}/gi;
const VAZIO = '\uE000'; // marca onde uma variável ficou vazia (caractere de uso privado: nunca aparece em texto de gente)
export function renderizarTexto(texto: string, dados: { nome?: string | null; atendente?: string | null }): string {
  const nome = nomeBonito(dados.nome);
  const valores: Record<string, string> = { nome, primeiro_nome: nome.split(' ')[0] ?? '', atendente: nomeBonito(dados.atendente).split(' ')[0] || SEM_ATENDENTE };
  let t = (texto ?? '').replace(RE_VARIAVEL, (_m, v: string) => valores[v.toLowerCase()] || VAZIO);
  if (!t.includes(VAZIO)) return t.trim();
  t = t.replace(/^([ \t]*)\uE000+[ \t]*[,;:][ \t]*/gm, '$1')
    .replace(/[ \t]*,?[ \t]*\uE000+(?=[!?.,;:])/g, '')
    .replace(/^[ \t]*\uE000+[ \t]*/gm, '')
    .replace(/[ \t]*,?[ \t]*\uE000+[ \t]*$/gm, '')
    .replace(/[ \t]*\uE000+[ \t]*/g, ' ');
  return t.trim();
}
