-- Higiene obrigatória da conversa — registro de adiamentos do preenchimento do nome.
--
-- Contexto (auditoria comercial 2026-07): 49% dos contatos estão salvos como número de
-- telefone ou só com o primeiro nome. A regra progressiva do front permite 2 adiamentos
-- POR CONVERSA e depois torna o preenchimento obrigatório; "cliente ainda não informou"
-- libera por 24h. Esta tabela é a memória desses adiamentos.
--
-- Por que uma tabela nova (e não `usuario_preferencias`): o adiamento é POR CONVERSA, não
-- por usuário — senão cada atendente ganharia 2 passes novos na mesma conversa.
-- Por que não `conversa_atividades`: aquela tabela é a timeline do atendimento (não tem
-- expiração e não deve ser poluída), e não aceita INSERT do cliente.
--
-- Mínima de propósito: sem `resolvido_em` (resolver = o nome ficar bom, é derivável do
-- cadastro) e sem `contato_id` (deriva da conversa).

create table if not exists public.conversa_higiene_adiamentos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id     uuid not null references public.conversas(id)    on delete cascade,
  -- 'nome_adiado'        : clicou em "Lembrar depois" (conta para o limite de 2)
  -- 'nome_nao_informado' : marcou que o cliente ainda não disse o nome (libera até adiar_ate)
  tipo            text not null check (tipo in ('nome_adiado','nome_nao_informado')),
  usuario_id      uuid references public.usuarios(id),
  criado_em       timestamptz not null default now(),
  -- só para 'nome_nao_informado'. 'nome_adiado' não expira: é contagem.
  adiar_ate       timestamptz
);

comment on table public.conversa_higiene_adiamentos is
  'Adiamentos do preenchimento de nome por conversa (higiene). Cada linha é um clique do atendente — o histórico fica visível: quem adia sempre aparece.';

create index if not exists cha_conversa_idx on public.conversa_higiene_adiamentos (conversa_id, tipo, criado_em desc);
create index if not exists cha_org_idx      on public.conversa_higiene_adiamentos (organizacao_id, criado_em desc);

alter table public.conversa_higiene_adiamentos enable row level security;

-- Leitura: membro da organização (o front precisa contar adiamentos e ver a liberação).
drop policy if exists cha_sel on public.conversa_higiene_adiamentos;
create policy cha_sel on public.conversa_higiene_adiamentos
  for select using (is_platform_admin() or is_member(organizacao_id));

-- Escrita: SOMENTE via RPC security definer (mesmo padrão de conversa_atividades).
-- Sem policy de insert/update/delete => cliente não escreve direto.
revoke insert, update, delete on public.conversa_higiene_adiamentos from anon, authenticated;
grant select on public.conversa_higiene_adiamentos to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: registra um adiamento. Valida vínculo ativo na org DONA DA CONVERSA
-- (nunca confia em organizacao_id vindo do cliente) e devolve o estado atualizado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.higiene_registrar_adiamento(
  p_conversa uuid,
  p_tipo     text
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_org        uuid;
  v_ate        timestamptz;
  v_adiamentos int;
  v_liberado   timestamptz;
begin
  if p_tipo not in ('nome_adiado','nome_nao_informado') then
    raise exception 'tipo_invalido' using hint = 'use nome_adiado ou nome_nao_informado';
  end if;

  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;

  -- autorização: membro ATIVO da org da conversa (nunca por parâmetro do cliente)
  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then
    raise exception 'sem_acesso';
  end if;

  if p_tipo = 'nome_nao_informado' then
    v_ate := now() + interval '24 hours';
  end if;

  insert into public.conversa_higiene_adiamentos (organizacao_id, conversa_id, tipo, usuario_id, adiar_ate)
  values (v_org, p_conversa, p_tipo, auth.uid(), v_ate);

  select count(*) into v_adiamentos
    from public.conversa_higiene_adiamentos
   where conversa_id = p_conversa and tipo = 'nome_adiado';

  select max(adiar_ate) into v_liberado
    from public.conversa_higiene_adiamentos
   where conversa_id = p_conversa and tipo = 'nome_nao_informado' and adiar_ate > now();

  return jsonb_build_object('ok', true, 'adiamentos', v_adiamentos, 'liberado_ate', v_liberado);
end $fn$;

-- Fecha o vetor anon (padrão da Etapa A de segurança): só usuário autenticado executa.
revoke execute on function public.higiene_registrar_adiamento(uuid, text) from public, anon;
grant  execute on function public.higiene_registrar_adiamento(uuid, text) to authenticated;
