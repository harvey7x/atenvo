/* ============================================================================
   Atendente de IA — IA configurável (Fase 1 "completa")

   O cliente cria e governa os próprios atendentes: provedor + chave PRÓPRIA
   (write-only → Vault), modelo, prompt (persona), CONHECIMENTO da empresa,
   temas proibidos, humanização (emojis/digitação/tom), comportamentos,
   modelos avançados, canais — e EXPERIMENTA numa conversa de teste antes de
   ligar no WhatsApp. Card de atividade mostra números reais do motor.

   Regras duras (revisão adversarial):
   - Sem agente vinculado o motor é byte-idêntico à fábrica; agente DESATIVADO
     pausa a IA nos canais (nunca fábrica em silêncio).
   - Fase 1 roda no GEMINI; ChatGPT/Claude = "em breve" (sem promessa falsa).
   - Ativar exige chave no cofre; excluir DESLIGA a IA dos canais.
   - Tudo que aparece aqui FUNCIONA no motor — nada decorativo.

   Em modo demo (ou sem Supabase) tudo roda em estado local, clicável.
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import './ia.css';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, Campo, CardVidro, CardCab,
  Checkbox, Chip, Chips, ConfirmDialogV2, DrawerV2, EstadoErro, EstadoVazio,
  LinhaToggle, Segmentado, SkeletonTexto, Toggle, type OpcaoSegmentado,
} from '../components';
import { DEMO_MODE } from '@/lib/demo';
import {
  IA_REAL, MOCK_AGENTES, MOCK_CANAIS, MODELOS_INFO,
  useAgentesIa, useAtivarCanal, useCanaisIa, useConversarPlayground, useCriarAgente,
  useExcluirAgente, useMetricasIa, useModoTeste, useSalvarAgente, useSalvarChave,
  useTestarConexao, useVincularCanais,
  type AgenteIa, type BolhaPlayground, type CanalIa, type ProvedorIa,
} from '@/data/ia';

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;
type MsgChat = { de: 'cliente' | 'ia'; texto: string; bloqueada?: boolean };

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

/* presets de tom: INSEREM texto visível no prompt (transparente, sem mágica escondida) */
/* stopwords que emudeceriam a IA (mesma lista do motor) — rejeitadas na entrada */
const STOP_PROIBIDOS_UI = new Set([
  'com', 'sem', 'nao', 'não', 'sim', 'que', 'por', 'para', 'uma', 'uns', 'umas', 'dos', 'das', 'ele', 'ela',
  'eles', 'elas', 'voce', 'você', 'voces', 'isso', 'isto', 'aqui', 'mais', 'menos', 'muito', 'bem', 'mal',
  'ate', 'até', 'tem', 'ter', 'ser', 'estar', 'foi', 'vai', 'hoje', 'amanha', 'amanhã', 'tudo', 'nada', 'como', 'onde',
]);

const TONS: { rotulo: string; trecho: string }[] = [
  { rotulo: 'Acolhedor', trecho: 'Tom de voz: acolhedor e paciente, como quem atende pessoas mais velhas. Frases curtas, sem pressa, sem jargão.' },
  { rotulo: 'Profissional', trecho: 'Tom de voz: profissional e direto. Cordial, mas objetivo — respostas curtas que vão ao ponto.' },
  { rotulo: 'Vendedor', trecho: 'Tom de voz: consultivo de vendas. Desperte interesse com perguntas, conduza para o próximo passo, sem pressionar.' },
  { rotulo: 'Descontraído', trecho: 'Tom de voz: leve e descontraído, como uma conversa entre conhecidos. Natural, sem formalidade.' },
];

/* Seletor de modelo: select com rótulos amigáveis + descrição, e "Outro" digitável
   pra modelo fora do catálogo. Use com key={agente.id} pra resetar ao trocar de agente. */
function SeletorModelo({ id, provedor, valor, aoMudar, vazioRotulo }: {
  id?: string; provedor: ProvedorIa; valor: string; aoMudar: (v: string) => void;
  /** quando definido, oferece a opção "" (ex.: 'Automático — o motor decide') */
  vazioRotulo?: string;
}) {
  const opcoes = MODELOS_INFO[provedor];
  const ehConhecido = valor === '' ? vazioRotulo !== undefined : opcoes.some((o) => o.valor === valor);
  // começa em false: no 1º render o valor ainda não carregou do agente — se inicializasse
  // por !ehConhecido, travaria em "Outro" pra sempre (o espelho do formulário chega depois)
  const [outroForcado, setOutroForcado] = useState(false);
  const mostrarOutro = outroForcado || !ehConhecido;
  return (
    <div className="ia-sel-modelo">
      <select
        id={id} className="inp" value={mostrarOutro ? '__outro' : valor}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__outro') { setOutroForcado(true); aoMudar(''); }
          else { setOutroForcado(false); aoMudar(v); }
        }}
      >
        {vazioRotulo !== undefined && <option value="">{vazioRotulo}</option>}
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{`${o.rotulo} — ${o.descricao}`}</option>)}
        <option value="__outro">Outro modelo (digitar o nome)…</option>
      </select>
      {mostrarOutro && (
        <input
          className="inp" value={valor} onChange={(e) => aoMudar(e.target.value)}
          placeholder={`nome exato na API (ex.: ${opcoes[0].valor})`}
          autoFocus={outroForcado} aria-label="Nome do modelo personalizado"
        />
      )}
      {!mostrarOutro && valor !== '' && <div className="ia-hint">nome na API: <code>{valor}</code></div>}
    </div>
  );
}

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

  const [selId, setSelId] = useState<string | null>(null);
  const agente = agentes.find((a) => a.id === selId) ?? agentes[0] ?? null;

  const criar = useCriarAgente();
  const salvar = useSalvarAgente();
  const excluir = useExcluirAgente();
  const salvarChaveMut = useSalvarChave();
  const vincular = useVincularCanais();
  const ativarCanal = useAtivarCanal();
  const modoTeste = useModoTeste();
  const testar = useTestarConexao();
  const playground = useConversarPlayground();
  const qMetricas = useMetricasIa(agente?.id ?? null, !usarMock);
  const metricas = usarMock
    ? { sessoesAtivas: 14, chamadasHoje: 128, nudgesHoje: 9, handoffs7d: 21, canais: 1 }
    : qMetricas.data;

  /* -------- formulário (espelha o agente selecionado) -------- */
  const [nome, setNome] = useState('');
  const [provedor, setProvedor] = useState<ProvedorIa>('gemini');
  const [modelo, setModelo] = useState('');
  const [prompt, setPrompt] = useState('');
  const [conhecimento, setConhecimento] = useState('');
  const [proibidos, setProibidos] = useState<string[]>([]);
  const [proibidoInput, setProibidoInput] = useState('');
  const [permitirEmojis, setPermitirEmojis] = useState(false);
  const [simularDigitacao, setSimularDigitacao] = useState(true);
  const [modeloDocs, setModeloDocs] = useState('');
  const [modeloPro, setModeloPro] = useState('');
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
  const [confirmaTroca, setConfirmaTroca] = useState<{ id: string | null } | null>(null); // null = criar novo
  const [editNums, setEditNums] = useState<{ canal: string; valor: string } | null>(null);
  /* playground */
  const [chatAberto, setChatAberto] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<MsgChat[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatFimRef = useRef<HTMLDivElement | null>(null);
  const chatSessaoRef = useRef(0);

  useEffect(() => {
    if (!agente) return;
    setNome(agente.nome);
    setProvedor(agente.provedor);
    setModelo(agente.modelo);
    setPrompt(agente.personaPrompt);
    setConhecimento(agente.conhecimento);
    setAtivo(agente.ativo);
    const c = agente.comportamentos || {};
    setProibidos(Array.isArray(c.proibidos) ? c.proibidos : []);
    setPermitirEmojis(c.permitir_emojis === true);
    setSimularDigitacao(c.simular_digitacao !== false);
    setModeloDocs(c.modelo_docs || '');
    setModeloPro(c.modelo_pro || '');
    setHorarioAtivo(c.horario?.ativo !== false);
    setHoraInicio(c.horario?.inicio || '09:00');
    setHoraFim(c.horario?.fim || '19:00');
    setNudgesAtivos(c.nudges_ativos !== false);
    setJanelaInicio(c.janela?.inicio || '07:30');
    setJanelaFim(c.janela?.fim || '21:30');
    setMaxDia(String(c.max_chamadas_dia ?? 500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agente?.id]);

  useEffect(() => { chatFimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  /* preserva chaves do jsonb que a UI não expõe (ex.: horario.dias reservado) */
  const comportamentosForm = useMemo(() => {
    const base = agente?.comportamentos ?? {};
    return {
      ...base,
      horario: { ...(base.horario ?? {}), ativo: horarioAtivo, inicio: horaInicio, fim: horaFim },
      janela: { ...(base.janela ?? {}), inicio: janelaInicio, fim: janelaFim },
      nudges_ativos: nudgesAtivos,
      max_chamadas_dia: Math.max(1, Number(maxDia) || 500),
      proibidos,
      permitir_emojis: permitirEmojis,
      simular_digitacao: simularDigitacao,
      modelo_docs: modeloDocs.trim(),
      modelo_pro: modeloPro.trim(),
    };
  }, [agente, horarioAtivo, horaInicio, horaFim, janelaInicio, janelaFim, nudgesAtivos, maxDia,
      proibidos, permitirEmojis, simularDigitacao, modeloDocs, modeloPro]);

  const configNaoSalva = !!agente && (modelo.trim() !== agente.modelo || provedor !== agente.provedor);

  /* alguma edição não salva? (guarda contra perda silenciosa ao trocar de atendente) */
  const formSujo = useMemo(() => {
    if (!agente) return false;
    const c = agente.comportamentos || {};
    return nome !== agente.nome || provedor !== agente.provedor || modelo !== agente.modelo
      || prompt !== agente.personaPrompt || conhecimento !== agente.conhecimento
      || ativo !== agente.ativo
      || JSON.stringify(proibidos) !== JSON.stringify(Array.isArray(c.proibidos) ? c.proibidos : [])
      || permitirEmojis !== (c.permitir_emojis === true)
      || simularDigitacao !== (c.simular_digitacao !== false)
      || modeloDocs !== (c.modelo_docs || '') || modeloPro !== (c.modelo_pro || '')
      || horarioAtivo !== (c.horario?.ativo !== false)
      || horaInicio !== (c.horario?.inicio || '09:00') || horaFim !== (c.horario?.fim || '19:00')
      || nudgesAtivos !== (c.nudges_ativos !== false)
      || janelaInicio !== (c.janela?.inicio || '07:30') || janelaFim !== (c.janela?.fim || '21:30')
      || maxDia !== String(c.max_chamadas_dia ?? 500)
      || !!proibidoInput.trim();
  }, [agente, nome, provedor, modelo, prompt, conhecimento, ativo, proibidos, permitirEmojis,
      simularDigitacao, modeloDocs, modeloPro, horarioAtivo, horaInicio, horaFim, nudgesAtivos,
      janelaInicio, janelaFim, maxDia, proibidoInput]);

  const trocarPara = (id: string | null) => {
    if (formSujo) { setConfirmaTroca({ id }); return; }
    if (id === null) { aoCriar(); return; }
    setSelId(id);
  };

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
      const novo: AgenteIa = {
        id: `demo-${Date.now()}`, nome: 'Novo atendente', provedor: 'gemini', modelo: 'gemini-3.6-flash',
        personaPrompt: '', conhecimento: '', comportamentos: {}, ativo: false, chaveDefinidaEm: null,
        criadoEm: new Date().toISOString(),
      };
      setMockAgentes((xs) => [...xs, novo]);
      setSelId(novo.id);
      return;
    }
    try { const id = await criar.mutateAsync(); setSelId(id); }
    catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); }
  };

  const validarProibido = (t: string): string | null => {
    if (t.length < 3) return 'Tema proibido precisa de pelo menos 3 letras.';
    if (STOP_PROIBIDOS_UI.has(t.toLowerCase())) return `"${t}" é palavra comum demais — bloquearia toda frase e a IA ficaria muda.`;
    if (proibidos.length >= 40) return 'Máximo de 40 temas proibidos.';
    return null;
  };
  const adicionarProibido = () => {
    const t = proibidoInput.trim();
    const erro = validarProibido(t);
    if (erro) { setAviso({ tom: 'erro', texto: erro }); return; }
    if (!proibidos.some((p) => p.toLowerCase() === t.toLowerCase())) setProibidos((xs) => [...xs, t]);
    setProibidoInput('');
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
    // termo digitado mas não confirmado no "Adicionar": entra junto no salvar (nada some em silêncio)
    let proibidosFinais = proibidos;
    const pendente = proibidoInput.trim();
    if (pendente) {
      const erroPend = validarProibido(pendente);
      if (erroPend) { setAviso({ tom: 'erro', texto: `Tema proibido pendente: ${erroPend}` }); return; }
      if (!proibidos.some((p) => p.toLowerCase() === pendente.toLowerCase())) proibidosFinais = [...proibidos, pendente];
      setProibidos(proibidosFinais);
      setProibidoInput('');
    }
    const comportamentosFinais = { ...comportamentosForm, proibidos: proibidosFinais };
    if (usarMock) {
      setMockAgentes((xs) => xs.map((a) => a.id === agente.id
        ? { ...a, nome, provedor, modelo, personaPrompt: prompt, conhecimento, ativo, comportamentos: comportamentosFinais }
        : a));
      setAviso({ tom: 'ok', texto: 'Atendente salvo (demonstração).' });
      return;
    }
    try {
      await salvar.mutateAsync({ id: agente.id, nome, provedor, modelo, personaPrompt: prompt, conhecimento, comportamentos: comportamentosFinais, ativo });
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
    if (marcado && !agente.ativo) {
      setAviso({ tom: 'erro', texto: 'Ative o atendente antes de ligá-lo num canal — vincular um atendente pausado deixa a IA sem responder nesse canal.' });
      return;
    }
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
      setMockAgentes((xs) => xs.filter((a) => a.id !== agente.id));
      setMockCanais((xs) => xs.map((c) => c.agenteId === agente.id ? { ...c, agenteId: null, iaEnabled: false } : c));
      setConfirmaExcluir(false);
      setSelId(null);
      return;
    }
    try {
      await excluir.mutateAsync(agente.id);
      setConfirmaExcluir(false);
      setSelId(null);
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message }); setConfirmaExcluir(false); }
  };

  /* -------- playground -------- */
  const podeExperimentar = !!agente && agente.provedor === 'gemini' && !!agente.chaveDefinidaEm;
  const aoEnviarChat = async () => {
    if (!agente || playground.isPending) return;
    const texto = chatInput.trim();
    if (!texto) return;
    setChatInput('');
    const historico = chatMsgs.filter((m) => !m.bloqueada).map((m) => ({ de: m.de, texto: m.texto }));
    setChatMsgs((xs) => [...xs, { de: 'cliente', texto }]);
    if (usarMock) {
      const sessaoAtual = chatSessaoRef.current;
      setTimeout(() => {
        if (chatSessaoRef.current !== sessaoAtual) return;   // limpou/fechou: resposta atrasada morre
        const proibiu = proibidos.some((p) => texto.toLowerCase().includes(p.toLowerCase()));
        setChatMsgs((xs) => [...xs,
          proibiu
            ? { de: 'ia', texto: '🔒 Mensagem bloqueada pelo filtro de segurança (tema proibido).', bloqueada: true }
            : { de: 'ia', texto: `Oi! Aqui é ${nome || 'o atendente'} 😊 Entendi: "${texto.slice(0, 60)}". Me conta um pouco mais pra eu te ajudar direitinho?` },
        ]);
      }, 700);
      return;
    }
    try {
      const bolhas = await playground.mutateAsync({ agenteId: agente.id, mensagem: texto, historico });
      setChatMsgs((xs) => [...xs, ...bolhas.map((b: BolhaPlayground) => ({ de: 'ia' as const, texto: b.texto, bloqueada: b.bloqueada }))]);
    } catch (e) {
      setChatMsgs((xs) => [...xs, { de: 'ia', texto: `⚠️ ${(e as Error).message}`, bloqueada: true }]);
    }
  };

  /* -------- render -------- */
  return (
    <div className="ia-pagina">
      <div className="ph sobe">
        <div>
          <h1>Atendente de IA</h1>
          <p>Crie o cérebro do seu atendimento: chave própria, personalidade, conhecimento e comportamentos.</p>
        </div>
        {agente && (
          <BotaoSec onClick={() => { chatSessaoRef.current++; setChatMsgs([]); setChatAberto(true); }} disabled={!podeExperimentar && !usarMock}
            title={podeExperimentar || usarMock ? 'Conversar com o atendente' : 'Guarde a chave no cofre primeiro'}>
            💬 Experimentar
          </BotaoSec>
        )}
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
          {/* ------------------- Lista de atendentes ------------------- */}
          <div className="ia-agentes-lista" role="tablist" aria-label="Atendentes de IA">
            {agentes.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={a.id === agente.id}
                className={a.id === agente.id ? 'ia-agente-card on' : 'ia-agente-card'}
                onClick={() => trocarPara(a.id)}>
                <span className="ia-agente-nome">{a.nome}</span>
                <span className="ia-agente-meta">
                  {a.ativo ? <BadgeStatus tom="ok">ativo</BadgeStatus> : <BadgeStatus tom="neutro">pausado</BadgeStatus>}
                  <span className="ia-hint">{canais.filter((c) => c.agenteId === a.id).length} canal(is)</span>
                </span>
              </button>
            ))}
            <button type="button" className="ia-agente-card ia-agente-novo" onClick={() => trocarPara(null)} disabled={criar.isPending}>
              + Novo atendente
            </button>
          </div>

          {/* ------------------- Atividade ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.03}>
            <CardCab titulo="Atividade do atendente" direita={<span className="ia-hint">números do motor, ao vivo</span>} />
            <div className="ia-stats num">
              <div className="ia-stat"><b>{metricas?.sessoesAtivas ?? '—'}</b><span>conversas com a IA agora</span></div>
              <div className="ia-stat"><b>{metricas?.chamadasHoje ?? '—'}</b><span>chamadas de IA hoje</span></div>
              <div className="ia-stat"><b>{metricas?.nudgesHoje ?? '—'}</b><span>follow-ups hoje</span></div>
              <div className="ia-stat"><b>{metricas?.handoffs7d ?? '—'}</b><span>passadas ao humano · 7d</span></div>
            </div>
          </CardVidro>

          {/* ------------------- Identidade ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.05}>
            <CardCab titulo="Identidade" direita={
              <Toggle ligado={ativo} aoMudar={setAtivo} rotulo="Atendente ativo" />
            } />
            <div className="ia-2col">
              <Campo rotulo="Nome do atendente" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Sofia" />
              <Campo rotulo="Modelo">
                {(id) => <SeletorModelo key={agente.id} id={id} provedor={provedor} valor={modelo} aoMudar={setModelo} />}
              </Campo>
            </div>
            <div className="campo">
              <label>Provedor de IA</label>
              <Segmentado opcoes={OPCOES_PROVEDOR} valor={provedor} aoMudar={aoTrocarProvedor} rotulo="Provedor de IA" />
              <div className="ia-hint">{NOTA_PROVEDOR[provedor]}</div>
            </div>
          </CardVidro>

          {/* ------------------- Chave ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.08}>
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
          <CardVidro sobe className="ia-card" atraso={0.11}>
            <CardCab titulo="Personalidade e instruções" />
            <div className="ia-tom-row" aria-label="Presets de tom de voz">
              <span className="ia-hint">Tom de voz (insere no prompt):</span>
              {TONS.map((t) => (
                <BotaoMini key={t.rotulo} onClick={() => setPrompt((p) => (p ? `${p.trimEnd()}\n\n${t.trecho}` : t.trecho))}>
                  {t.rotulo}
                </BotaoMini>
              ))}
            </div>
            <Campo rotulo="Prompt do atendente (como ele deve pensar e falar)">
              {(id) => (
                <textarea
                  id={id} className="inp ia-prompt" rows={9}
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

          {/* ------------------- Conhecimento ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.14}>
            <CardCab titulo="Conhecimento da empresa" direita={<span className="ia-hint num">{conhecimento.length}/8000</span>} />
            <Campo rotulo="O que o atendente sabe (endereço, serviços, diferenciais, perguntas frequentes…)">
              {(id) => (
                <textarea
                  id={id} className="inp ia-prompt ia-conhecimento" rows={7} maxLength={8000}
                  value={conhecimento} onChange={(e) => setConhecimento(e.target.value)}
                  placeholder={'Exemplo:\n• Atendemos de segunda a sexta, das 9h às 19h.\n• Trabalhamos com revisão de descontos do INSS.\n• O escritório fica na Av. Paulista, 1000 — São Paulo.\n• Não atendemos casos trabalhistas.'}
                />
              )}
            </Campo>
            <div className="ia-hint">
              A IA usa esses fatos quando o cliente pergunta — sem despejar tudo de uma vez. Mantenha curto e factual.
            </div>
          </CardVidro>

          {/* ------------------- Temas proibidos ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.17}>
            <CardCab titulo="Temas proibidos" contador={proibidos.length} />
            <p className="ia-hint">
              Além do filtro de fábrica (valores, taxas, juros, promessas), a IA <b>nunca</b> cita o que você listar
              aqui — se o modelo tentar, a mensagem é reescrita ou descartada antes do envio.
            </p>
            <div className="ia-chave-row">
              <input
                className="inp" value={proibidoInput}
                onChange={(e) => setProibidoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarProibido(); } }}
                placeholder="ex.: nome de um concorrente, desconto, política…"
                aria-label="Novo tema proibido"
              />
              <BotaoSec onClick={adicionarProibido} disabled={!proibidoInput.trim()}>Adicionar</BotaoSec>
            </div>
            {proibidos.length > 0 && (
              <Chips>
                {proibidos.map((t) => (
                  <Chip key={t} ativo removivel onClick={() => setProibidos((xs) => xs.filter((x) => x !== t))}>{t}</Chip>
                ))}
              </Chips>
            )}
          </CardVidro>

          {/* ------------------- Humanização ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.2}>
            <CardCab titulo="Humanização" />
            <LinhaToggle
              titulo={'Simular "digitando…"'}
              descricao="Antes de cada mensagem, o cliente vê o atendente digitando por alguns segundos — como uma pessoa."
              ligado={simularDigitacao} aoMudar={setSimularDigitacao} rotulo="Simular digitando"
            />
            <LinhaToggle
              titulo="Permitir emojis"
              descricao="De fábrica a IA não usa emojis (evita burlar o filtro). Ligue se quiser um tom mais leve."
              ligado={permitirEmojis} aoMudar={setPermitirEmojis} rotulo="Permitir emojis"
            />
          </CardVidro>

          {/* ------------------- Comportamentos ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.23}>
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

          {/* ------------------- Avançado ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.26}>
            <CardCab titulo="Avançado — modelos por função" direita={<span className="ia-hint">opcional</span>} />
            <p className="ia-hint">
              Vazio = o motor decide (usa o modelo principal e sobe automático em casos complexos). Preencha só
              se quiser forçar um modelo específico pra cada função.
            </p>
            <div className="ia-2col">
              <Campo rotulo="Modelo pra ler documentos (visão)">
                {(id) => (
                  <SeletorModelo key={`docs-${agente.id}`} id={id} provedor="gemini" valor={modeloDocs}
                    aoMudar={setModeloDocs} vazioRotulo="Automático — o motor decide (recomendado)" />
                )}
              </Campo>
              <Campo rotulo="Modelo forte pra casos complexos">
                {(id) => (
                  <SeletorModelo key={`pro-${agente.id}`} id={id} provedor="gemini" valor={modeloPro}
                    aoMudar={setModeloPro} vazioRotulo="Automático — o motor decide (recomendado)" />
                )}
              </Campo>
            </div>
          </CardVidro>

          {/* ------------------- Canais ------------------- */}
          <CardVidro sobe className="ia-card" atraso={0.29}>
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

      {/* ------------------- Playground ------------------- */}
      <DrawerV2 aberto={chatAberto} aoFechar={() => { chatSessaoRef.current++; setChatAberto(false); }} largura={420}>
        <div className="ia-chat">
          <div className="ia-chat-cab">
            <div>
              <div className="ia-canal-nome">Experimentar: {nome || 'Atendente'}</div>
              <div className="ia-hint">Conversa de teste — roda na sua chave, nada vai pro WhatsApp nem fica salvo.</div>
            </div>
            <BotaoMini onClick={() => { chatSessaoRef.current++; setChatMsgs([]); }}>Limpar</BotaoMini>
          </div>
          {formSujo && (
            <div className="ia-hint" role="status">⚠ Há mudanças não salvas — o teste usa a configuração <b>salva</b>. Salve antes pra testar o que está na tela.</div>
          )}
          <div className="ia-chat-msgs" role="log" aria-live="polite">
            {chatMsgs.length === 0 && (
              <div className="ia-hint ia-chat-vazio">
                Escreva como se fosse um cliente chegando no WhatsApp. Dica: pergunte algo do
                "Conhecimento da empresa" ou tente um tema proibido pra ver o filtro agir.
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`ia-bolha ${m.de === 'cliente' ? 'cli' : 'ia'}${m.bloqueada ? ' blq' : ''}`}>{m.texto}</div>
            ))}
            {playground.isPending && <div className="ia-bolha ia">digitando…</div>}
            <div ref={chatFimRef} />
          </div>
          <div className="ia-chat-input">
            <input
              className="inp" value={chatInput} autoFocus
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoEnviarChat(); } }}
              placeholder="Escreva como cliente…" aria-label="Mensagem de teste"
            />
            <BotaoPrimario mini onClick={aoEnviarChat} disabled={!chatInput.trim() || playground.isPending}>Enviar</BotaoPrimario>
          </div>
        </div>
      </DrawerV2>

      <ConfirmDialogV2
        aberto={!!confirmaTroca}
        titulo="Descartar mudanças não salvas?"
        mensagem="Você editou este atendente e não salvou. Trocar agora descarta essas mudanças."
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
