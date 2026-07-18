import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { mascararNumero } from '@/data/whatsapp';
import {
  canalValidoParaEnvio, podeAgendar, partesSP, montarInstanteSP, defaultQuandoAgendar,
  resumoEnvio, avisoJanelaLonga, atalhoAgendar, type AtalhoAg,
} from '@/lib/agendamentoMensagem';
import './AgendarMensagemModal.css';

export interface CanalOpcao { id: string; alias: string; numero: string | null; status: string; envioRestrito: boolean; conflitoCom: string | null }
export interface AgendarSubmit { canalId: string; texto: string; executarISO: string }

interface Props {
  open: boolean;
  modo: 'criar' | 'editar' | 'reagendar';
  canais: CanalOpcao[];
  temTelefone: boolean;
  ultimaInteracaoMs?: number | null;
  initial?: { canalId?: string; texto?: string; executarEm?: string } | null;
  onClose: () => void;
  /** Roda a mutação; lançar Error mostra a mensagem no modal. Sucesso → o pai fecha. */
  onSubmit: (v: AgendarSubmit) => Promise<void>;
}

const IcText = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2M9 5v14M7 19h4" /></svg>;
const IcImg = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 21" /></svg>;
const IcAudio = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const IcDoc = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>;

const TIPOS = [
  { id: 'texto', label: 'Texto', Icon: IcText, ativo: true },
  { id: 'imagem', label: 'Imagem', Icon: IcImg, ativo: false },
  { id: 'audio', label: 'Áudio', Icon: IcAudio, ativo: false },
  { id: 'documento', label: 'Documento', Icon: IcDoc, ativo: false },
] as const;

const ATALHOS: { id: AtalhoAg; label: string }[] = [
  { id: 'hoje5', label: 'Hoje +5 min' },
  { id: 'hojeTarde', label: 'Hoje à tarde' },
  { id: 'amanha9', label: 'Amanhã 09:00' },
  { id: 'amanha14', label: 'Amanhã 14:00' },
  { id: 'em3dias', label: 'Em 3 dias' },
];

export function AgendarMensagemModal({ open, modo, canais, temTelefone, ultimaInteracaoMs, initial, onClose, onSubmit }: Props) {
  const canaisAgendaveis = canais.filter((c) => canalValidoParaEnvio({
    id: c.id, nome: c.alias, ativo: true, status_integracao: c.status, envio_restrito: c.envioRestrito, conflito_com: c.conflitoCom,
  }).ok);

  const [canal, setCanal] = useState('');
  const [texto, setTexto] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Semeia os campos na ABERTURA (não a cada render/tecla).
  useEffect(() => {
    if (!open) return;
    setErr(null);
    const defCanal = initial?.canalId && canaisAgendaveis.some((c) => c.id === initial.canalId) ? initial.canalId : (canaisAgendaveis[0]?.id ?? '');
    setCanal(defCanal);
    setTexto(initial?.texto ?? '');
    if (modo === 'editar' && initial?.executarEm) {
      const p = partesSP(new Date(initial.executarEm).getTime());
      setData(p.data); setHora(p.hora);
    } else {
      const q = defaultQuandoAgendar(Date.now(), 5);
      setData(q.data); setHora(q.hora);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canalNome = canaisAgendaveis.find((c) => c.id === canal)?.alias ?? null;
  const execMs = data && hora ? new Date(`${data}T${hora}:00-03:00`).getTime() : NaN;
  const resumo = resumoEnvio({ executarEmMs: execMs, agoraMs: Date.now(), canalNome });
  const aviso = avisoJanelaLonga({ executarEmMs: execMs, agoraMs: Date.now(), ultimaInteracaoMs });
  const textoRO = modo === 'reagendar'; // reagendar mantém o texto

  const titulo = modo === 'reagendar' ? 'Reagendar mensagem' : modo === 'editar' ? 'Editar agendamento' : 'Agendar mensagem';
  const btnLabel = busy ? 'Salvando…' : modo === 'reagendar' ? 'Reagendar' : modo === 'editar' ? 'Salvar' : 'Agendar';

  async function confirmar() {
    if (busy) return;
    setErr(null);
    const executarISO = montarInstanteSP(data, hora);
    const canalObj = canais.find((c) => c.id === canal);
    const v = podeAgendar({
      texto, temTelefone,
      canal: canalObj ? { id: canalObj.id, nome: canalObj.alias, ativo: true, status_integracao: canalObj.status, envio_restrito: canalObj.envioRestrito, conflito_com: canalObj.conflitoCom } : null,
      executarEmMs: executarISO ? new Date(executarISO).getTime() : NaN, agoraMs: Date.now(),
    });
    if (!v.ok) { setErr(v.erro); return; }
    setBusy(true);
    try { await onSubmit({ canalId: canal, texto: texto.trim(), executarISO }); }
    catch (e) { setErr((e as Error).message || 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  const horaPreview = hora || '--:--';

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={titulo} width={780} closeOnBackdrop={!busy}
      footer={<>
        <button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="atv-btn primary" disabled={busy} onClick={confirmar}>{btnLabel}</button>
      </>}>
      <div className="agmod">
        {/* Coluna esquerda — composição */}
        <div className="agmod-cfg">
          <label className="agmod-fld"><span>Enviar por</span>
            <select className="atv-input" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={busy}>
              {canaisAgendaveis.length === 0 && <option value="">Nenhum canal conectado</option>}
              {canaisAgendaveis.map((c) => <option key={c.id} value={c.id}>{c.alias}{c.numero ? ' · ' + mascararNumero(c.numero) : ''} — conectado</option>)}
            </select>
          </label>

          <div className="agmod-fld"><span>Tipo de mensagem</span>
            <div className="agmod-tipos">
              {TIPOS.map((t) => (
                <button key={t.id} type="button" className={'agmod-tipo' + (t.id === 'texto' ? ' on' : '') + (t.ativo ? '' : ' off')}
                  disabled={!t.ativo || busy} title={t.ativo ? t.label : 'Disponível na próxima fase'}>
                  <t.Icon /><span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="agmod-hint">Imagem, áudio e documento chegam na próxima fase.</div>
          </div>

          <label className="agmod-fld"><span>Mensagem</span>
            <textarea className="atv-input agmod-ta" rows={5} maxLength={4096} value={texto} disabled={busy || textoRO}
              placeholder="Escreva a mensagem que será enviada automaticamente…" onChange={(e) => setTexto(e.target.value)} />
            <div className="agmod-count">{texto.length}/4096{textoRO ? ' · reagendar mantém o texto' : ''}</div>
          </label>

          <div className="agmod-fld"><span>Quando enviar</span>
            <div className="agmod-atalhos">
              {ATALHOS.map((a) => (
                <button key={a.id} type="button" className="agmod-atalho" disabled={busy}
                  onClick={() => { const q = atalhoAgendar(a.id, Date.now()); setData(q.data); setHora(q.hora); }}>{a.label}</button>
              ))}
            </div>
            <div className="agmod-row2">
              <label className="agmod-sub"><span>Data</span><input type="date" className="atv-input" value={data} onChange={(e) => setData(e.target.value)} disabled={busy} /></label>
              <label className="agmod-sub"><span>Hora</span><input type="time" className="atv-input" value={hora} onChange={(e) => setHora(e.target.value)} disabled={busy} /></label>
            </div>
          </div>

          {resumo && <div className="agmod-resumo">{resumo}</div>}
          {aviso && <div className="agmod-aviso">{aviso}</div>}
          {err && <div className="atv-field-err">{err}</div>}
        </div>

        {/* Coluna direita — pré-visualização */}
        <div className="agmod-preview">
          <div className="agmod-pv-head">Pré-visualização</div>
          <div className="agmod-chat">
            {!texto.trim() && <div className="agmod-pv-empty">Pré-visualização da mensagem aparecerá aqui.</div>}
            {texto.trim() && (
              <div className="agmod-bubble">
                <div className="agmod-bubble-txt">{texto}</div>
                <div className="agmod-bubble-time">{horaPreview}</div>
              </div>
            )}
          </div>
          {canalNome && <div className="agmod-pv-canal">via {canalNome}</div>}
        </div>
      </div>
    </Modal>
  );
}
