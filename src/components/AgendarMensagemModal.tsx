import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { AudioRecorder } from '@/components/AudioRecorder';
import { useOrg } from '@/context/OrgContext';
import { mascararNumero, subirMidiaWa } from '@/data/whatsapp';
import {
  canalValidoParaEnvio, partesSP, montarInstanteSP, defaultQuandoAgendar,
  resumoEnvio, avisoJanelaLonga, atalhoAgendar, midiaValida, type AtalhoAg,
  mascararHora, horaValida, mascararDataBR, dataBRparaISO, isoParaDataBR,
} from '@/lib/agendamentoMensagem';
import './AgendarMensagemModal.css';

export interface CanalOpcao { id: string; alias: string; numero: string | null; status: string; envioRestrito: boolean; conflitoCom: string | null }
export interface MidiaSubmit { path: string; mime: string; nome: string; tamanho: number; origemAudio?: string }
export interface SeqItemSubmit { tipo: string; texto: string; midia?: MidiaSubmit | null }
export interface AgendarSubmit {
  modo: 'sequencia' | 'editar' | 'reagendar';
  canalId: string; executarISO: string;
  tipo?: string; texto?: string;            // editar/reagendar (bloco único)
  itens?: SeqItemSubmit[];                   // sequencia (criar)
}

interface Props {
  open: boolean;
  modo: 'criar' | 'editar' | 'reagendar';
  canais: CanalOpcao[];
  temTelefone: boolean;
  ultimaInteracaoMs?: number | null;
  initial?: { canalId?: string; texto?: string; executarEm?: string; tipo?: string; nomeArquivo?: string } | null;
  onClose: () => void;
  onSubmit: (v: AgendarSubmit) => Promise<void>;
}

const IcImg = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 21" /></svg>;
const IcAudio = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcVideo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2.5" /><path d="m22 8-6 4 6 4z" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>;
const IcCal = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>;
const IcClk = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

const TIPO_LABEL: Record<string, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };
const ACCEPT: Record<string, string> = {
  imagem: 'image/*', video: 'video/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf',
};
const ATALHOS: { id: AtalhoAg; label: string }[] = [
  { id: 'hoje5', label: 'Hoje +5 min' }, { id: 'hojeTarde', label: 'Hoje à tarde' },
  { id: 'amanha9', label: 'Amanhã 09:00' }, { id: 'amanha14', label: 'Amanhã 14:00' }, { id: 'em3dias', label: 'Em 3 dias' },
];
const PLACEHOLDER: Record<string, string> = {
  imagem: 'Selecione uma imagem para pré-visualizar.',
  audio: 'Grave ou selecione um áudio para pré-visualizar.',
  video: 'Selecione um vídeo para pré-visualizar.',
  documento: 'Selecione um documento para pré-visualizar.',
};
const fmtTam = (b: number) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

interface Bloco { key: number; tipo: string; texto: string; file: File | null; objUrl: string | null; fileErr: string | null; nomeExistente?: string | null; origemAudio?: string }

export function AgendarMensagemModal({ open, modo, canais, temTelefone, ultimaInteracaoMs, initial, onClose, onSubmit }: Props) {
  const { currentOrg } = useOrg();
  const builder = modo === 'criar';
  const captionRO = modo === 'reagendar';
  const canaisAgendaveis = canais.filter((c) => canalValidoParaEnvio({
    id: c.id, nome: c.alias, ativo: true, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom,
  }).ok);

  const [canal, setCanal] = useState('');
  const [dataBR, setDataBR] = useState('');
  const [hora, setHora] = useState('');
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(0);
  const novaKey = () => ++keyRef.current;

  useEffect(() => {
    if (!open) return;
    setErr(null); setBusy(false);
    const defCanal = initial?.canalId && canaisAgendaveis.some((c) => c.id === initial.canalId) ? initial.canalId : (canaisAgendaveis[0]?.id ?? '');
    setCanal(defCanal);
    const q = (modo === 'editar' && initial?.executarEm) ? partesSP(new Date(initial.executarEm).getTime()) : defaultQuandoAgendar(Date.now(), 5);
    setDataBR(isoParaDataBR(q.data)); setHora(q.hora);
    setBlocos(builder
      ? [{ key: novaKey(), tipo: 'texto', texto: '', file: null, objUrl: null, fileErr: null }]
      : [{ key: novaKey(), tipo: initial?.tipo ?? 'texto', texto: initial?.texto ?? '', file: null, objUrl: null, fileErr: null, nomeExistente: initial?.nomeArquivo ?? null }]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // revoga object URLs ao fechar
  useEffect(() => { if (!open) blocos.forEach((b) => b.objUrl && URL.revokeObjectURL(b.objUrl)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canalNome = canaisAgendaveis.find((c) => c.id === canal)?.alias ?? null;
  const dataISO = dataBRparaISO(dataBR);
  const dataErr = dataBR.length > 0 && !dataISO;
  const horaErr = hora.length > 0 && !horaValida(hora);
  const execMs = dataISO && horaValida(hora) ? new Date(`${dataISO}T${hora}:00-03:00`).getTime() : NaN;
  const resumo = resumoEnvio({ executarEmMs: execMs, agoraMs: Date.now(), canalNome });
  const aviso = avisoJanelaLonga({ executarEmMs: execMs, agoraMs: Date.now(), ultimaInteracaoMs });

  const blocoOk = (b: Bloco) => b.tipo === 'texto' ? !!b.texto.trim() : (!builder ? true : !!b.file) && !b.fileErr;
  const podeSubmeter = !busy && !!canal && Number.isFinite(execMs) && blocos.length > 0 && blocos.every(blocoOk);

  const titulo = modo === 'reagendar' ? 'Reagendar mensagem' : modo === 'editar' ? 'Editar agendamento' : 'Agendar mensagem';
  const btnLabel = busy ? 'Salvando…' : modo === 'reagendar' ? 'Reagendar' : modo === 'editar' ? 'Salvar' : (blocos.length > 1 ? `Agendar ${blocos.length} mensagens` : 'Agendar');

  function patch(idx: number, p: Partial<Bloco>) { setBlocos((bs) => bs.map((b, i) => i === idx ? { ...b, ...p } : b)); }
  function addBloco() { setBlocos((bs) => [...bs, { key: novaKey(), tipo: 'texto', texto: '', file: null, objUrl: null, fileErr: null }]); }
  function removeBloco(idx: number) { setBlocos((bs) => { const b = bs[idx]; if (b?.objUrl) URL.revokeObjectURL(b.objUrl); return bs.filter((_, i) => i !== idx); }); }
  function dupBloco(idx: number) { setBlocos((bs) => { const b = bs[idx]; const copia: Bloco = { ...b, key: novaKey(), file: null, objUrl: null, fileErr: null, nomeExistente: null }; return [...bs.slice(0, idx + 1), copia, ...bs.slice(idx + 1)]; }); }
  function moveBloco(idx: number, dir: number) { setBlocos((bs) => { const j = idx + dir; if (j < 0 || j >= bs.length) return bs; const c = [...bs]; [c[idx], c[j]] = [c[j], c[idx]]; return c; }); }
  function trocarTipo(idx: number, tipo: string) {
    setBlocos((bs) => bs.map((b, i) => { if (i !== idx) return b; if (b.objUrl) URL.revokeObjectURL(b.objUrl); return { ...b, tipo, file: null, objUrl: null, fileErr: null, texto: tipo === 'audio' ? '' : b.texto }; }));
  }
  function setArquivo(idx: number, f: File | null, origem?: string) {
    const b = blocos[idx];
    if (b?.objUrl) URL.revokeObjectURL(b.objUrl);
    if (!f) { patch(idx, { file: null, objUrl: null, fileErr: null }); return; }  // Remover
    const v = midiaValida(b.tipo, f.type, f.name, f.size);
    if (!v.ok) { patch(idx, { file: null, objUrl: null, fileErr: v.erro }); return; }
    patch(idx, { file: f, objUrl: URL.createObjectURL(f), fileErr: null, origemAudio: origem });
  }

  async function confirmar() {
    if (!podeSubmeter) return;
    setErr(null);
    const canalObj = canais.find((c) => c.id === canal);
    const vc = canalValidoParaEnvio(canalObj ? { id: canalObj.id, nome: canalObj.alias, ativo: true, status_integracao: canalObj.status, envio_restrito: canalObj.envioRestrito, conflito_com: canalObj.conflitoCom } : null);
    if (!temTelefone) { setErr('Este contato não tem número acionável.'); return; }
    if (!vc.ok) { setErr(`Canal indisponível: ${vc.motivo}.`); return; }
    if (!Number.isFinite(execMs) || execMs < Date.now() + 60_000) { setErr('Escolha um horário no futuro.'); return; }
    const executarISO = montarInstanteSP(dataISO, hora);
    setBusy(true);
    try {
      if (!builder) {
        // editar/reagendar: bloco único, mídia mantém arquivo (sem upload).
        const b = blocos[0];
        await onSubmit({ modo, canalId: canal, executarISO, tipo: b.tipo, texto: b.tipo === 'audio' ? '' : b.texto.trim() });
      } else {
        // sequência: sobe cada mídia e monta os itens na ordem.
        const itens: SeqItemSubmit[] = [];
        for (const b of blocos) {
          if (b.tipo === 'texto') { itens.push({ tipo: 'texto', texto: b.texto.trim() }); continue; }
          if (!b.file) throw new Error(`Anexe o arquivo da mensagem de ${TIPO_LABEL[b.tipo].toLowerCase()}.`);
          const up = await subirMidiaWa(currentOrg.id, b.file);
          itens.push({ tipo: b.tipo, texto: b.tipo === 'audio' ? '' : b.texto.trim(), midia: { path: up.path, mime: up.mime, nome: up.nome, tamanho: up.tamanho, ...(b.tipo === 'audio' ? { origemAudio: b.origemAudio ?? 'gravacao_painel' } : {}) } });
        }
        await onSubmit({ modo: 'sequencia', canalId: canal, executarISO, itens });
      }
    } catch (e) { setErr((e as Error).message || 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  const horaPreview = hora || '--:--';

  function previewBloco(b: Bloco) {
    const nome = b.file?.name ?? b.nomeExistente ?? null;
    if (b.tipo === 'texto') {
      if (!b.texto.trim()) return <div className="agmod-pv-empty">Escreva a mensagem para pré-visualizar.</div>;
      return <div className="agmod-bubble"><div className="agmod-bubble-txt">{b.texto}</div><div className="agmod-bubble-time">{horaPreview}</div></div>;
    }
    if (!b.file && !b.nomeExistente) return <div className="agmod-pv-empty">{PLACEHOLDER[b.tipo]}</div>;
    return (
      <div className="agmod-bubble agmod-bubble-midia">
        {b.tipo === 'imagem' && (b.objUrl ? <img className="agmod-pv-img" src={b.objUrl} alt="" /> : <div className="agmod-doccard"><IcImg /><span>{nome ?? 'imagem'}</span></div>)}
        {b.tipo === 'video' && (b.objUrl ? <video className="agmod-pv-vid" src={b.objUrl} controls preload="metadata" /> : <div className="agmod-doccard"><IcVideo /><span>{nome ?? 'vídeo'}</span></div>)}
        {b.tipo === 'audio' && <div className="agmod-audio"><span><IcAudio /> {b.objUrl ? 'Áudio gravado' : (nome ?? 'áudio')}</span>{b.objUrl && <audio controls src={b.objUrl} />}</div>}
        {b.tipo === 'documento' && <div className="agmod-doccard"><IcDoc /><span>{nome ?? 'documento'}{b.file ? ` · ${fmtTam(b.file.size)}` : ''}</span></div>}
        {b.tipo !== 'audio' && b.texto.trim() && <div className="agmod-bubble-txt" style={{ marginTop: 6 }}>{b.texto}</div>}
        <div className="agmod-bubble-time">{horaPreview}</div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={titulo} width={860} closeOnBackdrop={!busy}
      footer={<>
        <button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={!podeSubmeter} onClick={confirmar}>{btnLabel}</button>
      </>}>
      <div className="agmod">
        <div className="agmod-cfg">
          <label className="agmod-fld"><span>Enviar por</span>
            <select className="atv-input" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={busy}>
              {canaisAgendaveis.length === 0 && <option value="">Nenhum canal conectado</option>}
              {canaisAgendaveis.map((c) => <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''} — conectado</option>)}
            </select>
          </label>

          {/* Blocos de mensagem */}
          {blocos.map((b, idx) => (
            <div className="agmod-bloco" key={b.key}>
              <div className="agmod-bloco-head">
                <strong>Mensagem {idx + 1}{blocos.length > 1 ? '' : ''}</strong>
                {builder ? (
                  <select className="agmod-bloco-tipo" value={b.tipo} disabled={busy} onChange={(e) => trocarTipo(idx, e.target.value)}>
                    {Object.entries(TIPO_LABEL).map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                ) : <span className="agmod-bloco-tipolbl">{TIPO_LABEL[b.tipo] ?? b.tipo}</span>}
                {builder && (
                  <span className="agmod-bloco-acts">
                    <button type="button" title="Mover para cima" disabled={busy || idx === 0} onClick={() => moveBloco(idx, -1)}>↑</button>
                    <button type="button" title="Mover para baixo" disabled={busy || idx === blocos.length - 1} onClick={() => moveBloco(idx, 1)}>↓</button>
                    <button type="button" title="Duplicar" disabled={busy} onClick={() => dupBloco(idx)}>⧉</button>
                    <button type="button" title="Remover" disabled={busy || blocos.length === 1} onClick={() => removeBloco(idx)}>✕</button>
                  </span>
                )}
              </div>

              {b.tipo === 'texto' ? (
                <textarea className="atv-input agmod-ta" rows={3} maxLength={4096} value={b.texto} disabled={busy || captionRO}
                  placeholder="Escreva a mensagem…" onChange={(e) => patch(idx, { texto: e.target.value })} />
              ) : (
                <>
                  {b.tipo === 'audio' ? (
                    (b.file || b.nomeExistente) ? (
                      <div className="agmod-filecard">
                        <span className="agmod-filenome">{b.file ? 'Áudio gravado' : b.nomeExistente}</span>
                        {b.objUrl && <audio controls src={b.objUrl} style={{ height: 30 }} />}
                        {builder && <button type="button" className="agmod-filebtn" disabled={busy} onClick={() => { if (b.objUrl) URL.revokeObjectURL(b.objUrl); patch(idx, { file: null, objUrl: null }); }}>Remover</button>}
                      </div>
                    ) : (
                      <AudioRecorder permitirArquivo rotuloEnviar="Usar áudio" disabled={busy}
                        onEnviar={async (blob, mime, ext, diag) => { setArquivo(idx, new File([blob], `audio.${ext}`, { type: mime }), (diag?.origem as string) ?? 'gravacao_painel'); }} />
                    )
                  ) : (
                    <BlocoArquivo b={b} idx={idx} busy={busy} travado={!builder} onPick={setArquivo} />
                  )}
                  {b.fileErr && <div className="agmod-fielderr">{b.fileErr}</div>}
                  {b.tipo !== 'audio' && (
                    <textarea className="atv-input agmod-ta" rows={2} maxLength={4096} value={b.texto} disabled={busy || captionRO}
                      placeholder="Legenda (opcional)" onChange={(e) => patch(idx, { texto: e.target.value })} />
                  )}
                </>
              )}
            </div>
          ))}

          {builder && <button type="button" className="agmod-add" disabled={busy || blocos.length >= 20} onClick={addBloco}>+ Adicionar mensagem</button>}
          {!builder && modo !== 'reagendar' && blocos[0]?.tipo !== 'texto' && <div className="agmod-hint">Para trocar o arquivo, cancele e crie um novo agendamento.</div>}

          <div className="agmod-fld"><span>Quando enviar{blocos.length > 1 ? ' (1 min entre cada, na ordem)' : ''}</span>
            <div className="agmod-atalhos">
              {ATALHOS.map((a) => (
                <button key={a.id} type="button" className="agmod-atalho" disabled={busy}
                  onClick={() => { const q = atalhoAgendar(a.id, Date.now()); setDataBR(isoParaDataBR(q.data)); setHora(q.hora); }}>{a.label}</button>
              ))}
            </div>
            <div className="agmod-row2">
              <label className="agmod-sub"><span>Data</span>
                <div className={'agmod-inwrap' + (dataErr ? ' err' : '')}><IcCal />
                  <input className="agmod-inmask" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dataBR} onChange={(e) => setDataBR(mascararDataBR(e.target.value))} disabled={busy} /></div>
              </label>
              <label className="agmod-sub"><span>Hora</span>
                <div className={'agmod-inwrap' + (horaErr ? ' err' : '')}><IcClk />
                  <input className="agmod-inmask" inputMode="numeric" placeholder="HH:mm" maxLength={5} value={hora} onChange={(e) => setHora(mascararHora(e.target.value))} disabled={busy} /></div>
              </label>
            </div>
            {(dataErr || horaErr) && <div className="agmod-fielderr">{dataErr ? 'Data inválida (use DD/MM/AAAA).' : 'Hora inválida (use HH:mm de 00:00 a 23:59).'}</div>}
          </div>

          {resumo && <div className="agmod-resumo">{resumo}{blocos.length > 1 ? ` · ${blocos.length} mensagens` : ''}</div>}
          {aviso && <div className="agmod-aviso">{aviso}</div>}
          {err && <div className="atv-field-err">{err}</div>}
        </div>

        {/* Pré-visualização */}
        <div className="agmod-preview">
          <div className="agmod-pv-head">Pré-visualização</div>
          <div className="agmod-chat">
            {blocos.map((b) => <div key={b.key}>{previewBloco(b)}</div>)}
          </div>
          {canalNome && <div className="agmod-pv-canal">via {canalNome}</div>}
        </div>
      </div>
    </Modal>
  );
}

function BlocoArquivo({ b, idx, busy, travado, onPick }: { b: Bloco; idx: number; busy: boolean; travado: boolean; onPick: (idx: number, f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const nome = b.file?.name ?? b.nomeExistente ?? null;
  if (travado) return <div className="agmod-filecard"><span className="agmod-filenome">{nome ?? '—'}</span><span className="agmod-filemuted">arquivo mantido</span></div>;
  return (
    <>
      <input ref={ref} type="file" accept={ACCEPT[b.tipo]} style={{ display: 'none' }} onChange={(e) => { onPick(idx, e.target.files?.[0] ?? null); if (e.target) e.target.value = ''; }} />
      {b.file ? (
        <div className="agmod-filecard">
          <span className="agmod-filenome" title={b.file.name}>{b.file.name}</span>
          <span className="agmod-filemuted">{fmtTam(b.file.size)}</span>
          <button type="button" className="agmod-filebtn" disabled={busy} onClick={() => ref.current?.click()}>Trocar</button>
          <button type="button" className="agmod-filebtn" disabled={busy} onClick={() => onPick(idx, null)}>Remover</button>
        </div>
      ) : (
        <button type="button" className="agmod-filepick" disabled={busy} onClick={() => ref.current?.click()}>
          Selecionar {b.tipo === 'imagem' ? 'imagem' : b.tipo === 'video' ? 'vídeo' : 'documento'} (até {b.tipo === 'documento' ? 25 : 16} MB)
        </button>
      )}
    </>
  );
}
