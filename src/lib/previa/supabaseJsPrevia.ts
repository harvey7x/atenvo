/* PRÉVIA: este arquivo entra NO LUGAR do pacote '@supabase/supabase-js' (alias em vite.config.previa.ts).
   É assim que a prévia troca o banco pelo cliente de mentira SEM que nada da prévia seja importado pelo
   código do sistema: o pacote de produção não leva dados fictícios, bloqueio de rede nem selo (22/11).
   Quem cria o cliente é sempre lib/supabase.ts, com createClient(url, chave, opções). */
import { criarSupabasePrevia } from './supabasePrevia';
import { bloquearRede } from './bloqueioRede';
import { montarSeloPrevia } from './selo';

// antes de qualquer tela: nenhuma chamada sai da prévia, e o selo "dados fictícios" fica à vista
bloquearRede();
montarSeloPrevia();

export const createClient = (..._ignorados: unknown[]) => criarSupabasePrevia();
