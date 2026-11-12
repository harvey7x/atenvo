/* Botão global de DESFAZER (undo) — mostra a última ação reversível do sistema
   e a reverte num clique. Quando a última ação não tem como ser desfeita
   (WhatsApp enviado, reset de senha…), aparece esmaecido e explica o porquê.
   A lógica do slot fica em src/v2/data/desfazer.ts. */
import { useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDesfazerEstado, executarDesfazer } from '../data/desfazer';

function IconeDesfazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" />
    </svg>
  );
}

const baseBtn: CSSProperties = {
  // 32px e raio 6: o mesmo dos botões da barra do topo da ALFA (barra-alfa.css); o fio segue o da barra
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px',
  borderRadius: 6, border: '1px solid var(--ba-fio, var(--linha))', background: 'transparent',
  color: 'var(--txt)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
};

function ToastDesfazer({ tom, txt }: { tom: 'ok' | 'erro' | 'info'; txt: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)',
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

  // SEMPRE visível (dono 17/09: "cadê o botão?"): sem ação pra desfazer, fica o
  // ícone esmaecido do lado do botão de tema; clicar explica pra que serve.
  if (!estado) {
    return (
      <>
        <button
          type="button"
          style={{ ...baseBtn, opacity: 0.45, padding: '0 10px' }}
          title="Desfazer — a última ação feita no sistema aparece aqui pra reverter num clique."
          onClick={() => flash('info', 'Nada pra desfazer por enquanto. Quando você mover um ciclo, marcar um pagamento ou editar um cliente, a ação aparece aqui pra reverter num clique (por até 5 minutos).')}
        >
          <IconeDesfazer />
          <span>Desfazer</span>
        </button>
        {toast && <ToastDesfazer tom={toast.tom} txt={toast.txt} />}
      </>
    );
  }

  const bloqueada = estado.tipo === 'bloqueada';
  const rotulo = estado.rotulo;
  // "Confirmar?" só vale pra ESTA ação (por identidade, não por flag solta)
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
      flash('erro', `Não deu pra desfazer: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  const estilo: CSSProperties = bloqueada
    ? { ...baseBtn, opacity: 0.55, cursor: 'help' }
    : confirmando
      ? { ...baseBtn, borderColor: 'rgba(var(--ambar-rgb,201,162,39),.6)', background: 'rgba(var(--ambar-rgb,201,162,39),.12)', color: 'var(--ambar)' }
      : { ...baseBtn };

  const label = bloqueada
    ? 'Desfazer'
    : ocupado ? 'Desfazendo…' : confirmando ? 'Confirmar?' : 'Desfazer';

  return (
    <>
      <button
        type="button"
        style={estilo}
        disabled={ocupado}
        title={bloqueada
          ? `Última ação: ${rotulo}. Não dá pra desfazer — ${estado.motivo}`
          : `Desfazer: ${rotulo}`}
        onClick={() => (bloqueada && estado.tipo === 'bloqueada'
          ? flash('info', `"${rotulo}" não dá pra desfazer: ${estado.motivo}`)
          : rodar())}
      >
        <IconeDesfazer />
        <span>{label}</span>
        {!bloqueada && !confirmando && !ocupado && (
          <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.6, fontWeight: 500 }}>· {rotulo}</span>
        )}
      </button>
      {toast && <ToastDesfazer tom={toast.tom} txt={toast.txt} />}
    </>
  );
}
