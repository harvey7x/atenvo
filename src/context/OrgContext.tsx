import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Organization, OrgRole } from '@/types/org';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DEMO_ORGS } from '@/data/demo';
import { Onboarding } from '@/pages/Onboarding';
import { slugify, randomSuffix } from '@/lib/slug';
import { resolverContextoInicial } from '@/lib/resolverContexto';

const CUR_KEY = 'atenvo-current-org';
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
    if (useHashRouting) window.location.hash = '#/whatsapp';
    else window.history.replaceState({}, '', '/whatsapp');
  } catch { /* ignore */ }
}

interface OrgState {
  orgs: Organization[];
  currentOrg: Organization;
  setCurrentOrg: (id: string) => void;
  loading: boolean;
}

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
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
    try { const s = localStorage.getItem(CUR_KEY); if (s) return s; } catch { /* ignore */ }
    return '';
  });
  // Quando a lista chega/atualiza, garante uma selecao valida
  useEffect(() => {
    if (!orgs.length) return;
    if (!orgs.some((o) => o.id === currentId)) setCurrentId(orgs[0].id);
  }, [orgs, currentId]);

  const setCurrentOrg = (id: string) => {
    if (!orgs.some((o) => o.id === id)) return;
    setCurrentId(id);
    try { localStorage.setItem(CUR_KEY, id); } catch { /* ignore */ }
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
