-- O front de prod consulta estas tabelas (checklist do Kanban em src/data/checklist.ts,
-- atividades da conversa em src/data/whatsapp.ts, eventos do card em src/data/kanban.ts).
-- RLS ligada e policies existem desde a criação, mas faltou o GRANT ao role
-- authenticated: ~2.000 erros/dia de "permission denied" e as features quebradas
-- em silêncio. Grants espelham exatamente o que as policies já permitem.

grant select on public.conversa_atividades to authenticated;
grant select on public.oportunidade_eventos to authenticated;
grant select on public.checklist_modelo to authenticated;
grant select, insert, update on public.oportunidade_checklist to authenticated;
