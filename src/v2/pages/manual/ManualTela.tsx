/* ============================================================================
   Manual de vendas — rota /manual. Ambiente de aprendizagem para os novos
   estagiários: trilha de lições (com teste rápido em cada uma), prova final e
   consulta rápida (checklist do cliente + calculadora de períodos).
   O progresso fica no navegador de cada pessoa (localStorage por usuário).
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { BotaoPrimario, BotaoSec } from '../../components';
import { CHECKLIST, LICOES, MENSAGEM_DOCUMENTOS, NOTA_MINIMA, PROVA } from './licoes';
import { CalculadoraPeriodos } from './ilustracoes';
import { copiar, IcCheck } from './pecas';
import './manual.css';

type Progresso = { feitas: string[]; prova: number | null };
const VAZIO: Progresso = { feitas: [], prova: null };
const chave = (uid?: string) => `atenvo:manual-vendas:v1:${uid ?? 'anon'}`;

function lerProgresso(uid?: string): Progresso {
  try {
    const bruto = localStorage.getItem(chave(uid));
    if (!bruto) return VAZIO;
    const p = JSON.parse(bruto) as Partial<Progresso>;
    return { feitas: Array.isArray(p.feitas) ? p.feitas.filter((x) => typeof x === 'string') : [], prova: typeof p.prova === 'number' ? p.prova : null };
  } catch { return VAZIO; }
}
function salvarProgresso(uid: string | undefined, p: Progresso) {
  try { localStorage.setItem(chave(uid), JSON.stringify(p)); } catch { /* navegador sem armazenamento: segue sem salvar */ }
}

type Vista = string; // id de lição | 'prova' | 'checklist' | 'periodos'
const EXTRAS: Record<string, { titulo: string; resumo: string }> = {
  prova: { titulo: 'Prova final', resumo: `${PROVA.length} perguntas sobre todo o manual. Para passar: ${NOTA_MINIMA} acertos.` },
  checklist: { titulo: 'Checklist do cliente', resumo: 'Tudo o que precisa estar pronto antes de dar entrada, para usar durante o atendimento.' },
  periodos: { titulo: 'Calculadora de períodos', resumo: 'Os 10 períodos do extrato de pagamento do Meu INSS, a partir do mês em que estamos.' },
};

const IcLivro = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15z" /><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A2.5 2.5 0 014 20.5z" /></svg>
);
const IcLista = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2" strokeLinejoin="round" /></svg>
);
const IcCalendario = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
);
const IcTrofeu = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v1.5A3.5 3.5 0 007.5 11M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M12 14v3M8.5 20.5h7M9.5 17h5v3.5h-5z" /></svg>
);

export default function ManualTela() {
  const { user } = useAuth();
  const uid = user?.id;
  const [prog, setProg] = useState<Progresso>(() => lerProgresso(uid));
  useEffect(() => { setProg(lerProgresso(uid)); }, [uid]);
  const atualizar = (p: Progresso) => { setProg(p); salvarProgresso(uid, p); };

  const [params, setParams] = useSearchParams();
  const pedida = params.get('licao');
  const vista: Vista = pedida && (LICOES.some((l) => l.id === pedida) || pedida in EXTRAS) ? pedida : LICOES[0].id;
  const palco = useRef<HTMLDivElement>(null);
  function ir(v: Vista) {
    setParams((p) => { p.set('licao', v); return p; }, { replace: true });
  }
  useEffect(() => { palco.current?.scrollTo({ top: 0 }); }, [vista]);

  const idx = LICOES.findIndex((l) => l.id === vista);
  const licao = idx >= 0 ? LICOES[idx] : null;
  const feitas = new Set(prog.feitas);
  const nFeitas = LICOES.filter((l) => feitas.has(l.id)).length;
  const aprovado = prog.prova !== null && prog.prova >= NOTA_MINIMA;
  const pct = Math.round(((nFeitas + (aprovado ? 1 : 0)) / (LICOES.length + 1)) * 100);

  function concluirESeguir() {
    if (!licao) return;
    if (!feitas.has(licao.id)) atualizar({ ...prog, feitas: [...prog.feitas, licao.id] });
    ir(idx < LICOES.length - 1 ? LICOES[idx + 1].id : 'prova');
  }
  function desmarcar() {
    if (!licao) return;
    atualizar({ ...prog, feitas: prog.feitas.filter((f) => f !== licao.id) });
  }

  const cab = licao ? { titulo: licao.titulo, resumo: licao.resumo } : EXTRAS[vista];

  return (
    <div className="mv">
      <header className="mv-cab">
        <div className="mv-cab-tx">
          <h1>Manual de vendas</h1>
          <p>Tudo o que você precisa para atender, convencer e fechar um processo de juros abusivos.</p>
        </div>
        <div className="mv-cab-prog" aria-label={`Progresso: ${pct}%`}>
          <div><span>Seu progresso</span><b className="num">{pct}%</b></div>
          <div className="mv-barra" aria-hidden><i style={{ width: `${pct}%` }} /></div>
          <small className="num">{nFeitas} de {LICOES.length} lições · prova {aprovado ? 'aprovada' : prog.prova !== null ? `${prog.prova}/${PROVA.length}` : 'pendente'}</small>
        </div>
      </header>

      <div className="mv-corpo">
        <nav className="mv-nav" aria-label="Manual de vendas">
          <span className="mv-nav-tit"><IcLivro />Trilha</span>
          <ol className="mv-nav-grupo">
            {LICOES.map((l, i) => (
              <li key={l.id}>
                <button type="button" className="mv-nav-it" aria-current={vista === l.id ? 'page' : undefined} onClick={() => ir(l.id)}>
                  <span className="mv-nav-n num" data-feita={feitas.has(l.id) ? '' : undefined}>{feitas.has(l.id) ? <IcCheck /> : i + 1}</span>
                  <span className="mv-nav-tx">{l.titulo}<small className="num">{l.minutos} min</small></span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="mv-nav-it" aria-current={vista === 'prova' ? 'page' : undefined} onClick={() => ir('prova')}>
                <span className="mv-nav-n" data-feita={aprovado ? '' : undefined}>{aprovado ? <IcCheck /> : <IcTrofeu />}</span>
                <span className="mv-nav-tx">Prova final<small>{aprovado ? `${prog.prova}/${PROVA.length}` : `${PROVA.length} perguntas`}</small></span>
              </button>
            </li>
          </ol>
          <div className="mv-nav-sep" aria-hidden />
          <span className="mv-nav-tit">Consulta rápida</span>
          <div className="mv-nav-grupo">
            <button type="button" className="mv-nav-it" aria-current={vista === 'checklist' ? 'page' : undefined} onClick={() => ir('checklist')}>
              <span className="mv-nav-n"><IcLista /></span><span className="mv-nav-tx">Checklist do cliente</span>
            </button>
            <button type="button" className="mv-nav-it" aria-current={vista === 'periodos' ? 'page' : undefined} onClick={() => ir('periodos')}>
              <span className="mv-nav-n"><IcCalendario /></span><span className="mv-nav-tx">Calculadora de períodos</span>
            </button>
          </div>
        </nav>

        <div className="mv-palco" ref={palco}>
          <article className="mv-artigo" key={vista}>
            <header className="mv-art-cab">
              <span className="mv-art-tag">
                {licao ? <>Lição {idx + 1} de {LICOES.length} · {licao.minutos} min de leitura</> : vista === 'prova' ? 'Avaliação' : 'Consulta rápida'}
              </span>
              <h2>{cab.titulo}</h2>
              <p>{cab.resumo}</p>
            </header>

            {licao ? licao.corpo
              : vista === 'prova' ? <Prova melhor={prog.prova} aoTerminar={(n) => atualizar({ ...prog, prova: Math.max(n, prog.prova ?? 0) })} />
                : vista === 'checklist' ? <Checklist />
                  : <CalculadoraPeriodos />}

            {licao && (
              <footer className="mv-art-pe">
                <BotaoSec onClick={() => ir(idx > 0 ? LICOES[idx - 1].id : vista)} disabled={idx === 0}>Anterior</BotaoSec>
                <div className="mv-art-pe-dir">
                  {feitas.has(licao.id) && <button type="button" className="mv-link" onClick={desmarcar}>Desmarcar como concluída</button>}
                  <BotaoPrimario onClick={concluirESeguir}>
                    {feitas.has(licao.id) ? 'Próxima' : 'Concluir e seguir'}{idx === LICOES.length - 1 ? ' para a prova' : ''}
                  </BotaoPrimario>
                </div>
              </footer>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- prova */
function Prova({ melhor, aoTerminar }: { melhor: number | null; aoTerminar: (acertos: number) => void }) {
  const [resp, setResp] = useState<Record<number, number>>({});
  const [entregue, setEntregue] = useState(false);
  const respondidas = Object.keys(resp).length;
  const acertos = useMemo(() => PROVA.filter((q, i) => resp[i] === q.c).length, [resp]);
  const passou = acertos >= NOTA_MINIMA;

  function entregar() { setEntregue(true); aoTerminar(acertos); }
  function refazer() { setResp({}); setEntregue(false); }

  return (
    <div className="mv-prova">
      {entregue && (
        <div className="vidro mv-prova-res" data-ok={passou ? '' : undefined} role="status">
          <b className="num">{acertos}/{PROVA.length}</b>
          <div>
            <strong>{passou ? 'Aprovado! Você está pronto para atender.' : 'Ainda não. Revise as lições e tente de novo.'}</strong>
            <span>Confira abaixo a explicação de cada pergunta.</span>
          </div>
          <BotaoSec onClick={refazer}>Refazer a prova</BotaoSec>
        </div>
      )}
      {!entregue && melhor !== null && <p className="mv-prova-melhor num">Sua melhor nota até agora: {melhor}/{PROVA.length}.</p>}
      <ol className="mv-prova-lista">
        {PROVA.map((q, i) => (
          <li key={q.p} className="vidro mv-questao">
            <p className="mv-teste-p"><span className="num">{i + 1}.</span> {q.p}</p>
            <div className="mv-opcoes" role="radiogroup" aria-label={q.p}>
              {q.o.map((o, j) => (
                <button key={o} type="button" role="radio" aria-checked={resp[i] === j} className="mv-opcao" disabled={entregue}
                  data-estado={entregue ? (j === q.c ? 'certa' : resp[i] === j ? 'errada' : 'apagada') : resp[i] === j ? 'marcada' : undefined}
                  onClick={() => setResp((r) => ({ ...r, [i]: j }))}>
                  <span className="mv-opcao-l">{String.fromCharCode(65 + j)}</span>{o}
                </button>
              ))}
            </div>
            {entregue && <p className="mv-teste-r" data-ok={resp[i] === q.c ? '' : undefined}>{q.e}</p>}
          </li>
        ))}
      </ol>
      {!entregue && (
        <div className="mv-prova-pe">
          <span className="num">{respondidas} de {PROVA.length} respondidas</span>
          <BotaoPrimario onClick={entregar} disabled={respondidas < PROVA.length}>Entregar a prova</BotaoPrimario>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- checklist */
function Checklist() {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [copiou, setCopiou] = useState(false);
  const total = CHECKLIST.reduce((n, g) => n + g.itens.length, 0);
  function alternar(k: string) {
    setMarcados((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  async function copiarMensagem() {
    if (await copiar(MENSAGEM_DOCUMENTOS)) { setCopiou(true); window.setTimeout(() => setCopiou(false), 1800); }
  }
  return (
    <div className="mv-check">
      <div className="vidro mv-check-topo">
        <div className="mv-per-prog">
          <span className="num">{marcados.size} de {total} prontos</span>
          <div aria-hidden><i style={{ width: `${(marcados.size / total) * 100}%` }} /></div>
        </div>
        <div className="mv-check-bts">
          <BotaoSec mini onClick={() => setMarcados(new Set())} disabled={!marcados.size}>Limpar</BotaoSec>
          <BotaoSec mini onClick={copiarMensagem}>{copiou ? 'Mensagem copiada' : 'Copiar pedido de documentos'}</BotaoSec>
        </div>
      </div>
      <div className="mv-check-grade">
        {CHECKLIST.map((g) => (
          <section key={g.grupo} className="vidro mv-check-grupo">
            <h4>{g.grupo}</h4>
            {g.itens.map((it) => {
              const k = `${g.grupo}:${it}`;
              return (
                <button key={k} type="button" className="mv-check-it" aria-pressed={marcados.has(k)} onClick={() => alternar(k)}>
                  <span className="mv-per-chk" aria-hidden>{marcados.has(k) && <IcCheck />}</span>{it}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <p className="mv-calc-nota">O checklist serve de apoio durante o atendimento e não fica salvo: recarregou, começa do zero.</p>
    </div>
  );
}
