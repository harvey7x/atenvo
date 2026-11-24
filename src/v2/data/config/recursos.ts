/* O QUE ESTA INSTALAÇÃO JÁ TEM NO SERVIDOR (22/11).
   Várias telas novas dependem de peças que ainda não existem no banco do Reviza (conferido no banco
   de verdade em 22/11: lá só existe a parte de Cobranças). Publicar a tela sem a peça do servidor
   daria erro para quem usa. Então, NO SISTEMA DE VERDADE, cada recurso só aparece quando é ligado
   na instalação (VITE_RECURSOS="asaas,iris" ou "tudo"), depois que a parte do servidor estiver pronta:
     atendimento   o ambiente Atendimento inteiro (banco e funções do Atendimento)
     telas         telas liberadas por pessoa (coluna profiles.areas + função reviza-admin)
     asaas         integração de pagamentos (tabela integracoes + função reviza-asaas)
     wa-oficial    WhatsApp pela API oficial (função reviza-wa-oficial)
     iris          a atendente virtual, nos números de WhatsApp do Reviza (migration 90 + funções
                   reviza-iris, ia-agente-testar e ia-agente-conversar)
     acessos       os CADASTROS do Atendimento antes dele existir (23/11): papel atendente, ambientes por
                   pessoa e equipes com gerente (migrations 91 e 92 + função reviza-admin). Quem só tem o
                   Atendimento entra e vê o aviso de que o Atendimento ainda vai ser ligado
   Na PRÉVIA tudo aparece (é a demonstração do que o sistema vai ter); a prévia "só o que existe"
   (VITE_PREVIA_SO_REAL) mostra o sistema exatamente como iria ao ar hoje, e VITE_PREVIA_RECURSOS="telas,acessos"
   mostra como fica com só esses recursos ligados. Fora do Reviza nada muda. */
import { isPrevia, isRevizaMode } from '@/lib/supabase';

export type Recurso = 'atendimento' | 'telas' | 'asaas' | 'wa-oficial' | 'iris' | 'iris-motor' | 'acessos';
const LIGADOS = new Set(String(import.meta.env.VITE_RECURSOS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const PREVIA_SO_REAL = import.meta.env.VITE_PREVIA_SO_REAL === 'true';
const PREVIA_ESCOLHIDOS = import.meta.env.VITE_PREVIA_RECURSOS == null ? null
  : new Set(String(import.meta.env.VITE_PREVIA_RECURSOS).split(',').map((s) => s.trim()).filter(Boolean));

// isPrevia/isRevizaMode são lidos DENTRO da função, nunca na carga do módulo: este arquivo entra no
// ciclo de imports de lib/supabase (pela prévia) e ler as duas na carga quebrava a abertura do sistema
function ligado(r: Recurso): boolean {
  if (!isRevizaMode) return true;
  if (isPrevia) return PREVIA_ESCOLHIDOS ? PREVIA_ESCOLHIDOS.has(r) : !PREVIA_SO_REAL;
  return LIGADOS.has('tudo') || LIGADOS.has(r);
}
/** este recurso existe nesta instalação? */
export const temRecurso = (r: Recurso): boolean => ligado(r);
/** dá para CADASTRAR gente do Atendimento (papel atendente, ambientes, equipes)? Com o Atendimento ligado,
    sempre; sem ele, quando as peças de acesso (migrations 91 e 92) já estão no servidor */
export const temCadastroAtendimento = (): boolean => ligado('atendimento') || ligado('acessos');
