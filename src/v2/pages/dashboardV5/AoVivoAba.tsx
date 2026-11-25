import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initials } from '@/lib/avatar';
import {
  AO_VIVO_REAL, agruparAoVivo, previewAoVivo, primeiroNome, quandoAoVivo, resumoAoVivo, rotuloCanal,
  type ColunaAoVivo, type ConversaAoVivo, type DashAoVivo, type ModoAoVivo,
} from '@/data/aoVivo';
import { fmtInt } from '@/data/dashboardV5.formato';
import { CardVidro, FotoCliente, Segmentado, Skeleton, Toggle } from '../../components';
import { Ajuda, Secao, Vazio } from './comum';
import './aoVivoAba.css';

/* Aba AO VIVO do Dashboard (dono 25/11, do sistema que a Reviza usava antes: "as conversas abertas, por usuário").
   Um quadro: uma coluna por atendente (ou por equipe, ou por etiqueta), um cartão por conversa aberta com o cliente,
   a última mensagem, por qual número, quando, se o cliente está esperando resposta e se a IA está atendendo.
   As colunas rolam para o lado dentro do quadro (a página nunca) e cada coluna rola para baixo. Clicar no cartão
   abre a conversa no WhatsApp. Atualiza sozinho a cada 30 s (o "Atualizar" do topo também). Não depende do período.
   Dados: @/data/aoVivo (demo = mesma forma). Laranja só sólido; o "esperando" é o âmbar do tema, sólido. */

const AJ = {
  geral: 'Todas as conversas do WhatsApp que estão abertas agora (não arquivadas e não encerradas), das mais recentes para as mais antigas. "Esperando" = a última mensagem é do cliente: ninguém respondeu depois, nem a IA. "IA" = a atendente virtual está atendendo a conversa.',
  modo: 'Atendentes: uma coluna por pessoa, pelo responsável da conversa. Equipes: pela equipe do responsável (ou, sem responsável, pela equipe dona do número). Etiquetas: uma coluna por etiqueta; a conversa com duas etiquetas aparece nas duas.',
};
const MODOS: { valor: ModoAoVivo; rotulo: string }[] = [
  { valor: 'atendentes', rotulo: 'Atendentes' }, { valor: 'equipes', rotulo: 'Equipes' }, { valor: 'etiquetas', rotulo: 'Etiquetas' },
];
const POR_MODO: Record<ModoAoVivo, string> = { atendentes: 'por atendente', equipes: 'por equipe', etiquetas: 'por etiqueta' };
/** cartões desenhados por coluna antes do "Mostrar mais" (2000 cartões de uma vez pesam no navegador) */
const PRIMEIROS = 30;
const MAIS = 50;

/* o jeito de agrupar fica lembrado neste navegador (só conveniência: sem ele, Atendentes) */
const GUARDA = 'reviza-ao-vivo-modo';
const lerModo = (): ModoAoVivo => {
  try { const v = localStorage.getItem(GUARDA); return v === 'equipes' || v === 'etiquetas' ? v : 'atendentes'; } catch { return 'atendentes'; }
};
const guardarModo = (m: ModoAoVivo) => { try { localStorage.setItem(GUARDA, m); } catch { /* navegador sem guarda */ } };

const plural = (n: number, um: string, varios: string) => `${fmtInt(n)} ${n === 1 ? um : varios}`;

export function AoVivoAba({ d }: { d: DashAoVivo }) {
  const ir = useNavigate();
  const idBusca = useId();
  const [modo, setModoRaw] = useState<ModoAoVivo>(lerModo);
  const setModo = (m: ModoAoVivo) => { setModoRaw(m); guardarModo(m); };
  const [soEsperando, setSoEsperando] = useState(false);
  const [busca, setBusca] = useState('');
  const colunas = useMemo(() => agruparAoVivo(d, modo, { soEsperando, busca }), [d, modo, soEsperando, busca]);
  const resumo = useMemo(() => resumoAoVivo(d), [d]);
  const canais = useMemo(() => new Map(d.canais.map((c) => [c.id, c])), [d.canais]);
  const pessoas = useMemo(() => new Map(d.atendentes.map((p) => [p.id, p.nome])), [d.atendentes]);
  const agora = new Date(d.geradoEm);
  const abrir = (id: string) => ir(`/whatsapp?conversa=${encodeURIComponent(id)}`);
  const filtrando = soEsperando || busca.trim() !== '';
  const naTela = filtrando ? new Set(colunas.flatMap((c) => c.conversas.map((x) => x.id))).size : null;

  return (
    <div className="av-aba" data-aba-aovivo>
      <Secao
        className="av-sec"
        titulo="Conversas abertas agora"
        ajuda={AJ.geral}
        sub={<>
          <b>{plural(resumo.abertas, 'conversa aberta', 'conversas abertas')}</b>, {POR_MODO[modo]}
          <span className="av-sep" aria-hidden>·</span>{plural(resumo.esperando, 'esperando resposta', 'esperando resposta')}
          <span className="av-sep" aria-hidden>·</span>{plural(resumo.comIa, 'com a IA', 'com a IA')}
        </>}
        acao={
          <div className="av-modo">
            <Segmentado<ModoAoVivo> opcoes={MODOS} valor={modo} aoMudar={setModo} rotulo="Agrupar as conversas por" />
            <Ajuda texto={AJ.modo} rotulo="Atendentes, Equipes e Etiquetas" />
          </div>
        }
      >
        <div className="av-ferr">
          <label className="av-tgl">
            <Toggle ligado={soEsperando} aoMudar={setSoEsperando} rotulo="Só esperando resposta" />
            <span aria-hidden>Só esperando resposta</span>
          </label>
          <div className="av-busca">
            <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.6 10.6 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <label htmlFor={idBusca} className="d5-sr">Buscar cliente pelo nome</label>
            <input id={idBusca} className="inp" type="search" value={busca} placeholder="Buscar cliente pelo nome" autoComplete="off"
              onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setBusca(''); }} />
          </div>
          {naTela != null && <span className="av-achados" role="status">{plural(naTela, 'conversa na tela', 'conversas na tela')}</span>}
        </div>

        {d.conversas.length < d.total && (
          <p className="av-nota">Mostrando as {fmtInt(d.conversas.length)} conversas com movimento mais recente, de {fmtInt(d.total)} abertas.</p>
        )}
        {modo === 'equipes' && d.equipes.length === 0 && (
          <p className="av-nota">Nenhuma equipe cadastrada ainda. As equipes são criadas em Configurações › Equipes.</p>
        )}

        {d.conversas.length === 0 ? (
          <Vazio texto="Nenhuma conversa aberta agora." detalhe="Quando um cliente mandar mensagem, ele aparece aqui." />
        ) : colunas.length === 0 ? (
          <Vazio texto={`Nenhum cliente com "${busca.trim()}" no nome entre as conversas abertas.`} detalhe="Confira a grafia ou apague a busca." />
        ) : (
          <div className="av-quadro" role="group" aria-label={`Conversas abertas, ${POR_MODO[modo]}`}>
            {colunas.map((c) => (
              <Coluna key={`${modo}-${c.chave}`} col={c} modo={modo} agora={agora} abrir={abrir}
                rotuloNumero={(id) => rotuloCanal(id ? canais.get(id) : null)}
                nomeAtendente={(id) => (id ? primeiroNome(pessoas.get(id)) || 'Atendente' : null)} />
            ))}
          </div>
        )}
      </Secao>
    </div>
  );
}

function Coluna({ col, modo, agora, abrir, rotuloNumero, nomeAtendente }: {
  col: ColunaAoVivo; modo: ModoAoVivo; agora: Date; abrir: (id: string) => void;
  rotuloNumero: (id: string | null) => string; nomeAtendente: (id: string | null) => string | null;
}) {
  const idTit = useId();
  const [ate, setAte] = useState(PRIMEIROS);
  const n = col.conversas.length;
  const vistas = col.conversas.slice(0, ate);
  return (
    <section className={'av-col' + (col.sem ? ' sem' : '')} aria-labelledby={idTit}>
      <header className="av-col-cab">
        <h4 className="av-col-tit" id={idTit}>
          {col.cor && <i className="av-cor" style={{ background: col.cor }} aria-hidden />}
          <span className="av-col-nome" title={col.titulo}>{col.titulo}</span>
        </h4>
        <span className="av-col-n num">{fmtInt(n)}<span className="d5-sr"> {n === 1 ? 'conversa' : 'conversas'}</span></span>
        {col.esperando > 0 && <span className="av-col-esp">{fmtInt(col.esperando)} esperando</span>}
      </header>
      <div className="av-col-corpo">
        {n === 0 ? (
          <p className="av-col-vazia">{col.sem && modo === 'atendentes' ? 'Todas as conversas têm atendente' : 'Nenhuma conversa'}</p>
        ) : (
          <ul className="av-cartoes">
            {vistas.map((c) => (
              <li key={c.id}>
                <Cartao c={c} agora={agora} abrir={abrir} numero={rotuloNumero(c.canalId)}
                  quem={modo === 'atendentes' ? null : (nomeAtendente(c.atendenteId) ?? 'Sem atendente')} />
              </li>
            ))}
          </ul>
        )}
        {n > ate && (
          <button type="button" className="av-mais" onClick={() => setAte((x) => x + MAIS)}>
            Mostrar mais {fmtInt(Math.min(MAIS, n - ate))} <span>de {fmtInt(n - ate)}</span>
          </button>
        )}
      </div>
    </section>
  );
}

function Cartao({ c, agora, abrir, numero, quem }: {
  c: ConversaAoVivo; agora: Date; abrir: (id: string) => void; numero: string; quem: string | null;
}) {
  const prev = previewAoVivo(c.ultimaMsg, c.ultimaTipo);
  const quando = quandoAoVivo(c.ultimaEm, agora);
  return (
    <button type="button" className={'av-cartao' + (c.esperando ? ' esp' : '')} onClick={() => abrir(c.id)}>
      <Foto c={c} />
      <span className="av-meio">
        <span className="av-l1">
          <b className="av-nome">{c.contato}</b>
          {quando && <time className="av-hora num" dateTime={c.ultimaEm ?? undefined}>{quando}</time>}
        </span>
        <span className={'av-prev' + (prev ? '' : ' vazio')} title={prev || undefined}>
          {c.ultimaDirecao === 'saida' && prev && (
            <svg className="av-resp" viewBox="0 0 16 16" aria-label="Respondida:" role="img"><path d="M3 8.5 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
          {prev || 'Sem mensagens ainda'}
        </span>
        <span className="av-l3">
          <span className="av-num" title={`Número: ${numero}`}>{numero}</span>
          {quem && <span className="av-quem">{quem}</span>}
          <span className="av-marcas">
            {c.iaAtiva && <span className="av-ia" title="A IA está atendendo esta conversa">IA</span>}
            {c.esperando && <span className="av-esp"><i aria-hidden />esperando</span>}
          </span>
        </span>
      </span>
    </button>
  );
}

function Foto({ c }: { c: ConversaAoVivo }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className="av-foto" aria-hidden>
      {initials(c.contato) || '·'}
      {c.fotoUrl && !falhou ? (
        <img className="foto-cli" src={c.fotoUrl} alt="" width={34} height={34} loading="lazy" decoding="async"
          draggable={false} referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
      ) : !AO_VIVO_REAL && c.contatoId ? <FotoCliente nome={c.contato} id={c.contatoId} tam={34} /> : null}
    </span>
  );
}

export function AoVivoAbaSkeleton() {
  return (
    <CardVidro className="d5-sec av-sec" aria-hidden>
      <div className="av-sk-cab"><Skeleton largura={220} altura={16} /><Skeleton largura={260} altura={30} raio={9} /></div>
      <div className="av-quadro av-sk">
        {[0, 1, 2, 3].map((i) => (
          <div className="av-col" key={i}>
            <div className="av-col-cab"><Skeleton largura={110} altura={12} /></div>
            <div className="av-col-corpo">
              {[0, 1, 2, 3, 4].slice(0, 5 - i).map((k) => <Skeleton key={k} altura={64} raio={10} style={{ marginBottom: 8 }} />)}
            </div>
          </div>
        ))}
      </div>
    </CardVidro>
  );
}
