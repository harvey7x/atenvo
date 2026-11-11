-- =====================================================================
-- 61 — Novos ↔ Gestão (dono 25/09):
--  (a) SENHAS PARA TODOS: "a senha elas devem aparecer para todo mundo… para o
--      comercial, para o administrativo, para todos… é para a equipe". O perfil
--      cadastro (a conta "Administrador" = o administrativo) passa a ver as senhas;
--      cada perfil vê a senha de todo cliente que ele JÁ VÊ (o comercial só enxerga
--      os clientes dele pela RLS de leads — mesma conta, comercial_dono). As senhas
--      CONTINUAM cifradas no banco (pgp_sym) e toda leitura segue auditada em
--      private.segredo_acessos. Trocar/apagar senha guardada continua com gestor/admin.
--  (b) CICLO SÓ NA APROVAÇÃO: "quem vai fazer não vai ser o comercial… só o
--      financeiro, o administrativo… quando aparecer para ele aprovar, aí ele vai
--      escolher qual ciclo ele vai começar". O comercial não escolhe nem troca o
--      ciclo (dia): no INSERT o dia dele é descartado (o cliente entra nos Novos
--      "a definir") e no UPDATE a troca é recusada. Quem aprova (aprovar_parado:
--      cadastro/financeiro/gestor/admin) define o ciclo — nada muda para eles.
-- Idempotente.
-- =====================================================================

-- (a.1) grade de senhas: qualquer perfil; comercial = só os clientes dele
create or replace function public.senhas_grade()
  returns table(lead_id uuid, inss text, reclame text)
  language plpgsql security definer
  set search_path to 'public', 'private', 'extensions', 'vault', 'pg_temp'
as $function$
declare
  v_papel text := public.current_papel()::text;
begin
  if v_papel is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  insert into private.segredo_acessos (lead_id, tipo, acao, ator, ator_papel)
  values (null, 'grade', 'revelou_grade', auth.uid(), v_papel);
  return query
    select s.lead_id,
           case when s.senha_inss_enc is null then null
                else extensions.pgp_sym_decrypt(s.senha_inss_enc, private.chave(s.senha_inss_kv)) end,
           case when s.reclame_senha_enc is null then null
                else extensions.pgp_sym_decrypt(s.reclame_senha_enc, private.chave(s.reclame_senha_kv)) end
      from private.lead_segredos s
      join public.leads l on l.id = s.lead_id
     where v_papel <> 'comercial' or public.comercial_dono(l.comercial);
end $function$;

-- (a.2) revelar uma senha (ficha): mesma regra
create or replace function public.reveal_senha(p_lead uuid, p_tipo text)
  returns text
  language plpgsql security definer
  set search_path to 'public', 'private', 'extensions', 'vault', 'pg_temp'
as $function$
declare v_papel text := public.current_papel()::text; v_enc bytea; v_kv smallint;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;

  if v_papel = 'comercial' and not exists (
    select 1 from public.leads l where l.id = p_lead and public.comercial_dono(l.comercial)
  ) then raise exception 'sem permissao' using errcode='42501'; end if;

  select case when p_tipo='inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo='inss' then senha_inss_kv else reclame_senha_kv end
    into v_enc, v_kv from private.lead_segredos where lead_id=p_lead;
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,'revelou',auth.uid(),v_papel);
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $function$;

-- (a.3) planilha_salvar: o ramo especial do cadastro ("não pode revelar → não compara,
-- qualquer valor em senha guardada é recusado") perdeu o motivo. O cadastro passa pela
-- regra de todos: mesmo valor = nada muda; valor diferente numa senha guardada = só
-- gestor/admin (igual ao set_senha). Troca cirúrgica no corpo vivo (o resto da função,
-- migs 57/59, fica idêntico); falha alto se o trecho não estiver lá.
do $patch$
declare
  v_def text := pg_get_functiondef('public.planilha_salvar(jsonb,text)'::regprocedure);
  v_ini int; v_fim int; v_novo text;
  c_ini constant text := 'elsif v_papel = ''cadastro'' then';
  c_fim constant text := 'else
              v_atual := private.pl_senha_atual(l.lead_id, v_tipo_senha);';
  c_lista_velha constant text := 'v_atual is not null and v_papel in (''comercial'', ''financeiro'') then';
  c_lista_nova  constant text := 'v_atual is not null and v_papel in (''comercial'', ''financeiro'', ''cadastro'') then';
begin
  if position(c_lista_nova in v_def) > 0 and position(c_ini in v_def) = 0 then
    return; -- já aplicada
  end if;
  v_ini := position(c_ini in v_def);
  v_fim := position(c_fim in v_def);
  if v_ini = 0 or v_fim = 0 or v_fim < v_ini or position(c_lista_velha in v_def) = 0 then
    raise exception 'mig 61: trecho do cadastro não encontrado em planilha_salvar — conferir antes de aplicar';
  end if;
  -- "elsif cadastro … else <ramo geral>" vira "else <ramo geral>" (o if de cima segue: máscara •••)
  v_novo := substr(v_def, 1, v_ini - 1) || substr(v_def, v_fim);
  v_novo := replace(v_novo, c_lista_velha, c_lista_nova);
  execute v_novo;
end $patch$;

-- (b) ciclo: o comercial não define nem troca
create or replace function private.leads_guard_ciclo() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(public.current_papel()::text, '') <> 'comercial' then return new; end if;
  if tg_op = 'INSERT' then
    new.dia := null; -- entra nos Novos com o ciclo "a definir"; quem aprova escolhe
    return new;
  end if;
  if new.dia is distinct from old.dia then
    raise exception 'O ciclo do cliente é escolhido pelo financeiro, cadastro ou administrador, na aprovação (tela Novos).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists leads_guard_ciclo on public.leads;
create trigger leads_guard_ciclo before insert or update of dia on public.leads
  for each row execute function private.leads_guard_ciclo();
