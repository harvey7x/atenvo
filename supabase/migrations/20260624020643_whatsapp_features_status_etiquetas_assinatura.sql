-- ============ #2 STATUS PERSONALIZÁVEIS (tabela de definição, não enum) ============
create table if not exists public.conversa_status_def (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  slug text not null,
  nome text not null,
  cor text not null default '#64748b',
  ordem int not null default 0,
  padrao boolean not null default false,
  ativo boolean not null default true,
  sistema boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, slug)
);

-- Seed dos 5 status de sistema por organização (slug = labels do enum legado p/ compatibilidade)
insert into public.conversa_status_def (organizacao_id, slug, nome, cor, ordem, padrao, sistema)
select o.id, v.slug, v.nome, v.cor, v.ordem, v.padrao, true
from public.organizacoes o
cross join (values
  ('aberta','Aberta','#3b82f6',0,true),
  ('em_atendimento','Em atendimento','#f59e0b',1,false),
  ('pendente','Pendente','#a855f7',2,false),
  ('resolvida','Resolvida','#22c55e',3,false),
  ('fechada','Fechada','#64748b',4,false)
) as v(slug,nome,cor,ordem,padrao)
on conflict (organizacao_id, slug) do nothing;

-- Referência nova na conversa + backfill a partir do enum legado (mantém enum como legado)
alter table public.conversas add column if not exists status_id uuid references public.conversa_status_def(id) on delete set null;
update public.conversas c set status_id = d.id
from public.conversa_status_def d
where d.organizacao_id = c.organizacao_id and d.slug = c.status::text and c.status_id is null;

alter table public.conversa_status_def enable row level security;
create policy csd_sel on public.conversa_status_def for select using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy csd_ins on public.conversa_status_def for insert with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));
create policy csd_upd on public.conversa_status_def for update using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id))) with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));
create policy csd_del on public.conversa_status_def for delete using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));

-- ============ #3 ETIQUETAS COM COR (metadados por nome; reutiliza arrays text[] existentes) ============
create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  cor text not null default '#64748b',
  descricao text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists etiquetas_org_nome_uniq on public.etiquetas (organizacao_id, lower(nome));

-- Seed das etiquetas já existentes nos arrays (dedupe case-insensitive p/ não violar o índice)
insert into public.etiquetas (organizacao_id, nome, cor, ordem)
select organizacao_id, nome, '#64748b', row_number() over (partition by organizacao_id order by nome)
from (
  select distinct on (organizacao_id, lower(btrim(nome))) organizacao_id, btrim(nome) nome
  from (
    select organizacao_id, unnest(etiquetas) nome from public.contatos where etiquetas is not null
    union all select organizacao_id, unnest(etiquetas) from public.conversas where etiquetas is not null
    union all select organizacao_id, unnest(etiquetas) from public.oportunidades where etiquetas is not null
  ) u
  where nome is not null and btrim(nome) <> ''
  order by organizacao_id, lower(btrim(nome))
) t;

alter table public.etiquetas enable row level security;
create policy etq_sel on public.etiquetas for select using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy etq_ins on public.etiquetas for insert with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));
create policy etq_upd on public.etiquetas for update using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id))) with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));
create policy etq_del on public.etiquetas for delete using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));

-- ============ #4 ASSINATURA (persistência separada) + #7 ORIGEM ============
alter table public.mensagens
  add column if not exists origem text,
  add column if not exists assinatura_nome text,
  add column if not exists texto_original text;

-- preferência de assinatura por usuário/organização
alter table public.organizacao_usuarios
  add column if not exists assinatura_modo text,
  add column if not exists assinatura_nome text;

-- ============ #6 ÚLTIMO CANAL/NÚMERO POR CONVERSA ============
alter table public.conversas
  add column if not exists ultimo_canal_id uuid references public.canais(id) on delete set null,
  add column if not exists ultimo_numero text,
  add column if not exists ultimo_provider text,
  add column if not exists ultima_msg_canal_em timestamptz;
