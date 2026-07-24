/* Seção "API Oficial (WhatsApp Cloud API)" da página de Integrações.
 *
 * Componente à parte, e não mais JSX dentro de Integracoes.tsx, por dois motivos: aquela página
 * já tem 600 linhas, e esta seção é a única coisa do painel que fala com a Meta — mantê-la
 * isolada deixa claro o que quebra se a conta oficial cair.
 *
 * Renderiza DENTRO de .integracoes-page, então reaproveita todo o CSS escopado da página
 * (.int-section, .int-card, .conn-row, .btn-sm, .badge…). Nenhuma classe nova de layout.
 *
 * NADA AQUI LIGA NADA SOZINHO: cadastrar o número não liga o bot, não muda o envio dos canais
 * existentes e não dispara mensagem. É cadastro + diagnóstico. */
import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { mascararNumero } from '@/data/whatsapp';
import {
  useCloudDiagnostico, useCloudAcoes, useWaTemplates, useTemplateAcoes, variaveisDoCorpo,
  type CloudCanal, type WaTemplate, type WaTemplateVar,
} from '@/data/cloudApi';

const IcMeta = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2z" /></svg>;
const IcCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>;
const IcInfo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;

/** Rótulo e cor do status de aprovação. O nome vem da Meta; a tradução é nossa. */
const ST_TPL: Record<string, { t: string; cls: string }> = {
  aprovado: { t: 'Aprovado', cls: 'ok' },
  pendente: { t: 'Em análise', cls: 'warn' },
  rejeitado: { t: 'Rejeitado', cls: 'err' },
  pausado: { t: 'Pausado', cls: 'warn' },
  desativado: { t: 'Desativado', cls: 'neutral' },
  rascunho: { t: 'Rascunho — não enviado à Meta', cls: 'neutral' },
};
const CAT_TPL = [
  { id: 'MARKETING', r: 'Marketing (reengajamento, oferta)' },
  { id: 'UTILITY', r: 'Utilidade (atualização de um pedido/processo)' },
  { id: 'AUTHENTICATION', r: 'Autenticação (código de acesso)' },
];

interface Props { podeConfig: boolean }

export function IntegracaoCloudApi({ podeConfig }: Props) {
  const { toast } = useToast();
  const diagQ = useCloudDiagnostico();
  const tplQ = useWaTemplates();
  const { vincular, verificar, remover } = useCloudAcoes();
  const tplAcoes = useTemplateAcoes();

  const [novoOpen, setNovoOpen] = useState(false);
  const [form, setForm] = useState({ alias: '', phoneNumberId: '', wabaId: '' });
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [removerCanal, setRemoverCanal] = useState<CloudCanal | null>(null);
  const [tplEdit, setTplEdit] = useState<Partial<WaTemplate> | null>(null);
  const [tplErro, setTplErro] = useState<string | null>(null);
  const [removerTpl, setRemoverTpl] = useState<WaTemplate | null>(null);

  const d = diagQ.data;
  const canais = d?.canais ?? [];
  const templates = tplQ.data ?? [];
  const faltaSecret = d ? !d.secrets.META_WHATSAPP_TOKEN || !d.secrets.META_WA_APP_SECRET || !d.secrets.META_WA_VERIFY_TOKEN : false;

  async function copiar(txt: string, oque: string) {
    try { await navigator.clipboard.writeText(txt); toast(`${oque} copiado.`); }
    catch { toast('Não foi possível copiar. Selecione e copie manualmente.'); }
  }

  async function salvarVinculo() {
    setErroForm(null);
    try {
      const r = await vincular.mutateAsync(form);
      setNovoOpen(false); setForm({ alias: '', phoneNumberId: '', wabaId: '' });
      toast(r.verificado ? 'Número oficial cadastrado e confirmado na Meta.' : 'Número cadastrado. Falta confirmar com a Meta.');
    } catch (e) { setErroForm((e as Error).message); }
  }

  async function salvarTemplate() {
    if (!tplEdit) return;
    setTplErro(null);
    const corpo = tplEdit.corpo ?? '';
    try {
      await tplAcoes.salvar.mutateAsync({
        id: tplEdit.id, nome: (tplEdit.nome ?? '').trim().toLowerCase(),
        idioma: tplEdit.idioma || 'pt_BR', categoria: tplEdit.categoria || 'MARKETING',
        corpo, variaveis: variaveisDoCorpo(corpo, tplEdit.variaveis ?? []),
        wabaId: tplEdit.wabaId ?? canais.find((c) => c.cloud_waba_id)?.cloud_waba_id ?? null,
      });
      setTplEdit(null);
      toast('Template salvo. Ele só pode ser usado depois de aprovado pela Meta.');
    } catch (e) { setTplErro((e as Error).message); }
  }

  const varsPreview = variaveisDoCorpo(tplEdit?.corpo ?? '', tplEdit?.variaveis ?? []);

  return (
    <section className="int-section" id="api-oficial">
      <div className="sec-head">
        <h2><svg className="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></svg>API Oficial (WhatsApp Cloud API)</h2>
        <p>Número oficial aprovado pela Meta. Não usa QR Code e não desconecta sozinho — em troca, só permite texto livre nas 24 horas seguintes à última mensagem do cliente.</p>
      </div>

      <div className="int-grid">
        <div className="int-card">
          <div className="ic-head">
            <span className="ic-logo meta"><IcMeta /></span>
            <div className="ic-ttl">
              <div className="t">
                Conta oficial
                {d && <span className={`badge ${canais.length ? (faltaSecret ? 'warn' : 'ok') : 'neutral'}`}>
                  {canais.length ? (faltaSecret ? 'Configuração incompleta' : 'Pronta') : 'Não configurada'}
                </span>}
              </div>
              <div className="s">Meta · WhatsApp Business Platform</div>
            </div>
          </div>

          <div className="ic-body">
            {diagQ.isLoading && <div className="adapter-note"><div className="tx">Carregando a configuração da conta oficial…</div></div>}
            {diagQ.error && <div className="adapter-note"><div className="tx">Não foi possível ler a configuração: {(diagQ.error as Error).message}</div></div>}

            {d && (
              <>
                {/* ---- o que falta no SERVIDOR. Booleanos, nunca valores. ---- */}
                <div className="conn-list" style={{ marginBottom: 10 }}>
                  <ItemCheck ok={d.secrets.META_WHATSAPP_TOKEN}
                    titulo="Token de envio (META_WHATSAPP_TOKEN)"
                    sub="Token permanente do app da Meta. Sem ele o Atenvo não envia nem baixa mídia pelo número oficial." />
                  <ItemCheck ok={d.secrets.META_WA_APP_SECRET}
                    titulo="Segredo do app (META_WA_APP_SECRET)"
                    sub="Confere a assinatura de cada webhook. Sem ele toda mensagem recebida é recusada." />
                  <ItemCheck ok={d.secrets.META_WA_VERIFY_TOKEN}
                    titulo="Token de verificação (META_WA_VERIFY_TOKEN)"
                    sub="Usado uma única vez, quando a Meta valida a URL do webhook." />
                  <ItemCheck ok={d.cloud_api_ativo}
                    titulo="Envio pela API oficial habilitado"
                    sub={d.cloud_api_ativo ? 'CLOUD_API_ATIVO = sim.' : 'CLOUD_API_ATIVO = nao — o envio oficial está desligado no servidor.'} />
                  <ItemCheck ok={d.bot_dispatch} neutro
                    titulo="Bot responde pelo número oficial"
                    sub={d.bot_dispatch
                      ? 'CLOUD_BOT_DISPATCH = sim. O bot ainda roda em simulação (dry_run) — não envia a cliente.'
                      : 'CLOUD_BOT_DISPATCH = nao. O código está pronto; o disparo continua desligado de propósito.'} />
                </div>

                {/* ---- endereço do webhook (isto SIM é para copiar e colar na Meta) ---- */}
                <div className="conn-row" style={{ alignItems: 'center' }}>
                  <div className="conn-info" style={{ minWidth: 0 }}>
                    <span className="conn-name">URL do webhook</span>
                    <span className="conn-sub" style={{ wordBreak: 'break-all' }}>{d.webhook_url}</span>
                  </div>
                  <div className="conn-actions">
                    <button className="btn-sm" onClick={() => copiar(d.webhook_url, 'Endereço')}>Copiar</button>
                  </div>
                </div>

                {/* ---- números oficiais cadastrados ---- */}
                {canais.length === 0 && (
                  <div className="adapter-note"><div className="tx">Nenhum número oficial cadastrado. Cadastre o número que aparece no painel da Meta em <b>WhatsApp &gt; API Setup</b>.</div></div>
                )}
                {canais.length > 0 && (
                  <div className="conn-list">
                    {canais.map((c) => (
                      <div className="conn-row" key={c.id}>
                        <div className="conn-info">
                          <span className="conn-name">{c.nome_interno || 'Número oficial'}</span>
                          <span className="conn-sub">
                            {c.numero_conectado ? mascararNumero(c.numero_conectado) : 'Número ainda não confirmado pela Meta'}
                            {' · '}ID {c.cloud_phone_number_id}
                            {c.cloud_waba_id ? ` · WABA ${c.cloud_waba_id}` : ' · sem WABA'}
                          </span>
                          <span className="conn-chips">
                            {/* "conectado" sozinho não prova nada: um canal criado por SQL nasce assim.
                                O que prova é a Meta ter devolvido o número em "Verificar na Meta". */}
                            <span className="conn-chip">
                              {c.status_integracao === 'conectado' && c.numero_conectado ? 'Confirmado na Meta' : 'Aguardando confirmação'}
                            </span>
                            {!c.cloud_waba_id && <span className="conn-chip">sem WABA — não sincroniza modelos</span>}
                          </span>
                        </div>
                        <div className="conn-actions">
                          {podeConfig && (
                            <button className="btn-sm" disabled={verificar.isPending}
                              onClick={async () => {
                                try {
                                  const r = await verificar.mutateAsync(c.id);
                                  toast(`Confirmado: ${r.nome_verificado ?? 'número'}${r.qualidade ? ` · qualidade ${r.qualidade}` : ''}.`);
                                } catch (e) { toast((e as Error).message); }
                              }}>
                              {verificar.isPending ? 'Verificando…' : 'Verificar na Meta'}
                            </button>
                          )}
                          {podeConfig && <button className="btn-sm danger" onClick={() => setRemoverCanal(c)}>Remover</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="ic-foot">
            <button className="atv-btn primary" disabled={!podeConfig} onClick={() => { setErroForm(null); setNovoOpen(true); }}>
              Cadastrar número oficial
            </button>
            <span className="sp" />
            <button className="btn-sm" onClick={() => diagQ.refetch()} disabled={diagQ.isFetching}>
              {diagQ.isFetching ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* ============================ TEMPLATES ============================ */}
      <div className="int-grid" style={{ marginTop: 12 }}>
        <div className="int-card">
          <div className="ic-head">
            <span className="ic-logo ext"><IcMeta /></span>
            <div className="ic-ttl">
              <div className="t">
                Modelos de mensagem (templates)
                <span className={`badge ${templates.some((t) => t.usarEmRemarketing) ? 'ok' : 'neutral'}`}>
                  {templates.filter((t) => t.status === 'aprovado').length} aprovado(s)
                </span>
              </div>
              <div className="s">Obrigatórios para falar com quem não escreve há mais de 24 horas</div>
            </div>
          </div>

          <div className="ic-body">
            <div className="adapter-note">
              <IcInfo />
              <div className="tx">
                Fora da janela de 24 horas o WhatsApp oficial só entrega <b>modelo aprovado pela Meta</b>.
                Sem um modelo aprovado marcado abaixo, o remarketing <b>não envia</b> para esses contatos — ele registra
                <b> bloqueado pela janela</b> e não gasta o toque. Nunca cai para texto livre.
              </div>
            </div>

            {tplQ.isLoading && <div className="adapter-note"><div className="tx">Carregando modelos…</div></div>}
            {!tplQ.isLoading && templates.length === 0 && (
              <div className="adapter-note"><div className="tx">Nenhum modelo cadastrado. Crie o modelo aqui e depois submeta na Meta — ou use “Sincronizar com a Meta” se já tiver criado por lá.</div></div>
            )}

            {templates.length > 0 && (
              <div className="conn-list">
                {templates.map((t) => {
                  const st = ST_TPL[t.status] ?? ST_TPL.rascunho;
                  return (
                    <div className="conn-row" key={t.id}>
                      <div className="conn-info">
                        <span className="conn-name">
                          {t.nome}
                          {t.usarEmRemarketing && <span className="badge ok" style={{ marginLeft: 8 }}>usado no remarketing</span>}
                        </span>
                        <span className="conn-sub">{t.idioma} · {t.categoria}{t.variaveis.length ? ` · ${t.variaveis.length} variável(is)` : ''}</span>
                        <span className="conn-sub" style={{ whiteSpace: 'pre-wrap' }}>{t.corpo.slice(0, 160)}{t.corpo.length > 160 ? '…' : ''}</span>
                        <span className="conn-chips">
                          <span className={`badge ${st.cls}`}>{st.t}</span>
                          {t.statusMotivo && <span className="conn-chip">{t.statusMotivo}</span>}
                        </span>
                      </div>
                      <div className="conn-actions">
                        {podeConfig && <button className="btn-sm" onClick={() => { setTplErro(null); setTplEdit(t); }}>Editar</button>}
                        {podeConfig && t.status === 'aprovado' && !t.usarEmRemarketing && (
                          <button className="btn-sm acc" onClick={async () => {
                            try { await tplAcoes.usarNoRemarketing.mutateAsync(t.id); toast('Modelo definido para o remarketing.'); }
                            catch (e) { toast((e as Error).message); }
                          }}>Usar no remarketing</button>
                        )}
                        {podeConfig && t.status === 'rascunho' && (
                          <button className="btn-sm" onClick={async () => {
                            try { await tplAcoes.marcarStatus.mutateAsync({ id: t.id, status: 'pendente', motivo: 'enviado para análise na Meta' }); toast('Marcado como em análise.'); }
                            catch (e) { toast((e as Error).message); }
                          }}>Marcar como enviado à Meta</button>
                        )}
                        {podeConfig && <button className="btn-sm danger" onClick={() => setRemoverTpl(t)}>Remover</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ic-foot">
            <button className="atv-btn" disabled={!podeConfig}
              onClick={() => { setTplErro(null); setTplEdit({ nome: '', idioma: 'pt_BR', categoria: 'MARKETING', corpo: '', variaveis: [] }); }}>
              Novo modelo
            </button>
            <span className="sp" />
            <button className="btn-sm" disabled={!podeConfig || tplAcoes.sincronizar.isPending}
              onClick={async () => {
                try {
                  const r = await tplAcoes.sincronizar.mutateAsync();
                  toast(`Sincronizado: ${r.importados} novo(s), ${r.atualizados} atualizado(s).${r.erros.length ? ` ${r.erros.length} com erro.` : ''}`);
                } catch (e) { toast((e as Error).message); }
              }}>
              {tplAcoes.sincronizar.isPending ? 'Sincronizando…' : 'Sincronizar com a Meta'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- modal: cadastrar número oficial ---------------- */}
      <Modal open={novoOpen} onClose={() => setNovoOpen(false)} width={520} title="Cadastrar número oficial"
        closeOnBackdrop={!vincular.isPending}
        footer={<>
          <button className="atv-btn" onClick={() => setNovoOpen(false)} disabled={vincular.isPending}>Cancelar</button>
          <button className="atv-btn primary" onClick={salvarVinculo}
            disabled={vincular.isPending || !form.alias.trim() || !form.phoneNumberId.trim()}>
            {vincular.isPending ? 'Cadastrando…' : 'Cadastrar'}
          </button>
        </>}>
        <div className="field">
          <label>Nome interno</label>
          <input className="ctrl" value={form.alias} maxLength={80} placeholder="OFICIAL"
            onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))} />
        </div>
        <div className="field">
          <label>Phone number ID</label>
          <input className="ctrl" value={form.phoneNumberId} inputMode="numeric" placeholder="Só números"
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value.replace(/\D/g, '') }))} />
          <p className="mock-note">Painel da Meta → seu app → WhatsApp → API Setup. É o número comprido embaixo do telefone, <b>não</b> o telefone.</p>
        </div>
        <div className="field">
          <label>WhatsApp Business Account ID (WABA)</label>
          <input className="ctrl" value={form.wabaId} inputMode="numeric" placeholder="Opcional agora, obrigatório para sincronizar modelos"
            onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value.replace(/\D/g, '') }))} />
        </div>
        {erroForm && <p className="mock-note" style={{ color: 'var(--err)' }}>{erroForm}</p>}
      </Modal>

      {/* ---------------- modal: criar/editar modelo ---------------- */}
      <Modal open={!!tplEdit} onClose={() => setTplEdit(null)} width={600}
        title={tplEdit?.id ? 'Editar modelo' : 'Novo modelo'}
        closeOnBackdrop={!tplAcoes.salvar.isPending}
        footer={<>
          <button className="atv-btn" onClick={() => setTplEdit(null)} disabled={tplAcoes.salvar.isPending}>Cancelar</button>
          <button className="atv-btn primary" onClick={salvarTemplate}
            disabled={tplAcoes.salvar.isPending || !(tplEdit?.nome ?? '').trim() || !(tplEdit?.corpo ?? '').trim()}>
            {tplAcoes.salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>}>
        <div className="field">
          <label>Nome do modelo</label>
          <input className="ctrl" value={tplEdit?.nome ?? ''} placeholder="retomada_contato"
            onChange={(e) => setTplEdit((t) => ({ ...t, nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} />
          <p className="mock-note">Tem que ser exatamente o mesmo nome cadastrado na Meta. Só minúsculas, números e underline.</p>
        </div>
        <div className="field">
          <label>Idioma</label>
          <select className="ctrl" value={tplEdit?.idioma ?? 'pt_BR'} onChange={(e) => setTplEdit((t) => ({ ...t, idioma: e.target.value }))}>
            <option value="pt_BR">Português (pt_BR)</option>
            <option value="en_US">Inglês (en_US)</option>
            <option value="es_ES">Espanhol (es_ES)</option>
          </select>
        </div>
        <div className="field">
          <label>Categoria</label>
          <select className="ctrl" value={tplEdit?.categoria ?? 'MARKETING'} onChange={(e) => setTplEdit((t) => ({ ...t, categoria: e.target.value }))}>
            {CAT_TPL.map((c) => <option key={c.id} value={c.id}>{c.r}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Texto</label>
          <textarea className="ctrl" style={{ height: 110, padding: 10, resize: 'vertical' }}
            value={tplEdit?.corpo ?? ''} placeholder="Olá {{1}}, tudo bem? Podemos retomar sua consulta?"
            onChange={(e) => setTplEdit((t) => ({ ...t, corpo: e.target.value }))} />
          <p className="mock-note">Use <b>{'{{1}}'}</b>, <b>{'{{2}}'}</b>… para as partes que mudam. O texto tem que ser idêntico ao aprovado pela Meta.</p>
        </div>
        {varsPreview.length > 0 && (
          <div className="field">
            <label>Variáveis detectadas</label>
            {varsPreview.map((v: WaTemplateVar) => (
              <div key={v.pos} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span className="conn-chip" style={{ flex: 'none' }}>{`{{${v.pos}}}`}</span>
                <input className="ctrl" style={{ height: 34 }} placeholder="para que serve (ex.: nome)"
                  value={v.rotulo}
                  onChange={(e) => setTplEdit((t) => ({ ...t, variaveis: varsPreview.map((x) => x.pos === v.pos ? { ...x, rotulo: e.target.value } : x) }))} />
                <input className="ctrl" style={{ height: 34 }} placeholder="exemplo"
                  value={v.exemplo}
                  onChange={(e) => setTplEdit((t) => ({ ...t, variaveis: varsPreview.map((x) => x.pos === v.pos ? { ...x, exemplo: e.target.value } : x) }))} />
              </div>
            ))}
            <p className="mock-note">A variável com rótulo “nome” é preenchida com o primeiro nome do cliente. As outras usam o exemplo.</p>
          </div>
        )}
        {tplErro && <p className="mock-note" style={{ color: 'var(--err)' }}>{tplErro}</p>}
      </Modal>

      <ConfirmDialog
        open={!!removerCanal}
        title="Remover número oficial"
        message={`O canal "${removerCanal?.nome_interno ?? ''}" sai do Atenvo. O histórico de conversas continua, mas este número deixa de receber e de enviar. Na Meta nada é apagado.`}
        confirmLabel="Remover" destructive loading={remover.isPending}
        onCancel={() => setRemoverCanal(null)}
        onConfirm={async () => {
          if (!removerCanal) return;
          try { await remover.mutateAsync(removerCanal.id); toast('Número oficial removido.'); }
          catch (e) { toast((e as Error).message); }
          finally { setRemoverCanal(null); }
        }} />

      <ConfirmDialog
        open={!!removerTpl}
        title="Remover modelo"
        message={`O modelo "${removerTpl?.nome ?? ''}" sai da lista do Atenvo. Na Meta ele continua existindo — remova por lá também se for o caso.`}
        confirmLabel="Remover" destructive loading={tplAcoes.remover.isPending}
        onCancel={() => setRemoverTpl(null)}
        onConfirm={async () => {
          if (!removerTpl) return;
          try { await tplAcoes.remover.mutateAsync(removerTpl.id); toast('Modelo removido.'); }
          catch (e) { toast((e as Error).message); }
          finally { setRemoverTpl(null); }
        }} />
    </section>
  );
}

/** Linha do checklist do servidor. `neutro` = não é pendência, é só informação de estado. */
function ItemCheck({ ok, titulo, sub, neutro }: { ok: boolean; titulo: string; sub: string; neutro?: boolean }) {
  const cor = ok ? 'var(--ok)' : neutro ? 'var(--muted)' : 'var(--warn)';
  return (
    <div className="conn-row" style={{ alignItems: 'flex-start' }}>
      <span style={{ flex: 'none', width: 20, height: 20, marginTop: 2, color: cor, display: 'inline-flex' }}>
        {ok ? <IcCheck /> : <IcX />}
      </span>
      <div className="conn-info" style={{ minWidth: 0 }}>
        <span className="conn-name">{titulo}</span>
        <span className="conn-sub">{sub}</span>
      </div>
    </div>
  );
}
