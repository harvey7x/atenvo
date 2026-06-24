import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Organization, OrgRole } from '@/types/org';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { DEMO_ORGS } from '@/data/demo';
import { Onboarding } from '@/pages/Onboarding';
import { slugify, randomSuffix } from '@/lib/slug';

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
  const { user, mode } = useAuth();
  const queryClient = useQueryClient();
  const realEnabled = mode === 'supabase' && isSupabaseConfigured && !!supabase && !!user;

  const { data: realOrgs, isLoading, isFetched } = useQuery({
    queryKey: ['orgs', user?.id],
    enabled: realEnabled,
    queryFn: async (): Promise<Organization[]> => {
      // RLS garante que so retornam vinculos do proprio usuario (is_member)
      const { data, error } = await supabase!
        .from('organizacao_usuarios')
        .select('papel, status, organizacoes(id, nome, slug)')
        .eq('usuario_id', user!.id)
        .eq('status', 'ativo');
      if (error) throw error;
      type OrgEmbed = { id: string; nome: string; slug: string };
      type Row = { papel: string; organizacoes: OrgEmbed | OrgEmbed[] | null };
      return ((data as unknown as Row[]) ?? [])
        .map((r) => {
          const o = Array.isArray(r.organizacoes) ? r.organizacoes[0] : r.organizacoes;
          return o ? { id: o.id, name: o.nome, slug: o.slug, role: mapRole(r.papel) } : null;
        })
        .filter((x): x is Organization => x !== null);
    },
  });

  const orgs: Organization[] = realEnabled ? (realOrgs ?? []) : DEMO_ORGS;

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
  const needsOnboarding = (realEnabled && isFetched && orgs.length === 0) || (mode === 'mock' && mockNoOrg);
  const currentOrg = orgs.find((o) => o.id === currentId) ?? orgs[0];
  const value = useMemo<OrgState>(() => ({ orgs, currentOrg, setCurrentOrg, loading }), [orgs, currentOrg, loading]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', color: 'var(--text-muted, #889)' }}>
        Carregando organização…
      </div>
    );
  }
  // Logado mas sem organizacao -> onboarding (cria a empresa e vincula como admin)
  if (needsOnboarding) {
    return <Onboarding onProvision={onProvision} />;
  }
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg deve ser usado dentro de <OrgProvider>');
  return ctx;
}
