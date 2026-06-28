import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
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
}

/** Campos de snapshot/edição (camelCase). Vínculos só na criação. */
export interface FichaSnapshot {
  nome?: string; cpf?: string; cidade?: string; uf?: string; telefone?: string; email?: string; rg?: string; estadoCivil?: string;
  nascimento?: string | null; idadeInformada?: number | null;
  beneficioNumero?: string; especieCodigo?: string; especieDescricao?: string; tipoBeneficio?: FichaTipoBeneficio | null;
  bancoCodigo?: string; bancoNome?: string; valorBeneficio?: number | null; dataConsulta?: string | null;
  textoOriginal?: string; textoFicha?: string; revisoes?: FichaRevisao[]; parserVersion?: string;
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
  };
}

const SELECT = 'id, organizacao_id, contato_id, oportunidade_id, conversa_id, canal_id, responsavel_id, criado_por, versao, ficha_anterior_id, status, texto_original, texto_ficha, nome, cpf, cidade, uf, telefone, email, rg, estado_civil, nascimento, idade_informada, beneficio_numero, especie_codigo, especie_descricao, tipo_beneficio, banco_codigo, banco_nome, valor_beneficio, data_consulta, revisoes, parser_version, criado_em, atualizado_em, finalizada_em, responsavel:usuarios!fk_ficha_resp(nome), criador:usuarios!fk_ficha_criadopor(nome)';

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
  return p;
}

export function useFichasDaOportunidade(oportunidadeId: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['fichas-oportunidade', org, oportunidadeId],
    enabled: FICHA_REAL && !!oportunidadeId,
    queryFn: async (): Promise<FichaJudicial[]> => {
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
export function useFichasStatusDeOportunidades(ids: string[]) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const chave = [...new Set(ids)].sort().join(',');
  return useQuery({
    queryKey: ['fichas-status', org, chave],
    enabled: FICHA_REAL && ids.length > 0,
    queryFn: async (): Promise<Record<string, FichaStatus>> => {
      const { data, error } = await supabase!.from('fichas_judiciais').select('oportunidade_id, status, versao')
        .eq('organizacao_id', org).in('oportunidade_id', [...new Set(ids)]).order('versao', { ascending: false });
      if (error) throw new Error(error.message);
      const map: Record<string, FichaStatus> = {};
      for (const r0 of (data as unknown[]) ?? []) {
        const r = r0 as { oportunidade_id: string; status: FichaStatus };
        if (r.oportunidade_id && !map[r.oportunidade_id]) map[r.oportunidade_id] = r.status; // primeira = maior versão
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
        }),
      };
      const { data, error } = await supabase!.from('fichas_judiciais').insert(payload).select(SELECT).single();
      if (error) throw new Error(error.message);
      return mapFicha(data as Record<string, unknown>);
    },
    onSuccess: (f) => invalidar(f.oportunidadeId, f.id),
  });
}
