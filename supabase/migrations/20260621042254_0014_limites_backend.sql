-- ===== Validacao de limites no backend (nao so ocultar botoes no frontend) =====
-- Usuarios desativados NAO consomem licenca (conta apenas status='ativo').
create or replace function public.checa_limite_usuarios()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; ativos int;
begin
  if new.status = 'ativo' then
    select limite_usuarios into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into ativos from public.organizacao_usuarios
        where organizacao_id = new.organizacao_id and status = 'ativo' and id <> new.id;
      if ativos + 1 > lim then
        raise exception 'Limite de usuarios ativos atingido (% de %). Contrate usuarios adicionais ou desative outro.', ativos + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_limite_usuarios before insert or update on public.organizacao_usuarios
  for each row execute function public.checa_limite_usuarios();

create or replace function public.checa_limite_canais()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; usados int;
begin
  if new.ativo is distinct from true then
    return new;
  end if;
  if new.tipo = 'whatsapp' then
    select limite_whatsapps into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into usados from public.canais
        where organizacao_id = new.organizacao_id and tipo = 'whatsapp' and ativo = true and id <> new.id;
      if usados + 1 > lim then
        raise exception 'Limite de conexoes WhatsApp atingido (% de %). Contrate WhatsApp adicional.', usados + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  elsif new.tipo = 'facebook' then
    select limite_facebook_contas into lim from public.organizacao_limites where organizacao_id = new.organizacao_id;
    if lim is not null then
      select count(*) into usados from public.canais
        where organizacao_id = new.organizacao_id and tipo = 'facebook' and ativo = true and id <> new.id;
      if usados + 1 > lim then
        raise exception 'Limite de contas Facebook atingido (% de %). Contrate conta de Facebook adicional.', usados + 1, lim
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_limite_canais before insert or update on public.canais
  for each row execute function public.checa_limite_canais();
