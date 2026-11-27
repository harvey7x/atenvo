-- 122 · AS CONEXÕES DE LÁ → OS NÚMEROS DAQUI (26/11, dono: "para quando eles chegarem já estiver pronto, eles só precisem
-- conectar algumas coisas"). A lista do WhatsApp daqui mostra só conversa que tem número (canal). As conversas que vieram
-- do sistema anterior (119) chegam sem número; quando a Reviza conectar os números, o administrador escolhe, UMA vez, em
-- Configurações › Importação, qual número fica com as conversas de cada conexão de lá ("WhatsApp 4", "WhatsApp 6",
-- "Atendimento Reviza"…; quem não tinha card fica em "Sem conexão lá"). Aí elas aparecem na lista, já no número certo para
-- responder; as que vierem depois (a 119 rodando de novo) já entram no número escolhido. Nada é enviado. ADITIVA.

create table if not exists private.atd_guimoo_conexao_canal (
  conexao    text primary key,                 -- o nome da conexão lá ('' = sem conexão lá)
  canal_id   uuid not null,
  ligado_em  timestamptz not null default now(),
  ligado_por uuid
);
revoke all on private.atd_guimoo_conexao_canal from public, anon, authenticated;

-- o número de HISTÓRICO (128): onde as conversas de lá ficam, visíveis no WhatsApp e só para leitura, até a escolha do número
create or replace function private.atd_guimoo_canal_historico()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.canais where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and identificador = 'historico-sistema-anterior' limit 1
$$;
revoke all on function private.atd_guimoo_canal_historico() from public, anon, authenticated;

-- a conexão de lá de cada cliente importado (a do card dele; sem card = '')
create or replace function private.atd_guimoo_conexao_do_contato(p_contato uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(btrim(k.conexao), '') from private.atd_guimoo_kanban k
                    where k.contato_id = p_contato and nullif(btrim(k.conexao), '') is not null
                    order by k.ultima_msg_em desc nulls last limit 1), '')
$$;
revoke all on function private.atd_guimoo_conexao_do_contato(uuid) from public, anon, authenticated;

-- o painel: cada conexão de lá, quantas conversas, quantas abertas, e para que número foi; e os números daqui
create or replace function public.atd_guimoo_conexoes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'conexoes', coalesce((
      select jsonb_agg(jsonb_build_object('conexao', x.conexao, 'conversas', x.conversas, 'abertas', x.abertas, 'sem_numero', x.sem_numero,
                                          'canal_id', case when m.canal_id is distinct from private.atd_guimoo_canal_historico() then m.canal_id end,
                                          'historico', m.canal_id is not null and m.canal_id = private.atd_guimoo_canal_historico(),
                                          'canal_nome', (select coalesce(nullif(btrim(c.nome_interno), ''), c.numero_conectado) from public.canais c where c.id = m.canal_id))
                       order by x.conexao = '', x.conversas desc)
        from (select private.atd_guimoo_conexao_do_contato(g.contato_id) as conexao, count(distinct g.conversa_id) as conversas,
                     count(distinct g.conversa_id) filter (where cv.arquivada_em is null) as abertas,
                     count(distinct g.conversa_id) filter (where cv.canal_id is null or cv.canal_id = private.atd_guimoo_canal_historico()) as sem_numero
                from private.atd_guimoo_contatos g join public.conversas cv on cv.id = g.conversa_id
               where g.conversa_id is not null group by 1) x
        left join private.atd_guimoo_conexao_canal m on m.conexao = x.conexao), '[]'::jsonb),
    'numeros', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(nullif(btrim(c.nome_interno), ''), c.numero_conectado, 'Número'), 'numero', c.numero_conectado, 'ativo', c.ativo) order by c.nome_interno)
        from public.canais c where c.organizacao_id = v_org and c.tipo = 'whatsapp' and c.status_integracao::text not in ('removido', 'arquivado')), '[]'::jsonb));
end $$;
revoke all on function public.atd_guimoo_conexoes() from public, anon;
grant execute on function public.atd_guimoo_conexoes() to authenticated, service_role;

-- passar as conversas de uma conexão de lá para um número daqui (só as que ainda estão sem número ou no número escolhido
-- antes para essa conexão: o que a equipe já trocou fica como está)
create or replace function public.atd_guimoo_ligar_conexao(p_conexao text, p_canal uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001'; v_antes uuid; v_n int;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if p_canal is null or not exists (select 1 from public.canais c where c.id = p_canal and c.organizacao_id = v_org and c.tipo = 'whatsapp'
                                       and c.status_integracao::text not in ('removido', 'arquivado')) then
    raise exception 'numero_invalido';
  end if;
  select canal_id into v_antes from private.atd_guimoo_conexao_canal where conexao = coalesce(p_conexao, '');
  insert into private.atd_guimoo_conexao_canal (conexao, canal_id, ligado_por) values (coalesce(p_conexao, ''), p_canal, auth.uid())
  on conflict (conexao) do update set canal_id = excluded.canal_id, ligado_em = now(), ligado_por = excluded.ligado_por;
  update public.conversas cv
     set canal_id = p_canal, canal_origem_id = coalesce(case when cv.canal_origem_id is not distinct from v_antes then null else cv.canal_origem_id end, p_canal),
         ultimo_canal_id = coalesce(case when cv.ultimo_canal_id is not distinct from v_antes then null else cv.ultimo_canal_id end, p_canal)
    from private.atd_guimoo_contatos g
   where g.conversa_id = cv.id and cv.organizacao_id = v_org
     and private.atd_guimoo_conexao_do_contato(g.contato_id) = coalesce(p_conexao, '')
     and (cv.canal_id is null or cv.canal_id is not distinct from v_antes);
  get diagnostics v_n = row_count;
  return jsonb_build_object('conversas', v_n);
end $$;
revoke all on function public.atd_guimoo_ligar_conexao(text, uuid) from public, anon;
grant execute on function public.atd_guimoo_ligar_conexao(text, uuid) to authenticated, service_role;

-- DESFAZER: update public.conversas set canal_id = null where id in (select conversa_id from private.atd_guimoo_contatos) and canal_id in (select canal_id from private.atd_guimoo_conexao_canal);
--   drop function if exists public.atd_guimoo_ligar_conexao(text, uuid), public.atd_guimoo_conexoes(), private.atd_guimoo_conexao_do_contato(uuid);
--   drop table if exists private.atd_guimoo_conexao_canal;
