import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured, isDemoMode } from '@/lib/supabase';
import { DEMO_MODE, acaoSimulada } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';

export const FICHA_REAL = isSupabaseConfigured && !!supabase;

export type FichaStatus = 'rascunho' | 'finalizada';
export type FichaTipoBeneficio = 'aposentadoria' | 'pensao_por_morte' | 'bpc_loas' | 'outro';

export interface FichaRevisao {
  tipo: 'agibank' | 'rmc' | 'rcc' | 'emprestimo' | 'outro';
  bancoCodigo?: string;
  bancoNome?: string;
  valor?: number;
  descricaoLivre?: string;
  origem: 'parser' | 'manual';
  confianca?: 'alta' | 'media' | 'baixa';
  requerConfirmacao?: boolean;
}

export interface FichaJudicial {
  id: string;
  organizacaoId: string;
  contatoId: string;
  oportunidadeId: string | null;
  conversaId: string | null;
  canalId: string | null;
  responsavelId: string | null;
  responsavelNome: string;
  criadoPor: string | null;
  criadoPorNome: string;
  versao: number;
  fichaAnteriorId: string | null;
  status: FichaStatus;
  textoOriginal: string;
  textoFicha: string;
  nome: string; cpf: string; cidade: string; uf: string; telefone: string; email: string; rg: string; estadoCivil: string;
  nascimento: string | null; idadeInformada: number | null;
  beneficioNumero: string; especieCodigo: string; especieDescricao: string; tipoBeneficio: FichaTipoBeneficio | null;
  bancoCodigo: string; bancoNome: string; valorBeneficio: number | null; dataConsulta: string | null;
  revisoes: FichaRevisao[]; parserVersion: string;
  criadoEm: string; atualizadoEm: string; finalizadaEm: string | null;
  senhaInss: string;
  /** Carimbo do envio à planilha CONTROLE CLIENTES AGENDADOS (edge function enviar-planilha). */
  planilhaEnviadaEm: string | null; planilhaLinha: number | null;
}

/** Campos de snapshot/edição (camelCase). Vínculos só na criação. */
export interface FichaSnapshot {
  nome?: string; cpf?: string; cidade?: string; uf?: string; telefone?: string; email?: string; rg?: string; estadoCivil?: string;
  nascimento?: string | null; idadeInformada?: number | null;
  beneficioNumero?: string; especieCodigo?: string; especieDescricao?: string; tipoBeneficio?: FichaTipoBeneficio | null;
  bancoCodigo?: string; bancoNome?: string; valorBeneficio?: number | null; dataConsulta?: string | null;
  textoOriginal?: string; textoFicha?: string; revisoes?: FichaRevisao[]; parserVersion?: string;
  senhaInss?: string;
}

export interface FichaVinculos {
  organizacaoId: string; contatoId: string;
  oportunidadeId?: string | null; conversaId?: string | null; canalId?: string | null; responsavelId?: string | null;
  fichaAnteriorId?: string | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function mapFicha(r: Record<string, unknown>): FichaJudicial {
  const resp = one(r.responsavel as { nome: string } | { nome: string }[] | null);
  const cri = one(r.criador as { nome: string } | { nome: string }[] | null);
  const revisoes = Array.isArray(r.revisoes) ? (r.revisoes as FichaRevisao[]) : [];
  return {
    id: r.id as string, organizacaoId: r.organizacao_id as string, contatoId: r.contato_id as string,
    oportunidadeId: (r.oportunidade_id as string) ?? null, conversaId: (r.conversa_id as string) ?? null, canalId: (r.canal_id as string) ?? null,
    responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: resp?.nome || '',
    criadoPor: (r.criado_por as string) ?? null, criadoPorNome: cri?.nome || '',
    versao: (r.versao as number) ?? 1, fichaAnteriorId: (r.ficha_anterior_id as string) ?? null,
    status: (r.status as FichaStatus) ?? 'rascunho',
    textoOriginal: (r.texto_original as string) || '', textoFicha: (r.texto_ficha as string) || '',
    nome: (r.nome as string) || '', cpf: (r.cpf as string) || '', cidade: (r.cidade as string) || '', uf: (r.uf as string) || '',
    telefone: (r.telefone as string) || '', email: (r.email as string) || '', rg: (r.rg as string) || '', estadoCivil: (r.estado_civil as string) || '',
    nascimento: (r.nascimento as string) ?? null, idadeInformada: (r.idade_informada as number) ?? null,
    beneficioNumero: (r.beneficio_numero as string) || '', especieCodigo: (r.especie_codigo as string) || '', especieDescricao: (r.especie_descricao as string) || '',
    tipoBeneficio: (r.tipo_beneficio as FichaTipoBeneficio) ?? null,
    bancoCodigo: (r.banco_codigo as string) || '', bancoNome: (r.banco_nome as string) || '', valorBeneficio: (r.valor_beneficio as number) ?? null,
    dataConsulta: (r.data_consulta as string) ?? null, revisoes, parserVersion: (r.parser_version as string) || '',
    criadoEm: (r.criado_em as string) || '', atualizadoEm: (r.atualizado_em as string) || '', finalizadaEm: (r.finalizada_em as string) ?? null,
    senhaInss: (r.senha_inss as string) || '',
    planilhaEnviadaEm: (r.planilha_enviada_em as string) ?? null, planilhaLinha: (r.planilha_linha as number) ?? null,
  };
}

const SELECT = 'id, organizacao_id, contato_id, oportunidade_id, conversa_id, canal_id, responsavel_id, criado_por, versao, ficha_anterior_id, status, texto_original, texto_ficha, nome, cpf, cidade, uf, telefone, email, rg, estado_civil, nascimento, idade_informada, beneficio_numero, especie_codigo, especie_descricao, tipo_beneficio, banco_codigo, banco_nome, valor_beneficio, data_consulta, revisoes, parser_version, criado_em, atualizado_em, finalizada_em, senha_inss, planilha_enviada_em, planilha_linha, responsavel:usuarios!fk_ficha_resp(nome), criador:usuarios!fk_ficha_criadopor(nome)';

function snapshotParaDb(s: FichaSnapshot): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (s.nome !== undefined) p.nome = s.nome || null;
  if (s.cpf !== undefined) p.cpf = s.cpf || null;
  if (s.cidade !== undefined) p.cidade = s.cidade || null;
  if (s.uf !== undefined) p.uf = s.uf || null;
  if (s.telefone !== undefined) p.telefone = s.telefone || null;
  if (s.email !== undefined) p.email = s.email || null;
  if (s.rg !== undefined) p.rg = s.rg || null;
  if (s.estadoCivil !== undefined) p.estado_civil = s.estadoCivil || null;
  if (s.nascimento !== undefined) p.nascimento = s.nascimento || null;
  if (s.idadeInformada !== undefined) p.idade_informada = s.idadeInformada ?? null;
  if (s.beneficioNumero !== undefined) p.beneficio_numero = s.beneficioNumero || null;
  if (s.especieCodigo !== undefined) p.especie_codigo = s.especieCodigo || null;
  if (s.especieDescricao !== undefined) p.especie_descricao = s.especieDescricao || null;
  if (s.tipoBeneficio !== undefined) p.tipo_beneficio = s.tipoBeneficio ?? null;
  if (s.bancoCodigo !== undefined) p.banco_codigo = s.bancoCodigo || null;
  if (s.bancoNome !== undefined) p.banco_nome = s.bancoNome || null;
  if (s.valorBeneficio !== undefined) p.valor_beneficio = s.valorBeneficio ?? null;
  if (s.dataConsulta !== undefined) p.data_consulta = s.dataConsulta || null;
  if (s.textoOriginal !== undefined) p.texto_original = s.textoOriginal || null;
  if (s.textoFicha !== undefined) p.texto_ficha = s.textoFicha || null;
  if (s.revisoes !== undefined) p.revisoes = s.revisoes;
  if (s.parserVersion !== undefined) p.parser_version = s.parserVersion || null;
  if (s.senhaInss !== undefined) p.senha_inss = s.senhaInss || null;
  return p;
}

/* ---------- modo demonstração (porto demo, sem backend): ficha seed em memória ----------
   Espelha o seed do Kanban v2 (kl-5 = ficha finalizada). Permite demonstrar a ficha e o
   envio à planilha sem Supabase; o envio real é bloqueado fora daqui (DEMO_MODE/backend). */
const FICHA_DEMO_KL5: FichaJudicial = {
  id: 'kf-demo-5', organizacaoId: 'org_demo', contatoId: 'kct-5', oportunidadeId: 'kl-5',
  conversaId: null, canalId: null, responsavelId: 'u-mock', responsavelNome: 'Juliana',
  criadoPor: 'u-mock', criadoPorNome: 'Juliana', versao: 1, fichaAnteriorId: null,
  status: 'finalizada', textoOriginal: '', textoFicha: 'FICHA JUDICIAL — DEMONSTRAÇÃO',
  nome: 'ANTÔNIO PEREIRA LIMA', cpf: '00312345678', cidade: 'Porto Alegre', uf: 'RS',
  telefone: '5551999884477', email: '', rg: '1098765432', estadoCivil: 'Casado',
  nascimento: '1957-03-14', idadeInformada: 69,
  beneficioNumero: '178.456.789-0', especieCodigo: '42', especieDescricao: 'Aposentadoria por tempo de contribuição',
  tipoBeneficio: 'aposentadoria', bancoCodigo: '623', bancoNome: 'Banco Pan', valorBeneficio: 2412.35,
  dataConsulta: '2026-08-21', revisoes: [], parserVersion: 'demo',
  criadoEm: '2026-08-21T14:00:00Z', atualizadoEm: '2026-08-21T14:40:00Z', finalizadaEm: '2026-08-21T14:40:00Z',
  senhaInss: 'Demo!2026', planilhaEnviadaEm: null, planilhaLinha: null,
};
const DEMO_FICHAS: Record<string, FichaJudicial> = { 'kl-5': FICHA_DEMO_KL5 };

/** Ficha seed do modo demonstração para a oportunidade (null fora do demo). */
export function fichaDemoDaOportunidade(oportunidadeId: string | null | undefined): FichaJudicial | null {
  return (isDemoMode && oportunidadeId && DEMO_FICHAS[oportunidadeId]) || null;
}

/** Ficha seed do demo pelo CONTATO (aba WhatsApp: a conversa conhece o contato, não a opp). */
export function fichaDemoDoContato(contatoId: string | null | undefined): FichaJudicial | null {
  if (!isDemoMode || !contatoId) return null;
  return Object.values(DEMO_FICHAS).find((f) => f.contatoId === contatoId) ?? null;
}

/* canal seed do demo — permite mostrar a sugestão de Tráfego pelo chip sem backend */
const DEMO_CANAIS: Record<string, CanalPlanilha> = {
  'wa-canal-luiza': { nomeInterno: 'LUIZA', fonteNome: 'Tráfego 1' },
};

export interface CanalPlanilha { nomeInterno: string; fonteNome: string | null }

/** Canal (nome interno + fonte de aquisição) para sugerir o Tráfego da planilha. */
export function useCanalPlanilha(canalId: string | null | undefined) {
  return useQuery({
    queryKey: ['canal-planilha', canalId],
    enabled: (FICHA_REAL || isDemoMode) && !!canalId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CanalPlanilha | null> => {
      if (!FICHA_REAL) return DEMO_CANAIS[canalId!] ?? null;
      const { data, error } = await supabase!.from('canais')
        .select('nome_interno, fonte:fontes_aquisicao(nome)').eq('id', canalId!).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const fonte = one(data.fonte as { nome: string } | { nome: string }[] | null);
      return { nomeInterno: (data.nome_interno as string) || '', fonteNome: fonte?.nome ?? null };
    },
  });
}

export function useFichasDaOportunidade(oportunidadeId: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['fichas-oportunidade', org, oportunidadeId],
    enabled: (FICHA_REAL || isDemoMode) && !!oportunidadeId,
    queryFn: async (): Promise<FichaJudicial[]> => {
      if (!FICHA_REAL) { const f = DEMO_FICHAS[oportunidadeId!]; return f ? [f] : []; }
      const { data, error } = await supabase!.from('fichas_judiciais').select(SELECT)
        .eq('organizacao_id', org).eq('oportunidade_id', oportunidadeId!).order('versao', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown[]) ?? []).map((r) => mapFicha(r as Record<string, unknown>));
    },
  });
}

export function useFichaJudicial(fichaId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ficha', currentOrg.id, fichaId],
    enabled: FICHA_REAL && !!fichaId,
    queryFn: async (): Promise<FichaJudicial | null> => {
      const { data, error } = await supabase!.from('fichas_judiciais').select(SELECT).eq('id', fichaId!).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapFicha(data as Record<string, unknown>) : null;
    },
  });
}

/** Status mais recente da ficha por oportunidade (para indicador no card). */
/** Resumo de ficha por oportunidade para o QUADRO do Kanban: status (badge do card)
 *  + bancos — banco_nome (o banco DO CLIENTE, que recebe o benefício) e os bancos
 *  das REVs (instituições acionadas). Mesma consulta única de antes, só mais larga. */
export interface FichaBoardResumo {
  status: FichaStatus;
  bancoNome: string | null;
  revBancos: string[];
}
export function useFichasStatusDeOportunidades(ids: string[]) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const chave = [...new Set(ids)].sort().join(',');
  return useQuery({
    queryKey: ['fichas-status', org, chave],
    enabled: FICHA_REAL && ids.length > 0,
    queryFn: async (): Promise<Record<string, FichaBoardResumo>> => {
      const { data, error } = await supabase!.from('fichas_judiciais').select('oportunidade_id, status, versao, banco_nome, revisoes')
        .eq('organizacao_id', org).in('oportunidade_id', [...new Set(ids)]).order('versao', { ascending: false });
      if (error) throw new Error(error.message);
      const map: Record<string, FichaBoardResumo> = {};
      for (const r0 of (data as unknown[]) ?? []) {
        const r = r0 as { oportunidade_id: string; status: FichaStatus; banco_nome: string | null; revisoes: { bancoNome?: string; banco_nome?: string }[] | null };
        if (!r.oportunidade_id || map[r.oportunidade_id]) continue; // primeira = maior versão
        const revBancos = [...new Set((r.revisoes ?? []).map((v) => (v.bancoNome ?? v.banco_nome ?? '').trim()).filter(Boolean))];
        map[r.oportunidade_id] = { status: r.status, bancoNome: r.banco_nome?.trim() || null, revBancos };
      }
      return map;
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return (oportunidadeId?: string | null, fichaId?: string | null) => {
    qc.invalidateQueries({ queryKey: ['fichas-oportunidade', currentOrg.id, oportunidadeId ?? undefined] });
    qc.invalidateQueries({ queryKey: ['fichas-status', currentOrg.id] });
    if (fichaId) qc.invalidateQueries({ queryKey: ['ficha', currentOrg.id, fichaId] });
  };
}

export function useCriarFichaJudicial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ vinculos, snapshot, criadoPor }: { vinculos: FichaVinculos; snapshot: FichaSnapshot; criadoPor: string }): Promise<FichaJudicial> => {
      const payload: Record<string, unknown> = {
        organizacao_id: vinculos.organizacaoId, contato_id: vinculos.contatoId,
        oportunidade_id: vinculos.oportunidadeId ?? null, conversa_id: vinculos.conversaId ?? null, canal_id: vinculos.canalId ?? null,
        responsavel_id: vinculos.responsavelId ?? null, ficha_anterior_id: vinculos.fichaAnteriorId ?? null,
        criado_por: criadoPor, atualizado_por: criadoPor, status: 'rascunho',
        ...snapshotParaDb(snapshot),
      };
      const { data, error } = await supabase!.from('fichas_judiciais').insert(payload).select(SELECT).single();
      if (error) throw new Error(error.message);
      return mapFicha(data as Record<string, unknown>);
    },
    onSuccess: (f) => invalidar(f.oportunidadeId, f.id),
  });
}

/* ---------- envio à planilha CONTROLE CLIENTES AGENDADOS ---------- */

export type CorPlanilha = '' | 'verde' | 'amarelo' | 'vermelho';
export interface EnvioPlanilha {
  ficha: FichaJudicial;
  cliente: string; cpf: string; senhaInss: string; numero: string; trafego: string; responsavel: string;
  /** cor da linha na planilha ('' = não mexe na cor). */
  cor: CorPlanilha;
}
export interface EnvioPlanilhaResultado { acao: 'criado' | 'atualizado'; linha: number | null; aviso?: string }

/** Chama a edge function enviar-planilha e atualiza o estado local da ficha
 *  (carimbo planilha_enviada_em/planilha_linha) sem exigir recarregar. */
export function useEnviarFichaPlanilha() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: EnvioPlanilha): Promise<EnvioPlanilhaResultado> => {
      if (!FICHA_REAL) {
        // porto demo (sem backend): simula a ponte e carimba o seed em memória
        await new Promise((r) => setTimeout(r, 700));
        const seed = p.ficha.oportunidadeId ? DEMO_FICHAS[p.ficha.oportunidadeId] : null;
        const acao = seed?.planilhaEnviadaEm ? 'atualizado' as const : 'criado' as const;
        if (seed && p.ficha.oportunidadeId) {
          DEMO_FICHAS[p.ficha.oportunidadeId] = { ...seed, senhaInss: p.senhaInss || seed.senhaInss, planilhaEnviadaEm: new Date().toISOString(), planilhaLinha: 402 };
        }
        return { acao, linha: 402 };
      }
      if (DEMO_MODE) throw acaoSimulada(); // site demo: planilha real nunca é tocada
      const { data, error } = await supabase!.functions.invoke('enviar-planilha', {
        body: {
          ficha_id: p.ficha.id, cliente: p.cliente, cpf: p.cpf, senha_inss: p.senhaInss,
          numero: p.numero, trafego: p.trafego, responsavel: p.responsavel, cor: p.cor,
        },
      });
      if (error) {
        let msg = error.message;
        // supabase-js não parseia o corpo em respostas non-2xx; lê o erro real do Response.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try { const b = await ctx.clone().json() as { erro?: string; error?: string }; msg = b?.erro || b?.error || msg; } catch { /* mantém msg */ }
        }
        throw new Error(msg);
      }
      const r = data as { ok?: boolean; acao?: string; linha?: number | null; erro?: string; aviso?: string } | null;
      if (!r?.ok) throw new Error(r?.erro || 'Falha ao enviar à planilha.');
      return { acao: r.acao === 'atualizado' ? 'atualizado' : 'criado', linha: r.linha ?? null, aviso: r.aviso };
    },
    onSuccess: (res, p) => {
      // atualização local imediata (o botão vira "Atualizar na planilha" sem recarregar)
      const patch = (f: FichaJudicial): FichaJudicial => f.id !== p.ficha.id ? f
        : { ...f, senhaInss: p.senhaInss || f.senhaInss, planilhaEnviadaEm: new Date().toISOString(), planilhaLinha: res.linha };
      qc.setQueryData<FichaJudicial[]>(['fichas-oportunidade', currentOrg.id, p.ficha.oportunidadeId], (fs) => fs?.map(patch));
      qc.setQueryData<FichaJudicial | null>(['ficha', currentOrg.id, p.ficha.id], (f) => (f ? patch(f) : f));
      qc.invalidateQueries({ queryKey: ['fichas-oportunidade', currentOrg.id, p.ficha.oportunidadeId] });
      qc.invalidateQueries({ queryKey: ['ficha', currentOrg.id, p.ficha.id] });
    },
  });
}

export function useAtualizarFichaJudicial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, snapshot, responsavelId }: { id: string; snapshot: FichaSnapshot; responsavelId?: string | null }): Promise<FichaJudicial> => {
      const patch = snapshotParaDb(snapshot);
      if (responsavelId !== undefined) patch.responsavel_id = responsavelId;
      const { data, error } = await supabase!.from('fichas_judiciais').update(patch).eq('id', id).select(SELECT).single();
      if (error) throw new Error(error.message);
      return mapFicha(data as Record<string, unknown>);
    },
    onSuccess: (f) => invalidar(f.oportunidadeId, f.id),
  });
}

export function useFinalizarFichaJudicial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, snapshot, responsavelId }: { id: string; snapshot: FichaSnapshot; responsavelId?: string | null }): Promise<FichaJudicial> => {
      const patch = { ...snapshotParaDb(snapshot), status: 'finalizada' as const };
      if (responsavelId !== undefined) (patch as Record<string, unknown>).responsavel_id = responsavelId;
      const { data, error } = await supabase!.from('fichas_judiciais').update(patch).eq('id', id).select(SELECT).single();
      if (error) throw new Error(error.message);
      return mapFicha(data as Record<string, unknown>);
    },
    onSuccess: (f) => invalidar(f.oportunidadeId, f.id),
  });
}

export function useCriarNovaVersaoFicha() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ anterior, criadoPor }: { anterior: FichaJudicial; criadoPor: string }): Promise<FichaJudicial> => {
      const payload: Record<string, unknown> = {
        organizacao_id: anterior.organizacaoId, contato_id: anterior.contatoId,
        oportunidade_id: anterior.oportunidadeId, conversa_id: anterior.conversaId, canal_id: anterior.canalId,
        responsavel_id: anterior.responsavelId, ficha_anterior_id: anterior.id,
        criado_por: criadoPor, atualizado_por: criadoPor, status: 'rascunho',
        ...snapshotParaDb({
          nome: anterior.nome, cpf: anterior.cpf, cidade: anterior.cidade, uf: anterior.uf, telefone: anterior.telefone, email: anterior.email,
          rg: anterior.rg, estadoCivil: anterior.estadoCivil, nascimento: anterior.nascimento, idadeInformada: anterior.idadeInformada,
          beneficioNumero: anterior.beneficioNumero, especieCodigo: anterior.especieCodigo, especieDescricao: anterior.especieDescricao,
          tipoBeneficio: anterior.tipoBeneficio, bancoCodigo: anterior.bancoCodigo, bancoNome: anterior.bancoNome,
          valorBeneficio: anterior.valorBeneficio, dataConsulta: anterior.dataConsulta, textoOriginal: anterior.textoOriginal,
          textoFicha: anterior.textoFicha, revisoes: anterior.revisoes, parserVersion: anterior.parserVersion,
          senhaInss: anterior.senhaInss,
        }),
      };
      const { data, error } = await supabase!.from('fichas_judiciais').insert(payload).select(SELECT).single();
      if (error) throw new Error(error.message);
      return mapFicha(data as Record<string, unknown>);
    },
    onSuccess: (f) => invalidar(f.oportunidadeId, f.id),
  });
}
