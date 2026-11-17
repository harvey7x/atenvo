/* ============================================================================
   Fila da Iris — o AVISO DA MARCAÇÃO VENCIDA (dono 16/11: "quando o prazo terminar tem que enviar uma
   notificação pro atendente" + "aviso tem que ser no meio da tela, obrigando a atualizar"). O relógio do banco
   (fila_iris_avisos_tick, todo minuto) grava o aviso quando a marcação vence (só com o cliente na fila do dono);
   aqui a tela lê os MEUS avisos que ainda valem (fila_iris_marcacao_avisos_meus: enquanto a marcação não for
   atualizada nem tirada, e só os que eu consigo resolver) e faz as duas saídas — atualizar (o que foi feito; o
   prazo recomeça; em "Ligar de novo", "Liguei, não atendeu" é o +1, que conta a ligação) ou tirar a marcação (já
   resolveu). Não existe "Ok": o aviso só sai quando a marcação muda.
   - O que a FILA mexe (ficha, +1, ×, tirar da fila — fonteReal avisa) e o que outra aba resolve tiram o aviso na
     hora: ele não volta para o que acabou de ser resolvido.
   - Demonstração: as marcações da fila da demonstração (filaDemo: a mesma loja da Fila), de quem o "Ver como" diz.
   ============================================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { nomeBonito, type Lead } from './lead';
import { estadoPrazo, LIGUEI_NAO_ATENDEU } from './dados';
import { EVENTO_FILA_RECARREGAR, useDonosLocais, useEuLocal } from './recados';
import { mexerFilaDemo, useFilaDemo } from './filaDemo';
import { comMaisUmaLigacao, comMarcaAtualizada, semMarca } from './fonte';
import {
  EVENTO_MARCACAO_EM_ANDAMENTO, EVENTO_MARCACAO_MEXIDA, ordemDasVencidas, PARA_SEMPRE,
  type AvisoVencida, type MarcacaoEmAndamento, type MarcacaoMexida, type ResultadoAviso, type TipoMarcaAviso,
} from './avisosTexto';

/* a lista vazia é SEMPRE a mesma (sem dado ainda, sem acesso, erro): um [] novo a cada render virava um laço de renders */
const SEM_AVISOS: AvisoVencida[] = [];
/** o que uma aba resolveu, para as outras abas da mesma pessoa (o evento "storage") */
const CHAVE_ABAS = 'atenvo-marcacao-mexida:';
/** o vencimento que a fila guarda e o do aviso podem diferir em milissegundos (o formato do banco): a folga */
const FOLGA_MS = 60_000;
/** o "até onde não vale mais" nunca passa da hora da ação (+ uma margem para o relógio do computador atrasado): só
    existe aviso de vencimento que JÁ passou. Um vencimento ainda no futuro (a fila mostrava "vence em…", duas ações em
    menos de 1 min, o relógio parado) não tem aviso a esconder — e o aviso do vencimento SEGUINTE, 36 h depois da
    ação, nunca é escondido (revisão) */
const MARGEM_RELOGIO_MS = 30 * 60_000;
const GUARDA_ABAS_MS = 2 * 86_400_000;
/** o teto do "até": a hora da ação (+ a margem) — ou o vencimento que o BANCO já mostrou vencido num aviso desta
    marcação (`visto`, na hora do banco: esconder até ele nunca esconde o seguinte, 36 h depois da ação), o que for
    maior. Assim o computador com o relógio atrasado também tira na hora o aviso que acabou de ser resolvido (revisão) */
export const limitar = (ate: number, agora = Date.now(), visto?: number) => (ate >= PARA_SEMPRE ? PARA_SEMPRE
  : Math.min(ate, Math.max(agora + MARGEM_RELOGIO_MS, visto ?? -Infinity)));
/** o pedido da fila nunca segura o aviso mais do que isto (a resposta se perdeu): ele volta, se ainda valer */
const EM_ANDAMENTO_MAX_MS = 20_000;

type LinhaVencida = {
  id: string; marcacao_id: string; contato_id: string; conversa_id: string | null; nome: string | null; tipo: TipoMarcaAviso;
  texto: string | null; vezes: number | null; vence_em: string; criado_em: string; marcada_em: string | null;
  ult: { texto: string; por: string | null; por_nome: string | null; em: string } | null;
};

export type { ResultadoAviso } from './avisosTexto';

/** demonstração: as marcações vencidas dos clientes de quem está olhando (o "Ver como"; o repasse muda o dono) */
export function vencidasDaDemo(leads: Lead[], eu: string, donos: Record<string, string>, agora: number): AvisoVencida[] {
  const lista = leads
    .filter((l) => l.cat !== 'historico' && (donos[l.id] ?? l.atendente) === eu)
    .flatMap((l) => l.marcas.filter((m) => m.venceEm != null && estadoPrazo(m, agora) === 'vencida').map((m): AvisoVencida => ({
      id: `demo-${m.id}-${m.venceEm}`, marcacaoId: m.id, contatoId: l.id, conversaId: l.conversaId, nome: l.nome,
      tipo: m.tipo, texto: m.texto, vezes: m.vezes, venceEm: m.venceEm!, criadoEm: m.venceEm!, marcadaEm: m.em,
      ult: m.ult ? { texto: m.ult.texto, por: m.ult.por, porNome: m.ult.porNome, em: m.ult.em } : undefined,
    })));
  return lista.length ? lista : SEM_AVISOS;
}

/** sem os avisos já resolvidos: o de um vencimento até `ate` (com a folga) sai; o de um vencimento NOVO, depois, vale.
    E sem os das marcações com um pedido da fila em andamento (até o prazo de cada uma, na hora do computador) */
export function semAsResolvidas(lista: AvisoVencida[], mexidas: ReadonlyMap<string, number>,
  emAndamento: ReadonlyMap<string, number> = new Map(), agora = Date.now()): AvisoVencida[] {
  const vale = mexidas.size || emAndamento.size ? lista.filter((a) => {
    const ate = mexidas.get(a.marcacaoId);
    if (ate != null && a.venceEm <= ate + FOLGA_MS) return false;
    return !((emAndamento.get(a.marcacaoId) ?? 0) > agora);
  }) : lista;
  return vale.length ? ordemDasVencidas(vale) : SEM_AVISOS;
}

/** um pedido da fila começou (`fim` falso) ou terminou: conta por marcação e só solta a espera quando o último termina;
    uma espera que já venceu (a resposta se perdeu) não deixa contagem velha para trás */
export function contarPedidos(emAndamento: Map<string, number>, pedidos: Map<string, number>, ids: string[], fim: boolean,
  agora = Date.now()): void {
  for (const id of ids) {
    const vivos = (emAndamento.get(id) ?? 0) > agora ? (pedidos.get(id) ?? 0) : 0;
    const n = fim ? vivos - 1 : vivos + 1;
    if (n > 0) {
      pedidos.set(id, n);
      if (!fim) emAndamento.set(id, agora + EM_ANDAMENTO_MAX_MS);
    } else {
      pedidos.delete(id);
      emAndamento.delete(id);
    }
  }
}

/** o erro do banco em português (a mesma régua do Atualizar da fila) */
function erroLegivel(e: { message: string; code?: string }): Error {
  const rede = /failed to fetch|networkerror|load failed|network request failed/i.test(e.message);
  return new Error(rede ? 'Sem conexão agora. Tente de novo em instantes.'
    : e.code === 'PGRST202' ? 'O prazo das marcações ainda não está pronto no sistema. Recarregue a página.'
      : e.code === 'P0001' || e.code === '42501' ? e.message : 'Não deu para salvar agora. Tente de novo.');
}
/** o cliente passou para outra pessoa (atualizar e tirar exigem o dono de agora): o aviso não é mais meu */
const deOutro = (e: { message: string; code?: string }) => e.code === '42501' && /outro atendente/i.test(e.message);

export interface AvisosMarcacao {
  /** os que ainda valem: os do mesmo cliente juntos, o cliente que venceu primeiro na frente */
  avisos: AvisoVencida[];
  /** a 1ª leitura terminou (a notificação do navegador só conta os que chegarem depois) */
  pronto: boolean;
  /** "o que foi feito": o prazo recomeça e o aviso sai; falha = Error com a frase para a tela */
  atualizar: (a: AvisoVencida, texto: string) => Promise<ResultadoAviso>;
  /** já resolveu: a marcação sai da fila e o aviso também */
  tirar: (a: AvisoVencida) => Promise<ResultadoAviso>;
}

/** os meus avisos de marcação vencida + as duas saídas. `ativo` = tenho a Fila da Iris. */
export function useAvisosMarcacao(ativo: boolean): AvisosMarcacao {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const org = currentOrg?.id;
  const uid = user?.id;
  const qc = useQueryClient();
  /* a chave leva o usuário: quem entra na mesma aba depois de outro nunca vê os avisos dele */
  const chave = useMemo(() => ['fila-iris-avisos-marcacao', org ?? '', uid ?? ''], [org, uid]);
  const chaveAbas = uid ? `${CHAVE_ABAS}${uid}` : null;

  /* o que já foi resolvido (aqui, pela fila desta aba ou em outra aba): os avisos daquele vencimento (ou de antes) saem
     na hora — uma leitura em voo ainda pode trazer a lista de antes. marcação → o vencimento até onde não vale mais */
  const mexidas = useRef(new Map<string, number>());
  const [versao, setVersao] = useState(0);
  const registrar = useCallback((recebida: MarcacaoMexida[], contarParaAbas: boolean) => {
    if (!recebida.length) return;
    /* o maior vencimento que o banco já mostrou num aviso de cada marcação (a hora do banco, não a do computador) */
    const vistos = qc.getQueryData<AvisoVencida[]>(chave) ?? [];
    const visto = (id: string) => vistos.reduce((m, a) => (a.marcacaoId === id && a.venceEm > m ? a.venceEm : m), -Infinity);
    const lista = recebida.map((x) => ({ marcacaoId: x.marcacaoId, ate: limitar(x.ate, Date.now(), visto(x.marcacaoId)) }));
    for (const x of lista) mexidas.current.set(x.marcacaoId, Math.max(mexidas.current.get(x.marcacaoId) ?? 0, x.ate));
    setVersao((v) => v + 1);
    void qc.invalidateQueries({ queryKey: chave });
    if (!contarParaAbas || !chaveAbas) return;
    try {
      const agora = Date.now();
      const antes = JSON.parse(localStorage.getItem(chaveAbas) ?? '{}') as Record<string, unknown>;
      const guardar: Record<string, [number, number]> = {};
      for (const [k, v] of Object.entries(antes)) {
        if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && agora - v[1] < GUARDA_ABAS_MS) guardar[k] = [v[0], v[1]];
      }
      for (const x of lista) guardar[x.marcacaoId] = [Math.max(guardar[x.marcacaoId]?.[0] ?? 0, x.ate), agora];
      localStorage.setItem(chaveAbas, JSON.stringify(guardar));
    } catch { /* sem armazenamento: vale nesta aba */ }
  }, [qc, chave, chaveAbas]);
  useEffect(() => {
    const daFila = (e: Event) => {
      const d = (e as CustomEvent<MarcacaoMexida[]>).detail;
      registrar(Array.isArray(d) ? d : [], true);
    };
    const deOutraAba = (e: StorageEvent) => {
      if (!chaveAbas || e.key !== chaveAbas || !e.newValue) return;
      try {
        const o = JSON.parse(e.newValue) as Record<string, unknown>;
        registrar(Object.entries(o).flatMap(([marcacaoId, v]) => (Array.isArray(v) && typeof v[0] === 'number' ? [{ marcacaoId, ate: v[0] }] : [])), false);
      } catch { /* um valor estranho não derruba nada */ }
    };
    window.addEventListener(EVENTO_MARCACAO_MEXIDA, daFila);
    window.addEventListener('storage', deOutraAba);
    return () => { window.removeEventListener(EVENTO_MARCACAO_MEXIDA, daFila); window.removeEventListener('storage', deOutraAba); };
  }, [registrar, chaveAbas]);

  /* um pedido da fila em andamento (o +1, o ×, tirar da fila, atualizar na ficha): os avisos daquelas marcações esperam
     a resposta, mesmo com a rede lenta — senão, fechada a ficha antes da resposta, o aviso do que está sendo resolvido
     voltava ao meio da tela. Conta os pedidos de cada marcação (dois cliques, o +1 e logo o ×): só a resposta do ÚLTIMO
     solta (`fim`) — a do primeiro, se falhar, não traz de volta o aviso do que o segundo ainda está resolvendo. Sem
     resposta, solta sozinho (EM_ANDAMENTO_MAX_MS) */
  const emAndamento = useRef(new Map<string, number>());
  const pedidos = useRef(new Map<string, number>());
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<MarcacaoEmAndamento>).detail;
      if (!d || !Array.isArray(d.ids) || !d.ids.length) return;
      contarPedidos(emAndamento.current, pedidos.current, d.ids, !!d.fim);
      setVersao((v) => v + 1);
      if (d.fim) void qc.invalidateQueries({ queryKey: chave });
    };
    window.addEventListener(EVENTO_MARCACAO_EM_ANDAMENTO, h);
    return () => window.removeEventListener(EVENTO_MARCACAO_EM_ANDAMENTO, h);
  }, [qc, chave]);
  /* o que ficou segurando sem resposta solta no tempo certo (a lista é refeita) */
  useEffect(() => {
    const agora = Date.now();
    const prox = Math.min(...[...emAndamento.current.values()].filter((t) => t > agora));
    if (!Number.isFinite(prox)) return;
    const t = window.setTimeout(() => setVersao((v) => v + 1), prox - agora + 50);
    return () => window.clearTimeout(t);
  }, [versao]);

  const q = useQuery({
    queryKey: chave,
    enabled: !DEMO_MODE && ativo && !!supabase && !!org && !!uid,
    staleTime: 10_000,
    refetchInterval: 30_000,
    /* com o Atenvo em outra aba o aviso também chega (a notificação do navegador) */
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AvisoVencida[]> => {
      const { data, error } = await supabase!.rpc('fila_iris_marcacao_avisos_meus', { p_org: org });
      if (error) throw new Error(error.message);
      return ((data ?? []) as LinhaVencida[]).map((r) => ({
        id: r.id, marcacaoId: r.marcacao_id, contatoId: r.contato_id, conversaId: r.conversa_id ?? undefined,
        nome: nomeBonito(r.nome, null) || 'Cliente', tipo: r.tipo, texto: r.texto ?? undefined, vezes: r.vezes ?? undefined,
        venceEm: Date.parse(r.vence_em), criadoEm: Date.parse(r.criado_em),
        marcadaEm: r.marcada_em ? Date.parse(r.marcada_em) : undefined,
        ult: r.ult?.texto ? { texto: r.ult.texto, por: r.ult.por ?? undefined, porNome: r.ult.por_nome ?? undefined, em: Date.parse(r.ult.em) } : undefined,
      }));
    },
  });

  /* demonstração: a loja da fila da demonstração (a mesma da Fila), o "Ver como" e o relógio (vencer é com o tempo) */
  const daDemo = useFilaDemo(DEMO_MODE && ativo);
  const eu = useEuLocal();
  const donos = useDonosLocais();
  const [agoraDemo, setAgoraDemo] = useState(() => Date.now());
  useEffect(() => {
    if (!DEMO_MODE || !ativo) return;
    const iv = window.setInterval(() => setAgoraDemo(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, [ativo]);
  const demo = useMemo(() => (DEMO_MODE ? vencidasDaDemo(daDemo, eu, donos, agoraDemo) : SEM_AVISOS), [daDemo, eu, donos, agoraDemo]);

  /* deu certo: o aviso sai já, a lista é relida, as outras abas ficam sabendo e a fila (se estiver aberta) relê */
  const resolvido = useCallback((a: AvisoVencida, ate: number) => {
    registrar([{ marcacaoId: a.marcacaoId, ate }], true);
    window.dispatchEvent(new Event(EVENTO_FILA_RECARREGAR));
  }, [registrar]);

  const atualizar = useCallback(async (a: AvisoVencida, texto: string): Promise<ResultadoAviso> => {
    const t = texto.trim();
    if (t.length < 2) throw new Error('Escreva o que foi feito.');
    /* em "Ligar de novo": ligou de novo e não atendeu = o +1 (conta a ligação e recomeça o prazo), como na ficha — mas
       pela MARCAÇÃO do aviso (fila_iris_marcacao_ligou): tirada no meio, a resposta é "já foi tirada" e nada é recriado */
    const ligacao = a.tipo === 'nao_atendeu' && t === LIGUEI_NAO_ATENDEU;
    if (DEMO_MODE) {
      mexerFilaDemo((ls) => ls.map((l) => (l.id !== a.contatoId ? l : ligacao ? comMaisUmaLigacao(l) : comMarcaAtualizada(l, a.marcacaoId, t))));
      return ligacao ? 'ligacao' : 'atualizada';
    }
    if (!supabase || !org) throw new Error('Sem conexão agora. Tente de novo em instantes.');
    const { error } = ligacao
      ? await supabase.rpc('fila_iris_marcacao_ligou', { p_org: org, p_marcacao: a.marcacaoId })
      : await supabase.rpc('fila_iris_marcacao_atualizar', { p_org: org, p_marcacao: a.marcacaoId, p_texto: t });
    if (error) {
      /* tirada por outra pessoa enquanto o aviso estava aberto: não há mais o que atualizar (e a tela diz isso) */
      if (error.message === 'Esta marcação já foi tirada.') { resolvido(a, PARA_SEMPRE); return 'ja_tirada'; }
      if (deOutro(error)) { resolvido(a, a.venceEm); return 'outro_dono'; }
      void qc.invalidateQueries({ queryKey: chave });
      throw erroLegivel(error);
    }
    resolvido(a, a.venceEm);
    return ligacao ? 'ligacao' : 'atualizada';
  }, [org, chave, qc, resolvido]);

  const tirar = useCallback(async (a: AvisoVencida): Promise<ResultadoAviso> => {
    if (DEMO_MODE) {
      mexerFilaDemo((ls) => ls.map((l) => (l.id === a.contatoId ? semMarca(l, a.marcacaoId) : l)));
      return 'tirada';
    }
    if (!supabase || !org) throw new Error('Sem conexão agora. Tente de novo em instantes.');
    const { error } = await supabase.rpc('fila_iris_tirar', { p_org: org, p_marcacao: a.marcacaoId });
    if (error) {
      if (deOutro(error)) { resolvido(a, a.venceEm); return 'outro_dono'; }
      void qc.invalidateQueries({ queryKey: chave });
      throw erroLegivel(error);
    }
    resolvido(a, PARA_SEMPRE);
    return 'tirada';
  }, [org, chave, qc, resolvido]);

  const lista = DEMO_MODE ? demo : (q.data ?? SEM_AVISOS);
  const avisos = useMemo(() => {
    void versao; /* o que foi resolvido (ou está sendo) mudou: a lista é refeita */
    return semAsResolvidas(lista, mexidas.current, emAndamento.current);
  }, [lista, versao]);
  return { avisos, pronto: DEMO_MODE || q.isSuccess, atualizar, tirar };
}
