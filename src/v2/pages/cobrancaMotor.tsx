import { useMemo, useState } from 'react';
import {
  BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  EstadoVazio, Input, Kpi, ModalV2, TabelaPadrao, Toggle,
  type Coluna, type TomStatus,
} from '../components';

/* ------------------------------------------------------------------
   Modo Cobrança — sub-abas do motor dedicado (Fase B, UI).
   Ciclos · Régua de mensagens · Números & Atendentes · Envios.
   Backend real = tabelas cobranca_* (Fase A, já em prod). Aqui o
   conteúdo é seed de demonstração pra revisão visual; o envio nasce
   em SIMULAÇÃO (dry-run) — disparo real é Fase C, com "sim" do dono.
   ------------------------------------------------------------------ */

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaBR = (n: number) => String(n).padStart(2, '0');

/* =================== CICLOS =================== */

type CicloDemo = { codigo: string; nome: string; dia: number; grupo: 'inicio_mes' | 'fim_mes'; clientes: { nome: string; valor: number; atendente: string; venc: number }[] };
const CICLOS_DEMO: CicloDemo[] = [
  { codigo: 'D01', nome: 'Dia 1', dia: 1, grupo: 'inicio_mes', clientes: [
    { nome: 'Maria Aparecida Souza', valor: 108, atendente: 'Giovana', venc: 1 },
    { nome: 'João Batista Ferreira', valor: 96, atendente: 'Giovana', venc: 1 },
    { nome: 'Cleusa M. Ribeiro', valor: 120, atendente: 'Matheus', venc: 1 },
  ] },
  { codigo: 'D02', nome: 'Dia 2', dia: 2, grupo: 'inicio_mes', clientes: [
    { nome: 'José Carlos Ferreira', valor: 127, atendente: 'Matheus', venc: 2 },
    { nome: 'Terezinha M. Alves', valor: 85, atendente: 'Giovana', venc: 2 },
  ] },
  { codigo: 'D03', nome: 'Dia 3', dia: 3, grupo: 'inicio_mes', clientes: [
    { nome: 'Antônio Pereira Lima', valor: 150, atendente: 'Junior', venc: 3 },
  ] },
  { codigo: 'D25', nome: 'Dia 25', dia: 25, grupo: 'fim_mes', clientes: [
    { nome: 'Sebastião R. Nunes', valor: 65, atendente: 'Garcia', venc: 25 },
    { nome: 'Ivone F. Cardoso', valor: 72, atendente: 'Garcia', venc: 27 },
  ] },
  { codigo: 'D28', nome: 'Dia 28', dia: 28, grupo: 'fim_mes', clientes: [
    { nome: 'Nara T. Rodrigues', valor: 90, atendente: 'Junior', venc: 28 },
  ] },
];

export function AbaCiclos({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [aberto, setAberto] = useState<string | null>('D01');
  const totalClientes = CICLOS_DEMO.reduce((s, c) => s + c.clientes.length, 0);
  const totalMes = CICLOS_DEMO.reduce((s, c) => s + c.clientes.reduce((a, cl) => a + cl.valor, 0), 0);
  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Ciclos de vencimento" valor={CICLOS_DEMO.length} />
        <Kpi rotulo="Clientes nos ciclos" valor={totalClientes} />
        <Kpi rotulo="Recorrência/mês" valor={Math.trunc(totalMes)} formato="mil" prefixo="R$ " sufixo=",00" tomValor="ok" />
        <Kpi rotulo="1º vencimento" valor={CICLOS_DEMO[0].dia} prefixo="Dia " />
      </div>
      <p className="cm-hint sobe" style={{ animationDelay: '.06s' }}>
        Cada ciclo é um grupo de clientes com o mesmo dia de vencimento (quando o benefício do INSS cai). Abra um ciclo para ver os clientes e enfileirar a cobrança do mês.
      </p>
      <div className="cm-ciclos sobe" style={{ animationDelay: '.12s' }}>
        {CICLOS_DEMO.map((c) => {
          const on = aberto === c.codigo;
          const soma = c.clientes.reduce((s, cl) => s + cl.valor, 0);
          return (
            <CardVidro spot key={c.codigo} className={on ? 'cm-ciclo on' : 'cm-ciclo'}>
              <button type="button" className="cm-ciclo-cab" onClick={() => setAberto(on ? null : c.codigo)} aria-expanded={on}>
                <span className="cm-ciclo-cod">{c.codigo}</span>
                <span className="cm-ciclo-nm">Vence dia {diaBR(c.dia)}<b>{c.grupo === 'inicio_mes' ? 'início do mês' : 'fim do mês'}</b></span>
                <span className="cm-ciclo-n num">{c.clientes.length} cliente{c.clientes.length === 1 ? '' : 's'} · {fmtBRL(soma)}</span>
                <span className="cm-ciclo-seta" aria-hidden>{on ? '▾' : '▸'}</span>
              </button>
              {on && (
                <div className="cm-ciclo-corpo">
                  <table className="cm-tab">
                    <thead><tr><th>Cliente</th><th className="d">Mensalidade</th><th>Vencimento</th><th>Atendente</th></tr></thead>
                    <tbody>
                      {c.clientes.map((cl) => (
                        <tr key={cl.nome}>
                          <td>{cl.nome}</td>
                          <td className="d num">{fmtBRL(cl.valor)}</td>
                          <td className="num">dia {diaBR(cl.venc)}</td>
                          <td>{cl.atendente}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {gestor && (
                    <div className="cm-ciclo-acao">
                      <BotaoSec mini onClick={() => aoAvisar(`Simulação: ${c.clientes.length} cobrança(s) do ciclo ${c.codigo} entrariam na fila em modo teste.`)}>
                        Enfileirar cobrança do ciclo (simulação)
                      </BotaoSec>
                    </div>
                  )}
                </div>
              )}
            </CardVidro>
          );
        })}
      </div>
    </>
  );
}

/* =================== RÉGUA / MENSAGENS =================== */

type MsgDemo = { tipo: 'antes' | 'cobranca' | 'depois' | 'remarketing'; nome: string; corpo: string; offset: number };
const ROTULO_TIPO: Record<MsgDemo['tipo'], string> = { antes: 'Antes', cobranca: 'Cobrança', depois: 'Depois', remarketing: 'Remarketing' };
const OFFSET_TXT = (n: number) => (n < 0 ? `${Math.abs(n)} dia(s) antes` : n === 0 ? 'no dia do vencimento' : `${n} dia(s) depois`);
const MSGS_DEMO: MsgDemo[] = [
  { tipo: 'antes', nome: 'Lembrete amigável', offset: -3, corpo: 'Oi {nome}! Aqui é o {atendente}. Passando pra lembrar que sua mensalidade de {valor} vence dia {vencimento}. Qualquer dúvida, é só chamar. 😊' },
  { tipo: 'cobranca', nome: 'Cobrança do dia', offset: 0, corpo: 'Olá {nome}, hoje é o vencimento da sua mensalidade de {valor}. Você pode confirmar o pagamento por aqui mesmo. Obrigado!' },
  { tipo: 'depois', nome: 'Aviso de atraso', offset: 2, corpo: '{nome}, notamos que a mensalidade de {valor} (venc. {vencimento}) ainda consta em aberto. Conseguiu acertar? Estou à disposição.' },
  { tipo: 'remarketing', nome: 'Retomada', offset: 7, corpo: 'Oi {nome}, faz alguns dias da última mensalidade. Quer que eu te ajude a regularizar? Podemos combinar da melhor forma pra você.' },
];

export function AbaRegua({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [editar, setEditar] = useState<MsgDemo | null>(null);
  const passos = [...MSGS_DEMO].sort((a, b) => a.offset - b.offset);
  return (
    <>
      <p className="cm-hint sobe">
        A régua define <b>quais mensagens</b> saem e <b>quando</b>, sempre relativo ao vencimento de cada cliente — então quem vence dia 1 e quem vence dia 25 recebem o mesmo lembrete, cada um na data certa.
      </p>
      <span className="caps sobe" style={{ display: 'block', margin: '4px 0 10px', animationDelay: '.06s' }}>Linha do tempo da régua</span>
      <div className="cm-timeline sobe" style={{ animationDelay: '.12s' }}>
        {passos.map((m) => (
          <div className={'cm-passo t-' + m.tipo} key={m.tipo}>
            <div className="cm-passo-quando num">{OFFSET_TXT(m.offset)}</div>
            <CardVidro spot className="cm-passo-card">
              <div className="cm-passo-cab">
                <BadgeStatus tom={m.tipo === 'cobranca' ? 'ok' : m.tipo === 'depois' ? 'atencao' : m.tipo === 'remarketing' ? 'erro' : 'neutro'}>{ROTULO_TIPO[m.tipo]}</BadgeStatus>
                <span className="cm-passo-nm">{m.nome}</span>
                {gestor && <button type="button" className="cm-passo-edit" onClick={() => setEditar(m)}>Editar</button>}
              </div>
              <p className="cm-passo-corpo">{m.corpo}</p>
            </CardVidro>
          </div>
        ))}
      </div>
      {gestor && (
        <div className="sobe" style={{ marginTop: 14, animationDelay: '.2s' }}>
          <BotaoSec mini onClick={() => aoAvisar('Simulação: a régua seria salva e passaria a valer para os próximos vencimentos.')}>＋ Adicionar passo</BotaoSec>
        </div>
      )}
      {editar && (
        <ModalV2 aberto aoFechar={() => setEditar(null)} largura={520}
          titulo={<div>Editar mensagem<div className="mod-sub">{ROTULO_TIPO[editar.tipo]} · {OFFSET_TXT(editar.offset)}</div></div>}
          rodape={<><BotaoSec onClick={() => setEditar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={() => { aoAvisar('Simulação: mensagem salva.'); setEditar(null); }}>Salvar</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="campo"><label>Nome</label><Input defaultValue={editar.nome} /></div>
            <div className="campo"><label>Texto da mensagem</label><textarea className="inp" rows={5} defaultValue={editar.corpo} /></div>
            <p className="cm-vars">Variáveis: <code>{'{nome}'}</code> <code>{'{valor}'}</code> <code>{'{vencimento}'}</code> <code>{'{atendente}'}</code></p>
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* =================== NÚMEROS & ATENDENTES =================== */

type NumDemo = { atendente: string; numero: string | null; status: 'conectado' | 'sincronizando' | 'desconectado'; clientes: number };
const NUMS_DEMO: NumDemo[] = [
  { atendente: 'Giovana', numero: '+55 51 98812-4407', status: 'conectado', clientes: 3 },
  { atendente: 'Matheus', numero: '+55 51 99214-8830', status: 'conectado', clientes: 2 },
  { atendente: 'Junior', numero: '+55 51 98120-7745', status: 'sincronizando', clientes: 2 },
  { atendente: 'Garcia', numero: null, status: 'desconectado', clientes: 2 },
];
const TOM_CONEXAO: Record<NumDemo['status'], TomStatus> = { conectado: 'ok', sincronizando: 'atencao', desconectado: 'erro' };
const ROTULO_CONEXAO: Record<NumDemo['status'], string> = { conectado: 'Conectado', sincronizando: 'Conectando…', desconectado: 'Desconectado' };

export function AbaNumeros({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  return (
    <>
      <p className="cm-hint sobe">
        Cada atendente conecta o próprio número (leitura do QR code). Na hora do envio, a cobrança sai <b>pelo número do atendente daquele cliente</b> — o cliente recebe sempre de quem já fala com ele.
      </p>
      <div className="cm-nums sobe" style={{ animationDelay: '.08s' }}>
        {NUMS_DEMO.map((n) => (
          <CardVidro spot key={n.atendente} className="cm-num">
            <div className="cm-num-top">
              <span className="cm-num-av" aria-hidden>{n.atendente.slice(0, 2).toUpperCase()}</span>
              <div className="cm-num-quem">
                <div className="cm-num-nm">{n.atendente}</div>
                <div className="cm-num-tel num">{n.numero ?? 'Sem número conectado'}</div>
              </div>
              <BadgeStatus tom={TOM_CONEXAO[n.status]}>{ROTULO_CONEXAO[n.status]}</BadgeStatus>
            </div>
            <div className="cm-num-pe">
              <span className="cm-num-cli num">{n.clientes} cliente{n.clientes === 1 ? '' : 's'} na carteira</span>
              {gestor && (n.status === 'desconectado'
                ? <BotaoSec mini onClick={() => setQr(n.atendente)}>Conectar número</BotaoSec>
                : <button type="button" className="cm-num-lnk" onClick={() => aoAvisar('Simulação: reconectar / trocar número do atendente.')}>Gerenciar</button>)}
            </div>
          </CardVidro>
        ))}
      </div>
      {qr && (
        <ModalV2 aberto aoFechar={() => setQr(null)} largura={380}
          titulo={<div>Conectar número<div className="mod-sub">{qr}</div></div>}
          rodape={<BotaoSec onClick={() => setQr(null)}>Fechar</BotaoSec>}>
          <div className="cm-qr">
            <div className="cm-qr-quad" aria-hidden><span>QR</span></div>
            <p>Abra o WhatsApp do atendente → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> e aponte a câmera. (Demonstração — o QR real aparece com o backend do Evolution.)</p>
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* =================== ENVIOS (fila, dry-run) =================== */

type FilaDemo = { id: string; cliente: string; tipo: MsgDemo['tipo']; quando: string; canal: string; status: string };
const FILA_DEMO: FilaDemo[] = [
  { id: 'f1', cliente: 'Maria Aparecida Souza', tipo: 'antes', quando: 'Hoje 09:00', canal: 'Giovana', status: 'simulada' },
  { id: 'f2', cliente: 'José Carlos Ferreira', tipo: 'cobranca', quando: 'Hoje 09:00', canal: 'Matheus', status: 'pendente' },
  { id: 'f3', cliente: 'Terezinha M. Alves', tipo: 'depois', quando: 'Amanhã 09:00', canal: 'Giovana', status: 'pendente' },
  { id: 'f4', cliente: 'Antônio Pereira Lima', tipo: 'cobranca', quando: 'Hoje 09:00', canal: 'Junior', status: 'bloqueada_janela' },
  { id: 'f5', cliente: 'Sebastião R. Nunes', tipo: 'remarketing', quando: 'Ontem 09:00', canal: 'Garcia', status: 'enviada' },
  { id: 'f6', cliente: 'Ivone F. Cardoso', tipo: 'antes', quando: 'Ontem 09:00', canal: 'Garcia', status: 'bloqueada_optout' },
];
const TOM_FILA: Record<string, TomStatus> = { pendente: 'neutro', processando: 'atencao', simulada: 'atencao', enviada: 'ok', falhou: 'erro', bloqueada_optout: 'erro', bloqueada_janela: 'erro', cancelada: 'neutro' };
const ROTULO_FILA: Record<string, string> = { pendente: 'Na fila', processando: 'Processando', simulada: 'Simulada', enviada: 'Enviada', falhou: 'Falhou', bloqueada_optout: 'Optou por sair', bloqueada_janela: 'Fora da janela 24h', cancelada: 'Cancelada' };

export function AbaEnvios({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [dryRun, setDryRun] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'pendente' | 'enviada' | 'bloqueada'>('todos');
  const lista = useMemo(() => FILA_DEMO.filter((f) => {
    if (filtro === 'todos') return true;
    if (filtro === 'bloqueada') return f.status.startsWith('bloqueada');
    return f.status === filtro;
  }), [filtro]);
  const naFila = FILA_DEMO.filter((f) => f.status === 'pendente' || f.status === 'simulada').length;

  const colunas: Coluna<FilaDemo>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (f) => f.cliente },
    { chave: 'tipo', titulo: 'Mensagem', render: (f) => <BadgeStatus tom={f.tipo === 'cobranca' ? 'ok' : f.tipo === 'antes' ? 'neutro' : 'atencao'}>{ROTULO_TIPO[f.tipo]}</BadgeStatus> },
    { chave: 'quando', titulo: 'Quando', classe: 'num', render: (f) => f.quando },
    { chave: 'canal', titulo: 'Sai por', render: (f) => f.canal },
    { chave: 'status', titulo: 'Status', render: (f) => <BadgeStatus tom={TOM_FILA[f.status] ?? 'neutro'}>{ROTULO_FILA[f.status] ?? f.status}</BadgeStatus> },
  ];

  return (
    <>
      <div className={dryRun ? 'cm-simbanner on sobe' : 'cm-simbanner sobe'} role="status">
        <div>
          <b>{dryRun ? 'Modo simulação ligado' : '⚠ Envio real ligado'}</b>
          <span>{dryRun ? 'Nada é enviado ao cliente — a fila só registra o que sairia.' : 'As mensagens vão SAIR de verdade para os clientes.'}</span>
        </div>
        {gestor && <Toggle ligado={!dryRun} aoMudar={(v) => { setDryRun(!v); aoAvisar(v ? 'Simulação: envio real exigiria confirmação por senha (Fase C).' : 'Voltou para simulação.'); }} rotulo="Alternar envio real" />}
      </div>
      <div className="kpis sobe" style={{ animationDelay: '.06s' }}>
        <Kpi rotulo="Na fila hoje" valor={naFila} />
        <Kpi rotulo="Enviadas (7d)" valor={FILA_DEMO.filter((f) => f.status === 'enviada').length} tomValor="ok" />
        <Kpi rotulo="Bloqueadas" valor={FILA_DEMO.filter((f) => f.status.startsWith('bloqueada')).length} tomValor="erro" />
        <Kpi rotulo="Optaram por sair" valor={FILA_DEMO.filter((f) => f.status === 'bloqueada_optout').length} />
      </div>
      <div className="cob-filtros sobe" style={{ animationDelay: '.12s' }}>
        <Chips>
          <Chip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</Chip>
          <Chip ativo={filtro === 'pendente'} onClick={() => setFiltro('pendente')}>Na fila</Chip>
          <Chip ativo={filtro === 'enviada'} onClick={() => setFiltro('enviada')}>Enviadas</Chip>
          <Chip ativo={filtro === 'bloqueada'} onClick={() => setFiltro('bloqueada')}>Bloqueadas</Chip>
        </Chips>
        {gestor && <BotaoSec mini onClick={() => aoAvisar(dryRun ? 'Simulação: a fila seria processada em modo teste — nada sai.' : 'Envio real exige confirmação (Fase C).')}>Processar fila agora</BotaoSec>}
      </div>
      <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.18s' }}>
        {lista.length === 0
          ? <EstadoVazio titulo="Nada na fila" descricao="Ajuste o filtro ou enfileire cobranças na aba Ciclos." />
          : <TabelaPadrao colunas={colunas} linhas={lista} chave={(f) => f.id} rodape={{ texto: `${lista.length} na fila` }} />}
      </CardVidro>
    </>
  );
}
