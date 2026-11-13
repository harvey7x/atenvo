import { useCallback, useEffect, useRef, useState } from 'react';
import { melhorarImagem, sugerirModo, type ModoImagem } from '../lib/imagemMelhor';
import { pedirMelhoriaIa, situacaoIa, urlImagemIa, type RegistroIa, type SituacaoIa } from '@/data/midiaIa';
import { urlAssinadaMidiaWa, urlDownloadMidiaWa } from '@/data/whatsapp';
import { Segmentado } from './Segmentado';
import './componentes.css';

/* Visualizador (lightbox) de imagem da conversa.
   Abre SEMPRE a imagem como o cliente mandou. "Melhorar qualidade" mostra ANTES × DEPOIS lado a lado;
   o atendente decide qual baixar. Três ajustes:
     · Documento / Foto — no navegador, na hora, sem custo (só luz, cor e nitidez);
     · Com IA — Gemini imagem + conferência (ver midia-melhorar-ia): UMA vez por cliente, só conta se
       a conferência aprovar; fica salva no cliente (reabrir não custa de novo).
   O ORIGINAL nunca é alterado.
   O link da foto que vem da bolha é assinado e VENCE EM 10 MIN (a conversa costuma ficar aberta mais
   que isso). Vencido, o servidor responde um erro em JSON — e o "Baixar" salvava esse erro como
   "<id>.json" ("O site não está disponível" no Chrome, 13/11). Por isso, com o caminho do anexo, o
   visualizador pede link novo ao abrir e o "Baixar" pede outro na hora do clique. */

type Ajuste = Exclude<ModoImagem, 'original'> | 'ia';
type Versao = { url: string; blob: Blob };

function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a'); const u = URL.createObjectURL(blob);
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}
/** Baixa direto do link de download (o servidor manda como arquivo, já com o nome) — o mesmo caminho do
    "Baixar" do documento e do ícone da bolha. */
function baixarLink(href: string, nome: string) {
  const a = document.createElement('a');
  a.href = href; a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
/** Lê a imagem para baixar. Resposta de erro do servidor (link vencido = JSON) NUNCA vira arquivo. */
export async function blobDaImagem(u: string): Promise<Blob> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const tipo = blob.type.toLowerCase();
  if (tipo && !tipo.startsWith('image/') && !tipo.startsWith('application/octet-stream')) throw new Error(`não é imagem: ${tipo}`);
  return blob;
}
/** Extensão pelo tipo da imagem ("image/jpeg;charset=…" → jpg); sem tipo de imagem, a do nome. */
export function extDaImagem(blob: Blob, nome?: string): string {
  const sub = /^image\/([a-z0-9.+-]+)/i.exec(blob.type)?.[1]?.toLowerCase();
  if (sub) return sub === 'jpeg' ? 'jpg' : sub.split('+')[0];
  return /\.([a-z0-9]{2,5})$/i.exec(nome ?? '')?.[1]?.toLowerCase() ?? 'jpg';
}
/** O que o "Baixar" do original faz (fora do componente, para o teste). Com anexo: link de download NOVO,
    pedido agora (vale 60 s), nunca o da tela, que pode ter vencido. Sem anexo (ou sem link novo): a foto da
    tela, só se o servidor devolver imagem. */
export async function baixarOriginalImagem(
  o: { anexoPath?: string | null; nome: string; url: string; base: string },
  saida: { link: (href: string, nome: string) => void; blob: (b: Blob, nome: string) => void } = { link: baixarLink, blob: baixarBlob },
): Promise<void> {
  if (o.anexoPath) {
    try { saida.link(await urlDownloadMidiaWa(o.anexoPath, o.nome), o.nome); return; }
    catch { /* sem link novo: tenta com a foto da tela, abaixo */ }
  }
  const blob = await blobDaImagem(o.url);
  saida.blob(blob, `${o.base}.${extDaImagem(blob, o.nome)}`);
}
const ERRO_BAIXAR = 'Não deu pra baixar agora. Tente de novo.';
/** Registro da IA desta imagem: o que ocupa a vaga do cliente, se for esta; senão o desta. Sem situação
    (carregando) ou sem mensagem (foto do robô, do Painel da Equipe, recém-enviada) = nenhum. Antes, sem
    mensagem, `undefined === undefined` fazia ler `null.ocupada` e a tela inteira caía (13/11). */
export function registroIaDaImagem(sit: SituacaoIa | null, mensagemId?: string): RegistroIa | null {
  if (!sit || !mensagemId) return null;
  return sit.ocupada?.mensagem_id === mensagemId ? sit.ocupada : sit.desta ?? null;
}
const dataCurta = (iso: string) => { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; } };

export function VisualizadorImagem({ url: urlRecebida, nome, mensagemId, contatoId, anexoPath, aoFechar }: {
  url: string; nome?: string;
  /** id da mensagem + cliente: habilitam "Com IA" (bolha otimista sem id não tem). */
  mensagemId?: string; contatoId?: string | null;
  /** caminho do anexo no bucket privado (script-midia): com ele o link é renovado (ver o topo). Fora do demo. */
  anexoPath?: string | null;
  aoFechar: () => void;
}) {
  const podeIa = !!mensagemId && !!contatoId;
  const [comparando, setComparando] = useState(false);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);      // null até a sugestão automática chegar
  const [versoes, setVersoes] = useState<Partial<Record<Exclude<Ajuste, 'ia'>, Versao>>>({});
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [erroBaixar, setErroBaixar] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);
  const base = (nome || 'imagem').replace(/\.[a-z0-9]+$/i, '');
  const nomeOriginal = nome || anexoPath?.split('/').pop() || 'imagem.jpg';

  // link novo ao abrir: a foto da tela, o "Salvar imagem como…" e o "Melhorar qualidade" usam ele.
  // Até chegar, segue o que veio (a foto já está na memória do navegador; a troca não pisca). Renova a
  // cada 9 min: o atendente costuma deixar a foto aberta enquanto copia os dados para outro sistema.
  const [urlNova, setUrlNova] = useState<string | null>(null);
  useEffect(() => {
    setUrlNova(null);
    if (!anexoPath) return;
    let vivo = true;
    const renovar = () => { urlAssinadaMidiaWa(anexoPath).then((u) => { if (vivo) setUrlNova(u); }).catch(() => { /* segue com o último link */ }); };
    renovar();
    const t = setInterval(renovar, 9 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [anexoPath]);
  const url = urlNova ?? urlRecebida;

  // ---- IA ----
  const [sitIa, setSitIa] = useState<SituacaoIa | null>(null);
  const [urlIa, setUrlIa] = useState<string | null>(null);
  const [pedindoIa, setPedindoIa] = useState(false);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const regIa = registroIaDaImagem(sitIa, mensagemId);
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
    if (baixando) return;
    setBaixando(true); setErroBaixar(null);
    try {
      await baixarOriginalImagem({ anexoPath, nome: nomeOriginal, url, base });
    } catch (e) {
      // link público sem CORS (não vence): abre em outra aba para salvar dali; o resto avisa na tela
      if (!anexoPath && e instanceof TypeError) window.open(url, '_blank', 'noopener');
      else setErroBaixar(ERRO_BAIXAR);
    } finally { setBaixando(false); }
  }
  async function baixarMelhorada() {
    setErroBaixar(null);
    if (ajuste === 'ia') {
      if (!regIa || regIa.status !== 'aprovada' || baixando) return;
      setBaixando(true);
      try {
        const blob = await blobDaImagem(await urlImagemIa(regIa));   // link novo na hora (o da tela vence em 10 min)
        baixarBlob(blob, `${base}_melhorada_ia.${blob.type.includes('png') ? 'png' : 'jpg'}`);
      } catch { setErroBaixar(ERRO_BAIXAR); }
      finally { setBaixando(false); }
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
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal} disabled={baixando}>Baixar</button>
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
        {erroBaixar && <span className="vimg-erro vimg-erro-baixar" role="alert">{erroBaixar}</span>}
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
            <button type="button" className="p-btn btn-sec btn-mini" onClick={baixarOriginal} disabled={baixando}>Baixar original</button>
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
              <button type="button" className="p-btn btn-pri btn-mini" onClick={baixarMelhorada} disabled={!podeBaixar || baixando}>Baixar melhorada</button>
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
