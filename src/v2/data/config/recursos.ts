/* O QUE ESTA INSTALAÇÃO JÁ TEM NO SERVIDOR (22/11).
   Várias telas novas dependem de peças que ainda não existem no banco do Reviza (conferido no banco
   de verdade em 22/11: lá só existe a parte de Cobranças). Publicar a tela sem a peça do servidor
   daria erro para quem usa. Então, NO SISTEMA DE VERDADE, cada recurso só aparece quando é ligado
   na instalação (VITE_RECURSOS="asaas,iris" ou "tudo"), depois que a parte do servidor estiver pronta:
     atendimento   o ambiente Atendimento inteiro (banco e funções do Atendimento)
     telas         telas liberadas por pessoa (coluna profiles.areas + função reviza-admin)
     asaas         integração de pagamentos (tabela integracoes + função reviza-asaas)
     wa-oficial    WhatsApp pela API oficial (função reviza-wa-oficial)
     iris          a atendente virtual (precisa do Atendimento + motor da Iris)
   Na PRÉVIA tudo aparece (é a demonstração do que o sistema vai ter); a prévia "só o que existe"
   (VITE_PREVIA_SO_REAL) mostra o sistema exatamente como iria ao ar hoje. Fora do Reviza nada muda. */
import { isPrevia, isRevizaMode } from '@/lib/supabase';

export type Recurso = 'atendimento' | 'telas' | 'asaas' | 'wa-oficial' | 'iris';
const LIGADOS = new Set(String(import.meta.env.VITE_RECURSOS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const PREVIA_SO_REAL = String(import.meta.env.VITE_PREVIA_SO_REAL) === 'true';

// isPrevia/isRevizaMode são lidos DENTRO da função, nunca na carga do módulo: este arquivo entra no
// ciclo de imports de lib/supabase (pela prévia) e ler as duas na carga quebrava a abertura do sistema
function ligado(r: Recurso): boolean {
  if (!isRevizaMode) return true;
  if (isPrevia) return !PREVIA_SO_REAL;
  return LIGADOS.has('tudo') || LIGADOS.has(r);
}
/** este recurso existe nesta instalação? (a Iris depende do Atendimento) */
export const temRecurso = (r: Recurso): boolean => ligado(r) && (r !== 'iris' || ligado('atendimento'));
