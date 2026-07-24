-- CORREÇÃO — bot_remarketing_due não devolvia organizacao_id, e o worker precisa dela.
--
-- Com a resolução do canal no envio, o worker chama wa_canal_disparo(org). A org vinha de
-- `row.organizacao_id`, que a RPC NUNCA devolveu — o retorno era
--   TABLE(id, oportunidade_id, conversa_id, contato_id, canal_id, toque, criado_em)
-- Resultado: org = undefined -> wa_canal_disparo(null) -> null -> 'sem_canal_disparo'.
--
-- O desfecho parecia CERTO ("não enviou, marcou sem_canal_disparo"), mas pelo motivo ERRADO: a
-- função de resolução nunca era consultada de verdade. E o audit_log ficava vazio, porque o
-- insert ia com organizacao_id null. O sintoma só apareceu rodando o worker e conferindo o log —
-- a resposta HTTP sozinha teria passado por prova boa.
--
-- Antes a org era obtida de canais.organizacao_id (via o canal congelado da fila). Como o canal
-- congelado deixou de ser lido, a org tem que vir da própria fila — que é onde ela mora
-- (bot_remarketing.organizacao_id, NOT NULL desde a criação da tabela).

-- Mudar o retorno exige DROP: create or replace não altera assinatura de retorno.
drop function if exists public.bot_remarketing_due(int);

create or replace function public.bot_remarketing_due(p_limit integer default 50)
 returns table (id uuid, organizacao_id uuid, oportunidade_id uuid, conversa_id uuid,
                contato_id uuid, canal_id uuid, toque integer, criado_em timestamptz)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select br.id, br.organizacao_id, br.oportunidade_id, br.conversa_id, br.contato_id,
         br.canal_id, br.toque, br.criado_em
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  join public.funil_colunas c on c.id = o.coluna_id and c.nome = 'REMARKETING' and c.arquivada = false
  join public.conversas cv on cv.id = br.conversa_id
  left join public.bot_conversa_estado bce on bce.conversa_id = br.conversa_id
  where br.status = 'ativo'
    and br.proximo_em is not null
    and br.proximo_em <= now()
    -- 1 toque por opp por dia (SP)
    and (br.ultimo_toque_em is null
         or (timezone('America/Sao_Paulo', now()))::date <> (timezone('America/Sao_Paulo', br.ultimo_toque_em))::date)
    -- travas de humano/pausa
    and coalesce(bce.pausado, false) = false
    and coalesce(cv.precisa_humano, false) = false
    and cv.atendente_id is null
    and not exists (select 1 from public.contatos ct where ct.id = br.contato_id and ct.responsavel_id is not null)
    -- precisa de destino whatsapp (a Cloud API não tem onWhatsApp: sem inbound registrado, não dispara)
    and exists (
      select 1 from public.contato_identidades ci
      where ci.contato_id = br.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
    )
  order by br.proximo_em asc
  limit greatest(p_limit, 0);
$function$;

revoke all on function public.bot_remarketing_due(int) from public, anon, authenticated;
grant execute on function public.bot_remarketing_due(int) to service_role;
