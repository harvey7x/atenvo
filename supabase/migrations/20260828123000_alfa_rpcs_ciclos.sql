-- ============================================================
-- FASE 1 Alfa — M4: RPCs do modo Cobrança com ciclos de vencimento
-- Padrão da casa: SECURITY DEFINER + search_path=public, evento em
-- cobranca_eventos com usuario_id = auth.uid(), revoke public/anon.
-- Permissão NOVA desta fase: gestor da org OU responsável da cobrança
-- (cobranca_gestor continua valendo para quem já era gestor).
-- ============================================================

-- permissão: admin/supervisor da org (cobranca_gestor) OU responsavel_id
create or replace function public.cobranca_pode_operar(p_cobranca uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cobrancas c
    where c.id = p_cobranca
      and (public.cobranca_gestor(c.organizacao_id) or c.responsavel_id = auth.uid())
  );
$$;
revoke all on function public.cobranca_pode_operar(uuid) from public, anon;
grant execute on function public.cobranca_pode_operar(uuid) to authenticated;

-- hook da Fase 3 (régua de cobrança): no-op DOCUMENTADO por enquanto.
-- Quando a régua existir, esta função cancela lembretes/mensagens
-- pendentes do pagamento recém-baixado. Criada agora para o
-- marcar_pagamento_pago já nascer chamando o ponto certo.
create or replace function public.cancelar_regua_cobranca(p_pagamento uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- no-op (Fase 3): nada a cancelar ainda.
  return;
end $$;
revoke all on function public.cancelar_regua_cobranca(uuid) from public, anon;
grant execute on function public.cancelar_regua_cobranca(uuid) to authenticated;

-- baixa com valor editável (pagamento em dobro após falta é prática comum)
create or replace function public.marcar_pagamento_pago(
  p_pagamento uuid, p_valor_pago numeric, p_observacao text default null
) returns public.cobranca_pagamentos
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos; v_status_cob public.cobranca_status;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if p_valor_pago is null or p_valor_pago <= 0 then raise exception 'valor_pago_invalido'; end if;
  select * into r from public.cobranca_pagamentos where id = p_pagamento for update;
  if not found then raise exception 'pagamento_nao_encontrado'; end if;
  if not public.cobranca_pode_operar(r.cobranca_id) then raise exception 'sem_permissao'; end if;
  select status into v_status_cob from public.cobrancas where id = r.cobranca_id;
  if v_status_cob = 'cancelado' then raise exception 'cobranca_cancelada'; end if;
  if r.status = 'paga' then raise exception 'pagamento_ja_pago'; end if;
  if r.status = 'cancelada' then raise exception 'pagamento_cancelado'; end if;

  update public.cobranca_pagamentos
     set status = 'paga', valor_pago = p_valor_pago, data_pagamento = current_date,
         marcado_por = v_uid, marcado_em = now()
   where id = p_pagamento
   returning * into r;

  insert into public.cobranca_eventos (organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
  values (r.organizacao_id, r.cobranca_id, 'parcela_paga', 'Baixa de parcela ' || r.ciclo,
          jsonb_build_object('parcela', p_pagamento, 'valor_pago', p_valor_pago,
                             'competencia', r.competencia, 'data', r.data_pagamento, 'obs', p_observacao),
          v_uid);

  perform public.cancelar_regua_cobranca(p_pagamento);
  return r;
end $$;
revoke all on function public.marcar_pagamento_pago(uuid, numeric, text) from public, anon;
grant execute on function public.marcar_pagamento_pago(uuid, numeric, text) to authenticated;

-- desfaz baixa: volta 'prevista' com snapshot anterior no evento
create or replace function public.desfazer_pagamento(p_pagamento uuid)
returns public.cobranca_pagamentos
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r public.cobranca_pagamentos;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select * into r from public.cobranca_pagamentos where id = p_pagamento for update;
  if not found then raise exception 'pagamento_nao_encontrado'; end if;
  if not public.cobranca_pode_operar(r.cobranca_id) then raise exception 'sem_permissao'; end if;
  if r.status <> 'paga' then raise exception 'pagamento_nao_esta_pago'; end if;

  insert into public.cobranca_eventos (organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
  values (r.organizacao_id, r.cobranca_id, 'pagamento_desfeito', 'Baixa desfeita da parcela ' || r.ciclo,
          jsonb_build_object('parcela', p_pagamento,
                             'anterior', jsonb_build_object(
                               'status', r.status, 'valor_pago', r.valor_pago,
                               'data_pagamento', r.data_pagamento,
                               'marcado_por', r.marcado_por, 'marcado_em', r.marcado_em)),
          v_uid);

  update public.cobranca_pagamentos
     set status = 'prevista', valor_pago = null, data_pagamento = null,
         marcado_por = null, marcado_em = null
   where id = p_pagamento
   returning * into r;
  return r;
end $$;
revoke all on function public.desfazer_pagamento(uuid) from public, anon;
grant execute on function public.desfazer_pagamento(uuid) to authenticated;

-- reajuste sem rastro é proibido: valor_mensal só muda com evento
create or replace function public.alterar_mensalidade(p_cobranca uuid, p_novo_valor numeric)
returns public.cobrancas
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.cobrancas;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if p_novo_valor is null or p_novo_valor <= 0 then raise exception 'valor_invalido'; end if;
  select * into c from public.cobrancas where id = p_cobranca for update;
  if not found then raise exception 'cobranca_nao_encontrada'; end if;
  if not public.cobranca_pode_operar(p_cobranca) then raise exception 'sem_permissao'; end if;
  if c.status = 'cancelado' then raise exception 'cobranca_cancelada'; end if;

  insert into public.cobranca_eventos (organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
  values (c.organizacao_id, c.id, 'mensalidade_alterada',
          'Mensalidade alterada de ' || coalesce(c.valor_mensal::text, '—') || ' para ' || p_novo_valor,
          jsonb_build_object('anterior', c.valor_mensal, 'novo', p_novo_valor), v_uid);

  update public.cobrancas set valor_mensal = p_novo_valor where id = p_cobranca returning * into c;
  return c;
end $$;
revoke all on function public.alterar_mensalidade(uuid, numeric) from public, anon;
grant execute on function public.alterar_mensalidade(uuid, numeric) to authenticated;

-- chave da senha INSS: vive SÓ no Vault (secret 'senha_inss_key');
-- helper interno sem grant a usuário final (padrão meta_get_secret)
create or replace function public._senha_inss_chave()
returns text language sql stable security definer
set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'senha_inss_key' limit 1;
$$;
revoke all on function public._senha_inss_chave() from public, anon, authenticated;

-- revela a senha Meu INSS: permissão + EVENTO antes de retornar
create or replace function public.revelar_senha_inss(p_cobranca uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.cobrancas; v_chave text;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select * into c from public.cobrancas where id = p_cobranca;
  if not found then raise exception 'cobranca_nao_encontrada'; end if;
  if not public.cobranca_pode_operar(p_cobranca) then raise exception 'sem_permissao'; end if;
  if c.senha_inss_cifrada is null then raise exception 'senha_inss_ausente'; end if;
  v_chave := public._senha_inss_chave();
  if v_chave is null then raise exception 'chave_nao_configurada'; end if;

  insert into public.cobranca_eventos (organizacao_id, cobranca_id, tipo, descricao, dados, usuario_id)
  values (c.organizacao_id, c.id, 'senha_revelada', 'Senha Meu INSS revelada', '{}'::jsonb, v_uid);

  return pgp_sym_decrypt(c.senha_inss_cifrada, v_chave);
end $$;
revoke all on function public.revelar_senha_inss(uuid) from public, anon;
grant execute on function public.revelar_senha_inss(uuid) to authenticated;

-- gera os pagamentos 'prevista' de uma competência (idempotente):
-- cobrança ativa com ciclo → 1 pagamento por competência, vencimento
-- do calendário do ciclo, ciclo sequencial. Quem já tem, pula.
create or replace function public.gerar_pagamentos_competencia(p_organizacao uuid, p_competencia date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_comp date := date_trunc('month', p_competencia)::date; v_n int := 0; r record;
begin
  -- uid null = contexto de job (cron/service); usuário final precisa ser gestor
  if auth.uid() is not null and not public.cobranca_gestor(p_organizacao) then
    raise exception 'sem_permissao';
  end if;
  for r in
    select c.id as cobranca_id, c.organizacao_id, c.valor_mensal, cvc.vencimento
      from public.cobrancas c
      join public.ciclo_vencimento_competencias cvc
        on cvc.ciclo_vencimento_id = c.ciclo_vencimento_id and cvc.competencia = v_comp
     where c.organizacao_id = p_organizacao
       and c.status = 'ativo'
       and c.ciclo_vencimento_id is not null
       and not exists (select 1 from public.cobranca_pagamentos p
                        where p.cobranca_id = c.id and p.competencia = v_comp)
  loop
    insert into public.cobranca_pagamentos
      (organizacao_id, cobranca_id, ciclo, valor, data_prevista, competencia, status)
    values
      (r.organizacao_id, r.cobranca_id,
       (select coalesce(max(ciclo), 0) + 1 from public.cobranca_pagamentos where cobranca_id = r.cobranca_id),
       r.valor_mensal, r.vencimento, v_comp, 'prevista');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.gerar_pagamentos_competencia(uuid, date) from public, anon;
grant execute on function public.gerar_pagamentos_competencia(uuid, date) to authenticated;

-- garante 3 competências à frente por ciclo, clonando o dia do mês da
-- última existente com clamp no fim do mês (ciclo sem competência: pula)
create or replace function public.garantir_competencias_futuras()
returns int
language plpgsql security definer set search_path = public as $$
declare v_alvo date := (date_trunc('month', now()) + interval '3 months')::date; v_n int := 0;
        r record; v_comp date; v_venc date; v_dia int;
begin
  for r in
    select cvc.ciclo_vencimento_id, cv.organizacao_id,
           max(cvc.competencia) as ultima_comp
      from public.ciclo_vencimento_competencias cvc
      join public.ciclos_vencimento cv on cv.id = cvc.ciclo_vencimento_id
     group by 1, 2
  loop
    select vencimento into v_venc from public.ciclo_vencimento_competencias
     where ciclo_vencimento_id = r.ciclo_vencimento_id and competencia = r.ultima_comp;
    v_dia := extract(day from v_venc)::int;
    v_comp := r.ultima_comp;
    while v_comp < v_alvo loop
      v_comp := (v_comp + interval '1 month')::date;
      v_venc := make_date(
        extract(year from v_comp)::int, extract(month from v_comp)::int,
        least(v_dia, extract(day from (date_trunc('month', v_comp) + interval '1 month - 1 day'))::int));
      insert into public.ciclo_vencimento_competencias
        (ciclo_vencimento_id, organizacao_id, competencia, vencimento)
      values (r.ciclo_vencimento_id, r.organizacao_id, v_comp, v_venc)
      on conflict (ciclo_vencimento_id, competencia) do nothing;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.garantir_competencias_futuras() from public, anon, authenticated;

-- editar o vencimento de uma competência sincroniza a data_prevista
-- dos pagamentos ainda 'prevista' daquela competência/ciclo (pagos intocados)
create or replace function public.fn_cvc_sync_vencimento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.cobranca_pagamentos p
     set data_prevista = new.vencimento
    from public.cobrancas c
   where c.id = p.cobranca_id
     and c.ciclo_vencimento_id = new.ciclo_vencimento_id
     and p.competencia = new.competencia
     and p.status = 'prevista';
  return new;
end $$;
drop trigger if exists trg_cvc_sync_vencimento on public.ciclo_vencimento_competencias;
create trigger trg_cvc_sync_vencimento
  after update of vencimento on public.ciclo_vencimento_competencias
  for each row when (new.vencimento is distinct from old.vencimento)
  execute function public.fn_cvc_sync_vencimento();

-- rotina mensal (cron): estende calendários e gera a competência corrente
create or replace function public.cobranca_ciclo_mensal()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public.garantir_competencias_futuras();
  for r in select distinct organizacao_id from public.ciclos_vencimento loop
    perform public.gerar_pagamentos_competencia(r.organizacao_id, date_trunc('month', now())::date);
  end loop;
end $$;
revoke all on function public.cobranca_ciclo_mensal() from public, anon, authenticated;

-- cron.schedule é upsert por jobname (padrão alerta-lead-quente)
select cron.schedule('cobranca-ciclos-mensal', '0 4 1 * *',
  $cron$ select public.cobranca_ciclo_mensal(); $cron$);
