/* Pendências — editor da SEQUÊNCIA (1ª mensagem + lembretes até o cliente responder).
   3 áreas: trilho de envios | o envio escolhido (blocos: texto, áudio gravado na
   hora, imagem, documento, vídeo, com variáveis) | prévia no celular do cliente.
   Peça compartilhada por: Nova pendência, Mensagens prontas, "Mudar lembretes"
   e "Mandar agora" (este sem trilho). */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { AudioRecorderV2, BotaoSec } from '../../components';
import {
  EXT_DOC, MAX_BLOCOS, MAX_ENVIOS, MAX_TEXTO, ROTULO_BLOCO, VARIAVEIS, extDe, mmss, nomeBonito, novoBloco, novoId,
  preencher, primeiroNomeMsg, quandoCurto,
  type Bloco, type ClienteFechado, type Passo, type TipoBloco,
} from '@/data/pendencias';
import { barras, cap, hhmmAgora, hhmmDe, paraBanco, paraTela, pedacosComVariaveis, tamanhoBR, telefoneIntl, tiposDe } from './exibir';
import { IcEnviar, IcLixo, IcMais, IcPessoa, IcPlay, IcSubir, IcTipo, IcVoltar, IcX } from './icones';

const TIPOS: TipoBloco[] = ['texto', 'audio', 'imagem', 'documento', 'video'];

export interface CtxPrevia {
  cliente: ClienteFechado; oQue: string; prazo?: string; processo?: string; atendente: string;
  /** nome interno do número que manda (só para os textos do Atenvo) */
  remetente: string;
  /** telefone do número que manda: é o que o cliente vê no topo da conversa */
  telefone?: string;
}
export type Subir = (blob: Blob, nome: string, tipo: TipoBloco) => Promise<Partial<Bloco>>;

/** '' quando o envio está pronto; senão, a frase do que falta.
 *  Com `ctx` (cliente de verdade), também recusa texto que fica VAZIO depois das variáveis
 *  (ex.: só "{prazo}" sem prazo) — o servidor não teria o que mandar. */
export function blocosProntos(bs: Bloco[], ctx?: Omit<CtxPrevia, 'remetente'>): string {
  if (!bs.length) return 'Adicione uma mensagem.';
  if (bs.length > MAX_BLOCOS) return `Máximo de ${MAX_BLOCOS} itens por envio.`;
  for (const b of bs) {
    const tx = (b.texto ?? '').trim();
    if (b.tipo === 'texto' && !tx) return 'Escreva a mensagem.';
    if (tx.length > MAX_TEXTO) return 'Texto longo demais (máximo 4.096 caracteres).';
    if (b.tipo === 'texto' && ctx && !preencher(tx, ctx).trim()) return 'A mensagem fica vazia sem o prazo ou o nº do processo.';
    if (b.tipo !== 'texto' && !b.arquivoNome) return b.tipo === 'audio' ? 'Grave ou escolha o áudio.' : 'Escolha o arquivo.';
    if (b.tipo !== 'texto' && b.subindo) return 'Espere o arquivo terminar de subir.';
  }
  return '';
}
/** a régua inteira (limite de envios do servidor + cada envio) */
export function reguaPronta(ps: Passo[], ctx?: Omit<CtxPrevia, 'remetente'>): string {
  if (ps.length > MAX_ENVIOS) return `Máximo de ${MAX_ENVIOS} envios.`;
  return ps.map((p) => blocosProntos(p.blocos, ctx)).find(Boolean) ?? '';
}

/** Esc nas telas cheias. Ignora se há ModalV2/Confirm por cima (.veu trata o próprio Esc), durante gravação de áudio, ou se desligado (ocupado). */
export function useEscFecha(acao: () => void, ligado = true) {
  const ref = useRef(acao);
  useEffect(() => { ref.current = acao; });
  useEffect(() => {
    if (!ligado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('.veu')) return;
      if ((e.target as Element | null)?.closest?.('.pd-grav, .pd-menu-w')) return;
      e.preventDefault();
      ref.current();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [ligado]);
}

/** contarDe: 'primeira' = dias contados da 1ª mensagem; 'hoje' = a partir de hoje ("Voltar a lembrar") */
export function rotuloPasso(p: Passo, i: number, soLembretes = false, inicio?: string, contarDe: 'primeira' | 'hoje' = 'primeira') {
  if (i === 0 && !soLembretes) return inicio ? cap(quandoCurto(inicio)) : p.hora === 'agora' ? 'Agora' : `Às ${p.hora}`;
  const d = contarDe === 'hoje' ? (p.dia === 1 ? 'Amanhã' : `Em ${p.dia} dias`) : p.dia === 1 ? '1 dia depois' : `${p.dia} dias depois`;
  return `${d} · ${p.hora}`;
}

export function EditorRegua({
  passos, aoMudar, ctx, soLembretes, semLembretes, extraEsquerda, notaTrilho, notaPe, avisar, subir, inicio, numeroInicial = 1,
  contarDe = 'primeira', rotuloBase, rotuloUnico = 'Primeira mensagem', rotuloPrevia, saiTexto,
}: {
  passos: Passo[];
  /** Nova pendência: quando a 1ª sai de verdade (agendada ou fora do horário), ISO. Sem = "agora". */
  inicio?: string;
  /** soLembretes: número do 1º item da lista (continua a contagem do painel) */
  numeroInicial?: number;
  /** de onde contam os dias dos lembretes */
  contarDe?: 'primeira' | 'hoje';
  /** troca o "depois da primeira" (ex.: "depois de 08/10", quando o servidor conta de outro dia) */
  rotuloBase?: string;
  /** real: sobe o arquivo na hora (áudio vira OGG/Opus) */
  subir?: Subir;
  /** mensagem avulsa: um envio só, sem lembretes (sem trilho) */
  semLembretes?: boolean;
  /** nome do envio único (sem trilho). Padrão "Primeira mensagem"; Mandar agora usa "Mensagem". */
  rotuloUnico?: string;
  /** rótulo acima do celular. Padrão "Como {primeiro nome} vê"; Mensagem pronta usa um cliente de exemplo */
  rotuloPrevia?: string;
  /** selo do envio único quando ele NÃO sai na hora (envios desligados, número caído, fora do horário).
   *  Nunca dizer "Sai assim que você enviar" quando nada sai. */
  saiTexto?: string;
  aoMudar: (p: Passo[]) => void;
  ctx: CtxPrevia;
  /** true = todos os itens são lembretes (não existe "1ª mensagem") */
  soLembretes?: boolean;
  /** topo do trilho: "Mensagem pronta" (Nova) ou "Tipo de pedido" (modelo) */
  extraEsquerda?: ReactNode;
  /** linha discreta no topo do trilho (ex.: "Já saíram 2 mensagens") */
  notaTrilho?: string;
  /** troca a nota do pé do trilho (padrão: os lembretes param quando o cliente responde) */
  notaPe?: string;
  avisar: (t: string) => void;
}) {
  const [sel, setSel] = useState(passos[0]?.id ?? '');
  const idx = Math.max(0, passos.findIndex((p) => p.id === sel));
  const passo = passos[idx];
  const ehPrimeiro = idx === 0 && !soLembretes;
  const unico = !!semLembretes || ehPrimeiro;

  /* sempre sobre o estado MAIS NOVO (o upload termina depois de outras edições) */
  const atual = useRef(passos); atual.current = passos;
  const mudarPasso = (f: (p: Passo) => Passo) => { const id = passo?.id; aoMudar(atual.current.map((p) => (p.id === id ? f(p) : p))); };
  const mudarBloco = (bid: string, f: (b: Bloco) => Bloco) => {
    const prox = atual.current.map((p) => ({ ...p, blocos: p.blocos.map((x) => (x.id === bid ? f(x) : x)) }));
    atual.current = prox; aoMudar(prox);
  };
  const mudarBlocos = (f: (b: Bloco[]) => Bloco[]) => mudarPasso((p) => ({ ...p, blocos: f(p.blocos) }));
  const addPasso = () => {
    const ult = passos[passos.length - 1];
    const np: Passo = { id: novoId('p'), dia: ult ? Math.max(1, ult.dia + 2) : 1, hora: '09:00', blocos: [novoBloco('texto')] };
    aoMudar([...passos, np]);
    setSel(np.id);
  };
  const excluirPasso = () => {
    const resto = passos.filter((_, i) => i !== idx);
    aoMudar(resto);
    setSel((resto[idx] ?? resto[idx - 1])?.id ?? '');
  };
  const titulo = (i: number) => (i === 0 && !soLembretes ? rotuloUnico : `Lembrete ${soLembretes ? numeroInicial + i : i}`);
  const podeExcluir = !unico && (passos.length > 1 || !!soLembretes);
  const hora = unico ? (inicio ? hhmmDe(inicio) : hhmmAgora()) : passo?.hora ?? '';
  const legenda = !passo ? '' : unico ? (inicio ? cap(quandoCurto(inicio).replace(/ \d\d:\d\d$/, '')) : 'Hoje') : rotuloPasso(passo, idx, soLembretes, inicio, contarDe);

  return (
    <div className="pd-regua" data-so-um={semLembretes ? '' : undefined}>
      {!semLembretes && (
        <nav className="pd-trilho" aria-label="Envios">
          {extraEsquerda && <div className="pd-trilho-topo">{extraEsquerda}</div>}
          <div className="pd-trilho-cab">
            <span className="pd-trilho-rot">Envios</span>
            {notaTrilho && <span className="pd-trilho-cab-nota">{notaTrilho}</span>}
          </div>
          {passos.length > 0 && (
            <ol className="pd-trilho-l">
              {passos.map((p, i) => {
                const falta = blocosProntos(p.blocos, ctx);
                const tipos = tiposDe(p.blocos);
                const atualP = p.id === passo?.id;
                return (
                  <Fragment key={p.id}>
                    {i === 1 && !soLembretes && <li className="pd-trilho-sep" aria-hidden>Se não responder</li>}
                    <li>
                      <button type="button" className="pd-pi" aria-current={atualP ? 'step' : undefined} onClick={() => setSel(p.id)}
                        title={falta && !atualP ? falta : undefined}>
                        <span className="pd-pi-pt" aria-hidden />
                        <span className="pd-pi-tx">
                          <span className="pd-pi-t">{titulo(i)}</span>
                          {/* o que vai no envio fica junto do horário (na borda direita, os ícones pareciam alça de arrastar) */}
                          <span className="pd-pi-s num">
                            <span>{rotuloPasso(p, i, soLembretes, inicio, contarDe)}</span>
                            {/* até 3 tipos, os ícones; com 4 ou 5, dois ícones e "+N" (a linha não passa da largura de 3) */}
                            {tipos.length > 0 && (
                              <span className="pd-pi-ics" aria-hidden>
                                {tipos.slice(0, tipos.length > 3 ? 2 : 3).map((t) => <IcTipo key={t} tipo={t} t={12} />)}
                                {tipos.length > 3 && <span>+{tipos.length - 2}</span>}
                              </span>
                            )}
                          </span>
                        </span>
                        {/* a coluna da direita é só do sinal de "falta algo" */}
                        <span className="pd-pi-dir" aria-hidden>{falta && !atualP && <i className="pd-pi-falta" />}</span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          )}
          {passos.length < MAX_ENVIOS
            ? <button type="button" className="pd-trilho-add" onClick={addPasso}><IcMais t={14} />Adicionar lembrete</button>
            : <p className="pd-trilho-nota">Máximo de {MAX_ENVIOS} envios.</p>}
          {!soLembretes && passos.length > 0 && <p className="pd-trilho-nota">{notaPe ?? 'Os lembretes param sozinhos quando o cliente responde.'}</p>}
        </nav>
      )}

      <section className="pd-envio-ed" aria-label="Envio">
        {passo ? (
          <div className="pd-envio-in">
            <div className="pd-quando">
              <h3 className="pd-quando-tit">{semLembretes ? rotuloUnico : titulo(idx)}</h3>
              {unico ? (
                <span className="pd-selo" data-tom={saiTexto ? 'ambar' : 'neutro'}><IcEnviar t={12} />{saiTexto ?? (inicio && !semLembretes ? `Sai ${quandoCurto(inicio)}` : 'Sai assim que você enviar')}</span>
              ) : (
                <span className="pd-quando-regra">
                  <span>Sai</span>
                  <input className="inp pd-quando-dia" type="number" min={1} max={60} value={passo.dia} aria-label="Dias depois"
                    onChange={(e) => mudarPasso((p) => ({ ...p, dia: Math.max(1, Math.min(60, Number(e.target.value) || 1)) }))} />
                  <span>{passo.dia === 1 ? 'dia' : 'dias'} {contarDe === 'hoje' ? 'a partir de hoje' : rotuloBase ?? 'depois da primeira'}, às</span>
                  <input className="inp pd-quando-hora" type="time" value={passo.hora} aria-label="Hora do lembrete"
                    onChange={(e) => mudarPasso((p) => ({ ...p, hora: e.target.value || p.hora }))} />
                </span>
              )}
              {podeExcluir && (
                <button type="button" className="pd-icb pd-icb-perigo pd-quando-x" onClick={excluirPasso} aria-label="Excluir este lembrete" title="Excluir este lembrete">
                  <IcLixo />
                </button>
              )}
            </div>

            {passo.blocos.length === 0 && <p className="pd-envio-vz">Este envio ainda não tem mensagem. Adicione um texto, um áudio ou um arquivo.</p>}
            {passo.blocos.map((b, k) => (
              <EditorBloco key={b.id} b={b} n={k + 1} avisar={avisar} subir={subir}
                varsPadrao={b.id === passo.blocos.find((x) => x.tipo === 'texto')?.id}
                aoMudar={(f) => mudarBloco(b.id, f)}
                aoRemover={() => mudarBlocos((bs) => bs.filter((x) => x.id !== b.id))} />
            ))}
            {passo.blocos.length < MAX_BLOCOS ? (
              <div className="pd-add" role="group" aria-label="Adicionar ao envio">
                <span>Adicionar</span>
                {TIPOS.map((t) => (
                  <button key={t} type="button" className="pd-add-b" onClick={() => mudarBlocos((bs) => [...bs, novoBloco(t)])}>
                    <IcTipo tipo={t} />{ROTULO_BLOCO[t]}
                  </button>
                ))}
              </div>
            ) : <p className="pd-envio-vz">Máximo de {MAX_BLOCOS} itens por envio.</p>}
          </div>
        ) : (
          <div className="pd-vazio">
            <span className="pd-vazio-ic"><IcEnviar t={22} /></span>
            <b>Nenhum lembrete</b>
            <p>Sem lembretes, se o cliente não responder, a pendência vai para “Sem resposta” no dia seguinte.</p>
          </div>
        )}
      </section>

      <aside className="pd-previa" aria-label="Prévia">
        <span className="pd-previa-rot">{rotuloPrevia ?? `Como ${primeiroNomeMsg(ctx.cliente.nome) || 'o cliente'} vê`}</span>
        <Celular ctx={ctx} blocos={passo?.blocos ?? []} legenda={legenda} hora={hora} />
      </aside>
    </div>
  );
}

/* ============================ um bloco ============================ */
function EditorBloco({ b, n, aoMudar, aoRemover, avisar, subir, varsPadrao }: {
  b: Bloco; n: number; aoMudar: (f: (b: Bloco) => Bloco) => void; aoRemover: () => void; avisar: (t: string) => void; subir?: Subir;
  /** sem nenhum texto em edição, a barra "Inserir" aparece neste bloco */
  varsPadrao?: boolean;
}) {
  /* real: sobe já; demo: guarda só o nome */
  async function guardar(blob: Blob, nome: string, dur?: number) {
    if (!subir) { aoMudar((x) => ({ ...x, arquivoNome: nome, duracaoSeg: dur, tamanho: blob.size })); return true; }
    aoMudar((x) => ({ ...x, arquivoNome: nome, duracaoSeg: dur, subindo: true, storagePath: undefined }));
    try {
      const up = await subir(blob, nome, b.tipo);
      aoMudar((x) => ({ ...x, ...up, duracaoSeg: dur, subindo: false }));
      return true;
    } catch (e) {
      aoMudar((x) => ({ ...x, arquivoNome: undefined, subindo: false }));
      avisar(`Não deu para subir o arquivo: ${(e as Error)?.message ?? 'erro'}`);
      return false;
    }
  }
  /* regravar: mostra o gravador por cima do áudio que já existe (o atual só some quando o novo for usado) */
  const [regravar, setRegravar] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const grav = useRef<HTMLDivElement>(null);
  /* "Regravar" já começa a gravar (1 clique): aciona o botão do gravador do sistema */
  useEffect(() => {
    if (!regravar) return;
    grav.current?.querySelector<HTMLButtonElement>('button[title="Gravar áudio"]')?.click();
  }, [regravar]);
  /* player do gravador sem o menu de três pontos do navegador (baixar / velocidade não servem aqui).
     Só neste bloco, por atributo no <audio>: o componente compartilhado não muda. */
  useEffect(() => {
    const el = grav.current; if (!el) return;
    const LISTA = 'nodownload noplaybackrate noremoteplayback';
    const ajustar = () => el.querySelectorAll('audio').forEach((a) => {
      if (a.getAttribute('controlslist') === LISTA) return;
      a.setAttribute('controlslist', LISTA);
      a.disableRemotePlayback = true;
    });
    ajustar();
    const mo = new MutationObserver(ajustar);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [b.tipo, b.arquivoNome, regravar]);
  const aceita = b.tipo === 'imagem' ? 'image/jpeg,image/png,image/webp,image/gif' : b.tipo === 'video' ? 'video/*' : b.tipo === 'audio' ? 'audio/*' : EXT_DOC.map((e) => '.' + e).join(',');
  async function usarGravacao(blob: Blob) {
    const dur = await duracao(blob);
    const h = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
    setRegravar(false);
    const ok = await guardar(blob, `gravacao_${h}.ogg`, dur);
    if (ok) avisar(subir ? 'Áudio pronto.' : 'Áudio pronto. Na demonstração, ele não é salvo de verdade.');
  }
  const escolher = () => arq.current?.click();
  const midia = b.tipo !== 'texto' && b.tipo !== 'audio';
  const dica = b.tipo === 'documento' ? 'PDF, Word, Excel ou ZIP' : b.tipo === 'imagem' ? 'Foto JPG ou PNG' : 'Vídeo até 16 MB';
  const meta = b.tipo === 'video'
    ? [b.duracaoSeg ? mmss(b.duracaoSeg) : '', tamanhoBR(b.tamanho)].filter(Boolean).join(' · ')
    : [b.tipo === 'documento' ? extDe(b.arquivoNome ?? '').toUpperCase() : '', tamanhoBR(b.tamanho)].filter(Boolean).join(' · ');
  /* variável entra onde está o cursor; sem cursor no campo, entra no fim */
  const area = useRef<HTMLTextAreaElement>(null);
  /* posição do cursor depois de inserir: aplicada no commit (antes da próxima tecla), não num frame depois */
  const cursor = useRef<number | null>(null);
  const inserir = (chave: string) => {
    const el = area.current;
    const vis = paraTela(b.texto ?? '');
    const foco = !!el && document.activeElement === el;
    const ini = foco ? el.selectionStart : vis.length;
    const fim = foco ? el.selectionEnd : vis.length;
    const ins = !foco && vis && !/\s$/.test(vis) ? ` ${paraTela(chave)}` : paraTela(chave);
    const novo = vis.slice(0, ini) + ins + vis.slice(fim);
    cursor.current = ini + ins.length;
    aoMudar((x) => ({ ...x, texto: paraBanco(novo) }));
  };
  return (
    <div className="pd-bloco" data-tipo={b.tipo} data-vars={b.tipo === 'texto' && varsPadrao ? '' : undefined}>
      <div className="pd-bloco-cab">
        <IcTipo tipo={b.tipo} /><span className="pd-bloco-rot">{ROTULO_BLOCO[b.tipo]}</span>
        {b.tipo === 'texto' && (
          <div className="pd-vars" role="group" aria-label="Inserir no texto">
            <span>Inserir</span>
            {VARIAVEIS.map((v) => (
              <button key={v.chave} type="button" className="pd-var" onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(v.chave)}
                title={`Entra no texto como ${paraTela(v.chave)}`}>{v.rotulo}</button>
            ))}
          </div>
        )}
        <button type="button" className="pd-x" onClick={aoRemover} aria-label={`Remover ${ROTULO_BLOCO[b.tipo].toLowerCase()} ${n}`} title="Remover"><IcX /></button>
      </div>

      {b.tipo === 'texto' && <AreaTexto areaRef={area} cursor={cursor} valor={b.texto ?? ''} aoMudar={(v) => aoMudar((x) => ({ ...x, texto: v }))} />}

      {b.tipo === 'audio' && (b.arquivoNome && !regravar ? (
        <>
          <div className="pd-arq">
            <span className="pd-arq-ic"><IcTipo tipo="audio" t={16} /></span>
            <span className="pd-onda" aria-hidden>{barras(b.arquivoNome, 72).map((h, i) => <i key={i} style={{ height: h }} />)}</span>
            <span className="pd-arq-dur num">{b.subindo ? 'subindo…' : b.duracaoSeg ? mmss(b.duracaoSeg) : ''}</span>
            <span className="pd-arq-acoes">
              <BotaoSec mini onClick={() => setRegravar(true)} disabled={b.subindo}><IcTipo tipo="audio" t={13} />Regravar</BotaoSec>
              <BotaoSec mini onClick={escolher} disabled={b.subindo}><IcSubir t={13} />Trocar</BotaoSec>
            </span>
          </div>
          <span className="pd-arq-nome">{b.arquivoNome}</span>
        </>
      ) : (
        <div className="pd-arq-vazio">
          <div className="pd-grav" ref={grav}><AudioRecorderV2 onEnviar={(blob) => usarGravacao(blob)} rotuloEnviar="Usar este áudio" /></div>
          <span className="pd-ou">ou</span>
          <BotaoSec mini className="pd-escolher" onClick={escolher}><IcSubir t={13} />Escolher arquivo</BotaoSec>
          {regravar && <button type="button" className="pd-link-sutil" onClick={() => setRegravar(false)}>Manter o atual</button>}
        </div>
      ))}

      {midia && (b.arquivoNome ? (
        <div className="pd-arq" data-midia="">
          <span className="pd-arq-qd"><IcTipo tipo={b.tipo} t={18} /></span>
          <span className="pd-arq-tx">
            <span className="pd-arq-n">{b.arquivoNome}</span>
            <span className="pd-arq-m num">{b.subindo ? 'subindo…' : meta || ROTULO_BLOCO[b.tipo]}</span>
          </span>
          <span className="pd-arq-acoes"><BotaoSec mini onClick={escolher} disabled={b.subindo}><IcSubir t={13} />Trocar</BotaoSec></span>
        </div>
      ) : (
        <div className="pd-arq-vazio">
          <BotaoSec mini onClick={escolher}><IcSubir t={13} />Escolher arquivo</BotaoSec>
          <span className="pd-dica">{dica}</span>
        </div>
      ))}
      {midia && (
        <input className="pd-legenda" value={paraTela(b.texto ?? '')} placeholder="Legenda (opcional)" aria-label="Legenda" maxLength={MAX_TEXTO}
          onChange={(e) => { const v = paraBanco(e.target.value); aoMudar((x) => ({ ...x, texto: v })); }} />
      )}

      {b.tipo !== 'texto' && (
        <input ref={arq} type="file" accept={aceita} hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = '';
          /* recusa ANTES de subir (o servidor recusaria só ao salvar, e o arquivo ficaria órfão) */
          if (b.tipo === 'documento' && !EXT_DOC.includes(extDe(f.name))) {
            avisar('Esse arquivo não vai como documento. Use PDF, Word, Excel, PowerPoint, TXT, CSV ou ZIP. Foto vai como Imagem.'); return;
          }
          if (b.tipo === 'imagem' && !/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
            avisar('Use foto JPG ou PNG. Fotos do iPhone (HEIC) não vão pelo WhatsApp.'); return;
          }
          if (b.tipo !== 'audio' && f.size > (b.tipo === 'documento' ? 25 : 16) * 1024 * 1024) {
            avisar('Arquivo grande demais (máx. 16 MB; documento 25 MB).'); return;
          }
          const dur = b.tipo === 'audio' || b.tipo === 'video' ? await duracao(f) : undefined;
          setRegravar(false);
          await guardar(f, f.name, dur);
        }} />
      )}
    </div>
  );
}

/** o campo mostra as variáveis com o nome do botão ({primeiro nome}); guarda a chave do banco ({primeiro_nome}) */
function AreaTexto({ valor, aoMudar, areaRef, cursor }: {
  valor: string; aoMudar: (v: string) => void; areaRef: RefObject<HTMLTextAreaElement>; cursor: MutableRefObject<number | null>;
}) {
  const vis = paraTela(valor);
  useLayoutEffect(() => {
    const el = areaRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(72, el.scrollHeight + 2)}px`;
    if (cursor.current != null) { const p = cursor.current; cursor.current = null; el.focus(); el.setSelectionRange(p, p); }
  }, [vis, areaRef, cursor]);
  /* camada espelho por trás do campo: o mesmo texto, transparente, com cada variável num chip azul.
     O campo continua um textarea comum (edição, cursor, seleção e colar não mudam). */
  return (
    <div className="pd-area-w">
      <div className="pd-area-esp" aria-hidden>
        {pedacosComVariaveis(vis).map((x, i) => (x.v ? <mark key={i}>{x.tx}</mark> : <Fragment key={i}>{x.tx}</Fragment>))}
      </div>
      <textarea ref={areaRef} className="pd-area" value={vis} placeholder="Escreva a mensagem" aria-label="Texto" maxLength={MAX_TEXTO}
        onChange={(e) => aoMudar(paraBanco(e.target.value))} />
    </div>
  );
}

/* ============================ prévia: o celular DO CLIENTE ============================
   No celular dele quem aparece no topo é o número do escritório, e as mensagens CHEGAM
   (à esquerda, sem os "tiques", que só aparecem em mensagem que a gente manda).
   A paleta do WhatsApp fica confinada aqui: é a tela do cliente, não o cromo do Atenvo. */
export function Celular({ ctx, blocos, legenda, hora }: { ctx: CtxPrevia; blocos: Bloco[]; legenda: string; hora: string }) {
  /* o cliente não tem o escritório salvo: vê o número, não o apelido interno do canal */
  const quem = telefoneIntl(ctx.telefone) || nomeBonito(ctx.remetente || 'Escritório');
  return (
    <div className="pd-cel">
      <div className="pd-cel-tela">
        <div className="pd-cel-topo">
          <IcVoltar t={18} />
          <span className="pd-cel-av"><IcPessoa t={18} /></span>
          <span className="pd-cel-quem"><b className="num">{quem}</b></span>
        </div>
        <div className="pd-cel-chat">
          {legenda && <span className="pd-cel-dia">{legenda}</span>}
          {blocos.length === 0 && <span className="pd-cel-vz">Sem mensagem.</span>}
          {blocos.map((b, i) => <Bolha key={b.id} b={b} ctx={ctx} primeira={i === 0} hora={hora} />)}
        </div>
        <div className="pd-cel-comp" aria-hidden><span>Mensagem</span><i><IcTipo tipo="audio" t={18} /></i></div>
      </div>
    </div>
  );
}
function Bolha({ b, ctx, primeira, hora }: { b: Bloco; ctx: CtxPrevia; primeira: boolean; hora: string }) {
  const p = primeira ? { 'data-primeira': '' } : {};
  const h = <span className="pd-b-h num">{hora}</span>;
  const legenda = (b.texto ?? '').trim() ? <div className="pd-b-leg">{preencher(b.texto ?? '', ctx)}{h}</div> : null;
  if (b.tipo === 'texto') {
    const tx = (b.texto ?? '').trim() ? preencher(b.texto ?? '', ctx) : '';
    return (
      <div className="pd-b" {...p}>
        {tx.trim() ? tx : <span className="pd-b-vz">{(b.texto ?? '').trim() ? 'fica em branco' : '…'}</span>}{h}
      </div>
    );
  }
  if (b.tipo === 'audio') {
    return (
      <div className="pd-b pd-b-audio" data-vazio={b.arquivoNome ? undefined : ''} {...p}>
        <span className="pd-cel-av"><IcPessoa t={20} /></span>
        <span className="pd-b-play"><IcPlay t={16} /></span>
        <span className="pd-b-onda" aria-hidden>{barras(b.arquivoNome ?? 'vazio', 28, 3, 18).map((x, i) => <i key={i} style={{ height: x }} />)}</span>
        <span className="pd-b-dur num"><span>{b.arquivoNome ? mmss(b.duracaoSeg ?? 0) || '0:00' : 'sem áudio'}</span><span>{hora}</span></span>
      </div>
    );
  }
  if (b.tipo === 'documento') {
    const ext = extDe(b.arquivoNome ?? '').toUpperCase();
    return (
      <div className="pd-b" {...p}>
        <div className="pd-b-doc">
          <span className="pd-b-doc-ic"><IcTipo tipo="documento" t={18} /></span>
          <span className="pd-b-doc-tx"><b>{b.arquivoNome ?? 'sem documento'}</b><small>{[ext, tamanhoBR(b.tamanho)].filter(Boolean).join(' · ') || 'Documento'}</small></span>
        </div>
        {legenda ?? <div className="pd-b-leg">{h}</div>}
      </div>
    );
  }
  return (
    <div className="pd-b pd-b-com-midia" {...p}>
      <div className="pd-b-midia">
        {b.tipo === 'video' ? <span className="pd-b-midia-play"><IcPlay t={18} /></span> : <IcTipo tipo={b.tipo} t={26} />}
        <small>{b.arquivoNome ?? `sem ${ROTULO_BLOCO[b.tipo].toLowerCase()}`}</small>
      </div>
      {legenda ?? <div className="pd-b-leg">{h}</div>}
    </div>
  );
}

async function duracao(blob: Blob): Promise<number | undefined> {
  try {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('audio');
    el.src = url;
    const d = await new Promise<number>((ok) => {
      el.onloadedmetadata = () => ok(el.duration);
      el.onerror = () => ok(NaN);
      setTimeout(() => ok(NaN), 1500);
    });
    URL.revokeObjectURL(url);
    return Number.isFinite(d) ? Math.round(d) : undefined;
  } catch { return undefined; }
}
