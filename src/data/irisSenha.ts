import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { temRecurso } from '@/v2/data/config/recursos';

/* ------------------------------------------------------------------
   SENHA DE EDIÇÃO DAS IAs (26/11, "igual" ao sistema que a Reviza usava antes: "só quem souber a senha consegue mudar o
   roteiro dela; a senha protege só a edição — não substitui o login e não impede a IA de funcionar").
   O administrador põe a senha numa versão (Avançado); depois, para mudar aquela versão, a tela pede a senha e a edição
   fica aberta por 30 minutos NESTA aba. O servidor guarda só o hash e trava quem errar 5 vezes em 15 minutos.
   Servidor: migration 115 (recurso 'iris-senha'). Demonstração: o mesmo no navegador (só o hash SHA-256).
   ------------------------------------------------------------------ */

export const SENHA_IA_REAL: boolean = isSupabaseConfigured && !!supabase;
export const ABERTA_MIN = 30;
export type ResultadoSenhaIa = 'ok' | 'errada' | 'travado';

const G_ABERTAS = 'iris-edicao-aberta', G_DEMO = 'previa-iris-senhas', G_TENT = 'previa-iris-tentativas';
type Abertas = Record<string, number>;
const lerAbertas = (): Abertas => { try { const v = JSON.parse(sessionStorage.getItem(G_ABERTAS) ?? '{}') as Abertas; const ag = Date.now(); return Object.fromEntries(Object.entries(v).filter(([, a]) => a > ag)); } catch { return {}; } };
const gravarAbertas = (a: Abertas) => { try { sessionStorage.setItem(G_ABERTAS, JSON.stringify(a)); } catch { /* aba privada */ } };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const lerDemo = (): Record<string, { hash: string; em: string }> => { try { return JSON.parse(localStorage.getItem(G_DEMO) ?? '{}'); } catch { return {}; } };
const gravarDemo = (v: Record<string, { hash: string; em: string }>) => { try { localStorage.setItem(G_DEMO, JSON.stringify(v)); } catch { /* aba privada */ } };
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('iris-previa:' + s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function conferirDemo(id: string, senha: string): Promise<ResultadoSenhaIa> {
  const ag = Date.now();
  let erradas: number[] = []; try { erradas = (JSON.parse(localStorage.getItem(G_TENT) ?? '[]') as number[]).filter((x) => x > ag - 15 * 60_000); } catch { /* vazio */ }
  if (erradas.length >= 5) return 'travado';
  const h = lerDemo()[id]; if (!h) return 'ok';
  const ok = (await sha(senha)) === h.hash;
  if (!ok) { try { localStorage.setItem(G_TENT, JSON.stringify([...erradas, ag])); } catch { /* aba privada */ } }
  return ok ? 'ok' : 'errada';
}
const deErro = (m: string): ResultadoSenhaIa | null => (/muitas_tentativas/.test(m) ? 'travado' : null);
const C = ['iris-senhas'];
const ligado = () => temRecurso('iris-senha');

/** quais versões têm senha de edição */
export function useSenhasIris() {
  return useQuery({
    queryKey: C,
    enabled: ligado(),
    queryFn: async (): Promise<Record<string, { definidaEm: string; definidaPor: string | null }>> => {
      if (!SENHA_IA_REAL) return Object.fromEntries(Object.entries(lerDemo()).map(([id, v]) => [id, { definidaEm: v.em, definidaPor: 'Matheo' }]));
      const { data, error } = await supabase!.rpc('atd_iris_senhas_estado');
      if (error) throw new Error(error.message);
      return Object.fromEntries(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.agente_id), { definidaEm: String(r.definida_em), definidaPor: (r.definida_por as string) ?? null }]));
    },
  });
}

export function useDefinirSenhaIris() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { agenteId: string; senha: string; atual?: string }): Promise<ResultadoSenhaIa> => {
      if (!SENHA_IA_REAL) {
        const tem = lerDemo()[v.agenteId];
        if (tem) { const r = await conferirDemo(v.agenteId, v.atual ?? ''); if (r !== 'ok') return r; }
        gravarDemo({ ...lerDemo(), [v.agenteId]: { hash: await sha(v.senha), em: new Date().toISOString() } });
        return 'ok';
      }
      const { data, error } = await supabase!.rpc('atd_iris_senha_definir', { p_agente: v.agenteId, p_senha: v.senha, p_atual: v.atual ?? null });
      if (error) { const r = deErro(error.message); if (r) return r; throw new Error(/senha_curta/.test(error.message) ? 'A senha precisa de pelo menos 6 letras ou números.' : error.message); }
      return data === true ? 'ok' : 'errada';
    },
    onSuccess: (r, v) => { if (r === 'ok') abrirEdicao(v.agenteId); qc.invalidateQueries({ queryKey: C }); },
  });
}

export function useRemoverSenhaIris() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { agenteId: string; senha: string }): Promise<ResultadoSenhaIa> => {
      if (!SENHA_IA_REAL) { const r = await conferirDemo(v.agenteId, v.senha); if (r === 'ok') { const d = lerDemo(); delete d[v.agenteId]; gravarDemo(d); } return r; }
      const { data, error } = await supabase!.rpc('atd_iris_senha_remover', { p_agente: v.agenteId, p_senha: v.senha });
      if (error) { const r = deErro(error.message); if (r) return r; throw new Error(error.message); }
      return data === true ? 'ok' : 'errada';
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: C }),
  });
}

function abrirEdicao(id: string) { gravarAbertas({ ...lerAbertas(), [id]: Date.now() + ABERTA_MIN * 60_000 }); avisar(); }
export function fecharEdicao(id: string) { const a = lerAbertas(); delete a[id]; gravarAbertas(a); avisar(); }

/** confere a senha e, se certa, abre a edição desta versão por 30 minutos nesta aba */
export async function destravarEdicao(agenteId: string, senha: string): Promise<ResultadoSenhaIa> {
  let r: ResultadoSenhaIa;
  if (!SENHA_IA_REAL) r = await conferirDemo(agenteId, senha);
  else {
    const { data, error } = await supabase!.rpc('atd_iris_senha_conferir', { p_agente: agenteId, p_senha: senha });
    if (error) { const x = deErro(error.message); if (x) return x; throw new Error(error.message); }
    r = data === true ? 'ok' : 'errada';
  }
  if (r === 'ok') abrirEdicao(agenteId);
  return r;
}

/** a edição desta versão está aberta agora (nesta aba)? */
export function useEdicaoAberta(agenteId: string | null) {
  const [a, setA] = useState<Abertas>(lerAbertas);
  useEffect(() => { const f = () => setA(lerAbertas()); ouvintes.add(f); const t = setInterval(f, 30_000); return () => { ouvintes.delete(f); clearInterval(t); }; }, []);
  return !!agenteId && (a[agenteId] ?? 0) > Date.now();
}
