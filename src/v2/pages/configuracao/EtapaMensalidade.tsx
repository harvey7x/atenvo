/* ------------------------------------------------------------------
   Configuração inicial — ETAPA 3: Mensalidade da plataforma.
   UM bloco de fatura (atraso = rubro · paga = verde · em aberto = neutro)
   com o valor, a referência/vencimento e, no pé do bloco, a próxima
   mensalidade. Abaixo, o Pix (PixLicenca do LicencaGate — o MESMO miolo,
   reorganizado só por CSS: QR à esquerda, copia e cola à direita) e o
   rodapé fixo com "Já paguei" (real: verificarPagamento, a mesma edge do
   LicencaGate). Concluída = pago → "Pago em dd/mm às hh:mm" + ✓ SVG.
   Estado alternativo: pagamento indisponível (o suporte já foi avisado).
   ------------------------------------------------------------------ */
import { BotaoPrimario, BotaoSec } from '../../components/Botao';
import { MSG_NAO_CAIU, PixLicenca } from '../../components/LicencaGate';
import { useConfirmarPagamento, useMensalidadeConfig } from '../../data/cobranca/configuracao';
import { Ic } from './EtapaPlanilha';
import { FigPixPagar } from './figuras/figurasSistema';
import { IcCheck } from './TelaEspera';

const TZ = 'America/Sao_Paulo';
/** ISO → "19/10 às 14:32" (Brasília) */
export function pagoEmRotulo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

/** cartão (mesmo desenho do ícone da etapa) */
function IcCartao() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 10.5h18M7 15h4" />
    </svg>
  );
}
/** × de traço (erro) */
function IcX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function EtapaMensalidade({ concluida }: { concluida: boolean }) {
  const q = useMensalidadeConfig();
  const pagar = useConfirmarPagamento();
  const m = q.data;

  if (q.isLoading) {
    return (
      <div className="cini-ms" aria-busy="true">
        <div className="cini-ms-fatura cini-ms-em-aberta cini-neutro">
          <span className="cini-ms-tile" aria-hidden><IcCartao /></span>
          <span className="cini-ms-col">
            <span className="skel cini-skel-rot" />
            <span className="skel cini-skel-valor" />
            <span className="skel cini-skel-tx" />
          </span>
        </div>
      </div>
    );
  }
  if (q.isError || !m) {
    return (
      <div className="cini-status cini-status-er" role="alert">
        <span className="cini-status-ic" aria-hidden><IcX /></span>
        <span className="cini-status-tx">Não foi possível carregar a mensalidade.</span>
        <BotaoSec mini onClick={() => { void q.refetch(); }}>Tentar de novo</BotaoSec>
      </div>
    );
  }

  const pagoEm = m.pagoEm;
  const pago = !!pagoEm || concluida;
  const estado: 'paga' | 'atraso' | 'aberta' = pago ? 'paga' : m.vencida ? 'atraso' : 'aberta';
  const superficie = estado === 'paga' ? 'cini-sem cini-sem-ok' : estado === 'atraso' ? 'cini-sem cini-sem-er' : 'cini-neutro';
  const comPix = !pago && m.disponivel && !!m.lic;
  const erroPix = pagar.isError
    ? ((pagar.error as Error).message === 'nao-caiu' ? MSG_NAO_CAIU : (pagar.error as Error).message || MSG_NAO_CAIU)
    : null;

  return (
    <div className="cini-ms">
      <section className={`cini-ms-fatura cini-ms-em-${estado} ${superficie}`} aria-label="Mensalidade da plataforma">
        <span className="cini-ms-tile" aria-hidden>{estado === 'paga' ? <IcCheck tam={20} /> : <IcCartao />}</span>
        <span className="cini-ms-col">
          <span className="cini-ms-rot">Mensalidade da plataforma</span>
          <span className="cini-ms-valor num">{m.valor}</span>
          <span className="cini-ms-linha num">
            {m.referencia && <>referente a {m.referencia}</>}
            {m.vencimento && !pagoEm && !concluida && (
              m.vencida
                ? <> · <span className="cini-ms-atraso">vencida desde {m.vencimento}</span></>
                : <> · vence em {m.vencimento}</>
            )}
          </span>
          {pago && (
            <span className="cini-ms-pago" role="status">
              <span className="cini-ms-pago-ic" aria-hidden><IcCheck tam={16} /></span>
              <span>{pagoEm ? <>Pago em <span className="num">{pagoEmRotulo(pagoEm)}</span></> : 'Pago'}</span>
            </span>
          )}
        </span>
        {m.proxima && (
          <p className="cini-ms-prox num">Próxima mensalidade: <b>{m.proxima.valor}</b> em <b>{m.proxima.data}</b></p>
        )}
      </section>

      {comPix && m.lic && (
        <section className="cini-sec cini-ms-pix" aria-label="Pagamento por Pix">
          <PixLicenca lic={m.lic} />
          {/* sem QR neste mês (só copia e cola): a demonstração mostra como o pagamento funciona */}
          {!m.lic.qrSrc && <div className="cini-ms-fig" aria-hidden><FigPixPagar /></div>}
          {erroPix && (
            <p className="cini-status cini-status-info" role="status">
              <span className="cini-status-ic" aria-hidden><Ic n="info" s={16} /></span>
              <span className="cini-status-tx">{erroPix}</span>
            </p>
          )}
        </section>
      )}

      {!pago && !comPix && (
        <div className="cini-neutro cini-ms-indisp" role="status">
          <span className="cini-ms-indisp-ic" aria-hidden><Ic n="info" s={16} /></span>
          <span className="cini-ms-indisp-tx">
            <b>Pagamento indisponível no momento — o suporte já foi avisado.</b>
            <span>Assim que a cobrança voltar, o QR Code aparece aqui.</span>
            <span className="cini-ms-indisp-acao">
              <BotaoSec mini onClick={() => { void q.refetch(); }} disabled={q.isFetching}>{q.isFetching ? 'Verificando…' : 'Tentar de novo'}</BotaoSec>
            </span>
          </span>
          {/* enquanto isso, a demonstração de como vai ser: QR na tela, banco lê, confirma na hora */}
          <span className="cini-ms-fig" aria-hidden><FigPixPagar /></span>
        </div>
      )}

      {comPix && (
        <div className="cini-pe cini-pe-etapa">
          <div className="cini-pe-dica">
            <span className="cini-pe-ic" aria-hidden><Ic n="info" s={14} /></span>
            <span>A confirmação também chega sozinha, em até 1 minuto depois do Pix cair.</span>
          </div>
          <div className="cini-pe-acoes">
            <BotaoPrimario onClick={() => pagar.mutate()} disabled={pagar.isPending} aria-busy={pagar.isPending || undefined}>
              {pagar.isPending ? 'Conferindo o pagamento…' : 'Já paguei'}
            </BotaoPrimario>
          </div>
        </div>
      )}
    </div>
  );
}
