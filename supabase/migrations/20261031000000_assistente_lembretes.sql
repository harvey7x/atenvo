-- =============================================================================
-- LEMBRETES DA ASSISTENTE DE VOZ — pedido do dono 30/10/2026 (~23h40, literal):
-- "Eu quero que ela tenha uma opção que vai ser assim, ó. É, vai ser lembretes. Eu peço para ela me
--  lembrar alguma coisa, tal data referente a alguma coisa, e ela pega e aí no, na hora ela me lembra,
--  entendeu? Ah, me lembra amanhã de tarde, a uma hora de fazer tal coisa, entendeu? Ela vai lembrar
--  para mim."
--
-- COMO FUNCIONA
--   1. Na conversa de voz, a edge function `assistente` (modo ferramenta) cria, lista e cancela os
--      lembretes da PRÓPRIA pessoa: assistente_lembrete_criar / assistente_lembretes_listar /
--      assistente_lembrete_cancelar — só service_role, com o id autenticado em p_ator, conferindo o
--      vínculo ATIVO como as RPCs assistente_* de 20261030230000 (sem vínculo → exceção 'sem_acesso').
--      O modelo manda a data e a hora de Brasília ('AAAA-MM-DDTHH:MM') ou, para "daqui a 20 minutos",
--      p_em_minutos (o servidor soma no relógio dele). A resposta já traz o dia da semana, a data por
--      extenso e a hora falada ("à uma da tarde") para a confirmação em voz: o modelo não calcula dia
--      da semana.
--   2. Na hora: o cron 'assistente-lembretes' (1 min) chama assistente_lembretes_disparar(): cada
--      pendente vencido vira UMA notificação no SINO (tabela notificacoes — a mesma em que o aviso
--      "passado para você" grava, avisos_passado_humano_tick / cron 110 —, tipo 'lembrete', só para a
--      dona/o dono do lembrete, ref_id = id do lembrete) e passa a 'avisado'.
--   3. A tela (Atenvo aberto) busca meus_lembretes_devidos(org) e abre o aviso na hora; "Ok" →
--      lembrete_confirmar(id); "Lembrar em 10 min" → lembrete_adiar(id, 10). Os dois também tiram a
--      notificação do lembrete das não lidas do sino. (authenticated, auth.uid(), só os próprios.)
--
-- ESTADOS: pendente → avisado (o cron gravou no sino) → ok (a pessoa confirmou); pendente → cancelado
-- (pedido por voz). Adiar volta para pendente com quando = agora + minutos. Confirmar direto de pendente
-- vale (a tela avisa no segundo exato; o cron passa no minuto seguinte e aí não grava mais nada).
--
-- PRIVACIDADE: o texto é guardado JÁ HIGIENIZADO (assistente_lembrete_texto): e-mails (inteiros,
-- parciais e falados) e sequências numéricas — a mesma máscara de assistente_trecho: telefone com DDD,
-- CPF com ponto ou vírgula, número de benefício — viram '••••'. Se o texto fala de senha, o valor depois
-- de "senha:" / "senha =" / "senha é" e as palavras com letra E número (Maria2024) também: senha de
-- cliente não fica no banco, não vai para o sino e não é falada. Só a própria pessoa vê os lembretes.
--
-- Tabela nova: RLS ligada, sem policy, sem grant para anon/authenticated; só service_role (GOTCHA do
-- projeto: tabela nova não herda grant). A tela lê e muda só pelas RPCs.
-- =============================================================================

-- ---------------------------------------------------------------- tabela
create table if not exists public.assistente_lembretes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  texto          text not null check (char_length(texto) between 1 and 200),
  quando         timestamptz not null,
  status         text not null default 'pendente'
                   check (status in ('pendente', 'avisado', 'ok', 'cancelado')),
  criado_em      timestamptz not null default now(),
  avisado_em     timestamptz,
  confirmado_em  timestamptz,
  origem         text not null default 'voz'
);
-- o disparo (cron de 1 min) só olha os pendentes vencidos
create index if not exists idx_assistente_lembretes_pendentes
  on public.assistente_lembretes (quando) where status = 'pendente';
-- listar, devidos e o teto de 50: por pessoa
create index if not exists idx_assistente_lembretes_usuario
  on public.assistente_lembretes (usuario_id, quando) where status in ('pendente', 'avisado');
alter table public.assistente_lembretes enable row level security;
revoke all on public.assistente_lembretes from public, anon, authenticated;
grant select, insert, update on public.assistente_lembretes to service_role;

-- ---------------------------------------------------------------- helpers internos (sem grant)

-- 0..59 por extenso, no masculino (os minutos: "e cinco", "e vinte e um")
create or replace function public.assistente_lembrete_numero(p_n int)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_n between 0 and 19 then
      (array['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze',
             'treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove'])[p_n + 1]
    when p_n between 20 and 59 then
      (array['vinte','trinta','quarenta','cinquenta'])[p_n / 10 - 1]
      || case when p_n % 10 = 0 then ''
              else ' e ' || (array['um','dois','três','quatro','cinco','seis','sete','oito','nove'])[p_n % 10] end
  end
$$;

-- a hora como se fala, no fuso do CAF: "à uma da tarde", "às três e meia da tarde", "ao meio-dia",
-- "à meia-noite e dez", "às oito e quinze da manhã", "às onze e cinquenta e nove da noite"
-- (1h–4h da madrugada · 5h–11h da manhã · 13h–18h da tarde · 19h–23h da noite)
create or replace function public.assistente_lembrete_hora_falada(p_ts timestamptz)
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select case when x.h = 0 then 'à meia-noite'
              when x.h = 12 then 'ao meio-dia'
              when x.h % 12 = 1 then 'à uma'
              else 'às ' || (array['uma','duas','três','quatro','cinco','seis','sete','oito','nove','dez',
                                   'onze'])[x.h % 12]
         end
         || case when x.m = 0 then '' when x.m = 30 then ' e meia'
                 else ' e ' || public.assistente_lembrete_numero(x.m) end
         || case when x.h between 1 and 4 then ' da madrugada'
                 when x.h between 5 and 11 then ' da manhã'
                 when x.h between 13 and 18 then ' da tarde'
                 when x.h between 19 and 23 then ' da noite'
                 else '' end
  from (select extract(hour from y.l)::int as h, extract(minute from y.l)::int as m
          from (select p_ts at time zone 'America/Sao_Paulo' as l) y) x
$$;

-- o instante do lembrete para a voz e para a tela, no fuso do CAF:
-- {"quando":"2026-10-31T13:00:00-03:00","quando_local":"2026-10-31T13:00","hora":"13:00",
--  "hora_falada":"à uma da tarde","dia_semana":"sábado","data_extenso":"31 de outubro",
--  "dia_relativo":"amanhã"}
-- dia_relativo: ontem | hoje | amanhã | depois de amanhã | null. data_extenso: "1º de novembro" no
-- dia 1; com o ano quando não é o ano corrente ("5 de janeiro de 2027").
create or replace function public.assistente_lembrete_quando(p_ts timestamptz)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'quando', public.assistente_iso(p_ts),
    'quando_local', to_char(x.l, 'YYYY-MM-DD"T"HH24:MI'),
    'hora', to_char(x.l, 'HH24:MI'),
    'hora_falada', public.assistente_lembrete_hora_falada(p_ts),
    'dia_semana', (array['segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira',
                         'sábado','domingo'])[extract(isodow from x.l)::int],
    'data_extenso', case when extract(day from x.l) = 1 then '1º' else extract(day from x.l)::int::text end
                    || ' de ' || (array['janeiro','fevereiro','março','abril','maio','junho','julho',
                                        'agosto','setembro','outubro','novembro','dezembro'])[extract(month from x.l)::int]
                    || case when extract(year from x.l) <> extract(year from x.hoje)
                            then ' de ' || extract(year from x.l)::int::text else '' end,
    'dia_relativo', case x.l::date - x.hoje when -1 then 'ontem' when 0 then 'hoje' when 1 then 'amanhã'
                                            when 2 then 'depois de amanhã' end)
  from (select p_ts at time zone 'America/Sao_Paulo' as l,
               (now() at time zone 'America/Sao_Paulo')::date as hoje) x
$$;

-- um lembrete no formato único de todas as RPCs: {"id","texto"} + o instante (assistente_lembrete_quando)
create or replace function public.assistente_lembrete_item(p_id uuid, p_texto text, p_quando timestamptz)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', p_id, 'texto', p_texto) || public.assistente_lembrete_quando(p_quando)
$$;

-- o texto do lembrete como fica guardado: uma linha só, sem aspas nem ponto nas pontas; e-mails
-- (inteiros, parciais e falados) e sequências numéricas — a mesma máscara de assistente_trecho
-- (telefone com DDD, CPF com ponto ou vírgula, benefício) — viram '••••'. Se fala de senha: o valor
-- depois de "senha:", "senha =" ou "senha é" (com até 3 palavras no meio: "senha dela é …") e as
-- palavras com letra E número (Maria2024) também. "trocar a senha do wifi" fica como está.
-- null = não sobrou nada.
create or replace function public.assistente_lembrete_texto(p_txt text)
returns text
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  t text := coalesce(p_txt, '');
begin
  t := regexp_replace(t, '[[:cntrl:]]+', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');
  t := regexp_replace(t, '[[:alnum:]._%+-]+@([[:alnum:].-]+(\.[[:alpha:]]{2,})?)?', '••••', 'g');
  t := regexp_replace(t, '[[:alnum:]._%+-]+ arroba [[:alnum:]._-]+( ponto [[:alpha:]]+)*', '••••', 'gi');
  -- senha ANTES dos dígitos: "Antonio1952" sai inteiro (depois dos dígitos sobraria "Antonio••••")
  if t ~* 'senha' then
    t := regexp_replace(t, '(senha(\s+[[:alpha:]]+){0,3}\s*(:|=|\sé)\s*)[^[:space:],;.]{3,}', '\1••••', 'gi');
    t := regexp_replace(t, '\m(?=[[:alnum:]]*[[:digit:]])(?=[[:alnum:]]*[[:alpha:]])[[:alnum:]]+\M', '••••', 'g');
  end if;
  t := regexp_replace(t, '\(?\d[\d.,\-/ ()]{2,}\d', '••••', 'g');
  t := btrim(t, ' "''“”‘’.');
  return nullif(t, '');
end
$$;

-- ---------------------------------------------------------------- RPCs da assistente (só service_role)

-- 1. cria um lembrete para a PRÓPRIA pessoa (p_ator). Quando: p_em_minutos ("daqui a 20 minutos": o
--    servidor soma no relógio dele; vence o p_quando_local se vierem os dois) ou p_quando_local
--    'AAAA-MM-DDTHH:MM' no horário de Brasília (aceita espaço no lugar do T, segundos e o "-03:00" no
--    fim, que são ignorados). Regras: no futuro (≥ agora + 1 min), até 365 dias, até 50 pendentes por
--    pessoa; texto higienizado (assistente_lembrete_texto) com 1..200 caracteres e alguma letra.
--    → {"id","texto","quando","quando_local","hora","hora_falada","dia_semana","data_extenso","dia_relativo"}
--      (+ "ja_existia":true quando o MESMO texto já estava marcado para o mesmo minuto — o modelo repetiu a
--       ferramenta: devolve o que existe, sem criar outro)
--    | {"erro": "quando_invalido" | "no_passado" | "longe_demais" | "texto_invalido" | "lembretes_demais"}
create or replace function public.assistente_lembrete_criar(p_org uuid, p_ator uuid, p_texto text,
                                                            p_quando_local text default null,
                                                            p_em_minutos int default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_txt    text;
  v_local  text := btrim(coalesce(p_quando_local, ''));
  v_quando timestamptz;
  v_id     uuid;
  v_texto  text;
  v_q_ex   timestamptz;
begin
  if public.assistente_papel(p_org, p_ator) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  if char_length(coalesce(p_texto, '')) > 1000 then return jsonb_build_object('erro', 'texto_invalido'); end if;
  v_txt := public.assistente_lembrete_texto(p_texto);
  if v_txt is null or v_txt !~ '[[:alpha:]]' or char_length(v_txt) > 200 then
    return jsonb_build_object('erro', 'texto_invalido');
  end if;

  if p_em_minutos is not null then
    if p_em_minutos < 1 then return jsonb_build_object('erro', 'no_passado'); end if;
    if p_em_minutos > 525600 then return jsonb_build_object('erro', 'longe_demais'); end if;
    v_quando := now() + make_interval(mins => p_em_minutos);
  elsif v_local ~ '^\d{4}-\d{2}-\d{2}[T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(-03(:?00)?)?$' then
    begin
      v_quando := (left(v_local, 16)::timestamp) at time zone 'America/Sao_Paulo';
    exception when others then   -- 30 de fevereiro, mês 13…
      return jsonb_build_object('erro', 'quando_invalido');
    end;
  else
    return jsonb_build_object('erro', 'quando_invalido');
  end if;
  if v_quando < now() + interval '1 minute' then return jsonb_build_object('erro', 'no_passado'); end if;
  if v_quando > now() + interval '365 days' then return jsonb_build_object('erro', 'longe_demais'); end if;

  -- uma pessoa por vez: o teto e o "já existia" não correm em paralelo
  perform pg_advisory_xact_lock(hashtext('assistente_lembrete'), hashtext(p_ator::text));

  select l.id, l.texto, l.quando into v_id, v_texto, v_q_ex
    from public.assistente_lembretes l
   where l.organizacao_id = p_org and l.usuario_id = p_ator and l.status = 'pendente'
     and date_trunc('minute', l.quando) = date_trunc('minute', v_quando)
     and public.assistente_norm(l.texto) = public.assistente_norm(v_txt)
   order by l.criado_em
   limit 1;
  if v_id is not null then
    return public.assistente_lembrete_item(v_id, v_texto, v_q_ex) || jsonb_build_object('ja_existia', true);
  end if;

  if (select count(*) from public.assistente_lembretes l
       where l.organizacao_id = p_org and l.usuario_id = p_ator and l.status = 'pendente') >= 50 then
    return jsonb_build_object('erro', 'lembretes_demais');
  end if;

  insert into public.assistente_lembretes (organizacao_id, usuario_id, texto, quando)
  values (p_org, p_ator, v_txt, v_quando)
  returning id into v_id;
  return public.assistente_lembrete_item(v_id, v_txt, v_quando);
end
$$;

-- 2. os lembretes PENDENTES da própria pessoa, do mais próximo ao mais distante (no máximo 50, o teto)
--    → {"total":2,"lembretes":[{item}]}
create or replace function public.assistente_lembretes_listar(p_org uuid, p_ator uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  if public.assistente_papel(p_org, p_ator) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
           'total', count(*),
           'lembretes', coalesce(jsonb_agg(public.assistente_lembrete_item(l.id, l.texto, l.quando)
                                           order by l.quando, l.id), '[]'::jsonb))
    into v_res
    from public.assistente_lembretes l
   where l.organizacao_id = p_org and l.usuario_id = p_ator and l.status = 'pendente';
  return v_res;
end
$$;

-- 3. cancela UM lembrete pendente da própria pessoa. p_busca = o id (de listar ou das opções) ou palavras
--    do texto, sem acento/caixa: "lembrete", artigos e preposições não contam e TODAS as palavras que
--    sobram têm de estar no texto. Sem palavra que sobre ("cancela o lembrete") = todos os pendentes são
--    candidatos (um só → cancela; vários → ambíguo).
--    → {"ok":true,"cancelado":{item}} | {"erro":"nao_encontrado"}
--      | {"erro":"ambiguo","opcoes":[{item}]}   (até 10, do mais próximo; nada é cancelado)
create or replace function public.assistente_lembrete_cancelar(p_org uuid, p_ator uuid, p_busca text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_busca    text := btrim(coalesce(p_busca, ''));
  v_palavras text[];
  v_ids      uuid[];
  v_item     jsonb;
begin
  if public.assistente_papel(p_org, p_ator) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  if v_busca ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select array_agg(l.id) into v_ids
      from public.assistente_lembretes l
     where l.id = v_busca::uuid and l.organizacao_id = p_org and l.usuario_id = p_ator
       and l.status = 'pendente';
  else
    select coalesce(array_agg(w), '{}'::text[]) into v_palavras
      from unnest(string_to_array(public.assistente_norm(v_busca), ' ')) w
     where char_length(w) >= 2
       and w <> all (array['os','as','um','uns','uma','umas','de','do','da','dos','das','em','no','na','nos',
                           'nas','ao','aos','para','pra','pro','pras','pros','com','que','meu','minha','meus',
                           'minhas','esse','essa','esses','essas','este','esta','isso','aquele','aquela',
                           'sobre','por','favor','me','lembrete','lembretes','lembrar','lembra','cancela',
                           'cancelar','cancele','apaga','apagar','apague','tira','tirar','desmarca','desmarcar']);
    select array_agg(l.id order by l.quando, l.id) into v_ids
      from public.assistente_lembretes l
     where l.organizacao_id = p_org and l.usuario_id = p_ator and l.status = 'pendente'
       and not exists (select 1 from unnest(v_palavras) w
                        where position(w in public.assistente_norm(l.texto)) = 0);
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return jsonb_build_object('erro', 'nao_encontrado');
  end if;
  if cardinality(v_ids) > 1 then
    return jsonb_build_object('erro', 'ambiguo', 'opcoes', (
      select jsonb_agg(public.assistente_lembrete_item(l.id, l.texto, l.quando) order by l.quando, l.id)
        from public.assistente_lembretes l
       where l.id = any (v_ids[1:10])));
  end if;
  update public.assistente_lembretes l set status = 'cancelado'
   where l.id = v_ids[1] and l.status = 'pendente'
  returning public.assistente_lembrete_item(l.id, l.texto, l.quando) into v_item;
  if v_item is null then return jsonb_build_object('erro', 'nao_encontrado'); end if;  -- disparou no meio
  return jsonb_build_object('ok', true, 'cancelado', v_item);
end
$$;

-- ---------------------------------------------------------------- RPCs da tela (authenticated, só os próprios)

-- 4. o que a tela precisa agendar/mostrar AGORA (auth.uid() com vínculo ativo na org): os pendentes até
--    daqui a 24 h e os avisados sem confirmação, os dois de até 12 h atrás (atrasado = já passou da hora:
--    a tela mostra ao abrir). faltam_ms = milissegundos até a hora pelo relógio do SERVIDOR (negativo =
--    atrasado): a tela agenda por ele, sem depender do relógio do notebook.
--    → {"agora":"…-03:00","primeiro_nome":"Matheus",
--       "lembretes":[{item} + "status":"pendente"|"avisado","atrasado":bool,"faltam_ms":int]}
--    (do mais próximo ao mais distante; sem auth → exceção 'nao_autenticado'; sem vínculo → 'sem_acesso')
create or replace function public.meus_lembretes_devidos(p_org uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'insufficient_privilege'; end if;
  if public.assistente_papel(p_org, v_uid) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
           'agora', public.assistente_iso(now()),
           'primeiro_nome', split_part(coalesce(public.assistente_nome_usuario(v_uid), ''), ' ', 1),
           'lembretes', coalesce(jsonb_agg(
               public.assistente_lembrete_item(l.id, l.texto, l.quando)
               || jsonb_build_object('status', l.status,
                                     'atrasado', l.quando <= now(),
                                     'faltam_ms', round(extract(epoch from l.quando - now()) * 1000)::bigint)
               order by l.quando, l.id), '[]'::jsonb))
    into v_res
    from public.assistente_lembretes l
   where l.organizacao_id = p_org and l.usuario_id = v_uid
     and l.status in ('pendente', 'avisado')
     and l.quando >= now() - interval '12 hours'
     and l.quando <= now() + interval '24 hours';
  return v_res;
end
$$;

-- 5. "Ok" no aviso: confirma o lembrete da própria pessoa (pendente ou avisado → ok, confirmado_em) e tira a
--    notificação dele das não lidas do sino. Já confirmado ou cancelado: nada muda (ok:true com o status).
--    De outra pessoa ou inexistente: {"erro":"nao_encontrado"}.
--    → {"ok":true,"id","status":"ok"|"cancelado"}
create or replace function public.lembrete_confirmar(p_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_status text;
  v_criado timestamptz;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'insufficient_privilege'; end if;
  select l.organizacao_id, l.status, l.criado_em into v_org, v_status, v_criado
    from public.assistente_lembretes l
   where l.id = p_id and l.usuario_id = v_uid
   for update;
  if not found then return jsonb_build_object('erro', 'nao_encontrado'); end if;
  if public.assistente_papel(v_org, v_uid) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_status in ('pendente', 'avisado') then
    update public.assistente_lembretes set status = 'ok', confirmado_em = now() where id = p_id;
    v_status := 'ok';
  end if;
  update public.notificacoes n set lida_em = now()
   where n.organizacao_id = v_org and n.usuario_id = v_uid and n.tipo = 'lembrete' and n.ref_id = p_id
     and n.lida_em is null and n.criado_em >= v_criado;
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end
$$;

-- 6. "Lembrar em 10 min": volta a pendente com quando = agora + p_minutos (5..120), zera avisado/confirmado e
--    tira a notificação anterior das não lidas do sino (o cron grava outra na nova hora). Cancelado não volta.
--    → {"ok":true} + {item} + "status":"pendente","atrasado":false,"faltam_ms"
--    | {"erro": "minutos_invalidos" | "nao_encontrado" | "cancelado"}
create or replace function public.lembrete_adiar(p_id uuid, p_minutos int)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_status text;
  v_texto  text;
  v_criado timestamptz;
  v_quando timestamptz;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'insufficient_privilege'; end if;
  if p_minutos is null or p_minutos < 5 or p_minutos > 120 then
    return jsonb_build_object('erro', 'minutos_invalidos');
  end if;
  select l.organizacao_id, l.status, l.texto, l.criado_em into v_org, v_status, v_texto, v_criado
    from public.assistente_lembretes l
   where l.id = p_id and l.usuario_id = v_uid
   for update;
  if not found then return jsonb_build_object('erro', 'nao_encontrado'); end if;
  if public.assistente_papel(v_org, v_uid) is null then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;
  if v_status = 'cancelado' then return jsonb_build_object('erro', 'cancelado'); end if;
  v_quando := now() + make_interval(mins => p_minutos);
  update public.assistente_lembretes
     set status = 'pendente', quando = v_quando, avisado_em = null, confirmado_em = null
   where id = p_id;
  update public.notificacoes n set lida_em = now()
   where n.organizacao_id = v_org and n.usuario_id = v_uid and n.tipo = 'lembrete' and n.ref_id = p_id
     and n.lida_em is null and n.criado_em >= v_criado;
  return jsonb_build_object('ok', true)
         || public.assistente_lembrete_item(p_id, v_texto, v_quando)
         || jsonb_build_object('status', 'pendente', 'atrasado', false, 'faltam_ms', p_minutos::bigint * 60000);
end
$$;

-- ---------------------------------------------------------------- disparo (cron de 1 min)

-- 7. cada pendente vencido vira UMA notificação no sino da dona/do dono (tipo 'lembrete', título 'Lembrete',
--    corpo = o texto, sem rota, ref_id = id do lembrete) e passa a 'avisado' — no MESMO comando: não avisa
--    duas vezes (outra rodada em paralelo pula pelo advisory lock e pelo skip locked). → {"avisados": n}
create or replace function public.assistente_lembretes_disparar()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if not pg_try_advisory_xact_lock(hashtext('assistente_lembretes_disparar')) then
    return jsonb_build_object('pulou', 'lock');
  end if;
  with vencidos as (
    select l.id
      from public.assistente_lembretes l
     where l.status = 'pendente' and l.quando <= now()
     order by l.quando
     limit 500
     for update skip locked
  ), avisados as (
    update public.assistente_lembretes l
       set status = 'avisado', avisado_em = now()
      from vencidos v
     where l.id = v.id
    returning l.id, l.organizacao_id, l.usuario_id, l.texto
  ), sino as (
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    select a.organizacao_id, a.usuario_id, 'lembrete', 'Lembrete', a.texto, null, a.id
      from avisados a
    returning 1
  )
  select count(*) into v_n from sino;
  return jsonb_build_object('avisados', v_n);
end
$$;

-- ---------------------------------------------------------------- permissões
-- helpers internos: ninguém de fora chama (só as RPCs acima, como dono)
revoke all on function public.assistente_lembrete_numero(int) from public, anon, authenticated;
revoke all on function public.assistente_lembrete_hora_falada(timestamptz) from public, anon, authenticated;
revoke all on function public.assistente_lembrete_quando(timestamptz) from public, anon, authenticated;
revoke all on function public.assistente_lembrete_item(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.assistente_lembrete_texto(text) from public, anon, authenticated;

-- da assistente: SÓ a edge function (service_role), com o id autenticado em p_ator
revoke all on function public.assistente_lembrete_criar(uuid, uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.assistente_lembretes_listar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assistente_lembrete_cancelar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assistente_lembrete_criar(uuid, uuid, text, text, int) to service_role;
grant execute on function public.assistente_lembretes_listar(uuid, uuid) to service_role;
grant execute on function public.assistente_lembrete_cancelar(uuid, uuid, text) to service_role;

-- da tela: a própria pessoa logada (auth.uid())
revoke all on function public.meus_lembretes_devidos(uuid) from public, anon;
revoke all on function public.lembrete_confirmar(uuid) from public, anon;
revoke all on function public.lembrete_adiar(uuid, int) from public, anon;
grant execute on function public.meus_lembretes_devidos(uuid) to authenticated;
grant execute on function public.lembrete_confirmar(uuid) to authenticated;
grant execute on function public.lembrete_adiar(uuid, int) to authenticated;

-- disparo: só o cron (postgres)
revoke all on function public.assistente_lembretes_disparar() from public, anon, authenticated;

-- ---------------------------------------------------------------- cron (nome único; rodar de novo só atualiza)
select cron.schedule('assistente-lembretes', '* * * * *', $$ select public.assistente_lembretes_disparar(); $$);

notify pgrst, 'reload schema';
