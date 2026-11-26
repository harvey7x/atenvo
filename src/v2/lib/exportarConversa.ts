/* Exportar, buscar e linkar a conversa (26/11, "igual" ao sistema que a Reviza usava antes). Lógica pura, testada em
   exportarConversa.test.ts. A nota interna NUNCA entra no arquivo exportado: ela é só da equipe. */
import type { WaMessage } from '@/data/whatsappDemo';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
function quando(iso: string | undefined, hora: string): string {
  if (!iso) return hora || '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return hora || '';
  return d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
const ROT_TIPO: Record<string, string> = { imagem: 'foto', video: 'vídeo', audio: 'áudio', documento: 'documento', sticker: 'figurinha', contato: 'contato', localizacao: 'localização' };

/** uma linha por mensagem: "[25/11/2026 14:02] Cliente: texto" (anexos e áudios transcritos entram com o rótulo) */
export function textoDaConversa(o: { nome: string; telefone?: string | null; agora?: Date }, msgs: WaMessage[]): string {
  const agora = o.agora ?? new Date();
  const cab = [
    `Conversa com ${o.nome || 'cliente'}${o.telefone ? ` (${o.telefone})` : ''}`,
    `Exportada em ${agora.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}`,
    'As notas internas da equipe não entram neste arquivo.',
    '',
  ];
  const linhas: string[] = [];
  for (const m of msgs) {
    if (m.nota || m.tipo === 'nota_interna' || m.tipo === 'sistema') continue;
    const quem = m.dir === 'in' ? 'Cliente' : m.origemBot ? 'IA' : 'Equipe';
    const partes: string[] = [];
    if (m.tipo && m.tipo !== 'texto' && ROT_TIPO[m.tipo]) partes.push(`[${ROT_TIPO[m.tipo]}${m.nome ? ': ' + m.nome : ''}]`);
    const t = (m.text || '').trim();
    if (t) partes.push(t);
    if (m.tipo === 'audio' && m.transcricao) partes.push(`(transcrição: ${m.transcricao.trim()})`);
    if (!partes.length) continue;
    linhas.push(`[${quando(m.tsISO, m.time)}] ${quem}: ${partes.join(' ')}`);
  }
  return [...cab, ...(linhas.length ? linhas : ['(sem mensagens)'])].join('\n') + '\n';
}

/** "conversa-maria-aparecida-souza-2026-11-26.txt" */
export function nomeArquivoConversa(nome: string, agora = new Date()): string {
  const base = (nome || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'cliente';
  const dia = new Intl.DateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return `conversa-${base}-${dia}.txt`;
}

export function baixarTexto(nomeArquivo: string, texto: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** o endereço que abre esta conversa no sistema (funciona com o endereço normal e com o da prévia, que usa #/) */
export function linkDaConversa(id: string, loc: Pick<Location, 'origin' | 'pathname' | 'hash'> = window.location): string {
  const rota = '/whatsapp?conversa=' + encodeURIComponent(id);
  if (loc.hash.startsWith('#/')) return loc.origin + loc.pathname + '#' + rota;
  return loc.origin + rota;
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** as mensagens que têm o termo (sem acento e sem diferença de maiúscula), na ordem da conversa */
export function acharNaConversa(msgs: WaMessage[], termo: string): string[] {
  const t = sem(termo.trim());
  if (t.length < 2) return [];
  return msgs.filter((m) => m.id && !m.nota && sem(`${m.text || ''} ${m.nome || ''} ${m.transcricao || ''}`).includes(t)).map((m) => m.id!);
}
