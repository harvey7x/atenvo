import { useMemo } from 'react';
import type { WaContact } from '@/data/whatsappDemo';
import type { AtendenteV5 } from '@/data/dashboardV5.tipos';
import { fmtDuracaoH, fmtDuracaoMin, fmtInt, TRACO } from '@/data/dashboardV5.formato';
import { esperaDesde, type MembroEquipe, type RadarDoAtendente, type ResumoCarteira } from '@/data/supervisao';
import { DrawerV2 } from '../../components';
import { corDe, fmtHa, iniciaisDe, nomeAgenda, tomEspera, IcContatoMini } from './zapUi';

/* ------------------------------------------------------------------
   Ficha do atendente (gaveta do Painel da Equipe): desempenho no
   período escolhido (os números do Dashboard), a situação de agora
   (carteira, quem espera resposta, quem está na Central de Avisos), a
   posição na equipe e as listas que levam direto à conversa no
   celular dele.
   ------------------------------------------------------------------ */

export interface DadosPosto {
  membro: MembroEquipe;
  convs: WaContact[];
  resumo: ResumoCarteira;
  radar: RadarDoAtendente;
  stats: AtendenteV5 | null;
}

const PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', atendente: 'Atendente' };
const ESTAGIO: Record<number, string> = { 1: '1º aviso', 2: '2º aviso', 3: 'Último aviso' };

/** Posição (1-based) do membro numa métrica; empates dividem a posição; sem dado = null. */
function posicao(postos: readonly DadosPosto[], id: string, valor: (p: DadosPosto) => number | null, menorMelhor = false): number | null {
  const eu = postos.find((p) => p.membro.id === id);
  const meu = eu ? valor(eu) : null;
  if (meu == null) return null;
  const melhores = postos.filter((p) => { const v = valor(p); return v != null && (menorMelhor ? v < meu : v > meu); });
  return melhores.length + 1;
}

function Barras({ titulo, postos, id, valor, fmt, menorMelhor }: {
  titulo: string; postos: readonly DadosPosto[]; id: string;
  valor: (p: DadosPosto) => number | null; fmt: (n: number | null) => string; menorMelhor?: boolean;
}) {
  const vals = postos.map(valor);
  const max = Math.max(1e-9, ...vals.filter((v): v is number => v != null));
  const ordem = [...postos].sort((a, b) => {
    const x = valor(a), y = valor(b);
    if (x == null && y == null) return a.membro.nome.localeCompare(b.membro.nome, 'pt-BR');
    if (x == null) return 1;
    if (y == null) return -1;
    return menorMelhor ? x - y : y - x;
  });
  return (
    <div className="sv-cmp">
      <div className="sv-cmp-tit">{titulo}{menorMelhor && <span>quanto menor, melhor</span>}</div>
      {ordem.map((p) => {
        const v = valor(p);
        return (
          <div key={p.membro.id} className={p.membro.id === id ? 'sv-cmp-l sv-cmp-eu' : 'sv-cmp-l'}>
            <span className="sv-cmp-nm">{p.membro.nome}</span>
            <span className="sv-cmp-trilho"><i style={{ width: v == null ? 0 : `${Math.max(3, (v / max) * 100)}%` }} /></span>
            <span className="sv-cmp-v num">{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FichaAtendente({ aberto, posto, postos, rotuloPeriodo, agora, aoFechar, aoAbrirConversa }: {
  aberto: boolean;
  posto: DadosPosto | null;
  postos: readonly DadosPosto[];
  rotuloPeriodo: string;
  agora: number;
  aoFechar: () => void;
  aoAbrirConversa: (membroId: string, conversaId: string) => void;
}) {
  const esperando = useMemo(() => {
    if (!posto) return [];
    return posto.convs
      .filter((c) => !!esperaDesde(c, agora))
      .sort((a, b) => (a.aguardandoDesde ?? '').localeCompare(b.aguardandoDesde ?? ''))
      .slice(0, 8);
  }, [posto, agora]);

  if (!posto) return <DrawerV2 aberto={false} aoFechar={aoFechar}>{null}</DrawerV2>;
  const { membro: m, resumo, radar, stats: s } = posto;
  const id = m.id;
  const posFech = posicao(postos, id, (p) => p.stats?.ganhos ?? null);
  const posResp = posicao(postos, id, (p) => p.stats?.respMedianaMin ?? null, true);
  const pctCel = s && s.respN > 0 ? Math.round((s.respCelularN / s.respN) * 100) : null;
  const espera = resumo.esperaMaisAntiga ? Date.parse(resumo.esperaMaisAntiga) : 0;

  return (
    <DrawerV2 aberto={aberto} aoFechar={aoFechar} largura={460} className="vidro-pro">
      <div className="cab">
        <span>Ficha do atendente</span>
        <button type="button" className="fechar-p" onClick={aoFechar} aria-label="Fechar a ficha">✕</button>
      </div>
      <div className="corpo sv-ficha">
        <header className="sv-ficha-topo">
          <span className="sv-av sv-av-g" style={{ background: corDe(m.id) }} aria-hidden>{iniciaisDe(m.nome)}</span>
          <div>
            <h3>{m.nome}</h3>
            <p>{PAPEL[m.papel] ?? m.papel} · <b className="num">{fmtInt(resumo.total)}</b> {resumo.total === 1 ? 'cliente' : 'clientes'} na carteira</p>
          </div>
        </header>

        <section className="sv-ficha-sec">
          <h4>Desempenho <span>{rotuloPeriodo}</span></h4>
          <div className="sv-ficha-kpis">
            <div className="sv-fk">
              <span className="sv-fk-r">Recebidos</span>
              <b className="num">{fmtInt(s?.recebidos ?? null)}</b>
              <span className="sv-fk-s">{s?.transferidos ? `+${fmtInt(s.transferidos)} por transferência` : 'leads do rodízio'}</span>
            </div>
            <div className="sv-fk">
              <span className="sv-fk-r">Fechados</span>
              <b className="num">{fmtInt(s?.ganhos ?? null)}</b>
              <span className="sv-fk-s">{posFech ? `${posFech}º da equipe` : TRACO}</span>
            </div>
            <div className="sv-fk">
              <span className="sv-fk-r">Marcou não elegível</span>
              <b className="num">{fmtInt(s?.neMarcados ?? null)}</b>
              <span className="sv-fk-s">no período</span>
            </div>
            <div className="sv-fk">
              <span className="sv-fk-r">Tempo de resposta</span>
              <b className="num">{fmtDuracaoMin(s?.respMedianaMin ?? null)}</b>
              <span className="sv-fk-s">{posResp ? `${posResp}º mais rápido · média ${fmtDuracaoMin(s?.respMediaMin ?? null)}` : 'sem respostas no período'}</span>
            </div>
            <div className="sv-fk">
              <span className="sv-fk-r">Tempo para fechar</span>
              <b className="num">{fmtDuracaoH(s?.fechMedianaH ?? null)}</b>
              <span className="sv-fk-s">{s?.fechN ? `mediana de ${fmtInt(s.fechN)} ${s.fechN === 1 ? 'fechamento' : 'fechamentos'}` : 'sem fechamentos'}</span>
            </div>
            <div className="sv-fk">
              <span className="sv-fk-r">Respostas</span>
              <b className="num">{fmtInt(s?.respN ?? null)}</b>
              <span className="sv-fk-s">{pctCel != null ? `${pctCel}% pelo celular` : 'vezes do cliente respondidas'}</span>
            </div>
          </div>
        </section>

        <section className="sv-ficha-sec">
          <h4>Agora <span className="sv-vivo-mini"><i aria-hidden />ao vivo</span></h4>
          <dl className="sv-agora">
            <div><dt>Conversas hoje</dt><dd className="num">{fmtInt(resumo.hoje)}</dd></div>
            <div>
              <dt>Aguardando resposta</dt>
              <dd className="num">{fmtInt(resumo.aguardando)}{espera ? <small className={`sv-tom-${tomEspera(espera, agora)}`}>mais antigo {fmtHa(espera, agora)}</small> : null}</dd>
            </div>
            <div>
              <dt>Na Central de Avisos</dt>
              <dd className="num">{fmtInt(radar.emAviso)}{radar.ultimoAviso ? <small className="sv-tom-rubro">{radar.ultimoAviso} no último aviso</small> : null}</dd>
            </div>
            <div><dt>Leads para ligar</dt><dd className="num">{fmtInt(radar.ligar)}</dd></div>
          </dl>
        </section>

        {esperando.length > 0 && (
          <section className="sv-ficha-sec">
            <h4>Clientes esperando resposta <span>clique para abrir no celular</span></h4>
            <ul className="sv-lista">
              {esperando.map((c) => {
                const nome = nomeAgenda(c.name, c.phone);
                const desde = c.aguardandoDesde ? Date.parse(c.aguardandoDesde) : 0;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => aoAbrirConversa(id, c.id)}>
                      <span className="sv-av sv-av-p" style={{ background: iniciaisDe(nome) ? corDe(c.id) : undefined }} aria-hidden>{iniciaisDe(nome) || <IcContatoMini />}</span>
                      <span className="sv-lista-tx"><b>{nome}</b><span>{c.last || 'Mensagem'}</span></span>
                      {desde ? <span className={`sv-lista-ha sv-tom-${tomEspera(desde, agora)}`}>{fmtHa(desde, agora)}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {radar.itens.length > 0 && (
          <section className="sv-ficha-sec">
            <h4>Na Central de Avisos</h4>
            <ul className="sv-lista">
              {radar.itens.slice(0, 8).map((i) => (
                <li key={i.alertaId}>
                  <button type="button" onClick={() => aoAbrirConversa(id, i.conversaId)}>
                    <span className="sv-av sv-av-p" style={{ background: iniciaisDe(i.nome) ? corDe(i.conversaId) : undefined }} aria-hidden>{iniciaisDe(i.nome) || <IcContatoMini />}</span>
                    <span className="sv-lista-tx">
                      <b>{nomeAgenda(i.nome, null)}</b>
                      <span>{i.categoria === 'ligar' ? 'Parou no atendimento automático' : i.categoria === 'fechado' ? 'Cliente fechado sem resposta' : 'Em negociação sem resposta'}</span>
                    </span>
                    <span className={`sv-selo ${i.categoria === 'ligar' ? 'sv-selo-azul' : i.estagio === 3 ? 'sv-selo-rubro' : 'sv-selo-ambar'}`}>
                      {i.categoria === 'ligar' ? 'Ligar' : ESTAGIO[i.estagio] ?? 'Aviso'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sv-ficha-sec">
          <h4>Comparativo da equipe <span>{rotuloPeriodo}</span></h4>
          <Barras titulo="Fechados" postos={postos} id={id} valor={(p) => p.stats?.ganhos ?? null} fmt={fmtInt} />
          <Barras titulo="Recebidos" postos={postos} id={id} valor={(p) => p.stats?.recebidos ?? null} fmt={fmtInt} />
          <Barras titulo="Tempo de resposta" postos={postos} id={id} valor={(p) => p.stats?.respMedianaMin ?? null} fmt={fmtDuracaoMin} menorMelhor />
        </section>
      </div>
    </DrawerV2>
  );
}
