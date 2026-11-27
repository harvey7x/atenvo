/* papel do usuário logado (real) — alimenta o prop `gestor` e o "pode revelar senha".
   No modo demo devolve acesso pleno (o demo sempre rodou como gestor/admin). */
import { useQuery } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { chavesCobranca } from './keys';
import type { Papel } from './types';
import { ambientesCadastrados, ambientesDoPerfil, type Ambiente } from '../modulos';
import { lerAreas } from '../config/areas';

export interface SessaoPapel {
  papel: Papel | null; gestor: boolean; podeRevelar: boolean; nome: string | null;
  /** aprova "débito parado" (financeiro, cadastro, gestor, admin) — espelha pode_aprovar_parado() da mig 52 */
  podeAprovar: boolean;
  /** id do usuário logado (quem pediu pode cancelar o próprio pedido); null no demo */
  id: string | null;
  /** ambientes que a pessoa enxerga (Cobranças / Atendimento) — ver data/modulos.ts */
  ambientes: Ambiente[];
  /** os ambientes gravados no perfil, mesmo o que esta instalação ainda não ligou (ver data/modulos.ts) */
  ambientesCadastro?: Ambiente[];
  /** telas liberadas pelo administrador (profiles.areas); null = todas as que o papel alcança — ver data/config/areas.ts */
  areas?: string[] | null;
}

/** mesma lista do banco (pode_aprovar_parado): o cadastro aprova, o comercial não */
export const papelAprova = (p: Papel | null | undefined, gestor?: boolean) =>
  !!gestor || p === 'gestor' || p === 'admin' || p === 'financeiro' || p === 'cadastro';

export function usePapel() {
  return useQuery<SessaoPapel>({
    queryKey: chavesCobranca.papel,
    staleTime: 60_000,
    queryFn: async () => {
      // fora da instância Reviza (demo E Atenvo) não há papel Reviza a consultar
      if (!isRevizaMode || !supabase) return { papel: 'gestor', gestor: true, podeRevelar: true, nome: null, podeAprovar: true, id: null, ambientes: ['cobrancas', 'atendimento'] };
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) return { papel: null, gestor: false, podeRevelar: false, nome: null, podeAprovar: false, id: null, ambientes: [] };
      // '*' e não a lista: `modulos` (ambientes) entrou depois — banco sem a coluna ainda responde (cai em Cobranças)
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
      const papel = (data && data.ativo ? (data.papel as Papel) : null);
      const gestor = papel === 'gestor' || papel === 'admin';
      // senhas para TODOS os perfis (dono 25/09: "é para a equipe"; mig 61) — cada um vê as
      // dos clientes que já enxerga (o comercial, os dele: reveal_senha/senhas_grade). Cifradas no banco.
      const podeRevelar = papel != null;
      const ambientes = papel ? ambientesDoPerfil(papel, (data as { modulos?: unknown } | null)?.modulos) : [];
      // (23/11) o que está gravado, mesmo o Atendimento que ainda não foi ligado: quem só tem ele vê o aviso
      const ambientesCadastro = papel ? ambientesCadastrados(papel, (data as { modulos?: unknown } | null)?.modulos) : [];
      return { papel, gestor, podeRevelar, nome: (data?.nome as string) ?? null, podeAprovar: papelAprova(papel, gestor), id: u.id, ambientes, ambientesCadastro, areas: papel ? lerAreas((data as { areas?: unknown } | null)?.areas) : null };
    },
  });
}
