import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   SAÚDE DOS NÚMEROS DE WHATSAPP do Atendimento (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá só
   havia conectado/desconectado). Para cada número: o que saiu, falhou e chegou hoje e nos 7 dias, a última mensagem
   recebida e quantos clientes que A GENTE chamou responderam. A nota (boa / atenção / risco) e o motivo saem de
   avaliarSaude, aqui, com regras simples e testadas (saudeNumeros.test.ts):
     · desconectado ou com envio travado → risco;
     · conectado, recebia bem e NADA chega há 2 horas úteis → risco (o número "travado": o socket morre e o status
       continua "conectado" — aconteceu no Atenvo em 24/10);
     · muitos envios falhando hoje → atenção (10%) ou risco (25%);
     · poucos clientes chamados respondem (menos de 15% em 7 dias, com 20+ chamados) → atenção: é o que leva o
       WhatsApp a bloquear o número;
     · mais de 250 envios hoje → atenção.
   Servidor: migration 107 (atd_saude_numeros, só leitura, só administrador). DEMO: os três números de exemplo.
   ------------------------------------------------------------------ */

export const SAUDE_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface DiaSaude { dia: string; enviadas: number; falharam: number; recebidas: number }
export interface SaudeNumero {
  canalId: string; nome: string; numero: string | null; status: string; envioRestrito: boolean;
  hoje: { enviadas: number; falharam: number; recebidas: number };
  ultimaRecebida: string | null; ultimaEnviada: string | null;
  /** minutos em horário comercial desde a última mensagem recebida (null = nunca recebeu nos 8 dias) */
  semReceberMinUteis: number | null;
  recebidas7d: number; enviadas7d: number; falharam7d: number;
  chamadas7d: number; responderam7d: number;
  serie: DiaSaude[];
}
export type NotaSaude = 'boa' | 'atencao' | 'risco';
export interface Avaliacao { nota: NotaSaude; motivos: string[] }

/* limites das regras */
export const SEM_RECEBER_MIN = 120;
export const RECEBIA_POR_DIA = 10;
export const FALHA_ATENCAO = 0.1, FALHA_RISCO = 0.25, FALHA_MIN_ENVIOS = 5;
export const RESPOSTA_MIN = 0.15, CHAMADAS_MIN = 20;
export const ENVIOS_DIA_ALTO = 250;

const pct = (x: number) => `${Math.round(x * 100)}%`;
function horas(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
}

export function avaliarSaude(n: SaudeNumero): Avaliacao {
  const risco: string[] = []; const atencao: string[] = [];
  const conectado = n.status === 'conectado';
  if (!conectado) risco.push('Desconectado: não envia nem recebe. Conecte de novo pelo QR Code.');
  if (n.envioRestrito) risco.push('Envio travado por segurança: só recebe mensagens.');
  if (conectado && n.recebidas7d / 7 >= RECEBIA_POR_DIA && n.semReceberMinUteis != null && n.semReceberMinUteis >= SEM_RECEBER_MIN) {
    risco.push(`Aparece conectado, mas nada chega há ${horas(n.semReceberMinUteis)} em horário comercial. Pode estar travado: reinicie o servidor do WhatsApp.`);
  }
  if (n.hoje.enviadas >= FALHA_MIN_ENVIOS) {
    const f = n.hoje.falharam / n.hoje.enviadas;
    const txt = `${n.hoje.falharam} de ${n.hoje.enviadas} envios falharam hoje (${pct(f)}).`;
    if (f >= FALHA_RISCO) risco.push(txt); else if (f >= FALHA_ATENCAO) atencao.push(txt);
  }
  if (n.chamadas7d >= CHAMADAS_MIN && n.responderam7d / n.chamadas7d < RESPOSTA_MIN) {
    atencao.push(`Só ${pct(n.responderam7d / n.chamadas7d)} dos clientes chamados responderam em 7 dias (${n.responderam7d} de ${n.chamadas7d}). Muita mensagem sem resposta faz o WhatsApp bloquear o número.`);
  }
  if (n.hoje.enviadas > ENVIOS_DIA_ALTO) atencao.push(`${n.hoje.enviadas} envios hoje: é bastante para um número só. Espalhe entre os números.`);
  if (risco.length) return { nota: 'risco', motivos: [...risco, ...atencao] };
  if (atencao.length) return { nota: 'atencao', motivos: atencao };
  return { nota: 'boa', motivos: ['Enviando e recebendo normalmente.'] };
}
export const ROTULO_NOTA: Record<NotaSaude, string> = { boa: 'Boa', atencao: 'Atenção', risco: 'Risco' };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v: unknown) => (typeof v === 'string' && v ? v : null);
export function normalizarSaude(r: Record<string, unknown>): SaudeNumero {
  const h = (r.hoje ?? {}) as Record<string, unknown>;
  return {
    canalId: String(r.canal_id ?? ''), nome: String(r.nome ?? 'Número'), numero: txt(r.numero), status: String(r.status ?? 'desconectado'),
    envioRestrito: r.envio_restrito === true,
    hoje: { enviadas: num(h.enviadas), falharam: num(h.falharam), recebidas: num(h.recebidas) },
    ultimaRecebida: txt(r.ultima_recebida), ultimaEnviada: txt(r.ultima_enviada),
    semReceberMinUteis: r.sem_receber_min_uteis == null ? null : num(r.sem_receber_min_uteis),
    recebidas7d: num(r.recebidas_7d), enviadas7d: num(r.enviadas_7d), falharam7d: num(r.falharam_7d),
    chamadas7d: num(r.chamadas_7d), responderam7d: num(r.responderam_7d),
    serie: (Array.isArray(r.serie) ? r.serie : []).map((d: Record<string, unknown>) => ({ dia: String(d.dia ?? '').slice(0, 10), enviadas: num(d.enviadas), falharam: num(d.falharam), recebidas: num(d.recebidas) })),
  };
}

/* ---------------- demonstração: os três números de exemplo de Configurações › WhatsApp ---------------- */
function serieDemo(env: number[], fal: number[], rec: number[]): DiaSaude[] {
  const hoje = new Date();
  return env.map((e, i) => { const d = new Date(hoje); d.setDate(d.getDate() - (6 - i)); return { dia: d.toISOString().slice(0, 10), enviadas: e, falharam: fal[i], recebidas: rec[i] }; });
}
const minAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
export const SAUDE_DEMO: SaudeNumero[] = [
  { canalId: 'atd-principal', nome: 'Atendimento principal', numero: '5551988880001', status: 'conectado', envioRestrito: false,
    hoje: { enviadas: 64, falharam: 1, recebidas: 71 }, ultimaRecebida: minAtras(4), ultimaEnviada: minAtras(6), semReceberMinUteis: 4,
    recebidas7d: 402, enviadas7d: 377, falharam7d: 5, chamadas7d: 38, responderam7d: 24,
    serie: serieDemo([52, 61, 0, 0, 58, 72, 64], [1, 0, 0, 0, 2, 1, 1], [60, 66, 3, 1, 64, 80, 71]) },
  { canalId: 'atd-campanha', nome: 'Campanha de novembro', numero: '5551977770002', status: 'conectado', envioRestrito: false,
    hoje: { enviadas: 118, falharam: 14, recebidas: 9 }, ultimaRecebida: minAtras(22), ultimaEnviada: minAtras(3), semReceberMinUteis: 22,
    recebidas7d: 61, enviadas7d: 640, falharam7d: 41, chamadas7d: 212, responderam7d: 23,
    serie: serieDemo([84, 97, 0, 0, 120, 131, 118], [3, 5, 0, 0, 9, 10, 14], [8, 11, 0, 1, 12, 13, 9]) },
  { canalId: 'atd-recepcao', nome: 'Recepção', numero: '5551966660003', status: 'desconectado', envioRestrito: false,
    hoje: { enviadas: 0, falharam: 0, recebidas: 0 }, ultimaRecebida: minAtras(26 * 60), ultimaEnviada: minAtras(27 * 60), semReceberMinUteis: 560,
    recebidas7d: 48, enviadas7d: 41, falharam7d: 2, chamadas7d: 6, responderam7d: 4,
    serie: serieDemo([12, 9, 0, 0, 14, 6, 0], [0, 0, 0, 0, 1, 1, 0], [13, 11, 1, 0, 15, 8, 0]) },
];

export function useSaudeNumeros(ativo = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['saude-numeros', currentOrg.id],
    enabled: ativo,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<SaudeNumero[]> => {
      if (!SAUDE_REAL) { await new Promise((ok) => setTimeout(ok, 250)); return SAUDE_DEMO; }
      const { data, error } = await supabase!.rpc('atd_saude_numeros');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []).map((x) => normalizarSaude(x as Record<string, unknown>)).filter((x) => x.canalId);
    },
  });
}
