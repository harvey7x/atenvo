-- RPC: remoção segura de mensagem de SAÍDA com falha (não entregue) da timeline.
-- Critérios obrigatórios (todos): direcao='saida', status='falhou', sem entregue_em e sem lida_em,
-- mesma organização do usuário e membro ativo. NUNCA remove enviada/entregue/lida/recebida.
create or replace function public.remover_mensagem_falha(p_mensagem_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_conversa uuid;
  v_direcao mensagem_direcao;
  v_status mensagem_status;
  v_entregue timestamptz;
  v_lida timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;

  select m.organizacao_id, m.conversa_id, m.direcao, m.status, m.entregue_em, m.lida_em
    into v_org, v_conversa, v_direcao, v_status, v_entregue, v_lida
  from mensagens m
  where m.id = p_mensagem_id;

  if not found then
    raise exception 'Mensagem não encontrada.';
  end if;

  -- acesso: membro ativo da organização da mensagem (isola multi-tenant)
  if not exists (
    select 1 from organizacao_usuarios ou
    where ou.organizacao_id = v_org and ou.usuario_id = auth.uid() and ou.status = 'ativo'
  ) then
    raise exception 'Sem acesso a esta conversa.' using errcode = '42501';
  end if;

  -- só mensagens de SAÍDA, com FALHA e comprovadamente NÃO entregues
  if v_direcao <> 'saida' then
    raise exception 'Apenas mensagens enviadas (saída) podem ser removidas.';
  end if;
  if v_status <> 'falhou' then
    raise exception 'Apenas mensagens com falha podem ser removidas.';
  end if;
  if v_entregue is not null or v_lida is not null then
    raise exception 'Mensagem entregue/lida não pode ser removida.';
  end if;

  delete from mensagens where id = p_mensagem_id;
  return v_conversa;
end;
$$;

revoke all on function public.remover_mensagem_falha(uuid) from public, anon;
grant execute on function public.remover_mensagem_falha(uuid) to authenticated;

notify pgrst, 'reload schema';
