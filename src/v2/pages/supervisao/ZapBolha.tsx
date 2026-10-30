import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { urlAssinadaMidiaWa } from '@/data/whatsapp';
import { nomeArquivoMidia } from '@/data/midiaNome';
import type { WaMessage } from '@/data/whatsappDemo';
import { IcBot, WaTexto } from '../../components/BolhaWa';
import { corDe, iniciaisDe, mmss, ondaDe, telefoneBonito, IcBaixar, IcContatoMini, IcMic, IcPausa, IcPlay, Tiques } from './zapUi';

/* ------------------------------------------------------------------
   Bolha do WhatsApp dentro do celular do Painel da Equipe: texto com hora
   e tiques no canto, áudio com onda e velocidade, foto, vídeo,
   documento, contato e mensagem citada — o desenho do WhatsApp do
   iPhone. Somente leitura: nada aqui envia, apaga ou marca como lido.
   Mídia: na demo vem de `localUrl`; no real a URL assinada é pedida
   como no inbox (foto/vídeo ao montar; áudio só no play).
   ------------------------------------------------------------------ */

type MsgSeg = WaMessage & { seconds?: number | null };

/** Um áudio por vez no sistema todo (como no WhatsApp): tocar um pausa o outro. */
let audioTocando: HTMLAudioElement | null = null;

function ZapAudio({ m, saida, autor }: { m: MsgSeg; saida: boolean; autor: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState<number>(m.seconds ?? 0);
  const [vel, setVel] = useState(1);
  const [ouvido, setOuvido] = useState(false);
  const barras = useMemo(() => ondaDe(m.id ?? m.tsISO ?? 'audio'), [m.id, m.tsISO]);
  // mídia do fluxo do robô não tem anexo no bucket privado: toca da URL pública (como no inbox)
  const urlPublica = m.anexoPath ? null : m.midiaUrl ?? null;
  const temFonte = !!(m.localUrl || m.anexoPath || urlPublica);

  useEffect(() => () => {
    const a = ref.current;
    if (a) { a.pause(); if (audioTocando === a) audioTocando = null; }
  }, []);

  async function alternar() {
    if (tocando) { ref.current?.pause(); return; }
    let a = ref.current;
    if (!a) {
      let src = m.localUrl ?? urlPublica;
      if (!src && m.anexoPath) {
        setCarregando(true);
        try { src = await urlAssinadaMidiaWa(m.anexoPath); } catch { setErro(true); } finally { setCarregando(false); }
      }
      if (!src) return;
      const novo = new Audio(src);
      novo.preload = 'auto';
      novo.addEventListener('timeupdate', () => setPos(novo.currentTime));
      novo.addEventListener('loadedmetadata', () => { if (Number.isFinite(novo.duration)) setDur(novo.duration); });
      novo.addEventListener('play', () => setTocando(true));
      novo.addEventListener('pause', () => setTocando(false));
      novo.addEventListener('ended', () => { setTocando(false); setPos(0); });
      novo.addEventListener('error', () => { setErro(true); setTocando(false); });
      ref.current = a = novo;
    }
    if (audioTocando && audioTocando !== a) audioTocando.pause();
    audioTocando = a;
    a.playbackRate = vel;
    setOuvido(true);
    a.play().catch(() => setTocando(false));
  }

  function buscar(e: MouseEvent<HTMLDivElement>) {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = p * dur;
    setPos(p * dur);
  }

  const prog = dur > 0 ? Math.min(1, pos / dur) : 0;
  const ativo = tocando || pos > 0;
  // microfone: entrada = verde até alguém ouvir (aqui ou no inbox não dá para saber — só nesta tela);
  // saída = azul quando o cliente já leu, cinza antes
  const micTom = saida ? (m.status === 'lida' ? 'zp-mic-azul' : 'zp-mic-cinza') : (ouvido ? 'zp-mic-azul' : 'zp-mic-verde');
  const indisponivel = erro || !temFonte || !!m.midiaPendente;

  return (
    <div className="zp-audio">
      <button type="button" className="zp-audio-play" onClick={() => void alternar()} disabled={carregando || indisponivel}
        aria-label={indisponivel ? 'Áudio indisponível' : tocando ? 'Pausar' : 'Ouvir o áudio'}>
        {carregando ? <span className="zp-giro" aria-hidden /> : tocando ? <IcPausa /> : <IcPlay />}
      </button>
      <div className="zp-audio-meio">
        <div className="zp-onda" onClick={buscar} aria-hidden>
          {barras.map((h, i) => (
            <i key={i} className={ativo && (i + 0.5) / barras.length <= prog ? 'zp-onda-on' : undefined} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
          <span className="zp-onda-ponto" style={{ left: `${prog * 100}%` }} />
        </div>
        <span className="zp-audio-dur">{indisponivel ? 'Áudio indisponível' : ativo ? mmss(pos) : dur ? mmss(dur) : ''}</span>
      </div>
      {ativo ? (
        <button type="button" className="zp-audio-vel" onClick={() => {
          const nx = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1;
          setVel(nx);
          if (ref.current) ref.current.playbackRate = nx;
        }} aria-label="Velocidade do áudio">{String(vel).replace('.', ',')}×</button>
      ) : (
        <span className="zp-audio-av" style={{ background: corDe(autor) }} aria-hidden>
          {iniciaisDe(autor)}
          <i className={`zp-audio-mic ${micTom}`}><IcMic w={12} /></i>
        </span>
      )}
    </div>
  );
}

export interface BolhaProps {
  m: WaMessage;
  /** primeira bolha de uma sequência do mesmo lado: ganha a "cauda" */
  cauda: boolean;
  /** quem fala de cada lado (avatar do áudio e nome da citação) */
  nomeAtendente: string;
  nomeCliente: string;
  aoAmpliar: (url: string, nome: string) => void;
}

export function ZapBolha({ m, cauda, nomeAtendente, nomeCliente, aoAmpliar }: BolhaProps) {
  const saida = m.dir === 'out';
  const tipo = m.tipo || 'texto';
  const [urlAssinada, setUrlAssinada] = useState<string | null>(null);
  const [semUrl, setSemUrl] = useState(false);
  const precisaUrl = !m.localUrl && !!m.anexoPath && (tipo === 'imagem' || tipo === 'video');
  useEffect(() => {
    if (!precisaUrl || !m.anexoPath) return;
    let vivo = true;
    urlAssinadaMidiaWa(m.anexoPath).then((u) => { if (vivo) setUrlAssinada(u); }).catch(() => { if (vivo) setSemUrl(true); });
    return () => { vivo = false; };
  }, [precisaUrl, m.anexoPath]);
  // foto/vídeo do fluxo do robô vêm só com a URL pública (sem anexo no bucket privado) — mesma regra do inbox
  const url = m.localUrl ?? urlAssinada ?? (m.anexoPath ? null : m.midiaUrl ?? null);

  const hora = <span className="zp-hh">{m.time}{saida && <Tiques status={m.status} />}</span>;
  const midia = tipo === 'imagem' || tipo === 'video';
  const legenda = m.text && !m.contato ? m.text : '';
  const cls = ['zp-b', saida ? 'zp-b-out' : 'zp-b-in', cauda ? 'zp-cauda' : '', midia ? 'zp-b-midia' : '',
    tipo === 'audio' ? 'zp-b-audio' : '', m.status === 'falhou' && saida ? 'zp-b-falha' : ''].filter(Boolean).join(' ');

  async function abrirDocumento() {
    if (!m.anexoPath) return;
    try { window.open(await urlAssinadaMidiaWa(m.anexoPath), '_blank', 'noopener'); } catch { /* bucket privado pode negar: nada a fazer aqui */ }
  }

  return (
    <div className={cls} title={m.status === 'falhou' && saida ? 'Mensagem não entregue' : undefined}>
      {m.origemBot && <span className="zp-remet"><IcBot />Matheo · IA</span>}
      {m.quoted && (
        <div className={m.quoted.remetente === 'Você' || (!m.quoted.remetente && !saida) ? 'zp-cit zp-cit-eu' : 'zp-cit'}>
          <b>{m.quoted.remetente || (saida ? 'Você' : nomeCliente)}</b>
          <span>{m.quoted.texto || (m.quoted.tipo === 'audio' ? 'Mensagem de voz' : m.quoted.tipo === 'imagem' ? 'Foto' : m.quoted.tipo === 'video' ? 'Vídeo' : 'Documento')}</span>
        </div>
      )}

      {tipo === 'imagem' && (
        <button type="button" className="zp-img" onClick={() => url && aoAmpliar(url, nomeArquivoMidia(m))} disabled={!url} aria-label="Ampliar a foto">
          {url ? <img src={url} alt="" loading="lazy" /> : <span className="zp-img-vazia">{semUrl || !m.anexoPath ? 'Foto indisponível' : 'Carregando foto…'}</span>}
          {!legenda && <span className="zp-hh zp-hh-sobre">{m.time}{saida && <Tiques status={m.status} />}</span>}
        </button>
      )}
      {tipo === 'video' && (
        <div className="zp-img">
          {url ? <video src={url} controls preload="metadata" /> : <span className="zp-img-vazia">{semUrl || !m.anexoPath ? 'Vídeo indisponível' : 'Carregando vídeo…'}</span>}
        </div>
      )}
      {tipo === 'audio' && <ZapAudio m={m} saida={saida} autor={saida ? nomeAtendente : nomeCliente} />}
      {tipo === 'documento' && (
        <button type="button" className="zp-doc" onClick={() => void abrirDocumento()} disabled={!m.anexoPath} aria-label={`Abrir ${m.nome || 'documento'}`}>
          <span className={/\.pdf$/i.test(m.nome ?? '') || m.mime === 'application/pdf' ? 'zp-doc-ic zp-doc-pdf' : 'zp-doc-ic'} aria-hidden>
            {(m.nome?.includes('.') ? m.nome.split('.').pop()! : 'doc').slice(0, 4).toUpperCase()}
          </span>
          <span className="zp-doc-tx">
            <span className="zp-doc-nm">{m.nome || 'Documento'}</span>
            <span className="zp-doc-mt">{(m.nome?.includes('.') ? m.nome.split('.').pop()! : 'arquivo').toUpperCase()}{m.tamanho ? ` · ${m.tamanho < 1_048_576 ? Math.max(1, Math.round(m.tamanho / 1024)) + ' kB' : (m.tamanho / 1_048_576).toFixed(1).replace('.', ',') + ' MB'}` : ''}</span>
          </span>
          {m.anexoPath && <span className="zp-doc-dl" aria-hidden><IcBaixar /></span>}
        </button>
      )}
      {m.contato && (
        <div className="zp-ct">
          <span className="zp-ct-linha">
            <span className="zp-ct-av" aria-hidden><IcContatoMini /></span>
            <span className="zp-ct-nm">{m.contato.nome}<small>{telefoneBonito(m.contato.telefone)}</small></span>
          </span>
          <span className="zp-ct-acao">Conversar</span>
        </div>
      )}
      {m.pdf && (
        <div className="zp-doc">
          <span className="zp-doc-ic zp-doc-pdf" aria-hidden>PDF</span>
          <span className="zp-doc-tx"><span className="zp-doc-nm">{m.pdf.name}</span><span className="zp-doc-mt">{m.pdf.meta}</span></span>
        </div>
      )}

      {legenda && tipo !== 'documento' && (
        <div className="zp-txt"><WaTexto texto={legenda} /><span className={saida ? 'zp-folga zp-folga-out' : 'zp-folga'} aria-hidden /></div>
      )}
      {m.transcricao && <div className="zp-transc"><b>Transcrição</b>{m.transcricao}</div>}
      {!(tipo === 'imagem' && !legenda) && hora}
    </div>
  );
}
