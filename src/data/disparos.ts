import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   DISPAROS EM LOTE (26/11, "igual" aos Disparos do sistema que a Reviza usava antes). Quem recebe (etapas, etiquetas,
   responsável…), a mensagem (texto com {{nome}} ou um arquivo dos Scripts), o número e o ritmo. Ao criar, cada mensagem vira
   uma MENSAGEM AGENDADA (a central de sempre), espaçada no ritmo do número. Nada sai sem alguém da equipe confirmar.
   Servidor: migration 125 (atd_disparo_previa/estimar/criar/cancelar, atd_disparos_lista). Recurso 'disparos'.
   DEMO É O CONTRATO: sem backend, os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const DISPARO_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface FiltroDisparo { etapas: string[]; etiquetas: string[]; responsaveis: string[]; semResponsavel: boolean; todos: boolean; semConversaDias: number | null }
export interface RitmoDisparo { intervalo_min_s: number; intervalo_max_s: number; janela_inicio: string; janela_fim: string; dias: number[]; max_por_dia: number }
export interface MensagemDisparo { tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento'; texto: string; storage_path?: string; mime?: string; nome?: string; tamanho?: number | null }
export interface Disparo {
  id: string; nome: string; status: 'agendado' | 'cancelado' | 'concluido'; total: number; inicio: string | null; fim: string | null; criadoEm: string;
  canal: string | null; texto: string; arquivo: string | null; agendadas: number; enviadas: number; falhas: number; canceladas: number; responderam: number;
}
export interface NumeroDisparo { id: string; nome: string; numero: string | null; pronto: boolean; motivo: string | null }

export const RITMO_PADRAO: RitmoDisparo = { intervalo_min_s: 90, intervalo_max_s: 180, janela_inicio: '08:00', janela_fim: '20:00', dias: [1, 2, 3, 4, 5, 6], max_por_dia: 150 };
export const FILTRO_VAZIO: FiltroDisparo = { etapas: [], etiquetas: [], responsaveis: [], semResponsavel: false, todos: false, semConversaDias: null };
export const INTERVALOS = [
  { valor: '60-120', rotulo: '1 a 2 min (mais rápido)', min: 60, max: 120 },
  { valor: '90-180', rotulo: '1 min e meio a 3 min (recomendado)', min: 90, max: 180 },
  { valor: '180-300', rotulo: '3 a 5 min (mais seguro)', min: 180, max: 300 },
  { valor: '300-600', rotulo: '5 a 10 min (número novo)', min: 300, max: 600 },
];

/** o texto como o cliente vai ver ({{nome}} = o primeiro nome) */
export function previaTexto(t: string, nome = 'Maria Aparecida Souza'): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? '';
  const p = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : 'tudo bem';
  return t.split('{{nome}}').join(p).split('{{nome_completo}}').join(nome);
}
export function validarDisparo(d: { nome: string; canalId: string | null; mensagem: MensagemDisparo; total: number }): string | null {
  if (!d.nome.trim()) return 'Dê um nome ao disparo (só a equipe vê).';
  if (d.nome.trim().length > 80) return 'O nome vai até 80 letras.';
  if (d.total === 0) return 'Ninguém entra com esse filtro.';
  if (d.total > 2000) return 'São mais de 2.000 pessoas: divida em disparos menores (por etapa ou etiqueta).';
  if (d.mensagem.tipo === 'texto' && d.mensagem.texto.trim().length < 2) return 'Escreva a mensagem.';
  if (d.mensagem.texto.length > 4000) return 'A mensagem vai até 4.000 letras.';
  if (d.mensagem.tipo !== 'texto' && !d.mensagem.storage_path) return 'Escolha o arquivo.';
  if (!d.canalId) return 'Escolha o número que manda.';
  return null;
}
const filtroDb = (f: FiltroDisparo) => ({ etapas: f.etapas, etiquetas: f.etiquetas, responsaveis: f.responsaveis, sem_responsavel: f.semResponsavel, todos: f.todos, sem_conversa_dias: f.semConversaDias });
const MSG: Record<string, string> = {
  canal_desconectado: 'Esse número está desconectado. Conecte em Configurações › WhatsApp.', canal_restrito: 'Esse número está com restrição de envio.',
  canal_inativo: 'Esse número está desligado.', canal_invalido: 'Número inválido.', ninguem_no_filtro: 'Ninguém entra com esse filtro.',
  mais_de_2000: 'São mais de 2.000 pessoas: divida em disparos menores.', mensagem_vazia: 'Escreva a mensagem.', arquivo_faltando: 'Escolha o arquivo.',
  sem_permissao: 'Só o administrador cria disparos.',
};
const legivel = (m: string) => MSG[Object.keys(MSG).find((k) => m.includes(k)) ?? ''] ?? m;

/* ---------------- demonstração ---------------- */
const G = 'previa-disparos';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const DEMO: Disparo[] = [{ id: 'demo-d1', nome: 'Retomar quem parou na documentação', status: 'agendado', total: 64, inicio: hAtras(3), fim: new Date(Date.now() + 3_600_000).toISOString(), criadoEm: hAtras(3.2),
  canal: 'Chip 1', texto: 'Oi {{nome}}! Vi que faltou mandar os documentos para a análise. Posso te ajudar com isso agora?', arquivo: null, agendadas: 22, enviadas: 41, falhas: 1, canceladas: 0, responderam: 9 }];
function ler(): Disparo[] { try { const s = localStorage.getItem(G); return s ? (JSON.parse(s) as Disparo[]) : structuredClone(DEMO); } catch { return structuredClone(DEMO); } }
function gravar(v: Disparo[]) { try { localStorage.setItem(G, JSON.stringify(v)); } catch { /* sem navegador */ } }
const NOMES_DEMO = ['Maria Aparecida Souza', 'José Carlos Ferreira', 'Ivone F. Cardoso', 'Antônio Pereira Lima', 'Neusa B. Martins', 'Sebastião R. Nunes'];
function estimarDemo(n: number, r: RitmoDisparo) {
  const porDia = Math.min(r.max_por_dia, Math.floor(((Number(r.janela_fim.slice(0, 2)) - Number(r.janela_inicio.slice(0, 2))) * 3600) / ((r.intervalo_min_s + r.intervalo_max_s) / 2)));
  const dias = Math.max(1, Math.ceil(n / Math.max(1, porDia)));
  const inicio = new Date(Date.now() + 60_000); const fim = new Date(inicio.getTime() + Math.min(n, porDia) * ((r.intervalo_min_s + r.intervalo_max_s) / 2) * 1000 + (dias - 1) * 86_400_000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString(), dias };
}

const C = 'atd-disparos';
export function useDisparos() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Disparo[]> => {
      if (!DISPARO_REAL) { await espera(120); return ler(); }
      const { data, error } = await supabase!.rpc('atd_disparos_lista');
      if (error) throw new Error(legivel(error.message));
      return ((data as Record<string, unknown>[]) ?? []).map((x) => ({
        id: String(x.id), nome: String(x.nome), status: x.status as Disparo['status'], total: Number(x.total) || 0, inicio: (x.inicio as string) ?? null, fim: (x.fim as string) ?? null,
        criadoEm: String(x.criado_em), canal: (x.canal as string) ?? null, texto: String(x.texto ?? ''), arquivo: (x.arquivo as string) ?? null,
        agendadas: Number(x.agendadas) || 0, enviadas: Number(x.enviadas) || 0, falhas: Number(x.falhas) || 0, canceladas: Number(x.canceladas) || 0, responderam: Number(x.responderam) || 0,
      }));
    },
  });
}

export function useNumerosDisparo() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'numeros'],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<NumeroDisparo[]> => {
      if (!DISPARO_REAL) return [{ id: 'demo-chip-1', nome: 'Chip 1', numero: '5551900000001', pronto: true, motivo: null }, { id: 'demo-chip-2', nome: 'Disparo 2', numero: '5551900000002', pronto: false, motivo: 'desconectado' }];
      const { data, error } = await supabase!.from('canais').select('id, nome_interno, numero_conectado, status_integracao, ativo, envio_restrito').eq('organizacao_id', currentOrg.id).eq('tipo', 'whatsapp').order('nome_interno');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        const motivo = x.ativo === false ? 'desligado' : String(x.status_integracao) !== 'conectado' ? 'desconectado' : x.envio_restrito ? 'com restrição' : null;
        return { id: String(x.id), nome: String(x.nome_interno || x.numero_conectado || 'Número'), numero: (x.numero_conectado as string) ?? null, pronto: !motivo, motivo };
      });
    },
  });
}

export function usePreviaDisparo(f: FiltroDisparo) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'previa', JSON.stringify(f)],
    enabled: !!currentOrg.id,
    staleTime: 20_000,
    queryFn: async (): Promise<{ total: number; amostra: { nome: string; etapa: string | null }[] }> => {
      if (!DISPARO_REAL) {
        await espera(150);
        const base = 120 - f.etapas.length * 25 - f.etiquetas.length * 30 - (f.responsaveis.length || (f.semResponsavel ? 2 : 0)) * 20 + (f.todos ? 40 : 0) - (f.semConversaDias ? 30 : 0);
        const total = Math.max(0, base);
        return { total, amostra: NOMES_DEMO.slice(0, Math.min(6, total)).map((nome) => ({ nome, etapa: 'DOCUMENTAÇÃO' })) };
      }
      const { data, error } = await supabase!.rpc('atd_disparo_previa', { p_filtro: filtroDb(f) });
      if (error) throw new Error(legivel(error.message));
      const j = (data ?? {}) as { total?: number; amostra?: { nome: string; etapa: string | null }[] };
      return { total: Number(j.total) || 0, amostra: j.amostra ?? [] };
    },
  });
}

export function useEstimativaDisparo(n: number, r: RitmoDisparo, inicio: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'estimar', n, JSON.stringify(r), inicio],
    enabled: !!currentOrg.id && n > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<{ inicio: string | null; fim: string | null; dias: number }> => {
      if (!DISPARO_REAL) return estimarDemo(n, r);
      const { data, error } = await supabase!.rpc('atd_disparo_estimar', { p_n: n, p_ritmo: r, p_inicio: inicio });
      if (error) throw new Error(legivel(error.message));
      const j = (data ?? {}) as { inicio?: string; fim?: string; dias?: number };
      return { inicio: j.inicio ?? null, fim: j.fim ?? null, dias: Number(j.dias) || 0 };
    },
  });
}

export function useCriarDisparo() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { nome: string; canalId: string; mensagem: MensagemDisparo; filtro: FiltroDisparo; ritmo: RitmoDisparo; inicio: string | null; total: number; canalNome: string }) => {
      if (!DISPARO_REAL) {
        await espera(400);
        const e = estimarDemo(d.total, d.ritmo);
        const l = ler(); l.unshift({ id: 'demo-d-' + Math.random().toString(36).slice(2, 7), nome: d.nome.trim(), status: 'agendado', total: d.total, inicio: e.inicio, fim: e.fim, criadoEm: new Date().toISOString(),
          canal: d.canalNome, texto: d.mensagem.texto, arquivo: d.mensagem.nome ?? null, agendadas: d.total, enviadas: 0, falhas: 0, canceladas: 0, responderam: 0 });
        gravar(l); return { total: d.total, fim: e.fim };
      }
      const { data, error } = await supabase!.rpc('atd_disparo_criar', { p_nome: d.nome.trim(), p_canal: d.canalId, p_mensagem: d.mensagem, p_filtro: filtroDb(d.filtro), p_ritmo: d.ritmo, p_inicio: d.inicio });
      if (error) throw new Error(legivel(error.message));
      const j = (data ?? {}) as { total?: number; fim?: string };
      return { total: Number(j.total) || 0, fim: j.fim ?? null };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); qc.invalidateQueries({ queryKey: ['wa-agendamentos'] }); },
  });
}

export function useCancelarDisparo() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<number> => {
      if (!DISPARO_REAL) {
        const l = ler(); const d = l.find((x) => x.id === id); if (!d) return 0;
        const n = d.agendadas; d.canceladas += n; d.agendadas = 0; d.status = 'cancelado'; gravar(l); return n;
      }
      const { data, error } = await supabase!.rpc('atd_disparo_cancelar', { p_id: id });
      if (error) throw new Error(legivel(error.message));
      return Number(data) || 0;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
