-- Ferramenta de MERGE de contatos duplicados — modo dry-run por padrão.
-- NÃO executa merge automático. Seguro por construção:
--   • p_dry_run=true default → nunca escreve, só retorna o plano;
--   • nunca deleta contato (soft: mesclado_em/mesclado_para) nem mensagem/histórico;
--   • bloqueios DUROS (nem p_forcar libera) e BRANDOS (exigem p_forcar);
--   • transacional; backup lógico em contato_merges → reversível via desfazer_merge.
-- Também: secundarizar_conversa (arquiva duplicata sem deletar; re-vincula opp).
-- Somente estrutura + funções. Nenhum merge é executado nesta migration.

-- ===== colunas soft-merge no contato =====
alter table public.contatos add column if not exists mesclado_em  timestamptz;
alter table public.contatos add column if not exists mesclado_para uuid references public.contatos(id);
comment on column public.contatos.mesclado_em  is 'Quando o contato foi absorvido por outro (merge_contatos). Linha preservada; nunca deletada.';
comment on column public.contatos.mesclado_para is 'Contato sobrevivente que absorveu este (merge_contatos).';

-- ===== backup lógico / reversão =====
create table if not exists public.contato_merges (
  id                    uuid primary key default gen_random_uuid(),
  organizacao_id        uuid not null,
  sobrevivente_id       uuid not null,
  absorvido_id          uuid not null,
  snapshot_sobrevivente jsonb not null,
  snapshot_absorvido    jsonb not null,
  linhas_movidas        jsonb not null,   -- { movidas:[{t,id}], identidades_removidas:[row] }
  executado_por         uuid,
  executado_em          timestamptz not null default now(),
  desfeito_por          uuid,
  desfeito_em           timestamptz
);
alter table public.contato_merges enable row level security;
drop policy if exists cm_sel on public.contato_merges;
create policy cm_sel on public.contato_merges for select to authenticated
  using (public.is_platform_admin() or public.papel_na_org(organizacao_id) in ('admin','supervisor'));
-- sem policy de insert/update/delete: só funções SECURITY DEFINER escrevem.

-- ===== chave canônica de telefone (espelha o helper do front) =====
create or replace function public.chave_canonica_telefone(p_raw text)
returns text language plpgsql immutable as $$
declare d text; core text;
begin
  d := regexp_replace(coalesce(p_raw,''),'\D','','g');
  if d = '' then return null; end if;
  core := case when left(d,2)='55' and length(d)-2 in (10,11) then substr(d,3) else d end;
  if length(core) in (10,11) then return left(core,2)||right(core,8); end if;
  return d;
end $$;

-- ===== sugestão de sobrevivente (regra: inbound → ficha → opp fechada → responsável → mais antigo) =====
create or replace function public.sugerir_sobrevivente(p_a uuid, p_b uuid)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare ain int; bin int; af boolean; bf boolean; afe boolean; bfe boolean; ar boolean; br boolean; ac timestamptz; bc timestamptz;
begin
  select count(*) into ain from public.conversas cv join public.mensagens m on m.conversa_id=cv.id and m.direcao='entrada' where cv.contato_id=p_a;
  select count(*) into bin from public.conversas cv join public.mensagens m on m.conversa_id=cv.id and m.direcao='entrada' where cv.contato_id=p_b;
  if ain <> bin then return case when ain>bin then p_a else p_b end; end if;
  select exists(select 1 from public.fichas_judiciais where contato_id=p_a) into af;
  select exists(select 1 from public.fichas_judiciais where contato_id=p_b) into bf;
  if af <> bf then return case when af then p_a else p_b end; end if;
  select exists(select 1 from public.oportunidades where contato_id=p_a and status in ('ganho','perdido')) into afe;
  select exists(select 1 from public.oportunidades where contato_id=p_b and status in ('ganho','perdido')) into bfe;
  if afe <> bfe then return case when afe then p_a else p_b end; end if;
  select (responsavel_id is not null) into ar from public.contatos where id=p_a;
  select (responsavel_id is not null) into br from public.contatos where id=p_b;
  if ar <> br then return case when ar then p_a else p_b end; end if;
  select criado_em into ac from public.contatos where id=p_a;
  select criado_em into bc from public.contatos where id=p_b;
  return case when ac <= bc then p_a else p_b end;
end $$;

-- ===== MERGE (dry-run default) =====
create or replace function public.merge_contatos(
  p_sobrevivente uuid, p_absorvido uuid,
  p_dry_run boolean default true, p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
  s public.contatos; a public.contatos;
  v_org uuid;
  v_duros text[] := '{}'; v_brandos text[] := '{}';
  v_plano jsonb; v_ident_dedupe int; v_ident_princ int;
  v_denylist text[] := array['5181602825'];  -- número interno/teste conhecido
  v_seguro boolean; v_resultado jsonb;
  v_merge_id uuid; v_linhas jsonb; v_ident_rem jsonb;
  ns text; na text;
begin
  if p_sobrevivente = p_absorvido then raise exception 'sobrevivente_igual_absorvido'; end if;
  select * into s from public.contatos where id=p_sobrevivente;
  select * into a from public.contatos where id=p_absorvido;
  if s.id is null or a.id is null then raise exception 'contato_inexistente'; end if;
  if s.organizacao_id <> a.organizacao_id then raise exception 'orgs_diferentes'; end if;
  v_org := s.organizacao_id;
  if auth.uid() is not null and not (public.is_platform_admin() or public.papel_na_org(v_org) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;
  if a.mesclado_em is not null then
    return jsonb_build_object('status','noop','motivo','absorvido_ja_mesclado','absorvido',p_absorvido,'mesclado_para',a.mesclado_para);
  end if;

  -- ===== BLOQUEIOS DUROS (nem p_forcar libera) =====
  if exists (select 1 from public.oportunidades o1 join public.oportunidades o2
               on o1.funil_id=o2.funil_id and o1.organizacao_id=o2.organizacao_id
             where o1.contato_id=p_sobrevivente and o1.status='em_andamento'
               and o2.contato_id=p_absorvido    and o2.status='em_andamento')
  then v_duros := array_append(v_duros,'ambos_opp_aberta_mesmo_funil'); end if;

  -- ficha tem contato_id IMUTÁVEL (trigger) → não é possível re-pontar ficha do absorvido
  if exists (select 1 from public.fichas_judiciais where contato_id=p_absorvido)
  then v_duros := array_append(v_duros,'absorvido_tem_ficha_judicial'); end if;

  if s.cpf is not null and a.cpf is not null
     and nullif(regexp_replace(s.cpf,'\D','','g'),'') is not null
     and nullif(regexp_replace(a.cpf,'\D','','g'),'') is not null
     and regexp_replace(s.cpf,'\D','','g') <> regexp_replace(a.cpf,'\D','','g')
  then v_duros := array_append(v_duros,'cpf_diferente'); end if;

  if public.chave_canonica_telefone(s.telefone) = any(v_denylist)
     or public.chave_canonica_telefone(a.telefone) = any(v_denylist)
  then v_duros := array_append(v_duros,'numero_interno_teste'); end if;

  -- identidade do absorvido com (tipo,valor) que pertence a um TERCEIRO contato → colisão não resolvível
  if exists (select 1 from public.contato_identidades ai
             where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
               and exists (select 1 from public.contato_identidades oi
                           where oi.tipo=ai.tipo and oi.valor_normalizado=ai.valor_normalizado
                             and oi.contato_id not in (p_sobrevivente,p_absorvido)))
  then v_duros := array_append(v_duros,'colisao_identidade_terceiro'); end if;

  -- ===== BLOQUEIOS BRANDOS (exigem p_forcar) =====
  if exists (select 1 from public.oportunidades where contato_id=p_absorvido and status in ('ganho','perdido'))
     and not exists (select 1 from public.oportunidades where contato_id=p_sobrevivente and status in ('ganho','perdido'))
  then v_brandos := array_append(v_brandos,'opp_fechada_no_absorvido'); end if;

  if public.chave_canonica_telefone(s.telefone) is distinct from public.chave_canonica_telefone(a.telefone)
  then v_brandos := array_append(v_brandos,'nao_eh_par_canonico'); end if;  -- inclui DDD diferente

  ns := lower(coalesce(s.nome,'')); na := lower(coalesce(a.nome,''));
  if ns !~ '^\d+$' and na !~ '^\d+$' and length(ns)>2 and length(na)>2
     and position(split_part(na,' ',1) in ns)=0 and position(split_part(ns,' ',1) in na)=0
  then v_brandos := array_append(v_brandos,'nome_divergente'); end if;

  -- ===== PLANO (contagem por tabela que seria re-pontada) =====
  v_plano := jsonb_build_object(
    'conversas',                (select count(*) from public.conversas                where contato_id=p_absorvido),
    'oportunidades',            (select count(*) from public.oportunidades            where contato_id=p_absorvido),
    'fichas_judiciais',         (select count(*) from public.fichas_judiciais         where contato_id=p_absorvido),
    'cobrancas',                (select count(*) from public.cobrancas                where contato_id=p_absorvido),
    'contato_identidades',      (select count(*) from public.contato_identidades      where contato_id=p_absorvido),
    'meta_contato_identidades', (select count(*) from public.meta_contato_identidades where contato_id=p_absorvido),
    'agendamentos',             (select count(*) from public.agendamentos             where contato_id=p_absorvido),
    'sla_alertas',              (select count(*) from public.sla_alertas              where contato_id=p_absorvido),
    'bot_conversa_estado',      (select count(*) from public.bot_conversa_estado      where contato_id=p_absorvido));

  select count(*) into v_ident_dedupe from public.contato_identidades ai
    where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
      and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                  and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado);
  select count(*) into v_ident_princ from public.contato_identidades where contato_id=p_absorvido and principal;

  v_seguro := coalesce(array_length(v_duros,1),0)=0
              and (coalesce(array_length(v_brandos,1),0)=0 or p_forcar);

  v_resultado := jsonb_build_object(
    'sobrevivente', p_sobrevivente, 'absorvido', p_absorvido,
    'sobrevivente_sugerido', public.sugerir_sobrevivente(p_sobrevivente,p_absorvido),
    'sugestao_bate', public.sugerir_sobrevivente(p_sobrevivente,p_absorvido)=p_sobrevivente,
    'plano', v_plano,
    'identidades_dedupe', v_ident_dedupe, 'identidade_principal_rebaixar', v_ident_princ,
    'bloqueios_duros', to_jsonb(v_duros), 'bloqueios_brandos', to_jsonb(v_brandos),
    'forcar', p_forcar, 'seguro_para_executar', v_seguro);

  -- ===== DRY-RUN: nunca escreve =====
  if p_dry_run then
    return v_resultado || jsonb_build_object('status','dry_run');
  end if;

  -- ===== execução real =====
  if coalesce(array_length(v_duros,1),0) > 0 then
    raise exception 'merge_bloqueado_duro: %', array_to_string(v_duros,',');
  end if;
  if coalesce(array_length(v_brandos,1),0) > 0 and not p_forcar then
    raise exception 'merge_bloqueado_brando (use p_forcar=true): %', array_to_string(v_brandos,',');
  end if;

  -- snapshot das identidades redundantes (serão removidas p/ não colidir uq_identidade_valor)
  select coalesce(jsonb_agg(to_jsonb(ai)),'[]'::jsonb) into v_ident_rem
    from public.contato_identidades ai
    where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
      and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                  and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado);

  -- linhas que serão movidas (flat {t,id}); identidades incluem só as que NÃO são redundantes
  select coalesce(jsonb_agg(jsonb_build_object('t',t,'id',id)),'[]'::jsonb) into v_linhas from (
      select 'conversas' t, id from public.conversas where contato_id=p_absorvido
      union all select 'oportunidades', id from public.oportunidades where contato_id=p_absorvido
      union all select 'cobrancas', id from public.cobrancas where contato_id=p_absorvido
      union all select 'meta_contato_identidades', id from public.meta_contato_identidades where contato_id=p_absorvido
      union all select 'agendamentos', id from public.agendamentos where contato_id=p_absorvido
      union all select 'sla_alertas', id from public.sla_alertas where contato_id=p_absorvido
      union all select 'bot_conversa_estado', id from public.bot_conversa_estado where contato_id=p_absorvido
      union all select 'contato_identidades', ai.id from public.contato_identidades ai
        where ai.contato_id=p_absorvido
          and not (ai.valor_normalizado is not null
                   and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                               and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado))
  ) q;

  insert into public.contato_merges(organizacao_id, sobrevivente_id, absorvido_id, snapshot_sobrevivente, snapshot_absorvido, linhas_movidas, executado_por)
  values (v_org, p_sobrevivente, p_absorvido, to_jsonb(s), to_jsonb(a),
          jsonb_build_object('movidas', v_linhas, 'identidades_removidas', v_ident_rem), auth.uid())
  returning id into v_merge_id;

  -- identidades redundantes: remover (o sobrevivente já tem o mesmo valor)
  delete from public.contato_identidades ai
    where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
      and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                  and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado);
  -- identidades restantes: mover (rebaixa principal p/ não colidir uq_identidade_principal)
  update public.contato_identidades set contato_id=p_sobrevivente, principal=false, atualizado_em=now()
    where contato_id=p_absorvido;

  -- re-pontar demais FKs (ficha nunca chega aqui: absorvido_tem_ficha é bloqueio duro)
  update public.conversas                set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.oportunidades            set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.cobrancas                set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.meta_contato_identidades set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.agendamentos             set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.sla_alertas              set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.bot_conversa_estado      set contato_id=p_sobrevivente where contato_id=p_absorvido;

  -- fundir escalares no sobrevivente (só preenche vazio / nome não-confiável; nunca sobrescreve dado bom)
  update public.contatos c set
    cpf         = coalesce(c.cpf, a.cpf),
    email       = coalesce(c.email, a.email),
    observacoes = case when coalesce(c.observacoes,'')='' then a.observacoes
                       when coalesce(a.observacoes,'')='' then c.observacoes
                       else c.observacoes||E'\n--- (mesclado) ---\n'||a.observacoes end,
    etiquetas   = (select array(select distinct e from unnest(coalesce(c.etiquetas,'{}'::text[])||coalesce(a.etiquetas,'{}'::text[])) e where e is not null and e<>'')),
    nome        = case when (coalesce(c.nome,'')='' or regexp_replace(c.nome,'\D','','g')=regexp_replace(coalesce(c.telefone,''),'\D','','g'))
                            and a.nome is not null and a.nome<>'' and regexp_replace(a.nome,'\D','','g')<>regexp_replace(coalesce(a.telefone,''),'\D','','g')
                       then a.nome else c.nome end,
    telefone    = case when length(regexp_replace(coalesce(c.telefone,''),'\D','','g')) < length(regexp_replace(coalesce(a.telefone,''),'\D','','g'))
                       then a.telefone else c.telefone end,
    atualizado_em = now()
    where c.id=p_sobrevivente;

  -- marcar absorvido como mesclado (soft; NUNCA deletar)
  update public.contatos set mesclado_em=now(), mesclado_para=p_sobrevivente, atualizado_em=now()
    where id=p_absorvido;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (v_org, auth.uid(), 'merge_contatos', 'contatos', p_sobrevivente,
          jsonb_build_object('absorvido', p_absorvido),
          v_resultado || jsonb_build_object('merge_id', v_merge_id, 'forcado', p_forcar));

  return v_resultado || jsonb_build_object('status','executado','merge_id',v_merge_id);
end $fn$;

-- ===== DESFAZER (reversão via backup lógico) =====
create or replace function public.desfazer_merge(p_merge_id uuid, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare cm public.contato_merges; r record; ident jsonb; v_res jsonb;
begin
  select * into cm from public.contato_merges where id=p_merge_id;
  if cm.id is null then raise exception 'merge_inexistente'; end if;
  if auth.uid() is not null and not (public.is_platform_admin() or public.papel_na_org(cm.organizacao_id) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;
  v_res := jsonb_build_object('merge_id', p_merge_id, 'sobrevivente', cm.sobrevivente_id, 'absorvido', cm.absorvido_id,
    'linhas_a_reverter', jsonb_array_length(cm.linhas_movidas->'movidas'),
    'identidades_a_restaurar', jsonb_array_length(cm.linhas_movidas->'identidades_removidas'));
  if cm.desfeito_em is not null then return v_res || jsonb_build_object('status','noop','motivo','ja_desfeito'); end if;
  if p_dry_run then return v_res || jsonb_build_object('status','dry_run'); end if;

  -- reverter re-pontagens (por id; lista de tabelas é controlada, format() seguro)
  for r in select value->>'t' t, (value->>'id')::uuid id from jsonb_array_elements(cm.linhas_movidas->'movidas') loop
    execute format('update public.%I set contato_id=$1 where id=$2 and contato_id=$3', r.t)
      using cm.absorvido_id, r.id, cm.sobrevivente_id;
  end loop;
  -- restaurar identidades removidas
  for ident in select value from jsonb_array_elements(cm.linhas_movidas->'identidades_removidas') loop
    insert into public.contato_identidades select * from jsonb_populate_record(null::public.contato_identidades, ident)
    on conflict (id) do nothing;
  end loop;
  -- restaurar escalares do sobrevivente ao estado anterior
  update public.contatos c set
    cpf         = nullif(cm.snapshot_sobrevivente->>'cpf',''),
    email       = nullif(cm.snapshot_sobrevivente->>'email',''),
    nome        = cm.snapshot_sobrevivente->>'nome',
    telefone    = nullif(cm.snapshot_sobrevivente->>'telefone',''),
    observacoes = nullif(cm.snapshot_sobrevivente->>'observacoes',''),
    etiquetas   = coalesce((select array(select jsonb_array_elements_text(cm.snapshot_sobrevivente->'etiquetas'))), '{}'::text[]),
    atualizado_em = now()
    where c.id=cm.sobrevivente_id;
  -- des-marcar absorvido
  update public.contatos set mesclado_em=null, mesclado_para=null, atualizado_em=now() where id=cm.absorvido_id;
  update public.contato_merges set desfeito_em=now(), desfeito_por=auth.uid() where id=p_merge_id;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (cm.organizacao_id, auth.uid(), 'desfazer_merge', 'contatos', cm.sobrevivente_id,
          jsonb_build_object('merge_id', p_merge_id, 'absorvido', cm.absorvido_id));
  return v_res || jsonb_build_object('status','desfeito');
end $fn$;

-- ===== SECUNDARIZAR CONVERSA (arquiva duplicata; nunca deleta; re-vincula opp) =====
create or replace function public.secundarizar_conversa(
  p_principal uuid, p_secundaria uuid, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare cp public.conversas; cs public.conversas; v_opp int; v_msgs int; v_res jsonb;
begin
  if p_principal = p_secundaria then raise exception 'principal_igual_secundaria'; end if;
  select * into cp from public.conversas where id=p_principal;
  select * into cs from public.conversas where id=p_secundaria;
  if cp.id is null or cs.id is null then raise exception 'conversa_inexistente'; end if;
  if cp.contato_id <> cs.contato_id then raise exception 'conversas_de_contatos_diferentes'; end if;
  if auth.uid() is not null and not (public.is_platform_admin() or public.papel_na_org(cs.organizacao_id) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;
  select count(*) into v_opp from public.oportunidades where conversa_origem_id=p_secundaria;
  select count(*) into v_msgs from public.mensagens where conversa_id=p_secundaria;
  v_res := jsonb_build_object('principal',p_principal,'secundaria',p_secundaria,
    'ja_arquivada', cs.arquivada_em is not null, 'opp_a_revincular', v_opp, 'mensagens_preservadas', v_msgs);
  if p_dry_run then return v_res || jsonb_build_object('status','dry_run'); end if;
  if cs.arquivada_em is not null then return v_res || jsonb_build_object('status','noop','motivo','ja_arquivada'); end if;

  update public.oportunidades set conversa_origem_id=p_principal where conversa_origem_id=p_secundaria; -- re-vincula opp
  update public.conversas set arquivada_em=now(), arquivada_por=auth.uid() where id=p_secundaria;       -- arquiva (não deleta)
  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (cs.organizacao_id, auth.uid(), 'secundarizar_conversa', 'conversas', p_secundaria,
          jsonb_build_object('principal',p_principal,'opp_revinculadas',v_opp));
  return v_res || jsonb_build_object('status','executado');
end $fn$;

-- ===== grants (sem public/anon; execução só p/ membros admin/supervisor via checagem interna) =====
revoke all on function public.chave_canonica_telefone(text) from public, anon;
revoke all on function public.sugerir_sobrevivente(uuid,uuid) from public, anon;
revoke all on function public.merge_contatos(uuid,uuid,boolean,boolean) from public, anon;
revoke all on function public.desfazer_merge(uuid,boolean) from public, anon;
revoke all on function public.secundarizar_conversa(uuid,uuid,boolean) from public, anon;
grant execute on function public.merge_contatos(uuid,uuid,boolean,boolean) to authenticated, service_role;
grant execute on function public.desfazer_merge(uuid,boolean) to authenticated, service_role;
grant execute on function public.secundarizar_conversa(uuid,uuid,boolean) to authenticated, service_role;
grant execute on function public.sugerir_sobrevivente(uuid,uuid) to authenticated, service_role;
grant execute on function public.chave_canonica_telefone(text) to authenticated, service_role;

comment on function public.merge_contatos is 'Merge de contatos duplicados. dry_run=true (default) só simula. Bloqueios duros (opp aberta mesmo funil, ficha no absorvido, CPF diferente, número teste, colisão de identidade) nem p_forcar libera; brandos (opp fechada no absorvido, não-par-canônico/DDD, nome divergente) exigem p_forcar. Soft-merge (mesclado_em), backup em contato_merges, auditoria. Nunca deleta contato/mensagem.';
comment on function public.secundarizar_conversa is 'Arquiva conversa duplicada do mesmo contato (arquivada_em), re-vincula oportunidade à principal. Nunca deleta mensagens. dry_run default.';
