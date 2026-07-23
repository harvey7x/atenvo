-- Bloco 0 — CHAVE CANÔNICA DE TELEFONE na ingestão.
--
-- PROBLEMA (medido, não hipotético): Evolution/Baileys entrega o MESMO cliente ora como
-- 55+DDD+8 (sem o nono dígito) ora como 55+DDD+9. O webhook casava por igualdade EXATA de
-- valor_normalizado, então a segunda forma virava CONTATO NOVO. Em 23/07/2026: 14 grupos /
-- 29 contatos duplicados por essa causa (inclusive clientes com conversa viva e oportunidade
-- aberta). A WhatsApp Cloud API entra pela mesma porta e multiplicaria o problema.
--
-- SOLUÇÃO: resolver o contato pela chave já existente chave_canonica_telefone() (DDD + últimos
-- 8), que colapsa as duas formas. NÃO altera valor_normalizado — é ele que vira o destino do
-- envio, e mexer nele mudaria o número discado.

-- 1) Chave canônica materializada + índices de busca.
alter table public.contato_identidades
  add column if not exists chave_canonica text
  generated always as (public.chave_canonica_telefone(valor_normalizado)) stored;

create index if not exists idx_identidades_chave_canonica
  on public.contato_identidades (organizacao_id, tipo, chave_canonica)
  where chave_canonica is not null;

-- O fallback da resolução também casa contatos.telefone -> índice por expressão.
create index if not exists idx_contatos_chave_canonica
  on public.contatos (organizacao_id, (public.chave_canonica_telefone(telefone)))
  where telefone is not null;

-- Desempate por atividade (critério 3 da RPC) sem varrer conversas.
create index if not exists idx_conversas_contato_atividade
  on public.conversas (contato_id, ultima_interacao_em desc);

-- ATENÇÃO deliberada: NÃO criamos índice ÚNICO na chave canônica. Os 29 contatos duplicados
-- atuais fariam esta migration FALHAR, e o merge é frente à parte (vinculo_imutavel/cobrança).
-- O unique entra depois do mutirão.

-- 2) Resolução única, usada pelos DOIS webhooks (evolution e, no Bloco 2, cloud_api).
create or replace function public.wa_resolver_contato_por_numero(p_org uuid, p_numero text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_chave text; v_contato uuid; v_mesclado uuid;
begin
  v_chave := public.chave_canonica_telefone(p_numero);
  if v_chave is null then return null; end if;

  -- (a) identidade WhatsApp pela chave canônica.
  --
  -- DESEMPATE — a ordem importa e foi validada contra os 14 grupos reais:
  --  1. não-mesclado          nunca ressuscita um contato já mesclado
  --  2. TEM MENSAGEM          conversas.ultima_interacao_em é preenchida na CRIAÇÃO da conversa,
  --                           então contato importado com 0 mensagens parece "recente" e roubaria
  --                           a thread real (caso ANIRLEI 0 msgs/10-07 x 7 msgs/30-06). EXISTS é
  --                           barato (idx_mensagens_conversa), não é count().
  --  3. atividade DESC        segue ONDE O HUMANO ESTÁ TRABALHANDO. Preferir o mais ANTIGO
  --                           mataria a conversa viva e abriria uma vazia no lugar — pior que a
  --                           duplicata que estamos consertando.
  --  4-6. principal, criado_em, id  determinismo: dois eventos simultâneos escolhem o MESMO
  --                           contato; sem isso o webhook faria split-brain sob concorrência.
  select c.id, c.mesclado_para into v_contato, v_mesclado
  from public.contato_identidades ci
  join public.contatos c on c.id = ci.contato_id
  where ci.organizacao_id = p_org
    and ci.tipo = 'whatsapp'
    and ci.chave_canonica = v_chave
  order by
    (c.mesclado_para is null) desc,
    exists (select 1 from public.conversas cv
            join public.mensagens m on m.conversa_id = cv.id
            where cv.contato_id = c.id) desc,
    (select max(cv.ultima_interacao_em) from public.conversas cv
     where cv.contato_id = c.id) desc nulls last,
    ci.principal desc, ci.criado_em asc, ci.id asc
  limit 1;

  -- (b) fallback: telefone do CRM pela mesma chave (contato criado à mão, sem identidade).
  if v_contato is null then
    select c.id, c.mesclado_para into v_contato, v_mesclado
    from public.contatos c
    where c.organizacao_id = p_org
      and public.chave_canonica_telefone(c.telefone) = v_chave
    order by
      (c.mesclado_para is null) desc,
      exists (select 1 from public.conversas cv
              join public.mensagens m on m.conversa_id = cv.id
              where cv.contato_id = c.id) desc,
      (select max(cv.ultima_interacao_em) from public.conversas cv
       where cv.contato_id = c.id) desc nulls last,
      c.criado_em asc, c.id asc
    limit 1;
  end if;

  -- contato já mesclado -> devolve o alvo do merge (nunca ressuscita o mesclado).
  return coalesce(v_mesclado, v_contato);
end $$;

-- P0 (auditoria de segurança 2026-07-15): RPC interna NÃO é executável por anon/authenticated.
revoke all on function public.wa_resolver_contato_por_numero(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_resolver_contato_por_numero(uuid, text) to service_role;
