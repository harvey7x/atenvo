/* "Mídia, documentos e links" do cliente (dono 25/11, pedido a partir do sistema que a Reviza usava antes:
   "quando tu abre o perfil da pessoa aparece as mídias também, os documentos" — o mesmo do WhatsApp).
   Resumo no painel de dados + tela própria dentro do painel, com abas. Tudo vem do histórico da conversa
   aberta (lib/midiasConversa); a URL de cada arquivo é assinada sob demanda, como na bolha. */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { urlAssinadaMidiaWa, urlDownloadMidiaWa } from '@/data/whatsapp';
import { nomeArquivoMidia } from '@/data/midiaNome';
import type { WaMessage } from '@/data/whatsappDemo';
import { AudioBolha, Ic, IcDoc } from './BolhaWa';
import { ModalV2 } from './ModalV2';
import { BotaoSec } from './Botao';
import './midiasContato.css';
import { agruparPorMes, dataCurta, extensaoDe, tamanhoLegivel, urlAbrivel, type AbaMidia, type ItemLink, type ItemMidia, type MidiasDaConversa } from '../lib/midiasConversa';

const IcVolta = () => <Ic><path d="m15 18-6-6 6-6" /></Ic>;
const IcSeta = () => <Ic><path d="m9 6 6 6-6 6" /></Ic>;
const IcBaixar = () => <Ic><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></Ic>;
const IcIrConversa = () => <Ic><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Ic>;
const IcLink = () => <Ic><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ic>;
const IcPlayCheio = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>;

/** `aba` = nome curto da aba (cabe nos 266px do painel); `conta` = como aparece no resumo ("2 documentos") */
export const ABAS_MIDIA: { id: AbaMidia; aba: string; conta: [string, string] }[] = [
  { id: 'fotos', aba: 'Mídia', conta: ['foto ou vídeo', 'fotos e vídeos'] },
  { id: 'documentos', aba: 'Docs', conta: ['documento', 'documentos'] },
  { id: 'audios', aba: 'Áudios', conta: ['áudio', 'áudios'] },
  { id: 'links', aba: 'Links', conta: ['link', 'links'] },
];
const DEMO_SEM_ARQUIVO = 'Na demonstração este arquivo não abre.';

/** URL que mostra o arquivo: local (recém-enviado / demonstração), pública do robô, ou assinada (10 min) */
function useUrlMidia(m: WaMessage, demo: boolean) {
  const direta = m.localUrl ?? (m.anexoPath ? null : m.midiaUrl ?? null);
  const q = useQuery({
    queryKey: ['wa-midia-url', m.anexoPath ?? ''],
    enabled: !direta && !demo && !!m.anexoPath,
    staleTime: 8 * 60_000, gcTime: 9 * 60_000, retry: 1,
    queryFn: () => urlAssinadaMidiaWa(m.anexoPath!),
  });
  return { url: direta ?? q.data ?? null, carregando: !direta && q.isLoading, erro: q.isError };
}
async function urlParaAbrir(m: WaMessage, demo: boolean): Promise<string | null> {
  if (m.localUrl?.startsWith('data:')) return URL.createObjectURL(await (await fetch(m.localUrl)).blob()); // o Chrome não abre data: em aba nova
  if (m.localUrl) return m.localUrl;
  if (!m.anexoPath) return m.midiaUrl ?? null;
  if (demo) return null;
  return urlAssinadaMidiaWa(m.anexoPath);
}

function Miniatura({ it, demo, aoAbrir, grande }: { it: ItemMidia; demo: boolean; aoAbrir: (it: ItemMidia, url: string | null) => void; grande?: boolean }) {
  const { url, carregando, erro } = useUrlMidia(it.m, demo);
  const video = it.m.tipo === 'video';
  const rotulo = (video ? 'Abrir vídeo' : 'Abrir foto') + (it.ts > 1e10 ? ' de ' + dataCurta(it.ts) : '');
  return (
    <button type="button" className={'mdc-mini' + (grande ? ' g' : '') + (carregando ? ' carregando' : '') + (erro ? ' erro' : '')} title={rotulo} aria-label={rotulo} onClick={() => aoAbrir(it, url)}>
      {url && !video && <img src={url} alt="" loading="lazy" draggable={false} />}
      {url && video && <video src={url} muted preload="metadata" playsInline />}
      {!url && !carregando && <span className="sem">{video ? 'Vídeo' : 'Foto'}</span>}
      {video && <span className="play" aria-hidden><IcPlayCheio /></span>}
    </button>
  );
}

/** bloco do painel de dados: contagem + as últimas fotos (ou os últimos documentos) */
export function MidiasResumo({ midias, demo, aoAbrirAba, aoAbrirFoto }: {
  midias: MidiasDaConversa; demo: boolean; aoAbrirAba: (a: AbaMidia) => void; aoAbrirFoto: (it: ItemMidia, url: string | null) => void;
}) {
  const primeiraAba: AbaMidia = midias.fotos.length ? 'fotos' : midias.documentos.length ? 'documentos' : midias.audios.length ? 'audios' : 'links';
  return (
    <div className="ctx-b spot mdc-resumo" data-midias-resumo>
      <button type="button" className="mdc-cab" onClick={() => aoAbrirAba(primeiraAba)} disabled={midias.total === 0}>
        <span className="ctx-t">Mídia, documentos e links</span>
        <span className="n num">{midias.total}</span>
        {midias.total > 0 && <IcSeta />}
      </button>
      {midias.total === 0 && <div className="mdc-vazio">Nenhuma foto, documento ou link nesta conversa ainda.</div>}
      {midias.fotos.length > 0 && (
        <div className="mdc-tira">
          {midias.fotos.slice(0, 4).map((it) => <Miniatura key={it.chave} it={it} demo={demo} aoAbrir={aoAbrirFoto} />)}
        </div>
      )}
      {midias.total > 0 && (
        <div className="mdc-contas">
          {ABAS_MIDIA.map((a) => {
            const n = midias[a.id].length;
            return n > 0 ? <button key={a.id} type="button" className="mdc-conta" onClick={() => aoAbrirAba(a.id)}><b className="num">{n}</b> {a.conta[n === 1 ? 0 : 1]}</button> : null;
          })}
        </div>
      )}
    </div>
  );
}

function LinhaDoc({ it, demo, aoIr }: { it: ItemMidia; demo: boolean; aoIr: (id: string) => void }) {
  const m = it.m;
  const [aviso, setAviso] = useState<string | null>(null);
  const nome = m.nome || m.pdf?.name || 'Documento';
  const meta = [extensaoDe(m), tamanhoLegivel(m.tamanho) || m.pdf?.meta, dataCurta(it.ts)].filter(Boolean).join(' · ');
  const temArquivo = !!(m.localUrl || m.anexoPath || m.midiaUrl);
  const abrir = async () => {
    setAviso(null);
    try {
      const u = await urlParaAbrir(m, demo);
      if (!u) { setAviso(demo ? DEMO_SEM_ARQUIVO : 'Este documento não tem arquivo para abrir.'); return; }
      window.open(u, '_blank', 'noopener');
    } catch { setAviso('Não deu para abrir agora. Tente de novo.'); }
  };
  const baixar = async () => {
    setAviso(null);
    if (demo || !m.anexoPath) { if (m.localUrl) { const a = document.createElement('a'); a.href = m.localUrl; a.download = nome; a.click(); } else setAviso(demo ? DEMO_SEM_ARQUIVO : 'Este documento não tem arquivo para baixar.'); return; }
    try {
      const u = await urlDownloadMidiaWa(m.anexoPath, nomeArquivoMidia(m));
      const a = document.createElement('a'); a.href = u; a.download = nomeArquivoMidia(m); a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { setAviso('Não deu para baixar agora. Tente de novo.'); }
  };
  return (
    <li className="mdc-doc">
      <button type="button" className="mdc-doc-abrir" onClick={abrir} title={temArquivo ? 'Abrir ' + nome : nome}>
        <span className="ic"><IcDoc /><i>{extensaoDe(m)}</i></span>
        <span className="inf"><span className="nm">{nome}</span><span className="mt num">{meta}{m.dir === 'out' ? ' · enviado' : ''}</span></span>
      </button>
      <span className="acoes">
        <button type="button" className="ib" title="Baixar" aria-label={'Baixar ' + nome} onClick={baixar}><IcBaixar /></button>
        {m.id && <button type="button" className="ib" title="Ver na conversa" aria-label="Ver na conversa" onClick={() => aoIr(m.id!)}><IcIrConversa /></button>}
      </span>
      {aviso && <span className="mdc-aviso" role="status">{aviso}</span>}
    </li>
  );
}

function LinhaAudio({ it, demo, aoIr }: { it: ItemMidia; demo: boolean; aoIr: (id: string) => void }) {
  const m = it.m;
  return (
    <li className="mdc-aud">
      <div className="topo">
        <span className="quem">{m.dir === 'out' ? 'Enviado' : 'Recebido'}<span className="num"> · {dataCurta(it.ts) || m.time}</span></span>
        {m.id && <button type="button" className="ib" title="Ver na conversa" aria-label="Ver na conversa" onClick={() => aoIr(m.id!)}><IcIrConversa /></button>}
      </div>
      <AudioBolha anexoPath={m.anexoPath ?? null} localUrl={m.localUrl} segundos={(m as { seconds?: number | null }).seconds ?? null} demo={demo} />
      {m.transcricao && <p className="tr">“{m.transcricao}”</p>}
    </li>
  );
}

function LinhaLink({ it, aoIr }: { it: ItemLink; aoIr: (id: string) => void }) {
  return (
    <li className="mdc-lnk">
      <a href={urlAbrivel(it.url)} target="_blank" rel="noopener noreferrer" className="abrir">
        <span className="ic"><IcLink /></span>
        <span className="inf"><span className="nm">{it.dominio}</span><span className="mt">{it.url}</span></span>
      </a>
      {it.m.id && <button type="button" className="ib" title="Ver na conversa" aria-label="Ver na conversa" onClick={() => aoIr(it.m.id!)}><IcIrConversa /></button>}
    </li>
  );
}

/** a tela "Mídia, documentos e links" no lugar do painel (como no WhatsApp) */
export function MidiasPainel({ midias, demo, aba, aoTrocarAba, aoVoltar, aoAbrirFoto, aoIrParaMensagem }: {
  midias: MidiasDaConversa; demo: boolean; aba: AbaMidia; aoTrocarAba: (a: AbaMidia) => void; aoVoltar: () => void;
  aoAbrirFoto: (it: ItemMidia, url: string | null) => void; aoIrParaMensagem: (id: string) => void;
}) {
  const grupos = useMemo(() => agruparPorMes<ItemMidia | ItemLink>(midias[aba] as (ItemMidia | ItemLink)[]), [midias, aba]);
  const abasRef = useRef<HTMLDivElement>(null);
  const vazio: Record<AbaMidia, string> = {
    fotos: 'Nenhuma foto ou vídeo nesta conversa.', documentos: 'Nenhum documento nesta conversa.',
    audios: 'Nenhum áudio nesta conversa.', links: 'Nenhum link nesta conversa.',
  };
  return (
    <div className="mdc-painel" data-midias-painel>
      <div className="mdc-p-topo">
        <button type="button" className="ib2" title="Voltar para os dados" aria-label="Voltar para os dados" onClick={aoVoltar}><IcVolta /></button>
        <b>Mídia, documentos e links</b>
      </div>
      <div className="mdc-abas" role="tablist" ref={abasRef} aria-label="Tipo de arquivo">
        {ABAS_MIDIA.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'on' : ''} onClick={() => aoTrocarAba(a.id)}>
            {a.aba}<span className="num">{midias[a.id].length}</span>
          </button>
        ))}
      </div>
      <div className="mdc-corpo" role="tabpanel">
        {grupos.length === 0 && <div className="mdc-vazio">{vazio[aba]}</div>}
        {grupos.map((g) => (
          <section key={g.rotulo} className="mdc-grupo">
            <h4>{g.rotulo}</h4>
            {aba === 'fotos' && <div className="mdc-grade">{(g.itens as ItemMidia[]).map((it) => <Miniatura key={it.chave} it={it} demo={demo} aoAbrir={aoAbrirFoto} grande />)}</div>}
            {aba === 'documentos' && <ul className="mdc-lista">{(g.itens as ItemMidia[]).map((it) => <LinhaDoc key={it.chave} it={it} demo={demo} aoIr={aoIrParaMensagem} />)}</ul>}
            {aba === 'audios' && <ul className="mdc-lista">{(g.itens as ItemMidia[]).map((it) => <LinhaAudio key={it.chave} it={it} demo={demo} aoIr={aoIrParaMensagem} />)}</ul>}
            {aba === 'links' && <ul className="mdc-lista">{(g.itens as ItemLink[]).map((it) => <LinhaLink key={it.chave} it={it} aoIr={aoIrParaMensagem} />)}</ul>}
          </section>
        ))}
      </div>
    </div>
  );
}

/** vídeo aberto em tamanho grande (a foto usa o visualizador do atendimento) */
export function VideoAberto({ url, nome, aoFechar, aoIrParaMensagem }: { url: string | null; nome?: string; aoFechar: () => void; aoIrParaMensagem?: () => void }) {
  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo={nome || 'Vídeo'} largura={720}
      rodape={aoIrParaMensagem ? <BotaoSec onClick={aoIrParaMensagem}>Ver na conversa</BotaoSec> : undefined}>
      {url ? <video className="mdc-video" src={url} controls autoPlay playsInline /> : <p className="mdc-vazio">{DEMO_SEM_ARQUIVO}</p>}
    </ModalV2>
  );
}
