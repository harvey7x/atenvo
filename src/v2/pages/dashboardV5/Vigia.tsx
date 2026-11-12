import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { fmtEspera, useVigiaRespostas, type Severidade, type VigiaCaso, type VigiaDados, type VigiaSaude } from '@/data/vigiaRespostas';
import {
  GRUPOS_ESPERA, LIMITE_LISTA, PASSO, VISTA_INICIAL, chaveQuem, hhmm, limiteDe, montarVista,
  type EstadoVista, type FiltroQuem, type GrupoEspera, type OpcaoQuem, type Vista,
} from '@/data/vigiaRespostas.vista';
import { initials } from '@/lib/avatar';
import { BotaoSec, Skeleton } from '../../components';
import { ICONES } from '../../shell/icones';
import { IcCheck, IcX } from '../filaIris/icones';
import { Pop, Secao, ancoraDe, type Ancora } from './comum';
import { TabelaVigia } from './VigiaTabela';

/* Vigia de respostas 24h (dono 12/11): o banco confere a cada 3 minutos, de dia e de noite, se
   algum cliente ficou sem resposta, e a Iris travada é reativada sozinha. Este painel só mostra:
   o selo de situação (rubro se o vigia parou), a faixa por tempo de espera, a barra "quem deve
   responder" e a lista em seções. Só o gestor (admin) vê; não depende do período do Dashboard.
   A organização da lista é pura (vigiaRespostas.vista.ts); aqui só a casca. */

const AJUDA = 'A cada 3 minutos, de dia e de noite, o vigia procura conversas em que a última mensagem é do cliente e ninguém respondeu. '
  + 'O cliente entra na lista depois de 5 minutos quando quem deve responder é a Iris ou o robô, e depois de 15 minutos úteis '
  + '(segunda a sexta, das 9h às 18h) quando é um atendente. Se a Iris travar, o vigia a reativa sozinho, até 2 vezes, nas primeiras 24 horas. '
  + 'O cliente sai da lista quando alguém responde ou quando a conversa é arquivada. Cortesias como "ok" e "obrigado" não entram. '
  + 'Não depende do período escolhido no topo.';

const UM_DIA = 1440;
const CHAVE_VISTA = 'd5-vigia-vista';

/* ---------- estado da vista no sessionStorage (voltar da conversa mantém filtros) ---------- */
function lerVista(): EstadoVista | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const bruto = sessionStorage.getItem(CHAVE_VISTA);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as Partial<EstadoVista> | null;
    if (!v || typeof v !== 'object') return null;
    const espera = v.espera === 'menos1h' || v.espera === 'de1a24h' || v.espera === 'mais24h' ? v.espera : 'todas';
    const quem: FiltroQuem = typeof v.quem === 'string' && (v.quem === 'iris' || v.quem === 'robo' || v.quem === 'sem' || v.quem.startsWith('p:'))
      ? (v.quem as FiltroQuem) : 'todos';
    const mostrando: EstadoVista['mostrando'] = {};
    if (v.mostrando && typeof v.mostrando === 'object') {
      for (const g of ['menos1h', 'de1a24h', 'mais24h'] as const) {
        const n = (v.mostrando as Record<string, unknown>)[g];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) mostrando[g] = n;
      }
    }
    return { espera, quem, mostrando, busca: '' }; // a busca não é guardada
  } catch { return null; }
}

/** A frase-veredito do cabeçalho: diz em 2 segundos como está ("agora" = menos de 24 h). */
function veredito(casos: VigiaCaso[]): string {
  const agora = casos.filter((c) => c.esperaMin < UM_DIA);
  const antigos = casos.length - agora.length;
  const antigosTx = antigos ? `${antigos} ${antigos === 1 ? 'antigo' : 'antigos'}` : '';
  if (!agora.length) return `Tudo em dia: ninguém esperando resposta agora.${antigos ? ` · ${antigosTx}, há mais de 24 h` : ''}`;
  const iris = agora.filter((c) => c.quemDeve === 'iris').length;
  const robo = agora.filter((c) => c.quemDeve === 'robo').length;
  const atend = agora.length - iris - robo;
  return [
    `${agora.length} ${agora.length === 1 ? 'cliente esperando resposta agora' : 'clientes esperando resposta agora'}`,
    iris ? `${iris} da Iris` : '',
    robo ? `${robo} do robô` : '',
    atend ? `${atend} de atendentes` : '',
    antigosTx,
  ].filter(Boolean).join(' · ');
}

/* ---------- selo de situação (cabeçalho, à direita) ---------- */
function EstadoVigia({ s, lidoEm }: { s: VigiaSaude; lidoEm: string }) {
  const id = useId();
  const [ancora, setAncora] = useState<Ancora | null>(null);
  const texto = s.vigiaOk
    ? s.ultimoMinutos ? `Conferido há ${s.ultimoMinutos} min` : 'Conferido agora'
    : s.ultimoMinutos == null && !s.ultimoEm ? 'Ainda não conferiu'
      : s.ultimoErro ? 'Erro na última conferência'
        : `Parado há ${fmtEspera(s.ultimoMinutos ?? 0)}`;
  return (
    <>
      <button type="button" className="d5-vg-estado" data-ok={s.vigiaOk ? '1' : '0'}
        aria-label={`Situação do vigia: ${texto}`} aria-describedby={ancora ? id : undefined}
        onMouseEnter={(e) => setAncora(ancoraDe(e.currentTarget))} onMouseLeave={() => setAncora(null)}
        onFocus={(e) => setAncora(ancoraDe(e.currentTarget))} onBlur={() => setAncora(null)}>
        <i aria-hidden />{texto}
      </button>
      <Pop ancora={ancora} id={id} largura={300}>
        <span className="d5-pop-tit">{s.vigiaOk ? 'Vigia ligado' : 'Vigia parado'}</span>
        <ul className="d5-pop-lista">
          <li><span>Última conferência</span><b>{s.ultimoEm ? `às ${hhmm(s.ultimoEm)}` : '—'}</b></li>
          <li><span>Conferências nas últimas 24 h</span><b>{s.rodadas24h}</b></li>
          <li><span>Lista lida às</span><b>{hhmm(lidoEm)}</b></li>
        </ul>
      </Pop>
    </>
  );
}

/* ---------- aviso de vigia parado (acima da faixa; os dados abaixo são a última foto) ---------- */
function AvisoParado({ s }: { s: VigiaSaude }) {
  const nunca = s.ultimoMinutos == null && !s.ultimoEm;
  const hora = hhmm(s.ultimoEm);
  return (
    <div className="d5-vg-alerta" role="alert">
      <b>{nunca ? 'O vigia ainda não conferiu' : 'O vigia parou de conferir'}</b>
      <span>
        {nunca
          ? 'O vigia ainda não fez nenhuma conferência. A lista aparece depois da primeira.'
          : s.ultimoErro
            ? `A última conferência, às ${hora}, terminou com erro. O vigia tenta de novo a cada 3 minutos; a lista abaixo pode estar desatualizada.`
            : `A última conferência foi às ${hora}, há ${fmtEspera(s.ultimoMinutos ?? 0)}. A lista abaixo é dessa conferência e pode estar desatualizada.`}
      </span>
    </div>
  );
}

/* ---------- faixa de espera (os 4 números; as 3 primeiras células filtram) ---------- */
const TITULO_FAIXA: Record<GrupoEspera, string> = {
  menos1h: 'Ver só os clientes esperando há menos de 1 h',
  de1a24h: 'Ver só os clientes esperando de 1 h a 24 h',
  mais24h: 'Ver só os clientes esperando há mais de 24 h',
};
const SEV_FAIXA: Record<GrupoEspera, Severidade> = { menos1h: 'atencao', de1a24h: 'alta', mais24h: 'critica' };

function FaixaEspera({ vista, s, truncada, quemLigado, valor, aoMudar }: {
  vista: Vista; s: VigiaSaude; truncada: boolean; quemLigado: boolean;
  valor: GrupoEspera | 'todas'; aoMudar: (g: GrupoEspera) => void;
}) {
  return (
    <div className="d5-vg-faixa" role="group" aria-label="Filtrar pelo tempo de espera">
      {GRUPOS_ESPERA.map((g) => {
        const f = vista.faixa[g.id];
        // lista cortada pelo banco: sem filtro de pessoa, vale a contagem exata (por_severidade)
        const n = truncada && !quemLigado ? s.porSeveridade[SEV_FAIXA[g.id]] ?? f.n : f.n;
        const apoio = truncada ? 'lista incompleta' : n === 0 ? 'ninguém esperando' : `maior espera ${fmtEspera(f.maiorEspera)}`;
        const ativo = valor === g.id;
        return (
          <button key={g.id} type="button" className="d5-vg-fx" aria-pressed={ativo}
            aria-label={`${g.rotulo}: ${n} ${n === 1 ? 'cliente' : 'clientes'}. ${apoio}.${ativo ? ' Filtro ligado.' : ''}`}
            title={ativo ? 'Ver todos de novo' : TITULO_FAIXA[g.id]}
            onClick={() => aoMudar(g.id)}>
            <span className="d5-vg-fx-r">{g.rotulo}</span>
            <span className="d5-vg-fx-n num" data-zero={n === 0 ? '' : undefined}>{n}</span>
            <span className="d5-vg-fx-s">{apoio}</span>
          </button>
        );
      })}
      <div className="d5-vg-fx" title="Clientes que saíram da lista nas últimas 24 horas: alguém respondeu ou a conversa foi arquivada.">
        <span className="d5-vg-fx-r">Resolvidos em 24 h</span>
        <span className="d5-vg-fx-n num" data-zero={s.resolvidos24h === 0 ? '' : undefined}>{s.resolvidos24h}</span>
        <span className="d5-vg-fx-s">
          {quemLigado ? 'no total, sem filtro'
            : s.curas24h === 0 ? 'nenhuma reativação da Iris'
              : s.curas24h === 1 ? '1 reativação da Iris' : `${s.curas24h} reativações da Iris`}
        </span>
      </div>
    </div>
  );
}

/* ---------- barra "quem deve responder" + busca + contagem viva ---------- */
function ChipQuem({ o, ativo, aoClicar }: { o: OpcaoQuem; ativo: boolean; aoClicar: () => void }) {
  const title = ativo ? 'Ver todos de novo'
    : o.tipo === 'iris' ? 'Clientes que a Iris deve responder'
      : o.tipo === 'robo' ? 'Clientes que o robô deve responder'
        : o.tipo === 'sem' ? 'Clientes sem atendente responsável'
          : `Clientes que ${o.nomeCompleto} ainda não respondeu · maior espera ${fmtEspera(o.maiorEspera)}`;
  return (
    <button type="button" className="d5-vg-chip" aria-pressed={ativo} disabled={o.n === 0 && !ativo}
      aria-label={`${o.rotulo}: ${o.n} ${o.n === 1 ? 'cliente' : 'clientes'}`} title={title} onClick={aoClicar}>
      {o.tipo === 'pessoa' ? <span className="d5-vg-av" aria-hidden>{initials(o.nomeCompleto ?? o.rotulo)}</span>
        : o.tipo === 'sem' ? <span className="d5-vg-av" data-vazio="" aria-hidden />
          : <span className="d5-vg-av" aria-hidden>{o.tipo === 'iris' ? ICONES.ia : ICONES.fluxos}</span>}
      <span>{o.rotulo}</span>
      <b className="num">{o.n}</b>
    </button>
  );
}

function BarraQuem({ opcoes, valor, aoMudar, busca, aoBuscar, filtrados, total, temFiltro, aoLimpar }: {
  opcoes: OpcaoQuem[]; valor: FiltroQuem; aoMudar: (k: FiltroQuem) => void;
  busca: string; aoBuscar: (v: string) => void;
  filtrados: number; total: number; temFiltro: boolean; aoLimpar: () => void;
}) {
  return (
    <div className="d5-vg-barra">
      <span className="d5-vg-barra-rot">Quem deve responder</span>
      <div className="d5-vg-chips" role="group" aria-label="Filtrar por quem deve responder">
        {opcoes.map((o) => <ChipQuem key={o.chave} o={o} ativo={valor === o.chave} aoClicar={() => aoMudar(o.chave)} />)}
      </div>
      <div className="d5-vg-barra-dir">
        <input type="search" className="d5-vg-busca" value={busca} onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar cliente ou telefone" aria-label="Buscar cliente pelo nome ou telefone" />
        <span className="d5-vg-conta num" aria-live="polite">
          {filtrados === total ? `${total} ${total === 1 ? 'cliente' : 'clientes'}` : `${filtrados} de ${total} clientes`}
        </span>
        {temFiltro && <button type="button" className="d5-vg-limpar" onClick={aoLimpar}>Limpar filtro<IcX t={10} /></button>}
      </div>
    </div>
  );
}

/* ---------- vazio geral (zero não é erro) ---------- */
function VazioVigia({ parado }: { parado: boolean }) {
  return (
    <div className="d5-vg-zero">
      <span className="d5-vg-zero-ic" aria-hidden><IcCheck t={16} /></span>
      <span className="d5-vg-zero-tx">
        <b>{parado ? 'Nenhum cliente sem resposta na última conferência.' : 'Nenhum cliente sem resposta.'}</b>
        {!parado && <span>O vigia confere de novo em até 3 minutos.</span>}
      </span>
    </div>
  );
}

/* ---------- carregando e erro ---------- */
export function VigiaSkeleton() {
  return (
    <Secao className="d5-vg" titulo="Vigia de respostas" sub="Lendo o vigia…">
      <div className="d5-vg-faixa" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="d5-vg-fx">
            <Skeleton largura={88} altura={11} />
            <Skeleton largura={44} altura={22} style={{ marginTop: 4 }} />
            <Skeleton largura={110} altura={11} style={{ marginTop: 4 }} />
          </div>
        ))}
      </div>
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} altura={44} raio={6} />)}
      </div>
    </Secao>
  );
}

function VigiaErro({ mensagem, aoTentar }: { mensagem?: string | null; aoTentar: () => void }) {
  return (
    <Secao className="d5-vg" titulo="Vigia de respostas">
      <div className="d5-vg-alerta" role="alert">
        <b>{mensagem || 'Não foi possível ler o vigia agora.'}</b>
        <span>A tela tenta de novo sozinha a cada 30 segundos.</span>
        <BotaoSec mini className="d5-vg-tentar" onClick={aoTentar}>Tentar de novo</BotaoSec>
      </div>
    </Secao>
  );
}

/* ---------- o painel (exportado para os testes renderizarem com um estado inicial) ---------- */
export function PainelVigia({ d, inicial, erroLeitura }: { d: VigiaDados; inicial?: Partial<EstadoVista>; erroLeitura?: boolean }) {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoVista>(() => (inicial ? { ...VISTA_INICIAL, ...inicial } : lerVista() ?? VISTA_INICIAL));
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_VISTA, JSON.stringify({ espera: estado.espera, quem: estado.quem, mostrando: estado.mostrando }));
    } catch { /* sem armazenamento: a vista só não é lembrada */ }
  }, [estado]);

  const s = d.saude;
  // um chip de pessoa (ou "sem atendente") que não existe mais volta para "todos"
  const estadoEf = useMemo<EstadoVista>(() => {
    const q = estado.quem;
    if (q === 'todos' || q === 'iris' || q === 'robo') return estado;
    return d.casos.some((c) => chaveQuem(c) === q) ? estado : { ...estado, quem: 'todos' };
  }, [estado, d.casos]);
  const vista = useMemo(() => montarVista(d.casos, estadoEf), [d.casos, estadoEf]);
  const truncada = s.abertos > d.casos.length && d.casos.length >= LIMITE_LISTA;
  const temFiltro = estadoEf.quem !== 'todos' || estadoEf.espera !== 'todas' || estadoEf.busca.trim() !== '';

  // mudar um filtro volta as seções ao tamanho inicial (o "mostrar mais" é por seção)
  const mudarEspera = (g: GrupoEspera) => setEstado((e) => ({ ...e, espera: e.espera === g ? 'todas' : g, mostrando: {} }));
  const mudarQuem = (k: FiltroQuem) => setEstado((e) => ({ ...e, quem: e.quem === k ? 'todos' : k, mostrando: {} }));
  const mudarBusca = (v: string) => setEstado((e) => ({ ...e, busca: v, mostrando: {} }));
  const limpar = () => setEstado((e) => ({ ...e, espera: 'todas', quem: 'todos', busca: '', mostrando: {} }));
  const mais = (g: GrupoEspera) => setEstado((e) => ({ ...e, mostrando: { ...e.mostrando, [g]: limiteDe(e, g) + PASSO } }));
  const menos = (g: GrupoEspera) => setEstado((e) => {
    const m = { ...e.mostrando };
    delete m[g];
    return { ...e, mostrando: m };
  });
  const abrirConversa = (conversaId: string) => navigate(`/whatsapp?conversa=${conversaId}`);

  return (
    <Secao className={'d5-vg' + (s.vigiaOk ? '' : ' d5-vg-parado')} id="vigia-respostas"
      titulo="Vigia de respostas" ajuda={AJUDA} sub={veredito(d.casos)}
      acao={<EstadoVigia s={s} lidoEm={d.lidoEm} />}>
      {erroLeitura && (
        <p className="d5-aviso" role="status">Não foi possível atualizar o vigia agora. Mostrando a leitura das {hhmm(d.lidoEm)}.</p>
      )}
      {!s.vigiaOk && <AvisoParado s={s} />}
      <FaixaEspera vista={vista} s={s} truncada={truncada} quemLigado={estadoEf.quem !== 'todos'}
        valor={estadoEf.espera} aoMudar={mudarEspera} />
      {vista.total === 0 ? (
        <VazioVigia parado={!s.vigiaOk} />
      ) : (
        <>
          <BarraQuem opcoes={vista.quem} valor={estadoEf.quem} aoMudar={mudarQuem}
            busca={estadoEf.busca} aoBuscar={mudarBusca}
            filtrados={vista.filtrados} total={vista.total} temFiltro={temFiltro} aoLimpar={limpar} />
          {truncada && (
            <p className="d5-vg-nota">A lista traz os {d.casos.length} casos mais graves de {s.abertos}. Os mais recentes podem ficar de fora.</p>
          )}
          <TabelaVigia grupos={vista.grupos} lidoEm={d.lidoEm} truncada={truncada} porSeveridade={s.porSeveridade}
            mostrando={estadoEf.mostrando} aoMais={mais} aoMenos={menos} aoAbrir={abrirConversa} aoLimpar={limpar} />
        </>
      )}
    </Secao>
  );
}

/* ---------- o porteiro: admin vê; os demais (e org sem id) não ---------- */
export function Vigia() {
  const { currentOrg } = useOrg();
  const admin = currentOrg.role === 'admin';
  const q = useVigiaRespostas(admin);
  if (!admin || !currentOrg.id) return null;
  const d = q.data;
  if (!d) {
    if (q.isError) return <VigiaErro mensagem={(q.error as Error | null)?.message} aoTentar={() => { void q.refetch(); }} />;
    return <VigiaSkeleton />;
  }
  return <PainelVigia d={d} erroLeitura={q.isError} />;
}
