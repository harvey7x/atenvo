/* ATENDIMENTO › AGENDA (26/11, "igual" ao sistema que a Reviza usava antes). Dia, semana, mês e lista; "Nova reunião"
   (reunião, ligação, retorno, videochamada) com dia, hora, quanto dura, quem faz e o cliente; clicar abre os detalhes
   (marcar como feita, cliente faltou, cancelar, editar, abrir a conversa). Os presenciais entram no mesmo calendário.
   Endereços: ?reuniao=<id> abre uma; ?nova=1&conversa=<id>&cliente=<nome> já abre "Nova reunião" com o cliente.
   Dados: @/data/agenda (migration 109) e @/data/presenciais. Recurso 'agenda'. */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { usePresenciais } from '@/data/presenciais';
import {
  DURACOES, ROTULO_STATUS, TIPOS_REUNIAO, diaSP, gradeDoMes, horaSP, instanteSP, janelaDaVisao, nomeDiaCurto, nomeTipo, posicaoNaGrade,
  rotuloPeriodo, semanaDe, somaDias, useApagarReuniao, useReunioes, useSalvarReuniao, useStatusReuniao, validarReuniao,
  type NovaReuniao, type Reuniao, type StatusReuniao, type TipoReuniao,
} from '@/data/agenda';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, ModalV2, Segmentado } from '../components';
import './agenda.css';

type Visao = 'dia' | 'semana' | 'mes' | 'lista';
/** o que o calendário desenha: as reuniões e os presenciais na mesma forma */
interface Item { id: string; titulo: string; tipo: TipoReuniao | 'presencial'; inicio: string; duracaoMin: number; cliente: string | null; resp: string | null; status: StatusReuniao; r?: Reuniao }
const H_INI = 7, H_FIM = 21;
const HORAS = Array.from({ length: H_FIM - H_INI }, (_, i) => `${String(H_INI + i).padStart(2, '0')}:00`);

export default function Agenda() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const hoje = diaSP(new Date());
  const [visao, setVisao] = useState<Visao>('semana');
  const [dia, setDia] = useState(hoje);
  const [soMinhas, setSoMinhas] = useState(false);
  const [editando, setEditando] = useState<NovaReuniao | null>(() => (params.get('nova') ? novaPadrao(hoje, params.get('conversa'), params.get('cliente'), params.get('titulo'), user?.id ?? null) : null));
  const aberto = params.get('reuniao');
  const janela = useMemo(() => janelaDaVisao(visao, dia), [visao, dia]);
  const q = useReunioes(janela.ini, janela.fim);
  const presQ = usePresenciais(janela.ini, janela.fim);
  const usuariosQ = useOrgUsuarios();

  const itens = useMemo<Item[]>(() => {
    const rs: Item[] = (q.data ?? []).map((r) => ({ id: r.id, titulo: r.titulo, tipo: r.tipo, inicio: r.inicio, duracaoMin: r.duracaoMin, cliente: r.clienteNome, resp: r.responsavelNome, status: r.status, r }));
    const ps: Item[] = (presQ.data ?? []).filter((p) => p.status === 'marcado').map((p) => ({ id: 'p-' + p.id, titulo: 'Presencial', tipo: 'presencial', inicio: p.quando, duracaoMin: 60, cliente: p.clienteNome, resp: p.marcadoPor, status: 'marcada' }));
    const todos = [...rs, ...ps].sort((a, b) => a.inicio.localeCompare(b.inicio));
    return soMinhas ? todos.filter((i) => !i.r || i.r.responsavelId === user?.id || i.r.criadoPor === user?.id) : todos;
  }, [q.data, presQ.data, soMinhas, user?.id]);
  const porDia = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of itens) { const d = diaSP(i.inicio); m.set(d, [...(m.get(d) ?? []), i]); } return m; }, [itens]);
  const passo = visao === 'dia' ? 1 : visao === 'semana' ? 7 : visao === 'lista' ? 7 : 0;
  const mover = (n: number) => setDia((d) => (passo ? somaDias(d, n * passo) : somaDias(`${somaDias(`${d.slice(0, 7)}-15`, n * 30).slice(0, 7)}-01`, 0)));
  const abrir = (i: Item) => { if (i.tipo === 'presencial') { nav('/presenciais'); return; } setParams((p) => { const x = new URLSearchParams(p); x.set('reuniao', i.id); return x; }); };
  const fecharDetalhe = () => setParams((p) => { const x = new URLSearchParams(p); x.delete('reuniao'); return x; });
  const reuniaoAberta = aberto ? (q.data ?? []).find((r) => r.id === aberto) ?? null : null;
  const marcarEm = (d: string, hora = '09:00') => setEditando(novaPadrao(d, null, null, null, user?.id ?? null, hora));

  return (
    <div className="agd" data-agenda>
      <div className="agd-topo">
        <div className="agd-tit">
          <h2>Agenda</h2>
          <p>{rotuloPeriodo(visao, dia)}</p>
        </div>
        <div className="agd-ctrl">
          <div className="agd-nav">
            <BotaoSec mini aria-label="Anterior" onClick={() => mover(-1)}>‹</BotaoSec>
            <BotaoSec mini onClick={() => setDia(hoje)}>Hoje</BotaoSec>
            <BotaoSec mini aria-label="Próximo" onClick={() => mover(1)}>›</BotaoSec>
          </div>
          <Segmentado<Visao> rotulo="Como ver" valor={visao} aoMudar={setVisao}
            opcoes={[{ valor: 'dia', rotulo: 'Dia' }, { valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'lista', rotulo: 'Lista' }]} />
          <label className="agd-minhas"><input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} /> Só as minhas</label>
          <BotaoPrimario onClick={() => marcarEm(dia === hoje ? hoje : dia)}>＋ Nova reunião</BotaoPrimario>
        </div>
      </div>

      {q.isError && !q.data ? <CardVidro className="agd-card"><EstadoErro titulo="Não foi possível carregar a agenda" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} /></CardVidro> : (
        <CardVidro className={'agd-card v-' + visao} aria-busy={q.isFetching || undefined}>
          {(visao === 'semana' || visao === 'dia') && (
            <GradeHoras dias={visao === 'dia' ? [dia] : semanaDe(dia)} hoje={hoje} porDia={porDia} aoAbrir={abrir} aoMarcar={marcarEm} />
          )}
          {visao === 'mes' && <Mes dia={dia} hoje={hoje} porDia={porDia} aoAbrir={abrir} aoMarcar={marcarEm} aoVerDia={(d) => { setDia(d); setVisao('dia'); }} />}
          {visao === 'lista' && <Lista itens={itens} hoje={hoje} aoAbrir={abrir} />}
        </CardVidro>
      )}
      <p className="agd-nota">Os presenciais aparecem aqui também; para marcar ou mudar um presencial, use a tela Presenciais.</p>

      {reuniaoAberta && <Detalhe r={reuniaoAberta} podeApagar={reuniaoAberta.criadoPor === user?.id || currentOrg.role === 'admin'} aoFechar={fecharDetalhe}
        aoEditar={() => { setEditando({ ...reuniaoAberta }); fecharDetalhe(); }} aoAbrirConversa={(id) => nav('/whatsapp?conversa=' + encodeURIComponent(id))} />}
      {editando && <Editor inicial={editando} usuarios={(usuariosQ.data ?? []).map((u) => ({ id: u.id, nome: u.nome }))} aoFechar={() => { setEditando(null); if (params.get('nova')) setParams((p) => { const x = new URLSearchParams(p); ['nova', 'conversa', 'cliente', 'titulo'].forEach((k) => x.delete(k)); return x; }); }} />}
    </div>
  );
}

function novaPadrao(dia: string, conversaId: string | null, cliente: string | null, titulo: string | null, resp: string | null, hora = '09:00'): NovaReuniao {
  return { titulo: titulo ?? (cliente ? `Ligação com ${cliente}` : ''), tipo: cliente ? 'ligacao' : 'reuniao', inicio: instanteSP(dia, hora), duracaoMin: 30, responsavelId: resp, conversaId, clienteNome: cliente, local: null, observacao: null };
}

function Evento({ i, compacto, aoAbrir, estilo }: { i: Item; compacto?: boolean; aoAbrir: (i: Item) => void; estilo?: React.CSSProperties }) {
  return (
    <button type="button" className={`agd-ev t-${i.tipo} s-${i.status}` + (compacto ? ' compacto' : '')} style={estilo} onClick={(e) => { e.stopPropagation(); aoAbrir(i); }}
      title={`${horaSP(i.inicio)} · ${nomeTipo(i.tipo)} · ${i.titulo}${i.cliente ? ' · ' + i.cliente : ''}${i.resp ? ' · ' + i.resp : ''}`}>
      <span className="h num">{horaSP(i.inicio)}</span>
      <span className="t">{i.titulo}</span>
      {!compacto && i.cliente && <span className="c">{i.cliente}</span>}
    </button>
  );
}

function GradeHoras({ dias, hoje, porDia, aoAbrir, aoMarcar }: { dias: string[]; hoje: string; porDia: Map<string, Item[]>; aoAbrir: (i: Item) => void; aoMarcar: (dia: string, hora: string) => void }) {
  return (
    <div className="agd-grade" style={{ ['--n' as string]: dias.length }}>
      <div className="agd-cab">
        <span />
        {dias.map((d) => <span key={d} className={d === hoje ? 'hoje' : undefined}>{nomeDiaCurto(d)}</span>)}
      </div>
      <div className="agd-corpo">
        <div className="agd-horas">{HORAS.map((h) => <span key={h} className="num">{h}</span>)}</div>
        {dias.map((d) => (
          <div key={d} className={'agd-col' + (d === hoje ? ' hoje' : '')}>
            {HORAS.map((h) => <button key={h} type="button" className="agd-slot" aria-label={`Marcar em ${nomeDiaCurto(d)} às ${h}`} onClick={() => aoMarcar(d, h)} />)}
            {(porDia.get(d) ?? []).map((i) => { const p = posicaoNaGrade(i.inicio, i.duracaoMin, H_INI, H_FIM); return <Evento key={i.id} i={i} compacto={i.duracaoMin < 60} aoAbrir={aoAbrir} estilo={{ top: `${p.topo}%`, height: `${p.altura}%` }} />; })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Mes({ dia, hoje, porDia, aoAbrir, aoMarcar, aoVerDia }: { dia: string; hoje: string; porDia: Map<string, Item[]>; aoAbrir: (i: Item) => void; aoMarcar: (d: string) => void; aoVerDia: (d: string) => void }) {
  const g = gradeDoMes(dia); const mes = dia.slice(0, 7);
  return (
    <div className="agd-mes">
      <div className="agd-mes-cab">{['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((s) => <span key={s}>{s}</span>)}</div>
      {g.map((sem) => (
        <div key={sem[0]} className="agd-mes-sem">
          {sem.map((d) => { const l = porDia.get(d) ?? []; return (
            <div key={d} className={'agd-mes-dia' + (d.slice(0, 7) !== mes ? ' fora' : '') + (d === hoje ? ' hoje' : '')} onDoubleClick={() => aoMarcar(d)}>
              <button type="button" className="n num" onClick={() => aoVerDia(d)} aria-label={`Ver o dia ${nomeDiaCurto(d)}`}>{Number(d.slice(8))}</button>
              {l.slice(0, 3).map((i) => <Evento key={i.id} i={i} compacto aoAbrir={aoAbrir} />)}
              {l.length > 3 && <button type="button" className="mais" onClick={() => aoVerDia(d)}>+{l.length - 3}</button>}
            </div>
          ); })}
        </div>
      ))}
    </div>
  );
}

function Lista({ itens, hoje, aoAbrir }: { itens: Item[]; hoje: string; aoAbrir: (i: Item) => void }) {
  const grupos = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of itens) { const d = diaSP(i.inicio); m.set(d, [...(m.get(d) ?? []), i]); } return [...m.entries()]; }, [itens]);
  if (!grupos.length) return <p className="agd-vazio">Nada marcado neste período. Use "Nova reunião" para marcar.</p>;
  return (
    <div className="agd-lista">
      {grupos.map(([d, l]) => (
        <section key={d}>
          <h4>{d === hoje ? 'Hoje · ' : ''}{nomeDiaCurto(d)}</h4>
          <ul>{l.map((i) => (
            <li key={i.id}><button type="button" className={`agd-lin t-${i.tipo} s-${i.status}`} onClick={() => aoAbrir(i)}>
              <span className="h num">{horaSP(i.inicio)}</span>
              <span className="tp">{nomeTipo(i.tipo)}</span>
              <span className="t">{i.titulo}{i.cliente ? <small> · {i.cliente}</small> : null}</span>
              <span className="r">{i.resp ?? '—'}</span>
              <span className="st">{i.status !== 'marcada' ? ROTULO_STATUS[i.status] : ''}</span>
            </button></li>
          ))}</ul>
        </section>
      ))}
    </div>
  );
}

function Detalhe({ r, podeApagar, aoFechar, aoEditar, aoAbrirConversa }: { r: Reuniao; podeApagar: boolean; aoFechar: () => void; aoEditar: () => void; aoAbrirConversa: (id: string) => void }) {
  const st = useStatusReuniao(); const apagar = useApagarReuniao();
  const [erro, setErro] = useState('');
  const mudar = (s: StatusReuniao) => st.mutate({ id: r.id, status: s }, { onSuccess: aoFechar, onError: (e) => setErro((e as Error).message) });
  const fim = new Date(new Date(r.inicio).getTime() + r.duracaoMin * 60_000).toISOString();
  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo={r.titulo} largura={480}
      rodape={<>
        {podeApagar && <BotaoSec onClick={() => apagar.mutate(r.id, { onSuccess: aoFechar, onError: (e) => setErro((e as Error).message) })} disabled={apagar.isPending}>Apagar</BotaoSec>}
        <BotaoSec onClick={aoEditar}>Editar</BotaoSec>
        {r.status !== 'feita' && <BotaoPrimario onClick={() => mudar('feita')} disabled={st.isPending}>Marcar como feita</BotaoPrimario>}
      </>}>
      <dl className="agd-det">
        <div><dt>Quando</dt><dd className="num">{nomeDiaCurto(diaSP(r.inicio))} · {horaSP(r.inicio)} às {horaSP(fim)}</dd></div>
        <div><dt>Tipo</dt><dd>{nomeTipo(r.tipo)}</dd></div>
        <div><dt>Quem faz</dt><dd>{r.responsavelNome ?? 'Sem responsável'}</dd></div>
        {r.clienteNome && <div><dt>Cliente</dt><dd>{r.clienteNome}{r.conversaId && <> · <button type="button" className="lnk" onClick={() => aoAbrirConversa(r.conversaId!)}>abrir a conversa</button></>}</dd></div>}
        {r.local && <div><dt>Onde</dt><dd>{r.local}</dd></div>}
        {r.observacao && <div><dt>Observação</dt><dd>{r.observacao}</dd></div>}
        <div><dt>Situação</dt><dd>{ROTULO_STATUS[r.status]}</dd></div>
      </dl>
      {r.status === 'marcada' && (
        <div className="agd-det-acoes">
          <BotaoSec mini onClick={() => mudar('faltou')} disabled={st.isPending}>Cliente faltou</BotaoSec>
          <BotaoSec mini onClick={() => mudar('cancelada')} disabled={st.isPending}>Cancelar</BotaoSec>
        </div>
      )}
      {r.status !== 'marcada' && <div className="agd-det-acoes"><BotaoSec mini onClick={() => mudar('marcada')} disabled={st.isPending}>Voltar para marcada</BotaoSec></div>}
      {erro && <p className="agd-erro" role="alert">{erro}</p>}
    </ModalV2>
  );
}

function Editor({ inicial, usuarios, aoFechar }: { inicial: NovaReuniao; usuarios: { id: string; nome: string }[]; aoFechar: () => void }) {
  const salvar = useSalvarReuniao();
  const [f, setF] = useState<NovaReuniao>(inicial);
  const [diaF, setDiaF] = useState(diaSP(inicial.inicio));
  const [horaF, setHoraF] = useState(horaSP(inicial.inicio));
  const [erro, setErro] = useState('');
  const muda = (p: Partial<NovaReuniao>) => { setF((x) => ({ ...x, ...p })); setErro(''); };
  const gravar = () => {
    const r = { ...f, inicio: instanteSP(diaF, horaF), responsavelNome: usuarios.find((u) => u.id === f.responsavelId)?.nome ?? null };
    const e = validarReuniao(r); if (e) { setErro(e); return; }
    salvar.mutate(r, { onSuccess: aoFechar, onError: (x) => setErro((x as Error).message) });
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo={f.id ? 'Editar' : 'Nova reunião'} largura={520}
      rodape={<><BotaoSec onClick={aoFechar} disabled={salvar.isPending}>Cancelar</BotaoSec><BotaoPrimario onClick={gravar} disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario></>}>
      <div className="agd-form">
        <label className="campo larga"><span>Assunto</span><input className="inp" value={f.titulo} maxLength={120} autoFocus placeholder="Ex.: ligar para ajudar a baixar o histórico" onChange={(e) => muda({ titulo: e.target.value })} /></label>
        <label className="campo"><span>Tipo</span>
          <select className="inp" value={f.tipo} onChange={(e) => muda({ tipo: e.target.value as TipoReuniao })}>{TIPOS_REUNIAO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
        <label className="campo"><span>Quem faz</span>
          <select className="inp" value={f.responsavelId ?? ''} onChange={(e) => muda({ responsavelId: e.target.value || null })}>
            <option value="">Sem responsável</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select></label>
        <label className="campo"><span>Dia</span><input className="inp" type="date" value={diaF} onChange={(e) => setDiaF(e.target.value)} /></label>
        <label className="campo"><span>Hora</span><input className="inp" type="time" step={300} value={horaF} onChange={(e) => setHoraF(e.target.value)} /></label>
        <label className="campo"><span>Quanto dura</span>
          <select className="inp" value={f.duracaoMin} onChange={(e) => muda({ duracaoMin: Number(e.target.value) })}>{(DURACOES.includes(f.duracaoMin) ? DURACOES : [...DURACOES, f.duracaoMin].sort((a, b) => a - b)).map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} h`}</option>)}</select></label>
        <label className="campo"><span>Onde (opcional)</span><input className="inp" value={f.local ?? ''} maxLength={200} placeholder="Escritório, telefone, link da chamada…" onChange={(e) => muda({ local: e.target.value })} /></label>
        {f.clienteNome && <p className="campo larga agd-cli">Cliente: <b>{f.clienteNome}</b></p>}
        <label className="campo larga"><span>Observação (opcional)</span><textarea className="inp" rows={2} maxLength={1000} value={f.observacao ?? ''} onChange={(e) => muda({ observacao: e.target.value })} /></label>
      </div>
      {erro && <p className="agd-erro" role="alert">{erro}</p>}
    </ModalV2>
  );
}
