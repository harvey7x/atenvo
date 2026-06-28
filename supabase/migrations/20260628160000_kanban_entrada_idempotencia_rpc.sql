-- Integração Kanban × canais: coluna técnica de entrada, idempotência e RPC.
-- Não altera RLS/policies existentes. Tudo idempotente onde possível.

-- pré-checagem: aborta se houver oportunidade aberta duplicada (não deve haver)
do $$ begin
  if exists (select 1 from (select organizacao_id, contato_id, funil_id from public.oportunidades
             where status = 'em_andamento' and contato_id is not null group by 1, 2, 3 having count(*) > 1) d)
  then raise exception 'Oportunidades abertas duplicadas — abortar antes do indice unico'; end if;
end $$;

-- 1) coluna técnica de entrada (identificação por propriedade, não pelo nome)
alter table public.funil_colunas add column entrada boolean not null default false;

-- 2) backfill: exatamente uma coluna de entrada ativa por funil, em ordem 0
--    (a) funil com colunas: marca a ativa de menor ordem (mais antiga) como entrada
with alvo as (
  select distinct on (funil_id) id from public.funil_colunas where not arquivada
  order by funil_id, ordem asc, criado_em asc)
update public.funil_colunas c set entrada = true, ordem = 0
  from alvo a
 where c.id = a.id
   and not exists (select 1 from public.funil_colunas e where e.funil_id = c.funil_id and e.entrada);
--    (b) funil sem nenhuma coluna: cria "Novo lead" como entrada
insert into public.funil_colunas (organizacao_id, funil_id, nome, cor, ordem, entrada)
select f.organizacao_id, f.id, 'Novo lead', '#3b82f6', 0, true
  from public.funis f
 where not exists (select 1 from public.funil_colunas c where c.funil_id = f.id);

-- 3) exatamente uma coluna de entrada ativa por funil
create unique index uq_coluna_entrada on public.funil_colunas(funil_id) where entrada and not arquivada;

-- 4) idempotência: uma oportunidade aberta por contato/funil
create unique index uq_oport_aberta_contato_funil
  on public.oportunidades(organizacao_id, contato_id, funil_id)
  where status = 'em_andamento' and contato_id is not null;

-- 5) proteção server-side da coluna de entrada (rename/cor liberados; resto bloqueado)
create or replace function public.fn_protege_coluna_entrada()
  returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if OLD.entrada then raise exception 'coluna_entrada_protegida: nao e possivel excluir a coluna de entrada'; end if;
    return OLD;
  end if;
  if OLD.entrada then
    if NEW.entrada is distinct from true then raise exception 'coluna_entrada_protegida: nao e possivel remover a flag de entrada'; end if;
    if NEW.arquivada then raise exception 'coluna_entrada_protegida: nao e possivel arquivar a coluna de entrada'; end if;
    if NEW.ordem <> 0 then raise exception 'coluna_entrada_protegida: a coluna de entrada deve permanecer em ordem 0'; end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_protege_coluna_entrada on public.funil_colunas;
create trigger trg_protege_coluna_entrada before update or delete on public.funil_colunas
  for each row execute function public.fn_protege_coluna_entrada();

-- 6) RPC idempotente (org derivada do contato; nunca aceita org do frontend)
create or replace function public.garantir_oportunidade_entrada(
  p_contato uuid, p_funil uuid, p_origem text default null, p_conversa uuid default null, p_canal uuid default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_col uuid; v_id uuid; v_resp uuid; v_tags text[];
begin
  select organizacao_id, etiquetas into v_org, v_tags from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  -- chamadas autenticadas precisam ser membros; service_role (auth.uid() null) é backend confiável
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  perform 1 from public.funis where id = p_funil and organizacao_id = v_org and not arquivado;
  if not found then raise exception 'funil_invalido'; end if;
  select id into v_col from public.funil_colunas
    where funil_id = p_funil and organizacao_id = v_org and entrada and not arquivada limit 1;
  if v_col is null then raise exception 'sem_coluna_entrada'; end if;
  -- atendente herdado da conversa (quando informada)
  if p_conversa is not null then
    select atendente_id into v_resp from public.conversas where id = p_conversa and organizacao_id = v_org;
  end if;
  -- já aberta? retorna a existente
  select id into v_id from public.oportunidades
    where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  if v_id is not null then return v_id; end if;
  -- cria (protegido pelo índice parcial; concorrência: on conflict do nothing + re-select)
  insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, conversa_origem_id, canal_origem_id,
      responsavel_id, origem, status, etiquetas, tipo_servico, status_cancelamento, status_ressarcimento, ordem)
    values (v_org, p_contato, p_funil, v_col, p_conversa, p_canal, v_resp, p_origem, 'em_andamento',
      coalesce(v_tags, '{}'), 'analise_inicial', 'nao_se_aplica', 'nao_se_aplica', 0)
    on conflict (organizacao_id, contato_id, funil_id) where (status = 'em_andamento' and contato_id is not null) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.oportunidades
      where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  end if;
  return v_id;
end $$;
revoke all on function public.garantir_oportunidade_entrada(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.garantir_oportunidade_entrada(uuid, uuid, text, uuid, uuid) to authenticated, service_role;

comment on column public.funil_colunas.entrada is 'Coluna técnica de entrada do funil (recebe leads novos dos canais). Única por funil, ordem 0, protegida por trigger trg_protege_coluna_entrada.';
comment on function public.garantir_oportunidade_entrada is 'Cria (idempotente) a oportunidade aberta do contato na coluna de entrada do funil. Org derivada do contato; herda atendente/etiquetas; usada por webhooks (service_role) e frontend (membro).';
