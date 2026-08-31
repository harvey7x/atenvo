-- ============================================================================
-- RECUPERAÇÃO — Lote + Rodízio (31/08)
--
-- Fluxo do dono: sexta a gente prepara um LOTE dos leads da coluna Remarketing
-- aplicando um RODÍZIO (os leads da Giovana → Matheus faz o remarketing, etc.);
-- cada lead fica 'preparada' com um RESPONSÁVEL DE REMARKETING (≠ quem atendeu).
-- Segunda cada pessoa dá PLAY nos seus preparados → os toques do script saem
-- ESCALONADOS (anti-spam), pelo número da conversa. Reusa o motor da Fase 1.
-- ============================================================================

-- status 'preparada' + quem atendeu originalmente
alter table public.recuperacao_execucoes drop constraint if exists recuperacao_execucoes_status_check;
alter table public.recuperacao_execucoes add constraint recuperacao_execucoes_status_check
  check (status in ('preparada','ativa','recuperado','parada','concluida'));
alter table public.recuperacao_execucoes add column if not exists origem_responsavel_id uuid references public.usuarios(id);

-- 1 execução ativa OU preparada por contato (não prepara/roda duas vezes o mesmo)
drop index if exists public.uq_recup_ativa;
create unique index if not exists uq_recup_ativa on public.recuperacao_execucoes (contato_id) where status in ('ativa','preparada');

-- recuperacao_leads agora expõe a execução ativa OU preparada (com o responsável de remarketing)
create or replace function public.recuperacao_leads(p_org uuid)
returns table (
  oportunidade_id uuid, contato_id uuid, contato_nome text, contato_telefone text,
  responsavel_id uuid, responsavel_nome text, coluna_nome text, criado_em timestamptz,
  execucao_id uuid, execucao_status text, sequencia_nome text, toque_total int, iniciada_em timestamptz,
  remarketing_id uuid, remarketing_nome text
) language sql security definer set search_path = public as $fn$
  select o.id, o.contato_id, c.nome, c.telefone,
         o.responsavel_id, u.nome, fc.nome, o.criado_em,
         e.id, e.status, e.sequencia_nome, e.total_toques, e.iniciada_em,
         e.responsavel_id, ur.nome
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id and fc.nome ilike 'remarketing'
    join public.contatos c on c.id = o.contato_id
    left join public.usuarios u on u.id = o.responsavel_id
    left join public.recuperacao_execucoes e on e.oportunidade_id = o.id and e.status in ('ativa','preparada')
    left join public.usuarios ur on ur.id = e.responsavel_id
   where o.organizacao_id = p_org and o.status = 'em_andamento'
     and (is_platform_admin() or is_member(p_org))
   order by o.criado_em desc;
$fn$;

-- PREPARAR O LOTE: aplica o rodízio (p_rotacao = [{de, para}]) nos leads da coluna
-- Remarketing. Cada lead do atendente 'de' vira 'preparada' com responsavel = 'para'.
create or replace function public.recuperacao_preparar_lote(p_rotacao jsonb)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_par jsonb; v_de uuid; v_para uuid; v_lead record; v_n int := 0;
begin
  select organizacao_id into v_org from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo' limit 1;
  if v_org is null then raise exception 'sem_organizacao'; end if;
  if jsonb_typeof(coalesce(p_rotacao,'[]'::jsonb)) <> 'array' then raise exception 'rotacao_invalida'; end if;

  for v_par in select value from jsonb_array_elements(p_rotacao) loop
    v_de := nullif(v_par->>'de','')::uuid; v_para := nullif(v_par->>'para','')::uuid;
    if v_de is null or v_para is null then continue; end if;
    if not exists (select 1 from public.organizacao_usuarios where organizacao_id=v_org and usuario_id=v_para and status='ativo') then continue; end if;
    for v_lead in
      select o.id as opp, o.contato_id
        from public.oportunidades o
        join public.funil_colunas fc on fc.id = o.coluna_id and fc.nome ilike 'remarketing'
       where o.organizacao_id = v_org and o.status = 'em_andamento' and o.responsavel_id = v_de
         and not exists (select 1 from public.recuperacao_execucoes e where e.contato_id = o.contato_id and e.status in ('ativa','preparada'))
    loop
      insert into public.recuperacao_execucoes (organizacao_id, oportunidade_id, contato_id, responsavel_id, origem_responsavel_id, status, total_toques)
        values (v_org, v_lead.opp, v_lead.contato_id, v_para, v_de, 'preparada', 0);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $fn$;

-- PLAY: dispara os leads 'preparada' DO USUÁRIO com o script escolhido. Escalona
-- o início de cada lead (anti-spam), checa opt-out/canal por lead (pula quem não
-- pode, marcando 'parada'). Reusa o agendamento (mensagens_agendadas).
create or replace function public.recuperacao_play(p_sequencia uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_org uuid; v_seq public.recuperacao_sequencias; v_exec record; v_conv uuid; v_canalid uuid; v_canal public.canais%rowtype;
  v_k int := 0; v_ini int := 0; v_pul int := 0; v_base timestamptz; v_quando timestamptz;
  v_item jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_orig text; v_i int; v_tel text;
begin
  select organizacao_id into v_org from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo' limit 1;
  if v_org is null then raise exception 'sem_organizacao'; end if;
  select * into v_seq from public.recuperacao_sequencias where id = p_sequencia and organizacao_id = v_org;
  if v_seq.id is null then raise exception 'sequencia_nao_encontrada'; end if;
  if jsonb_array_length(coalesce(v_seq.toques,'[]'::jsonb)) < 1 then raise exception 'sequencia_vazia'; end if;

  for v_exec in select * from public.recuperacao_execucoes
                 where organizacao_id = v_org and responsavel_id = auth.uid() and status = 'preparada'
                 order by iniciada_em loop
    select id, canal_id into v_conv, v_canalid from public.conversas
     where contato_id = v_exec.contato_id and organizacao_id = v_org
     order by coalesce(ultima_entrada_em, criado_em) desc nulls last limit 1;
    select * into v_canal from public.canais where id = v_canalid and organizacao_id = v_org;
    select telefone into v_tel from public.contatos where id = v_exec.contato_id;

    if v_conv is null or v_canal.id is null or v_canal.ativo = false or v_canal.status_integracao::text <> 'conectado'
       or v_canal.envio_restrito or v_canal.conflito_com is not null or v_tel is null or length(regexp_replace(v_tel,'\D','','g')) < 10
       or public.wa_optout_ativo(v_exec.contato_id, v_canal.id) then
      update public.recuperacao_execucoes set status='parada', finalizada_em=now(), atualizada_em=now() where id = v_exec.id;
      v_pul := v_pul + 1; continue;
    end if;

    v_base := now() + interval '1 minute' + (v_k * interval '2 minutes');   -- escalona o início por lead
    v_quando := v_base; v_i := 0;
    for v_item in select value from jsonb_array_elements(v_seq.toques) loop
      v_tipo := coalesce(v_item->>'tipo','texto'); v_texto := nullif(trim(coalesce(v_item->>'texto','')),'');
      v_path := v_item->>'storage_path'; v_mime := coalesce(v_item->>'mime',''); v_nome := v_item->>'nome';
      v_tam := nullif(v_item->>'tamanho','')::bigint; v_orig := v_item->>'origem_audio';
      v_quando := v_quando + (coalesce(nullif(v_item->>'intervalo_horas','')::numeric, 0) * interval '1 hour');
      if v_tipo not in ('texto','imagem','audio','video','documento') then continue; end if;
      if v_tipo = 'texto' and v_texto is null then continue; end if;
      if v_tipo <> 'texto' and (v_path is null or left(v_path, length(v_org::text)+1) <> (v_org::text||'/')) then continue; end if;
      insert into public.mensagens_agendadas
        (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
         tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, sequencia_id, ordem_na_sequencia, metadados)
      values
        (v_org, v_conv, v_exec.contato_id, v_canal.id, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
         v_tipo, v_texto,
         case when v_tipo='texto' then null else v_path end, case when v_tipo='texto' then null else v_mime end,
         case when v_tipo='texto' then null else v_nome end, case when v_tipo='texto' then null else v_tam end,
         v_quando + (v_i * interval '2 seconds'), v_exec.id, v_i,
         jsonb_build_object('recuperacao_id', v_exec.id, 'toque', v_i)
           || case when v_tipo='audio' and v_orig is not null then jsonb_build_object('origem_audio', v_orig) else '{}'::jsonb end);
      v_i := v_i + 1;
    end loop;
    update public.recuperacao_execucoes
       set status='ativa', conversa_id=v_conv, canal_id=v_canal.id, sequencia_id=v_seq.id, sequencia_nome=v_seq.nome,
           total_toques=jsonb_array_length(v_seq.toques), iniciada_em=now(), atualizada_em=now()
     where id = v_exec.id;
    v_ini := v_ini + 1; v_k := v_k + 1;
  end loop;
  return jsonb_build_object('iniciadas', v_ini, 'puladas', v_pul);
end $fn$;

revoke execute on function public.recuperacao_preparar_lote(jsonb), public.recuperacao_play(uuid) from public, anon;
grant execute on function public.recuperacao_preparar_lote(jsonb), public.recuperacao_play(uuid) to authenticated;
