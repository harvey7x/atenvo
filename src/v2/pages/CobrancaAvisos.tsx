/* =====================================================================
   Área de Avisos — o ADMINISTRATIVO (admin/gestor) publica avisos pro
   time comercial: texto + vários anexos (imagem, áudio gravado ou
   arquivo, vídeo, documento), escolhendo os destinatários. O comercial
   vê os avisos na tela dele (aba própria + badge no menu + alerta
   flutuante) e cada um tem recibo de leitura.
   Demo: localStorage (alfa_avisos_v1) com persona de comercial pra
   demonstrar a visão de quem recebe. Reviza: banco dedicado (reviza_21).
   ===================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { isRevizaMode } from '@/lib/supabase';
import {
  AudioRecorderV2, BotaoPrimario, BotaoSec, CardVidro,
  ConfirmDialogV2, EstadoErro, EstadoVazio, ModalV2, Segmentado, Skeleton, Toggle,
} from '../components';
import {
  avCarregar, avSalvar, avPersona, avSetPersona, tipoDoAnexo, urlAnexoAviso,
  useAvisos, useAvisosNaoLidos, useCriarAviso, useExcluirAviso, useMarcarAvisoLido,
  type Aviso, type AvisoDemo, type AnexoAviso, type NovoAnexoAviso, type TipoAnexoAviso,
} from '../data/cobranca/avisos';
import { useUsuarios } from '../data/cobranca/usuarios';
import { ambientesCadastrados as ambientesDoPerfil } from '../data/modulos';
import type { Papel } from '../data/cobranca/types';
import { ATENDENTES_DEMO } from './cobrancaAnalytics';
import { AcoesNoTopo } from './comunicacao/MenuMais';
import './painel/painel.css';

const fmtQuando = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
function msgErro(m: string): string {
  const s = (m || '').toLowerCase();
  if (s.includes('42501') || s.includes('row-level') || s.includes('permission') || s.includes('violates')) return 'Você não tem permissão para esta ação.';
  return 'Não foi possível concluir: ' + m;
}

/* ícones (traço fino, sem emoji no cromo) */
const IcClipe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M21 12.5l-8.5 8.5a6 6 0 01-8.5-8.5L12.5 4a4 4 0 015.7 5.7L9.7 18.2a2 2 0 01-2.9-2.9l7.8-7.8" /></svg>
);
const IcMic = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></svg>
);
const IcDoc = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
const IcMegafone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 10v4a1 1 0 001 1h2.5L13 19V5l-6.5 4H4a1 1 0 00-1 1z" /><path d="M16.5 9a5 5 0 010 6M19 6.5a9 9 0 010 11" /></svg>
);

const ROTULO_TIPO: Record<TipoAnexoAviso, string> = { imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };
const MAX_ANEXOS = 5;

/* ---------------- anexo (render por tipo; real assina a URL) ---------------- */

const IcLixo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
);
const IcCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
);
const iniciais = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const horaBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/** cabeçalho de dia do mural: Hoje / Ontem / 27 de setembro (com o ano quando não é o corrente) */
function diaRotulo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', ...(d.getFullYear() !== hoje.getFullYear() ? { year: 'numeric' } : {}) });
}

function AnexoView({ anexo, aoAbrirImagem }: { anexo: AnexoAviso; aoAbrirImagem?: (url: string, nome: string) => void }) {
  const [url, setUrl] = useState<string | null>(anexo.url ?? null);
  useEffect(() => {
    if (anexo.url || !anexo.path) return;
    let vivo = true;
    void urlAnexoAviso(anexo.path).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [anexo.url, anexo.path]);
  if (!url) return <span className="pn-mural-carregando">Carregando anexo…</span>;
  const nome = anexo.nome || ROTULO_TIPO[anexo.tipo].toLowerCase();
  if (anexo.tipo === 'imagem') {
    return (
      <button type="button" className="pn-mural-img" onClick={() => aoAbrirImagem?.(url, nome)} title="Abrir imagem" aria-label={`Abrir imagem ${nome}`}>
        <img src={url} alt={nome} />
      </button>
    );
  }
  if (anexo.tipo === 'video') return <video className="pn-mural-video" src={url} controls />;
  if (anexo.tipo === 'audio') return <div className="pn-mural-audio"><span className="pn-mural-audio-ic" aria-hidden><IcMic /></span><audio src={url} controls /></div>;
  return (
    <a className="pn-mural-doc" href={url} target="_blank" rel="noreferrer" download={anexo.nome || undefined}>
      <span className="pn-mural-doc-ic" aria-hidden><IcDoc /></span><span className="pn-mural-doc-nm">{nome}</span><span className="pn-mural-doc-ac">Baixar</span>
    </a>
  );
}

/** anel de leitura (quantos destinatários já viram) */
function AnelLeitura({ lidos, total }: { lidos: number; total: number }) {
  const r = 7, c = 2 * Math.PI * r, p = total ? lidos / total : 0;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="pn-mural-anel">
      <circle cx="9" cy="9" r={r} className="fundo" />
      <circle cx="9" cy="9" r={r} className="valor" strokeDasharray={`${(p * c).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 9 9)" />
    </svg>
  );
}

/* ---------------- card de um aviso ---------------- */

function AvisoCard({ aviso, adm, naoLido, aoMarcarLido, aoExcluir, aoAbrirImagem }: {
  aviso: Pick<Aviso, 'id' | 'autorNome' | 'corpo' | 'criadoEm' | 'anexos' | 'destinos'>;
  adm: boolean;
  naoLido: boolean;
  aoMarcarLido?: (id: string) => void;
  aoExcluir?: () => void;
  aoAbrirImagem?: (url: string, nome: string) => void;
}) {
  // recebeu e ainda não leu: depois de 1,4s com o card na tela, marca como visto
  useEffect(() => {
    if (!naoLido || !aoMarcarLido) return;
    const t = window.setTimeout(() => aoMarcarLido(aviso.id), 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naoLido, aviso.id]);
  const total = aviso.destinos.length;
  const lidos = aviso.destinos.filter((d) => d.lidoEm).length;
  const todos = total > 0 && lidos === total;
  return (
    <article className={naoLido ? 'vidro pn-mural-card novo' : 'vidro pn-mural-card'}>
      <span className="pn-mural-ic" aria-hidden><IcMegafone /></span>
      <div className="pn-mural-conteudo">
        <header className="pn-mural-cab">
          <b className="pn-mural-autor">{aviso.autorNome || 'Administrativo'}</b>
          <time className="pn-mural-quando num" dateTime={aviso.criadoEm} title={fmtQuando(aviso.criadoEm)}>{horaBR(aviso.criadoEm)} · {haQuanto(aviso.criadoEm)}</time>
          {naoLido && <span className="pn-tag">Novo</span>}
          <span className="pn-mural-esp" />
          {adm && total > 0 && (
            <span className={todos ? 'pn-mural-leit ok' : 'pn-mural-leit'} title={`${lidos} de ${total} destinatário${total === 1 ? '' : 's'} já leu`}>
              <AnelLeitura lidos={lidos} total={total} />
              {todos ? 'Todos leram' : `${lidos} de ${total} leram`}
            </span>
          )}
          {adm && aoExcluir && <button type="button" className="pn-fin-lixo" onClick={aoExcluir} aria-label="Excluir aviso" title="Excluir aviso"><IcLixo /></button>}
        </header>
        {aviso.corpo && <p className="pn-mural-txt">{aviso.corpo}</p>}
        {aviso.anexos.length > 0 && (
          <div className="pn-mural-anexos">
            {aviso.anexos.map((a) => <AnexoView key={a.id} anexo={a} aoAbrirImagem={aoAbrirImagem} />)}
          </div>
        )}
        {adm && total > 0 && (
          <footer className="pn-mural-dest">
            <span className="pn-mural-dest-rot">Para</span>
            {aviso.destinos.map((d) => (
              <span key={d.userId} className={d.lidoEm ? 'pn-mural-p lido' : 'pn-mural-p'} title={d.lidoEm ? `${d.nome} leu em ${fmtQuando(d.lidoEm)}` : `${d.nome} ainda não leu`}>
                <span className="pn-mural-p-av" aria-hidden>{iniciais(d.nome)}</span>
                {d.nome}
                {d.lidoEm ? <span className="pn-mural-p-ok" aria-label="leu"><IcCheck /></span> : <span className="pn-mural-p-st">não leu</span>}
              </span>
            ))}
          </footer>
        )}
      </div>
    </article>
  );
}

/* ---------------- composer (novo aviso) ---------------- */

interface AnexoRascunho extends NovoAnexoAviso { prevUrl: string }
interface DestinoOpcao { userId: string; nome: string; papel?: string }

function NovoAvisoModal({ destinosOpcoes, maxMb, aoEnviar, aoFechar }: {
  destinosOpcoes: DestinoOpcao[];
  maxMb: number;
  aoEnviar: (a: { corpo: string; paraTodos: boolean; destinos: DestinoOpcao[]; anexos: AnexoRascunho[] }) => Promise<void>;
  aoFechar: () => void;
}) {
  const [corpo, setCorpo] = useState('');
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [todos, setTodos] = useState(false);
  const [anexos, setAnexos] = useState<AnexoRascunho[]>([]);
  const [gravar, setGravar] = useState(false);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { anexos.forEach((a) => { if (a.prevUrl.startsWith('blob:')) URL.revokeObjectURL(a.prevUrl); }); }, [anexos]);

  const escolhidos = todos ? destinosOpcoes : destinosOpcoes.filter((d) => sel.has(d.userId));

  function alternar(id: string) {
    setTodos(false);
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function addArquivos(files: FileList | null) {
    if (!files) return;
    setErro('');
    const novos: AnexoRascunho[] = [];
    for (const f of Array.from(files)) {
      if (anexos.length + novos.length >= MAX_ANEXOS) { setErro(`No máximo ${MAX_ANEXOS} anexos por aviso.`); break; }
      if (f.size > maxMb * 1024 * 1024) { setErro(`"${f.name}" passa de ${maxMb}MB — anexe um arquivo menor.`); continue; }
      novos.push({ arquivo: f, nome: f.name, tipo: tipoDoAnexo(f.type), prevUrl: URL.createObjectURL(f) });
    }
    if (novos.length) setAnexos((l) => [...l, ...novos]);
  }
  async function addAudio(blob: Blob, mime: string, ext: string) {
    if (anexos.length >= MAX_ANEXOS) { setErro(`No máximo ${MAX_ANEXOS} anexos por aviso.`); return; }
    const nome = `audio-${Date.now().toString(36)}.${ext}`;
    setAnexos((l) => [...l, { arquivo: new File([blob], nome, { type: mime }), nome, tipo: 'audio', prevUrl: URL.createObjectURL(blob) }]);
    setGravar(false);
  }
  function removerAnexo(i: number) {
    setAnexos((l) => { const a = l[i]; if (a?.prevUrl.startsWith('blob:')) URL.revokeObjectURL(a.prevUrl); return l.filter((_, k) => k !== i); });
  }
  async function enviar() {
    if (busy) return;
    if (!corpo.trim() && anexos.length === 0) { setErro('Escreva a mensagem ou anexe pelo menos um arquivo.'); return; }
    if (escolhidos.length === 0) { setErro('Escolha para quem vai o aviso.'); return; }
    setBusy(true); setErro('');
    try { await aoEnviar({ corpo: corpo.trim(), paraTodos: todos, destinos: escolhidos, anexos }); aoFechar(); }
    catch (e) { setErro(msgErro((e as Error).message)); }
    finally { setBusy(false); }
  }

  return (
    <ModalV2
      aberto aoFechar={() => { if (!busy) aoFechar(); }} fecharNoVeu={!busy} largura={600}
      titulo={<div>Novo aviso<div className="mod-sub">Mensagem, áudios, imagens e documentos. A equipe vê na tela de Avisos na hora.</div></div>}
      rodape={<>
        <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={busy} onClick={enviar}>{busy ? 'Enviando…' : `Enviar aviso${escolhidos.length ? ` · ${escolhidos.length}` : ''}`}</BotaoPrimario>
      </>}
    >
      <div className="form-grid">
        <div className="campo">
          <label>Mensagem</label>
          <textarea className="inp" rows={4} value={corpo} placeholder="O que o time precisa saber…"
            style={{ resize: 'vertical', minHeight: 84, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 1.5, padding: '9px 12px' }}
            onChange={(e) => setCorpo(e.target.value)} disabled={busy} />
        </div>

        <div className="campo">
          <label>Anexos <span className="av-hint">({anexos.length}/{MAX_ANEXOS} · até {maxMb}MB cada)</span></label>
          <input ref={arquivoRef} type="file" hidden multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={(e) => { addArquivos(e.target.files); e.target.value = ''; }} />
          <div className="av-anexo-btns">
            <BotaoSec disabled={busy || anexos.length >= MAX_ANEXOS} onClick={() => arquivoRef.current?.click()}><IcClipe /> Anexar arquivos</BotaoSec>
            <BotaoSec disabled={busy || anexos.length >= MAX_ANEXOS} onClick={() => setGravar((v) => !v)}><IcMic /> {gravar ? 'Fechar gravador' : 'Gravar áudio'}</BotaoSec>
          </div>
          {gravar && (
            <div className="av-gravador">
              <AudioRecorderV2 permitirArquivo rotuloEnviar="Anexar áudio" disabled={busy}
                onEnviar={async (blob, mime, ext) => { await addAudio(blob, mime, ext); }} />
            </div>
          )}
          {anexos.length > 0 && (
            <div className="av-rascunhos">
              {anexos.map((a, i) => (
                <span key={a.prevUrl} className="av-rascunho">
                  {a.tipo === 'imagem'
                    ? <img src={a.prevUrl} alt="" />
                    : <span className="av-rascunho-tipo caps">{ROTULO_TIPO[a.tipo]}</span>}
                  <span className="av-rascunho-nome">{a.nome}</span>
                  <button type="button" aria-label={`Remover ${a.nome}`} onClick={() => removerAnexo(i)} disabled={busy}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="campo">
          <label>Enviar para</label>
          <div className="av-todos">
            <Toggle ligado={todos} aoMudar={(v) => { setTodos(v); if (v) setSel(new Set()); }} rotulo="Todos do time" disabled={busy || destinosOpcoes.length === 0} />
            <span className="av-hint">Todos do time ({destinosOpcoes.length})</span>
          </div>
          {destinosOpcoes.length === 0 ? (
            <p className="cm-hint" style={{ margin: '6px 0 0' }}>Nenhum usuário ativo para receber. Cadastre a equipe em Usuários.</p>
          ) : (
            <div className="av-destinos-sel">
              {destinosOpcoes.map((d) => {
                const on = todos || sel.has(d.userId);
                return (
                  <button key={d.userId} type="button" className={on ? 'av-dest-op on' : 'av-dest-op'}
                    aria-pressed={on} onClick={() => alternar(d.userId)} disabled={busy}>
                    {d.nome}{d.papel && d.papel !== 'comercial' ? <i> · {d.papel}</i> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {erro && <div className="aviso-inline erro" role="alert">{erro}</div>}
      </div>
    </ModalV2>
  );
}

/* ---------------- alerta flutuante (aparece pro comercial em qualquer tela) ---------------- */

const haQuanto = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
};

export function AvisosAlerta({ abaAtual }: { abaAtual: string }) {
  const navigate = useNavigate();
  const naoLidos = useAvisosNaoLidos().data ?? 0;
  const listaQ = useAvisos(naoLidos > 0);           // real: pega o texto do mais recente não lido
  const [fechadoEm, setFechadoEm] = useState(0);
  if (naoLidos <= 0 || abaAtual === 'avisos' || fechadoEm === naoLidos) return null;
  const persona = !isRevizaMode ? avPersona() : null;
  const ultimo: { autorNome: string; corpo: string; criadoEm: string } | null = isRevizaMode
    ? (listaQ.data ?? []).find((a) => a.souDestinatario && !a.meuLidoEm) ?? null
    : avCarregar().filter((a) => a.destinos.some((d) => d.nome === persona && !d.lidoEm))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
  const previa = ultimo ? ultimo.corpo.replace(/\s+/g, ' ').trim() : '';
  return (
    <div className="av-alerta sobe" role="status" aria-live="polite">
      <div className="av-alerta-cab">
        <span className="av-alerta-ic" aria-hidden>
          <IcMegafone />
          {naoLidos > 1 && <i className="num">{naoLidos > 9 ? '9+' : naoLidos}</i>}
        </span>
        <div className="av-alerta-tx">
          <b>{naoLidos === 1 ? 'Novo aviso do administrativo' : `${naoLidos} avisos novos do administrativo`}</b>
          {previa && <p title={previa}>{previa}</p>}
          <span className="av-alerta-meta">
            {ultimo ? `${ultimo.autorNome || 'Administrativo'} · ${haQuanto(ultimo.criadoEm)}` : 'Abra para ler'}
            {persona && <em>Visão do comercial {persona}</em>}
          </span>
        </div>
        <button type="button" className="av-alerta-x" aria-label="Dispensar aviso" title="Dispensar" onClick={() => setFechadoEm(naoLidos)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="av-alerta-acoes">
        <button type="button" className="av-alerta-dispensar" onClick={() => setFechadoEm(naoLidos)}>Dispensar</button>
        <BotaoPrimario mini onClick={() => navigate('/cobrancas/avisos')}>{naoLidos === 1 ? 'Ver aviso' : 'Ver avisos'}</BotaoPrimario>
      </div>
    </div>
  );
}

/* ---------------- aba ---------------- */

function blobPraDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('falha ao ler o arquivo')); r.readAsDataURL(b); });
}

/** estado vazio de Avisos: megafone (traço 1,5, o mesmo da barra lateral) */
const IconeMegafone = () => (
  <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);

export function AbaAvisos({ gestor, papel }: { gestor: boolean; papel?: Papel }) {
  const real = isRevizaMode;
  // demo roda como gestor: o seletor de visão demonstra o lado do comercial
  const adm = real ? (papel === 'admin' || papel === 'gestor' || (papel == null && gestor)) : true;

  const [visao, setVisao] = useState<'adm' | 'com'>('adm');
  const [persona, setPersona] = useState(avPersona);
  const [demoLista, setDemoLista] = useState<AvisoDemo[]>(() => (real ? [] : avCarregar()));
  const [novo, setNovo] = useState(false);
  const [excluir, setExcluir] = useState<{ id: string; paths: string[] } | null>(null);
  const [aviso, setAviso] = useState('');

  const q = useAvisos(real);
  const usuariosQ = useUsuarios(real && adm);
  const criar = useCriarAviso();
  const marcar = useMarcarAvisoLido();
  const excluirMut = useExcluirAviso();

  const qcAvisos = useQueryClient();
  function demoAtualizar(f: (l: AvisoDemo[]) => AvisoDemo[]) {
    setDemoLista((l) => { const n = f(l); avSalvar(n); return n; });
    // o selo do menu e o alerta flutuante leem a query de não-lidos (polling 5s):
    // invalida junto pra refletirem NA HORA a leitura/criação feita aqui no demo
    void qcAvisos.invalidateQueries({ queryKey: ['reviza', 'avisos', 'nao-lidos'] });
  }

  // destinatários: no real, usuários ATIVOS que não são admin (comerciais primeiro); demo usa os 8 nomes
  const destinosOpcoes: DestinoOpcao[] = useMemo(() => {
    if (!real) return ATENDENTES_DEMO.map((n) => ({ userId: `p-${n}`, nome: n }));
    const ROTULO: Record<string, string> = { comercial: 'comercial', financeiro: 'financeiro', cadastro: 'cadastro', gestor: 'gestor' };
    return (usuariosQ.data ?? [])
      // só quem tem o ambiente Cobranças (o atendente, e quem só tem o Atendimento, nunca abriria o aviso)
      .filter((u) => u.ativo && u.papel !== 'admin' && ambientesDoPerfil(u.papel, u.modulos).includes('cobrancas'))
      .sort((a, b) => (a.papel === 'comercial' ? 0 : 1) - (b.papel === 'comercial' ? 0 : 1) || a.nome.localeCompare(b.nome))
      .map((u) => ({ userId: u.id, nome: u.nome || u.usuario, papel: ROTULO[u.papel] ?? u.papel }));
  }, [real, usuariosQ.data]);

  async function enviar(a: { corpo: string; paraTodos: boolean; destinos: DestinoOpcao[]; anexos: AnexoRascunho[] }) {
    if (real) {
      await criar.mutateAsync({
        corpo: a.corpo, paraTodos: a.paraTodos,
        destinos: a.destinos.map((d) => ({ userId: d.userId, nome: d.nome })),
        anexos: a.anexos.map((x) => ({ arquivo: x.arquivo, nome: x.nome, tipo: x.tipo })),
      });
    } else {
      const anexos: AnexoAviso[] = [];
      for (const x of a.anexos) anexos.push({ id: `ax-${Date.now().toString(36)}-${anexos.length}`, tipo: x.tipo, nome: x.nome, url: await blobPraDataUrl(x.arquivo) });
      demoAtualizar((l) => [{
        id: `av-${Date.now().toString(36)}`, autorNome: 'Administrativo', corpo: a.corpo, criadoEm: new Date().toISOString(),
        anexos, destinos: a.destinos.map((d) => ({ userId: d.userId, nome: d.nome, lidoEm: null })),
      }, ...l]);
    }
    setAviso(a.destinos.length === 1 ? `Aviso enviado para ${a.destinos[0].nome}.` : `Aviso enviado para ${a.destinos.length} pessoas.`);
  }

  function marcarLido(id: string) {
    if (real) { marcar.mutate(id); return; }
    demoAtualizar((l) => l.map((av) => av.id !== id ? av : {
      ...av, destinos: av.destinos.map((d) => d.nome === persona && !d.lidoEm ? { ...d, lidoEm: new Date().toISOString() } : d),
    }));
  }

  // visão do comercial (real): quem NÃO é adm só enxerga o que recebeu (o RLS já garante; aqui é só a ordem)
  const listaReal = q.data ?? [];
  const listaDemoCom = demoLista
    .filter((av) => av.destinos.some((d) => d.nome === persona))
    .map((av) => ({ ...av, meuLidoEm: av.destinos.find((d) => d.nome === persona)?.lidoEm ?? null }));

  const comercialVe = real ? !adm : visao === 'com';
  const [imagem, setImagem] = useState<{ url: string; nome: string } | null>(null);
  const listaAdm: (Aviso | AvisoDemo)[] = real ? listaReal : demoLista;
  const listaCom = real ? listaReal.filter((av) => av.souDestinatario) : listaDemoCom;
  const naoLidos = listaCom.filter((av) => !av.meuLidoEm).length;
  const totalDest = listaAdm.reduce((n, av) => n + av.destinos.length, 0);
  const totalLidos = listaAdm.reduce((n, av) => n + av.destinos.filter((d) => d.lidoEm).length, 0);
  const nAvisos = comercialVe ? listaCom.length : listaAdm.length;
  // mural agrupado por DIA (a lista já vem do mais novo pro mais antigo)
  function porDia<T extends { criadoEm: string }>(l: T[]): { dia: string; itens: T[] }[] {
    const out: { dia: string; itens: T[] }[] = [];
    for (const av of l) {
      const dia = diaRotulo(av.criadoEm);
      const g = out[out.length - 1];
      if (g && g.dia === dia) g.itens.push(av); else out.push({ dia, itens: [av] });
    }
    return out;
  }

  return (
    <div className="pn">
      {/* a ação da tela no cabeçalho da página (um só "Novo aviso": o do estado vazio saiu) */}
      {adm && !comercialVe && (
        <AcoesNoTopo>
          <BotaoPrimario onClick={() => setNovo(true)}>＋ Novo aviso</BotaoPrimario>
        </AcoesNoTopo>
      )}
      {/* barra de contexto: só quando há o que contar (sem avisos, o estado vazio já diz tudo) */}
      {(nAvisos > 0 || !real) && (
      <div className="pn-barra sobe">
        <div className="pn-barra-esq">
          <span className="pn-barra-rot">Mural da equipe</span>
          <span className="pn-barra-stat num"><b>{nAvisos}</b> aviso{nAvisos === 1 ? '' : 's'}</span>
          {!comercialVe && totalDest > 0 && <span className="pn-barra-stat num"><b>{Math.floor((totalLidos / totalDest) * 100)}%</b> de leitura</span>}
          {comercialVe && naoLidos > 0 && <span className="pn-barra-stat num"><b>{naoLidos}</b> não lido{naoLidos === 1 ? '' : 's'}</span>}
        </div>
        <div className="pn-barra-dir">
          {!real && (
            <>
              <Segmentado rotulo="Visão da tela" valor={visao} aoMudar={setVisao}
                opcoes={[{ valor: 'adm', rotulo: 'Administrativo' }, { valor: 'com', rotulo: 'Como o comercial vê' }]} />
              {visao === 'com' && (
                <select className="inp av-persona" value={persona} aria-label="Ver como"
                  onChange={(e) => { setPersona(e.target.value); avSetPersona(e.target.value); }}>
                  {ATENDENTES_DEMO.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {aviso && (
        <div className="aviso-inline" role="status">{aviso}<button type="button" onClick={() => setAviso('')} aria-label="Fechar aviso">×</button></div>
      )}

      {real && q.isError ? (
        <CardVidro sobe><EstadoErro descricao="Não conseguimos carregar os avisos. Verifique a conexão." aoTentarDeNovo={() => q.refetch()} /></CardVidro>
      ) : real && q.isLoading ? (
        <CardVidro sobe style={{ padding: '16px 18px' }}><Skeleton largura="40%" /><div style={{ marginTop: 10 }}><Skeleton largura="90%" /></div><div style={{ marginTop: 6 }}><Skeleton largura="70%" /></div></CardVidro>
      ) : comercialVe ? (
        /* -------- visão do COMERCIAL: o que recebeu, não-lido em destaque -------- */
        listaCom.length === 0
          ? <CardVidro sobe><EstadoVazio icone={<IconeMegafone />} titulo="Nenhum aviso por enquanto" descricao="Quando o administrativo enviar um aviso, ele aparece aqui na hora." /></CardVidro>
          : (
            <div className="pn-mural sobe">
              {porDia(listaCom).map((g) => (
                <section key={g.dia} className="pn-mural-dia" aria-label={g.dia}>
                  <h3 className="pn-mural-dia-rot">{g.dia}</h3>
                  {g.itens.map((av) => (
                    <AvisoCard key={av.id} aviso={av} adm={false} naoLido={!av.meuLidoEm} aoMarcarLido={marcarLido}
                      aoAbrirImagem={(url, nome) => setImagem({ url, nome })} />
                  ))}
                </section>
              ))}
            </div>
          )
      ) : (
        /* -------- visão do ADMINISTRATIVO: histórico + recibos de leitura -------- */
        listaAdm.length === 0
          ? (
            <CardVidro sobe>
              <EstadoVazio icone={<IconeMegafone />} titulo="Nenhum aviso enviado" descricao="Publique um aviso com mensagem, áudios, imagens ou documentos para a equipe." />
            </CardVidro>
          ) : (
            <div className="pn-mural sobe">
              {porDia(listaAdm).map((g) => (
                <section key={g.dia} className="pn-mural-dia" aria-label={g.dia}>
                  <h3 className="pn-mural-dia-rot">{g.dia}</h3>
                  {g.itens.map((av) => (
                    <AvisoCard key={av.id} aviso={av} adm naoLido={false}
                      aoExcluir={adm ? () => setExcluir({ id: av.id, paths: av.anexos.map((a) => a.path ?? '').filter(Boolean) }) : undefined}
                      aoAbrirImagem={(url, nome) => setImagem({ url, nome })} />
                  ))}
                </section>
              ))}
            </div>
          )
      )}

      {imagem && (
        <ModalV2 aberto aoFechar={() => setImagem(null)} largura={860}
          titulo={<div>Imagem do aviso<div className="mod-sub">{imagem.nome}</div></div>}
          rodape={<><a className="pn-link" href={imagem.url} target="_blank" rel="noreferrer" download={imagem.nome}>Baixar</a><span style={{ flex: 1 }} /><BotaoSec onClick={() => setImagem(null)}>Fechar</BotaoSec></>}>
          <img src={imagem.url} alt={imagem.nome} className="pn-mural-lightbox" />
        </ModalV2>
      )}

      {novo && (
        <NovoAvisoModal destinosOpcoes={destinosOpcoes} maxMb={real ? 16 : 3}
          aoEnviar={enviar} aoFechar={() => setNovo(false)} />
      )}

      <ConfirmDialogV2
        aberto={!!excluir}
        titulo="Excluir aviso"
        mensagem="O aviso some da tela de todo mundo, junto com os anexos. Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir aviso"
        destrutivo
        carregando={excluirMut.isPending}
        aoConfirmar={() => {
          if (!excluir) return;
          if (real) {
            excluirMut.mutate(excluir, { onSuccess: () => { setExcluir(null); setAviso('Aviso excluído.'); }, onError: (e) => { setExcluir(null); setAviso(msgErro((e as Error).message)); } });
          } else {
            demoAtualizar((l) => l.filter((av) => av.id !== excluir.id));
            setExcluir(null); setAviso('Aviso excluído.');
          }
        }}
        aoCancelar={() => setExcluir(null)}
      />
    </div>
  );
}
