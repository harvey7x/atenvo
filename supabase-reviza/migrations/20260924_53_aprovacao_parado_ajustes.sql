-- =====================================================================
-- 53 — Ajustes da aprovação do débito parado (revisão adversarial da mig 52)
-- (a) TRAVA: parado_pendente nunca NULL — snapshots da Lixeira anteriores à
--     mig 52 não têm a chave e o restore (jsonb_populate_record) mandava NULL,
--     quebrando "Restaurar" de Novos antigos (NOT NULL 23502).
-- (b) TRAVA: quem não aprova não muda a SITUAÇÃO em nenhum sentido (entrar ou
--     sair da cobrança é com cadastro/financeiro/gestor/admin — igual ao botão
--     "Voltar pros Novos", que já era só deles). Antes só ativo→cancelado
--     era barrado e o Desfazer do comercial caía no próprio trigger.
-- (c) TRAVA: metadados do pedido/aprovação (quem pediu/aprovou e quando) só
--     mudam pelas RPCs, pra TODOS os papéis — a trilha fica confiável.
-- (d) remover_novos não apaga quem está "Aguardando aprovação".
-- (e) cancelar_parado: comercial só nos clientes dele; pedido já decidido
--     vira ERRO (antes era "ok/noop" e o Desfazer fingia sucesso).
-- (f) reabrir_parado (Desfazer do aprovar/recusar) confere o estado atual.
-- (g) Registros: pedir/aprovar/recusar/cancelar ganham texto próprio.
-- =====================================================================

-- (a)(b)(c) trava reescrita
create or replace function private.leads_guard_parado() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  -- snapshot antigo da Lixeira (sem a chave) chega NULL: vale o padrão
  new.parado_pendente := coalesce(new.parado_pendente, false);
  -- invariante: quem está em cobrança nunca está "aguardando aprovação"
  if new.situacao = 'cancelado' then new.parado_pendente := false; end if;
  -- as RPCs do fluxo (pedir/aprovar/recusar/cancelar/reabrir) já validaram tudo
  if coalesce(current_setting('reviza.fluxo_parado', true), '') = 'on' then return new; end if;
  -- sem usuário logado = serviço (cron, manutenção, import do sistema)
  if public.current_papel() is null then return new; end if;
  if tg_op = 'UPDATE' then
    -- quem pediu/aprovou e quando: só as RPCs escrevem (todos os papéis)
    if new.parado_solicitado_por is distinct from old.parado_solicitado_por
       or new.parado_solicitado_nome is distinct from old.parado_solicitado_nome
       or new.parado_solicitado_em is distinct from old.parado_solicitado_em
       or new.parado_aprovado_por is distinct from old.parado_aprovado_por
       or new.parado_aprovado_nome is distinct from old.parado_aprovado_nome
       or new.parado_aprovado_em is distinct from old.parado_aprovado_em then
      raise exception 'A aprovação do débito parado só muda pelos botões da tela Novos.' using errcode = '42501';
    end if;
    -- "aguardando" só muda pelas RPCs — ou pela invariante, quando um aprovador
    -- põe o cliente em cobrança direto
    if new.parado_pendente is distinct from old.parado_pendente
       and not (new.situacao = 'cancelado' and public.pode_aprovar_parado()) then
      raise exception 'A aprovação do débito parado só muda pelos botões da tela Novos.' using errcode = '42501';
    end if;
  end if;
  if public.pode_aprovar_parado() then return new; end if;
  if tg_op = 'INSERT' then
    if new.situacao = 'cancelado' then
      raise exception 'Cliente em cobrança precisa de aprovação: cadastre nos Novos e marque "débito parado".' using errcode = '42501';
    end if;
    new.parado_pendente := false;
    new.parado_solicitado_por := null; new.parado_solicitado_nome := null; new.parado_solicitado_em := null;
    new.parado_aprovado_por := null; new.parado_aprovado_nome := null; new.parado_aprovado_em := null;
    return new;
  end if;
  if old.situacao = 'ativo' and new.situacao = 'cancelado' then
    raise exception 'Débito parado precisa de aprovação (financeiro, cadastro ou administrador): use "Marcar débito parado" nos Novos.' using errcode = '42501';
  end if;
  if old.situacao is distinct from new.situacao then
    raise exception 'Tirar um cliente da cobrança é com o financeiro, o cadastro ou o administrador.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.leads_guard_parado() from public, anon, authenticated;

-- (d) "Remover todos os Novos" preserva a fila de aprovação
create or replace function public.remover_novos()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  with alvo as (
    select id from public.leads where situacao = 'ativo' and not parado_pendente for update
  ), del as (
    delete from public.leads l using alvo a where l.id = a.id returning l.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from del;
  return jsonb_build_object('removidos', to_jsonb(v_ids), 'n', coalesce(array_length(v_ids, 1), 0));
end $$;

-- (e) cancelar: comercial só nos dele; decidido = erro
create or replace function public.cancelar_parado(p_lead uuid, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype;
begin
  if public.current_papel() is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  if not public.pode_aprovar_parado() then
    -- coalesce: pedido de alguém já excluído (por=null) não pode virar "liberado pra todos"
    if not coalesce(l.parado_solicitado_por = auth.uid(), false) then
      raise exception 'so quem pediu (ou o financeiro/cadastro/administrador) pode cancelar' using errcode = '42501';
    end if;
    if public.current_papel() = 'comercial' and not public.comercial_dono(l.comercial) then
      raise exception 'este cliente nao e mais seu' using errcode = '42501';
    end if;
  end if;
  if not l.parado_pendente then
    raise exception 'este pedido ja foi decidido (aprovado ou recusado) — peca ao financeiro para reverter' using errcode = '22023';
  end if;
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set parado_pendente = false, data_parou = nullif(btrim(coalesce(p_data_parou, '')), '')
  where id = p_lead;
  return jsonb_build_object('ok', true);
end $$;

-- (f) reabrir (Desfazer do aprovar/recusar): só de um estado que veio dessas ações
create or replace function public.reabrir_parado(p_lead uuid, p_dia smallint, p_valor numeric, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  -- aprovado (em cobrança COM carimbo de aprovação) ou recusado (Novo sem pedido)
  if not ((l.situacao = 'cancelado' and l.parado_aprovado_em is not null)
          or (l.situacao = 'ativo' and not l.parado_pendente)) then
    raise exception 'nada para desfazer: o cliente mudou depois da decisao' using errcode = '22023';
  end if;
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set
    situacao = 'ativo', parado_pendente = true,
    dia = case when p_dia between 1 and 31 then p_dia else null end,
    valor = coalesce(p_valor, valor),
    data_parou = nullif(btrim(coalesce(p_data_parou, '')), ''),
    parado_aprovado_por = null, parado_aprovado_nome = null, parado_aprovado_em = null
  where id = p_lead;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.remover_novos()',
    'public.cancelar_parado(uuid, text)',
    'public.reabrir_parado(uuid, smallint, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- (g) Registros: texto próprio pro fluxo de aprovação (resto idêntico à versão viva)
create or replace function public.tg_registrar()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o jsonb := case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
  n jsonb := case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
  r jsonb := coalesce(n, o);
  v_acao text; v_ent text; v_id text; v_rot text; v_det text; v_mud jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;
  if TG_OP = 'DELETE' and pg_trigger_depth() > 1 then return OLD; end if;

  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'c', k,
             'de',   case when k='cpf' then '•••' else o->>k end,
             'para', case when k='cpf' then '•••' else n->>k end)), '[]'::jsonb)
      into v_mud
    from jsonb_object_keys(n) as k
    where (o->>k) is distinct from (n->>k)
      and k not in ('id','created_by','comprovante_path','celulas')
      and k !~ '(_id|_por|_em|_at|_path)$';
  end if;

  if TG_TABLE_NAME = 'leads' then
    v_ent := 'cliente'; v_id := r->>'id'; v_rot := r->>'nome';
    if TG_OP = 'INSERT' then v_acao := 'cadastrou'; v_det := 'novo cliente';
    elsif TG_OP = 'DELETE' then v_acao := 'excluiu'; v_det := 'removeu o cliente';
    else
      if v_mud = '[]'::jsonb then return NEW; end if;
      if o->>'situacao' is distinct from n->>'situacao' then
        v_acao := 'atualizou';
        v_det := case
          when n->>'situacao' = 'cancelado' and n->>'parado_aprovado_em' is not null
               and o->>'parado_aprovado_em' is distinct from n->>'parado_aprovado_em'
            then 'aprovou o débito parado (ciclo dia ' || coalesce(n->>'dia','—') || ')'
          when n->>'situacao' = 'cancelado' then 'marcou débito parado'
          when n->>'situacao' = 'ativo' and n->>'parado_pendente' = 'true' then 'desfez a aprovação do débito parado (voltou a aguardar)'
          when n->>'situacao' = 'ativo' then 'voltou o cliente para Novos'
          else 'mudou a situação' end;
      elsif o->>'parado_pendente' is distinct from n->>'parado_pendente' then
        v_acao := 'atualizou';
        v_det := case when n->>'parado_pendente' = 'true'
          then 'pediu aprovação do débito parado'
          else 'tirou o pedido de débito parado (recusado ou cancelado)' end;
      elsif o->>'dia' is distinct from n->>'dia' then
        v_acao := 'direcionou'; v_det := 'para o ciclo dia ' || coalesce(n->>'dia','—');
      else v_acao := 'editou'; v_det := 'atualizou o cadastro (' || jsonb_array_length(v_mud) || (case when jsonb_array_length(v_mud)=1 then ' campo)' else ' campos)' end); end if;
    end if;

  elsif TG_TABLE_NAME = 'entradas' then
    v_ent := 'pagamento'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    if TG_OP = 'INSERT' then
      v_acao := 'lançou'; v_det := 'informou pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
    elsif TG_OP = 'UPDATE' and o->>'estado' is distinct from n->>'estado' then
      v_acao := case n->>'estado' when 'confirmada' then 'confirmou' when 'recusada' then 'recusou' else 'atualizou' end;
      v_det := 'pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
      v_mud := '[]'::jsonb;
    else return coalesce(NEW, OLD); end if;

  elsif TG_TABLE_NAME = 'mov_fin' then
    v_ent := 'movimentação'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    v_acao := 'excluiu'; v_det := 'removeu do histórico ' || private.brl((r->>'valor')::numeric) || ' (' || public.comp_rotulo(r->>'comp') || ')';

  elsif TG_TABLE_NAME = 'comissoes' then
    if TG_OP = 'UPDATE' and o->>'pct' is not distinct from n->>'pct' then return NEW; end if;
    v_ent := 'comissão'; v_id := r->>'comercial'; v_rot := r->>'comercial';
    v_acao := case TG_OP when 'INSERT' then 'definiu' else 'alterou' end;
    v_det := 'comissão de ' || (r->>'pct') || '% da mensalidade' || case when TG_OP='UPDATE' then ' (antes ' || (o->>'pct') || '%)' else '' end;
    v_mud := '[]'::jsonb;

  elsif TG_TABLE_NAME = 'wa_regua_config' then
    v_ent := 'régua'; v_acao := 'configurou';
    if o->>'ativa' is distinct from n->>'ativa' then
      v_det := case n->>'ativa' when 'true' then 'ligou a régua automática' else 'desligou a régua automática' end;
    elsif o->>'hora_envio' is distinct from n->>'hora_envio' then
      v_det := 'mudou o horário do disparo para ' || (n->>'hora_envio') || 'h (antes ' || (o->>'hora_envio') || 'h)';
    else return NEW; end if;
    v_mud := '[]'::jsonb;

  elsif TG_TABLE_NAME = 'wa_regua_msgs' then
    v_ent := 'mensagem da régua'; v_id := r->>'id'; v_rot := coalesce(nullif(r->>'nome',''), 'mensagem');
    v_acao := case TG_OP when 'INSERT' then 'criou' when 'DELETE' then 'excluiu' else 'editou' end;
    if TG_OP='UPDATE' and v_mud = '[]'::jsonb then return NEW; end if;

  elsif TG_TABLE_NAME = 'wa_envios' then
    v_ent := 'envio'; v_id := r->>'id'; v_rot := r->>'nome'; v_acao := 'criou'; v_det := 'novo envio de mensagens';

  elsif TG_TABLE_NAME = 'avisos' then
    v_ent := 'aviso'; v_id := r->>'id'; v_rot := left(coalesce(r->>'corpo',''), 60);
    v_acao := case TG_OP when 'INSERT' then 'publicou' else 'excluiu' end;

  else return coalesce(NEW, OLD);
  end if;

  insert into public.registros(ator_id, ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe, mudancas)
  values (auth.uid(),
    coalesce((select nome from public.profiles where id = auth.uid()), '—'),
    (select papel::text from public.profiles where id = auth.uid()),
    v_acao, v_ent, v_id, v_rot, v_det, coalesce(v_mud,'[]'::jsonb));
  return coalesce(NEW, OLD);
end $function$;
