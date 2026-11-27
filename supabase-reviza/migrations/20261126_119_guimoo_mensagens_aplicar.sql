-- 119 · AS CONVERSAS DO SISTEMA ANTERIOR NO ATENDIMENTO (26/11, dono: "as mensagens também, tudo… para quando eles chegarem
-- já estiver pronto, eles só precisem conectar algumas coisas"). Lê a área de chegada da 118 e, para cada contato de lá:
--   • acha o cliente aqui (DDD + 8 últimos do telefone; ou o card sem telefone da 117) ou cria (origem 'guimoo');
--   • dá ao cliente a identidade de WhatsApp (é por ela que o envio e as mensagens novas acham o cliente);
--   • cria UMA conversa (ou usa a que já existe) e põe nela as mensagens, na hora de lá. Sem número (canal) ainda: quando a
--     Reviza conectar os números, a primeira mensagem nova do cliente cai NESTA conversa (a regra do WhatsApp daqui é
--     "uma conversa ativa por cliente"; a arquivada é reaberta);
--   • o que teve mensagem nos últimos 15 dias fica aberto na lista; o resto já entra arquivado (some da lista, mas a busca
--     acha e a conversa volta sozinha quando o cliente escrever);
--   • o card do cliente no Kanban passa a apontar para a conversa ("abrir conversa").
-- Foto, áudio, documento: lá a API só diz o tipo, não entrega o arquivo — a mensagem vira o texto "[Áudio]", "[Foto]"…
-- (com a legenda, se tinha) e guarda o tipo de verdade em metadados.tipo_original.
-- NADA dispara: os gatilhos ficam parados durante a importação (Iris, automações, SLA, avisos, lead quente), nada é enviado,
-- nenhuma conversa fica "não lida". Pode rodar de novo (só entra o que falta: id_externo 'guimoo:<contato>:<mensagem>').
-- Roda em lotes pelo ~/reviza-sist/tools/guimoo_kanban.py (msgs-testar / msgs-aplicar), que para os gatilhos antes. ADITIVA.

alter table private.atd_guimoo_contatos add column if not exists contato_id uuid;
alter table private.atd_guimoo_contatos add column if not exists conversa_id uuid;
alter table private.atd_guimoo_contatos add column if not exists aplicado_em timestamptz;

create or replace function private.atd_guimoo_aplicar_mensagens(p_limite int default 1500)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_corte timestamptz := now() - interval '15 days';
  r private.atd_guimoo_contatos%rowtype;
  v_ct uuid; v_conv uuid; v_canal uuid; v_k text; v_fone text; v_ult timestamptz; v_ult_ent timestamptz; v_pri timestamptz; v_n int;
  n_cont int := 0; n_ct int := 0; n_id int := 0; n_conv int := 0; n_abertas int := 0; n_msg int := 0; n_cards int := 0;
begin
  -- os gatilhos PRECISAM estar parados nesta transação (nada de Iris, automação, SLA, aviso…): quem chama faz
  -- "set local session_replication_role = replica" antes (dentro da rotina o Postgres não deixa). Sem isso, não roda.
  if current_setting('session_replication_role') <> 'replica' then raise exception 'rode_com_os_gatilhos_parados'; end if;
  perform set_config('atd.importando', 'guimoo', true);
  create temp table if not exists _gm_mapa (k text primary key, contato_id uuid not null) on commit drop;
  truncate pg_temp._gm_mapa;
  insert into pg_temp._gm_mapa
  select distinct on (k) k, id from (select private.atd_chave_fone(telefone) k, id, criado_em from public.contatos where organizacao_id = v_org and mesclado_para is null) x
   where k is not null order by k, criado_em;

  for r in select * from private.atd_guimoo_contatos g
            where g.buscado_em is not null and (g.aplicado_em is null or g.aplicado_em < g.buscado_em)
            order by g.guimoo_id limit greatest(coalesce(p_limite, 1500), 1) loop
    n_cont := n_cont + 1;
    v_fone := case when r.telefone ~ '^55[0-9]{10,11}$' then r.telefone when r.telefone ~ '^[0-9]{10,11}$' then '55' || r.telefone end;
    v_k := private.atd_chave_fone(v_fone);
    -- 1. o cliente
    v_ct := r.contato_id;
    if v_ct is not null and not exists (select 1 from public.contatos where id = v_ct) then v_ct := null; end if;
    if v_ct is null and v_k is not null then select contato_id into v_ct from pg_temp._gm_mapa where k = v_k; end if;
    if v_ct is null and r.telefone is not null then
      select contato_id into v_ct from private.atd_guimoo_kanban where chave = 'id:' || r.telefone and contato_id is not null limit 1;
    end if;
    if v_ct is null then
      insert into public.contatos (organizacao_id, nome, telefone, email, origem, etiquetas, criado_em)
      values (v_org, coalesce(nullif(btrim(r.nome), ''), v_fone, 'Sem nome'), v_fone, nullif(btrim(coalesce(r.email, '')), ''), 'guimoo', coalesce(r.etiquetas, '{}'), now())
      returning id into v_ct;
      n_ct := n_ct + 1;
      if v_k is not null then insert into pg_temp._gm_mapa values (v_k, v_ct) on conflict do nothing; end if;
    end if;
    -- 2. a identidade de WhatsApp (só se o cliente ainda não tem nenhuma)
    if v_fone is not null and not exists (select 1 from public.contato_identidades where contato_id = v_ct and tipo = 'whatsapp') then
      insert into public.contato_identidades (contato_id, organizacao_id, tipo, provedor, valor, valor_normalizado, principal, metadados)
      values (v_ct, v_org, 'whatsapp', 'evolution', v_fone, v_fone, true, jsonb_build_object('origem', 'importacao_guimoo'))
      on conflict do nothing;
      get diagnostics v_n = row_count; n_id := n_id + v_n;
    end if;
    -- 3. a conversa e as mensagens
    v_conv := r.conversa_id;
    if r.msgs_baixadas > 0 then
      select max(em), max(em) filter (where de = 'contato'), min(em) into v_ult, v_ult_ent, v_pri from private.atd_guimoo_msgs where contato_guimoo_id = r.guimoo_id;
      if v_conv is not null and not exists (select 1 from public.conversas where id = v_conv) then v_conv := null; end if;
      if v_conv is null then
        select id into v_conv from public.conversas
         where organizacao_id = v_org and contato_id = v_ct and status <> 'fechada'
         order by arquivada_em asc nulls first, ultima_interacao_em desc nulls last limit 1;
      end if;
      if v_conv is null then
        -- o número daqui que o administrador escolheu para a conexão de lá deste cliente (122); sem escolha, sem número
        v_canal := (select m.canal_id from private.atd_guimoo_conexao_canal m where m.conexao = private.atd_guimoo_conexao_do_contato(v_ct));
        insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, ultimo_canal_id, status, nao_lidas, ultima_interacao_em, ultima_entrada_em, ultima_lida_em, criado_em, arquivada_em)
        values (v_org, v_ct, v_canal, v_canal, v_canal, 'aberta', 0, v_ult, v_ult_ent, now(), coalesce(v_pri, now()), case when v_ult >= v_corte then null else now() end)
        returning id into v_conv;
        n_conv := n_conv + 1;
        if v_ult >= v_corte then n_abertas := n_abertas + 1; end if;
      end if;
      insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, enviada_em, criado_em, recebida_em, id_externo, status, origem, metadados)
      select v_org, v_conv,
             (case when m.de = 'contato' then 'entrada' else 'saida' end)::public.mensagem_direcao,
             'texto'::public.mensagem_tipo,
             case when m.tipo in ('audio', 'imagem', 'video', 'documento', 'figurinha', 'sticker', 'localizacao', 'contato')
                  then '[' || case m.tipo when 'audio' then 'Áudio' when 'imagem' then 'Foto' when 'video' then 'Vídeo' when 'documento' then 'Documento'
                                          when 'localizacao' then 'Localização' when 'contato' then 'Contato' else 'Figurinha' end || ']'
                       || coalesce(' ' || nullif(btrim(m.texto), ''), '')
                  else coalesce(nullif(btrim(m.texto), ''), case when m.apagada then '[Mensagem apagada]' else '[Mensagem sem texto]' end) end,
             m.em, m.em, case when m.de = 'contato' then m.em end,
             'guimoo:' || m.contato_guimoo_id || ':' || m.guimoo_id,
             case when m.de = 'contato' then 'entregue'::public.mensagem_status   -- como o webhook grava as que chegam
                  else (case m.status when 'read' then 'lida' when 'played' then 'lida' when 'delivered' then 'entregue' when 'failed' then 'falhou' when 'error' then 'falhou' else 'enviada' end)::public.mensagem_status end,
             'importacao',
             jsonb_strip_nulls(jsonb_build_object('importado_de', 'guimoo', 'guimoo_id', m.guimoo_id, 'tipo_original', m.tipo,
               'apagada', case when m.apagada then true end, 'editada', case when m.editada then true end,
               'midia_indisponivel', case when m.tipo in ('audio', 'imagem', 'video', 'documento', 'figurinha', 'sticker') then true end))
        from private.atd_guimoo_msgs m
       where m.contato_guimoo_id = r.guimoo_id and m.em is not null
      on conflict do nothing;
      get diagnostics v_n = row_count; n_msg := n_msg + v_n;
      update public.conversas
         set ultima_interacao_em = greatest(coalesce(ultima_interacao_em, v_ult), v_ult),
             ultima_entrada_em = case when v_ult_ent is null then ultima_entrada_em else greatest(coalesce(ultima_entrada_em, v_ult_ent), v_ult_ent) end
       where id = v_conv;
      -- 4. o card do cliente abre esta conversa
      update public.oportunidades set conversa_origem_id = v_conv
       where organizacao_id = v_org and contato_id = v_ct and conversa_origem_id is null;
      get diagnostics v_n = row_count; n_cards := n_cards + v_n;
    end if;
    update private.atd_guimoo_contatos set contato_id = v_ct, conversa_id = v_conv, aplicado_em = now() where guimoo_id = r.guimoo_id;
  end loop;
  return jsonb_build_object('contatos_lidos', n_cont, 'clientes_novos', n_ct, 'identidades', n_id, 'conversas_novas', n_conv,
    'conversas_abertas', n_abertas, 'mensagens', n_msg, 'cards_ligados', n_cards,
    'falta_aplicar', (select count(*) from private.atd_guimoo_contatos where buscado_em is not null and (aplicado_em is null or aplicado_em < buscado_em)),
    'falta_baixar', (select count(*) from private.atd_guimoo_contatos where buscado_em is null));
end $$;
revoke all on function private.atd_guimoo_aplicar_mensagens(int) from public, anon, authenticated;

-- o painel de Configurações › Importação: quanto já veio de lá e quanto já virou conversa aqui
create or replace function public.atd_guimoo_mensagens_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'contatos_la', (select count(*) from private.atd_guimoo_contatos),
    'baixados', (select count(*) from private.atd_guimoo_contatos where buscado_em is not null),
    'mensagens_baixadas', (select coalesce(sum(msgs_baixadas), 0) from private.atd_guimoo_contatos),
    'aplicados', (select count(*) from private.atd_guimoo_contatos where aplicado_em is not null),
    'conversas', (select count(distinct conversa_id) from private.atd_guimoo_contatos where conversa_id is not null),
    'mensagens', (select count(*) from public.mensagens m where m.organizacao_id = v_org and m.origem = 'importacao'),
    'ultima_baixa', (select max(buscado_em) from private.atd_guimoo_contatos));
end $$;
revoke all on function public.atd_guimoo_mensagens_estado() from public, anon;
grant execute on function public.atd_guimoo_mensagens_estado() to authenticated, service_role;

-- DESFAZER (antes de usar o sistema): delete from public.mensagens where origem = 'importacao' and id_externo like 'guimoo:%';
--   delete from public.conversas c where c.id in (select conversa_id from private.atd_guimoo_contatos) and not exists (select 1 from public.mensagens m where m.conversa_id = c.id);
--   delete from public.contato_identidades where metadados->>'origem' = 'importacao_guimoo';
--   update private.atd_guimoo_contatos set aplicado_em = null, conversa_id = null;
--   drop function if exists public.atd_guimoo_mensagens_estado(), private.atd_guimoo_aplicar_mensagens(int);
