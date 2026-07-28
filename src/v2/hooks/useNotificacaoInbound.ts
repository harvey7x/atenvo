import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { WA_REAL, mascararNumero } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';
import { CURR_KEY } from './useInboxWhatsApp';
import type { DadosNotificacao } from '../shell/NotificacaoResposta';

/* ------------------------------------------------------------------
   Notificação realtime do shell v2 (dívida da sessão 1b) — liga o
   toast ao feed postgres_changes JÁ USADO pelo app (mesmas tabelas e
   filtros de useWaConversations; zero infra nova de backend). Canal
   próprio `v2-notif-<org>` para não colidir com o tópico da lista.
   Regras: só INSERT de mensagem de CLIENTE (direcao='entrada', nunca
   sistema/nota interna); suprime quando a conversa está aberta na
   página do WhatsApp com a janela focada; badge com pulso via
   aoBadge; "Ver conversa" navega com deep-link ?conversa=.
   ------------------------------------------------------------------ */

interface LinhaMensagem {
  id?: string;
  conversa_id?: string;
  direcao?: string;
  origem?: string | null;
  tipo?: string;
  conteudo?: string | null;
  metadados?: { seconds?: number | null } | null;
}

const ORIGENS_SILENCIOSAS = new Set(['sistema', 'nota_interna', 'teste_entrega']);

function previewDe(m: LinhaMensagem): string {
  if (m.conteudo?.trim()) return m.conteudo.trim();
  const s = m.metadados?.seconds;
  if (m.tipo === 'audio') return `Mensagem de voz${s ? ` (${Math.floor(s / 60)}:${('0' + Math.floor(s % 60)).slice(-2)})` : ''}`;
  if (m.tipo === 'imagem') return 'Imagem';
  if (m.tipo === 'video') return 'Vídeo';
  if (m.tipo === 'documento') return 'Documento';
  return 'Mensagem';
}

export function useNotificacaoInbound(opts: {
  aoNotificar: (dados: Omit<DadosNotificacao, 'seq'> & { conversaId: string }) => void;
  aoBadge: () => void;
}) {
  const { currentOrg } = useOrg();
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    if (!WA_REAL || !supabase || !currentOrg.id) return;
    const orgId = currentOrg.id;
    const ch = supabase
      .channel(`v2-notif-${orgId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `organizacao_id=eq.${orgId}` }, async (payload) => {
        const m = (payload.new ?? {}) as LinhaMensagem;
        // só mensagem de CLIENTE — nunca saída, sistema, nota interna ou teste
        if (m.direcao !== 'entrada') return;
        if (m.origem && ORIGENS_SILENCIOSAS.has(m.origem)) return;
        if (!m.conversa_id) return;
        // conversa aberta E janela focada na página do WhatsApp → sem toast (o inbox já mostra)
        const naPagina = window.location.pathname.startsWith('/whatsapp');
        let abertaId: string | null = null;
        try { abertaId = sessionStorage.getItem(CURR_KEY); } catch { /* privado */ }
        const focada = document.visibilityState === 'visible' && document.hasFocus();
        // conversa aberta E focada → o inbox já mostra: nem toast nem badge
        if (naPagina && focada && abertaId === m.conversa_id) return;
        cb.current.aoBadge();
        // identifica quem falou (leitura leve na MESMA tabela que a lista já consulta)
        let quem = 'Cliente';
        let fonte = 'WhatsApp';
        try {
          const { data } = await supabase!
            .from('conversas')
            .select('contatos!inner(nome, telefone), canais!conversas_canal_id_fkey(nome_interno)')
            .eq('id', m.conversa_id)
            .single();
          const c = data as { contatos?: { nome?: string | null; telefone?: string | null } | { nome?: string | null; telefone?: string | null }[]; canais?: { nome_interno?: string | null } | { nome_interno?: string | null }[] } | null;
          const ct = Array.isArray(c?.contatos) ? c?.contatos[0] : c?.contatos;
          const ca = Array.isArray(c?.canais) ? c?.canais[0] : c?.canais;
          const nome = ct?.nome?.trim();
          quem = nome && !/^[\d\s()+\-]+$/.test(nome) ? nome : ct?.telefone ? mascararNumero(ct.telefone) : 'Cliente sem nome';
          if (ca?.nome_interno) fonte = `WhatsApp · ${ca.nome_interno}`;
        } catch { /* melhor esforço: notifica mesmo sem o nome */ }
        const iniciais = quem.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
        cb.current.aoNotificar({ iniciais, quem, mensagem: previewDe(m), fonte, quando: 'agora', conversaId: m.conversa_id });
      })
      .subscribe();
    return () => { void supabase!.removeChannel(ch); };
  }, [currentOrg.id]);
}
