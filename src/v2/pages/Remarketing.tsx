import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  REMARKETING_REAL, ETAPA_LABEL, STATUS_LABEL,
  useRemarketingDashboard, useRemarketingLeads, useRemarketingTarefas, useRemarketingEventos,
  useConcluirTarefa, useRemarketingConfig, useSalvarRemarketingConfig,
  type RmktLead, type RmktTarefa, type RmktConfig,
} from '@/data/remarketing';
import { useOrgUsuarios } from '@/data/atendimento';
import { useOrg } from '@/context/OrgContext';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, DrawerV2,
  EstadoErro, EstadoVazio, Input, Kpi, ModalV2, Skeleton, TabelaPadrao, TrilhoItem,
  type Coluna, type TomStatus, type TomTrilho,
} from '../components';
import { tempoRelativo, dataHoraSP } from '../lib/tempo';
import { initials } from '@/lib/avatar';
import './remarketing.css';

/* ------------------------------------------------------------------
   Central de Remarketing (F2) — manual de extensão do CONTRATO:
   cabeçalho .ph + KPIs em vidro (máx 4) + fila "trabalhar agora" +
   tabela padrão com filtros em chips + drawer de detalhe (padrão
   Contatos). Motor (F1) segue inerte até a F3 — a página avisa.
   ------------------------------------------------------------------ */

const ETAPA_TOM: Record<string, TomStatus> = {
  remarketing_1: 'atencao', pendencia: 'atencao',
  recuperacao_1: 'erro', recuperacao_2: 'erro', recuperacao_3: 'erro',
};
const EVENTO_LABEL: Record<string, string> = {
  entrou_remarketing_1: 'Entrou no Remarketing 1',
  entrou_pendencia: 'Entrou em Pendência',
  escalado: 'Escalou de etapa',
  transferido: 'Transferido de atendente',
  tarefa_criada: 'Tarefa criada',
  tarefa_concluida: 'Tentativa registrada (tarefa concluída)',
  respondeu: 'Cliente respondeu',
  recuperado: 'Recuperado',
  perdido: 'Perdido',
};
const EVENTO_TOM: Record<string, TomTrilho> = {
  recuperado: 'info', respondeu: 'info', perdido: 'crit', transferido: 'aten', escalado: 'aten',
};

const horasSem = (iso: string | null, agora: number) => (iso ? Math.floor((agora - new Date(iso).getTime()) / 3_600_000) : null);
const diasSem = (iso: string | null, agora: number) => { const h = horasSem(iso, agora); return h === null ? null : Math.floor(h / 24); };

export default function RemarketingV2() {
  const nav = useNavigate();
  const { currentOrg } = useOrg();
  const agora = Date.now();
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  const dashQ = useRemarketingDashboard();
  const [aba, setAba] = useState<'ativo' | 'encerrados'>('ativo');
  const leadsQ = useRemarketingLeads(aba);
  const tarefasQ = useRemarketingTarefas();
  const configQ = useRemarketingConfig();
  const usuariosQ = useOrgUsuarios();
  const concluir = useConcluirTarefa();

  const [fEtapa, setFEtapa] = useState<string>('todas');
  const [fResp, setFResp] = useState<string>('todos');
  const [fFin, setFFin] = useState<string>('todas');
  const [fDias, setFDias] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [detId, setDetId] = useState<string | null>(null);
  const [cfgAberta, setCfgAberta] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);

  const dash = dashQ.data;
  const leads = leadsQ.data ?? [];
  const tarefas = tarefasQ.data ?? [];

  const financeiras = useMemo(() => [...new Set(leads.map((l) => l.instituicao).filter((x): x is string => !!x))].sort(), [leads]);

  const visiveis = useMemo(() => leads.filter((l) => {
    if (fEtapa !== 'todas' && l.etapa !== fEtapa) return false;
    if (fResp === 'fila' && l.responsavelId) return false;
    if (fResp !== 'todos' && fResp !== 'fila' && l.responsavelId !== fResp) return false;
    if (fFin !== 'todas' && (l.instituicao ?? '') !== fFin) return false;
    if (fDias !== 'todos') {
      const d = diasSem(l.ultimaEntradaEm, agora) ?? 999;
      if (fDias === '2' && d < 2) return false;
      if (fDias === '5' && d < 5) return false;
      if (fDias === '10' && d < 10) return false;
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      if (!l.contatoNome.toLowerCase().includes(q) && !(l.contatoTelefone ?? '').includes(q.replace(/\D+/g, '') || '—')) return false;
    }
    return true;
  }), [leads, fEtapa, fResp, fFin, fDias, busca, agora]);

  const detLead = detId ? leads.find((l) => l.id === detId) ?? null : null;

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); setAviso({ tom: 'ok', texto: 'Mensagem copiada.' }); }
    catch { setAviso({ tom: 'erro', texto: 'Não foi possível copiar.' }); }
  };
  const concluirTarefa = (t: RmktTarefa) => {
    if (!REMARKETING_REAL) { setAviso({ tom: 'ok', texto: 'Modo demonstração: tarefa concluída.' }); return; }
    concluir.mutate(t.id, {
      onSuccess: () => setAviso({ tom: 'ok', texto: 'Tentativa registrada — tarefa concluída.' }),
      onError: (e) => setAviso({ tom: 'erro', texto: (e as Error)?.message || 'Falha ao concluir.' }),
    });
  };

  const colunas: Coluna<RmktLead>[] = [
    { chave: 'contato', titulo: 'Contato', classe: 'nome', render: (l) => (
      <span className="rmk-ct"><span className="rmk-av" aria-hidden>{initials(l.contatoNome)}</span>{l.contatoNome}</span>) },
    { chave: 'etapa', titulo: 'Etapa', render: (l) => (
      aba === 'ativo'
        ? <BadgeStatus tom={ETAPA_TOM[l.etapa] ?? 'neutro'}>{ETAPA_LABEL[l.etapa] ?? l.etapa}</BadgeStatus>
        : <BadgeStatus tom={l.status === 'recuperado' ? 'ok' : 'erro'}>{STATUS_LABEL[l.status] ?? l.status}</BadgeStatus>) },
    { chave: 'resp', titulo: 'Responsável', render: (l) => l.responsavelNome ?? <span className="rmk-fila">na fila</span> },
    { chave: 'tent', titulo: 'Tentativas', dir: true, classe: 'num', render: (l) => l.tentativas },
    { chave: 'silencio', titulo: 'Sem resposta', dir: true, classe: 'num', render: (l) => {
      const d = diasSem(l.ultimaEntradaEm, agora);
      return d === null ? '—' : d === 0 ? 'hoje' : `${d} d`;
    } },
    { chave: 'prox', titulo: 'Próxima ação', render: (l) => l.status !== 'ativo' ? '—' : (l.proximaAcao ?? '—') },
    { chave: 'quando', titulo: 'Quando', dir: true, classe: 'num', render: (l) =>
      l.status !== 'ativo' ? (l.encerradoEm ? tempoRelativo(l.encerradoEm, agora) : '—') : (l.proximaAcaoEm ? tempoRelativo(l.proximaAcaoEm, agora) : '—') },
  ];

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Central de Remarketing</h2>
          <p>Nenhum lead esquecido: etapas, tarefas e transferências automáticas.{REMARKETING_REAL ? '' : ' · modo demonstração (nada é gravado)'}</p>
        </div>
        <div className="acoes">
          {podeConfig && <BotaoSec onClick={() => setCfgAberta(true)}>Configurar</BotaoSec>}
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {configQ.data && !configQ.data.ativo && (
        <div className="aviso-inline rmk-inerte" role="status">
          O motor está <b>desligado</b> — nenhuma etapa muda sozinha ainda. Configure a fila e os prazos; a ativação acontece na fase 3, acompanhada.
        </div>
      )}

      {/* ---------- KPIs (máx 4, manual) ---------- */}
      <div className="kpis">
        <Kpi rotulo="Leads em remarketing" valor={dash?.ativos ?? 0} sobe atraso={0.05}
          delta={{ tom: (dash?.tarefas_vencidas ?? 0) > 0 ? 'atencao' : 'neutro', texto: `${dash?.tarefas_pendentes ?? 0} tarefas pendentes${(dash?.tarefas_vencidas ?? 0) > 0 ? ` · ${dash?.tarefas_vencidas} vencidas` : ''}` }} />
        <Kpi rotulo="Recuperados (30 d)" valor={dash?.recuperados_30d ?? 0} sobe atraso={0.1}
          delta={{ tom: 'neutro', texto: dash?.taxa_recuperacao != null ? `taxa de recuperação ${dash.taxa_recuperacao}%` : 'sem fechados no período' }} />
        <Kpi rotulo="Perdidos (30 d)" valor={dash?.perdidos_30d ?? 0} sobe atraso={0.15} />
        <Kpi rotulo="Tempo até recuperar" valor={Math.round(dash?.tempo_medio_recuperacao_h ?? 0)} sufixo=" h" sobe atraso={0.2}
          delta={{ tom: 'neutro', texto: dash?.tempo_medio_sem_resposta_h != null ? `média sem resposta ${Math.round(dash.tempo_medio_sem_resposta_h)} h` : '—' }} />
      </div>

      {/* ---------- por etapa + por atendente ---------- */}
      <div className="rmk-resumo">
        <CardVidro sobe atraso={0.22} className="rmk-res-card">
          <div className="tt">Por etapa</div>
          <div className="rmk-etapas">
            {(['remarketing_1', 'pendencia', 'recuperacao_1', 'recuperacao_2', 'recuperacao_3'] as const).map((e) => (
              <button key={e} type="button" className={'rmk-et' + (fEtapa === e ? ' on' : '')} onClick={() => setFEtapa(fEtapa === e ? 'todas' : e)}>
                <b className="num">{dash?.por_etapa?.[e] ?? 0}</b>
                <span>{ETAPA_LABEL[e]}</span>
              </button>
            ))}
          </div>
        </CardVidro>
        <CardVidro sobe atraso={0.26} className="rmk-res-card">
          <div className="tt">Por atendente</div>
          {(dash?.por_atendente?.length ?? 0) === 0 && (dash?.sem_responsavel ?? 0) === 0
            ? <div className="rmk-mudo">Nenhum lead ativo distribuído.</div>
            : (
              <div className="rmk-atds">
                {(dash?.por_atendente ?? []).map((a) => (
                  <button key={a.id} type="button" className={'rmk-atd' + (fResp === a.id ? ' on' : '')} onClick={() => setFResp(fResp === a.id ? 'todos' : a.id)}>
                    <span className="rmk-av" aria-hidden>{initials(a.nome)}</span>{a.nome}<b className="num">{a.n}</b>
                  </button>
                ))}
                {(dash?.sem_responsavel ?? 0) > 0 && (
                  <button type="button" className={'rmk-atd' + (fResp === 'fila' ? ' on' : '')} onClick={() => setFResp(fResp === 'fila' ? 'todos' : 'fila')}>
                    <span className="rmk-av" aria-hidden>—</span>na fila<b className="num">{dash?.sem_responsavel}</b>
                  </button>
                )}
              </div>
            )}
        </CardVidro>
      </div>

      {/* ---------- trabalhar agora ---------- */}
      <section className="rmk-sec">
        <div className="rmk-sec-head sobe" style={{ animationDelay: '.28s' }}>
          <div>
            <h3>Trabalhar agora</h3>
            <p>Tarefas pendentes, vencidas primeiro. Concluir = registrar a tentativa.</p>
          </div>
        </div>
        {tarefasQ.isError ? (
          <CardVidro sobe><EstadoErro descricao="Erro ao carregar as tarefas." aoTentarDeNovo={() => tarefasQ.refetch()} /></CardVidro>
        ) : tarefasQ.isLoading ? (
          <CardVidro className="rmk-skel" aria-hidden><Skeleton largura="45%" /><Skeleton largura="90%" altura={18} /><Skeleton largura="85%" altura={18} /></CardVidro>
        ) : tarefas.length === 0 ? (
          <CardVidro sobe><EstadoVazio titulo="Nenhuma tarefa pendente" descricao="Quando o motor identificar leads parados, as tarefas aparecem aqui com a próxima ação pronta." /></CardVidro>
        ) : (
          <CardVidro sobe atraso={0.3} className="rmk-tarefas">
            {tarefas.map((t) => {
              const vencida = !!t.venceEm && new Date(t.venceEm).getTime() < agora;
              return (
                <TrilhoItem key={t.id} tom={vencida ? 'crit' : 'aten'} className="rmk-tarefa"
                  titulo={<>{t.contatoNome} <BadgeStatus tom={ETAPA_TOM[t.etapa ?? ''] ?? 'neutro'}>{ETAPA_LABEL[t.etapa ?? ''] ?? '—'}</BadgeStatus></>}
                  sub={<>
                    {t.titulo}{t.responsavelNome ? <> · com <b>{t.responsavelNome}</b></> : ' · na fila da equipe'}
                    {t.venceEm && <> · {vencida ? 'venceu' : 'vence'} {tempoRelativo(t.venceEm, agora)}</>}
                  </>}
                  direita={<span className="rmk-t-acts">
                    {t.sugestaoMensagem && <BotaoMini onClick={() => copiar(t.sugestaoMensagem!)}>Copiar mensagem</BotaoMini>}
                    {t.conversaId && <BotaoMini onClick={() => nav('/whatsapp?conversa=' + t.conversaId)}>Abrir conversa</BotaoMini>}
                    <BotaoSec mini disabled={concluir.isPending} onClick={() => concluirTarefa(t)}>Concluir</BotaoSec>
                  </span>}
                />
              );
            })}
          </CardVidro>
        )}
      </section>

      {/* ---------- leads ---------- */}
      <section className="rmk-sec">
        <div className="rmk-sec-head sobe" style={{ animationDelay: '.32s' }}>
          <div>
            <h3>Leads</h3>
            <p>Todos com etapa, responsável e próxima ação definida.</p>
          </div>
          <div className="rmk-filtros">
            <Chips>
              <Chip ativo={aba === 'ativo'} onClick={() => setAba('ativo')}>Ativos</Chip>
              <Chip ativo={aba === 'encerrados'} onClick={() => setAba('encerrados')}>Recuperados & perdidos</Chip>
            </Chips>
            <select className="inp rmk-sel" value={fFin} onChange={(e) => setFFin(e.target.value)} aria-label="Financeira">
              <option value="todas">Financeira: todas</option>
              {financeiras.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select className="inp rmk-sel" value={fDias} onChange={(e) => setFDias(e.target.value)} aria-label="Dias sem resposta">
              <option value="todos">Sem resposta: qualquer</option>
              <option value="2">2+ dias</option>
              <option value="5">5+ dias</option>
              <option value="10">10+ dias</option>
            </select>
            <Input placeholder="Buscar por nome ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        {leadsQ.isError ? (
          <CardVidro sobe><EstadoErro descricao="Erro ao carregar os leads." aoTentarDeNovo={() => leadsQ.refetch()} /></CardVidro>
        ) : leadsQ.isLoading ? (
          <CardVidro className="rmk-skel" aria-hidden><Skeleton largura="100%" altura={38} /><Skeleton largura="100%" altura={38} /><Skeleton largura="100%" altura={38} /></CardVidro>
        ) : visiveis.length === 0 ? (
          <CardVidro sobe><EstadoVazio titulo={aba === 'ativo' ? 'Nenhum lead em remarketing' : 'Nada encerrado ainda'} descricao={aba === 'ativo' ? 'Com o motor ligado, leads sem resposta entram aqui sozinhos — com tarefa e prazo.' : 'Recuperados e perdidos dos últimos períodos aparecem aqui.'} /></CardVidro>
        ) : (
          <div className="sobe" style={{ animationDelay: '.34s' }}>
            <TabelaPadrao colunas={colunas} linhas={visiveis} chave={(l) => l.id} aoClicarLinha={(l) => setDetId(l.id)} />
          </div>
        )}
      </section>

      {/* ---------- drawer do lead ---------- */}
      <DrawerV2 aberto={!!detLead} aoFechar={() => setDetId(null)} largura={420}>
        {detLead && <LeadDetalhe lead={detLead} aoFechar={() => setDetId(null)} aoAbrirConversa={(c) => nav('/whatsapp?conversa=' + c)} agora={agora} />}
      </DrawerV2>

      {/* ---------- config ---------- */}
      {cfgAberta && configQ.data && (
        <ConfigModal
          inicial={configQ.data}
          usuarios={(usuariosQ.data ?? []).map((u) => ({ id: u.id, nome: u.nome }))}
          demo={!REMARKETING_REAL}
          aoFechar={() => setCfgAberta(false)}
          aoSalvo={(ok) => { setCfgAberta(false); setAviso(ok ? { tom: 'ok', texto: 'Configuração salva.' } : { tom: 'erro', texto: 'Falha ao salvar a configuração.' }); }}
        />
      )}
    </>
  );
}

/* ================= detalhe do lead (drawer) ================= */
function LeadDetalhe({ lead, aoFechar, aoAbrirConversa, agora }: { lead: RmktLead; aoFechar: () => void; aoAbrirConversa: (conversaId: string) => void; agora: number }) {
  const eventosQ = useRemarketingEventos(lead.id);
  const d = diasSem(lead.ultimaEntradaEm, agora);
  return (
    <div className="rmk-det">
      <div className="rmk-det-topo">
        <span className="rmk-av g" aria-hidden>{initials(lead.contatoNome)}</span>
        <div className="tx">
          <div className="nm">{lead.contatoNome}</div>
          <div className="sb num">{lead.contatoTelefone ? '+' + lead.contatoTelefone : 'sem número'}{lead.instituicao ? ` · ${lead.instituicao}` : ''}</div>
        </div>
        <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>
      <div className="rmk-det-linha">
        <BadgeStatus tom={lead.status !== 'ativo' ? (lead.status === 'recuperado' ? 'ok' : 'erro') : (ETAPA_TOM[lead.etapa] ?? 'neutro')}>
          {lead.status !== 'ativo' ? (STATUS_LABEL[lead.status] ?? lead.status) : (ETAPA_LABEL[lead.etapa] ?? lead.etapa)}
        </BadgeStatus>
        <span className="num">{lead.tentativas} tentativa{lead.tentativas === 1 ? '' : 's'}</span>
        {d !== null && <span className="num">{d === 0 ? 'respondeu hoje' : `${d} d sem resposta`}</span>}
      </div>
      {lead.status === 'ativo' && (
        <div className="rmk-det-prox">
          <div className="k">Próxima ação</div>
          <div className="v">{lead.proximaAcao ?? '—'}</div>
          {lead.responsavelNome && <div className="s">com <b>{lead.responsavelNome}</b></div>}
        </div>
      )}
      <div className="rmk-det-acts">
        {lead.conversaId && <BotaoPrimario mini onClick={() => aoAbrirConversa(lead.conversaId!)}>Abrir conversa</BotaoPrimario>}
      </div>
      <div className="rmk-det-tl-t">Linha do tempo</div>
      {eventosQ.isLoading ? (
        <div className="rmk-skel"><Skeleton largura="90%" /><Skeleton largura="75%" /></div>
      ) : (eventosQ.data ?? []).length === 0 ? (
        <div className="rmk-mudo">Sem eventos ainda.</div>
      ) : (
        <div className="rmk-det-tl">
          {(eventosQ.data ?? []).map((e) => (
            <TrilhoItem key={e.id} tom={EVENTO_TOM[e.tipo] ?? 'info'}
              titulo={EVENTO_LABEL[e.tipo] ?? e.tipo}
              sub={typeof e.detalhe?.de === 'string' && typeof e.detalhe?.para === 'string' ? `${ETAPA_LABEL[e.detalhe.de as string] ?? e.detalhe.de} → ${ETAPA_LABEL[e.detalhe.para as string] ?? e.detalhe.para}` : (typeof e.detalhe?.titulo === 'string' ? String(e.detalhe.titulo) : undefined)}
              direita={<span className="h num" title={dataHoraSP(e.criadoEm)}>{tempoRelativo(e.criadoEm, Date.now())}</span>}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= config (fila + prazos) ================= */
function ConfigModal({ inicial, usuarios, demo, aoFechar, aoSalvo }: {
  inicial: RmktConfig; usuarios: { id: string; nome: string }[]; demo: boolean;
  aoFechar: () => void; aoSalvo: (ok: boolean) => void;
}) {
  const salvar = useSalvarRemarketingConfig();
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [f1, setF1] = useState(String(inicial.fluxo1Min));
  const [pd, setPd] = useState(String(inicial.pendenciaDias));
  const [rd, setRd] = useState(String(inicial.recuperacaoDias));
  const [fila, setFila] = useState<string[]>(inicial.filaRecuperacao);
  const disponiveis = usuarios.filter((u) => !fila.includes(u.id));
  const nomeDe = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? '—';

  const submeter = () => {
    const c: RmktConfig = { ativo, ativoDesde: inicial.ativoDesde, fluxo1Min: +f1 || 15, pendenciaDias: +pd || 2, recuperacaoDias: +rd || 3, filaRecuperacao: fila };
    if (demo) { aoSalvo(true); return; }
    salvar.mutate(c, { onSuccess: () => aoSalvo(true), onError: () => aoSalvo(false) });
  };

  return (
    <ModalV2 aberto aoFechar={aoFechar} titulo="Configurar Central de Remarketing" largura={480}
      rodape={<>
        <BotaoSec mini disabled={salvar.isPending} onClick={aoFechar}>Voltar</BotaoSec>
        <BotaoPrimario mini disabled={salvar.isPending} onClick={submeter}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
      </>}>
      <p className="p-modal-msg">Prazos dos fluxos e a ordem da fila de recuperação. O timer de 15 minutos só conta em horário comercial (seg–sáb, 9h–18h).</p>
      <div className="rmk-cfg-grid">
        <label className="rmk-cfg-c"><span>Fluxo inicial (min)</span><input className="inp num" inputMode="numeric" value={f1} onChange={(e) => setF1(e.target.value)} /></label>
        <label className="rmk-cfg-c"><span>Pendência (dias)</span><input className="inp num" inputMode="numeric" value={pd} onChange={(e) => setPd(e.target.value)} /></label>
        <label className="rmk-cfg-c"><span>Recuperação (dias)</span><input className="inp num" inputMode="numeric" value={rd} onChange={(e) => setRd(e.target.value)} /></label>
      </div>
      <div className="rmk-cfg-t">Fila de recuperação (ordem das tentativas)</div>
      {fila.length === 0 && <div className="rmk-mudo">Sem fila: as etapas avançam sem transferir o responsável.</div>}
      <div className="rmk-cfg-fila">
        {fila.map((id, i) => (
          <div className="rmk-cfg-item" key={id}>
            <b className="num">{i + 1}º</b> {nomeDe(id)}
            <span className="acts">
              <BotaoMini disabled={i === 0} onClick={() => setFila((f) => { const n = [...f]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</BotaoMini>
              <BotaoMini disabled={i === fila.length - 1} onClick={() => setFila((f) => { const n = [...f]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</BotaoMini>
              <BotaoMini onClick={() => setFila((f) => f.filter((x) => x !== id))}>Remover</BotaoMini>
            </span>
          </div>
        ))}
      </div>
      {disponiveis.length > 0 && (
        <select className="inp rmk-sel" value="" onChange={(e) => { if (e.target.value) setFila((f) => [...f, e.target.value]); }} aria-label="Adicionar atendente à fila">
          <option value="">＋ Adicionar atendente à fila…</option>
          {disponiveis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      )}
      <div className="rmk-cfg-t">Motor</div>
      <label className="rmk-cfg-ativo">
        <input type="checkbox" className="cbx-nativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        <span>Deixar o motor <b>armado</b> (as automações só rodam quando o agendador for ligado, na fase 3 — acompanhada).</span>
      </label>
    </ModalV2>
  );
}

