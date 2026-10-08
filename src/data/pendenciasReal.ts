/* Pendências do processo — camada de dados REAL (Supabase).
   Devolve os MESMOS tipos do protótipo (src/data/pendencias.ts): a tela é uma só
   para demo e real ("demo é o contrato"). Escrita só por RPC (migration
   20261008160000_pendencias_processo.sql); leitura direta com RLS por org. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { subirMidiaWa } from '@/data/whatsapp';
import { transcodificarParaOggOpus } from '@/v2/lib/oggOpus';
import {
  ordenarPassos,
  type AjustesPendencias, type Bloco, type ClienteFechado, type Modelo, type Passo, type Pendencia, type PassoPendencia,
  type StatusPendencia, type TipoPendencia,
} from './pendencias';

type Row = Record<string, unknown>;
type BlocoDb = { tipo: Bloco['tipo']; texto?: string; storage_path?: string; mime?: string; nome?: string; tamanho?: number; duracao?: number };

/* Códigos das RPCs (raise exception das migrations 20261008160000 + 20261008190000) → frase para a tela. */
export const ERROS: Record<string, string> = {
  sem_acesso: 'Você não tem acesso a esta organização.',
  contato_invalido: 'Cliente não encontrado.',
  contato_sem_telefone: 'Esse cliente não tem telefone válido.',
  cliente_nao_fechado: 'Só dá para abrir pendência para cliente que já fechou.',
  sem_numero_pendencias: 'Escolha o número das pendências em Ajustes.',
  numero_pendencias_invalido: 'O número das pendências não está disponível. Veja em Ajustes.',
  tipo_invalido: 'Tipo inválido. Atualize a página e tente de novo.',
  o_que_vazio: 'Escreva o que o cliente precisa fazer.',
  sem_mensagem: 'A primeira mensagem está vazia.',
  passos_invalidos: 'Os envios vieram com defeito. Atualize a página e tente de novo.',
  passos_demais: 'Máximo de 12 envios.',
  passo_vazio: 'Tem envio sem mensagem.',
  passo_muito_longo: 'Máximo de 8 itens por envio.',
  passo_ficou_vazio: 'A mensagem ficou sem texto.',
  texto_vazio: 'Tem mensagem de texto em branco.',
  texto_muito_longo: 'Texto longo demais (máximo 4.096 caracteres).',
  midia_path_invalido: 'Tem arquivo que não subiu. Escolha de novo.',
  mime_incompativel: 'Tipo de arquivo não aceito.',
  arquivo_muito_grande: 'Arquivo grande demais (máx. 16 MB; documento 25 MB).',
  hora_invalida: 'Hora inválida em um lembrete.',
  modo_invalido: 'Ação inválida. Atualize a página e tente de novo.',
  pendencia_nao_encontrada: 'Pendência não encontrada. Atualize a página.',
  pendencia_resolvida: 'Essa pendência já foi resolvida.',
  cliente_respondeu: 'O cliente acabou de responder. Atualize a pendência antes de programar.',
  so_admin: 'Só o administrador muda os ajustes.',
  so_gestor_exclui: 'Só administrador ou supervisor pode excluir mensagem pronta.',
  janela_invalida: 'O horário final tem que ser depois do inicial.',
  limite_invalido: 'O limite por dia tem que ser de 8 a 500.',
  ligar_sem_numero: 'Escolha o número antes de ligar os envios.',
  numero_desconectado: 'O número está desconectado. Reconecte em Integrações para ligar os envios.',
  canal_invalido: 'Esse número não pode ser usado nas pendências.',
};
/* erros do Postgres que não são código nosso (frase inteira, procurada por trecho) */
const ERROS_PG: [string, string][] = [
  ['invalid input syntax for type time', 'Preencha os dois horários.'],
];
/** O código vale pela PALAVRA inteira: 'passo_vazio' não casa dentro de 'passo_ficou_vazio' e
 *  'passos_demais' não casa dentro de nada maior (busca por trecho pegaria o código errado). */
export function erroAmigavel(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  const k = (m.match(/[a-z][a-z_]*[a-z]/g) ?? []).find((w) => Object.prototype.hasOwnProperty.call(ERROS, w));
  if (k) return ERROS[k];
  const pg = ERROS_PG.find(([t]) => m.includes(t));
  return pg ? pg[1] : 'Não deu certo. Tente de novo.';
}

const paraBloco = (b: BlocoDb, i: number): Bloco => ({
  id: `b${i}-${Math.random().toString(36).slice(2, 7)}`, tipo: b.tipo, texto: b.texto,
  arquivoNome: b.nome, duracaoSeg: b.duracao, storagePath: b.storage_path, mime: b.mime, tamanho: b.tamanho,
});
export const paraBlocoDb = (b: Bloco): BlocoDb => ({
  tipo: b.tipo, texto: b.texto?.trim() || undefined, storage_path: b.storagePath, mime: b.mime,
  nome: b.arquivoNome, tamanho: b.tamanho, duracao: b.duracaoSeg,
});
export const paraPassosDb = (ps: Passo[]) => ps.map((p) => ({ dia: p.dia, hora: p.hora, blocos: p.blocos.map(paraBlocoDb) }));
const passosDeJson = (v: unknown): Passo[] => (Array.isArray(v) ? v : []).map((p: Row, i) => ({
  id: `p${i}-${Math.random().toString(36).slice(2, 7)}`, dia: Number(p.dia ?? 0), hora: String(p.hora ?? '09:00'),
  blocos: (Array.isArray(p.blocos) ? p.blocos : []).map((b, k) => paraBloco(b as BlocoDb, k)),
}));

export interface DadosPend {
  pendencias: Pendencia[];
  clientes: ClienteFechado[];
  modelos: Modelo[];
  ajustes: AjustesPendencias;
  canais: { id: string; nome: string; telefone: string; conectado: boolean }[];
  /** banco com o motor novo (coluna lembrar_desde): avulsa sai pausada/sem resposta, "Mudar lembretes" preserva a 1ª */
  motorNovo: boolean;
}

export function usePendReal() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['pendencias', org],
    enabled: !!supabase && !!org,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DadosPend> => {
      const sb = supabase!;
      const [pr, mr, cr, kr, ur, mn] = await Promise.all([
        sb.from('pendencias')
          .select('*, contatos(nome, telefone, responsavel_id), pendencias_passos(id, ordem, dia, hora, blocos, quando, estado, avulso, enviado_em, msg_ids)')
          .eq('organizacao_id', org!).order('criado_em', { ascending: false }).limit(500),
        sb.from('pendencias_modelos').select('*').eq('organizacao_id', org!).order('criado_em'),
        sb.from('pendencias_config').select('*').eq('organizacao_id', org!).maybeSingle(),
        /* só WhatsApp por QR (Evolution): não Facebook/notificador; o OFICIAL (Cloud API) sai no filtro abaixo */
        sb.from('canais').select('id, nome_interno, numero_conectado, status_integracao, ativo, transporte')
          .eq('organizacao_id', org!).eq('tipo', 'whatsapp').eq('ativo', true).neq('status_integracao', 'removido').order('nome_interno'),
        sb.from('organizacao_usuarios').select('usuarios(id, nome)').eq('organizacao_id', org!),
        /* motor novo = a coluna lembrar_desde existe (20261008190000). Pergunta à TABELA, não às linhas:
           com zero pendências (o caso do go-live) a lista vazia não diz nada. Sem a coluna, dá erro → motor atual. */
        sb.from('pendencias').select('lembrar_desde').eq('organizacao_id', org!).limit(1),
      ]);
      for (const r of [pr, mr, cr, kr, ur]) if (r.error) throw new Error(r.error.message);
      const entregas = await lerEntregas((pr.data as Row[]) ?? []);
      const motorNovo = detectarMotorNovo((pr.data as Row[]) ?? [], !mn.error);
      const nomes = new Map<string, string>();
      for (const r of (ur.data as Row[]) ?? []) {
        const u = (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios) as { id: string; nome: string } | null;
        if (u) nomes.set(u.id, (u.nome || '').split(/\s+/)[0]);
      }
      const clientes = new Map<string, ClienteFechado>();
      const pendencias: Pendencia[] = ((pr.data as Row[]) ?? []).map((r) => {
        const ct = (Array.isArray(r.contatos) ? r.contatos[0] : r.contatos) as { nome?: string; telefone?: string; responsavel_id?: string | null } | null;
        const cid = r.contato_id as string;
        /* dono = encarregado ATUAL do cliente (segue a troca de encarregado); sem encarregado, quem abriu */
        const dono = (ct?.responsavel_id as string) || (r.criado_por as string) || undefined;
        if (!clientes.has(cid)) {
          clientes.set(cid, {
            id: cid, nome: (ct?.nome || 'Cliente').toUpperCase(), telefone: formatarFone(ct?.telefone ?? ''),
            processo: (r.processo as string) || '', acao: '', responsavel: nomes.get(dono as string) ?? '—', fechadoEm: '',
          });
        }
        const passos = montarPassos((r.pendencias_passos as Row[]) ?? [], entregas);
        const baseLembretes = baseLembretesDe(r);
        return {
          id: r.id as string, clienteId: cid, tipo: r.tipo as TipoPendencia, oQue: r.o_que as string,
          prazo: r.prazo ? `${r.prazo as string}T12:00:00` : undefined, processo: (r.processo as string) || undefined,
          responsavel: nomes.get(dono as string) ?? '—', responsavelId: dono,
          conversaId: r.conversa_id as string,
          criadaEm: r.criado_em as string, status: r.status as StatusPendencia, pausada: !!r.pausada, passos,
          resposta: r.resposta_em ? { texto: textoResposta(r.resposta_texto as string), quando: r.resposta_em as string } : undefined,
          resolvidaEm: (r.resolvida_em as string) || undefined, eventos: [], baseLembretes,
        };
      });
      const modelos: Modelo[] = ((mr.data as Row[]) ?? []).map((m) => ({
        id: m.id as string, tipo: m.tipo as TipoPendencia, nome: m.nome as string, passos: passosDeJson(m.passos),
      }));
      const canais = ((kr.data as Row[]) ?? [])
        .filter((c) => c.transporte === 'evolution')
        .map((c) => ({ id: c.id as string, nome: (c.nome_interno as string) || 'Número', telefone: formatarFone((c.numero_conectado as string) || ''), conectado: c.status_integracao === 'conectado' }));
      const cfg = cr.data as Row | null;
      const canal = canais.find((c) => c.id === cfg?.canal_id);
      const ajustes: AjustesPendencias = {
        numero: { nome: canal?.nome ?? 'Sem número', telefone: canal?.telefone ?? '', conectado: !!canal?.conectado },
        canalId: (cfg?.canal_id as string) ?? undefined,
        ativo: !!cfg?.ativo,
        diasUteis: cfg ? !!cfg.dias_uteis : true,
        janelaIni: String(cfg?.janela_ini ?? '09:00').slice(0, 5),
        janelaFim: String(cfg?.janela_fim ?? '19:00').slice(0, 5),
        limiteDia: Number(cfg?.limite_dia ?? 40),
        avisarResponsavel: cfg ? !!cfg.avisar_responsavel : true,
      };
      return { pendencias, clientes: [...clientes.values()], modelos, ajustes, canais, motorNovo };
    },
  });
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: ['pendencias', org] });
  const { admin, gestor } = permissoesPend(currentOrg?.role);
  return { ...q, org, usuario: { id: user?.id ?? '', nome: (user?.name ?? '').split(/\s+/)[0], admin, gestor }, recarregar };
}

/** papel da org ativa (OrgContext: admin | gestor = supervisor no banco | atendente) →
 *  admin muda os Ajustes (pendencias_config_salvar: so_admin);
 *  gestor = administrador ou supervisor: exclui mensagem pronta (pendencias_modelo_excluir: so_gestor_exclui). */
export function permissoesPend(role?: string | null) {
  return { admin: role === 'admin', gestor: role === 'admin' || role === 'gestor' };
}
/** a coluna lembrar_desde vem em toda linha do select('*') no motor novo; sem linhas, vale a sondagem da tabela */
export function detectarMotorNovo(linhas: Row[], sondagemOk: boolean) {
  return linhas.length ? 'lembrar_desde' in linhas[0] : sondagemOk;
}

/** busca de clientes FECHADOS (oportunidade ganha) para abrir pendência */
export function useClientesFechados(busca: string, ativo: boolean) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['pend-fechados', currentOrg?.id, busca.trim()],
    enabled: !!supabase && ativo,
    staleTime: 20_000,
    queryFn: async (): Promise<(ClienteFechado & { abertas: number })[]> => {
      const { data, error } = await supabase!.rpc('pendencias_clientes_fechados', { p_busca: busca.trim() || null, p_limite: 40 });
      if (error) throw new Error(error.message);
      return ((data as Row[]) ?? []).map((r) => ({
        id: r.contato_id as string, nome: ((r.nome as string) || 'Cliente').toUpperCase(), telefone: formatarFone((r.telefone as string) || ''),
        processo: '', acao: rotuloServico(r.servico as string), responsavel: ((r.responsavel_nome as string) || '—').split(/\s+/)[0],
        fechadoEm: (r.fechado_em as string) || '', abertas: Number(r.abertas ?? 0),
      }));
    },
  });
}

export const rpcPend = {
  async criar(p: { clienteId: string; tipo: TipoPendencia; oQue: string; prazo?: string; processo?: string; passos: Passo[]; agendarPara?: string }) {
    const { data, error } = await supabase!.rpc('pendencia_criar', {
      p_contato: p.clienteId, p_tipo: p.tipo, p_o_que: p.oQue, p_prazo: p.prazo ? p.prazo.slice(0, 10) : null,
      p_processo: p.processo || null, p_passos: paraPassosDb(p.passos), p_iniciar_em: p.agendarPara ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
  async resolver(id: string) { const { error } = await supabase!.rpc('pendencia_resolver', { p_id: id }); if (error) throw new Error(error.message); },
  async reabrir(id: string) { const { error } = await supabase!.rpc('pendencia_reabrir', { p_id: id }); if (error) throw new Error(error.message); },
  async pausar(id: string, v: boolean) { const { error } = await supabase!.rpc('pendencia_pausar', { p_id: id, p_pausar: v }); if (error) throw new Error(error.message); },
  async lembretes(id: string, passos: Passo[], modo: 'trocar' | 'retomar') {
    const { error } = await supabase!.rpc('pendencia_lembretes', { p_id: id, p_passos: paraPassosDb(passos), p_modo: modo });
    if (error) throw new Error(error.message);
  },
  async enviarAgora(id: string, blocos: Bloco[]) {
    const { error } = await supabase!.rpc('pendencia_enviar_agora', { p_id: id, p_blocos: blocos.map(paraBlocoDb) });
    if (error) throw new Error(error.message);
  },
  async salvarModelo(m: Modelo, existe: boolean) {
    const { error } = await supabase!.rpc('pendencias_modelo_salvar', { p_id: existe ? m.id : null, p_tipo: m.tipo, p_nome: m.nome, p_passos: paraPassosDb(m.passos) });
    if (error) throw new Error(error.message);
  },
  async excluirModelo(id: string) { const { error } = await supabase!.rpc('pendencias_modelo_excluir', { p_id: id }); if (error) throw new Error(error.message); },
  async salvarAjustes(a: AjustesPendencias) {
    const { error } = await supabase!.rpc('pendencias_config_salvar', {
      p_canal: a.canalId ?? null, p_janela_ini: a.janelaIni, p_janela_fim: a.janelaFim, p_dias_uteis: a.diasUteis,
      p_limite_dia: a.limiteDia, p_avisar: a.avisarResponsavel, p_ativo: !!a.ativo,
    });
    if (error) throw new Error(error.message);
  },
};

/** sobe áudio/arquivo para o bucket da org. Áudio vira OGG/Opus (o único que TOCA como nota de voz). */
export async function subirArquivoPend(org: string, blob: Blob, nome: string, tipo: Bloco['tipo']) {
  let b = blob; let n = nome; let mime = blob.type || 'application/octet-stream';
  if (tipo === 'audio' && !mime.startsWith('audio/ogg')) {
    b = await transcodificarParaOggOpus(blob);
    mime = 'audio/ogg'; n = n.replace(/\.[^.]+$/, '') + '.ogg';
  }
  if (tipo === 'audio' && !/\.ogg$/i.test(n)) n += '.ogg';
  const up = await subirMidiaWa(org, new File([b], n, { type: mime.split(';')[0] }));
  return { storagePath: up.path, mime: up.mime, tamanho: up.tamanho, arquivoNome: n };
}

/** passos do banco → passos da tela (em ordem de gravação; avulsas no ponto do tempo).
 *  Motor novo: 'na_fila' (entrou na fila) e 'falhou' (não saiu) viram envio feito com entrega
 *  na fila / falhou — a mesma leitura que o motor atual tem pelas linhas da fila. */
export function montarPassos(rows: Row[], entregas: Map<string, LinhaFila>): PassoPendencia[] {
  return ordenarPassos([...rows].sort((a, b) => Number(a.ordem) - Number(b.ordem)).map((s) => {
    const est = String(s.estado);
    const saiu = est === 'enviado' || est === 'na_fila' || est === 'falhou';
    const base: PassoPendencia = {
      id: s.id as string, dia: Number(s.dia), hora: s.avulso ? 'agora' : String(s.hora),
      blocos: ((s.blocos as BlocoDb[]) ?? []).map(paraBloco),
      estado: saiu ? 'enviado' : (est as PassoPendencia['estado']), avulso: !!s.avulso,
      quando: (s.enviado_em as string) || (s.quando as string),
    };
    if (!saiu) return base;
    const e = entregaDoPasso((s.msg_ids as string[] | null) ?? [], entregas);
    if (est === 'falhou') return { ...base, ...e, entrega: 'falhou' as const, motivoFalha: e.motivoFalha ?? 'erro no envio' };
    if (est === 'na_fila' && e.entrega !== 'falhou') return { ...base, entrega: 'fila' as const };
    return { ...base, ...e };
  }));
}
/** de onde o servidor conta os dias ao "Mudar lembretes" — mesma fórmula do banco que está no ar:
 *  atual = coalesce(primeiro_envio_em, criado_em);
 *  novo (tem lembrar_desde) = coalesce(greatest(primeiro_envio_em, lembrar_desde), 1ª (enviado_em|quando), criado_em). */
export function baseLembretesDe(r: Row): string {
  const prim = (r.primeiro_envio_em as string | null) || undefined;
  if (!('lembrar_desde' in r)) return prim || (r.criado_em as string);
  const p0 = ((r.pendencias_passos as Row[]) ?? []).find((x) => Number(x.ordem) === 0);
  return maiorData(prim, r.lembrar_desde as string | null) ?? ((p0?.enviado_em as string) || (p0?.quando as string) || (r.criado_em as string));
}

/* ---------------- entrega de verdade (fila → WhatsApp) ----------------
   O motor marca o passo 'enviado' quando ENFILEIRA; o que acontece depois fica em
   mensagens_agendadas (enviada / falhou / bloqueada / expirada / cancelada). Só leitura. */
export type LinhaFila = { id: string; status: string; enviada_em: string | null; motivo_bloqueio: string | null; ultimo_erro: string | null };
async function lerEntregas(pends: Row[]): Promise<Map<string, LinhaFila>> {
  const ids = pends.filter((r) => r.status !== 'resolvida')
    .flatMap((r) => ((r.pendencias_passos as Row[]) ?? []).filter((s) => ['enviado', 'na_fila', 'falhou'].includes(String(s.estado)))
      .flatMap((s) => (s.msg_ids as string[] | null) ?? []));
  const mapa = new Map<string, LinhaFila>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase!.from('mensagens_agendadas')
      .select('id, status, enviada_em, motivo_bloqueio, ultimo_erro').in('id', ids.slice(i, i + 150));
    if (error) return mapa; // sem essa leitura a tela só não mostra a entrega (não quebra a lista)
    for (const l of (data as LinhaFila[]) ?? []) mapa.set(l.id, l);
  }
  return mapa;
}
const RUIM = new Set(['falhou', 'bloqueada', 'expirada']);
export function entregaDoPasso(ids: string[], mapa: Map<string, LinhaFila>): Partial<Pick<PassoPendencia, 'entrega' | 'motivoFalha' | 'quando'>> {
  const ls = ids.map((id) => mapa.get(id)).filter(Boolean) as LinhaFila[];
  if (!ls.length) return {};
  const ruim = ls.find((l) => RUIM.has(l.status));
  if (ruim) return { entrega: 'falhou', motivoFalha: motivoAmigavel(ruim) };
  if (ls.some((l) => l.status === 'agendada' || l.status === 'processando')) return { entrega: 'fila' };
  const ok = ls.filter((l) => l.status === 'enviada');
  if (!ok.length) return { entrega: 'falhou', motivoFalha: 'o cliente respondeu antes' };
  const ult = ok.map((l) => l.enviada_em).filter(Boolean).sort().pop();
  return ult ? { entrega: 'enviada', quando: ult } : { entrega: 'enviada' };
}
function motivoAmigavel(l: LinhaFila) {
  if (l.status === 'expirada') return 'ficou mais de um dia na fila';
  const m = `${l.motivo_bloqueio ?? ''} ${l.ultimo_erro ?? ''}`.toLowerCase();
  if (m.includes('desconect')) return 'o número estava desconectado';
  if (m.includes('inativo') || m.includes('removido') || m.includes('não encontrado')) return 'o número não está mais ativo';
  if (m.includes('restrito')) return 'o número está com envio restrito';
  if (m.includes('conflito')) return 'o número está em conflito';
  if (m.includes('sem arquivo')) return 'o arquivo sumiu';
  return 'o WhatsApp recusou o envio';
}
/* o motor antigo grava rótulo de mídia com emoji ("🎤 Áudio"): na tela vai sem emoji */
const ROTULO_RESPOSTA: Record<string, string> = { '🎤 Áudio': 'Áudio', '📷 Foto': 'Imagem', '📄 Documento': 'Documento', '🎬 Vídeo': 'Vídeo' };
export const textoResposta = (t?: string | null) => { const x = (t ?? '').trim(); return ROTULO_RESPOSTA[x] ?? (x || 'Mensagem'); };

function maiorData(a?: string | null, b?: string | null) {
  if (!a) return b || undefined;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function formatarFone(t: string) {
  const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
function rotuloServico(s?: string) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
