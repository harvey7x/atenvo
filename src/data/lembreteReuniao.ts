import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   LEMBRETE ANTES DA REUNIÃO (26/11, "igual" ao Follow-up de agendamentos do sistema que a Reviza usava antes). Ligado, cada
   reunião marcada na Agenda ganha uma mensagem agendada para o cliente X tempo antes (e um segundo aviso, se quiser); mudou
   o horário, o lembrete muda; cancelou, sai da fila. CHEGA DESLIGADO — ligar é do administrador, com confirmação.
   Servidor: migration 126 (atd_lembrete_reuniao + atd_lembrete_salvar). Recurso 'lembrete-reuniao'.
   ------------------------------------------------------------------ */

export const LEMBRETE_REAL: boolean = isSupabaseConfigured && !!supabase;
export interface ConfigLembrete { ativo: boolean; antesMin: number; segundoMin: number | null; texto: string; ligadoEm: string | null }
export const TEXTO_PADRAO = 'Oi {{nome}}! Passando para lembrar da nossa {{tipo}} {{quando}}. Se precisar mudar o horário, é só responder aqui.';
export const OPCOES_ANTES = [{ v: 30, r: '30 minutos antes' }, { v: 60, r: '1 hora antes' }, { v: 120, r: '2 horas antes' }, { v: 180, r: '3 horas antes' }, { v: 1440, r: '1 dia antes' }];
export const OPCOES_SEGUNDO = [{ v: 0, r: 'Sem segundo aviso' }, { v: 1440, r: '1 dia antes' }, { v: 2880, r: '2 dias antes' }, { v: 180, r: '3 horas antes' }];

/** o texto como o cliente vê ({{nome}}, {{tipo}}, {{quando}}, {{hora}}) — o mesmo do servidor */
const amanha15 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d; };
export function previaLembrete(t: string, antesMin: number, tipo = 'reuniao', nome = 'Maria Aparecida', inicio = amanha15()): string {
  const envio = new Date(inicio.getTime() - antesMin * 60_000);
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hora = inicio.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const amanha = new Date(envio.getTime() + 86_400_000);
  const quando = dia(inicio) === dia(envio) ? `hoje às ${hora}` : dia(inicio) === dia(amanha) ? `amanhã às ${hora}` : `no dia ${inicio.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })} às ${hora}`;
  const primeiro = nome.trim().split(/\s+/)[0] ?? '';
  const tp = tipo === 'ligacao' ? 'ligação' : tipo === 'videochamada' ? 'videochamada' : tipo === 'retorno' ? 'conversa' : 'reunião';
  return t.split('{{nome}}').join(primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase() : 'tudo bem').split('{{quando}}').join(quando).split('{{hora}}').join(hora).split('{{tipo}}').join(tp);
}

const G = 'previa-lembrete-reuniao';
const C = 'atd-lembrete-reuniao';
const PADRAO: ConfigLembrete = { ativo: false, antesMin: 120, segundoMin: null, texto: TEXTO_PADRAO, ligadoEm: null };
export function useConfigLembrete() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<ConfigLembrete> => {
      if (!LEMBRETE_REAL) { try { const s = localStorage.getItem(G); return s ? (JSON.parse(s) as ConfigLembrete) : { ...PADRAO }; } catch { return { ...PADRAO }; } }
      const { data, error } = await supabase!.from('atd_lembrete_reuniao').select('ativo, antes_min, segundo_min, texto, ligado_em').eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { ...PADRAO };
      const x = data as Record<string, unknown>;
      return { ativo: !!x.ativo, antesMin: Number(x.antes_min) || 120, segundoMin: x.segundo_min == null ? null : Number(x.segundo_min), texto: String(x.texto ?? TEXTO_PADRAO), ligadoEm: (x.ligado_em as string) ?? null };
    },
  });
}
export function useSalvarLembrete() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConfigLembrete): Promise<{ reunioes: number; lembretes: number }> => {
      if (!LEMBRETE_REAL) {
        try { localStorage.setItem(G, JSON.stringify({ ...c, ligadoEm: c.ativo ? (c.ligadoEm ?? new Date().toISOString()) : c.ligadoEm })); } catch { /* sem navegador */ }
        return { reunioes: 3, lembretes: c.ativo ? 3 * (c.segundoMin ? 2 : 1) : 0 };
      }
      const { data, error } = await supabase!.rpc('atd_lembrete_salvar', { p_ativo: c.ativo, p_antes_min: c.antesMin, p_segundo_min: c.segundoMin, p_texto: c.texto });
      if (error) throw new Error(error.message.includes('sem_permissao') ? 'Só o administrador muda o lembrete.' : error.message);
      const j = (data ?? {}) as { reunioes?: number; lembretes?: number };
      return { reunioes: Number(j.reunioes) || 0, lembretes: Number(j.lembretes) || 0 };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
