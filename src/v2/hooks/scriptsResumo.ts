import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { supabase } from '@/lib/supabase';
import { SCRIPTS_REAL, type EtapaTipo } from '@/data/scripts';
import { buscarKeyset } from '@/data/paginacao';

/* Resumo de etapas por script para os cards do arsenal (Scripts v2.1).
   ESPELHA a consulta do hook existente useScriptEtapaCounts (mesma tabela
   script_etapas, mesmo escopo por organização/RLS, mesmo custo), ampliando
   apenas as colunas lidas (posicao, nome_arquivo) para o card poder dizer
   "Sequência · N passos" e mostrar tipo+nome do anexo — nunca "—".
   Nenhuma mutação; apresentação de dados da própria página.

   Paleta de scripts do inbox (20/10): + conteudo/storage_path para a lista dizer
   a COMPOSIÇÃO enviável (ícones por tipo + "N mensagens", o mesmo critério do
   compositor) e para a busca achar o texto das mensagens. Campos novos são
   OPCIONAIS — quem só lê total/primeira/temMidia (página /scripts, mobile) segue igual. */

export interface ResumoEtapas {
  total: number;
  /** primeira etapa na ordem (para o card de script só-mídia) */
  primeira?: { tipo: EtapaTipo; nome: string | null };
  temMidia: boolean;
  /** etapas que o compositor ENVIA (texto não vazio; mídia com arquivo) — mesmo filtro do fetchEtapasParaEnvio */
  enviaveis?: number;
  /** tipos presentes entre as enviáveis, na ordem da 1ª aparição */
  tipos?: EtapaTipo[];
  /** textos das etapas ENVIÁVEIS (mensagens e legendas), com o nº da mensagem no compositor —
   *  busca no texto e linha "Mensagem N" da lista */
  textos?: { n: number; texto: string }[];
  /** a sequência ENVIÁVEL na ordem (tipo + nome do arquivo) — a paleta desenha a prévia na
   *  hora com isto + textos, antes de fetchEtapas chegar (tamanho/duração vêm depois) */
  seq?: { tipo: EtapaTipo; nome: string | null }[];
}

/** Uma etapa mínima para resumir (linha do banco ou etapa de amostra do demo). */
export interface EtapaParaResumo { tipo: EtapaTipo; conteudo?: string | null; nome?: string | null; storagePath?: string | null; }

/** Resumo de UMA sequência (pura — o hook e o demo usam a mesma regra). */
export function resumirEtapas(etapas: EtapaParaResumo[]): ResumoEtapas {
  const r: ResumoEtapas = { total: 0, temMidia: false, enviaveis: 0, tipos: [], textos: [], seq: [] };
  for (const e of etapas) {
    r.total += 1;
    if (!r.primeira) r.primeira = { tipo: e.tipo, nome: e.nome ?? null };
    if (e.tipo !== 'texto') r.temMidia = true;
    const txt = (e.conteudo ?? '').trim();
    const envia = e.tipo === 'texto' ? !!txt : !!e.storagePath;
    if (envia) {
      r.enviaveis! += 1;
      if (!r.tipos!.includes(e.tipo)) r.tipos!.push(e.tipo);
      if (txt) r.textos!.push({ n: r.enviaveis!, texto: e.conteudo ?? '' });
      r.seq!.push({ tipo: e.tipo, nome: e.nome ?? null });
    }
  }
  return r;
}

type LinhaEtapa = { id: string; script_id: string; tipo: EtapaTipo; nome_arquivo: string | null; posicao: number; conteudo: string | null; storage_path: string | null };

export function useScriptsResumoEtapas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['v2-scripts-resumo-etapas', currentOrg.id],
    enabled: SCRIPTS_REAL,
    queryFn: async (): Promise<Record<string, ResumoEtapas>> => {
      // PAGINADO por id (keyset): o db-max-rows=1000 do PostgREST truncaria em silêncio
      // (composição errada e busca cega nos últimos scripts). A ordem da sequência
      // (posicao) é refeita em JS por script — a paginação só garante nada pulado/duplicado.
      const linhas = await buscarKeyset<LinhaEtapa>(
        (cursor, tamanho) => {
          let q = supabase!
            .from('script_etapas')
            .select('id, script_id, tipo, nome_arquivo, posicao, conteudo, storage_path')
            .eq('organizacao_id', currentOrg.id)
            .order('id', { ascending: false })
            .limit(tamanho);
          if (cursor) q = q.lt('id', cursor);
          return q as unknown as PromiseLike<{ data: LinhaEtapa[] | null; error: { message?: string } | null }>;
        },
        (r) => r.id,
        { rotulo: 'script_etapas resumo' },
      );
      const porScript = new Map<string, LinhaEtapa[]>();
      for (const r of linhas) {
        const l = porScript.get(r.script_id) ?? [];
        l.push(r);
        porScript.set(r.script_id, l);
      }
      const map: Record<string, ResumoEtapas> = {};
      for (const [id, ls] of porScript) {
        ls.sort((a, b) => a.posicao - b.posicao);
        const etapas: EtapaParaResumo[] = ls.map((r) => ({ tipo: r.tipo, conteudo: r.conteudo, nome: r.nome_arquivo, storagePath: r.storage_path }));
        map[id] = resumirEtapas(etapas);
      }
      return map;
    },
  });
}
