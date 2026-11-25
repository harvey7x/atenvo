-- 103 · RETOMADA AUTOMÁTICA no Atendimento (25/11). No sistema que a Reviza usava antes havia "follow-ups": mensagens
-- que vão sozinhas quando o cliente para de responder; se ele responde, param. Aqui, uma SEQUÊNCIA por etapa do Kanban
-- (funil + coluna), com até 12 mensagens; cada uma espera um tempo sem resposta e leva um texto com {nome},
-- {primeiro_nome} e {atendente}. Peças:
--   atd_retomada_config       uma linha por empresa: a chave geral (DESLIGADA de saída), dias e horário, o intervalo
--                             mínimo entre duas retomadas do mesmo número (90 s; nunca menos de 45 s) e o teto por dia
--   atd_retomada_sequencias   as sequências (uma por etapa) e as mensagens de cada uma (passos)
--   atd_retomada_envios       o que o motor reservou/enviou: o Histórico da tela
--   atd_retomada_proximos     o que está na hora de ir (só o servidor chama: a função retomada-processar, a cada minuto)
--   atd_retomada_reservar     reserva UM envio conferindo tudo de novo, com trava por número (o intervalo não fura)
-- REGRAS DO MOTOR (decididas aqui, as mesmas da tela e de src/data/retomada.ts):
--   · o tempo de cada mensagem conta da ÚLTIMA MENSAGEM NOSSA (do atendente, da IA ou a anterior da sequência) — assim
--     duas retomadas nunca saem coladas, mesmo depois de um fim de semana parado;
--   · o CICLO é o momento da última mensagem do cliente: ele respondeu → ciclo novo → a sequência recomeça do 1º passo
--     da próxima vez que ele ficar sem responder. Só entra quem já falou com a gente ao menos uma vez;
--   · vale só para conversas que ficaram sem resposta DEPOIS que a chave geral e a sequência foram ligadas (ligar não
--     dispara nada para quem já estava parado antes);
--   · nunca: conversa fechada/resolvida ou arquivada, cliente que pediu para sair (atd_wa_optout) ou bloqueado
--     (relacionamento_bloqueio), conversa com a IA atendendo (ia_sessoes 'ativa'), número desconectado/restrito, fora
--     dos dias e horas (horário de São Paulo), sequência que ainda tem TEXTO DE EXEMPLO, e — no WhatsApp oficial —
--     fora das 24 h da última mensagem do cliente (a Meta recusaria);
--   · um envio que falhou encerra a sequência naquela conversa até o cliente responder (nada de tentar de novo sozinho).
-- ADITIVA: só cria peças novas. Depende da 93 (Atendimento). DESFAZER no fim.

-- 1) a configuração (uma por empresa) -------------------------------------------------------------------------------
create table if not exists public.atd_retomada_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo          boolean not null default false,
  dias           int[]   not null default '{1,2,3,4,5}',      -- 0 = domingo … 6 = sábado (horário de São Paulo)
  hora_ini       time    not null default '08:00',
  hora_fim       time    not null default '20:00',
  intervalo_s    int     not null default 90,                 -- entre duas retomadas do MESMO número
  teto_dia       int     not null default 80,                 -- retomadas por número por dia
  ligado_em      timestamptz,                                 -- última vez que a chave geral foi ligada
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  constraint atd_retomada_config_dias check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]),
  constraint atd_retomada_config_horas check (hora_fim > hora_ini),
  constraint atd_retomada_config_intervalo check (intervalo_s between 45 and 3600),
  constraint atd_retomada_config_teto check (teto_dia between 1 and 500)
);

-- 2) as sequências ---------------------------------------------------------------------------------------------------
-- passos = [{ "espera_min": 360, "texto": "…", "exemplo": true? }], de 1 a 12; espera de 1 hora a 30 dias; texto até 1000
create or replace function private.atd_retomada_passos_ok(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare x jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < 1 or jsonb_array_length(p) > 12 then return false; end if;
  for x in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'espera_min') <> 'number' or jsonb_typeof(x -> 'texto') <> 'string' then return false; end if;
    if (x ->> 'espera_min')::numeric <> floor((x ->> 'espera_min')::numeric) or (x ->> 'espera_min')::int not between 60 and 43200 then return false; end if;
    if char_length(btrim(x ->> 'texto')) not between 1 and 1000 then return false; end if;
    if x ? 'exemplo' and jsonb_typeof(x -> 'exemplo') <> 'boolean' then return false; end if;
  end loop;
  return true;
end $$;

create table if not exists public.atd_retomada_sequencias (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  funil_id       uuid not null references public.funis(id) on delete cascade,
  coluna_id      uuid not null references public.funil_colunas(id) on delete cascade,
  ativo          boolean not null default true,
  passos         jsonb   not null,
  ativada_em     timestamptz,                                 -- última vez que a sequência foi ligada
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  atualizado_em  timestamptz not null default now(),
  constraint atd_retomada_seq_passos check (private.atd_retomada_passos_ok(passos)),
  constraint atd_retomada_seq_uma_por_etapa unique (organizacao_id, coluna_id)
);

-- 3) os envios (o Histórico) -----------------------------------------------------------------------------------------
create table if not exists public.atd_retomada_envios (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id    uuid not null references public.conversas(id) on delete cascade,
  sequencia_id   uuid references public.atd_retomada_sequencias(id) on delete set null,
  passo          int  not null check (passo between 1 and 12),
  total_passos   int,
  ciclo          timestamptz not null,                        -- a última mensagem do cliente quando o passo venceu
  canal_id       uuid references public.canais(id) on delete set null,
  etapa_nome     text,                                        -- "Funil › Etapa" na hora do envio (a etapa pode mudar de nome)
  texto          text,                                        -- o texto já com o nome do cliente e do atendente
  status         text not null default 'agendado' check (status in ('agendado', 'enviado', 'cancelado', 'falhou')),
  motivo         text,
  agendado_para  timestamptz,                                 -- quando o passo venceu (última mensagem nossa + espera)
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz,
  mensagem_id    uuid
);
-- um passo por ciclo: (conversa, sequência, passo, ciclo) não se repete. Cancelado não conta — uma reserva desfeita
-- antes de enviar não pode travar o passo para sempre
create unique index if not exists atd_retomada_envios_um_por_passo
  on public.atd_retomada_envios (conversa_id, sequencia_id, passo, ciclo) where status <> 'cancelado';
create index if not exists atd_retomada_envios_canal on public.atd_retomada_envios (canal_id, criado_em desc);
create index if not exists atd_retomada_envios_org on public.atd_retomada_envios (organizacao_id, criado_em desc);
create index if not exists atd_retomada_envios_conversa on public.atd_retomada_envios (conversa_id, sequencia_id, ciclo);

-- 4) acesso: configuração e sequências só o administrador lê e grava; o Histórico só o administrador lê; o motor grava
alter table public.atd_retomada_config enable row level security;
alter table public.atd_retomada_sequencias enable row level security;
alter table public.atd_retomada_envios enable row level security;
revoke all on public.atd_retomada_config, public.atd_retomada_sequencias, public.atd_retomada_envios from public, anon, authenticated;
grant select, insert, update on public.atd_retomada_config to authenticated;
grant select, insert, update, delete on public.atd_retomada_sequencias to authenticated;
grant select on public.atd_retomada_envios to authenticated;
grant all on public.atd_retomada_config, public.atd_retomada_sequencias, public.atd_retomada_envios to service_role;
drop policy if exists atd_retomada_config_admin on public.atd_retomada_config;
create policy atd_retomada_config_admin on public.atd_retomada_config for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
drop policy if exists atd_retomada_sequencias_admin on public.atd_retomada_sequencias;
create policy atd_retomada_sequencias_admin on public.atd_retomada_sequencias for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
drop policy if exists atd_retomada_envios_admin on public.atd_retomada_envios;
create policy atd_retomada_envios_admin on public.atd_retomada_envios for select to authenticated
  using ((select public.is_at_least('admin')));

-- 5) carimbos: quando foi ligada (a tela não escolhe essa data — senão daria para "ligar no passado" e disparar para
--    quem já estava parado), quem mexeu, e a etapa sempre do funil certo
create or replace function private.atd_retomada_config_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    new.ligado_em := now();
  elsif auth.uid() is not null then
    new.ligado_em := case when tg_op = 'INSERT' then null else old.ligado_em end;
  end if;
  return new;
end $$;
drop trigger if exists atd_retomada_config_carimbo on public.atd_retomada_config;
create trigger atd_retomada_config_carimbo before insert or update on public.atd_retomada_config
  for each row execute function private.atd_retomada_config_carimbo();

create or replace function private.atd_retomada_seq_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_funil uuid; v_org uuid; v_encerra boolean;
begin
  select fc.funil_id, fc.organizacao_id, coalesce(fc.encerra_oportunidade, false) into v_funil, v_org, v_encerra
    from public.funil_colunas fc where fc.id = new.coluna_id;
  if v_funil is null then raise exception 'etapa_inexistente'; end if;
  if v_org is distinct from new.organizacao_id then raise exception 'etapa_de_outra_empresa'; end if;
  if v_encerra then raise exception 'etapa_que_encerra'; end if;  -- Fechado/Perdido: o lead já saiu do funil
  new.funil_id := v_funil;
  new.atualizado_em := now();
  if tg_op = 'INSERT' and auth.uid() is not null then new.criado_por := auth.uid(); end if;
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    new.ativada_em := now();
  elsif auth.uid() is not null then
    new.ativada_em := case when tg_op = 'INSERT' then null else old.ativada_em end;
  end if;
  return new;
end $$;
drop trigger if exists atd_retomada_seq_carimbo on public.atd_retomada_sequencias;
create trigger atd_retomada_seq_carimbo before insert or update on public.atd_retomada_sequencias
  for each row execute function private.atd_retomada_seq_carimbo();

-- quem ligou, desligou ou mudou fica em Registros
create or replace function private.atd_retomada_registra()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_etapa text;
begin
  if tg_table_name = 'atd_retomada_config' then
    if (tg_op = 'INSERT' and new.ativo) or (tg_op = 'UPDATE' and new.ativo is distinct from old.ativo) then
      perform private.registrar('alterou', 'retomada automática', new.organizacao_id::text, 'Retomada automática',
        case when new.ativo then 'ligou a retomada automática' else 'desligou a retomada automática' end);
    elsif tg_op = 'INSERT' or new.dias is distinct from old.dias or new.hora_ini is distinct from old.hora_ini or new.hora_fim is distinct from old.hora_fim
       or new.intervalo_s is distinct from old.intervalo_s or new.teto_dia is distinct from old.teto_dia then
      perform private.registrar('alterou', 'retomada automática', new.organizacao_id::text, 'Retomada automática',
        format('dias e horário de envio, %s s entre mensagens, até %s por número por dia', new.intervalo_s, new.teto_dia));
    end if;
    return null;
  end if;
  select coalesce(f.nome || ' › ', '') || fc.nome into v_etapa
    from public.funil_colunas fc left join public.funis f on f.id = fc.funil_id
   where fc.id = case when tg_op = 'DELETE' then old.coluna_id else new.coluna_id end;
  if tg_op = 'DELETE' then
    perform private.registrar('excluiu', 'retomada automática', old.id::text, coalesce(v_etapa, 'Sequência'), 'sequência de retomada');
  elsif tg_op = 'INSERT' then
    perform private.registrar('criou', 'retomada automática', new.id::text, coalesce(v_etapa, 'Sequência'),
      format('sequência de retomada com %s mensage%s', jsonb_array_length(new.passos), case when jsonb_array_length(new.passos) = 1 then 'm' else 'ns' end));
  elsif new.ativo is distinct from old.ativo or new.passos is distinct from old.passos or new.coluna_id is distinct from old.coluna_id then
    perform private.registrar('alterou', 'retomada automática', new.id::text, coalesce(v_etapa, 'Sequência'),
      case when new.ativo is distinct from old.ativo then case when new.ativo then 'ativou a sequência' else 'pausou a sequência' end
           else 'mudou as mensagens da sequência' end);
  end if;
  return null;
end $$;
drop trigger if exists atd_retomada_config_registra on public.atd_retomada_config;
create trigger atd_retomada_config_registra after insert or update on public.atd_retomada_config
  for each row execute function private.atd_retomada_registra();
drop trigger if exists atd_retomada_seq_registra on public.atd_retomada_sequencias;
create trigger atd_retomada_seq_registra after insert or update or delete on public.atd_retomada_sequencias
  for each row execute function private.atd_retomada_registra();

-- 6) QUEM ESTÁ NA HORA (o critério inteiro, num lugar só; o intervalo e o teto por número ficam em proximos/reservar) --
create or replace function private.atd_retomada_candidatos(p_agora timestamptz default now(), p_conversa uuid default null)
returns table (
  organizacao_id uuid, conversa_id uuid, sequencia_id uuid, passo int, total_passos int, ciclo timestamptz,
  canal_id uuid, texto text, devido_em timestamptz, contato_nome text, atendente_nome text, etapa_nome text
)
language sql stable security definer set search_path = '' as $$
  with
  cfg as (   -- chave geral ligada e agora dentro dos dias e do horário (São Paulo)
    select c.organizacao_id, c.ligado_em
      from public.atd_retomada_config c
     where c.ativo and c.ligado_em is not null
       and extract(dow from (p_agora at time zone 'America/Sao_Paulo'))::int = any (c.dias)
       and (p_agora at time zone 'America/Sao_Paulo')::time >= c.hora_ini
       and (p_agora at time zone 'America/Sao_Paulo')::time < c.hora_fim
  ),
  seq as (   -- sequências ligadas, sem nenhum texto de exemplo (texto de exemplo nunca vai para cliente)
    select s.id, s.organizacao_id, s.coluna_id, s.passos, greatest(s.ativada_em, cfg.ligado_em) as inicio
      from public.atd_retomada_sequencias s
      join cfg on cfg.organizacao_id = s.organizacao_id
     where s.ativo and s.ativada_em is not null
       and not jsonb_path_exists(s.passos, '$[*] ? (@.exemplo == true)')
  ),
  op as (    -- a oportunidade ATUAL do contato: a aberta movida por último (pode haver uma aberta por funil)
    select distinct on (o.contato_id) o.contato_id, o.coluna_id, o.organizacao_id
      from public.oportunidades o
     where o.status = 'em_andamento' and o.contato_id is not null
       and exists (select 1 from public.oportunidades o2 join seq on seq.coluna_id = o2.coluna_id
                    where o2.contato_id = o.contato_id and o2.status = 'em_andamento')
     order by o.contato_id, o.movimentado_em desc nulls last, o.atualizado_em desc nulls last, o.id
  )
  select cv.organizacao_id, cv.id, seq.id, (feitos.n + 1)::int, jsonb_array_length(seq.passos)::int, ent.em,
         ca.id, prox.p ->> 'texto', ult.criado_em + make_interval(mins => (prox.p ->> 'espera_min')::int),
         ct.nome, us.nome, coalesce(f.nome || ' › ', '') || fc.nome
    from op
    join seq on seq.coluna_id = op.coluna_id and seq.organizacao_id = op.organizacao_id
    join public.conversas cv on cv.contato_id = op.contato_id and cv.organizacao_id = op.organizacao_id
    join public.contatos ct on ct.id = cv.contato_id
    join public.canais ca on ca.id = coalesce(cv.canal_preso_id, cv.ultimo_canal_id, cv.canal_id)
    join public.funil_colunas fc on fc.id = seq.coluna_id
    left join public.funis f on f.id = fc.funil_id
    left join public.usuarios us on us.id = cv.atendente_id
    -- a última mensagem de verdade (nota interna, aviso do sistema e envio que falhou não contam)
    cross join lateral (
      select m.direcao::text as direcao, m.criado_em
        from public.mensagens m
       where m.conversa_id = cv.id and m.tipo::text not in ('sistema', 'nota_interna')
         and not (m.direcao = 'saida' and m.status = 'falhou')
       order by m.criado_em desc limit 1
    ) ult
    -- o ciclo: a última mensagem do cliente
    cross join lateral (
      select max(m.criado_em) as em from public.mensagens m
       where m.conversa_id = cv.id and m.direcao = 'entrada' and m.tipo::text not in ('sistema', 'nota_interna')
    ) ent
    -- quantos passos desta sequência já foram neste ciclo
    cross join lateral (
      select count(*)::int as n from public.atd_retomada_envios e
       where e.conversa_id = cv.id and e.sequencia_id = seq.id and e.ciclo = ent.em and e.status = 'enviado'
    ) feitos
    cross join lateral (select seq.passos -> feitos.n as p) prox
   where (p_conversa is null or cv.id = p_conversa)
     and cv.status::text not in ('resolvida', 'fechada') and cv.arquivada_em is null
     and ca.ativo and ca.status_integracao::text = 'conectado' and not coalesce(ca.envio_restrito, false)
     and ca.conflito_com is null and coalesce(ca.papel, 'atendimento') in ('atendimento', 'ambos')
     and ent.em is not null                         -- só quem já falou com a gente
     and ult.direcao = 'saida' and ult.criado_em > ent.em
     and ult.criado_em >= seq.inicio                -- ficou sem resposta depois de ligar
     and prox.p is not null                         -- ainda há passo
     and ult.criado_em + make_interval(mins => (prox.p ->> 'espera_min')::int) <= p_agora
     and not exists (select 1 from public.atd_retomada_envios e
                      where e.conversa_id = cv.id and e.sequencia_id = seq.id and e.ciclo = ent.em and e.status = 'falhou')
     and not exists (select 1 from public.atd_wa_optout w where w.contato_id = cv.contato_id)
     and not exists (select 1 from public.relacionamento_bloqueio b where b.contato_id = cv.contato_id)
     and not exists (select 1 from public.ia_sessoes s where s.conversa_id = cv.id and s.status = 'ativa')
     and (ca.transporte <> 'cloud_api' or p_agora < ent.em + interval '23 hours 30 minutes')
$$;
revoke all on function private.atd_retomada_candidatos(timestamptz, uuid) from public, anon, authenticated;

-- uso de cada número: a última retomada (reservada, enviada ou que falhou — o WhatsApp pode ter visto a tentativa)
-- e quantas saíram hoje (dia de São Paulo)
create or replace function private.atd_retomada_uso_numero(p_canal uuid, p_agora timestamptz default now())
returns table (ultimo timestamptz, hoje int)
language sql stable security definer set search_path = '' as $$
  select max(coalesce(e.enviado_em, e.criado_em)),
         (count(*) filter (where e.status in ('agendado', 'enviado')
                             and (coalesce(e.enviado_em, e.criado_em) at time zone 'America/Sao_Paulo')::date
                                 = (p_agora at time zone 'America/Sao_Paulo')::date))::int
    from public.atd_retomada_envios e
   where e.canal_id = p_canal and e.status <> 'cancelado' and e.criado_em > p_agora - interval '2 days'
$$;
revoke all on function private.atd_retomada_uso_numero(uuid, timestamptz) from public, anon, authenticated;

-- 7) o que o motor pede a cada minuto: no máximo UM por número (o mais atrasado primeiro), respeitando o intervalo e o
--    teto de cada número
create or replace function public.atd_retomada_proximos(p_limite int default 20)
returns table (
  organizacao_id uuid, conversa_id uuid, sequencia_id uuid, passo int, total_passos int, ciclo timestamptz,
  canal_id uuid, texto text, devido_em timestamptz, contato_nome text, atendente_nome text, etapa_nome text
)
language sql stable security definer set search_path = '' as $$
  with c as (select * from private.atd_retomada_candidatos(now())),
  livres as (
    select c.*
      from c
      join public.atd_retomada_config cfg on cfg.organizacao_id = c.organizacao_id
      cross join lateral private.atd_retomada_uso_numero(c.canal_id) u
     where (u.ultimo is null or u.ultimo <= now() - make_interval(secs => cfg.intervalo_s))
       and coalesce(u.hoje, 0) < cfg.teto_dia
       and not exists (select 1 from public.atd_retomada_envios e
                        where e.conversa_id = c.conversa_id and e.sequencia_id = c.sequencia_id
                          and e.passo = c.passo and e.ciclo = c.ciclo and e.status <> 'cancelado')
  )
  select x.organizacao_id, x.conversa_id, x.sequencia_id, x.passo, x.total_passos, x.ciclo, x.canal_id, x.texto,
         x.devido_em, x.contato_nome, x.atendente_nome, x.etapa_nome
    from (select distinct on (l.canal_id) l.* from livres l order by l.canal_id, l.devido_em, l.conversa_id) x
   order by x.devido_em, x.conversa_id
   limit greatest(1, least(coalesce(p_limite, 20), 100))
$$;
revoke all on function public.atd_retomada_proximos(int) from public, anon, authenticated;
grant execute on function public.atd_retomada_proximos(int) to service_role;

-- 8) reservar UM envio logo antes de mandar: confere tudo de novo para esta conversa (o cliente pode ter respondido),
--    trava o número (duas rodadas ao mesmo tempo não mandam duas do mesmo número) e confere intervalo e teto.
--    Devolve o id da reserva, ou null se não é mais para ir.
create or replace function public.atd_retomada_reservar(p_conversa uuid, p_sequencia uuid, p_passo int, p_ciclo timestamptz, p_texto text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; v_intervalo int; v_teto int; u record; v_id uuid;
begin
  if p_texto is null or char_length(btrim(p_texto)) = 0 then return null; end if;
  select * into c from private.atd_retomada_candidatos(now(), p_conversa) x
   where x.sequencia_id = p_sequencia and x.passo = p_passo and x.ciclo = p_ciclo
   limit 1;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('atd_retomada:' || c.canal_id::text, 0));
  select cfg.intervalo_s, cfg.teto_dia into v_intervalo, v_teto from public.atd_retomada_config cfg where cfg.organizacao_id = c.organizacao_id;
  select * into u from private.atd_retomada_uso_numero(c.canal_id);
  if u.ultimo is not null and u.ultimo > now() - make_interval(secs => v_intervalo) then return null; end if;
  if coalesce(u.hoje, 0) >= v_teto then return null; end if;
  insert into public.atd_retomada_envios (organizacao_id, conversa_id, sequencia_id, passo, total_passos, ciclo, canal_id, etapa_nome, texto, status, agendado_para)
  values (c.organizacao_id, c.conversa_id, c.sequencia_id, c.passo, c.total_passos, c.ciclo, c.canal_id, c.etapa_nome, left(p_texto, 4000), 'agendado', c.devido_em)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.atd_retomada_reservar(uuid, uuid, int, timestamptz, text) from public, anon, authenticated;
grant execute on function public.atd_retomada_reservar(uuid, uuid, int, timestamptz, text) to service_role;

-- 9) reserva que ficou presa (a função caiu no meio): se a mensagem saiu, vira 'enviado'; se não dá para saber, 'falhou'
--    — nunca tenta de novo, para o cliente não receber duas vezes
create or replace function public.atd_retomada_arrumar()
returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record; v_msg uuid;
begin
  for r in select e.id, e.conversa_id from public.atd_retomada_envios e
            where e.status = 'agendado' and e.criado_em < now() - interval '10 minutes' for update skip locked loop
    select m.id into v_msg from public.mensagens m
     where m.conversa_id = r.conversa_id and m.direcao = 'saida' and m.metadados ->> 'agendamento_id' = r.id::text
     order by m.criado_em desc limit 1;
    if v_msg is not null then
      update public.atd_retomada_envios set status = 'enviado', mensagem_id = v_msg,
             enviado_em = coalesce(enviado_em, (select m.criado_em from public.mensagens m where m.id = v_msg))
       where id = r.id;
    else
      update public.atd_retomada_envios set status = 'falhou', motivo = 'O envio foi interrompido no meio. Para não mandar duas vezes, não foi tentado de novo.'
       where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.atd_retomada_arrumar() from public, anon, authenticated;
grant execute on function public.atd_retomada_arrumar() to service_role;

-- 10) o Histórico da tela (só o administrador): o que foi, para quem, de qual etapa, em qual passo e como terminou
create or replace function public.atd_retomada_historico(p_limite int default 200)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_at_least('admin') then raise exception 'sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'conversa_id', e.conversa_id, 'sequencia_id', e.sequencia_id, 'cliente', ct.nome,
             'etapa', e.etapa_nome, 'passo', e.passo, 'total_passos', e.total_passos,
             'quando', coalesce(e.enviado_em, e.criado_em), 'status', e.status, 'motivo', e.motivo, 'texto', e.texto)
           order by coalesce(e.enviado_em, e.criado_em) desc)
      from (select * from public.atd_retomada_envios
             order by coalesce(enviado_em, criado_em) desc
             limit greatest(1, least(coalesce(p_limite, 200), 500))) e
      left join public.conversas cv on cv.id = e.conversa_id
      left join public.contatos ct on ct.id = cv.contato_id
  ), '[]'::jsonb);
end $$;
revoke all on function public.atd_retomada_historico(int) from public, anon;
grant execute on function public.atd_retomada_historico(int) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_retomada_historico(int), public.atd_retomada_arrumar(), public.atd_retomada_reservar(uuid, uuid, int, timestamptz, text),
--     public.atd_retomada_proximos(int), private.atd_retomada_uso_numero(uuid, timestamptz), private.atd_retomada_candidatos(timestamptz, uuid);
--   drop table if exists public.atd_retomada_envios, public.atd_retomada_sequencias, public.atd_retomada_config;
--   drop function if exists private.atd_retomada_registra(), private.atd_retomada_seq_carimbo(), private.atd_retomada_config_carimbo(), private.atd_retomada_passos_ok(jsonb);
