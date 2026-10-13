-- ============================================================================
-- PORTABILIDADES (13/10/2026, pedido do dono)
-- Aba que acompanha o cliente na portabilidade. Entra com o VALOR QUE O CLIENTE VAI
-- RECEBER; 30% vai para o escritório e, DENTRO desses 30%, 15% vai para o atendente.
-- Depois a equipe marca: aceite → desbloqueio do benefício → link enviado/feito →
-- concluída. Tudo fica num histórico (com as anotações da equipe).
--
-- Leitura direta com RLS por org; escrita SÓ por RPC. A divisão é calculada AQUI
-- (port_dividir) e gravada na linha — a tela usa a mesma regra só para a prévia do
-- valor digitado (src/data/portabilidades.ts, REGRA_DIVISAO). Mudou uma, muda a outra.
-- Nada aqui envia mensagem nem mexe em contato, conversa ou Kanban.
-- ============================================================================

-- ---------------------------------------------------------------- tabelas
create table if not exists public.portabilidades (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  contato_id       uuid not null references public.contatos(id),
  atendente_id     uuid not null references public.usuarios(id),
  -- centavos
  valor_cliente    bigint not null check (valor_cliente > 0 and valor_cliente <= 99999999999),
  valor_escritorio bigint not null check (valor_escritorio >= 0),
  valor_atendente  bigint not null check (valor_atendente >= 0),
  -- a regra usada na hora (se mudar, as antigas não mudam sozinhas)
  pct_escritorio   numeric(5,2) not null,
  pct_atendente    numeric(5,2) not null,
  aceite           text not null default 'aguardando' check (aceite in ('aguardando','aceitou','recusou')),
  aceite_em        timestamptz,
  desbloqueado_em  timestamptz,
  link_enviado_em  timestamptz,
  link_feito_em    timestamptz,
  concluida_em     timestamptz,
  criado_por       uuid,
  -- "Tirar da aba" não apaga: some da tela e fica aqui
  excluida_em      timestamptz,
  excluida_por     uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists portabilidades_org on public.portabilidades (organizacao_id) where excluida_em is null;
create index if not exists portabilidades_contato on public.portabilidades (contato_id);

create table if not exists public.portabilidades_eventos (
  id               bigint generated always as identity primary key,
  portabilidade_id uuid not null references public.portabilidades(id) on delete cascade,
  organizacao_id   uuid not null,
  quando           timestamptz not null default now(),
  tipo             text not null check (tipo in ('sistema','nota','concluida')),
  texto            text not null check (length(texto) between 1 and 500),
  autor_id         uuid
);
create index if not exists portabilidades_eventos_port on public.portabilidades_eventos (portabilidade_id, quando);

-- ---------------------------------------------------------------- RLS (leitura direta; escrita por RPC)
alter table public.portabilidades         enable row level security;
alter table public.portabilidades_eventos enable row level security;

drop policy if exists port_sel on public.portabilidades;
create policy port_sel on public.portabilidades for select to authenticated using (public.is_member(organizacao_id));
drop policy if exists port_ev_sel on public.portabilidades_eventos;
create policy port_ev_sel on public.portabilidades_eventos for select to authenticated using (public.is_member(organizacao_id));

revoke all on public.portabilidades, public.portabilidades_eventos from anon, authenticated;
grant select on public.portabilidades, public.portabilidades_eventos to authenticated;
grant all on public.portabilidades, public.portabilidades_eventos to service_role;

-- ---------------------------------------------------------------- helpers
create or replace function public.port_exigir_membro(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_org is null or not (public.is_platform_admin() or public.is_member(p_org)) then raise exception 'sem_acesso'; end if;
end $$;

/* A REGRA (dono, 13/10): 30% do valor do cliente para o escritório; 15% desses 30% para o atendente.
   Arredonda ao centavo como a tela (Math.round = meio para cima, valores positivos). */
create or replace function public.port_dividir(p_valor bigint,
  out escritorio bigint, out atendente bigint, out pct_escritorio numeric, out pct_atendente numeric)
language plpgsql immutable set search_path = public as $$
begin
  pct_escritorio := 30;
  pct_atendente := 15;
  escritorio := round(p_valor * pct_escritorio / 100.0)::bigint;
  atendente := round(escritorio * pct_atendente / 100.0)::bigint;
end $$;

/* 1234567 → 'R$ 12.345,67' (sem depender do locale do banco) */
create or replace function public.port_reais(p_centavos bigint)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(p_centavos, 0) / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
$$;

/* a portabilidade travada para mudar (some se foi tirada da aba) + confere a org de quem pede */
create or replace function public.port_pegar(p_id uuid)
returns public.portabilidades language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.portabilidades where id = p_id for update;
  if v.id is null or v.excluida_em is not null then raise exception 'portabilidade_nao_encontrada'; end if;
  perform public.port_exigir_membro(v.organizacao_id);
  return v;
end $$;

create or replace function public.port_evento(p_id uuid, p_org uuid, p_tipo text, p_texto text)
returns void language sql security definer set search_path = public as $$
  insert into public.portabilidades_eventos (portabilidade_id, organizacao_id, tipo, texto, autor_id)
  values (p_id, p_org, p_tipo, left(p_texto, 500), auth.uid());
  update public.portabilidades set atualizado_em = now() where id = p_id;
$$;

create or replace function public.port_atendente_valido(p_org uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizacao_usuarios
                  where organizacao_id = p_org and usuario_id = p_usuario and status = 'ativo')
$$;

-- ---------------------------------------------------------------- leitura: busca de clientes (Nova portabilidade)
/* qualquer contato da org (não mesclado): nome contém, telefone com 4+ dígitos contidos, ou o celular
   inteiro pela chave canônica (com ou sem o 9º dígito). Sem busca = os mexidos por último. */
create or replace function public.portabilidades_buscar_clientes(p_org uuid, p_busca text default null, p_limite int default 8)
returns table (contato_id uuid, nome text, telefone text, responsavel_id uuid, responsavel_nome text, abertas int)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_busca,'')), ''); v_d text;
begin
  perform public.port_exigir_membro(p_org);
  v_d := nullif(regexp_replace(coalesce(v_q,''), '\D', '', 'g'), '');
  return query
  select c.id, c.nome, c.telefone, c.responsavel_id, u.nome,
         (select count(*)::int from public.portabilidades p
           where p.contato_id = c.id and p.excluida_em is null and p.aceite <> 'recusou' and p.concluida_em is null)
    from public.contatos c
    left join public.usuarios u on u.id = c.responsavel_id
   where c.organizacao_id = p_org and c.mesclado_para is null
     and (v_q is null or c.nome ilike '%' || v_q || '%'
          or (v_d is not null and length(v_d) >= 4 and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') like '%' || v_d || '%')
          or (v_d is not null and length(v_d) between 10 and 13
              and public.chave_canonica_telefone(c.telefone) = public.chave_canonica_telefone(v_d)))
   order by c.atualizado_em desc
   limit greatest(1, least(coalesce(p_limite, 8), 50));
end $$;

-- ---------------------------------------------------------------- criar
create or replace function public.portabilidade_criar(p_contato uuid, p_valor bigint, p_atendente uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_mescl uuid; v_id uuid; d record;
begin
  select organizacao_id, mesclado_para into v_org, v_mescl from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  perform public.port_exigir_membro(v_org);
  if v_mescl is not null then raise exception 'contato_mesclado'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 99999999999 then raise exception 'valor_invalido'; end if;
  if not public.port_atendente_valido(v_org, p_atendente) then raise exception 'atendente_invalido'; end if;
  select * into d from public.port_dividir(p_valor);
  insert into public.portabilidades (organizacao_id, contato_id, atendente_id, valor_cliente, valor_escritorio,
                                     valor_atendente, pct_escritorio, pct_atendente, criado_por)
  values (v_org, p_contato, p_atendente, p_valor, d.escritorio, d.atendente, d.pct_escritorio, d.pct_atendente, auth.uid())
  returning id into v_id;
  perform public.port_evento(v_id, v_org, 'sistema', 'Entrou na aba com ' || public.port_reais(p_valor));
  return v_id;
end $$;

-- ---------------------------------------------------------------- etapas
create or replace function public.portabilidade_aceite(p_id uuid, p_aceite text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.port_pegar(p_id);
  if p_aceite is null or p_aceite not in ('aguardando','aceitou','recusou') then raise exception 'aceite_invalido'; end if;
  if v.concluida_em is not null then raise exception 'portabilidade_concluida'; end if;
  if v.aceite = p_aceite then return; end if;
  update public.portabilidades
     set aceite = p_aceite, aceite_em = case when p_aceite = 'aguardando' then null else now() end
   where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema', case p_aceite
    when 'aceitou' then 'Cliente aceitou a portabilidade'
    when 'recusou' then 'Cliente não aceitou'
    else 'Voltou para "esperando o cliente aceitar"' end);
end $$;

create or replace function public.portabilidade_desbloqueio(p_id uuid, p_feito boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.port_pegar(p_id);
  if v.aceite <> 'aceitou' then raise exception 'sem_aceite'; end if;
  if v.concluida_em is not null then raise exception 'portabilidade_concluida'; end if;
  if (v.desbloqueado_em is not null) = coalesce(p_feito, false) then return; end if;
  update public.portabilidades set desbloqueado_em = case when p_feito then now() end where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema',
    case when p_feito then 'Benefício desbloqueado' else 'Desbloqueio do benefício desfeito' end);
end $$;

create or replace function public.portabilidade_link(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype; v_atual text;
begin
  select * into v from public.port_pegar(p_id);
  if p_estado is null or p_estado not in ('nao_enviado','enviado','feito') then raise exception 'estado_invalido'; end if;
  if v.aceite <> 'aceitou' then raise exception 'sem_aceite'; end if;
  if v.concluida_em is not null then raise exception 'portabilidade_concluida'; end if;
  v_atual := case when v.link_feito_em is not null then 'feito' when v.link_enviado_em is not null then 'enviado' else 'nao_enviado' end;
  if v_atual = p_estado then return; end if;
  update public.portabilidades
     set link_enviado_em = case when p_estado = 'nao_enviado' then null else coalesce(link_enviado_em, now()) end,
         link_feito_em   = case when p_estado = 'feito' then now() end
   where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema', case
    when p_estado = 'enviado' and v_atual = 'feito' then 'Link voltou para "enviado, esperando o cliente"'
    when p_estado = 'enviado' then 'Link enviado ao cliente'
    when p_estado = 'feito' then 'Cliente fez o link'
    else 'Envio do link desfeito' end);
end $$;

create or replace function public.portabilidade_concluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.port_pegar(p_id);
  if v.concluida_em is not null then return; end if;
  if v.aceite <> 'aceitou' or v.desbloqueado_em is null or v.link_feito_em is null then raise exception 'etapas_pendentes'; end if;
  update public.portabilidades set concluida_em = now() where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'concluida', 'Portabilidade concluída');
end $$;

create or replace function public.portabilidade_reabrir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.port_pegar(p_id);
  if v.concluida_em is null then return; end if;
  update public.portabilidades set concluida_em = null where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema', 'Portabilidade reaberta');
end $$;

-- ---------------------------------------------------------------- valor, atendente, anotação, tirar da aba
create or replace function public.portabilidade_valor(p_id uuid, p_valor bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype; d record;
begin
  select * into v from public.port_pegar(p_id);
  if p_valor is null or p_valor <= 0 or p_valor > 99999999999 then raise exception 'valor_invalido'; end if;
  if v.concluida_em is not null then raise exception 'portabilidade_concluida'; end if;
  if v.valor_cliente = p_valor then return; end if;
  select * into d from public.port_dividir(p_valor);
  update public.portabilidades
     set valor_cliente = p_valor, valor_escritorio = d.escritorio, valor_atendente = d.atendente,
         pct_escritorio = d.pct_escritorio, pct_atendente = d.pct_atendente
   where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema',
    'Valor: ' || public.port_reais(v.valor_cliente) || ' → ' || public.port_reais(p_valor));
end $$;

create or replace function public.portabilidade_atendente(p_id uuid, p_atendente uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype; v_de text; v_para text;
begin
  select * into v from public.port_pegar(p_id);
  if not public.port_atendente_valido(v.organizacao_id, p_atendente) then raise exception 'atendente_invalido'; end if;
  if v.atendente_id = p_atendente then return; end if;
  select split_part(nome, ' ', 1) into v_de from public.usuarios where id = v.atendente_id;
  select split_part(nome, ' ', 1) into v_para from public.usuarios where id = p_atendente;
  update public.portabilidades set atendente_id = p_atendente where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema',
    'Atendente: ' || coalesce(v_de, '—') || ' → ' || coalesce(v_para, '—'));
end $$;

create or replace function public.portabilidade_anotar(p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype; v_t text := btrim(coalesce(p_texto, ''));
begin
  select * into v from public.port_pegar(p_id);
  if v_t = '' then raise exception 'nota_vazia'; end if;
  perform public.port_evento(p_id, v.organizacao_id, 'nota', v_t);
end $$;

create or replace function public.portabilidade_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.portabilidades%rowtype;
begin
  select * into v from public.port_pegar(p_id);
  update public.portabilidades set excluida_em = now(), excluida_por = auth.uid() where id = p_id;
  perform public.port_evento(p_id, v.organizacao_id, 'sistema', 'Tirada da aba Portabilidades');
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.port_exigir_membro(uuid), public.port_dividir(bigint), public.port_reais(bigint),
  public.port_pegar(uuid), public.port_evento(uuid,uuid,text,text), public.port_atendente_valido(uuid,uuid)
  from public, anon, authenticated;

revoke all on function public.portabilidades_buscar_clientes(uuid,text,int), public.portabilidade_criar(uuid,bigint,uuid),
  public.portabilidade_aceite(uuid,text), public.portabilidade_desbloqueio(uuid,boolean), public.portabilidade_link(uuid,text),
  public.portabilidade_concluir(uuid), public.portabilidade_reabrir(uuid), public.portabilidade_valor(uuid,bigint),
  public.portabilidade_atendente(uuid,uuid), public.portabilidade_anotar(uuid,text), public.portabilidade_excluir(uuid)
  from public, anon;
grant execute on function public.portabilidades_buscar_clientes(uuid,text,int), public.portabilidade_criar(uuid,bigint,uuid),
  public.portabilidade_aceite(uuid,text), public.portabilidade_desbloqueio(uuid,boolean), public.portabilidade_link(uuid,text),
  public.portabilidade_concluir(uuid), public.portabilidade_reabrir(uuid), public.portabilidade_valor(uuid,bigint),
  public.portabilidade_atendente(uuid,uuid), public.portabilidade_anotar(uuid,text), public.portabilidade_excluir(uuid)
  to authenticated;
