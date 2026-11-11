-- =====================================================================================
-- Fila da Iris — ajuste da divisão da lista de 11/11 (dono 11/11: "o Luiz deixa com 20 [quentes]…
-- o restante… documentos, tudo mais, divide igual"). O Luiz segue com os 20 quentes e passa a ter
-- também a parte igual de documentação pendente e sem resposta:
--   documentação: 2 de cada (Matheus, Juliana, Giovana, Isadora) → todos com 8
--   sem resposta: 8 de Juliana, Giovana e Isadora e 9 do Matheus → Luiz 33, os outros 34
-- 41 clientes vão para o Luiz. Nenhum tinha mensagem de atendente depois da divisão.
-- Nada é enviado a cliente. Desfazer: fila_iris_divisao lote 'lista_iris_1111_luiz' (dono_antes).
-- =====================================================================================
create temp table _div on commit drop as
select v.contato_id, 'd189e143-6cab-49c0-98d3-b030453a3c86'::uuid as alvo from (values
  ('0dee83dd-6ec1-463c-8717-c6297e4ae7e6'::uuid),
  ('3882677b-15f5-401c-8abd-7adb6c714feb'::uuid),
  ('0a99fb4f-d2dd-4de7-948c-b1a357bc8731'::uuid),
  ('2af3487e-9ff7-46fa-81e3-d6e221f6274d'::uuid),
  ('161c8fb8-883a-476a-9325-391080b8b67d'::uuid),
  ('353906a9-88fa-4ea1-bae2-0ef37bce1af7'::uuid),
  ('30a92178-6908-4725-b8fa-9dc43642653d'::uuid),
  ('4506fd5a-a8ee-4d50-94ba-c61814e61ffc'::uuid),
  ('0dcb05e4-9e3e-47e1-845a-cb0de96daec5'::uuid),
  ('116c103c-fb32-43c0-975f-0916abe21472'::uuid),
  ('1995e50a-a41e-4286-9350-8885277ee368'::uuid),
  ('1b0d864d-719c-468b-8db2-cd515806ae94'::uuid),
  ('1c046eeb-836a-401c-97e3-887a37dc96da'::uuid),
  ('1c5f48b1-87d9-4987-a30a-f7c1876172f3'::uuid),
  ('1d05ff59-5663-480f-93ce-3dfdea7bf458'::uuid),
  ('236568ce-cd45-4c7b-bcd2-932609e646fb'::uuid),
  ('04916538-d772-4358-b528-a9c07ba3ad6c'::uuid),
  ('08c17f70-a985-42f8-bc36-ff625a75d388'::uuid),
  ('0cf33680-51a0-4cfe-94f3-71faa39ced18'::uuid),
  ('21c17984-1f21-4ada-af44-40eb14b73c8e'::uuid),
  ('284a15e0-9b91-4b71-99c9-75664394cfae'::uuid),
  ('2bd745e6-a1ef-4750-83dc-7fe930a926e1'::uuid),
  ('36225c15-8bb9-41aa-8c0e-c8cfa6a70965'::uuid),
  ('390ef558-96c3-4a57-ba0f-992b9c472502'::uuid),
  ('0474b79f-aebb-4a1c-b3b7-fbf3ce21b5cd'::uuid),
  ('06f5f911-4e77-4231-9ee7-470315a64dc8'::uuid),
  ('11ba4e22-f59f-43bb-836a-508fc0db4581'::uuid),
  ('1429e930-5db3-48e4-a06f-df5040752bcb'::uuid),
  ('190d9c82-41d6-47ae-8764-608b3d197cc9'::uuid),
  ('1dfb1452-14de-476f-b6c4-a082f0039b30'::uuid),
  ('27e4ff0b-f2ce-49f4-95bd-317e6e06e7a4'::uuid),
  ('301edb1d-fa01-4a10-8aaf-f81fce27da83'::uuid),
  ('01d535ce-5ea8-4f35-82de-ba936467fd8b'::uuid),
  ('069f5316-1f98-4de8-a594-b2c36301cdaa'::uuid),
  ('0972143d-ddb3-4170-a984-6114c0640ff5'::uuid),
  ('191702c9-c4b6-4ad6-9f7a-161d7970e96c'::uuid),
  ('1e4b10c5-cf7e-4a03-af17-e9117198e3f8'::uuid),
  ('22237e1d-61a9-4a0e-9e94-88d7e100a4ab'::uuid),
  ('23e55980-4685-43c7-bc6f-5af9b3156019'::uuid),
  ('26eea6e9-1556-4064-86ab-68b95c3174a5'::uuid),
  ('29056c22-423d-4e9f-94e5-8486ff7a6e0e'::uuid)
) v(contato_id);

insert into public.fila_iris_divisao (lote, contato_id, dono_antes, resp_antes, dono_novo, carteira_antes)
select 'lista_iris_1111_luiz', d.contato_id,
       (select cv.atendente_id from public.conversas cv where cv.contato_id = d.contato_id order by cv.ultima_interacao_em desc nulls last limit 1),
       ct.responsavel_id, d.alvo,
       (select ic.estado from public.iris_carteira ic where ic.contato_id = d.contato_id order by ic.entrou_em desc limit 1)
  from _div d join public.contatos ct on ct.id = d.contato_id
on conflict do nothing;

update public.iris_fila_abertura f set status = 'pulado', atualizado_em = now()
 where f.status in ('fila', 'agendado')
   and f.conversa_id in (select cv.id from public.conversas cv join _div d on d.contato_id = cv.contato_id);
update public.mensagens_agendadas a set status = 'cancelada', cancelada_em = now(), motivo_bloqueio = 'fila_iris_divisao', atualizado_em = now()
 where a.status = 'agendada' and a.metadados->>'lote' like 'iris_abertura%'
   and a.conversa_id in (select cv.id from public.conversas cv join _div d on d.contato_id = cv.contato_id);
update public.iris_carteira c set estado = 'saiu', atualizado_em = now()
 where c.estado <> 'saiu' and c.contato_id in (select contato_id from _div);

update public.contatos ct set responsavel_id = d.alvo
  from _div d where ct.id = d.contato_id and ct.responsavel_id is distinct from d.alvo;
update public.conversas cv set atendente_id = d.alvo
  from _div d
 where cv.contato_id = d.contato_id and cv.status in ('aberta', 'em_atendimento', 'pendente')
   and cv.atendente_id is distinct from d.alvo;
