-- Reviza — registros: não logar exclusões em CASCADE (revisão adversarial).
-- Ao excluir um cliente, os filhos on delete cascade (ex.: wa_regua_msgs do
-- cliente) eram apagados e geravam "excluiu mensagem da régua" — ações que o
-- admin nunca fez. pg_trigger_depth() > 1 = disparo aninhado (cascade) → pula.
-- Só a função muda; os gatilhos ficam. Aplicada 2026-09-14 (reviza_35).

create or replace function public.tg_registrar() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
  n jsonb := case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
  r jsonb := coalesce(n, o);
  v_acao text; v_ent text; v_id text; v_rot text; v_det text;
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;
  -- exclusão em cascade (filho apagado junto do pai) não é ação manual: ignora
  if TG_OP = 'DELETE' and pg_trigger_depth() > 1 then return OLD; end if;

  if TG_TABLE_NAME = 'leads' then
    v_ent := 'cliente'; v_id := r->>'id'; v_rot := r->>'nome';
    if TG_OP = 'INSERT' then v_acao := 'cadastrou'; v_det := 'novo cliente';
    elsif TG_OP = 'DELETE' then v_acao := 'excluiu'; v_det := 'removeu o cliente';
    else
      if o->>'situacao' is distinct from n->>'situacao' then
        v_acao := 'atualizou';
        v_det := case n->>'situacao' when 'cancelado' then 'marcou débito parado' when 'ativo' then 'voltou o cliente para Novos' else 'mudou a situação' end;
      elsif o->>'dia' is distinct from n->>'dia' then
        v_acao := 'direcionou'; v_det := 'para o ciclo dia ' || coalesce(n->>'dia','—');
      else v_acao := 'editou'; v_det := 'atualizou o cadastro'; end if;
    end if;

  elsif TG_TABLE_NAME = 'entradas' then
    v_ent := 'pagamento'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    if TG_OP = 'INSERT' then
      v_acao := 'lançou'; v_det := 'informou pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
    elsif TG_OP = 'UPDATE' and o->>'estado' is distinct from n->>'estado' then
      v_acao := case n->>'estado' when 'confirmada' then 'confirmou' when 'recusada' then 'recusou' else 'atualizou' end;
      v_det := 'pagamento de ' || private.brl((n->>'valor')::numeric) || ' (' || public.comp_rotulo(n->>'comp') || ')';
    else return coalesce(NEW, OLD); end if;

  elsif TG_TABLE_NAME = 'mov_fin' then
    v_ent := 'movimentação'; v_id := r->>'id'; v_rot := r->>'lead_nome';
    v_acao := 'excluiu'; v_det := 'removeu do histórico ' || private.brl((r->>'valor')::numeric) || ' (' || public.comp_rotulo(r->>'comp') || ')';

  elsif TG_TABLE_NAME = 'comissoes' then
    if TG_OP = 'UPDATE' and o->>'pct' is not distinct from n->>'pct' then return NEW; end if;
    v_ent := 'comissão'; v_id := r->>'comercial'; v_rot := r->>'comercial';
    v_acao := case TG_OP when 'INSERT' then 'definiu' else 'alterou' end;
    v_det := 'comissão de ' || (r->>'pct') || '% da mensalidade';

  elsif TG_TABLE_NAME = 'wa_regua_config' then
    v_ent := 'régua'; v_acao := 'configurou';
    if o->>'ativa' is distinct from n->>'ativa' then
      v_det := case n->>'ativa' when 'true' then 'ligou a régua automática' else 'desligou a régua automática' end;
    elsif o->>'hora_envio' is distinct from n->>'hora_envio' then
      v_det := 'mudou o horário do disparo para ' || (n->>'hora_envio') || 'h';
    else return NEW; end if;

  elsif TG_TABLE_NAME = 'wa_regua_msgs' then
    v_ent := 'mensagem da régua'; v_id := r->>'id'; v_rot := coalesce(nullif(r->>'nome',''), 'mensagem');
    v_acao := case TG_OP when 'INSERT' then 'criou' when 'DELETE' then 'excluiu' else 'editou' end;

  elsif TG_TABLE_NAME = 'wa_envios' then
    v_ent := 'envio'; v_id := r->>'id'; v_rot := r->>'nome'; v_acao := 'criou'; v_det := 'novo envio de mensagens';

  elsif TG_TABLE_NAME = 'avisos' then
    v_ent := 'aviso'; v_id := r->>'id'; v_rot := left(coalesce(r->>'corpo',''), 60);
    v_acao := case TG_OP when 'INSERT' then 'publicou' else 'excluiu' end;

  else return coalesce(NEW, OLD);
  end if;

  insert into public.registros(ator_id, ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe)
  values (auth.uid(),
    coalesce((select nome from public.profiles where id = auth.uid()), '—'),
    (select papel::text from public.profiles where id = auth.uid()),
    v_acao, v_ent, v_id, v_rot, v_det);
  return coalesce(NEW, OLD);
end $$;
