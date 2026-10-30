import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  blocosDaVoz, falasDaTela, hojeLocal, resumoDaRpc, textoCorrido,
  type ModoBomDia, type Momento, type ResumoBomDia, type TipoTela, type Trecho,
} from '@/v2/lib/bomDia';

/* ------------------------------------------------------------------
   Bom dia do Atenvo — dados. Os números vêm da RPC bom_dia_resumo
   (fonte única: a tela mostra e a voz fala o mesmo resultado; ela
   devolve o modo VENDEDOR ou GESTOR conforme bom_dia_gestores); a voz
   vem da edge function bom-dia-voz (Gemini TTS, WAV) e, sem ela, a tela
   cai na voz do navegador. NUNCA contar pela lista do inbox (5+ MB).
   O preparo fica em cache por pessoa, tela e dia: o shell pré-carrega
   2 min antes (7h58 e, para o gestor, 16h58) e no horário a tela abre
   com número e voz prontos.
   ------------------------------------------------------------------ */

export const BOM_DIA_REAL = isSupabaseConfigured && !!supabase;

/** Voz da IA no Gemini: Despina (suave), escolhida pelo dono 30/10 entre Despina, Erinome, Sulafat e Kore. */
export const VOZ_BOM_DIA = 'Despina';

/** demo: uma atendente e o administrador (Murilo). Gestor: dados da SINTESE-GESTOR + o empate de hoje
    (Juliana e Isadora, 2 cada — por isso 4 fechados hoje, senão a fala se contradiz), os não
    elegíveis com 'EMPRESTIMO' e 'EMPRÉSTIMO' (agrupam em "Empréstimo") e a comparação com ontem + o
    trabalho da IA (SINTESE-GESTOR-V2 §8: 16 leads ontem no mesmo horário para 20 hoje; a IA atendeu 12). */
export function seedResumoBomDia(gestor: boolean): ResumoBomDia {
  return gestor
    ? {
      modo: 'gestor',
      chegaram: 20,
      porCampanha: [
        { canal: 'OFICIAL', n: 6 },
        { canal: 'ANTONIO CAMPANHA', n: 5 },
        { canal: 'JUROS ABUSIVO (ANDRIUS)', n: 5 },
        { canal: 'MURILLO CHIP', n: 4 },
      ],
      naoElegiveis: 4,
      nePorCampanha: [
        { canal: 'EMPRESTIMO', n: 2 },
        { canal: 'ANTONIO CAMPANHA', n: 1 },
        { canal: 'EMPRÉSTIMO', n: 1 },
      ],
      fechadosHoje: 4,
      melhorOntem: { n: 5, nomes: ['Juliana'] },
      melhorHoje: { n: 2, nomes: ['Juliana', 'Isadora'] },
      criticos: { desconectados: ['EMPRESTIMO'], iaSemCredito: false, semDono: 3 },
      leadsOntemMesmaHora: 16,
      iaAtendeuHoje: 12,
    }
    : { modo: 'vendedor', novos: 12, semResposta: 8, passados: 3, presenciais: 2 };
}

/* ---------- quem é gestor: a RPC bom_dia_modo; na prévia local, a pessoa escolhida na barra ---------- */

const CHAVE_PREVIA = 'atenvo-bomdia-previa';
const EVENTO_PREVIA = 'atenvo-bomdia-previa';

export function lerPreviaGestor(): boolean {
  try { return localStorage.getItem(CHAVE_PREVIA) === 'gestor'; } catch { return false; }
}

/** a barra da prévia trocou de pessoa: o shell passa a agendar como ela (o das 17h é só do gestor) */
export function salvarPreviaGestor(gestor: boolean): void {
  try { localStorage.setItem(CHAVE_PREVIA, gestor ? 'gestor' : 'vendedor'); } catch { /* sem persistir */ }
  window.dispatchEvent(new CustomEvent(EVENTO_PREVIA));
}

export function assinarPreviaGestor(cb: (gestor: boolean) => void): () => void {
  const f = () => cb(lerPreviaGestor());
  window.addEventListener(EVENTO_PREVIA, f);
  return () => window.removeEventListener(EVENTO_PREVIA, f);
}
const assinarPrevia = (cb: () => void) => assinarPreviaGestor(() => cb());
const previaNoServidor = () => false;

/** A RPC não respondeu (rede presa): segue como vendedor — se ela responder depois, o modo se corrige. */
const TETO_MODO_MS = 6000;

/** O perfil do bom dia de quem está logado — UMA consulta para o sistema inteiro: o shell agenda as 8h/17h e
    monta o menu; a Central de Avisos (/radar) e o sino escondem o Radar do gestor. null = ainda não se sabe
    (no máximo 6 s). Erro na RPC = vendedor (nada some de quem não é gestor). Na demo: a pessoa da prévia. */
export function useModoBomDia(): ModoBomDia | null {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const org = currentOrg?.id ?? '';
  const uid = user?.id ?? '';
  const pronto = !!org && !!uid;
  const q = useQuery({
    // o uid na chave: o modo é de QUEM está logado (outra pessoa entrando na mesma aba não herda o do Murilo)
    queryKey: ['bom-dia-modo', org, uid],
    enabled: BOM_DIA_REAL && pronto,
    staleTime: Infinity,
    queryFn: async (): Promise<ModoBomDia> => {
      const { data, error } = await supabase!.rpc('bom_dia_modo', { p_org: org });
      if (error) throw new Error(error.message);
      return data === 'gestor' ? 'gestor' : 'vendedor';
    },
  });
  const previa = useSyncExternalStore(assinarPrevia, lerPreviaGestor, previaNoServidor);
  const quem = `${org}|${uid}`;
  const [tetoDe, setTetoDe] = useState<string | null>(null);
  const esperando = BOM_DIA_REAL && pronto && q.data == null && !q.isError;
  useEffect(() => {
    if (!esperando) return;
    const t = window.setTimeout(() => setTetoDe(quem), TETO_MODO_MS);
    return () => window.clearTimeout(t);
  }, [esperando, quem]);
  if (!pronto) return null;
  if (!BOM_DIA_REAL) return previa ? 'gestor' : 'vendedor';
  if (q.data) return q.data;
  return q.isError || tetoDe === quem ? 'vendedor' : null;
}

async function buscarResumo(org: string, gestor: boolean): Promise<ResumoBomDia> {
  if (!BOM_DIA_REAL) {
    await new Promise((r) => setTimeout(r, 700));
    return seedResumoBomDia(gestor);
  }
  const { data, error } = await supabase!.rpc('bom_dia_resumo', { p_org: org });
  if (error) throw new Error(error.message);
  return resumoDaRpc(data);
}

/** O áudio de UM pedido à bom-dia-voz (WAV, até 1.200 caracteres) — null quando não há voz da IA. */
async function pedirVoz(texto: string, voz: string): Promise<ArrayBuffer | null> {
  const { data, error } = await supabase!.functions.invoke('bom-dia-voz', { body: { texto, voz } });
  if (error || !data?.url) return null;
  const r = await fetch(data.url as string);
  return r.ok ? r.arrayBuffer() : null;
}

/** A voz de uma fala inteira: um pedido por pedaço (blocosDaVoz — a fala que passa de 1.200 caracteres sai em
    pedaços sequenciais, o texto igual), todos em paralelo, na ordem da fala. Faltou um pedaço → null: a fala
    inteira vai pela legenda (nunca meia fala com voz). Demo: o áudio pré-gerado da fala (public/demo-midia, pela
    mesma função); sem ele, a legenda segue sozinha. */
async function pedirVozDaFala(trechos: Trecho[], voz: string, arquivoDemo: string | null): Promise<ArrayBuffer[] | null> {
  if (!trechos.length) return null;
  if (!BOM_DIA_REAL) {
    if (!arquivoDemo) return null;
    const r = await fetch(arquivoDemo).catch(() => null);
    return r?.ok && (r.headers.get('content-type') ?? '').startsWith('audio') ? [await r.arrayBuffer()] : null;
  }
  const pedacos = await Promise.all(blocosDaVoz(trechos).map((b) => pedirVoz(textoCorrido(b), voz).catch(() => null)));
  return pedacos.every((p): p is ArrayBuffer => !!p) ? pedacos : null;
}

export interface PreparoBomDia {
  resumo: Promise<ResumoBomDia>;
  /** a voz de cada fala da tela, na ordem (o resumo = 1 fala; a apresentação = 2): os pedaços de WAV da fala
      (tocam juntos, como um áudio só) ou null = sem voz da IA (crédito, rede, limite) → voz do navegador /
      legenda. A fala que não existe (a 2ª de quem não é gestor) também resolve null. */
  vozes: Array<Promise<ArrayBuffer[] | null>>;
  /** a hora com que o texto da voz foi montado (a saudação do gestor): a legenda usa a MESMA */
  agora: Date;
}

const VALIDADE_MS = 15 * 60_000;
const cache = new Map<string, PreparoBomDia & { criadoEm: number }>();

export function prepararBomDia(p: {
  org: string; uid: string; nome: string; momento: Momento;
  /** o que a tela toca: o resumo do momento (padrão) ou a apresentação (2 falas) */
  tipo?: TipoTela;
  /** só a demo usa (o seed); no sistema real a RPC decide o modo */
  gestor?: boolean;
  voz?: string;
  /** demo: o áudio pré-gerado de cada fala, na ordem */
  arquivosDemo?: string[] | null;
  /** prévia: a hora do texto do áudio pré-gerado (8h / 17h) */
  agora?: Date;
}): PreparoBomDia {
  const voz = p.voz ?? VOZ_BOM_DIA;
  const tipo: TipoTela = p.tipo ?? p.momento;
  // no sistema real quem decide o modo é a RPC: o "gestor" do shell (que chega depois) não refaz o preparo
  const gestorSeed = !BOM_DIA_REAL && !!p.gestor;
  const demo = p.arquivosDemo ?? [];
  const k = [p.uid, p.org, p.nome, p.momento, tipo, gestorSeed ? 'g' : '', voz, demo.join(','), p.agora?.getHours() ?? '', hojeLocal()].join('|');
  const c = cache.get(k);
  if (c && Date.now() - c.criadoEm < VALIDADE_MS) return c;
  const agora = p.agora ?? new Date();
  const resumo = buscarResumo(p.org, gestorSeed);
  const falas = resumo.then((r) => falasDaTela(p.nome, r, tipo, agora));
  // as falas da apresentação pedem a voz JUNTAS: a 2ª fica pronta enquanto a 1ª toca
  const nFalas = tipo === 'apresentacao' ? 2 : 1;
  const vozes = Array.from({ length: nFalas }, (_, i) => falas
    .then((f) => pedirVozDaFala(f[i] ?? [], voz, demo[i] ?? null))
    .catch(() => null));
  const novo = { resumo, vozes, agora, criadoEm: Date.now() };
  cache.set(k, novo);
  // número que falhou não fica em cache: a próxima abertura tenta de novo
  resumo.catch(() => { if (cache.get(k) === novo) cache.delete(k); });
  return novo;
}
