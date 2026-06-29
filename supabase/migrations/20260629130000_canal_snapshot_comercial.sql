-- Amplia o JSON do snapshot histórico do canal de aquisição (gestor, fonte, campanha, provider).
-- Apenas substitui as funções de trigger; NÃO altera estrutura de tabelas.

create or replace function public.fn_conversa_atribui_canal() returns trigger
  language plpgsql security definer set search_path = public as $$
declare k public.canais; g text; ft text;
begin
  if NEW.canal_id is null then return NEW; end if;
  select * into k from public.canais where id = NEW.canal_id;
  select nome into g from public.usuarios where id = k.gestor_id;
  select nome into ft from public.fontes_aquisicao where id = k.fonte_aquisicao_id;
  update public.contatos set
    canal_origem_id = NEW.canal_id,
    canal_origem_snapshot = jsonb_build_object(
      'nome', k.nome_interno, 'numero', k.numero_conectado, 'tipo', k.origem_tipo,
      'gestor_id', k.gestor_id, 'gestor_nome', g, 'fonte_id', k.fonte_aquisicao_id, 'fonte_nome', ft,
      'campanha', k.campanha, 'provider', k.provider, 'capturado_em', now())
  where id = NEW.contato_id and canal_origem_id is null;
  return NEW;
end $$;

create or replace function public.fn_canal_snapshot_before_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare g text; ft text;
begin
  select nome into g from public.usuarios where id = OLD.gestor_id;
  select nome into ft from public.fontes_aquisicao where id = OLD.fonte_aquisicao_id;
  update public.contatos set
    canal_origem_snapshot = coalesce(canal_origem_snapshot, jsonb_build_object(
      'nome', OLD.nome_interno, 'numero', OLD.numero_conectado, 'tipo', OLD.origem_tipo,
      'gestor_id', OLD.gestor_id, 'gestor_nome', g, 'fonte_id', OLD.fonte_aquisicao_id, 'fonte_nome', ft,
      'campanha', OLD.campanha, 'provider', OLD.provider, 'capturado_em', now()))
  where canal_origem_id = OLD.id;
  return OLD;
end $$;
