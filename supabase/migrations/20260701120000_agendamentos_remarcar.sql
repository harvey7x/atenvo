-- Etapa 1 (final): remarcação atômica + concorrência otimista.
-- Semântica: após remarcar, o evento fica 'remarcado' até nova confirmação (Confirmar -> 'confirmado').
-- Não cria segundo agendamento: é o MESMO registro que muda de período (histórico preserva o anterior).

create or replace function public.remarcar_agendamento(
  p_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text,
  p_atualizado_em_esperado timestamptz default null,
  p_forcar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.agendamentos;
  v_papel text;
  v_gestor boolean;
  v_conf record;
  v_nome text;
begin
  select * into v_row from public.agendamentos where id = p_id for update;
  if not found then raise exception 'nao_encontrado' using errcode = 'no_data_found'; end if;

  -- 1. permissões (mesma regra do UPDATE RLS): gestor edita a org; atendente só os próprios.
  v_papel := public.papel_org(v_row.organizacao_id);
  if v_papel is null then raise exception 'sem_permissao' using errcode = '42501'; end if;
  v_gestor := v_papel in ('admin', 'supervisor');
  if not v_gestor and not (v_row.criado_por = auth.uid() or v_row.atendente_id = auth.uid()) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  -- concorrência otimista: registro mudou desde a abertura?
  if p_atualizado_em_esperado is not null and v_row.atualizado_em is distinct from p_atualizado_em_esperado then
    raise exception 'conflito_concorrencia' using errcode = '40001';
  end if;

  -- 2. novo período válido + motivo obrigatório
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'motivo_obrigatorio' using errcode = '23514'; end if;
  if p_fim <= p_inicio then raise exception 'periodo_invalido' using errcode = '23514'; end if;

  -- 3. conflito de horário do MESMO atendente (ignora este registro e cancelados)
  if v_row.atendente_id is not null then
    select a.inicio_em, a.fim_em into v_conf
    from public.agendamentos a
    where a.organizacao_id = v_row.organizacao_id
      and a.atendente_id = v_row.atendente_id
      and a.id <> p_id
      and a.status <> 'cancelado'
      and a.inicio_em < p_fim and a.fim_em > p_inicio
    order by a.inicio_em limit 1;
    if found then
      -- atendente comum NÃO contorna; gestor pode com confirmação consciente (p_forcar)
      if not (v_gestor and p_forcar) then
        select nome into v_nome from public.usuarios where id = v_row.atendente_id;
        return jsonb_build_object(
          'status', 'conflito',
          'atendente', coalesce(v_nome, 'O atendente'),
          'inicio', to_char(v_conf.inicio_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'fim', to_char(v_conf.fim_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'pode_forcar', v_gestor
        );
      end if;
    end if;
  end if;

  -- 4-8. atualiza período + status + motivo (executor/valores anteriores/novos ficam no histórico via trigger agendamentos_log)
  -- 9. vínculo com contato preservado (contato_id não é tocado)
  update public.agendamentos
     set inicio_em = p_inicio, fim_em = p_fim, status = 'remarcado', motivo_remarcacao = p_motivo
   where id = p_id;

  select atualizado_em into v_row.atualizado_em from public.agendamentos where id = p_id;
  return jsonb_build_object('status', 'ok', 'atualizado_em', v_row.atualizado_em);
end $$;

revoke all on function public.remarcar_agendamento(uuid, timestamptz, timestamptz, text, timestamptz, boolean) from public, anon;
grant execute on function public.remarcar_agendamento(uuid, timestamptz, timestamptz, text, timestamptz, boolean) to authenticated, service_role;
notify pgrst, 'reload schema';
