-- Formato FINAL da assinatura obrigatória (28/08, batido pelo dono): `*Matheus – Atendimento CAF:*`
-- — sem emoji, travessão como separador e marca por extenso. O template no evolution-send virou
-- `*Nome – MARCA:*`; aqui a marca das orgs passa de 'CAF' para 'Atendimento CAF'.
update public.organizacoes set assinatura_marca = 'Atendimento CAF' where assinatura_marca = 'CAF';
