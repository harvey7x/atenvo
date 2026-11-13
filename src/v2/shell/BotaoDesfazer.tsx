/* Botão global de DESFAZER (undo) — mostra a última ação reversível do sistema
   e a reverte num clique. Quando a última ação não tem como ser desfeita
   (WhatsApp enviado, reset de senha…), aparece esmaecido e explica o porquê.
   A lógica do slot fica em src/v2/data/desfazer.ts. */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDesfazerEstado, executarDesfazer } from '../data/desfazer';

function IconeDesfazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" />
    </svg>
  );
}

/* o desenho do botão mora no barra-alfa.css (.bd-botao e os estados: vazio, bloq, confirma, novo) — ele só
   existe na ALFA (o shell só o monta na Reviza e na demo) */

function ToastDesfazer({ tom, txt }: { tom: 'ok' | 'erro' | 'info'; txt: string }) {
  return (
    <div
      role="status"
      style={{
        // centrado no CONTEÚDO: --ba-w é a largura da barra lateral da ALFA (fora dela, 0 = centro da janela)
        position: 'fixed', left: 'calc(50% + var(--ba-w, 0px) / 2)', bottom: 22, transform: 'translateX(-50%)',
        zIndex: 9999, maxWidth: 460, padding: '11px 16px', borderRadius: 11,
        fontSize: 13, fontWeight: 500, color: 'var(--txt)', boxShadow: '0 10px 34px rgba(0,0,0,.28)',
        border: '1px solid ' + (tom === 'erro' ? 'rgba(var(--rubro-rgb),.5)' : tom === 'ok' ? 'rgba(var(--verde-rgb),.5)' : 'var(--linha)'),
        background: tom === 'erro' ? 'rgba(var(--rubro-rgb),.14)' : tom === 'ok' ? 'rgba(var(--verde-rgb),.14)' : 'var(--sup-1, rgba(20,20,24,.96))',
        backdropFilter: 'blur(8px)',
      }}
    >
      {txt}
    </div>
  );
}

export function BotaoDesfazer() {
  const estado = useDesfazerEstado();
  const qc = useQueryClient();
  // confirmação atrelada à AÇÃO (guarda o `quando` dela): se o slot trocar na
  // janela de 4s, o 2º clique não executa o inverso ERRADO — desarma sozinho.
  const [confirmandoQuando, setConfirmandoQuando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [toast, setToast] = useState<{ tom: 'ok' | 'erro' | 'info'; txt: string } | null>(null);

  const flash = (tom: 'ok' | 'erro' | 'info', txt: string) => {
    setToast({ tom, txt });
    window.setTimeout(() => setToast((t) => (t && t.txt === txt ? null : t)), 4500);
  };

  // ação NOVA no slot: o botão fica em evidência por 8 segundos (sem outro aviso por cima do da tela)
  const quandoAtual = estado?.quando ?? null;
  const montadoEm = useRef(Date.now());
  const [recente, setRecente] = useState(false);
  useEffect(() => {
    if (quandoAtual == null || quandoAtual < montadoEm.current) { setRecente(false); return; }
    setRecente(true);
    const t = window.setTimeout(() => setRecente(false), 8000);
    return () => window.clearTimeout(t);
  }, [quandoAtual]);

  // SEMPRE visível (dono 17/09: "cadê o botão?"): sem ação para desfazer, fica só o ícone, sem borda, ao lado
  // do botão de tema (um botão apagado permanente parecia quebrado — crítica 12/11); clicar explica para que serve.
  if (!estado) {
    return (
      <>
        <button className="bd-botao vazio"
          type="button"
          aria-label="Desfazer a última ação"
          title="Desfazer a última ação"
          onClick={() => flash('info', 'Nada para desfazer por enquanto. Ao mover um ciclo, marcar um pagamento ou editar um cliente, a ação aparece aqui e pode ser desfeita por até 5 minutos.')}
        >
          <IconeDesfazer />
        </button>
        {toast && <ToastDesfazer tom={toast.tom} txt={toast.txt} />}
      </>
    );
  }

  const bloqueada = estado.tipo === 'bloqueada';
  const rotulo = estado.rotulo;
  // "Confirmar?" só vale para ESTA ação (por identidade, não por flag solta)
  const confirmando = estado.tipo === 'ok' && confirmandoQuando === estado.quando;

  const rodar = async () => {
    if (bloqueada || estado.tipo !== 'ok') return;
    if (estado.destrutivo && !confirmando) {
      const quando = estado.quando;
      setConfirmandoQuando(quando);
      window.setTimeout(() => setConfirmandoQuando((q) => (q === quando ? null : q)), 4000);
      return;
    }
    setConfirmandoQuando(null);
    setOcupado(true);
    try {
      const fez = await executarDesfazer(estado.quando);
      // invalida SEMPRE (mesmo se o inverso falhou no meio: metade aplicada
      // precisa aparecer na tela, não ficar invisível até a próxima ação)
      await qc.invalidateQueries().catch(() => { /* refetch avulso falhando não é fatal */ });
      if (fez) flash('ok', `Desfeito: ${rotulo}.`);
    } catch (e) {
      await qc.invalidateQueries().catch(() => { /* idem */ });
      flash('erro', `Não foi possível desfazer: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  const classe = 'bd-botao' + (bloqueada ? ' bloq' : confirmando ? ' confirma' : '') + (recente && !bloqueada ? ' novo' : '');

  const label = bloqueada
    ? 'Desfazer'
    : ocupado ? 'Desfazendo…' : confirmando ? 'Confirmar?' : 'Desfazer';

  return (
    <>
      <button className={classe}
        type="button"
        disabled={ocupado}
        title={bloqueada
          ? `Última ação: ${rotulo}. Não é possível desfazer — ${estado.motivo}`
          : `Desfazer: ${rotulo}`}
        onClick={() => (bloqueada && estado.tipo === 'bloqueada'
          ? flash('info', `"${rotulo}" não pode ser desfeita: ${estado.motivo}`)
          : rodar())}
      >
        <IconeDesfazer />
        <span className="bd-rotulo">{label}</span>
        {!bloqueada && !confirmando && !ocupado && (
          <span className="bd-acao">· {rotulo}</span>
        )}
      </button>
      {toast && <ToastDesfazer tom={toast.tom} txt={toast.txt} />}
    </>
  );
}
