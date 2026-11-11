/* ============================================================================
   Radar de Atendimento — CADERNO DE TEXTOS do front (29/10).
   Toda frase que a equipe lê no Radar sai daqui (barra, central, telas cheias,
   selos do inbox, sino e painel). O caderno é o mesmo que o banco usa para o que
   ele GRAVA (alertas, notificações, notas): src/v2/lib/radarDeck.ts ⇄ radar_textos.
   Regras da casa: sem emoji, sem gíria, sem "!", nunca prometer repasse automático,
   nunca dizer que algo foi enviado ao cliente (o Radar é interno).
   ============================================================================ */
import { DECK } from './radarDeck';

export interface RadarTexto {
  sobrelinha?: string;
  titulo?: string;
  texto?: string;
  fatos?: string[];
  botao_primario?: string;
  botao_secundario?: string;
  rodape?: string;
}

export type RadarParams = Record<string, string | number | null | undefined>;

/* singular quando {n} = 1 ("1 clientes" nunca aparece na tela) */
const SINGULAR: Array<[RegExp, string]> = [
  [/\b1 clientes\b/g, '1 cliente'],
  [/\b1 decisões\b/g, '1 decisão'],
  [/\b1 pedidos\b/g, '1 pedido'],
  [/\b1 leads\b/g, '1 lead'],
  [/\b1 selecionados\b/g, '1 selecionado'],
  [/\b1 prioritários\b/g, '1 prioritário'],
  [/\b1 notificações\b/g, '1 notificação'],
  [/\b1 avisos\b/g, '1 aviso'],
  [/\b1 fechados\b/g, '1 fechado'],
];

function preencher(s: string | undefined, p: RadarParams): string | undefined {
  if (s == null) return s;
  let out = s.replace(/\{([a-z_]+)\}/g, (_m, k: string) => {
    const v = p[k];
    return v == null ? '' : String(v);
  });
  if (p.n === 1 || p.n === '1') for (const [re, sub] of SINGULAR) out = out.replace(re, sub);
  // placeholder vazio não deixa rastro: espaço antes de ponto/vírgula e separador "·" sobrando nas pontas
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').replace(/^\s*·\s*/, '').replace(/\s*·\s*$/, '').replace(/·\s*·/g, '·').trim();
}

/** Texto do caderno com os {placeholders} preenchidos (placeholder sem valor some). */
export function rt(chave: string, p: RadarParams = {}): RadarTexto {
  const t = DECK[chave];
  if (!t) return {};
  return {
    sobrelinha: preencher(t.sobrelinha, p),
    titulo: preencher(t.titulo, p),
    texto: preencher(t.texto, p),
    fatos: t.fatos?.map((f) => preencher(f, p) ?? f),
    botao_primario: preencher(t.botao_primario, p),
    botao_secundario: preencher(t.botao_secundario, p),
    rodape: preencher(t.rodape, p),
  };
}

/** Atalhos: só o título / só o texto (com fallback, para nunca renderizar vazio). */
export const rtTit = (chave: string, p: RadarParams = {}, padrao = ''): string => rt(chave, p).titulo || padrao;
export const rtTxt = (chave: string, p: RadarParams = {}, padrao = ''): string => rt(chave, p).texto || padrao;

/* ---- tempo e data (as mesmas regras do banco: radar_fmt_tempo / radar_fmt_desde) ---- */

/** Minutos ÚTEIS → "40 min" · "2 h" · "2 h 15 min" · "1 dia útil" · "1 dia útil e 2 h". */
export function fmtTempo(min: number | null | undefined, diaUtilMin = 540): string {
  if (min == null || !Number.isFinite(min)) return '';
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${Math.max(m, 1)} min`;
  if (m < diaUtilMin) {
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const dias = Math.floor(m / diaUtilMin), h = Math.floor((m % diaUtilMin) / 60);
  return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}${h ? ` e ${h} h` : ''}`;
}

/** Nas LINHAS (Central, tabelas): a partir de 1 dia útil, só dias ("2 dias úteis"). */
export function fmtTempoLinha(min: number | null | undefined, diaUtilMin = 540): string {
  if (min == null || !Number.isFinite(min)) return '';
  if (min < diaUtilMin) return fmtTempo(min, diaUtilMin);
  const dias = Math.floor(min / diaUtilMin);
  return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
}

/** Quanto falta, arredondado para cima ("Em 4 h"): < 60 min em minutos; depois em horas; a partir de 1 dia útil, em dias. */
export function fmtFalta(min: number | null | undefined, diaUtilMin = 540): string {
  if (min == null || !Number.isFinite(min)) return '';
  const m = Math.max(0, Math.ceil(min));
  if (m < 60) return `${Math.max(m, 1)} min`;
  if (m < diaUtilMin) return `${Math.ceil(m / 60)} h`;
  const dias = Math.ceil(m / diaUtilMin);
  return `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;
}

const FUSO = 'America/Sao_Paulo';
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const horaSP = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(d);
const dataSP = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d);

/** Data relativa ao dia (só na tela, que recalcula): "hoje às 11:51" · "ontem às 16:40" · "23/10 às 11:51". */
export function fmtDesde(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = diaSP(agora);
  const ontem = diaSP(new Date(agora.getTime() - 86400e3));
  const dia = diaSP(d);
  const pre = dia === hoje ? 'hoje' : dia === ontem ? 'ontem' : dataSP(d);
  return `${pre} às ${horaSP(d)}`;
}

/** Versão curta para os fatos dos cartões: "Hoje · 11:51" · "Ontem · 16:40" · "23/10 · 11:51". */
export function fmtDesdeCurto(iso: string | null | undefined, agora = new Date()): string {
  const s = fmtDesde(iso, agora);
  if (!s) return '';
  const [pre, hora] = s.split(' às ');
  return `${pre.charAt(0).toUpperCase()}${pre.slice(1)} · ${hora}`;
}

/** A espera começou hoje (horário de São Paulo)? Decide entre "há {tempo}" e "desde {desde}" nas linhas. */
export function comecouHoje(iso: string | null | undefined, agora = new Date()): boolean {
  if (!iso) return true;
  return diaSP(new Date(iso)) === diaSP(agora);
}

/** Iniciais do nome (avatar das linhas e cartões). */
export function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '•';
}

/** Erro do "Já liguei" (Central e cabeçalho do inbox): o banco já devolve o texto do caderno quando falta
    permissão; qualquer outra falha (rede, conversa sumiu) vira uma frase só, do caderno. */
export function textoErroLigacao(e: unknown): string {
  const msg = String((e as Error)?.message ?? '');
  if (/permiss|privilege|respons[aá]vel pelo cliente/i.test(msg)) {
    return rtTxt('extra.erro.ligacao_sem_permissao', {}, 'Só o responsável pelo cliente ou o gestor pode registrar a ligação.');
  }
  return rtTxt('extra.erro.ligacao_falhou', {}, 'Não foi possível registrar a ligação. Tente de novo.');
}
