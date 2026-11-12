/* ============================================================================
   Fila da Iris — a fonte de verdade: o banco (public.fila_iris_itens / _numeros / _marcar / _tirar,
   supabase/migrations/20261111200000_fila_iris.sql). Só as marcações são gravadas; a Iris, o robô,
   as conversas e os cards não mudam.
   ============================================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { EQUIPE, equipeDoUid } from './dados';
import { leadDeLinha, type Lead, type LinhaFila } from './lead';
import { fimPeriodo, inicioPeriodo, type FonteFila, type NumeroAtendente, type Periodo } from './fonte';

/* ---------------------------------------------------------------- real (banco) */
type LinhaNumero = { usuario_id: string; nome: string; recebidos: number; fechados: number };

export function useFonteReal(): FonteFila {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nums, setNums] = useState<Partial<Record<Periodo, NumeroAtendente[]>>>({});

  const carregar = useCallback(async () => {
    if (!supabase || !org) return;
    const { data, error } = await supabase.rpc('fila_iris_itens', { p_org: org, p_dono: null });
    if (error) { setErro(error.message); setCarregando(false); return; }
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
      const { data, error } = await supabase.rpc('fila_iris_numeros', { p_org: org, p_inicio: inicioPeriodo(p).toISOString(), p_fim: fimPeriodo(p).toISOString() });
      if (error) continue;
      res[p] = ((data ?? []) as LinhaNumero[])
        .filter((n) => admin || n.usuario_id === uid)
        .map((n) => ({ atendente: equipeDoUid(n.usuario_id) ?? n.usuario_id, recebidos: n.recebidos, fechados: n.fechados }))
        .filter((n) => EQUIPE.some((a) => a.id === n.atendente));
    }
    setNums(res);
  }, [org, currentOrg?.role]);

  useEffect(() => {
    void carregar();
    void carregarNumeros();
    /* a fila muda sozinha (24 h, documentos, fechados): relê a cada 2 minutos */
    const t = window.setInterval(() => { void carregar(); }, 120_000);
    return () => window.clearInterval(t);
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
  }), [carregando, erro, leads, nums, rpc]);
}
