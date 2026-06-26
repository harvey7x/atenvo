import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { fetchEtapasTextoResolvidas, useRegistrarExecucaoScript, type VarCtx } from '@/data/scripts';

type Status = 'pendente' | 'enviando' | 'ok' | 'falha';
type Confirmado = 'enviada' | 'entregue' | 'lida';
interface Item { posicao: number; texto: string; faltando: string[] }

interface Props {
  open: boolean;
  onClose: () => void;
  script: { id: string; titulo: string; conteudo: string } | null;
  canal: 'whatsapp' | 'facebook';
  ctx: VarCtx;
  conversaId: string;
  /** Despacha UMA etapa (texto). Deve retornar o id INTERNO da mensagem (para confirmação real). */
  enviarEtapa: (texto: string) => Promise<string | void>;
  /** Confirma a entrega REAL no provedor (status da mensagem). Sem isto, o sucesso seria só o HTTP 200. */
  confirmar?: (mensagemId: string) => Promise<Confirmado>;
  onEnviado?: () => void;
}

const temPendenciaTexto = (t: string) => /\{\{\s*\w+\s*\}\}/.test(t) || /\[[^\]]*não inform/i.test(t);

/**
 * Disparo de uma sequência de mensagens de TEXTO de um Script dentro de uma conversa.
 *
 * CRITÉRIO DE SUCESSO (corrigido): uma etapa só é "enviada" quando o provedor CONFIRMA
 * (status real da mensagem: enviada/entregue/lida). HTTP 200 da função, insert no banco,
 * avanço do loop ou "3 de 3" NÃO contam como sucesso. Na primeira recusa, para imediatamente,
 * marca só aquela como falha, mantém as demais pendentes e permite retry a partir dela.
 */
export function ScriptSequenceModal({ open, onClose, script, canal, ctx, conversaId, enviarEtapa, confirmar, onEnviado }: Props) {
  const { toast } = useToast();
  const registrar = useRegistrarExecucaoScript();
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
    fetchEtapasTextoResolvidas(script.id, ctx, script.conteudo || '')
      .then((r) => { if (cancel) return; setItens(r.map((x) => ({ posicao: x.posicao, texto: x.texto, faltando: x.faltando }))); setStatus(r.map(() => 'pendente')); setConfirmados(r.map(() => null)); setErros(r.map(() => null)); })
      .catch((e) => { if (!cancel) setErroLoad((e as Error).message || 'Falha ao carregar as mensagens'); })
      .finally(() => { if (!cancel) setCarregando(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, script?.id]);

  function editar(i: number, texto: string) { setItens((m) => m.map((x, j) => j === i ? { ...x, texto } : x)); }

  function registrarExec(st: Status[], conf: (Confirmado | null)[], erroMsg: string | null) {
    if (jaReg.current || !script) return;
    const enviadas = st.filter((s) => s === 'ok').length;
    const falhas = st.filter((s) => s === 'falha').length;
    if (enviadas === 0 && falhas === 0) return; // nada saiu: nada a auditar
    const entregues = conf.filter((c) => c === 'entregue' || c === 'lida').length;
    let ultimaOk = 0; st.forEach((s, i) => { if (s === 'ok') ultimaOk = i + 1; });
    jaReg.current = true;
    registrar.mutate({ scriptId: script.id, conversaId, canal, total: itens.length, enviadas, entregues, falhas, ultimaEtapaOk: ultimaOk, erro: erroMsg });
  }

  async function enviarSequencia() {
    if (enviando || !script || !itens.length) return;       // impede clique duplo / execução dupla
    setEnviando(true);
    const st = [...status];
    const conf = [...confirmados];
    const er = [...erros];
    let parou = false;
    for (let i = 0; i < itens.length; i++) {
      if (st[i] === 'ok') continue;                          // retry: não reenvia etapas já confirmadas
      setIdxAtual(i);
      st[i] = 'enviando'; setStatus([...st]);
      try {
        const ref = await enviarEtapa(itens[i].texto);        // HTTP 200 != sucesso
        if (confirmar) {
          if (!ref || typeof ref !== 'string') throw new Error('Envio sem identificador para confirmar no provedor.');
          conf[i] = await confirmar(ref);                     // aguarda confirmação REAL; lança em falha/timeout
        } else {
          conf[i] = 'enviada';
        }
        st[i] = 'ok'; setConfirmados([...conf]); setStatus([...st]);
      } catch (e) {
        st[i] = 'falha'; er[i] = (e as Error).message || 'Falha no envio';
        setErros([...er]); setStatus([...st]);
        parou = true; break;                                  // para na 1ª recusa (preserva a ordem)
      }
    }
    setIdxAtual(-1); setEnviando(false);
    const enviadas = st.filter((s) => s === 'ok').length;
    if (!parou && enviadas === itens.length) {
      registrarExec(st, conf, null);
      toast(`Sequência enviada e confirmada: ${enviadas} ${enviadas === 1 ? 'mensagem' : 'mensagens'}`);
      onEnviado?.();
      onClose();
    } else {
      toast(`Falha na mensagem ${st.findIndex((s) => s === 'falha') + 1}. Corrija e tente novamente as etapas restantes.`, 'warn');
    }
  }

  function fechar() {
    if (enviando) return;                                    // não fecha durante o envio
    registrarExec(status, confirmados, erros.find(Boolean) ?? null); // registra parcial/falhou se algo já saiu
    onClose();
  }

  const todasOk = itens.length > 0 && status.every((s) => s === 'ok');
  const algumaFalha = status.some((s) => s === 'falha');
  const restantes = status.filter((s) => s !== 'ok').length;
  const labelEnviar = enviando ? 'Enviando…' : todasOk ? 'Enviado' : algumaFalha ? `Tentar novamente (${restantes})` : `Enviar ${itens.length} ${itens.length === 1 ? 'mensagem' : 'mensagens'}`;
  const canalNome = canal === 'whatsapp' ? 'WhatsApp' : 'Messenger';

  const chip = (i: number) => {
    const s = status[i] ?? 'pendente';
    if (s === 'ok') { const c = confirmados[i]; const ent = c === 'entregue' || c === 'lida'; return <span style={{ fontSize: 12, fontWeight: 600, color: '#19C37D' }}>{ent ? 'Entregue' : 'Enviada ao provedor'}</span>; }
    const map: Record<Exclude<Status, 'ok'>, { t: string; c: string }> = {
      pendente: { t: 'Preparando', c: 'var(--muted)' }, enviando: { t: 'Enviando…', c: 'var(--accent)' }, falha: { t: 'Falhou', c: 'var(--err)' },
    };
    return <span style={{ fontSize: 12, fontWeight: 600, color: map[s].c }}>{map[s].t}</span>;
  };

  return (
    <Modal open={open} onClose={fechar} closeOnBackdrop={!enviando} width={560}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Enviar script</span>
        {script && <strong style={{ color: 'var(--ink)' }}>{script.titulo}</strong>}
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'var(--line-2)', color: 'var(--ink-2)' }}>{canalNome}</span>
      </div>}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--muted)' }}>
          {enviando && idxAtual >= 0 ? `Enviando ${idxAtual + 1} de ${itens.length}` : (itens.length ? `${itens.length} ${itens.length === 1 ? 'mensagem' : 'mensagens'}` : '')}
        </span>
        <button className="atv-btn" disabled={enviando} onClick={fechar}>{todasOk ? 'Fechar' : 'Cancelar'}</button>
        <button className="atv-btn primary" disabled={enviando || carregando || !itens.length || todasOk} onClick={enviarSequencia}>{labelEnviar}</button>
      </>}>
      {carregando && <div style={{ padding: 16, color: 'var(--muted)' }}>Carregando mensagens…</div>}
      {erroLoad && <div className="atv-field-err">{erroLoad}</div>}
      {!carregando && !erroLoad && itens.length === 0 && <div style={{ padding: 16, color: 'var(--muted)' }}>Este script não tem mensagens de texto para enviar.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens.map((it, i) => {
          const falta = temPendenciaTexto(it.texto);
          return (
            <div key={i} style={{ border: '1px solid ' + (status[i] === 'falha' ? 'var(--err)' : 'var(--line-2)'), borderRadius: 10, padding: 10, background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>Mensagem {it.posicao}</strong>
                {chip(i)}
              </div>
              {falta && it.faltando.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>
                  Dados ausentes: {it.faltando.join(', ')}. Edite a mensagem abaixo (apenas para este envio) ou cancele.
                </div>
              )}
              {status[i] === 'falha' && erros[i] && (
                <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>Erro: {erros[i]}</div>
              )}
              <textarea className="atv-textarea" value={it.texto} disabled={enviando || status[i] === 'ok'}
                style={falta ? { borderColor: 'var(--err)' } : undefined}
                onChange={(e) => editar(i, e.target.value)} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
