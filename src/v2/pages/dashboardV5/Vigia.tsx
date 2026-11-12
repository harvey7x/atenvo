import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { fmtEspera, useVigiaRespostas, type Severidade, type VigiaCaso, type VigiaDados, type VigiaSaude } from '@/data/vigiaRespostas';
import {
  GRUPOS_ESPERA, LIMITE_LISTA, PASSO, VISTA_INICIAL, hhmm, limiteDe, montarVista,
  type EstadoVista, type GrupoEspera, type Vista,
} from '@/data/vigiaRespostas.vista';
import { BotaoSec, Skeleton } from '../../components';
import { IcCheck, IcX } from '../filaIris/icones';
import { Pop, Secao, ancoraDe, type Ancora } from './comum';
import { TabelaVigia } from './VigiaTabela';

/* Vigia da Iris (dono 12/11: "eu só quero vigia pra Iris, porque várias vezes ela deixa cliente
   sem resposta"): o banco confere a cada 3 minutos, de dia e de noite, se algum cliente ficou
   esperando a IRIS responder, e a Iris travada é reativada sozinha. Atendentes e robô ficam FORA
   (o Radar já cobra os humanos). Este painel só mostra: o selo de situação (rubro se o vigia
   parou), a faixa por tempo de espera, a busca e a lista em seções. Só o gestor (admin) vê; não
   depende do período do Dashboard. A organização da lista é pura (vigiaRespostas.vista.ts). */

const AJUDA = 'A cada 3 minutos, de dia e de noite, o vigia procura conversas em que a última mensagem é do cliente e a Iris ainda não respondeu. '
  + 'O cliente entra na lista depois de 5 minutos sem resposta. Se a Iris travar, o vigia a reativa sozinho, até 2 vezes, nas primeiras 24 horas. '
  + 'O cliente sai da lista quando a Iris (ou alguém da equipe) responde, ou quando a conversa é arquivada. Cortesias como "ok" e "obrigado" não entram. '
  + 'Clientes de atendentes e do robô não entram aqui. Não depende do período escolhido no topo.';

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
    const mostrando: EstadoVista['mostrando'] = {};
    if (v.mostrando && typeof v.mostrando === 'object') {
      for (const g of ['menos1h', 'de1a24h', 'mais24h'] as const) {
        const n = (v.mostrando as Record<string, unknown>)[g];
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) mostrando[g] = n;
      }
    }
    return { espera, quem: 'todos', mostrando, busca: '' }; // a busca não é guardada; o vigia é só da Iris
  } catch { return null; }
}

/** A frase-veredito do cabeçalho: diz em 2 segundos como a Iris está ("agora" = menos de 24 h). */
function veredito(casos: VigiaCaso[]): string {
  const agora = casos.filter((c) => c.esperaMin < UM_DIA).length;
  const antigos = casos.length - agora;
  const antigosTx = antigos ? `${antigos} ${antigos === 1 ? 'antigo' : 'antigos'}` : '';
  if (!agora) return `A Iris está com as respostas em dia.${antigos ? ` · ${antigosTx}, há mais de 24 h` : ''}`;
  return [
    `${agora} ${agora === 1 ? 'cliente esperando a Iris responder' : 'clientes esperando a Iris responder'}`,
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

function FaixaEspera({ vista, s, truncada, valor, aoMudar }: {
  vista: Vista; s: VigiaSaude; truncada: boolean;
  valor: GrupoEspera | 'todas'; aoMudar: (g: GrupoEspera) => void;
}) {
  return (
    <div className="d5-vg-faixa" role="group" aria-label="Filtrar pelo tempo de espera">
      {GRUPOS_ESPERA.map((g) => {
        const f = vista.faixa[g.id];
        // lista cortada pelo banco: vale a contagem exata (por_severidade)
        const n = truncada ? s.porSeveridade[SEV_FAIXA[g.id]] ?? f.n : f.n;
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
          {s.curas24h === 0 ? 'nenhuma reativação da Iris'
            : s.curas24h === 1 ? '1 reativação da Iris' : `${s.curas24h} reativações da Iris`}
        </span>
      </div>
    </div>
  );
}

/* ---------- busca + contagem viva (o vigia é só da Iris: sem filtro de pessoa) ---------- */
function BarraBusca({ busca, aoBuscar, filtrados, total, temFiltro, aoLimpar }: {
  busca: string; aoBuscar: (v: string) => void;
  filtrados: number; total: number; temFiltro: boolean; aoLimpar: () => void;
}) {
  return (
    <div className="d5-vg-barra">
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
        <b>{parado ? 'Nenhum cliente esperando a Iris na última conferência.' : 'Nenhum cliente esperando a Iris.'}</b>
        {!parado && <span>O vigia confere de novo em até 3 minutos.</span>}
      </span>
    </div>
  );
}

/* ---------- carregando e erro ---------- */
export function VigiaSkeleton() {
  return (
    <Secao className="d5-vg" titulo="Vigia da Iris" sub="Lendo o vigia…">
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
    <Secao className="d5-vg" titulo="Vigia da Iris">
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
  // SÓ A IRIS (dono 12/11): caso de atendente ou do robô que ainda venha do banco fica de fora
  const casos = useMemo(() => d.casos.filter((c) => c.quemDeve === 'iris'), [d.casos]);
  const estadoEf = estado;
  const vista = useMemo(() => montarVista(casos, estadoEf), [casos, estadoEf]);
  const truncada = s.abertos > casos.length && casos.length >= LIMITE_LISTA;
  const temFiltro = estadoEf.espera !== 'todas' || estadoEf.busca.trim() !== '';

  // mudar um filtro volta as seções ao tamanho inicial (o "mostrar mais" é por seção)
  const mudarEspera = (g: GrupoEspera) => setEstado((e) => ({ ...e, espera: e.espera === g ? 'todas' : g, mostrando: {} }));
  const mudarBusca = (v: string) => setEstado((e) => ({ ...e, busca: v, mostrando: {} }));
  const limpar = () => setEstado((e) => ({ ...e, espera: 'todas', busca: '', mostrando: {} }));
  const mais = (g: GrupoEspera) => setEstado((e) => ({ ...e, mostrando: { ...e.mostrando, [g]: limiteDe(e, g) + PASSO } }));
  const menos = (g: GrupoEspera) => setEstado((e) => {
    const m = { ...e.mostrando };
    delete m[g];
    return { ...e, mostrando: m };
  });
  const abrirConversa = (conversaId: string) => navigate(`/whatsapp?conversa=${conversaId}`);

  return (
    <Secao className={'d5-vg' + (s.vigiaOk ? '' : ' d5-vg-parado')} id="vigia-respostas"
      titulo="Vigia da Iris" ajuda={AJUDA} sub={veredito(casos)}
      acao={<EstadoVigia s={s} lidoEm={d.lidoEm} />}>
      {erroLeitura && (
        <p className="d5-aviso" role="status">Não foi possível atualizar o vigia agora. Mostrando a leitura das {hhmm(d.lidoEm)}.</p>
      )}
      {!s.vigiaOk && <AvisoParado s={s} />}
      <FaixaEspera vista={vista} s={s} truncada={truncada} valor={estadoEf.espera} aoMudar={mudarEspera} />
      {vista.total === 0 ? (
        <VazioVigia parado={!s.vigiaOk} />
      ) : (
        <>
          <BarraBusca busca={estadoEf.busca} aoBuscar={mudarBusca}
            filtrados={vista.filtrados} total={vista.total} temFiltro={temFiltro} aoLimpar={limpar} />
          {truncada && (
            <p className="d5-vg-nota">A lista traz os {casos.length} casos mais graves de {s.abertos}. Os mais recentes podem ficar de fora.</p>
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
