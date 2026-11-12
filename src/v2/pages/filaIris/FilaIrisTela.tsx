/* ============================================================================
   Fila da Iris — a TELA. A mesma na demonstração, na prévia (foto do dia) e no real (fonteReal.ts).
   Seções (nomes do dono, 12/11): Prioridade · Documentação faltando · Cliente sem resposta ("Pegar histórico" saiu).
   Linhas em listras de planilha; "Entrou hoje" marca quem chegou hoje; números do dia: recebidos · marcações · fechados.
   Topo: resumo (responder agora · as prioridades · os números). Fila: busca, filtros por marcação,
   seções que recolhem e linhas com a situação, a última mensagem do cliente e a campanha.
   Cada atendente vê só a própria fila; o administrador vê também a Equipe.
   ============================================================================ */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Segmentado } from '../../components';
import { criarRaizPortalV2 } from '../../components/portal';
import {
  CATEGORIAS, EQUIPE, GRUPOS_MARCA, MARCAS, atendente, curtoMarca, equipeDoUid, grupoMarca, haQuanto, infoCategoria, ordenarMarcas, quando,
  textoMarca, turnoTexto,
  type Atendente, type Categoria, type GrupoMarca, type Marca, type TipoMarca,
} from './dados';
import {
  PASSOS, ROTULO_LISTA, campanhaBonita, dataHora, mensagemDoCliente, minDesde, ordenarLeads, passosDoLead, type Lead,
} from './lead';
import { textoPeriodo, type FonteFila, type NumeroAtendente, type Periodo } from './fonte';
import {
  IcBaixo, IcBusca, IcChave, IcCheck, IcConversa, IcCopiar, IcDoc, IcInfo, IcIris, IcMais, IcMarca, IcRelogio, IcSair, IcSeta, IcTelefone, IcVoltar, IcX,
} from './icones';
import { TEXTO_AVISO } from './avisosTexto';
import { ATALHOS_RECADO, EVENTO_FILA_RECARREGAR, estadoDoRecado, fraseDoEstado, quandoFoi, type FonteRecados, type Recado } from './recados';
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
const ROTULO_CURTO: Record<Categoria, string> = { historico: 'Pegar histórico', quente: 'Prioridade', documentacao: 'Documentação faltando', sem_resposta: 'Cliente sem resposta' };
/** 0 h de hoje (o relógio do computador): "Entrou hoje", "marcações hoje" */
const inicioDeHoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const iniciais = (n: string) => {
  const p = n.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
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
const porcento = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
/* busca sem acento e sem maiúscula; telefone só pelos dígitos */
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function passaBusca(l: Lead, termo: string): boolean {
  if (!termo) return true;
  const dig = termo.replace(/\D/g, '');
  if (dig.length >= 3 && l.fone.replace(/\D/g, '').includes(dig)) return true;
  return semAcento(l.nome).includes(semAcento(termo));
}

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
      {ord.slice(0, 2).map((m) => (
        <span key={m.id} className="fi-chip-marca" data-grupo={grupoMarca(m.tipo)} title={`${textoMarca(m)} · marcado ${quando(minAtras(m.em))}`}>
          <IcTipoMarca tipo={m.tipo} t={12} />
          <span className="fi-elip">{curtoMarca(m)}</span>
          {m.tipo === 'nao_atendeu' && <b className="fi-chip-n num">{m.vezes ?? 1}x</b>}
        </span>
      ))}
      {ord.length > 2 && <span className="fi-chip-mais" title={ord.slice(2).map(textoMarca).join(' · ')}>+{ord.length - 2}</span>}
    </>
  );
}

function Avatar({ l, tam = 40 }: { l: Lead; tam?: number }) {
  return (
    <span className="fi-av-caixa">
      <span className="fi-av" data-cat={l.cat} style={{ width: tam, height: tam }}>{iniciais(l.nome) || <IcTelefone t={15} />}</span>
      {l.esperandoEm ? <i className="fi-av-pt" title="Aguardando resposta" /> : null}
    </span>
  );
}

function AvatarAtendente({ a, tam = 32 }: { a: Atendente; tam?: number }) {
  return <span className="fi-av fi-av-at" style={{ width: tam, height: tam, background: corDe(a.nome) }}>{a.nome[0]}</span>;
}

/** o que aparece embaixo do número de cada prioridade (aguardando resposta vem antes de tudo) */
function metaPrioridade(id: Categoria, lista: Lead[], minha: boolean): ReactNode {
  const n = lista.length;
  const aguardando = lista.filter((l) => l.esperandoEm).length;
  if (aguardando) return <><i className="fi-pt" aria-hidden />{aguardando} aguardando {minha ? 'sua ' : ''}resposta</>;
  if (id === 'historico') return n ? `assinado${n > 1 ? 's' : ''} · falta o histórico` : 'nenhum pendente';
  if (id === 'sem_resposta') {
    /* a mesma régua do aviso: quem a Iris passou nas últimas 24 h */
    const novos = lista.filter((l) => l.novo).length;
    return novos ? `${novos} da Iris agora` : n ? 'sem resposta há mais de 24h' : 'ninguém parado';
  }
  if (id === 'quente') return n ? 'documentação completa' : 'nenhum agora';
  const so = lista.filter((l) => l.lista === 2).length;
  return so ? `em ${so} só falta o comprovante` : n ? 'falta documento' : 'nenhuma pendente';
}

/** os números do topo: `per` = o que aparece grande (recebidos · marcações · fechados), `sub` = a linha de baixo */
type NumerosPainel = { titulo: string; nota: string; per: NumeroAtendente | null; sub: string | null };

/** o resumo do topo: responder agora · as três seções · os números (recebidos, marcações, fechados) */
function Painel({ base, filtro, aoFiltrar, esperandoAtivo, aoEsperando, numeros, minha }: {
  base: Lead[]; filtro: Filtro; aoFiltrar?: (c: Categoria) => void;
  esperandoAtivo: boolean; aoEsperando?: () => void; numeros: NumerosPainel | null; minha: boolean;
}) {
  const total = base.length;
  const esperando = base.filter((l) => l.esperandoEm);
  const maisAntigo = esperando.reduce((m, l) => Math.max(m, minDesde(l.esperandoEm) ?? 0), 0);
  const agora = (
    <>
      <span className="fi-pn-r"><i className="fi-pt" aria-hidden />Responder agora</span>
      <b className="fi-pn-n num">{esperando.length}</b>
      <span className="fi-pn-s">{esperando.length ? `o mais antigo espera ${haQuanto(maisAntigo)}` : 'ninguém aguardando'}</span>
    </>
  );
  return (
    <section className="fi-painel vidro" aria-label="Resumo da fila">
      {aoEsperando ? (
        <button type="button" className="fi-pn fi-pn-agora" data-tem={esperando.length ? '' : undefined}
          data-ativo={esperandoAtivo ? '' : undefined} aria-pressed={esperandoAtivo} onClick={aoEsperando} disabled={!esperando.length && !esperandoAtivo}
          title={esperandoAtivo ? 'Mostrar a fila toda' : 'Mostrar só quem escreveu por último e ninguém respondeu'}>
          {agora}
        </button>
      ) : <div className="fi-pn fi-pn-agora" data-tem={esperando.length ? '' : undefined}>{agora}</div>}

      <div className="fi-pn-prios" role="group" aria-label="Prioridades da fila">
        {CATEGORIAS.map((info) => {
          const lista = base.filter((l) => l.cat === info.id);
          const pct = total ? (lista.length / total) * 100 : 0;
          const pctTxt = total ? `${Math.round(pct)}% da fila` : '';
          const ativo = filtro === info.id;
          const conteudo = (
            <>
              <span className="fi-pn-r" title={`${info.rotulo}${pctTxt ? ` · ${pctTxt}` : ''}`}>{ROTULO_CURTO[info.id]}</span>
              <b className="fi-pn-n num">{lista.length}</b>
              <span className="fi-pn-barra" aria-hidden><i style={{ width: `${Math.max(pct, lista.length ? 2 : 0)}%` }} /></span>
              <span className="fi-pn-s">{metaPrioridade(info.id, lista, minha)}</span>
            </>
          );
          return aoFiltrar ? (
            <button key={info.id} type="button" className="fi-pn" data-cat={info.id} data-ativo={ativo ? '' : undefined} aria-pressed={ativo}
              onClick={() => aoFiltrar(info.id)}
              title={`${info.resumo}${pctTxt ? ` ${pctTxt.replace('% da', '% da sua')}.` : ''} ${ativo ? 'Clique para mostrar a fila toda.' : 'Clique para ver só estes.'}`}>
              {conteudo}
            </button>
          ) : <div key={info.id} className="fi-pn" data-cat={info.id} title={`${info.resumo}${pctTxt ? ` ${pctTxt}.` : ''}`}>{conteudo}</div>;
        })}
      </div>

      {numeros && (
        <div className="fi-pn fi-pn-num" aria-label={numeros.titulo}>
          <span className="fi-pn-r">{numeros.titulo}<span className="fi-pn-r-nota">{numeros.nota}</span></span>
          <div className="fi-pn-stats">
            <span title="Clientes que o robô distribuiu no período"><b className="num">{numeros.per?.recebidos ?? '—'}</b>{numeros.per?.recebidos === 1 ? 'recebido' : 'recebidos'}</span>
            <span title="Marcações feitas no período (Ligar de novo, Senha do Meu INSS, Documentos, Falta: …)"><b className="num">{numeros.per?.marcacoes ?? '—'}</b>{numeros.per?.marcacoes === 1 ? 'marcação' : 'marcações'}</span>
            <span title="Fechados = placar do CAF"><b className="num">{numeros.per?.fechados ?? '—'}</b>{numeros.per?.fechados === 1 ? 'fechado' : 'fechados'}</span>
          </div>
          {numeros.sub && <span className="fi-pn-s">{numeros.sub}</span>}
        </div>
      )}
    </section>
  );
}

/** títulos das colunas (centralizados; só "Cliente" à esquerda). Sem `ultima`, a coluna da direita não existe
    (pedido do dono 12/11: "pode [tirar] a campanha · kanban para dar mais espaço"). */
function Colunas({ ultima }: { ultima?: string }) {
  return (
    <div className="fi-colunas" aria-hidden>
      <span className="fi-col-cli">Cliente</span>
      <span>Situação</span>
      <span>Última mensagem do cliente</span>
      <span>Marcações</span>
      {ultima ? <span>{ultima}</span> : null}
      <span />
    </div>
  );
}

/** o tempo (janela do cliente): quando escreveu, quando parou, a última resposta */
function tempoDe(l: Lead): { t: string; alerta?: boolean } {
  if (l.esperandoEm) return { t: `escreveu ${haQuanto(minDesde(l.esperandoEm) ?? 0)}`, alerta: true };
  if (l.cat === 'historico') return { t: '—' };
  if (l.cat === 'sem_resposta') return { t: l.nu ? `parou ${haQuanto(minDesde(l.nu) ?? 0)}` : '—' };
  return { t: l.ud ? haQuanto(minDesde(l.ud) ?? 0) : '—' };
}

/** o aviso da passagem de bastão (dono 12/11): o que a Iris deixou para fazer.
    Fora da própria fila o texto fala do dono ("passou para Juliana"), no padrão do resto da tela. */
function textoIris(l: Lead, sua: boolean, dono: string): { curto: string; titulo: string; faca: string } {
  const quem = sua ? 'você' : dono;
  if (l.cat === 'quente' && l.docsManual === 'completos') {
    return { curto: 'Marcada completa · falta fechar', titulo: 'Documentação marcada completa pelo atendente',
      faca: sua ? 'Falta você fechar.' : 'Falta fechar.' };
  }
  if (l.cat === 'quente') {
    return { curto: `A Iris passou para ${quem}`, titulo: `A Iris atendeu completo e passou para ${quem}`,
      /* o título já diz "atendeu completo": aqui só o que fazer */
      faca: sua ? 'O cliente mandou toda a documentação. Falta você fechar.' : 'O cliente mandou toda a documentação. Falta fechar.' };
  }
  if (l.cat === 'documentacao') {
    return { curto: `A Iris passou para ${quem}`, titulo: `A Iris passou para ${quem}`,
      faca: sua ? TEXTO_AVISO.documentacao.faca : 'Faltou documentação e o cliente não respondeu. Precisa de ajuda para resolver.' };
  }
  return { curto: `A Iris passou para ${quem}`, titulo: `A Iris passou para ${quem}`,
    faca: sua ? TEXTO_AVISO.sem_resposta.faca : 'O cliente ficou sem resposta. Precisa de um remarketing.' };
}

/** documento pessoal e comprovante: recebido (com o tique) ou faltando (tracejado) */
function DocsMini({ l }: { l: Lead }) {
  return (
    <span className="fi-docs-mini">
      <span data-ok={l.docPessoal ? '' : undefined}>{l.docPessoal ? <IcCheck t={10} /> : <i aria-hidden />}Documento</span>
      <span data-ok={l.comprovante ? '' : undefined}>{l.comprovante ? <IcCheck t={10} /> : <i aria-hidden />}Comprovante</span>
      <span className="fi-sr">{`Documento pessoal ${l.docPessoal ? 'recebido' : 'faltando'}, comprovante ${l.comprovante ? 'recebido' : 'faltando'}`}</span>
    </span>
  );
}

/** a segunda linha da situação */
function Detalhe({ l }: { l: Lead }) {
  if (l.cat === 'historico') return <span className="fi-l2">{l.assinadoEm ? `assinado ${dataHora(l.assinadoEm)}` : 'assinado no administrativo'}</span>;
  if (l.cat === 'sem_resposta') return <span className="fi-l2">{l.nu ? `nossa última mensagem ${dataHora(l.nu)}` : 'sem mensagem nossa'}</span>;
  if (l.docsManual) return <span className="fi-l2">marcada à mão pelo atendente</span>;
  if (l.cat === 'quente') {
    const t = l.udoc ?? l.ud;
    return <span className="fi-l2">{t ? `mandou tudo ${haQuanto(minDesde(t) ?? 0)}` : 'documento e comprovante recebidos'}</span>;
  }
  return <DocsMini l={l} />;
}

/** uma linha da fila (a linha abre a janela do cliente; o botão da direita abre a conversa) */
function Linha({ l, ativo, aoAbrir, aoConversa, mostrarDono, sua, destacar, semCanal }: {
  l: Lead; ativo: boolean; aoAbrir: () => void; aoConversa: () => void; mostrarDono?: boolean;
  /** a fila é de quem está olhando ("aguardando SUA resposta") */
  sua?: boolean;
  /** termo buscado: se ele só existe no meio do nome, a linha mostra o nome completo */
  destacar?: string;
  /** sem a coluna Campanha · Kanban (a Minha fila; a campanha fica na janela) */
  semCanal?: boolean;
}) {
  const msg = mensagemDoCliente(l.disse);
  const dono = atendente(l.atendente);
  const quandoEscreveu = l.ud ? `${haQuanto(minDesde(l.ud) ?? 0)} · ${dataHora(l.ud)}` : '';
  const nomeCurto = doisNomes(l.nome);
  const nomeMostrado = destacar && !semAcento(nomeCurto).includes(semAcento(destacar)) ? l.nome : nomeCurto;
  /* em "Sem resposta" a situação carrega o que varia: há quanto tempo parou */
  const situacao = l.cat === 'sem_resposta' && l.nu ? `${l.curta} ${haQuanto(minDesde(l.nu) ?? 0)}` : l.curta;
  return (
    <div className="fi-lin" role="button" tabIndex={0} data-id={l.id} data-cat={l.cat} data-ativo={ativo ? '' : undefined}
      data-espera={l.esperandoEm ? '' : undefined} aria-label={`Abrir ${l.nome}`}
      onClick={() => { if (window.getSelection()?.toString()) return; aoAbrir(); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); aoAbrir(); } }}>
      <span className="fi-col-cli">
        <Avatar l={l} />
        <span className="fi-lin-tx">
          <b className="fi-lin-nome" title={l.nome}>{nomeMostrado}</b>
          <span className="fi-lin-l2">
            {!l.fone ? <span className="fi-lin-prod">sem telefone no cadastro</span>
              : l.fone === l.nome ? <span className="fi-lin-prod">sem nome no cadastro</span>
                : <span className="fi-lin-prod num">{l.fone}</span>}
            {l.entrouEm && l.entrouEm >= inicioDeHoje() && <span className="fi-hoje" title={`Entrou hoje às ${hm(l.entrouEm)}`}>Entrou hoje</span>}
          </span>
        </span>
      </span>
      <span className="fi-col-sit">
        <span className="fi-l1 fi-elip" title={l.situacao}>{situacao}</span>
        {l.novo
          ? <span className="fi-l2 fi-iris-chip" title={`${textoIris(l, !!sua, dono.nome).titulo}. ${textoIris(l, !!sua, dono.nome).faca}`}>
              <IcIris t={11} /><span className="fi-elip">{textoIris(l, !!sua, dono.nome).curto} · {haQuanto(minDesde(l.passouEm) ?? 0)}</span>
            </span>
          : <Detalhe l={l} />}
      </span>
      <span className="fi-col-msg">
        {msg
          ? <span className="fi-l1 fi-elip" data-midia={msg.midia ? '' : undefined} title={msg.texto}>{msg.midia ? msg.texto : `“${msg.texto}”`}</span>
          : <span className="fi-l1 fi-vazio">Nenhuma mensagem do cliente</span>}
        {l.esperandoEm
          ? <span className="fi-l2" data-alerta><i className="fi-pt" aria-hidden />aguardando {sua ? 'sua ' : ''}resposta · {haQuanto(minDesde(l.esperandoEm) ?? 0)}</span>
          : quandoEscreveu ? <span className="fi-l2">{quandoEscreveu}</span> : null}
      </span>
      <span className="fi-col-marc"><ChipsMarca marcas={l.marcas} /></span>
      {semCanal ? null : <span className="fi-col-canal">
        {mostrarDono ? (
          <>
            <span className="fi-l1 fi-dono"><AvatarAtendente a={dono} tam={18} />{dono.nome}</span>
            <span className="fi-l2 fi-elip">{campanhaBonita(l.campanha)}</span>
          </>
        ) : (
          <>
            <span className="fi-l1 fi-elip" title={l.campanha}>{campanhaBonita(l.campanha)}</span>
            {l.funil ? <span className="fi-l2 fi-elip" title="Coluna no Kanban">{l.funil}</span> : null}
          </>
        )}
      </span>}
      <span className="fi-col-acao">
        <button type="button" className="fi-bt-conv" onClick={(e) => { e.stopPropagation(); aoConversa(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          aria-label={`Abrir a conversa de ${l.nome}`} title="Abrir a conversa no WhatsApp">
          <IcConversa t={15} />
        </button>
      </span>
    </div>
  );
}

/** o caminho do cliente com a Iris, pelo que a lista diz */
function Caminho({ l, comQuem }: { l: Lead; comQuem: string }) {
  const est = passosDoLead(l);
  return (
    <ol className="fi-passos" data-cat={l.cat}>
      {PASSOS.map((rot, i) => (
        <li key={rot} className="fi-passo" data-estado={est[i]}>
          <span className="fi-passo-pt" aria-hidden>
            {est[i] === 'feito' ? <IcCheck t={11} /> : est[i] === 'parou' ? <IcX t={10} /> : null}
          </span>
          <span className="fi-passo-rot">{i === PASSOS.length - 1 ? comQuem : rot}</span>
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
          <span className="fi-tile-tx"><b>Falta outra coisa</b><small>{faltas.length ? plural(faltas.length, 'marcada', 'marcadas') : 'escreva o que ficou faltando'}</small></span>
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
              {ja && <small>{`Ligar de novo · última tentativa ${quando(minAtras(ja.em))}`}</small>}
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
        <span className="fi-tile-tx"><b>{b.botao}</b>{ja && <small>{`Marcado ${quando(minAtras(ja.em))}`}</small>}</span>
        <span className="fi-tile-dir">{ja ? <span className="fi-tile-ok"><IcCheck t={11} /></span> : null}</span>
      </button>
    );
  };

  return (
    <section className="fi-bloco fi-marcar">
      <h3 className="fi-bloco-t">Marcações{marcas.length > 0 && <span className="fi-marcar-tot num">{marcas.length}</span>}
        <span className="fi-bloco-n">clique para marcar · fica salvo e aparece na fila</span></h3>
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

/** o recado do gestor para o dono do cliente, na ficha: o último recado deste cliente (e o que o atendente fez)
    + o campo para escrever, com os atalhos */
function RecadoNaFicha({ fonte, cliente, para, paraNome, avisar }: {
  fonte: FonteRecados; cliente: Lead; para: string; paraNome: string; avisar: (t: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ultimo = fonte.enviados.find((r) => r.contatoId === cliente.id);
  const nome = paraNome.split(/\s+/)[0];
  const mandar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const { paraNome: quem } = await fonte.enviar({ contatoId: cliente.id, conversaId: cliente.conversaId, cliente: cliente.nome, para, paraNome }, t);
      const n = quem.split(/\s+/)[0] || nome;
      setTexto('');
      avisar(`Recado enviado para ${n}. Quando ${/a$/i.test(n) ? 'ela' : 'ele'} responder, aparece para você.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não deu para mandar o recado agora.';
      /* o cliente mudou de dono desde que a fila foi lida: relê, e a ficha passa a mostrar o dono de agora */
      if (/mudou de atendente/i.test(msg)) window.dispatchEvent(new Event(EVENTO_FILA_RECARREGAR));
      avisar(msg);
    } finally { setEnviando(false); }
  };
  return (
    <section className="fi-bloco fi-recado">
      <h3 className="fi-bloco-t">Recado para {nome}<span className="fi-bloco-n">aparece na tela {/a$/i.test(nome) ? 'dela' : 'dele'}, em qualquer página</span></h3>
      {ultimo && (
        <div className="fi-recado-ult" data-estado={estadoDoRecado(ultimo)}>
          <span className="fi-recado-est">{fraseDoEstado(ultimo)}</span>
          <span className="fi-recado-txt">{ultimo.de === fonte.eu ? 'Seu recado' : `Recado ${/a$/i.test(ultimo.deNome.split(/\s+/)[0]) ? 'da' : 'do'} ${ultimo.deNome.split(/\s+/)[0]}`}: “{ultimo.mensagem}”</span>
          {ultimo.resposta && <span className="fi-recado-resp">“{ultimo.resposta}”</span>}
        </div>
      )}
      <div className="fi-recado-atalhos">
        {ATALHOS_RECADO.map((a) => (
          <button key={a} type="button" className="fi-fm" onClick={() => setTexto((t) => (t.trim() ? `${t.trim()} ${a}` : a))}>{a.replace(/\.$/, '')}</button>
        ))}
      </div>
      <div className="fi-recado-campo">
        <textarea className="fi-falta-in fi-recado-in" rows={2} maxLength={400} value={texto} disabled={enviando}
          placeholder={`Escreva o recado para ${nome}…`} aria-label={`Recado para ${nome}`}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void mandar(); } }} />
        <BotaoPrimario mini onClick={() => void mandar()} disabled={!texto.trim() || enviando}>Mandar recado</BotaoPrimario>
      </div>
    </section>
  );
}

/** a lista de recados do gestor (na visão Equipe): o que mandei e o que cada um fez */
function ListaRecados({ fonte, aoConversa }: { fonte: FonteRecados; aoConversa: (r: Recado) => void }) {
  const [so, setSo] = useState<'todos' | 'aguardando'>('todos');
  const lista = so === 'aguardando' ? fonte.enviados.filter((r) => estadoDoRecado(r) === 'aguardando') : fonte.enviados;
  const aguardando = fonte.enviados.filter((r) => estadoDoRecado(r) === 'aguardando').length;
  const recentes = fonte.enviados.filter((r) => r.criadoEm >= Date.now() - 7 * 86_400_000).length;
  return (
    <section className="fi-lista vidro fi-recados" aria-label="Recados para a equipe">
      <header className="fi-lista-cab">
        <h2>Recados para a equipe</h2>
        <span className="fi-lista-n">{recentes ? `${plural(recentes, 'recado', 'recados')} nos últimos 7 dias` : 'nenhum recado nos últimos 7 dias'}</span>
        <div className="fi-cab-ferr">
          <Segmentado rotulo="Mostrar" valor={so} aoMudar={(v) => setSo(v as 'todos' | 'aguardando')}
            opcoes={[{ valor: 'todos', rotulo: 'Todos' }, { valor: 'aguardando', rotulo: `Aguardando${aguardando ? ` (${aguardando})` : ''}` }]} />
        </div>
      </header>
      {lista.length ? (
        <ul className="fi-recados-lista">
          {lista.map((r) => (
            <li key={r.id} className="fi-recados-lin" data-estado={estadoDoRecado(r)}>
              <span className="fi-recados-quem"><b>{r.cliente}</b><small>{r.de !== fonte.eu ? `de ${r.deNome.split(/\s+/)[0]} ` : ''}para {r.paraNome.split(/\s+/)[0]} · {quandoFoi(r.criadoEm)}</small></span>
              <span className="fi-recados-msg" title={r.mensagem}>“{r.mensagem}”</span>
              <span className="fi-recados-est">
                <span className="fi-l1">{fraseDoEstado(r)}</span>
                {r.resposta && <span className="fi-l2 fi-elip" title={r.resposta}>“{r.resposta}”</span>}
              </span>
              <button type="button" className="fi-bt-conv" onClick={() => aoConversa(r)} aria-label={`Abrir a conversa de ${r.cliente}`} title="Abrir a conversa no WhatsApp"><IcConversa t={15} /></button>
            </li>
          ))}
        </ul>
      ) : fonte.erro && !fonte.enviados.length ? (
        <div className="fi-sec-vazio" role="alert"><b>Não deu para carregar os recados agora</b>
          <span>{fonte.erro}</span></div>
      ) : (
        <div className="fi-sec-vazio"><b>{so === 'aguardando' ? 'Ninguém está devendo resposta' : 'Nenhum recado nos últimos 7 dias'}</b>
          <span>{so === 'aguardando' ? 'Todos os recados já tiveram resposta.' : 'Para mandar um recado, abra a ficha de um cliente da equipe e escreva em “Recado para…”.'}</span></div>
      )}
    </section>
  );
}

/** a ficha do cliente — janela de vidro no meio da tela (exportada para a amostra em cards) */
export function JanelaCliente({ l, raiz, lista, aoTrocar, aoFechar, avisar, ehDono, aoMarcar, aoTirar, aoCorrigirDocs, aoTirarDaFila, abrirConversa, recado }: {
  l: Lead; raiz: HTMLElement; lista: Lead[]; aoTrocar: (id: string) => void; aoFechar: () => void;
  avisar: (t: string) => void; ehDono: boolean;
  /** o gestor olhando o cliente de outro atendente: o recado para o dono */
  recado?: { fonte: FonteRecados; para: string; paraNome: string };
  aoMarcar: (tipo: TipoMarca, texto?: string) => void; aoTirar: (id: string) => void;
  aoCorrigirDocs: (estado: 'completos' | 'incompletos' | null) => void; aoTirarDaFila: () => void;
  abrirConversa?: (l: Lead) => void;
}) {
  const marcas = l.marcas;
  const cartao = useRef<HTMLDivElement>(null);
  const info = infoCategoria(l.cat);
  const dono = atendente(l.atendente);
  const pos = lista.findIndex((x) => x.id === l.id);
  const ir = (d: number) => { const nx = lista[pos + d]; if (nx) aoTrocar(nx.id); };

  /* Esc fecha; ← → passam para o cliente anterior/seguinte da fila (menos quando está digitando) */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      if (document.querySelector('.p-modal')) return; /* a confirmação aberta é quem manda */
      if (e.key === 'Escape') aoFechar();
      else if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  });

  /* o foco entra no cartão ao abrir e ao trocar de cliente; Tab circula só aqui dentro */
  useEffect(() => {
    if (!cartao.current?.contains(document.activeElement)) cartao.current?.focus();
  }, [l.id]);
  const prenderTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focos = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
    if (!focos.length) return;
    const i = focos.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); focos[focos.length - 1].focus(); }
    else if (!e.shiftKey && (i === focos.length - 1 || i < 0)) { e.preventDefault(); focos[0].focus(); }
  };

  const copiarFone = () => {
    const d = l.fone.replace(/\D/g, '');
    const planoB = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = d; document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        avisar(ok ? `Telefone copiado: ${l.fone}` : 'Não deu para copiar aqui.');
      } catch { avisar('Não deu para copiar aqui.'); }
    };
    try { void navigator.clipboard.writeText(d).then(() => avisar(`Telefone copiado: ${l.fone}`), planoB); } catch { planoB(); }
  };
  const tempo = tempoDe(l);
  const msg = mensagemDoCliente(l.disse);
  const fatos: [string, string][] = [['Situação', ROTULO_LISTA[l.lista] ?? '—']];
  if (l.funil) fatos.push(['Coluna no Kanban', l.funil]);
  fatos.push(['Campanha', campanhaBonita(l.campanha)]);
  if (l.entrouEm) fatos.push(['Entrou no Kanban', dataHora(l.entrouEm)]);
  if (l.cat !== 'historico') {
    fatos.push(['Documento pessoal', l.docPessoal ? 'Recebido (frente e verso)' : 'Não recebido']);
    fatos.push(['Comprovante de residência', l.comprovante ? 'Recebido' : 'Não recebido']);
  }
  if (l.falta) fatos.push(['O que falta', l.falta]);
  if (l.assinadoEm) fatos.push(['Assinado (última via aprovada)', dataHora(l.assinadoEm)]);
  if (l.udoc) fatos.push(['Último documento recebido', dataHora(l.udoc)]);
  if (l.ud) fatos.push(['Última mensagem do cliente', dataHora(l.ud)]);
  if (l.nu) fatos.push(['Nossa última mensagem', dataHora(l.nu)]);
  if (l.arq != null) fatos.push(['Arquivos enviados', String(l.arq)]);
  if (l.msgs != null) fatos.push(['Mensagens nossas', String(l.msgs)]);
  if (l.planilha) fatos.push(['Atendente na planilha', l.planilha]);

  return createPortal(
    <div className="fi-veu" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="fi-modal vidro-pro" data-cat={l.cat} role="dialog" aria-modal="true" aria-label={`Cliente ${l.nome}`}
        ref={cartao} tabIndex={-1} onKeyDown={prenderTab}>
        <header className="fi-modal-cab">
          <Avatar l={l} tam={48} />
          <div className="fi-modal-quem">
            <h2>{l.nome}</h2>
            <span>
              <button type="button" className="fi-fone num" onClick={copiarFone} title="Copiar o telefone">{l.fone}<IcCopiar t={11} /></button>
              {' · '}{campanhaBonita(l.campanha)} · Cliente de {dono.nome}
            </span>
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
                <span className="fi-sit-rot">{info.rotulo}</span>
                <span className="fi-sit-val" title={l.situacao !== l.curta ? l.situacao : undefined}>{l.curta}</span>
                {tempo.t !== '—' && !l.esperandoEm && (
                  <span className="fi-sit-sub" data-alerta={tempo.alerta ? '' : undefined}>
                    <IcRelogio t={12} />{tempo.alerta ? 'Escreveu' : l.cat === 'sem_resposta' ? 'Parou' : 'Última resposta'} {tempo.t.replace(/^(escreveu|parou) /, '')}
                  </span>
                )}
              </span>
            </div>

            {l.esperandoEm && (
              <div className="fi-esperando" role="status">
                <b><i aria-hidden />Aguardando {ehDono ? 'sua ' : ''}resposta</b>
                <span>Escreveu por último e ninguém respondeu · {haQuanto(minDesde(l.esperandoEm) ?? 0)} · {dataHora(l.esperandoEm)}</span>
              </div>
            )}
            {l.novo && (
              <div className="fi-nota-aviso fi-iris-aviso" role="status">
                <IcIris t={14} />
                <span><b>{textoIris(l, ehDono, dono.nome).titulo}</b> · {haQuanto(minDesde(l.passouEm) ?? 0)}<br />{textoIris(l, ehDono, dono.nome).faca}</span>
              </div>
            )}
            {l.nota && <div className="fi-nota-aviso"><IcInfo t={14} />{l.nota}</div>}

            <section className="fi-bloco">
              <h3 className="fi-bloco-t">Andamento do atendimento</h3>
              <Caminho l={l} comQuem={ehDono ? 'Com você' : `Com ${dono.nome}`} />
            </section>

            <section className="fi-bloco fi-bloco-fim">
              <h3 className="fi-bloco-t">Última mensagem do cliente</h3>
              {msg ? (
                <div className="fi-ultima">
                  <div className="fi-bolha-cli" data-midia={msg.midia ? '' : undefined}>{msg.texto}</div>
                  {l.ud ? <span className="fi-ultima-h">{haQuanto(minDesde(l.ud) ?? 0)} · {dataHora(l.ud)}</span> : null}
                </div>
              ) : <p className="fi-conv-nota">O cliente ainda não escreveu nesta conversa.</p>}
              <p className="fi-conv-nota">A conversa completa fica no WhatsApp. Use “Abrir conversa” para responder ao cliente.</p>
            </section>
          </div>

          <div className="fi-modal-col">
            {recado && <RecadoNaFicha fonte={recado.fonte} cliente={l} para={recado.para} paraNome={recado.paraNome} avisar={avisar} />}
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
            {ehDono
              ? <><kbd className="fi-k">←</kbd> <kbd className="fi-k">→</kbd> passam pelos clientes da fila.</>
              : <>Você está vendo a fila de {dono.nome} · quem atende é {artigo(dono)} {dono.nome} · <kbd className="fi-k">←</kbd> <kbd className="fi-k">→</kbd> passam pelos clientes.</>}
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

/** visão do administrador: um cartão por atendente (quem → agora → mês → composição) */
function CartaoAtendente({ a, aoAbrir, leads, numero }: {
  a: Atendente; aoAbrir: (esperando?: boolean) => void; leads: Lead[]; numero?: NumeroAtendente | null;
}) {
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
          <span title={`Turno ${turnoTexto(a)}`}>{plural(meus.length, 'cliente', 'clientes')}</span>
        </span>
        <BotaoSec mini onClick={() => aoAbrir()}>Ver fila<IcSeta t={12} /></BotaoSec>
      </header>
      {esperando ? (
        <button type="button" className="fi-eq-agora" onClick={() => aoAbrir(true)}
          title={`Abrir a fila de ${a.nome} só com quem aguarda resposta`}
          aria-label={`Ver ${plural(esperando, 'cliente aguardando resposta', 'clientes aguardando resposta')} de ${a.nome}`}>
          <i className="fi-pt" aria-hidden /><b className="num">{esperando}</b> aguardando resposta
        </button>
      ) : (
        <span className="fi-eq-agora" data-zero>Ninguém aguardando resposta</span>
      )}
      {numero && (
        <div className="fi-eq-nums" aria-label="Recebidos, marcações e fechados no período">
          <span><b className="num">{numero.recebidos}</b>{numero.recebidos === 1 ? 'recebido' : 'recebidos'}</span>
          <span title="Marcações feitas no período"><b className="num">{numero.marcacoes ?? '—'}</b>{numero.marcacoes === 1 ? 'marcação' : 'marcações'}</span>
          <span><b className="num">{numero.fechados}</b>{numero.fechados === 1 ? 'fechado' : 'fechados'}</span>
          <span title="Taxa de fechamento: fechados ÷ recebidos no período"><b className="num">{taxa == null ? '—' : porcento(taxa)}</b>taxa</span>
        </div>
      )}
      <div className="fi-eq-linhas">
        {CATEGORIAS.map((k) => {
          const n = por(k.id);
          return (
            <div key={k.id} className="fi-eq-lin" data-cat={k.id} data-zero={n === 0 ? '' : undefined}>
              <span className="fi-eq-rot">{ROTULO_CURTO[k.id]}</span>
              <span className="fi-eq-barra" aria-hidden><i style={{ width: `${(n / maxN) * 100}%` }} /></span>
              <b className="fi-eq-n num">{n}</b>
            </div>
          );
        })}
      </div>
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
              <span className="fi-vc-op-tx"><b>{x.nome}</b><small>{plural(leads.filter((l) => l.atendente === x.id).length, 'cliente', 'clientes')} · turno {turnoTexto(x)}</small></span>
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

export default function FilaIrisTela({ fonte, usuarioId, admin: adminReal, abrirConversa, abrirInicial, aoConsumirInicial, recados, aoVerComo }: {
  fonte: FonteFila;
  /** os recados do gestor (a mesma cara na prévia e no real) */
  recados?: FonteRecados;
  /** prévia: quem está no "Ver como" (os cartões do canto acompanham) */
  aoVerComo?: (id: string) => void;
  /** o cliente (contato) que abre sozinho — o "Ver na fila" do aviso da Iris */
  abrirInicial?: string | null;
  /** o pedido foi atendido (abriu, ou o cliente não está mais na fila): a rota tira o ?cliente= */
  aoConsumirInicial?: () => void;
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
  const [busca, setBusca] = useState('');
  const [recolhidas, setRecolhidas] = useState<Categoria[]>([]);
  const campoBusca = useRef<HTMLInputElement>(null);
  const termo = busca.trim();

  /* "/" leva para a busca (fora de campos de texto e com a janela do cliente fechada) */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      if (document.querySelector('.fi-veu')) return;
      e.preventDefault();
      campoBusca.current?.focus();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

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

  const leads = useMemo(() => fonte.leads.filter((l) => l.cat !== 'historico'), [fonte.leads]);
  const daFila = useMemo(() => leads.filter((l) => l.atendente === dono), [leads, dono]);
  const base = visaoEf === 'equipe' ? leads : daFila;
  const grupos = useMemo(
    () => CATEGORIAS.map((info) => ({ info, itens: ordenarLeads(daFila.filter((l) => l.cat === info.id)) })),
    [daFila],
  );
  const passaMarca = (l: Lead) => filtroMarca === 'todas'
    || (filtroMarca === 'esperando' ? !!l.esperandoEm : l.marcas.some((m) => grupoMarca(m.tipo) === filtroMarca));
  const filtrando = filtro !== 'todas' || filtroMarca !== 'todas' || !!termo;
  /* os contadores dos filtros de marcação contam sobre a MESMA base que o clique vai mostrar */
  const baseMarca = (filtro === 'todas' ? daFila : daFila.filter((l) => l.cat === filtro)).filter((l) => passaBusca(l, termo));
  const visiveis = (filtro === 'todas' ? grupos : grupos.filter((g) => g.info.id === filtro))
    .map((g) => (filtroMarca === 'todas' && !termo ? g : { ...g, itens: g.itens.filter((l) => passaMarca(l) && passaBusca(l, termo)) }))
    .filter((g) => (filtroMarca === 'todas' && !termo) || g.itens.length > 0);
  const contaMarca = (g: GrupoMarca) => baseMarca.filter((l) => l.marcas.some((m) => grupoMarca(m.tipo) === g)).length;
  /* recolher uma seção só vale sem filtro nenhum (filtrou ou buscou, tudo o que passou aparece) */
  const recolhida = (c: Categoria) => !filtrando && recolhidas.includes(c);
  const alternarSecao = (c: Categoria) => setRecolhidas((r) => (r.includes(c) ? r.filter((x) => x !== c) : [...r, c]));
  const plana = visiveis.flatMap((g) => (recolhida(g.info.id) ? [] : g.itens));
  const quentesEquipe = useMemo(() => ordenarLeads(leads.filter((l) => l.cat === 'quente')), [leads]);
  const quentesEquipeVis = termo ? quentesEquipe.filter((l) => passaBusca(l, termo)) : quentesEquipe;
  const navegacao = visaoEf === 'equipe' ? quentesEquipeVis : plana;
  const clienteAberto = aberto ? navegacao.find((l) => l.id === aberto) : undefined;
  const total = daFila.length;
  const donoInfo = atendente(dono);

  /* troca de pessoa/visão/filtro: fecha a janela */
  useEffect(() => { setAberto(null); }, [dono, visaoEf, filtro, filtroMarca]);

  /* o aviso da Iris pediu este cliente: volta para a fila toda (sem filtro, busca nem seção recolhida), pede a
     fila fresca (ele pode ter ACABADO de entrar) e abre a ficha; se ele não estiver mais na fila, avisa. Uma vez. */
  const [pedido, setPedido] = useState<string | null>(null);
  useEffect(() => {
    if (!abrirInicial) return;
    let vivo = true;
    if (!semFilaPropria) setVisao('minha');
    setFiltro('todas'); setFiltroMarca('todas'); setBusca(''); setRecolhidas([]);
    void (async () => {
      try { await fonte.recarregar?.(); } catch { /* a fila de agora serve */ }
      if (vivo) setPedido(abrirInicial);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirInicial]);
  useEffect(() => {
    if (!pedido || fonte.carregando) return;
    /* o administrador abrindo o cliente de outra pessoa da equipe ("Abrir na fila" do WhatsApp): vai para a fila
       dela e abre a ficha lá (a ficha navega pela lista de quem é o cliente) */
    const lead = leads.find((l) => l.id === pedido);
    if (lead && admin && lead.atendente !== dono && EQUIPE.some((a) => a.id === lead.atendente)) { abrirFilaDe(lead.atendente); return; }
    const achou = daFila.some((l) => l.id === pedido);
    if (achou && !navegacao.some((l) => l.id === pedido)) return; /* o filtro ainda está saindo: espera um render */
    if (achou) setAberto(pedido);
    else avisar(admin ? 'Este cliente não está na Fila da Iris agora.' : 'Este cliente não está na sua fila agora.');
    setPedido(null);
    aoConsumirInicial?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, daFila, navegacao, fonte.carregando]);

  const limparFiltros = () => { setFiltro('todas'); setFiltroMarca('todas'); setBusca(''); setRecolhidas([]); };
  const trocarVerComo = (id: string) => { setVerComo(id); setVisao('minha'); limparFiltros(); aoVerComo?.(id); };
  const abrirFilaDe = (id: string, esperando = false) => {
    if (id === verComo && !semFilaPropria) setVisao('minha'); else { setAlvo(id); setVisao('de'); }
    limparFiltros();
    if (esperando) setFiltroMarca('esperando');
  };
  const n = filtrando ? visiveis.reduce((t, g) => t + g.itens.length, 0) : total;
  const fecharJanela = () => {
    const id = aberto;
    setAberto(null);
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`.fi-lin[data-id="${id}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      el?.focus();
    });
  };
  const conversa = (l: Lead) => (abrirConversa ? abrirConversa(l) : avisar(`Prévia: aqui abre a conversa de ${doisNomes(l.nome)} no WhatsApp.`));

  /* os números do topo: na fila de alguém, os da pessoa; na Equipe, a soma do período escolhido */
  /* marcações: o banco conta (fila_iris_marcacoes_numeros); sem ele (demonstração, prévia), as da fila carregada feitas hoje */
  const marcasLocaisHoje = (quem: string | null) => {
    const ini = inicioDeHoje();
    return leads.filter((l) => quem == null || l.atendente === quem).reduce((t, l) => t + l.marcas.filter((m) => m.em >= ini).length, 0);
  };
  const comMarcas = (n: NumeroAtendente | null, p: Periodo): NumeroAtendente | null => (n && n.marcacoes == null && p === 'hoje'
    ? { ...n, marcacoes: marcasLocaisHoje(n.atendente === 'equipe' ? null : n.atendente) } : n);
  const somar = (l: NumeroAtendente[] | null): NumeroAtendente | null => (l && l.length
    ? l.reduce((t, x) => ({ atendente: 'equipe', recebidos: t.recebidos + x.recebidos, fechados: t.fechados + x.fechados,
      marcacoes: t.marcacoes == null || x.marcacoes == null ? undefined : t.marcacoes + x.marcacoes }),
    { atendente: 'equipe', recebidos: 0, fechados: 0, marcacoes: 0 } as NumeroAtendente)
    : null);
  const daPessoa = (p: Periodo) => comMarcas(fonte.numeros(p)?.find((x) => x.atendente === dono) ?? null, p);
  const taxaTxt = (n: NumeroAtendente | null) => (n && n.recebidos ? porcento((n.fechados / n.recebidos) * 100) : '—');
  const linhaMes = (n: NumeroAtendente | null) => (n ? `mês da casa: ${plural(n.recebidos, 'recebido', 'recebidos')} · ${plural(n.fechados, 'fechado', 'fechados')} · taxa ${taxaTxt(n)}` : null);
  /* dono 12/11: "a gente precisa saber quantos clientes a gente recebeu, quantas marcações a gente fez no dia" —
     na fila de alguém, o DIA na frente e o mês da casa embaixo; na Equipe, o período escolhido e a taxa */
  const numerosPainel: NumerosPainel | null = visaoEf === 'equipe'
    ? (fonte.numeros(periodo) ? {
      titulo: 'Equipe', nota: ({ hoje: 'hoje', '7d': '7 dias', mes: 'mês da casa', mes_ant: 'mês passado' } as const)[periodo],
      per: comMarcas(somar(fonte.numeros(periodo)), periodo), sub: `taxa de fechamento ${taxaTxt(somar(fonte.numeros(periodo)))}`,
    } : null)
    : (daPessoa('hoje') || daPessoa('mes') ? {
      titulo: visaoEf === 'de' ? `Números de ${donoInfo.nome}` : 'Meus números', nota: 'hoje',
      per: daPessoa('hoje'), sub: linhaMes(daPessoa('mes')),
    } : null);

  /* ↑ e ↓ passam o foco de linha em linha (vale para a Minha fila e para os quentes da Equipe) */
  const teclasRolo = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    const linhas = [...e.currentTarget.querySelectorAll<HTMLElement>('.fi-lin')];
    const i = linhas.indexOf(document.activeElement as HTMLElement);
    (linhas[i + (e.key === 'ArrowDown' ? 1 : -1)] ?? linhas[i < 0 ? 0 : i])?.focus();
  };

  /* a busca do cabeçalho da fila (na Equipe ela varre só os quentes, e o texto avisa) */
  const buscaDica = visaoEf === 'equipe' ? 'Buscar nos clientes quentes (nome ou telefone)' : 'Buscar pelo nome ou pelo telefone';
  const campoDeBusca = (
    <label className="fi-busca" title={`${buscaDica} · atalho: /`}>
      <IcBusca t={14} />
      <input ref={campoBusca} value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder={visaoEf === 'equipe' ? 'Buscar nos quentes' : 'Nome ou telefone'}
        aria-label={buscaDica}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setBusca(''); e.currentTarget.blur(); }
          else if (e.key === 'Enter' && termo && navegacao[0]) { setAberto(navegacao[0].id); e.currentTarget.blur(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector<HTMLElement>('.fi-lin')?.focus(); }
        }} />
      {busca ? <button type="button" className="fi-busca-x" onClick={() => { setBusca(''); campoBusca.current?.focus(); }} aria-label="Limpar a busca"><IcX t={10} /></button>
        : <kbd className="fi-busca-k" aria-hidden>/</kbd>}
    </label>
  );

  return (
    <div className="fi">
      <header className="fi-cab">
        <div className="fi-cab-tx">
          <h1>Fila da Iris</h1>
          <p className="fi-cab-sub">
            {visaoEf !== 'equipe' && (
              <>
                <span className="fi-cab-quem"><AvatarAtendente a={donoInfo} tam={18} />{donoInfo.nome} · turno {turnoTexto(donoInfo)}</span>
                <span className="fi-sep" aria-hidden>·</span>
              </>
            )}
            <span className="num">{fonte.carregando && !leads.length ? 'carregando…' : visaoEf === 'equipe' ? `${leads.length} clientes na equipe` : plural(total, 'cliente', 'clientes')}</span>
            <span className="fi-sep" aria-hidden>·</span>
            <span>{fonte.rotulo}</span>
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
              aoMudar={(v) => { setVisao(v); limparFiltros(); }}
              opcoes={[{ valor: 'minha', rotulo: 'Minha fila' }, { valor: 'equipe', rotulo: 'Equipe' }]} />
          )}
        </div>
      </header>

      {comoFunciona && (
        <div className="fi-como vidro" role="region" aria-label="Como a fila funciona">
          <div className="fi-como-cols">
            {CATEGORIAS.map((k) => (
              <div key={k.id} className="fi-como-it" data-cat={k.id}>
                <span className="fi-como-t">{k.rotulo}</span>
                <span>{k.entra}</span>
              </div>
            ))}
          </div>
          <p className="fi-como-pe">
            Cada atendente vê os clientes que o robô distribuiu para ele, como hoje. A fila se organiza sozinha pelo andamento do atendimento.
            Quando o administrativo fecha o cliente, ele sai da fila e vai para a aba Fechados. Cliente no Remarketing não entra.
            Cliente que a Iris acabou de passar chega com o aviso "A Iris passou para você" e fica no topo da seção por 24 horas.
            Clique numa prioridade do topo para filtrar e no título de uma seção para recolher.
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

      <Painel base={base} minha={visaoEf === 'minha'} filtro={visaoEf === 'equipe' ? 'todas' : filtro}
        aoFiltrar={visaoEf === 'equipe' ? undefined : (c) => setFiltro((f) => (f === c ? 'todas' : c))}
        esperandoAtivo={visaoEf !== 'equipe' && filtroMarca === 'esperando'}
        aoEsperando={visaoEf === 'equipe' ? undefined : () => setFiltroMarca((f) => (f === 'esperando' ? 'todas' : 'esperando'))}
        numeros={numerosPainel} />

      {visaoEf === 'equipe' ? (
        <div className="fi-equipe">
          {fonte.numeros(periodo) && (
            <div className="fi-eq-barra-per">
              <h2 className="fi-eq-h2">Por atendente</h2>
              <span className="fi-eq-per-rot">Recebidos, marcações e fechados</span>
              <Segmentado rotulo="Período dos números" valor={periodo} aoMudar={setPeriodo}
                opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: '7d', rotulo: '7 dias' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'mes_ant', rotulo: 'Mês passado' }]} />
              <span className="fi-eq-per-nota">{textoPeriodo(periodo)} · recebidos = distribuídos pelo robô · marcações = feitas na fila · fechados = placar do CAF · taxa = fechados ÷ recebidos</span>
            </div>
          )}
          <div className="fi-eq-grade">
            {EQUIPE.map((a) => (
              <CartaoAtendente key={a.id} a={a} aoAbrir={(esp) => abrirFilaDe(a.id, esp)} leads={leads}
                numero={fonte.numeros(periodo)?.find((x) => x.atendente === a.id) ?? null} />
            ))}
          </div>
          {recados && admin && (
            <ListaRecados fonte={recados} aoConversa={(r) => {
              const l = leads.find((x) => x.id === r.contatoId);
              if (l) conversa(l);
              else if (abrirConversa) abrirConversa({ conversaId: r.conversaId, nome: r.cliente } as Lead);
              else avisar(`Prévia: aqui abre a conversa de ${r.cliente} no WhatsApp.`);
            }} />
          )}
          <section className="fi-lista vidro fi-lista-eq">
            <header className="fi-lista-cab">
              <h2>Clientes quentes da equipe</h2>
              <span className="fi-lista-n">{plural(quentesEquipeVis.length, 'cliente', 'clientes')}</span>
              <div className="fi-cab-ferr">{campoDeBusca}</div>
            </header>
            <Colunas ultima="Atendente · campanha" />
            <div className="fi-rolo-eq" onKeyDown={teclasRolo}>
              {quentesEquipeVis.map((l) => (
                <Linha key={l.id} l={l} ativo={l.id === aberto} mostrarDono destacar={termo} aoAbrir={() => setAberto(l.id)} aoConversa={() => conversa(l)} />
              ))}
              {!quentesEquipeVis.length && (
                <div className="fi-sec-vazio"><b>{termo ? `Nenhum cliente quente com “${termo}”` : 'Nenhum cliente quente na equipe'}</b></div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="fi-lista vidro fi-lista-cheia">
          <header className="fi-lista-cab">
            <h2>{filtro !== 'todas' ? infoCategoria(filtro).rotulo : filtroMarca === 'esperando' ? 'Aguardando resposta' : visaoEf === 'de' ? `Fila de ${donoInfo.nome}` : 'Minha fila'}</h2>
            <span className="fi-lista-n">{fonte.carregando && !leads.length ? 'carregando…' : plural(n, 'cliente', 'clientes')}{filtrando && n !== total ? ` de ${total}` : ''}</span>
            {filtrando && (
              <button type="button" className="fi-limpar" onClick={limparFiltros}>Limpar filtro<IcX t={10} /></button>
            )}
            <div className="fi-cab-ferr">
              <div className="fi-filtro-marca" role="group" aria-label="Filtrar pelas marcações">
                {GRUPOS_MARCA.map((g) => {
                  const c = contaMarca(g.id);
                  return (
                    <button key={g.id} type="button" className="fi-fm" data-grupo={g.id} aria-pressed={filtroMarca === g.id}
                      disabled={!c && filtroMarca !== g.id}
                      onClick={() => setFiltroMarca((f) => (f === g.id ? 'todas' : g.id))}
                      title={filtroMarca === g.id ? 'Mostrar todos de novo' : c ? `Mostrar só quem está marcado: ${g.filtro}` : `Ninguém marcado: ${g.filtro}`}>
                      {g.id === 'ligacao' ? <IcTelefone t={12} /> : g.id === 'inss' ? <IcChave t={12} /> : <IcDoc t={12} />}
                      {g.filtro}{c > 0 && <b className="num">{c}</b>}
                    </button>
                  );
                })}
              </div>
              {campoDeBusca}
            </div>
          </header>
          <Colunas />
          <div className="fi-rolo" onKeyDown={teclasRolo}>
            {fonte.carregando && !leads.length ? (
              <div className="fi-carregando" role="status"><span className="fi-carregando-pt" aria-hidden />Carregando a fila…</div>
            ) : !visiveis.length ? (
              <div className="fi-sec-vazio fi-vazio-geral">
                <b>{termo ? `Nenhum cliente com “${termo}”` : 'Nenhum cliente neste filtro'}</b>
                <span>{termo ? 'Confira o nome ou digite só uma parte do telefone.' : 'Tire o filtro para ver a fila toda.'}</span>
                <button type="button" className="fi-link" onClick={limparFiltros}>Mostrar a fila toda</button>
              </div>
            ) : visiveis.map(({ info, itens }) => {
              const fechada = recolhida(info.id);
              const ag = itens.filter((l) => l.esperandoEm).length;
              const novos = info.id === 'historico' ? 0 : itens.filter((l) => l.novo).length;
              return (
                <div key={info.id} className="fi-grupo" data-cat={info.id} data-recolhida={fechada ? '' : undefined}>
                  <button type="button" className="fi-sec" aria-expanded={!fechada}
                    onClick={() => { if (!filtrando) alternarSecao(info.id); }}
                    title={filtrando ? 'Com filtro ou busca, todas as seções ficam abertas' : fechada ? 'Mostrar os clientes desta seção' : 'Recolher esta seção'}>
                    <span className="fi-sec-seta" aria-hidden><IcBaixo t={11} /></span>
                    <span className="fi-sec-t">{info.rotulo}</span>
                    <span className="fi-sec-n num">{itens.length}</span>
                    {novos > 0 && <span className="fi-sec-ag fi-sec-novo" title="A Iris passou nas últimas 24 horas; ficam no topo"><IcIris t={11} />{novos} da Iris agora</span>}
                    {ag > 0 && <span className="fi-sec-ag"><i className="fi-pt" aria-hidden />{ag} aguardando {visaoEf === 'minha' ? 'sua ' : ''}resposta</span>}
                    <span className="fi-sec-regra" title={`Ordem: ${info.regra}`}>{info.resumo}</span>
                  </button>
                  {!fechada && (itens.length ? itens.map((l) => (
                    <Linha key={l.id} l={l} ativo={l.id === aberto} sua={visaoEf === 'minha'} destacar={termo} semCanal aoAbrir={() => setAberto(l.id)} aoConversa={() => conversa(l)} />
                  )) : (
                    <div className="fi-sec-vazio"><b>{info.vazioT}</b><span>{info.vazio}</span></div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {raiz && clienteAberto && (
        <JanelaCliente l={clienteAberto} raiz={raiz} lista={navegacao} aoTrocar={setAberto}
          aoFechar={fecharJanela} avisar={avisar} ehDono={meuId != null && meuId === clienteAberto.atendente}
          abrirConversa={conversa}
          recado={recados && admin && !(meuId != null && meuId === clienteAberto.atendente)
            /* só para um dono da equipe da fila (cliente sem dono ou fora dela: não há para quem mandar) */
            && EQUIPE.some((a) => a.id === clienteAberto.atendente)
            ? { fonte: recados, para: real ? atendente(clienteAberto.atendente).uid : clienteAberto.atendente, paraNome: atendente(clienteAberto.atendente).nome }
            : undefined}
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
          mensagem={tirando ? `${tirando.nome} sai da ${atendente(tirando.atendente).id === meuId ? 'sua fila' : `fila de ${atendente(tirando.atendente).nome}`}. A conversa e o card continuam como estão no WhatsApp e no Kanban.` : ''}
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
