-- Realtime do inbox quebrado: o channel `wa-<org>` pede postgres_changes de
-- mensagens + conversas + contatos num único pedido. `contatos` NÃO estava na
-- publication supabase_realtime, e o Realtime rejeita o pedido INTEIRO
-- ("Unable to subscribe to changes ... table: contatos") — ou seja, o inbox
-- ficava sem NENHUM evento (nem mensagens): a conversa aberta só atualizava
-- ao trocar de conversa. O erro chega como evento 'system' com o channel
-- reportando SUBSCRIBED, por isso passou despercebido.
-- Mesmo bug latente no Kanban: `kanban-<org>` assina oportunidades +
-- funil_colunas, ambas fora da publication → realtime do Kanban morto igual.
do $$
declare t text;
begin
  foreach t in array array['contatos', 'oportunidades', 'funil_colunas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
