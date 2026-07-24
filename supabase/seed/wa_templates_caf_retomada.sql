-- CADASTRO DOS 5 MODELOS DE RETOMADA (CAF) — rodar UMA vez, depois da migration 20260724190000.
--
-- Não é migration: é DADO da organização, e migration que insere dado de cliente vira problema
-- em qualquer db reset. Roda à mão (ou pelo painel, um a um).
--
-- Nascem com status='pendente' porque quem aprova é a META, não nós. Marcar 'aprovado' aqui seria
-- mentira: `wa_template_para_envio` só devolve o que está aprovado E marcado, então um status
-- falso levaria o worker a tentar enviar um modelo que a Meta recusaria (132001).
--
-- FLUXO REAL depois de rodar isto:
--   1) cadastrar os MESMOS textos no painel da Meta (nome idêntico, pt_BR, MARKETING);
--   2) esperar a aprovação;
--   3) Integrações > "Sincronizar com a Meta" traz o status real (e o toque, pelo sufixo _01.._05);
--   4) "Usar no toque N" em cada um.
--
-- PACING: modelo de marketing recém-aprovado tem parte dos envios RETIDA pela Meta, e descartada
-- se o sinal inicial for ruim. O primeiro disparo entregar pouco é esperado — não é bug.

do $$
declare
  v_org uuid;
  v_canal uuid;
  v_waba text;
  v_vars jsonb := '[{"pos":1,"rotulo":"nome","exemplo":"Maria"}]'::jsonb;
begin
  -- org do canal oficial já cadastrado. Ajuste se houver mais de uma organização.
  select organizacao_id into v_org from public.canais
   where transporte = 'cloud_api' and status_integracao <> 'removido'
   order by criado_em limit 1;
  if v_org is null then raise exception 'nenhum canal cloud_api cadastrado — cadastre o número antes'; end if;

  -- prefere o canal de DISPARO (é dele que o modelo sai); se não houver, o primeiro cloud_api.
  v_canal := public.wa_canal_disparo(v_org);
  if v_canal is null then
    select id into v_canal from public.canais
     where organizacao_id = v_org and transporte = 'cloud_api' and status_integracao <> 'removido'
     order by criado_em limit 1;
  end if;
  select cloud_waba_id into v_waba from public.canais where id = v_canal;

  insert into public.wa_templates
    (organizacao_id, canal_id, waba_id, nome, idioma, categoria, corpo, variaveis, toque, status, status_motivo)
  values
    (v_org, v_canal, v_waba, 'caf_retomada_01', 'pt_BR', 'MARKETING',
     'Olá {{1}}, aqui é o Matheo, da Central de Assessoria Financeira. Falamos com o senhor pelo WhatsApp sobre os descontos no seu benefício do INSS, e a análise ficou pela metade. Posso retomar de onde paramos? É rápido.',
     v_vars, 1, 'pendente', 'aguardando cadastro e aprovação no painel da Meta'),

    (v_org, v_canal, v_waba, 'caf_retomada_02', 'pt_BR', 'MARKETING',
     'Olá {{1}}, aqui é o Matheo, da Central de Assessoria Financeira. Enquanto a análise não sai, o desconto continua saindo do seu benefício todo mês. Quer que eu verifique o que está sendo cobrado no seu caso?',
     v_vars, 2, 'pendente', 'aguardando cadastro e aprovação no painel da Meta'),

    (v_org, v_canal, v_waba, 'caf_retomada_03', 'pt_BR', 'MARKETING',
     'Olá {{1}}, aqui é o Matheo, da Central de Assessoria Financeira. Se o senhor ficou com o pé atrás, eu entendo. Somos empresa com CNPJ, o caso é conduzido por advogado parceiro, e nunca pedimos senha do Meu INSS. Se preferir, pode vir conversar no nosso escritório. Quer que eu reserve um horário?',
     v_vars, 3, 'pendente', 'aguardando cadastro e aprovação no painel da Meta'),

    (v_org, v_canal, v_waba, 'caf_retomada_04', 'pt_BR', 'MARKETING',
     'Olá {{1}}, aqui é o Matheo, da Central de Assessoria Financeira. A análise do seu caso é rápida e o senhor não precisa fazer nada além de confirmar alguns dados. Prefere resolver por aqui mesmo ou vir ao escritório?',
     v_vars, 4, 'pendente', 'aguardando cadastro e aprovação no painel da Meta'),

    (v_org, v_canal, v_waba, 'caf_retomada_05', 'pt_BR', 'MARKETING',
     'Olá {{1}}, aqui é o Matheo, da Central de Assessoria Financeira. Como não consegui falar com o senhor, vou encerrar o seu atendimento por enquanto. Se um dia quiser retomar, é só me chamar por aqui. Um abraço.',
     v_vars, 5, 'pendente', 'aguardando cadastro e aprovação no painel da Meta')
  on conflict do nothing;

  raise notice 'org=% canal=% waba=% — 5 modelos cadastrados como pendente', v_org, v_canal, coalesce(v_waba, '(sem waba)');
end $$;

select toque, nome, status, categoria, idioma from public.wa_templates
 where nome like 'caf_retomada_%' and ativo order by toque;
