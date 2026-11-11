-- =====================================================================================
-- Fila da Iris — a lista da Iris de 11/11 entra INTEIRA na fila (igual à prévia aprovada), de
-- qualquer data. Antes só entravam os clientes dos últimos 7 dias: dos 315 divididos, só 88 apareciam
-- (a maioria são leads de outubro). Os que ficaram com o mesmo dono (Matheus e a prioridade 0) entram
-- no registro fila_iris_divisao com dono_novo = o dono de hoje. Nada muda de dono aqui.
-- =====================================================================================
insert into public.fila_iris_divisao (lote, contato_id, dono_antes, resp_antes, dono_novo, carteira_antes)
select 'lista_iris_1111', v.contato_id, v.dono, ct.responsavel_id, v.dono,
       (select ic.estado from public.iris_carteira ic where ic.contato_id = v.contato_id order by ic.entrou_em desc limit 1)
  from (values
  ('01d535ce-5ea8-4f35-82de-ba936467fd8b'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('0653b13b-cc3b-49af-b1d3-b27028b8f092'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('067e6d73-536b-41a5-9f7b-ebe26700f60a'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('069f5316-1f98-4de8-a594-b2c36301cdaa'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('079ae47f-2184-4a18-a5f7-e2759d499a39'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('08d6cbba-60c9-4413-90b8-e0692763dbbe'::uuid, 'd7e59652-d3eb-4d7d-8830-7fc780701a8e'::uuid),
  ('094e81bf-65f3-4f1c-ab86-43ac936f63c8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('0972143d-ddb3-4170-a984-6114c0640ff5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('0986633c-4e28-41c4-9dd1-9708a5ee2d55'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('11ce8f2c-3f45-4d50-9271-87a765e57193'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('1251a234-3dd2-451e-82ad-ae7fed7bd30e'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('184b12be-0ddf-4246-bd41-b594212b9d8a'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('18866729-74ba-4510-ae27-300ce8bcbba8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('191702c9-c4b6-4ad6-9f7a-161d7970e96c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('1e4b10c5-cf7e-4a03-af17-e9117198e3f8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('200adf54-60f0-4813-8438-14955ab10940'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('22237e1d-61a9-4a0e-9e94-88d7e100a4ab'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('224361f1-fa15-4c3d-8495-923b143e08c8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('23e55980-4685-43c7-bc6f-5af9b3156019'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('26eea6e9-1556-4064-86ab-68b95c3174a5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('29056c22-423d-4e9f-94e5-8486ff7a6e0e'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('2cdc03e4-0204-47b7-b024-68c338c466c6'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('2e8322ae-302f-47e0-a3dc-c4dd094338c2'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('30a92178-6908-4725-b8fa-9dc43642653d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('316d1d7c-5e89-4e50-a240-b6be9828d47d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('36d45d2d-46ce-4a69-a1dd-9dcd981ab6d1'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('3a3e8c15-454e-462a-a795-ae8499ae64b3'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('3ac62cb7-f48f-4b71-93b5-c83211eb9c71'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('3e6fae31-3d78-4137-89cf-e5c65a3e4065'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('3ebcd331-1d57-421b-98dd-f192e45380c3'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('44adecf1-5a9a-4bf4-92d1-040e6f2a7e0c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('44e9c5db-b1c2-4836-8e1d-f20105cb4f0c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('4506fd5a-a8ee-4d50-94ba-c61814e61ffc'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('48afceb1-9a2e-443c-8576-7a8ae8116931'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('4b8bbdba-590f-4b8e-bbd9-5d7848ed47cc'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('5267ae5b-73bc-4030-823f-5dbf9c018ef3'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('54ad575b-3a05-4614-93d8-1eb5511ada79'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('54fa9ed7-f006-4520-9c78-892da33b52f9'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('57cad48b-5662-4f75-9181-5d9d11ca711d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('5aeb32e8-2124-45fe-a3fc-527a7b912714'::uuid, 'd7e59652-d3eb-4d7d-8830-7fc780701a8e'::uuid),
  ('616a6f4e-74d0-4909-9663-3eff03d9119f'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('6276346c-5b41-4f28-a218-3464a5680272'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('62f5de60-1091-4279-af67-7eb41912ff55'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('6437d58f-7377-4ac4-b517-264b5101e775'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('652d4840-f795-49eb-8d7b-50c7c26ce085'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('658e99d8-5fc5-40de-9e41-498da0377b50'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('66d15de5-31ec-4f45-8c5d-2ef24f30072a'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('67869c53-aae8-4d6b-8eb1-f008ee5e5127'::uuid, 'a31b5fcb-d378-4490-83fe-a47a7c1ee847'::uuid),
  ('6eb71881-9e86-4c93-b6b1-fe8707cff009'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('6f19d248-1b85-4034-b6ce-694fcedac691'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('737e0d52-d7bf-4e1d-b853-575b58548283'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('7534ad83-a797-433a-81c9-13bc150e02e8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('77b77589-d3a2-4f57-b0a7-d85fa29f1920'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('78bd5782-7b61-4e45-a821-cde419a54dc2'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('7b364be0-4d70-420a-adc4-2a486fcac912'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('81e1d449-1b2d-47f7-84b1-a5aabc53c382'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('83f347ed-edfd-401b-819e-5cffe067fbc8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('852ef989-c162-43a3-a71b-bd9de96b11ea'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('86019243-2581-4c39-96d9-2783bbe5b072'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('87ca35b8-4960-49eb-8ebd-d25b8e14a48b'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('895f42fd-dac4-4ab8-97a7-5d9b598a1ac0'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('8b9cd48d-5d8b-4859-b51f-0b74e37ccef8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('923cfdf2-d338-4ada-821b-ba7f91ff8916'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('93090638-fa82-4da5-a176-ecc17ae4c841'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('943d655e-fff8-4d24-a95c-98e55f2a4522'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('95d87fc8-0a08-4c0d-be13-852914549588'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('98f2a027-dd4e-4454-8839-b41dd037fd47'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('99830fbc-75d3-425f-b5ad-bab4cf0ce371'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('9ccebfb9-0f5d-43ff-b582-95d165266992'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('a0af7266-d232-443f-b793-5526cac750b0'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('a5b70595-66b6-488e-9226-11935969032b'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('a6b8285a-5b94-4e00-8ecc-46061c7efbb5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('aa977ad4-53e1-4772-b7c1-fb06d9e55259'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('abd808d4-4a86-4b1c-a2e3-20ba129a4d20'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('ac00a12a-323b-4cd9-8c06-21ae2e2fb057'::uuid, 'a31b5fcb-d378-4490-83fe-a47a7c1ee847'::uuid),
  ('aff40262-3df2-44cd-b935-d98e679bac1d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('b064dad4-0022-43af-91b7-de7d0278d566'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('b0cd5254-915f-4601-995e-7c55a8c9bb0f'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('b2dcba5a-0a2c-4e99-97fa-1834d4c474ef'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('b488342d-efd1-4c04-8441-5215033e5d2c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('b9c5e6aa-b60f-4d3a-822c-ee4f3a0d09be'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('be7baad1-73f0-4664-9c4a-35eecc8d2144'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('c1efe560-bd93-4c3b-ac4c-a273001732b8'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('c3025f24-c3a1-49a3-b8a2-224234cfd19c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('c9c217a2-932e-4f85-88b9-e458fe0b3fa4'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('ccf36ebb-6e4b-454e-b94d-cefbda794ef2'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d0ce361f-cb1c-4c80-a9c9-ec1f5777ba9d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d12e4dd1-34c5-456d-a3af-c8cc2530f5f5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d1a608f2-b45f-4f84-b081-efa883c402bf'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d5ab9c9a-5439-4e23-bef8-f5767c768971'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d82e44ac-74a4-4d14-9740-aede89d5a236'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d8ac7175-057d-4f09-9324-f04cce8e172a'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d8b2c911-698c-4120-be07-bb2038faa9f3'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('d99a59c6-5272-4e98-900e-15049face378'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('da369bd8-fb72-4568-b80b-d97786f0dca5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('e86de0c3-e2fe-4f34-ab48-4f03dd7df71f'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('e8d411ad-5984-448b-a373-6c1a2cfe8bf7'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f0c142bb-bb6c-4689-9ad5-4b5a574de8a6'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f1ad12ab-13f3-45f2-b126-1b69080913b5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f328174c-7278-4b28-8743-cc476df43cdf'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f38c83f9-c73e-41a3-97f0-f1cc019378f5'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f4d44925-9297-4a2b-b756-c0f0fbb7460c'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f5c6938f-5fdc-4396-ae7c-9758f5270893'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f64e95f3-baa6-4abf-a26d-c48e87a8021d'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f77d8626-3969-484d-9116-e84354e9ba4b'::uuid, 'a31b5fcb-d378-4490-83fe-a47a7c1ee847'::uuid),
  ('f8d8bbbf-6ee7-4185-9894-a875a96e9b77'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('f9c5d556-8566-44e5-a2e6-d6ad346062da'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('fd1adea4-001e-4d30-b8d0-103fa077632b'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid),
  ('fecd7acd-a9dc-46dd-907c-5adae13521ea'::uuid, '4ac197b4-9600-4756-81aa-1ac29280df09'::uuid)
  ) v(contato_id, dono)
  join public.contatos ct on ct.id = v.contato_id
on conflict do nothing;

create or replace function public.fila_iris_itens(p_org uuid, p_dono uuid default null)
returns table (
  contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text,
  categoria text, aguardando boolean, coluna text, campanha text,
  entrou_em timestamptz, ult_cliente_em timestamptz, ult_nossa_em timestamptz, ult_doc_em timestamptz,
  doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamptz, marcacoes jsonb, ult_cliente_texto text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cfg public.fila_iris_config;
  v_admin boolean;
  v_dono uuid;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;
  v_admin := public.papel_na_org(p_org) = 'admin';
  v_dono := case when v_admin then p_dono else auth.uid() end;

  return query
  with abertas as (
    select o.id as opp_id, o.contato_id, o.criado_em, fc.nome as col
      from public.oportunidades o
      join public.funil_colunas fc on fc.id = o.coluna_id
     where o.organizacao_id = p_org and o.status = 'em_andamento'
       and not (fc.nome = any (cfg.colunas_fora))
       -- clientes novos (desde cfg.inicio) + os da lista da Iris de 11/11, de qualquer data
       and (coalesce(o.entrada_em, o.criado_em) >= cfg.inicio
            or exists (select 1 from public.fila_iris_divisao dv where dv.contato_id = o.contato_id))
  ), pend as (
    -- prioridade 0 (assinou e falta o histórico de créditos): vale para clientes antigos também,
    -- e para o caso já completo no CAF (o kit assinado completa o caso mesmo sem o histórico)
    select distinct on (p.contato_id) p.contato_id, p.falta, p.assinado_em,
           public.adm_usuario_do_vendedor(p_org, p.vendedor) as vend_id
      from public.adm_pendencias p
     where p.organizacao_id = p_org and p.contato_id is not null
       and p.assinado and 'historico' = any (p.falta)
     order by p.contato_id, p.assinado_em desc nulls last
  ), alvo as (
    select coalesce(a.contato_id, pd.contato_id) as contato_id, a.opp_id, a.criado_em, a.col,
           pd.contato_id is not null as hist, pd.falta as pend_falta, pd.assinado_em as pend_assinado_em, pd.vend_id
      from abertas a full join pend pd on pd.contato_id = a.contato_id
  ), dono as (
    -- prioridade 0: fica com o vendedor do caso no CAF (quem já está com ele); sem ele, o dono de sempre
    select al.*, cv.id as conv_id, cv.canal_id,
           coalesce(case when al.hist then al.vend_id end, cv.atendente_id, ct.responsavel_id,
                    (select o2.responsavel_id from public.oportunidades o2 where o2.id = al.opp_id)) as dono_id,
           ct.nome as ct_nome, ct.telefone as ct_tel
      from alvo al
      join public.contatos ct on ct.id = al.contato_id
      left join lateral (select c.id, c.atendente_id, c.canal_id from public.conversas c
                          where c.contato_id = al.contato_id order by c.ultima_interacao_em desc nulls last limit 1) cv on true
     -- fechado/perdido sai da fila; a prioridade 0 não (sai quando o histórico chega ao CAF)
     where al.hist or not exists (select 1 from public.oportunidades og
                        where og.contato_id = al.contato_id and og.status in ('ganho','perdido','cancelado')
                          and og.fechado_em >= coalesce(al.criado_em, '-infinity'::timestamptz))
  ), filtrado as (
    select d.* from dono d where v_dono is null or d.dono_id = v_dono
  ), msg as (
    select f.contato_id,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo not in ('sistema','nota_interna')) as u_in,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida' and m.tipo not in ('sistema','nota_interna')) as u_out,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo in ('imagem','documento')) as u_doc
      from filtrado f join public.mensagens m on m.conversa_id = f.conv_id
     group by f.contato_id
  ), ses as (
    select distinct on (s.conversa_id) s.conversa_id, s.docs
      from public.ia_sessoes s join filtrado f on f.conv_id = s.conversa_id
     order by s.conversa_id, s.atualizado_em desc
  ), marc as (
    select mk.contato_id,
           jsonb_agg(jsonb_build_object('id', mk.id, 'tipo', mk.tipo, 'texto', mk.texto, 'vezes', mk.vezes,
                                        'em', mk.atualizado_em) order by mk.atualizado_em desc) as lista,
           bool_or(mk.tipo = 'fora_da_fila') as fora,
           bool_or(mk.tipo = 'docs_completos') as forca_ok,
           bool_or(mk.tipo = 'docs_incompletos') as forca_nao
      from public.fila_iris_marcacoes mk
     where mk.organizacao_id = p_org and mk.removido_em is null
       and mk.contato_id in (select f.contato_id from filtrado f)
     group by mk.contato_id
  ), junto as (
    select f.*, mg.u_in, mg.u_out, mg.u_doc,
      coalesce((se.docs->'doc_pessoal'->>'frente')::boolean and (se.docs->'doc_pessoal'->>'verso')::boolean, false) as d_ok,
      coalesce(se.docs ? 'comprovante', false) as c_ok,
      (coalesce(se.docs ? 'doc_pessoal' or se.docs ? 'comprovante', false) or mg.u_doc is not null) as algum,
      mc.lista, coalesce(mc.fora, false) as fora, coalesce(mc.forca_ok, false) as f_ok, coalesce(mc.forca_nao, false) as f_nao
      from filtrado f
      left join msg mg on mg.contato_id = f.contato_id
      left join ses se on se.conversa_id = f.conv_id
      left join marc mc on mc.contato_id = f.contato_id
  ), cls as (
    select j.*,
      case
        when j.hist then 'historico'
        when (j.f_ok or (j.d_ok and j.c_ok)) and not j.f_nao then 'quente'
        when (j.algum or j.f_nao) and coalesce(j.u_doc, j.u_in) <= now() - make_interval(hours => cfg.horas_documentacao) then 'documentacao'
        when not j.algum and j.u_in is not null and j.u_out > j.u_in and j.u_out <= now() - make_interval(hours => cfg.horas_sem_resposta) then 'sem_resposta'
        else null
      end as cat
      from junto j
     where not j.fora
  )
  select c.contato_id, c.conv_id, c.opp_id, c.dono_id, c.ct_nome, c.ct_tel,
         c.cat, (c.u_in is not null and (c.u_out is null or c.u_in > c.u_out)),
         c.col, coalesce(nullif(cn.campanha, ''), cn.nome_interno),
         c.criado_em, c.u_in, c.u_out, c.u_doc,
         (c.d_ok or c.f_ok) and not c.f_nao, (c.c_ok or c.f_ok) and not c.f_nao,
         c.pend_falta, c.pend_assinado_em, coalesce(c.lista, '[]'::jsonb),
         -- o que o cliente escreveu por último (só quando está aguardando resposta)
         case when c.u_in is not null and (c.u_out is null or c.u_in > c.u_out) then
           (select left(coalesce(nullif(m3.conteudo, ''), '[' || m3.tipo::text || ']'), 160) from public.mensagens m3
             where m3.conversa_id = c.conv_id and m3.direcao = 'entrada' and m3.tipo not in ('sistema', 'nota_interna')
             order by coalesce(m3.enviada_em, m3.criado_em) desc limit 1)
         end
    from cls c
    left join public.canais cn on cn.id = c.canal_id
   where c.cat is not null;
end;
$$;
