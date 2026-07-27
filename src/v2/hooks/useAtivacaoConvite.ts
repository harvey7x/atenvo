import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { decidirFase, type EstadoConvite } from '@/pages/DefinirSenha';

/* ============================================================
   Extração fiel do fluxo de convite de src/pages/DefinirSenha.tsx
   (contrato, item 4): mesmas cadências (polling 8×/500ms, pausas
   de 300/600/1500ms), mesmos textos, mesma máquina de fases.
   A fase é decidida pela SESSÃO REAL + RPC convite_estado — nunca
   por ?ativar=1 nem tem_senha. decidirFase é REUSADA da página
   antiga (pura e exportada lá). Sem senha/token/link em log.
   As rotinas assíncronas recebem dependências injetáveis para
   teste unitário sem DOM.
   ============================================================ */

export type FaseConvite = 'carregando' | 'senha' | 'pendente' | 'sucesso' | 'ja_ativo' | 'sem_sessao' | 'erro';

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Mensagem transitória (rede/sessão): vale tentar de novo. Regex idêntica ao v1. */
export const erroTransitorio = (m: string) => /autenticado|jwt|session|auth|network|fetch|timeout|429|502|503/i.test(m);

/** Erro de updatePassword que significa link consumido/expirado. Regex idêntica ao v1. */
export const erroDeLinkUsado = (m: string) => /expired|invalid|token|otp|session/i.test(m);

type SessaoMinima = { user?: unknown } | null;

export interface DepsSessao {
  getSession: () => Promise<SessaoMinima>;
  dormir?: (ms: number) => Promise<void>;
}

/** Aguarda o supabase-js processar o token da URL: até 8 tentativas de 500ms
 *  (~4s — navegador in-app do WhatsApp é mais lento), como no v1. */
export async function aguardarSessao(
  { getSession, dormir = dormirReal }: DepsSessao,
  aindaVivo: () => boolean = () => true,
): Promise<SessaoMinima> {
  let sessao: SessaoMinima = null;
  for (let i = 0; i < 8 && aindaVivo(); i++) {
    sessao = await getSession();
    if (sessao) break;
    await dormir(500);
  }
  return sessao;
}

export interface DepsAtivacao {
  getSession: () => Promise<SessaoMinima>;
  refreshSession: () => Promise<SessaoMinima>;
  getUser: () => Promise<unknown | null>;
  aceitarConvite: () => Promise<{ error: { message?: string } | null }>;
  dormir?: (ms: number) => Promise<void>;
}

/** Ativação resiliente (idêntica ao `ativar` do v1): garante a sessão real,
 *  confirma o usuário e chama convite_aceitar com 1 retry em erro transitório. */
export async function executarAtivacao(deps: DepsAtivacao): Promise<'ok' | 'ja_ativo' | 'expirado' | 'falha'> {
  const dormir = deps.dormir ?? dormirReal;
  let sessao = await deps.getSession();
  if (!sessao) sessao = await deps.refreshSession();
  await dormir(300);
  const u = await deps.getUser();
  if (!u) return 'falha';
  let { error } = await deps.aceitarConvite();
  if (error && erroTransitorio(error.message || '')) {
    await dormir(600);
    ({ error } = await deps.aceitarConvite());
  }
  if (!error) return 'ok';
  const m = error.message || '';
  if (m.includes('convite_expirado')) return 'expirado';
  if (m.includes('convite_inexistente') || m.includes('vinculo_invalido')) return 'ja_ativo'; // já concluído/cancelado -> login
  return 'falha';
}

export const MSG_SUCESSO_CONVITE = 'Senha definida. Seu acesso foi ativado.';

interface Opcoes {
  /** Rota de login para onde o fluxo termina (v1: /login; v2: /v2/login). */
  destinoLogin: string;
}

/** Hook do fluxo de convite — estados e ações da página DefinirSenha. */
export function useAtivacaoConvite({ destinoLogin }: Opcoes) {
  const { updatePassword, mode } = useAuth();
  const navigate = useNavigate();

  const [fase, setFase] = useState<FaseConvite>('carregando');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [senhaOk, setSenhaOk] = useState(false);
  const vivo = useRef(true);

  // Fase inicial pela SESSÃO REAL + estado do convite (qualquer formato de link:
  // code / hash access_token / invite / recovery — o supabase-js processa a URL).
  useEffect(() => {
    if (mode !== 'supabase' || !supabase) return;
    vivo.current = true;
    (async () => {
      const sessao = await aguardarSessao(
        { getSession: async () => (await supabase!.auth.getSession()).data.session },
        () => vivo.current,
      );
      if (!vivo.current) return;
      if (!sessao) {
        // Sem sessão: link consumido/expirado ou acesso direto. NUNCA "reabra o
        // link" — se a conta já existe, o caminho é o login normal.
        setFase('sem_sessao');
        return;
      }
      const { data: est, error } = await supabase!.rpc('convite_estado');
      if (!vivo.current) return;
      if (error) { setFase('senha'); return; } // falha ao consultar: há sessão de convite -> permite definir a senha
      const { fase: f, erro: e } = decidirFase({ sessao: true, ...(est as EstadoConvite) });
      if (e) setErro(e);
      setFase(f);
    })();
    return () => { vivo.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Sucesso: confirmação visível (1,5s como no v1), encerra a sessão do convite
  // e vai ao login com o aviso (no v1 era toast; no v2 o login mostra o banner).
  async function finalizar() {
    setFase('sucesso');
    await dormirReal(1500);
    try { await supabase!.auth.signOut(); } catch { /* segue mesmo assim */ }
    navigate(destinoLogin, { replace: true, state: { aviso: MSG_SUCESSO_CONVITE } });
  }

  async function concluirAtivacao() {
    if (busy) return;
    setBusy(true); setErro(null);
    const r = await executarAtivacao({
      getSession: async () => (await supabase!.auth.getSession()).data.session,
      refreshSession: async () => (await supabase!.auth.refreshSession()).data.session,
      getUser: async () => (await supabase!.auth.getUser()).data.user,
      aceitarConvite: async () => await supabase!.rpc('convite_aceitar'),
    });
    setBusy(false);
    if (r === 'ok') { await finalizar(); return; }
    if (r === 'ja_ativo') { setFase('ja_ativo'); return; }
    if (r === 'expirado') { setErro('Este convite expirou ou não é mais válido.'); setFase('pendente'); return; }
    // senha já foi definida; a ativação falhou -> não pede senha de novo
    setErro('Sua senha foi definida, mas a ativação não foi concluída.'); setFase('pendente');
  }

  async function definirEContinuar(senha: string, conf: string) {
    if (busy) return;
    setErro(null);
    if (!senhaOk) {
      if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
      if (senha !== conf) { setErro('As senhas não coincidem.'); return; }
      setBusy(true);
      const { error } = await updatePassword(senha); // define a senha (uma única vez)
      if (error) {
        setBusy(false);
        setErro(erroDeLinkUsado(error) ? 'O link expirou ou já foi utilizado. Se você já definiu a senha, faça login.' : error);
        return;
      }
      setSenhaOk(true); setBusy(false);
    }
    // senha salva -> ativa (NUNCA pede senha de novo, NUNCA "reabra o link")
    await concluirAtivacao();
  }

  return { fase, erro, busy, senhaOk, definirEContinuar, concluirAtivacao, limparErro: () => setErro(null) };
}
