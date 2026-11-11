-- 77 — Ajustes do dia próprio na régua do comercial (revisão 26/10):
--  · a conferência de "duas mensagens no mesmo dia" usa o dia que VAI VALER (o próprio ou o da padrão),
--    no INSERT, quando o dia muda e quando a linha volta de excluída — editar só a mensagem não é barrado;
--  · dia próprio que ficou do lado errado porque a PADRÃO mudou depois é limpo em silêncio (não trava
--    Excluir / Voltar a usar; o motor já ignorava);
--  · sem nada próprio (não excluída, sem mensagem, sem dia) = erro claro em vez do CHECK cru.
--  (o motor v21 também garante no máximo 1 mensagem da régua por cliente por dia)
create or replace function public.wa_regua_comercial_bi()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_q0 int; v_dia int; v_checar boolean;
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
    if (v_q0 = 0 and new.quando <> 0) or (v_q0 < 0 and new.quando >= 0) or (v_q0 > 0 and new.quando <= 0) then
      if tg_op = 'UPDATE' and new.quando is not distinct from old.quando then
        new.quando := null;   -- a padrão mudou de lado depois: o dia guardado não vale mais
      elsif v_q0 = 0 then
        raise exception 'A Cobrança do dia sai sempre no dia da cobrança.' using errcode = '22023';
      elsif v_q0 < 0 then
        raise exception 'Esta mensagem sai antes do vencimento: escolha de 1 a 30 dias antes.' using errcode = '22023';
      else
        raise exception 'Esta mensagem sai depois do vencimento: escolha de 1 a 30 dias depois.' using errcode = '22023';
      end if;
    elsif new.quando = v_q0 then
      new.quando := null;   -- igual à padrão = sem dia próprio
    end if;
  end if;
  if not new.excluida and jsonb_array_length(new.blocos) = 0 and new.quando is null then
    raise exception 'Não sobrou nada próprio nesta mensagem — use "Usar a padrão".' using errcode = '22023';
  end if;
  -- dia que vai valer pros clientes deste comercial
  v_dia := coalesce(new.quando, v_q0);
  v_checar := not new.excluida and (
       tg_op = 'INSERT' and not exists (   -- upsert de linha que já existe com o mesmo dia = só troca de mensagem
         select 1 from public.wa_regua_comercial x
          where x.passo_id = new.passo_id and x.comercial = new.comercial and not x.excluida
            and coalesce(x.quando, v_q0) = v_dia)
    or tg_op = 'UPDATE' and (coalesce(new.quando, v_q0) is distinct from coalesce(old.quando, v_q0) or old.excluida));
  if v_checar and exists (
       select 1 from public.wa_regua_msgs m
         left join public.wa_regua_comercial v on v.passo_id = m.id and v.comercial = new.comercial
        where m.alvo = 'padrao' and m.ativo and m.id <> new.passo_id and not coalesce(v.excluida, false)
          and coalesce(v.quando, m.quando) = v_dia) then
    raise exception 'Já tem outra mensagem nessa régua nesse dia — escolha outro dia.' using errcode = '22023';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
