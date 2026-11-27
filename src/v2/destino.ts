/**
 * Destino padrão do mundo v2 (pós-login, "voltar ao início", 404).
 * Até o corte final o v2 vive sob /v2 — no corte, isto vira '/'
 * num lugar só, em vez de caçar strings espalhadas.
 */
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
// No DEMO da ALFA o Atendimento está desativado (em construção) — o ambiente
// que vale é Cobranças, então o pós-login/voltar-ao-início cai lá.
// Na instância REVIZA (real) o coração é a Gestão de cobranças.
export const DESTINO_PADRAO_V2 = isRevizaMode ? '/cobrancas/painel' : isDemoMode ? '/cobrancas/painel' : '/whatsapp';
