import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FILTROS_PADRAO, PRIORIDADES, ROTULO_PRIORIDADE, ROTULO_STATUS, STATUS_TAREFA, estaAtrasada, filtrarTarefas, minha, ordenarTarefas,
  progressoItens, projetosDe, resumoTarefas, useMudarStatusTarefa, useTarefas,
  type FiltrosTarefa, type RascunhoTarefa, type StatusTarefa, type Tarefa,
} from '@/data/tarefas';
import { BadgeStatus, BotaoPrimario, CardVidro, EstadoErro, EstadoVazio, Segmentado, Skeleton, type TomStatus } from '../components';
import { CartaoMetricaFixo, GradeMetricas } from '../components/CartaoMetrica';
import { CaixaConcluir, IcBusca, IcConversa, IcLista, IcTexto, Pessoa, SeloPrazo, SeloPrioridade, useEquipeComigo, useEuTarefas } from './tarefas/comum';
import { TarefaModal } from './tarefas/TarefaModal';
import './tarefas/tarefas.css';

/* ------------------------------------------------------------------
   TAREFAS DA EQUIPE (dono 25/11: as funções úteis do sistema que a Reviza usava antes). Lista (padrão) ou
   quadro por situação; no topo, os quatro números do dia (abertas, atrasadas, para hoje, concluídas na
   semana). Filtros: minhas/todas, situação, responsável, prioridade, só atrasadas e busca. A caixinha conclui
   na hora (com "Desfazer"). O administrador vê as tarefas de todos; os demais, as que criaram ou estão com eles.
   Os dados: src/data/tarefas.ts (banco: migration 101).
   ------------------------------------------------------------------ */

type Visao = 'lista' | 'quadro';
const GUARDA_VISAO = 'reviza-tarefas-visao';
const TOM_STATUS: Record<StatusTarefa, TomStatus> = { pendente: 'neutro', andamento: 'atencao', concluida: 'ok' };
const MAX_CONCLUIDAS_QUADRO = 30;

type Aviso = { texto: string; erro?: boolean; desfazer?: () => void } | null;
type ModalAberto = { tarefa: Tarefa | null; inicial?: Partial<RascunhoTarefa> } | null;

export default function Tarefas() {
  const navigate = useNavigate();
  const eu = useEuTarefas();
  const q = useTarefas(eu);
  const { equipe, nomeDe } = useEquipeComigo();
  const mudar = useMudarStatusTarefa(eu);
  const [params, setParams] = useSearchParams();

  const [visao, setVisao] = useState<Visao>(() => { try { return localStorage.getItem(GUARDA_VISAO) === 'quadro' ? 'quadro' : 'lista'; } catch { return 'lista'; } });
  useEffect(() => { try { localStorage.setItem(GUARDA_VISAO, visao); } catch { /* privado */ } }, [visao]);
  const [f, setF] = useState<FiltrosTarefa>(() => ({ ...FILTROS_PADRAO, escopo: eu.admin ? 'todas' : 'minhas' }));
  // o papel pode chegar depois da primeira pintura: enquanto a pessoa não escolheu, o administrador abre em "Todas"
  const escopoEscolhido = useRef(false);
  const setFiltro = <K extends keyof FiltrosTarefa>(k: K, v: FiltrosTarefa[K]) => { if (k === 'escopo') escopoEscolhido.current = true; setF((x) => ({ ...x, [k]: v })); };
  useEffect(() => { if (!escopoEscolhido.current) setF((x) => ({ ...x, escopo: eu.admin ? 'todas' : 'minhas' })); }, [eu.admin]);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const [modal, setModal] = useState<ModalAberto>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  useEffect(() => { if (!aviso || aviso.erro) return; const t = setTimeout(() => setAviso(null), 7000); return () => clearTimeout(t); }, [aviso]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [soltarEm, setSoltarEm] = useState<StatusTarefa | null>(null);

  const todas = useMemo(() => q.data ?? [], [q.data]);
  const doEscopo = useMemo(() => (f.escopo === 'minhas' ? todas.filter((t) => minha(t, eu.id)) : todas), [todas, f.escopo, eu.id]);
  const resumo = useMemo(() => resumoTarefas(doEscopo, agora), [doEscopo, agora]);
  const andamento = doEscopo.filter((t) => t.status === 'andamento').length;
  const visiveis = useMemo(() => ordenarTarefas(filtrarTarefas(todas, f, eu.id, agora, visao === 'quadro')), [todas, f, eu.id, agora, visao]);
  const projetos = useMemo(() => projetosDe(todas), [todas]);
  const filtrosAtivos = f.status !== FILTROS_PADRAO.status || !!f.responsavel || !!f.prioridade || f.soAtrasadas || !!f.busca.trim();

  // link direto (o aviso do sino leva a /tarefas?tarefa=<id>; /tarefas?nova=1 abre uma nova)
  useEffect(() => {
    const id = params.get('tarefa');
    const nova = params.get('nova');
    if (!id && !nova) return;
    if (id && !q.data) return; // espera a lista chegar
    if (id) {
      const t = q.data!.find((x) => x.id === id);
      if (t) setModal({ tarefa: t }); else setAviso({ texto: 'Essa tarefa não existe mais ou não está com você.', erro: true });
    } else setModal({ tarefa: null });
    const p = new URLSearchParams(params); p.delete('tarefa'); p.delete('nova');
    setParams(p, { replace: true });
  }, [params, q.data, setParams]);

  function alternar(t: Tarefa) {
    const antes = t.status;
    const depois: StatusTarefa = t.status === 'concluida' ? 'pendente' : 'concluida';
    mudarStatus(t, depois, antes);
  }
  function mudarStatus(t: Tarefa, depois: StatusTarefa, antes: StatusTarefa = t.status) {
    if (depois === antes) return;
    mudar.mutate({ id: t.id, status: depois }, {
      onSuccess: () => setAviso({
        texto: depois === 'concluida' ? `Tarefa concluída: ${t.titulo}` : antes === 'concluida' ? `Tarefa reaberta: ${t.titulo}` : `${t.titulo} · agora ${ROTULO_STATUS[depois].toLowerCase()}`,
        desfazer: () => mudar.mutate({ id: t.id, status: antes }, { onSuccess: () => setAviso(null) }),
      }),
      onError: (e) => setAviso({ texto: (e as Error).message, erro: true }),
    });
  }
  const abrirConversa = (t: Tarefa) => t.conversaId && navigate(`/whatsapp?conversa=${encodeURIComponent(t.conversaId)}`);
  const novaTarefa = (inicial?: Partial<RascunhoTarefa>) => setModal({ tarefa: null, inicial });

  /* ---------- quadro: arrastar entre as colunas ---------- */
  const aoArrastar = (e: DragEvent, t: Tarefa) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(t.id); };
  const aoSoltar = (e: DragEvent, s: StatusTarefa) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || arrastando;
    const t = todas.find((x) => x.id === id);
    setArrastando(null); setSoltarEm(null);
    if (t) mudarStatus(t, s);
  };

  const subLinha = (t: Tarefa) => {
    const { feitos, total } = progressoItens(t);
    if (!t.clienteNome && !total && !t.descricao) return null;
    return (
      <div className="tf-tar-sub">
        {t.clienteNome && (
          t.conversaId
            ? <button type="button" className="tf-cli" title="Abrir a conversa com o cliente" onClick={(e) => { e.stopPropagation(); abrirConversa(t); }}><IcConversa />{t.clienteNome}</button>
            : <span className="tf-cli parado"><IcConversa />{t.clienteNome}</span>
        )}
        {total > 0 && <span className={'tf-itens num' + (feitos === total ? ' completo' : '')} title={`${feitos} de ${total} subtarefas feitas`}><IcLista />{feitos}/{total}</span>}
        {t.descricao && <span className="tf-tem-desc" title={t.descricao}><IcTexto /></span>}
      </div>
    );
  };

  const vazio = !q.isLoading && visiveis.length === 0;
  const textoVazio = todas.length === 0
    ? { titulo: 'Nenhuma tarefa ainda', descricao: 'Crie a primeira tarefa da equipe: o que precisa ser feito, quem faz e até quando.' }
    : { titulo: 'Nenhuma tarefa com esses filtros', descricao: 'Mude os filtros ou limpe a busca para ver as outras tarefas.' };

  return (
    <div className="tf-pagina" data-tarefas>
      <div className="ph sobe tf-ph">
        <div><h2>Tarefas</h2></div>
        <div className="acoes">
          <Segmentado<Visao> rotulo="Como mostrar" valor={visao} aoMudar={setVisao} opcoes={[{ valor: 'lista', rotulo: 'Lista' }, { valor: 'quadro', rotulo: 'Quadro' }]} />
          <BotaoPrimario onClick={() => novaTarefa()}>＋ Nova tarefa</BotaoPrimario>
        </div>
      </div>

      <div className="tf-cards sobe" style={{ animationDelay: '.04s' }}>
        <GradeMetricas rotulo="Resumo das tarefas" colunas={4}>
          <CartaoMetricaFixo titulo="Abertas" icone="lista" valor={resumo.abertas} detalhe={andamento ? `${andamento} em andamento` : 'nenhuma em andamento'} />
          <CartaoMetricaFixo titulo="Atrasadas" icone="alerta" valor={resumo.atrasadas} detalhe="passaram do prazo" />
          <CartaoMetricaFixo titulo="Para hoje" icone="calendario" valor={resumo.paraHoje} detalhe="vencem até o fim do dia" />
          <CartaoMetricaFixo titulo="Concluídas na semana" icone="certo" valor={resumo.concluidasSemana} detalhe="desde segunda-feira" />
        </GradeMetricas>
      </div>

      <div className="tf-filtros sobe" style={{ animationDelay: '.08s' }} role="search">
        <Segmentado<FiltrosTarefa['escopo']> rotulo="De quem" valor={f.escopo} aoMudar={(v) => setFiltro('escopo', v)}
          opcoes={[{ valor: 'minhas', rotulo: 'Minhas' }, { valor: 'todas', rotulo: 'Todas' }]} />
        <label className="tf-busca">
          <IcBusca />
          <input value={f.busca} onChange={(e) => setFiltro('busca', e.target.value)} placeholder="Buscar tarefa, cliente ou projeto" aria-label="Buscar tarefa" spellCheck={false} />
        </label>
        {visao === 'lista' && (
          <select className="inp tf-sel" aria-label="Situação" value={f.status} onChange={(e) => setFiltro('status', e.target.value as FiltrosTarefa['status'])}>
            <option value="abertas">Abertas</option>
            {STATUS_TAREFA.map((s) => <option key={s} value={s}>{s === 'concluida' ? 'Concluídas' : s === 'pendente' ? 'Pendentes' : ROTULO_STATUS[s]}</option>)}
            <option value="todas">Todas as situações</option>
          </select>
        )}
        <select className="inp tf-sel" aria-label="Responsável" value={f.responsavel} onChange={(e) => setFiltro('responsavel', e.target.value)}>
          <option value="">Qualquer responsável</option>
          <option value="sem">Sem responsável</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{p.id === eu.id ? `${p.nome} (você)` : p.nome}</option>)}
        </select>
        <select className="inp tf-sel" aria-label="Prioridade" value={f.prioridade} onChange={(e) => setFiltro('prioridade', e.target.value as FiltrosTarefa['prioridade'])}>
          <option value="">Qualquer prioridade</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
        </select>
        <button type="button" className={'tf-chip' + (f.soAtrasadas ? ' on' : '')} aria-pressed={f.soAtrasadas} onClick={() => setFiltro('soAtrasadas', !f.soAtrasadas)}>
          Só atrasadas{resumo.atrasadas > 0 && <span className="tf-chip-n num">{resumo.atrasadas}</span>}
        </button>
        {filtrosAtivos && <button type="button" className="tf-lk" onClick={() => setF((x) => ({ ...FILTROS_PADRAO, escopo: x.escopo }))}>Limpar filtros</button>}
      </div>

      {aviso && (
        <div className={'aviso-inline tf-aviso' + (aviso.erro ? ' erro' : '')} role="status">
          <span className="tf-aviso-tx">{aviso.texto}</span>
          {aviso.desfazer && <button type="button" className="tf-desfazer" onClick={aviso.desfazer}>Desfazer</button>}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {q.isError ? (
        <CardVidro sobe><EstadoErro descricao="Não foi possível buscar as tarefas agora." aoTentarDeNovo={() => q.refetch()} /></CardVidro>
      ) : q.isLoading ? (
        <CardVidro className="tf-lista-card"><div style={{ padding: 16 }}><Skeleton largura="70%" /><Skeleton largura="55%" /><Skeleton largura="62%" /></div></CardVidro>
      ) : vazio && visao === 'lista' ? (
        <CardVidro sobe><EstadoVazio titulo={textoVazio.titulo} descricao={textoVazio.descricao} acao={{ rotulo: '＋ Nova tarefa', onClick: () => novaTarefa() }} /></CardVidro>
      ) : visao === 'lista' ? (
        <CardVidro className="tf-lista-card sobe" style={{ animationDelay: '.1s' }}>
          <table className="tf-tab">
            <thead>
              <tr>
                <th className="tf-c-tarefa" scope="col">Tarefa</th>
                <th scope="col">Responsável</th>
                <th scope="col">Prazo</th>
                <th scope="col">Situação</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Projeto</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((t) => (
                <tr key={t.id} className={(estaAtrasada(t, agora) ? 'atrasada ' : '') + (t.status === 'concluida' ? 'feita' : '')} onClick={() => setModal({ tarefa: t })}>
                  <td className="tf-c-tarefa">
                    <div className="tf-tar">
                      <CaixaConcluir feita={t.status === 'concluida'} rotulo={`Concluir: ${t.titulo}`} aoAlternar={() => alternar(t)} />
                      <div className="tf-tar-tx">
                        <button type="button" className="tf-tar-tit" onClick={(e) => { e.stopPropagation(); setModal({ tarefa: t }); }}>{t.titulo}</button>
                        {subLinha(t)}
                      </div>
                    </div>
                  </td>
                  <td className="tf-c-resp"><Pessoa nome={nomeDe(t.responsavelId)} /></td>
                  <td className="tf-c-prazo"><SeloPrazo t={t} agora={agora} /></td>
                  <td className="tf-c-st"><BadgeStatus tom={TOM_STATUS[t.status]}>{ROTULO_STATUS[t.status]}</BadgeStatus></td>
                  <td className="tf-c-prio"><SeloPrioridade p={t.prioridade} /></td>
                  <td className="tf-c-proj">{t.projeto ? <span className="tf-proj">{t.projeto}</span> : <span className="tf-vazio">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tf-tab-pe num">{visiveis.length === 1 ? '1 tarefa' : `${visiveis.length} tarefas`}</div>
        </CardVidro>
      ) : (
        <div className="tf-quadro sobe" style={{ animationDelay: '.1s' }}>
          {STATUS_TAREFA.map((s) => {
            const daColuna = visiveis.filter((t) => t.status === s);
            const mostradas = s === 'concluida' ? daColuna.slice(0, MAX_CONCLUIDAS_QUADRO) : daColuna;
            return (
              <section key={s} className={'tf-col' + (soltarEm === s ? ' alvo' : '')} data-status={s} aria-label={ROTULO_STATUS[s]}
                onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSoltarEm(s); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSoltarEm(null); }}
                onDrop={(e) => aoSoltar(e, s)}>
                <header className="tf-col-cab">
                  <span className={'tf-col-ponto s-' + s} aria-hidden />
                  <h3>{ROTULO_STATUS[s]}</h3>
                  <span className="tf-col-n num">{daColuna.length}</span>
                  {s !== 'concluida' && (
                    <button type="button" className="tf-ib tf-col-mais" aria-label={`Nova tarefa em ${ROTULO_STATUS[s]}`} title="Nova tarefa nesta coluna" onClick={() => novaTarefa({ status: s })}>＋</button>
                  )}
                </header>
                <div className="tf-col-lista">
                  {mostradas.length === 0 && <p className="tf-col-vazia">{s === 'concluida' ? 'Nada concluído por aqui.' : 'Nenhuma tarefa.'}</p>}
                  {mostradas.map((t) => (
                    <article key={t.id} className={'tf-cartao' + (estaAtrasada(t, agora) ? ' atrasada' : '') + (arrastando === t.id ? ' arrastando' : '')}
                      draggable onDragStart={(e) => aoArrastar(e, t)} onDragEnd={() => { setArrastando(null); setSoltarEm(null); }}
                      onClick={() => setModal({ tarefa: t })}>
                      <div className="tf-cartao-topo">
                        <CaixaConcluir feita={t.status === 'concluida'} rotulo={`Concluir: ${t.titulo}`} aoAlternar={() => alternar(t)} />
                        <button type="button" className="tf-tar-tit" onClick={(e) => { e.stopPropagation(); setModal({ tarefa: t }); }}>{t.titulo}</button>
                      </div>
                      {subLinha(t)}
                      <div className="tf-cartao-meta">
                        <SeloPrazo t={t} agora={agora} />
                        <SeloPrioridade p={t.prioridade} curto />
                        {t.projeto && <span className="tf-proj">{t.projeto}</span>}
                      </div>
                      <div className="tf-cartao-pe">
                        <Pessoa nome={nomeDe(t.responsavelId)} />
                        <select className="tf-mover" aria-label={`Mudar a situação de ${t.titulo}`} value={t.status}
                          onClick={(e) => e.stopPropagation()} onChange={(e) => mudarStatus(t, e.target.value as StatusTarefa)}>
                          {STATUS_TAREFA.map((x) => <option key={x} value={x}>{ROTULO_STATUS[x]}</option>)}
                        </select>
                      </div>
                    </article>
                  ))}
                  {daColuna.length > mostradas.length && <p className="tf-col-vazia num">e mais {daColuna.length - mostradas.length} concluídas (veja na lista)</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TarefaModal aberto={!!modal} aoFechar={() => setModal(null)} tarefa={modal?.tarefa ?? null} inicial={modal?.inicial} projetos={projetos}
        aoGravar={(_id, criada, r) => setAviso({ texto: criada ? `Tarefa criada: ${r.titulo.trim()}` : 'Tarefa salva.' })} />
    </div>
  );
}
