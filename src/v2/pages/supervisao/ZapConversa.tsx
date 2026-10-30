import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { useMensagensSupervisao } from '@/data/supervisao';
import { ZapBolha } from './ZapBolha';
import {
  corDe, diaSP, fmtHa, iniciaisDe, nomeAgenda, rotuloDiaFio, tomEspera,
  IcAbrir, IcCadeado, IcCamera, IcFigurinha, IcFone, IcMais, IcVideo, IcVoltar,
} from './zapUi';

/* ------------------------------------------------------------------
   Tela da conversa no celular (WhatsApp do iPhone): cabeçalho com o
   cliente, o fio com separador de dia, a marca "Aguardando resposta"
   onde o atendente parou e, no lugar da caixa de texto, o aviso de
   somente leitura com o atalho para abrir a conversa no Atenvo.
   ------------------------------------------------------------------ */

type Item =
  | { k: 'dia'; id: string; rotulo: string }
  | { k: 'espera'; id: string; desde: number }
  | { k: 'evento'; id: string; m: WaMessage }
  | { k: 'msg'; id: string; m: WaMessage; nova: boolean; cauda: boolean };

const ehEvento = (m: WaMessage) => m.tipo === 'sistema' || m.tipo === 'nota_interna';
const msDe = (m: WaMessage) => (m.tsISO ? Date.parse(m.tsISO) : 0);

/** O fio pronto para desenhar: separadores de dia, a marca de espera e, em cada sequência do mesmo
 *  lado, o respiro antes da 1ª bolha e a cauda na ÚLTIMA (desenho do WhatsApp do iPhone). */
function montarFio(msgs: readonly WaMessage[], aguardando: boolean, agora: number): { itens: Item[]; esperaDesde: number | null } {
  // onde o cliente começou a esperar: 1ª mensagem do cliente depois da última resposta
  let inicioEspera = -1;
  if (aguardando) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (ehEvento(m)) continue;
      if (m.dir === 'in') inicioEspera = i; else break;
    }
  }
  const out: Item[] = [];
  let diaAnt = '';
  let ladoAnt: string | null = null;
  msgs.forEach((m, i) => {
    const ms = msDe(m);
    const dia = ms ? diaSP(ms) : m.dataISO ?? '';
    if (dia && dia !== diaAnt) {
      out.push({ k: 'dia', id: `dia-${dia}`, rotulo: rotuloDiaFio(dia, agora) });
      diaAnt = dia;
      ladoAnt = null;
    }
    if (i === inicioEspera) { out.push({ k: 'espera', id: `espera-${m.id ?? i}`, desde: ms }); ladoAnt = null; }
    if (ehEvento(m)) { out.push({ k: 'evento', id: m.id ?? `ev-${i}`, m }); ladoAnt = null; return; }
    out.push({ k: 'msg', id: m.id ?? m.cid ?? `m-${i}`, m, nova: ladoAnt !== m.dir, cauda: true });
    ladoAnt = m.dir;
  });
  // a cauda fica só na última bolha de cada sequência
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    if (a.k === 'msg' && b.k === 'msg' && !b.nova) a.cauda = false;
  }
  const espera = out.find((it): it is Extract<Item, { k: 'espera' }> => it.k === 'espera');
  return { itens: out, esperaDesde: espera?.desde || null };
}

export function ZapConversa({ conversa, nomeAtendente, agora, outrasNaoLidas, aoVoltar, aoAbrirNoAtenvo, aoAmpliar }: {
  conversa: WaContact;
  nomeAtendente: string;
  agora: number;
  /** conversas com mensagem nova além desta (o número ao lado da seta de voltar) */
  outrasNaoLidas: number;
  aoVoltar: () => void;
  aoAbrirNoAtenvo: (conversaId: string) => void;
  aoAmpliar: (url: string, nome: string) => void;
}) {
  const { msgs, carregando, erro } = useMensagensSupervisao(conversa.id);
  // a lista já traz a última mensagem: enquanto o histórico chega, o fio mostra o que tem
  const fio = msgs ?? conversa.msgs;
  const nome = nomeAgenda(conversa.name, conversa.phone);
  const { itens, esperaDesde } = useMemo(() => montarFio(fio, !!conversa.aguardando, agora), [fio, conversa.aguardando, agora]);

  // rola para o fim ao abrir e quando chega mensagem nova com o fio já no fim (como o WhatsApp)
  const rolagem = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const convAnt = useRef<string | null>(null);
  const qtd = fio.length;
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    if (convAnt.current !== conversa.id) { convAnt.current = conversa.id; noFim.current = true; }
    if (noFim.current) el.scrollTop = el.scrollHeight;
  }, [qtd, conversa.id]);
  // foto que termina de carregar depois cresce o fio: segue no fim se o fio estava no fim
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const aoCarregar = () => { if (noFim.current) el.scrollTop = el.scrollHeight; };
    el.addEventListener('load', aoCarregar, true);
    return () => el.removeEventListener('load', aoCarregar, true);
  }, []);

  // a espera começa na 1ª mensagem do cliente sem resposta (a mesma da faixa no fio)
  const desde = esperaDesde ?? (conversa.aguardandoDesde ? Date.parse(conversa.aguardandoDesde) : 0);
  const sub = conversa.iaAtiva
    ? { txt: 'Matheo (IA) atendendo', cls: 'zp-sub-ia' }
    : conversa.aguardando && desde
      ? { txt: `Aguardando resposta ${fmtHa(desde, agora)}`, cls: `zp-sub-${tomEspera(desde, agora)}` }
      : { txt: [conversa.etapa, conversa.canalAtual].filter(Boolean).join(' · ') || 'toque para dados do contato', cls: '' };

  return (
    <div className="zp-conv">
      <header className="zp-conv-topo">
        <button type="button" className="zp-voltar" onClick={aoVoltar} aria-label="Voltar para as conversas">
          <IcVoltar />{outrasNaoLidas > 0 && <span className="zp-voltar-n">{outrasNaoLidas}</span>}
        </button>
        <span className="zp-av zp-av-p" style={{ background: corDe(conversa.id) }} aria-hidden>{iniciaisDe(nome) || '#'}</span>
        <span className="zp-conv-quem">
          <b>{nome}</b>
          <span className={sub.cls || undefined}>{sub.txt}</span>
        </span>
        <span className="zp-conv-icones" aria-hidden><IcVideo /><IcFone /></span>
      </header>

      <div className="zp-fio" ref={rolagem}
        onScroll={(e) => { const el = e.currentTarget; noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        <div className="zp-aviso-sup"><IcCadeado />Modo supervisão: você acompanha esta conversa sem interferir. Nada é enviado nem marcado como lido.</div>
        {carregando && !msgs && <div className="zp-evento"><span>Carregando conversa…</span></div>}
        {erro && <div className="zp-evento"><span>Não foi possível carregar o histórico. {erro}</span></div>}
        {itens.map((it) => {
          if (it.k === 'dia') return <div key={it.id} className="zp-dia"><span>{it.rotulo}</span></div>;
          if (it.k === 'espera') {
            return (
              <div key={it.id} className={`zp-espera zp-espera-${tomEspera(it.desde, agora)}`}>
                <span>Aguardando resposta {fmtHa(it.desde, agora)}</span>
              </div>
            );
          }
          if (it.k === 'evento') {
            const nota = it.m.tipo === 'nota_interna';
            return (
              <div key={it.id} className={nota ? 'zp-evento zp-nota' : 'zp-evento'}>
                <span>{nota && <b>Nota interna</b>}{it.m.text}</span>
              </div>
            );
          }
          return (
            <div key={it.id} className={`zp-linha-b ${it.m.dir === 'out' ? 'zp-lb-out' : 'zp-lb-in'}${it.nova ? ' zp-lb-nova' : ''}`}>
              <ZapBolha m={it.m} cauda={it.cauda} nomeAtendente={nomeAtendente} nomeCliente={nome} aoAmpliar={aoAmpliar} />
            </div>
          );
        })}
      </div>

      <footer className="zp-conv-pe">
        <span className="zp-pe-ic" aria-hidden><IcMais /></span>
        <span className="zp-pe-campo">
          <IcCadeado w={13} />
          <span>Somente leitura</span>
          <span className="zp-pe-fig" aria-hidden><IcFigurinha /></span>
        </span>
        <span className="zp-pe-ic" aria-hidden><IcCamera /></span>
        <button type="button" className="zp-pe-abrir" onClick={() => aoAbrirNoAtenvo(conversa.id)} title="Abrir esta conversa no WhatsApp do Atenvo" aria-label="Abrir esta conversa no WhatsApp do Atenvo">
          <IcAbrir />
        </button>
      </footer>
    </div>
  );
}
