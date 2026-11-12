/* ============================================================================
   Fila da Iris — a fonte de verdade: o banco (public.fila_iris_itens / _numeros / _marcar / _tirar,
   supabase/migrations/20261111200000_fila_iris.sql). Só as marcações são gravadas; a Iris, o robô,
   as conversas e os cards não mudam.
   ============================================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { EQUIPE, equipeDoUid } from './dados';
import { leadDeLinha, type Lead, type LinhaFila } from './lead';
import { fimPeriodo, inicioPeriodo, type ConversaFicha, type FonteFila, type MensagemFicha, type NumeroAtendente, type Periodo } from './fonte';
import { useWaMensagens } from '@/data/whatsapp';
import { EVENTO_FILA_RECARREGAR } from './recados';

/* ---------------------------------------------------------------- real (banco) */
/** a conversa com o cliente na ficha: o MESMO histórico que o WhatsApp lê (useWaMensagens — 15 s de frescor), sem as
    notas internas e as mensagens de sistema; as últimas 60 (as anteriores ficam no WhatsApp) */
const MAX_NA_FICHA = 60;
function useConversaReal(l: Lead): ConversaFicha {
  const q = useWaMensagens(l.conversaId ?? null);
  const mensagens = useMemo<MensagemFicha[] | null>(() => {
    if (!q.data) return null;
    return q.data
      .filter((m) => m.tipo !== 'sistema' && m.tipo !== 'nota_interna')
      .slice(-MAX_NA_FICHA)
      .map((m, i): MensagemFicha => ({
        id: m.id ?? `m${i}`, dir: m.dir, texto: m.text ?? '', tipo: m.tipo ?? 'texto',
        em: m.tsISO ? Date.parse(m.tsISO) : 0, quem: m.dir === 'out' ? (m.origemBot ? 'ia' : m.viaTelefone ? 'celular' : undefined) : undefined,
        transcricao: m.transcricao,
      }));
  }, [q.data]);
  return { mensagens, carregando: q.isLoading && !!l.conversaId, erro: q.error ? 'Não deu para carregar a conversa agora.' : null };
}

type LinhaNumero = { usuario_id: string; nome: string; recebidos: number; fechados: number };
type LinhaMarcacoes = { usuario_id: string; marcacoes: number };

export function useFonteReal(): FonteFila {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nums, setNums] = useState<Partial<Record<Periodo, NumeroAtendente[]>>>({});
  /* queda de rede não pode parar a fila num aviso: tenta de novo sozinho (5 s, 10 s… até 4 vezes; o relógio de 2 min continua) */
  const tentativa = useRef(0);
  const retentar = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    if (!supabase || !org) return;
    const { data, error } = await supabase.rpc('fila_iris_itens', { p_org: org, p_dono: null });
    if (error) {
      tentativa.current += 1;
      const rede = /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
      setErro(rede ? 'sem conexão com o servidor agora — tentando de novo sozinho' : error.message);
      setCarregando(false);
      if (tentativa.current <= 4 && retentar.current == null) {
        retentar.current = window.setTimeout(() => { retentar.current = null; void carregar(); }, Math.min(5000 * tentativa.current, 20000));
      }
      return;
    }
    tentativa.current = 0;
    setErro(null);
    setLeads(((data ?? []) as LinhaFila[]).map(leadDeLinha));
    setCarregando(false);
  }, [org]);

  const carregarNumeros = useCallback(async () => {
    /* o administrador recebe a equipe toda; o atendente, só a PRÓPRIA linha (o banco já garante; aqui é o cinto) */
    if (!supabase || !org) return;
    const admin = currentOrg?.role === 'admin';
    const uid = admin ? null : (await supabase.auth.getSession()).data.session?.user.id ?? null;
    const res: Partial<Record<Periodo, NumeroAtendente[]>> = {};
    for (const p of ['hoje', '7d', 'mes', 'mes_ant'] as Periodo[]) {
      const faixa = { p_org: org, p_inicio: inicioPeriodo(p).toISOString(), p_fim: fimPeriodo(p).toISOString() };
      /* as marcações feitas no período (dono 12/11: "quantas marcações a gente fez no dia") vêm de outra função;
         sem ela (falhou), a tela conta as da fila carregada */
      const [{ data, error }, marc] = await Promise.all([
        supabase.rpc('fila_iris_numeros', faixa),
        supabase.rpc('fila_iris_marcacoes_numeros', faixa),
      ]);
      if (error) continue;
      const porUid = marc.error ? null : new Map(((marc.data ?? []) as LinhaMarcacoes[]).map((m) => [m.usuario_id, m.marcacoes]));
      res[p] = ((data ?? []) as LinhaNumero[])
        .filter((n) => admin || n.usuario_id === uid)
        .map((n) => ({ atendente: equipeDoUid(n.usuario_id) ?? n.usuario_id, recebidos: n.recebidos, fechados: n.fechados,
          marcacoes: porUid ? (porUid.get(n.usuario_id) ?? 0) : undefined }))
        .filter((n) => EQUIPE.some((a) => a.id === n.atendente));
    }
    setNums(res);
  }, [org, currentOrg?.role]);

  useEffect(() => {
    void carregar();
    void carregarNumeros();
    /* a fila muda sozinha (24 h, documentos, fechados): relê a cada 2 minutos */
    const t = window.setInterval(() => { void carregar(); }, 120_000);
    /* um repasse pelo recado do administrador trocou o dono de um cliente: relê na hora */
    const releia = () => { void carregar(); };
    window.addEventListener(EVENTO_FILA_RECARREGAR, releia);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(EVENTO_FILA_RECARREGAR, releia);
      if (retentar.current != null) { window.clearTimeout(retentar.current); retentar.current = null; }
    };
  }, [carregar, carregarNumeros]);

  const rpc = useCallback(async (nome: string, args: Record<string, unknown>) => {
    if (!supabase || !org) return;
    const { error } = await supabase.rpc(nome, { p_org: org, ...args });
    if (error) setErro(error.message);
    await carregar();
  }, [org, carregar]);

  return useMemo<FonteFila>(() => ({
    modo: 'real', rotulo: 'atualiza sozinha a cada 2 minutos', carregando, erro, leads,
    marcar: (id, tipo, texto) => { void rpc('fila_iris_marcar', { p_contato: id, p_tipo: tipo, p_texto: texto ?? null }); },
    tirarMarca: (_id, mid) => { void rpc('fila_iris_tirar', { p_marcacao: mid }); },
    corrigirDocs: (id, estado) => {
      const l = leads.find((x) => x.id === id);
      if (estado) void rpc('fila_iris_marcar', { p_contato: id, p_tipo: estado === 'completos' ? 'docs_completos' : 'docs_incompletos', p_texto: null });
      else if (l?.docsManualId) void rpc('fila_iris_tirar', { p_marcacao: l.docsManualId });
    },
    tirarDaFila: (id) => { void rpc('fila_iris_marcar', { p_contato: id, p_tipo: 'fora_da_fila', p_texto: 'tirado pelo atendente' }); },
    numeros: (p) => nums[p] ?? null,
    recarregar: carregar,
    usarConversa: useConversaReal,
  }), [carregando, erro, leads, nums, rpc, carregar]);
}
