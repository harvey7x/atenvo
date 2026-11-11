/* A Fila da Iris está liberada para quem está logado? (fila_iris_config.ativo + usuarios, no banco)
   Demonstração: sempre. Função ainda não publicada ou erro: não (o item do menu some). */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { useOrg } from '@/context/OrgContext';

export function useAcessoFila(): boolean | null {
  const { currentOrg } = useOrg();
  const [ok, setOk] = useState<boolean | null>(DEMO_MODE ? true : null);
  useEffect(() => {
    if (DEMO_MODE) return;
    let vivo = true;
    if (!supabase || !currentOrg?.id) { setOk(false); return; }
    supabase.rpc('fila_iris_acesso', { p_org: currentOrg.id }).then(({ data, error }) => {
      if (vivo) setOk(!error && data === true);
    });
    return () => { vivo = false; };
  }, [currentOrg?.id]);
  return ok;
}
