-- RLS por papel. Acesso nao e mais "qualquer autenticado".

-- Helpers (security definer: leem usuarios sem recursao de RLS)
create or replace function public.papel_atual()
returns public.user_role language sql stable security definer set search_path = public as $$
  select papel from public.usuarios where id = auth.uid();
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() = 'admin', false);
$$;
create or replace function public.is_sup_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() in ('admin','supervisor'), false);
$$;
create or replace function public.is_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_atual() in ('admin','supervisor','atendente'), false);
$$;

-- Derruba as politicas abertas da fundacao
drop policy if exists "auth_full" on public.usuarios;
drop policy if exists "auth_full" on public.canais;
drop policy if exists "auth_full" on public.contatos;
drop policy if exists "auth_full" on public.conversas;
drop policy if exists "auth_full" on public.mensagens;

-- Liga RLS nas tabelas novas
alter table public.anexos_mensagem     enable row level security;
alter table public.fontes_aquisicao    enable row level security;
alter table public.contato_identidades enable row level security;
alter table public.oportunidades       enable row level security;
alter table public.cobrancas           enable row level security;
alter table public.cobranca_pagamentos enable row level security;
alter table public.cobranca_eventos    enable row level security;
alter table public.configuracoes       enable row level security;
alter table public.script_categorias   enable row level security;
alter table public.scripts             enable row level security;
alter table public.script_anexos       enable row level security;
alter table public.integracoes         enable row level security;
alter table public.integracao_logs     enable row level security;
alter table public.audit_log           enable row level security;

-- USUARIOS: equipe ve; admin gerencia; cada um edita o proprio perfil
create policy usuarios_sel on public.usuarios for select to authenticated using (public.is_equipe());
create policy usuarios_ins on public.usuarios for insert to authenticated with check (public.is_admin());
create policy usuarios_upd on public.usuarios for update to authenticated using (public.is_admin() or id = auth.uid()) with check (public.is_admin() or id = auth.uid());
create policy usuarios_del on public.usuarios for delete to authenticated using (public.is_admin());

-- Tabelas operacionais: equipe inteira (sel/ins/upd); delete apenas supervisor/admin
do $$
declare t text;
begin
  foreach t in array array[
    'contatos','contato_identidades','canais','fontes_aquisicao',
    'conversas','mensagens','anexos_mensagem','oportunidades',
    'scripts','script_categorias','script_anexos'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_equipe())', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_equipe())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_equipe()) with check (public.is_equipe())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_sup_admin())', t||'_del', t);
  end loop;
end $$;

-- COBRANCAS e correlatas: somente supervisor/admin (atendente nao acessa)
do $$
declare t text;
begin
  foreach t in array array['cobrancas','cobranca_pagamentos','cobranca_eventos'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_sup_admin()) with check (public.is_sup_admin())', t||'_all', t);
  end loop;
end $$;

-- CONFIGURACOES: equipe le, admin escreve
create policy config_sel on public.configuracoes for select to authenticated using (public.is_equipe());
create policy config_mut on public.configuracoes for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- INTEGRACOES: somente admin
create policy integr_all on public.integracoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- LOGS de integracao: supervisor/admin leem; equipe insere
create policy intlog_sel on public.integracao_logs for select to authenticated using (public.is_sup_admin());
create policy intlog_ins on public.integracao_logs for insert to authenticated with check (public.is_equipe());

-- AUDIT_LOG: supervisor/admin leem; equipe insere; SEM update/delete (imutavel via RLS)
create policy audit_sel on public.audit_log for select to authenticated using (public.is_sup_admin());
create policy audit_ins on public.audit_log for insert to authenticated with check (public.is_equipe());
