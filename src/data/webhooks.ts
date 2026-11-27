import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   AVISAR OUTRO SISTEMA — WEBHOOKS DE SAÍDA (26/11, "igual" aos Webhooks do sistema que a Reviza usava antes). O administrador
   cadastra um endereço https e os momentos; o Reviza manda um POST assinado (X-Reviza-Assinatura: sha256=HMAC do corpo com
   o segredo). Em segundo plano; tenta de novo até 3 vezes; 30 falhas seguidas desligam o webhook.
   Servidor: migration 124 (atd_webhooks, atd_webhook_envios, atd_webhook_testar, relógio atd-webhooks).
   DEMO É O CONTRATO: sem backend, os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const WEBHOOK_REAL: boolean = isSupabaseConfigured && !!supabase;

export type EventoWebhook = 'lead_novo' | 'etapa' | 'venda' | 'perdido' | 'reuniao' | 'formulario';
export const EVENTOS: { valor: EventoWebhook; rotulo: string; detalhe: string }[] = [
  { valor: 'lead_novo', rotulo: 'Lead novo', detalhe: 'um card novo entrou no funil' },
  { valor: 'etapa', rotulo: 'Mudou de etapa', detalhe: 'o card foi para outra etapa' },
  { valor: 'venda', rotulo: 'Venda', detalhe: 'o card virou venda' },
  { valor: 'perdido', rotulo: 'Descartado', detalhe: 'o card foi descartado' },
  { valor: 'reuniao', rotulo: 'Reunião marcada', detalhe: 'uma reunião entrou na Agenda' },
  { valor: 'formulario', rotulo: 'Formulário', detalhe: 'alguém preencheu um formulário' },
];
export interface Webhook {
  id: string; nome: string; url: string; eventos: EventoWebhook[]; segredo: string; ativo: boolean;
  falhasSeguidas: number; ultimoEnvioEm: string | null; ultimoStatus: number | null; desligadoMotivo: string | null;
}
export interface EnvioWebhook { id: number; webhookId: string; evento: string; status: number | null; erro: string | null; tentativas: number; criadoEm: string; resolvido: boolean }

export function validarWebhook(w: { nome: string; url: string; eventos: EventoWebhook[] }): string | null {
  if (!w.nome.trim()) return 'Dê um nome (ex.: o sistema que vai receber).';
  if (w.nome.trim().length > 80) return 'O nome vai até 80 letras.';
  const u = w.url.trim();
  if (!/^https:\/\/\S{4,}$/.test(u)) return 'O endereço precisa começar com https:// e não pode ter espaço.';
  if (u.length > 500) return 'O endereço vai até 500 letras.';
  if (w.eventos.length === 0) return 'Escolha pelo menos um momento.';
  return null;
}
export const ehOk = (s: number | null) => s !== null && s >= 200 && s < 300;

const deLinha = (r: Record<string, unknown>): Webhook => ({
  id: String(r.id), nome: String(r.nome), url: String(r.url), eventos: (r.eventos as EventoWebhook[]) ?? [], segredo: String(r.segredo ?? ''),
  ativo: r.ativo !== false, falhasSeguidas: Number(r.falhas_seguidas) || 0, ultimoEnvioEm: (r.ultimo_envio_em as string) ?? null,
  ultimoStatus: r.ultimo_status == null ? null : Number(r.ultimo_status), desligadoMotivo: (r.desligado_motivo as string) ?? null,
});

/* ---------------- demonstração ---------------- */
const G = 'previa-webhooks', G_E = 'previa-webhooks-envios';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const DEMO: Webhook[] = [{ id: 'demo-wh-1', nome: 'Planilha do comercial', url: 'https://exemplo.com.br/recebe-leads', eventos: ['lead_novo', 'venda'], segredo: '3f9a0c1e7b2d4a6f8e1c3b5d7f9a1c3e5b7d9f1a3c5e7b9d', ativo: true, falhasSeguidas: 0, ultimoEnvioEm: hAtras(0.4), ultimoStatus: 200, desligadoMotivo: null }];
const ENVIOS_DEMO: EnvioWebhook[] = [
  { id: 3, webhookId: 'demo-wh-1', evento: 'venda', status: 200, erro: null, tentativas: 1, criadoEm: hAtras(0.4), resolvido: true },
  { id: 2, webhookId: 'demo-wh-1', evento: 'lead_novo', status: 200, erro: null, tentativas: 1, criadoEm: hAtras(2), resolvido: true },
  { id: 1, webhookId: 'demo-wh-1', evento: 'lead_novo', status: 503, erro: 'HTTP 503', tentativas: 3, criadoEm: hAtras(26), resolvido: true },
];
function ler<T>(k: string, d: T): T { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : structuredClone(d); } catch { return structuredClone(d); } }
function gravar(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem navegador */ } }
const segredoNovo = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

const C = 'atd-webhooks';
export function useWebhooks() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Webhook[]> => {
      if (!WEBHOOK_REAL) { await espera(120); return ler(G, DEMO); }
      const { data, error } = await supabase!.from('atd_webhooks').select('*').eq('organizacao_id', currentOrg.id).order('criado_em');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => deLinha(r as Record<string, unknown>));
    },
  });
}
export function useEnviosWebhook() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id, 'envios'],
    enabled: !!currentOrg.id,
    refetchInterval: 10_000,
    queryFn: async (): Promise<EnvioWebhook[]> => {
      if (!WEBHOOK_REAL) { await espera(100); return ler(G_E, ENVIOS_DEMO); }
      const { data, error } = await supabase!.from('atd_webhook_envios').select('id, webhook_id, evento, status_http, erro, tentativas, criado_em, resolvido_em')
        .eq('organizacao_id', currentOrg.id).order('id', { ascending: false }).limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        return { id: Number(x.id), webhookId: String(x.webhook_id), evento: String(x.evento), status: x.status_http == null ? null : Number(x.status_http), erro: (x.erro as string) ?? null, tentativas: Number(x.tentativas) || 0, criadoEm: String(x.criado_em), resolvido: !!x.resolvido_em };
      });
    },
  });
}

export function useSalvarWebhook() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w: { id?: string; nome: string; url: string; eventos: EventoWebhook[]; ativo: boolean; trocarSegredo?: boolean }) => {
      if (!WEBHOOK_REAL) {
        await espera(150);
        const l = ler(G, DEMO); const i = l.findIndex((x) => x.id === w.id);
        const base: Webhook = i >= 0 ? l[i] : { id: 'demo-wh-' + Math.random().toString(36).slice(2, 7), nome: '', url: '', eventos: [], segredo: segredoNovo(), ativo: true, falhasSeguidas: 0, ultimoEnvioEm: null, ultimoStatus: null, desligadoMotivo: null };
        const novo = { ...base, nome: w.nome.trim(), url: w.url.trim(), eventos: w.eventos, ativo: w.ativo, segredo: w.trocarSegredo ? segredoNovo() : base.segredo, ...(w.ativo && !base.ativo ? { falhasSeguidas: 0, desligadoMotivo: null } : {}) };
        if (i >= 0) l[i] = novo; else l.push(novo); gravar(G, l); return;
      }
      const linha: Record<string, unknown> = { organizacao_id: currentOrg.id, nome: w.nome.trim(), url: w.url.trim(), eventos: w.eventos, ativo: w.ativo };
      const { error } = w.id ? await supabase!.from('atd_webhooks').update(linha).eq('id', w.id) : await supabase!.from('atd_webhooks').insert(linha);
      if (error) throw new Error(error.message.includes('url_check') ? 'O endereço precisa começar com https:// e não pode ter espaço.' : error.message);
      if (w.id && w.trocarSegredo) {
        const { error: e2 } = await supabase!.rpc('atd_webhook_trocar_segredo', { p_webhook: w.id });
        if (e2) throw new Error(e2.message);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
export function useApagarWebhook() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!WEBHOOK_REAL) { gravar(G, ler(G, DEMO).filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_webhooks').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
export function useTestarWebhook() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!WEBHOOK_REAL) {
        await espera(600);
        const e = ler(G_E, ENVIOS_DEMO);
        e.unshift({ id: Math.max(0, ...e.map((x) => x.id)) + 1, webhookId: id, evento: 'teste', status: 200, erro: null, tentativas: 1, criadoEm: new Date().toISOString(), resolvido: true });
        gravar(G_E, e); return;
      }
      const { error } = await supabase!.rpc('atd_webhook_testar', { p_webhook: id });
      if (error) throw new Error(error.message.includes('webhook_desligado') ? 'Ligue o webhook antes de testar.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
