-- ============================================================
-- Testes minimos de RLS/limites (homologacao).
-- Roda em transacao e faz ROLLBACK ao final (NAO persiste dados).
-- Pré-requisito: schema migrado. Rode com:
--   psql "<conn>" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- (No Supabase, os papeis anon/authenticated ja possuem os GRANTs de tabela.)
-- ============================================================
begin;

-- ----- Setup como owner (RLS nao se aplica ao owner) -----
insert into auth.users (id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('11111111-0000-4000-8000-000000000001','adminA@t.local','x',now(),'{"nome":"AdminA"}'),
 ('11111111-0000-4000-8000-000000000002','atendA@t.local','x',now(),'{"nome":"AtendA"}'),
 ('22222222-0000-4000-8000-000000000001','adminB@t.local','x',now(),'{"nome":"AdminB"}'),
 ('33333333-0000-4000-8000-000000000001','novo@t.local','x',now(),'{"nome":"Novo"}');

insert into public.organizacoes (id,nome,slug,status,assinatura_status) values
 ('aaaaaaaa-0000-4000-8000-000000000001','Org A','org-a','ativa','ativa'),
 ('bbbbbbbb-0000-4000-8000-000000000001','Org B','org-b','ativa','ativa');
insert into public.organizacao_limites (organizacao_id) values
 ('aaaaaaaa-0000-4000-8000-000000000001'),('bbbbbbbb-0000-4000-8000-000000000001');
insert into public.organizacao_usuarios (organizacao_id,usuario_id,papel,status) values
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000001','admin','ativo'),
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000002','atendente','ativo'),
 ('bbbbbbbb-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','admin','ativo');
insert into public.contatos (nome,organizacao_id) values
 ('Contato A','aaaaaaaa-0000-4000-8000-000000000001'),
 ('Contato B','bbbbbbbb-0000-4000-8000-000000000001');
insert into public.cobrancas (contato_id,organizacao_id)
 select id,'aaaaaaaa-0000-4000-8000-000000000001' from public.contatos where nome='Contato A';

-- ===== T1: isolamento entre organizacoes (adminA so ve dados da Org A) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contatos;
  if n <> 1 then raise exception 'T1 FALHOU: adminA viu % contatos (esperado 1 da Org A)', n; end if;
  raise notice 'T1 OK: isolamento entre organizacoes (adminA ve 1 contato)';
end $$;
reset role;

-- ===== T2: papel — atendente da Org A NAO acessa cobrancas =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}', true);
set role authenticated;
do $$ declare nc int; ncob int; begin
  select count(*) into nc from public.contatos;
  select count(*) into ncob from public.cobrancas;
  if nc <> 1 then raise exception 'T2 FALHOU: atendente viu % contatos (esperado 1)', nc; end if;
  if ncob <> 0 then raise exception 'T2 FALHOU: atendente viu % cobrancas (esperado 0)', ncob; end if;
  raise notice 'T2 OK: papel atendente ve contatos mas 0 cobrancas';
end $$;
reset role;

-- ===== T3: escrita cross-org bloqueada (adminA nao insere na Org B) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    insert into public.contatos (nome,organizacao_id) values ('Invasor','bbbbbbbb-0000-4000-8000-000000000001');
    raise exception 'T3 FALHOU: insert cross-org foi permitido';
  exception when insufficient_privilege then
    raise notice 'T3 OK: escrita cross-org bloqueada por RLS';
  end;
end $$;
reset role;

-- ===== T4: limite de usuarios no backend (Org A: limite 2, ja com 2 ativos) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    insert into public.organizacao_usuarios (organizacao_id,usuario_id,papel,status)
      values ('aaaaaaaa-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001','atendente','ativo');
    raise exception 'T4 FALHOU: permitiu 3o usuario ativo acima do limite';
  exception when check_violation then
    raise notice 'T4 OK: limite de usuarios bloqueado no backend';
  end;
end $$;
reset role;

-- ===== T5: frontend (admin da org) NAO altera limites diretamente (sem privilegio de escrita) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    update public.organizacao_limites set usuarios_adicionais = 5 where organizacao_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'T5 FALHOU: UPDATE em organizacao_limites foi permitido ao admin da org';
  exception when insufficient_privilege then
    raise notice 'T5 OK: admin da org NAO altera limites (sem privilegio de escrita)';
  end;
end $$;
reset role;

-- ===== T6: provisionamento do primeiro administrador =====
select set_config('request.jwt.claims','{"sub":"33333333-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
select public.provisionar_organizacao('Org Nova','org-nova-test') as nova_org;
do $$ declare papel public.user_role; begin
  select ou.papel into papel from public.organizacao_usuarios ou
    join public.organizacoes o on o.id = ou.organizacao_id
   where ou.usuario_id='33333333-0000-4000-8000-000000000001' and o.slug='org-nova-test';
  if papel is distinct from 'admin' then raise exception 'T6 FALHOU: primeiro usuario nao virou admin (papel=%)', papel; end if;
  raise notice 'T6 OK: provisionamento vinculou o primeiro usuario como admin';
end $$;
-- segundo provisionamento pelo mesmo usuario (ja vinculado) deve falhar
do $$ begin
  begin
    perform public.provisionar_organizacao('Outra','outra-test');
    raise exception 'T6b FALHOU: permitiu provisionar 2a org para usuario ja vinculado';
  exception when unique_violation then
    raise notice 'T6b OK: usuario ja vinculado nao provisiona nova org';
  end;
end $$;
reset role;

-- ===== T7: usuario edita o PROPRIO nome (permitido) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
update public.usuarios set nome = 'Admin A Renomeado' where id = '11111111-0000-4000-8000-000000000001';
reset role;
do $$ declare nm text; begin
  select nome into nm from public.usuarios where id='11111111-0000-4000-8000-000000000001';
  if nm <> 'Admin A Renomeado' then raise exception 'T7 FALHOU: usuario nao conseguiu editar o proprio nome (nome=%)', nm; end if;
  raise notice 'T7 OK: usuario edita o proprio nome';
end $$;

-- ===== T8: usuario NAO pode alterar platform_admin (coluna proibida) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    update public.usuarios set platform_admin = true where id = '11111111-0000-4000-8000-000000000001';
    raise exception 'T8 FALHOU: permitiu alterar platform_admin';
  exception when insufficient_privilege then
    raise notice 'T8 OK: alteracao de platform_admin negada (permissao de coluna)';
  end;
end $$;
reset role;

-- ===== T9: usuario comum NAO insere em audit_log =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    insert into public.audit_log (organizacao_id, acao, entidade) values ('aaaaaaaa-0000-4000-8000-000000000001','teste_manual','contatos');
    raise exception 'T9 FALHOU: permitiu insert manual em audit_log';
  exception when insufficient_privilege then
    raise notice 'T9 OK: insert manual em audit_log negado (apenas trigger/servico)';
  end;
end $$;
reset role;

-- ===== T10: usuario NAO cria perfil de terceiro em usuarios (so o trigger cria) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin
    insert into public.usuarios (id, nome) values ('99999999-0000-4000-8000-000000000099','Perfil Fantasma');
    raise exception 'T10 FALHOU: permitiu criar perfil arbitrario';
  exception when insufficient_privilege then
    raise notice 'T10 OK: criacao de perfil arbitrario negada (perfil nasce do trigger)';
  end;
end $$;
reset role;

-- ===== T11: CRUD de Contatos pelo Data API (authenticated, sob RLS) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ declare n0 int; n1 int; begin
  select count(*) into n0 from public.contatos;                                   -- SELECT
  insert into public.contatos (nome, organizacao_id) values ('CRUD Data API','aaaaaaaa-0000-4000-8000-000000000001'); -- INSERT
  update public.contatos set nome='CRUD Editado' where nome='CRUD Data API' and organizacao_id='aaaaaaaa-0000-4000-8000-000000000001'; -- UPDATE
  delete from public.contatos where nome='CRUD Editado' and organizacao_id='aaaaaaaa-0000-4000-8000-000000000001';   -- DELETE
  select count(*) into n1 from public.contatos;
  if n1 <> n0 then raise exception 'T11 FALHOU: contagem inconsistente apos CRUD (% -> %)', n0, n1; end if;
  raise notice 'T11 OK: leitura e CRUD de Contatos pelo Data API';
end $$;
reset role;

-- ===== T12: leitura de organizacoes e plano pelo Data API =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ declare norg int; npl int; begin
  select count(*) into norg from public.organizacoes;   -- ve a propria org (RLS)
  select count(*) into npl  from public.planos;         -- catalogo de planos
  if norg < 1 then raise exception 'T12 FALHOU: nao leu organizacoes (%)', norg; end if;
  if npl  < 1 then raise exception 'T12 FALHOU: nao leu planos (%)', npl; end if;
  raise notice 'T12 OK: leitura de organizacoes e plano';
end $$;
reset role;

-- ===== T13: bloqueio de escrita em tabelas comerciais/financeiras (sem GRANT) =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  begin update public.organizacao_limites set usuarios_adicionais = 9 where organizacao_id='aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'T13 FALHOU: UPDATE organizacao_limites permitido';
  exception when insufficient_privilege then null; end;
  begin update public.assinaturas set status='cancelada' where organizacao_id='aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'T13 FALHOU: UPDATE assinaturas permitido';
  exception when insufficient_privilege then null; end;
  begin insert into public.faturas (organizacao_id, competencia, valor_centavos) values ('aaaaaaaa-0000-4000-8000-000000000001', current_date, 100);
    raise exception 'T13 FALHOU: INSERT faturas permitido';
  exception when insufficient_privilege then null; end;
  begin insert into public.pagamentos (organizacao_id, valor_centavos) values ('aaaaaaaa-0000-4000-8000-000000000001', 100);
    raise exception 'T13 FALHOU: INSERT pagamentos permitido';
  exception when insufficient_privilege then null; end;
  raise notice 'T13 OK: escrita bloqueada em limites/assinaturas/faturas/pagamentos';
end $$;
reset role;

-- ===== T14: organizacao - UPDATE administrativo permitido, campos comerciais bloqueados =====
select set_config('request.jwt.claims','{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}', true);
set role authenticated;
do $$ begin
  update public.organizacoes set nome_fantasia='Org A LTDA' where id='aaaaaaaa-0000-4000-8000-000000000001'; -- coluna permitida
  begin
    update public.organizacoes set status='suspensa' where id='aaaaaaaa-0000-4000-8000-000000000001';        -- coluna proibida
    raise exception 'T14 FALHOU: UPDATE de organizacoes.status permitido';
  exception when insufficient_privilege then
    raise notice 'T14 OK: campos comerciais da organizacao bloqueados (status/plano/assinatura_*)';
  end;
end $$;
reset role;

rollback;  -- nada e persistido
