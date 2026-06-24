-- ============================================================
-- SEED de DEMONSTRACAO (homologacao) — NAO usar em producao real.
-- Executado automaticamente por `supabase db reset` apos as migrations.
-- UUIDs fixos aqui sao aceitaveis (dados de demonstracao, nunca no schema).
-- Senha de demonstracao para todos os usuarios: "atenvo123".
-- ============================================================

-- 1) Usuarios de Auth COM login real por senha.
--    Inclui aud/role/raw_app_meta_data (provider email) e bcrypt em encrypted_password.
--    O trigger on_auth_user_created cria o perfil em public.usuarios.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','de100000-0000-4000-8000-000000000001','authenticated','authenticated','henrique@demo.atenvo.local', crypt('atenvo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nome":"Henrique"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','de100000-0000-4000-8000-000000000002','authenticated','authenticated','marina@demo.atenvo.local',   crypt('atenvo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nome":"Marina Lopes"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','de100000-0000-4000-8000-000000000003','authenticated','authenticated','carlos@demo.atenvo.local',   crypt('atenvo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"nome":"Carlos Eduardo"}', now(), now())
on conflict (id) do nothing;

-- 1a) GoTrue exige estas colunas de token como string vazia (NULL quebra o login por senha)
update auth.users set
  confirmation_token='', recovery_token='', email_change_token_new='', email_change='',
  email_change_token_current='', phone_change='', phone_change_token='', reauthentication_token=''
where id in (
  'de100000-0000-4000-8000-000000000001',
  'de100000-0000-4000-8000-000000000002',
  'de100000-0000-4000-8000-000000000003'
);

-- 1b) Identidade de email (GoTrue exige auth.identities para login por senha)
insert into auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('de100000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000001','{"sub":"de100000-0000-4000-8000-000000000001","email":"henrique@demo.atenvo.local"}','email', now(), now(), now()),
  ('de100000-0000-4000-8000-000000000002','de100000-0000-4000-8000-000000000002','{"sub":"de100000-0000-4000-8000-000000000002","email":"marina@demo.atenvo.local"}','email', now(), now(), now()),
  ('de100000-0000-4000-8000-000000000003','de100000-0000-4000-8000-000000000003','{"sub":"de100000-0000-4000-8000-000000000003","email":"carlos@demo.atenvo.local"}','email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- 2) Organizacao de demonstracao
insert into public.organizacoes (id, nome, nome_fantasia, slug, status, plano, assinatura_status, assinatura_inicio, assinatura_vencimento)
values ('de300000-0000-4000-8000-000000000001','Empresa Demonstração','Empresa Demo','empresa-demo','ativa','Plano Atenvo','ativa', current_date, (current_date + interval '30 days')::date)
on conflict (id) do nothing;

-- 3) Limites = plano-base (2 usuarios, 1 WhatsApp, 1 Facebook). Sem adicionais.
insert into public.organizacao_limites (organizacao_id) values ('de300000-0000-4000-8000-000000000001')
on conflict (organizacao_id) do nothing;

-- 4) Vinculos (papel por organizacao). 2 ativos (= limite do plano-base) + 1 inativo
--    (demonstra que usuario desativado NAO consome licenca).
insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status) values
  ('de300000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000001','admin','ativo'),
  ('de300000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000002','supervisor','ativo'),
  ('de300000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000003','atendente','inativo')
on conflict (organizacao_id, usuario_id) do nothing;

-- 5) Assinatura + item base + valor calculado pela formula unica do backend
insert into public.assinaturas (id, organizacao_id, plano_id, status, ciclo_inicio, ciclo_fim, proxima_cobranca)
select 'de550000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001', p.id, 'ativa',
       date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, (date_trunc('month', now()) + interval '1 month')::date
from public.planos p where p.slug='plano_atenvo' and p.ativo
on conflict (id) do nothing;

insert into public.assinatura_itens (assinatura_id, organizacao_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
select 'de550000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001','plano_base','Plano Atenvo', 1, p.valor_base_centavos, p.valor_base_centavos
from public.planos p where p.slug='plano_atenvo' and p.ativo;

update public.assinaturas set valor_total_centavos = public.calcular_valor_assinatura('de300000-0000-4000-8000-000000000001')
where organizacao_id='de300000-0000-4000-8000-000000000001';

-- 6) Configuracoes padrao da organizacao
insert into public.configuracoes (organizacao_id, chave, valor, descricao) values
  ('de300000-0000-4000-8000-000000000001','cobranca_percentual_padrao','50',                  'Percentual padrao de honorarios sobre o valor economizado'),
  ('de300000-0000-4000-8000-000000000001','cobranca_ciclos_padrao',    '6',                   'Numero padrao de ciclos mensais de cobranca'),
  ('de300000-0000-4000-8000-000000000001','timezone',                  '"America/Sao_Paulo"', 'Fuso horario')
on conflict (organizacao_id, chave) do nothing;

-- 7) Canais de demonstracao (1 WhatsApp + 1 Facebook = dentro do limite do plano-base)
insert into public.canais (tipo, nome_interno, identificador, status_integracao, ativo, organizacao_id) values
  ('whatsapp','Chip Principal','(51) 99999-0001','desconectado', true,'de300000-0000-4000-8000-000000000001'),
  ('facebook','Página Demo','page_demo_1','desconectado', true,'de300000-0000-4000-8000-000000000001');

-- 8) Contatos de demonstracao
insert into public.contatos (nome, telefone, email, origem, etiquetas, responsavel_id, organizacao_id) values
  ('Ana Beatriz','(51) 99812-3344','ana.beatriz@email.com','WhatsApp', '{"cliente"}',   'de100000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001'),
  ('Carlos Mendes','(51) 99721-8890','carlos.mendes@email.com','Facebook','{"lead"}',    'de100000-0000-4000-8000-000000000002','de300000-0000-4000-8000-000000000001'),
  ('Fernanda Souza','(51) 99634-1122','fernanda.souza@email.com','Lead Ads','{"negociando"}','de100000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001'),
  ('Roberto Lima','(51) 99588-7766','roberto.lima@email.com','Indicação','{"cliente"}',  'de100000-0000-4000-8000-000000000002','de300000-0000-4000-8000-000000000001'),
  ('Juliana Castro','(51) 99477-5544','juliana.castro@email.com','WhatsApp','{"lead"}',   'de100000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001');

-- 9) Categoria + script de demonstracao
insert into public.script_categorias (id, nome, ordem, organizacao_id) values
  ('de5ca000-0000-4000-8000-000000000001','Boas-vindas',0,'de300000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.scripts (titulo, categoria_id, conteudo, canais_permitidos, favorito, autor_id, organizacao_id) values
  ('Boas-vindas ao cliente','de5ca000-0000-4000-8000-000000000001','Olá {{nome_cliente}}, tudo bem? Sou {{seu_nome}}, da {{empresa}}.', '{whatsapp,facebook}', true, 'de100000-0000-4000-8000-000000000001','de300000-0000-4000-8000-000000000001');
