import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   AGENDA DO ATENDIMENTO (26/11, "igual" ao sistema que a Reviza usava antes: Agenda com dia, semana, mês e lista,
   "Nova reunião", e o agente marcando "Agendar reunião"). Reuniões, ligações, retornos e videochamadas, com dia, hora,
   quanto dura, quem faz, o cliente e a conversa. A tela junta os presenciais que já existem.
   Servidor: migration 109 (atd_reunioes; quem vê: o admin tudo, os outros o que é deles e o das conversas que veem;
   marcar para outra pessoa avisa no sino). As contas de calendário (semana, grade do mês, posição na grade) são puras
   e testadas em agenda.test.ts. DEMO É O CONTRATO: sem backend, guarda no navegador com reuniões de exemplo.
   ------------------------------------------------------------------ */

export const AGENDA_REAL: boolean = isSupabaseConfigured && !!supabase;

export type TipoReuniao = 'reuniao' | 'ligacao' | 'retorno' | 'videochamada';
export type StatusReuniao = 'marcada' | 'feita' | 'faltou' | 'cancelada';
export interface Reuniao {
  id: string; titulo: string; tipo: TipoReuniao; inicio: string; duracaoMin: number;
  responsavelId: string | null; responsavelNome: string | null;
  contatoId: string | null; clienteNome: string | null; telefone: string | null; conversaId: string | null;
  local: string | null; observacao: string | null; status: StatusReuniao; criadoPor: string | null;
}
export type NovaReuniao = Pick<Reuniao, 'titulo' | 'tipo' | 'inicio' | 'duracaoMin' | 'responsavelId' | 'conversaId' | 'local' | 'observacao'> & { id?: string; clienteNome?: string | null };

export const TIPOS_REUNIAO: { id: TipoReuniao; nome: string }[] = [
  { id: 'reuniao', nome: 'Reunião' }, { id: 'ligacao', nome: 'Ligação' }, { id: 'retorno', nome: 'Retorno' }, { id: 'videochamada', nome: 'Videochamada' },
];
export const nomeTipo = (t: string) => TIPOS_REUNIAO.find((x) => x.id === t)?.nome ?? (t === 'presencial' ? 'Presencial' : 'Reunião');
export const ROTULO_STATUS: Record<StatusReuniao, string> = { marcada: 'Marcada', feita: 'Feita', faltou: 'Cliente faltou', cancelada: 'Cancelada' };
export const DURACOES = [15, 30, 45, 60, 90, 120];

/* ---------------- contas de calendário (horário de São Paulo) ---------------- */
const TZ = 'America/Sao_Paulo';
/** "2026-11-26" do instante, no horário de São Paulo */
export const diaSP = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
/** minutos desde 00:00 em São Paulo */
export function minutoSP(iso: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24, m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
export const horaSP = (iso: string) => { const m = minutoSP(iso); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** o instante (ISO) de um dia + hora de São Paulo (Brasil sem horário de verão: -03:00) */
export const instanteSP = (dia: string, hora: string) => new Date(`${dia}T${hora.length === 5 ? hora : '09:00'}:00-03:00`).toISOString();
export function somaDias(dia: string, n: number): string { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** 0 = domingo … 6 = sábado */
export const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
/** a semana de segunda a domingo que contém o dia */
export function semanaDe(dia: string): string[] { const seg = somaDias(dia, -((diaDaSemana(dia) + 6) % 7)); return Array.from({ length: 7 }, (_, i) => somaDias(seg, i)); }
/** a grade do mês: semanas de segunda a domingo; os dias de fora do mês entram (para fechar a semana) */
export function gradeDoMes(dia: string): string[][] {
  const primeiro = `${dia.slice(0, 7)}-01`;
  const ultimo = somaDias(`${somaDias(primeiro, 32).slice(0, 7)}-01`, -1);
  const semanas: string[][] = [];
  let d = semanaDe(primeiro)[0];
  while (d <= ultimo) { semanas.push(semanaDe(d)); d = somaDias(d, 7); }
  return semanas;
}
/** onde o item cai na grade de horas (de `ini` até `fim` horas): topo e altura em % */
export function posicaoNaGrade(inicioIso: string, duracaoMin: number, ini = 7, fim = 21): { topo: number; altura: number } {
  const total = (fim - ini) * 60;
  const de = Math.max(0, Math.min(total, minutoSP(inicioIso) - ini * 60));
  const ate = Math.max(de + 15, Math.min(total, de + duracaoMin));
  return { topo: (de / total) * 100, altura: ((ate - de) / total) * 100 };
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const nomeDiaCurto = (dia: string) => `${SEM[diaDaSemana(dia)]} ${dia.slice(8)}/${dia.slice(5, 7)}`;
export const nomeMes = (dia: string) => `${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;
export function rotuloPeriodo(visao: 'dia' | 'semana' | 'mes' | 'lista', dia: string): string {
  if (visao === 'dia') return `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][diaDaSemana(dia)]}, ${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`;
  if (visao === 'mes') return nomeMes(dia);
  const s = semanaDe(dia);
  if (visao === 'lista') return `de ${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1]} em diante`;
  const a = s[0], b = s[6];
  return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8))} a ${Number(b.slice(8))} de ${MESES[Number(b.slice(5, 7)) - 1]}` : `${Number(a.slice(8))} de ${MESES[Number(a.slice(5, 7)) - 1]} a ${Number(b.slice(8))} de ${MESES[Number(b.slice(5, 7)) - 1]}`;
}
/** o pedaço de tempo que a visão mostra: [início, fim) em ISO */
export function janelaDaVisao(visao: 'dia' | 'semana' | 'mes' | 'lista', dia: string): { ini: string; fim: string } {
  if (visao === 'dia') return { ini: instanteSP(dia, '00:00'), fim: instanteSP(somaDias(dia, 1), '00:00') };
  if (visao === 'semana') { const s = semanaDe(dia); return { ini: instanteSP(s[0], '00:00'), fim: instanteSP(somaDias(s[6], 1), '00:00') }; }
  if (visao === 'mes') { const g = gradeDoMes(dia); return { ini: instanteSP(g[0][0], '00:00'), fim: instanteSP(somaDias(g[g.length - 1][6], 1), '00:00') }; }
  return { ini: instanteSP(dia, '00:00'), fim: instanteSP(somaDias(dia, 45), '00:00') };
}
export function validarReuniao(r: NovaReuniao): string | null {
  if (!r.titulo.trim()) return 'Escreva o assunto (ex.: "Ligar para ajudar a baixar o histórico").';
  if (r.titulo.trim().length > 120) return 'O assunto vai até 120 letras.';
  if (isNaN(new Date(r.inicio).getTime())) return 'Escolha o dia e a hora.';
  if (r.duracaoMin < 5 || r.duracaoMin > 480) return 'A duração vai de 5 minutos a 8 horas.';
  return null;
}

/* ---------------- demonstração ---------------- */
const GUARDA = 'previa-agenda';
function demoInicial(): Reuniao[] {
  const hoje = diaSP(new Date());
  const r = (i: number, dia: string, hora: string, titulo: string, tipo: TipoReuniao, cliente: string | null, conversaId: string | null, resp: string, dur = 30, status: StatusReuniao = 'marcada'): Reuniao => ({
    id: `demo-r${i}`, titulo, tipo, inicio: instanteSP(dia, hora), duracaoMin: dur, responsavelId: 'u-' + resp.toLowerCase(), responsavelNome: resp,
    contatoId: null, clienteNome: cliente, telefone: null, conversaId, local: tipo === 'videochamada' ? 'Google Meet' : null, observacao: null, status, criadoPor: null,
  });
  return [
    r(1, hoje, '10:00', 'Ajudar a baixar o histórico do consignado', 'ligacao', 'José Carlos Ferreira', 'wa-jose', 'Juliana'),
    r(2, hoje, '14:30', 'Mostrar a simulação', 'reuniao', 'Maria Aparecida Souza', 'wa-maria', 'Matheo', 45),
    r(3, hoje, '17:00', 'Retorno combinado (depois das 18h prefere)', 'retorno', 'Ivone Castro dos Santos', 'wa-ivone', 'Henrique'),
    r(4, somaDias(hoje, 1), '09:30', 'Explicar a portabilidade', 'videochamada', 'Antônio Pereira Lima', 'wa-antonio', 'Matheo', 30),
    r(5, somaDias(hoje, 2), '11:00', 'Reunião da equipe — metas da semana', 'reuniao', null, null, 'Matheo', 60),
    r(6, somaDias(hoje, -1), '15:00', 'Ligação para pedir o comprovante', 'ligacao', 'Terezinha M. Alves', 'wa-terezinha', 'Juliana', 15, 'feita'),
  ];
}
const lerDemo = (): Reuniao[] => { try { const v = JSON.parse(localStorage.getItem(GUARDA) ?? 'null'); return Array.isArray(v) ? v : demoInicial(); } catch { return demoInicial(); } };
const gravarDemo = (l: Reuniao[]) => { try { localStorage.setItem(GUARDA, JSON.stringify(l)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/* ---------------- servidor ---------------- */
const SELECT = 'id, titulo, tipo, inicio, duracao_min, responsavel_id, contato_id, conversa_id, local, observacao, status, criado_por, responsavel:usuarios!atd_reunioes_responsavel_id_fkey(nome), contato:contatos!atd_reunioes_contato_id_fkey(nome, telefone)';
type Linha = { id: string; titulo: string; tipo: string; inicio: string; duracao_min: number; responsavel_id: string | null; contato_id: string | null; conversa_id: string | null; local: string | null; observacao: string | null; status: string; criado_por: string | null; responsavel: { nome?: string } | null; contato: { nome?: string; telefone?: string } | null };
const daLinha = (l: Linha): Reuniao => ({
  id: l.id, titulo: l.titulo, tipo: (TIPOS_REUNIAO.some((t) => t.id === l.tipo) ? l.tipo : 'reuniao') as TipoReuniao, inicio: l.inicio, duracaoMin: l.duracao_min,
  responsavelId: l.responsavel_id, responsavelNome: l.responsavel?.nome ?? null, contatoId: l.contato_id, clienteNome: l.contato?.nome || l.contato?.telefone || null,
  telefone: l.contato?.telefone ?? null, conversaId: l.conversa_id, local: l.local, observacao: l.observacao, status: (l.status as StatusReuniao) || 'marcada', criadoPor: l.criado_por,
});

const CHAVE = 'agenda';
export function useReunioes(ini: string, fim: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id, ini, fim],
    placeholderData: (ant) => ant,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Reuniao[]> => {
      if (!AGENDA_REAL) { await espera(150); return lerDemo().filter((r) => r.inicio >= ini && r.inicio < fim).sort((a, b) => a.inicio.localeCompare(b.inicio)); }
      const { data, error } = await supabase!.from('atd_reunioes').select(SELECT).eq('organizacao_id', currentOrg.id).gte('inicio', ini).lt('inicio', fim).order('inicio');
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Linha[]).map(daLinha);
    },
  });
}
/** as próximas deste cliente (o painel do WhatsApp) */
export function useReunioesDaConversa(conversaId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id, 'conversa', conversaId],
    enabled: !!conversaId,
    queryFn: async (): Promise<Reuniao[]> => {
      const agora = new Date(Date.now() - 2 * 3600_000).toISOString();
      if (!AGENDA_REAL) return lerDemo().filter((r) => r.conversaId === conversaId && r.inicio >= agora && r.status === 'marcada').sort((a, b) => a.inicio.localeCompare(b.inicio));
      const { data, error } = await supabase!.from('atd_reunioes').select(SELECT).eq('conversa_id', conversaId!).eq('status', 'marcada').gte('inicio', agora).order('inicio').limit(5);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Linha[]).map(daLinha);
    },
  });
}
export function useSalvarReuniao() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: NovaReuniao & { responsavelNome?: string | null }) => {
      const e = validarReuniao(r); if (e) throw new Error(e);
      if (!AGENDA_REAL) {
        await espera(250);
        const l = lerDemo(); const i = r.id ? l.findIndex((x) => x.id === r.id) : -1;
        const base: Reuniao = i >= 0 ? l[i] : { id: 'demo-' + Date.now(), titulo: '', tipo: 'reuniao', inicio: r.inicio, duracaoMin: 30, responsavelId: null, responsavelNome: null, contatoId: null, clienteNome: r.clienteNome ?? null, telefone: null, conversaId: null, local: null, observacao: null, status: 'marcada', criadoPor: null };
        const nova: Reuniao = { ...base, titulo: r.titulo.trim(), tipo: r.tipo, inicio: r.inicio, duracaoMin: r.duracaoMin, responsavelId: r.responsavelId, responsavelNome: r.responsavelNome ?? base.responsavelNome, conversaId: r.conversaId, clienteNome: r.clienteNome ?? base.clienteNome, local: r.local?.trim() || null, observacao: r.observacao?.trim() || null };
        if (i >= 0) l[i] = nova; else l.push(nova);
        gravarDemo(l); return nova.id;
      }
      const linha = { organizacao_id: currentOrg.id, titulo: r.titulo.trim(), tipo: r.tipo, inicio: r.inicio, duracao_min: Math.round(r.duracaoMin), responsavel_id: r.responsavelId, conversa_id: r.conversaId, local: r.local?.trim() || null, observacao: r.observacao?.trim() || null };
      const q = r.id ? supabase!.from('atd_reunioes').update(linha).eq('id', r.id).select('id').single() : supabase!.from('atd_reunioes').insert(linha).select('id').single();
      const { data, error } = await q;
      if (error) throw new Error(/row-level|permission/i.test(error.message) ? 'Você não pode marcar nesta conversa.' : 'Não deu para salvar agora. Tente de novo.');
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
export function useStatusReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: StatusReuniao }) => {
      if (!AGENDA_REAL) { gravarDemo(lerDemo().map((r) => (r.id === v.id ? { ...r, status: v.status } : r))); return; }
      const { error } = await supabase!.from('atd_reunioes').update({ status: v.status }).eq('id', v.id);
      if (error) throw new Error('Não deu para mudar agora. Tente de novo.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
export function useApagarReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!AGENDA_REAL) { gravarDemo(lerDemo().filter((r) => r.id !== id)); return; }
      const { error, count } = await supabase!.from('atd_reunioes').delete({ count: 'exact' }).eq('id', id);
      if (error) throw new Error('Não deu para apagar agora.');
      if (!count) throw new Error('Só quem marcou (ou o administrador) apaga. Você pode cancelar.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
