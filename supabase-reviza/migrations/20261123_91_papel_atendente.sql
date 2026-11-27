-- 91 — PAPEL "atendente" (dono 11/11 e 23/11): a pessoa que trabalha SÓ no Atendimento.
-- Vai sozinho numa migration porque um valor novo de enum só pode ser USADO depois de gravado
-- (a 92 usa). ADITIVA: ninguém muda de papel aqui.
-- DESFAZER: um valor de enum não se remove; sem a 92, ele fica sem efeito nenhum.
alter type public.papel_usuario add value if not exists 'atendente';
