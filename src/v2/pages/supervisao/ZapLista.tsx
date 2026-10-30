import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { WaContact, WaMessage } from '@/data/whatsappDemo';
import { esperaDesde } from '@/data/supervisao';
import { previewUltimaMensagem } from '@/lib/conversaEtiquetas';
import { IcBot } from '../../components/BolhaWa';
import { FotoCliente } from '../../components';
import {
  corDe, iniciaisDe, mmss, nomeAgenda, rotuloHoraLista, Tiques,
  IcAbaAtualizacoes, IcAbaComunidades, IcAbaConfig, IcAbaConversas, IcAbaLigacoes, IcArquivo, IcBusca, IcCamera,
  IcContatoMini, IcDocMini, IcFixada, IcFotoMini, IcMais, IcMic, IcReticencias, IcVideoMini, IcVoltar,
} from './zapUi';

/* ------------------------------------------------------------------
   Lista de conversas do WhatsApp do iPhone: título grande, busca,
   filtros (Tudo · Não lidas · Favoritas), "Arquivadas" no topo e a
   barra de abas. Bolinha verde = conversa com mensagem do cliente
   esperando resposta (número = não lidas no Atenvo).
   ------------------------------------------------------------------ */

type Filtro = 'tudo' | 'naolidas' | 'favoritas';
const POR_VEZ = 30;

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

function ultimaReal(c: WaContact): WaMessage | undefined {
  for (let i = c.msgs.length - 1; i >= 0; i--) {
    const m = c.msgs[i];
    if (m.tipo !== 'sistema' && m.tipo !== 'nota_interna') return m;
  }
  return undefined;
}

/** Tem novidade para o atendente: não lidas no Atenvo ou cliente esperando resposta. */
export function temNovidade(c: WaContact, agora: number): boolean {
  return c.unread > 0 || !!esperaDesde(c, agora, true);
}

function Previa({ c }: { c: WaContact }) {
  const m = ultimaReal(c);
  if (!m) return <span className="zp-prev"><span className="zp-prev-t">{c.last}</span></span>;
  const saida = m.dir === 'out';
  const seg = (m as WaMessage & { seconds?: number | null }).seconds ?? null;
  const texto = previewUltimaMensagem({ tipo: m.tipo, texto: m.text, seconds: seg });
  let ic: ReactNode = null;
  let tx = texto;
  if (m.contato) { ic = <IcContatoMini />; tx = m.contato.nome; }
  else if (m.tipo === 'audio') { ic = <IcMic />; tx = seg ? mmss(seg) : c.last.match(/\d+:\d{2}/)?.[0] ?? 'Mensagem de voz'; }
  else if (m.tipo === 'imagem') { ic = <IcFotoMini />; tx = m.text?.trim() ? texto : 'Foto'; }
  else if (m.tipo === 'video') { ic = <IcVideoMini />; tx = m.text?.trim() ? texto : 'Vídeo'; }
  else if (m.tipo === 'documento') { ic = <IcDocMini />; tx = m.nome || 'Documento'; }
  return (
    <span className="zp-prev">
      {saida && <Tiques status={m.status} />}
      {m.origemBot && <span className="zp-prev-ia" title="Mensagem do Matheo (IA)"><IcBot /></span>}
      {ic && <span className={m.tipo === 'audio' && !saida ? 'zp-prev-ic zp-prev-ic-verde' : 'zp-prev-ic'}>{ic}</span>}
      <span className="zp-prev-t">{tx}</span>
    </span>
  );
}

function Linha({ c, agora, aoAbrir }: { c: WaContact; agora: number; aoAbrir: (id: string) => void }) {
  const nome = nomeAgenda(c.name, c.phone);
  const ini = iniciaisDe(nome);
  const novidade = temNovidade(c, agora);
  return (
    <button type="button" className="zp-linha" onClick={() => aoAbrir(c.id)}>
      <span className="zp-av" style={{ background: ini ? corDe(c.id) : undefined }} aria-hidden>{ini || <IcContatoMini />}<FotoCliente nome={nome} id={c.contatoId ?? c.id} tam={54} /></span>
      <span className="zp-linha-tx">
        <span className="zp-l1">
          <b>{nome}</b>
          <time className={novidade ? 'zp-hora zp-hora-on' : 'zp-hora'}>{rotuloHoraLista(c.lastAtMs ?? 0, agora)}</time>
        </span>
        <span className="zp-l2">
          <Previa c={c} />
          <span className="zp-l2-dir">
            {c.fixada && <span className="zp-fix" title="Fixada"><IcFixada /></span>}
            {c.unread > 0 ? <span className="zp-badge">{c.unread > 99 ? '99+' : c.unread}</span>
              : novidade ? <span className="zp-badge zp-badge-ponto" title="Cliente esperando resposta" /> : null}
          </span>
        </span>
      </span>
    </button>
  );
}

export function ZapLista({ convs, agora, aoAbrir }: { convs: readonly WaContact[]; agora: number; aoAbrir: (id: string) => void }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [limite, setLimite] = useState(POR_VEZ);
  useEffect(() => { setLimite(POR_VEZ); }, [busca, filtro, verArquivadas]);

  const daVez = useMemo(() => convs.filter((c) => !!c.arquivada === verArquivadas), [convs, verArquivadas]);
  const nArquivadas = useMemo(() => convs.filter((c) => c.arquivada).length, [convs]);
  const nNovidade = useMemo(() => daVez.filter((c) => temNovidade(c, agora)).length, [daVez, agora]);
  // a aba "Conversas" conta as conversas fora do arquivo, em qualquer vista (como no aparelho)
  const nAba = useMemo(() => convs.filter((c) => !c.arquivada && temNovidade(c, agora)).length, [convs, agora]);
  const visiveis = useMemo(() => {
    const t = sem(busca.trim());
    const dig = busca.replace(/\D/g, '');
    return daVez.filter((c) => (filtro === 'tudo' || (filtro === 'naolidas' ? temNovidade(c, agora) : !!c.fixada))
      && (!t || sem(nomeAgenda(c.name, c.phone)).includes(t) || (dig.length >= 3 && c.phone.includes(dig))));
  }, [daVez, filtro, busca, agora]);

  const FILTROS: { v: Filtro; r: string; n?: number }[] = [
    { v: 'tudo', r: 'Tudo' },
    { v: 'naolidas', r: 'Não lidas', n: nNovidade },
    { v: 'favoritas', r: 'Favoritas' },
  ];

  return (
    <div className="zp-lista">
      <div className="zp-lista-cab">
        {verArquivadas ? (
          <div className="zp-acoes">
            <button type="button" className="zp-link" onClick={() => setVerArquivadas(false)}><IcVoltar />Conversas</button>
          </div>
        ) : (
          <div className="zp-acoes" aria-hidden>
            <span className="zp-circ"><IcReticencias /></span>
            <span className="zp-acoes-dir"><span className="zp-ic-solto"><IcCamera /></span><span className="zp-novo"><IcMais /></span></span>
          </div>
        )}
        <h1 className="zp-titulo">{verArquivadas ? 'Arquivadas' : 'Conversas'}</h1>
        <label className="zp-busca">
          <IcBusca />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar" aria-label="Pesquisar conversas" />
        </label>
        {!verArquivadas && (
          <div className="zp-filtros" role="radiogroup" aria-label="Filtro de conversas">
            {FILTROS.map((f) => (
              <button key={f.v} type="button" role="radio" aria-checked={filtro === f.v}
                className={filtro === f.v ? 'zp-chip zp-chip-on' : 'zp-chip'} onClick={() => setFiltro(f.v)}>
                {f.r}{f.n ? <span className="zp-chip-n">{f.n}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="zp-lista-rol"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (limite < visiveis.length && el.scrollHeight - el.scrollTop - el.clientHeight < 400) setLimite((l) => l + POR_VEZ);
        }}>
        {!verArquivadas && nArquivadas > 0 && filtro === 'tudo' && !busca && (
          <button type="button" className="zp-arq" onClick={() => setVerArquivadas(true)}>
            <span className="zp-arq-ic"><IcArquivo /></span>
            <span className="zp-arq-t">Arquivadas</span>
            <span className="zp-arq-n">{nArquivadas}</span>
          </button>
        )}
        {visiveis.slice(0, limite).map((c) => <Linha key={c.id} c={c} agora={agora} aoAbrir={aoAbrir} />)}
        {!visiveis.length && (
          <div className="zp-vazio">
            {busca ? 'Nenhuma conversa encontrada.' : filtro === 'naolidas' ? 'Nenhuma conversa esperando resposta.' : filtro === 'favoritas' ? 'Nenhuma conversa fixada.' : 'Nenhuma conversa nesta carteira.'}
          </div>
        )}
        {visiveis.length > 0 && limite >= visiveis.length && (
          <div className="zp-fim-lista">{visiveis.length} {visiveis.length === 1 ? 'conversa' : 'conversas'}</div>
        )}
      </div>

      <nav className="zp-abas" aria-hidden>
        <span className="zp-aba"><IcAbaAtualizacoes /><i>Atualizações</i></span>
        <span className="zp-aba"><IcAbaLigacoes /><i>Ligações</i></span>
        <span className="zp-aba"><IcAbaComunidades /><i>Comunidades</i></span>
        <span className="zp-aba zp-aba-on"><IcAbaConversas />{nAba > 0 && <b className="zp-aba-n">{nAba > 99 ? '99+' : nAba}</b>}<i>Conversas</i></span>
        <span className="zp-aba"><IcAbaConfig /><i>Configurações</i></span>
      </nav>
    </div>
  );
}
