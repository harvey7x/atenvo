import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { AudioRecorder } from '@/components/AudioRecorder';
import { useToast } from '@/hooks/useToast';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { subirMidiaWa, urlAssinadaMidiaWa } from '@/data/whatsapp';
import {
  useReguas, usePassos, useAtivacoes, useHistoricoEnvios, useCanaisNormais, useContatosBusca,
  useSalvarRegua, useArquivarRegua, useExcluirRegua, useSalvarPasso, useRemoverPasso,
  useAtivarRelacionamento, usePausar, useRetomar, useDesativar, useTrocarRegua,
  OBJETIVOS, objetivoInfo, REGUA_STATUS, ATIV_STATUS, PASSO_TIPOS, passoTipoLabel, DIAS_SEMANA,
  podeGerirReguas, traduzErro,
  type Regua, type Passo, type Ativacao, type ReguaInput, type PassoInput, type PassoTipo, type AgendamentoTipo,
} from '@/data/relacionamento';
import './Relacionamento.css';

type Aba = 'visao' | 'reguas' | 'clientes' | 'calendario' | 'modelos' | 'historico';
const ABAS: { id: Aba; label: string }[] = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'reguas', label: 'Réguas' },
  { id: 'clientes', label: 'Clientes ativos' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'modelos', label: 'Modelos' },
  { id: 'historico', label: 'Histórico' },
];

// ---------- helpers de apresentação ----------
const fmtDataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const iniciais = (n: string | null) => (n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

function descPasso(p: Passo): string {
  if (p.agendamentoTipo === 'semanal') return `${DIAS_SEMANA[p.diaSemana ?? 0]} ${(p.hora || '').slice(0, 5)}`;
  if (p.agendamentoTipo === 'data_fixa') return `${p.data || ''} ${(p.hora || '').slice(0, 5)}`;
  const h = p.offsetHoras ?? 0;
  return h % 24 === 0 ? `D+${h / 24}` : `+${h}h`;
}
function previewTexto(txt: string, atendente: string): string {
  return (txt || '')
    .replace(/\{\{primeiro_nome\}\}/g, 'Maria')
    .replace(/\{\{nome_cliente\}\}/g, 'Maria Aparecida Silva')
    .replace(/\{\{saudacao\}\}/g, 'Bom dia')
    .replace(/\{\{nome_atendente\}\}/g, atendente || 'atendente');
}

export function Relacionamento() {
  const [params, setParams] = useSearchParams();
  const abaInicial = (ABAS.find((a) => a.id === params.get('tab'))?.id) ?? 'visao';
  const [aba, setAba] = useState<Aba>(abaInicial);
  const setAbaUrl = (a: Aba) => { setAba(a); setParams((p) => { p.set('tab', a); return p; }, { replace: true }); };
  const { currentOrg } = useOrg();
  const podeReguas = podeGerirReguas(currentOrg.role);

  return (
    <div className="rel">
      <nav className="rel-abas" role="tablist" aria-label="Seções de Relacionamento">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id}
            className={'rel-aba' + (aba === a.id ? ' on' : '')} onClick={() => setAbaUrl(a.id)}>{a.label}</button>
        ))}
      </nav>

      <div className="rel-body">
        {aba === 'visao' && <AbaVisao onIr={setAbaUrl} />}
        {aba === 'reguas' && <AbaReguas podeReguas={podeReguas} />}
        {aba === 'clientes' && <AbaClientes />}
        {aba === 'calendario' && <AbaCalendario />}
        {aba === 'modelos' && <AbaModelos onIr={setAbaUrl} />}
        {aba === 'historico' && <AbaHistorico />}
      </div>
    </div>
  );
}

// ===========================================================================
// Visão geral
// ===========================================================================
function AbaVisao({ onIr }: { onIr: (a: Aba) => void }) {
  const vivas = useAtivacoes('vivas');
  const reguas = useReguas();
  const lista = vivas.data ?? [];
  const ativos = lista.filter((a) => a.status === 'ativo');
  const pausados = lista.filter((a) => a.status === 'pausado');
  const reguasAtivas = (reguas.data ?? []).filter((r) => r.status === 'ativa');
  const topReguas = useTopReguas(reguas.data ?? [], lista);

  const cards = [
    { cor: 'var(--accent)', label: 'Em relacionamento', val: lista.length, sub: 'clientes ativados' },
    { cor: 'var(--ink-2)', label: 'Réguas ativas', val: reguasAtivas.length, sub: `${(reguas.data ?? []).length} no total` },
    { cor: 'var(--warn)', label: 'Pausados', val: pausados.length, sub: 'aguardando' },
    { cor: 'var(--info)', label: 'Próximos envios', val: ativos.filter((a) => a.proximoEm).length, sub: 'programados' },
  ];

  return (
    <div className="rel-view">
      <div className="rel-kpis">
        {cards.map((c) => (
          <div className="rel-kpi" key={c.label}>
            <div className="k-l"><i style={{ background: c.cor }} />{c.label}</div>
            <div className="k-v">{c.val}</div>
            <div className="k-s">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="rel-callout info" style={{ marginBottom: 16 }}>
        <span>O <strong>envio automático ainda não está ligado</strong> nesta fase — você já pode criar réguas e ativar clientes; as mensagens só serão programadas quando o motor for habilitado.</span>
      </div>

      <div className="rel-grid2">
        <div className="card">
          <div className="card-head"><h3>Clientes em relacionamento</h3><button className="rel-link" onClick={() => onIr('clientes')}>Ver todos</button></div>
          <div className="rel-list">
            {vivas.isLoading ? <div className="rel-empty">Carregando…</div>
              : lista.length === 0 ? <div className="rel-empty">Nenhum cliente em relacionamento ainda.</div>
              : lista.slice(0, 6).map((a) => (
                <div className="rel-row" key={a.id}>
                  <span className="rel-av">{iniciais(a.contatoNome)}</span>
                  <div className="rel-row-main"><div className="rel-row-n">{a.contatoNome || 'Contato'}</div><div className="rel-row-s">{a.reguaNome || '—'}</div></div>
                  <span className={'badge ' + ATIV_STATUS[a.status].badge}>{ATIV_STATUS[a.status].label}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Réguas mais usadas</h3><button className="rel-link" onClick={() => onIr('reguas')}>Gerenciar</button></div>
          <div className="rel-list">
            {(reguas.data ?? []).length === 0 ? <div className="rel-empty">Nenhuma régua criada.</div>
              : topReguas.map((r) => (
                <div className="rel-bar-row" key={r.id}>
                  <div className="rel-bar-l">{r.nome}</div>
                  <div className="rel-bar-track"><div className="rel-bar-fill" style={{ width: `${r.pct}%` }} /></div>
                  <div className="rel-bar-v">{r.count}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function useTopReguas(reguas: Regua[], ativas: Ativacao[]) {
  return useMemo(() => {
    const cont = new Map<string, number>();
    ativas.forEach((a) => cont.set(a.reguaId, (cont.get(a.reguaId) ?? 0) + 1));
    const max = Math.max(1, ...cont.values());
    return reguas.map((r) => ({ id: r.id, nome: r.nome, count: cont.get(r.id) ?? 0, pct: Math.round(((cont.get(r.id) ?? 0) / max) * 100) }))
      .sort((a, b) => b.count - a.count).slice(0, 6);
  }, [reguas, ativas]);
}

// ===========================================================================
// Réguas
// ===========================================================================
function AbaReguas({ podeReguas }: { podeReguas: boolean }) {
  const reguas = useReguas();
  const vivas = useAtivacoes('vivas');
  const [editando, setEditando] = useState<Regua | 'nova' | null>(null);
  const contPorRegua = useMemo(() => {
    const m = new Map<string, number>(); (vivas.data ?? []).forEach((a) => m.set(a.reguaId, (m.get(a.reguaId) ?? 0) + 1)); return m;
  }, [vivas.data]);

  return (
    <div className="rel-view">
      <div className="rel-view-head">
        <div><h2>Réguas</h2><p>Sequências reutilizáveis. Nenhuma dispara sozinha — só quando você ativa num cliente.</p></div>
        {podeReguas && <button className="btn btn-primary" onClick={() => setEditando('nova')}>+ Nova régua</button>}
      </div>

      <div className="rel-tbl-wrap">
        <table className="rel-tbl">
          <thead><tr><th>Régua</th><th>Objetivo</th><th style={{ textAlign: 'right' }}>Ativos</th><th>Frequência</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {reguas.isLoading ? <tr><td colSpan={6} className="rel-empty">Carregando…</td></tr>
              : (reguas.data ?? []).length === 0 ? <tr><td colSpan={6} className="rel-empty">Nenhuma régua ainda. {podeReguas ? 'Crie a primeira.' : ''}</td></tr>
              : (reguas.data ?? []).map((r) => (
                <tr key={r.id} onClick={() => podeReguas && setEditando(r)} className={podeReguas ? 'rel-tr-click' : ''}>
                  <td className="rel-strong">{r.nome}</td>
                  <td><span className={'badge ' + (objetivoInfo(r.objetivo).nutricao ? 'blue' : 'ok')}>{objetivoInfo(r.objetivo).label}</span></td>
                  <td style={{ textAlign: 'right' }} className="rel-mono">{contPorRegua.get(r.id) ?? 0}</td>
                  <td className="rel-sub">{r.diasSemana.map((d) => DIAS_SEMANA[d]).join(', ')} · {r.horaInicio.slice(0, 5)}–{r.horaFim.slice(0, 5)}</td>
                  <td><span className={'badge ' + REGUA_STATUS[r.status].badge}>{REGUA_STATUS[r.status].label}</span></td>
                  <td style={{ textAlign: 'right' }}>{podeReguas && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditando(r); }}>Editar</button>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editando && <ReguaEditor regua={editando === 'nova' ? null : editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function ReguaEditor({ regua, onClose }: { regua: Regua | null; onClose: () => void }) {
  const { toast } = useToast();
  const canais = useCanaisNormais();
  const salvar = useSalvarRegua();
  const arquivar = useArquivarRegua();
  const excluir = useExcluirRegua();
  const [f, setF] = useState<ReguaInput>(() => regua ? {
    id: regua.id, nome: regua.nome, objetivo: regua.objetivo, status: regua.status, publico: regua.publicoSugerido,
    pausarSeResponder: regua.pausarSeResponder, tetoSemana: regua.tetoSemana, intervaloMinHoras: regua.intervaloMinHoras,
    diasSemana: regua.diasSemana, horaInicio: regua.horaInicio.slice(0, 5), horaFim: regua.horaFim.slice(0, 5), canalPadrao: regua.canalPadraoId,
  } : { nome: '', objetivo: 'relacionamento_cliente', status: 'rascunho', pausarSeResponder: true, tetoSemana: 3, intervaloMinHoras: 48, diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFim: '18:00', canalPadrao: null });
  const [reguaId, setReguaId] = useState<string | null>(regua?.id ?? null);
  const set = (patch: Partial<ReguaInput>) => setF((v) => ({ ...v, ...patch }));
  const toggleDia = (d: number) => set({ diasSemana: (f.diasSemana ?? []).includes(d) ? (f.diasSemana ?? []).filter((x) => x !== d) : [...(f.diasSemana ?? []), d].sort() });

  async function salvarRegua() {
    try { const r = await salvar.mutateAsync({ ...f, id: reguaId }); setReguaId(r.id); toast('Régua salva'); }
    catch (e) { toast(traduzErro((e as Error).message), 'warn'); }
  }
  async function onArquivar() { if (!reguaId) return; try { await arquivar.mutateAsync(reguaId); toast('Régua arquivada'); onClose(); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } }
  async function onExcluir() { if (!reguaId) return; try { await excluir.mutateAsync(reguaId); toast('Régua excluída'); onClose(); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } }

  return (
    <Modal open onClose={onClose} width={880} title={<div className="rel-modal-title">{regua ? 'Editar régua' : 'Nova régua'}</div>}
      footer={<div className="rel-modal-foot">
        {reguaId && <button className="btn btn-sm" onClick={onArquivar}>Arquivar</button>}
        {reguaId && <button className="btn btn-sm rel-danger" onClick={onExcluir}>Excluir</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Fechar</button>
        <button className="btn btn-primary" onClick={salvarRegua} disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar régua'}</button>
      </div>}>
      <div className="rel-ed">
        <div className="rel-ed-cfg">
          <div className="field"><label>Nome da régua</label><input className="ctrl" value={f.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Cliente fechado — relacionamento leve" /></div>
          <div className="field"><label>Objetivo</label><select className="ctrl" value={f.objetivo} onChange={(e) => set({ objetivo: e.target.value })}>{OBJETIVOS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          <div className="rel-row2">
            <div className="field"><label>Status</label><select className="ctrl" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="arquivada">Arquivada</option></select></div>
            <div className="field"><label>Canal padrão</label><select className="ctrl" value={f.canalPadrao ?? ''} onChange={(e) => set({ canalPadrao: e.target.value || null })}><option value="">Perguntar ao ativar</option>{(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          </div>
          <div className="rel-ed-eyebrow">Segurança / frequência</div>
          <label className="rel-toggle"><input type="checkbox" checked={!!f.pausarSeResponder} onChange={(e) => set({ pausarSeResponder: e.target.checked })} /> Pausar se o cliente responder</label>
          <div className="rel-row2">
            <div className="field"><label>Teto / semana</label><input className="ctrl" type="number" min={1} max={21} value={f.tetoSemana} onChange={(e) => set({ tetoSemana: Number(e.target.value) })} /></div>
            <div className="field"><label>Intervalo mín. (horas)</label><input className="ctrl" type="number" min={0} value={f.intervaloMinHoras} onChange={(e) => set({ intervaloMinHoras: Number(e.target.value) })} /></div>
          </div>
          <div className="field"><label>Dias permitidos</label>
            <div className="rel-days">{DIAS_SEMANA.map((d, i) => <button key={i} type="button" className={'rel-day' + ((f.diasSemana ?? []).includes(i) ? ' on' : '')} onClick={() => toggleDia(i)}>{d[0]}</button>)}</div>
          </div>
          <div className="rel-row2">
            <div className="field"><label>Início</label><input className="ctrl" type="time" value={f.horaInicio} onChange={(e) => set({ horaInicio: e.target.value })} /></div>
            <div className="field"><label>Fim</label><input className="ctrl" type="time" value={f.horaFim} onChange={(e) => set({ horaFim: e.target.value })} /></div>
          </div>
        </div>

        <div className="rel-ed-passos">
          <div className="rel-ed-eyebrow">Passos da régua</div>
          {reguaId ? <PassosEditor reguaId={reguaId} /> : <div className="rel-empty rel-passos-lock">Salve a régua para adicionar os passos.</div>}
        </div>
      </div>
    </Modal>
  );
}

function PassosEditor({ reguaId }: { reguaId: string }) {
  const { toast } = useToast();
  const passos = usePassos(reguaId);
  const salvar = useSalvarPasso();
  const remover = useRemoverPasso();
  const [editando, setEditando] = useState<Passo | 'novo' | null>(null);
  const lista = passos.data ?? [];

  return (
    <>
      <div className="rel-passos-list">
        {lista.map((p) => (
          <div className="rel-passo-card" key={p.id} onClick={() => setEditando(p)}>
            <span className="rel-passo-ord">{p.ordem}</span>
            <div className="rel-passo-main"><div className="rel-passo-t">{p.tituloInterno}</div><div className="rel-passo-s">{passoTipoLabel(p.tipo)} · {descPasso(p)}</div></div>
            <button className="btn btn-sm rel-danger" onClick={(e) => { e.stopPropagation(); remover.mutateAsync({ id: p.id, reguaId }).then(() => toast('Passo removido')).catch((err) => toast(traduzErro((err as Error).message), 'warn')); }}>Remover</button>
          </div>
        ))}
        <button className="rel-add-passo" onClick={() => setEditando('novo')}>+ Adicionar passo</button>
      </div>
      {editando && <PassoModal reguaId={reguaId} passo={editando === 'novo' ? null : editando} proximaOrdem={(lista[lista.length - 1]?.ordem ?? 0) + 1} onClose={() => setEditando(null)} onSalvar={async (v) => { try { await salvar.mutateAsync(v); toast('Passo salvo'); setEditando(null); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } }} />}
    </>
  );
}

type MediaState = { path: string; mime: string; nome: string; tamanho: number } | null;
const ACCEPT_PASSO: Record<string, string> = {
  imagem: 'image/*',
  documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword',
};

function PassoModal({ reguaId, passo, proximaOrdem, onClose, onSalvar }: { reguaId: string; passo: Passo | null; proximaOrdem: number; onClose: () => void; onSalvar: (v: PassoInput) => Promise<void> }) {
  const { user } = useAuth(); // nome do atendente para a prévia
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [titulo, setTitulo] = useState(passo?.tituloInterno ?? '');
  const [tipo, setTipo] = useState<PassoTipo>((passo?.tipo as PassoTipo) ?? 'texto');
  const [texto, setTexto] = useState(passo?.texto ?? '');
  const [media, setMedia] = useState<MediaState>(passo?.storagePath ? { path: passo.storagePath, mime: passo.mimeType ?? '', nome: passo.nomeArquivo ?? 'arquivo', tamanho: 0 } : null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [agTipo, setAgTipo] = useState<AgendamentoTipo>(passo?.agendamentoTipo ?? 'semanal');
  const [diaSemana, setDiaSemana] = useState(passo?.diaSemana ?? 1);
  const [hora, setHora] = useState((passo?.hora ?? '08:30').slice(0, 5));
  const [offsetDias, setOffsetDias] = useState(passo?.offsetHoras != null ? Math.round(passo.offsetHoras / 24) : 1);
  const [data, setData] = useState(passo?.data ?? '');

  const ehMidia = tipo !== 'texto';
  const ehImagem = tipo === 'imagem';
  const ehAudio = tipo === 'audio';

  // prévia da imagem já existente (ao editar um passo salvo)
  useEffect(() => {
    let vivo = true;
    if (ehImagem && media?.path && !previewUrl) urlAssinadaMidiaWa(media.path).then((u) => { if (vivo) setPreviewUrl(u); }).catch(() => { /* prévia é opcional */ });
    return () => { vivo = false; };
  }, [ehImagem, media?.path, previewUrl]);

  function trocarTipo(t: PassoTipo) { setTipo(t); if (t === 'texto') { setMedia(null); setPreviewUrl(null); } }
  async function anexar(file: File) {
    if (file.size > 25 * 1024 * 1024) { toast('Arquivo acima de 25 MB.', 'warn'); return; }
    setUploading(true);
    try { const m = await subirMidiaWa(currentOrg.id, file); setMedia(m); setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null); }
    catch (e) { toast('Falha no upload: ' + (e as Error).message, 'warn'); }
    finally { setUploading(false); }
  }
  async function anexarAudio(blob: Blob, mime: string, ext: string) {
    const file = new File([blob], `audio-relacionamento.${ext}`, { type: mime });
    const m = await subirMidiaWa(currentOrg.id, file); // lança em falha → AudioRecorder mostra o erro
    setMedia(m);
  }

  const conteudoOk = ehMidia ? (!!media && !uploading) : !!texto.trim();
  function montar(): PassoInput {
    const base: PassoInput = {
      id: passo?.id ?? null, reguaId, ordem: passo?.ordem ?? proximaOrdem, titulo: titulo.trim() || 'Passo',
      tipo, texto: ehAudio ? null : (texto.trim() || null), agendamentoTipo: agTipo,
      storagePath: media?.path ?? null, mime: media?.mime ?? null, nome: media?.nome ?? null, tamanho: media?.tamanho ?? null,
    };
    if (agTipo === 'semanal') { base.diaSemana = diaSemana; base.hora = hora; }
    else if (agTipo === 'data_fixa') { base.data = data; base.hora = hora; }
    else base.offsetHoras = offsetDias * 24;
    return base;
  }

  return (
    <Modal open onClose={onClose} width={560} title={<div className="rel-modal-title">{passo ? 'Editar passo' : 'Novo passo'}</div>}
      footer={<div className="rel-modal-foot"><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onSalvar(montar())} disabled={!conteudoOk}>Salvar passo</button></div>}>
      <div className="field"><label>Título interno (não enviado)</label><input className="ctrl" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Boa semana" /></div>

      <div className="field"><label>Tipo</label>
        <div className="rel-tipos">
          {PASSO_TIPOS.map((t) => <button key={t.id} type="button" className={'rel-tipo' + (tipo === t.id ? ' on' : '')} onClick={() => trocarTipo(t.id)}>{t.label}</button>)}
        </div>
      </div>

      {ehMidia && (
        <div className="field"><label>{ehAudio ? 'Áudio' : ehImagem ? 'Imagem' : 'Documento'}</label>
          {ehAudio ? (
            media ? <div className="rel-attach-done"><span className="rel-doc-chip">🎙️ Áudio anexado</span><button type="button" className="btn btn-sm" onClick={() => setMedia(null)}>Trocar</button></div>
              : <AudioRecorder onEnviar={anexarAudio} permitirArquivo rotuloEnviar="Usar áudio" />
          ) : media ? (
            <div className="rel-attach-done">
              {ehImagem && previewUrl ? <img className="rel-thumb" src={previewUrl} alt="prévia" /> : <span className="rel-doc-chip">📄 {media.nome}</span>}
              <button type="button" className="btn btn-sm rel-danger" onClick={() => { setMedia(null); setPreviewUrl(null); }}>Remover</button>
            </div>
          ) : (
            <label className={'rel-attach-btn' + (uploading ? ' busy' : '')}>{uploading ? 'Enviando…' : `Anexar ${ehImagem ? 'imagem' : 'documento'}`}
              <input type="file" accept={ACCEPT_PASSO[tipo]} hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) anexar(f); e.currentTarget.value = ''; }} />
            </label>
          )}
        </div>
      )}

      {!ehAudio && (
        <div className="field"><label>{ehMidia ? 'Legenda (opcional)' : 'Mensagem'}</label>
          <textarea className="ctrl rel-textarea" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={ehMidia ? 'Legenda…' : 'Bom dia, {{primeiro_nome}}! …'} />
          <div className="rel-vars">Variáveis: <code>{'{{primeiro_nome}}'}</code> <code>{'{{saudacao}}'}</code> <code>{'{{nome_atendente}}'}</code></div>
        </div>
      )}

      <div className="rel-row2">
        <div className="field"><label>Agendamento</label><select className="ctrl" value={agTipo} onChange={(e) => setAgTipo(e.target.value as AgendamentoTipo)}><option value="semanal">Semanal</option><option value="relativo">Relativo (D+X)</option><option value="data_fixa">Data fixa</option></select></div>
        {agTipo === 'semanal' && <div className="field"><label>Dia</label><select className="ctrl" value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>{DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>}
        {agTipo === 'relativo' && <div className="field"><label>Dias após ativar</label><input className="ctrl" type="number" min={0} value={offsetDias} onChange={(e) => setOffsetDias(Number(e.target.value))} /></div>}
        {agTipo === 'data_fixa' && <div className="field"><label>Data</label><input className="ctrl" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>}
      </div>
      {agTipo !== 'relativo' && <div className="field"><label>Horário</label><input className="ctrl" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>}

      <div className="rel-ed-eyebrow">Prévia</div>
      <div className="rel-wa">
        <div className="rel-wa-top"><span className="rel-wa-av">CAF</span><div><div className="rel-wa-n">CAF Assessoria</div><div className="rel-wa-s">online</div></div></div>
        <div className="rel-wa-body">
          <div className="rel-wa-bubble">
            {ehImagem && previewUrl && <img className="rel-wa-img" src={previewUrl} alt="" />}
            {tipo === 'documento' && media && <span className="rel-wa-doc">📄 {media.nome}</span>}
            {ehAudio ? <span className="rel-wa-audio">🎙️ Mensagem de áudio</span>
              : <span className="rel-wa-txt">{previewTexto(texto, user?.name || 'atendente') || (ehMidia ? '' : 'Sua mensagem aparece aqui…')}</span>}
            <span className="rel-wa-time">{hora}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Clientes ativos
// ===========================================================================
function AbaClientes() {
  const { toast } = useToast();
  const vivas = useAtivacoes('vivas');
  const reguas = useReguas();
  const pausar = usePausar(); const retomar = useRetomar(); const desativar = useDesativar();
  const [trocar, setTrocar] = useState<Ativacao | null>(null);
  const [ativarOpen, setAtivarOpen] = useState(false);
  // qualquer papel pode tentar ativar; o RPC valida (atendente só nos próprios clientes)
  const podeAtivar = true;

  async function acao(fn: () => Promise<void>, ok: string) { try { await fn(); toast(ok); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } }

  return (
    <div className="rel-view">
      <div className="rel-view-head">
        <div><h2>Clientes ativos</h2><p>Quem está recebendo relacionamento agora. Ative, pause, troque a régua ou desative.</p></div>
        {podeAtivar && <button className="btn btn-primary" onClick={() => setAtivarOpen(true)}>+ Ativar cliente</button>}
      </div>

      <div className="rel-tbl-wrap">
        <table className="rel-tbl">
          <thead><tr><th>Cliente</th><th>Régua</th><th>Responsável</th><th>Canal</th><th>Próximo</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {vivas.isLoading ? <tr><td colSpan={7} className="rel-empty">Carregando…</td></tr>
              : (vivas.data ?? []).length === 0 ? <tr><td colSpan={7} className="rel-empty">Nenhum cliente em relacionamento. Ative pelo botão acima ou pelo painel do cliente no WhatsApp/Kanban.</td></tr>
              : (vivas.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td><div className="rel-cell-name"><span className="rel-av">{iniciais(a.contatoNome)}</span><div><div className="rel-strong">{a.contatoNome || 'Contato'}</div><div className="rel-sub">{a.contatoTelefone || ''}</div></div></div></td>
                  <td>{a.reguaNome || '—'}</td>
                  <td className="rel-sub">{a.responsavelNome || '—'}</td>
                  <td className="rel-sub">{a.canalNome || '—'}</td>
                  <td className="rel-sub">{fmtDataHora(a.proximoEm)}</td>
                  <td><span className={'badge ' + ATIV_STATUS[a.status].badge}>{ATIV_STATUS[a.status].label}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="rel-actions">
                      {a.status === 'ativo' && <button className="btn btn-sm" onClick={() => acao(() => pausar.mutateAsync({ ativacaoId: a.id }), 'Pausado')}>Pausar</button>}
                      {a.status === 'pausado' && <button className="btn btn-sm" onClick={() => acao(() => retomar.mutateAsync({ ativacaoId: a.id }), 'Retomado')}>Retomar</button>}
                      <button className="btn btn-sm" onClick={() => setTrocar(a)}>Trocar</button>
                      <button className="btn btn-sm rel-danger" onClick={() => acao(() => desativar.mutateAsync({ ativacaoId: a.id }), 'Desativado')}>Desativar</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {trocar && <TrocarModal ativacao={trocar} reguas={(reguas.data ?? []).filter((r) => r.status === 'ativa' && r.id !== trocar.reguaId)} onClose={() => setTrocar(null)} />}
      {ativarOpen && <AtivarModal reguas={(reguas.data ?? []).filter((r) => r.status === 'ativa')} onClose={() => setAtivarOpen(false)} />}
    </div>
  );
}

function TrocarModal({ ativacao, reguas, onClose }: { ativacao: Ativacao; reguas: Regua[]; onClose: () => void }) {
  const { toast } = useToast();
  const trocar = useTrocarRegua();
  const [sel, setSel] = useState('');
  async function confirmar() { if (!sel) return; try { await trocar.mutateAsync({ ativacaoId: ativacao.id, novaReguaId: sel }); toast('Régua trocada'); onClose(); } catch (e) { toast(traduzErro((e as Error).message), 'warn'); } }
  return (
    <Modal open onClose={onClose} width={480} title={<div className="rel-modal-title">Trocar régua — {ativacao.contatoNome}</div>}
      footer={<div className="rel-modal-foot"><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!sel || trocar.isPending} onClick={confirmar}>Confirmar troca</button></div>}>
      <p className="rel-sub" style={{ marginTop: 0 }}>Régua atual: <strong>{ativacao.reguaNome}</strong>. Os envios já programados são cancelados e substituídos pelos passos da nova régua; o histórico é mantido.</p>
      <div className="rel-choices">
        {reguas.length === 0 ? <div className="rel-empty">Nenhuma outra régua ativa disponível.</div>
          : reguas.map((r) => (
            <label key={r.id} className={'rel-choice' + (sel === r.id ? ' on' : '')}><input type="radio" name="troca" checked={sel === r.id} onChange={() => setSel(r.id)} /><div><div className="rel-strong">{r.nome}</div><div className="rel-sub">{objetivoInfo(r.objetivo).label}</div></div></label>
          ))}
      </div>
    </Modal>
  );
}

function AtivarModal({ reguas, onClose }: { reguas: Regua[]; onClose: () => void }) {
  const { toast } = useToast();
  const canais = useCanaisNormais();
  const ativar = useAtivarRelacionamento();
  const [termo, setTermo] = useState('');
  const busca = useContatosBusca(termo);
  const [contato, setContato] = useState<{ id: string; nome: string } | null>(null);
  const [reguaSel, setReguaSel] = useState('');
  const [canalSel, setCanalSel] = useState('');

  async function confirmar() {
    if (!contato || !reguaSel || !canalSel) return;
    try { await ativar.mutateAsync({ contatoId: contato.id, reguaId: reguaSel, canalId: canalSel }); toast('Relacionamento ativado'); onClose(); }
    catch (e) { toast(traduzErro((e as Error).message), 'warn'); }
  }

  return (
    <Modal open onClose={onClose} width={520} title={<div className="rel-modal-title">Ativar relacionamento</div>}
      footer={<div className="rel-modal-foot"><span style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!contato || !reguaSel || !canalSel || ativar.isPending} onClick={confirmar}>Ativar</button></div>}>
      <div className="field"><label>Cliente</label>
        {contato ? <div className="rel-picked"><span className="rel-av">{iniciais(contato.nome)}</span><span className="rel-strong">{contato.nome}</span><button className="btn btn-sm" onClick={() => setContato(null)}>Trocar</button></div>
          : <><input className="ctrl" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por nome ou telefone…" autoFocus />
            {termo.trim().length >= 2 && <div className="rel-busca">{(busca.data ?? []).map((c) => <button key={c.id} className="rel-busca-item" onClick={() => { setContato({ id: c.id, nome: c.nome }); setTermo(''); }}>{c.nome} <span className="rel-sub">{c.telefone || ''}</span></button>)}{busca.data && busca.data.length === 0 && <div className="rel-empty">Nada encontrado.</div>}</div>}</>}
      </div>
      <div className="field"><label>Régua</label><select className="ctrl" value={reguaSel} onChange={(e) => setReguaSel(e.target.value)}><option value="">Escolha…</option>{reguas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
        {reguas.length === 0 && <div className="rel-hint">Nenhuma régua ativa. Crie e ative uma régua na aba Réguas.</div>}
      </div>
      <div className="field"><label>Canal (número normal)</label><select className="ctrl" value={canalSel} onChange={(e) => setCanalSel(e.target.value)}><option value="">Escolha…</option>{(canais.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.numero ? ` · ${c.numero}` : ''}</option>)}</select>
        {canais.data && canais.data.length === 0 && <div className="rel-hint">Nenhum canal normal conectado disponível.</div>}
      </div>
      <div className="rel-callout"><span>No máximo <strong>{reguas.find((r) => r.id === reguaSel)?.tetoSemana ?? 3} msg/semana</strong>, só em horário permitido. Se o cliente responder e a régua pausar por resposta, o relacionamento pausa sozinho.</span></div>
    </Modal>
  );
}

// ===========================================================================
// Calendário / Modelos / Histórico
// ===========================================================================
function AbaCalendario() {
  const vivas = useAtivacoes('vivas');
  const comProximo = (vivas.data ?? []).filter((a) => a.status === 'ativo' && a.proximoEm).sort((a, b) => (a.proximoEm! < b.proximoEm! ? -1 : 1));
  return (
    <div className="rel-view">
      <div className="rel-view-head"><div><h2>Calendário</h2><p>Próximos envios programados por cliente.</p></div></div>
      <div className="rel-callout info" style={{ marginBottom: 16 }}><span>O motor de envio ainda não está ligado — quando estiver, cada passo aparecerá aqui com data/horário e poderá ser editado ou cancelado.</span></div>
      <div className="card"><div className="card-head"><h3>Próximos por cliente</h3></div>
        <div className="rel-list">
          {comProximo.length === 0 ? <div className="rel-empty">Nada programado ainda.</div>
            : comProximo.map((a) => <div className="rel-row" key={a.id}><span className="rel-av">{iniciais(a.contatoNome)}</span><div className="rel-row-main"><div className="rel-row-n">{a.contatoNome}</div><div className="rel-row-s">{a.reguaNome}</div></div><span className="rel-mono rel-sub">{fmtDataHora(a.proximoEm)}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function AbaModelos({ onIr }: { onIr: (a: Aba) => void }) {
  return (
    <div className="rel-view">
      <div className="rel-view-head"><div><h2>Modelos</h2><p>Biblioteca de mensagens reutilizáveis.</p></div></div>
      <div className="rel-callout info"><span>Nesta fase, as mensagens vivem como <strong>passos dentro de cada régua</strong>. Uma biblioteca de modelos independente (reaproveitável entre réguas) chega num próximo incremento. <button className="rel-link" onClick={() => onIr('reguas')}>Ir para Réguas</button></span></div>
    </div>
  );
}

function AbaHistorico() {
  const envios = useHistoricoEnvios(100);
  const todas = useAtivacoes('todas');
  // Enquanto o motor está inerte, o histórico mostra as ATIVAÇÕES (ativado/pausado/desativado).
  const eventos = useMemo(() => {
    const evs: { quando: string; tipo: string; badge: string; cliente: string | null; regua: string | null }[] = [];
    (todas.data ?? []).forEach((a) => {
      evs.push({ quando: a.ativadoEm, tipo: 'Relacionamento ativado', badge: 'ok', cliente: a.contatoNome, regua: a.reguaNome });
      if (a.pausadoEm) evs.push({ quando: a.pausadoEm, tipo: a.motivoSaida === 'respondeu' ? 'Pausado — cliente respondeu' : 'Pausado', badge: 'warn', cliente: a.contatoNome, regua: a.reguaNome });
      if (a.desativadoEm) evs.push({ quando: a.desativadoEm, tipo: 'Desativado', badge: 'neutral', cliente: a.contatoNome, regua: a.reguaNome });
    });
    return evs.sort((x, y) => (x.quando < y.quando ? 1 : -1)).slice(0, 100);
  }, [todas.data]);

  return (
    <div className="rel-view">
      <div className="rel-view-head"><div><h2>Histórico</h2><p>Ativações, pausas e (quando o motor ligar) envios e respostas.</p></div></div>
      <div className="rel-tbl-wrap">
        <table className="rel-tbl">
          <thead><tr><th>Quando</th><th>Cliente</th><th>Régua</th><th>Evento</th></tr></thead>
          <tbody>
            {(envios.data ?? []).map((e) => (
              <tr key={e.id}><td className="rel-sub rel-mono">{fmtDataHora(e.criadoEm)}</td><td>{e.contatoNome || '—'}</td><td className="rel-sub">{e.reguaNome || '—'}</td><td><span className="badge blue">{e.status}</span></td></tr>
            ))}
            {eventos.length === 0 && (envios.data ?? []).length === 0 ? <tr><td colSpan={4} className="rel-empty">Nenhum evento ainda.</td></tr>
              : eventos.map((e, i) => (
                <tr key={i}><td className="rel-sub rel-mono">{fmtDataHora(e.quando)}</td><td>{e.cliente || '—'}</td><td className="rel-sub">{e.regua || '—'}</td><td><span className={'badge ' + e.badge}>{e.tipo}</span></td></tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
