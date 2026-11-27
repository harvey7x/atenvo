-- 76 — Régua do comercial: mudar o DIA de cada mensagem (dono 26/10: "quero que dê pra editar também
-- as réguas, mudar por exemplo os dias").
-- quando = dias em relação ao vencimento só pra este comercial (null = o da padrão). Regras pra a
-- sequência continuar fazendo sentido (e o "cobrança primeiro" valer):
--   · passo que na padrão é ANTES do vencimento continua antes (−1 a −30);
--   · a Cobrança do dia (0) não muda de dia;
--   · passo que na padrão é DEPOIS continua depois (+1 a +30);
--   · duas mensagens da régua do comercial no mesmo dia, não.
-- Dá pra mudar só o dia (blocos vazios = mensagem da padrão), só a mensagem, os dois, ou excluir.
alter table public.wa_regua_comercial add column if not exists quando smallint;
alter table public.wa_regua_comercial drop constraint if exists wa_regua_comercial_quando;
alter table public.wa_regua_comercial add constraint wa_regua_comercial_quando check (quando is null or quando between -30 and 30);
alter table public.wa_regua_comercial drop constraint if exists wa_regua_comercial_blocos;
alter table public.wa_regua_comercial add constraint wa_regua_comercial_blocos
  check (jsonb_typeof(blocos) = 'array' and (excluida or jsonb_array_length(blocos) > 0 or quando is not null));

create or replace function public.wa_regua_comercial_bi()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_q0 int;
begin
  new.comercial := public.wa_nome_chave(new.comercial);
  select m.quando into v_q0 from public.wa_regua_msgs m where m.id = new.passo_id and m.alvo = 'padrao';
  if not found then
    raise exception 'A régua do comercial só troca mensagens da sequência padrão.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and (new.passo_id is distinct from old.passo_id or new.comercial is distinct from old.comercial) then
    raise exception 'Não dá pra mudar o passo nem o comercial de uma versão — apague e crie de novo.' using errcode = '22023';
  end if;
  if new.quando is not null then
    if v_q0 = 0 and new.quando <> 0 then
      raise exception 'A Cobrança do dia sai sempre no dia da cobrança.' using errcode = '22023';
    elsif v_q0 < 0 and new.quando >= 0 then
      raise exception 'Esta mensagem sai antes do vencimento: escolha de 1 a 30 dias antes.' using errcode = '22023';
    elsif v_q0 > 0 and new.quando <= 0 then
      raise exception 'Esta mensagem sai depois do vencimento: escolha de 1 a 30 dias depois.' using errcode = '22023';
    end if;
    if new.quando = v_q0 then new.quando := null; end if;   -- igual à padrão = sem dia próprio
  end if;
  -- outro passo ATIVO da régua deste comercial já sai nesse dia?
  if new.quando is not null and not new.excluida and exists (
       select 1 from public.wa_regua_msgs m
         left join public.wa_regua_comercial v on v.passo_id = m.id and v.comercial = new.comercial
        where m.alvo = 'padrao' and m.ativo and m.id <> new.passo_id and not coalesce(v.excluida, false)
          and coalesce(v.quando, m.quando) = new.quando) then
    raise exception 'Já tem outra mensagem nessa régua nesse dia — escolha outro dia.' using errcode = '22023';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
