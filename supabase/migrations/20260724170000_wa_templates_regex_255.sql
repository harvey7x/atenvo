-- CORREÇÃO — regex de nome de template quebrava em TEMPO DE EXECUÇÃO.
--
-- `^[a-z0-9_]{1,512}$` foi aceito pelo Postgres na criação da tabela e da função, mas o motor
-- POSIX limita o contador de repetição a 255: na PRIMEIRA avaliação ele levanta
-- "invalid regular expression: invalid repetition count(s)". Resultado: era impossível salvar
-- qualquer template — o painel devolvia esse erro cru para o usuário.
--
-- Sintoma só aparece EXECUTANDO: a migration aplicou limpa, tsc/testes/build passaram, e o
-- erro só surgiu ao clicar "Salvar" no painel real.
--
-- O 512 vem do limite de nome de template da Meta e continua valendo — só sai de dentro do
-- regex e vira um length(), que não tem esse teto.

alter table public.wa_templates drop constraint if exists wat_nome_valido;
alter table public.wa_templates
  add constraint wat_nome_valido check (nome ~ '^[a-z0-9_]+$' and length(nome) <= 512);

create or replace function public.wa_template_salvar(
  p_org uuid, p_nome text, p_idioma text, p_categoria text, p_corpo text,
  p_variaveis jsonb default '[]'::jsonb, p_canal uuid default null,
  p_waba text default null, p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text;
begin
  if not (public.is_platform_admin() or (public.papel_na_org(p_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(p_org))) then
    raise exception 'sem_permissao';
  end if;
  v_nome := lower(trim(coalesce(p_nome, '')));
  -- sem {1,512} aqui: ver o cabeçalho desta migration.
  if v_nome !~ '^[a-z0-9_]+$' or length(v_nome) > 512 then raise exception 'nome_invalido'; end if;
  if length(trim(coalesce(p_corpo, ''))) = 0 then raise exception 'corpo_vazio'; end if;
  if p_canal is not null and not exists (
       select 1 from public.canais c where c.id = p_canal and c.organizacao_id = p_org
     ) then raise exception 'canal_invalido'; end if;

  if p_id is null then
    insert into public.wa_templates (organizacao_id, canal_id, waba_id, nome, idioma, categoria, corpo, variaveis, criado_por, atualizado_por)
    values (p_org, p_canal, nullif(trim(coalesce(p_waba, '')), ''), v_nome, coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
            coalesce(nullif(trim(p_categoria), ''), 'MARKETING'), p_corpo, coalesce(p_variaveis, '[]'::jsonb), auth.uid(), auth.uid())
    returning id into v_id;
  else
    -- editar o corpo invalida a aprovação: a Meta aprova o TEXTO, não o registro.
    update public.wa_templates
       set canal_id = p_canal, waba_id = nullif(trim(coalesce(p_waba, '')), ''), nome = v_nome,
           idioma = coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
           categoria = coalesce(nullif(trim(p_categoria), ''), 'MARKETING'),
           corpo = p_corpo, variaveis = coalesce(p_variaveis, '[]'::jsonb),
           status = case when corpo is distinct from p_corpo then 'rascunho' else status end,
           status_motivo = case when corpo is distinct from p_corpo then 'corpo alterado — precisa reenviar para aprovação' else status_motivo end,
           atualizado_por = auth.uid()
     where id = p_id and organizacao_id = p_org and ativo
    returning id into v_id;
    if v_id is null then raise exception 'template_invalido'; end if;
  end if;
  return v_id;
end $fn$;

revoke all on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid) from public, anon;
grant execute on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid) to authenticated;
