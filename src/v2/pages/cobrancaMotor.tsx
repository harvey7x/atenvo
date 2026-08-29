import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, DrawerV2,
  EstadoVazio, Input, Kpi, ModalV2, TabelaPadrao, Toggle,
  type Coluna, type TomStatus,
} from '../components';
import {
  seedClientes, metricasPorAtendente, metricasPorCiclo, resumoCarteira, CICLO_DIA,
  estadoCelula, cabecalhoCiclo, ROTULO_COMP,
  type ClienteAnalise, type Comportamento, type StatusMes, type TipoMsg,
} from './cobrancaAnalytics';
import { useOrg } from '@/context/OrgContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { useCobNumeros, cobWaConectar, cobWaStatus, cobWaDesconectar, type CobNumero } from '@/data/cobrancaWa';

/** célula da grade de pagamentos (máquina de estados do legado Gestão Mensal) */
function Celula({ raw }: { raw: string }) {
  const e = estadoCelula(raw);
  if (e.estado === 'pago') return <span className="gc gc-pago">{e.display}</span>;
  if (e.estado === 'nao_pagou') return <span className="gc gc-naopagou">NÃO PAGOU{e.dataOrig && <i>{e.dataOrig}</i>}</span>;
  if (e.estado === 'aguardando_entrada') return <span className="gc gc-aguardando">{e.display}</span>;
  if (e.estado === 'info') return <span className="gc gc-info">{e.display}</span>;
  return <span className="gc gc-vazio">—</span>;
}

const CLIENTES = seedClientes();
const compBadge: Record<Comportamento, TomStatus> = { em_dia: 'ok', voltou: 'atencao', faltou: 'atencao', inadimplente: 'erro' };
const mesLabel = (c: string) => c.split('-').reverse().join('/');
const TOM_MES: Record<StatusMes, TomStatus> = { paga: 'ok', atraso: 'atencao', nao_paga: 'erro', prevista: 'neutro' };
const ROTULO_MES: Record<StatusMes, string> = { paga: 'Paga', atraso: 'Atraso', nao_paga: 'Não paga', prevista: 'Prevista' };
const ROTULO_TIPO_ENG: Record<TipoMsg, string> = { antes: 'Lembrete (antes)', cobranca: 'Cobrança', depois: 'Aviso de atraso', remarketing: 'Remarketing' };

/** barra horizontal calma (dado é calmo — sem animação de dado) */
function Barra({ v, max, tom = 'tint' }: { v: number; max: number; tom?: 'tint' | 'ok' | 'erro' | 'azul' }) {
  const pct = Math.max(2, Math.round((v / Math.max(1, max)) * 100));
  const cor = tom === 'ok' ? 'var(--verde)' : tom === 'erro' ? 'var(--rubro)' : tom === 'azul' ? 'var(--azul, var(--txt))' : 'rgba(var(--tint), .5)';
  return <div className="cm-bar"><i style={{ width: pct + '%', background: cor }} /></div>;
}

const IcAtencao = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
  </svg>
);

/* ------------------------------------------------------------------
   Modo Cobrança — sub-abas do motor dedicado (Fase B, UI).
   Ciclos · Régua de mensagens · Números & Atendentes · Envios.
   Backend real = tabelas cobranca_* (Fase A, já em prod). Aqui o
   conteúdo é seed de demonstração pra revisão visual; o envio nasce
   em SIMULAÇÃO (dry-run) — disparo real é Fase C, com "sim" do dono.
   ------------------------------------------------------------------ */

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaBR = (n: number) => String(n).padStart(2, '0');

/* =================== CICLOS — grade de pagamentos (Gestão Mensal) =================== */

export function AbaCiclos({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const ciclos = useMemo(() => {
    const map = new Map<string, ClienteAnalise[]>();
    for (const c of CLIENTES) { const a = map.get(c.ciclo) ?? []; a.push(c); map.set(c.ciclo, a); }
    return [...map.entries()].map(([codigo, clientes]) => {
      const dia = CICLO_DIA[codigo] ?? 1;
      const anomalias = clientes.reduce((s, cl) => s + cl.celulas.filter((r) => estadoCelula(r).estado === 'nao_pagou').length, 0);
      return {
        codigo, dia, grupo: dia <= 5 ? 'inicio_mes' as const : 'fim_mes' as const,
        clientes: [...clientes].sort((a, b) => a.nome.localeCompare(b.nome)),
        cols: cabecalhoCiclo(codigo),
        soma: clientes.reduce((s, c) => s + c.mensalidade, 0),
        recebido: clientes.reduce((s, c) => s + c.celulas.reduce((a, r) => a + (estadoCelula(r).valor ?? 0), 0), 0),
        anomalias,
      };
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, []);
  const [aberto, setAberto] = useState<string | null>(ciclos[0]?.codigo ?? null);
  const totalMes = ciclos.reduce((s, c) => s + c.soma, 0);

  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Ciclos de vencimento" valor={ciclos.length} />
        <Kpi rotulo="Clientes nos ciclos" valor={CLIENTES.length} formato="mil" />
        <Kpi rotulo="Recorrência/mês" valor={Math.trunc(totalMes)} formato="mil" prefixo="R$ " sufixo=",00" tomValor="ok" />
        <Kpi rotulo="Anomalias (não pagou)" valor={ciclos.reduce((s, c) => s + c.anomalias, 0)} formato="mil" tomValor="erro" />
      </div>
      <p className="cm-hint sobe" style={{ animationDelay: '.06s' }}>
        Cada ciclo é uma turma que vence no mesmo dia (quando o benefício do INSS cai). Abra um ciclo para a grade de pagamentos: cada célula é <b>—</b> (fora da régua), uma <b>data</b> (aguardando/entrada), <b>R$</b> (pago) ou <b>NÃO PAGOU</b>. Datas vencidas há mais de 30 dias viram NÃO PAGOU sozinhas.
      </p>
      <div className="cm-ciclos sobe" style={{ animationDelay: '.12s' }}>
        {ciclos.map((c) => {
          const on = aberto === c.codigo;
          const visiveis = c.clientes.slice(0, 40);
          return (
            <CardVidro spot key={c.codigo} className={on ? 'cm-ciclo on' : 'cm-ciclo'}>
              <button type="button" className="cm-ciclo-cab" onClick={() => setAberto(on ? null : c.codigo)} aria-expanded={on}>
                <span className="cm-ciclo-cod">{c.codigo}</span>
                <span className="cm-ciclo-nm">Vence dia {diaBR(c.dia)}<b>{c.grupo === 'inicio_mes' ? 'início do mês' : 'fim do mês'}</b></span>
                <span className="cm-ciclo-tags">
                  <span className="cm-ciclo-n num">{c.clientes.length} clientes</span>
                  {c.anomalias > 0 && <BadgeStatus tom="erro">{c.anomalias} não pagou</BadgeStatus>}
                </span>
                <span className="cm-ciclo-seta" aria-hidden>{on ? '▾' : '▸'}</span>
              </button>
              {on && (
                <div className="cm-ciclo-corpo">
                  <div className="cm-grade-info num">
                    Recebido acumulado <b>{fmtBRL(c.recebido)}</b> · Recorrência <b>{fmtBRL(c.soma)}/mês</b>
                    {gestor && <button type="button" className="cm-num-lnk" onClick={() => aoAvisar('Simulação: + Novo Mês — o ciclo inteiro avança para o próximo vencimento.')}>+ Novo mês</button>}
                  </div>
                  <div className="cm-grade-wrap">
                    <table className="cm-grade">
                      <thead>
                        <tr>
                          <th className="cm-g-sticky">Cliente</th>
                          {c.cols.map((col) => <th key={col} className="num">{col.slice(0, 5)}</th>)}
                          <th className="d num">Total pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiveis.map((cl) => {
                          const total = cl.celulas.reduce((s, r) => s + (estadoCelula(r).valor ?? 0), 0);
                          return (
                            <tr key={cl.id}>
                              <td className="cm-g-sticky"><span className="cm-g-nm">{!cl.whatsapp && <span className="cm-g-alerta" title="Sem número de WhatsApp"><IcAtencao /></span>}{cl.nome}</span><span className="cm-g-at">{cl.atendente}</span></td>
                              {cl.celulas.map((r, k) => <td key={k} className="cm-g-cel">{gestor ? <button type="button" className="cm-g-edit" onClick={() => aoAvisar('Simulação: duplo-clique edita a célula (—, data, valor ou NÃO PAGOU).')}><Celula raw={r} /></button> : <Celula raw={r} />}</td>)}
                              <td className="d num cm-g-total">{fmtBRL(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {c.clientes.length > visiveis.length && <div className="cm-ciclo-mais num">+ {c.clientes.length - visiveis.length} clientes neste ciclo</div>}
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
const NUMEROS: NumDemo[] = metricasPorAtendente(CLIENTES).map((m, i) => {
  const tel = `+55 51 9${8000 + i * 137}-${(1000 + i * 411) % 10000}`.replace(/(\d{4})$/, (x) => x.padStart(4, '0'));
  const status: NumDemo['status'] = i >= 7 ? 'desconectado' : i === 5 ? 'sincronizando' : 'conectado';
  return { atendente: m.nome, numero: status === 'desconectado' ? null : tel, status, clientes: m.clientes };
});
const TOM_CONEXAO: Record<NumDemo['status'], TomStatus> = { conectado: 'ok', sincronizando: 'atencao', desconectado: 'erro' };
const ROTULO_CONEXAO: Record<NumDemo['status'], string> = { conectado: 'Conectado', sincronizando: 'Conectando…', desconectado: 'Desconectado' };

export function AbaNumeros({ demo, gestor, aoAvisar }: { demo: boolean; gestor: boolean; aoAvisar: (t: string) => void }) {
  return demo ? <AbaNumerosDemo gestor={gestor} aoAvisar={aoAvisar} /> : <AbaNumerosReal gestor={gestor} aoAvisar={aoAvisar} />;
}

/* ---- REAL: um número por atendente, instância isolada via cobranca-wa ---- */
const ROTULO_ESTADO: Record<string, { rotulo: string; tom: TomStatus }> = {
  conectado: { rotulo: 'Conectado', tom: 'ok' },
  aguardando_qr: { rotulo: 'Aguardando QR', tom: 'atencao' },
  desconectado: { rotulo: 'Sem número', tom: 'neutro' },
};

function AbaNumerosReal({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  const { data: usuarios = [] } = useOrgUsuarios();
  const { data: numeros = [], refetch } = useCobNumeros(orgId);
  const porAtendente = useMemo(() => new Map(numeros.map((n) => [n.atendente_id, n])), [numeros]);
  const [qr, setQr] = useState<{ nome: string; numeroId: string; img: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [desligar, setDesligar] = useState<{ numero: CobNumero; nome: string } | null>(null);
  const qrRef = useRef(qr);
  qrRef.current = qr;

  // enquanto o modal do QR está aberto, sonda a conexão a cada 3s
  useEffect(() => {
    if (!qr || !orgId) return;
    const t = window.setInterval(async () => {
      try {
        const st = await cobWaStatus(orgId, qr.numeroId);
        if (st.connected && qrRef.current) {
          setQr(null);
          aoAvisar(`WhatsApp conectado${st.telefone ? ` (${st.telefone})` : ''}. Este número atende SÓ a cobrança — não aparece no atendimento.`);
          refetch();
        }
      } catch { /* rede: tenta no próximo tick */ }
    }, 3000);
    return () => window.clearInterval(t);
  }, [qr, orgId, aoAvisar, refetch]);

  async function conectar(uId: string, nome: string) {
    if (!orgId || busy) return;
    setBusy(uId);
    try {
      const r = await cobWaConectar(orgId, uId);
      setQr({ nome, numeroId: r.numero_id, img: r.qr_base64 });
      refetch();
    } catch (e) { aoAvisar(`Falha ao conectar: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function confirmarDesconexao() {
    if (!orgId || !desligar) return;
    const alvo = desligar; setDesligar(null);
    try { await cobWaDesconectar(orgId, alvo.numero.id); aoAvisar('Número desconectado.'); refetch(); }
    catch (e) { aoAvisar(`Falha ao desconectar: ${(e as Error).message}`); }
  }

  return (
    <>
      <p className="cm-hint sobe">
        Cada atendente conecta o próprio número — a cobrança do cliente sai pelo número do atendente responsável.
        Estes WhatsApps são <b>exclusivos da cobrança</b>: não aparecem no atendimento nem recebem conversas no inbox.
      </p>
      {usuarios.length === 0
        ? <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}><EstadoVazio titulo="Nenhum atendente na equipe" descricao="Convide a equipe em Configurações para conectar números de cobrança." /></CardVidro>
        : (
          <div className="cm-nums sobe" style={{ animationDelay: '.08s' }}>
            {usuarios.map((u) => {
              const n = porAtendente.get(u.id);
              const est = ROTULO_ESTADO[n?.estado ?? 'desconectado'];
              return (
                <CardVidro spot key={u.id} className="cm-num">
                  <div className="cm-num-topo">
                    <span className="cm-num-av" aria-hidden>{(u.nome || '?').slice(0, 2).toUpperCase()}</span>
                    <div className="cm-num-id">
                      <div className="cm-num-nm">{u.nome}</div>
                      <div className="cm-num-tel num">{n?.telefone ?? 'Nenhum número conectado'}</div>
                    </div>
                    <BadgeStatus tom={est.tom}>{est.rotulo}</BadgeStatus>
                  </div>
                  {gestor && (
                    <div className="cm-num-acoes">
                      {n?.estado === 'conectado'
                        ? <BotaoSec mini onClick={() => setDesligar({ numero: n, nome: u.nome })}>Desconectar</BotaoSec>
                        : <BotaoPrimario mini onClick={() => conectar(u.id, u.nome)} disabled={busy === u.id}>{busy === u.id ? 'Gerando QR…' : n?.estado === 'aguardando_qr' ? 'Gerar novo QR' : 'Conectar WhatsApp'}</BotaoPrimario>}
                    </div>
                  )}
                </CardVidro>
              );
            })}
          </div>
        )}

      {qr && (
        <ModalV2 aberto aoFechar={() => setQr(null)} largura={380}
          titulo={<div>Conectar WhatsApp<div className="mod-sub">{qr.nome} — abra o WhatsApp no celular e leia o código.</div></div>}
          rodape={<BotaoSec onClick={() => setQr(null)}>Fechar</BotaoSec>}>
          <div className="cm-qr-wrap">
            {qr.img
              ? <img className="cm-qr-img" src={qr.img} alt="QR Code de conexão" />
              : <div className="cm-hint">QR indisponível — feche e tente de novo.</div>}
            <p className="cm-hint">Aguardando a leitura… esta janela fecha sozinha quando conectar. O número fica <b>exclusivo da cobrança</b>.</p>
          </div>
        </ModalV2>
      )}

      {desligar && (
        <ModalV2 aberto aoFechar={() => setDesligar(null)} largura={400}
          titulo={<div>Desconectar número<div className="mod-sub">{desligar.nome}{desligar.numero.telefone ? ` · ${desligar.numero.telefone}` : ''}</div></div>}
          rodape={<><BotaoSec onClick={() => setDesligar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={confirmarDesconexao}>Desconectar</BotaoPrimario></>}>
          <p className="cm-hint">A sessão no celular é encerrada e a cobrança para de sair por este número até reconectar.</p>
        </ModalV2>
      )}
    </>
  );
}

function AbaNumerosDemo({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  return (
    <>
      <p className="cm-hint sobe">
        Cada atendente conecta o próprio número (leitura do QR code). Na hora do envio, a cobrança sai <b>pelo número do atendente daquele cliente</b> — o cliente recebe sempre de quem já fala com ele.
      </p>
      <div className="cm-nums sobe" style={{ animationDelay: '.08s' }}>
        {NUMEROS.map((n) => (
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
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.18s' }}>
        {lista.length === 0
          ? <EstadoVazio titulo="Nada na fila" descricao="Ajuste o filtro ou enfileire cobranças na aba Ciclos." />
          : <TabelaPadrao colunas={colunas} linhas={lista} chave={(f) => f.id} rodape={{ texto: `${lista.length} na fila` }} />}
      </CardVidro>
    </>
  );
}

/* =================== PAINEL EXECUTIVO (bloco de métricas) =================== */

export function PainelResumo() {
  const r = useMemo(() => resumoCarteira(CLIENTES), []);
  const ciclos = useMemo(() => metricasPorCiclo(CLIENTES), []);
  const atend = useMemo(() => metricasPorAtendente(CLIENTES), []);
  const maxCiclo = Math.max(...ciclos.map((c) => c.faturamento));
  const maxAt = Math.max(...atend.map((a) => a.faturamento));
  const maxMes = Math.max(...r.faturamentoMensal.map((m) => m.valor));
  const TOM_C: Record<Comportamento, 'ok' | 'erro' | 'tint'> = { em_dia: 'ok', voltou: 'ok', faltou: 'erro', inadimplente: 'erro' };
  return (
    <>
      <div className="kpis sobe">
        <Kpi rotulo="Faturamento recebido" valor={Math.trunc(r.faturamentoTotal)} formato="mil" prefixo="R$ " sufixo=",00" tomValor="ok" />
        <Kpi rotulo="Recorrência/mês" valor={Math.trunc(r.recorrencia)} formato="mil" prefixo="R$ " sufixo=",00" />
        <Kpi rotulo="Em atraso" valor={Math.trunc(r.emAtrasoValor)} formato="mil" prefixo="R$ " sufixo=",00" tomValor={r.emAtrasoValor > 0 ? 'erro' : undefined} />
        <Kpi rotulo="Adimplência" valor={r.adimplencia} sufixo="%" tomValor="ok" />
      </div>

      <div className="cm-grid2 sobe" style={{ animationDelay: '.08s' }}>
        <CardVidro spot className="cm-analise">
          <div className="cm-an-tt">Saúde da carteira</div>
          <div className="cm-saude">
            {r.porComportamento.map((s) => (
              <div className="cm-saude-lin" key={s.comp}>
                <span className="cm-saude-rot">{ROTULO_COMP[s.comp]}</span>
                <Barra v={s.n} max={CLIENTES.length} tom={TOM_C[s.comp]} />
                <span className="cm-saude-n num">{s.n}</span>
              </div>
            ))}
          </div>
        </CardVidro>
        <CardVidro spot className="cm-analise">
          <div className="cm-an-tt">Faturamento por mês</div>
          <div className="cm-colunas">
            {r.faturamentoMensal.map((m) => (
              <div className="cm-col" key={m.competencia}>
                <div className="cm-col-bar"><i style={{ height: Math.max(4, Math.round((m.valor / maxMes) * 100)) + '%' }} /></div>
                <div className="cm-col-lab num">{m.competencia.slice(5)}</div>
              </div>
            ))}
          </div>
        </CardVidro>
      </div>

      <div className="cm-grid2 sobe" style={{ animationDelay: '.14s' }}>
        <CardVidro spot className="cm-analise">
          <div className="cm-an-tt">Faturamento por ciclo</div>
          <div className="cm-ranklist">
            {ciclos.map((c) => (
              <div className="cm-rank" key={c.codigo}>
                <span className="cm-rank-nm"><b>{c.codigo}</b> · {c.clientes} cli.</span>
                <Barra v={c.faturamento} max={maxCiclo} tom="azul" />
                <span className="cm-rank-v num">{fmtBRL(c.faturamento)}</span>
              </div>
            ))}
          </div>
        </CardVidro>
        <CardVidro spot className="cm-analise">
          <div className="cm-an-tt">Faturamento por atendente</div>
          <div className="cm-ranklist">
            {atend.map((a) => (
              <div className="cm-rank" key={a.nome}>
                <span className="cm-rank-nm">{a.nome}</span>
                <Barra v={a.faturamento} max={maxAt} tom="azul" />
                <span className="cm-rank-v num">{fmtBRL(a.faturamento)}</span>
              </div>
            ))}
          </div>
        </CardVidro>
      </div>

      <div className="sobe" style={{ marginTop: 16, animationDelay: '.2s' }}>
        <span className="caps" style={{ display: 'block', marginBottom: 10 }}>Engajamento das mensagens</span>
        <div className="cm-eng-grid">
          {r.respostaPorTipo.map((t) => {
            const pct = t.enviadas ? Math.round((t.respostas / t.enviadas) * 100) : 0;
            return (
              <CardVidro spot className="cm-eng" key={t.tipo}>
                <div className="cm-eng-tt">{ROTULO_TIPO_ENG[t.tipo]}</div>
                <div className="cm-eng-pct num">{pct}<span>%</span></div>
                <div className="cm-eng-sub num">{t.respostas} de {t.enviadas} responderam</div>
                <Barra v={t.respostas} max={t.enviadas} tom={pct >= 50 ? 'ok' : 'tint'} />
              </CardVidro>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* =================== ATENDENTES (métricas + drill-down) =================== */

export function AbaAtendentes() {
  const metricas = useMemo(() => metricasPorAtendente(CLIENTES), []);
  const [sel, setSel] = useState<string | null>(null);
  const maxFat = Math.max(...metricas.map((m) => m.faturamento));
  const clientesDo = (nome: string) => CLIENTES.filter((c) => c.atendente === nome);

  const colunas: Coluna<typeof metricas[number]>[] = [
    { chave: 'nome', titulo: 'Atendente', render: (m) => <div className="cm-at-nm"><span className="cm-num-av" aria-hidden>{m.nome.slice(0, 2).toUpperCase()}</span>{m.nome}</div> },
    { chave: 'clientes', titulo: 'Carteira', classe: 'num', render: (m) => `${m.clientes} cli.` },
    { chave: 'fat', titulo: 'Faturamento', dir: true, classe: 'num', render: (m) => <div className="cm-at-fat"><span>{fmtBRL(m.faturamento)}</span><Barra v={m.faturamento} max={maxFat} tom="azul" /></div> },
    { chave: 'adimp', titulo: 'Adimplência', classe: 'num', render: (m) => <BadgeStatus tom={m.adimplencia >= 70 ? 'ok' : m.adimplencia >= 40 ? 'atencao' : 'erro'}>{m.adimplencia}%</BadgeStatus> },
    { chave: 'resp', titulo: 'Resposta', classe: 'num', render: (m) => `${m.taxaResposta}%` },
  ];

  const atSel = metricas.find((m) => m.nome === sel);
  return (
    <>
      <p className="cm-hint sobe">Faturamento, carteira e desempenho de cada atendente. Clique para ver os clientes dele.</p>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.08s' }}>
        <TabelaPadrao colunas={colunas} linhas={metricas} chave={(m) => m.nome} aoClicarLinha={(m) => setSel(m.nome)} rodape={{ texto: `${metricas.length} atendentes` }} />
      </CardVidro>

      <DrawerV2 aberto={!!atSel} aoFechar={() => setSel(null)} largura={440}>
        {atSel && (
          <div className="cm-drawer">
            <div className="cm-dr-head">
              <span className="cm-num-av lg" aria-hidden>{atSel.nome.slice(0, 2).toUpperCase()}</span>
              <div><div className="cm-dr-nm">{atSel.nome}</div><div className="cm-dr-sub num">{atSel.clientes} clientes na carteira</div></div>
              <button type="button" className="cm-dr-x" onClick={() => setSel(null)} aria-label="Fechar">×</button>
            </div>
            <div className="cm-dr-stats">
              <div><b className="num">{fmtBRL(atSel.faturamento)}</b><span>Faturamento</span></div>
              <div><b className="num">{fmtBRL(atSel.recorrencia)}</b><span>Recorrência/mês</span></div>
              <div><b className="num ok">{atSel.adimplencia}%</b><span>Adimplência</span></div>
              <div><b className="num">{atSel.taxaResposta}%</b><span>Resposta</span></div>
            </div>
            <div className="cm-dr-sec">Clientes</div>
            <div className="cm-dr-clientes">
              {clientesDo(atSel.nome).map((c) => (
                <div className="cm-dr-cli" key={c.id}>
                  <div className="cm-dr-cli-nm">{c.nome}<span className="num">{c.ciclo} · {fmtBRL(c.mensalidade)}/mês</span></div>
                  <BadgeStatus tom={compBadge[c.comportamento]}>{ROTULO_COMP[c.comportamento]}</BadgeStatus>
                </div>
              ))}
            </div>
          </div>
        )}
      </DrawerV2>
    </>
  );
}

/* =================== CLIENTES (análise + ficha + nº WhatsApp) =================== */

export function AbaClientes() {
  const [seg, setSeg] = useState<'todos' | Comportamento | 'resp_remk' | 'sem_num'>('todos');
  const [sel, setSel] = useState<ClienteAnalise | null>(null);
  const [cadastrar, setCadastrar] = useState<ClienteAnalise | null>(null);
  const [pag, setPag] = useState(1);
  const semNumero = useMemo(() => CLIENTES.filter((c) => !c.whatsapp).length, []);
  const lista = useMemo(() => CLIENTES.filter((c) => {
    if (seg === 'todos') return true;
    if (seg === 'sem_num') return !c.whatsapp;
    if (seg === 'resp_remk') return c.engajamento.some((e) => e.tipo === 'remarketing' && e.respondeu);
    return c.comportamento === seg;
  }), [seg]);
  const cont = (comp: Comportamento) => CLIENTES.filter((c) => c.comportamento === comp).length;
  const POR_PAG = 12;
  const totalPag = Math.max(1, Math.ceil(lista.length / POR_PAG));
  const pagAtual = Math.min(pag, totalPag);
  const linhasPag = lista.slice((pagAtual - 1) * POR_PAG, pagAtual * POR_PAG);
  const trocarSeg = (x: typeof seg) => { setSeg(x); setPag(1); };

  const colunas: Coluna<ClienteAnalise>[] = [
    { chave: 'nome', titulo: 'Cliente', render: (c) => (
      <div className="cm-cli-nm">{!c.whatsapp && <span className="cm-cli-alerta" title="Sem número — cadastre para a cobrança automática" aria-label="Sem número"><IcAtencao /></span>}{c.nome}</div>
    ) },
    { chave: 'whats', titulo: 'WhatsApp', render: (c) => c.whatsapp
      ? <span className="num" style={{ color: 'var(--txt-2)' }}>{c.whatsapp}</span>
      : <button type="button" className="cm-cad-btn" onClick={(e) => { e.stopPropagation(); setCadastrar(c); }}><IcAtencao /> Cadastrar número</button> },
    { chave: 'ciclo', titulo: 'Ciclo', classe: 'num', render: (c) => c.ciclo },
    { chave: 'at', titulo: 'Atendente', render: (c) => c.atendente },
    { chave: 'mens', titulo: 'Mensalidade', dir: true, classe: 'num', render: (c) => fmtBRL(c.mensalidade) },
    { chave: 'comp', titulo: 'Comportamento', render: (c) => <BadgeStatus tom={compBadge[c.comportamento]}>{ROTULO_COMP[c.comportamento]}</BadgeStatus> },
  ];

  return (
    <>
      <p className="cm-hint sobe">Comportamento de pagamento e engajamento de cada cliente. Clique para ver a ficha completa.</p>
      {semNumero > 0 && (
        <button type="button" className="cm-avisonum sobe" style={{ animationDelay: '.04s' }} onClick={() => trocarSeg('sem_num')}>
          <span className="cm-avisonum-ic" aria-hidden><IcAtencao /></span>
          <span><b>{semNumero} cliente{semNumero === 1 ? '' : 's'} sem número de WhatsApp.</b> Cadastre o número para ativar a cobrança automática — sem ele, as mensagens não saem.</span>
          <span className="cm-avisonum-cta">Ver e cadastrar →</span>
        </button>
      )}
      <div className="cob-filtros sobe" style={{ animationDelay: '.06s' }}>
        <Chips>
          <Chip ativo={seg === 'todos'} onClick={() => trocarSeg('todos')}>Todos ({CLIENTES.length})</Chip>
          <Chip ativo={seg === 'sem_num'} onClick={() => trocarSeg('sem_num')}>⚠ Sem número ({semNumero})</Chip>
          <Chip ativo={seg === 'em_dia'} onClick={() => trocarSeg('em_dia')}>Em dia ({cont('em_dia')})</Chip>
          <Chip ativo={seg === 'voltou'} onClick={() => trocarSeg('voltou')}>Voltou a pagar ({cont('voltou')})</Chip>
          <Chip ativo={seg === 'faltou'} onClick={() => trocarSeg('faltou')}>Faltou pagar ({cont('faltou')})</Chip>
          <Chip ativo={seg === 'inadimplente'} onClick={() => trocarSeg('inadimplente')}>Inadimplente ({cont('inadimplente')})</Chip>
        </Chips>
      </div>
      <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)', animationDelay: '.12s' }}>
        {lista.length === 0
          ? <EstadoVazio titulo="Nenhum cliente neste filtro" descricao="Troque o segmento acima." />
          : <TabelaPadrao colunas={colunas} linhas={linhasPag} chave={(c) => c.id} aoClicarLinha={(c) => setSel(c)}
              rodape={{ texto: `${lista.length} cliente${lista.length === 1 ? '' : 's'}`, paginacao: { pagina: pagAtual, totalPaginas: totalPag, aoIr: setPag } }} />}
      </CardVidro>

      <DrawerV2 aberto={!!sel} aoFechar={() => setSel(null)} largura={460}>
        {sel && (
          <div className="cm-drawer">
            <div className="cm-dr-head">
              <span className="cm-num-av lg" aria-hidden>{sel.nome.slice(0, 2).toUpperCase()}</span>
              <div><div className="cm-dr-nm">{sel.nome}</div><div className="cm-dr-sub num">{sel.ciclo} · {sel.atendente} · {fmtBRL(sel.mensalidade)}/mês</div></div>
              <button type="button" className="cm-dr-x" onClick={() => setSel(null)} aria-label="Fechar">×</button>
            </div>

            <div className={sel.whatsapp ? 'cm-dr-whats' : 'cm-dr-whats falta'}>
              <div>
                <div className="cm-dr-whats-rot">WhatsApp para cobrança</div>
                {sel.whatsapp
                  ? <div className="cm-dr-whats-num num">{sel.whatsapp}</div>
                  : <div className="cm-dr-whats-sem"><IcAtencao /> Nenhum número cadastrado</div>}
              </div>
              <BotaoSec mini onClick={() => setCadastrar(sel)}>{sel.whatsapp ? 'Trocar' : 'Cadastrar número'}</BotaoSec>
            </div>

            <div className="cm-dr-badge"><BadgeStatus tom={compBadge[sel.comportamento]}>{ROTULO_COMP[sel.comportamento]}</BadgeStatus><span className="num">Faturamento total {fmtBRL(sel.faturamentoTotal)}</span></div>

            <div className="cm-dr-sec">Histórico de pagamento</div>
            <div className="cm-hist">
              {sel.meses.map((m) => (
                <div className={'cm-hist-mes s-' + m.status} key={m.competencia}>
                  <span className="cm-hist-dot" aria-hidden />
                  <span className="cm-hist-comp num">{mesLabel(m.competencia)}</span>
                  <BadgeStatus tom={TOM_MES[m.status]}>{ROTULO_MES[m.status]}</BadgeStatus>
                </div>
              ))}
            </div>

            <div className="cm-dr-sec">Engajamento com as mensagens</div>
            <div className="cm-eng-list">
              {sel.engajamento.filter((e) => e.enviada).map((e) => (
                <div className="cm-eng-lin" key={e.tipo}>
                  <span className="cm-eng-rot">{ROTULO_TIPO_ENG[e.tipo]}</span>
                  <BadgeStatus tom={e.respondeu ? 'ok' : 'neutro'}>{e.respondeu ? 'Respondeu' : 'Sem resposta'}</BadgeStatus>
                </div>
              ))}
              {!sel.engajamento.some((e) => e.enviada) && <div className="cm-hint">Nenhuma mensagem enviada ainda.</div>}
            </div>
          </div>
        )}
      </DrawerV2>

      {cadastrar && (
        <ModalV2 aberto aoFechar={() => setCadastrar(null)} largura={420}
          titulo={<div>Cadastrar WhatsApp<div className="mod-sub">{cadastrar.nome}</div></div>}
          rodape={<><BotaoSec onClick={() => setCadastrar(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={() => setCadastrar(null)}>Salvar número</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="campo"><label>Número de WhatsApp</label><Input inputMode="tel" placeholder="(51) 90000-0000" defaultValue={cadastrar.whatsapp ?? ''} /></div>
            <p className="cm-hint">É por esse número que o cliente vai receber as cobranças automáticas. (Demonstração — no ar, salva no cadastro do cliente.)</p>
          </div>
        </ModalV2>
      )}
    </>
  );
}
