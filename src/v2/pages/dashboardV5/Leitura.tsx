import { Component, useEffect, useId, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PresetDash } from '@/data/dashboard';
import type { AchadoV5, AlvoV5, LeituraV5, LinkAcaoV5, SeveridadeV5, SinaisV5 } from '@/data/dashboardV5.sinais.tipos';
import { chaveAlvoV5 } from '@/data/dashboardV5.inteligencia';
import { CardVidro } from '../../components';

/* ------------------------------------------------------------------
   LEITURA DO DIA — o painel que lê os números para o dono (22/10).
   Fica entre o cabeçalho e os cartões. Até 4 linhas: ponto de
   severidade, título, uma frase curta (a instrução só quando é fora da
   tela) e, numa coluna só à direita (todas na mesma borda), o link com o verbo ("Reconectar em Integrações",
   "Ver Matheus", "Ver os 7 dias"). Nada a dizer → uma linha "Tudo dentro
   do normal" com o porquê. Rodapé fixo: de onde vêm os números e as
   observações que explicam distorções. Um horário só na tela: o "Atualizado às" do
   cabeçalho; o painel mostra o seu só quando a leitura é de OUTRO minuto (a busca dela falhou
   ou ainda não voltou).
   Sem aria-live: anunciar a cada atualização seria ruído.
   ------------------------------------------------------------------ */

const SEV_SR: Record<SeveridadeV5, string> = { atencao: 'Atenção: ', bom: 'Bom sinal: ', info: 'Informação: ' };
const TZ = 'America/Sao_Paulo';
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
/** a leitura e o cabeçalho foram buscados juntos (o mesmo minuto, ou a virada de um minuto
 *  entre as duas buscas): o horário aparece uma vez só, no cabeçalho */
const mesmoMinuto = (a: string | null | undefined, b: string) =>
  !!a && (hhmm(a) === hhmm(b) || Math.abs(Date.parse(a) - Date.parse(b)) < 60_000);

/** Rola até o alvo, realça por 1,6 s e leva o foco para ele (sem rolar de novo). */
export function realcarAlvoV5(a: AlvoV5) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-d5-alvo="${chaveAlvoV5(a)}"]`);
  if (!el) return;
  const reduz = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduz ? 'auto' : 'smooth' });
  el.classList.remove('d5-realce');
  void el.offsetWidth;   // reinicia a animação num segundo clique
  el.classList.add('d5-realce');
  window.setTimeout(() => el.classList.remove('d5-realce'), 1600);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

interface CtxLinks {
  /** chaves data-d5-alvo que existem na página agora (link sem alvo na tela fica oculto) */
  alvos: Set<string>;
  /** pode abrir a página IA (a rota é só de admin) */
  podeIa: boolean;
  /** troca o período da página ("Ver os 7 dias") */
  aoPreset: (p: PresetDash) => void;
}

/** O link à direita: rota, alvo na página ou outro período — ou nada, quando o destino não
 *  está ao alcance de quem vê (rota de admin, linha que não está na tabela). */
function Controle({ l, c, descrito }: { l: LinkAcaoV5 | null | undefined; c: CtxLinks; descrito?: string }) {
  if (!l) return null;
  if (l.rota) {
    if (l.rota === '/ia' && !c.podeIa) return null;
    return <Link to={l.rota} className="d5-lt-link" aria-describedby={descrito}>{l.rotulo}</Link>;
  }
  if (l.preset) {
    const p = l.preset;
    return <button type="button" className="d5-lt-link" aria-describedby={descrito} onClick={() => c.aoPreset(p)}>{l.rotulo}</button>;
  }
  if (l.alvo && c.alvos.has(chaveAlvoV5(l.alvo))) {
    const alvo = l.alvo;
    return <button type="button" className="d5-lt-link" aria-describedby={descrito} onClick={() => realcarAlvoV5(alvo)}>{l.rotulo}</button>;
  }
  return null;
}

function Linha({ a, c }: { a: AchadoV5; c: CtxLinks }) {
  const idT = useId();
  return (
    <li className={`d5-lt-item d5-lt-sev-${a.severidade}`}>
      <i className={`d5-lt-ponto d5-lt-${a.severidade}`} aria-hidden />
      <div className="d5-lt-tx">
        <p className="d5-lt-t" id={idT}><span className="d5-sr">{SEV_SR[a.severidade]}</span>{a.titulo}</p>
        <p className="d5-lt-f">
          {a.frase}
          {a.acao?.texto ? <> <span className="d5-lt-o">{a.acao.texto}</span></> : null}
        </p>
      </div>
      <div className="d5-lt-acao"><Controle l={a.acao?.link} c={c} descrito={idT} /></div>
    </li>
  );
}

/** Se o motor quebrar com um sinal inesperado, só o painel cai (o resto do dashboard fica). */
export class LimiteLeitura extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('Leitura do dia', e, info.componentStack); }
  render() {
    if (this.state.erro) {
      return (
        <CardVidro className="d5-sec d5-lt" role="region" aria-label="Leitura do dia">
          <p className="d5-lt-estado">Leitura indisponível agora.</p>
        </CardVidro>
      );
    }
    return this.props.children;
  }
}

export function Leitura({ q, leitura, falhou, alvos, podeIa, aoPreset, horaCabecalho }: {
  q: UseQueryResult<SinaisV5>;
  leitura: LeituraV5 | null;
  /** o motor não conseguiu ler este sinal (exceção capturada na página) */
  falhou?: boolean;
  alvos: Set<string>;
  podeIa: boolean;
  aoPreset: (p: PresetDash) => void;
  /** o instante do "Atualizado às" do cabeçalho (o mesmo minuto não se repete no painel) */
  horaCabecalho?: string | null;
}) {
  const idTit = useId();
  const idNotas = useId();
  const [mais, setMais] = useState(false);
  const [notasAbertas, setNotasAbertas] = useState(false);
  const s = q.data;
  const c: CtxLinks = { alvos, podeIa, aoPreset };
  // trocou de período ou de cenário: fecha o "Ver mais" (o conjunto de achados mudou)
  const chave = leitura ? leitura.achados.map((a) => a.id).join('|') : '';
  const chaveAnt = useRef(chave);
  useEffect(() => { if (chaveAnt.current !== chave) { chaveAnt.current = chave; setMais(false); } }, [chave]);

  const titulo = leitura?.titulo ?? 'Leitura do dia';
  const trocando = q.isPlaceholderData && q.isFetching;
  const escondidos = leitura ? leitura.achados.length - leitura.visiveis : 0;
  const msgErro = q.error instanceof Error && q.error.message ? q.error.message : 'Leitura indisponível agora.';

  return (
    <CardVidro className={'d5-sec d5-lt' + (trocando ? ' d5-lt-trocando' : '')} role="region" aria-labelledby={idTit}>
      <div className="d5-lt-cab">
        <h3 className="d5-lt-tit" id={idTit}>{titulo}</h3>
        {s && leitura && !mesmoMinuto(horaCabecalho, s.geradoEm) && (
          <span className="d5-lt-hora num">conferido às {hhmm(s.geradoEm)}</span>
        )}
      </div>

      {falhou ? (
        <p className="d5-lt-estado">Leitura indisponível agora.</p>
      ) : !s && q.isError ? (
        <p className="d5-lt-estado">
          {msgErro}{' '}
          <button type="button" className="d5-lt-link" onClick={() => void q.refetch()}>Tentar de novo</button>
        </p>
      ) : !s || !leitura ? (
        <p className="d5-lt-estado">Lendo os números…</p>
      ) : leitura.vazio ? (
        <ul className="d5-lt-lista">
          <li className="d5-lt-item d5-lt-sev-vazio">
            <i className="d5-lt-ponto d5-lt-bom" aria-hidden />
            <div className="d5-lt-tx">
              <p className="d5-lt-t"><span className="d5-sr">Bom sinal: </span>{leitura.vazio.titulo}</p>
              <p className="d5-lt-f">{leitura.vazio.motivo}</p>
            </div>
            <div className="d5-lt-acao" />
          </li>
        </ul>
      ) : (
        <>
          <ul className="d5-lt-lista">
            {leitura.achados.slice(0, mais ? leitura.achados.length : leitura.visiveis).map((a) => (
              <Linha key={a.id} a={a} c={c} />
            ))}
          </ul>
          {escondidos > 0 && (
            <button type="button" className="d5-lt-mais" aria-expanded={mais}
              aria-label={mais ? 'Mostrar menos achados' : `Mostrar mais ${escondidos} ${escondidos === 1 ? 'achado' : 'achados'}`}
              onClick={() => setMais((m) => !m)}>
              {mais ? 'Mostrar menos' : `Ver mais ${escondidos}`}
            </button>
          )}
        </>
      )}

      {s && leitura && !falhou && (
        <div className="d5-lt-pe">
          <p className="d5-lt-rod">
            {leitura.rodape}
            {q.isError && ' Não foi possível atualizar agora; esta é a última leitura.'}
            {leitura.notas.length > 0 && (
              <>
                {' '}
                <button type="button" className="d5-lt-disc" aria-expanded={notasAbertas} aria-controls={idNotas}
                  onClick={() => setNotasAbertas((v) => !v)}>
                  {leitura.notas.length === 1 ? '1 observação sobre estes números' : `${leitura.notas.length} observações sobre estes números`}
                  <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden className={notasAbertas ? 'd5-lt-disc-on' : undefined}>
                    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
          </p>
          {leitura.notas.length > 0 && (
            <ul className="d5-lt-notas" id={idNotas} hidden={!notasAbertas}>
              {leitura.notas.map((n) => (
                <li key={n.id}>
                  <span>{n.texto}</span>
                  <Controle l={n.link} c={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </CardVidro>
  );
}
