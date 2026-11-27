-- Distribuição automática de leads sem dono (pedido do dono 2026-08-18).
--
-- Regra: lead (conversa) que completa 20 min sem atendente é distribuído
-- automaticamente — inclusive quando o lead nunca respondeu. Roda todo dia,
-- fim de semana incluso.
--
-- Desenho (aprovado): o fecho do bot continua sendo o caminho preferencial de
-- roteamento (gênero + placar via bot_rotear_consultor). Este varredor é a rede:
-- pega quem abandonou/não respondeu e chama a MESMA RPC — uma única fonte de
-- roteamento, placar do dia e teto +3 valem para os dois caminhos. Gênero vai
-- como 'ambiguo' (lead que não avançou não declarou nome) → menor placar.
--
-- Guardas:
--  * janela de 24h: NÃO tocar no estoque histórico de conversas sem dono — a
--    primeira rodada despejaria centenas de conversas mortas no placar;
--  * carência (20 min): dá tempo do bot trabalhar e do fecho rotear com gênero;
--  * NÃO pausa o bot: lead que responder depois segue no fluxo; no fecho a trava
--    de dono da RPC reconhece a atribuição e não re-roteia;
--  * contato que JÁ tem responsavel_id só é ressincronizado (o dono antigo vale;
--    sem RPC = sem sujar o placar);
--  * atribuição pelo caminho canônico: contatos.responsavel_id, que o trigger
--    trg_sync_responsavel_cliente propaga p/ conversas + oportunidades.

create or replace function public.distribuir_leads_sem_dono(
  p_carencia_min int default 20,
  p_janela_horas int default 24,
  p_max int default 50
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_resp uuid;
  v_consultor uuid;
  v_distribuidos int := 0;
  v_ressinc int := 0;
begin
  for r in
    select c.id, c.contato_id
    from conversas c
    where c.atendente_id is null
      and c.arquivada_em is null
      and c.contato_id is not null
      and c.criado_em <= now() - make_interval(mins => p_carencia_min)
      and c.criado_em >= now() - make_interval(hours => p_janela_horas)
    order by c.criado_em
    limit p_max
  loop
    select ct.responsavel_id into v_resp from contatos ct where ct.id = r.contato_id;

    if v_resp is not null then
      -- contato já tem dono e a conversa ficou para trás: só ressincroniza.
      update conversas set atendente_id = v_resp
       where id = r.id and atendente_id is null;
      v_ressinc := v_ressinc + 1;
      continue;
    end if;

    select rot.consultor_id into v_consultor
      from public.bot_rotear_consultor(r.id, 'ambiguo') rot;

    if v_consultor is not null then
      update contatos set responsavel_id = v_consultor where id = r.contato_id;
      v_distribuidos := v_distribuidos + 1;
    end if;
  end loop;

  return jsonb_build_object('distribuidos', v_distribuidos, 'ressincronizados', v_ressinc);
end $$;

comment on function public.distribuir_leads_sem_dono(int, int, int) is
  'Varredor: lead sem atendente há p_carencia_min (janela p_janela_horas) é distribuído via bot_rotear_consultor (gênero ambiguo). Cron a cada 5 min.';

revoke all on function public.distribuir_leads_sem_dono(int, int, int) from public, authenticated;
grant execute on function public.distribuir_leads_sem_dono(int, int, int) to service_role;

select cron.unschedule('distribuir-leads-sem-dono')
where exists (select 1 from cron.job where jobname = 'distribuir-leads-sem-dono');

select cron.schedule(
  'distribuir-leads-sem-dono',
  '*/5 * * * *',
  $job$ select public.distribuir_leads_sem_dono(20, 24, 50); $job$
);
