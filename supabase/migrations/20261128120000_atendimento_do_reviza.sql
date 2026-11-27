-- 28/11 (dono: "copiar tudo do Reviza, uma única publicação") — ATENDIMENTO DO REVIZA NO ATENVO.
-- Junta as migrações 94, 96–99, 101–103, 105–114, 116, 120, 121 e 123–126 do Reviza (todas ADITIVAS: só criam peças novas atd_*)
-- sobre o banco do Atenvo. A estrutura do Atendimento do Reviza é cópia da do Atenvo, então os nomes são os mesmos; as diferenças:
--   · 3 tabelas entram lá com outro nome (atd_notificacoes, atd_wa_optout, atd_integracoes) → aqui viram VIEWS sobre as originais;
--   · is_at_least, private.registrar, equipes e atd_vejo_conversa vêm das Cobranças/perfis do Reviza → versões para o Atenvo
--     (papéis de organizacao_usuarios; sem profiles).
-- NÃO entram: 95 (fotos), 100 (IA própria), 104 (coletor), 115 (senha das IAs), 117–119 e 122 (importação Guimoo), 127 (Brasil todo —
-- desligaria a regra do RS da CAF) e 128. Tudo que envia mensagem sozinho (retomada, aviso de espera, resumo, lembrete, disparos)
-- chega DESLIGADO. DESFAZER: cada bloco tem o seu.
set check_function_bodies = off;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ===== compat 1: tabelas que o Reviza renomeou =====
create or replace view public.atd_notificacoes with (security_invoker = true) as select * from public.notificacoes;
create or replace view public.atd_wa_optout with (security_invoker = true) as select * from public.wa_optout;
grant select, insert, update, delete on public.atd_notificacoes, public.atd_wa_optout to authenticated, service_role;

-- ===== compat 2: papel mínimo da pessoa logada (Reviza: profiles; Atenvo: organizacao_usuarios) =====
create or replace function public.is_at_least(p_papel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizacao_usuarios ou
                  where ou.usuario_id = auth.uid() and ou.status = 'ativo'
                    and case p_papel when 'admin' then ou.papel::text = 'admin'
                                     when 'gestor' then ou.papel::text in ('admin', 'supervisor')
                                     when 'supervisor' then ou.papel::text in ('admin', 'supervisor')
                                     else true end)
$$;
revoke all on function public.is_at_least(text) from public, anon;
grant execute on function public.is_at_least(text) to authenticated, service_role;

-- ===== compat 3: o registro do que cada pessoa fez (private.registrar) =====
create table if not exists public.atd_registros (
  id             bigint generated always as identity primary key,
  organizacao_id uuid,
  usuario_id     uuid default auth.uid(),
  acao           text not null,
  tipo           text not null,
  ref            text,
  nome           text,
  detalhe        text,
  criado_em      timestamptz not null default now()
);
create index if not exists atd_registros_data on public.atd_registros (criado_em desc);
alter table public.atd_registros enable row level security;
revoke all on public.atd_registros from public, anon, authenticated;
grant select on public.atd_registros to authenticated;
grant all on public.atd_registros to service_role;
drop policy if exists atd_registros_admin on public.atd_registros;
create policy atd_registros_admin on public.atd_registros for select to authenticated using ((select public.is_at_least('admin')));
create or replace function private.registrar(p_acao text, p_tipo text, p_ref text, p_nome text, p_detalhe text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.atd_registros (organizacao_id, usuario_id, acao, tipo, ref, nome, detalhe)
  values ((select ou.organizacao_id from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1), auth.uid(), p_acao, p_tipo, p_ref, p_nome, p_detalhe);
exception when others then null;   -- registrar nunca derruba a operação
end $$;
revoke all on function private.registrar(text, text, text, text, text) from public, anon, authenticated;

-- ===== compat 4: equipes (gerente, membros e números) e o que cada pessoa vê =====
create table if not exists public.equipes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(btrim(nome)) between 2 and 40),
  gerente_id uuid references public.usuarios(id) on delete set null,
  membros    uuid[] not null default '{}',
  canais     uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists equipes_nome_uniq on public.equipes (lower(btrim(nome)));
alter table public.equipes enable row level security;
revoke all on public.equipes from public, anon;
grant select, insert, update, delete on public.equipes to authenticated;
grant all on public.equipes to service_role;
drop policy if exists equipes_sel on public.equipes;
create policy equipes_sel on public.equipes for select to authenticated using (true);
drop policy if exists equipes_ins on public.equipes;
create policy equipes_ins on public.equipes for insert to authenticated with check ((select public.is_at_least('admin')));
drop policy if exists equipes_upd on public.equipes;
create policy equipes_upd on public.equipes for update to authenticated using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
drop policy if exists equipes_del on public.equipes;
create policy equipes_del on public.equipes for delete to authenticated using ((select public.is_at_least('admin')));
create or replace function public.equipe_pessoas_que_vejo()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}')
    from (select auth.uid() as x
          union all
          select unnest(e.membros) from public.equipes e where e.gerente_id = auth.uid()) t
   where x is not null
     and exists (select 1 from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo')
$$;
create or replace function public.equipe_canais_que_vejo()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}')
    from public.equipes e cross join lateral unnest(e.canais) c
   where e.gerente_id = auth.uid()
     and exists (select 1 from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo')
$$;
revoke all on function public.equipe_pessoas_que_vejo(), public.equipe_canais_que_vejo() from public, anon;
grant execute on function public.equipe_pessoas_que_vejo(), public.equipe_canais_que_vejo() to authenticated, service_role;
create or replace function public.atd_vejo_conversa(p_conversa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_at_least('admin') or exists (
    select 1 from public.conversas cv join public.contatos ct on ct.id = cv.contato_id
     where cv.id = p_conversa
       and (ct.responsavel_id = any (public.equipe_pessoas_que_vejo())
            or coalesce(cv.canal_id, cv.ultimo_canal_id, cv.canal_origem_id) = any (public.equipe_canais_que_vejo())))
$$;
revoke all on function public.atd_vejo_conversa(uuid) from public, anon;
grant execute on function public.atd_vejo_conversa(uuid) to authenticated, service_role;


-- ===================== 20261124_94_receber_de_outros_sistemas.sql =====================
-- 94 — RECEBER DE OUTROS SISTEMAS (webhook de entrada), dono 23/11: "a URA faz uma ligação pro cliente,
-- você tem interesse? Se a pessoa diz que sim, a URA manda uma mensagem para o cliente… eles falaram que
-- tem como integrar com o nosso via um webhook, para quando for enviada a mensagem chegue no nosso sistema."
-- Cada ENTRADA é um endereço com uma chave secreta (Configurações › Integrações › Receber de outros sistemas).
-- O sistema de fora chama o endereço com o telefone, o nome e a mensagem; aqui isso vira (ou reaproveita) o
-- contato, a conversa no número de WhatsApp do Atendimento escolhido e o lead em LEAD NOVO no Kanban.
-- Quem chama é a função entrada-webhook (servidor); a tela só cria, liga/desliga e mostra o que chegou.
-- FORMATO DA URA REVERSA (Telein, vídeo que o dono mandou em 24/11): na campanha, em "Executar ao selecionar uma
-- opção", vai um endereço chamado por GET com os dados no próprio endereço:
--   <endereço>?nome=*nome*&telefone=*numero*&mailing=*mailing*&campanha=*campanha*&opcao=*opcao*&email=*email*&endereco=*endereco*&cidade=*cidade*
-- A Telein troca cada *marcador* pelo valor; o que ela não tem fica com o marcador cru (ex.: "*cidade") — aqui isso
-- conta como vazio. "opcao" é a tecla que o cliente apertou no fim do áudio: a entrada pode aceitar só algumas.
-- ADITIVA. Depende da 93 (Atendimento). DESFAZER no fim.

create table if not exists public.atd_entradas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null default 'de300000-0000-4000-8000-000000000001' references public.organizacoes(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 40),
  chave text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  canal_id uuid references public.canais(id) on delete set null,
  -- só as teclas desta lista viram lead (ex.: {1}); vazio = qualquer opção
  opcoes text[],
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  ultimo_evento_em timestamptz,
  total_eventos integer not null default 0
);
create table if not exists public.atd_entrada_eventos (
  id bigint generated always as identity primary key,
  entrada_id uuid not null references public.atd_entradas(id) on delete cascade,
  recebido_em timestamptz not null default now(),
  resultado text not null check (resultado in ('ok', 'teste', 'ignorada', 'sem_telefone', 'desligada', 'sem_numero', 'erro')),
  telefone text, nome text, mensagem text,
  contato_id uuid references public.contatos(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  detalhe text,
  payload jsonb
);
create index if not exists atd_entrada_eventos_entrada_idx on public.atd_entrada_eventos (entrada_id, recebido_em desc);

alter table public.atd_entradas enable row level security;
alter table public.atd_entrada_eventos enable row level security;
revoke all on public.atd_entradas, public.atd_entrada_eventos from public, anon, authenticated;
grant select, insert, update, delete on public.atd_entradas to authenticated;
grant select on public.atd_entrada_eventos to authenticated;
grant all on public.atd_entradas, public.atd_entrada_eventos to service_role;
drop policy if exists atd_entradas_admin on public.atd_entradas;
create policy atd_entradas_admin on public.atd_entradas for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
drop policy if exists atd_entrada_eventos_admin on public.atd_entrada_eventos;
create policy atd_entrada_eventos_admin on public.atd_entrada_eventos for select to authenticated
  using ((select public.is_at_least('admin')));

-- o que chega vira um registro (quem criou, ligou/desligou ou excluiu a entrada)
create or replace function private.atd_entradas_registra()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.registrar('excluiu', 'integração', old.id::text, old.nome, 'endereço para receber de outros sistemas');
  elsif tg_op = 'INSERT' then
    perform private.registrar('criou', 'integração', new.id::text, new.nome, 'endereço para receber de outros sistemas');
  elsif new.ativo is distinct from old.ativo or new.canal_id is distinct from old.canal_id or new.nome is distinct from old.nome then
    perform private.registrar('alterou', 'integração', new.id::text, new.nome,
      case when new.ativo is distinct from old.ativo then case when new.ativo then 'ligou o recebimento' else 'desligou o recebimento' end else 'mudou o nome ou o número' end);
  end if;
  return null;
end $$;
drop trigger if exists atd_entradas_registra on public.atd_entradas;
create trigger atd_entradas_registra after insert or update or delete on public.atd_entradas
  for each row execute function private.atd_entradas_registra();

-- lê um campo do que o sistema de fora mandou, aceitando os nomes mais comuns (e um nível dentro de
-- "cliente", "contact", "data" ou "lead")
create or replace function private.atd_entrada_valor(v text)
returns text language sql immutable set search_path = '' as $$
  -- vazio, "null" e marcador que o outro sistema não trocou (*nome*, *cidade) contam como vazio
  select case when x is null or x = '' or lower(x) in ('null', 'undefined') or x like '*%' or x like '%*' then null else x end
    from (select btrim(btrim(coalesce(v, '')), '"''') as x) t
$$;
create or replace function private.atd_entrada_campo(p jsonb, p_nomes text[])
returns text language plpgsql immutable set search_path = '' as $$
declare n text; g text; v text;
begin
  foreach n in array p_nomes loop
    v := private.atd_entrada_valor(p ->> n);
    if v is not null then return v; end if;
  end loop;
  foreach g in array array['cliente', 'contato', 'contact', 'customer', 'data', 'lead', 'dados'] loop
    if jsonb_typeof(p -> g) = 'object' then
      foreach n in array p_nomes loop
        v := private.atd_entrada_valor(p -> g ->> n);
        if v is not null then return v; end if;
      end loop;
    end if;
  end loop;
  return null;
end $$;

-- RECEBER. Chamada só pela função entrada-webhook (service_role). p_teste = só confere, não grava nada.
create or replace function public.atd_entrada_receber(p_chave text, p_payload jsonb, p_teste boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.atd_entradas%rowtype;
  v_tel text; v_nome text; v_msg text; v_dig text;
  v_campanha text; v_mailing text; v_opcao text; v_email text; v_endereco text; v_cidade text; v_info text;
  r jsonb; v_contato uuid; v_conversa uuid;
begin
  select * into e from public.atd_entradas where chave = btrim(coalesce(p_chave, ''));
  if not found then return jsonb_build_object('ok', false, 'erro', 'chave_invalida'); end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(p_payload) <> 'object' then p_payload := jsonb_build_object('valor', p_payload); end if;
  v_tel := private.atd_entrada_campo(p_payload, array['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'number', 'fone', 'mobile', 'tel', 'destino', 'to', 'cliente_telefone', 'phone_number']);
  v_nome := private.atd_entrada_campo(p_payload, array['nome', 'name', 'cliente_nome', 'nome_cliente', 'client_name', 'full_name', 'contato', 'cliente']);
  v_msg := private.atd_entrada_campo(p_payload, array['mensagem', 'message', 'texto', 'text', 'body', 'conteudo', 'content', 'msg']);
  -- o que a URA reversa (Telein) manda além disso
  v_campanha := private.atd_entrada_campo(p_payload, array['campanha', 'campaign']);
  v_mailing := private.atd_entrada_campo(p_payload, array['mailing', 'lista']);
  v_opcao := private.atd_entrada_campo(p_payload, array['opcao', 'opção', 'option', 'digito', 'tecla', 'dtmf']);
  v_email := private.atd_entrada_campo(p_payload, array['email', 'e-mail']);
  v_endereco := private.atd_entrada_campo(p_payload, array['endereco', 'endereço', 'address']);
  v_cidade := private.atd_entrada_campo(p_payload, array['cidade', 'city']);
  v_info := nullif(concat_ws(' · ',
    case when v_campanha is not null then 'campanha ' || v_campanha end,
    case when v_mailing is not null then 'mailing ' || v_mailing end,
    case when v_opcao is not null then 'apertou ' || v_opcao end,
    case when v_cidade is not null then v_cidade end), '');
  -- telefone do Brasil com ou sem 55, com ou sem máscara
  v_dig := regexp_replace(coalesce(v_tel, ''), '\D', '', 'g');
  if length(v_dig) in (10, 11) then v_dig := '55' || v_dig; end if;
  if length(v_dig) not between 12 and 13 then v_dig := null; end if;

  if not e.ativo then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'desligada', v_dig, v_nome, left(v_msg, 2000), 'o recebimento está desligado', p_payload);
    return jsonb_build_object('ok', false, 'erro', 'desligada');
  end if;
  if v_dig is null then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'sem_telefone', v_tel, v_nome, left(v_msg, 2000), 'não veio um telefone válido', p_payload);
    return jsonb_build_object('ok', false, 'erro', 'sem_telefone');
  end if;
  -- tecla que não está na lista da entrada: registra e não cria lead (responde que deu certo, para não repetir)
  if e.opcoes is not null and cardinality(e.opcoes) > 0 and (v_opcao is null or not (v_opcao = any (e.opcoes))) then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'ignorada', v_dig, v_nome, left(v_msg, 2000),
            'apertou ' || coalesce(v_opcao, 'nenhuma opção') || ': só ' || array_to_string(e.opcoes, ', ') || ' vira lead', p_payload);
    return jsonb_build_object('ok', true, 'ignorada', true);
  end if;
  if p_teste then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'teste', v_dig, v_nome, left(v_msg, 2000), concat_ws(' · ', 'teste: lido, nada foi criado', v_info), p_payload);
    update public.atd_entradas set ultimo_evento_em = now() where id = e.id;
    return jsonb_build_object('ok', true, 'teste', true, 'telefone', v_dig, 'nome', v_nome, 'mensagem', v_msg);
  end if;
  if e.canal_id is null then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'sem_numero', v_dig, v_nome, left(v_msg, 2000), 'escolha o número de WhatsApp desta entrada', p_payload);
    return jsonb_build_object('ok', false, 'erro', 'sem_numero');
  end if;

  r := public.wa_inbound_garantir_contato_conversa(e.organizacao_id, e.canal_id, v_dig, null, null, null, v_nome, false);
  v_contato := (r ->> 'contato_id')::uuid; v_conversa := (r ->> 'conversa_id')::uuid;
  -- o nome que veio do outro sistema entra só se o contato ainda não tinha um nome de verdade
  if v_nome is not null then
    update public.contatos set nome = v_nome
     where id = v_contato and (nome is null or btrim(nome) = '' or nome = v_dig or nome = 'Identidade protegida' or regexp_replace(nome, '\D', '', 'g') = v_dig);
  end if;
  -- e-mail que veio, se o contato ainda não tem
  if v_email is not null and v_email like '%@%' then
    update public.contatos set email = v_email where id = v_contato and (email is null or btrim(email) = '');
  end if;
  -- a etiqueta com o nome da entrada (ex.: URA) para filtrar depois
  update public.contatos set etiquetas = array_append(etiquetas, e.nome) where id = v_contato and not (e.nome = any (etiquetas));
  -- na conversa: o aviso de onde veio e a mensagem que o outro sistema mandou ao cliente
  -- (clock_timestamp: o aviso fica antes da mensagem, mesmo gravados na mesma transação)
  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, status, origem, metadados, enviada_em, criado_em)
  values (e.organizacao_id, v_conversa, 'saida', 'sistema',
          'Chegou pela integração ' || e.nome || coalesce(' (' || v_info || ')', '') || '.' || coalesce(' Endereço: ' || v_endereco || '.', ''),
          'enviada', 'integracao',
          jsonb_build_object('integracao', e.nome, 'entrada_id', e.id, 'campanha', v_campanha, 'mailing', v_mailing, 'opcao', v_opcao, 'cidade', v_cidade),
          clock_timestamp(), clock_timestamp());
  if v_msg is not null then
    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, status, origem, assinatura_nome, metadados, enviada_em, criado_em)
    values (e.organizacao_id, v_conversa, 'saida', 'texto', left(v_msg, 4000), 'enviada', 'integracao', e.nome,
            jsonb_build_object('integracao', e.nome, 'entrada_id', e.id), clock_timestamp(), clock_timestamp());
  end if;
  update public.conversas
     set ultima_interacao_em = now(), arquivada_em = null, arquivada_por = null,
         precisa_humano = true, precisa_humano_motivo = 'Veio de ' || e.nome, precisa_humano_em = now()
   where id = v_conversa;
  -- o lead no Kanban (LEAD NOVO), sem duplicar se ele já tem um aberto
  perform public.garantir_oportunidade_lead_novo(v_contato, v_conversa, e.canal_id, e.nome, false);

  insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, contato_id, conversa_id, detalhe, payload)
  values (e.id, 'ok', v_dig, v_nome, left(v_msg, 2000), v_contato, v_conversa,
          concat_ws(' · ', case when (r ->> 'contato_criado')::boolean then 'cliente novo' else 'cliente que já existia' end, v_info), p_payload);
  update public.atd_entradas set ultimo_evento_em = now(), total_eventos = total_eventos + 1 where id = e.id;
  return jsonb_build_object('ok', true, 'conversa_id', v_conversa, 'contato_criado', (r ->> 'contato_criado')::boolean);
end $$;
revoke all on function public.atd_entrada_receber(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.atd_entrada_receber(text, jsonb, boolean) to service_role;
revoke all on function private.atd_entrada_campo(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.atd_entrada_valor(text) from public, anon, authenticated;

-- DESFAZER:
--   drop function if exists public.atd_entrada_receber(text, jsonb, boolean), private.atd_entrada_campo(jsonb, text[]), private.atd_entrada_valor(text), private.atd_entradas_registra();
--   drop table if exists public.atd_entrada_eventos, public.atd_entradas;

-- ===================== 20261125_96_anuncios_facebook.sql =====================
-- 96 · ANÚNCIOS DO FACEBOOK no Atendimento (dono 25/11: "conectar o Facebook para ver qual campanha tá rodando melhor",
-- como no sistema que a Reviza usava antes). Três peças que se encontram pelo ID do anúncio:
--   atd_meta_conta      a conta de anúncios conectada (o código de acesso da Meta mora AQUI e só o servidor lê)
--   atd_meta_gasto      o que a Meta cobrou, por dia × anúncio (com conjunto e campanha), lido pela função meta-anuncios
--   atd_anuncio_origem  a conversa que começou pelo botão do anúncio: o WhatsApp manda junto o ID do anúncio
--                       (externalAdReply), gravado pelo evolution-webhook na primeira mensagem
-- A tela lê tudo por UMA rotina, dash_anuncios, só para o administrador (o Dashboard é só dele).
-- Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) a conta conectada (uma por empresa) e a "sessão" curta entre colar o código e escolher a conta
create table if not exists public.atd_meta_conta (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  conta_id       text not null check (conta_id ~ '^act_[0-9]+$'),
  nome           text,
  moeda          text,
  fuso           text,
  token          text not null,
  conectado_por  uuid,
  conectado_em   timestamptz not null default now(),
  sincronizado_em timestamptz,
  erro_sync      text,
  atualizado_em  timestamptz not null default now()
);
create table if not exists public.atd_meta_sessao (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid,
  token          text not null,
  contas         jsonb not null default '[]'::jsonb,
  criado_em      timestamptz not null default now()
);

-- 2) o gasto por dia e por anúncio (o dia é o da conta de anúncios; a da Reviza é no horário de Brasília)
create table if not exists public.atd_meta_gasto (
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  dia               date not null,
  anuncio_id        text not null,
  anuncio_nome      text,
  conjunto_id       text,
  conjunto_nome     text,
  campanha_id       text,
  campanha_nome     text,
  campanha_situacao text,
  investido         numeric(14,2) not null default 0,
  impressoes        bigint not null default 0,
  cliques           bigint not null default 0,
  atualizado_em     timestamptz not null default now(),
  primary key (organizacao_id, dia, anuncio_id)
);
create index if not exists atd_meta_gasto_campanha on public.atd_meta_gasto (organizacao_id, campanha_id, dia);

-- 3) de qual anúncio veio cada conversa
create table if not exists public.atd_anuncio_origem (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id     uuid references public.contatos(id) on delete set null,
  canal_id       uuid references public.canais(id) on delete set null,
  anuncio_id     text,
  titulo         text,
  corpo          text,
  url            text,
  ctwa_clid      text,
  tipo           text,
  recebido_em    timestamptz not null default now()
);
create index if not exists atd_anuncio_origem_org_quando on public.atd_anuncio_origem (organizacao_id, recebido_em desc);
create index if not exists atd_anuncio_origem_anuncio on public.atd_anuncio_origem (organizacao_id, anuncio_id);

-- ninguém lê nem grava direto: só o servidor (funções com a chave de serviço) e a rotina dash_anuncios
alter table public.atd_meta_conta enable row level security;
alter table public.atd_meta_sessao enable row level security;
alter table public.atd_meta_gasto enable row level security;
alter table public.atd_anuncio_origem enable row level security;
revoke all on table public.atd_meta_conta, public.atd_meta_sessao, public.atd_meta_gasto, public.atd_anuncio_origem from public, anon, authenticated;
grant all on table public.atd_meta_conta, public.atd_meta_sessao, public.atd_meta_gasto, public.atd_anuncio_origem to service_role;

-- 4) o webhook registra a origem. Primeiro clique fica; se o cliente voltar por OUTRO anúncio depois de 30 dias,
--    é um novo começo (a campanha nova ganha o lead). Nunca quebra a mensagem: o webhook chama em best-effort.
create or replace function public.atd_anuncio_registrar(p_conversa uuid, p_contato uuid, p_canal uuid, p_anuncio jsonb, p_quando timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_id  text := nullif(left(btrim(coalesce(p_anuncio->>'source_id', '')), 64), '');
  v_tit text := nullif(left(btrim(coalesce(p_anuncio->>'title', '')), 300), '');
begin
  if p_conversa is null or p_anuncio is null then return; end if;
  if v_id is null and v_tit is null then return; end if; -- sem ID e sem título não dá para ligar a nada
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then return; end if;
  insert into public.atd_anuncio_origem as o (conversa_id, organizacao_id, contato_id, canal_id, anuncio_id, titulo, corpo, url, ctwa_clid, tipo, recebido_em)
  values (p_conversa, v_org, p_contato, p_canal, v_id, v_tit,
          nullif(left(btrim(coalesce(p_anuncio->>'body', '')), 600), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'source_url', '')), 600), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'ctwa_clid', '')), 200), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'source_type', '')), 30), ''),
          coalesce(p_quando, now()))
  on conflict (conversa_id) do update
     set anuncio_id = excluded.anuncio_id, titulo = excluded.titulo, corpo = excluded.corpo, url = excluded.url,
         ctwa_clid = excluded.ctwa_clid, tipo = excluded.tipo, recebido_em = excluded.recebido_em,
         contato_id = coalesce(excluded.contato_id, o.contato_id), canal_id = coalesce(excluded.canal_id, o.canal_id)
   where o.recebido_em < excluded.recebido_em - interval '30 days'
      or (o.anuncio_id is null and excluded.anuncio_id is not null and o.recebido_em > excluded.recebido_em - interval '1 day');
end;
$$;
revoke all on function public.atd_anuncio_registrar(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.atd_anuncio_registrar(uuid, uuid, uuid, jsonb, timestamptz) to service_role;

-- 5) a aba Anúncios do Dashboard. Datas em São Paulo, fim EXCLUSIVO (como os Relatórios). p_serie_ini = início da série
--    dos gráficos (até 7 dias antes, quando o período é curto); os totais são sempre só do período.
create or replace function public.dash_anuncios(p_ini date, p_fim date, p_prev_ini date default null, p_serie_ini date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := p_org;
  v_serie date := least(coalesce(p_serie_ini, p_ini), p_ini);
  v_conta public.atd_meta_conta%rowtype;
  v_res   jsonb;
begin
  if p_ini is null or p_fim is null or p_fim <= p_ini then raise exception 'periodo_invalido'; end if;
  if p_fim - v_serie > 400 then raise exception 'periodo_longo'; end if;
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou
     where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  select * into v_conta from public.atd_meta_conta where organizacao_id = v_org;

  with
  -- nomes mais recentes de cada anúncio (o gasto traz anúncio → conjunto → campanha)
  nomes as (
    select distinct on (g.anuncio_id) g.anuncio_id, g.anuncio_nome, g.campanha_id, g.campanha_nome, g.campanha_situacao
      from public.atd_meta_gasto g where g.organizacao_id = v_org
     order by g.anuncio_id, g.dia desc
  ),
  -- cada lead de anúncio, com o dia em SP, a campanha (pelo ID; sem conta, pelo título do anúncio) e como está hoje
  leads as (
    select o.conversa_id, o.contato_id, o.recebido_em,
           (o.recebido_em at time zone 'America/Sao_Paulo')::date as dia,
           coalesce(n.campanha_id, 'titulo:' || coalesce(o.titulo, o.anuncio_id, '?')) as campanha_id,
           coalesce(n.campanha_nome, o.titulo, 'Anúncio sem nome') as campanha_nome,
           coalesce(n.campanha_situacao, 'ativa') as campanha_situacao,
           coalesce(o.anuncio_id, 'titulo:' || coalesce(o.titulo, '?')) as anuncio_id,
           coalesce(n.anuncio_nome, o.titulo, 'Anúncio sem nome') as anuncio_nome,
           o.anuncio_id is null as sem_id,
           op.coluna_nome as etapa,
           coalesce(op.ganho, false) as fechado,
           coalesce(u.nome, ur.nome) as responsavel,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Sem nome') as contato,
           c.telefone
      from public.atd_anuncio_origem o
      left join nomes n on n.anuncio_id = o.anuncio_id
      left join public.conversas cv on cv.id = o.conversa_id
      left join public.contatos c on c.id = o.contato_id
      left join public.usuarios u on u.id = cv.atendente_id
      left join lateral (
        select fc.nome as coluna_nome, (op.status = 'ganho' or fc.resultado = 'ganho') as ganho, op.responsavel_id
          from public.oportunidades op
          left join public.funil_colunas fc on fc.id = op.coluna_id
         where op.organizacao_id = v_org and op.contato_id = o.contato_id and op.status <> 'cancelado'
         order by (op.status = 'ganho' or fc.resultado = 'ganho') desc, op.atualizado_em desc
         limit 1
      ) op on true
      left join public.usuarios ur on ur.id = op.responsavel_id
     where o.organizacao_id = v_org
       and o.recebido_em >= (least(v_serie, coalesce(p_prev_ini, p_ini))::timestamp at time zone 'America/Sao_Paulo')
       and o.recebido_em <  (p_fim::timestamp at time zone 'America/Sao_Paulo')
  ),
  gasto as (
    select g.* from public.atd_meta_gasto g
     where g.organizacao_id = v_org and v_conta.organizacao_id is not null
       and g.dia >= least(v_serie, coalesce(p_prev_ini, p_ini)) and g.dia < p_fim
  ),
  tot as (
    select jsonb_build_object(
      'investido', coalesce((select sum(investido) from gasto where dia >= p_ini), 0),
      'impressoes', coalesce((select sum(impressoes) from gasto where dia >= p_ini), 0),
      'cliques', coalesce((select sum(cliques) from gasto where dia >= p_ini), 0),
      'leads', (select count(*) from leads where dia >= p_ini),
      'fechados', (select count(*) from leads where dia >= p_ini and fechado)) as j
  ),
  ant as (
    select case when p_prev_ini is null or p_prev_ini >= p_ini then null else jsonb_build_object(
      'investido', coalesce((select sum(investido) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'impressoes', coalesce((select sum(impressoes) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'cliques', coalesce((select sum(cliques) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'leads', (select count(*) from leads where dia >= p_prev_ini and dia < p_ini),
      'fechados', (select count(*) from leads where dia >= p_prev_ini and dia < p_ini and fechado)) end as j
  ),
  dias as (select d::date as dia from generate_series(v_serie, p_fim - 1, interval '1 day') d),
  por_dia as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'dia', dd.dia,
             'investido', coalesce((select sum(investido) from gasto g where g.dia = dd.dia), 0),
             'cliques', coalesce((select sum(cliques) from gasto g where g.dia = dd.dia), 0),
             'leads', (select count(*) from leads l where l.dia = dd.dia),
             'fechados', (select count(*) from leads l where l.dia = dd.dia and l.fechado),
             'por_campanha', coalesce((select jsonb_object_agg(x.campanha_id, x.n) from (select campanha_id, count(*) n from leads l where l.dia = dd.dia group by campanha_id) x), '{}'::jsonb)
           ) order by dd.dia), '[]'::jsonb) as j
      from dias dd
  ),
  camp_g as (
    select campanha_id, max(campanha_nome) as nome, max(campanha_situacao) as situacao, count(distinct anuncio_id) as anuncios,
           sum(investido) as investido, sum(impressoes) as impressoes, sum(cliques) as cliques
      from gasto where dia >= p_ini group by campanha_id
  ),
  camp_l as (
    select campanha_id, max(campanha_nome) as nome, max(campanha_situacao) as situacao, count(distinct anuncio_id) as anuncios,
           count(*) as leads, count(*) filter (where fechado) as fechados
      from leads where dia >= p_ini group by campanha_id
  ),
  campanhas as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', coalesce(g.campanha_id, l.campanha_id),
             'nome', coalesce(g.nome, l.nome),
             'situacao', case lower(coalesce(g.situacao, l.situacao, 'ativa')) when 'active' then 'ativa' when 'paused' then 'pausada'
                              when 'ativa' then 'ativa' when 'pausada' then 'pausada' else 'encerrada' end,
             'anuncios', greatest(coalesce(g.anuncios, 0), coalesce(l.anuncios, 0)),
             'investido', coalesce(g.investido, 0), 'impressoes', coalesce(g.impressoes, 0), 'cliques', coalesce(g.cliques, 0),
             'leads', coalesce(l.leads, 0), 'fechados', coalesce(l.fechados, 0)
           ) order by coalesce(l.leads, 0) desc, coalesce(g.investido, 0) desc), '[]'::jsonb) as j
      from camp_g g full join camp_l l on l.campanha_id = g.campanha_id
  ),
  an_g as (
    select anuncio_id, max(anuncio_nome) as nome, max(campanha_id) as campanha_id, max(campanha_nome) as campanha,
           sum(investido) as investido, sum(impressoes) as impressoes, sum(cliques) as cliques
      from gasto where dia >= p_ini group by anuncio_id
  ),
  an_l as (
    select anuncio_id, max(anuncio_nome) as nome, max(campanha_id) as campanha_id, max(campanha_nome) as campanha,
           count(*) as leads, count(*) filter (where fechado) as fechados
      from leads where dia >= p_ini group by anuncio_id
  ),
  anuncios as (
    select coalesce(jsonb_agg(x.o order by x.leads desc, x.investido desc), '[]'::jsonb) as j from (
      select jsonb_build_object('id', coalesce(g.anuncio_id, l.anuncio_id), 'nome', coalesce(g.nome, l.nome),
               'campanha_id', coalesce(g.campanha_id, l.campanha_id), 'campanha', coalesce(g.campanha, l.campanha),
               'investido', coalesce(g.investido, 0), 'impressoes', coalesce(g.impressoes, 0), 'cliques', coalesce(g.cliques, 0),
               'leads', coalesce(l.leads, 0), 'fechados', coalesce(l.fechados, 0)) as o,
             coalesce(l.leads, 0) as leads, coalesce(g.investido, 0) as investido
        from an_g g full join an_l l on l.anuncio_id = g.anuncio_id
       order by coalesce(l.leads, 0) desc, coalesce(g.investido, 0) desc
       limit 50) x
  ),
  lista as (
    select coalesce(jsonb_agg(x.o order by x.recebido_em desc), '[]'::jsonb) as j from (
      select jsonb_build_object('conversa_id', l.conversa_id, 'contato', l.contato, 'telefone', l.telefone, 'entrou_em', l.recebido_em,
               'anuncio', l.anuncio_nome, 'campanha', l.campanha_nome, 'campanha_id', l.campanha_id,
               'etapa', l.etapa, 'responsavel', l.responsavel, 'fechado', l.fechado) as o, l.recebido_em
        from leads l where l.dia >= p_ini order by l.recebido_em desc limit 300) x
  )
  select jsonb_build_object(
    'conectado', v_conta.organizacao_id is not null,
    'conta', case when v_conta.organizacao_id is null then null else jsonb_build_object('id', v_conta.conta_id, 'nome', v_conta.nome, 'moeda', coalesce(v_conta.moeda, 'BRL')) end,
    'sincronizado_em', v_conta.sincronizado_em,
    'totais', (select j from tot), 'anterior', (select j from ant),
    'por_dia', (select j from por_dia), 'campanhas', (select j from campanhas), 'anuncios', (select j from anuncios),
    'leads', (select j from lista),
    'sem_id', (select count(*) from leads where dia >= p_ini and sem_id),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_anuncios(date, date, date, date, uuid) from public, anon, authenticated;
grant execute on function public.dash_anuncios(date, date, date, date, uuid) to authenticated, service_role;

-- 6) limpeza: sessão de "colar o código" vale 15 minutos
create or replace function public.atd_meta_sessao_limpar() returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.atd_meta_sessao where criado_em < now() - interval '15 minutes';
$$;
revoke all on function public.atd_meta_sessao_limpar() from public, anon, authenticated;
grant execute on function public.atd_meta_sessao_limpar() to service_role;

-- ===================== 20261125_97_tempo_de_resposta.sql =====================
-- 97 · TEMPO DE RESPOSTA DA EQUIPE com meta (dono 25/11, a partir do sistema que a Reviza usava antes: "SLA do atendimento
-- humano", "desempenho por operador, do mais lento ao mais rápido"). Só leitura: uma rotina para o Dashboard (administrador).
--
-- A régua (a mesma do Atenvo: humano é saída com origem diferente de 'bot'):
--   · uma ESPERA começa na mensagem do cliente que chega depois de uma resposta nossa (ou na primeira da conversa) e termina
--     na PRÓXIMA mensagem nossa. Mensagens seguidas do cliente são uma espera só (conta da primeira).
--   · terminou numa resposta de PESSOA (painel ou celular) → entra na conta. Terminou numa resposta da IA → a IA atendeu,
--     não entra (a IA não é a equipe). Mensagem que falhou no envio não é resposta.
--   · a resposta vai para quem escreveu; a do celular (sem autor no sistema) vai para o responsável pela conversa.
--   · horário comercial (padrão): só contam os minutos de segunda a sexta, das 8h às 18h (Brasília). Tempo corrido: tudo.
--   · AGUARDANDO = conversa aberta cuja última mensagem é do cliente, sem resposta de ninguém (nem da IA), há até 30 dias.
--   · NOTA INTERNA da equipe e aviso do SISTEMA (tipo 'nota_interna'/'sistema') não são resposta nem mensagem do cliente:
--     ficam fora de tudo (25/11, junto da migration 99 — sem isto uma nota com @ contava como resposta de pessoa).
-- Nada aqui muda dados.

create or replace function public.atd_minutos_uteis(p_de timestamptz, p_ate timestamptz, p_h_ini integer default 8, p_h_fim integer default 18)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p_de is null or p_ate is null or p_ate <= p_de then 0::numeric else coalesce((
    select sum(greatest(0, extract(epoch from (
             least(p_ate, (x.d + make_time(p_h_fim, 0, 0)) at time zone 'America/Sao_Paulo')
           - greatest(p_de, (x.d + make_time(p_h_ini, 0, 0)) at time zone 'America/Sao_Paulo')))))
      from generate_series((p_de at time zone 'America/Sao_Paulo')::date, (p_ate at time zone 'America/Sao_Paulo')::date, interval '1 day') g(dd)
      cross join lateral (select g.dd::date as d) x
     where extract(isodow from x.d) between 1 and 5
  ), 0) / 60.0 end;
$$;
grant execute on function public.atd_minutos_uteis(timestamptz, timestamptz, integer, integer) to authenticated, service_role;

create or replace function public.dash_tempo_resposta(
  p_ini date, p_fim date, p_meta_min integer default 30, p_modo text default 'uteis',
  p_prev_ini date default null, p_serie_ini date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := p_org;
  v_meta  numeric := greatest(1, least(coalesce(p_meta_min, 30), 24 * 60));
  v_uteis boolean := coalesce(p_modo, 'uteis') <> 'corrido';
  v_serie date := least(coalesce(p_serie_ini, p_ini), p_ini);
  v_desde date;
  v_res   jsonb;
begin
  if p_ini is null or p_fim is null or p_fim <= p_ini then raise exception 'periodo_invalido'; end if;
  v_desde := least(v_serie, coalesce(p_prev_ini, p_ini));
  if p_fim - v_desde > 100 then raise exception 'periodo_longo'; end if;
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  with
  msgs as (  -- do começo da série (com 3 dias antes, para achar o início das esperas) até o fim
    select m.conversa_id, m.direcao, m.origem, m.autor_id,
           case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.criado_em) else coalesce(m.enviada_em, m.criado_em) end as ts
      from public.mensagens m
     where m.organizacao_id = v_org
       and m.criado_em >= ((v_desde - 3)::timestamp at time zone 'America/Sao_Paulo')
       and m.criado_em <  ((p_fim + 3)::timestamp at time zone 'America/Sao_Paulo')
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')  -- nota da equipe e aviso do sistema não chegam ao cliente
  ),
  marcadas as (  -- grp = quantas mensagens NOSSAS já houve até aqui: a resposta de uma espera é a saída de grp + 1
    select q.*, lag(q.direcao) over w as dir_antes,
           sum(case when q.direcao = 'saida' then 1 else 0 end) over (w rows between unbounded preceding and current row) as grp
      from msgs q
    window w as (partition by q.conversa_id order by q.ts, q.direcao)
  ),
  -- cada espera: a 1ª mensagem do cliente depois de uma nossa; a resposta é a próxima mensagem NOSSA
  esperas as (
    select i.conversa_id, i.ts as inicio, s.ts as resposta, s.origem, s.autor_id
      from marcadas i
      join marcadas s on s.conversa_id = i.conversa_id and s.direcao = 'saida' and s.grp = i.grp + 1
     where i.direcao = 'entrada' and (i.dir_antes is null or i.dir_antes = 'saida')
       and i.ts >= (v_desde::timestamp at time zone 'America/Sao_Paulo')
       and i.ts <  (p_fim::timestamp at time zone 'America/Sao_Paulo')
  ),
  humanas as (  -- só as que uma PESSOA respondeu
    select e.*, (e.inicio at time zone 'America/Sao_Paulo')::date as dia,
           extract(hour from e.inicio at time zone 'America/Sao_Paulo')::int as hora,
           coalesce(e.autor_id, cv.atendente_id) as quem,
           case when v_uteis then public.atd_minutos_uteis(e.inicio, e.resposta) else extract(epoch from (e.resposta - e.inicio)) / 60.0 end as minutos
      from esperas e
      left join public.conversas cv on cv.id = e.conversa_id
     where e.origem is distinct from 'bot'
  ),
  resumo as (
    select jsonb_build_object(
      'respondidos', count(*),
      'dentro_meta', count(*) filter (where minutos <= v_meta),
      'mediana_min', round((percentile_cont(0.5) within group (order by minutos))::numeric, 1),
      'media_min', round(avg(minutos)::numeric, 1),
      'p90_min', round((percentile_cont(0.9) within group (order by minutos))::numeric, 1),
      'pior_min', round(max(minutos)::numeric, 1)) as j
      from humanas where dia >= p_ini
  ),
  anterior as (
    select case when p_prev_ini is null or p_prev_ini >= p_ini then null else jsonb_build_object(
      'respondidos', count(*),
      'dentro_meta', count(*) filter (where minutos <= v_meta),
      'mediana_min', round((percentile_cont(0.5) within group (order by minutos))::numeric, 1),
      'media_min', round(avg(minutos)::numeric, 1)) end as j
      from humanas where dia >= p_prev_ini and dia < p_ini
  ),
  dias as (select d::date as dia from generate_series(v_serie, p_fim - 1, interval '1 day') d),
  por_dia as (
    select coalesce(jsonb_agg(jsonb_build_object('dia', dd.dia, 'respondidos', coalesce(x.n, 0), 'dentro_meta', coalesce(x.ok, 0), 'mediana_min', x.med) order by dd.dia), '[]'::jsonb) as j
      from dias dd
      left join (select dia, count(*) n, count(*) filter (where minutos <= v_meta) ok,
                        round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med
                   from humanas group by dia) x on x.dia = dd.dia
  ),
  por_hora as (
    select coalesce(jsonb_agg(jsonb_build_object('hora', h, 'respondidos', coalesce(x.n, 0), 'mediana_min', x.med) order by h), '[]'::jsonb) as j
      from generate_series(0, 23) h
      left join (select hora, count(*) n, round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med
                   from humanas where dia >= p_ini group by hora) x on x.hora = h
  ),
  por_pessoa as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.quem, 'nome', coalesce(u.nome, 'Sem atendente identificado'),
             'respondidos', x.n, 'dentro_meta', x.ok, 'mediana_min', x.med, 'media_min', x.media, 'pior_min', x.pior)
           order by x.med desc nulls last, x.n desc), '[]'::jsonb) as j
      from (select quem, count(*) n, count(*) filter (where minutos <= v_meta) ok,
                   round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med,
                   round(avg(minutos)::numeric, 1) media, round(max(minutos)::numeric, 1) pior
              from humanas where dia >= p_ini group by quem) x
      left join public.usuarios u on u.id = x.quem
  ),
  -- AGORA: conversas abertas cuja última mensagem é do cliente (ninguém respondeu, nem a IA), há até 30 dias
  ultimas as (
    select distinct on (m.conversa_id) m.conversa_id, m.direcao,
           case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.criado_em) else coalesce(m.enviada_em, m.criado_em) end as ts
      from public.mensagens m
     where m.organizacao_id = v_org and m.criado_em >= now() - interval '30 days'
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')
     order by m.conversa_id, m.criado_em desc
  ),
  esperando as (
    select u.conversa_id, cv.atendente_id,
           (select min(case when m2.direcao = 'entrada' then coalesce(m2.recebida_em, m2.criado_em) end)
              from public.mensagens m2
             where m2.conversa_id = u.conversa_id and m2.direcao = 'entrada'
               and m2.criado_em > coalesce((select max(m3.criado_em) from public.mensagens m3 where m3.conversa_id = u.conversa_id and m3.direcao = 'saida' and m3.status::text <> 'falhou' and m3.tipo::text not in ('sistema', 'nota_interna')), '-infinity'::timestamptz)) as desde,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Sem nome') as contato
      from ultimas u
      join public.conversas cv on cv.id = u.conversa_id
      left join public.contatos c on c.id = cv.contato_id
     where u.direcao = 'entrada' and cv.arquivada_em is null and cv.status not in ('resolvida', 'fechada')
  ),
  fila as (
    select coalesce(jsonb_agg(jsonb_build_object('conversa_id', x.conversa_id, 'contato', x.contato, 'desde', x.desde,
             'espera_min', round((case when v_uteis then public.atd_minutos_uteis(x.desde, now()) else extract(epoch from (now() - x.desde)) / 60.0 end)::numeric, 0),
             'responsavel', u.nome) order by x.desde), '[]'::jsonb) as j
      from (select * from esperando where desde is not null order by desde limit 100) x
      left join public.usuarios u on u.id = x.atendente_id
  )
  select jsonb_build_object(
    'meta_min', v_meta, 'modo', case when v_uteis then 'uteis' else 'corrido' end,
    'totais', (select j from resumo), 'anterior', (select j from anterior),
    'por_dia', (select j from por_dia), 'por_hora', (select j from por_hora), 'atendentes', (select j from por_pessoa),
    'aguardando', (select count(*) from esperando where desde is not null), 'fila', (select j from fila),
    'pela_ia', (select count(*) from esperas e where e.origem = 'bot' and (e.inicio at time zone 'America/Sao_Paulo')::date >= p_ini),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_tempo_resposta(date, date, integer, text, date, date, uuid) from public, anon, authenticated;
grant execute on function public.dash_tempo_resposta(date, date, integer, text, date, date, uuid) to authenticated, service_role;

-- ===================== 20261125_98_ao_vivo.sql =====================
-- 98 · AO VIVO: as conversas abertas AGORA, uma coluna por atendente, por equipe ou por etiqueta (dono 25/11, do sistema
-- que a Reviza usava antes: "Dashboard › Ao vivo — conversas abertas, por usuário"). Só leitura: UMA rotina para o
-- Dashboard (administrador). Nada aqui muda dados, nem as Cobranças, nem o resto do Atendimento.
--
-- A régua (a mesma da lista do WhatsApp):
--   · ABERTA = conversa do WhatsApp não arquivada (arquivada_em vazio) e fora de 'resolvida' e 'fechada'.
--   · as 2000 mais recentes (pela última interação); 'total' diz quantas abertas existem ao todo.
--   · a ÚLTIMA MENSAGEM é a última de verdade: fora as do sistema e as notas internas, e fora a nossa que falhou no envio
--     (o cliente continua sem resposta). O texto vem limpo (sem o carimbo de assinatura "*Nome – MARCA:*"), numa linha,
--     com até 140 letras; a mídia vai pelo tipo (a tela escreve "[áudio]", "[foto]"…).
--   · ESPERANDO = a última mensagem é do cliente (ninguém respondeu depois, nem a IA).
--   · ATENDENTE = o responsável pela conversa (conversas.atendente_id; sem ele, o responsável pelo cliente).
--   · EQUIPE = a equipe do atendente (como pessoa ou gerente); sem atendente em equipe, a equipe dona do número.
--   · ETIQUETAS = as da conversa e as do cliente, sem repetir.
--   · IA = a sessão da IA está ativa, não foi desligada à mão e o número está com a IA ligada e conectado
--     (a mesma conta de ia_atendendo_agora). Saída com origem 'bot' é a IA.
-- Cada conversa leva só os ids do número, do atendente e da equipe; os nomes vão uma vez só nas listas canais, atendentes
-- e equipes (a tela atualiza a cada 30 s: a resposta fica bem menor).

create or replace function public.dash_ao_vivo(p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := p_org;
  v_res jsonb;
begin
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  with
  abertas as (
    select cv.id, cv.contato_id, cv.canal_id, cv.ultimo_numero, cv.atendente_id, cv.etiquetas, cv.nao_lidas, cv.ultima_interacao_em,
           ca.nome_interno as canal_nome, coalesce(nullif(btrim(ca.numero_conectado), ''), nullif(btrim(ca.identificador), ''), cv.ultimo_numero) as canal_numero
      from public.conversas cv
      join public.canais ca on ca.id = cv.canal_id and ca.tipo = 'whatsapp'
     where cv.organizacao_id = v_org
       and cv.arquivada_em is null
       and cv.status not in ('resolvida', 'fechada')
  ),
  recorte as (
    select * from abertas order by ultima_interacao_em desc nulls last, id limit 2000
  ),
  -- os números em que a IA está ligada e conectada agora (ia_canal_atende, de uma vez só)
  canais_ia as (
    select b.canal_id
      from public.bot_canal_config b
      join public.canais ca on ca.id = b.canal_id
     where b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
  ),
  linhas as (
    select r.*, m.direcao, m.tipo, m.msg_em,
           -- sem o carimbo de assinatura do começo ("*Ana – REVIZA:*"), espaços e quebras viram um espaço só
           left(btrim(regexp_replace(regexp_replace(m.bruto, '^\*(?:👤 [^*\n]{1,80}|[^*\n]{1,60} – [^*\n]{1,60}):\*\s*', ''), '\s+', ' ', 'g')), 140) as texto,
           coalesce(r.atendente_id, ct.responsavel_id) as quem,
           ct.nome as ct_nome, ct.telefone as ct_tel, nullif(btrim(ct.foto_url), '') as foto_url, ct.etiquetas as ct_etiquetas,
           coalesce(s.status = 'ativa' and coalesce(s.dados->>'desativado_manual', 'false') <> 'true'
                    and s.canal_id in (select canal_id from canais_ia), false) as ia_ativa
      from recorte r
      left join public.contatos ct on ct.id = r.contato_id
      left join public.ia_sessoes s on s.conversa_id = r.id
      left join lateral (
        select m.direcao::text as direcao, m.tipo::text as tipo, left(coalesce(m.conteudo, ''), 600) as bruto,
               case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.enviada_em, m.criado_em)
                    else coalesce(m.enviada_em, m.criado_em) end as msg_em
          from public.mensagens m
         where m.conversa_id = r.id
           and m.tipo not in ('sistema', 'nota_interna')
           and not (m.direcao = 'saida' and m.status = 'falhou')
         order by m.enviada_em desc, m.criado_em desc
         limit 1
      ) m on true
  ),
  final as (
    select l.*, coalesce(eq_p.id, eq_c.id) as equipe_id,
           coalesce((select array_agg(distinct btrim(e) order by btrim(e))
                       from unnest(coalesce(l.etiquetas, '{}'::text[]) || coalesce(l.ct_etiquetas, '{}'::text[])) e
                      where nullif(btrim(e), '') is not null), '{}'::text[]) as etqs
      from linhas l
      left join lateral (select e.id from public.equipes e
                          where l.quem is not null and (e.gerente_id = l.quem or l.quem = any (e.membros))
                          order by e.nome limit 1) eq_p on true
      left join lateral (select e.id from public.equipes e
                          where l.canal_id = any (e.canais)
                          order by e.nome limit 1) eq_c on true
  ),
  pessoas as (  -- as colunas de atendente: quem está ativo no Atendimento e quem tem conversa aberta agora
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'papel', coalesce(ou.papel::text, u.papel::text),
                                                 'ativo', coalesce(ou.status::text = 'ativo' and u.ativo, false))
                              order by lower(u.nome)), '[]'::jsonb) as j
      from public.usuarios u
      left join public.organizacao_usuarios ou on ou.usuario_id = u.id and ou.organizacao_id = v_org
     where (ou.status::text = 'ativo' and u.ativo)
        or u.id in (select f.quem from final f where f.quem is not null)
  )
  select jsonb_build_object(
    'conversas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'contato_id', f.contato_id,
        'contato', case when nullif(btrim(f.ct_nome), '') is null then coalesce(f.ct_tel, 'Sem nome')
                        when f.ct_nome = 'Identidade protegida' or (f.ct_nome ~ '^[0-9]{12,}$' and f.ct_tel is null)
                          then coalesce(f.ct_tel, 'Identidade protegida')
                        else btrim(f.ct_nome) end,
        'foto_url', f.foto_url,
        'ultima_msg', coalesce(f.texto, ''),
        'ultima_tipo', f.tipo,
        'ultima_direcao', f.direcao,
        'ultima_em', date_trunc('second', coalesce(f.msg_em, f.ultima_interacao_em)),
        'canal_id', f.canal_id,
        'atendente_id', f.quem,
        'equipe_id', f.equipe_id,
        'etiquetas', to_jsonb(f.etqs),
        'ia_ativa', f.ia_ativa,
        'esperando', coalesce(f.direcao = 'entrada', false),
        'nao_lidas', coalesce(f.nao_lidas, 0))
      order by coalesce(f.msg_em, f.ultima_interacao_em) desc nulls last, f.id) from final f), '[]'::jsonb),
    'total', (select count(*) from abertas),
    'limite', 2000,
    'atendentes', (select j from pessoas),
    -- os nomes vão uma vez só (nas listas), não em cada conversa: a resposta fica um terço menor a cada 30 s
    'canais', coalesce((select jsonb_agg(jsonb_build_object('id', x.canal_id, 'nome', nullif(btrim(x.canal_nome), ''), 'numero', x.canal_numero) order by x.canal_nome)
                          from (select distinct on (f.canal_id) f.canal_id, f.canal_nome, f.canal_numero from final f) x), '[]'::jsonb),
    'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by lower(e.nome)) from public.equipes e), '[]'::jsonb),
    'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('nome', t.nome, 'cor', t.cor) order by t.ordem, lower(t.nome))
                             from public.etiquetas t where t.organizacao_id = v_org and t.ativo), '[]'::jsonb),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_ao_vivo(uuid) from public, anon, authenticated;
grant execute on function public.dash_ao_vivo(uuid) to authenticated, service_role;

-- DESFAZER: drop function if exists public.dash_ao_vivo(uuid);

-- ===================== 20261125_99_notas_internas.sql =====================
-- 99 · NOTA INTERNA COM @ NA CONVERSA (dono 25/11, a partir do sistema que a Reviza usava antes: "nota só pra equipe, use @
-- pra marcar alguém"). O atendente escreve, no próprio WhatsApp do cliente, um recado PARA A EQUIPE:
--   · a nota fica no fio da conversa (só a equipe vê) e NUNCA vai para o cliente;
--   · quem foi marcado com @ recebe um aviso (atd_notificacoes) com o link da conversa.
--
-- Como a nota é guardada: uma linha em `mensagens` com tipo = 'nota_interna' (o tipo já existe desde a 93), direcao 'saida',
-- origem 'nota', status 'enviada' e autor_id = quem escreveu. É o mesmo formato das notas automáticas que o próprio banco já
-- grava (ligação registrada, pedido do gestor). Por isso, sem mudar mais nada, a nota:
--   · não passa pelo envio (evolution-send) — só esta rotina grava; o reenvio só aceita mensagem com status 'falhou';
--   · não pausa a IA (fn_ia_sessao_mensagem), não limpa "precisa de humano" (sla_mensagem_humano) e não cancela o alerta do
--     lead quente (trg_alerta_lq_humano_cancela só olha origem 'atenvo'/'telefone') — todos já ignoram 'nota_interna';
--   · não mexe em não lidas nem na hora da última conversa (quem mexe é o envio e a mensagem do cliente, não as notas);
--   · não vira prévia na lista nem "resposta" (a lista e o tempo real do painel já pulam 'sistema'/'nota_interna');
--   · no tempo de resposta (migration 97) a nota não conta como resposta — ajustado lá no mesmo dia.
--   metadados: { mencoes: [ids], mencoes_nomes: [nomes], autor_nome } — nomes guardados para a nota continuar legível mesmo
--   se a pessoa sair da empresa depois.
--
-- Quem pode escrever: quem pode LER a conversa (a mesma regra do banco para as conversas: administrador, o gerente da equipe e
-- o atendente do cliente — atd_vejo_conversa) e é membro ativo da empresa com o sistema em dia.
-- Quem pode ser marcado: só gente ATIVA da mesma empresa (o resto é descartado em silêncio), até 20 por nota, sem o próprio autor.

create or replace function public.atd_nota_criar(p_conversa uuid, p_texto text, p_mencoes uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_cliente text;
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_autor   text;
  v_ids     uuid[];
  v_nomes   text[];
  v_id      uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if p_conversa is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;

  select cv.organizacao_id, nullif(btrim(ct.nome), '')
    into v_org, v_cliente
    from public.conversas cv left join public.contatos ct on ct.id = cv.contato_id
   where cv.id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;

  -- membro ativo com o sistema em dia (a mesma regra de quem grava mensagens) E enxerga esta conversa
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.org_operacional(v_org))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not public.atd_vejo_conversa(p_conversa) then raise exception 'sem_permissao' using errcode = '42501'; end if;

  if char_length(v_texto) = 0 then raise exception 'nota_vazia' using errcode = '22023'; end if;
  if char_length(v_texto) > 4000 then raise exception 'nota_longa' using errcode = '22023'; end if;

  select nullif(btrim(u.nome), '') into v_autor from public.usuarios u where u.id = v_uid;

  -- marcados: só pessoas ATIVAS desta empresa (vínculo ativo e cadastro ativo), sem repetir, sem o autor, no máximo 20
  select coalesce(array_agg(x.id order by x.nome), '{}'), coalesce(array_agg(x.nome order by x.nome), '{}')
    into v_ids, v_nomes
    from (select u.id, coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome
            from public.organizacao_usuarios ou
            join public.usuarios u on u.id = ou.usuario_id
           where ou.organizacao_id = v_org and ou.status = 'ativo' and coalesce(u.ativo, true)
             and ou.usuario_id = any (coalesce(p_mencoes, '{}'::uuid[]))
             and ou.usuario_id <> v_uid
           order by u.nome
           limit 20) x;

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, autor_id, enviada_em, metadados)
  values (v_org, p_conversa, 'saida', 'nota_interna', 'nota', 'enviada', v_texto, v_uid, now(),
          jsonb_build_object('mencoes', to_jsonb(v_ids), 'mencoes_nomes', to_jsonb(v_nomes), 'autor_nome', v_autor))
  returning id into v_id;

  -- um aviso para cada pessoa marcada, com o link da conversa
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select v_org, m, 'nota_mencao',
         coalesce(v_autor, 'Alguém da equipe') || ' marcou você numa nota',
         coalesce(v_cliente || ': ', '') || left(v_texto, 240) || case when char_length(v_texto) > 240 then '…' else '' end,
         '/whatsapp?conversa=' || p_conversa, p_conversa
    from unnest(v_ids) m;

  return v_id;
end;
$$;
revoke all on function public.atd_nota_criar(uuid, text, uuid[]) from public, anon;
grant execute on function public.atd_nota_criar(uuid, text, uuid[]) to authenticated, service_role;
comment on function public.atd_nota_criar(uuid, text, uuid[]) is
  'Nota interna da equipe na conversa (nunca vai ao cliente) + aviso para cada @ marcado. Migration 99.';

-- DESFAZER: drop function if exists public.atd_nota_criar(uuid, text, uuid[]);
--   (as notas já gravadas ficam na conversa como as notas automáticas; os avisos ficam em atd_notificacoes, tipo 'nota_mencao')

-- ===================== 20261125_101_tarefas.sql =====================
-- 101 · TAREFAS DA EQUIPE no Atendimento (dono 25/11: trazer do sistema que a Reviza usava antes as funções
-- úteis — lá havia o menu "Tarefas", com lista e quadro, prazo, prioridade, responsável e subtarefas).
--   atd_tarefas       a tarefa: título, descrição, responsável, prazo (dia e, se quiser, hora), prioridade,
--                     situação (pendente · em andamento · concluída), projeto e, se veio de uma conversa,
--                     o cliente (conversa_id + contato_id + o nome do cliente guardado na hora)
--   atd_tarefa_itens  as subtarefas (a listinha de "feito / não feito" dentro da tarefa)
-- QUEM VÊ: o administrador vê todas; os demais veem só as que criaram ou que estão com eles.
-- QUEM APAGA: o administrador ou quem criou. Passar a tarefa para outra pessoa avisa essa pessoa no sino.
-- A tela grava a tarefa e as subtarefas de uma vez pela rotina atd_tarefa_salvar (as regras de acesso valem
-- igual: ela roda como a pessoa logada). Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) as tabelas
create table if not exists public.atd_tarefas (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  descricao       text check (descricao is null or length(descricao) <= 4000),
  responsavel_id  uuid references public.usuarios(id) on delete set null,
  criado_por      uuid default auth.uid() references public.usuarios(id) on delete set null,
  prazo           timestamptz,
  -- false = só o dia (o prazo fica no fim do dia, 23:59 de Brasília); true = dia e hora
  prazo_com_hora  boolean not null default false,
  prioridade      text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  status          text not null default 'pendente' check (status in ('pendente', 'andamento', 'concluida')),
  projeto         text check (projeto is null or length(projeto) <= 80),
  conversa_id     uuid references public.conversas(id) on delete set null,
  contato_id      uuid references public.contatos(id) on delete set null,
  cliente_nome    text check (cliente_nome is null or length(cliente_nome) <= 160),
  concluida_em    timestamptz,
  concluida_por   uuid references public.usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create table if not exists public.atd_tarefa_itens (
  id              uuid primary key default gen_random_uuid(),
  tarefa_id       uuid not null references public.atd_tarefas(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  texto           text not null check (length(btrim(texto)) between 1 and 300),
  feito           boolean not null default false,
  ordem           integer not null default 0,
  feito_em        timestamptz,
  criado_em       timestamptz not null default now()
);

create index if not exists atd_tarefas_org_status_prazo on public.atd_tarefas (organizacao_id, status, prazo);
create index if not exists atd_tarefas_responsavel on public.atd_tarefas (responsavel_id, status);
create index if not exists atd_tarefas_criado_por on public.atd_tarefas (criado_por);
create index if not exists atd_tarefas_conversa on public.atd_tarefas (conversa_id) where conversa_id is not null;
create index if not exists atd_tarefas_contato on public.atd_tarefas (contato_id) where contato_id is not null;
create index if not exists atd_tarefas_concluida_por on public.atd_tarefas (concluida_por) where concluida_por is not null;
create index if not exists atd_tarefa_itens_tarefa on public.atd_tarefa_itens (tarefa_id, ordem);
create index if not exists atd_tarefa_itens_org on public.atd_tarefa_itens (organizacao_id);

-- 2) antes de gravar a tarefa: limpa os textos, confere responsável e conversa (da mesma empresa), não deixa
--    trocar empresa nem autor, e carimba quando foi concluída. SECURITY DEFINER só para CONFERIR (a pessoa
--    pode não enxergar a lista inteira da equipe nem a conversa de outro atendente).
create or replace function public.atd_tarefas_antes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_ct  uuid;
  v_nome text;
begin
  new.titulo := btrim(new.titulo);
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.projeto := nullif(btrim(coalesce(new.projeto, '')), '');
  new.cliente_nome := nullif(btrim(coalesce(new.cliente_nome, '')), '');

  if tg_op = 'UPDATE' then
    new.organizacao_id := old.organizacao_id;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;

  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    if not exists (select 1 from public.organizacao_usuarios ou
                    where ou.organizacao_id = new.organizacao_id and ou.usuario_id = new.responsavel_id and ou.status = 'ativo') then
      raise exception 'responsavel_fora_da_equipe';
    end if;
  end if;

  if new.conversa_id is not null and (tg_op = 'INSERT' or new.conversa_id is distinct from old.conversa_id) then
    select c.organizacao_id, c.contato_id into v_org, v_ct from public.conversas c where c.id = new.conversa_id;
    if v_org is distinct from new.organizacao_id then raise exception 'conversa_de_outra_empresa'; end if;
    new.contato_id := coalesce(v_ct, new.contato_id);
  elsif new.conversa_id is null and tg_op = 'UPDATE' and old.conversa_id is not null and new.contato_id is not distinct from old.contato_id then
    -- tirou o vínculo com a conversa: sai o cliente junto
    new.contato_id := null;
    new.cliente_nome := null;
  end if;

  if new.contato_id is not null and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select ct.organizacao_id, nullif(btrim(coalesce(ct.nome, '')), '') into v_org, v_nome from public.contatos ct where ct.id = new.contato_id;
    if v_org is distinct from new.organizacao_id then raise exception 'cliente_de_outra_empresa'; end if;
    new.cliente_nome := coalesce(new.cliente_nome, v_nome);
  end if;

  if new.status = 'concluida' then
    if tg_op = 'INSERT' or old.status <> 'concluida' then
      new.concluida_em := now();
      new.concluida_por := auth.uid();
    else
      new.concluida_em := old.concluida_em;
      new.concluida_por := old.concluida_por;
    end if;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end;
$$;
revoke all on function public.atd_tarefas_antes() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefas_antes on public.atd_tarefas;
create trigger trg_atd_tarefas_antes before insert or update on public.atd_tarefas
  for each row execute function public.atd_tarefas_antes();

-- 3) tarefa passada para outra pessoa (na criação ou depois): aviso no sino de quem recebeu
create or replace function public.atd_tarefas_avisar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quem text;
  v_prazo text;
begin
  if new.responsavel_id is null or new.status = 'concluida' then return null; end if;
  if new.responsavel_id is not distinct from auth.uid() then return null; end if; -- tarefa para si mesmo: sem aviso
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return null; end if;
  select nullif(btrim(u.nome), '') into v_quem from public.usuarios u where u.id = auth.uid();
  v_prazo := case when new.prazo is null then ''
                  when new.prazo_com_hora then ' · prazo ' || to_char(new.prazo at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
                  else ' · prazo ' || to_char(new.prazo at time zone 'America/Sao_Paulo', 'DD/MM') end;
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (new.organizacao_id, new.responsavel_id, 'tarefa', 'Nova tarefa para você',
          left(coalesce(v_quem, 'Alguém da equipe') || ' passou uma tarefa para você: ' || new.titulo || v_prazo, 500),
          '/tarefas?tarefa=' || new.id, new.id);
  return null;
end;
$$;
revoke all on function public.atd_tarefas_avisar() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefas_avisar on public.atd_tarefas;
create trigger trg_atd_tarefas_avisar after insert or update of responsavel_id on public.atd_tarefas
  for each row execute function public.atd_tarefas_avisar();

-- 4) antes de gravar a subtarefa: a empresa vem da tarefa (que a pessoa precisa enxergar), não muda de tarefa,
--    e carimba quando foi feita
create or replace function public.atd_tarefa_itens_antes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.tarefa_id := old.tarefa_id;
    new.organizacao_id := old.organizacao_id;
    new.criado_em := old.criado_em;
  else
    select t.organizacao_id into new.organizacao_id from public.atd_tarefas t where t.id = new.tarefa_id;
    if new.organizacao_id is null then raise exception 'tarefa_nao_encontrada'; end if;
  end if;
  new.texto := btrim(new.texto);
  new.feito_em := case when not new.feito then null
                       when tg_op = 'UPDATE' and old.feito then old.feito_em
                       else now() end;
  return new;
end;
$$;
revoke all on function public.atd_tarefa_itens_antes() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefa_itens_antes on public.atd_tarefa_itens;
create trigger trg_atd_tarefa_itens_antes before insert or update on public.atd_tarefa_itens
  for each row execute function public.atd_tarefa_itens_antes();

-- 5) quem vê, cria, muda e apaga
alter table public.atd_tarefas enable row level security;
alter table public.atd_tarefa_itens enable row level security;
revoke all on table public.atd_tarefas, public.atd_tarefa_itens from public, anon, authenticated;
grant select, insert, update, delete on table public.atd_tarefas, public.atd_tarefa_itens to authenticated;
grant all on table public.atd_tarefas, public.atd_tarefa_itens to service_role;

drop policy if exists atd_tarefas_sel on public.atd_tarefas;
drop policy if exists atd_tarefas_ins on public.atd_tarefas;
drop policy if exists atd_tarefas_upd on public.atd_tarefas;
drop policy if exists atd_tarefas_del on public.atd_tarefas;
-- ver: administrador, quem criou ou quem é o responsável
create policy atd_tarefas_sel on public.atd_tarefas as permissive for select to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'));
-- criar: qualquer pessoa da empresa, sempre em nome próprio
create policy atd_tarefas_ins on public.atd_tarefas as permissive for insert to authenticated
  with check (public.is_member(organizacao_id) and criado_por = (select auth.uid()));
-- mudar: quem enxerga a tarefa. Passar a tarefa para OUTRA pessoa sem ser quem criou (nem o administrador)
-- faz a pessoa deixar de enxergá-la — o Postgres recusa essa troca direta, então ela passa pela rotina
-- atd_tarefa_passar (abaixo), que confere o mesmo acesso
create policy atd_tarefas_upd on public.atd_tarefas as permissive for update to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'))
  with check (public.is_member(organizacao_id));
-- apagar: administrador ou quem criou
create policy atd_tarefas_del on public.atd_tarefas as permissive for delete to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'));

-- subtarefas: valem as regras da tarefa (a consulta à tarefa já passa pelas regras acima)
drop policy if exists atd_tarefa_itens_sel on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_ins on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_upd on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_del on public.atd_tarefa_itens;
create policy atd_tarefa_itens_sel on public.atd_tarefa_itens as permissive for select to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_ins on public.atd_tarefa_itens as permissive for insert to authenticated
  with check (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_upd on public.atd_tarefa_itens as permissive for update to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id))
  with check (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_del on public.atd_tarefa_itens as permissive for delete to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));

-- 6) passar a tarefa para outra pessoa da empresa (ou tirar o responsável: p_responsavel nulo). Quem pode: quem
--    enxerga a tarefa (administrador, quem criou ou quem está com ela). O gatilho confere que a pessoa é da equipe
--    e avisa quem recebeu.
create or replace function public.atd_tarefa_passar(p_id uuid, p_responsavel uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_criador uuid;
  v_resp uuid;
begin
  select t.organizacao_id, t.criado_por, t.responsavel_id into v_org, v_criador, v_resp from public.atd_tarefas t where t.id = p_id;
  if v_org is null or auth.uid() is null or not public.is_member(v_org)
     or not (v_criador = auth.uid() or v_resp = auth.uid() or coalesce(public.org_papel(v_org), '') = 'admin') then
    raise exception 'tarefa_nao_encontrada';
  end if;
  if v_resp is not distinct from p_responsavel then return; end if;
  update public.atd_tarefas set responsavel_id = p_responsavel where id = p_id;
end;
$$;
revoke all on function public.atd_tarefa_passar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.atd_tarefa_passar(uuid, uuid) to authenticated, service_role;

-- 7) gravar a tarefa e as subtarefas de uma vez (criar: p_id nulo). Roda COMO A PESSOA (security invoker):
--    as regras acima valem igual. p_itens: [{id?, texto, feito}] na ordem da tela; o que sumiu da lista é apagado.
--    Ordem: subtarefas, depois a tarefa, e o responsável por último (quem passa a tarefa adiante pode deixar de
--    enxergá-la logo depois).
create or replace function public.atd_tarefa_salvar(p_org uuid, p_id uuid, p_dados jsonb, p_itens jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid := p_id;
  v_item  jsonb;
  v_ordem integer := 0;
  v_ids   uuid[] := '{}';
  v_iid   uuid;
  v_conv  uuid := nullif(p_dados->>'conversa_id', '')::uuid;
  v_ct    uuid := nullif(p_dados->>'contato_id', '')::uuid;
begin
  if p_dados is null or nullif(btrim(coalesce(p_dados->>'titulo', '')), '') is null then raise exception 'titulo_obrigatorio'; end if;
  if p_itens is not null and jsonb_typeof(p_itens) <> 'array' then raise exception 'itens_invalidos'; end if;
  if p_itens is not null and jsonb_array_length(p_itens) > 50 then raise exception 'itens_demais'; end if;

  if v_id is null then
    insert into public.atd_tarefas (organizacao_id, titulo, descricao, responsavel_id, prazo, prazo_com_hora, prioridade, status, projeto, conversa_id, contato_id, cliente_nome)
    values (p_org, p_dados->>'titulo', p_dados->>'descricao', nullif(p_dados->>'responsavel_id', '')::uuid,
            nullif(p_dados->>'prazo', '')::timestamptz, coalesce((p_dados->>'prazo_com_hora')::boolean, false),
            coalesce(nullif(p_dados->>'prioridade', ''), 'media'), coalesce(nullif(p_dados->>'status', ''), 'pendente'),
            p_dados->>'projeto', v_conv, v_ct, p_dados->>'cliente_nome')
    returning id into v_id;
  elsif not exists (select 1 from public.atd_tarefas t where t.id = v_id) then
    raise exception 'tarefa_nao_encontrada';
  end if;

  if p_itens is not null then
    for v_item in select x from jsonb_array_elements(p_itens) x loop
      if nullif(btrim(coalesce(v_item->>'texto', '')), '') is null then continue; end if;
      v_iid := null;
      if coalesce(v_item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        update public.atd_tarefa_itens set texto = v_item->>'texto', feito = coalesce((v_item->>'feito')::boolean, false), ordem = v_ordem
         where id = (v_item->>'id')::uuid and tarefa_id = v_id
        returning id into v_iid;
      end if;
      if v_iid is null then
        insert into public.atd_tarefa_itens (tarefa_id, texto, feito, ordem)
        values (v_id, v_item->>'texto', coalesce((v_item->>'feito')::boolean, false), v_ordem)
        returning id into v_iid;
      end if;
      v_ids := v_ids || v_iid;
      v_ordem := v_ordem + 1;
    end loop;
    delete from public.atd_tarefa_itens where tarefa_id = v_id and not (id = any (v_ids));
  end if;

  if p_id is not null then
    update public.atd_tarefas set
      titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao',
      prazo = nullif(p_dados->>'prazo', '')::timestamptz,
      prazo_com_hora = coalesce((p_dados->>'prazo_com_hora')::boolean, false),
      prioridade = coalesce(nullif(p_dados->>'prioridade', ''), 'media'),
      status = coalesce(nullif(p_dados->>'status', ''), 'pendente'),
      projeto = p_dados->>'projeto',
      conversa_id = v_conv,
      contato_id = case when v_conv is null then v_ct else contato_id end,
      cliente_nome = case when v_conv is null and v_ct is null then null else coalesce(p_dados->>'cliente_nome', cliente_nome) end
     where id = v_id;
    -- o responsável por último (passar para outra pessoa pode tirar a tarefa da vista de quem passou)
    perform public.atd_tarefa_passar(v_id, nullif(p_dados->>'responsavel_id', '')::uuid);
  end if;
  return v_id;
end;
$$;
revoke all on function public.atd_tarefa_salvar(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.atd_tarefa_salvar(uuid, uuid, jsonb, jsonb) to authenticated, service_role;

-- ===================== 20261125_102_chat_equipe.sql =====================
-- 102 · CHAT DA EQUIPE no Atendimento (dono 25/11, a partir do sistema que a Reviza usava antes: o "Chat Interno" do menu,
-- com o número de não lidas). Conversa entre colegas, de pessoa para pessoa ou em grupo, só texto, com "não lidas" e "visto".
--   atd_chat_salas    a conversa: 'direta' (duas pessoas, uma só por dupla) ou 'grupo' (com nome)
--   atd_chat_membros  quem está na conversa e até quando leu (lido_ate) — é dela que saem as não lidas e o "visto"
--   atd_chat_msgs     as mensagens (texto de 1 a 4000 letras)
-- REGRA DE ACESSO (dentro do banco, não só na tela): cada pessoa só lê as conversas em que ela ESTÁ — nem o administrador
-- lê a conversa de outros dois. Mensagem só sai em nome de quem está logado, numa conversa em que ele está. Cada um só marca
-- a SUA leitura. Conversa nova só pelas rotinas abaixo (atd_chat_abrir_direta e atd_chat_criar_grupo), sempre dentro da
-- empresa e só com pessoas ativas dela. Quem sai do Atendimento (inativo) deixa de ler tudo na hora.
-- Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) as tabelas
create table if not exists public.atd_chat_salas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo           text not null check (tipo in ('direta', 'grupo')),
  nome           text check (nome is null or char_length(btrim(nome)) between 1 and 80),
  -- direta: "menor-id:maior-id" — garante UMA conversa por dupla mesmo com os dois abrindo ao mesmo tempo
  chave_direta   text,
  criado_por     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  ultima_msg_em  timestamptz,
  constraint atd_chat_salas_direta_tem_chave check ((tipo = 'direta') = (chave_direta is not null)),
  constraint atd_chat_salas_grupo_tem_nome check (tipo = 'direta' or nome is not null)
);
create unique index if not exists atd_chat_salas_dupla on public.atd_chat_salas (organizacao_id, chave_direta) where chave_direta is not null;

create table if not exists public.atd_chat_membros (
  sala_id    uuid not null references public.atd_chat_salas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  lido_ate   timestamptz,
  entrou_em  timestamptz not null default now(),
  primary key (sala_id, usuario_id)
);
create index if not exists atd_chat_membros_usuario on public.atd_chat_membros (usuario_id);

create table if not exists public.atd_chat_msgs (
  id             uuid primary key default gen_random_uuid(),
  sala_id        uuid not null references public.atd_chat_salas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  autor_id       uuid references public.usuarios(id) on delete set null,
  texto          text not null check (char_length(texto) between 1 and 4000 and btrim(texto) <> ''),
  criado_em      timestamptz not null default now(),
  editado_em     timestamptz,
  apagada        boolean not null default false
);
create index if not exists atd_chat_msgs_sala_quando on public.atd_chat_msgs (sala_id, criado_em desc);
create index if not exists atd_chat_msgs_autor on public.atd_chat_msgs (autor_id);

-- 2) as conversas que a pessoa logada enxerga: as dela, numa empresa em que ela está ativa. Uma vez por consulta nas
--    regras abaixo (forma "sala_id in (select …)"), nunca uma chamada por linha.
create or replace function public.atd_chat_salas_que_vejo()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sala_id
    from public.atd_chat_membros m
    join public.atd_chat_salas s on s.id = m.sala_id
   where m.usuario_id = (select auth.uid())
     and public.is_member(s.organizacao_id)
$$;
revoke all on function public.atd_chat_salas_que_vejo() from public, anon;
grant execute on function public.atd_chat_salas_que_vejo() to authenticated, service_role;

-- 3) regras de acesso
alter table public.atd_chat_salas enable row level security;
alter table public.atd_chat_membros enable row level security;
alter table public.atd_chat_msgs enable row level security;
revoke all on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs from public, anon, authenticated;
grant select on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs to authenticated;
grant update (lido_ate) on table public.atd_chat_membros to authenticated;       -- só a própria leitura (regra abaixo)
grant insert (sala_id, autor_id, texto) on table public.atd_chat_msgs to authenticated; -- empresa e hora: o banco põe
grant all on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs to service_role;

drop policy if exists atd_chat_salas_sel on public.atd_chat_salas;
create policy atd_chat_salas_sel on public.atd_chat_salas for select to authenticated
  using (id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_membros_sel on public.atd_chat_membros;
create policy atd_chat_membros_sel on public.atd_chat_membros for select to authenticated
  using (sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_membros_upd on public.atd_chat_membros;
create policy atd_chat_membros_upd on public.atd_chat_membros for update to authenticated
  using (usuario_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()))
  with check (usuario_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_msgs_sel on public.atd_chat_msgs;
create policy atd_chat_msgs_sel on public.atd_chat_msgs for select to authenticated
  using (sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_msgs_ins on public.atd_chat_msgs;
create policy atd_chat_msgs_ins on public.atd_chat_msgs for insert to authenticated
  with check (autor_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()));

-- 4) a mensagem nova: a empresa vem da conversa e a hora é a do banco (ninguém data mensagem no passado);
--    depois, a conversa sobe na lista e quem escreveu já leu até ali
create or replace function public.atd_chat_msg_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.organizacao_id into new.organizacao_id from public.atd_chat_salas s where s.id = new.sala_id;
  if new.organizacao_id is null then raise exception 'sala_inexistente'; end if;
  new.criado_em := now();
  new.editado_em := null;
  new.apagada := false;
  return new;
end;
$$;
create or replace function public.atd_chat_msg_depois()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atd_chat_salas set ultima_msg_em = greatest(coalesce(ultima_msg_em, new.criado_em), new.criado_em) where id = new.sala_id;
  if new.autor_id is not null then
    update public.atd_chat_membros set lido_ate = greatest(coalesce(lido_ate, new.criado_em), new.criado_em)
     where sala_id = new.sala_id and usuario_id = new.autor_id;
  end if;
  return null;
end;
$$;
revoke all on function public.atd_chat_msg_antes() from public, anon, authenticated;
revoke all on function public.atd_chat_msg_depois() from public, anon, authenticated;
drop trigger if exists atd_chat_msgs_antes on public.atd_chat_msgs;
create trigger atd_chat_msgs_antes before insert on public.atd_chat_msgs for each row execute function public.atd_chat_msg_antes();
drop trigger if exists atd_chat_msgs_depois on public.atd_chat_msgs;
create trigger atd_chat_msgs_depois after insert on public.atd_chat_msgs for each row execute function public.atd_chat_msg_depois();

-- 5) abrir a conversa com um colega: devolve a que já existe ou cria (as duas pessoas ativas na MESMA empresa)
create or replace function public.atd_chat_abrir_direta(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu    uuid := auth.uid();
  v_org   uuid;
  v_chave text;
  v_id    uuid;
begin
  if v_eu is null then raise exception 'sem_sessao'; end if;
  if p_outro is null or p_outro = v_eu then raise exception 'pessoa_invalida'; end if;
  select a.organizacao_id into v_org
    from public.organizacao_usuarios a
    join public.organizacao_usuarios b on b.organizacao_id = a.organizacao_id and b.usuario_id = p_outro and b.status = 'ativo'
   where a.usuario_id = v_eu and a.status = 'ativo'
   order by a.criado_em limit 1;
  if v_org is null or not public.is_member(v_org) then raise exception 'fora_da_empresa'; end if;
  v_chave := least(v_eu::text, p_outro::text) || ':' || greatest(v_eu::text, p_outro::text);
  select id into v_id from public.atd_chat_salas where organizacao_id = v_org and chave_direta = v_chave;
  if v_id is not null then return v_id; end if;
  insert into public.atd_chat_salas (organizacao_id, tipo, criado_por, chave_direta)
  values (v_org, 'direta', v_eu, v_chave)
  on conflict (organizacao_id, chave_direta) where chave_direta is not null do nothing
  returning id into v_id;
  if v_id is null then -- o colega abriu no mesmo instante: vale a dele
    select id into v_id from public.atd_chat_salas where organizacao_id = v_org and chave_direta = v_chave;
    return v_id;
  end if;
  insert into public.atd_chat_membros (sala_id, usuario_id) values (v_id, v_eu), (v_id, p_outro);
  return v_id;
end;
$$;
revoke all on function public.atd_chat_abrir_direta(uuid) from public, anon;
grant execute on function public.atd_chat_abrir_direta(uuid) to authenticated, service_role;

-- 6) criar um grupo: nome de 1 a 80 letras, quem cria entra sozinho na lista, de 2 a 100 pessoas, todas ativas na empresa
create or replace function public.atd_chat_criar_grupo(p_nome text, p_membros uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu    uuid := auth.uid();
  v_nome  text := nullif(btrim(coalesce(p_nome, '')), '');
  v_org   uuid;
  v_lista uuid[];
  v_id    uuid;
begin
  if v_eu is null then raise exception 'sem_sessao'; end if;
  if v_nome is null or char_length(v_nome) > 80 then raise exception 'nome_invalido'; end if;
  select organizacao_id into v_org from public.organizacao_usuarios
   where usuario_id = v_eu and status = 'ativo' order by criado_em limit 1;
  if v_org is null or not public.is_member(v_org) then raise exception 'fora_da_empresa'; end if;
  v_lista := array(select distinct x from unnest(coalesce(p_membros, '{}'::uuid[]) || v_eu) x where x is not null);
  if cardinality(v_lista) < 2 then raise exception 'poucas_pessoas'; end if;
  if cardinality(v_lista) > 100 then raise exception 'pessoas_demais'; end if;
  if exists (
    select 1 from unnest(v_lista) x
     where not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = x and ou.status = 'ativo')
  ) then raise exception 'pessoa_fora_da_empresa'; end if;
  insert into public.atd_chat_salas (organizacao_id, tipo, nome, criado_por) values (v_org, 'grupo', v_nome, v_eu) returning id into v_id;
  insert into public.atd_chat_membros (sala_id, usuario_id) select v_id, x from unnest(v_lista) x;
  return v_id;
end;
$$;
revoke all on function public.atd_chat_criar_grupo(text, uuid[]) from public, anon;
grant execute on function public.atd_chat_criar_grupo(text, uuid[]) to authenticated, service_role;

-- 7) a lista da tela: as conversas da pessoa, com as pessoas (e até quando cada uma leu, para o "visto"), a última
--    mensagem e as não lidas — tudo numa chamada. Não lida = de OUTRA pessoa, depois da leitura (ou da entrada, quando
--    ainda não leu nada), não apagada.
create or replace function public.atd_chat_minhas_salas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(q.j order by q.ordem desc), '[]'::jsonb) from (
    select coalesce(s.ultima_msg_em, s.criado_em) as ordem, jsonb_build_object(
      'id', s.id, 'tipo', s.tipo, 'nome', s.nome, 'criado_em', s.criado_em, 'ultima_msg_em', s.ultima_msg_em,
      'lido_ate', m.lido_ate,
      'membros', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'lido_ate', mm.lido_ate) order by u.nome), '[]'::jsonb)
                    from public.atd_chat_membros mm join public.usuarios u on u.id = mm.usuario_id where mm.sala_id = s.id),
      'ultima', (select jsonb_build_object('autor_id', x.autor_id, 'texto', case when x.apagada then null else left(x.texto, 160) end,
                        'apagada', x.apagada, 'criado_em', x.criado_em)
                   from public.atd_chat_msgs x where x.sala_id = s.id order by x.criado_em desc limit 1),
      'nao_lidas', (select count(*) from public.atd_chat_msgs x
                     where x.sala_id = s.id and (case when m.lido_ate is null then x.criado_em >= m.entrou_em else x.criado_em > m.lido_ate end)
                       and x.autor_id is distinct from m.usuario_id and not x.apagada)
    ) as j
      from public.atd_chat_membros m
      join public.atd_chat_salas s on s.id = m.sala_id
     where m.usuario_id = (select auth.uid())
       and public.is_member(s.organizacao_id)
  ) q
$$;
revoke all on function public.atd_chat_minhas_salas() from public, anon;
grant execute on function public.atd_chat_minhas_salas() to authenticated, service_role;

-- 8) o número do menu: só a contagem (a consulta barata que o menu repete)
create or replace function public.atd_chat_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.atd_chat_membros m
    join public.atd_chat_salas s on s.id = m.sala_id
    join public.atd_chat_msgs x on x.sala_id = m.sala_id
   where m.usuario_id = (select auth.uid())
     and public.is_member(s.organizacao_id)
     and (case when m.lido_ate is null then x.criado_em >= m.entrou_em else x.criado_em > m.lido_ate end)
     and x.autor_id is distinct from m.usuario_id
     and not x.apagada
$$;
revoke all on function public.atd_chat_nao_lidas() from public, anon;
grant execute on function public.atd_chat_nao_lidas() to authenticated, service_role;

-- 9) "li até aqui": até a última mensagem que existe na conversa (a hora do banco, nunca a do computador)
create or replace function public.atd_chat_marcar_lida(p_sala uuid)
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  update public.atd_chat_membros m
     set lido_ate = greatest(m.lido_ate, (select max(x.criado_em) from public.atd_chat_msgs x where x.sala_id = p_sala))
   where m.sala_id = p_sala
     and m.usuario_id = (select auth.uid())
     and exists (select 1 from public.atd_chat_salas s where s.id = p_sala and public.is_member(s.organizacao_id))
  returning m.lido_ate
$$;
revoke all on function public.atd_chat_marcar_lida(uuid) from public, anon;
grant execute on function public.atd_chat_marcar_lida(uuid) to authenticated, service_role;

-- 10) tempo real: mensagem nova e leitura nova chegam na hora (cada um só recebe o que a regra de acesso deixa ler).
--     Sem o tempo real a tela confere a cada 30 segundos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atd_chat_msgs') then
      alter publication supabase_realtime add table public.atd_chat_msgs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atd_chat_membros') then
      alter publication supabase_realtime add table public.atd_chat_membros;
    end if;
  end if;
end $$;

-- DESFAZER: alter publication supabase_realtime drop table public.atd_chat_msgs, public.atd_chat_membros;
--           drop table public.atd_chat_msgs, public.atd_chat_membros, public.atd_chat_salas;
--           drop function public.atd_chat_salas_que_vejo(), public.atd_chat_msg_antes(), public.atd_chat_msg_depois(),
--             public.atd_chat_abrir_direta(uuid), public.atd_chat_criar_grupo(text, uuid[]), public.atd_chat_minhas_salas(),
--             public.atd_chat_nao_lidas(), public.atd_chat_marcar_lida(uuid);

-- ===================== 20261125_103_retomada.sql =====================
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

-- ===================== 20261125_105_motivo_fechamento.sql =====================
-- 105 · MOTIVO AO FECHAR A CONVERSA (25/11, como no sistema que a Reviza usava antes: "Motivos de fechamento — as opções que
-- aparecem ao fechar uma conversa, e o histórico de quem fechou e por quê"). Fechar continua sendo mudar o status para
-- "Fechada" (como já era); esta rotina só registra o MOTIVO na atividade do atendimento (conversa_atividades, tipo
-- 'fechado'), que o painel do cliente já mostra. Quem pode: quem vê a conversa (atd_vejo_conversa), membro ativo da
-- empresa. Nada mais muda.
create or replace function public.atd_conversa_registrar_fechamento(p_conversa uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_id uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin() or public.is_member(v_org)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public.atd_vejo_conversa(p_conversa) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if char_length(v_motivo) = 0 then raise exception 'motivo_vazio' using errcode = '22023'; end if;
  insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, motivo)
  values (v_org, p_conversa, v_uid, 'fechado', v_motivo)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.atd_conversa_registrar_fechamento(uuid, text) from public, anon;
grant execute on function public.atd_conversa_registrar_fechamento(uuid, text) to authenticated, service_role;

-- ===================== 20261125_106_aviso_espera.sql =====================
-- 106 · AVISO DE CLIENTE ESPERANDO ALÉM DA META (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá só
-- existia o relatório do tempo de resposta, depois do fato). Aqui o sistema avisa ENQUANTO o cliente espera:
--   · passou da meta (ex.: 30 min) sem resposta → aviso no sino do RESPONSÁVEL pela conversa;
--   · passou do segundo tempo (ex.: 60 min) → aviso no sino dos GESTORES (administrador e gestor da Reviza);
--   · conversa sem responsável → vai direto para os gestores quando passa da meta.
-- "Esperando" = a última mensagem da conversa é do cliente (a mesma regra do Dashboard › Atendentes, migration 97):
-- resposta da equipe OU da IA encerra a espera; envio que falhou, mensagem do sistema e nota interna não contam.
-- Nunca avisa: conversa fechada/resolvida ou arquivada, conversa com a IA atendendo (ia_sessoes 'ativa') — a não ser
-- que a IA tenha pedido uma pessoa (conversas.precisa_humano): aí o cliente está esperando a equipe.
-- Cada espera avisa UMA vez por nível (atd_aviso_espera_enviado). Ligar não avisa de esperas antigas: só as que
-- começaram até 2 horas antes de ligar. Modo 'uteis' = só conta seg–sex das 8 às 18 (horário de São Paulo).
-- Peças: atd_aviso_espera (a configuração, DESLIGADA de saída), private.atd_espera_agora (a conta),
-- public.atd_aviso_espera_tick (o agendador chama a cada 2 min — ver aplicar-aviso-espera.sh) e
-- public.atd_aviso_espera_previa (a lista "passaram da meta agora" da tela de Configurações).
-- ADITIVA: só cria peças novas. Depende da 93 (Atendimento) e da 97 (atd_minutos_uteis). DESFAZER no fim.

-- 1) a configuração (uma por empresa) -------------------------------------------------------------------------------
create table if not exists public.atd_aviso_espera (
  organizacao_id     uuid primary key references public.organizacoes(id) on delete cascade,
  ativo              boolean not null default false,
  meta_min           int     not null default 30,
  gestor_apos_min    int     not null default 60,
  modo               text    not null default 'uteis',
  avisar_responsavel boolean not null default true,
  avisar_gestores    boolean not null default true,
  ligado_em          timestamptz,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid,
  constraint atd_aviso_espera_meta check (meta_min between 5 and 480),
  constraint atd_aviso_espera_gestor check (gestor_apos_min between 5 and 1440 and gestor_apos_min >= meta_min),
  constraint atd_aviso_espera_modo check (modo in ('uteis', 'corrido'))
);

-- 2) o que já foi avisado (uma vez por espera e por nível) -----------------------------------------------------------
create table if not exists public.atd_aviso_espera_enviado (
  conversa_id    uuid not null references public.conversas(id) on delete cascade,
  desde          timestamptz not null,
  nivel          text not null,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (conversa_id, desde, nivel),
  constraint atd_aviso_espera_enviado_nivel check (nivel in ('responsavel', 'gestor'))
);
create index if not exists atd_aviso_espera_enviado_org_idx on public.atd_aviso_espera_enviado (organizacao_id, criado_em desc);

alter table public.atd_aviso_espera enable row level security;
alter table public.atd_aviso_espera_enviado enable row level security;
revoke all on public.atd_aviso_espera, public.atd_aviso_espera_enviado from public, anon, authenticated;
grant select, insert, update on public.atd_aviso_espera to authenticated;
grant all on public.atd_aviso_espera, public.atd_aviso_espera_enviado to service_role;
drop policy if exists atd_aviso_espera_admin on public.atd_aviso_espera;
create policy atd_aviso_espera_admin on public.atd_aviso_espera for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
-- atd_aviso_espera_enviado: sem política (só as funções abaixo mexem)

-- 3) carimbos: quem mexeu e quando foi ligado (a tela não escolhe essa data)
create or replace function private.atd_aviso_espera_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    new.ligado_em := now();
  elsif tg_op = 'INSERT' then
    new.ligado_em := null;
  else
    new.ligado_em := old.ligado_em;
  end if;
  return new;
end $$;
revoke all on function private.atd_aviso_espera_carimbo() from public, anon, authenticated;
drop trigger if exists atd_aviso_espera_carimbo on public.atd_aviso_espera;
create trigger atd_aviso_espera_carimbo before insert or update on public.atd_aviso_espera
  for each row execute function private.atd_aviso_espera_carimbo();

-- 4) "1 h 05 min"
create or replace function private.atd_fmt_minutos(p int)
returns text language sql immutable set search_path = '' as $$
  select case when p < 60 then p || ' min'
              when p % 60 = 0 then (p / 60) || ' h'
              else (p / 60) || ' h ' || lpad((p % 60)::text, 2, '0') || ' min' end $$;
revoke all on function private.atd_fmt_minutos(int) from public, anon, authenticated;

-- 5) quem está esperando AGORA nesta empresa (conversas com mensagem nos últimos 3 dias)
create or replace function private.atd_espera_agora(p_org uuid, p_modo text, p_desde_min timestamptz)
returns table (conversa_id uuid, desde timestamptz, atendente_id uuid, contato text, responsavel text, espera_min int)
language sql stable security definer set search_path = '' as $$
  with ultimas as (
    select distinct on (m.conversa_id) m.conversa_id, m.direcao
      from public.mensagens m
     where m.organizacao_id = p_org and m.criado_em >= now() - interval '3 days'
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')
     order by m.conversa_id, m.criado_em desc
  ),
  esperando as (
    select u.conversa_id, cv.atendente_id,
           (select min(coalesce(m2.recebida_em, m2.criado_em))
              from public.mensagens m2
             where m2.conversa_id = u.conversa_id and m2.direcao = 'entrada'
               and m2.criado_em > coalesce((select max(m3.criado_em) from public.mensagens m3
                                             where m3.conversa_id = u.conversa_id and m3.direcao = 'saida'
                                               and m3.status::text <> 'falhou' and m3.tipo::text not in ('sistema', 'nota_interna')),
                                           '-infinity'::timestamptz)) as desde,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Cliente sem nome') as contato
      from ultimas u
      join public.conversas cv on cv.id = u.conversa_id
      left join public.contatos c on c.id = cv.contato_id
     where u.direcao = 'entrada' and cv.arquivada_em is null and cv.status::text not in ('resolvida', 'fechada')
       -- a IA atendendo cuida da resposta; só entra se ela pediu uma pessoa (precisa_humano)
       and (coalesce(cv.precisa_humano, false)
            or not exists (select 1 from public.ia_sessoes s where s.conversa_id = cv.id and s.status = 'ativa'))
  )
  select e.conversa_id, e.desde, e.atendente_id, e.contato, nullif(btrim(us.nome), ''),
         round(case when p_modo = 'uteis' then public.atd_minutos_uteis(e.desde, now())
                    else extract(epoch from (now() - e.desde)) / 60.0 end)::int
    from esperando e
    left join public.usuarios us on us.id = e.atendente_id
   where e.desde is not null and e.desde >= coalesce(p_desde_min, '-infinity'::timestamptz)
$$;
revoke all on function private.atd_espera_agora(uuid, text, timestamptz) from public, anon, authenticated;

-- 6) os gestores que recebem: administrador e gestor da Reviza que estão no Atendimento
create or replace function private.atd_gestores_atendimento(p_org uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ou.usuario_id
    from public.organizacao_usuarios ou
   where ou.organizacao_id = p_org and ou.status = 'ativo' and ou.papel::text in ('admin', 'supervisor')
$$;
revoke all on function private.atd_gestores_atendimento(uuid) from public, anon, authenticated;

-- 7) o agendador: avisa quem passou da meta (devolve quantos avisos saíram)
create or replace function public.atd_aviso_espera_tick()
returns int language plpgsql security definer set search_path = '' as $$
declare cfg record; v_n int; v_total int := 0;
begin
  for cfg in select * from public.atd_aviso_espera where ativo loop
    create temporary table if not exists atd_espera_tmp (conversa_id uuid, desde timestamptz, atendente_id uuid, contato text, responsavel text, espera_min int) on commit drop;
    truncate pg_temp.atd_espera_tmp;
    insert into pg_temp.atd_espera_tmp
      select * from private.atd_espera_agora(cfg.organizacao_id, cfg.modo, cfg.ligado_em - interval '2 hours');

    -- o responsável, ao passar da meta
    if cfg.avisar_responsavel then
      with novos as (
        insert into public.atd_aviso_espera_enviado (conversa_id, desde, nivel, organizacao_id)
        select t.conversa_id, t.desde, 'responsavel', cfg.organizacao_id
          from pg_temp.atd_espera_tmp t where t.atendente_id is not null and t.espera_min >= cfg.meta_min
        on conflict do nothing
        returning conversa_id, desde
      )
      insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select cfg.organizacao_id, t.atendente_id, 'espera_meta',
             'Cliente esperando resposta há ' || private.atd_fmt_minutos(t.espera_min),
             t.contato || ' mandou mensagem e ainda não teve resposta. A meta da equipe é ' || private.atd_fmt_minutos(cfg.meta_min) || '.',
             '/whatsapp?conversa=' || t.conversa_id, t.conversa_id
        from novos n join pg_temp.atd_espera_tmp t on t.conversa_id = n.conversa_id and t.desde = n.desde;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;

    -- os gestores: passou do segundo tempo, ou passou da meta e a conversa não tem responsável
    if cfg.avisar_gestores then
      with novos as (
        insert into public.atd_aviso_espera_enviado (conversa_id, desde, nivel, organizacao_id)
        select t.conversa_id, t.desde, 'gestor', cfg.organizacao_id
          from pg_temp.atd_espera_tmp t
         where t.espera_min >= case when t.atendente_id is null then cfg.meta_min else cfg.gestor_apos_min end
        on conflict do nothing
        returning conversa_id, desde
      )
      insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select cfg.organizacao_id, g.usuario_id, 'espera_meta_gestor',
             'Cliente sem resposta há ' || private.atd_fmt_minutos(t.espera_min),
             t.contato || coalesce(' · responsável: ' || t.responsavel, ' · sem responsável') || '. A meta da equipe é ' || private.atd_fmt_minutos(cfg.meta_min) || '.',
             '/whatsapp?conversa=' || t.conversa_id, t.conversa_id
        from novos n
        join pg_temp.atd_espera_tmp t on t.conversa_id = n.conversa_id and t.desde = n.desde
        cross join private.atd_gestores_atendimento(cfg.organizacao_id) as g(usuario_id)
       where g.usuario_id is distinct from t.atendente_id;
      get diagnostics v_n = row_count; v_total := v_total + v_n;
    end if;
  end loop;
  -- o registro do que foi avisado não precisa durar: 15 dias bastam para não repetir
  delete from public.atd_aviso_espera_enviado where criado_em < now() - interval '15 days';
  return v_total;
end $$;
revoke all on function public.atd_aviso_espera_tick() from public, anon, authenticated;
grant execute on function public.atd_aviso_espera_tick() to service_role;

-- 8) a tela (só o administrador): quem passou da meta agora, com a meta que está na tela (antes de salvar)
create or replace function public.atd_aviso_espera_previa(p_meta_min int default 30, p_modo text default 'uteis')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if not public.is_at_least('admin') then raise exception 'sem_permissao'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('conversa_id', x.conversa_id, 'contato', x.contato, 'responsavel', x.responsavel,
             'espera_min', x.espera_min, 'desde', x.desde) order by x.espera_min desc)
      from (select * from private.atd_espera_agora(v_org, case when p_modo = 'corrido' then 'corrido' else 'uteis' end, null)
             where espera_min >= greatest(5, least(coalesce(p_meta_min, 30), 480))
             order by espera_min desc limit 30) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.atd_aviso_espera_previa(int, text) from public, anon;
grant execute on function public.atd_aviso_espera_previa(int, text) to authenticated, service_role;

-- DESFAZER:
--   select cron.unschedule('atd-aviso-espera');
--   drop function if exists public.atd_aviso_espera_previa(int, text), public.atd_aviso_espera_tick(),
--     private.atd_gestores_atendimento(uuid), private.atd_espera_agora(uuid, text, timestamptz), private.atd_fmt_minutos(int),
--     private.atd_aviso_espera_carimbo() cascade;
--   drop table if exists public.atd_aviso_espera_enviado, public.atd_aviso_espera;

-- ===================== 20261125_107_saude_numeros.sql =====================
-- 107 · SAÚDE DOS NÚMEROS DE WHATSAPP do Atendimento (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá
-- só aparecia "conectado/desconectado"). Para cada número: o que saiu, o que falhou e o que chegou hoje e nos últimos
-- 7 dias, quando chegou a última mensagem, e quantos clientes que A GENTE chamou responderam (WhatsApp bloqueia número
-- que manda muito para quem não responde). A tela (Configurações › WhatsApp) junta isso numa nota: boa, atenção ou risco,
-- com o motivo — inclusive o número "conectado, mas nada chega" (o travamento de 24/10 no Atenvo).
-- A mensagem conta para o número pelo qual a conversa falou por último (conversas.ultimo_canal_id, senão canal_id).
-- Só leitura: uma função, nenhuma tabela. Só o administrador. ADITIVA. Depende da 93 e da 97 (atd_minutos_uteis).
create or replace function public.atd_saude_numeros()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid := 'de300000-0000-4000-8000-000000000001';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_at_least('admin') then raise exception 'sem_permissao'; end if;
  return coalesce((
    with cn as (
      select c.id, c.nome_interno, c.numero_conectado, c.status_integracao::text as status, c.envio_restrito, c.entrega_status
        from public.canais c
       where c.organizacao_id = v_org and c.tipo::text = 'whatsapp' and c.ativo
    ),
    m as (
      select coalesce(cv.ultimo_canal_id, cv.canal_id) as canal_id, mm.conversa_id, mm.direcao::text as dir, mm.status::text as st,
             case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end as ts
        from public.mensagens mm
        join public.conversas cv on cv.id = mm.conversa_id
       where mm.organizacao_id = v_org and mm.criado_em >= now() - interval '8 days'
         and mm.tipo::text not in ('sistema', 'nota_interna')
    ),
    dia as (
      select canal_id, (ts at time zone 'America/Sao_Paulo')::date as d,
             count(*) filter (where dir = 'saida') as env,
             count(*) filter (where dir = 'saida' and st = 'falhou') as fal,
             count(*) filter (where dir = 'entrada') as rec
        from m where ts >= ((v_hoje - 6)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ),
    -- conversas que a gente CHAMOU nos 7 dias (a nossa mensagem veio antes de qualquer uma do cliente) e se ele respondeu
    chamadas as (
      select canal_id, conversa_id,
             min(ts) filter (where dir = 'saida' and st <> 'falhou') as nossa,
             min(ts) filter (where dir = 'entrada') as dele_primeira,
             max(ts) filter (where dir = 'entrada') as dele_ultima
        from m where ts >= now() - interval '7 days'
       group by 1, 2
    ),
    ult as (
      select canal_id, max(ts) filter (where dir = 'entrada') as rec, max(ts) filter (where dir = 'saida' and st <> 'falhou') as env
        from m group by 1
    )
    select jsonb_agg(jsonb_build_object(
             'canal_id', cn.id, 'nome', cn.nome_interno, 'numero', cn.numero_conectado, 'status', cn.status,
             'envio_restrito', cn.envio_restrito, 'entrega_status', cn.entrega_status,
             'hoje', jsonb_build_object('enviadas', coalesce(h.env, 0), 'falharam', coalesce(h.fal, 0), 'recebidas', coalesce(h.rec, 0)),
             'ultima_recebida', u.rec, 'ultima_enviada', u.env,
             'sem_receber_min_uteis', case when u.rec is null then null else round(public.atd_minutos_uteis(u.rec, now()))::int end,
             'recebidas_7d', (select coalesce(sum(x.rec), 0) from dia x where x.canal_id = cn.id),
             'enviadas_7d', (select coalesce(sum(x.env), 0) from dia x where x.canal_id = cn.id),
             'falharam_7d', (select coalesce(sum(x.fal), 0) from dia x where x.canal_id = cn.id),
             'chamadas_7d', (select count(*) from chamadas k where k.canal_id = cn.id and k.nossa is not null and (k.dele_primeira is null or k.dele_primeira > k.nossa)),
             'responderam_7d', (select count(*) from chamadas k where k.canal_id = cn.id and k.nossa is not null and (k.dele_primeira is null or k.dele_primeira > k.nossa) and k.dele_ultima > k.nossa),
             'serie', (select jsonb_agg(jsonb_build_object('dia', g.d::date, 'enviadas', coalesce(x.env, 0), 'falharam', coalesce(x.fal, 0), 'recebidas', coalesce(x.rec, 0)) order by g.d)
                         from generate_series(v_hoje - 6, v_hoje, interval '1 day') g(d)
                         left join dia x on x.canal_id = cn.id and x.d = g.d::date)
           ) order by cn.nome_interno)
      from cn
      left join dia h on h.canal_id = cn.id and h.d = v_hoje
      left join ult u on u.canal_id = cn.id
  ), '[]'::jsonb);
end $$;
revoke all on function public.atd_saude_numeros() from public, anon;
grant execute on function public.atd_saude_numeros() to authenticated, service_role;
comment on function public.atd_saude_numeros() is 'Saúde dos números de WhatsApp do Atendimento (hoje, 7 dias, quem respondeu). Só administrador. Migration 107.';

-- DESFAZER:
--   drop function if exists public.atd_saude_numeros();

-- ===================== 20261125_108_resumo_dia.sql =====================
-- 108 · RESUMO DO DIA PARA O GESTOR (25/11, "algo melhor que" o sistema que a Reviza usava antes). O dia da equipe numa
-- tela só (Dashboard › Resumo do dia): quantos clientes escreveram, quantas conversas a equipe atendeu, o que a IA
-- respondeu, documentos que chegaram, conversas fechadas e por quê, leads novos/ganhos/perdidos no Kanban, quem
-- esperou além da meta (aviso da 106) e cada atendente. E, se o administrador ligar, um aviso no sino no fim da tarde
-- com o resumo e o link (atd_resumo_dia_config, DESLIGADO de saída; agendador a cada 10 min — aplicar-25-11-tarde.sh).
-- Peças: private.atd_resumo_dia_calc (a conta), public.atd_resumo_dia (a tela; só administrador),
-- public.atd_resumo_dia_tick (o agendador), atd_resumo_dia_config/_enviado.
-- ADITIVA: só cria peças novas. Depende da 93, da 105 (motivo ao fechar) e da 106 (avisos de espera). DESFAZER no fim.

-- 1) a configuração do aviso no sino ---------------------------------------------------------------------------------
create table if not exists public.atd_resumo_dia_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo          boolean not null default false,
  hora           time    not null default '18:30',
  dias           int[]   not null default '{1,2,3,4,5}',      -- 0 = domingo … 6 = sábado (horário de São Paulo)
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  constraint atd_resumo_dia_config_dias check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]),
  constraint atd_resumo_dia_config_hora check (hora between '06:00' and '23:30')
);
create table if not exists public.atd_resumo_dia_enviado (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  dia            date not null,
  criado_em      timestamptz not null default now(),
  primary key (organizacao_id, dia)
);
alter table public.atd_resumo_dia_config enable row level security;
alter table public.atd_resumo_dia_enviado enable row level security;
revoke all on public.atd_resumo_dia_config, public.atd_resumo_dia_enviado from public, anon, authenticated;
grant select, insert, update on public.atd_resumo_dia_config to authenticated;
grant all on public.atd_resumo_dia_config, public.atd_resumo_dia_enviado to service_role;
drop policy if exists atd_resumo_dia_config_admin on public.atd_resumo_dia_config;
create policy atd_resumo_dia_config_admin on public.atd_resumo_dia_config for all to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));

create or replace function private.atd_resumo_dia_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null then new.atualizado_por := auth.uid(); end if;
  return new;
end $$;
revoke all on function private.atd_resumo_dia_carimbo() from public, anon, authenticated;
drop trigger if exists atd_resumo_dia_carimbo on public.atd_resumo_dia_config;
create trigger atd_resumo_dia_carimbo before insert or update on public.atd_resumo_dia_config
  for each row execute function private.atd_resumo_dia_carimbo();

-- 2) a conta de um dia (horário de São Paulo) --------------------------------------------------------------------------
create or replace function private.atd_resumo_dia_calc(p_org uuid, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ini timestamptz := (p_dia::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo');
  v jsonb;
begin
  with
  m as (
    select mm.conversa_id, mm.direcao::text as dir, mm.tipo::text as tipo, mm.status::text as st, mm.origem, mm.autor_id
      from public.mensagens mm
     where mm.organizacao_id = p_org and mm.criado_em >= v_ini - interval '1 hour' and mm.criado_em < v_fim + interval '1 hour'
       and (case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end) >= v_ini
       and (case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end) < v_fim
       and mm.tipo::text not in ('sistema', 'nota_interna')
  ),
  humanas as (  -- o que a EQUIPE mandou (a IA é origem 'bot'; nota interna já saiu acima)
    select * from m where dir = 'saida' and st <> 'falhou' and coalesce(origem, '') not in ('bot', 'nota')
  ),
  fech as (
    select a.conversa_id, a.usuario_id, nullif(btrim(a.motivo), '') as motivo
      from public.conversa_atividades a
     where a.organizacao_id = p_org and a.tipo = 'fechado' and a.criado_em >= v_ini and a.criado_em < v_fim
  ),
  esp as (
    select e.conversa_id, min(e.criado_em) as quando
      from public.atd_aviso_espera_enviado e
     where e.organizacao_id = p_org and e.criado_em >= v_ini and e.criado_em < v_fim
     group by 1
  ),
  pessoas as (
    select u.id, coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome,
           (select count(distinct h.conversa_id) from humanas h where h.autor_id = u.id) as conversas,
           (select count(*) from humanas h where h.autor_id = u.id) as mensagens,
           (select count(*) from fech f where f.usuario_id = u.id) as fechadas
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  )
  select jsonb_build_object(
    'dia', p_dia,
    'clientes_escreveram', (select count(distinct conversa_id) from m where dir = 'entrada'),
    'recebidas', (select count(*) from m where dir = 'entrada'),
    'conversas_novas', (select count(*) from public.conversas c where c.organizacao_id = p_org and c.criado_em >= v_ini and c.criado_em < v_fim),
    'atendidas_equipe', (select count(distinct conversa_id) from humanas),
    'enviadas_equipe', (select count(*) from humanas),
    'pelo_celular', (select count(*) from humanas where origem = 'telefone'),
    'enviadas_ia', (select count(*) from m where dir = 'saida' and st <> 'falhou' and origem = 'bot'),
    'atendidas_ia', (select count(distinct conversa_id) from m where dir = 'saida' and st <> 'falhou' and origem = 'bot'),
    'falharam', (select count(*) from m where dir = 'saida' and st = 'falhou'),
    'docs_recebidos', (select count(*) from m where dir = 'entrada' and tipo in ('imagem', 'documento')),
    'fechadas', (select count(*) from fech),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', x.motivo, 'n', x.n) order by x.n desc, x.motivo)
                           from (select coalesce(motivo, 'Sem motivo') as motivo, count(*) as n from fech group by 1 order by 2 desc limit 8) x), '[]'::jsonb),
    'leads_novos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.criado_em >= v_ini and o.criado_em < v_fim),
    'ganhos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.status::text = 'ganho' and o.fechado_em >= v_ini and o.fechado_em < v_fim),
    'perdidos', (select count(*) from public.oportunidades o where o.organizacao_id = p_org and o.status::text = 'perdido' and o.fechado_em >= v_ini and o.fechado_em < v_fim),
    'esperaram_meta', (select count(*) from esp),
    'esperaram', coalesce((select jsonb_agg(jsonb_build_object('conversa_id', e.conversa_id, 'quando', e.quando,
                                 'contato', coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome'), 'responsavel', nullif(btrim(us.nome), '')) order by e.quando)
                             from (select * from esp order by quando limit 30) e
                             join public.conversas cv on cv.id = e.conversa_id
                             left join public.contatos ct on ct.id = cv.contato_id
                             left join public.usuarios us on us.id = cv.atendente_id), '[]'::jsonb),
    'atendentes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'conversas', p.conversas, 'mensagens', p.mensagens, 'fechadas', p.fechadas)
                                  order by p.conversas desc, p.mensagens desc, p.nome)
                             from pessoas p where p.conversas > 0 or p.fechadas > 0), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function private.atd_resumo_dia_calc(uuid, date) from public, anon, authenticated;

-- 3) a tela (só o administrador, como o resto do Dashboard): até 62 dias para trás
create or replace function public.atd_resumo_dia(p_dia date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if v_dia > v_hoje or v_dia < v_hoje - 62 then raise exception 'dia_invalido'; end if;
  return private.atd_resumo_dia_calc(v_org, v_dia) || jsonb_build_object('gerado_em', now());
end $$;
revoke all on function public.atd_resumo_dia(date) from public, anon;
grant execute on function public.atd_resumo_dia(date) to authenticated, service_role;

-- "1 lead novo" / "3 leads novos"
create or replace function private.atd_qtd(p_n int, p_um text, p_varios text)
returns text language sql immutable set search_path = '' as $$ select coalesce(p_n, 0) || ' ' || case when coalesce(p_n, 0) = 1 then p_um else p_varios end $$;
revoke all on function private.atd_qtd(int, text, text) from public, anon, authenticated;

-- 4) o agendador: no dia e hora escolhidos, um aviso no sino de cada administrador (uma vez por dia)
create or replace function public.atd_resumo_dia_tick()
returns int language plpgsql security definer set search_path = '' as $$
declare cfg record; v_agora timestamp := now() at time zone 'America/Sao_Paulo'; v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
        r jsonb; v_corpo text; v_n int; v_total int := 0;
begin
  for cfg in select * from public.atd_resumo_dia_config where ativo loop
    continue when not (extract(dow from v_agora)::int = any (cfg.dias)) or v_agora::time < cfg.hora;
    insert into public.atd_resumo_dia_enviado (organizacao_id, dia) values (cfg.organizacao_id, v_dia) on conflict do nothing;
    get diagnostics v_n = row_count;
    continue when v_n = 0;  -- já avisou hoje
    r := private.atd_resumo_dia_calc(cfg.organizacao_id, v_dia);
    v_corpo := private.atd_qtd((r->>'clientes_escreveram')::int, 'cliente escreveu', 'clientes escreveram') || ' · '
            || private.atd_qtd((r->>'atendidas_equipe')::int, 'atendido pela equipe', 'atendidos pela equipe') || ' · '
            || private.atd_qtd((r->>'fechadas')::int, 'conversa fechada', 'conversas fechadas') || ' · '
            || private.atd_qtd((r->>'leads_novos')::int, 'lead novo', 'leads novos')
            || case when (r->>'esperaram_meta')::int > 0 then ' · ' || private.atd_qtd((r->>'esperaram_meta')::int, 'esperou além da meta', 'esperaram além da meta') else '' end || '.';
    insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota)
    select cfg.organizacao_id, ou.usuario_id, 'resumo_dia', 'Resumo do dia ' || to_char(v_dia, 'DD/MM'), v_corpo,
           '/dashboard?aba=resumo&dia=' || to_char(v_dia, 'YYYY-MM-DD')
      from public.organizacao_usuarios ou
     where ou.organizacao_id = cfg.organizacao_id and ou.status = 'ativo' and ou.papel::text = 'admin';
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end loop;
  delete from public.atd_resumo_dia_enviado where dia < v_dia - 60;
  return v_total;
end $$;
revoke all on function public.atd_resumo_dia_tick() from public, anon, authenticated;
grant execute on function public.atd_resumo_dia_tick() to service_role;

-- DESFAZER:
--   select cron.unschedule('atd-resumo-dia');
--   drop function if exists public.atd_resumo_dia_tick(), private.atd_qtd(int, text, text), public.atd_resumo_dia(date), private.atd_resumo_dia_calc(uuid, date), private.atd_resumo_dia_carimbo() cascade;
--   drop table if exists public.atd_resumo_dia_enviado, public.atd_resumo_dia_config;

-- ===================== 20261126_109_agenda.sql =====================
-- 109 · AGENDA DO ATENDIMENTO (26/11, "igual" ao sistema que a Reviza usava antes — lá 11 reuniões marcadas e o
-- agente marcava "Agendar reunião"). Reuniões, ligações e retornos com dia, hora, quanto dura, quem faz, o cliente e a
-- conversa. A tela (Atendimento › Agenda) mostra dia, semana, mês e lista — e junta os presenciais que já existem.
-- Quem vê: o administrador vê tudo; os outros veem o que é deles (responsável ou quem marcou) e o das conversas que
-- eles enxergam. Marcar para outra pessoa avisa essa pessoa no sino (o aviso "Reunião agendada" de lá).
-- ADITIVA: só cria peças novas. Depende da 93. DESFAZER no fim.

create table if not exists public.atd_reunioes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  titulo         text not null,
  tipo           text not null default 'reuniao',
  inicio         timestamptz not null,
  duracao_min    int  not null default 30,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  contato_id     uuid references public.contatos(id) on delete set null,
  conversa_id    uuid references public.conversas(id) on delete set null,
  local          text,
  observacao     text,
  status         text not null default 'marcada',
  criado_por     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_reunioes_titulo check (char_length(btrim(titulo)) between 1 and 120),
  constraint atd_reunioes_tipo check (tipo in ('reuniao', 'ligacao', 'retorno', 'videochamada')),
  constraint atd_reunioes_duracao check (duracao_min between 5 and 480),
  constraint atd_reunioes_status check (status in ('marcada', 'feita', 'faltou', 'cancelada')),
  constraint atd_reunioes_local check (local is null or char_length(local) <= 200),
  constraint atd_reunioes_obs check (observacao is null or char_length(observacao) <= 1000)
);
create index if not exists atd_reunioes_inicio_idx on public.atd_reunioes (organizacao_id, inicio);
create index if not exists atd_reunioes_resp_idx on public.atd_reunioes (responsavel_id, inicio);
create index if not exists atd_reunioes_conversa_idx on public.atd_reunioes (conversa_id) where conversa_id is not null;

-- quem pode ver/mexer nesta reunião
create or replace function public.atd_vejo_reuniao(p_resp uuid, p_criador uuid, p_conversa uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(p_org) and (
    coalesce(public.org_papel(p_org), '') = 'admin' or public.is_platform_admin()
    or p_resp = auth.uid() or p_criador = auth.uid()
    or (p_conversa is not null and public.atd_vejo_conversa(p_conversa)))
$$;
revoke all on function public.atd_vejo_reuniao(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.atd_vejo_reuniao(uuid, uuid, uuid, uuid) to authenticated;

alter table public.atd_reunioes enable row level security;
revoke all on public.atd_reunioes from public, anon, authenticated;
grant select, insert, update, delete on public.atd_reunioes to authenticated;
grant all on public.atd_reunioes to service_role;
drop policy if exists atd_reunioes_ver on public.atd_reunioes;
create policy atd_reunioes_ver on public.atd_reunioes for select to authenticated
  using ((select public.atd_vejo_reuniao(responsavel_id, criado_por, conversa_id, organizacao_id)));
drop policy if exists atd_reunioes_marcar on public.atd_reunioes;
create policy atd_reunioes_marcar on public.atd_reunioes for insert to authenticated
  with check ((select public.is_member(organizacao_id)) and (conversa_id is null or (select public.atd_vejo_conversa(conversa_id))));
drop policy if exists atd_reunioes_mudar on public.atd_reunioes;
create policy atd_reunioes_mudar on public.atd_reunioes for update to authenticated
  using ((select public.atd_vejo_reuniao(responsavel_id, criado_por, conversa_id, organizacao_id)))
  with check ((select public.is_member(organizacao_id)));
drop policy if exists atd_reunioes_apagar on public.atd_reunioes;
create policy atd_reunioes_apagar on public.atd_reunioes for delete to authenticated
  using (criado_por = (select auth.uid()) or coalesce((select public.org_papel(organizacao_id)), '') = 'admin');

-- carimbos: quem marcou (a tela não escolhe), quando mudou; o cliente vem da conversa
create or replace function private.atd_reunioes_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.titulo := btrim(new.titulo);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); new.criado_em := now();
  else new.criado_por := old.criado_por; new.criado_em := old.criado_em; end if;
  if new.conversa_id is not null and new.contato_id is null then
    select contato_id into new.contato_id from public.conversas where id = new.conversa_id;
  end if;
  return new;
end $$;
revoke all on function private.atd_reunioes_carimbo() from public, anon, authenticated;
drop trigger if exists atd_reunioes_carimbo on public.atd_reunioes;
create trigger atd_reunioes_carimbo before insert or update on public.atd_reunioes
  for each row execute function private.atd_reunioes_carimbo();

-- "Reunião agendada": quem vai fazer recebe o aviso no sino (se não foi a própria pessoa que marcou)
create or replace function private.atd_reunioes_avisa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cliente text; v_quem text;
begin
  if new.responsavel_id is null or new.responsavel_id = coalesce(auth.uid(), new.criado_por) or new.status = 'cancelada' then return null; end if;
  if tg_op = 'UPDATE' and old.responsavel_id is not distinct from new.responsavel_id and old.inicio = new.inicio then return null; end if;
  select coalesce(nullif(btrim(nome), ''), telefone) into v_cliente from public.contatos where id = new.contato_id;
  select coalesce(nullif(btrim(nome), ''), 'Alguém da equipe') into v_quem from public.usuarios where id = coalesce(auth.uid(), new.criado_por);
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (new.organizacao_id, new.responsavel_id, 'reuniao_marcada',
          case when tg_op = 'INSERT' then 'Reunião marcada para você' else 'Reunião remarcada' end,
          coalesce(v_quem, 'Alguém da equipe') || ' marcou "' || new.titulo || '"' || coalesce(' com ' || v_cliente, '') || ' para '
            || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.',
          '/agenda?reuniao=' || new.id, new.id);
  return null;
end $$;
revoke all on function private.atd_reunioes_avisa() from public, anon, authenticated;
drop trigger if exists atd_reunioes_avisa on public.atd_reunioes;
create trigger atd_reunioes_avisa after insert or update on public.atd_reunioes
  for each row execute function private.atd_reunioes_avisa();

-- DESFAZER:
--   drop table if exists public.atd_reunioes;
--   drop function if exists public.atd_vejo_reuniao(uuid, uuid, uuid, uuid), private.atd_reunioes_carimbo(), private.atd_reunioes_avisa();

-- ===================== 20261126_110_campos_e_motivos.sql =====================
-- 110 · CAMPOS PERSONALIZADOS E MOTIVOS DE FECHAMENTO configuráveis (26/11, "igual" ao sistema que a Reviza usava
-- antes: lá Configurações › Campos personalizados — a Reviza tinha "Nome completo (RG)", que a IA preenche lendo o RG —
-- e Motivos de fechamento com ordem, ativo e histórico).
--   atd_campos          os campos da empresa (texto, número, data, lista, sim/não, telefone, e-mail), na ordem, ativos,
--                       e quais aparecem no cartão do Kanban. Só o administrador cria/muda; todos leem.
--   atd_campo_valores   o valor de cada campo em cada contato (quem pode mexer no contato preenche).
--   atd_motivos_fechamento  a lista do "Fechar conversa" (o motivo escolhido continua indo para conversa_atividades,
--                       como na 105). "Outro motivo" (com detalhe) existe sempre na tela, não fica aqui.
-- ADITIVA: só cria peças novas. Depende da 93 e da 105. DESFAZER no fim.

-- 1) os campos ----------------------------------------------------------------------------------------------------------
create table if not exists public.atd_campos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  tipo           text not null default 'texto',
  opcoes         text[] not null default '{}',
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  no_cartao      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_campos_nome check (char_length(btrim(nome)) between 1 and 60),
  constraint atd_campos_tipo check (tipo in ('texto', 'numero', 'data', 'lista', 'sim_nao', 'telefone', 'email')),
  constraint atd_campos_opcoes check (cardinality(opcoes) <= 30 and (tipo <> 'lista' or cardinality(opcoes) between 1 and 30))
);
create unique index if not exists atd_campos_nome_uniq on public.atd_campos (organizacao_id, lower(btrim(nome)));

create table if not exists public.atd_campo_valores (
  contato_id     uuid not null references public.contatos(id) on delete cascade,
  campo_id       uuid not null references public.atd_campos(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  primary key (contato_id, campo_id),
  constraint atd_campo_valores_valor check (char_length(valor) between 1 and 500)
);
create index if not exists atd_campo_valores_campo_idx on public.atd_campo_valores (campo_id);

alter table public.atd_campos enable row level security;
alter table public.atd_campo_valores enable row level security;
revoke all on public.atd_campos, public.atd_campo_valores from public, anon, authenticated;
grant select, insert, update, delete on public.atd_campos, public.atd_campo_valores to authenticated;
grant all on public.atd_campos, public.atd_campo_valores to service_role;

drop policy if exists atd_campos_ler on public.atd_campos;
create policy atd_campos_ler on public.atd_campos for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_campos_admin on public.atd_campos;
create policy atd_campos_admin on public.atd_campos for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- o valor segue a regra do próprio contato: quem vê o contato lê; quem pode mudar o contato preenche
drop policy if exists atd_campo_valores_ler on public.atd_campo_valores;
create policy atd_campo_valores_ler on public.atd_campo_valores for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
drop policy if exists atd_campo_valores_mudar on public.atd_campo_valores;
create policy atd_campo_valores_mudar on public.atd_campo_valores for all to authenticated
  using ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))))
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));

create or replace function private.atd_campo_valor_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_tipo text; v_opc text[];
begin
  select organizacao_id, tipo, opcoes into v_org, v_tipo, v_opc from public.atd_campos where id = new.campo_id;
  if v_org is null then raise exception 'campo_inexistente'; end if;
  -- o valor é do contato da MESMA empresa do campo
  if not exists (select 1 from public.contatos c where c.id = new.contato_id and c.organizacao_id = v_org) then raise exception 'contato_de_outra_empresa'; end if;
  new.organizacao_id := v_org;
  new.valor := btrim(new.valor);
  if v_tipo = 'numero' and new.valor !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'numero_invalido'; end if;
  if v_tipo = 'data' and new.valor !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data_invalida'; end if;
  if v_tipo = 'sim_nao' and new.valor not in ('sim', 'nao') then raise exception 'sim_nao_invalido'; end if;
  if v_tipo = 'lista' and not (new.valor = any (v_opc)) then raise exception 'opcao_invalida'; end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_campo_valor_carimbo() from public, anon, authenticated;
drop trigger if exists atd_campo_valor_carimbo on public.atd_campo_valores;
create trigger atd_campo_valor_carimbo before insert or update on public.atd_campo_valores
  for each row execute function private.atd_campo_valor_carimbo();

create or replace function private.atd_campos_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(new.nome);
  new.opcoes := coalesce((select array_agg(distinct btrim(o)) from unnest(new.opcoes) o where btrim(o) <> ''), '{}');
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_campos_carimbo() from public, anon, authenticated;
drop trigger if exists atd_campos_carimbo on public.atd_campos;
create trigger atd_campos_carimbo before insert or update on public.atd_campos
  for each row execute function private.atd_campos_carimbo();

-- 2) os motivos de fechamento -------------------------------------------------------------------------------------------
create table if not exists public.atd_motivos_fechamento (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  constraint atd_motivos_nome check (char_length(btrim(nome)) between 1 and 80)
);
create unique index if not exists atd_motivos_nome_uniq on public.atd_motivos_fechamento (organizacao_id, lower(btrim(nome)));
alter table public.atd_motivos_fechamento enable row level security;
revoke all on public.atd_motivos_fechamento from public, anon, authenticated;
grant select, insert, update, delete on public.atd_motivos_fechamento to authenticated;
grant all on public.atd_motivos_fechamento to service_role;
drop policy if exists atd_motivos_ler on public.atd_motivos_fechamento;
create policy atd_motivos_ler on public.atd_motivos_fechamento for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_motivos_admin on public.atd_motivos_fechamento;
create policy atd_motivos_admin on public.atd_motivos_fechamento for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- o HISTÓRICO (só o administrador): quantas conversas fecharam por cada motivo no período e os últimos fechamentos, com
-- quem fechou. O texto gravado pela 105 é "Motivo — detalhe" (ou só o detalhe, no "Outro motivo"): o motivo é o começo
-- do texto quando ele está na lista; o resto conta como "Outro motivo".
create or replace function public.atd_motivos_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with f as (
      select a.id, a.conversa_id, a.usuario_id, a.criado_em, a.motivo,
             coalesce((select m.nome from public.atd_motivos_fechamento m
                        where m.organizacao_id = v_org
                          and (lower(a.motivo) = lower(m.nome) or lower(a.motivo) like lower(m.nome) || ' — %')
                        order by char_length(m.nome) desc limit 1), 'Outro motivo') as base
        from public.conversa_atividades a
       where a.organizacao_id = v_org and a.tipo = 'fechado' and a.criado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from f),
      'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('motivo', x.base, 'qtd', x.qtd) order by x.qtd desc, x.base)
                                from (select base, count(*) as qtd from f group by base) x), '[]'::jsonb),
      'por_pessoa', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd) order by x.qtd desc, x.nome)
                                from (select coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome, count(*) as qtd
                                        from f left join public.usuarios u on u.id = f.usuario_id group by 1) x), '[]'::jsonb),
      'recentes', coalesce((select jsonb_agg(r.j order by r.criado_em desc) from (
                              select f.criado_em, jsonb_build_object('quando', f.criado_em, 'motivo', f.motivo, 'base', f.base, 'conversa_id', f.conversa_id,
                                       'quem', nullif(btrim(u.nome), ''),
                                       'contato', coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome')) as j
                                from f
                                left join public.usuarios u on u.id = f.usuario_id
                                left join public.conversas c on c.id = f.conversa_id
                                left join public.contatos ct on ct.id = c.contato_id
                               order by f.criado_em desc limit 40) r), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_motivos_historico(int) from public, anon;
grant execute on function public.atd_motivos_historico(int) to authenticated, service_role;

-- os de saída: o que a Reviza usava lá ("Cliente descartado") + os que o Reviza já tinha (105)
insert into public.atd_motivos_fechamento (organizacao_id, nome, ordem)
select 'de300000-0000-4000-8000-000000000001', m.nome, m.ordem
  from (values ('Cliente descartado', 0), ('Atendimento concluído', 1), ('Cliente desistiu', 2), ('Sem perfil (não elegível)', 3),
               ('Cliente parou de responder', 4), ('Já é cliente ou contato repetido', 5)) as m(nome, ordem)
 where exists (select 1 from public.organizacoes where id = 'de300000-0000-4000-8000-000000000001')
on conflict do nothing;

-- e o campo que a Reviza tinha lá
insert into public.atd_campos (organizacao_id, nome, tipo, ordem, no_cartao)
select 'de300000-0000-4000-8000-000000000001', 'Nome completo (RG)', 'texto', 0, true
 where exists (select 1 from public.organizacoes where id = 'de300000-0000-4000-8000-000000000001')
on conflict do nothing;

-- DESFAZER:
--   drop table if exists public.atd_campo_valores, public.atd_campos, public.atd_motivos_fechamento;
--   drop function if exists private.atd_campo_valor_carimbo(), private.atd_campos_carimbo(), public.atd_motivos_historico(int);

-- ===================== 20261126_111_venda_origem_tipos.sql =====================
-- 111 · BOTÃO DE VENDA, ORIGEM DO LEAD e mais dois TIPOS DE CAMPO (26/11, "igual" ao sistema que a Reviza usava antes:
-- lá Configurações › Botão de venda (nome do botão + histórico de quem marcou), › Origem do lead (o sistema identifica
-- sozinho; sem origem = "Indefinida") e os tipos "Número inteiro" e "Data e hora" dos campos personalizados).
--   atd_config_venda          o nome do botão que marca a venda (até 24 letras; vazio = "Contrato fechado") e o pedido de
--                             mandar a venda para a Meta (fica DESLIGADO até as Conversões da Meta estarem conectadas)
--   atd_vendas_historico      as vendas marcadas no período: cliente, quando, quem marcou, valor (só o administrador)
--   atd_origens_resumo        de onde vieram as conversas novas: anúncio (o próprio sistema identifica), a origem do
--                             número de WhatsApp, ou "Indefinida" (só o administrador)
--   atd_canal_definir_origem  o administrador diz de qual origem é cada número de WhatsApp
--   atd_campos.tipo           + 'inteiro' e 'data_hora'
-- ADITIVA. Depende da 93, 96 e 110. DESFAZER no fim.

-- 1) os dois tipos novos de campo ---------------------------------------------------------------------------------------
alter table public.atd_campos drop constraint if exists atd_campos_tipo;
alter table public.atd_campos add constraint atd_campos_tipo check (tipo in ('texto', 'numero', 'inteiro', 'data', 'data_hora', 'lista', 'sim_nao', 'telefone', 'email'));

create or replace function private.atd_campo_valor_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_tipo text; v_opc text[];
begin
  select organizacao_id, tipo, opcoes into v_org, v_tipo, v_opc from public.atd_campos where id = new.campo_id;
  if v_org is null then raise exception 'campo_inexistente'; end if;
  if not exists (select 1 from public.contatos c where c.id = new.contato_id and c.organizacao_id = v_org) then raise exception 'contato_de_outra_empresa'; end if;
  new.organizacao_id := v_org;
  new.valor := btrim(new.valor);
  if v_tipo = 'numero' and new.valor !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'numero_invalido'; end if;
  if v_tipo = 'inteiro' and new.valor !~ '^-?[0-9]+$' then raise exception 'inteiro_invalido'; end if;
  if v_tipo = 'data' and new.valor !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data_invalida'; end if;
  if v_tipo = 'data_hora' and new.valor !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'data_hora_invalida'; end if;
  if v_tipo = 'sim_nao' and new.valor not in ('sim', 'nao') then raise exception 'sim_nao_invalido'; end if;
  if v_tipo = 'lista' and not (new.valor = any (v_opc)) then raise exception 'opcao_invalida'; end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_campo_valor_carimbo() from public, anon, authenticated;

-- 2) o botão de venda ---------------------------------------------------------------------------------------------------
create table if not exists public.atd_config_venda (
  organizacao_id     uuid primary key references public.organizacoes(id) on delete cascade,
  nome_botao         text,
  meta_evento_ativo  boolean not null default false,
  meta_evento        text not null default 'Purchase',
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid,
  constraint atd_config_venda_nome check (nome_botao is null or char_length(btrim(nome_botao)) between 1 and 24),
  constraint atd_config_venda_evento check (meta_evento in ('Purchase', 'Lead', 'CompleteRegistration', 'Contact', 'Subscribe'))
);
alter table public.atd_config_venda enable row level security;
revoke all on public.atd_config_venda from public, anon, authenticated;
grant select, insert, update on public.atd_config_venda to authenticated;
grant all on public.atd_config_venda to service_role;
drop policy if exists atd_config_venda_ler on public.atd_config_venda;
create policy atd_config_venda_ler on public.atd_config_venda for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_config_venda_admin_ins on public.atd_config_venda;
create policy atd_config_venda_admin_ins on public.atd_config_venda for insert to authenticated
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));
drop policy if exists atd_config_venda_admin_upd on public.atd_config_venda;
create policy atd_config_venda_admin_upd on public.atd_config_venda for update to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

create or replace function private.atd_config_venda_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome_botao := nullif(btrim(regexp_replace(coalesce(new.nome_botao, ''), '\s+', ' ', 'g')), '');
  -- mandar para a Meta só liga com as Conversões da Meta conectadas (ainda não existem nesta instalação)
  if new.meta_evento_ativo and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'atd_meta_conversoes') then
    raise exception 'meta_conversoes_nao_conectadas';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_config_venda_carimbo() from public, anon, authenticated;
drop trigger if exists atd_config_venda_carimbo on public.atd_config_venda;
create trigger atd_config_venda_carimbo before insert or update on public.atd_config_venda
  for each row execute function private.atd_config_venda_carimbo();

insert into public.atd_config_venda (organizacao_id)
select 'de300000-0000-4000-8000-000000000001' where exists (select 1 from public.organizacoes where id = 'de300000-0000-4000-8000-000000000001')
on conflict do nothing;

-- o histórico: os cards que foram para uma etapa de "ganho" (o Contrato fechado leva para lá), por quem e quando
create or replace function public.atd_vendas_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with v as (
      select o.id, o.contato_id, o.conversa_origem_id, o.fechado_em, o.fechado_por_id, o.valor_estimado,
             coalesce(nullif(btrim(ct.nome), ''), nullif(btrim(o.contato_nome), ''), ct.telefone, o.telefone, 'Cliente sem nome') as contato,
             nullif(btrim(u.nome), '') as quem
        from public.oportunidades o
        left join public.contatos ct on ct.id = o.contato_id
        left join public.usuarios u on u.id = o.fechado_por_id
       where o.organizacao_id = v_org and o.status = 'ganho' and o.fechado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from v),
      'valor', (select coalesce(sum(valor_estimado), 0) from v),
      'por_pessoa', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd) order by x.qtd desc, x.nome)
                                from (select coalesce(quem, 'Sem nome') as nome, count(*) as qtd from v group by 1) x), '[]'::jsonb),
      'vendas', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'contato', v.contato, 'quando', v.fechado_em, 'quem', v.quem,
                                   'valor', v.valor_estimado, 'conversa_id', v.conversa_origem_id) order by v.fechado_em desc)
                            from (select * from v order by fechado_em desc limit 200) v), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_vendas_historico(int) from public, anon;
grant execute on function public.atd_vendas_historico(int) to authenticated, service_role;

-- 3) origem do lead -----------------------------------------------------------------------------------------------------
create unique index if not exists fontes_aquisicao_nome_uniq on public.fontes_aquisicao (organizacao_id, lower(btrim(nome)));

-- de onde vieram as conversas novas do período. A ordem de quem decide: o anúncio (o webhook guarda), depois a origem do
-- número de WhatsApp em que o cliente chegou, e sem nada é "Indefinida".
create or replace function public.atd_origens_resumo(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with c as (
      select cv.id,
             case when ao.conversa_id is not null then 'Anúncio'
                  when f.nome is not null then f.nome
                  else 'Indefinida' end as origem,
             case when ao.conversa_id is not null then 'anuncio' when f.nome is not null then 'numero' else 'nenhuma' end as como,
             nullif(btrim(ao.titulo), '') as anuncio
        from public.conversas cv
        left join public.atd_anuncio_origem ao on ao.conversa_id = cv.id
        left join public.canais ca on ca.id = coalesce(cv.canal_origem_id, cv.canal_id)
        left join public.fontes_aquisicao f on f.id = ca.fonte_aquisicao_id
       where cv.organizacao_id = v_org and cv.criado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from c),
      'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', x.origem, 'como', x.como, 'qtd', x.qtd) order by x.qtd desc, x.origem)
                                from (select origem, min(como) as como, count(*) as qtd from c group by origem) x), '[]'::jsonb),
      'anuncios', coalesce((select jsonb_agg(jsonb_build_object('anuncio', x.anuncio, 'qtd', x.qtd) order by x.qtd desc)
                              from (select coalesce(anuncio, 'Anúncio sem título') as anuncio, count(*) as qtd from c where como = 'anuncio' group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_origens_resumo(int) from public, anon;
grant execute on function public.atd_origens_resumo(int) to authenticated, service_role;

create or replace function public.atd_canal_definir_origem(p_canal uuid, p_fonte uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.canais where id = p_canal and organizacao_id = v_org) then raise exception 'numero_inexistente'; end if;
  if p_fonte is not null and not exists (select 1 from public.fontes_aquisicao where id = p_fonte and organizacao_id = v_org) then raise exception 'origem_inexistente'; end if;
  update public.canais set fonte_aquisicao_id = p_fonte, atualizado_em = now() where id = p_canal;
end $$;
revoke all on function public.atd_canal_definir_origem(uuid, uuid) from public, anon;
grant execute on function public.atd_canal_definir_origem(uuid, uuid) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_vendas_historico(int), public.atd_origens_resumo(int), public.atd_canal_definir_origem(uuid, uuid), private.atd_config_venda_carimbo();
--   drop table if exists public.atd_config_venda; drop index if exists public.fontes_aquisicao_nome_uniq;
--   (os tipos: refazer o check e o carimbo da 110)

-- ===================== 20261126_112_produtos_financeiro.sql =====================
-- 112 · PRODUTOS E SERVIÇOS + FINANCEIRO DO CLIENTE (26/11, "igual" ao sistema que a Reviza usava antes: lá Configurações ›
-- Produtos e serviços (nome, descrição, valor unitário, ativo), a aba Financeiro no painel do lead (produto/serviço, novo
-- lançamento) e o Dashboard › Financeiro (receita, cobranças fora da receita, por responsável, por produto, top clientes)).
--   atd_produtos        o catálogo (só o administrador muda; todos leem)
--   atd_lancamentos     o que cada cliente comprou ou deve: produto (opcional), quantidade, valor unitário, total, tipo
--                       ('receita' ou 'cobranca' — a cobrança fica fora da receita), data. Liga sozinho ao card do cliente.
--   atd_financeiro_resumo  o Dashboard › Financeiro (só o administrador), com filtro por responsável
-- ADITIVA. Depende da 93. DESFAZER no fim.

create table if not exists public.atd_produtos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  valor          numeric(12,2) not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_produtos_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_produtos_desc check (descricao is null or char_length(descricao) <= 500),
  constraint atd_produtos_valor check (valor >= 0 and valor <= 9999999999)
);
create unique index if not exists atd_produtos_nome_uniq on public.atd_produtos (organizacao_id, lower(btrim(nome)));
alter table public.atd_produtos enable row level security;
revoke all on public.atd_produtos from public, anon, authenticated;
grant select, insert, update, delete on public.atd_produtos to authenticated;
grant all on public.atd_produtos to service_role;
drop policy if exists atd_produtos_ler on public.atd_produtos;
create policy atd_produtos_ler on public.atd_produtos for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_produtos_admin on public.atd_produtos;
create policy atd_produtos_admin on public.atd_produtos for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

create or replace function private.atd_produtos_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_produtos_carimbo() from public, anon, authenticated;
drop trigger if exists atd_produtos_carimbo on public.atd_produtos;
create trigger atd_produtos_carimbo before insert or update on public.atd_produtos for each row execute function private.atd_produtos_carimbo();

create table if not exists public.atd_lancamentos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  produto_id      uuid references public.atd_produtos(id) on delete set null,
  descricao       text not null,
  quantidade      int not null default 1,
  valor_unitario  numeric(12,2) not null default 0,
  valor_total     numeric(14,2) generated always as (quantidade * valor_unitario) stored,
  tipo            text not null default 'receita',
  data            date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  observacao      text,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  constraint atd_lanc_desc check (char_length(btrim(descricao)) between 1 and 200),
  constraint atd_lanc_qtd check (quantidade between 1 and 9999),
  constraint atd_lanc_valor check (valor_unitario >= 0 and valor_unitario <= 9999999999),
  constraint atd_lanc_tipo check (tipo in ('receita', 'cobranca')),
  constraint atd_lanc_obs check (observacao is null or char_length(observacao) <= 300)
);
create index if not exists atd_lanc_contato on public.atd_lancamentos (contato_id, data desc);
create index if not exists atd_lanc_org_data on public.atd_lancamentos (organizacao_id, data desc);
create index if not exists atd_lanc_produto on public.atd_lancamentos (produto_id) where produto_id is not null;
create index if not exists atd_lanc_opp on public.atd_lancamentos (oportunidade_id) where oportunidade_id is not null;
alter table public.atd_lancamentos enable row level security;
revoke all on public.atd_lancamentos from public, anon, authenticated;
grant select, insert, update, delete on public.atd_lancamentos to authenticated;
grant all on public.atd_lancamentos to service_role;
-- como o contato: quem vê lê; quem pode mexer no contato lança; apagar é de quem lançou ou de administrador/supervisor
drop policy if exists atd_lanc_ler on public.atd_lancamentos;
create policy atd_lanc_ler on public.atd_lancamentos for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
drop policy if exists atd_lanc_ins on public.atd_lancamentos;
create policy atd_lanc_ins on public.atd_lancamentos for insert to authenticated
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));
drop policy if exists atd_lanc_upd on public.atd_lancamentos;
create policy atd_lanc_upd on public.atd_lancamentos for update to authenticated
  using ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))))
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));
drop policy if exists atd_lanc_del on public.atd_lancamentos;
create policy atd_lanc_del on public.atd_lancamentos for delete to authenticated
  using ((select public.is_platform_admin()) or criado_por = (select auth.uid())
         or coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor'));

create or replace function private.atd_lancamento_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_pnome text;
begin
  select organizacao_id into v_org from public.contatos where id = new.contato_id;
  if v_org is null then raise exception 'contato_inexistente'; end if;
  new.organizacao_id := v_org;
  if new.produto_id is not null then
    select nome into v_pnome from public.atd_produtos where id = new.produto_id and organizacao_id = v_org;
    if v_pnome is null then raise exception 'produto_de_outra_empresa'; end if;
  end if;
  new.descricao := coalesce(nullif(btrim(coalesce(new.descricao, '')), ''), v_pnome);
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  -- liga ao card do cliente (o mais recente) quando não veio dizendo qual
  if new.oportunidade_id is null then
    select o.id into new.oportunidade_id from public.oportunidades o where o.contato_id = new.contato_id and o.organizacao_id = v_org order by o.criado_em desc limit 1;
  elsif not exists (select 1 from public.oportunidades o where o.id = new.oportunidade_id and o.contato_id = new.contato_id) then
    raise exception 'card_de_outro_cliente';
  end if;
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); new.criado_em := now(); end if;
  return new;
end $$;
revoke all on function private.atd_lancamento_carimbo() from public, anon, authenticated;
drop trigger if exists atd_lancamento_carimbo on public.atd_lancamentos;
create trigger atd_lancamento_carimbo before insert or update on public.atd_lancamentos for each row execute function private.atd_lancamento_carimbo();

-- o Dashboard › Financeiro: no período, receita (e em quantos clientes), cobranças (fora da receita), por responsável do
-- card, por produto, os clientes que mais compraram e o catálogo. p_responsavel filtra pelo responsável do card.
create or replace function public.atd_financeiro_resumo(p_dias int default 30, p_responsavel uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 730);
  v_ini date := (now() at time zone 'America/Sao_Paulo')::date - (v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with l as (
      select x.*, o.responsavel_id, coalesce(nullif(btrim(u.nome), ''), 'Sem responsável') as resp_nome,
             coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome') as contato
        from public.atd_lancamentos x
        left join public.oportunidades o on o.id = x.oportunidade_id
        left join public.usuarios u on u.id = o.responsavel_id
        left join public.contatos ct on ct.id = x.contato_id
       where x.organizacao_id = v_org and x.data >= v_ini
         and (p_responsavel is null or o.responsavel_id = p_responsavel)
    ), r as (select * from l where tipo = 'receita')
    select jsonb_build_object(
      'dias', v_dias,
      'receita', (select coalesce(sum(valor_total), 0) from r),
      'clientes_receita', (select count(distinct contato_id) from r),
      'lancamentos', (select count(*) from r),
      'cobrancas', (select coalesce(sum(valor_total), 0) from l where tipo = 'cobranca'),
      'clientes_cobranca', (select count(distinct contato_id) from l where tipo = 'cobranca'),
      'ticket_medio', (select case when count(distinct contato_id) > 0 then round(sum(valor_total) / count(distinct contato_id), 2) else 0 end from r),
      'por_responsavel', coalesce((select jsonb_agg(jsonb_build_object('nome', x.resp_nome, 'valor', x.v, 'qtd', x.n) order by x.v desc)
                                     from (select resp_nome, sum(valor_total) as v, count(distinct contato_id) as n from r group by resp_nome) x), '[]'::jsonb),
      'por_produto', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'valor', x.v, 'qtd', x.q) order by x.v desc)
                                 from (select coalesce(p.nome, r.descricao) as nome, sum(r.valor_total) as v, sum(r.quantidade) as q
                                         from r left join public.atd_produtos p on p.id = r.produto_id group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
      'top_clientes', coalesce((select jsonb_agg(jsonb_build_object('contato_id', x.contato_id, 'contato', x.contato, 'valor', x.v, 'responsavel', x.resp,
                                     'conversa_id', (select cv.id from public.conversas cv where cv.contato_id = x.contato_id order by cv.ultima_interacao_em desc nulls last limit 1)) order by x.v desc)
                                  from (select contato_id, min(contato) as contato, sum(valor_total) as v, min(resp_nome) as resp from r group by contato_id order by 3 desc limit 10) x), '[]'::jsonb),
      'por_mes', coalesce((select jsonb_agg(jsonb_build_object('mes', x.mes, 'valor', x.v) order by x.mes)
                             from (select to_char(date_trunc('month', data), 'YYYY-MM') as mes, sum(valor_total) as v from r group by 1) x), '[]'::jsonb),
      'catalogo', (select count(*) from public.atd_produtos where organizacao_id = v_org and ativo),
      'gerado_em', now()
    ));
end $$;
revoke all on function public.atd_financeiro_resumo(int, uuid) from public, anon;
grant execute on function public.atd_financeiro_resumo(int, uuid) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_financeiro_resumo(int, uuid), private.atd_lancamento_carimbo(), private.atd_produtos_carimbo();
--   drop table if exists public.atd_lancamentos, public.atd_produtos;

-- ===================== 20261126_113_cofre_conversas.sql =====================
-- 113 · COFRE DE CONVERSAS (26/11, "igual" ao sistema que a Reviza usava antes: "uma senha única esconde o conteúdo das
-- conversas trancadas; só quem tem a senha abre". Como lá, a senha protege a VISUALIZAÇÃO no sistema: não impede que as
-- mensagens cheguem nem que a IA responda).
--   atd_cofre                 a senha do cofre, guardada só como hash (bcrypt) — ninguém lê a tabela, nem o administrador
--   atd_conversas_trancadas   quais conversas estão trancadas (todos da empresa leem: a tela esconde o conteúdo delas)
--   atd_cofre_tentativas      as tentativas de senha (no máx. 5 erradas a cada 15 minutos por pessoa)
--   rotinas: atd_cofre_estado · atd_cofre_definir (administrador; trocar pede a senha atual) · atd_cofre_conferir ·
--            atd_cofre_trancar (trancar não pede senha; destrancar pede) · atd_cofre_desligar (administrador + senha:
--            destranca tudo)
-- ADITIVA. Depende da 93 (atd_vejo_conversa) e do pgcrypto (schema extensions). DESFAZER no fim.

create table if not exists public.atd_cofre (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  senha_hash     text not null,
  definido_em    timestamptz not null default now(),
  definido_por   uuid
);
alter table public.atd_cofre enable row level security;
revoke all on public.atd_cofre from public, anon, authenticated;
grant all on public.atd_cofre to service_role;
-- sem política para authenticated: só as rotinas abaixo (security definer) tocam no hash

create table if not exists public.atd_conversas_trancadas (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  trancada_por   uuid,
  trancada_em    timestamptz not null default now()
);
create index if not exists atd_conv_tranc_org on public.atd_conversas_trancadas (organizacao_id);
alter table public.atd_conversas_trancadas enable row level security;
revoke all on public.atd_conversas_trancadas from public, anon, authenticated;
grant select on public.atd_conversas_trancadas to authenticated;
grant all on public.atd_conversas_trancadas to service_role;
drop policy if exists atd_conv_tranc_ler on public.atd_conversas_trancadas;
create policy atd_conv_tranc_ler on public.atd_conversas_trancadas for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));

create table if not exists public.atd_cofre_tentativas (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null,
  certa      boolean not null,
  em         timestamptz not null default now()
);
create index if not exists atd_cofre_tent_quem on public.atd_cofre_tentativas (usuario_id, em desc);
alter table public.atd_cofre_tentativas enable row level security;
revoke all on public.atd_cofre_tentativas from public, anon, authenticated;
grant all on public.atd_cofre_tentativas to service_role;

-- confere a senha guardando a tentativa; mais de 5 erradas em 15 minutos trava a pessoa por 15 minutos
create or replace function private.atd_cofre_confere(p_org uuid, p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hash text; v_ok boolean;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if (select count(*) from public.atd_cofre_tentativas where usuario_id = v_uid and not certa and em > now() - interval '15 minutes') >= 5 then
    raise exception 'muitas_tentativas';
  end if;
  select senha_hash into v_hash from public.atd_cofre where organizacao_id = p_org;
  if v_hash is null then raise exception 'cofre_desligado'; end if;
  v_ok := extensions.crypt(coalesce(p_senha, ''), v_hash) = v_hash;
  insert into public.atd_cofre_tentativas (usuario_id, certa) values (v_uid, v_ok);
  delete from public.atd_cofre_tentativas where em < now() - interval '2 days';
  return v_ok;
end $$;
revoke all on function private.atd_cofre_confere(uuid, text) from public, anon, authenticated;

create or replace function public.atd_cofre_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if not (public.is_member(v_org) or public.is_platform_admin()) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'ligado', exists (select 1 from public.atd_cofre where organizacao_id = v_org),
    'definido_em', (select definido_em from public.atd_cofre where organizacao_id = v_org),
    'definido_por', (select nullif(btrim(u.nome), '') from public.atd_cofre c left join public.usuarios u on u.id = c.definido_por where c.organizacao_id = v_org),
    'trancadas', (select count(*) from public.atd_conversas_trancadas where organizacao_id = v_org));
end $$;
revoke all on function public.atd_cofre_estado() from public, anon;
grant execute on function public.atd_cofre_estado() to authenticated, service_role;

-- liga o cofre (ou troca a senha: aí pede a atual). Só o administrador. A senha tem de 6 a 72 letras.
-- Senha errada NÃO dá erro (devolve false): um erro desfaria a tentativa gravada e o limite de 5 não valeria.
create or replace function public.atd_cofre_definir(p_senha text, p_senha_atual text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if char_length(coalesce(p_senha, '')) < 6 or char_length(p_senha) > 72 then raise exception 'senha_curta'; end if;
  if exists (select 1 from public.atd_cofre where organizacao_id = v_org) and not private.atd_cofre_confere(v_org, p_senha_atual) then
    return false;
  end if;
  insert into public.atd_cofre (organizacao_id, senha_hash, definido_em, definido_por)
  values (v_org, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now(), auth.uid())
  on conflict (organizacao_id) do update set senha_hash = excluded.senha_hash, definido_em = now(), definido_por = auth.uid();
  return true;
end $$;
revoke all on function public.atd_cofre_definir(text, text) from public, anon;
grant execute on function public.atd_cofre_definir(text, text) to authenticated, service_role;

create or replace function public.atd_cofre_conferir(p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if not (public.is_member(v_org) or public.is_platform_admin()) then raise exception 'sem_permissao'; end if;
  return private.atd_cofre_confere(v_org, p_senha);
end $$;
revoke all on function public.atd_cofre_conferir(text) from public, anon;
grant execute on function public.atd_cofre_conferir(text) to authenticated, service_role;

-- trancar: quem vê a conversa, com o cofre ligado (não pede senha). Destrancar: com a senha.
-- Devolve 'trancada', 'destrancada' ou 'senha_errada' (sem erro, para a tentativa ficar gravada).
create or replace function public.atd_cofre_trancar(p_conversa uuid, p_trancar boolean, p_senha text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.atd_vejo_conversa(p_conversa))) then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.atd_cofre where organizacao_id = v_org) then raise exception 'cofre_desligado'; end if;
  if p_trancar then
    insert into public.atd_conversas_trancadas (conversa_id, organizacao_id, trancada_por) values (p_conversa, v_org, auth.uid()) on conflict do nothing;
    return 'trancada';
  end if;
  if not private.atd_cofre_confere(v_org, p_senha) then return 'senha_errada'; end if;
  delete from public.atd_conversas_trancadas where conversa_id = p_conversa;
  return 'destrancada';
end $$;
revoke all on function public.atd_cofre_trancar(uuid, boolean, text) from public, anon;
grant execute on function public.atd_cofre_trancar(uuid, boolean, text) to authenticated, service_role;

-- desligar: o administrador, com a senha. Destranca todas as conversas.
create or replace function public.atd_cofre_desligar(p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not private.atd_cofre_confere(v_org, p_senha) then return false; end if;
  delete from public.atd_conversas_trancadas where organizacao_id = v_org;
  delete from public.atd_cofre where organizacao_id = v_org;
  return true;
end $$;
revoke all on function public.atd_cofre_desligar(text) from public, anon;
grant execute on function public.atd_cofre_desligar(text) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_cofre_desligar(text), public.atd_cofre_trancar(uuid, boolean, text), public.atd_cofre_conferir(text),
--     public.atd_cofre_definir(text, text), public.atd_cofre_estado(), private.atd_cofre_confere(uuid, text);
--   drop table if exists public.atd_cofre_tentativas, public.atd_conversas_trancadas, public.atd_cofre;

-- ===================== 20261126_114_avisos_equipe.sql =====================
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
        perform 1 where false;   -- a carteira de cobranças é do Reviza; no Atenvo este aviso não se aplica
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
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
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
select 'de300000-0000-4000-8000-000000000001', v.chave, v.nome, v.modelo, v.gatilho,
       (select c.id from public.funil_colunas c join public.funis f on f.id = c.funil_id
         where c.organizacao_id = 'de300000-0000-4000-8000-000000000001' and f.padrao and upper(c.nome) = v.etapa limit 1), v.ordem
  from (values
    ('lead_novo', 'Novo lead recebido', 'Novo lead: {{nome}} · {{telefone}} · {{resumo}}', 'lead_novo', null, 0),
    ('lead_qualificado', 'Lead qualificado', 'Lead qualificado: {{nome}} · {{telefone}} · {{resumo}}', 'etapa', 'DOCUMENTAÇÃO', 1),
    ('lead_desqualificado', 'Lead desqualificado', 'Lead desqualificado: {{nome}} · {{telefone}} · motivo: {{resumo}}', 'descartado', null, 2),
    ('contrato_enviado', 'Contrato enviado', 'Contrato enviado: {{nome}} · {{telefone}} · aguardando a assinatura', 'etapa', null, 3),
    ('contrato_assinado', 'Contrato assinado', 'Contrato assinado: {{nome}} · {{telefone}} · {{resumo}}', 'venda', null, 4),
    ('reuniao_agendada', 'Reunião agendada', 'Reunião agendada com {{nome}} · {{telefone}} · {{resumo}}', 'reuniao', null, 5),
    ('cliente_escritorio', 'Lead já é cliente do escritório', 'Atenção, cliente da casa: {{nome}} · {{telefone}} · {{resumo}}. Atender com prioridade.', 'cliente_carteira', null, 6)
  ) as v(chave, nome, modelo, gatilho, etapa, ordem)
 where exists (select 1 from public.organizacoes where id = 'de300000-0000-4000-8000-000000000001')
on conflict (organizacao_id, chave) do nothing;

-- DESFAZER:
--   drop trigger if exists atd_avisos_do_card on public.oportunidades; drop trigger if exists atd_avisos_da_reuniao on public.atd_reunioes;
--   drop function if exists public.atd_avisos_equipe_relatorio(int), private.atd_avisos_da_reuniao(), private.atd_avisos_do_card(),
--     private.atd_aviso_equipe_disparar(public.atd_avisos_equipe, uuid, uuid, uuid, text), private.atd_chave_fone(text), private.atd_fone_mascarado(text), private.atd_avisos_carimbo();
--   drop table if exists public.atd_avisos_equipe_log, public.atd_avisos_equipe;

-- ===================== 20261126_116_sequencias_palavras.sql =====================
-- 116 · SEQUÊNCIAS e AUTOMAÇÃO POR PALAVRAS (26/11, "igual" ao sistema que a Reviza usava antes: Automações › Sequências —
-- "roteiros de mensagens que você dispara na conversa, na hora que escolher; não começam sozinhos" — e › Automação por
-- palavras — "ações automáticas quando o lead ou a equipe escrevem uma palavra-chave": mover o lead de etapa).
--   atd_sequencias             os modelos: passos (texto ou mídia de um script) com a espera antes de cada um; "parar se o
--                              cliente responder"
--   atd_aplicar_sequencia      a pessoa aplica um modelo numa conversa: vira mensagens_agendadas (o mesmo envio de sempre,
--                              com as mesmas travas do número), cada passo na sua hora
--   atd_regras_palavras        as regras: palavras (contém, exato, começa com, termina com, regex), palavras para ignorar,
--                              OU/E, onde procurar (última mensagem, últimas N, toda a conversa), de quem (todas, só do
--                              cliente, só da equipe) e para qual etapa o card vai
--   atd_regras_palavras_log    o histórico do que cada regra fez
--   gatilho AFTER INSERT em mensagens: (1) cliente respondeu → cancela o resto das sequências "parar se responder"; (2) aplica
--   as regras. Erro aqui NUNCA derruba a mensagem (vira aviso no log do banco).
-- ADITIVA. Depende da 93. DESFAZER no fim.

-- 1) os modelos de sequência --------------------------------------------------------------------------------------------
create table if not exists public.atd_sequencias (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null references public.organizacoes(id) on delete cascade,
  nome               text not null,
  categoria          text,
  descricao          text,
  passos             jsonb not null default '[]'::jsonb,
  parar_se_responder boolean not null default true,
  ativo              boolean not null default true,
  criado_por         uuid,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint atd_seq_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_seq_cat check (categoria is null or char_length(categoria) <= 40),
  constraint atd_seq_desc check (descricao is null or char_length(descricao) <= 300),
  constraint atd_seq_passos check (jsonb_typeof(passos) = 'array' and jsonb_array_length(passos) between 1 and 20)
);
create unique index if not exists atd_seq_nome_uniq on public.atd_sequencias (organizacao_id, lower(btrim(nome)));
alter table public.atd_sequencias enable row level security;
revoke all on public.atd_sequencias from public, anon, authenticated;
grant select, insert, update, delete on public.atd_sequencias to authenticated;
grant all on public.atd_sequencias to service_role;
drop policy if exists atd_seq_ler on public.atd_sequencias;
create policy atd_seq_ler on public.atd_sequencias for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_seq_gestao on public.atd_sequencias;
create policy atd_seq_gestao on public.atd_sequencias for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor') or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor') or (select public.is_platform_admin()));

-- cada passo: {tipo: texto|imagem|audio|video|documento, texto, storage_path, mime, nome, tamanho, espera_min}
create or replace function private.atd_seq_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb; v_tipo text; v_espera int;
begin
  new.nome := btrim(new.nome);
  new.categoria := nullif(btrim(coalesce(new.categoria, '')), '');
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  for p in select value from jsonb_array_elements(new.passos) loop
    v_tipo := p->>'tipo';
    if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento') then raise exception 'passo_tipo_invalido'; end if;
    if v_tipo = 'texto' and char_length(btrim(coalesce(p->>'texto', ''))) = 0 then raise exception 'passo_texto_vazio'; end if;
    if char_length(coalesce(p->>'texto', '')) > 4096 then raise exception 'passo_texto_longo'; end if;
    if v_tipo <> 'texto' and left(coalesce(p->>'storage_path', ''), length(new.organizacao_id::text) + 1) <> new.organizacao_id::text || '/' then raise exception 'passo_midia_invalida'; end if;
    v_espera := coalesce(nullif(p->>'espera_min', '')::int, 0);
    if v_espera < 0 or v_espera > 60 * 24 * 30 then raise exception 'passo_espera_invalida'; end if;
  end loop;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); end if;
  return new;
end $$;
revoke all on function private.atd_seq_carimbo() from public, anon, authenticated;
drop trigger if exists atd_seq_carimbo on public.atd_sequencias;
create trigger atd_seq_carimbo before insert or update on public.atd_sequencias for each row execute function private.atd_seq_carimbo();

-- aplicar numa conversa: as mesmas travas do agendamento de sempre (contato com telefone, número conectado e sem restrição)
create or replace function public.atd_aplicar_sequencia(p_modelo uuid, p_conversa uuid, p_canal uuid, p_inicio timestamptz default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype; m public.atd_sequencias%rowtype;
  v_seq uuid := gen_random_uuid(); v_quando timestamptz; v_i int := 0; p jsonb; v_tipo text;
begin
  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.atd_vejo_conversa(p_conversa))) then raise exception 'sem_acesso'; end if;
  select * into m from public.atd_sequencias where id = p_modelo and organizacao_id = v_org;
  if m.id is null then raise exception 'sequencia_nao_encontrada'; end if;
  if not m.ativo then raise exception 'sequencia_desligada'; end if;
  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;
  -- a mesma sequência não roda duas vezes ao mesmo tempo na conversa
  if exists (select 1 from public.mensagens_agendadas a where a.conversa_id = p_conversa and a.status in ('agendada', 'processando')
              and a.metadados->>'sequencia_modelo_id' = p_modelo::text) then raise exception 'sequencia_ja_rodando'; end if;
  v_quando := greatest(coalesce(p_inicio, now() + interval '1 minute'), now() + interval '45 seconds');
  for p in select value from jsonb_array_elements(m.passos) loop
    v_tipo := p->>'tipo';
    -- a espera vale ANTES do passo; entre dois passos, no mínimo 1 minuto (preserva a ordem sob o ritmo do número)
    if v_i > 0 then v_quando := v_quando + greatest(coalesce(nullif(p->>'espera_min', '')::int, 1), 1) * interval '1 minute'; end if;
    insert into public.mensagens_agendadas (
      organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, sequencia_id, ordem_na_sequencia, metadados)
    values (
      v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, nullif(btrim(coalesce(p->>'texto', '')), ''),
      case when v_tipo = 'texto' then null else p->>'storage_path' end,
      case when v_tipo = 'texto' then null else p->>'mime' end,
      case when v_tipo = 'texto' then null else p->>'nome' end,
      case when v_tipo = 'texto' then null else nullif(p->>'tamanho', '')::bigint end,
      v_quando, v_seq, v_i,
      jsonb_build_object('sequencia_modelo_id', m.id, 'sequencia_nome', m.nome, 'parar_se_responder', m.parar_se_responder,
                         'responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato)));
    v_i := v_i + 1;
  end loop;
  return v_i;
end $$;
revoke all on function public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

-- 2) automação por palavras ---------------------------------------------------------------------------------------------
create table if not exists public.atd_regras_palavras (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  palavras       jsonb not null default '[]'::jsonb,
  ignorar        text[] not null default '{}',
  operador       text not null default 'ou',
  onde           text not null default 'ultima',
  ultimas_n      int not null default 5,
  quem           text not null default 'lead',
  coluna_id      uuid references public.funil_colunas(id) on delete set null,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_rp_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_rp_desc check (descricao is null or char_length(descricao) <= 300),
  constraint atd_rp_palavras check (jsonb_typeof(palavras) = 'array' and jsonb_array_length(palavras) between 1 and 50),
  constraint atd_rp_ignorar check (cardinality(ignorar) <= 50),
  constraint atd_rp_operador check (operador in ('ou', 'e')),
  constraint atd_rp_onde check (onde in ('ultima', 'ultimas', 'conversa')),
  constraint atd_rp_n check (ultimas_n between 1 and 50),
  constraint atd_rp_quem check (quem in ('todas', 'lead', 'equipe'))
);
create table if not exists public.atd_regras_palavras_log (
  id              bigint generated always as identity primary key,
  regra_id        uuid not null references public.atd_regras_palavras(id) on delete cascade,
  organizacao_id  uuid not null,
  conversa_id     uuid,
  oportunidade_id uuid,
  de_coluna       text,
  para_coluna     text,
  palavra         text,
  criado_em       timestamptz not null default now()
);
create index if not exists atd_rp_ativas on public.atd_regras_palavras (organizacao_id) where ativo;
create index if not exists atd_rp_log_quando on public.atd_regras_palavras_log (organizacao_id, criado_em desc);
alter table public.atd_regras_palavras enable row level security;
alter table public.atd_regras_palavras_log enable row level security;
revoke all on public.atd_regras_palavras, public.atd_regras_palavras_log from public, anon, authenticated;
grant select, insert, update, delete on public.atd_regras_palavras to authenticated;
grant select on public.atd_regras_palavras_log to authenticated;
grant all on public.atd_regras_palavras, public.atd_regras_palavras_log to service_role;
drop policy if exists atd_rp_admin on public.atd_regras_palavras;
create policy atd_rp_admin on public.atd_regras_palavras for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));
drop policy if exists atd_rp_log_admin on public.atd_regras_palavras_log;
create policy atd_rp_log_admin on public.atd_regras_palavras_log for select to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- cada palavra: {texto, modo: contem|exato|comeca|termina|regex}. A etapa de destino é neutra ou de venda (nunca perda:
-- a perda pede o motivo, que só uma pessoa dá).
create or replace function private.atd_rp_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb; v_res text;
begin
  new.nome := btrim(new.nome);
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.ignorar := coalesce((select array_agg(distinct btrim(x)) from unnest(new.ignorar) x where btrim(x) <> ''), '{}');
  for p in select value from jsonb_array_elements(new.palavras) loop
    if char_length(btrim(coalesce(p->>'texto', ''))) = 0 or char_length(p->>'texto') > 200 then raise exception 'palavra_invalida'; end if;
    if coalesce(p->>'modo', 'contem') not in ('contem', 'exato', 'comeca', 'termina', 'regex') then raise exception 'modo_invalido'; end if;
    if p->>'modo' = 'regex' then
      begin perform 'x' ~* (p->>'texto'); exception when others then raise exception 'regex_invalida'; end;
    end if;
  end loop;
  if new.coluna_id is not null then
    select resultado into v_res from public.funil_colunas where id = new.coluna_id and organizacao_id = new.organizacao_id;
    if not found then raise exception 'etapa_de_outra_empresa'; end if;
    if v_res = 'perdido' then raise exception 'etapa_de_perda'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_rp_carimbo() from public, anon, authenticated;
drop trigger if exists atd_rp_carimbo on public.atd_regras_palavras;
create trigger atd_rp_carimbo before insert or update on public.atd_regras_palavras for each row execute function private.atd_rp_carimbo();

-- texto sem acento e em minúsculas (a comparação é assim, como lá)
create or replace function private.atd_sem_acento(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;
revoke all on function private.atd_sem_acento(text) from public, anon, authenticated;

create or replace function private.atd_casa_palavra(p_texto text, p_palavra jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare t text := private.atd_sem_acento(p_texto); w text := private.atd_sem_acento(btrim(p_palavra->>'texto'));
begin
  case coalesce(p_palavra->>'modo', 'contem')
    when 'exato' then return btrim(t) = w;
    when 'comeca' then return left(btrim(t), char_length(w)) = w;
    when 'termina' then return right(btrim(t), char_length(w)) = w;
    when 'regex' then begin return coalesce(p_texto, '') ~* (p_palavra->>'texto'); exception when others then return false; end;
    else return strpos(t, w) > 0;
  end case;
end $$;
revoke all on function private.atd_casa_palavra(text, jsonb) from public, anon, authenticated;

create or replace function private.atd_mensagem_automacoes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.atd_regras_palavras%rowtype; v_opp public.oportunidades%rowtype; v_texto text; v_achou text; v_ok boolean;
  p jsonb; v_de text; v_para text; v_ign text;
begin
  if new.tipo in ('sistema', 'nota_interna') then return new; end if;
  begin
    -- (1) o cliente respondeu: as sequências "parar se responder" desta conversa param aqui
    if new.direcao = 'entrada' then
      update public.mensagens_agendadas a set status = 'cancelada', cancelada_em = now(), motivo_bloqueio = 'cliente_respondeu'
       where a.conversa_id = new.conversa_id and a.status = 'agendada' and (a.metadados->>'parar_se_responder')::boolean is true;
    end if;
    -- (2) as regras por palavra
    if not exists (select 1 from public.atd_regras_palavras where organizacao_id = new.organizacao_id and ativo and coluna_id is not null) then return new; end if;
    select o.* into v_opp from public.oportunidades o join public.conversas c on c.contato_id = o.contato_id
     where c.id = new.conversa_id and o.organizacao_id = new.organizacao_id and o.status = 'em_andamento'
     order by o.criado_em desc limit 1;
    if v_opp.id is null then return new; end if;
    for r in select * from public.atd_regras_palavras where organizacao_id = new.organizacao_id and ativo and coluna_id is not null order by ordem, criado_em loop
      if r.coluna_id = v_opp.coluna_id then continue; end if;
      -- de quem é a mensagem que disparou
      if r.quem = 'lead' and new.direcao <> 'entrada' then continue; end if;
      if r.quem = 'equipe' and (new.direcao <> 'saida' or coalesce(new.origem, '') = 'bot') then continue; end if;
      -- onde procurar
      if r.onde = 'ultima' then v_texto := coalesce(new.conteudo, '') || ' ' || coalesce(new.metadados->>'transcricao', '');
      else
        select string_agg(coalesce(m.conteudo, '') || ' ' || coalesce(m.metadados->>'transcricao', ''), ' ') into v_texto from (
          select m.conteudo, m.metadados from public.mensagens m
           where m.conversa_id = new.conversa_id and m.tipo not in ('sistema', 'nota_interna')
             and (r.quem = 'todas' or (r.quem = 'lead' and m.direcao = 'entrada') or (r.quem = 'equipe' and m.direcao = 'saida' and coalesce(m.origem, '') <> 'bot'))
           order by m.enviada_em desc limit case when r.onde = 'ultimas' then r.ultimas_n else 200 end) m;
      end if;
      -- palavras para ignorar
      v_ign := null;
      select x into v_ign from unnest(r.ignorar) x where strpos(private.atd_sem_acento(v_texto), private.atd_sem_acento(x)) > 0 limit 1;
      if v_ign is not null then continue; end if;
      -- OU: qualquer palavra; E: todas
      v_achou := null; v_ok := r.operador = 'e';
      for p in select value from jsonb_array_elements(r.palavras) loop
        if private.atd_casa_palavra(v_texto, p) then v_achou := coalesce(v_achou, p->>'texto'); if r.operador = 'ou' then v_ok := true; exit; end if;
        elsif r.operador = 'e' then v_ok := false; exit; end if;
      end loop;
      if not v_ok or v_achou is null then continue; end if;
      select nome into v_de from public.funil_colunas where id = v_opp.coluna_id;
      select nome into v_para from public.funil_colunas where id = r.coluna_id;
      update public.oportunidades set coluna_id = r.coluna_id where id = v_opp.id;
      insert into public.atd_regras_palavras_log (regra_id, organizacao_id, conversa_id, oportunidade_id, de_coluna, para_coluna, palavra)
      values (r.id, r.organizacao_id, new.conversa_id, v_opp.id, v_de, v_para, v_achou);
      exit; -- uma regra por mensagem: a primeira que casar (pela ordem)
    end loop;
  exception when others then
    raise warning 'atd_mensagem_automacoes: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.atd_mensagem_automacoes() from public, anon, authenticated;
drop trigger if exists atd_mensagem_automacoes on public.mensagens;
create trigger atd_mensagem_automacoes after insert on public.mensagens for each row execute function private.atd_mensagem_automacoes();

-- o histórico das duas automações (só o administrador)
create or replace function public.atd_automacoes_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 180);
  v_ini timestamptz := now() - make_interval(days => v_dias);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'regras', coalesce((select jsonb_agg(r.j order by r.criado_em desc) from (
                select l.criado_em, jsonb_build_object('quando', l.criado_em, 'regra', g.nome, 'de', l.de_coluna, 'para', l.para_coluna, 'palavra', l.palavra,
                         'conversa_id', l.conversa_id, 'contato', coalesce(nullif(btrim(ct.nome), ''), 'Cliente sem nome')) as j
                  from public.atd_regras_palavras_log l join public.atd_regras_palavras g on g.id = l.regra_id
                  left join public.conversas c on c.id = l.conversa_id left join public.contatos ct on ct.id = c.contato_id
                 where l.organizacao_id = v_org and l.criado_em >= v_ini order by l.criado_em desc limit 60) r), '[]'::jsonb),
    'sequencias', coalesce((select jsonb_agg(x.j order by x.ultima desc) from (
                select max(a.criado_em) as ultima, jsonb_build_object('nome', a.metadados->>'sequencia_nome', 'aplicadas', count(distinct a.sequencia_id),
                         'enviadas', count(*) filter (where a.status = 'enviada'), 'agendadas', count(*) filter (where a.status = 'agendada'),
                         'paradas', count(*) filter (where a.status = 'cancelada'), 'falharam', count(*) filter (where a.status in ('falhou', 'bloqueada', 'expirada'))) as j
                  from public.mensagens_agendadas a
                 where a.organizacao_id = v_org and a.criado_em >= v_ini and a.metadados ? 'sequencia_modelo_id'
                 group by a.metadados->>'sequencia_modelo_id', a.metadados->>'sequencia_nome') x), '[]'::jsonb));
end $$;
revoke all on function public.atd_automacoes_historico(int) from public, anon;
grant execute on function public.atd_automacoes_historico(int) to authenticated, service_role;

-- DESFAZER:
--   drop trigger if exists atd_mensagem_automacoes on public.mensagens;
--   drop function if exists public.atd_automacoes_historico(int), private.atd_mensagem_automacoes(), private.atd_casa_palavra(text, jsonb),
--     private.atd_sem_acento(text), private.atd_rp_carimbo(), public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz), private.atd_seq_carimbo();
--   drop table if exists public.atd_regras_palavras_log, public.atd_regras_palavras, public.atd_sequencias;

-- ===================== 20261126_120_dashboard_crm.sql =====================
-- 120 · DASHBOARD › CRM (26/11, "igual" ao Dashboard do sistema que a Reviza usava antes: a visão do CRM). Uma rotina só,
-- do período escolhido (os cards que ENTRARAM no período):
--   por_uf        de que estado são os clientes (pelo DDD do telefone)
--   funil         quantos cards em cada etapa do funil padrão, na ordem, e quantos já viraram venda
--   etiquetas     as etiquetas mais usadas nos cards (e nos contatos deles)
--   reunioes      as próximas reuniões marcadas (Agenda)
--   tarefas       o resumo das tarefas da equipe: abertas, em andamento, concluídas no período, atrasadas, por pessoa
-- Só leitura. Administrador e supervisor (como o resto do Dashboard). ADITIVA.

create or replace function public.atd_dashboard_crm(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 3650);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
  v_funil uuid;
begin
  if coalesce(public.org_papel(v_org), '') not in ('admin', 'supervisor') and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  select id into v_funil from public.funis where organizacao_id = v_org and padrao order by criado_em limit 1;
  return jsonb_build_object(
    'dias', v_dias,
    'cards', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado'),
    'por_uf', coalesce((
      with ddd(d, uf) as (values
        ('11','SP'),('12','SP'),('13','SP'),('14','SP'),('15','SP'),('16','SP'),('17','SP'),('18','SP'),('19','SP'),
        ('21','RJ'),('22','RJ'),('24','RJ'),('27','ES'),('28','ES'),
        ('31','MG'),('32','MG'),('33','MG'),('34','MG'),('35','MG'),('37','MG'),('38','MG'),
        ('41','PR'),('42','PR'),('43','PR'),('44','PR'),('45','PR'),('46','PR'),('47','SC'),('48','SC'),('49','SC'),
        ('51','RS'),('53','RS'),('54','RS'),('55','RS'),
        ('61','DF'),('62','GO'),('64','GO'),('63','TO'),('65','MT'),('66','MT'),('67','MS'),('68','AC'),('69','RO'),
        ('71','BA'),('73','BA'),('74','BA'),('75','BA'),('77','BA'),('79','SE'),
        ('81','PE'),('87','PE'),('82','AL'),('83','PB'),('84','RN'),('85','CE'),('88','CE'),('86','PI'),('89','PI'),
        ('91','PA'),('93','PA'),('94','PA'),('92','AM'),('97','AM'),('95','RR'),('96','AP'),('98','MA'),('99','MA')),
      cli as (
        select distinct on (coalesce(o.contato_id, o.id)) left(private.atd_chave_fone(coalesce(c.telefone, o.telefone)), 2) as d
          from public.oportunidades o left join public.contatos c on c.id = o.contato_id
         where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado')
      select jsonb_agg(jsonb_build_object('uf', x.uf, 'qtd', x.qtd) order by x.qtd desc)
        from (select coalesce(ddd.uf, 'Sem DDD') as uf, count(*) as qtd from cli left join ddd on ddd.d = cli.d group by 1) x), '[]'::jsonb),
    'funil', coalesce((
      select jsonb_agg(jsonb_build_object('etapa', x.nome, 'resultado', x.resultado, 'cor', x.cor, 'qtd', x.qtd) order by x.ordem)
        from (select fc.nome, fc.resultado, fc.cor, fc.ordem,
                     (select count(*) from public.oportunidades o where o.coluna_id = fc.id and o.criado_em >= v_ini and o.status <> 'cancelado') as qtd
                from public.funil_colunas fc where fc.funil_id = v_funil and fc.organizacao_id = v_org and not fc.arquivada) x), '[]'::jsonb),
    'vendas', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status = 'ganho'),
    'perdidos', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status = 'perdido'),
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.e, 'qtd', x.qtd, 'cor', (select t.cor from public.etiquetas t where t.organizacao_id = v_org and upper(btrim(t.nome)) = upper(x.e) limit 1)) order by x.qtd desc)
        from (select e, count(distinct o_id) as qtd from (
                select o.id as o_id, btrim(unnest(coalesce(o.etiquetas, '{}') || coalesce(c.etiquetas, '{}'))) as e
                  from public.oportunidades o left join public.contatos c on c.id = o.contato_id
                 where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado') y
               where e <> '' group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'reunioes', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'tipo', x.tipo, 'inicio', x.inicio, 'cliente', x.cliente,
                                          'responsavel', x.responsavel, 'conversa_id', x.conversa_id) order by x.inicio)
        from (select r.id, r.titulo, r.tipo, r.inicio, c.nome as cliente, u.nome as responsavel, r.conversa_id
                from public.atd_reunioes r left join public.contatos c on c.id = r.contato_id left join public.usuarios u on u.id = r.responsavel_id
               where r.organizacao_id = v_org and r.status = 'marcada' and r.inicio >= now() order by r.inicio limit 8) x), '[]'::jsonb),
    'reunioes_7d', (select count(*) from public.atd_reunioes r where r.organizacao_id = v_org and r.status = 'marcada' and r.inicio >= now() and r.inicio < now() + interval '7 days'),
    'tarefas', jsonb_build_object(
      'pendentes', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'pendente'),
      'andamento', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'andamento'),
      'atrasadas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status <> 'concluida' and t.prazo < now()),
      'concluidas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'concluida' and t.concluida_em >= v_ini),
      'criadas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.criado_em >= v_ini),
      'por_prioridade', coalesce((select jsonb_object_agg(x.prioridade, x.qtd) from (select t.prioridade, count(*) as qtd from public.atd_tarefas t
                           where t.organizacao_id = v_org and t.status <> 'concluida' group by 1) x), '{}'::jsonb),
      'por_pessoa', coalesce((
        select jsonb_agg(jsonb_build_object('nome', x.nome, 'abertas', x.abertas, 'concluidas', x.concluidas, 'atrasadas', x.atrasadas) order by x.abertas desc, x.nome)
          from (select coalesce(u.nome, 'Sem responsável') as nome,
                       count(*) filter (where t.status <> 'concluida') as abertas,
                       count(*) filter (where t.status = 'concluida' and t.concluida_em >= v_ini) as concluidas,
                       count(*) filter (where t.status <> 'concluida' and t.prazo < now()) as atrasadas
                  from public.atd_tarefas t left join public.usuarios u on u.id = t.responsavel_id
                 where t.organizacao_id = v_org and (t.status <> 'concluida' or t.concluida_em >= v_ini) group by 1) x), '[]'::jsonb)));
end $$;
revoke all on function public.atd_dashboard_crm(int) from public, anon;
grant execute on function public.atd_dashboard_crm(int) to authenticated, service_role;

-- DESFAZER: drop function if exists public.atd_dashboard_crm(int);

-- ===================== 20261126_121_fixar_so_para_mim.sql =====================
-- 121 · FIXAR SÓ PARA MIM (26/11, "igual" à lista de conversas do sistema que a Reviza usava antes: "fixar para mim" e
-- "fixar para todos"). O fixar de sempre (conversas.fixada_em) continua valendo para a equipe toda; este guarda, por
-- pessoa, as conversas que ELA quer no topo da lista dela. Cada um só lê as suas. ADITIVA.

create table if not exists public.atd_fixadas_minhas (
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  conversa_id     uuid not null references public.conversas(id) on delete cascade,
  organizacao_id  uuid not null,
  fixada_em       timestamptz not null default now(),
  primary key (usuario_id, conversa_id)
);
alter table public.atd_fixadas_minhas enable row level security;
drop policy if exists atd_fixadas_minhas_ler on public.atd_fixadas_minhas;
create policy atd_fixadas_minhas_ler on public.atd_fixadas_minhas for select to authenticated using (usuario_id = (select auth.uid()));
revoke all on public.atd_fixadas_minhas from public, anon;
grant select on public.atd_fixadas_minhas to authenticated;

create or replace function public.atd_fixar_para_mim(p_conversa uuid, p_fixar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_eu uuid := auth.uid();
begin
  if v_eu is null then raise exception 'sem_permissao'; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = v_eu and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_fixar then
    insert into public.atd_fixadas_minhas (usuario_id, conversa_id, organizacao_id) values (v_eu, p_conversa, v_org)
    on conflict (usuario_id, conversa_id) do update set fixada_em = now();
  else
    delete from public.atd_fixadas_minhas where usuario_id = v_eu and conversa_id = p_conversa;
  end if;
end $$;
revoke all on function public.atd_fixar_para_mim(uuid, boolean) from public, anon;
grant execute on function public.atd_fixar_para_mim(uuid, boolean) to authenticated;

-- DESFAZER: drop function if exists public.atd_fixar_para_mim(uuid, boolean); drop table if exists public.atd_fixadas_minhas;

-- ===================== 20261126_123_formularios.sql =====================
-- 123 · FORMULÁRIOS DE CAPTAÇÃO (26/11, "igual" aos Formulários do sistema que a Reviza usava antes: um link que o cliente
-- preenche, com agendamento). O administrador monta em Atendimento › Automações › Formulários; o cliente abre
-- <site>/f/<endereço>, preenche e (se ligado) escolhe um horário livre. Cada envio:
--   • acha o cliente pelo telefone (DDD + 8 últimos) ou cria (origem 'formulario');
--   • cria o card na etapa escolhida (ou junta no card aberto que ele já tem), com as etiquetas, o responsável e as respostas;
--   • marca a reunião na Agenda, se ele escolheu horário (só horário livre, dentro das regras do formulário);
--   • o sino da equipe avisa como sempre ("Novo lead", "Reunião agendada" — os avisos da 114).
-- NADA é enviado ao cliente pelo WhatsApp. Proteção: campo-isca para robô, no máximo 30 envios por formulário a cada 10 min e
-- 3 por telefone por dia (os repetidos só atualizam). ADITIVA. Depende da 109 (agenda), 114 (avisos) e 117 (índice do telefone).

create table if not exists public.atd_formularios (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null,
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  titulo          text not null default '' check (char_length(titulo) <= 120),
  descricao       text not null default '' check (char_length(descricao) <= 600),
  campos          jsonb not null default '[]'::jsonb check (jsonb_typeof(campos) = 'array' and jsonb_array_length(campos) <= 20),
  coluna_id       uuid,                                  -- a etapa em que o card nasce (null = a de entrada do funil padrão)
  etiquetas       text[] not null default '{}',
  responsavel_id  uuid,                                  -- o dono do card (null = sem dono)
  agenda          jsonb not null default '{"ligado": false}'::jsonb,
  mensagem_final  text not null default 'Recebemos seus dados. Em breve a nossa equipe fala com você.' check (char_length(mensagem_final) <= 400),
  ativo           boolean not null default true,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists atd_formularios_org on public.atd_formularios (organizacao_id);

create table if not exists public.atd_formulario_respostas (
  id               uuid primary key default gen_random_uuid(),
  formulario_id    uuid not null references public.atd_formularios(id) on delete cascade,
  organizacao_id   uuid not null,
  dados            jsonb not null default '{}'::jsonb,
  telefone_chave   text,
  contato_id       uuid,
  oportunidade_id  uuid,
  reuniao_id       uuid,
  repetido         boolean not null default false,
  criado_em        timestamptz not null default now()
);
create index if not exists atd_formulario_respostas_form on public.atd_formulario_respostas (formulario_id, criado_em desc);
create index if not exists atd_formulario_respostas_fone on public.atd_formulario_respostas (formulario_id, telefone_chave, criado_em desc);

alter table public.atd_formularios enable row level security;
alter table public.atd_formulario_respostas enable row level security;
drop policy if exists atd_formularios_admin on public.atd_formularios;
create policy atd_formularios_admin on public.atd_formularios for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
drop policy if exists atd_formulario_respostas_admin on public.atd_formulario_respostas;
create policy atd_formulario_respostas_admin on public.atd_formulario_respostas for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_formularios, public.atd_formulario_respostas from public, anon;
grant select, insert, update, delete on public.atd_formularios to authenticated;
grant select on public.atd_formulario_respostas to authenticated;

create or replace function private.atd_formularios_tocar() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists atd_formularios_tocar on public.atd_formularios;
create trigger atd_formularios_tocar before update on public.atd_formularios for each row execute function private.atd_formularios_tocar();

-- os horários livres do formulário (São Paulo): dias da semana e faixa do formulário, de "duracao_min" em "duracao_min",
-- a partir de agora + antecedência, por "ate_dias" dias; sem os horários em que a pessoa da agenda já tem reunião marcada
create or replace function private.atd_formulario_horarios(p_form public.atd_formularios)
returns timestamptz[] language plpgsql stable security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_form.agenda, '{}'::jsonb);
  v_dur int := least(greatest(coalesce((a->>'duracao_min')::int, 30), 10), 240);
  v_ant int := least(greatest(coalesce((a->>'antecedencia_h')::int, 2), 0), 168);
  v_ate int := least(greatest(coalesce((a->>'ate_dias')::int, 14), 1), 60);
  v_ini time := coalesce(nullif(a->>'inicio', '')::time, '09:00');
  v_fim time := coalesce(nullif(a->>'fim', '')::time, '18:00');
  v_dias int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(a->'dias', '[1,2,3,4,5]'::jsonb)) x), '{1,2,3,4,5}');
  v_quem uuid := coalesce(nullif(a->>'responsavel_id', '')::uuid, p_form.responsavel_id);
  v_out timestamptz[] := '{}'; d date; t time; h timestamptz;
begin
  if coalesce((a->>'ligado')::boolean, false) is not true then return v_out; end if;
  for d in select generate_series((now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + v_ate, interval '1 day')::date loop
    continue when not (extract(isodow from d)::int = any (v_dias));
    t := v_ini;
    while t + make_interval(mins => v_dur) <= v_fim loop
      h := (d + t) at time zone 'America/Sao_Paulo';
      if h >= now() + make_interval(hours => v_ant)
         and not exists (select 1 from public.atd_reunioes r where r.organizacao_id = p_form.organizacao_id and r.status = 'marcada'
                          and (v_quem is null or r.responsavel_id = v_quem)
                          and tstzrange(r.inicio, r.inicio + make_interval(mins => coalesce(r.duracao_min, 30))) && tstzrange(h, h + make_interval(mins => v_dur))) then
        v_out := v_out || h;
      end if;
      exit when cardinality(v_out) >= 200;
      t := t + make_interval(mins => v_dur);
    end loop;
    exit when cardinality(v_out) >= 200;
  end loop;
  return v_out;
end $$;
revoke all on function private.atd_formulario_horarios(public.atd_formularios) from public, anon, authenticated;

-- o que a página pública mostra (sem login): o formulário ligado, sem nada interno
create or replace function public.atd_formulario_publico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f public.atd_formularios;
begin
  select * into f from public.atd_formularios where slug = lower(btrim(coalesce(p_slug, ''))) and ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'titulo', coalesce(nullif(btrim(f.titulo), ''), f.nome), 'descricao', f.descricao, 'campos', f.campos,
    'empresa', coalesce((select o.nome from public.organizacoes o where o.id = f.organizacao_id), ''),
    'agenda', case when coalesce((f.agenda->>'ligado')::boolean, false)
                   then jsonb_build_object('ligado', true, 'duracao_min', coalesce((f.agenda->>'duracao_min')::int, 30), 'obrigatorio', coalesce((f.agenda->>'obrigatorio')::boolean, false),
                                           'horarios', to_jsonb(private.atd_formulario_horarios(f)))
                   else jsonb_build_object('ligado', false) end);
end $$;
revoke all on function public.atd_formulario_publico(text) from public;
grant execute on function public.atd_formulario_publico(text) to anon, authenticated;

-- o envio (sem login)
create or replace function public.atd_formulario_enviar(p_slug text, p_dados jsonb, p_horario timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.atd_formularios; v_funil uuid; v_col uuid; c jsonb; v_chave text; v_val text; v_nome text; v_fone text; v_email text;
  v_k text; v_ct uuid; v_op uuid; v_reu uuid; v_obs text := ''; v_rep boolean := false; v_quem uuid; v_dur int; v_res jsonb := '{}'::jsonb;
begin
  select * into f from public.atd_formularios where slug = lower(btrim(coalesce(p_slug, ''))) and ativo;
  if not found then raise exception 'formulario_indisponivel'; end if;
  if jsonb_typeof(coalesce(p_dados, 'null'::jsonb)) <> 'object' or length(p_dados::text) > 20000 then raise exception 'dados_invalidos'; end if;
  -- campo-isca: gente não vê; robô preenche. Responde "ok" e não grava nada.
  if nullif(btrim(coalesce(p_dados->>'_site', '')), '') is not null then return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final); end if;
  if (select count(*) from public.atd_formulario_respostas r where r.formulario_id = f.id and r.criado_em > now() - interval '10 minutes') >= 30 then
    raise exception 'muitos_envios';
  end if;
  v_nome := left(btrim(coalesce(p_dados->>'nome', '')), 120);
  v_fone := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g');
  if v_fone ~ '^[0-9]{10,11}$' then v_fone := '55' || v_fone; end if;
  v_email := nullif(lower(left(btrim(coalesce(p_dados->>'email', '')), 160)), '');
  if char_length(v_nome) < 2 then raise exception 'campo_obrigatorio:nome'; end if;
  if v_fone !~ '^55[1-9][0-9][0-9]{8,9}$' then raise exception 'telefone_invalido'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  -- as outras perguntas: obrigatórias e tamanho; viram as respostas no card
  for c in select * from jsonb_array_elements(f.campos) loop
    v_chave := c->>'chave';
    continue when v_chave in ('nome', 'telefone', 'email') or v_chave is null;
    v_val := left(btrim(coalesce(p_dados->>v_chave, '')), 1000);
    if coalesce((c->>'obrigatorio')::boolean, false) and v_val = '' then raise exception 'campo_obrigatorio:%', v_chave; end if;
    if v_val <> '' then v_obs := v_obs || E'\n• ' || coalesce(nullif(c->>'rotulo', ''), v_chave) || ': ' || v_val; end if;
  end loop;
  v_k := private.atd_chave_fone(v_fone);
  -- o mesmo telefone mais de 3 vezes no dia neste formulário: guarda a resposta, não mexe em mais nada
  if (select count(*) from public.atd_formulario_respostas r where r.formulario_id = f.id and r.telefone_chave = v_k and r.criado_em > now() - interval '24 hours') >= 3 then
    insert into public.atd_formulario_respostas (formulario_id, organizacao_id, dados, telefone_chave, repetido) values (f.id, f.organizacao_id, p_dados - '_site', v_k, true);
    return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final);
  end if;
  -- 1. o cliente
  select id into v_ct from public.contatos where organizacao_id = f.organizacao_id and mesclado_para is null and private.atd_chave_fone(telefone) = v_k order by criado_em limit 1;
  if v_ct is null then
    insert into public.contatos (organizacao_id, nome, telefone, email, origem, etiquetas)
    values (f.organizacao_id, v_nome, v_fone, v_email, 'formulario', f.etiquetas) returning id into v_ct;
  else
    v_rep := true;
    update public.contatos set email = coalesce(email, v_email) where id = v_ct;
  end if;
  -- 2. o card (junta no aberto, se ele já tem)
  select id into v_funil from public.funis where organizacao_id = f.organizacao_id and padrao order by criado_em limit 1;
  v_col := coalesce((select id from public.funil_colunas where id = f.coluna_id and funil_id = v_funil and not arquivada),
                    (select id from public.funil_colunas where funil_id = v_funil and not arquivada order by entrada desc, ordem limit 1));
  v_obs := 'Formulário "' || f.nome || '" (' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')' || v_obs;
  select id into v_op from public.oportunidades where organizacao_id = f.organizacao_id and contato_id = v_ct and funil_id = v_funil and status = 'em_andamento' limit 1;
  if v_op is null then
    insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, titulo, telefone, contato_nome, origem, fonte_aquisicao, responsavel_id, etiquetas, observacoes, metadados)
    values (f.organizacao_id, v_ct, v_funil, v_col, v_nome, v_fone, v_nome, 'Formulário', f.nome, f.responsavel_id, f.etiquetas, v_obs,
            jsonb_build_object('formulario', jsonb_build_object('id', f.id, 'nome', f.nome)))
    returning id into v_op;
  else
    update public.oportunidades
       set etiquetas = (select coalesce(array_agg(distinct e), '{}') from unnest(coalesce(etiquetas, '{}') || f.etiquetas) e),
           observacoes = left(coalesce(nullif(observacoes, '') || E'\n\n', '') || v_obs, 8000)
     where id = v_op;
  end if;
  -- 3. a reunião (só horário livre do formulário)
  if p_horario is not null and coalesce((f.agenda->>'ligado')::boolean, false) then
    if not (p_horario = any (private.atd_formulario_horarios(f))) then raise exception 'horario_indisponivel'; end if;
    v_quem := coalesce(nullif(f.agenda->>'responsavel_id', '')::uuid, f.responsavel_id);
    v_dur := coalesce((f.agenda->>'duracao_min')::int, 30);
    insert into public.atd_reunioes (organizacao_id, titulo, tipo, inicio, duracao_min, responsavel_id, contato_id, observacao, status)
    values (f.organizacao_id, left('Formulário: ' || f.nome || ' · ' || v_nome, 160), coalesce(nullif(f.agenda->>'tipo', ''), 'reuniao'), p_horario, v_dur, v_quem, v_ct,
            'Marcada pelo próprio cliente no formulário "' || f.nome || '".', 'marcada')
    returning id into v_reu;
  elsif coalesce((f.agenda->>'ligado')::boolean, false) and coalesce((f.agenda->>'obrigatorio')::boolean, false) then
    raise exception 'campo_obrigatorio:horario';
  end if;
  insert into public.atd_formulario_respostas (formulario_id, organizacao_id, dados, telefone_chave, contato_id, oportunidade_id, reuniao_id, repetido)
  values (f.id, f.organizacao_id, p_dados - '_site', v_k, v_ct, v_op, v_reu, v_rep);
  return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final, 'horario', case when v_reu is not null then p_horario end);
end $$;
revoke all on function public.atd_formulario_enviar(text, jsonb, timestamptz) from public;
grant execute on function public.atd_formulario_enviar(text, jsonb, timestamptz) to anon, authenticated;

-- a lista do administrador: os formulários e quantas respostas cada um teve (7 e 30 dias)
create or replace function public.atd_formularios_resumo()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'por_formulario', coalesce((select jsonb_object_agg(x.formulario_id, jsonb_build_object('d7', x.d7, 'd30', x.d30, 'reunioes', x.reunioes, 'ultima', x.ultima)) from (
        select r.formulario_id, count(*) filter (where r.criado_em > now() - interval '7 days') d7, count(*) filter (where r.criado_em > now() - interval '30 days') d30,
               count(*) filter (where r.reuniao_id is not null and r.criado_em > now() - interval '30 days') reunioes, max(r.criado_em) ultima
          from public.atd_formulario_respostas r where r.organizacao_id = v_org group by 1) x), '{}'::jsonb),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('quando', y.criado_em, 'formulario', y.form, 'cliente', y.cliente, 'repetido', y.repetido,
                                                              'reuniao', y.reuniao, 'oportunidade_id', y.oportunidade_id) order by y.criado_em desc) from (
        select r.criado_em, f.nome form, coalesce(ct.nome, r.dados->>'nome') cliente, r.repetido, (select re.inicio from public.atd_reunioes re where re.id = r.reuniao_id) reuniao, r.oportunidade_id
          from public.atd_formulario_respostas r join public.atd_formularios f on f.id = r.formulario_id left join public.contatos ct on ct.id = r.contato_id
         where r.organizacao_id = v_org order by r.criado_em desc limit 50) y), '[]'::jsonb));
end $$;
revoke all on function public.atd_formularios_resumo() from public, anon;
grant execute on function public.atd_formularios_resumo() to authenticated, service_role;

-- DESFAZER: drop function if exists public.atd_formularios_resumo(), public.atd_formulario_enviar(text, jsonb, timestamptz),
--   public.atd_formulario_publico(text), private.atd_formulario_horarios(public.atd_formularios), private.atd_formularios_tocar();
--   drop table if exists public.atd_formulario_respostas, public.atd_formularios;

-- ===================== 20261126_124_webhooks_saida.sql =====================
-- 124 · AVISAR OUTRO SISTEMA (WEBHOOKS DE SAÍDA) (26/11, "igual" aos Webhooks do sistema que a Reviza usava antes). O
-- administrador cadastra um endereço (https) e escolhe os momentos; a cada momento o Reviza manda um POST com os dados:
--   lead_novo  card novo no funil         etapa     o card mudou de etapa      venda    o card virou venda
--   perdido    o card foi descartado      reuniao   reunião marcada na Agenda  formulario  alguém preencheu um formulário
-- Cada envio vai assinado: X-Atenvo-Assinatura: sha256=<HMAC do corpo com o segredo do webhook>. Em segundo plano (pg_net),
-- nunca segura a tela. Falhou: tenta de novo até 3 vezes (2, 4 e 6 min depois). 30 falhas seguidas: o webhook desliga sozinho.
-- Nada dispara durante a importação do sistema anterior. Isto NÃO manda mensagem a cliente nenhum. ADITIVA.

create table if not exists public.atd_webhooks (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null,
  nome             text not null check (char_length(btrim(nome)) between 1 and 80),
  url              text not null,
  eventos          text[] not null default '{lead_novo,etapa,venda}'
                   check (cardinality(eventos) > 0 and eventos <@ array['lead_novo', 'etapa', 'venda', 'perdido', 'reuniao', 'formulario']),
  segredo          text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  ativo            boolean not null default true,
  falhas_seguidas  int not null default 0,
  ultimo_envio_em  timestamptz,
  ultimo_status    int,
  desligado_motivo text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
-- o endereço: https, sem espaço, até 500 letras (o Postgres não aceita {4,500} na expressão: o tamanho vai à parte)
alter table public.atd_webhooks drop constraint if exists atd_webhooks_url_check;
alter table public.atd_webhooks add constraint atd_webhooks_url_check check (url ~ '^https://[^[:space:]]{4,}$' and char_length(url) <= 500);
create table if not exists public.atd_webhook_envios (
  id             bigserial primary key,
  webhook_id     uuid not null references public.atd_webhooks(id) on delete cascade,
  organizacao_id uuid not null,
  evento         text not null,
  payload        jsonb not null,
  request_id     bigint,
  status_http    int,
  erro           text,
  tentativas     int not null default 0,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz,
  resolvido_em   timestamptz
);
create index if not exists atd_webhook_envios_pend on public.atd_webhook_envios (resolvido_em, enviado_em) where resolvido_em is null;
create index if not exists atd_webhook_envios_web on public.atd_webhook_envios (webhook_id, criado_em desc);

alter table public.atd_webhooks enable row level security;
alter table public.atd_webhook_envios enable row level security;
drop policy if exists atd_webhooks_admin on public.atd_webhooks;
create policy atd_webhooks_admin on public.atd_webhooks for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
drop policy if exists atd_webhook_envios_admin on public.atd_webhook_envios;
create policy atd_webhook_envios_admin on public.atd_webhook_envios for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_webhooks, public.atd_webhook_envios from public, anon;
grant select, insert, update, delete on public.atd_webhooks to authenticated;
grant select on public.atd_webhook_envios to authenticated;

create or replace function private.atd_webhooks_tocar() returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  if new.ativo and not old.ativo then new.falhas_seguidas := 0; new.desligado_motivo := null; end if;
  return new;
end $$;
drop trigger if exists atd_webhooks_tocar on public.atd_webhooks;
create trigger atd_webhooks_tocar before update on public.atd_webhooks for each row execute function private.atd_webhooks_tocar();

-- mandar UM envio (assinado) em segundo plano
create or replace function private.atd_webhook_enviar(p_envio bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.atd_webhook_envios; w public.atd_webhooks; v_corpo text; v_req bigint;
begin
  select * into e from public.atd_webhook_envios where id = p_envio;
  select * into w from public.atd_webhooks where id = e.webhook_id;
  if w.id is null or not w.ativo then
    update public.atd_webhook_envios set resolvido_em = now(), erro = coalesce(erro, 'webhook desligado') where id = p_envio; return;
  end if;
  v_corpo := e.payload::text;
  v_req := net.http_post(
    url := w.url, body := e.payload, timeout_milliseconds := 8000,
    headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'Atenvo-Webhook/1', 'X-Atenvo-Evento', e.evento,
                                  'X-Atenvo-Envio', e.id::text, 'X-Atenvo-Assinatura', 'sha256=' || encode(extensions.hmac(v_corpo, w.segredo, 'sha256'), 'hex')));
  update public.atd_webhook_envios set request_id = v_req, tentativas = tentativas + 1, enviado_em = now(), status_http = null, erro = null where id = p_envio;
end $$;
revoke all on function private.atd_webhook_enviar(bigint) from public, anon, authenticated;

-- pôr na fila (para cada webhook ligado que ouve o momento) e mandar já
create or replace function private.atd_webhook_disparar(p_org uuid, p_evento text, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare w record; v_id bigint;
begin
  if current_setting('atd.importando', true) = 'guimoo' then return; end if;
  for w in select id from public.atd_webhooks where organizacao_id = p_org and ativo and p_evento = any (eventos) loop
    insert into public.atd_webhook_envios (webhook_id, organizacao_id, evento, payload)
    values (w.id, p_org, p_evento, jsonb_build_object('evento', p_evento, 'quando', now(), 'dados', p_dados))
    returning id into v_id;
    perform private.atd_webhook_enviar(v_id);
  end loop;
end $$;
revoke all on function private.atd_webhook_disparar(uuid, text, jsonb) from public, anon, authenticated;

-- os dados de um card (o que vai no corpo)
create or replace function private.atd_webhook_dados_card(p_op uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'card_id', o.id, 'cliente', coalesce(ct.nome, o.contato_nome, o.titulo), 'telefone', coalesce(ct.telefone, o.telefone), 'email', ct.email,
    'etapa', fc.nome, 'situacao', o.status, 'origem', coalesce(o.origem, o.fonte_aquisicao), 'responsavel', u.nome,
    'etiquetas', to_jsonb(coalesce(o.etiquetas, '{}')), 'valor', o.valor_estimado, 'motivo_perda', o.motivo_perda,
    'entrou_em', o.criado_em, 'fechado_em', o.fechado_em, 'contato_id', o.contato_id))
    from public.oportunidades o left join public.contatos ct on ct.id = o.contato_id
    left join public.funil_colunas fc on fc.id = o.coluna_id left join public.usuarios u on u.id = o.responsavel_id
   where o.id = p_op
$$;
revoke all on function private.atd_webhook_dados_card(uuid) from public, anon, authenticated;

create or replace function private.atd_webhooks_do_card() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    if tg_op = 'INSERT' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'lead_novo', private.atd_webhook_dados_card(new.id));
      return null;
    end if;
    if new.coluna_id is distinct from old.coluna_id then
      perform private.atd_webhook_disparar(new.organizacao_id, 'etapa', private.atd_webhook_dados_card(new.id)
        || jsonb_build_object('etapa_antes', (select nome from public.funil_colunas where id = old.coluna_id)));
    end if;
    if new.status = 'ganho' and old.status is distinct from 'ganho' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'venda', private.atd_webhook_dados_card(new.id));
    elsif new.status = 'perdido' and old.status is distinct from 'perdido' then
      perform private.atd_webhook_disparar(new.organizacao_id, 'perdido', private.atd_webhook_dados_card(new.id));
    end if;
  exception when others then
    raise warning 'atd_webhooks_do_card: %', sqlerrm;   -- o webhook nunca derruba a mudança do card
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_do_card on public.oportunidades;
create trigger atd_webhooks_do_card after insert or update of coluna_id, status on public.oportunidades
  for each row when (current_setting('atd.importando', true) is distinct from 'guimoo') execute function private.atd_webhooks_do_card();

create or replace function private.atd_webhooks_da_reuniao() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    perform private.atd_webhook_disparar(new.organizacao_id, 'reuniao', jsonb_strip_nulls(jsonb_build_object(
      'reuniao_id', new.id, 'titulo', new.titulo, 'tipo', new.tipo, 'inicio', new.inicio, 'duracao_min', new.duracao_min,
      'cliente', (select nome from public.contatos where id = new.contato_id), 'telefone', (select telefone from public.contatos where id = new.contato_id),
      'responsavel', (select nome from public.usuarios where id = new.responsavel_id), 'contato_id', new.contato_id)));
  exception when others then raise warning 'atd_webhooks_da_reuniao: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_da_reuniao on public.atd_reunioes;
create trigger atd_webhooks_da_reuniao after insert on public.atd_reunioes for each row execute function private.atd_webhooks_da_reuniao();

create or replace function private.atd_webhooks_do_formulario() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.repetido or not exists (select 1 from public.atd_webhooks where organizacao_id = new.organizacao_id and ativo) then return null; end if;
    perform private.atd_webhook_disparar(new.organizacao_id, 'formulario', jsonb_strip_nulls(jsonb_build_object(
      'formulario', (select nome from public.atd_formularios where id = new.formulario_id), 'respostas', new.dados,
      'card_id', new.oportunidade_id, 'reuniao_id', new.reuniao_id, 'contato_id', new.contato_id)));
  exception when others then raise warning 'atd_webhooks_do_formulario: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists atd_webhooks_do_formulario on public.atd_formulario_respostas;
create trigger atd_webhooks_do_formulario after insert on public.atd_formulario_respostas for each row execute function private.atd_webhooks_do_formulario();

-- a cada minuto: lê as respostas do pg_net, tenta de novo o que falhou (até 3 vezes) e desliga o webhook que só falha
create or replace function private.atd_webhooks_conferir()
returns void language plpgsql security definer set search_path = '' as $$
declare e record; v_st int; v_err text; v_to boolean; v_ok boolean;
begin
  for e in select * from public.atd_webhook_envios where resolvido_em is null and request_id is not null and status_http is null and erro is null
              and enviado_em < now() - interval '15 seconds' order by id limit 500 loop
    select status_code, error_msg, timed_out into v_st, v_err, v_to from net._http_response where id = e.request_id;
    if not found then
      continue when e.enviado_em > now() - interval '10 minutes';
      v_st := null; v_err := 'sem resposta'; v_to := true;
    end if;
    v_ok := coalesce(v_st between 200 and 299, false);
    update public.atd_webhook_envios
       set status_http = v_st,
           erro = case when v_ok then null else coalesce(nullif(v_err, ''), case when v_to then 'tempo esgotado' end, 'HTTP ' || coalesce(v_st::text, '?')) end,
           resolvido_em = case when v_ok or e.tentativas >= 3 then now() end
     where id = e.id;
    update public.atd_webhooks set ultimo_envio_em = e.enviado_em, ultimo_status = v_st,
           falhas_seguidas = case when v_ok then 0 else falhas_seguidas + 1 end
     where id = e.webhook_id;
  end loop;
  -- tentar de novo o que falhou (2, 4 e 6 min depois da tentativa anterior)
  for e in select id from public.atd_webhook_envios
            where resolvido_em is null and enviado_em is not null and tentativas < 3 and erro is not null
              and enviado_em < now() - make_interval(mins => 2 * tentativas)
            order by id limit 200 loop
    perform private.atd_webhook_enviar(e.id);
  end loop;
  update public.atd_webhooks set ativo = false, desligado_motivo = '30 falhas seguidas: confira o endereço e ligue de novo'
   where ativo and falhas_seguidas >= 30;
end $$;
revoke all on function private.atd_webhooks_conferir() from public, anon, authenticated;
do $$ begin
  perform cron.unschedule('atd-webhooks') where exists (select 1 from cron.job where jobname = 'atd-webhooks');
  perform cron.schedule('atd-webhooks', '* * * * *', 'select private.atd_webhooks_conferir()');
end $$;

-- testar: manda um envio de exemplo para o webhook (o administrador vê o resultado na lista)
create or replace function public.atd_webhook_testar(p_webhook uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare w public.atd_webhooks; v_id bigint;
begin
  select * into w from public.atd_webhooks where id = p_webhook;
  if w.id is null or coalesce(public.org_papel(w.organizacao_id), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  if not w.ativo then raise exception 'webhook_desligado'; end if;
  insert into public.atd_webhook_envios (webhook_id, organizacao_id, evento, payload)
  values (w.id, w.organizacao_id, 'teste', jsonb_build_object('evento', 'teste', 'quando', now(), 'dados', jsonb_build_object(
    'mensagem', 'Teste do Atenvo: se chegou, o endereço está certo.', 'cliente', 'Cliente de exemplo', 'telefone', '5551999990000', 'etapa', 'LEAD NOVO')))
  returning id into v_id;
  perform private.atd_webhook_enviar(v_id);
  return v_id;
end $$;
revoke all on function public.atd_webhook_testar(uuid) from public, anon;
grant execute on function public.atd_webhook_testar(uuid) to authenticated;

-- trocar o segredo (quando ele vazou ou a pessoa que cuidava saiu): os envios seguintes já vão com o novo
create or replace function public.atd_webhook_trocar_segredo(p_webhook uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.atd_webhooks where id = p_webhook;
  if v_org is null or coalesce(public.org_papel(v_org), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  update public.atd_webhooks set segredo = encode(extensions.gen_random_bytes(24), 'hex') where id = p_webhook;
end $$;
revoke all on function public.atd_webhook_trocar_segredo(uuid) from public, anon;
grant execute on function public.atd_webhook_trocar_segredo(uuid) to authenticated;

-- DESFAZER: select cron.unschedule('atd-webhooks'); drop trigger atd_webhooks_do_card on public.oportunidades;
--   drop trigger atd_webhooks_da_reuniao on public.atd_reunioes; drop trigger atd_webhooks_do_formulario on public.atd_formulario_respostas;
--   drop table if exists public.atd_webhook_envios, public.atd_webhooks; (e as funções private.atd_webhook*)

-- ===================== 20261126_125_disparos.sql =====================
-- 125 · DISPAROS EM LOTE (26/11, "igual" aos Disparos do sistema que a Reviza usava antes). O administrador escolhe QUEM
-- recebe (etapas, etiquetas, responsável, só cards em andamento, sem conversa há X dias), a MENSAGEM (texto com {{nome}},
-- e um arquivo dos Scripts, se quiser), o NÚMERO e o RITMO; confirma; e cada mensagem vira uma MENSAGEM AGENDADA
-- (a central de sempre: aparece lá, sai pelo número escolhido, pode ser cancelada uma a uma ou o disparo inteiro).
-- Ritmo por número (anti-spam): uma mensagem a cada "intervalo" (padrão 90–180 s, sorteado), só na janela de horário e nos
-- dias escolhidos, no máximo "máximo por dia". Fica de fora: quem pediu para não receber (opt-out), sem telefone válido,
-- card fechado (a não ser que peça "todos"). Até 2.000 por disparo. Nada sai sem alguém da equipe criar e confirmar. ADITIVA.

create table if not exists public.atd_disparos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  canal_id       uuid not null,
  mensagem       jsonb not null,                 -- {tipo, texto, storage_path, mime, nome, tamanho}
  filtro         jsonb not null default '{}'::jsonb,
  ritmo          jsonb not null default '{}'::jsonb,
  status         text not null default 'agendado' check (status in ('agendado', 'cancelado', 'concluido')),
  total          int not null default 0,
  inicio_em      timestamptz,
  fim_previsto   timestamptz,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  cancelado_em   timestamptz,
  cancelado_por  uuid
);
create index if not exists atd_disparos_org on public.atd_disparos (organizacao_id, criado_em desc);
create index if not exists mensagens_agendadas_disparo on public.mensagens_agendadas ((metadados->>'disparo_id')) where metadados ? 'disparo_id';
alter table public.atd_disparos enable row level security;
drop policy if exists atd_disparos_admin on public.atd_disparos;
create policy atd_disparos_admin on public.atd_disparos for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_disparos from public, anon;
grant select on public.atd_disparos to authenticated;

-- quem o filtro pega (um por cliente): o card do funil padrão + o contato, sem opt-out e com telefone válido
create or replace function private.atd_disparo_alvos(p_org uuid, p_filtro jsonb)
returns table (contato_id uuid, nome text, telefone text, oportunidade_id uuid, etapa text)
language sql stable security definer set search_path = '' as $$
  with f as (
    select coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_filtro->'etapas', '[]')) x), '{}') as etapas,
           coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_filtro->'etiquetas', '[]')) x), '{}') as etiquetas,
           coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_filtro->'responsaveis', '[]')) x), '{}') as resps,
           coalesce((p_filtro->>'todos')::boolean, false) as todos,
           nullif(p_filtro->>'sem_conversa_dias', '')::int as sem_dias,
           coalesce((p_filtro->>'sem_responsavel')::boolean, false) as sem_resp),
  base as (
    select distinct on (o.contato_id) o.contato_id, coalesce(ct.nome, o.contato_nome, o.titulo) as nome, ct.telefone, o.id as oportunidade_id, fc.nome as etapa
      from public.oportunidades o
      join public.funis fu on fu.id = o.funil_id and fu.padrao
      join public.contatos ct on ct.id = o.contato_id and ct.mesclado_para is null
      left join public.funil_colunas fc on fc.id = o.coluna_id, f
     where o.organizacao_id = p_org and o.contato_id is not null
       and (f.todos or o.status = 'em_andamento') and o.status <> 'cancelado'
       and (cardinality(f.etapas) = 0 or o.coluna_id = any (f.etapas))
       and (cardinality(f.etiquetas) = 0 or (coalesce(o.etiquetas, '{}') || coalesce(ct.etiquetas, '{}')) && f.etiquetas)
       and (cardinality(f.resps) = 0 or o.responsavel_id = any (f.resps) or (f.sem_resp and o.responsavel_id is null))
       and (not f.sem_resp or cardinality(f.resps) > 0 or o.responsavel_id is null)
     order by o.contato_id, o.criado_em desc)
  select b.contato_id, b.nome, b.telefone, b.oportunidade_id, b.etapa
    from base b, f
   where regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g') ~ '^(55)?[1-9][0-9][0-9]{8,9}$'
     and not exists (select 1 from public.atd_wa_optout x where x.contato_id = b.contato_id)
     and (f.sem_dias is null or not exists (
           select 1 from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
            where cv.contato_id = b.contato_id and m.enviada_em > now() - make_interval(days => f.sem_dias)))
$$;
revoke all on function private.atd_disparo_alvos(uuid, jsonb) from public, anon, authenticated;

-- a prévia do "quem recebe" (sem criar nada)
create or replace function public.atd_disparo_previa(p_filtro jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'total', (select count(*) from private.atd_disparo_alvos(v_org, p_filtro)),
    'amostra', coalesce((select jsonb_agg(jsonb_build_object('nome', a.nome, 'etapa', a.etapa)) from (select * from private.atd_disparo_alvos(v_org, p_filtro) limit 6) a), '[]'::jsonb));
end $$;
revoke all on function public.atd_disparo_previa(jsonb) from public, anon;
grant execute on function public.atd_disparo_previa(jsonb) to authenticated;

-- os horários de cada mensagem: a partir do início, um intervalo sorteado entre min e max, só nos dias/horas da janela,
-- no máximo "max_por_dia" por dia (São Paulo)
create or replace function private.atd_disparo_horarios(p_n int, p_inicio timestamptz, p_ritmo jsonb)
returns timestamptz[] language plpgsql volatile set search_path = '' as $$
declare
  v_min int := least(greatest(coalesce((p_ritmo->>'intervalo_min_s')::int, 90), 60), 3600);
  v_max int := least(greatest(coalesce((p_ritmo->>'intervalo_max_s')::int, 180), 60), 7200);
  v_ini time := coalesce(nullif(p_ritmo->>'janela_inicio', '')::time, '08:00');
  v_fim time := coalesce(nullif(p_ritmo->>'janela_fim', '')::time, '20:00');
  v_dias int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p_ritmo->'dias', '[1,2,3,4,5,6]'::jsonb)) x), '{1,2,3,4,5,6}');
  v_teto int := least(greatest(coalesce((p_ritmo->>'max_por_dia')::int, 150), 1), 1000);
  v_out timestamptz[] := '{}'; t timestamptz := greatest(coalesce(p_inicio, now()), now() + interval '1 minute');
  v_local timestamp; v_dia date; v_no_dia int := 0; v_dia_atual date := null; i int := 0; v_guarda int := 0;
begin
  if v_max < v_min then v_max := v_min; end if;
  while i < p_n loop
    v_guarda := v_guarda + 1; exit when v_guarda > p_n * 4 + 1000;
    v_local := t at time zone 'America/Sao_Paulo'; v_dia := v_local::date;
    if v_dia_atual is distinct from v_dia then v_dia_atual := v_dia; v_no_dia := 0; end if;
    -- fora do dia, fora da janela ou dia cheio: pula para o começo da janela do próximo dia válido
    if not (extract(isodow from v_dia)::int = any (v_dias)) or v_local::time >= v_fim or v_no_dia >= v_teto then
      v_dia := v_dia + 1;
      while not (extract(isodow from v_dia)::int = any (v_dias)) loop v_dia := v_dia + 1; end loop;
      t := (v_dia + v_ini) at time zone 'America/Sao_Paulo'; continue;
    end if;
    if v_local::time < v_ini then t := (v_dia + v_ini) at time zone 'America/Sao_Paulo'; continue; end if;
    v_out := v_out || t; i := i + 1; v_no_dia := v_no_dia + 1;
    t := t + make_interval(secs => v_min + floor(random() * (v_max - v_min + 1)));
  end loop;
  return v_out;
end $$;
revoke all on function private.atd_disparo_horarios(int, timestamptz, jsonb) from public, anon, authenticated;

-- criar o disparo: confere tudo, acha (ou cria, arquivada) a conversa de cada um no número escolhido e agenda as mensagens
create or replace function public.atd_disparo_criar(p_nome text, p_canal uuid, p_mensagem jsonb, p_filtro jsonb, p_ritmo jsonb, p_inicio timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := 'de300000-0000-4000-8000-000000000001'; v_canal public.canais; v_id uuid; a record; v_horas timestamptz[]; v_n int;
  v_conv uuid; v_txt text; v_tipo text := coalesce(nullif(p_mensagem->>'tipo', ''), 'texto'); v_i int := 0; v_primeiro text;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 80 then raise exception 'nome_invalido'; end if;
  if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento') then raise exception 'mensagem_invalida'; end if;
  if v_tipo = 'texto' and char_length(btrim(coalesce(p_mensagem->>'texto', ''))) < 2 then raise exception 'mensagem_vazia'; end if;
  if char_length(coalesce(p_mensagem->>'texto', '')) > 4000 then raise exception 'mensagem_longa'; end if;
  if v_tipo <> 'texto' and nullif(p_mensagem->>'storage_path', '') is null then raise exception 'arquivo_faltando'; end if;
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  select count(*) into v_n from private.atd_disparo_alvos(v_org, p_filtro);
  if v_n = 0 then raise exception 'ninguem_no_filtro'; end if;
  if v_n > 2000 then raise exception 'mais_de_2000'; end if;
  v_horas := private.atd_disparo_horarios(v_n, p_inicio, p_ritmo);
  insert into public.atd_disparos (organizacao_id, nome, canal_id, mensagem, filtro, ritmo, total, inicio_em, fim_previsto, criado_por)
  values (v_org, btrim(p_nome), p_canal, p_mensagem, coalesce(p_filtro, '{}'), coalesce(p_ritmo, '{}'), v_n, v_horas[1], v_horas[cardinality(v_horas)], auth.uid())
  returning id into v_id;
  for a in select * from private.atd_disparo_alvos(v_org, p_filtro) order by etapa nulls last, nome loop
    v_i := v_i + 1;
    select id into v_conv from public.conversas where organizacao_id = v_org and contato_id = a.contato_id and status <> 'fechada'
     order by arquivada_em asc nulls first, ultima_interacao_em desc nulls last limit 1;
    if v_conv is null then
      -- a conversa nasce ARQUIVADA: só aparece na lista quando o cliente responder (a mensagem nova a reabre)
      insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, ultimo_canal_id, status, nao_lidas, ultima_lida_em, arquivada_em)
      values (v_org, a.contato_id, p_canal, p_canal, p_canal, 'aberta', 0, now(), now()) returning id into v_conv;
    else
      -- conversa sem número ou no número de histórico (veio do sistema anterior): fica com o número do disparo
      update public.conversas set canal_id = p_canal, canal_origem_id = coalesce(canal_origem_id, p_canal), ultimo_canal_id = coalesce(ultimo_canal_id, p_canal)
       where id = v_conv and canal_id is null;
    end if;
    v_primeiro := initcap(split_part(btrim(coalesce(a.nome, '')), ' ', 1));
    v_txt := nullif(btrim(replace(replace(coalesce(p_mensagem->>'texto', ''), '{{nome}}', coalesce(nullif(v_primeiro, ''), 'tudo bem')), '{{nome_completo}}', coalesce(a.nome, ''))), '');
    insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados)
    values (v_org, v_conv, a.contato_id, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, v_txt, case when v_tipo = 'texto' then null else p_mensagem->>'storage_path' end, case when v_tipo = 'texto' then null else p_mensagem->>'mime' end,
      case when v_tipo = 'texto' then null else p_mensagem->>'nome' end, case when v_tipo = 'texto' then null else nullif(p_mensagem->>'tamanho', '')::bigint end,
      v_horas[v_i], jsonb_build_object('disparo_id', v_id, 'disparo_nome', btrim(p_nome)));
  end loop;
  return jsonb_build_object('id', v_id, 'total', v_n, 'inicio', v_horas[1], 'fim', v_horas[cardinality(v_horas)]);
end $$;
revoke all on function public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz) to authenticated;

-- a estimativa do ritmo (para a tela mostrar quando termina, antes de criar)
create or replace function public.atd_disparo_estimar(p_n int, p_ritmo jsonb, p_inicio timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare h timestamptz[];
begin
  if coalesce(public.org_papel('de300000-0000-4000-8000-000000000001'), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  h := private.atd_disparo_horarios(least(greatest(coalesce(p_n, 0), 0), 2000), p_inicio, p_ritmo);
  return jsonb_build_object('inicio', h[1], 'fim', h[cardinality(h)], 'dias', (select count(distinct (x at time zone 'America/Sao_Paulo')::date) from unnest(h) x));
end $$;
revoke all on function public.atd_disparo_estimar(int, jsonb, timestamptz) from public, anon;
grant execute on function public.atd_disparo_estimar(int, jsonb, timestamptz) to authenticated;

-- cancelar o que ainda não saiu
create or replace function public.atd_disparo_cancelar(p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_n int;
begin
  select organizacao_id into v_org from public.atd_disparos where id = p_id;
  if v_org is null or coalesce(public.org_papel(v_org), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where organizacao_id = v_org and metadados->>'disparo_id' = p_id::text and status = 'agendada';
  get diagnostics v_n = row_count;
  update public.atd_disparos set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid() where id = p_id and status = 'agendado';
  return v_n;
end $$;
revoke all on function public.atd_disparo_cancelar(uuid) from public, anon;
grant execute on function public.atd_disparo_cancelar(uuid) to authenticated;

-- a lista com o andamento de cada disparo (agendadas, enviadas, falhas, canceladas e quantos responderam)
create or replace function public.atd_disparos_lista()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'total', d.total, 'inicio', d.inicio_em, 'fim', d.fim_previsto,
      'criado_em', d.criado_em, 'canal', (select coalesce(nullif(btrim(c.nome_interno), ''), c.numero_conectado) from public.canais c where c.id = d.canal_id),
      'texto', left(coalesce(d.mensagem->>'texto', ''), 160), 'arquivo', d.mensagem->>'nome',
      'agendadas', x.agendadas, 'enviadas', x.enviadas, 'falhas', x.falhas, 'canceladas', x.canceladas, 'responderam', x.responderam) order by d.criado_em desc)
    from public.atd_disparos d
    cross join lateral (
      select count(*) filter (where a.status in ('agendada', 'processando')) agendadas, count(*) filter (where a.status = 'enviada') enviadas,
             count(*) filter (where a.status in ('falhou', 'expirada', 'bloqueada')) falhas, count(*) filter (where a.status = 'cancelada') canceladas,
             count(*) filter (where a.status = 'enviada' and exists (select 1 from public.mensagens m where m.conversa_id = a.conversa_id and m.direcao = 'entrada' and m.enviada_em > a.enviada_em)) responderam
        from public.mensagens_agendadas a where a.organizacao_id = v_org and a.metadados->>'disparo_id' = d.id::text) x
   where d.organizacao_id = v_org), '[]'::jsonb);
end $$;
revoke all on function public.atd_disparos_lista() from public, anon;
grant execute on function public.atd_disparos_lista() to authenticated;

-- DESFAZER (cancela o que não saiu): update public.mensagens_agendadas set status = 'cancelada' where metadados ? 'disparo_id' and status = 'agendada';
--   drop function if exists public.atd_disparos_lista(), public.atd_disparo_cancelar(uuid), public.atd_disparo_estimar(int, jsonb, timestamptz),
--   public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz), private.atd_disparo_horarios(int, timestamptz, jsonb),
--   public.atd_disparo_previa(jsonb), private.atd_disparo_alvos(uuid, jsonb); drop table if exists public.atd_disparos;

-- ===================== 20261126_126_lembrete_reuniao.sql =====================
-- 126 · LEMBRETE ANTES DA REUNIÃO (26/11, "igual" ao Follow-up de agendamentos do sistema que a Reviza usava antes). Ligado,
-- cada reunião MARCADA na Agenda (com cliente que tem conversa num número) ganha uma mensagem agendada para o cliente X tempo
-- antes (e, se quiser, um segundo aviso). Mudou o horário: o lembrete muda junto. Cancelou: o lembrete sai da fila.
-- CHEGA DESLIGADO: ligar é decisão do administrador da Reviza (a tela pede a confirmação). As mensagens aparecem em
-- Mensagens agendadas e saem pelo número da conversa. ADITIVA. Depende da 109 (agenda).

create table if not exists public.atd_lembrete_reuniao (
  organizacao_id  uuid primary key,
  ativo           boolean not null default false,
  antes_min       int not null default 120 check (antes_min between 15 and 10080),
  segundo_min     int check (segundo_min is null or segundo_min between 15 and 10080),
  texto           text not null default 'Oi {{nome}}! Passando para lembrar da nossa {{tipo}} {{quando}}. Se precisar mudar o horário, é só responder aqui.'
                  check (char_length(btrim(texto)) between 5 and 1000),
  ligado_por      uuid,
  ligado_em       timestamptz,
  atualizado_em   timestamptz not null default now()
);
alter table public.atd_lembrete_reuniao enable row level security;
drop policy if exists atd_lembrete_reuniao_admin on public.atd_lembrete_reuniao;
create policy atd_lembrete_reuniao_admin on public.atd_lembrete_reuniao for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_lembrete_reuniao from public, anon;
grant select, insert, update on public.atd_lembrete_reuniao to authenticated;
insert into public.atd_lembrete_reuniao (organizacao_id) values ('de300000-0000-4000-8000-000000000001') on conflict do nothing;

create or replace function private.atd_lembrete_texto(p_modelo text, p_nome text, p_tipo text, p_inicio timestamptz, p_quando_envio timestamptz)
returns text language plpgsql stable set search_path = '' as $$
declare v_dia date := (p_inicio at time zone 'America/Sao_Paulo')::date; v_env date := (p_quando_envio at time zone 'America/Sao_Paulo')::date;
        v_hora text := to_char(p_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'); v_quando text; v_primeiro text;
begin
  v_quando := case when v_dia = v_env then 'hoje às ' || v_hora
                   when v_dia = v_env + 1 then 'amanhã às ' || v_hora
                   else 'no dia ' || to_char(v_dia, 'DD/MM') || ' às ' || v_hora end;
  v_primeiro := initcap(split_part(btrim(coalesce(p_nome, '')), ' ', 1));
  return replace(replace(replace(replace(p_modelo, '{{nome}}', coalesce(nullif(v_primeiro, ''), 'tudo bem')), '{{quando}}', v_quando), '{{hora}}', v_hora),
                 '{{tipo}}', case p_tipo when 'ligacao' then 'ligação' when 'videochamada' then 'videochamada' when 'retorno' then 'conversa' else 'reunião' end);
end $$;
revoke all on function private.atd_lembrete_texto(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

-- (re)agenda os lembretes de UMA reunião (tira os que estavam na fila e põe os novos, se couber)
create or replace function private.atd_lembrete_reagendar(p_reuniao uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.atd_reunioes; c public.atd_lembrete_reuniao; v_conv record; v_canal public.canais; v_quando timestamptz; v_n int := 0; v_min int; v_nome text;
begin
  select * into r from public.atd_reunioes where id = p_reuniao;
  if r.id is null then return 0; end if;
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now()
   where organizacao_id = r.organizacao_id and metadados->>'lembrete_reuniao_id' = r.id::text and status = 'agendada';
  select * into c from public.atd_lembrete_reuniao where organizacao_id = r.organizacao_id;
  if c.organizacao_id is null or not c.ativo or r.status <> 'marcada' or r.contato_id is null then return 0; end if;
  -- a conversa do cliente que já tem número (a da reunião, ou a ativa dele)
  select cv.id, cv.canal_id into v_conv from public.conversas cv
   where cv.organizacao_id = r.organizacao_id and cv.contato_id = r.contato_id and cv.canal_id is not null and cv.status <> 'fechada'
   order by (cv.id = r.conversa_id) desc, cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last limit 1;
  if v_conv.id is null then return 0; end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;
  if v_canal.id is null or v_canal.ativo = false or v_canal.status_integracao::text <> 'conectado' or v_canal.envio_restrito then return 0; end if;
  select nome into v_nome from public.contatos where id = r.contato_id;
  foreach v_min in array array_remove(array[c.antes_min, c.segundo_min], null) loop
    v_quando := r.inicio - make_interval(mins => v_min);
    continue when v_quando < now() + interval '2 minutes';
    insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, tipo, texto, executar_em, metadados)
    values (r.organizacao_id, v_conv.id, r.contato_id, v_canal.id, v_canal.nome_interno, v_canal.numero_conectado, 'texto',
            private.atd_lembrete_texto(c.texto, v_nome, r.tipo, r.inicio, v_quando), v_quando,
            jsonb_build_object('lembrete_reuniao_id', r.id, 'lembrete_antes_min', v_min));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function private.atd_lembrete_reagendar(uuid) from public, anon, authenticated;

create or replace function private.atd_lembrete_da_reuniao() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'UPDATE' and new.inicio is not distinct from old.inicio and new.status is not distinct from old.status and new.contato_id is not distinct from old.contato_id then return null; end if;
    perform private.atd_lembrete_reagendar(new.id);
  exception when others then raise warning 'atd_lembrete_da_reuniao: %', sqlerrm;   -- o lembrete nunca derruba a reunião
  end;
  return null;
end $$;
drop trigger if exists atd_lembrete_da_reuniao on public.atd_reunioes;
create trigger atd_lembrete_da_reuniao after insert or update of inicio, status, contato_id on public.atd_reunioes
  for each row when (current_setting('atd.importando', true) is distinct from 'guimoo') execute function private.atd_lembrete_da_reuniao();

-- salvar a configuração; ligar/desligar refaz (ou tira) os lembretes das reuniões que ainda vão acontecer
create or replace function public.atd_lembrete_salvar(p_ativo boolean, p_antes_min int, p_segundo_min int, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'de300000-0000-4000-8000-000000000001'; r record; v_n int := 0; v_reu int := 0;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  insert into public.atd_lembrete_reuniao (organizacao_id, ativo, antes_min, segundo_min, texto, ligado_por, ligado_em, atualizado_em)
  values (v_org, coalesce(p_ativo, false), coalesce(p_antes_min, 120), p_segundo_min, coalesce(nullif(btrim(p_texto), ''), 'Oi {{nome}}! Passando para lembrar da nossa {{tipo}} {{quando}}.'),
          case when p_ativo then auth.uid() end, case when p_ativo then now() end, now())
  on conflict (organizacao_id) do update set ativo = excluded.ativo, antes_min = excluded.antes_min, segundo_min = excluded.segundo_min, texto = excluded.texto,
    ligado_por = case when excluded.ativo and not public.atd_lembrete_reuniao.ativo then auth.uid() else public.atd_lembrete_reuniao.ligado_por end,
    ligado_em = case when excluded.ativo and not public.atd_lembrete_reuniao.ativo then now() else public.atd_lembrete_reuniao.ligado_em end, atualizado_em = now();
  for r in select id from public.atd_reunioes where organizacao_id = v_org and inicio > now() and status = 'marcada' loop
    v_reu := v_reu + 1;
    v_n := v_n + private.atd_lembrete_reagendar(r.id);
  end loop;
  return jsonb_build_object('reunioes', v_reu, 'lembretes', v_n);
end $$;
revoke all on function public.atd_lembrete_salvar(boolean, int, int, text) from public, anon;
grant execute on function public.atd_lembrete_salvar(boolean, int, int, text) to authenticated;

-- DESFAZER: update public.mensagens_agendadas set status = 'cancelada' where metadados ? 'lembrete_reuniao_id' and status = 'agendada';
--   drop trigger if exists atd_lembrete_da_reuniao on public.atd_reunioes; drop function if exists public.atd_lembrete_salvar(boolean, int, int, text),
--   private.atd_lembrete_da_reuniao(), private.atd_lembrete_reagendar(uuid), private.atd_lembrete_texto(text, text, text, timestamptz, timestamptz);
--   drop table if exists public.atd_lembrete_reuniao;
