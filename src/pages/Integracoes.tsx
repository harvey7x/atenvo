import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { WhatsAppConnect } from '@/components/WhatsAppConnect';
import { useWaCanais, waDisconnect, waRemove } from '@/data/whatsapp';
import './Integracoes.css';

const IcWa = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcFb = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcRefresh = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>;

const WA_ST: Record<string, { t: string; cls: string; dot?: boolean }> = {
  conectado: { t: 'Conectado', cls: 'ok', dot: true },
  sincronizando: { t: 'Sincronizando', cls: 'warn' },
  desconectado: { t: 'Desconectado', cls: 'neutral' },
  atencao: { t: 'Atenção', cls: 'warn' },
  erro: { t: 'Erro', cls: 'err' },
};

export function Integracoes() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const waCanais = useWaCanais();
  const [waOpen, setWaOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const canais = waCanais.data ?? [];
  const conectados = canais.filter((c) => c.status === 'conectado').length;

  function refresh() {
    qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
  }

  async function disconnect(id: string) {
    setBusy(id);
    try { await waDisconnect(currentOrg.id, id); toast('WhatsApp desconectado.'); refresh(); }
    catch (e) { toast((e as Error).message || 'Falha ao desconectar.'); }
    finally { setBusy(null); }
  }
  async function remove(id: string) {
    setBusy(id);
    try { await waRemove(currentOrg.id, id); toast('Número removido. Vaga liberada.'); refresh(); }
    catch (e) { toast((e as Error).message || 'Falha ao remover.'); }
    finally { setBusy(null); }
  }

  return (
    <div className="integracoes-page">
      <div className="content">
        {/* Resumo real */}
        <div className="sum-grid">
          <div className="sum-card"><span className="sum-ic green"><IcCheck /></span><div><div className="lbl">Integrações conectadas</div><div className="val">{conectados}</div></div></div>
          <div className="sum-card"><span className="sum-ic blue"><IcWa /></span><div><div className="lbl">WhatsApp conectados</div><div className="val">{conectados} de 1</div></div></div>
          <div className="sum-card"><span className="sum-ic gray"><IcFb /></span><div><div className="lbl">Facebook conectados</div><div className="val">0 de 1</div></div></div>
        </div>

        {/* WHATSAPP */}
        <section className="int-section">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>WhatsApp</h2><p>Conecte um número lendo o QR Code pelo aplicativo do WhatsApp.</p></div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo wa"><IcWa /></span>
                <div className="ic-ttl"><div className="t">Conector WhatsApp por QR Code <span className="badge blue">Evolution API</span></div><div className="s">Não é a Cloud API oficial da Meta — conexão por leitura de QR Code.</div></div>
              </div>
              <div className="ic-body">
                {!isSupabaseConfigured ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Disponível com o backend configurado.</div></div>
                ) : canais.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhum número conectado ainda. Clique em <b>Conectar WhatsApp</b> para ler o QR Code.</div></div>
                ) : (
                  <div className="kv">
                    {canais.map((c) => (
                      <div className="row" key={c.id}>
                        <div className="k">{c.alias}{c.numero ? ` · ${c.numero}` : ''}</div>
                        <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={'badge ' + (WA_ST[c.status]?.cls || 'neutral')}>{WA_ST[c.status]?.dot && <span className="dot" />}{WA_ST[c.status]?.t || c.status}</span>
                          {c.status === 'conectado' && <button className="btn-sm" disabled={busy === c.id} onClick={() => disconnect(c.id)}>Desconectar</button>}
                          <button className="btn-sm" disabled={busy === c.id} onClick={() => remove(c.id)}>Remover</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="ic-foot">
                {isSupabaseConfigured
                  ? <button className="btn-sm acc" onClick={() => setWaOpen(true)}><IcPlus />Conectar WhatsApp</button>
                  : <button className="btn-sm" onClick={() => toast('Disponível com o backend configurado')}><IcPlus />Conectar WhatsApp</button>}
                <span className="sp" />
                <button className="btn-sm" onClick={() => refresh()}><IcRefresh />Atualizar</button>
              </div>
            </div>
          </div>
        </section>

        {/* FACEBOOK */}
        <section className="int-section">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>Facebook</h2><p>Conecte uma página para receber e responder mensagens do Messenger.</p></div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo meta"><IcFb /></span>
                <div className="ic-ttl"><div className="t">Conta do Facebook <span className="badge neutral">Não conectado</span></div><div className="s">Receber e responder mensagens da sua página no Messenger.</div></div>
              </div>
              <div className="ic-body">
                <div className="adapter-note"><IcInfo /><div className="tx">A conexão do Facebook depende de um aplicativo na Meta (Meta Developers) com permissão de mensagens. Assim que esse app estiver disponível, a conexão é habilitada aqui.</div></div>
              </div>
              <div className="ic-foot">
                <button className="btn-sm acc" onClick={() => toast('Conexão do Facebook em preparação — requer app na Meta.')}><IcPlus />Conectar Facebook</button>
              </div>
            </div>
          </div>
        </section>

        {/* SAÚDE */}
        <section className="int-section">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>Saúde das integrações</h2><p>Eventos recentes de conexões e mensagens.</p></div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-body">
              <div className="adapter-note"><IcInfo /><div className="tx">Nenhum evento recente. Os eventos aparecem aqui após conectar um canal.</div></div>
            </div>
          </div>
        </section>
      </div>

      {waOpen && (
        <WhatsAppConnect
          orgId={currentOrg.id}
          onClose={() => setWaOpen(false)}
          onConnected={refresh}
        />
      )}
    </div>
  );
}
