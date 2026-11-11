/* =====================================================================
   Área de Avisos — o administrativo (admin/gestor) manda avisos pro time
   comercial (texto + vários anexos: imagem/áudio/vídeo/documento) e cada
   destinatário tem recibo de leitura.
   Demo: localStorage `alfa_avisos_v1` (anexos como data URL, persona de
   comercial escolhida na tela). Reviza: tabelas avisos/aviso_anexos/
   aviso_destinos + bucket privado 'avisos' (migration reviza_21) — URL
   assinada sob demanda, marcar lido via RPC.
   ===================================================================== */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoMode, isRevizaMode, supabase } from '@/lib/supabase';
import { registrarDesfazer, registrarBloqueada } from '../desfazer';

export type TipoAnexoAviso = 'imagem' | 'audio' | 'video' | 'documento';
export interface AnexoAviso {
  id: string; tipo: TipoAnexoAviso; nome: string;
  path?: string;   // real: caminho no bucket privado (assina na hora de exibir)
  url?: string;    // demo: data URL guardada no navegador
}
export interface DestinoAviso { userId: string; nome: string; lidoEm: string | null }
export interface Aviso {
  id: string; autorNome: string; corpo: string; criadoEm: string;
  anexos: AnexoAviso[]; destinos: DestinoAviso[];
  /** leitura do usuário LOGADO (visão do comercial); null = ainda não viu */
  meuLidoEm: string | null; souDestinatario: boolean;
}
export interface NovoAnexoAviso { arquivo: Blob; nome: string; tipo: TipoAnexoAviso }
export interface NovoAvisoInput {
  corpo: string; paraTodos: boolean;
  destinos: { userId: string; nome: string }[];
  anexos: NovoAnexoAviso[];
}

export function tipoDoAnexo(mime: string): TipoAnexoAviso {
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'documento';
}

const K = {
  lista: ['reviza', 'avisos'] as const,
  naoLidos: ['reviza', 'avisos', 'nao-lidos'] as const,
};

/* ---------------- demo: localStorage (mesmo padrão do alfa_gestao) ---------------- */

export const AV_LS = 'alfa_avisos_v1';
export const AV_PERSONA_LS = 'alfa_avisos_persona';
export interface AvisoDemo { id: string; autorNome: string; corpo: string; criadoEm: string; anexos: AnexoAviso[]; destinos: DestinoAviso[] }

/** anexo do aviso-exemplo da DEMO: modelo de comprovante (dono 28/09: "deixe isso mais profissional").
    SVG em data URL — sem arquivo, sem rede. Fonte do sistema (img não carrega webfont). */
const MODELO_COMPROVANTE_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340" font-family="-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"> <defs> <clipPath id="c"><rect width="600" height="340" rx="18"/></clipPath> <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F3C969"/><stop offset="1" stop-color="#B8860B"/></linearGradient> </defs> <g clip-path="url(#c)"> <rect width="600" height="340" fill="#FBFAF7"/> <rect width="600" height="5" fill="url(#g)"/> </g> <rect x=".5" y=".5" width="599" height="339" rx="17.5" fill="none" stroke="#E6E0D2"/> <text x="32" y="42" font-size="10.5" font-weight="700" letter-spacing="1.8" fill="#9C8452">ALFA GROUP · COBRANÇAS</text> <text x="32" y="70" font-size="21" font-weight="700" fill="#1D1F24">Modelo de comprovante</text> <text x="32" y="92" font-size="12.5" fill="#6B6E75">O que precisa aparecer antes de lançar o pagamento</text> <g transform="translate(32 114)"> <rect width="252" height="198" rx="12" fill="#FFFFFF" stroke="#E6E0D2"/> <circle cx="27" cy="28" r="12" fill="#E7F3EC"/> <path d="M21.5 28l3.6 3.6 6.8-7.2" fill="none" stroke="#2F7457" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/> <text x="47" y="25" font-size="12" font-weight="700" fill="#1D1F24">Transferência Pix</text> <text x="47" y="39" font-size="10" fill="#8A8D93">Comprovante de pagamento</text> <line x1="16" x2="236" y1="54" y2="54" stroke="#ECE6D8" stroke-dasharray="3 3"/> <text x="16" y="74" font-size="9" font-weight="600" letter-spacing=".8" fill="#8A8D93">VALOR</text> <text x="16" y="94" font-size="18" font-weight="700" fill="#1D1F24">R$ 175,00</text> <text x="128" y="74" font-size="9" font-weight="600" letter-spacing=".8" fill="#8A8D93">DATA</text> <text x="128" y="93" font-size="12" font-weight="600" fill="#1D1F24">25/09 · 14:32</text> <circle cx="228" cy="87" r="9" fill="#B8860B"/><text x="228" y="91" font-size="10.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">2</text> <text x="16" y="122" font-size="9" font-weight="600" letter-spacing=".8" fill="#8A8D93">PAGADOR</text> <text x="16" y="139" font-size="12" font-weight="600" fill="#1D1F24">Nome completo do cliente</text> <circle cx="228" cy="133" r="9" fill="#B8860B"/><text x="228" y="137" font-size="10.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">1</text> <text x="16" y="166" font-size="9" font-weight="600" letter-spacing=".8" fill="#8A8D93">INSTITUIÇÃO</text> <text x="16" y="183" font-size="12" font-weight="600" fill="#1D1F24">Banco de origem</text> <circle cx="228" cy="177" r="9" fill="#B8860B"/><text x="228" y="181" font-size="10.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">3</text> </g> <g transform="translate(314 118)"> <circle cx="11" cy="11" r="11" fill="#B8860B"/><text x="11" y="15" font-size="11.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">1</text> <text x="32" y="10" font-size="13" font-weight="700" fill="#1D1F24">Nome completo do cliente</text> <text x="32" y="26" font-size="11" fill="#6B6E75">igual ao cadastro na Gestão</text> <circle cx="11" cy="59" r="11" fill="#B8860B"/><text x="11" y="63" font-size="11.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">2</text> <text x="32" y="58" font-size="13" font-weight="700" fill="#1D1F24">Valor e data do pagamento</text> <text x="32" y="74" font-size="11" fill="#6B6E75">do mês que está sendo pago</text> <circle cx="11" cy="107" r="11" fill="#B8860B"/><text x="11" y="111" font-size="11.5" font-weight="700" fill="#FFFFFF" text-anchor="middle">3</text> <text x="32" y="106" font-size="13" font-weight="700" fill="#1D1F24">Banco de origem legível</text> <text x="32" y="122" font-size="11" fill="#6B6E75">foto nítida, sem cortes</text> </g> <g transform="translate(314 262)"> <rect width="254" height="50" rx="10" fill="#1D1F24"/> <text x="16" y="21" font-size="9.5" font-weight="700" letter-spacing="1.4" fill="#F0BC4E">REGRA</text> <text x="16" y="38" font-size="13" font-weight="600" fill="#FFFFFF">Sem comprovante, sem lançamento.</text> </g> </svg>`);

function avSeed(): AvisoDemo[] {
  const ontem = new Date(Date.now() - 26 * 3600_000).toISOString();
  const hoje = new Date(Date.now() - 2 * 3600_000).toISOString();
  return [
    {
      id: 'av-seed-1', autorNome: 'Administrativo', criadoEm: hoje,
      corpo: 'Atenção, equipe: a partir de amanhã o horário de fechamento do caixa passa a ser 17h30. Pagamentos lançados depois disso entram na conferência do dia seguinte.',
      anexos: [],
      destinos: [
        { userId: 'p-Eduardo', nome: 'Eduardo', lidoEm: null },
        { userId: 'p-Augusto', nome: 'Augusto', lidoEm: ontem },
        { userId: 'p-Junior', nome: 'Junior', lidoEm: null },
      ],
    },
    {
      id: 'av-seed-2', autorNome: 'Administrativo', criadoEm: ontem,
      corpo: 'Lembrete do ciclo D25: confirmar com os clientes o comprovante ANTES de lançar o pagamento. Segue o modelo atualizado em anexo.',
      anexos: [{
        id: 'ax-seed-1', tipo: 'imagem', nome: 'modelo-comprovante.svg',
        url: MODELO_COMPROVANTE_URL,
      }],
      destinos: [
        { userId: 'p-Eduardo', nome: 'Eduardo', lidoEm: ontem },
        { userId: 'p-Paty', nome: 'Paty', lidoEm: ontem },
      ],
    },
  ];
}
export function avCarregar(): AvisoDemo[] {
  try {
    const raw = localStorage.getItem(AV_LS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) {
        // o anexo-exemplo do seed (ax-seed-1) segue sempre o modelo ATUAL — quem já tinha a demo salva vê o novo
        return (p as AvisoDemo[]).map((av) => (av.anexos?.some((x) => x.id === 'ax-seed-1')
          ? { ...av, anexos: av.anexos.map((x) => (x.id === 'ax-seed-1' ? { ...x, url: MODELO_COMPROVANTE_URL } : x)) }
          : av));
      }
    }
  } catch { /* ignore */ }
  return avSeed();
}
export function avSalvar(l: AvisoDemo[]) { try { localStorage.setItem(AV_LS, JSON.stringify(l)); } catch { /* ignore */ } }
export function avPersona(): string { try { return localStorage.getItem(AV_PERSONA_LS) || 'Eduardo'; } catch { return 'Eduardo'; } }
export function avSetPersona(n: string) { try { localStorage.setItem(AV_PERSONA_LS, n); } catch { /* ignore */ } }
/** não lidos da persona demo (alimenta badge do menu + alerta flutuante no demo) */
export function avNaoLidosDemo(): number {
  const p = avPersona();
  return avCarregar().filter((a) => a.destinos.some((d) => d.nome === p && !d.lidoEm)).length;
}

/* ---------------- Storage (real) ---------------- */

/** sobe um anexo pro bucket privado 'avisos' e devolve o path */
export async function subirAnexoAviso(arquivo: Blob, nome: string): Promise<string> {
  const limpo = nome.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'arquivo';
  const path = `a/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${limpo}`;
  const { error } = await supabase!.storage.from('avisos').upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
/** URL assinada (1h) pra exibir o anexo */
export async function urlAnexoAviso(path: string): Promise<string | null> {
  const { data } = await supabase!.storage.from('avisos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ---------------- hooks (real; no demo a tela usa av* direto) ---------------- */

interface AvisoRow {
  id: string; autor_nome: string; corpo: string; created_at: string;
  aviso_anexos: { id: string; tipo: TipoAnexoAviso; path: string; nome: string; ordem: number }[] | null;
  aviso_destinos: { user_id: string; nome: string; lido_em: string | null }[] | null;
}

export function useAvisos(habilitado = true) {
  return useQuery<Aviso[]>({
    queryKey: K.lista,
    enabled: habilitado && isRevizaMode && !!supabase,
    refetchInterval: 20000,
    queryFn: async () => {
      const uid = (await supabase!.auth.getUser()).data.user?.id ?? '';
      const { data, error } = await supabase!.from('avisos')
        .select('id, autor_nome, corpo, created_at, aviso_anexos(id, tipo, path, nome, ordem), aviso_destinos(user_id, nome, lido_em)')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as AvisoRow[]).map((r) => {
        const destinos: DestinoAviso[] = (r.aviso_destinos ?? []).map((d) => ({ userId: d.user_id, nome: d.nome, lidoEm: d.lido_em }));
        const meu = destinos.find((d) => d.userId === uid) ?? null;
        return {
          id: r.id, autorNome: r.autor_nome, corpo: r.corpo, criadoEm: r.created_at,
          anexos: (r.aviso_anexos ?? []).slice().sort((a, b) => a.ordem - b.ordem)
            .map((a) => ({ id: a.id, tipo: a.tipo, nome: a.nome, path: a.path })),
          destinos, meuLidoEm: meu?.lidoEm ?? null, souDestinatario: !!meu,
        };
      });
    },
  });
}

/** quantos avisos o usuário logado ainda não leu (badge do menu + alerta).
    No demo conta os da persona escolhida na tela de Avisos. */
/** `habilitado` = false para quem não tem o ambiente Cobranças (o shell não busca os avisos dela) */
export function useAvisosNaoLidos(habilitado = true) {
  return useQuery<number>({
    queryKey: K.naoLidos,
    enabled: habilitado && (isRevizaMode ? !!supabase : isDemoMode),
    refetchInterval: isRevizaMode ? 25000 : 5000,
    queryFn: async () => {
      if (!isRevizaMode) return avNaoLidosDemo();
      const uid = (await supabase!.auth.getUser()).data.user?.id;
      if (!uid) return 0;
      const { count, error } = await supabase!.from('aviso_destinos')
        .select('aviso_id', { count: 'exact', head: true })
        .eq('user_id', uid).is('lido_em', null);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

function useInvAvisos() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: K.lista }); void qc.invalidateQueries({ queryKey: K.naoLidos }); };
}

/** cria o aviso: sobe os anexos, grava aviso + anexos + destinatários */
export function useCriarAviso() {
  const inv = useInvAvisos();
  return useMutation({
    mutationFn: async (n: NovoAvisoInput) => {
      const u = (await supabase!.auth.getUser()).data.user;
      if (!u) throw new Error('não autenticado');
      const { data: perfil } = await supabase!.from('profiles').select('nome').eq('id', u.id).maybeSingle();
      const subidos: { tipo: TipoAnexoAviso; path: string; nome: string; ordem: number }[] = [];
      for (let i = 0; i < n.anexos.length; i++) {
        const a = n.anexos[i];
        subidos.push({ tipo: a.tipo, path: await subirAnexoAviso(a.arquivo, a.nome), nome: a.nome, ordem: i });
      }
      const { data: av, error } = await supabase!.from('avisos')
        .insert({ autor_id: u.id, autor_nome: (perfil?.nome as string | undefined) ?? '', corpo: n.corpo, para_todos: n.paraTodos })
        .select('id').single();
      if (error) throw new Error(error.message);
      if (subidos.length) {
        const { error: e2 } = await supabase!.from('aviso_anexos').insert(subidos.map((s) => ({ ...s, aviso_id: av.id })));
        if (e2) throw new Error(e2.message);
      }
      const { error: e3 } = await supabase!.from('aviso_destinos')
        .insert(n.destinos.map((d) => ({ aviso_id: av.id, user_id: d.userId, nome: d.nome })));
      if (e3) throw new Error(e3.message);
      return av.id as string;
    },
    onSuccess: (id) => {
      inv();
      registrarDesfazer({
        rotulo: 'envio de aviso', destrutivo: true,
        inverso: async () => {
          const { data: anexos } = await supabase!.from('aviso_anexos').select('path').eq('aviso_id', id);
          const paths = (anexos ?? []).map((a) => String((a as { path?: string }).path)).filter(Boolean);
          if (paths.length) await supabase!.storage.from('avisos').remove(paths);
          const { error } = await supabase!.from('avisos').delete().eq('id', id);
          if (error) throw new Error(error.message);
        },
      });
    },
  });
}

export function useMarcarAvisoLido() {
  const inv = useInvAvisos();
  return useMutation({
    mutationFn: async (avisoId: string) => {
      const { error } = await supabase!.rpc('aviso_marcar_lido', { p_aviso: avisoId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { inv(); },
  });
}

/** exclui o aviso (admin/gestor): tenta limpar os anexos do Storage e apaga a linha (cascade) */
export function useExcluirAviso() {
  const inv = useInvAvisos();
  return useMutation({
    mutationFn: async (a: { id: string; paths: string[] }) => {
      if (a.paths.length) await supabase!.storage.from('avisos').remove(a.paths);
      const { error } = await supabase!.from('avisos').delete().eq('id', a.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { inv(); registrarBloqueada('excluir aviso', 'O aviso e os anexos foram apagados de vez — não dá pra desfazer.'); },
  });
}
