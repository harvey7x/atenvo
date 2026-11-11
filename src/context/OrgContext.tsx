import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Organization, OrgRole } from '@/types/org';
import { supabase, isSupabaseConfigured, isRevizaMode } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DEMO_ORGS } from '@/data/demo';
import { Onboarding } from '@/pages/Onboarding';
// Redesign Platina: no mundo /v2 o onboarding é o v2 (mesma prop onProvision).
import { lazy, Suspense } from 'react';
const OnboardingV2 = lazy(() => import('@/v2/pages/Onboarding'));
const emRotaV2 = () => { try { return window.location.pathname.startsWith('/v2'); } catch { return false; } };
import { slugify, randomSuffix } from '@/lib/slug';
import { resolverContextoInicial } from '@/lib/resolverContexto';

const CUR_KEY = 'atenvo-current-org';
/* Fase 2.0: org ativa POR USUÁRIO (padrão chaveTema) — a chave global antiga
   vira fallback de leitura (migração suave: quem já tinha seleção não perde). */
const chaveOrg = (escopo?: string): string => (escopo ? `${CUR_KEY}:${escopo}` : CUR_KEY);
const MOCK_NOORG_KEY = 'atenvo-mock-no-org'; // somente para exercitar o onboarding em modo mock

/** Papel do banco (user_role) -> papel do frontend (OrgRole). supervisor === gestor na UI. */
function mapRole(papel: string): OrgRole {
  if (papel === 'admin') return 'admin';
  if (papel === 'atendente') return 'atendente';
  return 'gestor'; // supervisor
}

const useHashRouting = typeof window !== 'undefined' && window.location.protocol === 'file:';
function gotoWhatsApp() {
  try {
    // Redesign Platina: quem provisiona a partir do /v2 permanece no mundo v2.
    const destino = emRotaV2() ? '/v2/dashboard' : '/whatsapp';
    if (useHashRouting) window.location.hash = `#${destino}`;
    else window.history.replaceState({}, '', destino);
  } catch { /* ignore */ }
}

interface OrgState {
  orgs: Organization[];
  currentOrg: Organization;
  setCurrentOrg: (id: string) => void;
  loading: boolean;
}

const OrgContext = createContext<OrgState | null>(null);

/** Instância Reviza: UMA empresa, sem tabelas de organização — org estática e o
 *  papel vem de public.profiles (admin/gestor -> gestor na UI; demais -> atendente).
 *  Usuário novo nasce INATIVO no banco: mostra "aguardando liberação" até o admin ativar. */
/** troca de senha OBRIGATÓRIA no primeiro acesso (deve_trocar_senha no profile). */
function TrocarSenhaReviza({ aoConcluir }: { aoConcluir: () => void }) {
  const { updatePassword } = useAuth();
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function salvar() {
    if (busy) return;
    if (s1.length < 8) { setErro('A nova senha precisa de pelo menos 8 caracteres.'); return; }
    if (s1 !== s2) { setErro('As senhas não conferem.'); return; }
    setBusy(true); setErro(null);
    try {
      const { error } = await updatePassword(s1);
      // "senha igual à anterior": trata como já-trocada e segue para finalizar (idempotente,
      // evita lock-out se a rpc falhou numa tentativa anterior mas a senha já mudou)
      const jaTrocada = error && /different from the old|should be different|same as|422/i.test(error);
      if (error && !jaTrocada) { setErro(error); setBusy(false); return; }
      const { error: e2 } = await supabase!.rpc('senha_redefinida');
      if (e2) { setErro('Senha alterada, mas não conseguimos finalizar. Toque em "Salvar e entrar" de novo.'); setBusy(false); return; }
      setBusy(false);
      aoConcluir();
    } catch {
      setErro('Não foi possível concluir. Verifique a conexão e tente novamente.');
      setBusy(false);
    }
  }
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 'min(360px, 100%)', display: 'grid', gap: 10, textAlign: 'center' }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Defina sua nova senha</p>
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted, #889)' }}>Este é o seu primeiro acesso — escolha uma senha só sua (mínimo 8 caracteres).</p>
        <input type="password" placeholder="Nova senha" value={s1} onChange={(e) => { setS1(e.target.value); setErro(null); }} autoFocus
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #4443', background: 'transparent', color: 'inherit' }} />
        <input type="password" placeholder="Repita a nova senha" value={s2} onChange={(e) => { setS2(e.target.value); setErro(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); }}
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #4443', background: 'transparent', color: 'inherit' }} />
        {erro && <p style={{ margin: 0, fontSize: 12.5, color: '#e5484d' }} role="alert">{erro}</p>}
        <button onClick={() => void salvar()} disabled={busy} style={{ padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {busy ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </div>
    </div>
  );
}

function OrgProviderReviza({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { data: perfil, isLoading, isError, refetch } = useQuery({
    queryKey: ['reviza-perfil', user?.id],
    enabled: !!user && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.from('profiles').select('papel, ativo, nome, deve_trocar_senha').eq('id', user!.id).maybeSingle();
      if (error) throw error;
      return data as { papel: string; ativo: boolean; nome: string; deve_trocar_senha?: boolean } | null;
    },
  });
  const role: OrgRole = perfil?.papel === 'admin' ? 'admin' : perfil?.papel === 'gestor' ? 'gestor' : 'atendente';
  const org: Organization = { id: 'reviza', name: 'ALFA GROUP', slug: 'reviza', role };
  const value = useMemo<OrgState>(() => ({ orgs: [org], currentOrg: org, setCurrentOrg: () => {}, loading: !!user && isLoading }), [role, user?.id, isLoading]);

  if (user && isLoading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', color: 'var(--text-muted, #889)' }}>Carregando seu acesso…</div>;
  }
  // falha de REDE não é "acesso negado": tela própria com tentar de novo
  if (user && isError) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', textAlign: 'center', padding: 24, color: 'var(--text-muted, #889)' }}>
        <div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Não foi possível carregar seu acesso.</p>
          <p style={{ margin: '0 0 14px', fontSize: 13 }}>Você continua autenticado. Verifique a conexão e tente novamente.</p>
          <button onClick={() => refetch()} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      </div>
    );
  }
  if (user && perfil?.ativo && perfil.deve_trocar_senha) {
    return <TrocarSenhaReviza aoConcluir={() => { void refetch(); }} />;
  }
  if (user && (!perfil || !perfil.ativo)) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', textAlign: 'center', padding: 24, color: 'var(--text-muted, #889)' }}>
        <div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Seu acesso ainda não foi liberado.</p>
          <p style={{ margin: '0 0 14px', fontSize: 13 }}>Peça ao administrador para ativar o seu usuário.</p>
          <button onClick={() => signOut()} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Sair</button>
        </div>
      </div>
    );
  }
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function OrgProvider({ children }: { children: ReactNode }) {
  if (isRevizaMode) return <OrgProviderReviza>{children}</OrgProviderReviza>;
  return <OrgProviderAtenvo>{children}</OrgProviderAtenvo>;
}

function OrgProviderAtenvo({ children }: { children: ReactNode }) {
  const { user, mode, signOut } = useAuth();
  const queryClient = useQueryClient();
  const realEnabled = mode === 'supabase' && isSupabaseConfigured && !!supabase && !!user;

  type OrgEmbed = { id: string; nome: string; slug: string };
  type Row = { papel: string; status: string; organizacoes: OrgEmbed | OrgEmbed[] | null };

  // Busca TODOS os vínculos do usuário (qualquer status) — para distinguir ativo × convidado ×
  // inativo × sem-organização e NUNCA mandar vínculo ativo/convidado/inativo para o onboarding.
  const { data: vinculosRaw, isLoading, isFetched, isError, refetch } = useQuery({
    queryKey: ['orgs', user?.id],
    enabled: realEnabled,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase!
        .from('organizacao_usuarios')
        .select('papel, status, organizacoes(id, nome, slug)')
        .eq('usuario_id', user!.id);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const vinculos: Row[] = realEnabled ? (vinculosRaw ?? []) : [];
  // Organizações ATIVAS com dados carregados (utilizáveis no app).
  const orgsAtivas: Organization[] = vinculos
    .filter((r) => r.status === 'ativo')
    .map((r) => {
      const o = Array.isArray(r.organizacoes) ? r.organizacoes[0] : r.organizacoes;
      return o ? { id: o.id, name: o.nome, slug: o.slug, role: mapRole(r.papel) } : null;
    })
    .filter((x): x is Organization => x !== null);
  const orgs: Organization[] = realEnabled ? orgsAtivas : DEMO_ORGS;

  const [mockNoOrg, setMockNoOrg] = useState<boolean>(() => {
    try { return mode === 'mock' && localStorage.getItem(MOCK_NOORG_KEY) === '1'; } catch { return false; }
  });

  const [currentId, setCurrentId] = useState<string>(() => {
    try {
      const porUsuario = user?.id ? localStorage.getItem(chaveOrg(user.id)) : null;
      const s = porUsuario ?? localStorage.getItem(CUR_KEY);
      if (s) return s;
    } catch { /* ignore */ }
    return '';
  });
  // auth resolve assíncrono: quando o usuário chega, relê a preferência DELE
  useEffect(() => {
    if (!user?.id) return;
    try {
      const s = localStorage.getItem(chaveOrg(user.id));
      if (s) setCurrentId(s);
    } catch { /* ignore */ }
  }, [user?.id]);
  // Quando a lista chega/atualiza, garante uma selecao valida
  useEffect(() => {
    if (!orgs.length) return;
    if (!orgs.some((o) => o.id === currentId)) setCurrentId(orgs[0].id);
  }, [orgs, currentId]);

  const setCurrentOrg = (id: string) => {
    if (!orgs.some((o) => o.id === id)) return;
    setCurrentId(id);
    try { localStorage.setItem(chaveOrg(user?.id), id); } catch { /* ignore */ }
  };

  const loading = realEnabled && isLoading;

  // Provisiona a PRIMEIRA organizacao do usuario logado e o vincula como admin (RPC no backend).
  async function onProvision(nome: string) {
    const slug = slugify(nome);
    if (realEnabled && supabase) {
      let { error } = await supabase.rpc('provisionar_organizacao', { p_nome: nome, p_slug: slug });
      if (error) {
        const code = (error as { code?: string }).code;
        const conflito = code === '23505' || /duplicate|unique|already|exists|slug/i.test(error.message);
        if (conflito) {
          const retry = await supabase.rpc('provisionar_organizacao', { p_nome: nome, p_slug: `${slug}-${randomSuffix()}` });
          error = retry.error;
        }
      }
      if (error) throw new Error(error.message);
      gotoWhatsApp();
      await queryClient.invalidateQueries({ queryKey: ['orgs'] }); // atualiza o OrgContext
    } else {
      // modo mock: apenas exercita o fluxo (sem backend)
      try { localStorage.removeItem(MOCK_NOORG_KEY); } catch { /* ignore */ }
      gotoWhatsApp();
      setMockNoOrg(false);
    }
  }

  // Hooks SEMPRE chamados antes de qualquer return condicional (regra dos Hooks).
  const currentOrg = orgs.find((o) => o.id === currentId) ?? orgs[0];
  const value = useMemo<OrgState>(() => ({ orgs, currentOrg, setCurrentOrg, loading }), [orgs, currentOrg, loading]);

  // Decisão ÚNICA do que renderizar (nunca tratar loading como "sem organização").
  const contexto = mode === 'mock'
    ? (mockNoOrg ? 'sem_organizacao' as const : 'com_organizacao' as const)
    : resolverContextoInicial({
        habilitado: realEnabled,
        carregando: realEnabled && (isLoading || !isFetched),
        erro: realEnabled && isError,
        deveTrocarSenha: !!user?.deveTrocarSenha,
        vinculos: vinculos.map((r) => ({ status: r.status })),
        orgsAtivasComDados: orgsAtivas.length,
      });

  if (contexto === 'carregando') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', color: 'var(--text-muted, #889)' }}>
        Carregando organização…
      </div>
    );
  }
  // Auth OK mas a carga do contexto falhou (RLS/rede) — NÃO é senha e NÃO é "sem organização".
  if (contexto === 'erro') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', textAlign: 'center', padding: 24, color: 'var(--text-muted, #889)' }}>
        <div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Não foi possível carregar sua organização.</p>
          <p style={{ margin: '0 0 14px', fontSize: 13 }}>Você continua autenticado. Verifique a conexão e tente novamente.</p>
          <button onClick={() => refetch()} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      </div>
    );
  }
  // Vínculo convidado/inativo: erro controlado — NUNCA sugerir criar organização (#7).
  if (contexto === 'convite_pendente' || contexto === 'acesso_inativo') {
    const msg = contexto === 'convite_pendente' ? 'Seu convite ainda não foi ativado.' : 'Seu acesso a esta organização está inativo.';
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', textAlign: 'center', padding: 24, color: 'var(--text-muted, #889)' }}>
        <div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{msg}</p>
          <p style={{ margin: '0 0 14px', fontSize: 13 }}>Fale com o administrador da organização.</p>
          <button onClick={() => signOut()} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Sair</button>
        </div>
      </div>
    );
  }
  // Sem nenhum vínculo -> onboarding (cria a empresa e vincula como admin).
  if (contexto === 'sem_organizacao') {
    if (emRotaV2()) {
      return (
        <Suspense fallback={null}>
          <OnboardingV2 onProvision={onProvision} />
        </Suspense>
      );
    }
    return <Onboarding onProvision={onProvision} />;
  }
  // 'trocar_senha' e 'com_organizacao': renderiza o app; o ProtectedRoute cuida da rota
  // (deve_trocar_senha -> /alterar-senha; senão index -> /whatsapp). Org já auto-selecionada.
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg deve ser usado dentro de <OrgProvider>');
  return ctx;
}
