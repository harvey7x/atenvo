/* ============================================================================
   Pendências do processo — a TELA (demo e real usam a mesma; ver fonte.ts).
   Mesa de trabalho executiva: navegação | lista | um cliente. Uma coisa por vez.
   - Responderam: os lembretes PARARAM sozinhos; é com o encarregado.
   - Esperando resposta: 1ª mensagem saiu, lembretes rodando até ele responder.
   - Sem resposta: acabaram os lembretes e ele não respondeu.
   - Resolvidas.
   Mensagens prontas = modelos por tipo de pedido. Ajustes = número e horário.
   ============================================================================ */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Segmentado, Skeleton, Toggle } from '../../components';
import {
  LIMITE_DIA_MAX, LIMITE_DIA_MIN, ROTULO_TIPO, SIMULADO, clonarPassos, dataBR, dataPrevista, diasAte, ehAvulso, entregues, envioFalhou, frasePrazo,
  haQuanto, iniciais, limiteDiaValido, nomeBonito, novoId, podeMandarAgora, podeMudarLembretes, previsaoSaida, primeiroNome, proximaJanela, proximoEnvio,
  quandoCurto, rotuloEnvio, travaEnvios, ultimoEnvio,
  type AjustesPendencias, type Bloco, type ClienteFechado, type Modelo, type Passo, type Pendencia, type StatusPendencia,
  type TipoBloco, type TipoPendencia,
} from '@/data/pendencias';
import { EditorRegua, blocosProntos, reguaPronta, useEscFecha } from './EditorRegua';
import { NovaPendencia } from './NovaPendencia';
import { useFonte, type Fonte } from './fonte';
import { cap, hhmmDe, resumoCurto, tiposDe } from './exibir';
import {
  IcAlerta, IcCheck, IcConversa, IcEnviar, IcInfo, IcLapis, IcLembrete, IcLixo, IcMais, IcMaisAcoes, IcPausa, IcPedido, IcPlay,
  IcRetomar, IcSeta, IcTelefone, IcTipo, IcVista, IcVoltar, type Vista,
} from './icones';
import './pendencias.css';

const VISTAS: { id: StatusPendencia; rotulo: string; vazioT: string; vazio: string }[] = [
  { id: 'respondeu', rotulo: 'Responderam', vazioT: 'Ninguém respondeu ainda', vazio: 'Quando um cliente responder, os lembretes param e ele aparece aqui.' },
  { id: 'aguardando', rotulo: 'Esperando resposta', vazioT: 'Nada esperando resposta', vazio: 'Nenhuma pendência esperando resposta.' },
  { id: 'sem_resposta', rotulo: 'Sem resposta', vazioT: 'Todo mundo respondeu', vazio: 'Nenhum cliente ficou sem responder.' },
  { id: 'resolvida', rotulo: 'Resolvidas', vazioT: 'Nenhuma resolvida ainda', vazio: 'Nenhuma pendência resolvida ainda.' },
];

/* resposta que é só rótulo de mídia (o cliente mandou áudio/foto/arquivo sem texto) */
const MIDIA_RESPOSTA: Record<string, { tipo?: TipoBloco; com: string }> = {
  'Áudio': { tipo: 'audio', com: 'um áudio' }, 'Imagem': { tipo: 'imagem', com: 'uma imagem' },
  'Documento': { tipo: 'documento', com: 'um documento' }, 'Vídeo': { tipo: 'video', com: 'um vídeo' }, 'Mensagem': { com: 'uma mensagem' },
};
/* frase da mensagem avulsa, igual para o toast */
function fraseAvulsa(aj: AjustesPendencias) {
  const prev = previsaoSaida(new Date().toISOString(), aj);
  if (prev === 'em instantes') return 'Mensagem na fila. Sai em instantes.';
  if (prev.startsWith('quando')) return `Guardada. Sai ${prev}.`;
  return `Na fila. Sai ${prev}, no horário de envio.`;
}
const doisNomes = (n: string) => nomeBonito(n).split(' ').slice(0, 2).join(' ');
/* envios desligados / número caído: a MESMA data que aparece com os envios ligados (horário + dias úteis,
   dataPrevista); o que já venceu fica "em espera" em vez de "em instantes" */
const quandoParado = (iso: string, aj: AjustesPendencias) => dataPrevista(iso, aj, true);

/* ---------------- aviso (toast) com tom ---------------- */
type TomToast = 'ok' | 'erro' | 'info';
interface Toast { texto: string; tom: TomToast; n: number }
function tomDe(t: string): TomToast {
  if (/^Demonstração/.test(t)) return 'info';
  if (/^(Não deu|Não foi|Esse arquivo|Use foto|Arquivo grande|Erro)/.test(t)) return 'erro';
  return 'ok';
}

/* fonte + aviso para todas as peças da tela */
interface Ctx { f: Fonte; avisar: (t: string, tom?: TomToast) => void; rodar: (acao: () => Promise<unknown>, ok?: string) => Promise<boolean> }
const PendCtx = createContext<Ctx | null>(null);
export const usePend = () => useContext(PendCtx)!;

export default function PendenciasTela() {
  const f = useFonte();
  const navigate = useNavigate();
  const [vista, setVista] = useState<Vista>('respondeu');
  const [escopo, setEscopo] = useState<'minhas' | 'equipe'>('minhas');
  const [sel, setSel] = useState<string>('');
  const [nova, setNova] = useState<null | { clienteId?: string }>(null);
  const [editarModelo, setEditarModelo] = useState<Modelo | null>(null);
  const [lembretes, setLembretes] = useState<null | { pend: Pendencia; modo: 'mudar' | 'retomar'; titulo: string }>(null);
  const [avulsa, setAvulsa] = useState<Pendencia | null>(null);
  /* Ajustes é uma vista: sair dela com alteração não salva pede confirmação */
  const [ajSujo, setAjSujo] = useState(false);
  const [irDepois, setIrDepois] = useState<Vista | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tom === 'erro' ? 6000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const avisar = useCallback((texto: string, tom?: TomToast) => setToast({ texto, tom: tom ?? tomDe(texto), n: Date.now() }), []);
  const ctx = useMemo<Ctx>(() => ({
    f, avisar,
    rodar: async (acao, ok) => {
      try { await acao(); if (ok) avisar(ok); return true; } catch (e) { avisar(f.erroAmigavel(e), 'erro'); return false; }
    },
  }), [f, avisar]);

  const irPara = (v: Vista) => {
    if (v === vista) return;
    if (vista === 'ajustes' && ajSujo) { setIrDepois(v); return; }
    setVista(v);
  };

  const ehMinha = (p: Pendencia) => (f.real ? p.responsavelId === f.usuario.id : p.responsavel === f.usuario.nome);
  const minhas = useMemo(() => f.pendencias.filter((p) => escopo === 'equipe' || ehMinha(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.pendencias, escopo, f.usuario.id]);
  /* pendência recém-criada: quando ela chega na lista, só troca para "Equipe toda" se não for do usuário (o encarregado é o do cliente) */
  const [criada, setCriada] = useState<string | null>(null);
  useEffect(() => {
    if (!criada) return;
    const p = f.pendencias.find((x) => x.id === criada);
    if (!p) return;
    setCriada(null);
    if (escopo === 'minhas' && !ehMinha(p)) {
      setEscopo('equipe');
      setToast((t) => (t ? { ...t, texto: `${t.texto} Mostrando Equipe toda.` } : { texto: `Pendência de ${p.responsavel}. Mostrando Equipe toda.`, tom: 'info', n: Date.now() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criada, f.pendencias]);
  const conta = (s: StatusPendencia) => minhas.filter((p) => p.status === s).length;
  const ehStatus = vista !== 'modelos' && vista !== 'ajustes';
  const lista = useMemo(() => {
    if (vista === 'modelos' || vista === 'ajustes') return [];
    const l = minhas.filter((p) => p.status === vista);
    const chave = (p: Pendencia) => {
      if (vista === 'respondeu') return p.resposta?.quando ?? '';
      if (vista === 'aguardando') return proximoEnvio(p)?.quando ?? p.passos.find((x) => x.estado === 'agendado')?.quando ?? 'z';
      return p.resolvidaEm ?? p.criadaEm;
    };
    return [...l].sort((a, b) => (vista === 'aguardando' ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  }, [minhas, vista]);
  /* seleção efetiva calculada no render: ao trocar de vista, o 1º quadro já mostra a pendência certa */
  const selEf = !ehStatus ? '' : (lista.some((p) => p.id === sel) ? sel : (lista[0]?.id ?? ''));
  const atual = selEf ? f.pendencias.find((p) => p.id === selEf) : undefined;
  const listaVazia = ehStatus && !f.carregando && lista.length === 0;
  const abrirConversa = (p: Pendencia) => {
    /* todo cliente de pendência é FECHADO: no inbox ele vive na aba Fechados (aba= é lido pelo inbox quando suportado) */
    if (f.real && p.conversaId) navigate(`/whatsapp?conversa=${encodeURIComponent(p.conversaId)}&aba=fechados`);
    else avisar(`Demonstração: abriria a conversa deste cliente no número ${nomeBonito(f.ajustes.numero.nome)}.`, 'info');
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
  /* tela cheia aberta: o fundo não recebe foco nem clique */
  const cheia = !!(nova || editarModelo || lembretes || avulsa);
  const inerte = cheia ? ({ inert: '' } as Record<string, string>) : {};
  const aj = f.ajustes;
  const estadoNumero = !aj.numero.conectado ? 'desc' : !aj.ativo ? 'off' : 'ok';
  const rotuloVista = VISTAS.find((v) => v.id === vista);

  return (
    <PendCtx.Provider value={ctx}>
      <div className="pd" data-ed={cheia ? '' : undefined}>
        <header className="pd-cab" {...inerte}>
          <div className="pd-cab-tx">
            <h1>Pendências</h1>
            {f.pronto ? (
              <button type="button" className="pd-num" data-estado={estadoNumero} onClick={() => irPara('ajustes')}
                title={!aj.ativo ? 'Envios desligados. Ver os ajustes do número' : 'Ver os ajustes do número'}>
                <i aria-hidden />
                {/* nunca diz que as mensagens saem quando nada sai (desligado ou número caído).
                    Desligado: a faixa logo abaixo já diz "Envios desligados"; aqui fica só o número (ponto âmbar) */}
                <span>
                  {!aj.ativo ? 'Número '
                    : estadoNumero === 'desc' ? <><span className="pd-num-desc">Número desconectado</span> · </>
                      : 'Mensagens saem pelo número '}
                  <b>{nomeBonito(aj.numero.nome)}</b>{aj.numero.telefone ? <> · <span className="num">{aj.numero.telefone}</span></> : null}
                  {!aj.ativo && estadoNumero === 'desc' && <span className="pd-num-desc"> · desconectado</span>}
                </span>
              </button>
            ) : <span className="pd-num" aria-hidden>&nbsp;</span>}
          </div>
          <BotaoPrimario onClick={() => setNova({})}><IcMais />Nova pendência</BotaoPrimario>
        </header>

        {f.pronto && !aj.ativo && vista !== 'ajustes' && (
          <div className="pd-aviso" data-tom="ambar" role="status" {...inerte}>
            <IcPausa />
            <span>Envios desligados: dá para abrir pendências e montar lembretes, mas nada sai pelo WhatsApp.</span>
            {f.usuario.admin && <BotaoSec mini onClick={() => irPara('ajustes')}>Abrir ajustes</BotaoSec>}
          </div>
        )}
        {f.erro && (
          <div className="pd-aviso" data-tom="rubro" role="alert" {...inerte}>
            <IcAlerta /><span>Não deu para carregar as pendências: {f.erro}</span>
          </div>
        )}

        <div className="pd-corpo" data-cheia={!ehStatus ? '' : undefined} data-sem-painel={listaVazia ? '' : undefined} {...inerte}>
          <nav className="pd-nav" aria-label="Pendências">
            <Segmentado rotulo="Ver" valor={escopo} aoMudar={setEscopo} style={{ width: '100%' }}
              opcoes={[{ valor: 'minhas', rotulo: 'Minhas' }, { valor: 'equipe', rotulo: 'Equipe toda' }]} />
            <div className="pd-nav-grupo">
              {VISTAS.map((v) => {
                const n = f.carregando ? 0 : conta(v.id);
                const tom = v.id === 'respondeu' ? 'azul' : v.id === 'sem_resposta' ? 'ambar' : undefined;
                return <ItemNav key={v.id} v={v.id} rotulo={v.rotulo} n={n} tom={tom} atual={vista === v.id} aoIr={() => irPara(v.id)} />;
              })}
            </div>
            <div className="pd-nav-sep" aria-hidden />
            <div className="pd-nav-grupo">
              <ItemNav v="modelos" rotulo="Mensagens prontas" atual={vista === 'modelos'} aoIr={() => irPara('modelos')} />
              <ItemNav v="ajustes" rotulo="Ajustes" atual={vista === 'ajustes'} aoIr={() => irPara('ajustes')} />
            </div>
            {!f.real && <p className="pd-nav-pe">Demonstração: nada é enviado e nada é salvo.</p>}
          </nav>

          {vista === 'modelos' ? (
            <Modelos aoAbrir={setEditarModelo} />
          ) : vista === 'ajustes' ? (
            <Ajustes aoSujo={setAjSujo} />
          ) : (
            <>
              <section className="vidro pd-lista" aria-label={rotuloVista?.rotulo}>
                <div className="pd-lista-cab">
                  <h2>{rotuloVista?.rotulo}</h2>
                  {!f.carregando && lista.length > 0 && <span className="pd-lista-n num">{lista.length}</span>}
                </div>
                <div className="pd-rolo" ref={rolo}
                  onKeyDown={(e) => {
                    if (!(e.target as Element).closest?.('.pd-lin')) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
                  }}>
                  {f.carregando ? <EsqueletoLista /> : lista.length === 0 ? (
                    <div className="pd-vazio">
                      {/* "Todo mundo respondeu" é boa notícia: check, não o ícone da vista (círculo cortado) */}
                      <span className="pd-vazio-ic" data-tom={vista === 'sem_resposta' ? 'verde' : undefined}>
                        {vista === 'sem_resposta' ? <IcCheck t={22} /> : <IcVista v={vista} t={22} />}
                      </span>
                      <b>{rotuloVista?.vazioT}</b>
                      <p>{rotuloVista?.vazio}</p>
                    </div>
                  ) : lista.map((p) => (
                    <Linha key={p.id} p={p} c={f.cliente(p.clienteId)} ativo={p.id === selEf} equipe={escopo === 'equipe'} aoClicar={() => setSel(p.id)} />
                  ))}
                </div>
              </section>
              {!listaVazia && (
                <aside className="vidro pd-cli" aria-label="Pendência aberta">
                  <div className="pd-cli-rolo">
                  {atual ? (
                    <Painel key={atual.id} p={atual} c={f.cliente(atual.clienteId)} aoAbrirConversa={() => abrirConversa(atual)}
                      aoMudarLembretes={() => setLembretes({ pend: atual, modo: 'mudar', titulo: 'Mudar lembretes' })}
                      aoRetomar={(titulo) => setLembretes({ pend: atual, modo: 'retomar', titulo })}
                      aoAvulsa={() => setAvulsa(atual)}
                      aoNovaParaCliente={() => setNova({ clienteId: atual.clienteId })} />
                  ) : <EsqueletoPainel />}
                  </div>
                </aside>
              )}
            </>
          )}
        </div>

        {nova && (
          <NovaPendencia clienteInicial={nova.clienteId} clienteInicialDados={nova.clienteId ? f.cliente(nova.clienteId) : undefined}
            aoFechar={() => setNova(null)}
            aoCriar={(id) => { setNova(null); setVista('aguardando'); setSel(id); setCriada(id); }} />
        )}
        {editarModelo && <EditorModelo modelo={editarModelo} aoFechar={() => setEditarModelo(null)} />}
        {lembretes && <EditorLembretes pend={lembretes.pend} modo={lembretes.modo} titulo={lembretes.titulo} cliente={f.cliente(lembretes.pend.clienteId)} aoFechar={() => setLembretes(null)} />}
        {avulsa && <EditorAvulsa pend={avulsa} cliente={f.cliente(avulsa.clienteId)} aoFechar={() => setAvulsa(null)} />}
        <ConfirmDialogV2 aberto={irDepois !== null} titulo="Descartar as alterações?"
          mensagem={<span className="pd-dlg-tx">Os ajustes que você mudou e não salvou vão se perder.</span>}
          rotuloConfirmar="Descartar" destrutivo aoCancelar={() => setIrDepois(null)}
          aoConfirmar={() => { const v = irDepois; setIrDepois(null); setAjSujo(false); if (v) setVista(v); }} />
        {toast && (
          <div key={toast.n} className="pd-toast" data-tom={toast.tom} role="status">
            {toast.tom === 'ok' ? <IcCheck /> : toast.tom === 'erro' ? <IcAlerta /> : <IcInfo />}
            <span>{toast.texto}</span>
          </div>
        )}
      </div>
    </PendCtx.Provider>
  );
}

/* ---------------- navegação ---------------- */
function ItemNav({ v, rotulo, n, tom, atual, aoIr }: { v: Vista; rotulo: string; n?: number; tom?: 'azul' | 'ambar'; atual: boolean; aoIr: () => void }) {
  return (
    <button type="button" className="pd-nav-it" aria-current={atual ? 'page' : undefined} onClick={aoIr}
      aria-label={n ? `${rotulo}, ${n}` : undefined}>
      <IcVista v={v} />
      <span className="pd-nav-rot">{rotulo}</span>
      {n ? <span className="pd-nav-n num" data-tom={tom} aria-hidden>{n}</span> : null}
    </button>
  );
}

/* ---------------- carregando ---------------- */
function EsqueletoLista() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="pd-lin pd-lin-esq">
          <Skeleton largura={32} altura={32} raio={99} />
          <span className="pd-lin-tx"><Skeleton largura="40%" altura={11} /><Skeleton largura="64%" altura={10} /></span>
          <Skeleton largura={56} altura={10} />
        </div>
      ))}
    </div>
  );
}
function EsqueletoPainel() {
  return (
    <div className="pd-cli-in" aria-hidden>
      <div className="pd-cli-cab"><Skeleton largura={40} altura={40} raio={99} /><span className="pd-cli-quem"><Skeleton largura="50%" altura={13} /><Skeleton largura="70%" altura={10} /></span></div>
      <Skeleton altura={120} raio={8} />
    </div>
  );
}

/* ---------------- linha da lista ---------------- */
function Linha({ p, c, ativo, equipe, aoClicar }: { p: Pendencia; c: ClienteFechado; ativo: boolean; equipe: boolean; aoClicar: () => void }) {
  const { f } = usePend();
  const aj = f.ajustes;
  const prox = proximoEnvio(p);
  const pz = p.prazo ? diasAte(p.prazo) : undefined;
  const falhou = (p.status === 'aguardando' || p.status === 'sem_resposta') && !!envioFalhou(p);
  const u = ultimoEnvio(p);
  let dir1: ReactNode = '';
  if (p.status === 'respondeu' && p.resposta) dir1 = haQuanto(p.resposta.quando);
  else if (falhou) dir1 = 'envio falhou';
  else if (p.status === 'aguardando') {
    /* envios desligados / número caído: a faixa do topo explica; aqui fica a hora prevista com o sinal de pausa (igual à linha do tempo) */
    dir1 = prox ? (aj.ativo && aj.numero.conectado ? `próximo ${previsaoSaida(prox.quando, aj)}` : <><IcPausa t={11} />{quandoParado(prox.quando, aj)}</>) : u ? `último ${haQuanto(u.quando)}` : '';
  } else if (p.status === 'sem_resposta') dir1 = u ? `último envio ${haQuanto(u.quando)}` : '';
  else if (p.resolvidaEm) dir1 = `resolvida ${haQuanto(p.resolvidaEm)}`;
  const alertaPrazo = p.status !== 'resolvida' && pz != null && pz <= 3;
  const midia = p.resposta ? MIDIA_RESPOSTA[p.resposta.texto] : undefined;
  return (
    <div className="pd-lin" data-id={p.id} data-ativo={ativo ? '' : undefined} role="button" tabIndex={0} aria-pressed={ativo} onClick={aoClicar}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aoClicar(); } }}>
      <span className="pd-av">{iniciais(c.nome)}</span>
      <span className="pd-lin-tx">
        <span className="pd-lin-nome">{nomeBonito(c.nome)}</span>
        <span className="pd-lin-sub">
          {p.status === 'respondeu' && p.resposta
            ? (midia ? <>{midia.tipo && <IcTipo tipo={midia.tipo} />}<span>Respondeu com {midia.com}</span></> : <span>“{p.resposta.texto}”</span>)
            : <><IcPedido t={p.tipo} tam={14} /><span>{cap(p.oQue)}</span></>}
        </span>
      </span>
      <span className="pd-lin-dir">
        <span className="pd-lin-qdo num" data-tom={falhou ? 'rubro' : p.status === 'respondeu' ? 'azul' : undefined}>{dir1}</span>
        {alertaPrazo ? <span className="pd-selo" data-tom="rubro">{cap(frasePrazo(p.prazo))}</span>
          : p.pausada && p.status === 'aguardando' ? <span className="pd-selo" data-tom="neutro"><IcPausa />Pausado</span>
            : equipe ? <span className="pd-lin-resp">{p.responsavel}</span> : <span className="pd-lin-dir2" aria-hidden />}
      </span>
    </div>
  );
}

/* ---------------- painel da pendência ---------------- */
interface Acao { rot: string; ic: ReactNode; fn: () => void }

function Painel({ p, c, aoAbrirConversa, aoMudarLembretes, aoRetomar, aoAvulsa, aoNovaParaCliente }: {
  p: Pendencia; c: ClienteFechado; aoAbrirConversa: () => void; aoMudarLembretes: () => void; aoRetomar: (titulo: string) => void; aoAvulsa: () => void; aoNovaParaCliente: () => void;
}) {
  const { f, rodar } = usePend();
  const [confirmar, setConfirmar] = useState(false);
  const pz = p.prazo ? diasAte(p.prazo) : undefined;
  const urgente = p.status !== 'resolvida' && pz != null && pz <= 3;
  const processo = p.processo;
  const pausar = () => rodar(() => f.acoes.pausar(p.id, !p.pausada), p.pausada ? 'Lembretes retomados.' : 'Lembretes pausados.');

  /* ações: 1 primária + até 2 secundárias + o resto no "Mais" (regras do motor no ar: podeMandarAgora / podeMudarLembretes) */
  const A = {
    conversa: { rot: 'Abrir conversa', ic: <IcConversa />, fn: aoAbrirConversa },
    responder: { rot: 'Responder na conversa', ic: <IcConversa />, fn: aoAbrirConversa },
    agora: { rot: 'Mandar agora', ic: <IcEnviar />, fn: aoAvulsa },
    mudar: { rot: 'Mudar lembretes', ic: <IcLembrete />, fn: aoMudarLembretes },
    pausa: { rot: p.pausada ? 'Retomar lembretes' : 'Pausar lembretes', ic: p.pausada ? <IcPlay /> : <IcPausa />, fn: () => { void pausar(); } },
    resolver: { rot: 'Marcar como resolvida', ic: <IcCheck />, fn: () => setConfirmar(true) },
    /* o editor abre com o mesmo nome do botão que o chamou */
    lembrar: { rot: 'Voltar a lembrar', ic: <IcRetomar />, fn: () => aoRetomar('Voltar a lembrar') },
    programar: { rot: 'Programar mais lembretes', ic: <IcLembrete />, fn: () => aoRetomar('Programar mais lembretes') },
    reabrir: { rot: 'Reabrir', ic: <IcRetomar />, fn: () => { void rodar(() => f.acoes.reabrir(p.id), 'Pendência reaberta.'); } },
    novaCli: { rot: 'Nova pendência para este cliente', ic: <IcMais t={16} />, fn: aoNovaParaCliente },
  } satisfies Record<string, Acao>;
  let primaria: Acao | null = null;
  let resto: (Acao | false)[] = [];
  if (p.status === 'respondeu') { primaria = A.responder; resto = [A.resolver, A.lembrar]; }
  /* pausada: "Retomar" já está na faixa da situação — não repete aqui */
  else if (p.status === 'aguardando') { primaria = A.conversa; resto = [podeMandarAgora(p, f.motorNovo) && A.agora, podeMudarLembretes(p, f.motorNovo) && A.mudar, !p.pausada && A.pausa, A.resolver]; }
  else if (p.status === 'sem_resposta') { primaria = A.programar; resto = [A.conversa, podeMandarAgora(p, f.motorNovo) && A.agora, A.resolver]; }
  /* resolvida: as duas de sempre lado a lado; "Nova pendência para este cliente" no "Mais" (a mesma grade dos outros status) */
  else { resto = [A.conversa, A.reabrir, A.novaCli]; }
  const lista = resto.filter((x): x is Acao => !!x);
  const sec = lista.slice(0, 2);
  const mais = lista.slice(2);

  return (
    <div className="pd-cli-in">
      <header className="pd-cli-cab">
        <span className="pd-av pd-av-g">{iniciais(c.nome)}</span>
        <div className="pd-cli-quem">
          <h2>{nomeBonito(c.nome)}</h2>
          <span>{c.telefone && <><span className="num">{c.telefone}</span> · </>}Encarregado: {p.responsavel}</span>
        </div>
      </header>

      <section className="pd-pedido" aria-label="O que o juiz pediu">
        <span className="pd-pedido-tipo"><IcPedido t={p.tipo} tam={14} />{ROTULO_TIPO[p.tipo]}</span>
        <p className="pd-pedido-oque">{cap(p.oQue)}</p>
        {(processo || p.prazo) && (
          <dl className="pd-fatos">
            {processo && <><dt>Processo</dt><dd className="num">{processo}</dd></>}
            {p.prazo && (
              <><dt>Prazo do juiz</dt>
                <dd className="num" data-alerta={urgente ? '' : undefined}>
                  {dataBR(p.prazo)}{p.status !== 'resolvida' && <span> · {frasePrazo(p.prazo).replace(/^prazo /, '')}</span>}
                </dd></>
            )}
          </dl>
        )}
      </section>

      <Situacao p={p} c={c} aoRetomarPausa={() => { void pausar(); }} />

      <div className="pd-acoes">
        {primaria && <BotaoPrimario className="pd-acao-pri" onClick={primaria.fn}>{primaria.ic}{primaria.rot}</BotaoPrimario>}
        {(sec.length > 0 || mais.length > 0) && (
          <div className="pd-acoes-sec" data-n={sec.length} data-mais={mais.length ? '' : undefined}>
            {sec.map((a) => <BotaoSec key={a.rot} onClick={a.fn}>{a.ic}{a.rot}</BotaoSec>)}
            {mais.length > 0 && <MenuMais itens={mais} />}
          </div>
        )}
      </div>

      <LinhaTempo p={p} c={c} />

      <ConfirmDialogV2 aberto={confirmar} titulo="Marcar como resolvida?"
        mensagem={<span className="pd-dlg-tx">{p.status === 'aguardando' ? 'Os lembretes que ainda não saíram são cancelados.' : 'A pendência sai da lista de trabalho. Dá para reabrir depois.'}</span>}
        rotuloConfirmar="Marcar como resolvida" aoCancelar={() => setConfirmar(false)}
        aoConfirmar={() => { setConfirmar(false); void rodar(() => f.acoes.resolver(p.id), 'Pendência resolvida.'); }} />
    </div>
  );
}

/* situação: uma faixa só, conforme o status (Respondeu mostra a resposta) */
function Situacao({ p, c, aoRetomarPausa }: { p: Pendencia; c: ClienteFechado; aoRetomarPausa: () => void }) {
  const { f } = usePend();
  const aj = f.ajustes;
  const prox = proximoEnvio(p);
  const ent = entregues(p);
  const falha = envioFalhou(p);

  if (p.status === 'respondeu' && p.resposta) {
    const midia = MIDIA_RESPOSTA[p.resposta.texto];
    return (
      <div className="pd-resp">
        <span className="pd-resp-cap">{primeiroNome(c.nome)} respondeu {haQuanto(p.resposta.quando)} · os lembretes pararam</span>
        <div className="pd-resp-bolha">
          {midia ? <span className="pd-resp-midia">{midia.tipo && <IcTipo tipo={midia.tipo} />}{p.resposta.texto}</span> : p.resposta.texto}
          <span className="pd-resp-h num">{hhmmDe(p.resposta.quando)}</span>
        </div>
      </div>
    );
  }
  /* resolvida: a resolução fecha a linha do tempo (check verde), não repete aqui */
  if (p.status === 'resolvida') return null;
  if (falha && (p.status === 'aguardando' || p.status === 'sem_resposta')) {
    return <Sit tom="rubro" rot="Envio falhou" val={`${rotuloEnvio(p, falha)} não saiu`} sub={`${cap(falha.motivoFalha ?? 'erro no envio')}. Confira o número e mande de novo.`} />;
  }
  if (p.status === 'sem_resposta') {
    const u = ultimoEnvio(p);
    return (
      <Sit tom="ambar" rot="Sem resposta"
        val={ent === 0 ? 'Nenhuma mensagem saiu' : `${ent} ${ent === 1 ? 'mensagem enviada' : 'mensagens enviadas'}`}
        sub={u ? `Último envio ${haQuanto(u.quando)}. Vale ligar.` : 'Vale ligar.'} />
    );
  }
  /* aguardando */
  if (p.pausada) {
    return (
      <Sit tom="ambar" rot="Lembretes" val={<span className="pd-sit-ic"><IcPausa t={15} />Pausados</span>} sub="Nada sai até você retomar."
        dir={<BotaoSec mini onClick={aoRetomarPausa}><IcPlay t={13} />Retomar</BotaoSec>} />
    );
  }
  /* a 1ª ainda não saiu (agendada, fora do horário, envios desligados, número caído) ou está na fila */
  const primeira = p.passos[0];
  const sai1 = !primeira ? '' : primeira.estado === 'agendado' ? previsaoSaida(primeira.quando, aj) : primeira.entrega === 'fila' ? 'em instantes' : '';
  if (sai1) {
    if (sai1 === 'em instantes') return <Sit rot="Primeira mensagem" val="Na fila" sub="Sai em instantes." />;
    if (sai1.startsWith('quando')) return <Sit rot="Primeira mensagem" val="Na fila" sub={`Sai ${sai1}.`} />;
    return <Sit rot="Primeira mensagem" val={cap(sai1)} sub="Agendada. Os lembretes contam a partir dela." />;
  }
  if (prox) {
    /* rodando normal: a linha do tempo já destaca o próximo envio (em azul) — nada a repetir aqui.
       Envios desligados: o mesmo critério — a faixa do topo explica e a linha do tempo mostra a pausa + a data.
       A caixa fica só para o número caído (não há faixa para ele) */
    if (!aj.ativo) return null;
    const q = previsaoSaida(prox.quando, aj);
    return q.startsWith('quando') ? <Sit rot={ehAvulso(prox, p.passos.indexOf(prox)) ? 'Mensagem avulsa' : 'Próximo lembrete'} val="Em espera" sub={`Sai ${q}.`} /> : null;
  }
  /* acabou a sequência: o motor passa para "Sem resposta" 24h depois da última entrega */
  const u = ultimoEnvio(p);
  const vira = u ? quandoCurto(new Date(new Date(u.quando).getTime() + 86_400_000).toISOString()) : '';
  return <Sit rot="Lembretes" val="Não há mais lembretes" sub={vira ? `Se não responder, vai para Sem resposta ${vira}.` : undefined} />;
}

function Sit({ tom, rot, val, sub, dir }: { tom?: 'ambar' | 'rubro'; rot: string; val: ReactNode; sub?: ReactNode; dir?: ReactNode }) {
  return (
    <div className="pd-sit" data-tom={tom}>
      <div className="pd-sit-tx">
        <span className="pd-sit-rot">{rot}</span>
        <span className="pd-sit-val">{val}</span>
        {sub && <span className="pd-sit-sub">{sub}</span>}
      </div>
      {dir}
    </div>
  );
}

/* menu "Mais" (popover local) */
function MenuMais({ itens }: { itens: Acao[] }) {
  const [aberto, setAberto] = useState(false);
  const w = useRef<HTMLDivElement>(null);
  const bt = useRef<HTMLButtonElement>(null);
  const fechar = (foco = true) => { setAberto(false); if (foco) bt.current?.focus(); };
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!w.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const bs = [...(w.current?.querySelectorAll<HTMLButtonElement>('.pd-menu button') ?? [])];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
    };
    document.addEventListener('mousedown', fora);
    const el = w.current;
    el?.addEventListener('keydown', tecla);
    requestAnimationFrame(() => w.current?.querySelector<HTMLButtonElement>('.pd-menu button')?.focus());
    return () => { document.removeEventListener('mousedown', fora); el?.removeEventListener('keydown', tecla); };
  }, [aberto]);
  return (
    <div className="pd-menu-w" ref={w}>
      <button type="button" ref={bt} className="p-btn btn-sec pd-mais-b" aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais ações" title="Mais ações"
        onClick={() => setAberto((v) => !v)}>
        <IcMaisAcoes />
      </button>
      {aberto && (
        <div className="pd-menu" role="menu">
          {itens.map((a) => (
            <button key={a.rot} type="button" role="menuitem" onClick={() => { fechar(); a.fn(); }}>{a.ic}{a.rot}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* linha do tempo cronológica: envios, resposta, resolvida; cancelados viram UMA linha no fim */
function LinhaTempo({ p, c }: { p: Pendencia; c: ClienteFechado }) {
  const { f } = usePend();
  const aj = f.ajustes;
  const prox = proximoEnvio(p);
  /* envios desligados / número caído: a faixa do topo já explica; aqui fica só a hora prevista, neutra (azul = o que vem a seguir) */
  const parado = !aj.ativo || !aj.numero.conectado;
  type It = { id: string; e: string; q: ReactNode; s?: ReactNode; h?: ReactNode; quando: string; ord: number; titulo?: string };
  const itens: It[] = [];
  p.passos.forEach((x, i) => {
    if (x.estado === 'cancelado') return;
    const falhou = x.estado === 'enviado' && x.entrega === 'falhou';
    const naFila = x.estado === 'enviado' && x.entrega === 'fila';
    const e = falhou ? 'falhou' : prox?.id === x.id && !parado && !p.pausada ? 'proximo' : naFila ? 'fila' : x.estado;
    const h = x.estado === 'enviado'
      ? (naFila ? 'na fila' : falhou ? 'não saiu' : quandoCurto(x.quando))
      : p.pausada ? <><IcPausa t={12} />pausado</>
        : parado ? <><IcPausa t={12} />{quandoParado(x.quando, aj)}</> : previsaoSaida(x.quando, aj);
    const res = resumoCurto(x.blocos);
    itens.push({
      id: x.id, e, q: rotuloEnvio(p, x), quando: x.quando, ord: i, h,
      s: <>{tiposDe(x.blocos).slice(0, 3).map((t) => <IcTipo key={t} tipo={t} t={12} />)}<span>{falhou ? `${res} · ${x.motivoFalha ?? 'erro no envio'}` : res}</span></>,
      titulo: falhou ? `Não saiu: ${x.motivoFalha ?? 'erro no envio'}` : undefined,
    });
  });
  if (p.resposta) {
    const midia = MIDIA_RESPOSTA[p.resposta.texto];
    itens.push({
      id: 'resp', e: 'resposta', q: `${primeiroNome(c.nome)} respondeu`, quando: p.resposta.quando, ord: 1000,
      /* em "Responderam" o balão logo acima já mostra a resposta */
      s: p.status === 'respondeu' ? undefined : <span>{midia ? `Mandou ${midia.com}` : `“${p.resposta.texto}”`}</span>, h: quandoCurto(p.resposta.quando),
    });
  }
  itens.sort((a, b) => a.quando.localeCompare(b.quando) || a.ord - b.ord);
  const cancelados = p.passos.filter((x, i) => x.estado === 'cancelado' && (i === 0 || !ehAvulso(x, i)));
  const soLembretes = cancelados.every((x) => p.passos.indexOf(x) > 0);
  const nc = cancelados.length;
  /* pararam porque o cliente respondeu (caminho feliz) × cancelados à mão (resolver, trocar) */
  const naoPrecisou = !!p.resposta && cancelados.every((x) => x.quando > p.resposta!.quando);
  const nome = soLembretes ? (nc === 1 ? 'lembrete' : 'lembretes') : (nc === 1 ? 'envio' : 'envios');
  const fraseCanc = naoPrecisou ? `${nc} ${nome} ${nc === 1 ? 'não precisou' : 'não precisaram'} sair` : `${nc} ${nome} ${nc === 1 ? 'cancelado' : 'cancelados'}`;
  /* a história termina na resolução (check verde), depois de tudo — inclusive dos cancelados */
  const fim: It | null = p.resolvidaEm ? { id: 'resolv', e: 'resolvida', q: 'Resolvida', h: quandoCurto(p.resolvidaEm), quando: p.resolvidaEm, ord: 2000 } : null;
  const item = (it: It) => (
    <li key={it.id} className="pd-tl-it" data-e={it.e} title={it.titulo}>
      <span className="pd-tl-pt" aria-hidden>{it.e === 'resolvida' && <IcCheck t={12} />}</span>
      <span className="pd-tl-tx">
        <span className="pd-tl-q">{it.q}</span>
        {it.s && <span className="pd-tl-s">{it.s}</span>}
      </span>
      {it.h && <span className="pd-tl-h num">{it.h}</span>}
    </li>
  );
  return (
    <section className="pd-tl-sec" aria-label="Mensagens">
      <div className="pd-tl-cab"><h3>Mensagens</h3></div>
      <ol className="pd-tl">
        {itens.map(item)}
        {nc > 0 && (
          <li className="pd-tl-it" data-e="cancelados">
            <span className="pd-tl-pt" aria-hidden />
            <span className="pd-tl-tx"><span className="pd-tl-q">{fraseCanc}</span></span>
          </li>
        )}
        {fim && item(fim)}
      </ol>
    </section>
  );
}

/* ============================ Mensagens prontas ============================ */
function Modelos({ aoAbrir }: { aoAbrir: (m: Modelo) => void }) {
  const { f } = usePend();
  const nova = () => aoAbrir({ id: novoId('m'), tipo: 'outro', nome: 'Nova mensagem pronta', passos: [{ id: novoId('p'), dia: 0, hora: 'agora', blocos: [{ id: novoId('b'), tipo: 'texto', texto: '' }] }] });
  return (
    <section className="pd-vista" aria-label="Mensagens prontas">
      <div className="pd-vista-cab">
        <div>
          <h2>Mensagens prontas</h2>
          <p>Cada uma tem a primeira mensagem e os lembretes. Ao abrir uma pendência, você escolhe uma e muda o que quiser só para aquele cliente.</p>
        </div>
        {f.modelos.length > 0 && <BotaoSec onClick={nova}><IcMais />Nova mensagem pronta</BotaoSec>}
      </div>
      {f.modelos.length === 0 ? (
        <div className="vidro pd-vista-vazio">
          <div className="pd-vazio">
            <span className="pd-vazio-ic"><IcVista v="modelos" t={22} /></span>
            <b>Nenhuma mensagem pronta</b>
            <p>Crie uma para não precisar escrever tudo de novo a cada pendência.</p>
            <BotaoSec onClick={nova}><IcMais />Criar mensagem pronta</BotaoSec>
          </div>
        </div>
      ) : (
        <div className="pd-mods">
          {f.modelos.map((m) => {
            const nl = m.passos.length - 1;
            const vis = m.passos.slice(0, 6);
            return (
              <button key={m.id} type="button" className="vidro pd-mod" onClick={() => aoAbrir(m)} title={ROTULO_TIPO[m.tipo]}>
                <span className="pd-mod-cab">
                  <span className="pd-tipo-ic"><IcPedido t={m.tipo} tam={18} /></span>
                  <span className="pd-mod-tx"><b>{m.nome}</b><span>{nl === 0 ? 'Sem lembretes' : `${nl} ${nl === 1 ? 'lembrete' : 'lembretes'} se não responder`}</span></span>
                  <IcSeta />
                </span>
                <ol className="pd-mod-regua" style={{ ['--n' as string]: vis.length + (m.passos.length > 6 ? 1 : 0) }} aria-label="Envios">
                  {vis.map((p, i) => (
                    <li key={p.id}>
                      <span className="num">{i === 0 ? 'Na hora' : `Dia ${p.dia}`}</span>
                      <i />
                      <span className="pd-mod-ics">{tiposDe(p.blocos).slice(0, 3).map((t) => <IcTipo key={t} tipo={t} t={12} />)}</span>
                    </li>
                  ))}
                  {m.passos.length > 6 && <li><span className="num">+{m.passos.length - 6}</span><i /></li>}
                </ol>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const CLIENTE_EXEMPLO: ClienteFechado = { id: 'x', nome: 'MARIA APARECIDA DOS SANTOS', telefone: '', processo: '5001873-22.2026.8.21.0001', acao: '', responsavel: '', fechadoEm: '' };

/** confirmação de saída das telas cheias quando houve mudança */
function ConfirmarDescarte({ aberto, aoVoltar, aoDescartar }: { aberto: boolean; aoVoltar: () => void; aoDescartar: () => void }) {
  return (
    <ConfirmDialogV2 aberto={aberto} titulo="Descartar as alterações?" mensagem={<span className="pd-dlg-tx">O que você mudou vai se perder.</span>}
      rotuloConfirmar="Descartar" destrutivo aoCancelar={aoVoltar} aoConfirmar={aoDescartar} />
  );
}

/** topo da tela cheia: voltar + título à esquerda, ações à direita */
function TopoEditor({ titulo, aoVoltar, centro, dir }: { titulo: ReactNode; aoVoltar: () => void; centro?: ReactNode; dir: ReactNode }) {
  return (
    <div className="pd-ed-topo">
      <div className="pd-ed-esq">
        <button type="button" className="pd-ed-voltar" onClick={aoVoltar} aria-label="Voltar" title="Voltar"><IcVoltar /></button>
        {titulo}
      </div>
      <div className="pd-ed-centro">{centro}</div>
      <div className="pd-ed-dir">{dir}</div>
    </div>
  );
}
export const Falta = ({ t, titulo }: { t: string; titulo?: string }) => (t ? <span className="pd-ed-falta" title={titulo ?? t}><IcInfo /><span>{t}</span></span> : null);

function EditorModelo({ modelo, aoFechar }: { modelo: Modelo; aoFechar: () => void }) {
  const { f, avisar, rodar } = usePend();
  const [m, setM] = useState<Modelo>(() => ({ ...modelo, passos: clonarPassos(modelo.passos) }));
  const [ini] = useState(() => JSON.stringify(m));
  const [excluir, setExcluir] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const existe = f.modelos.some((x) => x.id === modelo.id);
  const falta = reguaPronta(m.passos);
  const sair = () => (JSON.stringify(m) !== ini ? setDescartar(true) : aoFechar());
  useEscFecha(sair, !salvando);
  return (
    <div className="pd-ed" role="dialog" aria-modal="true" aria-label="Mensagem pronta">
      <TopoEditor aoVoltar={sair}
        titulo={(
          <label className="pd-ed-nome-w" title="Mudar o nome">
            <input className="pd-ed-nome" value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} aria-label="Nome da mensagem pronta" maxLength={50} />
            <IcLapis />
          </label>
        )}
        dir={(
          <>
            <Falta t={falta} />
            {/* excluir: só administrador ou supervisor (pendencias_modelo_excluir: so_gestor_exclui) */}
            {existe && f.usuario.gestor && (
              <button type="button" className="pd-icb pd-icb-perigo" onClick={() => setExcluir(true)} aria-label="Excluir mensagem pronta" title="Excluir mensagem pronta">
                <IcLixo />
              </button>
            )}
            <BotaoSec onClick={sair}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={!!falta || salvando} onClick={async () => {
              setSalvando(true);
              const ok = await rodar(() => f.acoes.salvarModelo({ ...m, nome: m.nome.trim() || 'Sem nome' }, existe), 'Mensagem pronta salva.');
              setSalvando(false);
              if (ok) aoFechar();
            }}>Salvar</BotaoPrimario>
          </>
        )} />
      <div className="pd-ed-corpo">
        <EditorRegua passos={m.passos} aoMudar={(passos) => setM((v) => ({ ...v, passos }))} avisar={avisar} subir={f.subir}
          rotuloPrevia="Exemplo: como o cliente vê"
          extraEsquerda={(
            <label className="pd-trilho-campo">
              <span className="pd-trilho-rot">Tipo de pedido</span>
              <select className="inp" value={m.tipo} onChange={(e) => setM({ ...m, tipo: e.target.value as TipoPendencia })}>
                {(Object.keys(ROTULO_TIPO) as TipoPendencia[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
              </select>
            </label>
          )}
          ctx={{ cliente: CLIENTE_EXEMPLO, oQue: 'reassinar a procuração', prazo: new Date(Date.now() + 9 * 86_400_000).toISOString(), processo: CLIENTE_EXEMPLO.processo, atendente: f.usuario.nome, remetente: f.ajustes.numero.nome, telefone: f.ajustes.numero.telefone }} />
      </div>
      <ConfirmDialogV2 aberto={excluir} titulo={`Excluir ${m.nome}?`} mensagem={<span className="pd-dlg-tx">Pendências já abertas com ela não mudam.</span>}
        rotuloConfirmar="Excluir" destrutivo aoCancelar={() => setExcluir(false)}
        aoConfirmar={async () => { setExcluir(false); if (await rodar(() => f.acoes.excluirModelo(m.id), 'Mensagem pronta excluída.')) aoFechar(); }} />
      <ConfirmarDescarte aberto={descartar} aoVoltar={() => setDescartar(false)} aoDescartar={() => { setDescartar(false); aoFechar(); }} />
    </div>
  );
}

/* ============================ lembretes de UMA pendência ============================ */
function EditorLembretes({ pend, modo, titulo, cliente, aoFechar }: {
  pend: Pendencia; modo: 'mudar' | 'retomar';
  /** o mesmo nome do botão que abriu ("Mudar lembretes", "Voltar a lembrar", "Programar mais lembretes") */
  titulo: string; cliente: ClienteFechado; aoFechar: () => void;
}) {
  const { f, avisar, rodar } = usePend();
  const [salvando, setSalvando] = useState(false);
  const [passos, setPassos] = useState<Passo[]>(() => {
    if (modo === 'mudar') {
      /* só os LEMBRETES que ainda não saíram (nunca a 1ª nem avulsa); dias contados do mesmo ponto que o
         servidor usa (real: baseLembretes; demo: data da 1ª) */
      const base = new Date(pend.baseLembretes ?? pend.passos[0]?.quando ?? Date.now()); base.setHours(0, 0, 0, 0);
      return pend.passos.slice(1).filter((x, k) => x.estado === 'agendado' && !ehAvulso(x, k + 1)).map((x) => {
        const d0 = new Date(x.quando); d0.setHours(0, 0, 0, 0);
        return { id: x.id, dia: Math.max(1, Math.round((d0.getTime() - base.getTime()) / 86_400_000)), hora: x.hora, blocos: x.blocos };
      });
    }
    const m = f.modelos.find((x) => x.tipo === pend.tipo) ?? f.modelos[0];
    return clonarPassos((m?.passos ?? []).slice(1)).map((p, i) => ({ ...p, dia: i === 0 ? 1 : p.dia - (m?.passos[1]?.dia ?? 1) + 1 }));
  });
  const [ini] = useState(() => JSON.stringify(passos));
  const [descartar, setDescartar] = useState(false);
  const sair = () => (JSON.stringify(passos) !== ini ? setDescartar(true) : aoFechar());
  useEscFecha(sair, !salvando);
  /* mesma numeração da linha do tempo do painel: continua depois dos lembretes que já saíram/foram cancelados */
  const jaContados = pend.passos.slice(1).filter((x, k) => x.estado !== 'agendado' && !ehAvulso(x, k + 1)).length;
  /* o servidor conta de outro dia que não o da 1ª (ex.: depois de "Voltar a lembrar"): diz de qual */
  const dia0 = (iso?: string) => (iso ? new Date(iso).toDateString() : '');
  const rotuloBase = modo === 'mudar' && pend.baseLembretes && dia0(pend.baseLembretes) !== dia0(pend.passos[0]?.quando)
    ? `depois de ${new Date(pend.baseLembretes).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : undefined;
  const ctx = { cliente, oQue: pend.oQue, prazo: pend.prazo, processo: pend.processo, atendente: f.usuario.nome, remetente: f.ajustes.numero.nome, telefone: f.ajustes.numero.telefone };
  const falta = reguaPronta(passos, ctx);
  const saiu = entregues(pend);
  return (
    <div className="pd-ed" role="dialog" aria-modal="true" aria-label="Lembretes">
      <TopoEditor aoVoltar={sair}
        titulo={<h2 className="pd-ed-tit">{titulo}<small> · {doisNomes(cliente.nome)}</small></h2>}
        dir={(
          <>
            <Falta t={falta} />
            <BotaoSec onClick={sair}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={(!passos.length && modo === 'retomar') || !!falta || salvando} onClick={async () => {
              setSalvando(true);
              const ok = await rodar(() => f.acoes.lembretes(pend.id, passos, modo === 'mudar' ? 'trocar' : 'retomar'),
                modo === 'mudar' ? 'Lembretes alterados.' : 'Lembretes programados. Param sozinhos se ele responder.');
              setSalvando(false);
              if (ok) aoFechar();
            }}>{modo === 'mudar' ? 'Salvar' : titulo}</BotaoPrimario>
          </>
        )} />
      <div className="pd-ed-corpo">
        <EditorRegua passos={passos} aoMudar={setPassos} soLembretes numeroInicial={jaContados + 1} contarDe={modo === 'mudar' ? 'primeira' : 'hoje'} rotuloBase={rotuloBase}
          notaTrilho={saiu ? `Já ${saiu === 1 ? 'saiu 1 mensagem' : `saíram ${saiu} mensagens`}` : undefined}
          avisar={avisar} subir={f.subir} ctx={ctx} />
      </div>
      <ConfirmarDescarte aberto={descartar} aoVoltar={() => setDescartar(false)} aoDescartar={() => { setDescartar(false); aoFechar(); }} />
    </div>
  );
}

/* ============================ mensagem avulsa (agora) ============================ */
function EditorAvulsa({ pend, cliente, aoFechar }: { pend: Pendencia; cliente: ClienteFechado; aoFechar: () => void }) {
  const { f, avisar, rodar } = usePend();
  const [salvando, setSalvando] = useState(false);
  const [passos, setPassos] = useState<Passo[]>([{ id: novoId('p'), dia: 0, hora: 'agora', blocos: [{ id: novoId('b'), tipo: 'texto', texto: '' }] }]);
  const [ini] = useState(() => JSON.stringify(passos));
  const [descartar, setDescartar] = useState(false);
  const sair = () => (JSON.stringify(passos) !== ini ? setDescartar(true) : aoFechar());
  useEscFecha(sair, !salvando);
  const blocos: Bloco[] = passos[0]?.blocos ?? [];
  const ctx = { cliente, oQue: pend.oQue, prazo: pend.prazo, processo: pend.processo, atendente: f.usuario.nome, remetente: f.ajustes.numero.nome, telefone: f.ajustes.numero.telefone };
  const falta = blocosProntos(blocos, ctx);
  /* nunca dizer "sai assim que você enviar" quando nada sai: o selo diz quando; o aviso do topo, por quê (= Nova pendência) */
  const aj = f.ajustes;
  const prev = previsaoSaida(new Date().toISOString(), aj);
  const naHora = prev === 'em instantes';
  const saiTexto = naHora ? undefined : !aj.ativo ? 'Sai quando ligarem os envios' : !aj.numero.conectado ? 'Sai quando o número voltar' : `Sai ${prev}`;
  const avisoSai = naHora ? '' : !aj.ativo ? 'Envios desligados: sai quando ligarem.' : !aj.numero.conectado ? 'Número desconectado: sai quando voltar.' : `Fora do horário: sai ${prev}.`;
  /* fora do horário: a prévia mostra o dia e a hora em que chega de verdade (= Nova pendência) */
  const inicio = !naHora && aj.ativo && aj.numero.conectado ? proximaJanela(new Date(), aj).toISOString() : undefined;
  return (
    <div className="pd-ed" role="dialog" aria-modal="true" aria-label="Mandar agora">
      <TopoEditor aoVoltar={sair}
        titulo={<h2 className="pd-ed-tit">Mandar agora<small> · {doisNomes(cliente.nome)}</small></h2>}
        dir={(
          <>
            <Falta t={falta || avisoSai} />
            <BotaoSec onClick={sair}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={!!falta || salvando} onClick={async () => {
              setSalvando(true);
              const ok = await rodar(() => f.acoes.enviarAgora(pend.id, blocos), !f.real ? SIMULADO : fraseAvulsa(f.ajustes));
              setSalvando(false);
              if (ok) aoFechar();
            }}><IcEnviar />Enviar</BotaoPrimario>
          </>
        )} />
      <div className="pd-ed-corpo">
        <EditorRegua passos={passos} aoMudar={(ps) => setPassos(ps.slice(0, 1))} avisar={avisar} subir={f.subir} semLembretes rotuloUnico="Mensagem" ctx={ctx} saiTexto={saiTexto} inicio={inicio} />
      </div>
      <ConfirmarDescarte aberto={descartar} aoVoltar={() => setDescartar(false)} aoDescartar={() => { setDescartar(false); aoFechar(); }} />
    </div>
  );
}

/* ============================ Ajustes (vista) ============================ */
type Edicao = Partial<Pick<AjustesPendencias, 'ativo' | 'canalId' | 'janelaIni' | 'janelaFim' | 'diasUteis' | 'avisarResponsavel'>> & { limTx?: string };

function Ajustes({ aoSujo }: { aoSujo: (v: boolean) => void }) {
  const { f, rodar } = usePend();
  /* só o que a pessoa mexeu fica guardado aqui; o resto acompanha o servidor */
  const [ed, setEd] = useState<Edicao>({});
  const [salvando, setSalvando] = useState(false);
  const pode = f.usuario.admin;
  const { limTx: _lim, ...edA } = ed;
  const a: AjustesPendencias = { ...f.ajustes, ...edA };
  const limTx = ed.limTx ?? String(f.ajustes.limiteDia);
  const muda = (x: Edicao) => setEd((v) => ({ ...v, ...x }));
  const canal = f.canais.find((c) => c.id === a.canalId);
  /* número escolhido (real: um da lista; demo: o fixo) */
  const num = f.real ? canal : { ...a.numero, id: '' };
  const semNumero = !num;
  const desconectado = !!num && !num.conectado;
  const lim = Number(limTx);
  const sujo = Object.entries(ed).some(([k, v]) => (k === 'limTx' ? v !== String(f.ajustes.limiteDia) : (f.ajustes as unknown as Record<string, unknown>)[k] !== v));
  useEffect(() => { aoSujo(sujo); }, [sujo, aoSujo]);
  useEffect(() => () => aoSujo(false), [aoSujo]);
  const ligado = !!a.ativo;
  /* = pendencias_config_salvar: ligar exige número e número conectado (a tela recusa antes de mandar) */
  const trava = travaEnvios({ ativo: ligado, temNumero: !semNumero, conectado: !desconectado, jaLigado: !!f.ajustes.ativo, mesmoNumero: a.canalId === f.ajustes.canalId });
  const faltaAj = !a.janelaIni || !a.janelaFim ? 'Preencha o horário dos lembretes.'
    : a.janelaFim <= a.janelaIni ? 'O horário final tem que ser depois do inicial.'
      : !limTx || !limiteDiaValido(lim) ? `O limite por dia tem que ser de ${LIMITE_DIA_MIN} a ${LIMITE_DIA_MAX}.`
        : trava ? f.erroAmigavel(trava) : '';
  const salvar = async () => {
    if (!pode || !f.pronto || faltaAj) return;
    setSalvando(true);
    const ok = await rodar(() => f.acoes.salvarAjustes({ ...a, limiteDia: lim, ativo: ligado }), 'Ajustes salvos.');
    setSalvando(false);
    if (ok) setEd({});
  };
  /* ligar: só com número conectado. Desligar: sempre (inclusive com o número caído) */
  const naoLiga = !ligado && (semNumero || desconectado);
  const fraseEnvios = semNumero ? 'Escolha o número abaixo para ligar os envios.'
    : !ligado && desconectado ? 'O número está desconectado. Reconecte em Integrações para ligar.'
      : ligado && desconectado ? 'Nada sai enquanto o número estiver desconectado.'
        : ligado ? 'As mensagens saem pelo número abaixo.' : 'Nada sai pelo WhatsApp. Dá para abrir pendências e montar lembretes.';
  return (
    <section className="pd-vista pd-aj" aria-label="Ajustes">
      <div className="pd-vista-cab">
        <div><h2>Ajustes</h2><p>Valem para todas as pendências.</p></div>
        {!pode && <span className="pd-selo" data-tom="neutro">Só o administrador muda estes ajustes</span>}
      </div>

      <h3 className="pd-aj-tit">Envios</h3>
      <div className="vidro pd-aj-grupo">
        <div className="pd-aj-lin">
          <div>
            <b><i className="pd-ponto" data-tom={ligado ? (semNumero || desconectado ? 'rubro' : 'verde') : 'ambar'} />{ligado ? 'Envios ligados' : 'Envios desligados'}</b>
            <span>{fraseEnvios}</span>
          </div>
          <Toggle ligado={ligado} disabled={!pode || naoLiga} aoMudar={(v) => muda({ ativo: v })} rotulo="Envios ligados" />
        </div>
      </div>

      <h3 className="pd-aj-tit">Número das pendências</h3>
      <div className="vidro pd-aj-grupo">
        <div className="pd-aj-lin">
          <div className="pd-aj-num">
            <span className="pd-aj-num-ic"><IcTelefone /></span>
            <div>
              <b>{num ? <>{nomeBonito(num.nome)}{num.telefone ? <> · <span className="num">{num.telefone}</span></> : null}</> : 'Nenhum número escolhido'}</b>
              <span>{!num ? 'Escolha o número que vai mandar as pendências.' : num.conectado ? 'Conectado por QR Code (sem API)' : 'Desconectado'}</span>
            </div>
          </div>
          {f.real && (
            <select className="inp pd-aj-sel" disabled={!pode} value={a.canalId ?? ''} aria-label="Número"
              onChange={(e) => muda({ canalId: e.target.value || undefined, ...(e.target.value ? {} : { ativo: false }) })}>
              <option value="">Escolha um número</option>
              {f.canais.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.telefone}{c.conectado ? '' : ' (desconectado)'}</option>)}
            </select>
          )}
        </div>
        {num && !num.conectado && (
          <div className="pd-aj-lin pd-aj-lin-aviso">
            <div className="pd-aviso" data-tom="rubro" role="status"><IcAlerta /><span>Este número está desconectado. Reconecte em Integrações.</span></div>
          </div>
        )}
      </div>
      <p className="pd-aj-nota">Todas as pendências saem por este número. A resposta do cliente cai na conversa dele, com o encarregado.</p>

      <h3 className="pd-aj-tit">Quando os lembretes podem sair</h3>
      <div className="vidro pd-aj-grupo">
        <div className="pd-aj-lin">
          <div><b>Horário</b><span>Fora dele, o lembrete espera a próxima abertura.</span></div>
          <div className="pd-aj-ctl">
            das <input className="inp" type="time" disabled={!pode} value={a.janelaIni} onChange={(e) => muda({ janelaIni: e.target.value || a.janelaIni })} aria-label="Início dos envios" />
            às <input className="inp" type="time" disabled={!pode} value={a.janelaFim} onChange={(e) => muda({ janelaFim: e.target.value || a.janelaFim })} aria-label="Fim dos envios" />
          </div>
        </div>
        <div className="pd-aj-lin">
          <div><b>Só de segunda a sexta</b><span>O que cair no fim de semana sai na segunda.</span></div>
          <Toggle ligado={a.diasUteis} disabled={!pode} aoMudar={(v) => muda({ diasUteis: v })} rotulo="Só de segunda a sexta" />
        </div>
      </div>

      <h3 className="pd-aj-tit">Proteção do número</h3>
      <div className="vidro pd-aj-grupo">
        <div className="pd-aj-lin">
          <div><b>No máximo por dia</b><span>De {LIMITE_DIA_MIN} a {LIMITE_DIA_MAX}. Uma mensagem por minuto, para o WhatsApp não bloquear o número.</span></div>
          <div className="pd-aj-ctl">
            <input className="inp pd-aj-lim" type="number" inputMode="numeric" min={LIMITE_DIA_MIN} max={LIMITE_DIA_MAX} step={1} disabled={!pode} value={limTx}
              aria-invalid={!limiteDiaValido(lim) || undefined}
              onChange={(e) => muda({ limTx: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={`Limite por dia, de ${LIMITE_DIA_MIN} a ${LIMITE_DIA_MAX}`} />
            mensagens
          </div>
        </div>
      </div>

      <h3 className="pd-aj-tit">Quando o cliente responder</h3>
      <div className="vidro pd-aj-grupo">
        <div className="pd-aj-lin">
          <div><b>Avisar o encarregado no sino do Atenvo</b><span>Ele vê que o cliente respondeu e assume a conversa.</span></div>
          <Toggle ligado={a.avisarResponsavel} disabled={!pode} aoMudar={(v) => muda({ avisarResponsavel: v })} rotulo="Avisar o encarregado" />
        </div>
      </div>
      <p className="pd-aj-nota">Os lembretes param sozinhos assim que o cliente responde.</p>

      {sujo && pode && (
        <div className="pd-aj-barra" role="region" aria-label="Alterações não salvas">
          {faltaAj ? <Falta t={faltaAj} /> : <span>Alterações não salvas</span>}
          <BotaoSec onClick={() => setEd({})} disabled={salvando}>Descartar</BotaoSec>
          <BotaoPrimario onClick={salvar} disabled={salvando || !f.pronto || !!faltaAj}>Salvar</BotaoPrimario>
        </div>
      )}
    </section>
  );
}
