import { useEffect, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isRevizaMode } from '@/lib/supabase';
import { criarRaizPortalV2 } from './portal';
import { ModalV2 } from './ModalV2';
import { BotaoPrimario, BotaoSec } from './Botao';
import { usePapel } from '../data/cobranca/sessao';
import {
  chaveLicenca, licencaDevAtiva, useLicenca, verificarPagamento, type LicencaApresentada,
} from '../data/cobranca/licenca';
import './licenca.css';

/* ------------------------------------------------------------------
   Mensalidade da plataforma (Reviza) — portão de licença.
   · estado 'aviso' (dia 1º até o dia 5 às 14h): SÓ ADMINS veem uma
     faixa âmbar fixa no topo do conteúdo, com "Pagar agora" → modal
     com QR + copia-e-cola;
   · estado 'bloqueado' (dia 5, 14h em diante, fatura aberta): TAKEOVER
     de tela cheia para TODOS (padrão visual do IntroDia, fundo sólido),
     com QR, copia-e-cola e "Já paguei" (re-confere na PushinPay).
     Pagou → o estado vira 'ok' e o portão some sozinho.
   · estado 'ok' (sem fatura aberta / paga / licença desligada): nada
     renderiza — FAIL-OPEN decidido no banco, apresentado aqui.
   Só no modo reviza; a prévia DEV (?licenca=) libera fora dele.
   ------------------------------------------------------------------ */

/** exportado p/ a etapa Mensalidade da configuração inicial (mesma frase) */
export const MSG_NAO_CAIU = 'O pagamento ainda não apareceu. Ele pode levar alguns segundos — tente de novo.';

/* cópia com retorno no próprio botão (padrão Simulador/Coexistência) +
   fallback de textarea/execCommand (padrão WhatsApp.tsx) — exportado p/ reuso */
export function useCopiar() {
  const [copiado, setCopiado] = useState<'ok' | 'erro' | null>(null);
  const t = useRef<number | null>(null);
  useEffect(() => () => { if (t.current) window.clearTimeout(t.current); }, []);
  const copiar = async (texto: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    setCopiado(ok ? 'ok' : 'erro');
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setCopiado(null), 2000);
  };
  const rotulo = copiado == null ? 'Copiar' : copiado === 'ok' ? 'Copiado ✓' : 'Não foi possível copiar';
  return { copiar, rotulo };
}

/** QR + copia-e-cola (corpo compartilhado entre o modal da faixa, o takeover e a
    etapa Mensalidade da configuração inicial) */
export function PixLicenca({ lic, botaoCopiarRef }: { lic: LicencaApresentada; botaoCopiarRef?: Ref<HTMLButtonElement> }) {
  const { copiar, rotulo } = useCopiar();
  return (
    <div className="lic-pix">
      {lic.qrSrc && (
        <img className="lic-qr" src={lic.qrSrc} alt={`QR Code do Pix da mensalidade de ${lic.valor}`} width={220} height={220} />
      )}
      {lic.pixCopiaCola ? (
        <>
          <div className="lic-copia-rot">Pix copia e cola</div>
          <div className="lic-copia">
            <input className="lic-copia-tx num" type="text" readOnly value={lic.pixCopiaCola} aria-label="Código Pix copia e cola"
              onFocus={(e) => e.currentTarget.select()} />
            {/* botão nativo com as classes do BotaoSec (precisa de ref p/ foco inicial; BotaoSec não repassa ref) */}
            <button type="button" className="p-btn btn-sec btn-mini" ref={botaoCopiarRef}
              onClick={() => { void copiar(lic.pixCopiaCola as string); }}>
              {rotulo}
            </button>
          </div>
        </>
      ) : (
        <p className="lic-sem-pix">O código Pix deste mês ainda não foi gerado. Tente novamente em alguns minutos.</p>
      )}
    </div>
  );
}

/** faixa âmbar do aviso (admins, do dia 1º até o bloqueio) */
function FaixaLicenca({ lic }: { lic: LicencaApresentada }) {
  const [modal, setModal] = useState(false);
  return (
    <>
      <div className="lic-faixa" role="status">
        <span className="lic-faixa-dot" aria-hidden />
        <span className="lic-faixa-tx">
          <b>Mensalidade da plataforma</b> · {lic.valor} · {lic.rotuloVencimento ?? 'vence dia 5 às 14h'}
          {lic.rotuloPrazo && <span className="lic-faixa-prazo">{lic.rotuloPrazo}</span>}
        </span>
        <BotaoSec mini className="lic-faixa-btn" onClick={() => setModal(true)}>Pagar agora</BotaoSec>
      </div>
      <ModalV2 aberto={modal} aoFechar={() => setModal(false)} titulo="Mensalidade da plataforma" largura={400}
        rodape={<BotaoSec onClick={() => setModal(false)}>Fechar</BotaoSec>}>
        <p className="lic-modal-sub">
          {lic.valor} · referência {lic.comp ?? 'deste mês'} · {lic.rotuloVencimento ?? 'vence dia 5 às 14h'}.
          Pague por Pix pelo QR Code ou pelo copia e cola — a confirmação é automática.
        </p>
        <PixLicenca lic={lic} />
      </ModalV2>
    </>
  );
}

/** takeover de bloqueio (todos os usuários, dia 5 às 14h em diante com fatura aberta) */
function TakeoverLicenca({ lic }: { lic: LicencaApresentada }) {
  const qc = useQueryClient();
  const [verificando, setVerificando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const copiarRef = useRef<HTMLButtonElement>(null);

  // raiz de portal com classe v2 (regra 10 — mesmo ciclo do ModalV2/IntroDia)
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, []);

  // trava o scroll do app enquanto o bloqueio está montado (padrão do shell)
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = [html.style.overflow, body.style.overflow] as const;
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden';
    return () => { html.style.overflow = prev[0]; body.style.overflow = prev[1]; };
  }, []);

  // foco inicial no botão Copiar (acessibilidade do diálogo modal)
  useEffect(() => {
    if (!raiz) return;
    const t = window.setTimeout(() => copiarRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [raiz]);

  const jaPaguei = async () => {
    setVerificando(true); setAviso(null);
    try {
      const novo = await verificarPagamento();
      qc.setQueryData(chaveLicenca, novo);
      void qc.invalidateQueries({ queryKey: chaveLicenca });
      if (novo.estado !== 'ok') setAviso(MSG_NAO_CAIU);
      // estado 'ok' → o LicencaGate re-renderiza e o takeover some sozinho
    } catch {
      setAviso(MSG_NAO_CAIU);
    } finally { setVerificando(false); }
  };

  if (!raiz) return null;
  return createPortal(
    <div className="lic-veu" role="dialog" aria-modal="true" aria-label="Mensalidade da plataforma em aberto">
      <div className="lic-card">
        <div className="lic-eyebrow">Mensalidade da plataforma{lic.comp ? ` · ${lic.comp}` : ''}</div>
        <div className="lic-valor num">{lic.valor}</div>
        <p className="lic-texto">
          A mensalidade da plataforma está em aberto. O acesso volta automaticamente assim que o Pix for confirmado.
        </p>
        <PixLicenca lic={lic} botaoCopiarRef={copiarRef} />
        {aviso && <p className="lic-aviso" role="status">{aviso}</p>}
        <BotaoPrimario className="lic-cta" onClick={() => { void jaPaguei(); }} disabled={verificando}>
          {verificando ? 'Conferindo o pagamento…' : 'Já paguei'}
        </BotaoPrimario>
        <p className="lic-nota">A confirmação também chega sozinha — esta tela se libera em até 1 minuto após o Pix cair.</p>
      </div>
    </div>,
    raiz,
  );
}

export function LicencaGate() {
  const devAtiva = import.meta.env.DEV && licencaDevAtiva();
  const papelQ = usePapel();
  const licQ = useLicenca();
  const lic = licQ.data;

  if ((!isRevizaMode && !devAtiva) || !lic || lic.estado === 'ok') return null;
  if (lic.estado === 'bloqueado') return <TakeoverLicenca lic={lic} />;
  // aviso: só admins veem a faixa (prévia DEV mostra sem exigir papel)
  const ehAdmin = papelQ.data?.papel === 'admin';
  if (!ehAdmin && !devAtiva) return null;
  return <FaixaLicenca lic={lic} />;
}
