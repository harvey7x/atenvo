-- IMPORTAÇÃO DO QUE A REVIZA TINHA MONTADO NA GUIMOO (26/11/2026). O dono: "copia tudo… eles querem igual, já estão
-- acostumados". Conteúdo DA REVIZA (lido da conta dela na Guimoo, ver ~/reviza-sist/guimoo/dados-reviza/), não da Guimoo.
-- Pode rodar de novo: nada duplica (cada parte confere pelo nome). Uma transação só: entra tudo ou nada.
--   1. o funil padrão do Atendimento vira "COMERCIAL REVIZA" com as 9 etapas de lá (o funil estava vazio: 0 cartões)
--   2. as 16 etiquetas
--   3. as mensagens rápidas de texto (10) em Scripts, com as categorias por pessoa (GARCIA, EMILLYN, FELIPE)
--      — as 8 que são áudio, vídeo ou PDF ficam para depois de baixar os arquivos
--   4. as 4 equipes (departamentos lá) com quem já tem login no Reviza
--   5. a retomada: os follow-ups de texto por etapa e o horário seg–sex 08h–20h — a CHAVE GERAL CONTINUA DESLIGADA
--      (na Guimoo também havia para LEAD DESCARTADO; no Reviza essa etapa encerra o atendimento, então fica sem)
-- Nada aqui envia mensagem, liga envio automático nem muda o acesso de ninguém.
\set ON_ERROR_STOP 1
begin;
set local search_path = public;

-- 0. a empresa do Atendimento e o funil padrão dela
do $$ begin
  if not exists (select 1 from organizacoes where id = 'a1fa0000-0000-4000-8000-000000000001') then raise exception 'sem a empresa do Atendimento'; end if;
  if (select count(*) from funis where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and padrao and not arquivado) <> 1 then raise exception 'esperava um funil padrão só'; end if;
end $$;

create temporary table imp_funil on commit drop as
  select id from funis where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and padrao and not arquivado;

-- 1. funil COMERCIAL REVIZA ----------------------------------------------------------------------------------------
-- as etapas que já existem são renomeadas (o que o sistema sabe delas — entrada, ganho, perdido, produção, qualificado —
-- continua), e as que faltam entram no fim. Só mexe se o funil não tiver cartão nenhum.
do $$ begin
  if exists (select 1 from oportunidades o join funil_colunas c on c.id = o.coluna_id where c.funil_id = (select id from imp_funil)) then
    raise exception 'o funil já tem cartões: não renomeio as etapas (rever à mão)';
  end if;
end $$;
update funis set nome = 'COMERCIAL REVIZA', atualizado_em = now() where id = (select id from imp_funil);

create temporary table imp_etapas (ordem int, nome text, de text, cor text, entrada boolean, resultado text, encerra boolean, papel text) on commit drop;
insert into imp_etapas values
  (0, 'LEAD NOVO',           'LEAD NOVO',      '#64748b', true,  'neutro',  false, null),
  (1, 'ATENDIMENTO IA',      'Em atendimento', '#3b82f6', false, 'neutro',  false, null),
  (2, 'DOCUMENTAÇÃO',        'Documentação',   '#f59e0b', false, 'neutro',  false, 'producao'),
  (3, 'EM NEGOCIACAO',       'Qualificado',    '#8b5cf6', false, 'neutro',  false, 'qualificado'),
  (4, 'FECHADOS',            'Fechado',        '#19C37D', false, 'ganho',   true,  null),
  (5, 'LEAD DESCARTADO',     'Perdido',        '#e11d48', false, 'perdido', true,  null),
  (6, 'CLT',                 null,             '#0ea5e9', false, 'neutro',  false, null),
  (7, 'REPRESENTANTE LEGAL', null,             '#a855f7', false, 'neutro',  false, null),
  (8, 'CREFAZ',              null,             '#14b8a6', false, 'neutro',  false, null);

-- renomeia pelas etapas antigas (ou já com o nome novo, se rodar de novo)
update funil_colunas c set nome = e.nome, ordem = e.ordem, cor = e.cor, entrada = e.entrada, resultado = e.resultado,
       encerra_oportunidade = e.encerra, papel = e.papel
  from imp_etapas e
 where c.funil_id = (select id from imp_funil) and not c.arquivada
   and (lower(c.nome) = lower(e.nome) or (e.de is not null and lower(c.nome) = lower(e.de)));
-- as que faltam
insert into funil_colunas (funil_id, organizacao_id, nome, cor, ordem, entrada, resultado, encerra_oportunidade, papel, arquivada)
select (select id from imp_funil), 'a1fa0000-0000-4000-8000-000000000001', e.nome, e.cor, e.ordem, e.entrada, e.resultado, e.encerra, e.papel, false
  from imp_etapas e
 where not exists (select 1 from funil_colunas c where c.funil_id = (select id from imp_funil) and not c.arquivada and lower(c.nome) = lower(e.nome));
-- sobrou etapa que não é das 9? vai para o fim (não apaga nada)
update funil_colunas c set ordem = 100 + c.ordem
 where c.funil_id = (select id from imp_funil) and not c.arquivada and lower(c.nome) not in (select lower(nome) from imp_etapas);

-- 2. etiquetas ---------------------------------------------------------------------------------------------------------
insert into etiquetas (organizacao_id, nome, cor, ordem, ativo)
select 'a1fa0000-0000-4000-8000-000000000001', t.nome, t.cor, t.ordem, true
  from (values
    (0,  'BENEFÍCIO',                          '#0ea5e9'),
    (1,  'CLT',                                '#64748b'),
    (2,  'FECHADO',                            '#19C37D'),
    (3,  'NEGOCIAÇÃO',                         '#f59e0b'),
    (4,  'RL',                                 '#a855f7'),
    (5,  'SEM INTERESSE/SEM PERFIL/DESCARTADO', '#e11d48'),
    (6,  'EMPRÉSTIMO PESSOAL',                 '#8b5cf6'),
    (7,  'AGIBANK',                            '#2563eb'),
    (8,  'BMG',                                '#ea580c'),
    (9,  'COMPROVANTE DE ENDEREÇO',            '#14b8a6'),
    (10, 'CREFISA',                            '#16a34a'),
    (11, 'EM LIGAÇÃO',                         '#eab308'),
    (12, 'EXTRATO DE EMPRÉSTIMO',              '#0891b2'),
    (13, 'FACTA',                              '#7c3aed'),
    (14, 'MERCANTIL',                          '#db2777'),
    (15, 'RG',                                 '#0d9488')
  ) as t(ordem, nome, cor)
 where not exists (select 1 from etiquetas e where e.organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and lower(btrim(e.nome)) = lower(t.nome));

-- 3. mensagens rápidas (texto) → Scripts ----------------------------------------------------------------------------
insert into script_categorias (organizacao_id, nome, ordem)
select 'a1fa0000-0000-4000-8000-000000000001', c.nome, c.ordem
  from (values ('GARCIA', 0), ('EMILLYN', 1), ('FELIPE', 2)) as c(nome, ordem)
 where not exists (select 1 from script_categorias s where s.organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and lower(s.nome) = lower(c.nome));

insert into scripts (organizacao_id, titulo, categoria_id, conteudo, canais_permitidos, favorito, ativo, tags, descricao)
select 'a1fa0000-0000-4000-8000-000000000001', m.titulo,
       (select id from script_categorias s where s.organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and s.nome = m.cat),
       m.conteudo, '{}', false, true, array[m.atalho], 'Mensagem rápida trazida da Guimoo (atalho #' || m.atalho || ')'
  from (values
    ('apresentação', 'GARCIA', 'apresentao', 'Um prazer estar fala com você. Sou o Guilherme Garcia gerente comercial da REVIZA ASSESSORIA FINANCEIRA, somos uma empresa especialista do direito bancario do consumidor, estou entrando em contato contigo, referente a tua busca e o teu interesse pela REVISÃO CONTRATUAL, para restituir valor pagos a mais para o banco encima de cada contrato feito, e até mesmo na exclusão da divida!'),
    ('assinar gov', 'EMILLYN', 'govassinatura', 'Vou te mandar um passo a passo como assinar pelo aplicativo do gov ok?'),
    ('bancos quais ja trabalhou', 'GARCIA', 'bancos', 'Bancos como AGIBANK, BMG, MERCANTIL, CREFISA, FACTA ou até mesmo na conta de luz pela CREFAZ. Quais dessas instituições tu já teve empréstimo pessoal nos ultimos 10 anos?'),
    ('DOC', null, 'doc', 'RG FRENTE E VERSO ( FOTO NITIDA ) OU CNH COMPROVANTE DE RESIDENCIA, NOME DO TITULAR. PODE SER EM PDF. EXTRATO DE CONSIGNAÇAO DO INSS, EXTRATO DOS CONTRACHEQUES DE 8 ANOS.2018 A 2026 CARTA DE CONCESSAO DO INSS SE NAO CONSEGUIR PEGAR OS EXTRATOS, POR FAVOR ENCAMINHAR A SENHA DO GOV PARA O ESCRITORIO RETIRAR OS DOCUMENTOS EMAIL : ESTADO CIVIL'),
    ('docs', 'EMILLYN', 'docsemilia', 'DOCUMENTAÇÃO COMPLETA: 📊 •⁠ ⁠RG FRENTE E VERSO •⁠ ⁠⁠COMPROVANTE DE ENDEREÇO ATUALIZADO (NO NOME DO PRÓPRIO) •⁠ ⁠⁠E-MAIL PESSOAL/ ESTADO CIVIL •⁠ ⁠⁠SE TENS ACESSO AO GOV OU ENCAMINHAR - EXTRATO DE PAGAMENTO - EXTRATO DE EMPRÉSTIMO CONSIGNADO - CARTA DE CONCESSÃO'),
    ('emi', 'EMILLYN', 'pos2', '~~Verifiquei que quer recuperar valores de juros certo? Posso te passar a proposta?'),
    ('explicaçãodetalhada', 'EMILLYN', 'explicaodetalhada', '__Trabalhamos com análise revisional de contratos de empréstimos pessoais e financiamentos, onde verificamos se existem possíveis cobranças indevidas, juros elevados ou condições que possam estar prejudicando o cliente ao longo do contrato. 📄🔍 Nossa equipe realiza uma análise completa da documentação para identificar oportunidades de revisão e buscar uma solução adequada para cada caso. Também atuamos em casos onde o cliente possui desconto ativo em folha/benefício, realizando a avaliação do contrato e buscando medidas para solicitar a suspensão ou interrupção desses descontos quando houver possibilidade dentro do processo, além da análise de possíveis valores que possam ser recuperados.__'),
    ('honorarios', 'EMILLYN', 'honorarios', 'Nosso trabalho é feito no modelo de êxito, ou seja, você só paga se realmente tiver resultado. Nesse caso, o honorário é de 30% sobre o valor recuperado onde não será cobrado nada para iniciar o processo conosco NÃO COBRAMOS NENHUM VALOR ANTECIPADO'),
    ('pos atendimento', 'EMILLYN', 'posatendimento', 'Olá! Tudo bem? Me chamo Emillyn e irei prosseguir seu atendimento ok?'),
    ('PRIMEIRO ATENDIMENTO', 'EMILLYN', 'atendimentoemillyn', 'Olá! Me chamo Emillyn da empresa REVIZA FINANCEIRA 📱insta: https://www.instagram.com/reviza.assessoria?stkn=Mm14Y2k1Y2I0aG51 Entro em contato pois vi que tem interesse em recuperar valores de juros de seus contratos… Podemos começar ? 😉✅🚀')
  ) as m(titulo, cat, atalho, conteudo)
 where not exists (select 1 from scripts s where s.organizacao_id = 'a1fa0000-0000-4000-8000-000000000001' and lower(s.titulo) = lower(m.titulo));

-- 4. equipes ---------------------------------------------------------------------------------------------------------
-- pelo nome de quem JÁ tem login no Reviza (Eduardo B → Eduardo, Augusto Ferrari → Augusto, JUNIOR → Junior,
-- Guilherme Garcia → Garcia). Quem ainda não tem login fica de fora (a lista vai para o dono).
create temporary table imp_pessoa on commit drop as
  select lower(btrim(nome)) as nome, (array_agg(id order by created_at))[1] as id from profiles where ativo group by 1;
insert into equipes (nome, gerente_id, membros)
select q.nome,
       (select id from imp_pessoa where nome = q.gerente),
       coalesce((select array_agg(p.id) from imp_pessoa p where p.nome = any (q.membros)), '{}')
  from (values
    ('CLUB DA LUTA', 'eduardo', array['deise do prado', 'raissa']),
    ('FERRARI',      'augusto', array['barbara', 'juliano', 'lorenzo']),
    ('JUNIN',        'junior',  array['felipe', 'joão', 'ruan']),
    ('VETERANOS',    null,      array['alexandra', 'emillyn', 'garcia', 'rafael'])
  ) as q(nome, gerente, membros)
 where not exists (select 1 from equipes e where lower(btrim(e.nome)) = lower(q.nome));

-- 5. retomada (follow-ups) — a chave geral continua DESLIGADA ----------------------------------------------------------
insert into atd_retomada_config (organizacao_id, ativo, dias, hora_ini, hora_fim)
values ('a1fa0000-0000-4000-8000-000000000001', false, '{1,2,3,4,5}', '08:00', '20:00')
on conflict (organizacao_id) do update set dias = excluded.dias, hora_ini = excluded.hora_ini, hora_fim = excluded.hora_fim;

insert into atd_retomada_sequencias (organizacao_id, funil_id, coluna_id, ativo, passos)
select 'a1fa0000-0000-4000-8000-000000000001', c.funil_id, c.id, true, s.passos
  from (values
    ('LEAD NOVO'), ('ATENDIMENTO IA'), ('EM NEGOCIACAO')   -- LEAD DESCARTADO encerra o atendimento: a retomada não vale lá
  ) as e(nome)
  join funil_colunas c on c.funil_id = (select id from imp_funil) and not c.arquivada and c.nome = e.nome
  cross join (select '[
    {"espera_min": 360,  "texto": "Oi {nome} Tudo bem? Podemos prosseguir seu atendimento aqui?"},
    {"espera_min": 1440, "texto": "Estou entrando em contato porque faltava pouco para darmos início à sua análise e não queria que você perdesse a oportunidade de verificar seu contrato."},
    {"espera_min": 2880, "texto": "Olá {nome} Vi que gostou de recuperar valores de juros, vamos prosseguir?"}
  ]'::jsonb as passos) s
on conflict (organizacao_id, coluna_id) do nothing;

insert into atd_retomada_sequencias (organizacao_id, funil_id, coluna_id, ativo, passos)
select 'a1fa0000-0000-4000-8000-000000000001', c.funil_id, c.id, true,
       '[{"espera_min": 1440, "texto": "se o  juros dos seus contratos  forem acima 5,50% ou tenha renovado seu contrato, tem como fazer uma analise, tens algum destes requisitos?tens acesso a carteira de trabalho digital posso lhe ajudar a buscar os contratos para analise?"}]'::jsonb
  from funil_colunas c where c.funil_id = (select id from imp_funil) and not c.arquivada and c.nome = 'CLT'
on conflict (organizacao_id, coluna_id) do nothing;

-- conferência (aparece no fim)
select 'funil' as parte, (select nome from funis where id = (select id from imp_funil)) as valor
union all select 'etapas', string_agg(nome, ' · ' order by ordem) from funil_colunas where funil_id = (select id from imp_funil) and not arquivada
union all select 'etiquetas', count(*)::text from etiquetas where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001'
union all select 'scripts', count(*)::text from scripts where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001'
union all select 'equipes', string_agg(nome || ' (' || case when gerente_id is null then 'sem gerente' else 'com gerente' end || ', ' || cardinality(membros) || ')', ' · ') from equipes
union all select 'retomada', (select case when ativo then 'LIGADA' else 'desligada' end from atd_retomada_config where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001') || ', ' || (select count(*) from atd_retomada_sequencias where organizacao_id = 'a1fa0000-0000-4000-8000-000000000001') || ' sequências';
commit;
