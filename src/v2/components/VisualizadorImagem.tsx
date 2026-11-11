import { useCallback, useEffect, useRef, useState } from 'react';
import { melhorarImagem, sugerirModo, type ModoImagem } from '../lib/imagemMelhor';
import { pedirMelhoriaIa, situacaoIa, urlImagemIa, type RegistroIa, type SituacaoIa } from '@/data/midiaIa';
import { Segmentado } from './Segmentado';
import './componentes.css';

/* Visualizador (lightbox) de imagem da conversa.
   Abre SEMPRE a imagem como o cliente mandou. "Melhorar qualidade" mostra ANTES × DEPOIS lado a lado;
   o atendente decide qual baixar. Três ajustes:
     · Documento / Foto — no navegador, na hora, sem custo (só luz, cor e nitidez);
     · Com IA — Gemini imagem + conferência (ver midia-melhorar-ia): UMA vez por cliente, só conta se
       a conferência aprovar; fica salva no cliente (reabrir não custa de novo).
   O ORIGINAL nunca é alterado. */

type Ajuste = Exclude<ModoImagem, 'original'> | 'ia';
type Versao = { url: string; blob: Blob };

function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a'); const u = URL.createObjectURL(blob);
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
const dataCurta = (iso: string) => { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; } };

export function VisualizadorImagem({ url, nome, mensagemId, contatoId, aoFechar }: {
  url: string; nome?: string;
  /** id da mensagem + cliente: habilitam "Com IA" (bolha otimista sem id não tem). */
  mensagemId?: string; contatoId?: string | null;
  aoFechar: () => void;
}) {
  const podeIa = !!mensagemId && !!contatoId;
  const [comparando, setComparando] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);      // null até a sugestão automática chegar
  const [versoes, setVersoes] = useState<Partial<Record<Exclude<Ajuste, 'ia'>, Versao>>>({});
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const base = (nome || 'imagem').replace(/\.[a-z0-9]+$/i, '');

  // ---- IA ----
  const [sitIa, setSitIa] = useState<SituacaoIa | null>(null);
  const [urlIa, setUrlIa] = useState<string | null>(null);
  const [pedindoIa, setPedindoIa] = useState(false);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const regIa: RegistroIa | null = sitIa?.ocupada?.mensagem_id === mensagemId ? sitIa!.ocupada : sitIa?.desta ?? null;
  const usadaEmOutra = !!sitIa?.ocupada && sitIa.ocupada.mensagem_id !== mensagemId;

  const atualizarIa = useCallback(async () => {
    if (!podeIa) return;
    try { setSitIa(await situacaoIa(contatoId!, mensagemId!)); } catch { /* mantém o último estado */ }
  }, [podeIa, contatoId, mensagemId]);

  useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [aoFechar]);

  useEffect(() => { void atualizarIa(); }, [atualizarIa]);
  // acompanha enquanto a IA trabalha (a função roda em 2º plano no servidor)
  useEffect(() => {
    if (regIa?.status !== 'processando') return;
    const t = setInterval(() => { void atualizarIa(); }, 4000);
    return () => clearInterval(t);
  }, [regIa?.status, atualizarIa]);
  useEffect(() => {
    if (regIa?.status !== 'aprovada') { setUrlIa(null); return; }
    let vivo = true;
    urlImagemIa(regIa).then((u) => { if (vivo) setUrlIa(u); }).catch(() => { if (vivo) setErroIa('Não deu pra abrir a imagem melhorada.'); });
    return () => { vivo = false; };
  }, [regIa?.status, regIa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1º clique em "Melhorar qualidade": se esta imagem já tem IA aprovada, abre nela; senão sugere documento/foto
  useEffect(() => {
    if (!comparando || ajuste) return;
    if (regIa?.status === 'aprovada' || regIa?.status === 'processando') { setAjuste('ia'); return; }
    let vivo = true;
    setProcessando(true);
    sugerirModo(url).then((m) => { if (vivo) setAjuste(m); }).catch(() => { if (vivo) setAjuste('foto'); });
    return () => { vivo = false; };
  }, [comparando, ajuste, url, regIa?.status]);

  useEffect(() => {
    if (!comparando || !ajuste || ajuste === 'ia') { setProcessando(false); return; }
    if (versoes[ajuste]) { setProcessando(false); return; }
    let vivo = true;
    setProcessando(true); setErro(null);
    melhorarImagem(url, ajuste)
      .then(({ blob }) => {
        if (!vivo) return;
        const u = URL.createObjectURL(blob); urlsRef.current.push(u);
        setProcessando(false);
        setVersoes((v) => ({ ...v, [ajuste]: { url: u, blob } }));
      })
      .catch(() => { if (vivo) { setProcessando(false); setErro('Não deu pra melhorar esta imagem.'); } });
    return () => { vivo = false; };
  }, [comparando, ajuste, url, versoes]);

  const melhorada = ajuste && ajuste !== 'ia' ? versoes[ajuste] ?? null : null;

  async function pedirIa() {
    if (!podeIa || pedindoIa) return;
    setPedindoIa(true); setErroIa(null);
    try {
      await pedirMelhoriaIa(contatoId!, mensagemId!, async () => {
        // demo: simula com o ajuste de documento local (sem backend, sem custo)
        // (não entra em urlsRef: o registro da demo sobrevive ao fechar e reabrir o visualizador)
        const { blob } = await melhorarImagem(url, 'documento');
        return URL.createObjectURL(blob);
      });
    } catch (e) { setErroIa((e as Error).message || 'Não deu pra pedir a melhoria agora.'); }
    finally { setPedindoIa(false); void atualizarIa(); }
  }

  async function baixarOriginal() {
    try {
      const blob = await (await fetch(url)).blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      baixarBlob(blob, `${base}.${ext}`);
    } catch { window.open(url, '_blank', 'noopener'); }
  }
  async function baixarMelhorada() {
    if (ajuste === 'ia') {
      if (!urlIa) return;
      try {
        const blob = await (await fetch(urlIa)).blob();
        baixarBlob(blob, `${base}_melhorada_ia.${blob.type.includes('png') ? 'png' : 'jpg'}`);
      } catch { window.open(urlIa, '_blank', 'noopener'); }
      return;
    }
    if (melhorada) baixarBlob(melhorada.blob, `${base}_melhorada.jpg`);
  }

  const div = regIa?.divergencias ?? null;
  const sumidas = div?.palavrasSumidas ?? [];
  const legenda = ajuste === 'ia' ? 'Gemini, conferido número a número' : ajuste === 'documento' ? 'luz corrigida, cores mantidas' : 'brilho, cor e nitidez ajustados';
  const podeBaixar = ajuste === 'ia' ? !!urlIa && regIa?.status === 'aprovada' : !!melhorada && !processando;

  function painelIa() {
    if (!podeIa) return <span className="vimg-status">Disponível só para imagens já recebidas.</span>;
    if (!sitIa) return <span className="vimg-status">Carregando…</span>;
    if (regIa?.status === 'aprovada') return urlIa ? <img src={urlIa} alt="Imagem melhorada com IA" className="vimg-img" /> : <span className="vimg-status">Abrindo…</span>;
    if (regIa?.status === 'processando') {
      return (
        <div className="vimg-ia-cta">
          <span className="vimg-spin" aria-hidden />
          <b>Melhorando com IA…</b>
          <span>Leva de 1 a 3 minutos (gera e confere cada número). Pode fechar: fica salvo no cliente.</span>
        </div>
      );
    }
    if (usadaEmOutra) {
      return (
        <div className="vimg-ia-cta">
          <b>A melhoria com IA deste cliente já foi usada</b>
          <span>Foi em outra imagem{sitIa.ocupada ? `, em ${dataCurta(sitIa.ocupada.criado_em)}` : ''}. Cada cliente tem direito a uma. Use Documento ou Foto nesta.</span>
        </div>
      );
    }
    const n = div?.numeros;
    return (
      <div className="vimg-ia-cta">
        {regIa?.status === 'reprovada' && (
          <div className="vimg-ia-aviso">
            <b>A tentativa anterior foi bloqueada: a IA mudou o conteúdo.</b>
            {n && (n.soNoOriginal.length > 0 || n.soNaMelhorada.length > 0) && <span>Números: {n.soNoOriginal.join(', ') || '—'} → {n.soNaMelhorada.join(', ') || '—'}</span>}
            {(div?.palavrasNovas?.length ?? 0) > 0 && <span>Palavras que apareceram: {div!.palavrasNovas!.join(', ')}</span>}
            <span>Não gastou a vez do cliente.</span>
          </div>
        )}
        {regIa?.status === 'falha' && <div className="vimg-ia-aviso"><b>Não deu certo da última vez.</b><span>{regIa.erro || 'Erro no serviço de IA.'} Não gastou a vez do cliente.</span></div>}
        <b>Melhorar com IA</b>
        <span>Deixa a foto com cara de digitalizada. Depois, cada número e nome é conferido com o original: se algo mudar, a versão é bloqueada.</span>
        <span className="vimg-meta">Uma vez por cliente · só conta se a conferência aprovar · leva de 1 a 3 minutos</span>
        <button type="button" className="p-btn btn-pri btn-mini" onClick={pedirIa} disabled={pedindoIa}>{pedindoIa ? 'Enviando…' : 'Melhorar com IA'}</button>
        {erroIa && <span className="vimg-erro">{erroIa}</span>}
      </div>
    );
  }

  return (
    <div className="veu vimg" role="dialog" aria-modal aria-label="Imagem" style={{ background: 'rgba(5, 6, 9, .97)', backdropFilter: 'none' /* vence o .veu da pele Aurora: foto pede fundo escuro e opaco nos 2 temas (o véu translúcido deixava a conversa aparecer atrás) */ }} onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="vimg-barra" onMouseDown={(e) => e.stopPropagation()}>
        {!comparando ? (
          <>
            <button type="button" className="p-btn btn-pri btn-mini" onClick={() => setComparando(true)} title="Gera uma versão melhorada e mostra lado a lado com a original">Melhorar qualidade</button>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal}>Baixar</button>
          </>
        ) : (
          <>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={() => setComparando(false)}>← Voltar</button>
            {ajuste && (
              <Segmentado<Ajuste>
                rotulo="Tipo de ajuste" valor={ajuste} aoMudar={setAjuste}
                opcoes={[
                  { valor: 'documento', rotulo: 'Documento' },
                  { valor: 'foto', rotulo: 'Foto' },
                  ...(podeIa ? [{ valor: 'ia' as const, rotulo: regIa?.status === 'aprovada' ? 'Com IA ✓' : 'Com IA' }] : []),
                ]}
              />
            )}
          </>
        )}
        <button type="button" className="p-btn btn-mini vimg-x" aria-label="Fechar" onClick={aoFechar}>×</button>
      </div>

      {!comparando ? (
        <div className="vimg-palco" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
          <img src={url} alt="Imagem ampliada" className="vimg-img" />
        </div>
      ) : (
        <div className="vimg-comparar" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
          <figure className="vimg-lado">
            <figcaption>Antes <span>· como o cliente enviou</span></figcaption>
            <div className="vimg-moldura"><img src={url} alt="Imagem original" className="vimg-img" /></div>
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal}>Baixar original</button>
          </figure>
          <figure className="vimg-lado">
            <figcaption>Depois <span>· {legenda}</span></figcaption>
            <div className="vimg-moldura">
              {ajuste === 'ia' ? painelIa() : (
                <>
                  {melhorada && <img src={melhorada.url} alt="Imagem melhorada" className={'vimg-img' + (processando ? ' esmaecida' : '')} />}
                  {processando && <span className="vimg-status">Melhorando…</span>}
                  {erro && !processando && <span className="vimg-status vimg-erro">{erro}</span>}
                </>
              )}
            </div>
            {ajuste === 'ia' && regIa?.status === 'aprovada' && (
              <span className="vimg-ok">
                Conferido: nenhum número ou nome mudou
                {sumidas.length > 0 && <span className="vimg-meta"> · texto apagado pela IA: {sumidas.slice(0, 4).join(', ')}</span>}
              </span>
            )}
            {(ajuste !== 'ia' || regIa?.status === 'aprovada') && (
              <button type="button" className="p-btn btn-pri btn-mini" onClick={baixarMelhorada} disabled={!podeBaixar}>Baixar melhorada</button>
            )}
          </figure>
        </div>
      )}

      <div className="vimg-rodape">
        {comparando
          ? (ajuste === 'ia' ? 'Versão gerada por IA: use para leitura. Para processo, o documento oficial é sempre o original.' : 'Nenhum detalhe é inventado: só realça o que a foto já tem.')
          : 'Imagem como o cliente enviou.'}
        {' '}<span className="vimg-meta">O original fica guardado sem alteração.</span>
      </div>
    </div>
  );
}
