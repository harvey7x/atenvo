-- Melhoria de imagem por IA (Gemini imagem + conferência por leitura dupla).
-- Regra do dono (06/10/2026): qualquer atendente pode usar, UMA vez por cliente.
-- Só conta a melhoria APROVADA pela conferência; falha do Google ou reprovação não gastam a vez.
-- 'processando' também ocupa a vaga (evita dois cliques simultâneos pagarem duas vezes);
-- a função descarta 'processando' parado há mais de 10 min (função caiu no meio).

create table if not exists public.midia_melhoria_ia (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  anexo_path_original text not null,
  anexo_path_ia text,
  status text not null check (status in ('processando', 'aprovada', 'reprovada', 'falha')),
  modelo text,
  tentativas int not null default 0,
  divergencias jsonb,            -- { numeros: {soNoOriginal, soNaMelhorada}, palavrasNovas, palavrasSumidas }
  erro text,
  uso jsonb,                     -- usageMetadata do Gemini (custo)
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- a vaga única por cliente
create unique index if not exists midia_melhoria_ia_uma_por_contato
  on public.midia_melhoria_ia (contato_id) where status in ('processando', 'aprovada');
create index if not exists midia_melhoria_ia_contato_idx on public.midia_melhoria_ia (contato_id, criado_em desc);
create index if not exists midia_melhoria_ia_org_idx on public.midia_melhoria_ia (organizacao_id, criado_em desc);

alter table public.midia_melhoria_ia enable row level security;

-- leitura: quem enxerga a organização (mesmo critério de mensagens). Escrita: só a edge function (service_role).
drop policy if exists midia_melhoria_ia_sel on public.midia_melhoria_ia;
create policy midia_melhoria_ia_sel on public.midia_melhoria_ia
  for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));

grant select on public.midia_melhoria_ia to authenticated;
grant all on public.midia_melhoria_ia to service_role;
