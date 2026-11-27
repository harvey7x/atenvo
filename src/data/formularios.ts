import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   FORMULÁRIOS DE CAPTAÇÃO (26/11, "igual" aos Formulários do sistema que a Reviza usava antes). O administrador monta o
   formulário (perguntas, etapa do card, etiquetas, responsável e, se quiser, o agendamento); o cliente abre o link
   (<site>/f/<endereço>), preenche e escolhe um horário livre. Cada envio vira cliente + card (ou junta no card aberto) e,
   com horário, uma reunião na Agenda. Nada é enviado ao cliente.
   Servidor: migration 123 (atd_formularios, atd_formulario_respostas, atd_formulario_publico/enviar, atd_formularios_resumo).
   DEMO É O CONTRATO: sem backend, os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const FORM_REAL: boolean = isSupabaseConfigured && !!supabase;

export type TipoCampo = 'texto' | 'area' | 'email' | 'numero' | 'data' | 'opcoes';
export interface CampoForm { chave: string; rotulo: string; tipo: TipoCampo | 'telefone'; obrigatorio: boolean; opcoes?: string[] }
export interface AgendaForm {
  ligado: boolean; obrigatorio?: boolean; duracao_min?: number; dias?: number[]; inicio?: string; fim?: string;
  antecedencia_h?: number; ate_dias?: number; responsavel_id?: string | null; tipo?: 'reuniao' | 'ligacao' | 'videochamada';
}
export interface Formulario {
  id: string; nome: string; slug: string; titulo: string; descricao: string; campos: CampoForm[];
  colunaId: string | null; etiquetas: string[]; responsavelId: string | null; agenda: AgendaForm; mensagemFinal: string; ativo: boolean;
}
export type FormularioNovo = Omit<Formulario, 'id'> & { id?: string };

export const TIPOS_CAMPO: { valor: TipoCampo; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto curto' }, { valor: 'area', rotulo: 'Texto longo' }, { valor: 'opcoes', rotulo: 'Escolha numa lista' },
  { valor: 'numero', rotulo: 'Número' }, { valor: 'data', rotulo: 'Data' }, { valor: 'email', rotulo: 'E-mail' },
];
export const CAMPOS_FIXOS: CampoForm[] = [
  { chave: 'nome', rotulo: 'Seu nome', tipo: 'texto', obrigatorio: true },
  { chave: 'telefone', rotulo: 'Seu WhatsApp', tipo: 'telefone', obrigatorio: true },
];
export const MENSAGEM_FINAL_PADRAO = 'Recebemos seus dados. Em breve a nossa equipe fala com você.';
export const DIAS_SEMANA = [{ n: 1, r: 'seg' }, { n: 2, r: 'ter' }, { n: 3, r: 'qua' }, { n: 4, r: 'qui' }, { n: 5, r: 'sex' }, { n: 6, r: 'sáb' }, { n: 7, r: 'dom' }];

/** "Revisão de contrato!" → "revisao-de-contrato" (o endereço do link) */
export function slugDe(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 41);
}
/** o link que vai para o cliente */
export function linkDoFormulario(slug: string): string {
  if (typeof window === 'undefined') return '/f/' + slug;
  const hash = window.location.protocol === 'file:' || window.location.hash.startsWith('#/');
  return hash ? `${window.location.origin}${window.location.pathname}#/f/${slug}` : `${window.location.origin}/f/${slug}`;
}

export function validarFormulario(f: FormularioNovo, outros: Formulario[]): string | null {
  if (!f.nome.trim()) return 'Dê um nome ao formulário.';
  if (f.nome.trim().length > 80) return 'O nome vai até 80 letras.';
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(f.slug)) return 'O endereço do link usa de 3 a 41 letras sem acento, números e hífen.';
  if (outros.some((o) => o.id !== f.id && o.slug === f.slug)) return 'Já existe um formulário com esse endereço.';
  if (f.titulo.length > 120) return 'O título vai até 120 letras.';
  if (f.descricao.length > 600) return 'A descrição vai até 600 letras.';
  if (f.campos.length > 20) return 'Até 20 perguntas.';
  for (const c of f.campos) {
    if (!c.rotulo.trim()) return 'Toda pergunta precisa de um texto.';
    if (c.tipo === 'opcoes' && (c.opcoes ?? []).filter((o) => o.trim()).length < 2) return `"${c.rotulo}": escreva pelo menos 2 opções.`;
  }
  const a = f.agenda;
  if (a.ligado) {
    if (!a.dias || a.dias.length === 0) return 'Escolha os dias da semana do agendamento.';
    if ((a.inicio ?? '09:00') >= (a.fim ?? '18:00')) return 'O horário de começo precisa ser antes do fim.';
  }
  if (f.mensagemFinal.length > 400) return 'A mensagem final vai até 400 letras.';
  return null;
}

const deLinha = (r: Record<string, unknown>): Formulario => ({
  id: String(r.id), nome: String(r.nome), slug: String(r.slug), titulo: String(r.titulo ?? ''), descricao: String(r.descricao ?? ''),
  campos: Array.isArray(r.campos) ? (r.campos as CampoForm[]) : [], colunaId: (r.coluna_id as string) ?? null,
  etiquetas: Array.isArray(r.etiquetas) ? (r.etiquetas as string[]) : [], responsavelId: (r.responsavel_id as string) ?? null,
  agenda: ((r.agenda as AgendaForm) ?? { ligado: false }), mensagemFinal: String(r.mensagem_final ?? MENSAGEM_FINAL_PADRAO), ativo: r.ativo !== false,
});
const paraLinha = (f: FormularioNovo, org: string) => ({
  organizacao_id: org, nome: f.nome.trim(), slug: f.slug, titulo: f.titulo.trim(), descricao: f.descricao.trim(),
  campos: f.campos.map((c) => ({ ...c, rotulo: c.rotulo.trim(), opcoes: c.tipo === 'opcoes' ? (c.opcoes ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
  coluna_id: f.colunaId, etiquetas: f.etiquetas, responsavel_id: f.responsavelId, agenda: f.agenda,
  mensagem_final: f.mensagemFinal.trim() || MENSAGEM_FINAL_PADRAO, ativo: f.ativo,
});

/* ---------------- demonstração ---------------- */
const G = 'previa-formularios', G_R = 'previa-formularios-respostas';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO: Formulario[] = [{
  id: 'demo-form-1', nome: 'Revisão do empréstimo', slug: 'revisao-emprestimo', titulo: 'Descubra se você pagou juros a mais',
  descricao: 'Preencha em 1 minuto. Um especialista da equipe analisa o seu caso e fala com você pelo WhatsApp.',
  campos: [...CAMPOS_FIXOS, { chave: 'c_banco', rotulo: 'Em qual banco é o empréstimo?', tipo: 'opcoes', obrigatorio: true, opcoes: ['BMG', 'Facta', 'Mercantil', 'Agibank', 'Crefisa', 'Outro'] },
    { chave: 'c_beneficio', rotulo: 'Você é aposentado ou pensionista do INSS?', tipo: 'opcoes', obrigatorio: false, opcoes: ['Aposentado', 'Pensionista', 'Não'] }],
  colunaId: null, etiquetas: ['EMPRÉSTIMO PESSOAL'], responsavelId: null,
  agenda: { ligado: true, duracao_min: 30, dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00', antecedencia_h: 2, ate_dias: 10, tipo: 'ligacao' },
  mensagemFinal: 'Pronto! Recebemos seus dados e vamos te ligar no horário escolhido.', ativo: true,
}];
function ler<T>(k: string, d: T): T { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : structuredClone(d); } catch { return structuredClone(d); } }
function gravar(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem navegador */ } }
interface RespostaDemo { quando: string; formulario: string; cliente: string; repetido: boolean; reuniao: string | null; oportunidadeId: string | null; formularioId: string }

const C = 'atd-formularios';
export function useFormularios() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<Formulario[]> => {
      if (!FORM_REAL) { await espera(120); return ler(G, DEMO); }
      const { data, error } = await supabase!.from('atd_formularios').select('*').eq('organizacao_id', currentOrg.id).order('criado_em');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => deLinha(r as Record<string, unknown>));
    },
  });
}

export interface ResumoFormularios {
  porFormulario: Record<string, { d7: number; d30: number; reunioes: number; ultima: string | null }>;
  recentes: { quando: string; formulario: string; cliente: string; repetido: boolean; reuniao: string | null; oportunidadeId: string | null }[];
}
export function useResumoFormularios() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'resumo'],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<ResumoFormularios> => {
      if (!FORM_REAL) {
        await espera(100);
        const rs = ler<RespostaDemo[]>(G_R, []);
        const por: ResumoFormularios['porFormulario'] = {};
        const agora = Date.now();
        for (const r of rs) {
          const p = (por[r.formularioId] ??= { d7: 0, d30: 0, reunioes: 0, ultima: null });
          const dias = (agora - new Date(r.quando).getTime()) / 86_400_000;
          if (dias <= 7) p.d7 += 1; if (dias <= 30) { p.d30 += 1; if (r.reuniao) p.reunioes += 1; }
          if (!p.ultima || r.quando > p.ultima) p.ultima = r.quando;
        }
        return { porFormulario: por, recentes: rs.slice().sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 50) };
      }
      const { data, error } = await supabase!.rpc('atd_formularios_resumo');
      if (error) throw new Error(error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      return {
        porFormulario: (j.por_formulario as ResumoFormularios['porFormulario']) ?? {},
        recentes: ((j.recentes as Record<string, unknown>[]) ?? []).map((r) => ({
          quando: String(r.quando), formulario: String(r.formulario), cliente: String(r.cliente ?? ''), repetido: !!r.repetido,
          reuniao: (r.reuniao as string) ?? null, oportunidadeId: (r.oportunidade_id as string) ?? null,
        })),
      };
    },
  });
}

export function useSalvarFormulario() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: FormularioNovo): Promise<Formulario> => {
      if (!FORM_REAL) {
        await espera(150);
        const l = ler(G, DEMO); const novo: Formulario = { ...f, id: f.id ?? 'demo-form-' + Math.random().toString(36).slice(2, 8) };
        const i = l.findIndex((x) => x.id === novo.id); if (i >= 0) l[i] = novo; else l.push(novo);
        gravar(G, l); return novo;
      }
      const linha = paraLinha(f, currentOrg.id);
      const q = f.id ? supabase!.from('atd_formularios').update(linha).eq('id', f.id).select('*').single() : supabase!.from('atd_formularios').insert(linha).select('*').single();
      const { data, error } = await q;
      if (error) throw new Error(error.code === '23505' ? 'Já existe um formulário com esse endereço.' : error.message);
      return deLinha(data as Record<string, unknown>);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}

export function useApagarFormulario() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!FORM_REAL) { gravar(G, ler(G, DEMO).filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_formularios').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}

/* ---------------- a página pública (sem login) ---------------- */
export interface FormPublico { titulo: string; descricao: string; campos: CampoForm[]; agenda: { ligado: boolean; obrigatorio?: boolean; duracao_min?: number; horarios?: string[] } }

/** os horários livres na demonstração: os mesmos critérios do servidor (dias, faixa, antecedência), sem reuniões */
export function horariosDemo(a: AgendaForm, agora = new Date()): string[] {
  if (!a.ligado) return [];
  const dur = a.duracao_min ?? 30; const ant = a.antecedencia_h ?? 2; const ate = a.ate_dias ?? 14;
  const [hi, mi] = (a.inicio ?? '09:00').split(':').map(Number); const [hf, mf] = (a.fim ?? '18:00').split(':').map(Number);
  const out: string[] = [];
  for (let d = 0; d <= ate && out.length < 200; d++) {
    const dia = new Date(agora); dia.setDate(dia.getDate() + d);
    const dow = dia.getDay() === 0 ? 7 : dia.getDay();
    if (!(a.dias ?? [1, 2, 3, 4, 5]).includes(dow)) continue;
    for (let m = hi * 60 + mi; m + dur <= hf * 60 + mf && out.length < 200; m += dur) {
      const h = new Date(dia); h.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (h.getTime() >= agora.getTime() + ant * 3_600_000) out.push(h.toISOString());
    }
  }
  return out;
}

export function useFormularioPublico(slug: string) {
  return useQuery({
    queryKey: ['form-publico', slug],
    enabled: !!slug,
    retry: 1,
    queryFn: async (): Promise<FormPublico | null> => {
      if (!FORM_REAL) {
        await espera(150);
        const f = ler(G, DEMO).find((x) => x.slug === slug && x.ativo);
        return f ? { titulo: f.titulo || f.nome, descricao: f.descricao, campos: f.campos, agenda: { ligado: f.agenda.ligado, obrigatorio: f.agenda.obrigatorio, duracao_min: f.agenda.duracao_min, horarios: horariosDemo(f.agenda) } } : null;
      }
      const { data, error } = await supabase!.rpc('atd_formulario_publico', { p_slug: slug });
      if (error) throw new Error('Não foi possível abrir o formulário agora. Tente de novo em instantes.');
      return (data as FormPublico | null) ?? null;
    },
  });
}

const ERROS_ENVIO: Record<string, string> = {
  formulario_indisponivel: 'Este formulário não está mais recebendo respostas.',
  telefone_invalido: 'Confira o WhatsApp: escreva o DDD e o número, por exemplo (51) 99999-0000.',
  email_invalido: 'Confira o e-mail.',
  horario_indisponivel: 'Esse horário acabou de ser ocupado. Escolha outro.',
  muitos_envios: 'Muita gente enviando agora. Tente de novo em alguns minutos.',
  dados_invalidos: 'Não deu para enviar. Confira os campos e tente de novo.',
};
export function erroDoEnvio(msg: string, campos: CampoForm[]): string {
  const m = msg.match(/campo_obrigatorio:([a-z0-9_]+)/);
  if (m) return m[1] === 'horario' ? 'Escolha um horário.' : `Responda: ${campos.find((c) => c.chave === m[1])?.rotulo ?? 'a pergunta obrigatória'}.`;
  const k = Object.keys(ERROS_ENVIO).find((x) => msg.includes(x));
  return k ? ERROS_ENVIO[k] : 'Não deu para enviar agora. Tente de novo em instantes.';
}

export function useEnviarFormulario(slug: string) {
  return useMutation({
    mutationFn: async ({ dados, horario }: { dados: Record<string, string>; horario: string | null }): Promise<{ mensagem: string; horario: string | null }> => {
      if (!FORM_REAL) {
        await espera(300);
        const f = ler(G, DEMO).find((x) => x.slug === slug && x.ativo);
        if (!f) throw new Error('formulario_indisponivel');
        if (dados._site) return { mensagem: f.mensagemFinal, horario: null };
        const fone = (dados.telefone ?? '').replace(/\D/g, '');
        if ((dados.nome ?? '').trim().length < 2) throw new Error('campo_obrigatorio:nome');
        if (!/^(55)?[1-9][0-9][0-9]{8,9}$/.test(fone)) throw new Error('telefone_invalido');
        for (const c of f.campos) if (c.obrigatorio && !['nome', 'telefone'].includes(c.chave) && !(dados[c.chave] ?? '').trim()) throw new Error('campo_obrigatorio:' + c.chave);
        if (f.agenda.ligado && f.agenda.obrigatorio && !horario) throw new Error('campo_obrigatorio:horario');
        const rs = ler<RespostaDemo[]>(G_R, []);
        rs.push({ quando: new Date().toISOString(), formulario: f.nome, cliente: dados.nome.trim(), repetido: false, reuniao: horario, oportunidadeId: null, formularioId: f.id });
        gravar(G_R, rs);
        return { mensagem: f.mensagemFinal, horario };
      }
      const { data, error } = await supabase!.rpc('atd_formulario_enviar', { p_slug: slug, p_dados: dados, p_horario: horario });
      if (error) throw new Error(error.message);
      const j = (data ?? {}) as { mensagem?: string; horario?: string | null };
      return { mensagem: j.mensagem ?? MENSAGEM_FINAL_PADRAO, horario: j.horario ?? null };
    },
  });
}
