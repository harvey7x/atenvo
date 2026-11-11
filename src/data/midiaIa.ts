/* "Melhorar com IA" (Gemini imagem + conferência) — camada de dados.
   Regra: UMA melhoria aprovada por cliente. A edge function `midia-melhorar-ia` responde na hora
   (status 'processando') e trabalha em 2º plano; a tela acompanha lendo `midia_melhoria_ia`.
   No modo demo tudo é simulado em memória (sem backend, sem custo). */
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { urlAssinadaMidiaWa } from '@/data/whatsapp';

const REAL = isSupabaseConfigured && !!supabase;

export type StatusIa = 'processando' | 'aprovada' | 'reprovada' | 'falha';
export interface DivergenciasIa {
  numeros?: { soNoOriginal: string[]; soNaMelhorada: string[] };
  palavrasNovas?: string[];
  palavrasSumidas?: string[];
}
export interface RegistroIa {
  id: string;
  contato_id: string;
  mensagem_id: string;
  status: StatusIa;
  anexo_path_ia: string | null;
  divergencias: DivergenciasIa | null;
  erro: string | null;
  criado_em: string;
  /** só no demo: URL local da imagem simulada. */
  urlDemo?: string;
}
/** Situação da IA para ESTA imagem dentro do cliente. */
export interface SituacaoIa {
  /** vaga do cliente ocupada (processando/aprovada), em qualquer imagem. */
  ocupada: RegistroIa | null;
  /** última tentativa desta imagem (pode ser reprovada/falha — não ocupam a vaga). */
  desta: RegistroIa | null;
}

// ---------- demo (memória da aba) ----------
const demoRegs = new Map<string, RegistroIa[]>(); // por contato
function demoSituacao(contatoId: string, mensagemId: string): SituacaoIa {
  const regs = demoRegs.get(contatoId) ?? [];
  return {
    ocupada: regs.find((r) => r.status === 'processando' || r.status === 'aprovada') ?? null,
    desta: regs.filter((r) => r.mensagem_id === mensagemId).slice(-1)[0] ?? null,
  };
}

export async function situacaoIa(contatoId: string, mensagemId: string): Promise<SituacaoIa> {
  if (!REAL) return demoSituacao(contatoId, mensagemId);
  const { data, error } = await supabase!.from('midia_melhoria_ia')
    .select('id, contato_id, mensagem_id, status, anexo_path_ia, divergencias, erro, criado_em')
    .eq('contato_id', contatoId).order('criado_em', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const regs = (data ?? []) as RegistroIa[];
  return {
    ocupada: regs.find((r) => r.status === 'processando' || r.status === 'aprovada') ?? null,
    desta: regs.find((r) => r.mensagem_id === mensagemId) ?? null,
  };
}

/** Pede a melhoria. Lança com a mensagem da função (ex.: vaga já usada). `gerarDemo` produz a imagem simulada. */
export async function pedirMelhoriaIa(contatoId: string, mensagemId: string, gerarDemo: () => Promise<string>): Promise<RegistroIa> {
  if (!REAL) {
    const sit = demoSituacao(contatoId, mensagemId);
    if (sit.ocupada) {
      if (sit.ocupada.mensagem_id === mensagemId) return sit.ocupada;
      throw new Error('A melhoria com IA deste cliente já foi usada em outra imagem.');
    }
    const reg: RegistroIa = { id: `demo-${Date.now()}`, contato_id: contatoId, mensagem_id: mensagemId, status: 'processando', anexo_path_ia: null, divergencias: null, erro: null, criado_em: new Date().toISOString() };
    demoRegs.set(contatoId, [...(demoRegs.get(contatoId) ?? []), reg]);
    // simula o tempo do Gemini (bem mais curto) e aprova
    void (async () => {
      const [url] = await Promise.all([gerarDemo().catch(() => ''), new Promise((r) => setTimeout(r, 6000))]);
      Object.assign(reg, url
        ? { status: 'aprovada', urlDemo: url, anexo_path_ia: 'demo', divergencias: { numeros: { soNoOriginal: [], soNaMelhorada: [] }, palavrasNovas: [], palavrasSumidas: [] } }
        : { status: 'falha', erro: 'Simulação falhou.' });
    })();
    return reg;
  }
  const { data, error } = await supabase!.functions.invoke('midia-melhorar-ia', { body: { mensagem_id: mensagemId } });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const b = await ctx.clone().json() as { error?: string }; if (b?.error) msg = b.error; } catch { /* mantém msg */ }
    }
    throw new Error(msg);
  }
  return (data as { registro: RegistroIa }).registro;
}

export async function urlImagemIa(reg: RegistroIa): Promise<string> {
  if (reg.urlDemo) return reg.urlDemo;
  if (!reg.anexo_path_ia) throw new Error('Imagem melhorada indisponível.');
  return urlAssinadaMidiaWa(reg.anexo_path_ia);
}
