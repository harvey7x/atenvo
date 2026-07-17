-- ============================================================================
-- merge_contatos × trava "uma conversa ativa por contato".
--
-- BUG: o merge (20260711130000/140000) é ANTERIOR ao índice parcial criado em 20260714160000:
--   CREATE UNIQUE INDEX conversas_uma_ativa_por_contato ON conversas (contato_id)
--     WHERE (status <> 'fechada' AND arquivada_em IS NULL)
-- Ao mover as conversas do absorvido, se AMBOS tinham conversa ativa o sobrevivente ficaria com
-- duas → 23505 e o merge abortava. Na prática travava 21/21 dos duplicados de 9º dígito (todo
-- duplicado desse tipo tem conversa ativa dos dois lados). Nenhum merge era possível.
--
-- CORREÇÃO (conservadora, decidida pelo dono): NÃO funde mensagens e NÃO usa
-- unificar_conversa_duplicada. Apenas:
--   1) conversas fechadas/arquivadas do absorvido → movem normalmente;
--   2) conversa ATIVA do absorvido:
--      - sobrevivente SEM ativa → move e mantém ativa;
--      - sobrevivente COM ativa → move ARQUIVANDO no MESMO UPDATE (arquivada_em=now()), então o
--        índice parcial não se aplica e não há colisão. Status/mensagens/histórico preservados.
-- A constraint continua válida e ativa — nada é removido/desabilitado, nada por fora da RPC.
--
-- ROLLBACK: o desfazer_merge só devolvia contato_id e deixaria a conversa arquivada (reversão
-- infiel). Agora o merge registra em linhas_movidas.conversas_arquivadas_pelo_merge quais conversas
-- ELE arquivou, e o desfazer DESARQUIVA exatamente essas — voltando ao estado original.
--
-- Nenhum merge é executado aqui. Nada é apagado.
-- ============================================================================

create or replace function public.merge_contatos(
  p_sobrevivente uuid, p_absorvido uuid,
  p_dry_run boolean default true, p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
  s public.contatos; a public.contatos;
  v_org uuid;
  v_duros text[] := '{}'; v_brandos text[] := '{}';
  v_plano jsonb; v_ident_dedupe int; v_ident_princ int;
  v_denylist text[] := array['5181602825'];
  v_seguro boolean; v_resultado jsonb;
  v_merge_id uuid; v_linhas jsonb; v_ident_rem jsonb;
  v_conv_arq uuid;   -- conversa ATIVA do absorvido que ESTE merge vai arquivar (p/ o rollback desfazer)
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

  -- DUROS
  if exists (select 1 from public.oportunidades o1 join public.oportunidades o2
               on o1.funil_id=o2.funil_id and o1.organizacao_id=o2.organizacao_id
             where o1.contato_id=p_sobrevivente and o1.status='em_andamento'
               and o2.contato_id=p_absorvido    and o2.status='em_andamento')
  then v_duros := array_append(v_duros,'ambos_opp_aberta_mesmo_funil'); end if;
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
  if exists (select 1 from public.contato_identidades ai
             where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
               and exists (select 1 from public.contato_identidades oi
                           where oi.tipo=ai.tipo and oi.valor_normalizado=ai.valor_normalizado
                             and oi.contato_id not in (p_sobrevivente,p_absorvido)))
  then v_duros := array_append(v_duros,'colisao_identidade_terceiro'); end if;

  -- BRANDOS
  if exists (select 1 from public.oportunidades where contato_id=p_absorvido and status in ('ganho','perdido'))
     and not exists (select 1 from public.oportunidades where contato_id=p_sobrevivente and status in ('ganho','perdido'))
  then v_brandos := array_append(v_brandos,'opp_fechada_no_absorvido'); end if;
  if public.chave_canonica_telefone(s.telefone) is distinct from public.chave_canonica_telefone(a.telefone)
  then v_brandos := array_append(v_brandos,'nao_eh_par_canonico'); end if;
  ns := lower(coalesce(s.nome,'')); na := lower(coalesce(a.nome,''));
  if ns !~ '^\d+$' and na !~ '^\d+$' and length(ns)>2 and length(na)>2
     and position(split_part(na,' ',1) in ns)=0 and position(split_part(ns,' ',1) in na)=0
  then v_brandos := array_append(v_brandos,'nome_divergente'); end if;

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

  if p_dry_run then return v_resultado || jsonb_build_object('status','dry_run'); end if;

  if coalesce(array_length(v_duros,1),0) > 0 then
    raise exception 'merge_bloqueado_duro: %', array_to_string(v_duros,',');
  end if;
  if coalesce(array_length(v_brandos,1),0) > 0 and not p_forcar then
    raise exception 'merge_bloqueado_brando (use p_forcar=true): %', array_to_string(v_brandos,',');
  end if;

  select coalesce(jsonb_agg(to_jsonb(ai)),'[]'::jsonb) into v_ident_rem
    from public.contato_identidades ai
    where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
      and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                  and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado);

  -- flat {t,id} — NÃO inclui bot_conversa_estado (PK = conversa_id, tratado à parte)
  select coalesce(jsonb_agg(jsonb_build_object('t',t,'id',id)),'[]'::jsonb) into v_linhas from (
      select 'conversas' t, id from public.conversas where contato_id=p_absorvido
      union all select 'oportunidades', id from public.oportunidades where contato_id=p_absorvido
      union all select 'cobrancas', id from public.cobrancas where contato_id=p_absorvido
      union all select 'meta_contato_identidades', id from public.meta_contato_identidades where contato_id=p_absorvido
      union all select 'agendamentos', id from public.agendamentos where contato_id=p_absorvido
      union all select 'sla_alertas', id from public.sla_alertas where contato_id=p_absorvido
      union all select 'contato_identidades', ai.id from public.contato_identidades ai
        where ai.contato_id=p_absorvido
          and not (ai.valor_normalizado is not null
                   and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                               and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado))
  ) q;

  -- Conversa ATIVA do absorvido que precisará ser ARQUIVADA (porque o sobrevivente já tem uma ativa
  -- e a trava conversas_uma_ativa_por_contato só admite uma). Determinado ANTES de mover, para o
  -- snapshot saber exatamente o que o rollback deve desarquivar. Se o sobrevivente não tem ativa,
  -- fica null e a conversa do absorvido é movida mantendo-se ativa.
  -- (alias cvs/cva: NÃO usar `s`/`a` — colidem com os records `s`(sobrevivente)/`a`(absorvido) do declare)
  select cva.id into v_conv_arq from public.conversas cva
   where cva.contato_id = p_absorvido and cva.status <> 'fechada' and cva.arquivada_em is null
     and exists (select 1 from public.conversas cvs
                  where cvs.contato_id = p_sobrevivente and cvs.status <> 'fechada' and cvs.arquivada_em is null)
   limit 1;

  insert into public.contato_merges(organizacao_id, sobrevivente_id, absorvido_id, snapshot_sobrevivente, snapshot_absorvido, linhas_movidas, executado_por)
  values (v_org, p_sobrevivente, p_absorvido, to_jsonb(s), to_jsonb(a),
          jsonb_build_object('movidas', v_linhas, 'identidades_removidas', v_ident_rem,
                             'conversas_arquivadas_pelo_merge',
                             case when v_conv_arq is null then '[]'::jsonb else jsonb_build_array(v_conv_arq) end),
          auth.uid())
  returning id into v_merge_id;

  delete from public.contato_identidades ai
    where ai.contato_id=p_absorvido and ai.valor_normalizado is not null
      and exists (select 1 from public.contato_identidades si where si.contato_id=p_sobrevivente
                  and si.tipo=ai.tipo and si.valor_normalizado=ai.valor_normalizado);
  update public.contato_identidades set contato_id=p_sobrevivente, principal=false, atualizado_em=now()
    where contato_id=p_absorvido;

  -- CONVERSAS (respeita conversas_uma_ativa_por_contato):
  --  1) tudo que NÃO é a conversa a arquivar (fechadas/arquivadas + a ativa quando o sobrevivente
  --     não tem nenhuma) move normalmente, preservando o estado.
  update public.conversas set contato_id=p_sobrevivente
   where contato_id=p_absorvido and (v_conv_arq is null or id <> v_conv_arq);
  --  2) a conversa ativa do absorvido quando o sobrevivente JÁ tem uma: move ARQUIVANDO no MESMO
  --     UPDATE — o índice parcial não se aplica à linha arquivada, então não colide. Nada é apagado:
  --     status, mensagens e histórico continuam, só saem da fila ativa.
  if v_conv_arq is not null then
    update public.conversas
       set contato_id=p_sobrevivente, arquivada_em=now(), arquivada_por=auth.uid()
     where id=v_conv_arq;
  end if;
  update public.oportunidades            set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.cobrancas                set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.meta_contato_identidades set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.agendamentos             set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.sla_alertas              set contato_id=p_sobrevivente where contato_id=p_absorvido;
  update public.bot_conversa_estado      set contato_id=p_sobrevivente where contato_id=p_absorvido; -- por contato (PK=conversa_id)

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

  update public.contatos set mesclado_em=now(), mesclado_para=p_sobrevivente, atualizado_em=now()
    where id=p_absorvido;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (v_org, auth.uid(), 'merge_contatos', 'contatos', p_sobrevivente,
          jsonb_build_object('absorvido', p_absorvido),
          v_resultado || jsonb_build_object('merge_id', v_merge_id, 'forcado', p_forcar));

  return v_resultado || jsonb_build_object('status','executado','merge_id',v_merge_id);
end $fn$;

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

  for r in select value->>'t' t, (value->>'id')::uuid id from jsonb_array_elements(cm.linhas_movidas->'movidas') loop
    execute format('update public.%I set contato_id=$1 where id=$2 and contato_id=$3', r.t)
      using cm.absorvido_id, r.id, cm.sobrevivente_id;
  end loop;
  -- bot_conversa_estado: re-sincroniza pela conversa revertida (PK = conversa_id)
  update public.bot_conversa_estado bce set contato_id=cm.absorvido_id
    from public.conversas c
    where c.id=bce.conversa_id and c.contato_id=cm.absorvido_id and bce.contato_id=cm.sobrevivente_id;

  -- DESARQUIVA exatamente as conversas que ESTE merge arquivou (reversão fiel: a conversa volta ao
  -- absorvido no estado ATIVO em que estava). Só as registradas — nunca conversas arquivadas por
  -- humano/outro fluxo. O absorvido não tem outra ativa, então a trava não colide; se colidir, a
  -- exceção aborta o desfazer inteiro (nada pela metade).
  update public.conversas c set arquivada_em=null, arquivada_por=null
    where c.contato_id=cm.absorvido_id
      and c.id in (select (value #>> '{}')::uuid
                     from jsonb_array_elements(coalesce(cm.linhas_movidas->'conversas_arquivadas_pelo_merge','[]'::jsonb)));

  for ident in select value from jsonb_array_elements(cm.linhas_movidas->'identidades_removidas') loop
    insert into public.contato_identidades select * from jsonb_populate_record(null::public.contato_identidades, ident)
    on conflict (id) do nothing;
  end loop;

  update public.contatos c set
    cpf         = nullif(cm.snapshot_sobrevivente->>'cpf',''),
    email       = nullif(cm.snapshot_sobrevivente->>'email',''),
    nome        = cm.snapshot_sobrevivente->>'nome',
    telefone    = nullif(cm.snapshot_sobrevivente->>'telefone',''),
    observacoes = nullif(cm.snapshot_sobrevivente->>'observacoes',''),
    etiquetas   = coalesce((select array(select jsonb_array_elements_text(cm.snapshot_sobrevivente->'etiquetas'))), '{}'::text[]),
    atualizado_em = now()
    where c.id=cm.sobrevivente_id;
  update public.contatos set mesclado_em=null, mesclado_para=null, atualizado_em=now() where id=cm.absorvido_id;
  update public.contato_merges set desfeito_em=now(), desfeito_por=auth.uid() where id=p_merge_id;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (cm.organizacao_id, auth.uid(), 'desfazer_merge', 'contatos', cm.sobrevivente_id,
          jsonb_build_object('merge_id', p_merge_id, 'absorvido', cm.absorvido_id));
  return v_res || jsonb_build_object('status','desfeito');
end $fn$;
