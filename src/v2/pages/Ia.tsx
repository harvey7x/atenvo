/* ============================================================================
   Atendente de IA — Fase 1 (IA configurável)

   O cliente cria e governa o próprio atendente: provedor + chave PRÓPRIA
   (write-only → Vault), modelo, prompt (persona), comportamentos e canais.
   Sem agente vinculado o motor segue no comportamento de fábrica; agente
   DESATIVADO pausa a IA nos canais dele (nunca volta pra fábrica em silêncio).

   Fase 1 roda no GEMINI de ponta a ponta; ChatGPT/Claude aparecem no seletor
   como "em breve" — prometer conversa neles antes do adaptador seria mentira
   (achado P0 da revisão).

   Em modo demo (ou sem Supabase) tudo roda em estado local: dá pra clicar,
   editar e ver o resultado, sem tocar serviço nenhum.
   ============================================================================ */
import { useEffect, useMemo, useState } from 'react';
import './ia.css';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, Campo, CardVidro, CardCab,
  Checkbox, ConfirmDialogV2, EstadoErro, EstadoVazio, LinhaToggle, Segmentado,
  SkeletonTexto, Toggle, type OpcaoSegmentado,
} from '../components';
import { DEMO_MODE } from '@/lib/demo';
import {
  IA_REAL, MOCK_AGENTES, MOCK_CANAIS, MODELOS_SUGERIDOS,
  useAgentesIa, useAtivarCanal, useCanaisIa, useCriarAgente, useExcluirAgente,
  useModoTeste, useSalvarAgente, useSalvarChave, useTestarConexao, useVincularCanais,
  type AgenteIa, type CanalIa, type ProvedorIa,
} from '@/data/ia';

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

const OPCOES_PROVEDOR: OpcaoSegmentado<ProvedorIa>[] = [
  { valor: 'gemini', rotulo: 'Gemini' },
  { valor: 'openai', rotulo: 'ChatGPT · em breve' },
  { valor: 'anthropic', rotulo: 'Claude · em breve' },
];

const NOTA_PROVEDOR: Record<ProvedorIa, string> = {
  gemini: 'Suporte completo nesta fase: conversa, áudio e análise de documentos.',
  openai: 'Chega na próxima fase — por enquanto o atendente roda no Gemini.',
  anthropic: 'Chega na próxima fase — por enquanto o atendente roda no Gemini.',
};

/** 'HH:MM' → minutos (pra validar ordem inicio/fim antes de salvar) */
function minutosDe(hhmm: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

export default function Ia() {
  const usarMock = DEMO_MODE || !IA_REAL;

  /* -------- dados (reais ou locais de demonstração) -------- */
  const qAgentes = useAgentesIa();
  const qCanais = useCanaisIa();
  const [mockAgentes, setMockAgentes] = useState<AgenteIa[]>(MOCK_AGENTES);
  const [mockCanais, setMockCanais] = useState<CanalIa[]>(MOCK_CANAIS);
  const agentes = usarMock ? mockAgentes : (qAgentes.data ?? []);
  const canais = usarMock ? mockCanais : (qCanais.data ?? []);
  const carregando = !usarMock && (qAgentes.isLoading || qCanais.isLoading);
  const erroCarga = !usarMock ? (qAgentes.error || qCanais.error) : null;
  const agente = agentes[0] ?? null;

  const criar = useCriarAgente();
  const salvar = useSalvarAgente();
  const excluir = useExcluirAgente();
  const salvarChaveMut = useSalvarChave();
  const vincular = useVincularCanais();
  const ativarCanal = useAtivarCanal();
  const modoTeste = useModoTeste();
  const testar = useTestarConexao();

  /* -------- formulário (espelha o agente carregado) -------- */
  const [nome, setNome] = useState('');
  const [provedor, setProvedor] = useState<ProvedorIa>('gemini');
  const [modelo, setModelo] = useState('');
  const [prompt, setPrompt] = useState('');
  const [ativo, setAtivo] = useState(false);
  const [horarioAtivo, setHorarioAtivo] = useState(true);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFim, setHoraFim] = useState('19:00');
  const [nudgesAtivos, setNudgesAtivos] = useState(true);
  const [janelaInicio, setJanelaInicio] = useState('07:30');
  const [janelaFim, setJanelaFim] = useState('21:30');
  const [maxDia, setMaxDia] = useState('500');
  const [chave, setChave] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  /* editor inline dos números de teste (um canal por vez) */
  const [editNums, setEditNums] = useState<{ canal: string; valor: string } | null>(null);

  useEffect(() => {
    if (!agente) return;
    setNome(agente.nome);
    setProvedor(agente.provedor);
    setModelo(agente.modelo);
    setPrompt(agente.personaPrompt);
    setAtivo(agente.ativo);
    const c = agente.comportamentos || {};
    setHorarioAtivo(c.horario?.ativo !== false);
    setHoraInicio(c.horario?.inicio || '09:00');
    setHoraFim(c.horario?.fim || '19:00');
    setNudgesAtivos(c.nudges_ativos !== false);
    setJanelaInicio(c.janela?.inicio || '07:30');
    setJanelaFim(c.janela?.fim || '21:30');
    setMaxDia(String(c.max_chamadas_dia ?? 500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente?.id]);

  /* preserva chaves do jsonb que a Fase 1 não expõe (ex.: horario.dias) */
  const comportamentosForm = useMemo(() => {
    const base = agente?.comportamentos ?? {};
    return {
      ...base,
      horario: { ...(base.horario ?? {}), ativo: horarioAtivo, inicio: horaInicio, fim: horaFim },
      janela: { ...(base.janela ?? {}), inicio: janelaInicio, fim: janelaFim },
      nudges_ativos: nudgesAtivos,
      max_chamadas_dia: Math.max(1, Number(maxDia) || 500),
    };
  }, [agente, horarioAtivo, horaInicio, horaFim, janelaInicio, janelaFim, nudgesAtivos, maxDia]);

  const configNaoSalva = !!agente && (modelo.trim() !== agente.modelo || provedor !== agente.provedor);

  /* -------- ações -------- */
  const aoTrocarProvedor = (v: ProvedorIa) => {
    if (v !== 'gemini') {
      setAviso({ tom: 'erro', texto: `${v === 'openai' ? 'ChatGPT' : 'Claude'} chega na próxima fase — nesta versão o atendente roda no Gemini com a sua chave.` });
      return;
    }
    if (v !== provedor) setModelo('');
    setProvedor(v);
  };

  const aoCriar = async () => {
    if (criar.isPending) return;
    if (usarMock) {
      setMockAgentes([{
        id: 'demo-novo', nome: 'Atendente de IA', provedor: 'gemini', modelo: 'gemini-3.6-flash',
        personaPrompt: '', comportamentos: {}, ativo: false, chaveDefinidaEm: null, criadoEm: new Date().toISOString(),
      }]);
      return;
    }
    try { await criar.mutateAsync(); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoSalvar = async () => {
    if (!agente) return;
    if (provedor !== 'gemini') {
      setAviso({ tom: 'erro', texto: 'Nesta fase o atendente roda no Gemini — os outros provedores chegam em breve.' });
      return;
    }
    if (horarioAtivo && minutosDe(horaFim, 19 * 60) <= minutosDe(horaInicio, 9 * 60)) {
      setAviso({ tom: 'erro', texto: 'Horário de atendimento inválido: o fim precisa ser depois do início.' });
      return;
    }
    if (minutosDe(janelaFim, 21 * 60 + 30) <= minutosDe(janelaInicio, 7 * 60 + 30)) {
      setAviso({ tom: 'erro', texto: 'Janela de contato proativo inválida: o fim precisa ser depois do início.' });
      return;
    }
    if (ativo && !agente.chaveDefinidaEm) {
      setAviso({ tom: 'erro', texto: 'Guarde a sua chave no cofre antes de ativar o atendente — sem ela, ele não tem como funcionar na sua conta.' });
      return;
    }
    if (usarMock) {
      setMockAgentes((xs) => xs.map((a) => a.id === agente.id
        ? { ...a, nome, provedor, modelo, personaPrompt: prompt, ativo, comportamentos: comportamentosForm }
        : a));
      setAviso({ tom: 'ok', texto: 'Atendente salvo (demonstração).' });
      return;
    }
    try {
      await salvar.mutateAsync({ id: agente.id, nome, provedor, modelo, personaPrompt: prompt, comportamentos: comportamentosForm, ativo });
      setAviso({ tom: 'ok', texto: 'Atendente salvo.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoSalvarChave = async () => {
    if (!agente || !chave.trim()) return;
    if (usarMock) {
      setMockAgentes((xs) => xs.map((a) => a.id === agente.id ? { ...a, chaveDefinidaEm: new Date().toISOString() } : a));
      setChave('');
      setAviso({ tom: 'ok', texto: 'Chave guardada no cofre (demonstração).' });
      return;
    }
    try {
      await salvarChaveMut.mutateAsync({ agenteId: agente.id, chave: chave.trim() });
      setChave('');
      setAviso({ tom: 'ok', texto: 'Chave guardada no cofre. Ela não fica visível pra ninguém — nem pra nós.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoTestar = async () => {
    if (!agente) return;
    if (configNaoSalva) {
      setAviso({ tom: 'erro', texto: 'Salve o atendente antes de testar — o teste usa a configuração salva, não a que está na tela.' });
      return;
    }
    if (usarMock) {
      setAviso({ tom: 'ok', texto: `Conexão OK — ${modelo || 'modelo'} respondeu (demonstração).` });
      return;
    }
    try {
      const r = await testar.mutateAsync(agente.id);
      setAviso({ tom: r.ok ? 'ok' : 'erro', texto: r.detalhe });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoVincular = async (canal: CanalIa, marcado: boolean) => {
    if (!agente || vincular.isPending) return;
    const novaLista = canais.filter((c) => (c.id === canal.id ? marcado : c.agenteId === agente.id)).map((c) => c.id);
    if (usarMock) {
      setMockCanais((xs) => xs.map((c) => c.id === canal.id ? { ...c, agenteId: marcado ? agente.id : null } : c));
      return;
    }
    try { await vincular.mutateAsync({ agenteId: agente.id, canalIds: novaLista }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoLigarCanal = async (canal: CanalIa, ligado: boolean) => {
    if (usarMock) {
      setMockCanais((xs) => xs.map((c) => c.id === canal.id ? { ...c, iaEnabled: ligado } : c));
      return;
    }
    try { await ativarCanal.mutateAsync({ canalId: canal.id, ativo: ligado }); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoModoTeste = async (canal: CanalIa, teste: boolean, numeros?: string[]) => {
    if (usarMock) {
      setMockCanais((xs) => xs.map((c) => c.id === canal.id
        ? { ...c, iaModoTeste: teste, numerosTeste: numeros ?? c.numerosTeste } : c));
      setEditNums(null);
      return;
    }
    try {
      await modoTeste.mutateAsync({ canalId: canal.id, teste, numeros });
      setEditNums(null);
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const aoExcluir = async () => {
    if (!agente) return;
    if (usarMock) {
      setMockAgentes([]);
      setMockCanais((xs) => xs.map((c) => c.agenteId === agente.id ? { ...c, agenteId: null, iaEnabled: false } : c));
      setConfirmaExcluir(false);
      return;
    }
    try {
      await excluir.mutateAsync(agente.id);
      setConfirmaExcluir(false);
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); setConfirmaExcluir(false); }
  };

  /* -------- render -------- */
  return (
    <div className="ia-pagina">
      <div className="ph sobe">
        <div>
          <h1>Atendente de IA</h1>
          <p>Crie o cérebro do seu atendimento: provedor, chave própria, personalidade e comportamentos.</p>
        </div>
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
          <EstadoErro
            titulo="Não consegui carregar a área de IA"
            descricao={(erroCarga as Error).message}
            aoTentarDeNovo={() => { qAgentes.refetch(); qCanais.refetch(); }}
          />
        </CardVidro>
      ) : !agente ? (
        <CardVidro sobe className="ia-card">
          <EstadoVazio
            icone="✦"
            titulo="Nenhum atendente de IA ainda"
            descricao="Crie o primeiro: você escolhe o provedor, coloca a sua chave e ensina como ele deve falar com seus clientes."
            acao={{ rotulo: criar.isPending ? 'Criando…' : 'Criar atendente', onClick: aoCriar }}
          />
        </CardVidro>
      ) : (
        <div className="ia-wrap">
          {/* ------------------- Identidade ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.05}>
            <CardCab titulo="Identidade" direita={
              <Toggle ligado={ativo} aoMudar={setAtivo} rotulo="Atendente ativo" />
            } />
            <div className="ia-2col">
              <Campo rotulo="Nome do atendente" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Sofia" />
              <Campo rotulo="Modelo">
                {(id) => (
                  <>
                    <input id={id} className="inp" list={`${id}-modelos`} value={modelo}
                      onChange={(e) => setModelo(e.target.value)} placeholder={MODELOS_SUGERIDOS[provedor][0]} />
                    <datalist id={`${id}-modelos`}>
                      {MODELOS_SUGERIDOS[provedor].map((m) => <option key={m} value={m} />)}
                    </datalist>
                  </>
                )}
              </Campo>
            </div>
            <div className="campo">
              <label>Provedor de IA</label>
              <Segmentado opcoes={OPCOES_PROVEDOR} valor={provedor} aoMudar={aoTrocarProvedor} rotulo="Provedor de IA" />
              <div className="ia-hint">{NOTA_PROVEDOR[provedor]}</div>
            </div>
          </CardVidro>

          {/* ------------------- Chave ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.1}>
            <CardCab titulo="Chave de API" direita={
              agente.chaveDefinidaEm
                ? <BadgeStatus tom="ok">Configurada em {new Date(agente.chaveDefinidaEm).toLocaleDateString('pt-BR')}</BadgeStatus>
                : <BadgeStatus tom="atencao">Não configurada</BadgeStatus>
            } />
            <p className="ia-hint">
              A chave é sua: com ela guardada, a conversa do atendente roda na sua conta do provedor. Ela vai pro
              cofre criptografado e <b>nunca mais aparece</b> — nem pra equipe, nem pro suporte. Pra trocar, é só
              colar uma nova. Sem chave guardada, o atendente não pode ser ativado.
            </p>
            <div className="ia-chave-row">
              <input
                className="inp" type="password" autoComplete="off"
                placeholder={agente.chaveDefinidaEm ? 'Colar nova chave (substitui a atual)' : 'Colar a chave do provedor'}
                value={chave} onChange={(e) => setChave(e.target.value)}
                aria-label="Chave de API"
              />
              <BotaoSec onClick={aoSalvarChave} disabled={!chave.trim() || salvarChaveMut.isPending}>
                {salvarChaveMut.isPending ? 'Guardando…' : 'Guardar no cofre'}
              </BotaoSec>
              <BotaoMini onClick={aoTestar} disabled={!agente.chaveDefinidaEm || testar.isPending}>
                {testar.isPending ? 'Testando…' : 'Testar conexão'}
              </BotaoMini>
            </div>
            {configNaoSalva && <div className="ia-hint">Há mudanças não salvas de provedor/modelo — o teste usa o que está salvo.</div>}
          </CardVidro>

          {/* ------------------- Cérebro ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.15}>
            <CardCab titulo="Personalidade e instruções" />
            <Campo rotulo="Prompt do atendente (como ele deve pensar e falar)">
              {(id) => (
                <textarea
                  id={id} className="inp ia-prompt" rows={10}
                  value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder={'Exemplo:\nVocê é a Sofia, atendente da nossa empresa. Atende clientes pelo WhatsApp com frases curtas e cordiais.\nSeu objetivo: entender o caso, coletar os documentos e encaminhar pro consultor.\nNunca prometa valores ou prazos — isso é com o time humano.'}
                />
              )}
            </Campo>
            <div className="ia-hint">
              Deixe vazio pra usar a personalidade de fábrica. Filtro de segurança sempre ativo: mensagens com
              valores, taxas ou promessas de liberação são bloqueadas antes do envio, independente do prompt.
            </div>
          </CardVidro>

          {/* ------------------- Comportamentos ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.2}>
            <CardCab titulo="Comportamentos" />
            <LinhaToggle
              titulo="Horário de atendimento"
              descricao="Fora do horário a IA atende normal, mas avisa quando um atendente humano retorna. Vale de segunda a sexta."
              ligado={horarioAtivo} aoMudar={setHorarioAtivo} rotulo="Horário de atendimento"
            />
            {horarioAtivo && (
              <div className="ia-2col ia-sub">
                <Campo rotulo="Início" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                <Campo rotulo="Fim" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
              </div>
            )}
            <LinhaToggle
              titulo="Follow-up automático"
              descricao="Se o cliente some, a IA retoma com até 3 toques em horários saudáveis."
              ligado={nudgesAtivos} aoMudar={setNudgesAtivos} rotulo="Follow-up automático"
            />
            <div className="ia-2col ia-sub">
              <Campo rotulo="Contato proativo — a partir de" type="time" value={janelaInicio} onChange={(e) => setJanelaInicio(e.target.value)} />
              <Campo rotulo="Contato proativo — até" type="time" value={janelaFim} onChange={(e) => setJanelaFim(e.target.value)} />
            </div>
            <div className="ia-2col ia-sub">
              <Campo rotulo="Limite de chamadas de IA por dia (por canal)" type="number" min={1}
                value={maxDia} onChange={(e) => setMaxDia(e.target.value)} />
            </div>
          </CardVidro>

          {/* ------------------- Canais ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.25}>
            <CardCab titulo="Canais de WhatsApp" contador={canais.length} />
            {canais.length === 0 ? (
              <p className="ia-hint">Nenhum canal de WhatsApp conectado ainda — conecte em Integrações.</p>
            ) : canais.map((c) => (
              <div key={c.id}>
                <div className="ia-canal">
                  <Checkbox
                    marcado={c.agenteId === agente.id}
                    aoAlternar={() => aoVincular(c, c.agenteId !== agente.id)}
                    rotulo={`Vincular ${c.nome} ao atendente`}
                  />
                  <div className="ia-canal-info">
                    <div className="ia-canal-nome">{c.nome}</div>
                    <div className="ia-hint">{c.numero ? `+${c.numero}` : 'sem número conectado'}</div>
                  </div>
                  {c.iaModoTeste ? (
                    <>
                      <BadgeStatus tom="atencao">modo teste</BadgeStatus>
                      <BotaoMini onClick={() => setEditNums(editNums?.canal === c.id ? null : { canal: c.id, valor: c.numerosTeste.join(', ') })}>
                        Números de teste{c.numerosTeste.length ? ` (${c.numerosTeste.length})` : ''}
                      </BotaoMini>
                      <BotaoMini onClick={() => aoModoTeste(c, false)} disabled={modoTeste.isPending}>Ir ao vivo</BotaoMini>
                    </>
                  ) : (
                    <BotaoMini onClick={() => aoModoTeste(c, true)} disabled={modoTeste.isPending}>Modo teste</BotaoMini>
                  )}
                  <div className="ia-canal-liga">
                    <span className="ia-hint">IA no canal</span>
                    <Toggle ligado={c.iaEnabled} aoMudar={(v: boolean) => aoLigarCanal(c, v)} rotulo={`IA ligada no canal ${c.nome}`} />
                  </div>
                </div>
                {editNums?.canal === c.id && (
                  <div className="ia-nums-row">
                    <input
                      className="inp" value={editNums.valor}
                      onChange={(e) => setEditNums({ canal: c.id, valor: e.target.value })}
                      placeholder="Números que a IA atende no teste, separados por vírgula — ex.: 5511999990000"
                      aria-label={`Números de teste do canal ${c.nome}`}
                    />
                    <BotaoSec mini
                      onClick={() => aoModoTeste(c, true, editNums.valor.split(',').map((n) => n.trim()).filter(Boolean))}
                      disabled={modoTeste.isPending}
                    >
                      {modoTeste.isPending ? 'Salvando…' : 'Salvar números'}
                    </BotaoSec>
                  </div>
                )}
              </div>
            ))}
            <div className="ia-hint">
              A caixa vincula o canal a ESTE atendente; o interruptor liga a IA no canal. Em <b>modo teste</b> a IA
              só conversa com os números de teste — experimente com o seu número antes de "Ir ao vivo".
              Atendente desativado (interruptor lá de cima) <b>pausa</b> a IA nos canais vinculados.
            </div>
          </CardVidro>

          {/* ------------------- Rodapé ------------------- */}
          <div className="ia-rodape">
            <BotaoMini className="btn-perigo" onClick={() => setConfirmaExcluir(true)}>Excluir atendente</BotaoMini>
            <BotaoPrimario onClick={aoSalvar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar atendente'}
            </BotaoPrimario>
          </div>
        </div>
      )}

      <ConfirmDialogV2
        aberto={confirmaExcluir}
        titulo="Excluir atendente de IA?"
        mensagem="A chave guardada no cofre é apagada e a IA é DESLIGADA nos canais vinculados. Essa ação não tem volta."
        rotuloConfirmar="Excluir"
        destrutivo
        carregando={excluir.isPending}
        aoConfirmar={aoExcluir}
        aoCancelar={() => setConfirmaExcluir(false)}
      />
    </div>
  );
}
