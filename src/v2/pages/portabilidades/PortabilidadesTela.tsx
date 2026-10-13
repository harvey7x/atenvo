/* ============================================================================
   Portabilidades — a TELA (demo e real usam a mesma; ver fonte.ts).
   Mesa de trabalho executiva, como Pendências: navegação | lista | um cliente.
   Nada aqui envia mensagem: "Abrir conversa" só leva para o WhatsApp.
   - Esperando aceite: o cliente entrou na aba com o valor; falta ele dizer sim.
   - Em andamento: aceitou; falta desbloquear o benefício e o cliente fazer o link.
   - Concluídas / Não aceitaram.
   O valor que o cliente vai receber se divide pela regra de src/data/portabilidades.ts
   (REGRA_DIVISAO): 30% para o escritório e, dentro deles, 15% para o atendente.
   ============================================================================ */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, ModalV2, Segmentado, Skeleton } from '../../components';
import {
  campoDe, casaBusca, centavosDe, dividir, estadoLink, mascaraReais, oQueFalta, ordenar, podeConcluir, reais, resumir, situacao,
  type Portabilidade, type Situacao,
} from '@/data/portabilidades';
import { haQuanto, iniciais, nomeBonito, quandoCurto } from '@/data/pendencias';
import { useFonte, type Fonte } from './fonte';
import { Partes } from './pecas';
import { NovaPortabilidade } from './NovaPortabilidade';
import {
  IcAceite, IcAlerta, IcBandeira, IcBusca, IcCadeado, IcCheck, IcConversa, IcDesfazer, IcInfo, IcLapis, IcLink, IcLixo, IcMais,
  IcMaisAcoes, IcPessoa, IcVista, IcX,
} from './icones';
import './portabilidades.css';

const VISTAS: { id: Situacao; rotulo: string; vazioT: string; vazio: string }[] = [
  { id: 'aguardando_aceite', rotulo: 'Esperando aceite', vazioT: 'Ninguém esperando', vazio: 'O cliente que você adicionar começa aqui, até dizer se aceita a portabilidade.' },
  { id: 'em_andamento', rotulo: 'Em andamento', vazioT: 'Nada em andamento', vazio: 'Quando o cliente aceitar, ele aparece aqui até a portabilidade ser concluída.' },
  { id: 'concluida', rotulo: 'Concluídas', vazioT: 'Nenhuma concluída ainda', vazio: 'As portabilidades concluídas ficam guardadas aqui.' },
  { id: 'nao_aceitou', rotulo: 'Não aceitaram', vazioT: 'Ninguém recusou', vazio: 'O cliente que não aceitar a portabilidade fica guardado aqui.' },
];
const rotuloDe = (s: Situacao) => VISTAS.find((v) => v.id === s)?.rotulo ?? '';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------------- aviso (toast) ---------------- */
type TomToast = 'ok' | 'erro' | 'info';
interface Toast { texto: string; tom: TomToast; n: number }

/* ---------------- contexto da tela ---------------- */
interface Ctx {
  f: Fonte;
  avisar: (texto: string, tom?: TomToast) => void;
  /** roda uma ação: trava os botões, mostra o erro em frase e, se a portabilidade mudou de lista, vai junto */
  rodar: (id: string, acao: () => Promise<void>, o?: { destino?: Situacao; ok?: string }) => Promise<boolean>;
  ocupado: boolean;
  aoAbrirConversa: (p: Portabilidade) => void;
  aoTrocarAtendente: (p: Portabilidade) => void;
  aoExcluir: (p: Portabilidade) => void;
}
const PortCtx = createContext<Ctx | null>(null);
function usePort() {
  const c = useContext(PortCtx);
  if (!c) throw new Error('PortCtx ausente');
  return c;
}

export default function PortabilidadesTela() {
  const f = useFonte();
  const navigate = useNavigate();
  const [escopo, setEscopo] = useState<'minhas' | 'equipe'>('minhas');
  const [vista, setVista] = useState<Situacao>('em_andamento');
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  const [trocar, setTrocar] = useState<Portabilidade | null>(null);
  const [excluir, setExcluir] = useState<Portabilidade | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);
  const nToast = useRef(0);
  const avisar = useCallback((texto: string, tom: TomToast = 'ok') => { nToast.current += 1; setToast({ texto, tom, n: nToast.current }); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tom === 'erro' ? 5200 : 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const doEscopo = useMemo(
    () => (escopo === 'minhas' ? f.portabilidades.filter((p) => p.atendenteId === f.usuario.id) : f.portabilidades),
    [f.portabilidades, f.usuario.id, escopo],
  );
  const conta = (s: Situacao) => doEscopo.filter((p) => situacao(p) === s).length;
  const resumo = useMemo(() => resumir(doEscopo), [doEscopo]);
  const lista = useMemo(() => {
    const q = busca.trim();
    return ordenar(doEscopo.filter((p) => situacao(p) === vista && (!q || casaBusca(f.cliente(p.clienteId), q))), vista);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doEscopo, vista, busca, f.cliente]);
  const selEf = lista.some((p) => p.id === sel) ? sel : lista[0]?.id ?? null;
  const atual = lista.find((p) => p.id === selEf) ?? null;
  const rotuloVista = VISTAS.find((v) => v.id === vista);

  const irPara = (v: Situacao) => { setVista(v); setBusca(''); };

  const rodar = useCallback<Ctx['rodar']>(async (id, acao, o = {}) => {
    setOcupado(true);
    try {
      await acao();
      if (o.destino && o.destino !== vista) {
        setVista(o.destino); setBusca(''); setSel(id);
        avisar(o.ok ? `${o.ok} Foi para ${rotuloDe(o.destino)}.` : `Foi para ${rotuloDe(o.destino)}.`);
      } else if (o.ok) avisar(o.ok);
      return true;
    } catch (e) {
      avisar(f.erroAmigavel(e), 'erro');
      return false;
    } finally {
      setOcupado(false);
    }
  }, [vista, avisar, f]);

  const ctx: Ctx = {
    f, avisar, rodar, ocupado,
    aoAbrirConversa: async (p) => {
      if (!f.conversaDe) { avisar('Demonstração: abriria a conversa deste cliente no WhatsApp.', 'info'); return; }
      try {
        const id = await f.conversaDe(p.clienteId);
        if (id) navigate(`/whatsapp?conversa=${encodeURIComponent(id)}`);
        else avisar('Esse cliente ainda não tem conversa no WhatsApp.', 'info');
      } catch (e) { avisar(f.erroAmigavel(e), 'erro'); }
    },
    aoTrocarAtendente: setTrocar,
    aoExcluir: setExcluir,
  };

  /* ↑/↓ movem a seleção quando o foco está na lista */
  const rolo = useRef<HTMLDivElement>(null);
  const mover = (d: number) => {
    const i = lista.findIndex((p) => p.id === selEf);
    const nx = lista[Math.min(lista.length - 1, Math.max(0, i + d))];
    if (!nx) return;
    setSel(nx.id);
    requestAnimationFrame(() => rolo.current?.querySelector<HTMLElement>(`[data-id="${nx.id}"]`)?.focus());
  };

  /* outro cliente aberto: o painel começa do topo (situação e valor primeiro) */
  const painelRolo = useRef<HTMLDivElement>(null);
  const atualId = atual?.id;
  useEffect(() => { painelRolo.current?.scrollTo({ top: 0 }); }, [atualId]);

  const listaVazia = !f.carregando && lista.length === 0;
  const hoje = new Date();

  return (
    <PortCtx.Provider value={ctx}>
      <div className="pt-tela">
        <header className="pt-cab">
          <div className="pt-cab-tx">
            <h1>Portabilidades</h1>
            <p>Do aceite do cliente até a portabilidade concluída.</p>
          </div>
          <BotaoPrimario onClick={() => setNova(true)}><IcMais />Nova portabilidade</BotaoPrimario>
        </header>

        {f.erro && (
          <div className="pt-aviso" role="alert"><IcAlerta /><span>Não deu para carregar as portabilidades: {f.erro}</span></div>
        )}

        <div className="pt-corpo" data-sem-painel={listaVazia ? '' : undefined}>
          <nav className="pt-nav" aria-label="Portabilidades">
            <Segmentado rotulo="Ver" valor={escopo} aoMudar={setEscopo} style={{ width: '100%' }}
              opcoes={[{ valor: 'minhas', rotulo: 'Minhas' }, { valor: 'equipe', rotulo: 'Equipe toda' }]} />
            <div className="pt-nav-grupo">
              {VISTAS.map((v) => {
                const n = f.carregando ? 0 : conta(v.id);
                return (
                  <button key={v.id} type="button" className="pt-nav-it" aria-current={vista === v.id ? 'page' : undefined}
                    onClick={() => irPara(v.id)} aria-label={n ? `${v.rotulo}, ${n}` : undefined}>
                    <IcVista v={v.id} />
                    <span className="pt-nav-rot">{v.rotulo}</span>
                    {n ? <span className="pt-nav-n num" data-tom={v.id === 'aguardando_aceite' ? 'ambar' : undefined} aria-hidden>{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="pt-nav-sep" aria-hidden />
            <section className="pt-res" aria-label={`Resumo de ${MESES[hoje.getMonth()]}`}>
              <h2 className="pt-res-tit">Resumo · {MESES[hoje.getMonth()]}</h2>
              <dl>
                <div><dt>Em aberto <span className="num">· {resumo.abertas}</span></dt><dd className="num">{reais(resumo.valorAberto)}</dd></div>
                <div><dt>Concluídas no mês <span className="num">· {resumo.concluidasMes}</span></dt><dd className="num">{reais(resumo.valorConcluidoMes)}</dd></div>
                <div><dt>Escritório recebe</dt><dd className="num">{reais(resumo.escritorioMes)}</dd></div>
                <div><dt>{escopo === 'minhas' ? 'Você recebe' : 'Atendentes recebem'}</dt><dd className="num" data-tom="verde">{reais(resumo.atendenteMes)}</dd></div>
              </dl>
              <p className="pt-res-pe">Recebimentos contam as concluídas no mês. Escritório = os 30% inteiros (já inclui a parte do atendente).</p>
            </section>
            {!f.real && <p className="pt-nav-pe">Demonstração: nada é salvo.</p>}
          </nav>

          <section className="vidro pt-lista" aria-label={rotuloVista?.rotulo}>
            <div className="pt-lista-cab">
              <h2>{rotuloVista?.rotulo}</h2>
              {!f.carregando && lista.length > 0 && <span className="pt-lista-n num">{lista.length}</span>}
              <label className="pt-filtro">
                <IcBusca />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone" aria-label="Procurar nesta lista por nome ou telefone" />
                {busca && <button type="button" className="pt-x" onClick={() => setBusca('')} aria-label="Limpar a busca"><IcX t={12} /></button>}
              </label>
            </div>
            <div className="pt-rolo" ref={rolo}
              onKeyDown={(e) => {
                if (!(e.target as Element).closest?.('.pt-lin')) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
              }}>
              {f.carregando ? <EsqueletoLista /> : lista.length === 0 ? (
                <div className="pt-vazio">
                  <span className="pt-vazio-ic">{busca.trim() ? <IcBusca t={22} /> : <IcVista v={vista} t={22} />}</span>
                  <b>{busca.trim() ? 'Ninguém com esse nome ou telefone' : rotuloVista?.vazioT}</b>
                  <p>{busca.trim() ? `Nada encontrado em ${rotuloVista?.rotulo}.` : rotuloVista?.vazio}</p>
                  {!busca.trim() && vista === 'aguardando_aceite' && (
                    <BotaoSec mini onClick={() => setNova(true)}><IcMais />Nova portabilidade</BotaoSec>
                  )}
                </div>
              ) : lista.map((p) => (
                <Linha key={p.id} p={p} ativo={p.id === selEf} equipe={escopo === 'equipe'} aoClicar={() => setSel(p.id)} />
              ))}
            </div>
          </section>

          {!listaVazia && (
            <aside className="vidro pt-cli" aria-label="Portabilidade aberta">
              <div className="pt-cli-rolo" ref={painelRolo}>
                {atual ? <Painel key={atual.id} p={atual} /> : <EsqueletoPainel />}
              </div>
            </aside>
          )}
        </div>

        {nova && (
          <NovaPortabilidade f={f} aoFechar={() => setNova(false)}
            aoCriar={(id, atendenteId) => {
              setNova(false);
              if (escopo === 'minhas' && atendenteId !== f.usuario.id) setEscopo('equipe');
              setVista('aguardando_aceite'); setBusca(''); setSel(id);
              avisar('Portabilidade adicionada. Agora é esperar o cliente aceitar.');
            }} />
        )}
        {trocar && (
          <TrocarAtendente p={trocar} aoFechar={() => setTrocar(null)}
            aoTrocou={(atendenteId) => {
              setTrocar(null);
              if (escopo === 'minhas' && atendenteId !== f.usuario.id) setEscopo('equipe');
            }} />
        )}
        <ConfirmDialogV2 aberto={!!excluir} titulo="Tirar da aba Portabilidades?" carregando={ocupado}
          mensagem={<span className="pt-dlg-tx">
            A portabilidade de <b>{excluir ? nomeBonito(f.cliente(excluir.clienteId).nome) : ''}</b> e o histórico dela saem desta aba.
            O cliente continua no Atenvo.
          </span>}
          rotuloConfirmar="Tirar da aba" destrutivo aoCancelar={() => setExcluir(null)}
          aoConfirmar={async () => {
            const p = excluir;
            if (!p) return;
            if (await rodar(p.id, () => f.acoes.excluir(p.id), { ok: 'Portabilidade tirada da aba.' })) setExcluir(null);
          }} />
        {toast && (
          <div key={toast.n} className="pt-toast" data-tom={toast.tom} role="status">
            {toast.tom === 'ok' ? <IcCheck /> : toast.tom === 'erro' ? <IcAlerta /> : <IcInfo />}
            <span>{toast.texto}</span>
          </div>
        )}
      </div>
    </PortCtx.Provider>
  );
}

/* ---------------- carregando ---------------- */
function EsqueletoLista() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="pt-lin pt-lin-esq">
          <Skeleton largura={32} altura={32} raio={99} />
          <span className="pt-lin-tx"><Skeleton largura="40%" altura={11} /><Skeleton largura="64%" altura={10} /></span>
          <Skeleton largura={72} altura={10} />
        </div>
      ))}
    </div>
  );
}
function EsqueletoPainel() {
  return (
    <div className="pt-cli-in" aria-hidden>
      <div className="pt-cli-cab"><Skeleton largura={40} altura={40} raio={99} /><span className="pt-cli-quem"><Skeleton largura="50%" altura={13} /><Skeleton largura="70%" altura={10} /></span></div>
      <Skeleton altura={150} raio={8} />
    </div>
  );
}

/* ---------------- linha da lista ---------------- */
/** três marcas: aceite · benefício · link (cheia = feito; âmbar = link enviado esperando o cliente) */
function Progresso({ p }: { p: Portabilidade }) {
  const l = estadoLink(p);
  const marcas: { e: 'ok' | 'meio' | 'nao'; t: string }[] = [
    { e: p.aceite === 'aceitou' ? 'ok' : 'nao', t: p.aceite === 'aceitou' ? 'Aceitou' : 'Sem aceite' },
    { e: p.desbloqueadoEm ? 'ok' : 'nao', t: p.desbloqueadoEm ? 'Benefício desbloqueado' : 'Benefício bloqueado' },
    { e: l === 'feito' ? 'ok' : l === 'enviado' ? 'meio' : 'nao', t: l === 'feito' ? 'Cliente fez o link' : l === 'enviado' ? 'Link enviado' : 'Link não enviado' },
  ];
  const rot = marcas.map((m) => m.t).join(' · ');
  return (
    <span className="pt-prog" role="img" aria-label={rot} title={rot}>
      {marcas.map((m, i) => <i key={i} data-e={m.e} />)}
    </span>
  );
}

function Linha({ p, ativo, equipe, aoClicar }: { p: Portabilidade; ativo: boolean; equipe: boolean; aoClicar: () => void }) {
  const { f } = usePort();
  const c = f.cliente(p.clienteId);
  const s = situacao(p);
  const falta = oQueFalta(p);
  const quando = s === 'concluida' ? `concluída ${quandoCurto(p.concluidaEm!).split(' ')[0]}`
    : s === 'nao_aceitou' ? quandoCurto(p.aceiteEm ?? p.atualizadaEm).split(' ')[0]
      : s === 'aguardando_aceite' ? haQuanto(p.criadaEm) : '';
  return (
    <div className="pt-lin" role="button" tabIndex={0} data-id={p.id} data-ativo={ativo ? '' : undefined}
      aria-current={ativo ? 'true' : undefined} onClick={aoClicar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoClicar(); } }}>
      <span className="pt-av" aria-hidden>{iniciais(c.nome)}</span>
      <span className="pt-lin-tx">
        <span className="pt-lin-nome">{nomeBonito(c.nome)}</span>
        <span className="pt-lin-sub" data-tom={falta.tom}><span>{falta.texto}</span></span>
      </span>
      <span className="pt-lin-dir">
        <span className="pt-lin-val num">{reais(p.valorTotal)}</span>
        <span className="pt-lin-meta">
          {equipe && <span className="pt-lin-at">{f.atendente(p.atendenteId)}</span>}
          {s === 'em_andamento' ? <Progresso p={p} /> : quando ? <span>{quando}</span> : null}
        </span>
      </span>
    </div>
  );
}

/* ---------------- painel do cliente ---------------- */
function Painel({ p }: { p: Portabilidade }) {
  const { f } = usePort();
  const c = f.cliente(p.clienteId);
  const falta = oQueFalta(p);
  return (
    <div className="pt-cli-in">
      <div className="pt-cli-cab">
        <span className="pt-av pt-av-g" aria-hidden>{iniciais(c.nome)}</span>
        <span className="pt-cli-quem">
          <h2 title={nomeBonito(c.nome)}>{nomeBonito(c.nome)}</h2>
          <span>{c.telefone && <><span className="num">{c.telefone}</span> · </>}Atendente: {f.atendente(p.atendenteId)}</span>
        </span>
      </div>
      <div className="pt-sit" data-tom={falta.tom} role="status">
        <span className="pt-sit-rot">Situação</span>
        <span className="pt-sit-val">{falta.texto}</span>
      </div>
      <Valores p={p} />
      <Etapas p={p} />
      <Acoes p={p} />
      <Historico p={p} />
    </div>
  );
}

/* ---------------- valores ---------------- */
function Valores({ p }: { p: Portabilidade }) {
  const { f, rodar, ocupado } = usePort();
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState('');
  const novo = centavosDe(txt);
  const travado = !!p.concluidaEm || p.aceite === 'recusou';
  const salvar = async () => {
    if (!(novo > 0)) return;
    if (novo === p.valorTotal) { setEditando(false); return; }
    if (await rodar(p.id, () => f.acoes.valor(p.id, novo), { ok: 'Valor atualizado.' })) setEditando(false);
  };
  return (
    <section className="pt-valor" aria-label="Valores">
      <div className="pt-valor-cab">
        <span className="pt-rot">Valor que o cliente vai receber</span>
      </div>
      {editando ? (
        <form className="pt-valor-ed" onSubmit={(e) => { e.preventDefault(); void salvar(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditando(false); } }}>
          <span className="pt-rs-w">
            <span aria-hidden>R$</span>
            <input className="inp num" inputMode="numeric" autoFocus value={txt} aria-label="Valor que o cliente vai receber"
              onChange={(e) => setTxt(mascaraReais(e.target.value))} />
          </span>
          <BotaoPrimario mini type="submit" disabled={!(novo > 0) || ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
          <BotaoSec mini onClick={() => setEditando(false)} disabled={ocupado}>Cancelar</BotaoSec>
        </form>
      ) : (
        <div className="pt-valor-tot">
          <span className="num">{reais(p.valorTotal)}</span>
          {!travado && (
            <button type="button" className="pt-icb" title="Mudar o valor" aria-label="Mudar o valor"
              onClick={() => { setTxt(campoDe(p.valorTotal)); setEditando(true); }}><IcLapis /></button>
          )}
        </div>
      )}
      <Partes d={editando ? dividir(novo) : p.divisao} atendente={f.atendente(p.atendenteId)} />
    </section>
  );
}

/* ---------------- etapas ---------------- */
type EstadoEtapa = 'feito' | 'atual' | 'espera' | 'pendente' | 'travado' | 'recusado';
function Etapa({ n, ic, titulo, e, sub, children }: { n: number; ic: ReactNode; titulo: string; e: EstadoEtapa; sub: ReactNode; children?: ReactNode }) {
  return (
    <li className="pt-et" data-e={e}>
      <span className="pt-et-pt" aria-hidden>{e === 'feito' ? <IcCheck t={12} /> : e === 'recusado' ? <IcX t={11} /> : n}</span>
      <div className="pt-et-tx">
        <span className="pt-et-t"><span className="pt-et-ic" aria-hidden>{ic}</span>{titulo}</span>
        <span className="pt-et-s">{sub}</span>
        {children && <div className="pt-et-ac">{children}</div>}
      </div>
    </li>
  );
}
function Desfazer({ onClick, rotulo = 'Desfazer' }: { onClick: () => void; rotulo?: string }) {
  const { ocupado } = usePort();
  return <button type="button" className="pt-link" onClick={onClick} disabled={ocupado}><IcDesfazer />{rotulo}</button>;
}

/** botão de etapa: o do próximo passo é o primário */
function Bt({ pri, children, onClick }: { pri: boolean; children: ReactNode; onClick: () => void }) {
  const { ocupado } = usePort();
  return pri ? <BotaoPrimario mini onClick={onClick} disabled={ocupado}>{children}</BotaoPrimario>
    : <BotaoSec mini onClick={onClick} disabled={ocupado}>{children}</BotaoSec>;
}

function Etapas({ p }: { p: Portabilidade }) {
  const { f, rodar } = usePort();
  const aceitou = p.aceite === 'aceitou';
  const conc = !!p.concluidaEm;
  const l = estadoLink(p);
  const algumaEtapa = !!p.desbloqueadoEm || !!p.linkEnviadoEm;
  /* um primário só: o próximo passo (benefício antes do link) */
  const proximo = conc || !aceitou ? (p.aceite === 'aguardando' ? 'aceite' : '')
    : !p.desbloqueadoEm ? 'desbloqueio' : l !== 'feito' ? 'link' : 'concluir';
  const travadoSub = 'Depois que o cliente aceitar';

  return (
    <section className="pt-ets-sec" aria-label="Andamento">
      <h3 className="pt-sec-t">Andamento</h3>
      <ol className="pt-ets">
        {/* 1. aceite */}
        {p.aceite === 'aguardando' ? (
          <Etapa n={1} ic={<IcAceite />} titulo="Cliente aceitou?" e="atual" sub={<>Esperando a resposta do cliente · entrou {haQuanto(p.criadaEm)}</>}>
            <Bt pri onClick={() => void rodar(p.id, () => f.acoes.aceite(p.id, 'aceitou'), { destino: 'em_andamento', ok: 'Cliente aceitou.' })}><IcCheck t={13} />Aceitou</Bt>
            <Bt pri={false} onClick={() => void rodar(p.id, () => f.acoes.aceite(p.id, 'recusou'), { destino: 'nao_aceitou', ok: 'Marcado: não aceitou.' })}><IcX t={12} />Não aceitou</Bt>
          </Etapa>
        ) : aceitou ? (
          <Etapa n={1} ic={<IcAceite />} titulo="Cliente aceitou" e="feito" sub={p.aceiteEm ? quandoCurto(p.aceiteEm) : ''}>
            {!algumaEtapa && !conc && <Desfazer onClick={() => void rodar(p.id, () => f.acoes.aceite(p.id, 'aguardando'), { destino: 'aguardando_aceite' })} />}
          </Etapa>
        ) : (
          <Etapa n={1} ic={<IcAceite />} titulo="Cliente não aceitou" e="recusado" sub={p.aceiteEm ? quandoCurto(p.aceiteEm) : ''}>
            <Bt pri={false} onClick={() => void rodar(p.id, () => f.acoes.aceite(p.id, 'aguardando'), { destino: 'aguardando_aceite', ok: 'Voltou a negociar.' })}>Voltar a negociar</Bt>
          </Etapa>
        )}

        {/* 2. desbloqueio do benefício */}
        {!aceitou ? (
          <Etapa n={2} ic={<IcCadeado />} titulo="Desbloqueio do benefício" e="travado" sub={travadoSub} />
        ) : p.desbloqueadoEm ? (
          <Etapa n={2} ic={<IcCadeado />} titulo="Benefício desbloqueado" e="feito" sub={quandoCurto(p.desbloqueadoEm)}>
            {!conc && <Desfazer onClick={() => void rodar(p.id, () => f.acoes.desbloqueio(p.id, false))} />}
          </Etapa>
        ) : (
          <Etapa n={2} ic={<IcCadeado />} titulo="Desbloqueio do benefício" e={proximo === 'desbloqueio' ? 'atual' : 'pendente'} sub="Pendente">
            <Bt pri={proximo === 'desbloqueio'} onClick={() => void rodar(p.id, () => f.acoes.desbloqueio(p.id, true), { ok: 'Benefício desbloqueado.' })}><IcCheck t={13} />Benefício desbloqueado</Bt>
          </Etapa>
        )}

        {/* 3. link */}
        {!aceitou ? (
          <Etapa n={3} ic={<IcLink />} titulo="Link da portabilidade" e="travado" sub={travadoSub} />
        ) : l === 'feito' ? (
          <Etapa n={3} ic={<IcLink />} titulo="Cliente fez o link" e="feito"
            sub={<>{quandoCurto(p.linkFeitoEm!)}{p.linkEnviadoEm && <> · enviado {quandoCurto(p.linkEnviadoEm)}</>}</>}>
            {!conc && <Desfazer onClick={() => void rodar(p.id, () => f.acoes.link(p.id, 'enviado'))} />}
          </Etapa>
        ) : l === 'enviado' ? (
          <Etapa n={3} ic={<IcLink />} titulo="Link enviado ao cliente" e="espera"
            sub={<>Enviado {quandoCurto(p.linkEnviadoEm!)} · esperando o cliente fazer</>}>
            <Bt pri={proximo === 'link'} onClick={() => void rodar(p.id, () => f.acoes.link(p.id, 'feito'), { ok: 'Cliente fez o link.' })}><IcCheck t={13} />Cliente fez o link</Bt>
            <Desfazer onClick={() => void rodar(p.id, () => f.acoes.link(p.id, 'nao_enviado'))} />
          </Etapa>
        ) : (
          <Etapa n={3} ic={<IcLink />} titulo="Link da portabilidade" e={proximo === 'link' ? 'atual' : 'pendente'} sub="Ainda não enviado ao cliente">
            <Bt pri={proximo === 'link'} onClick={() => void rodar(p.id, () => f.acoes.link(p.id, 'enviado'), { ok: 'Link marcado como enviado.' })}><IcCheck t={13} />Link enviado</Bt>
          </Etapa>
        )}

        {/* 4. conclusão */}
        {conc ? (
          <Etapa n={4} ic={<IcBandeira />} titulo="Portabilidade concluída" e="feito" sub={quandoCurto(p.concluidaEm!)}>
            <Desfazer rotulo="Reabrir" onClick={() => void rodar(p.id, () => f.acoes.reabrir(p.id), { destino: 'em_andamento', ok: 'Portabilidade reaberta.' })} />
          </Etapa>
        ) : podeConcluir(p) ? (
          <Etapa n={4} ic={<IcBandeira />} titulo="Concluir a portabilidade" e="atual" sub="Benefício desbloqueado e link feito. Falta confirmar a conclusão.">
            <Bt pri onClick={() => void rodar(p.id, () => f.acoes.concluir(p.id), { destino: 'concluida', ok: 'Portabilidade concluída.' })}><IcBandeira t={13} />Marcar como concluída</Bt>
          </Etapa>
        ) : (
          <Etapa n={4} ic={<IcBandeira />} titulo="Portabilidade concluída" e="travado"
            sub={aceitou ? 'Libera quando o benefício estiver desbloqueado e o cliente fizer o link' : travadoSub} />
        )}
      </ol>
    </section>
  );
}

/* ---------------- ações ---------------- */
function Acoes({ p }: { p: Portabilidade }) {
  const { aoAbrirConversa, aoTrocarAtendente, aoExcluir } = usePort();
  const [menu, setMenu] = useState(false);
  const w = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!w.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);
  return (
    <div className="pt-acoes">
      <BotaoSec onClick={() => aoAbrirConversa(p)}><IcConversa />Abrir conversa</BotaoSec>
      <div className="pt-menu-w" ref={w}>
        <BotaoSec className="pt-mais-b" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><IcMaisAcoes /></BotaoSec>
        {menu && (
          <div className="pt-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); aoTrocarAtendente(p); }}><IcPessoa />Trocar atendente</button>
            <button type="button" role="menuitem" className="pt-menu-perigo" onClick={() => { setMenu(false); aoExcluir(p); }}><IcLixo />Tirar da aba</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrocarAtendente({ p, aoFechar, aoTrocou }: { p: Portabilidade; aoFechar: () => void; aoTrocou: (id: string) => void }) {
  const { f, rodar, ocupado } = usePort();
  const [escolhido, setEscolhido] = useState(p.atendenteId);
  const salvar = async () => {
    if (escolhido === p.atendenteId) { aoFechar(); return; }
    if (await rodar(p.id, () => f.acoes.trocarAtendente(p.id, escolhido), { ok: `Atendente agora é ${f.atendente(escolhido)}.` })) aoTrocou(escolhido);
  };
  const d = p.divisao;
  return (
    <ModalV2 aberto aoFechar={() => { if (!ocupado) aoFechar(); }} fecharNoVeu={!ocupado} titulo="Trocar atendente" largura={400}
      rodape={<>
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario onClick={() => void salvar()} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
      </>}>
      <div className="pt-at-lista" role="radiogroup" aria-label="Atendente">
        {f.atendentes.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={escolhido === a.id} className="pt-at" onClick={() => setEscolhido(a.id)}>
            <span className="pt-av" aria-hidden>{iniciais(a.nome)}</span>
            <span>{a.nome}{a.id === f.usuario.id && <span className="pt-at-voce"> · você</span>}</span>
            {escolhido === a.id && <IcCheck />}
          </button>
        ))}
      </div>
      <p className="pt-dlg-tx pt-at-nota">A parte do atendente (<span className="num">{reais(d.atendente)}</span>) passa para quem você escolher.</p>
    </ModalV2>
  );
}

/* ---------------- anotações + histórico ---------------- */
function Historico({ p }: { p: Portabilidade }) {
  const { f, rodar, ocupado } = usePort();
  const [txt, setTxt] = useState('');
  const anotar = async () => {
    const t = txt.trim();
    if (!t) return;
    if (await rodar(p.id, () => f.acoes.anotar(p.id, t))) setTxt('');
  };
  const eventos = [...p.eventos].reverse();
  return (
    <section className="pt-hist" aria-label="Anotações e histórico">
      <h3 className="pt-sec-t">Anotações e histórico</h3>
      <form className="pt-nota" onSubmit={(e) => { e.preventDefault(); void anotar(); }}>
        <textarea className="inp" rows={2} maxLength={500} value={txt} onChange={(e) => setTxt(e.target.value)}
          placeholder="Anote o que aconteceu (ex.: o que o cliente falou)" aria-label="Nova anotação"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void anotar(); } }} />
        <BotaoSec mini type="submit" disabled={!txt.trim() || ocupado}>Anotar</BotaoSec>
      </form>
      <ol className="pt-tl">
        {eventos.map((ev) => (
          <li key={ev.id} className="pt-tl-it" data-e={ev.tipo}>
            <span className="pt-tl-pt" aria-hidden>{ev.tipo === 'concluida' ? <IcCheck t={10} /> : null}</span>
            <span className="pt-tl-tx">
              <span className="pt-tl-q">{ev.texto}</span>
              <span className="pt-tl-s">{ev.tipo === 'nota' ? `Anotação de ${ev.autor}` : ev.autor}</span>
            </span>
            <span className="pt-tl-h">{quandoCurto(ev.quando)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
