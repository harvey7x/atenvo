-- Ficha Judicial Automática — estrutura segura (Bloco B).
-- Sem parser/UI/Vault. Senha do INSS NÃO é persistida nesta etapa.
-- Isolamento por organização via FK composta; versionamento linear; imutabilidade
-- após finalização; autoria por auth.uid(); RLS por papel (admin/supervisor/atendente).

-- 0) pré-requisito p/ FK composta (id é PK → unicidade trivial e segura)
alter table public.oportunidades add constraint oportunidades_id_org_uniq unique (id, organizacao_id);
alter table public.conversas    add constraint conversas_id_org_uniq    unique (id, organizacao_id);

-- 1) validador de CPF (interno ao trigger)
create or replace function public.cpf_valido(p text) returns boolean
  language plpgsql immutable set search_path = public as $$
declare d text; s int; r int; i int;
begin
  d := regexp_replace(coalesce(p,''),'\D','','g');
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s:=0; for i in 1..9  loop s:=s+substr(d,i,1)::int*(11-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if;
  if r <> substr(d,10,1)::int then return false; end if;
  s:=0; for i in 1..10 loop s:=s+substr(d,i,1)::int*(12-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if;
  return r = substr(d,11,1)::int;
end $$;

-- 2) redação de senha (2ª barreira no banco) — interna
create or replace function public.redige_senha(p text) returns text
  language sql immutable set search_path = public as $$
  select case when p is null then null
    else regexp_replace(p, '(senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:?)[^\n]*', '\1 [REMOVIDA]', 'gi') end;
$$;

-- 3) papel do usuário atual na org (usado nas policies)
create or replace function public.org_papel(org uuid) returns text
  language sql stable security definer set search_path = public as $$
  select papel::text from public.organizacao_usuarios
   where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo' limit 1;
$$;

-- 4) tabela principal
create table public.fichas_judiciais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  contato_id uuid not null,
  oportunidade_id uuid, conversa_id uuid, canal_id uuid,
  responsavel_id uuid,
  criado_por uuid not null, atualizado_por uuid not null,
  versao integer not null default 1,
  ficha_anterior_id uuid references public.fichas_judiciais(id),
  status text not null default 'rascunho' check (status in ('rascunho','finalizada')),
  texto_original text, texto_ficha text,
  nome text, cpf text, cidade text, uf text, telefone text, email text, rg text, estado_civil text,
  nascimento date, idade_informada int,
  beneficio_numero text, especie_codigo text, especie_descricao text,
  tipo_beneficio text check (tipo_beneficio is null or tipo_beneficio in ('aposentadoria','pensao_por_morte','bpc_loas','outro')),
  banco_codigo text, banco_nome text, valor_beneficio numeric(12,2),
  data_consulta date,
  revisoes jsonb not null default '[]'::jsonb,
  avisos   jsonb not null default '[]'::jsonb,
  parser_version text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizada_em timestamptz,
  constraint chk_ficha_valor_nn check (valor_beneficio is null or valor_beneficio >= 0),
  constraint chk_ficha_idade_nn check (idade_informada is null or idade_informada >= 0),
  constraint chk_ficha_rev_arr  check (jsonb_typeof(revisoes) = 'array'),
  constraint chk_ficha_avi_arr  check (jsonb_typeof(avisos)   = 'array'),
  constraint chk_ficha_versao   check (versao >= 1),
  constraint chk_ficha_v1       check (versao = 1 or ficha_anterior_id is not null),
  constraint fk_ficha_org       foreign key (organizacao_id) references public.organizacoes(id),
  constraint fk_ficha_contato   foreign key (contato_id, organizacao_id)      references public.contatos(id, organizacao_id),
  constraint fk_ficha_oport     foreign key (oportunidade_id, organizacao_id) references public.oportunidades(id, organizacao_id),
  constraint fk_ficha_conversa  foreign key (conversa_id, organizacao_id)     references public.conversas(id, organizacao_id),
  constraint fk_ficha_canal     foreign key (canal_id, organizacao_id)        references public.canais(id, organizacao_id),
  constraint fk_ficha_resp      foreign key (responsavel_id) references public.usuarios(id),
  constraint fk_ficha_criadopor foreign key (criado_por)     references public.usuarios(id),
  constraint fk_ficha_atualpor  foreign key (atualizado_por) references public.usuarios(id)
);

-- 5) índices
create index ix_ficha_org_opp_versao     on public.fichas_judiciais (organizacao_id, oportunidade_id, versao desc);
create index ix_ficha_org_contato_criado on public.fichas_judiciais (organizacao_id, contato_id, criado_em desc);
create index ix_ficha_org_status         on public.fichas_judiciais (organizacao_id, status);
create index ix_ficha_anterior           on public.fichas_judiciais (ficha_anterior_id);
create index ix_ficha_responsavel        on public.fichas_judiciais (organizacao_id, responsavel_id);
create unique index uq_ficha_opp_versao     on public.fichas_judiciais (oportunidade_id, versao) where oportunidade_id is not null;
create unique index uq_ficha_contato_versao on public.fichas_judiciais (contato_id, versao)     where oportunidade_id is null;
create unique index uq_ficha_sucessor       on public.fichas_judiciais (ficha_anterior_id)      where ficha_anterior_id is not null;

-- 6) trigger central
create or replace function public.fn_ficha_before() returns trigger
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ant record; vconv record;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not exists (select 1 from public.organizacao_usuarios
                 where organizacao_id = NEW.organizacao_id and usuario_id = uid and status = 'ativo') then
    raise exception 'usuario_nao_membro_ativo';
  end if;

  if tg_op = 'INSERT' then
    if NEW.status <> 'rascunho' then raise exception 'ficha_nasce_rascunho'; end if;
    NEW.criado_por := uid; NEW.atualizado_por := uid;
    NEW.criado_em := now(); NEW.atualizado_em := now(); NEW.finalizada_em := null;
    if NEW.ficha_anterior_id is not null then
      select * into ant from public.fichas_judiciais where id = NEW.ficha_anterior_id for update;
      if ant.id is null then raise exception 'ficha_anterior_invalida'; end if;
      if ant.organizacao_id <> NEW.organizacao_id then raise exception 'ficha_anterior_outra_org'; end if;
      if ant.contato_id is distinct from NEW.contato_id or ant.oportunidade_id is distinct from NEW.oportunidade_id
        then raise exception 'ficha_anterior_vinculo_divergente'; end if;
      if ant.status <> 'finalizada' then raise exception 'ficha_anterior_nao_finalizada'; end if;
      NEW.versao := ant.versao + 1;
    else
      NEW.versao := 1;
    end if;
  else  -- UPDATE
    if OLD.status = 'finalizada' then raise exception 'ficha_finalizada_imutavel'; end if;
    NEW.finalizada_em := null;  -- frontend nunca controla
    if NEW.organizacao_id is distinct from OLD.organizacao_id
       or NEW.contato_id is distinct from OLD.contato_id
       or NEW.oportunidade_id is distinct from OLD.oportunidade_id
       or NEW.conversa_id is distinct from OLD.conversa_id
       or NEW.canal_id is distinct from OLD.canal_id
       or NEW.versao is distinct from OLD.versao
       or NEW.ficha_anterior_id is distinct from OLD.ficha_anterior_id
       or NEW.criado_por is distinct from OLD.criado_por
       or NEW.criado_em is distinct from OLD.criado_em then
      raise exception 'campos_imutaveis_alterados';
    end if;
    NEW.atualizado_por := uid; NEW.atualizado_em := now();
    if NEW.status = 'finalizada' and OLD.status <> 'finalizada' then
      if NEW.responsavel_id is null then raise exception 'finalizar: gerente obrigatorio'; end if;
      if coalesce(btrim(NEW.nome),'')='' then raise exception 'finalizar: nome obrigatorio'; end if;
      if not public.cpf_valido(NEW.cpf) then raise exception 'finalizar: cpf invalido'; end if;
      if coalesce(btrim(NEW.beneficio_numero),'')='' then raise exception 'finalizar: numero do beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.especie_codigo),'')='' and coalesce(btrim(NEW.especie_descricao),'')=''
        then raise exception 'finalizar: especie obrigatoria'; end if;
      if NEW.tipo_beneficio is null then raise exception 'finalizar: tipo de beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.telefone),'')='' then raise exception 'finalizar: telefone obrigatorio'; end if;
      if NEW.data_consulta is null then raise exception 'finalizar: data da ficha obrigatoria'; end if;
      NEW.finalizada_em := now();
    end if;
  end if;

  -- responsável (gerente) deve ser membro ativo da mesma org
  if NEW.responsavel_id is not null and not exists (
       select 1 from public.organizacao_usuarios
       where organizacao_id = NEW.organizacao_id and usuario_id = NEW.responsavel_id and status = 'ativo')
    then raise exception 'responsavel_invalido'; end if;

  -- consistência: todos os vínculos pertencem ao MESMO cliente (org já garantida pela FK composta)
  if NEW.oportunidade_id is not null then
    perform 1 from public.oportunidades
      where id = NEW.oportunidade_id and organizacao_id = NEW.organizacao_id and contato_id = NEW.contato_id;
    if not found then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.conversa_id is not null then
    select canal_id, ultimo_canal_id, contato_id into vconv
      from public.conversas where id = NEW.conversa_id and organizacao_id = NEW.organizacao_id;
    if not found or vconv.contato_id is distinct from NEW.contato_id then raise exception 'conversa_contato_divergente'; end if;
    if NEW.canal_id is not null
       and NEW.canal_id is distinct from vconv.canal_id
       and NEW.canal_id is distinct from vconv.ultimo_canal_id then
      raise exception 'canal_conversa_divergente';
    end if;
  end if;

  -- sanitização de senha (textos) + rejeição precisa em estruturas JSONB
  NEW.texto_original := public.redige_senha(NEW.texto_original);
  NEW.texto_ficha    := public.redige_senha(NEW.texto_ficha);
  if  NEW.revisoes::text ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.avisos::text   ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.revisoes::text ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
   or NEW.avisos::text   ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
    then raise exception 'senha_em_estrutura_proibida'; end if;

  return NEW;
end $$;

-- 7) trigger único (atualizado_em consolidado dentro de fn_ficha_before)
create trigger trg_ficha_biu before insert or update on public.fichas_judiciais
  for each row execute function public.fn_ficha_before();

-- 8) revokes/grants das funções
revoke all on function public.fn_ficha_before()  from public, anon;
revoke all on function public.cpf_valido(text)   from public, anon;
revoke all on function public.redige_senha(text) from public, anon;
revoke all on function public.org_papel(uuid)    from public, anon;
grant execute on function public.org_papel(uuid) to authenticated;

-- 9) privilégios da tabela (sem DELETE para authenticated; nada para anon)
revoke all    on table public.fichas_judiciais from anon;
revoke delete on table public.fichas_judiciais from authenticated;
grant select, insert, update on table public.fichas_judiciais to authenticated;

-- 10) RLS + policies (sem DELETE)
alter table public.fichas_judiciais enable row level security;

create policy fichas_sel on public.fichas_judiciais for select using (
  public.is_member(organizacao_id) and (
    public.org_papel(organizacao_id) in ('admin','supervisor')
    or criado_por = auth.uid() or responsavel_id = auth.uid()
    or exists (select 1 from public.oportunidades o where o.id = oportunidade_id and o.responsavel_id = auth.uid())
    or exists (select 1 from public.conversas c    where c.id = conversa_id    and c.atendente_id  = auth.uid())
  )
);
create policy fichas_ins on public.fichas_judiciais for insert with check (
  public.is_member(organizacao_id)
);
create policy fichas_upd on public.fichas_judiciais for update
  using (
    public.is_member(organizacao_id) and (
      public.org_papel(organizacao_id) in ('admin','supervisor')
      or criado_por = auth.uid() or responsavel_id = auth.uid()
      or exists (select 1 from public.oportunidades o where o.id = oportunidade_id and o.responsavel_id = auth.uid())
      or exists (select 1 from public.conversas c    where c.id = conversa_id    and c.atendente_id  = auth.uid())
    )
  )
  with check (public.is_member(organizacao_id));
