-- Re-vincula as fichas judiciais que ficaram apontando para a conversa SECUNDÁRIA arquivada
-- após a unificação (backfill de manutenção rodou sem sessão, e fn_ficha_before trata conversa_id
-- como IMUTÁVEL + exige usuário — nenhum fluxo do app consegue fazer isso).
--
-- GIOVANA CAF  (rascunho)   : conversa 0ece3012 (ANDRIUS, arquivada) -> d9fd4c60 (ANDRIUS, ativa, 239 msgs)
-- MARIZA       (finalizada) : conversa d289ba74 (ANDRIUS, arquivada) -> 50cf2d45 (URA,    ativa,  81 msgs)
--
-- MENOR PATCH: correção de DADOS pontual. Desliga o trigger trg_ficha_biu SÓ nesta transação (a migration
-- roda como postgres), atualiza APENAS conversa_id, religa o trigger. NÃO toca canal_id (origem histórica
-- da ficha), texto, status, versão nem conteúdo. Auditado (dados_antes) e reversível.
-- DEFENSIVA/idempotente: só age se a ficha ainda apontar para a secundária conhecida E a principal estiver
-- ativa. Em banco novo / re-execução, é no-op e nem mexe no trigger.

do $$
declare
  casos constant jsonb := jsonb_build_array(
    jsonb_build_object('ficha','1b315a1e-eb29-48cf-834f-c4379e676044','sec','0ece3012-eb82-4860-93fa-26568b0920b0','princ','d9fd4c60-62cc-4d2a-b77a-31ce70878bd4'),
    jsonb_build_object('ficha','8fcf287e-925c-4215-9eb1-09542ac344b8','sec','d289ba74-a56b-4a65-a588-f30c5315d001','princ','50cf2d45-b3ca-44d7-9547-63186f599177')
  );
  c jsonb; v_ficha uuid; v_sec uuid; v_princ uuid; v_org uuid; v_agir boolean := false;
begin
  -- 1) audita e marca quais casos realmente precisam de ação (guardas de segurança)
  for c in select * from jsonb_array_elements(casos) loop
    v_ficha := (c->>'ficha')::uuid; v_sec := (c->>'sec')::uuid; v_princ := (c->>'princ')::uuid;
    select f.organizacao_id into v_org
    from fichas_judiciais f
    join conversas p on p.id = v_princ
    where f.id = v_ficha and f.conversa_id = v_sec
      and p.contato_id = f.contato_id and p.status <> 'fechada' and p.arquivada_em is null;
    if found then
      v_agir := true;
      insert into audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
      values (v_org, null, 'ficha_revincular_conversa', 'fichas_judiciais', v_ficha,
              jsonb_build_object('conversa_id', v_sec),
              jsonb_build_object('conversa_id', v_princ, 'motivo','unificacao_conversa'));
    end if;
  end loop;

  if not v_agir then
    raise notice 'ficha_revincular: nada a fazer (já corrigido ou estado divergente)';
    return;
  end if;

  -- 2) re-aponta com o trigger de imutabilidade desligado APENAS nesta transação
  alter table public.fichas_judiciais disable trigger trg_ficha_biu;
  for c in select * from jsonb_array_elements(casos) loop
    v_ficha := (c->>'ficha')::uuid; v_sec := (c->>'sec')::uuid; v_princ := (c->>'princ')::uuid;
    update public.fichas_judiciais
       set conversa_id = v_princ, atualizado_em = now()
     where id = v_ficha and conversa_id = v_sec;
  end loop;
  alter table public.fichas_judiciais enable trigger trg_ficha_biu;
end $$;
