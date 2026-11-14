/* ============================================================================
   Fila da Iris — a fonte de verdade: o banco (public.fila_iris_itens / _numeros / _marcar / _tirar,
   supabase/migrations/20261111200000_fila_iris.sql). Só as marcações são gravadas; a Iris, o robô,
   as conversas e os cards não mudam.
   ============================================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { EQUIPE, equipeDoUid } from './dados';
import { foneBonito, leadDeLinha, nomeBonito, type Lead, type LinhaFila } from './lead';
import {
  fimPeriodo, inicioPeriodo, type CategoriaChegada, type Chegadas, type ClienteIris, type FonteFila, type IrisAgora, type NumeroAtendente, type Periodo,
} from './fonte';
import ConversaWa from './ConversaWa';
import { EVENTO_FILA_RECARREGAR } from './recados';

/* ---------------------------------------------------------------- real (banco) */

type LinhaNumero = { usuario_id: string; nome: string; recebidos: number; fechados: number };
type LinhaMarcacoes = { usuario_id: string; marcacoes: number };
/* dono 14/11: a Iris agora (fila_iris_iris_agora) e os adicionados (fila_iris_chegadas) */
type LinhaIris = {
  contato_id: string; conversa_id: string; nome: string | null; telefone: string | null; dono_id: string | null;
  campanha: string | null; numero: string | null; numero_campanha: string | null; etapa: string | null; desde: string;
  ult_cliente_em: string | null; ult_nossa_em: string | null; ult_nossa_origem: string | null; respondeu_iris: boolean | null;
  pediu_humano: string | null; categoria_fila: string | null;
};
type RespostaChegadas = { linhas: { usuario_id: string; categoria: CategoriaChegada; n: number }[] | null; desde: string | null };
const ms = (t: string | null) => (t ? Date.parse(t) : undefined);

/* O PostgREST corta qualquer resposta em 1000 linhas SEM AVISAR (db-max-rows, o mesmo teto do inbox em 18/09): em
   14/11 a fila tinha 1.088 linhas e a tela mostrava "1000 clientes" — 88 sumiam. Lê em páginas por contato_id
   (imutável), pegando de novo o último contato da página (um cliente com dois cards ocupa duas linhas) e tirando os
   repetidos pela chave. */
const PAGINA = 1000;
async function lerTudo<T extends { contato_id: string }>(nome: string, args: Record<string, unknown>, chave: (r: T) => string):
  Promise<{ data: T[] | null; error: { message: string } | null }> {
  if (!supabase) return { data: null, error: { message: 'sem conexão' } };
  const todos = new Map<string, T>();
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    let q = supabase.rpc(nome, args).order('contato_id').limit(PAGINA);
    if (cursor) q = q.gte('contato_id', cursor);
    const { data, error } = await q;
    if (error) {
      /* a 1ª página falhou: lê do jeito antigo (uma chamada só, com o teto) — melhor a fila de antes que fila nenhuma */
      if (pagina === 0) {
        const antigo = await supabase.rpc(nome, args);
        return antigo.error ? { data: null, error: antigo.error } : { data: (antigo.data ?? []) as T[], error: null };
      }
      return { data: null, error };
    }
    const lote = (data ?? []) as T[];
    for (const r of lote) todos.set(chave(r), r);
    if (lote.length < PAGINA) break;
    const ultimo = lote[lote.length - 1].contato_id;
    if (ultimo === cursor) break;
    cursor = ultimo;
  }
  return { data: [...todos.values()], error: null };
}
function clienteIris(r: LinhaIris): ClienteIris {
  return {
    contatoId: r.contato_id, conversaId: r.conversa_id, nome: nomeBonito(r.nome, r.telefone), fone: foneBonito(r.telefone),
    dono: r.dono_id ? equipeDoUid(r.dono_id) ?? r.dono_id : null, campanha: r.campanha ?? 'sem_campanha', numero: r.numero,
    numeroCampanha: r.numero_campanha, respondeuIris: r.respondeu_iris,
    etapa: r.etapa, desde: Date.parse(r.desde), ultCliente: ms(r.ult_cliente_em), ultNossa: ms(r.ult_nossa_em),
    ultNossaOrigem: r.ult_nossa_origem, pediuHumano: r.pediu_humano, categoriaFila: r.categoria_fila,
  };
}

export function useFonteReal(): FonteFila {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nums, setNums] = useState<Partial<Record<Periodo, NumeroAtendente[]>>>({});
  const [cheg, setCheg] = useState<Partial<Record<Periodo, Chegadas>>>({});
  const admin = currentOrg?.role === 'admin';
  /* a Iris agora só vai para o administrador (a visão Equipe); undefined = esta pessoa não recebe */
  const [iris, setIris] = useState<IrisAgora | null | undefined>(admin ? null : undefined);
  /* queda de rede não pode parar a fila num aviso: tenta de novo sozinho (5 s, 10 s… até 4 vezes; o relógio de 2 min continua) */
  const tentativa = useRef(0);
  const retentar = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    if (!supabase || !org) return;
    const { data, error } = await lerTudo<LinhaFila>('fila_iris_itens', { p_org: org, p_dono: null },
      (r) => `${r.contato_id}|${r.oportunidade_id ?? ''}`);
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
    const chegou: Partial<Record<Periodo, Chegadas>> = {};
    for (const p of ['hoje', '7d', 'mes', 'mes_ant'] as Periodo[]) {
      const faixa = { p_org: org, p_inicio: inicioPeriodo(p).toISOString(), p_fim: fimPeriodo(p).toISOString() };
      /* as marcações feitas no período (dono 12/11: "quantas marcações a gente fez no dia") vêm de outra função;
         sem ela (falhou), a tela conta as da fila carregada. Os adicionados (dono 14/11) vêm do registro da Iris. */
      const [{ data, error }, marc, ch] = await Promise.all([
        supabase.rpc('fila_iris_numeros', faixa),
        supabase.rpc('fila_iris_marcacoes_numeros', faixa),
        supabase.rpc('fila_iris_chegadas', faixa),
      ]);
      if (!ch.error && ch.data) {
        const d = ch.data as RespostaChegadas;
        const por: Chegadas['por'] = {};
        for (const a of EQUIPE) if (admin || a.uid === uid) por[a.id] = {};
        for (const l of d.linhas ?? []) {
          const id = equipeDoUid(l.usuario_id);
          if (!id || (!admin && l.usuario_id !== uid)) continue;
          (por[id] ??= {})[l.categoria] = l.n;
        }
        chegou[p] = { por, desde: ms(d.desde) ?? null };
      }
      if (error) continue;
      const porUid = marc.error ? null : new Map(((marc.data ?? []) as LinhaMarcacoes[]).map((m) => [m.usuario_id, m.marcacoes]));
      res[p] = ((data ?? []) as LinhaNumero[])
        .filter((n) => admin || n.usuario_id === uid)
        .map((n) => ({ atendente: equipeDoUid(n.usuario_id) ?? n.usuario_id, recebidos: n.recebidos, fechados: n.fechados,
          marcacoes: porUid ? (porUid.get(n.usuario_id) ?? 0) : undefined }))
        .filter((n) => EQUIPE.some((a) => a.id === n.atendente));
    }
    /* o período cuja leitura falhou fica com o último valor bom (a releitura de 5 min nunca apaga um número certo) */
    setNums((x) => ({ ...x, ...res }));
    setCheg((x) => ({ ...x, ...chegou }));
  }, [org, currentOrg?.role]);

  /* a Iris agora (só o administrador): relê junto da fila, a cada minuto */
  const carregarIris = useCallback(async () => {
    if (!supabase || !org || !admin) return;
    const { data, error } = await lerTudo<LinhaIris>('fila_iris_iris_agora', { p_org: org }, (r) => r.conversa_id);
    if (error) {
      /* falhou: fica a lista anterior (com o aviso); sem anterior, só o aviso */
      /* sem leitura boa antes: lidaEm 0 = "não sei" (a tela não mostra 0 como se fosse dado) */
      const msg = 'Não deu para ler a lista da Iris agora. Tenta de novo sozinho.';
      setIris((x) => (x?.lidaEm ? { ...x, erro: msg } : { clientes: [], lidaEm: 0, erro: msg }));
      return;
    }
    setIris({ clientes: ((data ?? []) as LinhaIris[]).map(clienteIris), lidaEm: Date.now(), erro: null });
  }, [org, admin]);

  useEffect(() => {
    void carregar();
    void carregarNumeros();
    void carregarIris();
    /* a fila muda sozinha (mensagens, 24 h, documentos, fechados): relê a cada minuto (dono 13/11: "sempre tem que
       atualizar pra última mensagem") e ao voltar para a aba; os números do período (recebidos, marcações, fechados,
       adicionados), a cada 5 minutos */
    const t = window.setInterval(() => { void carregar(); void carregarIris(); }, 60_000);
    const tn = window.setInterval(() => { void carregarNumeros(); }, 5 * 60_000);
    let lidaEm = Date.now();
    const voltou = () => {
      if (document.visibilityState === 'visible' && Date.now() - lidaEm > 15_000) { lidaEm = Date.now(); void carregar(); void carregarIris(); void carregarNumeros(); }
    };
    document.addEventListener('visibilitychange', voltou);
    /* um repasse pelo recado do administrador trocou o dono de um cliente: relê na hora */
    const releia = () => { void carregar(); };
    window.addEventListener(EVENTO_FILA_RECARREGAR, releia);
    return () => {
      window.clearInterval(t);
      window.clearInterval(tn);
      window.removeEventListener(EVENTO_FILA_RECARREGAR, releia);
      document.removeEventListener('visibilitychange', voltou);
      if (retentar.current != null) { window.clearTimeout(retentar.current); retentar.current = null; }
    };
  }, [carregar, carregarNumeros, carregarIris]);

  const rpc = useCallback(async (nome: string, args: Record<string, unknown>) => {
    if (!supabase || !org) return;
    const { error } = await supabase.rpc(nome, { p_org: org, ...args });
    if (error) setErro(error.message);
    await carregar();
  }, [org, carregar]);

  return useMemo<FonteFila>(() => ({
    modo: 'real', rotulo: 'atualiza sozinha a cada minuto', carregando, erro, leads,
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
    /* a conversa COMPLETA na ficha, com fotos e áudios (dono 12/11: "preciso das imagens e áudios, cvs completas") */
    SecaoConversa: ConversaWa,
    chegadas: (p) => cheg[p] ?? null,
    irisAgora: iris,
  }), [carregando, erro, leads, nums, rpc, carregar, cheg, iris]);
}
