-- 94 — RECEBER DE OUTROS SISTEMAS (webhook de entrada), dono 23/11: "a URA faz uma ligação pro cliente,
-- você tem interesse? Se a pessoa diz que sim, a URA manda uma mensagem para o cliente… eles falaram que
-- tem como integrar com o nosso via um webhook, para quando for enviada a mensagem chegue no nosso sistema."
-- Cada ENTRADA é um endereço com uma chave secreta (Configurações › Integrações › Receber de outros sistemas).
-- O sistema de fora chama o endereço com o telefone, o nome e a mensagem; aqui isso vira (ou reaproveita) o
-- contato, a conversa no número de WhatsApp do Atendimento escolhido e o lead em LEAD NOVO no Kanban.
-- Quem chama é a função entrada-webhook (servidor); a tela só cria, liga/desliga e mostra o que chegou.
-- ADITIVA. Depende da 93 (Atendimento). DESFAZER no fim.

create table if not exists public.atd_entradas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null default 'a1fa0000-0000-4000-8000-000000000001' references public.organizacoes(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 40),
  chave text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  canal_id uuid references public.canais(id) on delete set null,
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
  resultado text not null check (resultado in ('ok', 'teste', 'sem_telefone', 'desligada', 'sem_numero', 'erro')),
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
create or replace function private.atd_entrada_campo(p jsonb, p_nomes text[])
returns text language plpgsql immutable set search_path = '' as $$
declare n text; g text; v text;
begin
  foreach n in array p_nomes loop
    v := nullif(btrim(p ->> n), '');
    if v is not null then return v; end if;
  end loop;
  foreach g in array array['cliente', 'contato', 'contact', 'customer', 'data', 'lead', 'dados'] loop
    if jsonb_typeof(p -> g) = 'object' then
      foreach n in array p_nomes loop
        v := nullif(btrim(p -> g ->> n), '');
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
  r jsonb; v_contato uuid; v_conversa uuid;
begin
  select * into e from public.atd_entradas where chave = btrim(coalesce(p_chave, ''));
  if not found then return jsonb_build_object('ok', false, 'erro', 'chave_invalida'); end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(p_payload) <> 'object' then p_payload := jsonb_build_object('valor', p_payload); end if;
  v_tel := private.atd_entrada_campo(p_payload, array['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'number', 'fone', 'mobile', 'tel', 'destino', 'to', 'cliente_telefone', 'phone_number']);
  v_nome := private.atd_entrada_campo(p_payload, array['nome', 'name', 'cliente_nome', 'nome_cliente', 'client_name', 'full_name', 'contato', 'cliente']);
  v_msg := private.atd_entrada_campo(p_payload, array['mensagem', 'message', 'texto', 'text', 'body', 'conteudo', 'content', 'msg']);
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
  if p_teste then
    insert into public.atd_entrada_eventos (entrada_id, resultado, telefone, nome, mensagem, detalhe, payload)
    values (e.id, 'teste', v_dig, v_nome, left(v_msg, 2000), 'teste: lido, nada foi criado', p_payload);
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
  -- a etiqueta com o nome da entrada (ex.: URA) para filtrar depois
  update public.contatos set etiquetas = array_append(etiquetas, e.nome) where id = v_contato and not (e.nome = any (etiquetas));
  -- na conversa: o aviso de onde veio e a mensagem que o outro sistema mandou ao cliente
  -- (clock_timestamp: o aviso fica antes da mensagem, mesmo gravados na mesma transação)
  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, status, origem, metadados, enviada_em, criado_em)
  values (e.organizacao_id, v_conversa, 'saida', 'sistema', 'Chegou pela integração ' || e.nome || '.', 'enviada', 'integracao',
          jsonb_build_object('integracao', e.nome, 'entrada_id', e.id), clock_timestamp(), clock_timestamp());
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
          case when (r ->> 'contato_criado')::boolean then 'cliente novo' else 'cliente que já existia' end, p_payload);
  update public.atd_entradas set ultimo_evento_em = now(), total_eventos = total_eventos + 1 where id = e.id;
  return jsonb_build_object('ok', true, 'conversa_id', v_conversa, 'contato_criado', (r ->> 'contato_criado')::boolean);
end $$;
revoke all on function public.atd_entrada_receber(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.atd_entrada_receber(text, jsonb, boolean) to service_role;
revoke all on function private.atd_entrada_campo(jsonb, text[]) from public, anon, authenticated;

-- DESFAZER:
--   drop function if exists public.atd_entrada_receber(text, jsonb, boolean), private.atd_entrada_campo(jsonb, text[]), private.atd_entradas_registra();
--   drop table if exists public.atd_entrada_eventos, public.atd_entradas;
