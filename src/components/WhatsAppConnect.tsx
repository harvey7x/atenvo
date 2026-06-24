import { useEffect, useRef, useState } from 'react';
import { waCreateInstance, waQr, waStatus, waRemove } from '@/data/whatsapp';
import { useToast } from '@/hooks/useToast';

const FONTES: { slug: string; nome: string }[] = [
  { slug: 'trafego_1', nome: 'Tráfego 1' },
  { slug: 'trafego_2', nome: 'Tráfego 2' },
  { slug: 'sistema_ura', nome: 'Sistema URA' },
  { slug: 'organico', nome: 'Orgânico' },
  { slug: 'outra', nome: 'Outra' },
];

type Stage = 'form' | 'qr' | 'connected';

export function WhatsAppConnect({ orgId, onClose, onConnected }: { orgId: string; onClose: () => void; onConnected: () => void }) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>('form');
  const [alias, setAlias] = useState('');
  const [fonte, setFonte] = useState('trafego_1');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secs, setSecs] = useState(60);
  const [numero, setNumero] = useState<string | null>(null);
  const canalId = useRef<string | null>(null);
  const connectedRef = useRef(false);

  async function start() {
    if (!alias.trim()) { toast('Informe o alias do canal.'); return; }
    setBusy(true);
    try {
      const r = await waCreateInstance(orgId, alias.trim(), fonte);
      canalId.current = r.canal_id;
      setQr(r.qr_base64);
      setSecs(r.expires_in || 60);
      setStage('qr');
      if (!r.qr_base64) void refreshQr();
    } catch (e) {
      toast((e as Error).message || 'Falha ao iniciar a conexão.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshQr() {
    if (!canalId.current) return;
    try {
      const r = await waQr(orgId, canalId.current);
      setQr(r.qr_base64);
      setSecs(r.expires_in || 60);
    } catch { /* mantém QR atual */ }
  }

  // contador de expiração: ao zerar, gera novo QR
  useEffect(() => {
    if (stage !== 'qr') return;
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { void refreshQr(); return 60; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // polling de status até conectar
  useEffect(() => {
    if (stage !== 'qr') return;
    const t = setInterval(async () => {
      if (!canalId.current || connectedRef.current) return;
      try {
        const r = await waStatus(orgId, canalId.current);
        if (r.connected) {
          connectedRef.current = true;
          setNumero(r.numero ?? null);
          setStage('connected');
          onConnected();
        }
      } catch { /* tenta de novo */ }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  async function cancel() {
    // se ainda não conectou, remove a instância para liberar a vaga
    if (stage === 'qr' && canalId.current && !connectedRef.current) {
      try { await waRemove(orgId, canalId.current); onConnected(); } catch { /* ignore */ }
    }
    onClose();
  }

  return (
    <div className="backdrop show" onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div>
            <div className="modal-kicker">Conector WhatsApp por QR Code</div>
            <h3>{stage === 'connected' ? 'WhatsApp conectado' : 'Conectar WhatsApp'}</h3>
          </div>
          <button className="modal-x" aria-label="Fechar" onClick={cancel}>×</button>
        </div>

        <div className="modal-body">
          {stage === 'form' && (
            <>
              <p className="lead">Conecte um número lendo o QR Code pelo aplicativo do WhatsApp. Nenhuma senha é digitada aqui.</p>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Alias do canal</label>
                <input className="ctrl" placeholder="Ex.: Chip 1" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={40} />
              </div>
              <div className="field">
                <label>Fonte de aquisição</label>
                <select className="ctrl" value={fonte} onChange={(e) => setFonte(e.target.value)}>
                  {FONTES.map((f) => <option key={f.slug} value={f.slug}>{f.nome}</option>)}
                </select>
              </div>
            </>
          )}

          {stage === 'qr' && (
            <div style={{ textAlign: 'center' }}>
              <p className="lead">Abra o WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para o código.</p>
              <div style={{ width: 240, height: 240, margin: '0 auto', display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 12, padding: 8 }}>
                {qr ? <img src={qr} alt="QR Code do WhatsApp" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ color: '#555', fontSize: 13 }}>Gerando QR Code…</span>}
              </div>
              <div style={{ marginTop: 12, color: 'var(--muted, #889)', fontSize: 13 }}>
                {secs > 0 ? <>Expira em <b>{secs}s</b> · renova automaticamente</> : 'Gerando novo QR Code…'}
              </div>
              <div style={{ marginTop: 8, color: 'var(--muted, #889)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#f5b041', display: 'inline-block' }} />
                Aguardando leitura…
              </div>
            </div>
          )}

          {stage === 'connected' && (
            <div style={{ textAlign: 'center', padding: '14px 0' }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: 999, background: 'rgba(25,195,125,.15)', color: '#19C37D', display: 'grid', placeItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 style={{ margin: '0 0 6px' }}>Conectado com sucesso</h3>
              <p className="lead" style={{ margin: 0 }}>
                {numero ? <>Número <b>{numero}</b> conectado.</> : 'Número conectado.'} Ele já aparece em <b>Configurações → Canais</b>.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {stage === 'form' && (<>
            <button className="btn-ghost" onClick={cancel}>Cancelar</button>
            <span className="sp" />
            <button className="btn-primary" disabled={busy} onClick={start}>{busy ? 'Criando instância…' : 'Conectar WhatsApp'}</button>
          </>)}
          {stage === 'qr' && (<>
            <button className="btn-ghost" onClick={cancel}>Cancelar</button>
            <span className="sp" />
            <button className="btn-ghost" onClick={() => void refreshQr()}>Gerar novo QR</button>
          </>)}
          {stage === 'connected' && (
            <button className="btn-primary" style={{ flex: 1 }} onClick={onClose}>Concluir</button>
          )}
        </div>
      </div>
    </div>
  );
}
