import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { urlAssinadaMidiaWa, urlDownloadMidiaWa } from '@/data/whatsapp';
import { nomeArquivoMidia, rotuloBaixarMidia } from '@/data/midiaNome';
import type { WaMessage } from '@/data/whatsappDemo';
import { traduzErroEnvio } from '@/data/scripts';
import { initials } from '@/lib/avatar';
import { ackOf, fmtTam, mmss, ONDA } from '../lib/waUi';

/* ------------------------------------------------------------------
   Bolha de mensagem do inbox (extraída de src/v2/pages/WhatsApp.tsx,
   verbatim) — compartilhada entre o desktop e as telas mobile.
   Estilos: classes .bolha/.rec/.env2/.audio2/.doc2 etc. continuam em
   src/v2/pages/whatsapp.css (importado pelas duas telas).
   ------------------------------------------------------------------ */

export const Ic = ({ children, fill }: { children: ReactNode; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
export const IcDoc = () => <Ic><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6" /></Ic>;
const IcDownload = () => <Ic><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></Ic>;
const IcTel = () => <Ic><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Ic>;
const IcReply = () => <Ic><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></Ic>;
const IcPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>;
/* Glifo ÚNICO de IA do app — monocromático em currentColor, usado em TODOS os pontos de IA
   (barra de estado, label da mensagem, chip da lista, divisor de handoff): um desenho só = identidade. */
export const IcBot = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="5" y="8" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9.5" cy="13" r="1.3" fill="currentColor" />
    <circle cx="14.5" cy="13" r="1.3" fill="currentColor" />
    <path d="M12 8V4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="4" r="1.5" fill="currentColor" />
  </svg>
);

/* ================================================================
   Bolha de mensagem — .rec/.env2 do mockup com o conteúdo da v1:
   selo do bot (origemBot → "◈ Matheo"), áudio com onda + .transc,
   imagem/vídeo/documento, quoted, ticks, falha, responder.
   ================================================================ */
export function Bolha({ m, demo, nomeCliente, retryId, removendoId, semDestino, optout, aoResponder, aoVerErro, aoRetry, aoRemover, aoLightbox, aoRecarregarAudio }: {
  m: WaMessage; demo: boolean; nomeCliente: string; retryId: string | null; removendoId: string | null; semDestino: boolean; optout: boolean;
  aoResponder: (m: WaMessage) => void; aoVerErro: (m: WaMessage) => void; aoRetry: (m: WaMessage) => void;
  aoRemover: (m: WaMessage) => void; aoLightbox: (url: string) => void; aoRecarregarAudio: (m: WaMessage) => void;
}) {
  const [urlAssinada, setUrlAssinada] = useState<string | null>(null);
  const [urlErro, setUrlErro] = useState(false);
  // bolha otimista carrega a mídia LOCAL (objectURL) — renderiza na hora, sem URL assinada
  // v1: imagem/vídeo resolvem a URL assinada eager; ÁUDIO só no play (AudioBolha) — não emitir N signed-URLs por abertura de conversa
  const precisaUrl = !demo && !m.localUrl && !!m.anexoPath && ['imagem', 'video'].includes(m.tipo ?? '');
  useEffect(() => {
    let vivo = true;
    setUrlAssinada(null); setUrlErro(false);
    if (precisaUrl && m.anexoPath) {
      urlAssinadaMidiaWa(m.anexoPath).then((u) => { if (vivo) setUrlAssinada(u); }).catch(() => { if (vivo) setUrlErro(true); });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.anexoPath, precisaUrl]);
  const url = m.localUrl ?? urlAssinada;
  // enquanto a URL assinada não resolveu (anexo presente) é CARREGANDO, não "indisponível" (v1 não pisca)
  const carregandoMidia = precisaUrl && !url && !urlErro;
  const ack = m.dir === 'out' ? ackOf(m.status) : null;
  const falhou = m.dir === 'out' && m.status === 'falhou';   // só saída falha (v1); inbound nunca é "não enviado"

  // Baixar a mídia recebida/enviada com o nome/extensão corretos (URL assinada curta com Content-Disposition).
  // Ícone sobreposto à imagem/vídeo (canto inf. direito) e ao lado do player de áudio — reusa a lógica do v1.
  async function baixarMidia() {
    if (demo || !m.anexoPath) return;
    const nome = nomeArquivoMidia(m);
    try {
      const u = await urlDownloadMidiaWa(m.anexoPath, nome);
      const a = document.createElement('a');
      a.href = u; a.download = nome; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* falha silenciosa: bucket privado pode negar; o usuário pode tentar de novo */ }
  }
  const btnBaixar = (!demo && m.anexoPath && !falhou) ? (
    <button type="button" className="midia-dl" title={rotuloBaixarMidia(m.tipo)} aria-label={rotuloBaixarMidia(m.tipo)} onClick={baixarMidia}>
      <IcDownload />
    </button>
  ) : null;

  const falhaActs = falhou && (
    <div className="msg-falha-acts">
      <button type="button" className="lnk" onClick={() => aoVerErro(m)}>Ver erro</button>·
      <button type="button" className="lnk" disabled={!m.id || retryId === m.id || semDestino || optout} title={semDestino ? 'Vincule um número confirmado para responder.' : undefined} onClick={() => aoRetry(m)}>
        {retryId === m.id ? 'Reenviando…' : 'Tentar novamente'}
      </button>·
      <button type="button" className="lnk" disabled={!m.id || removendoId === m.id} onClick={() => aoRemover(m)}>{removendoId === m.id ? 'Removendo…' : 'Remover'}</button>
    </div>
  );

  return (
    <div className={'bolha ' + (m.dir === 'out' ? 'env2' : 'rec') + (falhou ? ' falha' : '') + (m.origemBot ? ' bot' : '')}>
      {m.id && !semDestino && (
        <button type="button" className="resp-btn" title="Responder" aria-label="Responder" onClick={() => aoResponder(m)}><IcReply /></button>
      )}
      {/* marca de mensagem AUTOMÁTICA: linha enxuta [glifo] Matheo · IA no lugar da assinatura —
          rolando o fio fica óbvio o que foi o bot vs um humano. Sem caixa; acento na borda da
          bolha via classe .bot (nunca preencher a bolha de cor). */}
      {m.origemBot && <div className="bt-tag ia" title="Mensagem enviada automaticamente pela IA (Matheo). Mensagens sem esta marca foram escritas por uma pessoa."><span className="glifo" aria-hidden><IcBot /></span>Matheo<span className="suf">· IA</span></div>}
      {m.quoted && (
        <div className="mq">
          <div className="rem">{m.quoted.remetente || (m.dir === 'out' ? 'Você' : nomeCliente)}</div>
          <div className="tt">{m.quoted.texto || (m.quoted.tipo === 'audio' ? 'Mensagem de voz' : m.quoted.tipo === 'imagem' ? 'Imagem' : m.quoted.tipo === 'video' ? 'Vídeo' : 'Documento')}</div>
        </div>
      )}
      {m.tipo === 'imagem' && (
        (url || demo)
          ? <>
              {url ? <div className="m-media"><img className="m-img" loading="lazy" src={url} alt="Imagem" title="Ampliar" onClick={() => aoLightbox(url)} />{btnBaixar}</div> : <div className="audio-ind">Imagem de demonstração</div>}
              {m.text && <div className="m-cap"><WaTexto texto={m.text} /></div>}
            </>
          : carregandoMidia ? <div className="audio-ind">Carregando imagem…</div>
          : <div className="audio-ind">Imagem indisponível</div>  /* só quando anexo ausente ou URL falhou — nunca durante a carga */
      )}
      {m.tipo === 'video' && (
        url
          ? <>
              <div className="m-media"><video className="m-video" src={url} controls preload="metadata" />{btnBaixar}</div>
              {m.text && <div className="m-cap"><WaTexto texto={m.text} /></div>}
            </>
          : demo ? <div className="audio-ind">Vídeo de demonstração</div>
          : carregandoMidia ? <div className="audio-ind">Carregando vídeo…</div>
          : <div className="audio-ind">Vídeo indisponível</div>
      )}
      {m.tipo === 'audio' && (
        falhou
          ? <div className="audio-ind">Áudio não enviado</div>  /* saída que falhou não vira player tocável (v1) */
          : m.midiaPendente
          ? <div className="audio-ind">Áudio indisponível — <button type="button" className="lnk" onClick={() => aoRecarregarAudio(m)}>tentar carregar novamente</button></div>
          : <AudioBolha anexoPath={demo ? null : m.anexoPath ?? null} localUrl={m.localUrl ?? null} segundos={(m as WaMessage & { seconds?: number }).seconds ?? null} demo={demo} acaoNode={btnBaixar} />
      )}
      {m.tipo === 'documento' && (
        <div className="doc2">
          <span className="ic"><IcDoc /></span>
          <span className="inf">
            <span className="nm">{m.nome || 'documento'}</span>
            <span className="mt num">{(m.nome?.split('.').pop() || '').toUpperCase() || 'Arquivo'}{m.tamanho ? ' · ' + fmtTam(m.tamanho) : ''}</span>
            {!demo && m.anexoPath && (
              <span className="acts">
                <button type="button" className="lnk" onClick={async () => { const u = await urlDownloadMidiaWa(m.anexoPath!, nomeArquivoMidia(m)); window.location.assign(u); }}>Baixar</button>
                <button type="button" className="lnk" title="Abrir em nova aba" onClick={async () => { const u = await urlAssinadaMidiaWa(m.anexoPath!); window.open(u, '_blank', 'noopener'); }}>Abrir</button>
              </span>
            )}
          </span>
        </div>
      )}
      {m.pdf && (
        <div className="doc2"><span className="ic"><IcDoc /></span><span className="inf"><span className="nm">{m.pdf.name}</span><span className="mt">{m.pdf.meta}</span></span></div>
      )}
      {/* cartão de contato compartilhado: desenha o cartão (o texto "📇 …" é só fallback) */}
      {m.contato && (
        <div className="ct-card">
          <span className="ct-av" aria-hidden>{initials(m.contato.nome)}</span>
          <span className="ct-inf">
            <span className="ct-nm">{m.contato.nome}</span>
            <span className="ct-tel num">+{m.contato.telefone}</span>
          </span>
        </div>
      )}
      {(m.tipo === 'texto' || (!m.tipo && m.text)) && m.text && !m.contato && <WaTexto texto={m.text} />}
      {m.transcricao && <div className="transc">“{m.transcricao}”</div>}
      {falhaActs}
      <div className="hh num">
        {m.viaTelefone && <span className="fone-tag" title="Enviada pelo celular"><IcTel />Enviada pelo celular</span>}
        {m.time}
        {ack && <span className={'tick ' + ack.cls} title={ack.cls === 'falhou' ? traduzErroEnvio(m.erro ?? '') : ack.title}>{ack.s}</span>}
      </div>
    </div>
  );
}

/** *negrito* + links, sem HTML bruto (equivalente ao WhatsAppText do v1). */
export function WaTexto({ texto }: { texto: string }) {
  const partes = useMemo(() => {
    const out: ReactNode[] = [];
    const re = /(\*[^*\s][^*]*[^*\s]\*|\*[^*\s]\*|https?:\/\/\S+|www\.\S+)/g;
    let i = 0, k = 0, m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      if (m.index > i) out.push(texto.slice(i, m.index));
      const t = m[0];
      if (t.startsWith('*')) out.push(<strong key={k++}>{t.slice(1, -1)}</strong>);
      else out.push(<a key={k++} className="wa-link" href={t.startsWith('www.') ? 'https://' + t : t} target="_blank" rel="noopener noreferrer nofollow">{t}</a>);
      i = m.index + t.length;
    }
    if (i < texto.length) out.push(texto.slice(i));
    return out;
  }, [texto]);
  return <span className="wa-fmt">{partes}</span>;
}

/** Player de áudio na pele do mockup (.audio2). A URL assinada é resolvida SÓ no play (v1: preload none),
    para não emitir uma rajada de signed-URLs por abertura de conversa. Bolha otimista
    (recém-gravado) toca direto do objectURL local, sem assinada. */
export function AudioBolha({ anexoPath, localUrl, segundos, demo, acaoNode }: { anexoPath: string | null; localUrl?: string | null; segundos: number | null; demo: boolean; acaoNode?: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pos, setPos] = useState(0);
  const [durS, setDurS] = useState(segundos ?? 0);
  const [rate, setRate] = useState(1);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const montarAudio = (src: string) => {
    const a = new Audio(src);
    a.addEventListener('timeupdate', () => setPos(a.currentTime));
    a.addEventListener('loadedmetadata', () => { if (Number.isFinite(a.duration)) setDurS(a.duration); });
    a.addEventListener('ended', () => { setTocando(false); setPos(0); });
    audioRef.current = a;
    return a;
  };
  const toggle = async () => {
    if (tocando) { audioRef.current?.pause(); setTocando(false); return; }
    let a = audioRef.current;
    if (!a) {
      if (localUrl) a = montarAudio(localUrl);           // bolha otimista: toca o blob local
      else if (demo || !anexoPath) return;               // demo: sem áudio real
      else {
        setCarregando(true);
        try { a = montarAudio(await urlAssinadaMidiaWa(anexoPath)); }   // signed-URL SÓ agora
        catch { setCarregando(false); return; }
        setCarregando(false);
      }
    }
    a.playbackRate = rate;
    a.play().catch(() => setTocando(false));
    setTocando(true);
  };
  const prog = durS > 0 ? pos / durS : 0;
  return (
    <div className="audio2">
      <button type="button" className="play" title={demo ? 'Áudio de demonstração' : carregando ? 'Carregando…' : tocando ? 'Pausar' : 'Reproduzir'} onClick={toggle} disabled={demo || carregando}>
        {tocando ? <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10" aria-hidden><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg> : <IcPlay />}
      </button>
      <div className="onda" onClick={(e) => {
        if (!audioRef.current || durS <= 0) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const p = (e.clientX - r.left) / r.width;
        audioRef.current.currentTime = p * durS;
        setPos(p * durS);
      }}>
        {ONDA.map((h, i) => <i key={i} className={i / ONDA.length <= prog && prog > 0 ? 'done' : ''} style={{ height: h }} />)}
      </div>
      <span className="dur num">{tocando || pos > 0 ? mmss(pos) + ' / ' : ''}{mmss(durS) || '·'}</span>
      <button type="button" className="rate num" title="Velocidade" onClick={() => {
        const nx = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
        setRate(nx);
        if (audioRef.current) audioRef.current.playbackRate = nx;
      }}>{rate}x</button>
      {acaoNode}
    </div>
  );
}
