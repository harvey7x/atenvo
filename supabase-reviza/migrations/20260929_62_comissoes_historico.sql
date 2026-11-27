-- ============================================================================
-- Reviza · mig 62 — HISTÓRICO da % de comissão (dono 29/09, via Matheus: "pode mudar")
--
-- Regra de 29/09: na planilha entra o LÍQUIDO DO ESCRITÓRIO; a parte do comercial
-- sai dele pela % do comercial (parte = líquido × % ÷ (100 − %); 50% = igual).
-- Sem histórico, mudar a % de alguém recalculava também os meses JÁ PAGOS.
-- Agora cada % tem o mês a partir do qual vale ("desde", 'AAAA-MM'); o mês pago usa
-- a % da época. `comissoes.pct` continua sendo a % ATUAL (previsão, telas, auditoria).
--
-- · comissoes_hist(comercial, desde, pct) — pontos de mudança; leitura igual à de
--   `comissoes` (comercial só a própria; financeiro+ todas); escrita SÓ pelas RPCs.
-- · comissao_definir(comercial, pct, desde) — gestor/admin: vale de `desde` em diante
--   (apaga mudanças posteriores); quem nunca teve histórico ganha a linha de base
--   '2000-01' com a % que valia até então (a configurada ou o padrão 50).
-- · comissao_restaurar(comercial, hist jsonb, pct) — o Desfazer: devolve o histórico
--   e a % atual exatamente como estavam (pct null = sem % configurada).
-- Nenhum dado de pagamento é tocado.
-- ============================================================================

create table if not exists public.comissoes_hist (
  comercial   text not null,
  desde       text not null check (desde ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  pct         numeric(5,2) not null check (pct >= 0 and pct <= 100),
  criado_por  uuid references public.profiles(id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now(),
  primary key (comercial, desde)
);
alter table public.comissoes_hist enable row level security;
drop policy if exists comissoes_hist_sel on public.comissoes_hist;
create policy comissoes_hist_sel on public.comissoes_hist for select to authenticated
  using (public.is_at_least('financeiro') or upper(trim(comercial)) = upper(trim(coalesce(public.meu_nome(), ''))));
revoke all on public.comissoes_hist from anon;
grant select on public.comissoes_hist to authenticated;

-- linha de base de quem JÁ tem % configurada: vale desde sempre (é a % que os meses pagos usaram até hoje)
insert into public.comissoes_hist (comercial, desde, pct, criado_por)
select upper(btrim(comercial)), '2000-01', pct, updated_by from public.comissoes
on conflict (comercial, desde) do nothing;

create or replace function public.comissao_definir(p_comercial text, p_pct numeric, p_desde text)
  returns void language plpgsql security definer set search_path = ''
as $$
declare v_nome text := upper(btrim(coalesce(p_comercial, ''))); v_atual numeric;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'A porcentagem precisa estar entre 0 e 100.' using errcode = '22023'; end if;
  if p_desde is null or p_desde !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido (AAAA-MM).' using errcode = '22023'; end if;
  -- quem nunca teve histórico: a % que valia até agora vira a linha de base
  if not exists (select 1 from public.comissoes_hist where comercial = v_nome) then
    select pct into v_atual from public.comissoes where upper(btrim(comercial)) = v_nome;
    insert into public.comissoes_hist (comercial, desde, pct) values (v_nome, '2000-01', coalesce(v_atual, 50));
  end if;
  -- a nova % vale de p_desde EM DIANTE
  delete from public.comissoes_hist where comercial = v_nome and desde >= p_desde;
  insert into public.comissoes_hist (comercial, desde, pct) values (v_nome, p_desde, round(p_pct, 2));
  -- % atual (previsão/telas); o gatilho de auditoria da tabela registra a mudança
  insert into public.comissoes (comercial, pct) values (v_nome, round(p_pct, 2))
  on conflict (comercial) do update set pct = excluded.pct;
end $$;
revoke all on function public.comissao_definir(text, numeric, text) from public, anon;
grant execute on function public.comissao_definir(text, numeric, text) to authenticated;

create or replace function public.comissao_restaurar(p_comercial text, p_hist jsonb, p_pct numeric)
  returns void language plpgsql security definer set search_path = ''
as $$
declare v_nome text := upper(btrim(coalesce(p_comercial, ''))); x jsonb;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if p_hist is not null and jsonb_typeof(p_hist) <> 'array' then raise exception 'histórico inválido' using errcode = '22023'; end if;
  delete from public.comissoes_hist where comercial = v_nome;
  for x in select * from jsonb_array_elements(coalesce(p_hist, '[]'::jsonb)) loop
    if coalesce(x->>'desde', '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'mês inválido no histórico' using errcode = '22023'; end if;
    insert into public.comissoes_hist (comercial, desde, pct) values (v_nome, x->>'desde', round((x->>'pct')::numeric, 2))
    on conflict (comercial, desde) do update set pct = excluded.pct;
  end loop;
  if p_pct is null then
    delete from public.comissoes where upper(btrim(comercial)) = v_nome;
  else
    insert into public.comissoes (comercial, pct) values (v_nome, round(p_pct, 2))
    on conflict (comercial) do update set pct = excluded.pct;
  end if;
end $$;
revoke all on function public.comissao_restaurar(text, jsonb, numeric) from public, anon;
grant execute on function public.comissao_restaurar(text, jsonb, numeric) to authenticated;
