/* ============================================================================
   Fila da Iris — a TELA (etapa 1: só o visual), agora com os clientes REAIS da lista de 11/11
   distribuídos na prévia (ver leads.ts). Nada aqui grava no sistema.
   Prioridades: 0 Pegar histórico de crédito · 1 Clientes quentes · 2 Documentação pendente · 3 Sem resposta.
   Cada atendente vê só a própria fila; o administrador vê também a Equipe.
   Na janela do cliente só aparece o que veio na lista (nada inventado sobre cliente de verdade).
   ============================================================================ */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Segmentado } from '../../components';
import { criarRaizPortalV2 } from '../../components/portal';
import {
  CATEGORIAS, EQUIPE, GRUPOS_MARCA, MARCAS, atendente, curtoMarca, equipeDoUid, grupoMarca, haQuanto, infoCategoria, ordenarMarcas, quando,
  textoMarca, turnoTexto,
  type Atendente, type Categoria, type GrupoMarca, type InfoCategoria, type Marca, type TipoMarca,
} from './dados';
import { PASSOS, ROTULO_LISTA, dataHora, minDesde, ordenarLeads, passosDoLead, type Lead } from './lead';
import { textoPeriodo, type FonteFila, type NumeroAtendente, type Periodo } from './fonte';
import {
  IcBaixo, IcChave, IcCheck, IcConversa, IcDoc, IcInfo, IcMais, IcMarca, IcRelogio, IcSair, IcSeta, IcTelefone, IcVoltar, IcX,
} from './icones';
import './filaIris.css';

type Visao = 'minha' | 'equipe' | 'de';
type Filtro = Categoria | 'todas';
type FiltroMarca = GrupoMarca | 'esperando' | 'todas';

/* cor do avatar do atendente — a mesma paleta do Painel da Equipe (supervisao/zapUi.corDe) */
const PALETA_AV = ['#3B6E8F', '#7A5A92', '#2F7D6A', '#9A5B3C', '#5862A8', '#8A4E6B', '#4F7A3A', '#A0613A', '#3F6FA0', '#6B6F2E'];
function corDe(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) | 0;
  return PALETA_AV[Math.abs(h) % PALETA_AV.length];
}
const ROTULO_CURTO: Record<Categoria, string> = { historico: 'Pegar histórico', quente: 'Quentes', documentacao: 'Documentação', sem_resposta: 'Sem resposta' };
const iniciais = (n: string) => {
  const p = n.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
/* nome curto: primeiro + último ("Maria do Carmo Ribeiro" → "Maria Ribeiro") */
const doisNomes = (n: string) => {
  const p = n.split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : n;
};
const artigo = (a: Atendente) => (a.nome === 'Luiz' || a.nome === 'Matheus' ? 'o' : 'a');
const minAtras = (em: number) => Math.max(0, Math.round((Date.now() - em) / 60_000));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/* campanha curta para a coluna ("Juros abusivo" → "Juros"; "não achei no sistema" → "—") */
const campanhaCurta = (c: string) => (c === 'não achei no sistema' ? '—' : c === 'Juros abusivo' ? 'Juros' : c === 'EMPRESTIMO' ? 'Empréstimo' : c);

/* ---------------------------------------------------------------- peças */

function IcTipoMarca({ tipo, t = 13 }: { tipo: TipoMarca; t?: number }) {
  if (tipo === 'nao_atendeu') return <IcTelefone t={t} />;
  if (tipo === 'recuperar_senha' || tipo === 'mandar_senha') return <IcChave t={t} />;
  if (tipo === 'mandar_doc') return <IcDoc t={t} />;
  return <IcMarca t={t} />;
}

/** as marcações do atendente na linha da fila: por ordem de urgência, cor por grupo (até 3 + "+n") */
function ChipsMarca({ marcas }: { marcas: Marca[] }) {
  if (!marcas.length) return <span className="fi-marc-vazia">—</span>;
  const ord = ordenarMarcas(marcas);
  return (
    <>
      {ord.slice(0, 3).map((m) => (
        <span key={m.id} className="fi-chip-marca" data-grupo={grupoMarca(m.tipo)} title={`${textoMarca(m)} · marcado ${quando(minAtras(m.em))}`}>
          <IcTipoMarca tipo={m.tipo} t={12} />
          <span className="fi-elip">{curtoMarca(m)}</span>
          {m.tipo === 'nao_atendeu' && <b className="fi-chip-n num">{m.vezes ?? 1}x</b>}
        </span>
      ))}
      {ord.length > 3 && <span className="fi-chip-mais" title={ord.slice(3).map(textoMarca).join(' · ')}>+{ord.length - 3}</span>}
    </>
  );
}

function Avatar({ l, tam = 40 }: { l: Lead; tam?: number }) {
  return <span className="fi-av" data-cat={l.cat} style={{ width: tam, height: tam }}>{iniciais(l.nome)}</span>;
}

function AvatarAtendente({ a, tam = 32 }: { a: Atendente; tam?: number }) {
  return <span className="fi-av fi-av-at" style={{ width: tam, height: tam, background: corDe(a.nome) }}>{a.nome[0]}</span>;
}

/** uma célula da faixa de prioridades (padrão do Painel da Equipe: rótulo, número, linha de apoio) */
function CelulaPrioridade({ info, lista, ativo, aoClicar }: {
  info: InfoCategoria; lista: Lead[]; ativo: boolean; aoClicar?: () => void;
}) {
  const n = lista.length;
  const aguardando = lista.filter((l) => l.esperandoEm).length;
  let meta: ReactNode;
  if (info.id === 'historico') meta = n ? 'assinados · falta o histórico de créditos' : 'nenhum pendente';
  else if (info.id === 'sem_resposta') {
    /* entra na fila 24 h depois da nossa última mensagem: "novos" = os que completaram as 24 h hoje */
    const novos = lista.filter((l) => (minDesde(l.nu) ?? 99999) <= 48 * 60).length;
    meta = novos ? `${plural(novos, 'entrou', 'entraram')} nas últimas 24 h` : 'sem resposta há mais de 24 h';
  } else if (aguardando) meta = <><em>{aguardando}</em> aguardando resposta</>;
  else meta = info.id === 'quente' ? 'documentação completa' : `${lista.filter((l) => l.lista === 2).length} só falta o comprovante`;
  const conteudo = (
    <>
      <span className="fi-kpi-r">Prioridade {info.ordem} · {info.rotulo}</span>
      <b className="fi-kpi-n num">{n}</b>
      <span className="fi-kpi-s">{meta}</span>
    </>
  );
  if (!aoClicar) return <div className="fi-kpi" title={info.resumo}>{conteudo}</div>;
  return (
    <button type="button" className="fi-kpi" data-ativo={ativo ? '' : undefined} aria-pressed={ativo} onClick={aoClicar}
      title={`${info.resumo} ${ativo ? 'Clique para mostrar a fila toda.' : 'Clique para ver só estes.'}`}>
      {conteudo}
    </button>
  );
}

/** títulos das colunas (centralizados; só "Cliente" à esquerda) */
function Colunas({ ultima }: { ultima: string }) {
  return (
    <div className="fi-colunas" aria-hidden>
      <span className="fi-col-cli">Cliente</span>
      <span>Situação</span>
      <span>Marcações</span>
      <span>Última resposta</span>
      <span>{ultima}</span>
      <span />
    </div>
  );
}

/** o tempo da coluna "Última resposta" */
function tempoDe(l: Lead): { t: string; alerta?: boolean } {
  if (l.esperandoEm) return { t: `escreveu ${haQuanto(minDesde(l.esperandoEm) ?? 0)}`, alerta: true };
  if (l.cat === 'historico') return { t: '—' };
  if (l.cat === 'sem_resposta') return { t: l.nu ? `parou ${haQuanto(minDesde(l.nu) ?? 0)}` : '—' };
  return { t: l.ud ? haQuanto(minDesde(l.ud) ?? 0) : '—' };
}

/** uma linha da fila */
function Linha({ l, ativo, aoAbrir, mostrarDono, marcas }: {
  l: Lead; ativo: boolean; aoAbrir: () => void; mostrarDono?: boolean; marcas: Marca[];
}) {
  const tempo = tempoDe(l);
  return (
    <button type="button" className="fi-lin" data-cat={l.cat} data-ativo={ativo ? '' : undefined} onClick={aoAbrir}
      aria-label={`Abrir ${l.nome}`}>
      <span className="fi-col-cli">
        <Avatar l={l} />
        <span className="fi-lin-tx">
          <b className="fi-lin-nome" title={l.nome}>{doisNomes(l.nome)}</b>
          <span className="fi-lin-prod num">{l.fone}</span>
        </span>
      </span>
      <span className="fi-col-sit">
        {l.esperandoEm ? <span className="fi-espera" title={`Escreveu ${dataHora(l.esperandoEm)}: "${l.disse}"`}><i aria-hidden />Aguardando resposta</span> : null}
        <span className="fi-elip" title={l.situacao}>{l.curta}</span>
        {l.nota && <span className="fi-nota-pt" title={l.nota} aria-label={l.nota}><IcInfo t={13} /></span>}
      </span>
      <span className="fi-col-marc"><ChipsMarca marcas={marcas} /></span>
      <span className="fi-col-tempo" data-alerta={tempo.alerta ? '' : undefined}>{tempo.t}</span>
      <span className="fi-col-canal" title={mostrarDono ? undefined : l.campanha}>{mostrarDono ? atendente(l.atendente).nome : campanhaCurta(l.campanha)}</span>
      <span className="fi-col-seta" aria-hidden><IcSeta t={14} /></span>
    </button>
  );
}

/** o caminho do cliente com a Iris, pelo que a lista diz */
function Caminho({ l }: { l: Lead }) {
  const est = passosDoLead(l);
  return (
    <ol className="fi-passos" data-cat={l.cat}>
      {PASSOS.map((rot, i) => (
        <li key={rot} className="fi-passo" data-estado={est[i]}>
          <span className="fi-passo-pt" aria-hidden>
            {est[i] === 'feito' ? <IcCheck t={11} /> : est[i] === 'parou' ? <IcX t={10} /> : null}
          </span>
          <span className="fi-passo-rot">{rot}</span>
          <span className="fi-sr">{est[i] === 'feito' ? ' (feito)' : est[i] === 'atual' ? ' (agora)' : est[i] === 'parou' ? ' (parou aqui)' : ''}</span>
        </li>
      ))}
    </ol>
  );
}

/** marcações do cliente, agrupadas: Ligação · Meu INSS · Documentos */
function MarcarCliente({ marcas, aoMarcar, aoTirar }: {
  marcas: Marca[]; aoMarcar: (tipo: TipoMarca, texto?: string) => void; aoTirar: (id: string) => void;
}) {
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (escrevendo) campo.current?.focus(); }, [escrevendo]);
  const tem = (t: TipoMarca) => marcas.find((m) => m.tipo === t);
  const faltas = ordenarMarcas(marcas.filter((m) => m.tipo === 'falta'));
  const salvarFalta = () => {
    const t = texto.trim();
    if (!t) return;
    aoMarcar('falta', t);
    setTexto(''); setEscrevendo(false);
  };

  const botao = (tipo: TipoMarca) => {
    const b = MARCAS.find((x) => x.tipo === tipo)!;
    const ja = tem(tipo);
    const g = grupoMarca(tipo);
    if (tipo === 'falta') {
      return (
        <button key={tipo} type="button" className="fi-tile" data-grupo={g} aria-expanded={escrevendo} onClick={() => setEscrevendo((v) => !v)}>
          <span className="fi-tile-ic"><IcMais t={13} /></span>
          <span className="fi-tile-tx"><b>Falta outra coisa</b><small>{faltas.length ? plural(faltas.length, 'marcada', 'marcadas') : 'Escreva o que ficou faltando'}</small></span>
        </button>
      );
    }
    if (tipo === 'nao_atendeu') {
      return (
        <div key={tipo} className="fi-tile-caixa fi-tile-largo">
          <button type="button" className="fi-tile" data-grupo={g} data-on={ja ? '' : undefined} onClick={() => aoMarcar(tipo)}
            title="Cada clique conta mais uma ligação sem resposta">
            <span className="fi-tile-ic"><IcTelefone t={14} /></span>
            <span className="fi-tile-tx">
              <b>{b.botao}</b>
              <small>{ja ? `Ligar de novo · última tentativa ${quando(minAtras(ja.em))}` : 'Marca o cliente para ligar de novo'}</small>
            </span>
            <span className="fi-tile-dir">{ja ? <b className="fi-tile-n num">{ja.vezes ?? 1}x</b> : <span className="fi-tile-mais">+1</span>}</span>
          </button>
          {ja && <button type="button" className="fi-x fi-tile-x" onClick={() => aoTirar(ja.id)} aria-label="Tirar a marcação Ligar de novo" title="Conseguiu falar: tirar a marcação"><IcX t={11} /></button>}
        </div>
      );
    }
    return (
      <button key={tipo} type="button" className="fi-tile" data-grupo={g} data-on={ja ? '' : undefined} aria-pressed={!!ja}
        onClick={() => (ja ? aoTirar(ja.id) : aoMarcar(tipo))} title={ja ? 'Resolvido: clique para tirar a marcação' : 'Clique para marcar'}>
        <span className="fi-tile-ic"><IcTipoMarca tipo={tipo} t={14} /></span>
        <span className="fi-tile-tx"><b>{b.botao}</b><small>{ja ? `Marcado ${quando(minAtras(ja.em))}` : 'Clique para marcar'}</small></span>
        <span className="fi-tile-dir">{ja ? <span className="fi-tile-ok"><IcCheck t={11} /></span> : null}</span>
      </button>
    );
  };

  return (
    <section className="fi-bloco fi-marcar">
      <h3 className="fi-bloco-t">Marcações{marcas.length > 0 && <span className="fi-marcar-tot num">{marcas.length}</span>}
        <span className="fi-bloco-n">ficam salvas e aparecem na fila</span></h3>
      {GRUPOS_MARCA.map((gr) => (
        <div key={gr.id} className="fi-marcar-grupo" data-grupo={gr.id}>
          <span className="fi-marcar-rot">{gr.rotulo}</span>
          <div className="fi-marcar-grade">{gr.tipos.map(botao)}</div>
          {gr.id === 'docs' && (escrevendo || faltas.length > 0) && (
            <div className="fi-faltas">
              {faltas.map((m) => (
                <div key={m.id} className="fi-falta-item">
                  <IcMarca t={12} /><span className="fi-falta-tx">{m.texto}</span>
                  <span className="fi-falta-h">{quando(minAtras(m.em))}</span>
                  <button type="button" className="fi-x" onClick={() => aoTirar(m.id)} aria-label={`Tirar a marcação Falta: ${m.texto}`} title="Resolvido: tirar a marcação"><IcX t={10} /></button>
                </div>
              ))}
              {escrevendo && (
                <div className="fi-falta">
                  <input ref={campo} className="fi-falta-in" value={texto} maxLength={80} placeholder="O que ficou faltando? Ex.: comprovante no nome dele"
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') salvarFalta();
                      if (e.key === 'Escape') { setEscrevendo(false); setTexto(''); }
                    }} />
                  <BotaoPrimario mini onClick={salvarFalta} disabled={!texto.trim()}>Marcar</BotaoPrimario>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/** a ficha do cliente — janela de vidro no meio da tela */
function JanelaCliente({ l, raiz, lista, aoTrocar, aoFechar, avisar, vendoComo, aoMarcar, aoTirar, aoCorrigirDocs, aoTirarDaFila, abrirConversa }: {
  l: Lead; raiz: HTMLElement; lista: Lead[]; aoTrocar: (id: string) => void; aoFechar: () => void;
  avisar: (t: string) => void; vendoComo: Atendente;
  aoMarcar: (tipo: TipoMarca, texto?: string) => void; aoTirar: (id: string) => void;
  aoCorrigirDocs: (estado: 'completos' | 'incompletos' | null) => void; aoTirarDaFila: () => void;
  abrirConversa?: (l: Lead) => void;
}) {
  const marcas = l.marcas;
  const info = infoCategoria(l.cat);
  const dono = atendente(l.atendente);
  const ehDono = vendoComo.id === dono.id;
  const pos = lista.findIndex((x) => x.id === l.id);
  const ir = (d: number) => { const nx = lista[pos + d]; if (nx) aoTrocar(nx.id); };

  /* Esc fecha; ← → passam para o cliente anterior/seguinte da fila (menos quando está digitando) */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') aoFechar();
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  });

  const tempo = tempoDe(l);
  const fatos: [string, string][] = [['Situação', ROTULO_LISTA[l.lista] ?? '—']];
  if (l.funil) fatos.push(['Coluna no Kanban', l.funil]);
  fatos.push(['Campanha', l.campanha]);
  if (l.cat !== 'historico') {
    fatos.push(['Documento pessoal', l.docPessoal ? 'Recebido (frente e verso)' : 'Não recebido']);
    fatos.push(['Comprovante de residência', l.comprovante ? 'Recebido' : 'Não recebido']);
  }
  if (l.falta) fatos.push(['O que falta', l.falta]);
  if (l.assinadoEm) fatos.push(['Assinado (última via aprovada)', dataHora(l.assinadoEm)]);
  if (l.udoc) fatos.push(['Último documento recebido', dataHora(l.udoc)]);
  if (l.ud) fatos.push(['Última mensagem dele', dataHora(l.ud)]);
  if (l.nu) fatos.push(['Nossa última mensagem', dataHora(l.nu)]);
  if (l.arq != null) fatos.push(['Arquivos enviados', String(l.arq)]);
  if (l.msgs != null) fatos.push(['Mensagens nossas', String(l.msgs)]);
  if (l.planilha) fatos.push(['Atendente na planilha', l.planilha]);

  return createPortal(
    <div className="fi-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="fi-modal vidro-pro" data-cat={l.cat} role="dialog" aria-modal="true" aria-label={`Cliente ${l.nome}`}>
        <header className="fi-modal-cab">
          <Avatar l={l} tam={48} />
          <div className="fi-modal-quem">
            <h2>{l.nome}</h2>
            <span><span className="num">{l.fone}</span> · {l.campanha}{l.funil ? ` · ${l.funil}` : ''} · Cliente de {dono.nome}</span>
          </div>
          <div className="fi-modal-nav">
            <button type="button" className="fi-x" onClick={() => ir(-1)} disabled={pos <= 0} aria-label="Cliente anterior" title="Cliente anterior (←)"><IcVoltar t={14} /></button>
            <span className="num">{pos + 1} de {lista.length}</span>
            <button type="button" className="fi-x" onClick={() => ir(1)} disabled={pos >= lista.length - 1} aria-label="Próximo cliente" title="Próximo cliente (→)"><IcSeta t={14} /></button>
          </div>
          <button type="button" className="fi-x fi-modal-fechar" onClick={aoFechar} aria-label="Fechar" title="Fechar (Esc)"><IcX t={13} /></button>
        </header>

        <div className="fi-modal-corpo" key={l.id}>
          <div className="fi-modal-col">
            <div className="fi-sit" data-cat={l.cat}>
              <span className="fi-sit-tx">
                <span className="fi-sit-rot">Prioridade {info.ordem} · {info.rotulo}</span>
                <span className="fi-sit-val">{l.situacao}</span>
                {tempo.t !== '—' && (
                  <span className="fi-sit-sub" data-alerta={tempo.alerta ? '' : undefined}>
                    <IcRelogio t={12} />{tempo.alerta ? 'Escreveu' : l.cat === 'sem_resposta' ? 'Parou' : 'Última resposta'} {tempo.t.replace(/^(escreveu|parou) /, '')}
                  </span>
                )}
              </span>
            </div>

            {l.esperandoEm && (
              <div className="fi-esperando" role="status">
                <b><i aria-hidden />Aguardando sua resposta</b>
                <span>Escreveu por último e ninguém respondeu · {dataHora(l.esperandoEm)}</span>
                <div className="fi-bolha-cli">{l.disse}</div>
              </div>
            )}
            {l.nota && <div className="fi-nota-aviso"><IcInfo t={14} />{l.nota}</div>}

            <section className="fi-bloco">
              <h3 className="fi-bloco-t">Andamento do atendimento</h3>
              <Caminho l={l} />
            </section>

            <section className="fi-bloco">
              <h3 className="fi-bloco-t">Conversa</h3>
              <p className="fi-conv-nota">A conversa completa fica no WhatsApp. Use "Abrir conversa" para responder o cliente.</p>
            </section>
          </div>

          <div className="fi-modal-col">
            <MarcarCliente marcas={marcas} aoMarcar={aoMarcar} aoTirar={aoTirar} />

            <section className="fi-bloco">
              <h3 className="fi-bloco-t">Dados do atendimento</h3>
              <dl className="fi-fatos">
                {fatos.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}
              </dl>
              {l.cat !== 'historico' && l.cat !== 'sem_resposta' && (
                <div className="fi-corrigir">
                  <span>{l.docsManual ? 'Documentação marcada à mão.' : 'A leitura dos documentos errou?'}</span>
                  {l.docsManual
                    ? <button type="button" className="fi-link" onClick={() => aoCorrigirDocs(null)}>Voltar à leitura automática</button>
                    : l.cat === 'quente'
                      ? <button type="button" className="fi-link" onClick={() => aoCorrigirDocs('incompletos')}>Marcar como incompleta</button>
                      : <button type="button" className="fi-link" onClick={() => aoCorrigirDocs('completos')}>Marcar como completa</button>}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="fi-modal-pe">
          <span className="fi-modal-nota">
            {ehDono ? 'Use ← e → para passar pelos clientes da fila.' : `Você está vendo a fila de ${dono.nome}. Quem atende é ${artigo(dono)} ${dono.nome}.`}
          </span>
          <BotaoSec onClick={aoTirarDaFila}><IcSair t={14} />Tirar da fila</BotaoSec>
          <BotaoPrimario onClick={() => (abrirConversa ? abrirConversa(l) : avisar(`Prévia: aqui abre a conversa de ${doisNomes(l.nome)} no WhatsApp.`))}>
            <IcConversa t={15} />Abrir conversa
          </BotaoPrimario>
        </footer>
      </div>
    </div>,
    raiz,
  );
}

/** visão do administrador: um cartão por atendente */
function CartaoAtendente({ a, aoAbrir, leads, numero }: { a: Atendente; aoAbrir: () => void; leads: Lead[]; numero?: NumeroAtendente | null }) {
  const meus = leads.filter((l) => l.atendente === a.id);
  const por = (cat: Categoria) => meus.filter((l) => l.cat === cat).length;
  const maxN = Math.max(1, ...EQUIPE.map((x) => Math.max(...CATEGORIAS.map((k) => leads.filter((l) => l.atendente === x.id && l.cat === k.id).length))));
  const taxa = numero && numero.recebidos ? (numero.fechados / numero.recebidos) * 100 : null;
  const esperando = meus.filter((l) => l.esperandoEm).length;
  return (
    <article className="fi-eq vidro">
      <header className="fi-eq-cab">
        <AvatarAtendente a={a} tam={34} />
        <span className="fi-eq-quem">
          <b>{a.nome}</b>
          <span title={`Turno ${a.turno.ini}h–${a.turno.fim}h`}>{plural(meus.length, 'cliente', 'clientes')}</span>
        </span>
        <BotaoSec mini onClick={aoAbrir}>Ver fila<IcSeta t={12} /></BotaoSec>
      </header>
      {numero && (
        <div className="fi-eq-nums" aria-label="Recebidos e fechados no período">
          <span><b className="num">{numero.recebidos}</b>recebidos</span>
          <span><b className="num">{numero.fechados}</b>fechados</span>
          <span><b className="num">{taxa == null ? '—' : `${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</b>taxa</span>
        </div>
      )}
      <div className="fi-eq-linhas">
        {CATEGORIAS.map((k) => {
          const n = por(k.id);
          return (
            <div key={k.id} className="fi-eq-lin" data-cat={k.id}>
              <span className="fi-eq-rot">{ROTULO_CURTO[k.id]}</span>
              <span className="fi-eq-barra" aria-hidden><i style={{ width: `${(n / maxN) * 100}%` }} /></span>
              <b className="fi-eq-n num">{n}</b>
            </div>
          );
        })}
      </div>
      <footer className="fi-eq-pe" data-alerta={esperando ? '' : undefined}>
        {esperando ? <><i className="fi-pt" aria-hidden />{esperando} aguardando resposta</> : 'Ninguém aguardando resposta'}
      </footer>
    </article>
  );
}

/** "Ver como" da prévia: um botão só, que abre a lista da equipe (no real cada um vê a própria fila) */
function VerComo({ valor, aoMudar, leads }: { valor: string; aoMudar: (id: string) => void; leads: Lead[] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);
  const a = atendente(valor);
  const ordem = [...EQUIPE].sort((x, y) => Number(!!y.admin) - Number(!!x.admin) || x.nome.localeCompare(y.nome));
  return (
    <div className="fi-vc" ref={caixa}>
      <button type="button" className="fi-vc-bt" aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
        title="Só na prévia: ver a tela como cada atendente">
        <span className="fi-vc-rot">Ver como</span>
        <AvatarAtendente a={a} tam={20} /><b>{a.nome}</b><IcBaixo t={12} />
      </button>
      {aberto && (
        <div className="fi-vc-menu" role="listbox" aria-label="Ver a tela como">
          {ordem.map((x) => (
            <button key={x.id} type="button" role="option" aria-selected={x.id === valor} className="fi-vc-op"
              onClick={() => { aoMudar(x.id); setAberto(false); }}>
              <AvatarAtendente a={x} tam={26} />
              <span className="fi-vc-op-tx"><b>{x.nome}</b><small>{plural(leads.filter((l) => l.atendente === x.id).length, 'cliente', 'clientes')} · turno {x.turno.ini}h–{x.turno.fim}h</small></span>
              {x.id === valor && <IcCheck t={12} />}
            </button>
          ))}
          <p className="fi-vc-nota">Só na prévia. Na tela de verdade, cada atendente vê a própria fila.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- a tela */

export default function FilaIrisTela({ fonte, usuarioId, admin: adminReal, abrirConversa }: {
  fonte: FonteFila;
  /** no real: o usuário logado (a fila é a dele; "Ver como" é só da prévia) */
  usuarioId?: string;
  /** no real: é administrador da organização (vê a Equipe e os números) */
  admin?: boolean;
  abrirConversa?: (l: Lead) => void;
}) {
  const real = fonte.modo === 'real';
  const [verComoPrevia, setVerComo] = useState('matheus');
  const meuId = real ? equipeDoUid(usuarioId) : verComoPrevia;
  /* administrador sem fila própria (ex.: Murilo): só a visão da Equipe */
  const semFilaPropria = real && !meuId;
  const verComo = meuId ?? 'matheus';
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [tirando, setTirando] = useState<Lead | null>(null);
  const [visao, setVisao] = useState<Visao>(semFilaPropria ? 'equipe' : 'minha');
  const [alvo, setAlvo] = useState('matheus');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [filtroMarca, setFiltroMarca] = useState<FiltroMarca>('todas');
  const [aberto, setAberto] = useState<string | null>(null);
  const [toast, setToast] = useState<{ t: string; n: number } | null>(null);
  const [comoFunciona, setComoFunciona] = useState(false);

  /* raiz de portal da página (janela do cliente + aviso ficam acima de tudo) */
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => { el.remove(); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const avisar = (t: string) => setToast({ t, n: Date.now() });

  const eu = atendente(verComo);
  const admin = real ? !!adminReal : !!eu.admin;
  const visaoEf: Visao = !admin ? 'minha' : semFilaPropria && visao === 'minha' ? 'equipe' : visao;
  const dono = visaoEf === 'de' ? alvo : verComo;

  const leads = fonte.leads;
  const daFila = useMemo(() => leads.filter((l) => l.atendente === dono), [leads, dono]);
  const base = visaoEf === 'equipe' ? leads : daFila;
  const grupos = useMemo(
    () => CATEGORIAS.map((info) => ({ info, itens: ordenarLeads(daFila.filter((l) => l.cat === info.id)) })),
    [daFila],
  );
  const passaMarca = (l: Lead) => filtroMarca === 'todas'
    || (filtroMarca === 'esperando' ? !!l.esperandoEm : l.marcas.some((m) => grupoMarca(m.tipo) === filtroMarca));
  const visiveis = (filtro === 'todas' ? grupos : grupos.filter((g) => g.info.id === filtro))
    .map((g) => (filtroMarca === 'todas' ? g : { ...g, itens: g.itens.filter(passaMarca) }))
    .filter((g) => filtroMarca === 'todas' || g.itens.length > 0);
  const contaMarca = (g: GrupoMarca) => daFila.filter((l) => l.marcas.some((m) => grupoMarca(m.tipo) === g)).length;
  const contaEsperando = daFila.filter((l) => l.esperandoEm).length;
  const plana = visiveis.flatMap((g) => g.itens);
  const quentesEquipe = useMemo(() => ordenarLeads(leads.filter((l) => l.cat === 'quente')), [leads]);
  const navegacao = visaoEf === 'equipe' ? quentesEquipe : plana;
  const clienteAberto = aberto ? navegacao.find((l) => l.id === aberto) : undefined;
  const total = daFila.length;
  const donoInfo = atendente(dono);

  /* troca de pessoa/visão/filtro: fecha a janela */
  useEffect(() => { setAberto(null); }, [dono, visaoEf, filtro, filtroMarca]);

  const trocarVerComo = (id: string) => { setVerComo(id); setVisao('minha'); setFiltro('todas'); setFiltroMarca('todas'); };
  const abrirFilaDe = (id: string) => {
    if (id === verComo && !semFilaPropria) setVisao('minha'); else { setAlvo(id); setVisao('de'); }
    setFiltro('todas'); setFiltroMarca('todas');
  };
  const n = filtro === 'todas' && filtroMarca === 'todas' ? total : plana.length;

  return (
    <div className="fi">
      <header className="fi-cab">
        <div className="fi-cab-tx">
          <h1>Fila da Iris</h1>
          <p className="fi-cab-sub">
            <span>{fonte.rotulo}</span>
            <span className="fi-sep" aria-hidden>·</span>
            <span className="num">{fonte.carregando ? 'carregando…' : visaoEf === 'equipe' ? `${leads.length} clientes na equipe` : plural(total, 'cliente', 'clientes')}</span>
            <span className="fi-sep" aria-hidden>·</span>
            <button type="button" className="fi-link" onClick={() => setComoFunciona((v) => !v)} aria-expanded={comoFunciona}>
              <IcInfo t={13} />Como funciona
            </button>
          </p>
        </div>
        <div className="fi-cab-dir">
          {!real && <VerComo valor={verComo} aoMudar={trocarVerComo} leads={leads} />}
          {admin && !semFilaPropria && (
            <Segmentado rotulo="Visão" valor={visaoEf === 'minha' ? 'minha' : 'equipe'}
              aoMudar={(v) => { setVisao(v); setFiltro('todas'); setFiltroMarca('todas'); }}
              opcoes={[{ valor: 'minha', rotulo: 'Minha fila' }, { valor: 'equipe', rotulo: 'Equipe' }]} />
          )}
        </div>
      </header>

      {comoFunciona && (
        <div className="fi-como vidro" role="region" aria-label="Como a fila funciona">
          <div className="fi-como-cols">
            {CATEGORIAS.map((k) => (
              <div key={k.id} className="fi-como-it" data-cat={k.id}>
                <span className="fi-como-t">Prioridade {k.ordem} · {k.rotulo}</span>
                <span>{k.entra}</span>
              </div>
            ))}
          </div>
          <p className="fi-como-pe">
            Cada atendente vê os clientes que o robô distribuiu para ele, como hoje. A fila se organiza sozinha pelo andamento do atendimento.
            Quando o administrativo fecha o cliente, ele sai da fila e vai para a aba Fechados. Cliente no Remarketing não entra.
            {fonte.modo === 'previa' && ' Prévia: foto da fila de hoje, só leitura; as marcações feitas aqui não são gravadas.'}
            {fonte.modo === 'demo' && ' Demonstração com clientes fictícios.'}
          </p>
          <button type="button" className="fi-x" onClick={() => setComoFunciona(false)} aria-label="Fechar"><IcX t={12} /></button>
        </div>
      )}

      {fonte.erro && (
        <div className="fi-aviso" data-tom="rubro" role="alert"><span>Não deu para carregar a fila: {fonte.erro}</span></div>
      )}

      {visaoEf === 'de' && (
        <div className="fi-aviso" role="status">
          <AvatarAtendente a={donoInfo} tam={24} />
          <span>Você está vendo a fila de <b>{donoInfo.nome}</b> · turno {turnoTexto(donoInfo)}</span>
          <BotaoSec mini onClick={() => setVisao('equipe')}><IcVoltar t={12} />Voltar para a Equipe</BotaoSec>
        </div>
      )}

      <div className="fi-faixa vidro" role="group" aria-label="Prioridades da fila">
        {CATEGORIAS.map((info) => (
          <CelulaPrioridade key={info.id} info={info}
            lista={base.filter((l) => l.cat === info.id)}
            ativo={visaoEf !== 'equipe' && filtro === info.id}
            aoClicar={visaoEf === 'equipe' ? undefined : () => setFiltro((f) => (f === info.id ? 'todas' : info.id))} />
        ))}
      </div>

      {visaoEf === 'equipe' ? (
        <div className="fi-equipe">
          {fonte.numeros(periodo) && (
            <div className="fi-eq-barra-per">
              <span className="fi-eq-per-rot">Recebidos e fechados</span>
              <Segmentado rotulo="Período dos números" valor={periodo} aoMudar={setPeriodo}
                opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: '7d', rotulo: '7 dias' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'mes_ant', rotulo: 'Mês passado' }]} />
              <span className="fi-eq-per-nota">{textoPeriodo(periodo)} · recebidos = distribuídos pelo robô · fechados = placar do CAF</span>
            </div>
          )}
          <div className="fi-eq-grade">
            {EQUIPE.map((a) => (
              <CartaoAtendente key={a.id} a={a} aoAbrir={() => abrirFilaDe(a.id)} leads={leads}
                numero={fonte.numeros(periodo)?.find((x) => x.atendente === a.id) ?? null} />
            ))}
          </div>
          <section className="fi-lista vidro fi-lista-eq">
            <header className="fi-lista-cab">
              <h2>Clientes quentes da equipe</h2>
              <span className="fi-lista-n">{plural(quentesEquipe.length, 'cliente', 'clientes')}</span>
            </header>
            <Colunas ultima="Atendente" />
            <div className="fi-rolo-eq">
              {quentesEquipe.map((l) => (
                <Linha key={l.id} l={l} ativo={l.id === aberto} mostrarDono aoAbrir={() => setAberto(l.id)} marcas={l.marcas} />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="fi-lista vidro fi-lista-cheia">
          <header className="fi-lista-cab">
            <h2>{filtro === 'todas' ? (visaoEf === 'de' ? `Fila de ${donoInfo.nome}` : 'Minha fila') : infoCategoria(filtro).rotulo}</h2>
            <span className="fi-lista-n">{plural(n, 'cliente', 'clientes')}</span>
            {(filtro !== 'todas' || filtroMarca !== 'todas') && (
              <button type="button" className="fi-limpar" onClick={() => { setFiltro('todas'); setFiltroMarca('todas'); }}>
                Limpar filtro<IcX t={10} />
              </button>
            )}
            <div className="fi-filtro-marca" role="group" aria-label="Filtrar a fila">
              <span className="fi-filtro-rot">Filtrar</span>
              <button type="button" className="fi-fm" data-grupo="esperando" aria-pressed={filtroMarca === 'esperando'}
                disabled={!contaEsperando && filtroMarca !== 'esperando'}
                onClick={() => setFiltroMarca((f) => (f === 'esperando' ? 'todas' : 'esperando'))}
                title="Clientes que escreveram por último e ninguém respondeu">
                <i className="fi-fm-pt" aria-hidden />Aguardando resposta<b className="num">{contaEsperando}</b>
              </button>
              {GRUPOS_MARCA.map((g) => {
                const c = contaMarca(g.id);
                return (
                  <button key={g.id} type="button" className="fi-fm" data-grupo={g.id} aria-pressed={filtroMarca === g.id}
                    disabled={!c && filtroMarca !== g.id}
                    onClick={() => setFiltroMarca((f) => (f === g.id ? 'todas' : g.id))}
                    title={filtroMarca === g.id ? 'Mostrar todos de novo' : `Mostrar só quem está marcado: ${g.filtro}`}>
                    {g.id === 'ligacao' ? <IcTelefone t={12} /> : g.id === 'inss' ? <IcChave t={12} /> : <IcDoc t={12} />}
                    {g.filtro}<b className="num">{c}</b>
                  </button>
                );
              })}
            </div>
          </header>
          <Colunas ultima="Campanha" />
          <div className="fi-rolo">
            {visiveis.map(({ info, itens }) => (
              <div key={info.id} className="fi-grupo" data-cat={info.id}>
                <div className="fi-sec" title={`Ordem: ${info.regra}`}>
                  <span className="fi-sec-t">Prioridade {info.ordem} · {info.rotulo}</span>
                  <span className="fi-sec-n num">{itens.length}</span>
                </div>
                {itens.length ? itens.map((l) => (
                  <Linha key={l.id} l={l} ativo={l.id === aberto} aoAbrir={() => setAberto(l.id)} marcas={l.marcas} />
                )) : (
                  <div className="fi-sec-vazio"><b>{info.vazioT}</b><span>{info.vazio}</span></div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {raiz && clienteAberto && (
        <JanelaCliente l={clienteAberto} raiz={raiz} lista={navegacao} aoTrocar={setAberto}
          aoFechar={() => setAberto(null)} avisar={avisar} vendoComo={eu}
          abrirConversa={abrirConversa}
          aoMarcar={(tipo, texto) => fonte.marcar(clienteAberto.id, tipo, texto)}
          aoTirar={(mid) => fonte.tirarMarca(clienteAberto.id, mid)}
          aoCorrigirDocs={(estado) => {
            fonte.corrigirDocs(clienteAberto.id, estado);
            avisar(estado === 'completos' ? 'Marcada como completa: o cliente sobe para Clientes quentes.'
              : estado === 'incompletos' ? 'Marcada como incompleta: o cliente vai para Documentação pendente.' : 'Voltou para a leitura automática dos documentos.');
          }}
          aoTirarDaFila={() => setTirando(clienteAberto)} />
      )}
      {raiz && (
        <ConfirmDialogV2 aberto={!!tirando} titulo="Tirar da fila?"
          mensagem={tirando ? `${tirando.nome} sai da sua fila. A conversa e o card continuam como estão no WhatsApp e no Kanban.` : ''}
          rotuloConfirmar="Tirar da fila"
          aoCancelar={() => setTirando(null)}
          aoConfirmar={() => {
            if (tirando) { fonte.tirarDaFila(tirando.id); setAberto(null); avisar(`${doisNomes(tirando.nome)} saiu da fila.`); }
            setTirando(null);
          }} />
      )}
      {raiz && toast && createPortal(
        <div className="fi-toast" role="status" key={toast.n}>
          <IcInfo t={14} /><span>{toast.t}</span>
        </div>,
        raiz,
      )}
    </div>
  );
}
