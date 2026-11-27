-- 114 · AVISOS PARA A EQUIPE (26/11, "igual" ao sistema que a Reviza usava antes: lá Agentes › Notificações, 7 avisos
-- ligados — novo lead, lead qualificado, lead desqualificado, contrato enviado, contrato assinado, reunião agendada, lead
-- que já é cliente do escritório — com os destinatários escolhidos pela empresa e um relatório do que foi enviado).
-- Aqui o aviso chega no SINO de cada destinatário (atd_notificacoes), com o link da conversa; não sai mensagem de WhatsApp
-- para ninguém. Cada aviso dispara num momento do card:
--   lead_novo         o card nasceu no Kanban
--   etapa             o card entrou na etapa escolhida (coluna_id)
--   venda             o card foi para uma etapa de venda (o "Contrato fechado")
--   descartado        o card foi para uma etapa de perda (descartado)
--   reuniao           marcaram uma reunião, ligação ou retorno com o cliente na Agenda
--   cliente_carteira  o cliente que chegou JÁ ESTÁ na carteira de cobranças da Reviza (mesmo DDD e mesmo número)
-- Chegam como lá: os 7 LIGADOS e SEM destinatários (ninguém recebe nada até o administrador escolher quem).
-- ADITIVA: só cria peças novas (e três gatilhos AFTER que só leem e gravam avisos). Depende da 93 e da 109. DESFAZER no fim.

create table if not exists public.atd_avisos_equipe (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  chave          text not null,
  nome           text not null,
  modelo         text not null,
  gatilho        text not null,
  coluna_id      uuid references public.funil_colunas(id) on delete set null,
  destinatarios  uuid[] not null default '{}',
  ativo          boolean not null default true,
  ordem          int not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_avisos_nome check (char_length(btrim(nome)) between 1 and 60),
  constraint atd_avisos_modelo check (char_length(btrim(modelo)) between 1 and 600),
  constraint atd_avisos_gatilho check (gatilho in ('lead_novo', 'etapa', 'venda', 'descartado', 'reuniao', 'cliente_carteira')),
  constraint atd_avisos_dest check (cardinality(destinatarios) <= 50),
  constraint atd_avisos_chave_uniq unique (organizacao_id, chave)
);
create table if not exists public.atd_avisos_equipe_log (
  id              bigint generated always as identity primary key,
  aviso_id        uuid not null references public.atd_avisos_equipe(id) on delete cascade,
  organizacao_id  uuid not null,
  oportunidade_id uuid,
  conversa_id     uuid,
  contato_id      uuid,
  destinatarios   int not null default 0,
  criado_em       timestamptz not null default now()
);
create index if not exists atd_avisos_log_quando on public.atd_avisos_equipe_log (organizacao_id, criado_em desc);
create index if not exists atd_avisos_log_aviso on public.atd_avisos_equipe_log (aviso_id, criado_em desc);

alter table public.atd_avisos_equipe enable row level security;
alter table public.atd_avisos_equipe_log enable row level security;
revoke all on public.atd_avisos_equipe, public.atd_avisos_equipe_log from public, anon, authenticated;
grant select, insert, update, delete on public.atd_avisos_equipe to authenticated;
grant select on public.atd_avisos_equipe_log to authenticated;
grant all on public.atd_avisos_equipe, public.atd_avisos_equipe_log to service_role;
drop policy if exists atd_avisos_admin on public.atd_avisos_equipe;
create policy atd_avisos_admin on public.atd_avisos_equipe for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));
drop policy if exists atd_avisos_log_admin on public.atd_avisos_equipe_log;
create policy atd_avisos_log_admin on public.atd_avisos_equipe_log for select to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

create or replace function private.atd_avisos_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(new.nome);
  new.modelo := btrim(new.modelo);
  -- só gente desta empresa; sem repetidos
  new.destinatarios := coalesce((select array_agg(distinct d) from unnest(new.destinatarios) d
                                  where exists (select 1 from public.organizacao_usuarios ou where ou.usuario_id = d and ou.organizacao_id = new.organizacao_id and ou.status = 'ativo')), '{}');
  if new.gatilho <> 'etapa' then new.coluna_id := null; end if;
  if new.coluna_id is not null and not exists (select 1 from public.funil_colunas c where c.id = new.coluna_id and c.organizacao_id = new.organizacao_id) then raise exception 'etapa_de_outra_empresa'; end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_avisos_carimbo() from public, anon, authenticated;
drop trigger if exists atd_avisos_carimbo on public.atd_avisos_equipe;
create trigger atd_avisos_carimbo before insert or update on public.atd_avisos_equipe for each row execute function private.atd_avisos_carimbo();

-- a chave do telefone para comparar com a carteira: DDD + os 8 últimos números (ignora o 55 e o nono dígito)
create or replace function private.atd_chave_fone(p text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(d) >= 10 then substr(d, 1, 2) || right(d, 8) end
    from (select case when char_length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
            from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;
revoke all on function private.atd_chave_fone(text) from public, anon, authenticated;

-- o telefone no aviso vai mascarado, como na tela do sistema: (51) •••••-7777
create or replace function private.atd_fone_mascarado(p text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(d) >= 10 then '(' || substr(d, 1, 2) || ') •••••-' || right(d, 4) else 'sem número' end
    from (select case when char_length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
            from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;
revoke all on function private.atd_fone_mascarado(text) from public, anon, authenticated;

-- escreve o aviso no sino de cada destinatário e guarda no relatório. {{nome}} {{telefone}} {{resumo}} {{etapa}} {{link}}
create or replace function private.atd_aviso_equipe_disparar(p_aviso public.atd_avisos_equipe, p_opp uuid, p_conversa uuid, p_contato uuid, p_resumo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_fone text; v_etapa text; v_conv uuid := p_conversa; v_corpo text; v_n int;
begin
  if not p_aviso.ativo or cardinality(p_aviso.destinatarios) = 0 then return; end if;
  -- o mesmo aviso para o mesmo cliente uma vez por dia (o card pode ir e voltar de etapa)
  if exists (select 1 from public.atd_avisos_equipe_log l where l.aviso_id = p_aviso.id and l.contato_id is not distinct from p_contato
                and l.oportunidade_id is not distinct from p_opp and l.criado_em > now() - interval '24 hours') then return; end if;
  select coalesce(nullif(btrim(ct.nome), ''), 'Cliente sem nome'), ct.telefone into v_nome, v_fone from public.contatos ct where ct.id = p_contato;
  select c.nome into v_etapa from public.oportunidades o join public.funil_colunas c on c.id = o.coluna_id where o.id = p_opp;
  if v_conv is null then
    select coalesce(o.conversa_origem_id, (select cv.id from public.conversas cv where cv.contato_id = p_contato order by cv.ultima_interacao_em desc nulls last limit 1))
      into v_conv from public.oportunidades o where o.id = p_opp;
    if v_conv is null then select cv.id into v_conv from public.conversas cv where cv.contato_id = p_contato order by cv.ultima_interacao_em desc nulls last limit 1; end if;
  end if;
  v_corpo := replace(replace(replace(replace(replace(p_aviso.modelo,
               '{{nome}}', coalesce(v_nome, 'Cliente')),
               '{{telefone}}', private.atd_fone_mascarado(v_fone)),
               '{{resumo}}', coalesce(nullif(btrim(p_resumo), ''), '—')),
               '{{etapa}}', coalesce(v_etapa, '—')),
               '{{link}}', 'abra pelo aviso');
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select p_aviso.organizacao_id, d, 'aviso_equipe', p_aviso.nome, left(v_corpo, 600),
         case when v_conv is not null then '/whatsapp?conversa=' || v_conv::text else '/kanban' end, coalesce(p_opp, v_conv)
    from unnest(p_aviso.destinatarios) d;
  get diagnostics v_n = row_count;
  insert into public.atd_avisos_equipe_log (aviso_id, organizacao_id, oportunidade_id, conversa_id, contato_id, destinatarios)
  values (p_aviso.id, p_aviso.organizacao_id, p_opp, v_conv, p_contato, v_n);
end $$;
revoke all on function private.atd_aviso_equipe_disparar(public.atd_avisos_equipe, uuid, uuid, uuid, text) from public, anon, authenticated;

-- os momentos do card (nunca derrubam a gravação do card: erro aqui vira só um aviso no log do banco)
create or replace function private.atd_avisos_do_card()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.atd_avisos_equipe; v_res text; v_col text;
begin
  begin
    if tg_op = 'INSERT' then
      for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'lead_novo' loop
        perform private.atd_aviso_equipe_disparar(a, new.id, new.conversa_origem_id, new.contato_id, coalesce(new.origem, new.fonte_aquisicao, 'entrou no Kanban'));
      end loop;
      -- já é cliente da carteira de cobranças?
      if exists (select 1 from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'cliente_carteira' and ativo and cardinality(destinatarios) > 0) then
        select l.comercial into v_res from public.leads l join public.contatos ct on ct.id = new.contato_id
         where private.atd_chave_fone(l.telefone) = private.atd_chave_fone(coalesce(ct.telefone, new.telefone)) and private.atd_chave_fone(l.telefone) is not null
         limit 1;
        if found then
          for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'cliente_carteira' loop
            perform private.atd_aviso_equipe_disparar(a, new.id, new.conversa_origem_id, new.contato_id,
              'já está na carteira de cobranças' || coalesce(' (comercial ' || nullif(btrim(v_res), '') || ')', ''));
          end loop;
        end if;
      end if;
      return new;
    end if;
    if new.coluna_id is distinct from old.coluna_id then
      select nome into v_col from public.funil_colunas where id = new.coluna_id;
      for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'etapa' and coluna_id = new.coluna_id loop
        perform private.atd_aviso_equipe_disparar(a, new.id, new.conversa_origem_id, new.contato_id, 'entrou em ' || coalesce(v_col, 'outra etapa'));
      end loop;
    end if;
    if new.status = 'ganho' and old.status is distinct from 'ganho' then
      for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'venda' loop
        perform private.atd_aviso_equipe_disparar(a, new.id, new.conversa_origem_id, new.contato_id,
          'venda marcada' || coalesce(' por ' || (select nullif(btrim(u.nome), '') from public.usuarios u where u.id = new.fechado_por_id), ''));
      end loop;
    end if;
    if new.status = 'perdido' and old.status is distinct from 'perdido' then
      for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'descartado' loop
        perform private.atd_aviso_equipe_disparar(a, new.id, new.conversa_origem_id, new.contato_id,
          coalesce(nullif(btrim(concat_ws(' — ', new.motivo_perda, new.motivo_perda_desc)), ''), 'descartado'));
      end loop;
    end if;
  exception when others then
    raise warning 'atd_avisos_do_card: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.atd_avisos_do_card() from public, anon, authenticated;
drop trigger if exists atd_avisos_do_card on public.oportunidades;
create trigger atd_avisos_do_card after insert or update of coluna_id, status on public.oportunidades
  for each row execute function private.atd_avisos_do_card();

create or replace function private.atd_avisos_da_reuniao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.atd_avisos_equipe;
begin
  begin
    for a in select * from public.atd_avisos_equipe where organizacao_id = new.organizacao_id and gatilho = 'reuniao' loop
      perform private.atd_aviso_equipe_disparar(a, null, new.conversa_id, new.contato_id,
        new.titulo || ' · ' || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'));
    end loop;
  exception when others then
    raise warning 'atd_avisos_da_reuniao: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.atd_avisos_da_reuniao() from public, anon, authenticated;
drop trigger if exists atd_avisos_da_reuniao on public.atd_reunioes;
create trigger atd_avisos_da_reuniao after insert on public.atd_reunioes for each row execute function private.atd_avisos_da_reuniao();

-- o relatório (só o administrador): quantos avisos saíram por dia e por aviso, e os últimos
create or replace function public.atd_avisos_equipe_relatorio(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 180);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'dias', v_dias,
    'total', (select count(*) from public.atd_avisos_equipe_log where organizacao_id = v_org and criado_em >= v_ini),
    'por_aviso', coalesce((select jsonb_agg(jsonb_build_object('aviso_id', a.id, 'nome', a.nome, 'qtd', x.qtd, 'pessoas', x.pessoas) order by x.qtd desc)
                             from (select aviso_id, count(*) as qtd, sum(destinatarios) as pessoas from public.atd_avisos_equipe_log where organizacao_id = v_org and criado_em >= v_ini group by 1) x
                             join public.atd_avisos_equipe a on a.id = x.aviso_id), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(r.j order by r.criado_em desc) from (
                            select l.criado_em, jsonb_build_object('quando', l.criado_em, 'aviso', a.nome, 'pessoas', l.destinatarios, 'conversa_id', l.conversa_id,
                                     'contato', coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome')) as j
                              from public.atd_avisos_equipe_log l join public.atd_avisos_equipe a on a.id = l.aviso_id
                              left join public.contatos ct on ct.id = l.contato_id
                             where l.organizacao_id = v_org and l.criado_em >= v_ini order by l.criado_em desc limit 40) r), '[]'::jsonb));
end $$;
revoke all on function public.atd_avisos_equipe_relatorio(int) from public, anon;
grant execute on function public.atd_avisos_equipe_relatorio(int) to authenticated, service_role;

-- os 7 de saída (os mesmos momentos que a Reviza tinha; os textos são do Reviza), ligados e sem destinatários
insert into public.atd_avisos_equipe (organizacao_id, chave, nome, modelo, gatilho, coluna_id, ordem)
select 'a1fa0000-0000-4000-8000-000000000001', v.chave, v.nome, v.modelo, v.gatilho,
       (select c.id from public.funil_colunas c join public.funis f on f.id = c.funil_id
         where c.organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and f.padrao and upper(c.nome) = v.etapa limit 1), v.ordem
  from (values
    ('lead_novo', 'Novo lead recebido', 'Novo lead: {{nome}} · {{telefone}} · {{resumo}}', 'lead_novo', null, 0),
    ('lead_qualificado', 'Lead qualificado', 'Lead qualificado: {{nome}} · {{telefone}} · {{resumo}}', 'etapa', 'DOCUMENTAÇÃO', 1),
    ('lead_desqualificado', 'Lead desqualificado', 'Lead desqualificado: {{nome}} · {{telefone}} · motivo: {{resumo}}', 'descartado', null, 2),
    ('contrato_enviado', 'Contrato enviado', 'Contrato enviado: {{nome}} · {{telefone}} · aguardando a assinatura', 'etapa', null, 3),
    ('contrato_assinado', 'Contrato assinado', 'Contrato assinado: {{nome}} · {{telefone}} · {{resumo}}', 'venda', null, 4),
    ('reuniao_agendada', 'Reunião agendada', 'Reunião agendada com {{nome}} · {{telefone}} · {{resumo}}', 'reuniao', null, 5),
    ('cliente_escritorio', 'Lead já é cliente do escritório', 'Atenção, cliente da casa: {{nome}} · {{telefone}} · {{resumo}}. Atender com prioridade.', 'cliente_carteira', null, 6)
  ) as v(chave, nome, modelo, gatilho, etapa, ordem)
 where exists (select 1 from public.organizacoes where id = 'a1fa0000-0000-4000-8000-000000000001')
on conflict (organizacao_id, chave) do nothing;

-- DESFAZER:
--   drop trigger if exists atd_avisos_do_card on public.oportunidades; drop trigger if exists atd_avisos_da_reuniao on public.atd_reunioes;
--   drop function if exists public.atd_avisos_equipe_relatorio(int), private.atd_avisos_da_reuniao(), private.atd_avisos_do_card(),
--     private.atd_aviso_equipe_disparar(public.atd_avisos_equipe, uuid, uuid, uuid, text), private.atd_chave_fone(text), private.atd_fone_mascarado(text), private.atd_avisos_carimbo();
--   drop table if exists public.atd_avisos_equipe_log, public.atd_avisos_equipe;
