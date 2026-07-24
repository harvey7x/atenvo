-- ============================================================================
-- MATURAÇÃO — proxy por chip (OPCIONAL)
--
-- Depois que o QR é lido, quem fala com o WhatsApp é o servidor Evolution, não o
-- celular. Logo, o IP que o WhatsApp enxerga em todo o tráfego de aquecimento é o do
-- servidor — e 5 chips saindo do mesmo IP é a assinatura clássica de fazenda de chip.
-- O proxy por instância é o único lugar onde isso se resolve.
--
-- OPCIONAL DE PROPÓSITO: proxy instável derruba a sessão e custa a rampa inteira.
-- Sem proxy configurado, o chip funciona exatamente como hoje (sai pelo IP do servidor).
--
-- SENHA: `proxy_senha` NUNCA é exposta ao cliente. O grant de SELECT vira coluna a
-- coluna, deixando a senha de fora — nem admin lê pelo PostgREST. Só o service_role
-- (edge function que fala com a Evolution) enxerga.
-- ============================================================================

alter table public.maturacao_chips
  add column if not exists proxy_protocolo text
    check (proxy_protocolo is null or proxy_protocolo in ('http','https','socks4','socks5')),
  add column if not exists proxy_host      text,
  add column if not exists proxy_porta     int check (proxy_porta is null or proxy_porta between 1 and 65535),
  add column if not exists proxy_usuario   text,
  add column if not exists proxy_senha     text,
  add column if not exists proxy_aplicado_em timestamptz,
  add column if not exists proxy_ultimo_erro text;

comment on column public.maturacao_chips.proxy_senha is
  'Credencial. Fora do grant de SELECT do cliente — só service_role lê.';
comment on column public.maturacao_chips.proxy_aplicado_em is
  'Quando o proxy foi efetivamente empurrado para a instância na Evolution.';

-- host+porta+protocolo andam juntos: proxy pela metade quebra a sessão em silêncio
alter table public.maturacao_chips
  drop constraint if exists mchip_proxy_completo;
alter table public.maturacao_chips
  add constraint mchip_proxy_completo check (
    (proxy_host is null and proxy_porta is null and proxy_protocolo is null) or
    (proxy_host is not null and proxy_porta is not null and proxy_protocolo is not null)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT coluna a coluna: tudo menos a senha.
-- (o grant de tabela inteira daria acesso a proxy_senha via PostgREST)
-- ─────────────────────────────────────────────────────────────────────────────
revoke select on public.maturacao_chips from authenticated;
grant select (
  id, organizacao_id, apelido, operadora, instancia_externa, numero_conectado,
  status_integracao, status_maturacao, dia_rampa, iniciado_em, concluido_em,
  perfil_ok, pausado_motivo, observacao, conectado_em, criado_em, atualizado_em,
  proxy_protocolo, proxy_host, proxy_porta, proxy_usuario,
  proxy_aplicado_em, proxy_ultimo_erro
) on public.maturacao_chips to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: definir proxy. Senha em branco/ausente PRESERVA a senha atual — assim a UI
-- pode reeditar host/porta sem obrigar a redigitar a credencial que não pode ler.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_chip_proxy_definir(
  p_chip       uuid,
  p_protocolo  text,
  p_host       text,
  p_porta      int,
  p_usuario    text default null,
  p_senha      text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.maturacao_chips where id = p_chip;
  if v_org is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  if p_protocolo is null or p_protocolo not in ('http','https','socks4','socks5') then
    raise exception 'protocolo_invalido' using hint = 'use http, https, socks4 ou socks5';
  end if;
  if p_host is null or length(trim(p_host)) = 0 then raise exception 'host_obrigatorio'; end if;
  if p_porta is null or p_porta < 1 or p_porta > 65535 then raise exception 'porta_invalida'; end if;

  update public.maturacao_chips set
    proxy_protocolo   = p_protocolo,
    proxy_host        = trim(p_host),
    proxy_porta       = p_porta,
    proxy_usuario     = nullif(trim(coalesce(p_usuario,'')), ''),
    -- senha vazia = manter a que já existe (o cliente não consegue lê-la para reenviar)
    proxy_senha       = coalesce(nullif(p_senha, ''), proxy_senha),
    proxy_aplicado_em = null,          -- pendente até a edge empurrar para a Evolution
    proxy_ultimo_erro = null,
    atualizado_em     = now()
  where id = p_chip;
end $fn$;

revoke execute on function public.maturacao_chip_proxy_definir(uuid, text, text, int, text, text) from public, anon;
grant  execute on function public.maturacao_chip_proxy_definir(uuid, text, text, int, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: remover proxy (volta a sair pelo IP do servidor)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_chip_proxy_remover(p_chip uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.maturacao_chips where id = p_chip;
  if v_org is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  update public.maturacao_chips set
    proxy_protocolo = null, proxy_host = null, proxy_porta = null,
    proxy_usuario = null, proxy_senha = null,
    proxy_aplicado_em = null, proxy_ultimo_erro = null,
    atualizado_em = now()
  where id = p_chip;
end $fn$;

revoke execute on function public.maturacao_chip_proxy_remover(uuid) from public, anon;
grant  execute on function public.maturacao_chip_proxy_remover(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Painel: passa a informar o estado do proxy (nunca a senha).
-- Assinatura de retorno muda ⇒ precisa de DROP antes do CREATE.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.maturacao_painel(uuid);

create or replace function public.maturacao_painel(p_org uuid)
returns table (
  chip_id           uuid,
  apelido           text,
  numero_conectado  text,
  status_integracao text,
  status_maturacao  text,
  dia_rampa         int,
  perfil_ok         boolean,
  enviadas_7d       bigint,
  entregues_7d      bigint,
  lidas_7d          bigint,
  erros_7d          bigint,
  pendentes_hoje    bigint,
  ultimo_erro_em    timestamptz,
  proxy_resumo      text,
  proxy_ativo       boolean,
  proxy_pendente    boolean,
  proxy_ultimo_erro text
)
language sql stable security definer set search_path = public as $fn$
  select
    c.id, c.apelido, c.numero_conectado, c.status_integracao, c.status_maturacao,
    c.dia_rampa, c.perfil_ok,
    count(*) filter (where e.tipo = 'envio'   and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'ack'     and e.status = 'entregue'
                       and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'leitura' and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'erro'    and e.ocorrido_em > now() - interval '7 days'),
    (select count(*) from public.maturacao_agenda a
      where a.chip_origem_id = c.id and a.status = 'agendada'
        and a.executar_em::date = current_date),
    max(e.ocorrido_em) filter (where e.tipo = 'erro'),
    case when c.proxy_host is null then null
         else c.proxy_protocolo || '://' || c.proxy_host || ':' || c.proxy_porta end,
    (c.proxy_host is not null and c.proxy_aplicado_em is not null),
    (c.proxy_host is not null and c.proxy_aplicado_em is null),
    c.proxy_ultimo_erro
  from public.maturacao_chips c
  left join public.maturacao_eventos e on e.chip_id = c.id
  where c.organizacao_id = p_org
    and public._eh_admin_org(p_org)
  group by c.id
  order by c.criado_em;
$fn$;

revoke execute on function public.maturacao_painel(uuid) from public, anon;
grant  execute on function public.maturacao_painel(uuid) to authenticated;
