import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { WhatsAppConnect } from '@/components/WhatsAppConnect';
import { useWaCanais, waRemove } from '@/data/whatsapp';
import { FB_REAL, useFbStatus, fbAuthStart, fbPages, fbConnect, fbDisconnect } from '@/data/facebook';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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

const FB_MOTIVO: Record<string, string> = {
  login: 'Login do Facebook cancelado ou negado.',
  state: 'Sessão de conexão inválida ou expirada. Tente novamente.',
  config: 'Configuração da Meta ausente no servidor.',
  vault: 'Falha ao guardar a credencial com segurança.',
  sessao: 'Não foi possível iniciar a seleção de Página.',
  meta: 'A Meta recusou a autorização. Verifique permissões do app.',
};

export function Integracoes() {
  const { toast } = useToast();
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const waCanais = useWaCanais();
  const fbStatus = useFbStatus();
  const [waOpen, setWaOpen] = useState(false);
  const [busy] = useState<string | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSel, setFbSel] = useState<{ id: string; nome: string }[] | null>(null);
  const [fbCode, setFbCode] = useState<string | null>(null);
  const [remocao, setRemocao] = useState<{ tipo: 'whatsapp' | 'facebook'; id: string; nome: string } | null>(null);
  const [remLoading, setRemLoading] = useState(false);

  async function confirmarRemocao() {
    if (!remocao) return;
    setRemLoading(true);
    try {
      if (remocao.tipo === 'whatsapp') await waRemove(currentOrg.id, remocao.id);
      else await fbDisconnect(remocao.id);
      toast('Conexão removida.'); refresh(); setRemocao(null);
    } catch (e) { toast((e as Error).message || 'Falha ao remover.', 'warn'); }
    finally { setRemLoading(false); }
  }

  const canais = waCanais.data ?? [];
  const conectados = canais.filter((c) => c.status === 'conectado').length;
  const fbPaginas = fbStatus.data ?? [];
  const fbConectadas = fbPaginas.filter((p) => p.estado === 'conectado').length;

  // Retorno do OAuth: ?tab=facebook&fb=connect&code=... ou &fb=error&motivo=...
  useEffect(() => {
    const fb = params.get('fb');
    if (!fb) return;
    if (fb === 'error') { toast(FB_MOTIVO[params.get('motivo') || ''] || 'Falha ao conectar o Facebook.', 'warn'); limparParams(); return; }
    if (fb === 'connect') {
      const code = params.get('code');
      if (code) {
        setFbBusy(true);
        fbPages(code)
          .then((r) => { setFbCode(code); setFbSel(r.paginas); if (!r.paginas.length) toast('Nenhuma Página disponível nesta conta.', 'warn'); })
          .catch((e) => toast((e as Error).message || 'Sessão inválida.', 'warn'))
          .finally(() => { setFbBusy(false); limparParams(); });
      } else limparParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limparParams() {
    const p = new URLSearchParams(params); p.delete('fb'); p.delete('code'); p.delete('motivo');
    setParams(p, { replace: true });
  }
  function refresh() {
    qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['wa-conversas', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-status', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['fb-conversas', currentOrg.id] });
  }

  async function fbIniciar() {
    setFbBusy(true);
    try { const { url } = await fbAuthStart(); window.location.assign(url); }
    catch (e) {
      const msg = (e as Error).message || '';
      toast(msg.includes('forbidden') || msg.toLowerCase().includes('permiss') ? 'Sem permissão. Apenas admin/supervisor conecta o Facebook.' : (msg.includes('config') ? 'Configuração da Meta ausente no servidor.' : (msg || 'Falha ao iniciar conexão.')), 'warn');
      setFbBusy(false);
    }
  }
  async function fbEscolher(paginaId: string) {
    if (!fbCode) return;
    setFbBusy(true);
    try { const r = await fbConnect(fbCode, paginaId); toast(`Página conectada: ${r.pagina_nome}`); setFbSel(null); setFbCode(null); refresh(); }
    catch (e) {
      const msg = (e as Error).message || '';
      toast(msg.includes('outra_org') ? 'Esta Página já está vinculada a outra organização.' : (msg || 'Falha ao conectar a Página.'), 'warn');
    }
    finally { setFbBusy(false); }
  }

  const fbTokenBadge = (p: { estado: string; token_status: string | null; webhook_assinado: boolean }) => {
    if (p.estado !== 'conectado') return { t: 'Desconectado', cls: 'neutral' };
    if (p.token_status && p.token_status !== 'valido') return { t: 'Token inválido', cls: 'err' };
    if (!p.webhook_assinado) return { t: 'Webhook pendente', cls: 'warn' };
    return { t: 'Conectado', cls: 'ok', dot: true };
  };

  return (
    <div className="integracoes-page">
      <div className="content">
        <div className="sum-grid">
          <div className="sum-card"><span className="sum-ic green"><IcCheck /></span><div><div className="lbl">Integrações conectadas</div><div className="val">{conectados + fbConectadas}</div></div></div>
          <div className="sum-card"><span className="sum-ic blue"><IcWa /></span><div><div className="lbl">WhatsApp conectados</div><div className="val">{conectados} de 1</div></div></div>
          <div className="sum-card"><span className="sum-ic gray"><IcFb /></span><div><div className="lbl">Facebook conectados</div><div className="val">{fbConectadas}</div></div></div>
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
                          {c.status === 'conectado' && <button className="btn-sm" disabled={busy === c.id} onClick={() => setWaOpen(true)}>Reconectar</button>}
                          <button className="btn-sm" style={{ color: 'var(--err)', borderColor: 'var(--err)' }} disabled={busy === c.id} onClick={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + c.numero : '') })}>Remover conexão</button>
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
        <section className="int-section" id="facebook">
          <div className="sec-head"><h2><svg className="si" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" /></svg>Facebook</h2><p>Conecte uma Página para receber e responder mensagens do Messenger.</p></div>
          <div className="int-grid">
            <div className="int-card">
              <div className="ic-head">
                <span className="ic-logo meta"><IcFb /></span>
                <div className="ic-ttl"><div className="t">Conta do Facebook {fbConectadas > 0 ? <span className="badge ok"><span className="dot" />Conectado</span> : <span className="badge neutral">Não conectado</span>}</div><div className="s">Receber e responder mensagens da sua Página no Messenger (somente texto).</div></div>
              </div>
              <div className="ic-body">
                {!FB_REAL ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Disponível com o backend configurado.</div></div>
                ) : fbSel ? (
                  <div className="kv">
                    <div className="row"><div className="k" style={{ fontWeight: 600 }}>Escolha a Página para conectar</div><div className="v" /></div>
                    {fbSel.length === 0 && <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página encontrada nesta conta do Facebook. Você precisa ser <b>administrador de uma Página</b> e, na tela de autorização da Meta, <b>marcar a Página</b> que deseja conectar. Crie/assuma uma Página e clique novamente em “Conectar com Facebook”.</div></div>}
                    {fbSel.map((p) => (
                      <div className="row" key={p.id}>
                        <div className="k">{p.nome}</div>
                        <div className="v"><button className="btn-sm acc" disabled={fbBusy} onClick={() => fbEscolher(p.id)}>Conectar esta Página</button></div>
                      </div>
                    ))}
                    <div className="row"><div className="k" /><div className="v"><button className="btn-sm" disabled={fbBusy} onClick={() => { setFbSel(null); setFbCode(null); }}>Cancelar</button></div></div>
                  </div>
                ) : fbPaginas.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página conectada. Clique em <b>Conectar com Facebook</b> para autorizar e escolher a Página.</div></div>
                ) : (
                  <div className="kv">
                    {fbPaginas.map((p) => {
                      const b = fbTokenBadge(p);
                      return (
                        <div className="row" key={p.id}>
                          <div className="k">{p.pagina_nome || p.pagina_id}</div>
                          <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={'badge ' + b.cls}>{'dot' in b && b.dot && <span className="dot" />}{b.t}</span>
                            {p.estado === 'conectado'
                              ? <>
                                  <button className="btn-sm" disabled={fbBusy} onClick={fbIniciar}>Reconectar</button>
                                  <button className="btn-sm" style={{ color: 'var(--err)', borderColor: 'var(--err)' }} disabled={busy === p.canal_id} onClick={() => setRemocao({ tipo: 'facebook', id: p.canal_id, nome: p.pagina_nome || p.pagina_id })}>Remover conexão</button>
                                </>
                              : <button className="btn-sm acc" disabled={fbBusy} onClick={fbIniciar}>Reconectar</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="ic-foot">
                {FB_REAL
                  ? <button className="btn-sm acc" disabled={fbBusy || !!fbSel} onClick={fbIniciar}><IcPlus />{fbBusy ? 'Conectando…' : 'Conectar com Facebook'}</button>
                  : <button className="btn-sm" onClick={() => toast('Disponível com o backend configurado')}><IcPlus />Conectar com Facebook</button>}
                <span className="sp" />
                <button className="btn-sm" onClick={() => refresh()}><IcRefresh />Atualizar</button>
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
        <WhatsAppConnect orgId={currentOrg.id} onClose={() => setWaOpen(false)} onConnected={refresh} />
      )}

      <ConfirmDialog
        open={!!remocao}
        title="Remover conexão"
        message={remocao ? `O canal "${remocao.nome}" será ${remocao.tipo === 'whatsapp' ? 'removido (vaga liberada)' : 'desconectado'}. O histórico de conversas e mensagens é preservado e você poderá reconectar depois.` : ''}
        destructive loading={remLoading} confirmLabel="Remover conexão"
        onConfirm={confirmarRemocao} onCancel={() => { if (!remLoading) setRemocao(null); }} />
    </div>
  );
}
