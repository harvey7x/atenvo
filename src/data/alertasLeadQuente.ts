import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { WA_REAL } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Alerta de LEAD QUENTE (abandono do fluxo do bot) — camada de dados.
   O vigia (cron no banco) cria a linha em alertas_lead_quente; aqui a
   aba WhatsApp assina o Realtime num canal PRÓPRIO (`v2-alerta-lq-`,
   mesmo padrão do useNotificacaoInbound: não colide com o canal da
   lista) e expõe a fila de pendentes + assumir/dispensar via RPC.
   Claim é atômico no banco: quem perde recebe o nome de quem levou.
   ------------------------------------------------------------------ */

export interface AlertaLeadQuente {
  id: string;
  conversaId: string;
  contatoNome: string;
  contatoTelefone: string | null;
  passo: string | null;
  abandonadoEm: string;   // última mensagem do cliente — base do cronômetro
}

export type ResultadoAssumir =
  | { ok: true; conversaId: string }
  | { ok: false; motivo: 'ja_assumido'; porNome: string }
  | { ok: false; motivo: 'cancelado' }
  | { ok: false; motivo: 'erro' };

interface LinhaAlerta {
  id: string; conversa_id: string; passo: string | null; abandonado_em: string;
  contatos: { nome: string | null; telefone: string | null } | null;
}

function mapAlerta(l: LinhaAlerta): AlertaLeadQuente {
  return {
    id: l.id, conversaId: l.conversa_id, passo: l.passo, abandonadoEm: l.abandonado_em,
    contatoNome: (l.contatos?.nome ?? '').trim() || 'Lead sem nome',
    contatoTelefone: l.contatos?.telefone ?? null,
  };
}

/** Onde o lead parou, em linguagem de gente (passo_botoes do bot). */
export function rotuloPasso(passo: string | null): string {
  switch (passo) {
    case 'aguardando_abertura': return 'Não tocou nos botões da abertura';
    case 'ask_nome': return 'Parou antes de informar o nome';
    case 'ask_cpf': return 'Parou na etapa do CPF';
    case 'suporte_menu':
    case 'suporte_resumo': return 'Parou no fluxo de suporte';
    default: return passo ? `Parou em "${passo}"` : 'Parou no início do fluxo';
  }
}

/** Texto FIXO da mensagem automática do assumir (decisão do dono: sem variação). */
export function mensagemAssumir(primeiroNome: string): string {
  const nome = primeiroNome.trim();
  return `Olá! Aqui é ${nome ? `${nome}, ` : ''}da equipe da CAF. Para facilitar, vou te ligar agora mesmo e conversamos melhor por telefone, tudo bem?`;
}

export function useAlertasLeadQuente() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  const [fila, setFila] = useState<AlertaLeadQuente[]>([]);

  const recarregar = useCallback(async () => {
    if (!WA_REAL || !supabase || !orgId) return;
    const { data, error } = await supabase
      .from('alertas_lead_quente')
      .select('id, conversa_id, passo, abandonado_em, contatos(nome, telefone)')
      .eq('organizacao_id', orgId)
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true });
    if (!error) setFila(((data ?? []) as unknown as LinhaAlerta[]).map(mapAlerta));
  }, [orgId]);

  useEffect(() => {
    if (!WA_REAL || !supabase || !orgId) return;
    void recarregar();
    const ch = supabase
      .channel(`v2-alerta-lq-${orgId}`)
      // INSERT não traz o embed do contato → recarrega; UPDATE (assumido/cancelado) idem —
      // a fila pendente é pequena, o refetch é barato e mantém todos os painéis em sincronia.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_lead_quente', filter: `organizacao_id=eq.${orgId}` }, () => {
        void recarregar();
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('[alerta-lq] realtime recusado:', err?.message);
      });
    // cinto de segurança: se o realtime cair, o painel ainda enxerga em <=60s
    const tick = window.setInterval(() => void recarregar(), 60_000);
    return () => { window.clearInterval(tick); void supabase?.removeChannel(ch); };
  }, [orgId, recarregar]);

  const assumir = useCallback(async (alertaId: string): Promise<ResultadoAssumir> => {
    if (!supabase) return { ok: false, motivo: 'erro' };
    const { data, error } = await supabase.rpc('alerta_lead_quente_assumir', { p_alerta: alertaId });
    if (error) return { ok: false, motivo: 'erro' };
    const r = (Array.isArray(data) ? data[0] : data) as
      { ok: boolean; status: string; assumido_por_nome: string | null; conversa_id: string } | undefined;
    if (!r) return { ok: false, motivo: 'erro' };
    if (r.ok) return { ok: true, conversaId: r.conversa_id };
    if (r.status === 'assumido') return { ok: false, motivo: 'ja_assumido', porNome: (r.assumido_por_nome ?? '').trim() || 'outro atendente' };
    return { ok: false, motivo: 'cancelado' };
  }, []);

  const dispensar = useCallback(async (alertaId: string) => {
    if (!supabase) return;
    await supabase.rpc('alerta_lead_quente_dispensar', { p_alerta: alertaId });
    setFila((cur) => cur.filter((a) => a.id !== alertaId));
  }, []);

  return { fila, assumir, dispensar, recarregar };
}
