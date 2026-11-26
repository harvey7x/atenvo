import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   COFRE DE CONVERSAS (26/11, "igual" ao sistema que a Reviza usava antes: "uma senha única esconde o conteúdo das
   conversas trancadas; só quem tem a senha abre"). Como lá, protege a VISUALIZAÇÃO no sistema: as mensagens continuam
   chegando e a IA continua respondendo.
   O administrador liga o cofre criando a senha (Configurações › Cofre de conversas); qualquer pessoa que vê a conversa
   tranca pelo ⋯ da conversa; para ler, a pessoa digita a senha e a conversa fica aberta por 15 minutos NESTA aba;
   tirar do cofre também pede a senha. O servidor guarda só o hash da senha e trava quem errar 5 vezes em 15 minutos.
   Servidor: migration 113 (recurso 'cofre'). DEMO É O CONTRATO: sem backend, os mesmos hooks no navegador (a senha da
   demonstração fica só como hash SHA-256 no navegador).
   ------------------------------------------------------------------ */

export const COFRE_REAL: boolean = isSupabaseConfigured && !!supabase;
export const SENHA_MIN = 6, SENHA_MAX = 72, ABERTA_MIN = 15;

export interface EstadoCofre { ligado: boolean; definidoEm: string | null; definidoPor: string | null; trancadas: number }
export type ResultadoSenha = 'ok' | 'errada' | 'travado';

export function validarSenhaCofre(s: string, confirma: string): string | null {
  if (s.length < SENHA_MIN) return `A senha precisa de pelo menos ${SENHA_MIN} letras ou números.`;
  if (s.length > SENHA_MAX) return `A senha vai até ${SENHA_MAX} letras.`;
  if (s !== confirma) return 'As duas senhas não são iguais.';
  return null;
}

/* ---------------- aberta por 15 minutos nesta aba ---------------- */
const G_ABERTAS = 'cofre-abertas';
type Abertas = Record<string, number>;
const lerAbertas = (): Abertas => { try { const v = JSON.parse(sessionStorage.getItem(G_ABERTAS) ?? '{}') as Abertas; const agora = Date.now(); return Object.fromEntries(Object.entries(v).filter(([, ate]) => ate > agora)); } catch { return {}; } };
const gravarAbertas = (a: Abertas) => { try { sessionStorage.setItem(G_ABERTAS, JSON.stringify(a)); } catch { /* aba privada */ } };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/* ---------------- demonstração ---------------- */
const G_HASH = 'previa-cofre-hash', G_TRANC = 'previa-cofre-trancadas', G_TENT = 'previa-cofre-tentativas';
const ler = <T,>(k: string, p: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? p; } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cofre-previa:' + s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function conferirDemo(senha: string): Promise<ResultadoSenha> {
  const agora = Date.now();
  const erradas = ler<number[]>(G_TENT, []).filter((t) => t > agora - 15 * 60_000);
  if (erradas.length >= 5) return 'travado';
  const h = ler<{ hash: string } | null>(G_HASH, null);
  if (!h) return 'errada';
  const ok = (await sha(senha)) === h.hash;
  if (!ok) gravar(G_TENT, [...erradas, agora]);
  return ok ? 'ok' : 'errada';
}

const C_EST = 'atd-cofre-estado', C_TR = 'atd-cofre-trancadas';
const erroSenha = (m: string): ResultadoSenha | null => (/muitas_tentativas/.test(m) ? 'travado' : null);

export function useEstadoCofre(ligado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_EST, currentOrg.id],
    enabled: ligado && !!currentOrg.id,
    queryFn: async (): Promise<EstadoCofre> => {
      if (!COFRE_REAL) { const h = ler<{ hash: string; em: string } | null>(G_HASH, null); return { ligado: !!h, definidoEm: h?.em ?? null, definidoPor: h ? 'Matheo' : null, trancadas: ler<string[]>(G_TRANC, []).length }; }
      const { data, error } = await supabase!.rpc('atd_cofre_estado');
      if (error) throw new Error(error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      return { ligado: j.ligado === true, definidoEm: (j.definido_em as string) ?? null, definidoPor: (j.definido_por as string) ?? null, trancadas: Number(j.trancadas) || 0 };
    },
  });
}

/** quais conversas estão trancadas (todos da empresa leem) */
export function useConversasTrancadas(ligado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_TR, currentOrg.id],
    enabled: ligado && !!currentOrg.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!COFRE_REAL) return ler<string[]>(G_TRANC, []);
      const { data, error } = await supabase!.from('atd_conversas_trancadas').select('conversa_id').eq('organizacao_id', currentOrg.id).limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => String(r.conversa_id));
    },
  });
}

/** as conversas trancadas com o nome do cliente (a tela de Configurações) */
export function useListaTrancadas(ligado = true) {
  const { currentOrg } = useOrg();
  const ids = useConversasTrancadas(ligado).data ?? [];
  return useQuery({
    queryKey: [C_TR, currentOrg.id, 'nomes', ids.join(',')],
    enabled: ligado && ids.length > 0,
    queryFn: async (): Promise<{ conversaId: string; contato: string }[]> => {
      if (!COFRE_REAL) return ids.map((id) => ({ conversaId: id, contato: id === 'wa-pedro' ? 'Pedro Henrique Dias' : id === 'wa-maria' ? 'Maria Aparecida Souza' : 'Cliente da demonstração' }));
      const { data, error } = await supabase!.from('conversas').select('id, contato:contatos(nome, telefone)').in('id', ids.slice(0, 200));
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => { const c = (Array.isArray(r.contato) ? r.contato[0] : r.contato) as { nome?: string; telefone?: string } | null; return { conversaId: String(r.id), contato: c?.nome?.trim() || c?.telefone || 'Cliente sem nome' }; });
    },
  });
}

export function useDefinirSenhaCofre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { senha: string; atual?: string }): Promise<ResultadoSenha> => {
      if (!COFRE_REAL) {
        const tem = ler<{ hash: string } | null>(G_HASH, null);
        if (tem) { const r = await conferirDemo(v.atual ?? ''); if (r !== 'ok') return r; }
        gravar(G_HASH, { hash: await sha(v.senha), em: new Date().toISOString() });
        return 'ok';
      }
      const { data, error } = await supabase!.rpc('atd_cofre_definir', { p_senha: v.senha, p_senha_atual: v.atual ?? null });
      if (error) { const r = erroSenha(error.message); if (r) return r; throw new Error(/senha_curta/.test(error.message) ? `A senha precisa de pelo menos ${SENHA_MIN} letras ou números.` : /sem_permissao/.test(error.message) ? 'Só o administrador muda a senha do cofre.' : error.message); }
      return data === true ? 'ok' : 'errada';
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_EST] }); },
  });
}

export function useDesligarCofre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (senha: string): Promise<ResultadoSenha> => {
      if (!COFRE_REAL) { const r = await conferirDemo(senha); if (r === 'ok') { gravar(G_HASH, null); gravar(G_TRANC, []); } return r; }
      const { data, error } = await supabase!.rpc('atd_cofre_desligar', { p_senha: senha });
      if (error) { const r = erroSenha(error.message); if (r) return r; throw new Error(error.message); }
      return data === true ? 'ok' : 'errada';
    },
    onSuccess: (r) => { if (r === 'ok') { gravarAbertas({}); avisar(); } qc.invalidateQueries({ queryKey: [C_EST] }); qc.invalidateQueries({ queryKey: [C_TR] }); },
  });
}

/** o cofre visto de uma conversa: trancada? aberta agora nesta aba? E as ações (trancar, abrir, fechar, tirar do cofre). */
export function useCofreDaConversa(ligado: boolean) {
  const qc = useQueryClient();
  const estado = useEstadoCofre(ligado);
  const tq = useConversasTrancadas(ligado && estado.data?.ligado === true);
  const [abertas, setAbertas] = useState<Abertas>(lerAbertas);
  useEffect(() => {
    const f = () => setAbertas(lerAbertas());
    ouvintes.add(f);
    const t = setInterval(f, 30_000); // a janela de 15 minutos fecha sozinha
    return () => { ouvintes.delete(f); clearInterval(t); };
  }, []);
  const trancadas = new Set(ligado && estado.data?.ligado ? (tq.data ?? []) : []);
  const recarregar = () => { qc.invalidateQueries({ queryKey: [C_TR] }); qc.invalidateQueries({ queryKey: [C_EST] }); };

  const trancada = (id: string) => trancadas.has(id);
  const aberta = (id: string) => (abertas[id] ?? 0) > Date.now();
  const fechar = (id: string) => { const a = lerAbertas(); delete a[id]; gravarAbertas(a); avisar(); };

  const conferir = async (senha: string): Promise<ResultadoSenha> => {
    if (!COFRE_REAL) return conferirDemo(senha);
    const { data, error } = await supabase!.rpc('atd_cofre_conferir', { p_senha: senha });
    if (error) { const r = erroSenha(error.message); if (r) return r; throw new Error(error.message); }
    return data === true ? 'ok' : 'errada';
  };
  const abrir = async (id: string, senha: string): Promise<ResultadoSenha> => {
    const r = await conferir(senha);
    if (r === 'ok') { gravarAbertas({ ...lerAbertas(), [id]: Date.now() + ABERTA_MIN * 60_000 }); avisar(); }
    return r;
  };
  const trancar = async (id: string) => {
    if (!COFRE_REAL) { gravar(G_TRANC, [...new Set([...ler<string[]>(G_TRANC, []), id])]); fechar(id); recarregar(); return; }
    const { error } = await supabase!.rpc('atd_cofre_trancar', { p_conversa: id, p_trancar: true, p_senha: null });
    if (error) throw new Error(/cofre_desligado/.test(error.message) ? 'O cofre está desligado. O administrador liga em Configurações › Cofre de conversas.' : /sem_permissao/.test(error.message) ? 'Você não pode trancar esta conversa.' : error.message);
    fechar(id); recarregar();
  };
  const tirar = async (id: string, senha: string): Promise<ResultadoSenha> => {
    if (!COFRE_REAL) { const r = await conferirDemo(senha); if (r === 'ok') { gravar(G_TRANC, ler<string[]>(G_TRANC, []).filter((x) => x !== id)); fechar(id); recarregar(); } return r; }
    const { data, error } = await supabase!.rpc('atd_cofre_trancar', { p_conversa: id, p_trancar: false, p_senha: senha });
    if (error) { const r = erroSenha(error.message); if (r) return r; throw new Error(error.message); }
    if (data === 'senha_errada') return 'errada';
    fechar(id); recarregar();
    return 'ok';
  };
  return { ligado: ligado && estado.data?.ligado === true, trancada, aberta, abrir, fechar, trancar, tirar, ateQuando: (id: string) => abertas[id] ?? null };
}
