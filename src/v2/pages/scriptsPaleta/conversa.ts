import type { WaMessage } from '@/data/whatsappDemo';
import { umaLinha } from './texto';

/* ------------------------------------------------------------------
   Contexto da conversa na PRÉVIA (puro, testado em conversa.test.ts):
   a paleta cobre as mensagens mais recentes do chat, então a prévia
   abre com "o que o cliente acabou de dizer" numa bolha recebida —
   o atendente escolhe o script sem perder o fio.
   Regra: considera a rodada de mensagens do cliente DEPOIS da última
   nossa (sem rodada nova, a última dele). A bolha mostra a mais
   recente que tem texto (ou transcrição de áudio), com a HORA DELA
   (não a da última imagem), e resume à parte o que veio depois
   ("+2 imagens depois") — a leitura nunca sugere que veio antes.
   ------------------------------------------------------------------ */

export interface UltimaDoCliente {
  /** texto principal (mensagem do cliente, literal, em uma linha) */
  texto: string;
  /** o principal é transcrição de áudio */
  audio: boolean;
  /** o que veio DEPOIS do principal, resumido ("2 imagens", "1 áudio e 2 imagens") — vazio se nada */
  extra: string;
  /** tipo do que veio depois quando é um só (ícone do selo); null = nada ou tipos mistos */
  extraTipo: Tipo | null;
  /** "há 4 min" da mensagem PRINCIPAL (ou o horário dela quando não há data) */
  quando: string;
}

export type Tipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
const PLURAL: Record<Tipo, [string, string]> = {
  texto: ['mensagem', 'mensagens'], imagem: ['imagem', 'imagens'], audio: ['áudio', 'áudios'],
  video: ['vídeo', 'vídeos'], documento: ['documento', 'documentos'],
};
const ORDEM: Tipo[] = ['texto', 'audio', 'imagem', 'video', 'documento'];

function tipoDe(m: WaMessage): Tipo {
  if (m.pdf) return 'documento';
  const t = (m.tipo ?? '').toLowerCase();
  return t === 'imagem' || t === 'audio' || t === 'video' || t === 'documento' ? t : 'texto';
}

function textoDe(m: WaMessage): { t: string; audio: boolean } | null {
  const txt = umaLinha(m.text ?? '');
  if (txt) return { t: txt, audio: false };
  const tr = umaLinha(m.transcricao ?? '');
  if (tr) return { t: tr, audio: true };
  return null;
}

function rotuloSoMidia(m: WaMessage): string {
  const tipo = tipoDe(m);
  const nome = m.pdf?.name ?? m.nome ?? '';
  if (tipo === 'documento') return nome ? `Documento: ${nome}` : 'Documento';
  if (tipo === 'audio') return 'Áudio';
  if (tipo === 'video') return 'Vídeo';
  if (tipo === 'imagem') return 'Imagem';
  return 'Mensagem';
}

/** "agora" · "há 4 min" · "há 3 h" · "12/10" */
export function haQuanto(iso: string | undefined, agora: number, reserva = ''): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return reserva;
  const min = Math.floor((agora - t) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function resumirUltimaDoCliente(msgs: WaMessage[] | undefined, agora = Date.now()): UltimaDoCliente | null {
  if (!msgs?.length) return null;
  let fim = msgs.length - 1;
  while (fim >= 0 && msgs[fim].dir !== 'in') fim -= 1;
  if (fim < 0) return null;
  let ini = fim;
  while (ini > 0 && msgs[ini - 1].dir === 'in') ini -= 1;
  const rodada = msgs.slice(ini, fim + 1);
  // principal = a mais recente com texto/transcrição; sem nenhuma, a última (só mídia)
  let p = rodada.length - 1;
  while (p >= 0 && !textoDe(rodada[p])) p -= 1;
  const principal = p >= 0 ? rodada[p] : rodada[rodada.length - 1];
  const tx = p >= 0 ? textoDe(principal)! : { t: rotuloSoMidia(principal), audio: false };
  const depois = p >= 0 ? rodada.slice(p + 1) : [];
  const conta = new Map<Tipo, number>();
  for (const m of depois) conta.set(tipoDe(m), (conta.get(tipoDe(m)) ?? 0) + 1);
  const extra = ORDEM.filter((t) => conta.has(t))
    .map((t) => { const n = conta.get(t)!; return `${n} ${PLURAL[t][n === 1 ? 0 : 1]}`; })
    .join(' e ');
  const tiposDepois = [...conta.keys()];
  return {
    texto: tx.t, audio: tx.audio, extra,
    extraTipo: tiposDepois.length === 1 ? tiposDepois[0] : null,
    quando: haQuanto(principal.tsISO, agora, principal.time),
  };
}
