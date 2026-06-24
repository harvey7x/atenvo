-- Auditoria automatica de acoes criticas (escreve em audit_log, imutavel via RLS)
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org := (to_jsonb(old)->>'organizacao_id')::uuid;
    v_id  := (to_jsonb(old)->>'id')::uuid;
    insert into public.audit_log(usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
      values (auth.uid(), tg_op, tg_table_name, v_id, to_jsonb(old), null, v_org);
    return old;
  else
    v_org := (to_jsonb(new)->>'organizacao_id')::uuid;
    v_id  := (to_jsonb(new)->>'id')::uuid;
    insert into public.audit_log(usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
      values (auth.uid(), tg_op, tg_table_name, v_id,
              case when tg_op='UPDATE' then to_jsonb(old) else null end,
              to_jsonb(new), v_org);
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'contatos','oportunidades','cobrancas','cobranca_pagamentos','scripts',
    'organizacao_usuarios','organizacao_limites','assinaturas'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()', t);
  end loop;
end $$;
