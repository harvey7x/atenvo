import { useEffect, useRef, useState } from 'react';
import { useOrg } from '@/context/OrgContext';
import { mascararNumero, subirMidiaWa } from '@/data/whatsapp';
// Gravador reusado do v1 (componente funcional isolado; visual v2 fica para a sessão do WhatsApp)
import { AudioRecorder } from '@/components/AudioRecorder';
import {
  canalValidoParaEnvio, partesSP, montarInstanteSP, defaultQuandoAgendar,
  resumoEnvio, avisoJanelaLonga, atalhoAgendar, midiaValida, type AtalhoAg,
  mascararHora, horaValida, mascararDataBR, dataBRparaISO, isoParaDataBR,
} from '@/lib/agendamentoMensagem';
import { BotaoMini, BotaoPrimario, BotaoSec, Input, ModalV2 } from '../components';
import './agendamentos.css';

/* Porta fiel de src/components/AgendarMensagemModal.tsx (somente leitura):
   mesmos modos (criar=sequência de até 20 blocos / editar / reagendar),
   mesmas validações da lib pura (máscaras SP, podeAgendar, midiaValida),
   mesmos textos. Preview nas bolhas do mockup. */

export interface CanalOpcao { id: string; alias: string; numero: string | null; status: string; envioRestrito: boolean; conflitoCom: string | null }
export interface MidiaSubmit { path: string; mime: string; nome: string; tamanho: number; origemAudio?: string }
export interface SeqItemSubmit { tipo: string; texto: string; midia?: MidiaSubmit | null }
export interface AgendarSubmit {
  modo: 'sequencia' | 'editar' | 'reagendar';
  canalId: string; executarISO: string;
  tipo?: string; texto?: string;
  itens?: SeqItemSubmit[];
}

interface Props {
  aberto: boolean;
  modo: 'criar' | 'editar' | 'reagendar';
  canais: CanalOpcao[];
  temTelefone: boolean;
  /** demo: mídia não sobe para o Storage (fica só o nome). */
  demo?: boolean;
  ultimaInteracaoMs?: number | null;
  initial?: { canalId?: string; texto?: string; executarEm?: string; tipo?: string; nomeArquivo?: string } | null;
  aoFechar: () => void;
  aoSubmeter: (v: AgendarSubmit) => Promise<void>;
}

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
const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

interface Bloco { key: number; tipo: string; texto: string; file: File | null; objUrl: string | null; fileErr: string | null; nomeExistente?: string | null; origemAudio?: string }

export function AgendarMensagemModalV2({ aberto, modo, canais, temTelefone, demo, ultimaInteracaoMs, initial, aoFechar, aoSubmeter }: Props) {
  const { currentOrg } = useOrg();
  const builder = modo === 'criar';
  const legendaRO = modo === 'reagendar';
  const canaisAgendaveis = canais.filter((c) => canalValidoParaEnvio({
    id: c.id, nome: c.alias, ativo: true, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom,
  }).ok);

  const [canal, setCanal] = useState('');
  const [dataBR, setDataBR] = useState('');
  const [hora, setHora] = useState('');
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [durMap, setDurMap] = useState<Record<number, number>>({});
  const keyRef = useRef(0);
  const novaKey = () => ++keyRef.current;

  useEffect(() => {
    if (!aberto) return;
    setErr(null); setBusy(false);
    const defCanal = initial?.canalId && canaisAgendaveis.some((c) => c.id === initial.canalId) ? initial.canalId : (canaisAgendaveis[0]?.id ?? '');
    setCanal(defCanal);
    const q = (modo === 'editar' && initial?.executarEm) ? partesSP(new Date(initial.executarEm).getTime()) : defaultQuandoAgendar(Date.now(), 5);
    setDataBR(isoParaDataBR(q.data)); setHora(q.hora);
    setBlocos(builder
      ? [{ key: novaKey(), tipo: 'texto', texto: '', file: null, objUrl: null, fileErr: null }]
      : [{ key: novaKey(), tipo: initial?.tipo ?? 'texto', texto: initial?.texto ?? '', file: null, objUrl: null, fileErr: null, nomeExistente: initial?.nomeArquivo ?? null }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => { if (!aberto) blocos.forEach((b) => b.objUrl && URL.revokeObjectURL(b.objUrl)); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!f) { patch(idx, { file: null, objUrl: null, fileErr: null }); return; }
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
        const b = blocos[0];
        await aoSubmeter({ modo, canalId: canal, executarISO, tipo: b.tipo, texto: b.tipo === 'audio' ? '' : b.texto.trim() });
      } else {
        const itens: SeqItemSubmit[] = [];
        for (const b of blocos) {
          if (b.tipo === 'texto') { itens.push({ tipo: 'texto', texto: b.texto.trim() }); continue; }
          if (!b.file) throw new Error(`Anexe o arquivo da mensagem de ${TIPO_LABEL[b.tipo].toLowerCase()}.`);
          if (demo) {
            itens.push({ tipo: b.tipo, texto: b.tipo === 'audio' ? '' : b.texto.trim(), midia: { path: `demo/${b.file.name}`, mime: b.file.type, nome: b.file.name, tamanho: b.file.size } });
          } else {
            const up = await subirMidiaWa(currentOrg.id, b.file);
            itens.push({ tipo: b.tipo, texto: b.tipo === 'audio' ? '' : b.texto.trim(), midia: { path: up.path, mime: up.mime, nome: up.nome, tamanho: up.tamanho, ...(b.tipo === 'audio' ? { origemAudio: b.origemAudio ?? 'gravacao_painel' } : {}) } });
          }
        }
        await aoSubmeter({ modo: 'sequencia', canalId: canal, executarISO, itens });
      }
    } catch (e) { setErr((e as Error).message || 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  const horaPreview = hora || '--:--';

  function previewBloco(b: Bloco) {
    const nome = b.file?.name ?? b.nomeExistente ?? null;
    if (b.tipo === 'texto') {
      if (!b.texto.trim()) return <div className="vazio-pv">Escreva a mensagem para pré-visualizar.</div>;
      return <div className="bolha">{b.texto}<div className="hh num">{horaPreview}</div></div>;
    }
    if (!b.file && !b.nomeExistente) return <div className="vazio-pv">{PLACEHOLDER[b.tipo]}</div>;
    return (
      <div className="bolha">
        {b.tipo === 'imagem' && (b.objUrl ? <img src={b.objUrl} alt="" /> : <div className="agc-doc">🖼 {nome ?? 'imagem'}</div>)}
        {b.tipo === 'video' && (b.objUrl ? <video src={b.objUrl} controls preload="metadata" /> : <div className="agc-doc">▶ {nome ?? 'vídeo'}</div>)}
        {b.tipo === 'audio' && (
          <div className="agc-doc">
            ▶ Áudio {durMap[b.key] ? `· ${mmss(durMap[b.key])}` : ''}
            {b.objUrl && <audio style={{ display: 'none' }} preload="metadata" src={b.objUrl}
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setDurMap((m) => ({ ...m, [b.key]: d })); }} />}
          </div>
        )}
        {b.tipo === 'documento' && <div className="agc-doc">📄 {nome ?? 'documento'}{b.file ? ` · ${fmtTam(b.file.size)}` : ''}</div>}
        {b.tipo !== 'audio' && b.texto.trim() && <div style={{ marginTop: 6 }}>{b.texto}</div>}
        <div className="hh num">{horaPreview}</div>
      </div>
    );
  }

  return (
    <ModalV2
      aberto={aberto}
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={860}
      titulo={titulo}
      rodape={
        <>
          <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
          <BotaoPrimario disabled={!podeSubmeter} onClick={confirmar}>{btnLabel}</BotaoPrimario>
        </>
      }
    >
      <div className="agc">
        <div className="agc-col">
          <div className="campo">
            <label>Enviar por</label>
            <select className="inp" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={busy}>
              {canaisAgendaveis.length === 0 && <option value="">Nenhum canal conectado</option>}
              {canaisAgendaveis.map((c) => <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''} — conectado</option>)}
            </select>
          </div>

          {blocos.map((b, idx) => (
            <div className="agc-bloco" key={b.key}>
              <div className="agc-bloco-cab">
                <strong>Mensagem {idx + 1}</strong>
                {builder ? (
                  <select className="inp" style={{ width: 'auto', height: 28, fontSize: 11.5 }} value={b.tipo} disabled={busy} onChange={(e) => trocarTipo(idx, e.target.value)}>
                    {Object.entries(TIPO_LABEL).map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                ) : <span style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>{TIPO_LABEL[b.tipo] ?? b.tipo}</span>}
                {builder && (
                  <span className="agc-bloco-acoes">
                    <button type="button" title="Mover para cima" disabled={busy || idx === 0} onClick={() => moveBloco(idx, -1)}>↑</button>
                    <button type="button" title="Mover para baixo" disabled={busy || idx === blocos.length - 1} onClick={() => moveBloco(idx, 1)}>↓</button>
                    <button type="button" title="Duplicar" disabled={busy} onClick={() => dupBloco(idx)}>⧉</button>
                    <button type="button" title="Remover" disabled={busy || blocos.length === 1} onClick={() => removeBloco(idx)}>✕</button>
                  </span>
                )}
              </div>

              {b.tipo === 'texto' ? (
                <textarea className="inp" rows={3} maxLength={4096} value={b.texto} disabled={busy || legendaRO}
                  placeholder="Escreva a mensagem…" onChange={(e) => patch(idx, { texto: e.target.value })} />
              ) : (
                <>
                  {b.tipo === 'audio' ? (
                    (b.file || b.nomeExistente) ? (
                      <div className="agc-file">
                        <span className="nome">{b.file ? 'Áudio gravado' : b.nomeExistente}</span>
                        {b.objUrl && <audio controls src={b.objUrl} style={{ height: 30 }} />}
                        {builder && <BotaoMini disabled={busy} onClick={() => { if (b.objUrl) URL.revokeObjectURL(b.objUrl); patch(idx, { file: null, objUrl: null }); }}>Remover</BotaoMini>}
                      </div>
                    ) : (
                      <AudioRecorder permitirArquivo rotuloEnviar="Usar áudio" disabled={busy}
                        onEnviar={async (blob, mime, ext, diag) => { setArquivo(idx, new File([blob], `audio.${ext}`, { type: mime }), (diag?.origem as string) ?? 'gravacao_painel'); }} />
                    )
                  ) : (
                    <BlocoArquivoV2 b={b} idx={idx} busy={busy} travado={!builder} aoEscolher={setArquivo} />
                  )}
                  {b.fileErr && <div className="aviso-inline erro" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>{b.fileErr}</div>}
                  {b.tipo !== 'audio' && (
                    <textarea className="inp" rows={2} maxLength={4096} value={b.texto} disabled={busy || legendaRO} style={{ marginTop: 8 }}
                      placeholder="Legenda (opcional)" onChange={(e) => patch(idx, { texto: e.target.value })} />
                  )}
                </>
              )}
            </div>
          ))}

          {builder && <button type="button" className="agc-add" disabled={busy || blocos.length >= 20} onClick={addBloco}>+ Adicionar mensagem</button>}
          {!builder && modo !== 'reagendar' && blocos[0]?.tipo !== 'texto' && (
            <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>Para trocar o arquivo, cancele e crie um novo agendamento.</div>
          )}

          <div className="campo">
            <label>Quando enviar{blocos.length > 1 ? ' (1 min entre cada, na ordem)' : ''}</label>
            <div className="agc-atalhos">
              {ATALHOS.map((a) => (
                <BotaoMini key={a.id} disabled={busy}
                  onClick={() => { const q = atalhoAgendar(a.id, Date.now()); setDataBR(isoParaDataBR(q.data)); setHora(q.hora); }}>{a.label}</BotaoMini>
              ))}
            </div>
            <div className="agc-2col">
              <div className={dataErr ? 'campo invalida' : 'campo'} style={{ marginBottom: 0 }}>
                <label htmlFor="agc-data" style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>Data</label>
                <Input id="agc-data" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} value={dataBR}
                  onChange={(e) => setDataBR(mascararDataBR(e.target.value))} disabled={busy} className="num" />
              </div>
              <div className={horaErr ? 'campo invalida' : 'campo'} style={{ marginBottom: 0 }}>
                <label htmlFor="agc-hora" style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>Hora</label>
                <Input id="agc-hora" inputMode="numeric" placeholder="HH:mm" maxLength={5} value={hora}
                  onChange={(e) => setHora(mascararHora(e.target.value))} disabled={busy} className="num" />
              </div>
            </div>
            {(dataErr || horaErr) && <small className="hint">{dataErr ? 'Data inválida (use DD/MM/AAAA).' : 'Hora inválida (use HH:mm de 00:00 a 23:59).'}</small>}
          </div>

          {resumo && <div className="agc-resumo">{resumo}{blocos.length > 1 ? ` · ${blocos.length} mensagens` : ''}</div>}
          {aviso && <div className="agc-aviso">{aviso}</div>}
          {err && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{err}</div>}
        </div>

        <div className="agc-preview">
          <div className="agc-pv-cab">Pré-visualização</div>
          <div className="agc-chat">
            {blocos.map((b) => <div key={b.key} style={{ display: 'flex', flexDirection: 'column' }}>{previewBloco(b)}</div>)}
          </div>
          {canalNome && <div className="agc-pv-canal">via {canalNome}</div>}
        </div>
      </div>
    </ModalV2>
  );
}

function BlocoArquivoV2({ b, idx, busy, travado, aoEscolher }: { b: Bloco; idx: number; busy: boolean; travado: boolean; aoEscolher: (idx: number, f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const nome = b.file?.name ?? b.nomeExistente ?? null;
  if (travado) return <div className="agc-file"><span className="nome">{nome ?? '—'}</span><span>arquivo mantido</span></div>;
  return (
    <>
      <input ref={ref} type="file" accept={ACCEPT[b.tipo]} style={{ display: 'none' }} onChange={(e) => { aoEscolher(idx, e.target.files?.[0] ?? null); if (e.target) e.target.value = ''; }} />
      {b.file ? (
        <div className="agc-file">
          <span className="nome" title={b.file.name}>{b.file.name}</span>
          <span>{fmtTam(b.file.size)}</span>
          <BotaoMini disabled={busy} onClick={() => ref.current?.click()}>Trocar</BotaoMini>
          <BotaoMini disabled={busy} onClick={() => aoEscolher(idx, null)}>Remover</BotaoMini>
        </div>
      ) : (
        <button type="button" className="agc-pick" disabled={busy} onClick={() => ref.current?.click()}>
          Selecionar {b.tipo === 'imagem' ? 'imagem' : b.tipo === 'video' ? 'vídeo' : 'documento'} (até {b.tipo === 'documento' ? 25 : 16} MB)
        </button>
      )}
    </>
  );
}
