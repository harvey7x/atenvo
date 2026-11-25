import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { WaMessage } from '@/data/whatsappDemo';
import { arquivoDoCliente, docDosMetadados, type DocIa } from '@/data/documentosIa';

/* ------------------------------------------------------------------
   IA COM A CHAVE DA PRÓPRIA EMPRESA (25/11). No sistema que a Reviza usava antes: "Resumo do atendimento"
   no painel do cliente, "Transcrever" nos áudios e, nas configurações, "use a sua própria chave; o custo
   passa a ser seu". Aqui:
   · Configurações › Integrações › Inteligência artificial: o administrador escolhe o provedor (Google
     Gemini ou OpenAI), cola a chave que a PRÓPRIA empresa criou e o servidor confere com uma chamada mínima.
     A chave fica só no servidor (atd_ia_chave): a tela vê, no máximo, "configurada em dd/mm por Fulano ·
     termina em …1234".
   · WhatsApp: "Gerar resumo" (o que o cliente quer, documentos recebidos e faltando, próximo passo e como
     ele está) e "Transcrever" no áudio (fica gravado na mensagem: todo mundo vê da próxima vez).
   Sem chave configurada os botões ficam desligados com o aviso "conecte a sua chave de IA".
   Servidor: função atd-ia (migration 100). DEMO É O CONTRATO: sem backend os mesmos hooks guardam o estado
   no navegador e devolvem conteúdo inventado (a conversa de exemplo da Maria Aparecida).
   ------------------------------------------------------------------ */

export const IA_REAL: boolean = isSupabaseConfigured && !!supabase;

export type ProvedorIa = 'gemini' | 'openai';
export const PROVEDORES_IA: { id: ProvedorIa; nome: string; curto: string; site: string; sitePara: string }[] = [
  { id: 'gemini', nome: 'Google Gemini', curto: 'Google', site: 'aistudio.google.com', sitePara: 'https://aistudio.google.com/app/apikey' },
  { id: 'openai', nome: 'OpenAI', curto: 'OpenAI', site: 'platform.openai.com', sitePara: 'https://platform.openai.com/api-keys' },
];
export const nomeProvedor = (p: ProvedorIa | null | undefined) => PROVEDORES_IA.find((x) => x.id === p)?.nome ?? 'IA';

export interface EstadoChaveIa {
  configurada: boolean; provedor: ProvedorIa | null; final: string | null;
  configuradaEm: string | null; configuradaPor: string | null; ultimoTesteEm: string | null; ultimoErro: string | null;
}
export const ESTADO_VAZIO: EstadoChaveIa = { configurada: false, provedor: null, final: null, configuradaEm: null, configuradaPor: null, ultimoTesteEm: null, ultimoErro: null };

export interface ResumoAtendimento {
  quer: string; recebidos: string[]; faltando: string[]; proximoPasso: string; humor: string;
  geradoEm: string; geradoPor: string | null; mensagens: number | null;
  /** chegaram mensagens depois deste resumo */
  desatualizado: boolean;
}

/* ---------------- mensagens (os códigos que a função atd-ia devolve) ---------------- */
export const MSG_IA: Record<string, string> = {
  sem_chave: 'A chave de IA ainda não foi conectada. Conecte em Configurações › Integrações › Inteligência artificial.',
  chave_invalida: 'O provedor não aceitou esta chave. Confira se ela foi copiada inteira, sem espaços, e se não foi apagada na conta.',
  chave_sem_permissao: 'A chave existe, mas não tem permissão para usar a IA. Confira as permissões e o projeto da chave na conta do provedor.',
  sem_credito_ou_limite: 'A chave funciona, mas a conta está sem crédito ou chegou no limite de uso. Confira o saldo e o faturamento na conta do provedor.',
  modelo_indisponivel: 'O modelo de IA usado pelo sistema não está liberado para esta chave. Confira na conta do provedor.',
  provedor_indisponivel: 'O provedor de IA não respondeu agora. Tente de novo em alguns minutos.',
  resposta_invalida: 'A IA respondeu de um jeito inesperado. Tente de novo.',
  formato_chave: 'Isso não parece uma chave de IA. Copie a chave inteira, sem espaços, e cole de novo.',
  parece_openai: 'Esta chave parece ser da OpenAI (começa com "sk-"). Escolha "OpenAI" acima ou cole a chave do Google.',
  parece_gemini: 'Esta chave parece ser do Google (começa com "AIza"). Escolha "Google Gemini" acima ou cole a chave da OpenAI.',
  provedor_invalido: 'Escolha o provedor da chave: Google Gemini ou OpenAI.',
  so_admin: 'Só o administrador conecta, troca ou remove a chave de IA.',
  nao_autorizado: 'A sua sessão terminou. Entre de novo no sistema.',
  conversa_nao_encontrada: 'Esta conversa não está disponível para você.',
  conversa_vazia: 'Ainda não há mensagens para resumir nesta conversa.',
  mensagem_nao_encontrada: 'Este áudio não está disponível para você.',
  nao_e_audio: 'Só dá para transcrever mensagens de áudio.',
  audio_sem_arquivo: 'O arquivo deste áudio não está no sistema (ele não chegou a ser baixado do WhatsApp).',
  audio_grande: 'Este áudio passa de 10 MB. A transcrição vale para áudios de até 10 MB.',
  audio_longo: 'Este áudio passa de 5 minutos. A transcrição vale para áudios de até 5 minutos.',
  audio_sem_fala: 'Não deu para ouvir fala neste áudio.',
  falha_gravar: 'Não foi possível guardar agora. Tente de novo.',
  falha_ler: 'Não foi possível ler a conversa agora. Tente de novo.',
};
export const traduzErroIa = (e: unknown): string => {
  const m = (e as Error)?.message || String(e ?? '');
  return MSG_IA[m] ?? (Object.values(MSG_IA).includes(m) ? m : 'Não foi possível falar com a IA agora. Tente de novo.');
};
/** o erro guardado no último teste, explicado (a tela de Integrações mostra) */
export const explicarUltimoErro = (cod: string | null) => (cod ? MSG_IA[cod] ?? 'O último teste da chave falhou. Toque em Testar.' : null);

/* ---------------- contas puras (testadas) ---------------- */
/** confere o JEITO da chave antes de mandar ao servidor (null = parece certa). O servidor confere de novo. */
export function conferirChaveIa(provedor: ProvedorIa, chave: string): string | null {
  const c = chave.trim();
  if (c.length < 20 || c.length > 400 || /\s/.test(c)) return 'formato_chave';
  if (provedor === 'gemini' && /^sk-/.test(c)) return 'parece_openai';
  if (provedor === 'openai' && /^AIza/.test(c)) return 'parece_gemini';
  return null;
}
const fuso = 'America/Sao_Paulo';
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hhmmSP = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const ddmmSP = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' }).format(d);
/** "configurada em 25/11 por Ana · termina em …1234" — tudo o que a tela mostra da chave */
export function textoChaveConfigurada(e: Pick<EstadoChaveIa, 'configuradaEm' | 'configuradaPor' | 'final'>): string {
  const partes: string[] = [];
  const d = e.configuradaEm ? new Date(e.configuradaEm) : null;
  let quem = d && !isNaN(d.getTime()) ? `configurada em ${ddmmSP(d)}` : 'configurada';
  if (e.configuradaPor) quem += ` por ${e.configuradaPor}`;
  partes.push(quem);
  if (e.final) partes.push(`termina em …${e.final}`);
  return partes.join(' · ');
}
/** "gerado às 14:40" (hoje), "gerado ontem às 09:12" ou "gerado em 21/11 às 09:12" */
export function quandoFoiGerado(iso: string | null | undefined, agora = new Date()): string {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return '';
  const ontem = new Date(agora.getTime() - 86_400_000);
  if (diaSP(d) === diaSP(agora)) return `gerado às ${hhmmSP(d)}`;
  if (diaSP(d) === diaSP(ontem)) return `gerado ontem às ${hhmmSP(d)}`;
  return `gerado em ${ddmmSP(d)} às ${hhmmSP(d)}`;
}

/* ---------------- normalização defensiva (resposta do servidor → tipos) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const lst = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => t(x).trim()).filter(Boolean) : []);
const prov = (v: unknown): ProvedorIa | null => (v === 'gemini' || v === 'openai' ? v : null);
export function normalizarEstadoIa(v: unknown): EstadoChaveIa {
  const r = o(v);
  if (!r.configurada) return ESTADO_VAZIO;
  return {
    configurada: true, provedor: prov(r.provedor), final: t(r.final).slice(-4) || null,
    configuradaEm: t(r.configurada_em) || null, configuradaPor: t(r.configurada_por) || null,
    ultimoTesteEm: t(r.ultimo_teste_em) || null, ultimoErro: t(r.ultimo_erro) || null,
  };
}
export function normalizarResumo(v: unknown): ResumoAtendimento | null {
  const r = o(v); const s = o(r.resumo);
  if (!r.resumo || !(t(s.quer) || t(s.proximo_passo))) return null;
  const n = Number(r.mensagens);
  return {
    quer: t(s.quer).trim(), recebidos: lst(s.documentos_recebidos), faltando: lst(s.documentos_faltando),
    proximoPasso: t(s.proximo_passo).trim(), humor: t(s.humor).trim(),
    geradoEm: t(r.gerado_em) || new Date().toISOString(), geradoPor: t(r.gerado_por) || null,
    mensagens: Number.isFinite(n) && n > 0 ? n : null, desatualizado: !!r.desatualizado,
  };
}

/* ---------------- demonstração (tudo inventado; a chave nunca é guardada, nem na prévia) ---------------- */
const GUARDA_CHAVE = 'previa-ia-chave';
const GUARDA_RESUMOS = 'previa-ia-resumos';
const GUARDA_TRANSC = 'previa-ia-transcricoes';
function ler<T>(k: string, padrao: T): T { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? padrao; } catch { return padrao; } }
function gravar(k: string, v: unknown) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* privado */ } }
export const estadoDemo = (): EstadoChaveIa => ({ ...ESTADO_VAZIO, ...ler<Partial<EstadoChaveIa>>(GUARDA_CHAVE, {}) });
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** chaves de exemplo da prévia ("Usar uma chave de exemplo"): não funcionam em lugar nenhum */
export const CHAVE_EXEMPLO: Record<ProvedorIa, string> = {
  gemini: 'AIzaSyExemplo-da-previa-000000000004821',
  openai: 'sk-proj-exemplo-da-previa-00000000000000000004821',
};

/** o resumo inventado da conversa de exemplo da Maria Aparecida; nas outras, um resumo simples tirado das mensagens */
export function resumoDemo(conversaId: string, msgs: WaMessage[] = [], agora = new Date()): ResumoAtendimento {
  const base = { geradoEm: agora.toISOString(), geradoPor: 'Você', desatualizado: false, mensagens: msgs.length || null };
  if (conversaId === 'wa-maria') return {
    ...base,
    quer: 'Conferir os descontos no benefício do INSS que ela não reconhece. É aposentada desde 2019 e chegou pelo anúncio.',
    recebidos: ['Histórico de empréstimos do INSS', 'RG (frente e verso)', 'Conta de luz', 'Extrato do banco', 'Senha do Meu INSS (na conversa)'],
    faltando: ['Procuração assinada'],
    proximoPasso: 'Conferir no histórico quais descontos ela não reconhece e mandar a procuração para assinar. Se precisar ligar, depois das 18h.',
    humor: 'Tranquila e colaborativa, um pouco preocupada com os descontos.',
  };
  const doCliente = msgs.filter((m) => m.dir === 'in');
  const primeira = (doCliente.find((m) => (m.text ?? '').trim().length > 12)?.text ?? doCliente[0]?.text ?? '').trim();
  const docs = msgs.filter((m) => m.dir === 'in' && (m.tipo === 'documento' || m.pdf)).map((m) => (m.nome || m.pdf?.name || 'Documento').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' '));
  const ultima = msgs[msgs.length - 1];
  return {
    ...base,
    quer: primeira ? `Pelo que escreveu: "${primeira.length > 110 ? primeira.slice(0, 110) + '…' : primeira}"` : 'A conversa ainda não diz o que o cliente quer.',
    recebidos: docs, faltando: [],
    proximoPasso: ultima?.dir === 'in' ? 'Responder a última mensagem do cliente.' : 'Esperar a resposta do cliente e retomar se ele não responder.',
    humor: 'Tranquilo.',
  };
}
/** a transcrição inventada dos áudios de exemplo */
export const TRANSCRICOES_DEMO: Record<string, string> = {
  'wm-a6': 'Oi, aqui é a Cláudia, filha da dona Maria. A mãe pediu pra avisar que de dia fica difícil pra ela atender, então se precisar ligar é melhor depois das seis da tarde. Obrigada!',
};
export const transcricaoDemo = (id: string | undefined): string | null => (id ? ler<Record<string, string>>(GUARDA_TRANSC, {})[id] ?? null : null);
export const resumoGuardadoDemo = (conversaId: string): ResumoAtendimento | null => ler<Record<string, ResumoAtendimento>>(GUARDA_RESUMOS, {})[conversaId] ?? null;

/* ---------------- servidor ---------------- */
async function chamar(corpo: Record<string, unknown>): Promise<B> {
  const { data, error } = await supabase!.functions.invoke('atd-ia', { body: corpo });
  if (error) { let cod = ''; try { cod = (await (error as { context?: Response }).context?.json())?.erro ?? ''; } catch { /* corpo vazio */ } throw new Error(cod || error.message); }
  const r = o(data); if (r.erro) throw new Error(t(r.erro));
  return r;
}
const comTraducao = <T,>(p: Promise<T>) => p.catch((e) => { throw new Error(traduzErroIa(e)); });

/** a chave, com os detalhes (só o administrador: Integrações) */
export function useChaveIa(ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ia-chave', currentOrg.id],
    enabled: ativo,
    queryFn: async (): Promise<EstadoChaveIa> => (IA_REAL ? normalizarEstadoIa(await comTraducao(chamar({ acao: 'estado' }))) : estadoDemo()),
  });
}
/** tem chave? (qualquer pessoa: liga ou desliga os botões de IA do WhatsApp) */
export function useIaDisponivel(ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ia-disponivel', currentOrg.id],
    enabled: ativo,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ configurada: boolean; provedor: ProvedorIa | null }> => {
      if (!IA_REAL) { const e = estadoDemo(); return { configurada: e.configurada, provedor: e.provedor }; }
      const r = await comTraducao(chamar({ acao: 'disponivel' }));
      return { configurada: !!r.configurada, provedor: prov(r.provedor) };
    },
  });
}
const invalidarChave = (qc: ReturnType<typeof useQueryClient>) => { qc.invalidateQueries({ queryKey: ['ia-chave'] }); qc.invalidateQueries({ queryKey: ['ia-disponivel'] }); };

export function useSalvarChaveIa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { provedor: ProvedorIa; chave: string }) => {
      const ruim = conferirChaveIa(v.provedor, v.chave);
      if (ruim) throw new Error(MSG_IA[ruim]);
      if (!IA_REAL) {
        await esperar(900);
        if (/invalida/i.test(v.chave)) throw new Error(MSG_IA.chave_invalida); // para ver o erro na prévia
        const agora = new Date().toISOString();
        gravar(GUARDA_CHAVE, { configurada: true, provedor: v.provedor, final: v.chave.trim().slice(-4), configuradaEm: agora, configuradaPor: 'Você', ultimoTesteEm: agora, ultimoErro: null });
        return;
      }
      await comTraducao(chamar({ acao: 'salvar_chave', provedor: v.provedor, chave: v.chave.trim() }));
    },
    onSuccess: () => invalidarChave(qc),
  });
}
export function useTestarChaveIa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!IA_REAL) { await esperar(800); gravar(GUARDA_CHAVE, { ...estadoDemo(), ultimoTesteEm: new Date().toISOString(), ultimoErro: null }); return; }
      await comTraducao(chamar({ acao: 'testar' }));
    },
    onSettled: () => invalidarChave(qc),
  });
}
export function useRemoverChaveIa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!IA_REAL) { await esperar(300); gravar(GUARDA_CHAVE, null); return; }
      await comTraducao(chamar({ acao: 'remover_chave' }));
    },
    onSuccess: () => invalidarChave(qc),
  });
}

/** o último resumo guardado da conversa (não chama a IA) */
export function useResumoAtendimento(conversaId: string | null | undefined, ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ia-resumo', currentOrg.id, conversaId ?? ''],
    enabled: ativo && !!conversaId,
    staleTime: 60_000,
    queryFn: async (): Promise<ResumoAtendimento | null> => {
      if (!IA_REAL) return resumoGuardadoDemo(conversaId!);
      return normalizarResumo(await comTraducao(chamar({ acao: 'resumo', conversa_id: conversaId })));
    },
  });
}
/** "Gerar resumo" / "Gerar de novo" (pode levar cerca de 1 minuto) */
export function useGerarResumo() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (v: { conversaId: string; refazer?: boolean; msgsDemo?: WaMessage[] }): Promise<ResumoAtendimento> => {
      if (!IA_REAL) {
        if (!estadoDemo().configurada) throw new Error(MSG_IA.sem_chave);
        await esperar(1600);
        const r = resumoDemo(v.conversaId, v.msgsDemo);
        gravar(GUARDA_RESUMOS, { ...ler<Record<string, ResumoAtendimento>>(GUARDA_RESUMOS, {}), [v.conversaId]: r });
        return r;
      }
      const r = normalizarResumo(await comTraducao(chamar({ acao: 'resumir', conversa_id: v.conversaId, refazer: !!v.refazer })));
      if (!r) throw new Error(MSG_IA.resposta_invalida);
      return r;
    },
    onSuccess: (r, v) => {
      qc.setQueryData(['ia-resumo', currentOrg.id, v.conversaId], r);
    },
    onError: (e) => { if ((e as Error).message === MSG_IA.sem_chave) invalidarChave(qc); },
  });
}
/** "Transcrever" no áudio: a transcrição fica gravada na mensagem (metadados.transcricao) */
export function useTranscreverAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { mensagemId: string }): Promise<string> => {
      if (!IA_REAL) {
        if (!estadoDemo().configurada) throw new Error(MSG_IA.sem_chave);
        await esperar(1300);
        const texto = TRANSCRICOES_DEMO[v.mensagemId] ?? 'Oi, tudo bem? Estou mandando este áudio para saber como está o meu pedido. Pode me retornar quando puder? Obrigado.';
        gravar(GUARDA_TRANSC, { ...ler<Record<string, string>>(GUARDA_TRANSC, {}), [v.mensagemId]: texto });
        return texto;
      }
      const r = await comTraducao(chamar({ acao: 'transcrever', mensagem_id: v.mensagemId }));
      const texto = t(r.texto).trim();
      if (!texto) throw new Error(MSG_IA.audio_sem_fala);
      return texto;
    },
    onSuccess: (texto, v) => {
      // a conversa aberta já mostra (o realtime também avisa as outras telas)
      qc.setQueriesData<WaMessage[]>({ queryKey: ['wa-msgs'] }, (old) => (Array.isArray(old) ? old.map((m) => (m.id === v.mensagemId ? { ...m, transcricao: texto } : m)) : old));
    },
    onError: (e) => { if ((e as Error).message === MSG_IA.sem_chave) invalidarChave(qc); },
  });
}

/* ---------- "Sugerir resposta" (25/11): um rascunho para o ATENDENTE revisar e enviar — nada sai sozinho ---------- */
const SUGESTOES_DEMO = [
  'Perfeito, chegou certinho! Agora me manda o comprovante de endereço, pode ser uma conta de luz ou de água dos últimos 2 meses?',
  'Entendi. Vou conferir aqui o seu histórico e já te explico o que dá para fazer. Enquanto isso, você consegue me mandar a foto do RG, frente e verso?',
  'Obrigado por avisar! Combinado, a gente te liga depois das 18h. Ficou alguma dúvida até lá?',
];
/** um rascunho na demonstração: muda a cada clique, como uma IA de verdade faria */
export function sugestaoDemo(vez: number): string { return SUGESTOES_DEMO[Math.abs(vez) % SUGESTOES_DEMO.length]; }

let vezDemo = 0;
export function useSugerirResposta() {
  return useMutation({
    mutationFn: async (v: { conversaId: string; pedido?: string }): Promise<string> => {
      if (!IA_REAL) {
        if (!estadoDemo().configurada) throw new Error(MSG_IA.sem_chave);
        await esperar(900);
        return sugestaoDemo(vezDemo++);
      }
      const r = await comTraducao(chamar({ acao: 'sugerir', conversa_id: v.conversaId, ...(v.pedido ? { pedido: v.pedido } : {}) }));
      const s = typeof r.sugestao === 'string' ? r.sugestao.trim() : '';
      if (!s) throw new Error(MSG_IA.resposta_invalida ?? 'A IA não devolveu uma resposta. Tente de novo.');
      return s;
    },
  });
}

/* ---------- "Identificar documentos" (25/11): a IA diz o que é cada foto/PDF que o cliente mandou ---------- */
const GUARDA_DOCS = 'previa-ia-documentos';
const EVENTO_DOCS = 'reviza-docs-ia';
/** o que a IA "acha" dos arquivos de exemplo da Maria Aparecida (documentos FICTÍCIOS da demonstração) */
export const DOCS_DEMO: Record<string, DocIa> = {
  'wm-a2': { tipo: 'extrato_consignado', lado: null, legivel: true, obs: '' },
  'wm-a4': { tipo: 'identidade', lado: 'frente_e_verso', legivel: true, obs: '' },
  'wm-5': { tipo: 'comprovante_endereco', lado: null, legivel: true, obs: 'Conta de luz.' },
  'wm-6': { tipo: 'extrato_bancario', lado: null, legivel: false, obs: 'Foto escura e torta: parte do texto não dá para ler.' },
};
export const docsGuardadosDemo = (): Record<string, DocIa> => ler<Record<string, DocIa>>(GUARDA_DOCS, {});
/** na demonstração, os documentos já identificados (atualiza quando o botão identifica mais) */
export function useDocsDemo(demo: boolean): Record<string, DocIa> {
  const [docs, setDocs] = useState<Record<string, DocIa>>(() => (demo ? docsGuardadosDemo() : {}));
  useEffect(() => {
    if (!demo) return;
    const ouvir = () => setDocs(docsGuardadosDemo());
    window.addEventListener(EVENTO_DOCS, ouvir);
    return () => window.removeEventListener(EVENTO_DOCS, ouvir);
  }, [demo]);
  return docs;
}

export function useIdentificarDocumentos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { conversaId: string; msgsDemo?: WaMessage[] }): Promise<{ identificados: { mensagemId: string; doc: DocIa }[]; faltamMais: boolean }> => {
      if (!IA_REAL) {
        if (!estadoDemo().configurada) throw new Error(MSG_IA.sem_chave);
        await esperar(1600);
        const guardados = docsGuardadosDemo();
        const novos = (v.msgsDemo ?? []).filter((m) => m.id && arquivoDoCliente(m) && !guardados[m.id]).slice(0, 8)
          .map((m) => ({ mensagemId: m.id!, doc: DOCS_DEMO[m.id!] ?? { tipo: tipoDoNomeDemo(m.nome), lado: null, legivel: true, obs: '' } }));
        gravar(GUARDA_DOCS, { ...guardados, ...Object.fromEntries(novos.map((n) => [n.mensagemId, n.doc])) });
        try { window.dispatchEvent(new Event(EVENTO_DOCS)); } catch { /* fora do navegador */ }
        return { identificados: novos, faltamMais: false };
      }
      const r = await comTraducao(chamar({ acao: 'identificar_documentos', conversa_id: v.conversaId }));
      const lista = Array.isArray(r.identificados) ? (r.identificados as Record<string, unknown>[]) : [];
      const identificados = lista.map((x) => ({
        mensagemId: t(x.mensagem_id),
        doc: docDosMetadados({ doc_tipo: x.tipo, doc_lado: x.lado, doc_legivel: x.legivel, doc_obs: x.observacao }),
      })).filter((x): x is { mensagemId: string; doc: DocIa } => !!x.mensagemId && !!x.doc);
      return { identificados, faltamMais: r.faltam_mais === true };
    },
    onSuccess: (r) => {
      if (!IA_REAL || !r.identificados.length) return;
      const porId = new Map(r.identificados.map((x) => [x.mensagemId, x.doc]));
      qc.setQueriesData<WaMessage[]>({ queryKey: ['wa-msgs'] }, (old) => (Array.isArray(old) ? old.map((m) => (m.id && porId.has(m.id) ? { ...m, doc: porId.get(m.id) } : m)) : old));
    },
    onError: (e) => { if ((e as Error).message === MSG_IA.sem_chave) invalidarChave(qc); },
  });
}
function tipoDoNomeDemo(nome: string | undefined): DocIa['tipo'] {
  const n = (nome ?? '').toLowerCase();
  if (/(^|[^a-z])(rg|cnh)([^a-z]|$)|identidade/.test(n)) return 'identidade';
  if (/comprov|endere|conta.?de.?luz|conta-luz|residen/.test(n)) return 'comprovante_endereco';
  if (/contrato/.test(n)) return 'contrato';
  if (/emprest|consign/.test(n)) return 'extrato_consignado';
  return 'outro';
}
