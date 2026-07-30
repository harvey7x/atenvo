import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import {
  SCRIPTS_REAL, useScripts, useScriptCategorias, useScriptMutations, useScriptCategoriaMutations,
  useScriptEtapaMutations, fetchEtapas, urlAssinadaAnexo, formatarTamanho, substituirVariaveis, SCRIPT_VARIAVEIS,
  type Script, type ScriptCategoria, type EtapaItem, type EtapaTipo,
} from '@/data/scripts';
import { useScriptsResumoEtapas, type ResumoEtapas } from '../hooks/scriptsResumo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, ConfirmDialogV2,
  DrawerV2, EstadoErro, EstadoVazio, Input, LinhaToggle, ModalV2, Segmentado, Skeleton,
} from '../components';
import './scripts.css';

/* ------------------------------------------------------------------
   Scripts v2.1 — ARSENAL: o conteúdo é a interface. Galeria de cards
   que mostram o script como bolha de mensagem (favoritos no topo,
   seções por categoria); detalhe em DrawerV2 com a sequência inteira;
   editor em ModalV2. Funcional de src/pages/Scripts.tsx (somente
   leitura). Os scripts ativos alimentam as respostas rápidas do
   atendimento — a ponte fica visível no drawer e no subtítulo.
   ------------------------------------------------------------------ */

const TIPO_LABEL: Record<EtapaTipo, string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };
const ACCEPT: Record<EtapaTipo, string> = { texto: '', imagem: 'image/*', audio: 'audio/*', video: 'video/*', documento: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv' };
const HORA_FAKE = '09:41';

type CanalFiltro = 'todos' | 'whatsapp' | 'facebook' | 'ambos';
function classificaCanal(canais: string[]): 'whatsapp' | 'facebook' | 'ambos' {
  const wa = canais.includes('whatsapp'); const fb = canais.includes('facebook');
  if ((wa && fb) || canais.length === 0) return 'ambos';
  return wa ? 'whatsapp' : 'facebook';
}
const CanalPills = ({ canais }: { canais: string[] }) => (
  <span style={{ display: 'inline-flex', gap: 4 }}>
    {(canais.length ? canais : ['whatsapp', 'facebook']).map((c) => (
      <em className="ag-pill" key={c} style={{ fontStyle: 'normal' }}>{c === 'whatsapp' ? 'WhatsApp' : 'Facebook'}</em>
    ))}
  </span>
);
const Estrela = ({ cheia }: { cheia: boolean }) => cheia
  ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m12 2 2.9 6.3 6.8.7-5.1 4.6 1.4 6.7L12 17.8 6 21l1.4-6.7L2.3 9.7l6.8-.7z" /></svg>
  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17.9 6.1 20l1.3-6.2-4.7-4.3 6.3-.7z" /></svg>;

/** Realce tipográfico das {{variáveis}} — o v1 mostra o texto cru na lista,
    então aqui só destacamos, sem substituir (substituição fica no preview). */
function DestacaVars({ texto }: { texto: string }) {
  return <>{texto.split(/(\{\{[^}]+\}\})/g).map((p, i) => /^\{\{[^}]+\}\}$/.test(p) ? <em className="var-hl" key={i}>{p}</em> : p)}</>;
}
function variaveisDe(textos: string[]): string[] {
  const achadas = new Set<string>();
  for (const t of textos) for (const m of t.matchAll(/\{\{[^}]+\}\}/g)) achadas.add(m[0]);
  return Array.from(achadas);
}

type Step = EtapaItem & { previewUrl?: string };
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

/* ---------- modo demonstração: seed + mutações em memória ---------- */
const CATS_DEMO: ScriptCategoria[] = [
  { id: 'cat-1', nome: 'Boas-vindas' },
  { id: 'cat-2', nome: 'Documentação' },
  { id: 'cat-3', nome: 'Pós-fechamento' },
] as ScriptCategoria[];

function seedScripts(): { scripts: Script[]; etapas: Record<string, EtapaItem[]> } {
  const mk = (i: number, extra: Partial<Script>): Script => ({
    id: `scr-${i}`, titulo: '', descricao: null, conteudo: '', categoriaId: null, canais: ['whatsapp'],
    favorito: false, ativo: true, tags: [], autorId: null, criadoEm: '', atualizadoEm: '', ...extra,
  });
  const scripts = [
    mk(1, { titulo: 'Boas-vindas · primeiro contato', categoriaId: 'cat-1', favorito: true, conteudo: 'Olá, {{primeiro_nome_cliente}}! Aqui é {{nome_atendente}}, da {{nome_empresa}}. Recebemos seu contato e vamos te ajudar com a análise do seu benefício.', tags: ['entrada'], canais: ['whatsapp', 'facebook'] }),
    mk(2, { titulo: 'Pedir documentos', categoriaId: 'cat-2', conteudo: 'Para seguirmos, {{primeiro_nome_cliente}}, preciso de uma foto do seu documento com foto (RG ou CNH) e do seu cartão do benefício, tudo bem?', tags: ['docs'] }),
    mk(3, { titulo: 'Passo a passo Meu INSS', categoriaId: 'cat-2', favorito: true, conteudo: 'Segue o passo a passo para conferir os descontos no aplicativo Meu INSS. Qualquer dúvida me chama por aqui.', tags: ['docs', 'inss'] }),
    mk(4, { titulo: 'Agradecimento pós-fechamento', categoriaId: 'cat-3', conteudo: 'Obrigado pela confiança, {{nome_cliente}}! A {{nome_empresa}} segue à disposição. Vou te acompanhando por aqui.', canais: ['whatsapp', 'facebook'] }),
    mk(5, { titulo: 'Retomada de conversa parada', categoriaId: null, conteudo: 'Oi, {{primeiro_nome_cliente}}! Passando para saber se ficou alguma dúvida da nossa última conversa.', tags: ['follow-up'] }),
    mk(6, { titulo: 'Mensagem fora do horário', categoriaId: 'cat-1', ativo: false, conteudo: 'Recebemos sua mensagem! Nosso atendimento é de segunda a sexta, das 9h às 18h — te respondemos no próximo horário.', canais: ['facebook'] }),
    // script só-mídia (conteudo vazio no v1): o card do arsenal mostra tipo+nome, nunca "—"
    mk(7, { titulo: 'Vídeo · como conferir descontos', categoriaId: 'cat-2', conteudo: '', tags: ['inss'] }),
  ];
  const etapas: Record<string, EtapaItem[]> = Object.fromEntries(scripts.map((s) => [s.id, [{ tipo: 'texto' as EtapaTipo, conteudo: s.conteudo }]]));
  etapas['scr-3'] = [
    { tipo: 'texto', conteudo: 'Segue o passo a passo para conferir os descontos no aplicativo Meu INSS. Qualquer dúvida me chama por aqui.' },
    { tipo: 'documento', conteudo: '', nome: 'passo-a-passo.pdf', tamanho: 182_000 },
  ];
  etapas['scr-7'] = [
    { tipo: 'video', conteudo: '', nome: 'como-conferir-descontos.mp4', tamanho: 4_800_000 },
  ];
  return { scripts, etapas };
}

export default function ScriptsV2() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const demo = !SCRIPTS_REAL;

  const scriptsQ = useScripts();
  const catsQ = useScriptCategorias();
  const resumoQ = useScriptsResumoEtapas();
  const mut = useScriptMutations();
  const catMut = useScriptCategoriaMutations();
  const etapaMut = useScriptEtapaMutations();

  const [demoDados, setDemoDados] = useState(() => (demo ? seedScripts() : { scripts: [], etapas: {} }));
  const [demoCats, setDemoCats] = useState<ScriptCategoria[]>(() => (demo ? CATS_DEMO : []));
  const scripts: Script[] = demo ? demoDados.scripts : (scriptsQ.data ?? []);
  const cats: ScriptCategoria[] = demo ? demoCats : (catsQ.data ?? []);
  const carregando = !demo && scriptsQ.isLoading;
  const erro = !demo && scriptsQ.isError;

  // resumo de etapas por script (cards): real via hook-espelho, demo derivado do seed
  const resumo: Record<string, ResumoEtapas> = useMemo(() => {
    if (!demo) return resumoQ.data ?? {};
    const map: Record<string, ResumoEtapas> = {};
    for (const [id, ets] of Object.entries(demoDados.etapas)) {
      const m: ResumoEtapas = { total: ets.length, temMidia: ets.some((e) => e.tipo !== 'texto') };
      if (ets[0]) m.primeira = { tipo: ets[0].tipo, nome: ets[0].nome ?? null };
      map[id] = m;
    }
    return map;
  }, [demo, demoDados.etapas, resumoQ.data]);

  // filtros — os mesmos do v1 (categoria, canal, favoritos, busca debounced 250ms)
  const [cat, setCat] = useState('all');
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>('todos');
  const [favOnly, setFavOnly] = useState(false);
  const [buscaRaw, setBuscaRaw] = useState('');
  const [busca, setBusca] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusca(buscaRaw.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [buscaRaw]);

  const lista = useMemo(() => scripts.filter((s) => {
    if (cat !== 'all' && s.categoriaId !== cat) return false;
    if (favOnly && !s.favorito) return false;
    if (canalFiltro !== 'todos' && classificaCanal(s.canais) !== canalFiltro) return false;
    if (busca && s.titulo.toLowerCase().indexOf(busca) < 0 && s.conteudo.toLowerCase().indexOf(busca) < 0) return false;
    return true;
  }), [scripts, cat, favOnly, canalFiltro, busca]);

  // galeria: favoritos no topo (atalho) + seções por categoria, "Sem categoria" ao final
  const favoritos = useMemo(() => lista.filter((s) => s.favorito), [lista]);
  const secoes = useMemo(() => {
    const ordem: { id: string | null; nome: string }[] = [
      ...cats.map((c) => ({ id: c.id as string | null, nome: c.nome })),
      { id: null, nome: 'Sem categoria' },
    ];
    return ordem
      .map((o) => ({ ...o, itens: lista.filter((s) => s.categoriaId === o.id) }))
      .filter((o) => o.itens.length > 0);
  }, [cats, lista]);

  function limpar() { setCat('all'); setCanalFiltro('todos'); setFavOnly(false); setBuscaRaw(''); setBusca(''); }
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.nome ?? '';

  // texto do vazio contextual — idêntico ao v1
  function textoVazio(): string {
    if (scripts.length === 0) return 'Nenhum script ainda.';
    if (busca) return 'Nenhum resultado para a busca.';
    if (favOnly) return 'Nenhum favorito neste filtro.';
    if (canalFiltro === 'whatsapp') return 'Nenhum script exclusivo de WhatsApp.';
    if (canalFiltro === 'facebook') return 'Nenhum script exclusivo de Facebook.';
    if (canalFiltro === 'ambos') return 'Nenhum script para ambos os canais.';
    if (cat !== 'all') return 'Nenhum script nesta categoria.';
    return 'Nenhum script neste filtro.';
  }

  const [aviso, setAviso] = useState<Aviso>(null);
  const [detId, setDetId] = useState<string | null>(null);
  const det = scripts.find((s) => s.id === detId) ?? null;
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; acao: () => Promise<void> } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [catsModal, setCatsModal] = useState(false);

  /* ── ações unificadas (reais ou seed demo) — paridade com o v1 ─────────── */
  const acoes = {
    async favoritar(s: Script) {
      if (demo) { setDemoDados((d) => ({ ...d, scripts: d.scripts.map((x) => x.id === s.id ? { ...x, favorito: !x.favorito } : x) })); return; }
      await mut.favoritar.mutateAsync({ id: s.id, favorito: !s.favorito });
    },
    async excluir(s: Script) {
      if (demo) { setDemoDados((d) => ({ scripts: d.scripts.filter((x) => x.id !== s.id), etapas: d.etapas })); return; }
      await mut.excluir.mutateAsync(s.id);
    },
    async duplicar(s: Script): Promise<{ temMidia: boolean }> {
      const etapasDe = demo ? (demoDados.etapas[s.id] ?? []) : await fetchEtapas(s.id);
      const temMidia = etapasDe.some((x) => x.tipo !== 'texto');
      const soTexto: EtapaItem[] = etapasDe.filter((x) => x.tipo === 'texto').map((x) => ({ tipo: 'texto', conteudo: x.conteudo }));
      const finais = soTexto.length ? soTexto : [{ tipo: 'texto' as EtapaTipo, conteudo: s.conteudo || '' }];
      if (demo) {
        const id = `scr-${Date.now()}`;
        setDemoDados((d) => ({
          scripts: [...d.scripts, { ...s, id, titulo: s.titulo + ' (cópia)', favorito: false }],
          etapas: { ...d.etapas, [id]: finais },
        }));
        return { temMidia };
      }
      const r = await mut.criar.mutateAsync({ titulo: s.titulo + ' (cópia)', conteudo: s.conteudo, canais: s.canais, categoriaId: s.categoriaId, descricao: s.descricao, tags: s.tags, favorito: false, ativo: s.ativo });
      await etapaMut.salvarEtapas.mutateAsync({ scriptId: r.id, etapas: finais });
      return { temMidia };
    },
    async salvarScript(editId: string | null, cfg: { titulo: string; descricao: string; canais: string[]; categoriaId: string; tags: string[]; favorito: boolean; ativo: boolean }, etapas: Step[]): Promise<string> {
      const primeiroTexto = etapas.find((s) => s.tipo === 'texto')?.conteudo ?? '';
      if (demo) {
        const id = editId ?? `scr-${Date.now()}`;
        const novo: Script = {
          id, titulo: cfg.titulo.trim(), descricao: cfg.descricao.trim() || null, conteudo: primeiroTexto,
          categoriaId: cfg.categoriaId || null, canais: cfg.canais, favorito: cfg.favorito, ativo: cfg.ativo,
          tags: cfg.tags, autorId: null, criadoEm: '', atualizadoEm: '',
        };
        setDemoDados((d) => ({
          scripts: editId ? d.scripts.map((x) => x.id === editId ? { ...x, ...novo } : x) : [...d.scripts, novo],
          etapas: { ...d.etapas, [id]: etapas.map(({ previewUrl: _pv, file: _f, ...e }) => e) },
        }));
        return id;
      }
      let scriptId = editId;
      if (editId) {
        await mut.atualizar.mutateAsync({ id: editId, patch: { titulo: cfg.titulo.trim(), descricao: cfg.descricao.trim() || null, conteudo: primeiroTexto, canais_permitidos: cfg.canais, categoria_id: cfg.categoriaId || null, tags: cfg.tags, favorito: cfg.favorito, ativo: cfg.ativo } });
      } else {
        const r = await mut.criar.mutateAsync({ titulo: cfg.titulo, conteudo: primeiroTexto, canais: cfg.canais, categoriaId: cfg.categoriaId || null, descricao: cfg.descricao.trim() || null, tags: cfg.tags, favorito: cfg.favorito, ativo: cfg.ativo });
        scriptId = r.id;
      }
      await etapaMut.salvarEtapas.mutateAsync({ scriptId: scriptId!, etapas });
      return scriptId!;
    },
    async criarCategoria(nome: string) {
      if (demo) { setDemoCats((c) => [...c, { id: `cat-${Date.now()}`, nome } as ScriptCategoria]); return; }
      await catMut.criar.mutateAsync(nome);
    },
    async renomearCategoria(id: string, nome: string) {
      if (demo) { setDemoCats((c) => c.map((x) => x.id === id ? { ...x, nome } : x)); return; }
      await catMut.renomear.mutateAsync({ id, nome });
    },
    async excluirCategoria(id: string) {
      if (demo) {
        setDemoCats((c) => c.filter((x) => x.id !== id));
        setDemoDados((d) => ({ ...d, scripts: d.scripts.map((s) => s.categoriaId === id ? { ...s, categoriaId: null } : s) }));
        return;
      }
      await catMut.excluir.mutateAsync(id);
    },
    async etapasDe(scriptId: string): Promise<EtapaItem[]> {
      return demo ? (demoDados.etapas[scriptId] ?? []) : fetchEtapas(scriptId);
    },
  };

  function copiar(s: Script) {
    try { navigator.clipboard?.writeText(s.conteudo); setAviso({ tom: 'ok', texto: 'Texto copiado.' }); }
    catch { setAviso({ tom: 'erro', texto: 'Não foi possível copiar.' }); }
  }
  function pedirExcluir(s: Script) {
    setConfirmar({
      titulo: 'Excluir script',
      texto: `Excluir "${s.titulo || 'Sem título'}"? Esta ação não pode ser desfeita.`,
      acao: async () => {
        await acoes.excluir(s);
        if (detId === s.id) setDetId(null);
        setAviso({ tom: 'ok', texto: 'Script excluído.' });
      },
    });
  }
  function pedirExcluirCategoria(c: ScriptCategoria) {
    const n = scripts.filter((s) => s.categoriaId === c.id).length;
    const msg = n === 0
      ? `Apagar a categoria "${c.nome}"? Esta ação não pode ser desfeita.`
      : `A categoria "${c.nome}" possui ${n} ${n === 1 ? 'script' : 'scripts'}. Eles serão movidos para "Sem categoria" (não serão apagados). Apagar a categoria?`;
    setConfirmar({
      titulo: 'Apagar categoria',
      texto: msg,
      acao: async () => {
        await acoes.excluirCategoria(c.id);
        if (cat === c.id) setCat('all');
        setAviso({ tom: 'ok', texto: 'Categoria apagada.' });
      },
    });
  }
  async function duplicar(s: Script) {
    try {
      const { temMidia } = await acoes.duplicar(s);
      setAviso({ tom: 'ok', texto: temMidia ? 'Script duplicado (mídias não copiadas).' : 'Script duplicado.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha ao duplicar.' }); }
  }

  /* ── drawer: sequência inteira do script aberto ───────────────────────── */
  const [detEtapas, setDetEtapas] = useState<EtapaItem[] | null>(null);
  useEffect(() => {
    if (!detId) { setDetEtapas(null); return; }
    let vivo = true;
    setDetEtapas(null);
    (demo ? Promise.resolve(demoDados.etapas[detId] ?? []) : fetchEtapas(detId))
      .then((e) => { if (vivo) setDetEtapas(e); })
      .catch(() => { if (vivo) setDetEtapas([]); });
    return () => { vivo = false; };
  }, [detId, demo, demoDados.etapas]);
  const detVars = useMemo(() => {
    if (!det) return [];
    const textos = (detEtapas?.length ? detEtapas.map((e) => e.conteudo) : [det.conteudo]);
    return variaveisDe(textos);
  }, [det, detEtapas]);

  /* ── editor (builder) ─────────────────────────────────────────────────── */
  const [formAberto, setFormAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [cfg, setCfg] = useState({ titulo: '', descricao: '', wa: true, fb: false, categoriaId: '', tags: '', favorito: false, ativo: true });
  const [etapas, setEtapas] = useState<Step[]>([{ tipo: 'texto', conteudo: '' }]);
  const [previewCanal, setPreviewCanal] = useState<'whatsapp' | 'facebook'>('whatsapp');
  const msgRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const activeMsg = useRef(0);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function abrirCriar() {
    setEditId(null);
    const wa = canalFiltro === 'whatsapp' || canalFiltro === 'ambos' || canalFiltro === 'todos';
    const fb = canalFiltro === 'facebook' || canalFiltro === 'ambos';
    setCfg({ titulo: '', descricao: '', wa, fb, categoriaId: cat !== 'all' ? cat : '', tags: '', favorito: false, ativo: true });
    setEtapas([{ tipo: 'texto', conteudo: '' }]);
    setPreviewCanal(wa ? 'whatsapp' : 'facebook');
    setErrs({}); msgRefs.current = []; activeMsg.current = 0; setFormAberto(true);
  }
  async function abrirEditar(s: Script) {
    setEditId(s.id);
    setCfg({ titulo: s.titulo, descricao: s.descricao ?? '', wa: s.canais.includes('whatsapp'), fb: s.canais.includes('facebook'), categoriaId: s.categoriaId ?? '', tags: s.tags.join(', '), favorito: s.favorito, ativo: s.ativo });
    setEtapas([{ tipo: 'texto', conteudo: s.conteudo || '' }]);
    setPreviewCanal(s.canais.includes('whatsapp') || s.canais.length === 0 ? 'whatsapp' : 'facebook');
    setErrs({}); msgRefs.current = []; activeMsg.current = 0; setFormAberto(true);
    try {
      const listaEt = await acoes.etapasDe(s.id);
      const steps: Step[] = listaEt.length ? listaEt.map((e) => ({ ...e })) : [{ tipo: 'texto', conteudo: s.conteudo || '' }];
      if (!demo) {
        await Promise.all(steps.map(async (st) => { if (st.tipo !== 'texto' && st.storagePath) { st.previewUrl = (await urlAssinadaAnexo(st.storagePath)) ?? undefined; } }));
      }
      setEtapas(steps);
    } catch { /* mantém o fallback */ }
  }

  function setStepConteudo(i: number, conteudo: string) { setEtapas((m) => m.map((x, j) => j === i ? { ...x, conteudo } : x)); }
  function addStep(tipo: EtapaTipo) { setEtapas((m) => [...m, { tipo, conteudo: '' }]); }
  function dupStep(i: number) { setEtapas((m) => { const n = [...m]; n.splice(i + 1, 0, { ...m[i], id: undefined }); return n; }); }
  function delStep(i: number) { setEtapas((m) => m.length <= 1 ? m : m.filter((_, j) => j !== i)); }
  function moveStep(i: number, dir: -1 | 1) { setEtapas((m) => { const j = i + dir; if (j < 0 || j >= m.length) return m; const n = [...m]; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function setStepFile(i: number, file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEtapas((m) => m.map((x, j) => j === i ? { ...x, file, nome: file.name, mime: file.type, tamanho: file.size, storagePath: undefined, previewUrl: url } : x));
  }
  function insertVar(text: string) {
    const i = activeMsg.current;
    if (etapas[i]?.tipo !== 'texto') return;
    const ta = msgRefs.current[i];
    if (!ta) { setStepConteudo(i, (etapas[i]?.conteudo ?? '') + text); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const atual = etapas[i]?.conteudo ?? '';
    setStepConteudo(i, atual.slice(0, s) + text + atual.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + text.length, s + text.length); }, 0);
  }

  async function salvar() {
    if (salvando) return;
    const canais: string[] = []; if (cfg.wa) canais.push('whatsapp'); if (cfg.fb) canais.push('facebook');
    const e: Record<string, string> = {};
    if (!cfg.titulo.trim()) e.titulo = 'Título é obrigatório.';
    if (canais.length === 0) e.canal = 'Selecione ao menos um canal.';
    const cheia = (s: Step) => s.tipo === 'texto' ? s.conteudo.trim().length > 0 : (!!s.file || !!s.storagePath || (demo && !!s.nome));
    if (etapas.filter(cheia).length === 0) e.etapas = 'Inclua ao menos uma mensagem com conteúdo.';
    etapas.forEach((s, i) => { if (!cheia(s)) e['st_' + i] = s.tipo === 'texto' ? 'Mensagem vazia.' : 'Selecione um arquivo.'; });
    if (Object.keys(e).length) { setErrs(e); return; }
    setSalvando(true); setErrs({});
    try {
      const tags = cfg.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const id = await acoes.salvarScript(editId, { titulo: cfg.titulo, descricao: cfg.descricao, canais, categoriaId: cfg.categoriaId, tags, favorito: cfg.favorito, ativo: cfg.ativo }, etapas);
      setFormAberto(false); setDetId(id);
      setAviso({ tom: 'ok', texto: editId ? 'Script salvo.' : 'Script criado.' });
    } catch (err) { setErrs({ geral: (err as Error).message || 'Falha ao salvar' }); }
    finally { setSalvando(false); }
  }

  // contexto do preview — idêntico ao v1
  const previewCtx = { cliente: 'Maria Silva', atendente: (user?.name || '').trim() || 'Atendente', emailAtendente: user?.email, empresa: currentOrg.name || 'Empresa', telefone: '(11) 99999-9999' };
  const mostrarTogglePreview = cfg.wa && cfg.fb;
  const canalPreview = mostrarTogglePreview ? previewCanal : (cfg.wa ? 'whatsapp' : 'facebook');

  /* ── card da galeria: o script como bolha de mensagem ─────────────────── */
  function cartao(s: Script, compacto = false) {
    const r = resumo[s.id];
    return (
      <CardVidro
        key={s.id}
        spot
        className="ars-card"
        role="button"
        tabIndex={0}
        aria-label={`Abrir script ${s.titulo || 'Sem título'}`}
        onClick={() => setDetId(detId === s.id ? null : s.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetId(s.id); } }}
      >
        <div className="ars-card-cab">
          <div className="nm">{s.titulo || 'Sem título'}</div>
          <button
            type="button"
            className={s.favorito ? 'scr-fav on' : 'scr-fav'}
            aria-label={s.favorito ? 'Remover dos favoritos' : 'Favoritar'}
            aria-pressed={s.favorito}
            onClick={(e) => { e.stopPropagation(); acoes.favoritar(s).catch((err) => setAviso({ tom: 'erro', texto: (err as Error).message || 'Falha.' })); }}
          >
            <Estrela cheia={s.favorito} />
          </button>
        </div>
        {s.conteudo ? (
          <div className="bolha-rec"><span className="clamp"><DestacaVars texto={s.conteudo} /></span></div>
        ) : r?.temMidia && r.primeira ? (
          <div className="bolha-rec bolha-anexo">
            <span className="tip">{TIPO_LABEL[r.primeira.tipo]}</span>
            <span className="arq">{r.primeira.nome ?? TIPO_LABEL[r.primeira.tipo].toLowerCase()}</span>
          </div>
        ) : (
          <div className="bolha-rec" style={{ color: 'var(--txt-3)' }}>Sem conteúdo</div>
        )}
        <div className="ars-card-meta">
          {r && r.total > 1 && <em className="ag-pill" style={{ fontStyle: 'normal' }}>Sequência · {r.total} passos</em>}
          <CanalPills canais={s.canais} />
          {compacto && catName(s.categoriaId) ? <em className="ag-pill" style={{ fontStyle: 'normal' }}>{catName(s.categoriaId)}</em> : null}
          {!s.ativo && <BadgeStatus tom="neutro">Inativo</BadgeStatus>}
          <span className="ars-copiar">
            <BotaoMini onClick={(e) => { e.stopPropagation(); copiar(s); }}>Copiar</BotaoMini>
          </span>
        </div>
      </CardVidro>
    );
  }

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Scripts</h2>
          <p>
            Biblioteca de mensagens e sequências — os scripts ativos viram respostas rápidas no atendimento.
            {demo ? ' · modo demonstração (nada é gravado)' : ''}
          </p>
        </div>
        <div className="acoes">
          <BotaoSec onClick={() => setCatsModal(true)}>Gerenciar categorias</BotaoSec>
          <BotaoPrimario onClick={abrirCriar}>＋ Novo script</BotaoPrimario>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {erro ? (
        <CardVidro sobe>
          <EstadoErro descricao="Erro ao carregar os scripts. Verifique a conexão." aoTentarDeNovo={() => scriptsQ.refetch()} />
        </CardVidro>
      ) : carregando ? (
        <div className="ars-grade" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="vidro ars-card" style={{ cursor: 'default' }}>
              <Skeleton largura="58%" altura={13} />
              <Skeleton altura={62} raio={12} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Skeleton largura={72} altura={16} raio={99} />
                <Skeleton largura={56} altura={16} raio={99} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="ars-filtros sobe" style={{ animationDelay: '.06s' }}>
            <div className="busca-scripts">
              <Input placeholder="Buscar scripts…" value={buscaRaw} onChange={(e) => setBuscaRaw(e.target.value)} aria-label="Buscar scripts" />
            </div>
            <Segmentado<CanalFiltro>
              rotulo="Filtro por canal"
              valor={canalFiltro}
              aoMudar={setCanalFiltro}
              opcoes={[
                { valor: 'todos', rotulo: 'Todos' },
                { valor: 'whatsapp', rotulo: 'WhatsApp' },
                { valor: 'facebook', rotulo: 'Facebook' },
                { valor: 'ambos', rotulo: 'Ambos' },
              ]}
            />
            <span className="fav-chip">
              <Chip ativo={favOnly} onClick={() => setFavOnly((v) => !v)}>★ Favoritos</Chip>
            </span>
          </div>
          <div className="ars-cats sobe" style={{ animationDelay: '.09s' }}>
            <Chips>
              <Chip ativo={cat === 'all'} onClick={() => setCat('all')}>Todas {scripts.length}</Chip>
              {cats.map((c) => (
                <Chip key={c.id} ativo={cat === c.id} onClick={() => setCat(cat === c.id ? 'all' : c.id)}>
                  {c.nome} {scripts.filter((s) => s.categoriaId === c.id).length}
                </Chip>
              ))}
            </Chips>
          </div>

          {lista.length === 0 ? (
            <CardVidro sobe style={{ borderRadius: 12 }}>
              {scripts.length === 0 ? (
                <EstadoVazio
                  titulo="Nenhum script ainda"
                  descricao="Crie o primeiro script para reutilizar mensagens no atendimento."
                  acao={{ rotulo: '＋ Criar primeiro script', onClick: abrirCriar }}
                />
              ) : (
                <EstadoVazio
                  titulo={textoVazio()}
                  descricao="Ajuste a busca ou os filtros."
                  acao={{ rotulo: 'Limpar filtros', onClick: limpar }}
                />
              )}
            </CardVidro>
          ) : (
            <div className="sobe" style={{ animationDelay: '.12s' }}>
              {!favOnly && favoritos.length > 0 && (
                <div className="ars-secao">
                  <div className="ars-secao-cab">
                    <span className="scr-estrela" aria-hidden><Estrela cheia /></span>
                    <span className="caps">Favoritos</span>
                    <span className="qtd num">{favoritos.length}</span>
                  </div>
                  <div className="ars-fav-strip">{favoritos.map((s) => cartao(s, true))}</div>
                </div>
              )}
              {secoes.map((sec) => (
                <div key={sec.id ?? 'sem'} className="ars-secao">
                  <div className="ars-secao-cab">
                    <span className="caps">{sec.nome}</span>
                    <span className="qtd num">{sec.itens.length}</span>
                  </div>
                  <div className="ars-grade">{sec.itens.map((s) => cartao(s))}</div>
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>
                {lista.length} {lista.length === 1 ? 'script' : 'scripts'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── drawer de detalhe: a sequência inteira ────────────────────────── */}
      {det && (
        <DrawerV2 aberto aoFechar={() => setDetId(null)}>
          <div className="cab">
            {catName(det.categoriaId) || 'Script'} › {det.titulo || 'Sem título'}
            <button type="button" className="fechar-p" aria-label="Fechar" onClick={() => setDetId(null)}>×</button>
          </div>
          <div className="corpo" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <CanalPills canais={det.canais} />
              {det.favorito && <span className="scr-estrela" title="Favorito"><Estrela cheia /></span>}
              {!det.ativo && <BadgeStatus tom="neutro">Inativo</BadgeStatus>}
            </div>
            {det.descricao && <p style={{ fontSize: 11.5, color: 'var(--txt-2)', lineHeight: 1.5 }}>{det.descricao}</p>}
            {det.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {det.tags.map((t) => <em className="ag-pill" key={t} style={{ fontStyle: 'normal' }}>{t}</em>)}
              </div>
            )}
            {/* ponte com o atendimento — informação existente, agora visível */}
            <div className={det.ativo ? 'scr-ponte' : 'scr-ponte off'}>
              {det.ativo
                ? <>Disponível nas respostas rápidas do atendimento ({(det.canais.length ? det.canais : ['whatsapp', 'facebook']).map((c) => c === 'whatsapp' ? 'WhatsApp' : 'Facebook').join(' · ')}).</>
                : <>Inativo — não aparece nas respostas rápidas do atendimento.</>}
            </div>
            <div>
              <div className="caps" style={{ marginBottom: 6 }}>
                {detEtapas && detEtapas.length > 1 ? `Sequência · ${detEtapas.length} passos` : 'Mensagem'}
              </div>
              {detEtapas === null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
                  <Skeleton altura={46} raio={12} />
                  <Skeleton altura={46} largura="72%" raio={12} />
                </div>
              ) : (
                <div className="ars-passos">
                  {(detEtapas.length ? detEtapas : [{ tipo: 'texto' as EtapaTipo, conteudo: det.conteudo }]).map((et, i, arr) => (
                    <div key={i} className="ars-passo">
                      {arr.length > 1 && <span className="n num">{i + 1}</span>}
                      <div className="bolha-rec">
                        {et.tipo === 'texto' ? (
                          et.conteudo ? <DestacaVars texto={et.conteudo} /> : <span style={{ color: 'var(--txt-3)' }}>—</span>
                        ) : (
                          <>
                            <div className="bolha-anexo">
                              <span className="tip">{TIPO_LABEL[et.tipo]}</span>
                              <span className="arq">{et.nome ?? TIPO_LABEL[et.tipo].toLowerCase()}</span>
                            </div>
                            {et.tamanho ? <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 3 }} className="num">{formatarTamanho(et.tamanho)}</div> : null}
                            {et.conteudo?.trim() ? <div style={{ marginTop: 4 }}><DestacaVars texto={et.conteudo} /></div> : null}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {detVars.length > 0 && (
              <div>
                <div className="caps" style={{ marginBottom: 6 }}>Variáveis usadas</div>
                <div className="scr-vars">
                  {detVars.map((v) => <span key={v} className="scr-var leitura">{v}</span>)}
                </div>
              </div>
            )}
          </div>
          <div className="scr-det-acoes">
            <BotaoMini onClick={() => abrirEditar(det)}>Editar</BotaoMini>
            <BotaoMini onClick={() => acoes.favoritar(det).catch(() => setAviso({ tom: 'erro', texto: 'Falha.' }))}>{det.favorito ? 'Desfavoritar' : 'Favoritar'}</BotaoMini>
            <BotaoMini onClick={() => duplicar(det)}>Duplicar</BotaoMini>
            <BotaoMini onClick={() => copiar(det)}>Copiar</BotaoMini>
            <button type="button" className="p-btn btn-perigo btn-mini" onClick={() => pedirExcluir(det)}>Excluir</button>
          </div>
        </DrawerV2>
      )}

      {/* ── gestão de categorias ─────────────────────────────────────────── */}
      {catsModal && (
        <CategoriasModal
          cats={cats}
          contagem={(id) => scripts.filter((s) => s.categoriaId === id).length}
          aoCriar={acoes.criarCategoria}
          aoRenomear={acoes.renomearCategoria}
          aoPedirExcluir={pedirExcluirCategoria}
          aoAvisar={setAviso}
          aoFechar={() => setCatsModal(false)}
        />
      )}

      {/* ── editor (builder) ─────────────────────────────────────────────── */}
      <ModalV2
        aberto={formAberto}
        aoFechar={() => { if (!salvando) setFormAberto(false); }}
        fecharNoVeu={!salvando}
        largura={860}
        titulo={editId ? 'Editar script' : 'Novo script'}
        rodape={
          <>
            <BotaoSec disabled={salvando} onClick={() => setFormAberto(false)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Criar script')}</BotaoPrimario>
          </>
        }
      >
        {errs.geral && <div className="aviso-inline erro" role="alert">{errs.geral}</div>}
        <div className="scr-builder">
          <div className="scr-col">
            <div className="form-2col">
              <div className={errs.titulo ? 'campo invalida' : 'campo'} style={{ marginBottom: 0 }}>
                <label htmlFor="scr-titulo">Título *</label>
                <Input id="scr-titulo" value={cfg.titulo} onChange={(e) => setCfg((f) => ({ ...f, titulo: e.target.value }))} placeholder="Nome do script" disabled={salvando} />
                {errs.titulo && <small className="hint">{errs.titulo}</small>}
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="scr-desc">Descrição</label>
                <Input id="scr-desc" value={cfg.descricao} onChange={(e) => setCfg((f) => ({ ...f, descricao: e.target.value }))} placeholder="Opcional" disabled={salvando} />
              </div>
            </div>
            <div className="form-2col">
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="scr-cat">Categoria</label>
                <select id="scr-cat" className="inp" value={cfg.categoriaId} onChange={(e) => setCfg((f) => ({ ...f, categoriaId: e.target.value }))} disabled={salvando}>
                  <option value="">Sem categoria</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="scr-tags">Tags</label>
                <Input id="scr-tags" value={cfg.tags} onChange={(e) => setCfg((f) => ({ ...f, tags: e.target.value }))} placeholder="Separadas por vírgula" disabled={salvando} />
              </div>
            </div>
            <div className={errs.canal ? 'campo invalida' : 'campo'} style={{ marginBottom: 0 }}>
              <label>Canal *</label>
              <div className="scr-canais">
                <Chip ativo={cfg.wa} onClick={() => setCfg((f) => ({ ...f, wa: !f.wa }))}>WhatsApp</Chip>
                <Chip ativo={cfg.fb} onClick={() => setCfg((f) => ({ ...f, fb: !f.fb }))}>Facebook</Chip>
              </div>
              {errs.canal && <small className="hint">{errs.canal}</small>}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <LinhaToggle ligado={cfg.favorito} aoMudar={(v) => setCfg((f) => ({ ...f, favorito: v }))} titulo="Favorito" disabled={salvando} />
              <LinhaToggle ligado={cfg.ativo} aoMudar={(v) => setCfg((f) => ({ ...f, ativo: v }))} titulo="Ativo" descricao="aparece no atendimento" disabled={salvando} />
            </div>

            <div className="campo" style={{ marginBottom: 0 }}>
              <label>Sequência de mensagens</label>
              <div className="scr-add-etapas">
                {(Object.keys(TIPO_LABEL) as EtapaTipo[]).map((t) => (
                  <BotaoMini key={t} disabled={salvando} onClick={() => addStep(t)}>+ {TIPO_LABEL[t]}</BotaoMini>
                ))}
              </div>
              {errs.etapas && <small className="hint">{errs.etapas}</small>}
            </div>

            {etapas.map((s, i) => (
              <div key={i} className="scr-etapa">
                <div className="scr-etapa-cab">
                  <strong>Mensagem {i + 1} · {TIPO_LABEL[s.tipo]}</strong>
                  <span className="scr-etapa-acoes">
                    <button type="button" title="Mover para cima" disabled={salvando || i === 0} onClick={() => moveStep(i, -1)}>↑</button>
                    <button type="button" title="Mover para baixo" disabled={salvando || i === etapas.length - 1} onClick={() => moveStep(i, 1)}>↓</button>
                    <button type="button" title="Duplicar" disabled={salvando} onClick={() => dupStep(i)}>⧉</button>
                    <button type="button" title="Excluir" disabled={salvando || etapas.length <= 1} onClick={() => delStep(i)}>✕</button>
                  </span>
                </div>
                {s.tipo === 'texto' ? (
                  <>
                    <textarea
                      className="inp" rows={3} value={s.conteudo} disabled={salvando}
                      placeholder="Escreva a mensagem. Use {{nome_cliente}}…"
                      ref={(el) => { msgRefs.current[i] = el; }}
                      onFocus={() => { activeMsg.current = i; }}
                      onChange={(e) => setStepConteudo(i, e.target.value)}
                    />
                    <div className="scr-caracteres num">{s.conteudo.length} caracteres</div>
                  </>
                ) : (
                  <div className="scr-midia">
                    <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept={ACCEPT[s.tipo]} style={{ display: 'none' }}
                      onChange={(e) => setStepFile(i, e.target.files?.[0] ?? null)} />
                    {(s.file || s.storagePath || (demo && s.nome)) ? (
                      <>
                        {s.tipo === 'imagem' && s.previewUrl && <img src={s.previewUrl} alt={s.nome ?? ''} />}
                        {s.tipo === 'audio' && s.previewUrl && <audio controls src={s.previewUrl} />}
                        {s.tipo === 'video' && s.previewUrl && <video controls src={s.previewUrl} />}
                        <div className="scr-midia-meta">
                          <span className="nome">{s.nome ?? TIPO_LABEL[s.tipo].toLowerCase()}</span>
                          {s.tamanho ? <span>{formatarTamanho(s.tamanho)}</span> : null}
                          <BotaoMini disabled={salvando} onClick={() => fileRefs.current[i]?.click()}>Trocar</BotaoMini>
                        </div>
                        <Input placeholder="Legenda (opcional)" value={s.conteudo} onChange={(e) => setStepConteudo(i, e.target.value)} disabled={salvando} />
                      </>
                    ) : (
                      <button type="button" className="agc-pick" disabled={salvando} onClick={() => fileRefs.current[i]?.click()}>
                        Selecionar {TIPO_LABEL[s.tipo].toLowerCase()}
                      </button>
                    )}
                  </div>
                )}
                {errs['st_' + i] && <small className="hint">{errs['st_' + i]}</small>}
              </div>
            ))}

            <div>
              <div className="caps" style={{ marginBottom: 6 }}>Variáveis</div>
              <div className="scr-vars">
                {SCRIPT_VARIAVEIS.map((v) => (
                  <button type="button" key={v} className="scr-var" title="Inserir na mensagem de texto em edição" onClick={() => insertVar(v)}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="scr-preview">
            <div className="scr-pv-cab">
              <span className="caps">Pré-visualização</span>
              {mostrarTogglePreview && (
                <Chips>
                  <Chip ativo={previewCanal === 'whatsapp'} onClick={() => setPreviewCanal('whatsapp')}>WhatsApp</Chip>
                  <Chip ativo={previewCanal === 'facebook'} onClick={() => setPreviewCanal('facebook')}>Facebook</Chip>
                </Chips>
              )}
            </div>
            <div className="scr-chat">
              {etapas.filter((s) => s.tipo === 'texto' ? s.conteudo.trim() : (s.file || s.storagePath || (demo && s.nome))).length === 0 && (
                <div className="vazio-pv">As mensagens aparecem aqui.</div>
              )}
              {etapas.map((s, i) => {
                const visivel = s.tipo === 'texto' ? !!s.conteudo.trim() : !!(s.file || s.storagePath || (demo && s.nome));
                if (!visivel) return null;
                return (
                  <div key={i} className="bolha">
                    {s.tipo === 'texto' && substituirVariaveis(s.conteudo, previewCtx)}
                    {s.tipo === 'imagem' && s.previewUrl && <img src={s.previewUrl} alt="" />}
                    {s.tipo === 'audio' && s.previewUrl && <audio controls src={s.previewUrl} style={{ width: 200, maxWidth: '100%' }} />}
                    {s.tipo === 'video' && s.previewUrl && <video controls src={s.previewUrl} />}
                    {s.tipo === 'documento' && <span>📄 {s.nome ?? 'documento'}</span>}
                    {s.tipo !== 'texto' && !s.previewUrl && s.tipo !== 'documento' && <span>{TIPO_LABEL[s.tipo]}: {s.nome ?? '—'}</span>}
                    {s.tipo !== 'texto' && s.conteudo.trim() && <div style={{ marginTop: 4 }}>{substituirVariaveis(s.conteudo, previewCtx)}</div>}
                    <div className="hh num">{HORA_FAKE}</div>
                  </div>
                );
              })}
            </div>
            <div className="scr-pv-canal">via {canalPreview === 'whatsapp' ? 'WhatsApp' : 'Messenger'}</div>
          </div>
        </div>
      </ModalV2>

      <ConfirmDialogV2
        aberto={!!confirmar}
        titulo={confirmar?.titulo ?? ''}
        mensagem={confirmar?.texto ?? ''}
        rotuloConfirmar="Excluir"
        destrutivo
        carregando={confirmando}
        aoConfirmar={async () => {
          const c = confirmar; if (!c) return;
          setConfirmando(true);
          try { await c.acao(); setConfirmar(null); }
          catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha.' }); }
          finally { setConfirmando(false); }
        }}
        aoCancelar={() => { if (!confirmando) setConfirmar(null); }}
      />
    </>
  );
}

/* ── modal de gestão de categorias (criar/renomear/apagar — ações do v1,
     centralizadas num modal em vez dos kebabs da sidebar antiga) ───────── */
function CategoriasModal({ cats, contagem, aoCriar, aoRenomear, aoPedirExcluir, aoAvisar, aoFechar }: {
  cats: ScriptCategoria[];
  contagem: (id: string) => number;
  aoCriar: (nome: string) => Promise<void>;
  aoRenomear: (id: string, nome: string) => Promise<void>;
  aoPedirExcluir: (c: ScriptCategoria) => void;
  aoAvisar: (a: Aviso) => void;
  aoFechar: () => void;
}) {
  const [novo, setNovo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function nomeDuplicado(nome: string, ignorarId: string | null) {
    return cats.some((c) => c.id !== ignorarId && c.nome.trim().toLowerCase() === nome.toLowerCase());
  }
  async function criar() {
    const nome = novo.trim();
    if (!nome) { setErr('Informe um nome.'); return; }
    if (nomeDuplicado(nome, null)) { setErr('Já existe uma categoria com esse nome.'); return; }
    setBusy(true); setErr(null);
    try { await aoCriar(nome); setNovo(''); aoAvisar({ tom: 'ok', texto: 'Categoria criada.' }); }
    catch (e) { setErr((e as Error).message || 'Falha ao salvar'); }
    finally { setBusy(false); }
  }
  async function renomear() {
    const nome = editandoNome.trim();
    if (!editandoId) return;
    if (!nome) { setErr('Informe um nome.'); return; }
    if (nomeDuplicado(nome, editandoId)) { setErr('Já existe uma categoria com esse nome.'); return; }
    setBusy(true); setErr(null);
    try { await aoRenomear(editandoId, nome); setEditandoId(null); aoAvisar({ tom: 'ok', texto: 'Categoria renomeada.' }); }
    catch (e) { setErr((e as Error).message || 'Falha ao salvar'); }
    finally { setBusy(false); }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={440}
      titulo="Categorias"
      rodape={<BotaoSec disabled={busy} onClick={aoFechar}>Fechar</BotaoSec>}
    >
      <div className="form-grid">
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="scr-nova-cat">Nova categoria</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input id="scr-nova-cat" value={novo} placeholder="Ex.: Boas-vindas" disabled={busy}
              onChange={(e) => { setNovo(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void criar(); }} />
            <BotaoSec disabled={busy} onClick={criar}>Criar</BotaoSec>
          </div>
        </div>
        {err && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{err}</div>}
        <div>
          {cats.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>Nenhuma categoria ainda.</div>}
          {cats.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--linha)' }}>
              {editandoId === c.id ? (
                <>
                  <Input value={editandoNome} disabled={busy} onChange={(e) => { setEditandoNome(e.target.value); setErr(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void renomear(); }} />
                  <BotaoMini disabled={busy} onClick={renomear}>Salvar</BotaoMini>
                  <BotaoMini disabled={busy} onClick={() => setEditandoId(null)}>Cancelar</BotaoMini>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{c.nome} <span className="num" style={{ color: 'var(--txt-3)', fontSize: 11 }}>· {contagem(c.id)}</span></span>
                  <BotaoMini disabled={busy} onClick={() => { setEditandoId(c.id); setEditandoNome(c.nome); setErr(null); }}>Renomear</BotaoMini>
                  <button type="button" className="p-btn btn-perigo btn-mini" disabled={busy} onClick={() => { aoFechar(); aoPedirExcluir(c); }}>Apagar</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </ModalV2>
  );
}
