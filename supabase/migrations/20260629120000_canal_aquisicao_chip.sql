-- Relatório por conexão/chip de WhatsApp: metadados comerciais + atribuição DURÁVEL do canal de aquisição.
-- Aditivo e nullable. Preserva o histórico mesmo após exclusão definitiva do canal (snapshot). Sem RPC.

-- (A) Metadados comerciais da conexão (reutiliza nome_interno/numero_conectado/ativo/fonte_aquisicao_id)
alter table public.canais
  add column origem_tipo text check (origem_tipo in ('trafego','ura','organico','indicacao','campanha','parceiro','outro')),
  add column gestor_id uuid references public.usuarios(id),
  add column observacao_comercial text;

-- (B) Canal de AQUISIÇÃO no contato (chave única de atribuição) + snapshot histórico (sobrevive à exclusão do chip)
alter table public.contatos
  add column canal_origem_id uuid references public.canais(id) on delete set null,
  add column canal_origem_snapshot jsonb; -- {nome, numero, tipo, capturado_em}

-- Backfill determinístico: 1ª conversa (mais antiga) com canal define a aquisição do contato.
update public.contatos c set
  canal_origem_id = s.canal_id,
  canal_origem_snapshot = jsonb_build_object('nome', k.nome_interno, 'numero', k.numero_conectado, 'tipo', k.origem_tipo, 'capturado_em', now())
from (
  select distinct on (contato_id) contato_id, canal_id
  from public.conversas where canal_id is not null
  order by contato_id, criado_em asc
) s
join public.canais k on k.id = s.canal_id
where c.id = s.contato_id and c.canal_origem_id is null;

-- Atribui o canal de aquisição na PRIMEIRA conversa do contato (não sobrescreve: transferência não muda a origem).
create or replace function public.fn_conversa_atribui_canal() returns trigger
  language plpgsql security definer set search_path = public as $$
declare k public.canais;
begin
  if NEW.canal_id is null then return NEW; end if;
  select * into k from public.canais where id = NEW.canal_id;
  update public.contatos set
    canal_origem_id = NEW.canal_id,
    canal_origem_snapshot = jsonb_build_object('nome', k.nome_interno, 'numero', k.numero_conectado, 'tipo', k.origem_tipo, 'capturado_em', now())
  where id = NEW.contato_id and canal_origem_id is null;
  return NEW;
end $$;
revoke all on function public.fn_conversa_atribui_canal() from public, anon;
create trigger trg_conversa_atribui_canal after insert on public.conversas
  for each row execute function public.fn_conversa_atribui_canal();

-- Antes de excluir o canal, congela o snapshot nos contatos (preserva identidade histórica; depois a FK faz SET NULL).
create or replace function public.fn_canal_snapshot_before_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.contatos set
    canal_origem_snapshot = coalesce(canal_origem_snapshot, jsonb_build_object('nome', OLD.nome_interno, 'numero', OLD.numero_conectado, 'tipo', OLD.origem_tipo, 'capturado_em', now()))
  where canal_origem_id = OLD.id;
  return OLD;
end $$;
revoke all on function public.fn_canal_snapshot_before_delete() from public, anon;
create trigger trg_canal_snapshot_before_delete before delete on public.canais
  for each row execute function public.fn_canal_snapshot_before_delete();
