import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { WhatsAppConnect } from '@/components/WhatsAppConnect';
import { useWaCanais, waRemove, mascararNumero, useFontesAquisicao, waUpdateComercial, type WaCanal, type ComercialInput } from '@/data/whatsapp';
import { FB_REAL, useFbStatus, fbAuthStart, fbPages, fbConnect, fbDisconnect } from '@/data/facebook';
import { useOrgUsuarios } from '@/data/atendimento';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import './Integracoes.css';

const ORIGEM_TIPOS = [
  { id: 'trafego', r: 'Tráfego' }, { id: 'ura', r: 'URA' }, { id: 'organico', r: 'Orgânico' },
  { id: 'indicacao', r: 'Indicação' }, { id: 'campanha', r: 'Campanha' }, { id: 'parceiro', r: 'Parceiro' }, { id: 'outro', r: 'Outro' },
];
const tipoOrigemLabel = (t: string | null) => ORIGEM_TIPOS.find((x) => x.id === t)?.r || null;

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
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSel, setFbSel] = useState<{ id: string; nome: string }[] | null>(null);
  const [fbCode, setFbCode] = useState<string | null>(null);
  const [remocao, setRemocao] = useState<{ tipo: 'whatsapp' | 'facebook'; id: string; nome: string } | null>(null);
  const [remLoading, setRemLoading] = useState(false);
  const [config, setConfig] = useState<WaCanal | null>(null);
  const podeConfig = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  async function confirmarRemocao() {
    if (!remocao) return;
    setRemLoading(true);
    try {
      if (remocao.tipo === 'whatsapp') await waRemove(currentOrg.id, remocao.id);
      else await fbDisconnect(remocao.id);
      toast('Conexão removida.'); refresh(); setRemocao(null);
    } catch (e) {
      // Falha parcial: não fingir sucesso — mantém o item, registra o erro técnico e avisa o usuário.
      console.error('[integracoes] falha ao remover conexão', remocao, e);
      toast((e as Error).message || 'Falha ao remover a conexão. Tente novamente.', 'warn');
    }
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
                  <div className="conn-list">
                    {canais.map((c) => {
                      const st = WA_ST[c.status] || { t: c.status, cls: 'neutral' };
                      const removendo = remLoading && remocao?.tipo === 'whatsapp' && remocao?.id === c.id;
                      return (
                        <div className="conn-row" key={c.id}>
                          <div className="conn-info">
                            <span className="conn-name">{c.alias}</span>
                            <span className="conn-sub">
                              {c.numero ? mascararNumero(c.numero) : 'Número não identificado'}
                              {tipoOrigemLabel(c.origemTipo) ? ` · ${tipoOrigemLabel(c.origemTipo)}` : ''}
                              {c.gestorNome ? ` · Gestor: ${c.gestorNome}` : ''}
                            </span>
                            {!c.origemTipo && !c.gestorId && <span className="conn-sub" style={{ color: 'var(--warn)' }}>Origem comercial não configurada</span>}
                          </div>
                          <div className="conn-actions">
                            <span className={'badge ' + st.cls}>{st.dot && <span className="dot" />}{st.t}</span>
                            {podeConfig && <button className="btn-sm" disabled={removendo} onClick={() => setConfig(c)}>Configurar origem comercial</button>}
                            {c.status === 'conectado' && <button className="btn-sm" disabled={removendo} onClick={() => setWaOpen(true)}>Reconectar</button>}
                            <button className="btn-sm danger" disabled={removendo} onClick={() => setRemocao({ tipo: 'whatsapp', id: c.id, nome: c.alias + (c.numero ? ' · ' + mascararNumero(c.numero) : '') })}>{removendo ? 'Removendo…' : 'Remover conexão'}</button>
                          </div>
                        </div>
                      );
                    })}
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
                  <div className="conn-list">
                    <div className="conn-head">Escolha a Página para conectar</div>
                    {fbSel.length === 0 && <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página encontrada nesta conta do Facebook. Você precisa ser <b>administrador de uma Página</b> e, na tela de autorização da Meta, <b>marcar a Página</b> que deseja conectar. Crie/assuma uma Página e clique novamente em “Conectar com Facebook”.</div></div>}
                    {fbSel.map((p) => (
                      <div className="conn-row" key={p.id}>
                        <div className="conn-info"><span className="conn-name">{p.nome}</span></div>
                        <div className="conn-actions"><button className="btn-sm acc" disabled={fbBusy} onClick={() => fbEscolher(p.id)}>Conectar esta Página</button></div>
                      </div>
                    ))}
                    <div className="conn-actions" style={{ justifyContent: 'flex-start' }}><button className="btn-sm" disabled={fbBusy} onClick={() => { setFbSel(null); setFbCode(null); }}>Cancelar</button></div>
                  </div>
                ) : fbPaginas.length === 0 ? (
                  <div className="adapter-note"><IcInfo /><div className="tx">Nenhuma Página conectada. Clique em <b>Conectar com Facebook</b> para autorizar e escolher a Página.</div></div>
                ) : (
                  <div className="conn-list">
                    {fbPaginas.map((p) => {
                      const b = fbTokenBadge(p);
                      const removendo = remLoading && remocao?.tipo === 'facebook' && remocao?.id === p.canal_id;
                      return (
                        <div className="conn-row" key={p.id}>
                          <div className="conn-info">
                            <span className="conn-name">{p.pagina_nome || p.pagina_id}</span>
                            <span className="conn-sub">Página · {p.pagina_id}</span>
                          </div>
                          <div className="conn-actions">
                            <span className={'badge ' + b.cls}>{'dot' in b && b.dot && <span className="dot" />}{b.t}</span>
                            {p.estado === 'conectado'
                              ? <>
                                  <button className="btn-sm" disabled={fbBusy || removendo} onClick={fbIniciar}>Reconectar</button>
                                  <button className="btn-sm danger" disabled={removendo} onClick={() => setRemocao({ tipo: 'facebook', id: p.canal_id, nome: p.pagina_nome || p.pagina_id })}>{removendo ? 'Removendo…' : 'Remover conexão'}</button>
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
        title="Remover conexão?"
        message={remocao ? `A conexão "${remocao.nome}" será desconectada do provedor e deixará de aparecer na lista. O histórico de conversas e mensagens é preservado. Esta ação não pode ser desfeita.` : ''}
        destructive loading={remLoading} confirmLabel="Remover conexão" cancelLabel="Cancelar"
        onConfirm={confirmarRemocao} onCancel={() => { if (!remLoading) setRemocao(null); }} />

      {config && <ConfigOrigemModal canal={config} onClose={() => setConfig(null)} onSaved={() => { setConfig(null); qc.invalidateQueries({ queryKey: ['wa-canais', currentOrg.id] }); qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('rel-') }); toast('Configuração salva.'); }} />}
    </div>
  );
}

function ConfigOrigemModal({ canal, onClose, onSaved }: { canal: WaCanal; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: usuarios = [] } = useOrgUsuarios();
  const { data: fontes = [] } = useFontesAquisicao();
  const [form, setForm] = useState<ComercialInput>({
    nome_interno: canal.alias === 'WhatsApp' ? '' : canal.alias, origem_tipo: canal.origemTipo, gestor_id: canal.gestorId,
    fonte_aquisicao_id: canal.fonteId, campanha: canal.campanha, observacao_comercial: canal.observacaoComercial,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ComercialInput, v: string) => setForm((s) => ({ ...s, [k]: v || null }));
  async function salvar() {
    if (busy) return; setBusy(true);
    try { await waUpdateComercial(canal.id, { ...form, nome_interno: (form.nome_interno || '').trim() || 'WhatsApp' }); onSaved(); }
    catch (e) { toast((e as Error).message || 'Falha ao salvar.', 'warn'); setBusy(false); }
  }
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={560}
      title={<div><div>Configurar origem comercial</div><div className="cfg-sub">{canal.numero ? mascararNumero(canal.numero) : 'Conexão de WhatsApp'}</div></div>}
      footer={<><button className="atv-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="atv-btn primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar configuração'}</button></>}>
      <div className="cfg-form">
        <div className="cfg-field"><label>Nome interno da conexão</label><input className="ctrl" placeholder="Ex.: Chip 1 — Tráfego Matheus" value={form.nome_interno || ''} onChange={(e) => set('nome_interno', e.target.value)} disabled={busy} /></div>
        <div className="cfg-2col">
          <div className="cfg-field"><label>Tipo de origem</label><select className="ctrl" value={form.origem_tipo || ''} onChange={(e) => set('origem_tipo', e.target.value)} disabled={busy}><option value="">Não definido</option>{ORIGEM_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.r}</option>)}</select></div>
          <div className="cfg-field"><label>Gestor responsável</label><select className="ctrl" value={form.gestor_id || ''} onChange={(e) => set('gestor_id', e.target.value)} disabled={busy}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
        </div>
        <div className="cfg-2col">
          <div className="cfg-field"><label>Fonte de aquisição</label><select className="ctrl" value={form.fonte_aquisicao_id || ''} onChange={(e) => set('fonte_aquisicao_id', e.target.value)} disabled={busy}><option value="">Não definida</option>{fontes.map((ft) => <option key={ft.id} value={ft.id}>{ft.nome}</option>)}</select></div>
          <div className="cfg-field"><label>Campanha</label><input className="ctrl" placeholder="Opcional" value={form.campanha || ''} onChange={(e) => set('campanha', e.target.value)} disabled={busy} /></div>
        </div>
        <div className="cfg-field"><label>Observação comercial</label><textarea className="ctrl cfg-ta" rows={2} value={form.observacao_comercial || ''} onChange={(e) => set('observacao_comercial', e.target.value)} disabled={busy} /></div>
      </div>
    </Modal>
  );
}
