import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

/* ============================================================
   Extração fiel da troca de senha obrigatória de
   src/pages/AlterarSenha.tsx (contrato, item 4): mesma ordem
   updateUser → rpc senha_trocada → signOut({scope:'others'})
   best-effort → refreshProfile → navegação; mesma máquina de
   retomada (senhaTrocada) e mesmos textos. A liberação recebe
   dependências injetáveis para teste unitário sem DOM.
   ============================================================ */

/** Senha forte do v1: ao menos 8 caracteres, com letra (inclui acentuadas) e número. */
export const senhaForte = (s: string) => s.length >= 8 && /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s);

export const MSG_LIBERACAO_FALHOU =
  'Senha alterada, mas não foi possível liberar o acesso. Toque em "Concluir" para tentar novamente.';

export interface DepsLiberacao {
  baixarFlag: () => Promise<{ error: unknown | null }>;
  encerrarOutrasSessoes: () => Promise<unknown>;
  atualizarPerfil: () => Promise<unknown>;
}

/** Liberação idêntica ao `liberar` do v1: baixa a flag (idempotente); se falhar,
 *  informa e permite retomar. signOut de outras sessões é best-effort. */
export async function executarLiberacao(deps: DepsLiberacao): Promise<{ ok: boolean; erro?: string }> {
  const { error: rpcErr } = await deps.baixarFlag();
  if (rpcErr) return { ok: false, erro: MSG_LIBERACAO_FALHOU };
  try { await deps.encerrarOutrasSessoes(); } catch { /* encerra outras sessões quando possível */ }
  await deps.atualizarPerfil();
  return { ok: true };
}

interface Opcoes {
  /** Para onde liberar o acesso (v1: /whatsapp; v2: destino padrão do v2). */
  destino: string;
}

/** Hook da troca de senha obrigatória — estados e ações da página AlterarSenha. */
export function useTrocaSenhaObrigatoria({ destino }: Opcoes) {
  const { updatePassword, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // senha JÁ trocada no Auth mas ativação (RPC) ainda não concluída -> retoma sem redefinir de novo.
  const [senhaTrocada, setSenhaTrocada] = useState(false);

  async function liberar(): Promise<boolean> {
    const r = await executarLiberacao({
      baixarFlag: async () => await supabase!.rpc('senha_trocada'),
      encerrarOutrasSessoes: () => supabase!.auth.signOut({ scope: 'others' }),
      atualizarPerfil: refreshProfile,
    });
    if (!r.ok) { setErro(r.erro ?? MSG_LIBERACAO_FALHOU); return false; }
    navigate(destino, { replace: true });
    return true;
  }

  async function salvar(senha: string, conf: string) {
    if (busy) return;
    setErro(null);
    // já trocou a senha antes (a RPC falhou): só concluir a liberação, sem redefinir.
    if (senhaTrocada) { setBusy(true); const ok = await liberar(); if (!ok) setBusy(false); return; }
    if (!senhaForte(senha)) { setErro('Use uma senha forte: ao menos 8 caracteres, com letras e números.'); return; }
    if (senha !== conf) { setErro('As senhas não coincidem.'); return; }
    setBusy(true);
    // 1) troca a senha (invalida a temporária)
    const { error } = await updatePassword(senha);
    if (error) { setBusy(false); setErro(error); return; }
    setSenhaTrocada(true);
    // 2) libera o acesso (se falhar, o botão "Concluir" retoma sem pedir a senha de novo)
    const ok = await liberar();
    if (!ok) setBusy(false);
  }

  return { erro, busy, senhaTrocada, salvar, limparErro: () => setErro(null) };
}
