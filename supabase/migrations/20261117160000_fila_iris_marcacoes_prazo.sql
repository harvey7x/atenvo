-- =====================================================================================
-- Fila da Iris — MARCAÇÕES COM PRAZO + AVISO QUANDO VENCE (dono 16/11: "vamo colocar um sistema nas marcações
-- aonde o atendente tem 36h horas para atualizar a marcação" + "quando o prazo terminar tem que enviar uma
-- notificação pro atendente" + "aviso tem que ser no meio da tela, obrigando a atualizar").
-- - As marcações que são tarefa (ligar de novo, recuperar/mandar a senha do Meu INSS, vai mandar documento, falta…)
--   têm um prazo: fila_iris_config.horas_marcacao (36 h). As que não são tarefa (fora da fila, correção da leitura
--   dos documentos) não têm prazo.
-- - O prazo SÓ CORRE COM O CLIENTE NA FILA DO DONO DE AGORA (revisão 16/11): vence_em = o mais tarde entre o começo
--   da janela da marcação (prazo_desde) e a entrada do cliente na fila deste dono (fila_iris_estado.na_fila_desde,
--   guardado pelo relógio dos avisos) + 36 h. Cliente que saiu da fila e voltou, ou que mudou de dono, volta com o
--   prazo inteiro (ninguém recebe marcação vencida que não tinha como ver). Trocar de prioridade não zera.
-- - Atualizar = o atendente diz o que fez (fila_iris_marcacao_atualizar, texto guardado em
--   fila_iris_marcacao_atualizacoes) e a janela recomeça. "Liguei, não atendeu" de novo (+1) também recomeça.
--   Tirar a marcação (resolvido) continua como é.
-- - A fila (fila_iris_itens_base) passa a mandar em cada marcação o vence_em e a última atualização (texto, quem,
--   o nome de quem, quando).
-- - AVISO: o relógio dos avisos (fila_iris_avisos_tick, todo minuto) grava um aviso para o dono quando a marcação
--   vence (um por vencimento: marcação + vence_em) em fila_iris_marcacao_avisos; a tela mostra NO MEIO DA TELA, em
--   qualquer página, e ele NÃO FECHA: vale (fila_iris_marcacao_avisos_meus) até a marcação ser atualizada ou tirada.
--   Só chega a quem PODE resolver (o dono do cliente pela mesma régua do atualizar e do tirar, ou administrador):
--   nunca um aviso no meio da tela que não tem como sair.
-- - RELÓGIO PARADO (revisão 16/11): sem batida do relógio dos avisos há mais de 5 min, o prazo não usa a linha do
--   relógio (começa agora: ninguém fica vencido por tempo que o relógio não viu); quando ele volta, o tempo parado
--   não conta (cada marcação que ainda corria ganha o tempo parado; a que já tinha vencido fica como estava — os
--   prazos não se juntam todos num minuto só) e nessa volta não sai aviso de marcação vencida.
-- - "Liguei, não atendeu" no aviso de "Ligar de novo" = o +1 daquela marcação (fila_iris_marcacao_ligou).
-- - As marcações que já existem começam a contar AGORA (ninguém começa com marcação vencida).
-- - atualizado_em continua sendo "quando foi marcado/religado" (a conta das marcações do período usa ele).
-- =====================================================================================
set lock_timeout = '5s';

-- trava: as três funções que mudam têm de ser as conferidas em 16/11 (cada uma muda só nos trechos trocados)
do $trava$
declare v_base text; v_marcar text; v_tick text;
begin
  select md5(prosrc) into v_base from pg_proc where oid = 'public.fila_iris_itens_base(uuid, uuid)'::regprocedure;
  select md5(prosrc) into v_marcar from pg_proc where oid = 'public.fila_iris_marcar(uuid, uuid, text, text)'::regprocedure;
  select md5(prosrc) into v_tick from pg_proc where oid = 'public.fila_iris_avisos_tick()'::regprocedure;
  if v_base is distinct from '3f24b46d33971772fc9a5a70f50d5cd3' then
    raise exception 'fila_iris_itens_base mudou depois de 16/11 (md5 %): confira antes de aplicar', v_base;
  end if;
  if v_marcar is distinct from 'a9f1ef81778a2e92f8ce184d872966a8' then
    raise exception 'fila_iris_marcar mudou depois de 16/11 (md5 %): confira antes de aplicar', v_marcar;
  end if;
  if v_tick is distinct from '5d741ab7acb671009b7479834040d6ab' then
    raise exception 'fila_iris_avisos_tick mudou depois de 16/11 (md5 %): confira antes de aplicar', v_tick;
  end if;
end
$trava$;

-- troca um trecho que tem de existir UMA vez só (senão aborta tudo)
create or replace function pg_temp.fila_trocar(p_def text, p_de text, p_para text, p_onde text)
returns text language plpgsql as $f$
begin
  if (length(p_def) - length(replace(p_def, p_de, ''))) / length(p_de) <> 1 then
    raise exception '%: o trecho "%" não está lá uma vez só', p_onde, left(p_de, 70);
  end if;
  return replace(p_def, p_de, p_para);
end
$f$;

-- 1) o prazo, em horas, na configuração da fila
alter table public.fila_iris_config add column if not exists horas_marcacao integer not null default 36
  check (horas_marcacao between 1 and 720);

-- 2) o começo da janela de cada marcação (as que já existem começam agora)
alter table public.fila_iris_marcacoes add column if not exists prazo_desde timestamptz;
update public.fila_iris_marcacoes set prazo_desde = greatest(atualizado_em, now()) where prazo_desde is null;
alter table public.fila_iris_marcacoes alter column prazo_desde set default now();
alter table public.fila_iris_marcacoes alter column prazo_desde set not null;

-- 3) desde quando o cliente está na fila DESTE dono (o relógio grava; trocar de prioridade não zera, trocar de dono sim)
alter table public.fila_iris_estado add column if not exists na_fila_desde timestamptz;
update public.fila_iris_estado set na_fila_desde = desde where na_fila_desde is null;
alter table public.fila_iris_estado alter column na_fila_desde set default now();
alter table public.fila_iris_estado alter column na_fila_desde set not null;

-- 4) o que foi feito em cada atualização
create table if not exists public.fila_iris_marcacao_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  marcacao_id uuid not null references public.fila_iris_marcacoes(id) on delete cascade,
  contato_id uuid not null,
  usuario_id uuid,
  texto text not null check (length(btrim(texto)) between 2 and 200),
  criado_em timestamptz not null default now()
);
create index if not exists fila_iris_marcacao_atualizacoes_marc_idx
  on public.fila_iris_marcacao_atualizacoes (marcacao_id, criado_em desc);
alter table public.fila_iris_marcacao_atualizacoes enable row level security;
-- sem política: só as funções (security definer) leem e gravam
revoke all on table public.fila_iris_marcacao_atualizacoes from anon, authenticated;

-- 5) os avisos de marcação vencida (um por vencimento)
create table if not exists public.fila_iris_marcacao_avisos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  usuario_id uuid not null,
  marcacao_id uuid not null references public.fila_iris_marcacoes(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  conversa_id uuid,
  nome text,
  tipo text not null,
  texto text,
  vence_em timestamptz not null,
  criado_em timestamptz not null default now(),
  unique (marcacao_id, vence_em)
);
create index if not exists fila_iris_marcacao_avisos_meus_idx
  on public.fila_iris_marcacao_avisos (usuario_id, criado_em);
alter table public.fila_iris_marcacao_avisos enable row level security;
revoke all on table public.fila_iris_marcacao_avisos from anon, authenticated;

-- 6) atualizar: o atendente diz o que fez e a janela recomeça
create or replace function public.fila_iris_marcacao_atualizar(p_org uuid, p_marcacao uuid, p_texto text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m public.fila_iris_marcacoes;
  v_txt text := btrim(coalesce(p_texto, ''));
  v_horas integer;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'sem acesso à fila' using errcode = '42501'; end if;
  select * into v_m from public.fila_iris_marcacoes where id = p_marcacao and organizacao_id = p_org for update;
  if v_m.id is null or v_m.removido_em is not null then raise exception 'Esta marcação já foi tirada.'; end if;
  if v_m.tipo not in ('nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta') then
    raise exception 'Esta marcação não tem prazo.';
  end if;
  if public.papel_na_org(p_org) <> 'admin' and public.fila_iris_dono(v_m.contato_id) is distinct from auth.uid() then
    raise exception 'este cliente é de outro atendente' using errcode = '42501';
  end if;
  if length(v_txt) < 2 then raise exception 'Escreva o que foi feito.'; end if;
  if length(v_txt) > 200 then raise exception 'O texto passou de 200 letras.'; end if;
  insert into public.fila_iris_marcacao_atualizacoes (organizacao_id, marcacao_id, contato_id, usuario_id, texto)
  values (p_org, v_m.id, v_m.contato_id, auth.uid(), v_txt);
  update public.fila_iris_marcacoes set prazo_desde = now() where id = v_m.id;
  select c.horas_marcacao into v_horas from public.fila_iris_config c where c.organizacao_id = p_org;
  return jsonb_build_object('ok', true, 'vence_em', now() + make_interval(hours => coalesce(v_horas, 36)));
end;
$$;
revoke all on function public.fila_iris_marcacao_atualizar(uuid, uuid, text) from public, anon;
grant execute on function public.fila_iris_marcacao_atualizar(uuid, uuid, text) to authenticated;

-- 7) os meus avisos de marcação vencida que ainda valem. Não há "visto": o aviso fica (no meio da tela) até a
--    marcação ser atualizada ou tirada, ou o cliente sair da minha fila. Só o que EU posso resolver (o dono do cliente
--    pela régua do atualizar/tirar — fila_iris_dono —, ou administrador): nunca um aviso que não sai. Os do mesmo
--    cliente vêm juntos, o cliente que venceu primeiro na frente; com cada um, quando foi marcada e a última atualização.
--    A leitura parte dos MEUS clientes na fila de agora (o estado do relógio) e acha o aviso pelo vencimento de agora
--    (o índice único marcacao_id + vence_em): o custo é o das marcações de hoje, não o do histórico de avisos (revisão)
create or replace function public.fila_iris_marcacao_avisos_meus(p_org uuid)
returns table (id uuid, marcacao_id uuid, contato_id uuid, conversa_id uuid, nome text, tipo text, texto text, vezes integer,
               vence_em timestamptz, criado_em timestamptz, marcada_em timestamptz, ult jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin boolean;
  v_horas integer;
begin
  if not public.fila_iris_acesso(p_org) then
    return;
  end if;
  -- sem o relógio vivo (5 min), nada: o mesmo freio dos avisos da Iris
  if not exists (select 1 from public.fila_iris_config c
                  where c.organizacao_id = p_org and c.avisos_tick_em > now() - interval '5 minutes') then
    return;
  end if;
  v_admin := coalesce(public.papel_na_org(p_org) = 'admin', false);
  select coalesce(c.horas_marcacao, 36) into v_horas from public.fila_iris_config c where c.organizacao_id = p_org;
  return query
  with vale as materialized (
    -- vale enquanto o vencimento de agora for o do aviso (a mesma conta da fila): atualizou, "+1", voltou para a
    -- fila, trocou de dono ou mudou as horas = outro vencimento, e este aviso some
    select av.id, av.marcacao_id, av.contato_id, av.conversa_id, av.nome, av.tipo, av.texto, mk.vezes, av.vence_em,
           av.criado_em, mk.criado_em as marcada
      from public.fila_iris_estado e
      join public.fila_iris_marcacoes mk
        on mk.organizacao_id = p_org and mk.contato_id = e.contato_id and mk.removido_em is null
      join public.fila_iris_marcacao_avisos av
        on av.marcacao_id = mk.id
       and av.vence_em = greatest(mk.prazo_desde, e.na_fila_desde) + make_interval(hours => v_horas)
     where e.organizacao_id = p_org and e.dono_id = auth.uid()
       and av.organizacao_id = p_org and av.usuario_id = auth.uid()
  )
  select v.id, v.marcacao_id, v.contato_id, v.conversa_id, v.nome, v.tipo, v.texto, v.vezes, v.vence_em, v.criado_em, v.marcada,
         (select jsonb_build_object('texto', au.texto, 'por', au.usuario_id,
                                    'por_nome', (select u.nome from public.usuarios u where u.id = au.usuario_id), 'em', au.criado_em)
            from public.fila_iris_marcacao_atualizacoes au
           where au.marcacao_id = v.marcacao_id
           order by au.criado_em desc limit 1)
    from vale v
     -- quem recebe tem de conseguir atualizar ou tirar (as duas exigem o dono pela fila_iris_dono, ou administrador):
     -- na troca de dono, até o relógio regravar o estado (1 min), e no cliente com cards de donos diferentes. Só nos
     -- avisos que valem (poucos): a função roda uma vez por aviso de hoje, não por linha antiga
   where v_admin or public.fila_iris_dono(v.contato_id) = auth.uid()
   order by min(v.vence_em) over (partition by v.contato_id), v.contato_id, v.vence_em, v.id
   limit 100;
end;
$$;
revoke all on function public.fila_iris_marcacao_avisos_meus(uuid) from public, anon;
grant execute on function public.fila_iris_marcacao_avisos_meus(uuid) to authenticated;

-- 7b) "Liguei, não atendeu" no aviso de "Ligar de novo": o +1 da MARCAÇÃO DO AVISO (conta a ligação e recomeça a
--     janela, como o +1 da ficha). Pela marcação, não pelo cliente: tirada no meio (o administrador, outra aba),
--     responde "Esta marcação já foi tirada." em vez de criar outra (revisão)
create or replace function public.fila_iris_marcacao_ligou(p_org uuid, p_marcacao uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_m public.fila_iris_marcacoes;
  v_horas integer;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'sem acesso à fila' using errcode = '42501'; end if;
  select * into v_m from public.fila_iris_marcacoes where id = p_marcacao and organizacao_id = p_org for update;
  if v_m.id is null or v_m.removido_em is not null then raise exception 'Esta marcação já foi tirada.'; end if;
  if v_m.tipo <> 'nao_atendeu' then raise exception 'Esta marcação não é de ligação.'; end if;
  if not coalesce(public.papel_na_org(p_org) = 'admin', false)
     and public.fila_iris_dono(v_m.contato_id) is distinct from auth.uid() then
    raise exception 'este cliente é de outro atendente' using errcode = '42501';
  end if;
  update public.fila_iris_marcacoes set vezes = vezes + 1, atualizado_em = now(), prazo_desde = now() where id = v_m.id;
  select c.horas_marcacao into v_horas from public.fila_iris_config c where c.organizacao_id = p_org;
  return jsonb_build_object('ok', true, 'vezes', v_m.vezes + 1, 'vence_em', now() + make_interval(hours => coalesce(v_horas, 36)));
end;
$$;
revoke all on function public.fila_iris_marcacao_ligou(uuid, uuid) from public, anon;
grant execute on function public.fila_iris_marcacao_ligou(uuid, uuid) to authenticated;

-- 8) "Liguei, não atendeu" de novo também recomeça a janela (só esse trecho muda na função viva)
do $marcar$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fila_iris_marcar(uuid, uuid, text, text)'::regprocedure);
  v_def := pg_temp.fila_trocar(v_def, 'set vezes = vezes + 1, atualizado_em = now()',
                               'set vezes = vezes + 1, atualizado_em = now(), prazo_desde = now()', 'fila_iris_marcar');
  execute v_def;
end
$marcar$;

-- 9) a fila manda, em cada marcação, o vence_em (contado só com o cliente na fila do dono de agora) e a última
--    atualização (só esses trechos mudam na função viva)
do $base$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fila_iris_itens_base(uuid, uuid)'::regprocedure);
  v_def := pg_temp.fila_trocar(v_def,
    '''em'', mk.atualizado_em) order by mk.atualizado_em desc) as lista,',
    '''em'', mk.atualizado_em,'
    || ' ''vence_em'', case when mk.tipo in (''nao_atendeu'', ''recuperar_senha'', ''mandar_senha'', ''mandar_doc'', ''falta'')'
    || ' then greatest(mk.prazo_desde, coalesce(fe.na_fila_desde, now())) + make_interval(hours => coalesce(cfg.horas_marcacao, 36)) end,'
    || ' ''ult'', (select jsonb_build_object(''texto'', au.texto, ''por'', au.usuario_id,'
    || ' ''por_nome'', (select u.nome from public.usuarios u where u.id = au.usuario_id), ''em'', au.criado_em)'
    || ' from public.fila_iris_marcacao_atualizacoes au where au.marcacao_id = mk.id order by au.criado_em desc limit 1))'
    || ' order by mk.atualizado_em desc) as lista,',
    'fila_iris_itens_base (lista)');
  v_def := pg_temp.fila_trocar(v_def,
    E'      from public.fila_iris_marcacoes mk\n     where mk.organizacao_id = p_org and mk.removido_em is null',
    E'      from public.fila_iris_marcacoes mk\n'
    || E'      -- o prazo só corre com o cliente na fila do dono de agora (o relógio dos avisos guarda desde quando);\n'
    || E'      -- sem a linha do relógio (acabou de entrar, ou trocou de dono), começa agora\n'
    || E'      -- (o dono pela mesma régua do relógio: o card mais novo do cliente entre TODOS os cards, não só os da fila de\n'
    || E'      -- quem pede — o vencimento é o mesmo para o atendente, o administrador e o relógio; e a linha do relógio só\n'
    || E'      -- vale com a batida viva)\n'
    || E'      left join (select distinct on (d.contato_id) d.contato_id, d.dono_id from dono d\n'
    || E'                  order by d.contato_id, d.criado_em desc nulls last, d.opp_id) fd on fd.contato_id = mk.contato_id\n'
    || E'      left join public.fila_iris_estado fe on fe.contato_id = mk.contato_id and fe.dono_id = fd.dono_id\n'
    || E'             and cfg.avisos_tick_em > now() - interval ''5 minutes''\n'
    || E'     where mk.organizacao_id = p_org and mk.removido_em is null',
    'fila_iris_itens_base (from)');
  execute v_def;
end
$base$;

-- 10) o relógio dos avisos: guarda desde quando o cliente está na fila deste dono e grava o aviso da marcação vencida
do $tick$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fila_iris_avisos_tick()'::regprocedure);
  v_def := pg_temp.fila_trocar(v_def, '  v_semente boolean;', E'  v_semente boolean;\n  v_parado boolean;',
    'fila_iris_avisos_tick (declaração)');
  v_def := pg_temp.fila_trocar(v_def,
    '      v_semente := not exists (select 1 from public.fila_iris_estado e where e.organizacao_id = cfg.organizacao_id);',
    E'      v_semente := not exists (select 1 from public.fila_iris_estado e where e.organizacao_id = cfg.organizacao_id);\n'
    || E'      -- o relógio estava parado (mais de 5 min sem batida: queda, fila desligada): o tempo parado não conta. Cada\n'
    || E'      -- marcação que ainda corria quando ele parou ganha o tempo parado — o começo da janela (o mais tarde entre\n'
    || E'      -- prazo_desde e a entrada na fila) anda o tanto que ele ficou parado; a que começou durante a parada começa\n'
    || E'      -- agora. A que já tinha vencido antes da parada fica como estava (o aviso dela continua valendo). Assim\n'
    || E'      -- ninguém fica vencido por tempo que o relógio não viu e os prazos não se juntam num minuto só. Sem batida\n'
    || E'      -- nenhuma antes (a 1ª volta), o "na fila desde" de todos começa agora. Nesta volta não sai aviso de\n'
    || E'      -- marcação vencida (dono 16/11; revisão)\n'
    || E'      v_parado := cfg.avisos_tick_em is null or cfg.avisos_tick_em < now() - interval ''5 minutes'';\n'
    || E'      if v_parado and cfg.avisos_tick_em is null then\n'
    || E'        update public.fila_iris_estado set na_fila_desde = now() where organizacao_id = cfg.organizacao_id;\n'
    || E'      elsif v_parado then\n'
    || E'        update public.fila_iris_marcacoes mk\n'
    || E'           set prazo_desde = least(now(), greatest(mk.prazo_desde, e.na_fila_desde) + (now() - cfg.avisos_tick_em))\n'
    || E'          from public.fila_iris_estado e\n'
    || E'         where e.contato_id = mk.contato_id and e.organizacao_id = cfg.organizacao_id\n'
    || E'           and mk.organizacao_id = cfg.organizacao_id and mk.removido_em is null\n'
    || E'           and mk.tipo in (''nao_atendeu'', ''recuperar_senha'', ''mandar_senha'', ''mandar_doc'', ''falta'')\n'
    || E'           and greatest(mk.prazo_desde, e.na_fila_desde) + make_interval(hours => coalesce(cfg.horas_marcacao, 36))\n'
    || E'               > cfg.avisos_tick_em;\n'
    || E'      end if;',
    'fila_iris_avisos_tick (relógio parado)');
  v_def := pg_temp.fila_trocar(v_def,
    'insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde)',
    'insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde, na_fila_desde)',
    'fila_iris_avisos_tick (colunas)');
  v_def := pg_temp.fila_trocar(v_def,
    'select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now() from atual a',
    'select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now(), now() from atual a',
    'fila_iris_avisos_tick (valores)');
  v_def := pg_temp.fila_trocar(v_def,
    'set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now()',
    E'set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now(),\n'
    || E'               na_fila_desde = case when e.dono_id is distinct from excluded.dono_id then now() else e.na_fila_desde end',
    'fila_iris_avisos_tick (troca de dono)');
  v_def := pg_temp.fila_trocar(v_def,
    'select (select count(*) from novos) into v_n;',
    E', vencidas as (\n'
    || E'        -- dono 16/11: "quando o prazo terminar tem que enviar uma notificação pro atendente" — um aviso por\n'
    || E'        -- vencimento (marcação + vence_em), só com o cliente na fila do MESMO dono desde a rodada anterior\n'
    || E'        insert into public.fila_iris_marcacao_avisos (organizacao_id, usuario_id, marcacao_id, contato_id, conversa_id, nome, tipo, texto, vence_em)\n'
    || E'        select cfg.organizacao_id, a.dono_id, (mj->>''id'')::uuid, a.contato_id, a.conversa_id, a.nome, mj->>''tipo'', mj->>''texto'',\n'
    || E'               (mj->>''vence_em'')::timestamptz\n'
    || E'          from atual a\n'
    || E'          join public.fila_iris_estado ev on ev.contato_id = a.contato_id and ev.dono_id = a.dono_id\n'
    || E'          cross join lateral jsonb_array_elements(a.marcacoes) mj\n'
    || E'         where not v_semente and not v_parado\n'
    || E'           and a.dono_id = any (cfg.usuarios)\n'
    || E'           and mj->>''vence_em'' is not null\n'
    || E'           and (mj->>''vence_em'')::timestamptz <= now()\n'
    || E'           and (mj->>''vence_em'')::timestamptz > now() - interval ''1 day''\n'
    || E'        on conflict (marcacao_id, vence_em) do nothing\n'
    || E'        returning 1\n'
    || E'      )\n'
    || E'      select (select count(*) from novos) into v_n;',
    'fila_iris_avisos_tick (aviso)');
  -- a faxina de hora em hora também leva os avisos de marcação com mais de 400 dias (a mesma régua dos avisos da Iris)
  v_def := pg_temp.fila_trocar(v_def,
    '    delete from public.fila_iris_avisos where criado_em < now() - interval ''400 days'';',
    E'    delete from public.fila_iris_avisos where criado_em < now() - interval ''400 days'';\n'
    || E'    delete from public.fila_iris_marcacao_avisos where criado_em < now() - interval ''400 days'';',
    'fila_iris_avisos_tick (faxina)');
  execute v_def;
end
$tick$;
