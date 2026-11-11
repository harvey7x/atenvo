-- Fila da Iris: liga para os 5 atendentes + Murilo (dono 11/11: "Confirmo, publica" + "Os 5 atendentes").
-- DESLIGAR: update public.fila_iris_config set ativo = false;  (a tela some; as marcações ficam guardadas)
update public.fila_iris_config set ativo = true, atualizado_em = now()
 where organizacao_id = 'de300000-0000-4000-8000-000000000001';
