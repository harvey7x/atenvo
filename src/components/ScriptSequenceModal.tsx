import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { fetchEtapasParaEnvio, urlAssinadaAnexo, formatarTamanho, useRegistrarExecucaoScript, type VarCtx, type EtapaTipo } from '@/data/scripts';
import { removerMensagemFalha } from '@/data/whatsapp';

type Status = 'pendente' | 'enviando' | 'ok' | 'falha';
type Confirmado = 'enviada' | 'entregue' | 'lida';
interface Item { posicao: number; tipo: EtapaTipo; texto: string; faltando: string[]; etapaId?: string; nome?: string | null; mime?: string | null; tamanho?: number | null; storagePath?: string | null; previewUrl?: string; removida?: boolean; mensagemId?: string }
export interface MidiaEtapa { etapaId: string; tipo: EtapaTipo; texto: string; nome?: string | null; mime?: string | null; tamanho?: number | null }

interface Props {
  open: boolean;
  onClose: () => void;
  script: { id: string; titulo: string; conteudo: string } | null;
  canal: 'whatsapp' | 'facebook';
  ctx: VarCtx;
  conversaId: string;
  /** Despacha UMA etapa de TEXTO. Retorna o id INTERNO (para confirmação real, quando houver).
   *  retryMensagemId: reaproveita a MESMA mensagem falhada no backend (sem duplicar). */
  enviarEtapa: (texto: string, retryMensagemId?: string) => Promise<string | void>;
  /** Confirma a entrega REAL (status da mensagem). WhatsApp usa; Facebook confirma de forma síncrona. */
  confirmar?: (mensagemId: string) => Promise<Confirmado>;
  /** Despacha UMA etapa de MÍDIA (imagem). Deve lançar se o provedor não confirmar. */
  enviarMidia?: (m: MidiaEtapa) => Promise<void>;
  /** Inclui etapas de imagem na sequência (canal que suporta — Facebook). */
  incluirMidia?: boolean;
  onEnviado?: () => void;
}

const temPendenciaTexto = (t: string) => /\{\{\s*\w+\s*\}\}/.test(t) || /\[[^\]]*não inform/i.test(t);
// Intervalo entre etapas da sequência (evita rajada recusada pelo provider). Aplicado só ENTRE
// envios consecutivos no mesmo disparo — nunca antes da 1ª nem antes de um retry manual isolado.
const INTERVALO_SEQUENCIA_MS = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Disparo de uma sequência (texto + imagem no Facebook) de um Script dentro de uma conversa.
 * Sucesso de etapa = confirmação REAL do provedor (texto: status da mensagem; imagem: retorno
 * válido da Send API). HTTP 200 / avanço do loop NÃO contam. Para na 1ª recusa; retry só do que faltou.
 */
export function ScriptSequenceModal({ open, onClose, script, canal, ctx, conversaId, enviarEtapa, confirmar, enviarMidia, incluirMidia, onEnviado }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const registrar = useRegistrarExecucaoScript();
  const taRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroLoad, setErroLoad] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [confirmados, setConfirmados] = useState<(Confirmado | null)[]>([]);
  const [erros, setErros] = useState<(string | null)[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [idxAtual, setIdxAtual] = useState(-1);
  const jaReg = useRef(false);

  useEffect(() => {
    if (!open || !script) return;
    let cancel = false;
    setCarregando(true); setErroLoad(null); setItens([]); setStatus([]); setConfirmados([]); setErros([]); setIdxAtual(-1); setEnviando(false); jaReg.current = false;
    fetchEtapasParaEnvio(script.id, ctx, { incluirMidia, fallbackConteudo: script.conteudo || '' })
      .then(async (r) => {
        if (cancel) return;
        const its: Item[] = r.map((x) => ({ ...x }));
        await Promise.all(its.map(async (it) => { if (it.tipo !== 'texto' && it.storagePath) { it.previewUrl = (await urlAssinadaAnexo(it.storagePath)) ?? undefined; } }));
        if (cancel) return;
        setItens(its); setStatus(its.map(() => 'pendente')); setConfirmados(its.map(() => null)); setErros(its.map(() => null));
      })
      .catch((e) => { if (!cancel) setErroLoad((e as Error).message || 'Falha ao carregar as mensagens'); })
      .finally(() => { if (!cancel) setCarregando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, script?.id]);

  function editar(i: number, texto: string) { setItens((m) => m.map((x, j) => j === i ? { ...x, texto } : x)); }
  function removerImagem(i: number) { setItens((m) => m.map((x, j) => j === i ? { ...x, removida: true } : x)); }
  function restaurarImagem(i: number) { setItens((m) => m.map((x, j) => j === i ? { ...x, removida: false } : x)); }

  /** Remove uma mensagem com FALHA: apaga no banco (RPC), tira do estado do modal e da conversa,
   *  invalida a query, recalcula o contador e fecha o modal se não restar nenhuma mensagem. */
  async function removerFalha(i: number) {
    if (removendo !== null) return;
    const it = itens[i];
    setRemovendo(i);
    try {
      if (it.mensagemId) await removerMensagemFalha(it.mensagemId); // banco (valida org/acesso/não-entregue)
      const restam = itens.length - 1;
      setItens((m) => m.filter((_, j) => j !== i));
      setStatus((s) => s.filter((_, j) => j !== i));
      setConfirmados((c) => c.filter((_, j) => j !== i));
      setErros((e) => e.filter((_, j) => j !== i));
      // some da conversa (timeline) sem reload
      qc.invalidateQueries({ predicate: (q) => { const k = String(q.queryKey[0]); return k === 'wa-conversas' || k === 'fb-conversas'; } });
      onEnviado?.();
      toast('Mensagem com falha removida.');
      if (restam === 0) onClose(); // sem mensagens pendentes → fecha
    } catch (e) {
      toast((e as Error).message || 'Não foi possível remover a mensagem.', 'warn');
    } finally { setRemovendo(null); }
  }

  function registrarExec(st: Status[], conf: (Confirmado | null)[], its: Item[], erroMsg: string | null) {
    if (jaReg.current || !script) return;
    const ativos = its.map((it, i) => ({ it, st: st[i], cf: conf[i] })).filter((x) => !x.it.removida);
    const enviadas = ativos.filter((x) => x.st === 'ok').length;
    const falhas = ativos.filter((x) => x.st === 'falha').length;
    if (enviadas === 0 && falhas === 0) return;
    const entregues = ativos.filter((x) => x.cf === 'entregue' || x.cf === 'lida').length;
    let ultimaOk = 0; ativos.forEach((x, i) => { if (x.st === 'ok') ultimaOk = i + 1; });
    jaReg.current = true;
    registrar.mutate({ scriptId: script.id, conversaId, canal, total: ativos.length, enviadas, entregues, falhas, ultimaEtapaOk: ultimaOk, erro: erroMsg });
  }

  async function enviarSequencia() {
    if (enviando || !script || !itens.length) return;
    setEnviando(true);
    const st = [...status]; const conf = [...confirmados]; const er = [...erros];
    let parou = false;
    let enviouNesteRun = false; // controla o intervalo: só espera ENTRE envios deste disparo
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (it.removida || st[i] === 'ok') continue;
      if (enviouNesteRun) await sleep(INTERVALO_SEQUENCIA_MS); // intervalo 1→2 e 2→3 (não antes da 1ª)
      setIdxAtual(i);
      st[i] = 'enviando'; setStatus([...st]);
      try {
        if (it.tipo !== 'texto') {
          if (!enviarMidia || !it.etapaId) throw new Error('Envio de mídia indisponível neste canal.');
          await enviarMidia({ etapaId: it.etapaId, tipo: it.tipo, texto: it.texto, nome: it.nome, mime: it.mime, tamanho: it.tamanho });
          conf[i] = 'enviada';
        } else {
          // retry reaproveita a MESMA mensagem falhada (it.mensagemId) -> sem duplicar no banco
          const ref = await enviarEtapa(it.texto, it.mensagemId);
          // guarda o id da mensagem persistida (para poder REMOVER se falhar)
          if (typeof ref === 'string') setItens((prev) => prev.map((x, j) => j === i ? { ...x, mensagemId: ref } : x));
          if (confirmar) { if (!ref || typeof ref !== 'string') throw new Error('Envio sem identificador para confirmar.'); conf[i] = await confirmar(ref); }
          else conf[i] = 'enviada';
        }
        st[i] = 'ok'; enviouNesteRun = true; setConfirmados([...conf]); setStatus([...st]);
      } catch (e) {
        st[i] = 'falha'; er[i] = (e as Error).message || 'Falha no envio'; setErros([...er]); setStatus([...st]);
        parou = true; break;
      }
    }
    setIdxAtual(-1); setEnviando(false);
    const ativos = itens.map((it, i) => ({ it, st: st[i] })).filter((x) => !x.it.removida);
    const enviadas = ativos.filter((x) => x.st === 'ok').length;
    if (!parou && enviadas === ativos.length) {
      registrarExec(st, conf, itens, null);
      toast(`Sequência enviada: ${enviadas} ${enviadas === 1 ? 'mensagem' : 'mensagens'}`);
      onEnviado?.(); onClose();
    } else {
      toast('Falha em uma etapa. Corrija e tente novamente as restantes.', 'warn');
    }
  }

  function fechar() { if (enviando) return; registrarExec(status, confirmados, itens, erros.find(Boolean) ?? null); onClose(); }

  const ativos = itens.filter((it) => !it.removida);
  const todasOk = ativos.length > 0 && itens.every((it, i) => it.removida || status[i] === 'ok');
  const algumaFalha = status.some((s) => s === 'falha');
  const algumOk = status.some((s) => s === 'ok');
  const proximaIdx = itens.findIndex((it, i) => !it.removida && status[i] !== 'ok');
  const proximaPos = proximaIdx >= 0 ? itens[proximaIdx].posicao : null;
  const bloqueioPendencia = !!incluirMidia && itens.some((it, i) => !it.removida && status[i] !== 'ok' && temPendenciaTexto(it.texto));
  const labelEnviar = enviando ? 'Enviando…'
    : todasOk ? 'Enviado'
    : algumaFalha ? `Tentar novamente mensagem ${proximaPos ?? ''}`.trim() // só a 1ª pendente é tentada; segue daí
    : algumOk ? 'Continuar envio'                                        // parte já entregue; continua do que falta
    : `Enviar ${ativos.length} ${ativos.length === 1 ? 'mensagem' : 'mensagens'}`;
  const canalNome = canal === 'whatsapp' ? 'WhatsApp' : 'Messenger';

  const chip = (i: number) => {
    const s = status[i] ?? 'pendente';
    if (s === 'ok') { const c = confirmados[i]; const ent = c === 'entregue' || c === 'lida'; return <span style={{ fontSize: 12, fontWeight: 600, color: '#19C37D' }}>{ent ? 'Entregue' : 'Enviada ao provedor'}</span>; }
    const map: Record<Exclude<Status, 'ok'>, { t: string; c: string }> = { pendente: { t: 'Preparando', c: 'var(--muted)' }, enviando: { t: 'Enviando…', c: 'var(--accent)' }, falha: { t: 'Falhou', c: 'var(--err)' } };
    return <span style={{ fontSize: 12, fontWeight: 600, color: map[s].c }}>{map[s].t}</span>;
  };

  return (
    <Modal open={open} onClose={fechar} closeOnBackdrop={!enviando} width={560}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Enviar script</span>{script && <strong style={{ color: 'var(--ink)' }}>{script.titulo}</strong>}
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--line-2)', color: 'var(--ink-2)' }}>{canalNome}</span>
      </div>}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--muted)' }}>
          {enviando && idxAtual >= 0 ? `Enviando ${idxAtual + 1} de ${ativos.length}` : (ativos.length ? `${ativos.length} ${ativos.length === 1 ? 'mensagem' : 'mensagens'}` : '')}
        </span>
        <button className="atv-btn" disabled={enviando} onClick={fechar}>{todasOk ? 'Fechar' : 'Cancelar'}</button>
        <button className="atv-btn primary" disabled={enviando || carregando || !ativos.length || todasOk || bloqueioPendencia} onClick={enviarSequencia}>{labelEnviar}</button>
      </>}>
      {carregando && <div style={{ padding: 16, color: 'var(--muted)' }}>Carregando mensagens…</div>}
      {erroLoad && <div className="atv-field-err">{erroLoad}</div>}
      {!carregando && !erroLoad && ativos.length === 0 && <div style={{ padding: 16, color: 'var(--muted)' }}>Este script não tem mensagens para enviar.</div>}
      {bloqueioPendencia && <div className="atv-field-err" style={{ marginBottom: 8 }}>Corrija ou remova os trechos com dados ausentes antes de enviar.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens.map((it, i) => {
          const falta = temPendenciaTexto(it.texto);
          const borda = status[i] === 'falha' ? 'var(--err)' : 'var(--line-2)';
          return (
            <div key={i} style={{ border: '1px solid ' + borda, borderRadius: 10, padding: 10, background: 'var(--surface)', opacity: it.removida ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>Mensagem {it.posicao}{it.tipo === 'imagem' ? ' · Imagem' : it.tipo === 'audio' ? ' · Áudio' : ''}</strong>
                {it.removida ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Removida deste envio</span> : chip(i)}
              </div>

              {it.tipo !== 'texto' && !it.removida && (() => {
                const rotulo = it.tipo === 'audio' ? 'áudio' : 'imagem';
                const info = (
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink-2)' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome ?? rotulo}</div>
                    <div style={{ color: 'var(--muted)' }}>{it.mime ?? it.tipo}{it.tamanho ? ' · ' + formatarTamanho(it.tamanho) : ''}</div>
                    <button type="button" className="atv-btn" style={{ marginTop: 6 }} disabled={enviando || status[i] === 'ok'} onClick={() => removerImagem(i)}>Remover {rotulo} deste envio</button>
                  </div>
                );
                return it.tipo === 'imagem' ? (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    {it.previewUrl
                      ? <img src={it.previewUrl} alt={it.nome ?? ''} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line-2)' }} />
                      : <div style={{ width: 96, height: 96, borderRadius: 8, border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>sem prévia</div>}
                    {info}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {it.previewUrl
                      ? <audio controls src={it.previewUrl} style={{ width: '100%', height: 40 }} />
                      : <div style={{ height: 40, borderRadius: 8, border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--muted)', fontSize: 11 }}>sem prévia</div>}
                    {info}
                  </div>
                );
              })()}
              {it.tipo !== 'texto' && it.removida && (
                <button type="button" className="atv-btn" style={{ marginBottom: 6 }} disabled={enviando} onClick={() => restaurarImagem(i)}>Restaurar {it.tipo === 'audio' ? 'áudio' : 'imagem'}</button>
              )}

              {!it.removida && falta && it.faltando.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>Dados ausentes: {it.faltando.join(', ')}. Edite {it.tipo === 'imagem' ? 'a legenda' : 'a mensagem'} (apenas para este envio) ou remova.</div>
              )}
              {status[i] === 'falha' && erros[i] && <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>{erros[i]}</div>}

              {!it.removida && (
                <textarea ref={(el) => { taRefs.current[i] = el; }} className="atv-textarea" value={it.texto} disabled={enviando || status[i] === 'ok'}
                  placeholder={it.tipo === 'imagem' ? 'Legenda (opcional). Use {{nome_cliente}}…' : 'Mensagem'}
                  style={falta ? { borderColor: 'var(--err)' } : undefined}
                  onChange={(e) => editar(i, e.target.value)} />
              )}

              {status[i] === 'falha' && !it.removida && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="atv-btn primary" disabled={enviando || removendo !== null} onClick={() => void enviarSequencia()}>Tentar novamente</button>
                  <button type="button" className="atv-btn" disabled={enviando || removendo !== null} onClick={() => taRefs.current[i]?.focus()}>Editar</button>
                  <button type="button" className="atv-btn danger" disabled={enviando || removendo !== null} onClick={() => void removerFalha(i)}>{removendo === i ? 'Removendo…' : 'Remover'}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
