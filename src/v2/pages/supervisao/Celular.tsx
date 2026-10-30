import { useMemo } from 'react';
import type { WaContact } from '@/data/whatsappDemo';
import { ZapLista } from './ZapLista';
import { ZapConversa } from './ZapConversa';
import { horaSP, IcBateria, IcSinal, IcWifi } from './zapUi';

/* ------------------------------------------------------------------
   O celular de um atendente: aparelho no desenho do iPhone (moldura
   de titânio, ilha, barra de status e indicador de início) com o
   WhatsApp dentro. Desenhado no tamanho real do iPhone (390 × 844
   pontos) e reduzido com `zoom` — texto nítido e proporções de
   verdade em qualquer tamanho escolhido na tela.
   A lista fica montada por baixo da conversa: voltar preserva a
   rolagem, como no aparelho.
   ------------------------------------------------------------------ */

export function Celular({ convs, aberta, aoAbrir, agora, nomeAtendente, zoom, aoAbrirNoAtenvo, aoAmpliar }: {
  convs: readonly WaContact[];
  /** conversa aberta neste celular (null = lista) */
  aberta: string | null;
  aoAbrir: (conversaId: string | null) => void;
  agora: number;
  nomeAtendente: string;
  zoom: number;
  aoAbrirNoAtenvo: (conversaId: string) => void;
  aoAmpliar: (url: string, nome: string) => void;
}) {
  const conversa = aberta ? convs.find((c) => c.id === aberta) ?? null : null;
  const outras = useMemo(
    () => convs.filter((c) => c.id !== aberta && !c.arquivada && c.unread > 0).length,
    [convs, aberta],
  );
  return (
    <div className="zp-tel" style={{ zoom }}>
      <span className="zp-bt zp-bt-acao" aria-hidden />
      <span className="zp-bt zp-bt-vol1" aria-hidden />
      <span className="zp-bt zp-bt-vol2" aria-hidden />
      <span className="zp-bt zp-bt-lig" aria-hidden />
      <div className="zp-moldura">
        <div className={conversa ? 'zp-tela zp-tela-conv' : 'zp-tela'}>
          <div className="zp-status" aria-hidden>
            <span className="zp-status-h">{horaSP(agora)}</span>
            <span className="zp-status-ic"><IcSinal /><IcWifi /><IcBateria /></span>
          </div>
          <span className="zp-ilha" aria-hidden />
          <div className="zp-app">
            <ZapLista convs={convs} agora={agora} aoAbrir={(id) => aoAbrir(id)} />
            {conversa && (
              <div className="zp-empurra" key={conversa.id}>
                <ZapConversa conversa={conversa} nomeAtendente={nomeAtendente} agora={agora} outrasNaoLidas={outras}
                  aoVoltar={() => aoAbrir(null)} aoAbrirNoAtenvo={aoAbrirNoAtenvo} aoAmpliar={aoAmpliar} />
              </div>
            )}
          </div>
          <span className="zp-home" aria-hidden />
        </div>
      </div>
    </div>
  );
}
