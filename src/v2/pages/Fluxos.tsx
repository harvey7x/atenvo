/* ============================================================================
   Fluxos do bot — Fase 1 (IA configurável)

   O cliente MONTA o fluxo do bot: mensagem → pergunta com opções → coletar
   dado (nome/CPF com DV/telefone/e-mail) → ação (etiqueta/humano/IA) → fim.
   Liga num canal e o bot-runner executa lendo do banco. O simulador roda o
   MESMO contrato do motor — e testa o que está NA TELA (antes de salvar).

   Regras da casa: excluir fluxo DESLIGA o bot nos canais que o usavam;
   trocar de fluxo com edições não salvas pede confirmação.
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import './ia.css';
import './fluxos.css';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, Campo, CardVidro, CardCab,
  Checkbox, ConfirmDialogV2, DrawerV2, EstadoErro, EstadoVazio, SkeletonTexto,
  Toggle,
} from '../components';
import { DEMO_MODE } from '@/lib/demo';
import { useCanaisIa, MOCK_CANAIS, type CanalIa } from '@/data/ia';
import {
  FLUXOS_REAL, MOCK_FLUXOS, ROTULO_DADO, ROTULO_PASSO,
  avancarSim, problemasDoFluxo, responderSim,
  garantirIds,
  useCriarFluxo, useExcluirFluxo, useFluxos, useSalvarFluxo, useVincularFluxoCanal,
  type DadoColeta, type EstadoSim, type FluxoBot, type Passo,
} from '@/data/iaFluxos';

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;
type MsgSim = { de: 'cliente' | 'bot' | 'evento'; texto: string };

const TIPOS_NOVOS: Passo['tipo'][] = ['mensagem', 'pergunta', 'coletar', 'acao', 'fim'];

function novoId(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `p_${Math.random().toString(36).slice(2, 10)}`;
}
function passoNovo(tipo: Passo['tipo']): Passo {
  const id = novoId();
  switch (tipo) {
    case 'mensagem': return { id, tipo, baloes: [] };
    case 'pergunta': return { id, tipo, baloes: [], opcoes: [{ rotulo: '', valor: '' }, { rotulo: '', valor: '' }], salvarEm: '', reprompt: '' };
    case 'coletar': return { id, tipo, baloes: [], dado: 'nome', salvarEm: '', reprompt: '' };
    case 'acao': return { id, tipo };
    default: return { id, tipo: 'fim', baloes: [] };
  }
}

/* textarea ⇄ balões: cada LINHA não-vazia é um balão */
const paraTexto = (baloes?: string[]) => (baloes ?? []).join('\n');
const paraBaloes = (txt: string) => txt.split('\n').map((l) => l.trim()).filter(Boolean);

export default function Fluxos() {
  const usarMock = DEMO_MODE || !FLUXOS_REAL;

  const qFluxos = useFluxos();
  const qCanais = useCanaisIa();
  const [mockFluxos, setMockFluxos] = useState<FluxoBot[]>(MOCK_FLUXOS);
  const [mockCanais, setMockCanais] = useState<CanalIa[]>(MOCK_CANAIS);
  const fluxos = usarMock ? mockFluxos : (qFluxos.data ?? []);
  const canais = usarMock ? mockCanais : (qCanais.data ?? []);
  const carregando = !usarMock && (qFluxos.isLoading || qCanais.isLoading);
  const erroCarga = !usarMock ? (qFluxos.error || qCanais.error) : null;

  const [selId, setSelId] = useState<string | null>(null);
  const fluxo = fluxos.find((f) => f.id === selId) ?? fluxos[0] ?? null;

  const criar = useCriarFluxo();
  const salvar = useSalvarFluxo();
  const excluir = useExcluirFluxo();
  const vincular = useVincularFluxoCanal();

  /* -------- formulário -------- */
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ativo, setAtivo] = useState(false);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [confirmaTroca, setConfirmaTroca] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    if (!fluxo) return;
    setNome(fluxo.nome);
    setDescricao(fluxo.descricao);
    setAtivo(fluxo.ativo);
    setPassos(garantirIds(JSON.parse(JSON.stringify(fluxo.passos)) as Passo[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxo?.id]);

  // compara passos IGNORANDO só o `id` (o load faz backfill de id em fluxos antigos; sem isso
  // todo fluxo legado abriria marcado como 'não salvo' — achado da revisão)
  const semId = (ps: Passo[]) => JSON.stringify(ps.map((x) => ({ ...x, id: undefined })));
  const formSujo = useMemo(() => {
    if (!fluxo) return false;
    return nome !== fluxo.nome || descricao !== fluxo.descricao || ativo !== fluxo.ativo
      || semId(passos) !== semId(fluxo.passos);
  }, [fluxo, nome, descricao, ativo, passos]);

  const problemas = useMemo(() => problemasDoFluxo(passos), [passos]);

  const trocarPara = (id: string | null) => {
    if (formSujo) { setConfirmaTroca({ id }); return; }
    if (id === null) { aoCriar(); return; }
    setSelId(id);
  };

  /* -------- edição de passos -------- */
  const mudarPasso = (i: number, novo: Passo) => setPassos((xs) => xs.map((p, j) => (j === i ? novo : p)));
  const removerPasso = (i: number) => setPassos((xs) => xs.filter((_, j) => j !== i));
  const moverPasso = (i: number, dir: -1 | 1) => setPassos((xs) => {
    const j = i + dir;
    if (j < 0 || j >= xs.length) return xs;
    const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const adicionarPasso = (tipo: Passo['tipo']) => setPassos((xs) => [...xs, passoNovo(tipo)]);

  /* -------- ações -------- */
  const aoCriar = async () => {
    if (criar.isPending) return;
    if (usarMock) {
      const novo: FluxoBot = { id: `demo-${Date.now()}`, nome: 'Novo fluxo', descricao: '', passos: [], ativo: false, criadoEm: new Date().toISOString() };
      setMockFluxos((xs) => [...xs, novo]);
      setSelId(novo.id);
      return;
    }
    try { const id = await criar.mutateAsync(); setSelId(id); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoSalvar = async () => {
    if (!fluxo) return;
    if (ativo && problemas.length) {
      setAviso({ tom: 'erro', texto: `Resolva antes de ativar: ${problemas[0]}` });
      return;
    }
    if (usarMock) {
      setMockFluxos((xs) => xs.map((f) => f.id === fluxo.id ? { ...f, nome, descricao, ativo, passos: JSON.parse(JSON.stringify(passos)) } : f));
      setAviso({ tom: 'ok', texto: 'Fluxo salvo (demonstração).' });
      return;
    }
    try {
      await salvar.mutateAsync({ id: fluxo.id, nome, descricao, passos, ativo });
      setAviso({ tom: 'ok', texto: 'Fluxo salvo.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoVincular = async (canal: CanalIa, marcado: boolean) => {
    if (!fluxo || vincular.isPending) return;
    if (marcado && !fluxo.ativo) {
      setAviso({ tom: 'erro', texto: 'Ative e salve o fluxo antes de ligá-lo num canal — vincular um rascunho deixa o bot MUDO nesse canal.' });
      return;
    }
    if (usarMock) {
      setMockCanais((xs) => xs.map((c) => c.id === canal.id ? { ...c, fluxoId: marcado ? fluxo.id : null } : c));
      return;
    }
    try { await vincular.mutateAsync({ canalId: canal.id, fluxoId: marcado ? fluxo.id : null }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoExcluir = async () => {
    if (!fluxo) return;
    if (usarMock) {
      setMockFluxos((xs) => xs.filter((f) => f.id !== fluxo.id));
      setMockCanais((xs) => xs.map((c) => c.fluxoId === fluxo.id ? { ...c, fluxoId: null } : c));
      setConfirmaExcluir(false);
      setSelId(null);
      return;
    }
    try { await excluir.mutateAsync(fluxo.id); setConfirmaExcluir(false); setSelId(null); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); setConfirmaExcluir(false); }
  };

  /* -------- simulador (roda o que está NA TELA) -------- */
  const [simAberto, setSimAberto] = useState(false);
  const [simMsgs, setSimMsgs] = useState<MsgSim[]>([]);
  const [simEstado, setSimEstado] = useState<EstadoSim>({ passo: 0, dados: {}, tentativas: 0, encerrado: false });
  const [simInput, setSimInput] = useState('');
  const simFimRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { simFimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [simMsgs]);

  const aplicarSaida = (r: ReturnType<typeof avancarSim>) => {
    setSimMsgs((xs) => [
      ...xs,
      ...r.baloes.map((b) => ({ de: 'bot' as const, texto: b })),
      ...r.eventos.map((ev) => ({ de: 'evento' as const, texto: ev })),
      ...(r.estado.encerrado && !r.eventos.length && !r.baloes.length ? [{ de: 'evento' as const, texto: '✔ fluxo encerrado' }] : []),
    ]);
    setSimEstado(r.estado);
  };

  const abrirSimulador = () => {
    setSimMsgs([{ de: 'evento', texto: '▶ simulando o fluxo que está NA TELA (salve pra valer no canal)' }]);
    const r = avancarSim(passos, { passo: 0, dados: {}, tentativas: 0, encerrado: false });
    setSimAberto(true);
    aplicarSaida(r);
  };

  const enviarSim = () => {
    const t = simInput.trim();
    if (!t || simEstado.encerrado) return;
    setSimInput('');
    setSimMsgs((xs) => [...xs, { de: 'cliente', texto: t }]);
    aplicarSaida(responderSim(passos, simEstado, t));
  };

  /* -------- render dos passos -------- */
  const renderPasso = (p: Passo, i: number) => (
    <div key={i} className="fx-passo">
      <div className="fx-passo-cab">
        <span className="fx-passo-num num">{i + 1}</span>
        <b>{ROTULO_PASSO[p.tipo]}</b>
        <span className="fx-passo-acoes">
          <BotaoMini onClick={() => moverPasso(i, -1)} disabled={i === 0} aria-label="Subir passo">↑</BotaoMini>
          <BotaoMini onClick={() => moverPasso(i, 1)} disabled={i === passos.length - 1} aria-label="Descer passo">↓</BotaoMini>
          <BotaoMini className="btn-perigo" onClick={() => removerPasso(i)} aria-label="Remover passo">✕</BotaoMini>
        </span>
      </div>

      {(p.tipo === 'mensagem' || p.tipo === 'pergunta' || p.tipo === 'coletar' || p.tipo === 'fim') && (
        <Campo rotulo={p.tipo === 'fim' ? 'Mensagem de despedida (opcional) — cada linha vira um balão' : 'Balões — cada linha vira um balão'}>
          {(id) => (
            <textarea id={id} className="inp fx-baloes" rows={2}
              value={paraTexto(p.baloes)}
              onChange={(e) => mudarPasso(i, { ...p, baloes: paraBaloes(e.target.value) } as Passo)}
              placeholder={'Olá! 👋\nComo posso ajudar?'}
            />
          )}
        </Campo>
      )}

      {p.tipo === 'pergunta' && (
        <>
          <div className="campo"><label>Opções (o cliente responde pelo número ou pelo nome)</label>
            {p.opcoes.map((o, oi) => (
              <div key={oi} className="fx-opcao">
                <span className="ia-hint num">{oi + 1}.</span>
                <input className="inp" value={o.rotulo}
                  onChange={(e) => mudarPasso(i, { ...p, opcoes: p.opcoes.map((x, xi) => xi === oi ? { ...x, rotulo: e.target.value } : x) })}
                  placeholder={oi === 0 ? 'ex.: Empréstimo' : 'ex.: Outro assunto'} aria-label={`Opção ${oi + 1}`} />
                <select className="inp fx-irpara" value={o.irPara ?? ''} aria-label={`Opção ${oi + 1} vai para`}
                  onChange={(e) => mudarPasso(i, { ...p, opcoes: p.opcoes.map((x, xi) => xi === oi ? { ...x, irPara: e.target.value || undefined } : x) })}>
                  <option value="">→ próximo passo</option>
                  {passos.map((pp, idx) => (idx !== i && pp.id)
                    ? <option key={pp.id} value={pp.id}>{`→ passo ${idx + 1}: ${ROTULO_PASSO[pp.tipo]}`}</option>
                    : null)}
                  <option value="fim">→ encerrar o fluxo</option>
                </select>
                <BotaoMini className="btn-perigo" onClick={() => mudarPasso(i, { ...p, opcoes: p.opcoes.filter((_, xi) => xi !== oi) })}
                  disabled={p.opcoes.length <= 2} aria-label={`Remover opção ${oi + 1}`}>✕</BotaoMini>
              </div>
            ))}
            <div><BotaoMini onClick={() => mudarPasso(i, { ...p, opcoes: [...p.opcoes, { rotulo: '', valor: '' }] })} disabled={p.opcoes.length >= 8}>+ opção</BotaoMini></div>
          </div>
          <div className="ia-2col">
            <Campo rotulo="Guardar a escolha como (ex.: interesse)" value={p.salvarEm}
              onChange={(e) => mudarPasso(i, { ...p, salvarEm: e.target.value.replace(/\s+/g, '_').toLowerCase() })} />
            <Campo rotulo="Se não entender (reprompt)" value={p.reprompt}
              onChange={(e) => mudarPasso(i, { ...p, reprompt: e.target.value })}
              placeholder="Responda com o número de uma das opções 🙂" />
          </div>
        </>
      )}

      {p.tipo === 'coletar' && (
        <div className="ia-2col">
          <Campo rotulo="Qual dado?">
            {(id) => (
              <select id={id} className="inp" value={p.dado}
                onChange={(e) => mudarPasso(i, { ...p, dado: e.target.value as DadoColeta })}>
                {(Object.keys(ROTULO_DADO) as DadoColeta[]).map((d) => <option key={d} value={d}>{ROTULO_DADO[d]}</option>)}
              </select>
            )}
          </Campo>
          <Campo rotulo="Guardar como (ex.: nome)" value={p.salvarEm}
            onChange={(e) => mudarPasso(i, { ...p, salvarEm: e.target.value.replace(/\s+/g, '_').toLowerCase() })} />
          <Campo rotulo="Se o dado não validar (reprompt)" value={p.reprompt}
            onChange={(e) => mudarPasso(i, { ...p, reprompt: e.target.value })}
            placeholder="Não consegui validar — confere pra mim?" />
        </div>
      )}

      {p.tipo === 'acao' && (
        <>
          <Campo rotulo="Aplicar etiqueta (vazio = não aplica)" value={p.etiqueta ?? ''}
            onChange={(e) => mudarPasso(i, { ...p, etiqueta: e.target.value })}
            placeholder="ex.: lead-qualificado" />
          <div className="fx-toggles">
            <label className="fx-toggle-item">
              <Toggle ligado={p.chamarHumano === true} aoMudar={(v: boolean) => mudarPasso(i, { ...p, chamarHumano: v })} rotulo="Chamar atendente humano" />
              <span>Chamar atendente humano (pausa o bot)</span>
            </label>
            <label className="fx-toggle-item">
              <Toggle ligado={p.entregarIa === true} aoMudar={(v: boolean) => mudarPasso(i, { ...p, entregarIa: v })} rotulo="Entregar pro Atendente de IA" />
              <span>Entregar pro Atendente de IA <span className="ia-hint">(precisa da IA ligada no canal; se não der, chama o humano)</span></span>
            </label>
          </div>
        </>
      )}

      {p.tipo === 'fim' && <div className="ia-hint">Depois do fim, o bot fica em silêncio nesta conversa — o atendimento segue com o time.</div>}
    </div>
  );

  /* -------- render -------- */
  return (
    <div className="ia-pagina">
      <div className="ph sobe">
        <div>
          <h1>Fluxos do bot</h1>
          <p>Monte a conversa automática do seu jeito: mensagens, perguntas, coleta de dados e ações.</p>
        </div>
        {fluxo && <BotaoSec onClick={abrirSimulador}>▶ Testar fluxo</BotaoSec>}
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {carregando ? (
        <CardVidro sobe className="ia-card"><SkeletonTexto linhas={6} /></CardVidro>
      ) : erroCarga ? (
        <CardVidro sobe className="ia-card">
          <EstadoErro titulo="Não consegui carregar os fluxos" descricao={(erroCarga as Error).message}
            aoTentarDeNovo={() => { qFluxos.refetch(); qCanais.refetch(); }} />
        </CardVidro>
      ) : !fluxo ? (
        <CardVidro sobe className="ia-card">
          <EstadoVazio icone="⧉" titulo="Nenhum fluxo ainda"
            descricao="Crie o primeiro: uma sequência de mensagens e perguntas que o bot segue com cada cliente que chega."
            acao={{ rotulo: criar.isPending ? 'Criando…' : 'Criar fluxo', onClick: aoCriar }} />
        </CardVidro>
      ) : (
        <div className="ia-wrap">
          {/* lista de fluxos */}
          <div className="ia-agentes-lista" role="tablist" aria-label="Fluxos do bot">
            {fluxos.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={f.id === fluxo.id}
                className={f.id === fluxo.id ? 'ia-agente-card on' : 'ia-agente-card'}
                onClick={() => trocarPara(f.id)}>
                <span className="ia-agente-nome">{f.nome}</span>
                <span className="ia-agente-meta">
                  {f.ativo ? <BadgeStatus tom="ok">ativo</BadgeStatus> : <BadgeStatus tom="neutro">rascunho</BadgeStatus>}
                  <span className="ia-hint">{f.passos.length} passo(s) · {canais.filter((c) => c.fluxoId === f.id).length} canal(is)</span>
                </span>
              </button>
            ))}
            <button type="button" className="ia-agente-card ia-agente-novo" onClick={() => trocarPara(null)} disabled={criar.isPending}>
              + Novo fluxo
            </button>
          </div>

          {/* identidade do fluxo */}
          <CardVidro sobe className="ia-card" atraso={0.05}>
            <CardCab titulo="Fluxo" direita={<Toggle ligado={ativo} aoMudar={setAtivo} rotulo="Fluxo ativo" />} />
            <div className="ia-2col">
              <Campo rotulo="Nome do fluxo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Boas-vindas + qualificação" />
              <Campo rotulo="Descrição (pra sua equipe)" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="o que esse fluxo faz" />
            </div>
          </CardVidro>

          {/* problemas */}
          {problemas.length > 0 && (
            <div className="aviso-inline erro" role="status">
              <div>
                <b>Antes de ativar, resolva:</b>
                <ul className="fx-problemas">{problemas.map((pr, i) => <li key={i}>{pr}</li>)}</ul>
              </div>
            </div>
          )}

          {/* passos */}
          <CardVidro sobe className="ia-card" atraso={0.1}>
            <CardCab titulo="Passos" contador={passos.length} />
            {passos.length === 0 && <p className="ia-hint">Comece adicionando uma mensagem de boas-vindas.</p>}
            {passos.map(renderPasso)}
            <div className="fx-add">
              <span className="ia-hint">Adicionar passo:</span>
              {TIPOS_NOVOS.map((t) => <BotaoMini key={t} onClick={() => adicionarPasso(t)}>+ {ROTULO_PASSO[t]}</BotaoMini>)}
            </div>
          </CardVidro>

          {/* canais */}
          <CardVidro sobe className="ia-card" atraso={0.15}>
            <CardCab titulo="Canais usando este fluxo" contador={canais.filter((c) => c.fluxoId === fluxo.id).length} />
            {canais.length === 0 ? (
              <p className="ia-hint">Nenhum canal de WhatsApp conectado — conecte em Integrações.</p>
            ) : canais.map((c) => (
              <div key={c.id} className="ia-canal">
                <Checkbox marcado={c.fluxoId === fluxo.id} aoAlternar={() => aoVincular(c, c.fluxoId !== fluxo.id)}
                  rotulo={`Usar este fluxo no canal ${c.nome}`} />
                <div className="ia-canal-info">
                  <div className="ia-canal-nome">{c.nome}</div>
                  <div className="ia-hint">{c.numero ? `+${c.numero}` : 'sem número conectado'}</div>
                </div>
                {c.fluxoId && c.fluxoId !== fluxo.id && <BadgeStatus tom="neutro">usa outro fluxo</BadgeStatus>}
              </div>
            ))}
            <div className="ia-hint">
              O canal marcado passa a rodar ESTE fluxo com todo cliente novo (o fluxo precisa estar <b>ativo</b> e salvo —
              vincular um rascunho deixaria o canal mudo). Desmarcar devolve o canal ao comportamento de fábrica.
            </div>
          </CardVidro>

          {/* rodapé */}
          <div className="ia-rodape">
            <BotaoMini className="btn-perigo" onClick={() => setConfirmaExcluir(true)}>Excluir fluxo</BotaoMini>
            <BotaoPrimario onClick={aoSalvar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar fluxo'}
            </BotaoPrimario>
          </div>
        </div>
      )}

      {/* simulador */}
      <DrawerV2 aberto={simAberto} aoFechar={() => setSimAberto(false)} largura={420}>
        <div className="ia-chat">
          <div className="ia-chat-cab">
            <div>
              <div className="ia-canal-nome">Testando: {nome || 'Fluxo'}</div>
              <div className="ia-hint">Simulação local do que está na tela — nada é enviado.</div>
            </div>
            <BotaoMini onClick={abrirSimulador}>Recomeçar</BotaoMini>
          </div>
          <div className="ia-chat-msgs" role="log" aria-live="polite">
            {simMsgs.map((m, i) => m.de === 'evento'
              ? <div key={i} className="fx-evento">{m.texto}</div>
              : <div key={i} className={`ia-bolha ${m.de === 'cliente' ? 'cli' : 'ia'}`}>{m.texto}</div>)}
            <div ref={simFimRef} />
          </div>
          <div className="ia-chat-input">
            <input className="inp" value={simInput} autoFocus
              onChange={(e) => setSimInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviarSim(); } }}
              placeholder={simEstado.encerrado ? 'Fluxo encerrado — Recomeçar pra testar de novo' : 'Responda como cliente…'}
              disabled={simEstado.encerrado} aria-label="Resposta do cliente (simulação)" />
            <BotaoPrimario mini onClick={enviarSim} disabled={!simInput.trim() || simEstado.encerrado}>Enviar</BotaoPrimario>
          </div>
        </div>
      </DrawerV2>

      <ConfirmDialogV2
        aberto={!!confirmaTroca}
        titulo="Descartar mudanças não salvas?"
        mensagem="Você editou este fluxo e não salvou. Trocar agora descarta essas mudanças."
        rotuloConfirmar="Descartar e trocar"
        destrutivo
        aoConfirmar={() => {
          const alvo = confirmaTroca;
          setConfirmaTroca(null);
          if (!alvo) return;
          if (alvo.id === null) { aoCriar(); } else { setSelId(alvo.id); }
        }}
        aoCancelar={() => setConfirmaTroca(null)}
      />

      <ConfirmDialogV2
        aberto={confirmaExcluir}
        titulo="Excluir fluxo?"
        mensagem="Os canais que usam este fluxo têm o BOT DESLIGADO junto (ninguém volta pro fluxo de fábrica sem querer). Essa ação não tem volta."
        rotuloConfirmar="Excluir"
        destrutivo
        carregando={excluir.isPending}
        aoConfirmar={aoExcluir}
        aoCancelar={() => setConfirmaExcluir(false)}
      />
    </div>
  );
}
