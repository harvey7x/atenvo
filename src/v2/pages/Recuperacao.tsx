/* ============================================================================
   Recuperação (remarketing enxuto) — Atendimento
   Lista os leads da coluna "Remarketing" (por responsável), deixa cada
   atendente montar as PRÓPRIAS sequências de mensagens pré-programadas
   (texto/imagem/áudio gravado, com intervalo entre os toques) e INICIAR a
   recuperação — os toques saem aos poucos pelo número da conversa. Para
   sozinho quando o cliente responde. Painel de progresso no topo.
   ============================================================================ */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import './ia.css';
import './recuperacao.css';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, Campo, CardVidro, CardCab,
  ConfirmDialogV2, DrawerV2, EstadoVazio, Segmentado, SkeletonTexto, type OpcaoSegmentado,
} from '../components';
import { AudioRecorderV2 } from '../components/AudioRecorderV2';
import { DEMO_MODE } from '@/lib/demo';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  RECUP_REAL, MOCK_SEQS, MOCK_LEADS, MOCK_DASH,
  useSequencias, useSalvarSequencia, useExcluirSequencia,
  useRecupLeads, useIniciarRecuperacao, usePararRecuperacao, useRecupDashboard, subirMidiaToque,
  usePrepararLote, usePlayRecuperacao,
  type Sequencia, type Toque, type RecupLead, type TipoToque, type RotacaoItem,
} from '@/data/recuperacao';
import { useOrgUsuarios } from '@/data/atendimento';

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;
const OPCOES_ABA: OpcaoSegmentado<'leads' | 'seqs'>[] = [
  { valor: 'leads', rotulo: 'Leads em recuperação' },
  { valor: 'seqs', rotulo: 'Minhas sequências' },
];
const fone = (t: string | null) => (t ? '+' + t.replace(/\D/g, '') : '—');
/** traduz os erros crus das RPCs pra mensagem amigável */
const ERROS_RECUP: Record<string, string> = {
  contato_optout: 'Esse cliente pediu pra não receber mensagens (opt-out) — não dá pra iniciar.',
  ja_em_recuperacao: 'Esse lead já está em recuperação.',
  sem_conversa: 'Esse lead não tem conversa — não tem por onde mandar.',
  canal_desconectado: 'O número da conversa está desconectado. Reconecte em Integrações.',
  canal_restrito: 'O número da conversa está restrito pra envio.',
  contato_sem_telefone: 'O contato não tem telefone válido.',
  sequencia_vazia: 'A sequência não tem toques.',
  sequencia_nao_encontrada: 'Sequência não encontrada.',
};
const msgErro = (e: unknown): string => {
  const m = (e as Error)?.message || 'Falha ao iniciar.';
  const chave = Object.keys(ERROS_RECUP).find((k) => m.includes(k));
  return chave ? ERROS_RECUP[chave] : m;
};
const toqueNovo = (tipo: TipoToque): Toque => ({ tipo, texto: '', intervalo_horas: tipo === 'texto' ? 0 : 24 });
const rotuloTipo: Record<TipoToque, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio gravado' };

export default function RecuperacaoV2() {
  const usarMock = DEMO_MODE || !RECUP_REAL;
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const meId = usarMock ? 'me' : (user?.id ?? 'me');

  const [aba, setAba] = useState<'leads' | 'seqs'>('leads');
  const [aviso, setAviso] = useState<Aviso>(null);

  const dashQ = useRecupDashboard();
  const dash = usarMock ? MOCK_DASH : (dashQ.data ?? { na_coluna: 0, em_recuperacao: 0, recuperados: 0, concluidas: 0 });

  return (
    <div className="ia-pagina rec-pagina">
      <div className="ph sobe">
        <div>
          <h1>Recuperação</h1>
          <p>Recupere os leads que ficaram pela metade: cada atendente monta a própria sequência e o sistema manda aos poucos, pelo número que o cliente já fala. Para quando ele responde.</p>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}<button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* progresso */}
      <div className="rec-kpis sobe">
        <div className="rec-kpi"><span>Na coluna Remarketing</span><b className="num">{dash.na_coluna}</b></div>
        <div className="rec-kpi"><span>Em recuperação</span><b className="num" style={{ color: 'var(--azul, #2563eb)' }}>{dash.em_recuperacao}</b></div>
        <div className="rec-kpi"><span>Recuperados</span><b className="num" style={{ color: 'var(--verde, #16a34a)' }}>{dash.recuperados}</b></div>
        <div className="rec-kpi"><span>Concluídas</span><b className="num">{dash.concluidas}</b></div>
      </div>

      <div className="rec-abas sobe"><Segmentado opcoes={OPCOES_ABA} valor={aba} aoMudar={setAba} rotulo="Aba" /></div>

      {aba === 'leads'
        ? <AbaLeads usarMock={usarMock} meId={meId} setAviso={setAviso} />
        : <AbaSequencias usarMock={usarMock} orgId={currentOrg?.id ?? ''} setAviso={setAviso} />}
    </div>
  );
}

/* ============================ LEADS ============================ */
function AbaLeads({ usarMock, meId, setAviso }: { usarMock: boolean; meId: string; setAviso: (a: Aviso) => void }) {
  const leadsQ = useRecupLeads();
  const seqsQ = useSequencias();
  const equipeQ = useOrgUsuarios();
  const iniciar = useIniciarRecuperacao();
  const parar = usePararRecuperacao();
  const prepararLote = usePrepararLote();
  const play = usePlayRecuperacao();
  const leads = usarMock ? MOCK_LEADS : (leadsQ.data ?? []);
  const seqs = usarMock ? MOCK_SEQS : (seqsQ.data ?? []);
  const equipe = usarMock
    ? [{ id: 'me', nome: 'Matheus' }, { id: 'giovana', nome: 'Giovana' }, { id: 'juliana', nome: 'Juliana' }]
    : (equipeQ.data ?? []).map((u) => ({ id: u.id, nome: u.nome }));
  const carregando = !usarMock && leadsQ.isLoading;

  const [picker, setPicker] = useState<RecupLead | null>(null);   // ad-hoc: 1 lead escolhendo sequência
  const [confParar, setConfParar] = useState<RecupLead | null>(null);
  const [prepararAberto, setPrepararAberto] = useState(false);
  const [playAberto, setPlayAberto] = useState(false);
  const [rotacao, setRotacao] = useState<Record<string, string>>({});   // atendente origem → responsável remarketing

  const disponiveis = leads.filter((l) => !l.execucaoStatus);
  const meusPreparados = leads.filter((l) => l.execucaoStatus === 'preparada' && l.remarketingId === meId);
  const ativos = leads.filter((l) => l.execucaoStatus === 'ativa');
  const grupos = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; qtd: number }>();
    for (const l of disponiveis) {
      if (!l.responsavelId) continue;   // rodízio é por atendente que tem dono
      const g = m.get(l.responsavelId) ?? { id: l.responsavelId, nome: l.responsavelNome || 'Atendente', qtd: 0 };
      g.qtd++; m.set(l.responsavelId, g);
    }
    return [...m.values()];
  }, [disponiveis]);

  const aoPreparar = async () => {
    const rot: RotacaoItem[] = grupos.filter((g) => rotacao[g.id]).map((g) => ({ de: g.id, para: rotacao[g.id] }));
    if (!rot.length) { setAviso({ tom: 'erro', texto: 'Escolha, pra ao menos um atendente, quem faz o remarketing.' }); return; }
    setPrepararAberto(false);
    if (usarMock) { setAviso({ tom: 'ok', texto: `${rot.length} grupo(s) preparado(s) (demonstração).` }); return; }
    try { const n = await prepararLote.mutateAsync(rot); setAviso({ tom: 'ok', texto: `${n} lead(s) preparado(s) pro remarketing. Cada responsável dá Play nos seus.` }); }
    catch (e) { setAviso({ tom: 'erro', texto: msgErro(e) }); }
  };
  const aoPlay = async (sequenciaId: string) => {
    setPlayAberto(false);
    if (usarMock) { setAviso({ tom: 'ok', texto: `Play! ${meusPreparados.length} lead(s) começaram (demonstração).` }); return; }
    try { const r = await play.mutateAsync(sequenciaId); setAviso({ tom: 'ok', texto: `Play! ${r.iniciadas} lead(s) começaram${r.puladas ? `, ${r.puladas} pulado(s) (opt-out/sem canal)` : ''}. As mensagens saem espaçadas.` }); }
    catch (e) { setAviso({ tom: 'erro', texto: msgErro(e) }); }
  };
  const aoIniciar = async (lead: RecupLead, sequenciaId: string) => {
    setPicker(null);
    if (usarMock) { setAviso({ tom: 'ok', texto: `Recuperação iniciada para ${lead.contatoNome} (demonstração).` }); return; }
    try { await iniciar.mutateAsync({ oportunidadeId: lead.oportunidadeId, sequenciaId }); setAviso({ tom: 'ok', texto: `Recuperação iniciada para ${lead.contatoNome}.` }); }
    catch (e) { setAviso({ tom: 'erro', texto: msgErro(e) }); }
  };
  const aoParar = async (lead: RecupLead) => {
    setConfParar(null);
    if (!lead.execucaoId) return;
    if (usarMock) { setAviso({ tom: 'ok', texto: 'Recuperação parada (demonstração).' }); return; }
    try { await parar.mutateAsync(lead.execucaoId); setAviso({ tom: 'ok', texto: 'Recuperação parada — toques pendentes cancelados.' }); }
    catch (e) { setAviso({ tom: 'erro', texto: msgErro(e) }); }
  };

  const linhaLead = (l: RecupLead, acao: 'iniciar' | 'parar' | 'nada', badge: ReactNode) => (
    <div className="rec-lead" key={l.oportunidadeId}>
      <div className="rec-lead-info">
        <span className="rec-lead-nome">{l.contatoNome ?? 'Sem nome'}</span>
        <span className="rec-lead-meta num">{fone(l.contatoTelefone)}{l.responsavelNome ? ` · atendeu: ${l.responsavelNome}` : ''}</span>
      </div>
      <div className="rec-lead-estado">{badge}</div>
      <div className="rec-lead-acoes">
        {acao === 'parar' && <BotaoMini className="btn-perigo" onClick={() => setConfParar(l)}>Parar</BotaoMini>}
        {acao === 'iniciar' && <BotaoSec mini onClick={() => setPicker(l)} disabled={!seqs.length}>Iniciar</BotaoSec>}
      </div>
    </div>
  );

  if (carregando) return <CardVidro sobe className="ia-card"><SkeletonTexto linhas={5} /></CardVidro>;
  if (!leads.length) return (
    <CardVidro sobe className="ia-card">
      <EstadoVazio icone="↻" titulo="Nenhum lead pra recuperar"
        descricao="Arraste os leads sem resposta pra coluna Remarketing no Kanban pra eles aparecerem aqui." />
    </CardVidro>
  );

  return (
    <>
      {/* ações do lote */}
      <div className="rec-lote-acoes sobe">
        <BotaoSec onClick={() => setPrepararAberto(true)} disabled={!grupos.length}>Preparar lote (rodízio) · {disponiveis.length}</BotaoSec>
        <BotaoPrimario onClick={() => setPlayAberto(true)} disabled={!meusPreparados.length || !seqs.length}>▶ Play · {meusPreparados.length} pra você</BotaoPrimario>
      </div>

      {meusPreparados.length > 0 && (
        <CardVidro sobe className="ia-card" atraso={0.03}>
          <CardCab titulo="Preparados pra você" contador={meusPreparados.length} direita={<BotaoSec mini onClick={() => setPlayAberto(true)} disabled={!seqs.length}>▶ Play</BotaoSec>} />
          <div className="rec-leads">{meusPreparados.map((l) => linhaLead(l, 'parar', <BadgeStatus tom="neutro">preparado · aguardando play</BadgeStatus>))}</div>
        </CardVidro>
      )}

      {ativos.length > 0 && (
        <CardVidro sobe className="ia-card" atraso={0.06}>
          <CardCab titulo="Em recuperação" contador={ativos.length} />
          <div className="rec-leads">{ativos.map((l) => linhaLead(l, 'parar',
            <BadgeStatus tom="ok">em recuperação{l.remarketingNome ? ` · ${l.remarketingNome}` : ''}</BadgeStatus>))}</div>
        </CardVidro>
      )}

      <CardVidro sobe className="ia-card" atraso={0.09}>
        <CardCab titulo="Disponíveis" contador={disponiveis.length} />
        {disponiveis.length === 0
          ? <p className="ia-hint">Todos os leads da coluna já estão preparados ou em recuperação.</p>
          : <div className="rec-leads">{disponiveis.map((l) => linhaLead(l, 'iniciar', <BadgeStatus tom="neutro">disponível</BadgeStatus>))}</div>}
        {!seqs.length && <p className="ia-hint">Crie uma sequência em <b>Minhas sequências</b> pra preparar/iniciar.</p>}
      </CardVidro>

      {/* preparar lote (rodízio) */}
      <DrawerV2 aberto={prepararAberto} aoFechar={() => setPrepararAberto(false)} largura={440}>
        <div className="rec-picker">
          <div className="card-cab"><h3>Preparar lote (rodízio)</h3></div>
          <p className="ia-hint">Pra cada atendente, escolha <b>quem faz o remarketing</b> dos leads dele. Os leads viram "preparados" pra essa pessoa dar Play.</p>
          {grupos.length === 0 ? <div className="ia-hint">Nenhum lead disponível pra preparar.</div> : (
            <div className="rec-rodizio">
              {grupos.map((g) => (
                <div className="rec-rodizio-linha" key={g.id}>
                  <div className="rec-rodizio-de"><b>{g.nome}</b><span className="ia-hint">{g.qtd} lead(s)</span></div>
                  <span className="rec-rodizio-seta">→</span>
                  <select className="inp" value={rotacao[g.id] ?? ''} onChange={(e) => setRotacao((r) => ({ ...r, [g.id]: e.target.value }))} aria-label={`Quem faz o remarketing dos leads de ${g.nome}`}>
                    <option value="">— quem faz o remarketing —</option>
                    {equipe.filter((u) => u.id !== g.id).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              ))}
              <div className="ferr-rodape"><BotaoPrimario onClick={aoPreparar} disabled={prepararLote.isPending}>Preparar {disponiveis.length} lead(s)</BotaoPrimario></div>
            </div>
          )}
        </div>
      </DrawerV2>

      {/* play: escolher script pros meus preparados */}
      <DrawerV2 aberto={playAberto} aoFechar={() => setPlayAberto(false)} largura={380}>
        <div className="rec-picker">
          <div className="card-cab"><h3>▶ Play — dar play</h3></div>
          <p className="ia-hint">Escolha o script pros seus <b>{meusPreparados.length}</b> lead(s) preparado(s). As mensagens saem espaçadas (anti-spam), pelo número da conversa.</p>
          {seqs.length === 0 ? <div className="ia-hint">Você ainda não tem scripts.</div> : (
            <div className="rec-picker-lista">
              {seqs.map((s) => (
                <button key={s.id} type="button" className="rec-picker-item" onClick={() => aoPlay(s.id)} disabled={play.isPending}>
                  <b>{s.nome}</b><span>{s.toques.length} toque(s)</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerV2>

      {/* ad-hoc: iniciar 1 lead */}
      <DrawerV2 aberto={!!picker} aoFechar={() => setPicker(null)} largura={380}>
        <div className="rec-picker">
          <div className="card-cab"><h3>Escolha o script</h3></div>
          <p className="ia-hint">Pra recuperar <b>{picker?.contatoNome}</b> agora. Os toques saem pelo número da conversa, aos poucos.</p>
          {seqs.length === 0 ? <div className="ia-hint">Você ainda não tem scripts.</div> : (
            <div className="rec-picker-lista">
              {seqs.map((s) => (
                <button key={s.id} type="button" className="rec-picker-item" onClick={() => picker && aoIniciar(picker, s.id)}>
                  <b>{s.nome}</b><span>{s.toques.length} toque(s)</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerV2>

      <ConfirmDialogV2
        aberto={!!confParar}
        titulo="Parar a recuperação?"
        mensagem="Os toques que ainda não saíram são cancelados. O que já foi enviado permanece."
        rotuloConfirmar="Parar"
        destrutivo
        aoConfirmar={() => confParar && aoParar(confParar)}
        aoCancelar={() => setConfParar(null)}
      />
    </>
  );
}

/* ============================ SEQUÊNCIAS ============================ */
function AbaSequencias({ usarMock, orgId, setAviso }: { usarMock: boolean; orgId: string; setAviso: (a: Aviso) => void }) {
  const seqsQ = useSequencias();
  const salvar = useSalvarSequencia();
  const excluir = useExcluirSequencia();
  const [mockSeqs, setMockSeqs] = useState<Sequencia[]>(MOCK_SEQS);
  const seqs = usarMock ? mockSeqs : (seqsQ.data ?? []);

  const [selId, setSelId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [toques, setToques] = useState<Toque[]>([]);
  const [editando, setEditando] = useState(false);
  const [confExcluir, setConfExcluir] = useState(false);

  const abrir = (s: Sequencia | null) => {
    if (s) { setSelId(s.id); setNome(s.nome); setToques(JSON.parse(JSON.stringify(s.toques))); }
    else { setSelId(null); setNome(''); setToques([toqueNovo('texto')]); }
    setEditando(true);
  };

  const mudarToque = (i: number, t: Toque) => setToques((xs) => xs.map((x, j) => (j === i ? t : x)));
  const removerToque = (i: number) => setToques((xs) => xs.filter((_, j) => j !== i));
  const moverToque = (i: number, d: -1 | 1) => setToques((xs) => { const j = i + d; if (j < 0 || j >= xs.length) return xs; const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const problemas = useMemo(() => {
    const p: string[] = [];
    if (!toques.length) p.push('Adicione ao menos um toque.');
    toques.forEach((t, i) => {
      if (t.tipo === 'texto' && !(t.texto || '').trim()) p.push(`Toque ${i + 1}: texto vazio.`);
      if (t.tipo !== 'texto' && !t.storage_path) p.push(`Toque ${i + 1}: falta o arquivo (${rotuloTipo[t.tipo].toLowerCase()}).`);
    });
    return p;
  }, [toques]);

  const aoSalvar = async () => {
    if (problemas.length) { setAviso({ tom: 'erro', texto: problemas[0] }); return; }
    if (usarMock) {
      const nova: Sequencia = { id: selId ?? `seq-${Date.now()}`, atendenteId: 'me', nome: nome.trim() || 'Sequência', toques, criadoEm: new Date().toISOString() };
      setMockSeqs((xs) => selId ? xs.map((s) => s.id === selId ? nova : s) : [nova, ...xs]);
      setEditando(false); setAviso({ tom: 'ok', texto: 'Sequência salva (demonstração).' }); return;
    }
    try { await salvar.mutateAsync({ id: selId, nome: nome.trim() || 'Sequência', toques }); setEditando(false); setAviso({ tom: 'ok', texto: 'Sequência salva.' }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };
  const aoExcluir = async () => {
    setConfExcluir(false);
    if (!selId) { setEditando(false); return; }
    if (usarMock) { setMockSeqs((xs) => xs.filter((s) => s.id !== selId)); setEditando(false); return; }
    try { await excluir.mutateAsync(selId); setEditando(false); setAviso({ tom: 'ok', texto: 'Sequência excluída.' }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  if (editando) {
    return (
      <>
        <CardVidro sobe className="ia-card">
          <CardCab titulo={selId ? 'Editar sequência' : 'Nova sequência'} direita={<BotaoSec mini onClick={() => setEditando(false)}>Voltar</BotaoSec>} />
          <Campo rotulo="Nome da sequência" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Recuperação padrão" />
        </CardVidro>

        {problemas.length > 0 && (
          <div className="aviso-inline erro" role="status"><div><b>Antes de salvar:</b><ul className="fx-problemas">{problemas.map((pr, i) => <li key={i}>{pr}</li>)}</ul></div></div>
        )}

        <CardVidro sobe className="ia-card" atraso={0.05}>
          <CardCab titulo="Toques" contador={toques.length} />
          <p className="ia-hint">Cada toque é uma mensagem. O <b>intervalo</b> é a espera antes dele — assim o sistema manda aos poucos. Use <span className="fx-var">{'{primeiro_nome}'}</span> pra chamar o cliente pelo nome.</p>
          {toques.map((t, i) => (
            <ToqueEditor key={i} idx={i} total={toques.length} toque={t} orgId={orgId} usarMock={usarMock}
              aoMudar={(nt) => mudarToque(i, nt)} aoRemover={() => removerToque(i)} aoMover={(d) => moverToque(i, d)} setAviso={setAviso} />
          ))}
          <div className="fx-add">
            <span className="ia-hint">Adicionar toque:</span>
            <BotaoMini onClick={() => setToques((xs) => [...xs, toqueNovo('texto')])}>+ Texto</BotaoMini>
            <BotaoMini onClick={() => setToques((xs) => [...xs, toqueNovo('imagem')])}>+ Imagem</BotaoMini>
            <BotaoMini onClick={() => setToques((xs) => [...xs, toqueNovo('audio')])}>+ Áudio</BotaoMini>
          </div>
        </CardVidro>

        <div className="ia-rodape">
          {selId && <BotaoMini className="btn-perigo" onClick={() => setConfExcluir(true)}>Excluir</BotaoMini>}
          <BotaoPrimario onClick={aoSalvar} disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar sequência'}</BotaoPrimario>
        </div>

        <ConfirmDialogV2 aberto={confExcluir} titulo="Excluir sequência?" mensagem="Essa ação não tem volta. Recuperações já iniciadas continuam." rotuloConfirmar="Excluir" destrutivo aoConfirmar={aoExcluir} aoCancelar={() => setConfExcluir(false)} />
      </>
    );
  }

  return (
    <>
      <div className="rec-seq-topo sobe">
        <BotaoPrimario onClick={() => abrir(null)}>+ Nova sequência</BotaoPrimario>
      </div>
      {seqs.length === 0 ? (
        <CardVidro sobe className="ia-card">
          <EstadoVazio icone="✎" titulo="Nenhuma sequência ainda"
            descricao="Monte uma sequência de mensagens (texto, imagem, áudio gravado) pra recuperar seus leads." />
        </CardVidro>
      ) : (
        <div className="rec-seqs sobe">
          {seqs.map((s) => (
            <button key={s.id} type="button" className="rec-seq-card" onClick={() => abrir(s)}>
              <span className="rec-seq-nome">{s.nome}</span>
              <span className="ia-hint">{s.toques.length} toque(s) · {s.toques.map((t) => rotuloTipo[t.tipo][0]).join('·') || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- editor de um toque ---------- */
function ToqueEditor({ idx, total, toque, orgId, usarMock, aoMudar, aoRemover, aoMover, setAviso }: {
  idx: number; total: number; toque: Toque; orgId: string; usarMock: boolean;
  aoMudar: (t: Toque) => void; aoRemover: () => void; aoMover: (d: -1 | 1) => void; setAviso: (a: Aviso) => void;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);

  const subirImagem = async (file: File) => {
    if (usarMock) { aoMudar({ ...toque, tipo: 'imagem', storage_path: 'demo/wa-midia/img.png', mime: file.type || 'image/png', nome: file.name, tamanho: file.size }); return; }
    setSubindo(true);
    try { const m = await subirMidiaToque(orgId, file); aoMudar({ ...toque, tipo: 'imagem', ...m }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
    finally { setSubindo(false); }
  };
  const gravouAudio = async (blob: Blob, mime: string, ext: string, diag?: Record<string, unknown>) => {
    if (usarMock) { aoMudar({ ...toque, tipo: 'audio', storage_path: 'demo/wa-midia/audio.ogg', mime, nome: `audio.${ext}`, tamanho: blob.size, origem_audio: 'gravacao_painel' }); return; }
    const file = new File([blob], `audio.${ext}`, { type: mime });
    const m = await subirMidiaToque(orgId, file);
    aoMudar({ ...toque, tipo: 'audio', ...m, origem_audio: (diag?.origem as string) ?? 'gravacao_painel' });
  };

  return (
    <div className="rec-toque">
      <div className="rec-toque-cab">
        <span className="rec-toque-num num">{idx + 1}</span>
        <b>{rotuloTipo[toque.tipo]}</b>
        <span className="rec-toque-acoes">
          <BotaoMini onClick={() => aoMover(-1)} disabled={idx === 0} aria-label="Subir">↑</BotaoMini>
          <BotaoMini onClick={() => aoMover(1)} disabled={idx === total - 1} aria-label="Descer">↓</BotaoMini>
          <BotaoMini className="btn-perigo" onClick={aoRemover} aria-label="Remover">✕</BotaoMini>
        </span>
      </div>

      {toque.tipo === 'texto' && (
        <Campo rotulo="Mensagem">
          {(id) => <textarea id={id} className="inp" rows={2} value={toque.texto ?? ''} onChange={(e) => aoMudar({ ...toque, texto: e.target.value })} placeholder="Oi {primeiro_nome}! Ainda posso te ajudar? 🙂" />}
        </Campo>
      )}

      {toque.tipo === 'imagem' && (
        <div className="rec-midia">
          {toque.storage_path
            ? <div className="rec-midia-ok">🖼 {toque.nome ?? 'imagem'} <BotaoMini onClick={() => aoMudar({ ...toque, storage_path: undefined, mime: undefined, nome: undefined, tamanho: undefined })}>trocar</BotaoMini></div>
            : <BotaoSec mini onClick={() => imgRef.current?.click()} disabled={subindo}>{subindo ? 'Subindo…' : 'Escolher imagem'}</BotaoSec>}
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirImagem(f); }} />
          <Campo rotulo="Legenda (opcional)" value={toque.texto ?? ''} onChange={(e) => aoMudar({ ...toque, texto: e.target.value })} placeholder="texto que vai junto com a imagem" />
        </div>
      )}

      {toque.tipo === 'audio' && (
        <div className="rec-midia">
          {toque.storage_path
            ? <div className="rec-midia-ok">🎤 {toque.nome ?? 'áudio'} <BotaoMini onClick={() => aoMudar({ ...toque, storage_path: undefined, mime: undefined, nome: undefined, tamanho: undefined, origem_audio: undefined })}>regravar</BotaoMini></div>
            : <AudioRecorderV2 onEnviar={gravouAudio} rotuloEnviar="Usar este áudio" />}
        </div>
      )}

      <div className="rec-toque-intervalo">
        <label>Esperar antes deste toque</label>
        <select className="inp" value={String(toque.intervalo_horas)} onChange={(e) => aoMudar({ ...toque, intervalo_horas: Number(e.target.value) })}>
          <option value="0">Sair logo</option>
          <option value="1">1 hora</option>
          <option value="3">3 horas</option>
          <option value="6">6 horas</option>
          <option value="24">1 dia</option>
          <option value="48">2 dias</option>
          <option value="72">3 dias</option>
          <option value="120">5 dias</option>
          <option value="168">7 dias</option>
        </select>
      </div>
    </div>
  );
}
