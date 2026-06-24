-- ===== RLS multiempresa =====

-- 1) Limpa apenas as politicas das TABELAS DA ATENVO (nao mexe em nada fora do escopo)
do $$
declare t text; r record;
begin
  foreach t in array array[
    'usuarios','canais','contatos','conversas','mensagens','anexos_mensagem',
    'fontes_aquisicao','contato_identidades','oportunidades','cobrancas',
    'cobranca_pagamentos','cobranca_eventos','configuracoes','script_categorias',
    'scripts','script_anexos','integracoes','integracao_logs','audit_log',
    'organizacoes','organizacao_usuarios','planos','organizacao_limites',
    'assinaturas','assinatura_itens','assinatura_eventos','faturas',
    'pagamentos','pagamento_eventos'
  ] loop
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- 2) Remove helpers globais antigos (da 0010)
drop function if exists public.papel_atual();
drop function if exists public.is_admin();
drop function if exists public.is_sup_admin();
drop function if exists public.is_equipe();

-- 3) Helpers org-aware (security definer, search_path fixo)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select platform_admin from public.usuarios where id = auth.uid()), false);
$$;
create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizacao_usuarios
                 where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo');
$$;
create or replace function public.papel_na_org(org uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select papel from public.organizacao_usuarios
   where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo';
$$;
create or replace function public.org_operacional(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizacoes o
                 where o.id = org
                   and o.status not in ('suspensa','cancelada')
                   and o.assinatura_status in ('ativa','isenta','em_atraso','teste'));
$$;
create or replace function public.compartilha_org(alvo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizacao_usuarios a
                 join public.organizacao_usuarios b on a.organizacao_id = b.organizacao_id
                 where a.usuario_id = auth.uid() and a.status='ativo'
                   and b.usuario_id = alvo and b.status='ativo');
$$;

-- 4) RLS nas tabelas novas
alter table public.organizacoes        enable row level security;
alter table public.organizacao_usuarios enable row level security;
alter table public.planos              enable row level security;
alter table public.organizacao_limites enable row level security;
alter table public.assinaturas         enable row level security;
alter table public.assinatura_itens    enable row level security;
alter table public.assinatura_eventos  enable row level security;
alter table public.faturas             enable row level security;
alter table public.pagamentos          enable row level security;
alter table public.pagamento_eventos   enable row level security;

-- 5) Politicas

-- 5a) Tabelas operacionais: membro + organizacao operante; delete = admin/supervisor
do $$
declare t text;
begin
  foreach t in array array[
    'canais','fontes_aquisicao','contatos','contato_identidades','conversas','mensagens',
    'anexos_mensagem','oportunidades','scripts','script_categorias','script_anexos'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id)))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id)))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id))) with check (public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id)))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_platform_admin() or (public.papel_na_org(organizacao_id) in (''admin'',''supervisor'') and public.org_operacional(organizacao_id)))', t||'_del', t);
  end loop;
end $$;

-- 5b) Cobrancas (carteira do cliente): admin/supervisor da org
do $$
declare t text;
begin
  foreach t in array array['cobrancas','cobranca_pagamentos','cobranca_eventos'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_platform_admin() or (public.papel_na_org(organizacao_id) in (''admin'',''supervisor'') and public.org_operacional(organizacao_id))) with check (public.is_platform_admin() or (public.papel_na_org(organizacao_id) in (''admin'',''supervisor'') and public.org_operacional(organizacao_id)))', t||'_all', t);
  end loop;
end $$;

-- 5c) configuracoes
create policy config_sel on public.configuracoes for select to authenticated using (public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id)));
create policy config_mut on public.configuracoes for all    to authenticated using (public.is_platform_admin() or (public.papel_na_org(organizacao_id)='admin' and public.org_operacional(organizacao_id))) with check (public.is_platform_admin() or (public.papel_na_org(organizacao_id)='admin' and public.org_operacional(organizacao_id)));

-- 5d) Integracoes (so admin da org)
create policy integr_all on public.integracoes for all to authenticated using (public.is_platform_admin() or (public.papel_na_org(organizacao_id)='admin' and public.org_operacional(organizacao_id))) with check (public.is_platform_admin() or (public.papel_na_org(organizacao_id)='admin' and public.org_operacional(organizacao_id)));
create policy intlog_sel on public.integracao_logs for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id) in ('admin','supervisor'));
create policy intlog_ins on public.integracao_logs for insert to authenticated with check (public.is_platform_admin() or public.is_member(organizacao_id));

-- 5e) audit_log (imutavel: sem update/delete)
create policy audit_sel on public.audit_log for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id) in ('admin','supervisor'));
create policy audit_ins on public.audit_log for insert to authenticated with check (public.is_platform_admin() or public.is_member(organizacao_id));

-- 5f) organizacoes
create policy org_sel on public.organizacoes for select to authenticated using (public.is_platform_admin() or public.is_member(id));
create policy org_upd on public.organizacoes for update to authenticated using (public.is_platform_admin() or public.papel_na_org(id)='admin') with check (public.is_platform_admin() or public.papel_na_org(id)='admin');
create policy org_ins on public.organizacoes for insert to authenticated with check (public.is_platform_admin());
create policy org_del on public.organizacoes for delete to authenticated using (public.is_platform_admin());

-- 5g) organizacao_usuarios
create policy ou_sel on public.organizacao_usuarios for select to authenticated using (public.is_platform_admin() or public.is_member(organizacao_id));
create policy ou_ins on public.organizacao_usuarios for insert to authenticated with check (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy ou_upd on public.organizacao_usuarios for update to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin') with check (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy ou_del on public.organizacao_usuarios for delete to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');

-- 5h) usuarios (global: self + co-membros + plataforma)
create policy usuarios_sel on public.usuarios for select to authenticated using (public.is_platform_admin() or id = auth.uid() or public.compartilha_org(id));
create policy usuarios_upd on public.usuarios for update to authenticated using (public.is_platform_admin() or id = auth.uid()) with check (public.is_platform_admin() or id = auth.uid());
create policy usuarios_ins on public.usuarios for insert to authenticated with check (public.is_platform_admin() or id = auth.uid());
create policy usuarios_del on public.usuarios for delete to authenticated using (public.is_platform_admin());

-- 5i) planos (catalogo global): leitura autenticada; escrita plataforma
create policy planos_sel on public.planos for select to authenticated using (true);
create policy planos_mut on public.planos for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 5j) Faturamento (leitura: admin da org; ESCRITA: plataforma/servico — frontend nao altera)
create policy lim_sel on public.organizacao_limites for select to authenticated using (public.is_platform_admin() or public.is_member(organizacao_id));
create policy lim_mut on public.organizacao_limites for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy ass_sel on public.assinaturas for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy ass_mut on public.assinaturas for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy assit_sel on public.assinatura_itens for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy assit_mut on public.assinatura_itens for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy fat_sel on public.faturas for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy fat_mut on public.faturas for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy pag_sel on public.pagamentos for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy pag_mut on public.pagamentos for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy asse_sel on public.assinatura_eventos for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy asse_ins on public.assinatura_eventos for insert to authenticated with check (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');

create policy page_sel on public.pagamento_eventos for select to authenticated using (public.is_platform_admin() or public.papel_na_org(organizacao_id)='admin');
create policy page_ins on public.pagamento_eventos for insert to authenticated with check (public.is_platform_admin());
