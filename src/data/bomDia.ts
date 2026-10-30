import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { hojeLocal, montarFala, resumoDaRpc, textoCorrido, type Momento, type ResumoBomDia } from '@/v2/lib/bomDia';

/* ------------------------------------------------------------------
   Bom dia do Atenvo — dados. Os números vêm da RPC bom_dia_resumo
   (fonte única: a tela mostra e a voz fala o mesmo resultado; ela
   devolve o modo VENDEDOR ou GESTOR conforme bom_dia_gestores); a voz
   vem da edge function bom-dia-voz (Gemini TTS, WAV) e, sem ela, a tela
   cai na voz do navegador. NUNCA contar pela lista do inbox (5+ MB).
   O preparo fica em cache por pessoa, momento e dia: o shell pré-carrega
   2 min antes (7h58 e, para o gestor, 16h58) e no horário a tela abre
   com número e voz prontos.
   ------------------------------------------------------------------ */

export const BOM_DIA_REAL = isSupabaseConfigured && !!supabase;

/** Voz da IA no Gemini: Despina (suave), escolhida pelo dono 30/10 entre Despina, Erinome, Sulafat e Kore. */
export const VOZ_BOM_DIA = 'Despina';

/** demo: uma atendente e o administrador (Murilo). Gestor: dados da SINTESE-GESTOR + o empate de hoje
    (Juliana e Isadora, 2 cada — por isso 4 fechados hoje, senão a fala se contradiz) e os não
    elegíveis com 'EMPRESTIMO' e 'EMPRÉSTIMO' (agrupam em "Empréstimo"). */
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
      leadsOntemMesmaHora: null,
      iaAtendeuHoje: null,
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

/** 'gestor' só para quem está em bom_dia_gestores (o Murilo). Erro (RPC ainda não aplicada) = vendedor. */
export async function buscarModoBomDia(org: string): Promise<'gestor' | 'vendedor'> {
  if (!BOM_DIA_REAL) return lerPreviaGestor() ? 'gestor' : 'vendedor';
  const { data, error } = await supabase!.rpc('bom_dia_modo', { p_org: org });
  if (error) return 'vendedor';
  return data === 'gestor' ? 'gestor' : 'vendedor';
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

/** O áudio da fala (WAV) — null quando não há voz da IA (a tela usa a do navegador). */
async function pedirVoz(texto: string, voz: string, arquivoDemo: string | null): Promise<ArrayBuffer | null> {
  if (!BOM_DIA_REAL) {
    // demo: áudio pré-gerado pela mesma função (public/demo-midia); sem ele, a legenda segue sozinha
    if (!arquivoDemo) return null;
    const r = await fetch(arquivoDemo).catch(() => null);
    return r?.ok && (r.headers.get('content-type') ?? '').startsWith('audio') ? r.arrayBuffer() : null;
  }
  const { data, error } = await supabase!.functions.invoke('bom-dia-voz', { body: { texto, voz } });
  if (error || !data?.url) return null;
  const r = await fetch(data.url as string);
  return r.ok ? r.arrayBuffer() : null;
}

export interface PreparoBomDia {
  resumo: Promise<ResumoBomDia>;
  /** null = sem voz da IA (crédito, rede, limite) → voz do navegador */
  voz: Promise<ArrayBuffer | null>;
  /** a hora com que o texto da voz foi montado (a saudação do gestor): a legenda usa a MESMA */
  agora: Date;
}

const VALIDADE_MS = 15 * 60_000;
const cache = new Map<string, PreparoBomDia & { criadoEm: number }>();

export function prepararBomDia(p: {
  org: string; uid: string; nome: string; momento: Momento;
  /** só a demo usa (o seed); no sistema real a RPC decide o modo */
  gestor?: boolean;
  voz?: string; arquivoDemo?: string | null;
  /** prévia: a hora do texto do áudio pré-gerado (8h / 17h) */
  agora?: Date;
}): PreparoBomDia {
  const voz = p.voz ?? VOZ_BOM_DIA;
  // no sistema real quem decide o modo é a RPC: o "gestor" do shell (que chega depois) não refaz o preparo
  const gestorSeed = !BOM_DIA_REAL && !!p.gestor;
  const k = [p.uid, p.org, p.nome, p.momento, gestorSeed ? 'g' : '', voz, p.arquivoDemo ?? '', p.agora?.getHours() ?? '', hojeLocal()].join('|');
  const c = cache.get(k);
  if (c && Date.now() - c.criadoEm < VALIDADE_MS) return c;
  const agora = p.agora ?? new Date();
  const resumo = buscarResumo(p.org, gestorSeed);
  const audio = resumo
    .then((r) => pedirVoz(textoCorrido(montarFala(p.nome, r, { momento: p.momento, agora })), voz, p.arquivoDemo ?? null))
    .catch(() => null);
  const novo = { resumo, voz: audio, agora, criadoEm: Date.now() };
  cache.set(k, novo);
  // número que falhou não fica em cache: a próxima abertura tenta de novo
  resumo.catch(() => { if (cache.get(k) === novo) cache.delete(k); });
  return novo;
}
