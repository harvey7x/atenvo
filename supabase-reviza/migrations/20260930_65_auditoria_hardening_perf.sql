-- ============================================================================
-- Reviza · mig 65 — hardening + performance da auditoria de 30/09
--
-- (1) PERFORMANCE RLS (initplan): as policies chamavam current_papel() /
--     is_at_least() / tem_papel() / auth.uid() / meu_nome() POR LINHA — em
--     pagamentos (5.020 linhas) isso vira ~10 mil buscas em profiles por
--     request e fez da leitura de pagamentos a consulta mais pesada do banco
--     (509,9ms de média, 11.970 chamadas no pg_stat_statements). O wrap
--     (select f()) transforma a chamada em InitPlan: roda UMA vez por consulta.
--     planilha_linhas_sel/ent_sel (mig 58) já usam o padrão. Reescrita por
--     ALTER POLICY (preserva cmd e roles — leads_sel/pag_sel/leads_upd/
--     ciclo_ins/ciclo_upd são {public} desde as migs 39/40 e continuam assim);
--     a LÓGICA de cada policy é idêntica à viva, só o wrap muda. Funções que
--     dependem da linha (comercial_dono, comercial_dono_lead, wa_pode_ver_canal)
--     ficam como estão — por isso wa_conversas/wa_mensagens/wa_envios_sel/
--     wa_alvos_sel/planilha_celulas/aviso_anexos_sel não aparecem aqui.
-- (2) set_senha: comercial passa a só GRAVAR senha de cliente PRÓPRIO (mesmo
--     bloco de dono que o reveal_senha já tem). Antes, com o campo ainda
--     vazio, ele conseguia gravar senha em cliente de outro comercial.
-- (3) wa_envios_upd: o with_check revalida o CANAL — o criador não re-aponta
--     um envio para o número de OUTRO atendente via UPDATE em canal_id.
--     Inócuo hoje (nenhum número tem dono comercial); vira risco real quando
--     os números forem atribuídos. O qual continua gestor+ ou criador.
-- (4) guard_profile_update: profiles.email é o "login" da tela Usuários e da
--     confirmação do EXCLUIR no reviza-admin — usuário comum não pode mais
--     dessincronizá-lo do auth.users via REST; só admin (o backend, que entra
--     com auth.uid() null, segue liberado para o renomear).
-- (5) Higiene de grants (advisors 0028 + role_table_grants): EXECUTE de
--     anon/public nas 2 helpers e na função de trigger; ALL de anon em 6
--     tabelas (herança de GRANT ALL); TRUNCATE/TRIGGER/REFERENCES de
--     authenticated em todas as tabelas de public; default privileges idem,
--     para tabela nova não nascer larga de novo. Nada disso é alcançável hoje
--     (RLS nega e PostgREST não emite TRUNCATE) — é defesa em profundidade.
-- (6) SET search_path = '' nas 2 últimas funções de trigger sem ele (advisor
--     0011): os corpos só usam now() e auth.uid() (qualificado) — nada
--     resolve pelo search_path, então o ALTER é seguro.
--
-- Tudo idempotente: alter policy / create or replace / revoke re-executam limpos.
-- ============================================================================

-- ---------------------------------------------------------------------
-- (1) RLS initplan — wrap (select ...) em toda chamada constante por linha
-- ---------------------------------------------------------------------

-- pagamentos (a nº 1 do pg_stat_statements: 510ms → casa de dezenas de ms)
alter policy pag_sel on public.pagamentos
  using ((select public.current_papel()) is not null
         and ((select public.current_papel())::text <> 'comercial'
              or public.comercial_dono_lead(lead_id)));

-- leads
alter policy leads_sel on public.leads
  using ((select public.current_papel()) is not null
         and ((select public.current_papel())::text <> 'comercial'
              or public.comercial_dono(comercial)));
alter policy leads_ins on public.leads
  with check ((select public.tem_papel('cadastro','comercial','financeiro','gestor','admin')));
alter policy leads_upd on public.leads
  using ((select public.tem_papel('cadastro','comercial','financeiro','gestor','admin'))
         and ((select public.current_papel())::text <> 'comercial'
              or public.comercial_dono(comercial)))
  with check ((select public.tem_papel('cadastro','comercial','financeiro','gestor','admin'))
              and ((select public.current_papel())::text <> 'comercial'
                   or public.comercial_dono(comercial)));
alter policy leads_del on public.leads
  using ((select public.is_at_least('gestor')));

-- profiles
alter policy profiles_sel on public.profiles
  using (id = (select auth.uid()) or (select public.is_at_least('gestor')));
alter policy profiles_upd on public.profiles
  using (id = (select auth.uid()) or (select public.is_at_least('gestor')))
  with check (id = (select auth.uid()) or (select public.is_at_least('gestor')));
alter policy profiles_del on public.profiles
  using ((select public.is_at_least('admin')));

-- entradas (ent_sel já tem o wrap desde a mig 58)
alter policy ent_ins on public.entradas
  with check ((select public.tem_papel('comercial','gestor','admin'))
              and por_id = (select auth.uid())
              and estado = 'pendente'
              and resolvido_por is null and resolvido_em is null
              and motivo is null and superada_em is null
              and ((select public.tem_papel('gestor','admin'))
                   or public.comercial_dono_lead(lead_id)));

-- notificações
alter policy notif_sel on public.notificacoes
  using (user_id = (select auth.uid()));

-- comissões (meu_nome() também é constante por consulta)
alter policy comissoes_sel on public.comissoes
  using ((select public.is_at_least('financeiro'))
         or upper(btrim(comercial)) = upper(btrim(coalesce((select public.meu_nome()), ''))));
alter policy comissoes_hist_sel on public.comissoes_hist
  using ((select public.is_at_least('financeiro'))
         or upper(btrim(comercial)) = upper(btrim(coalesce((select public.meu_nome()), ''))));

-- avisos + destinos + anexos
alter policy avisos_sel on public.avisos
  using ((select public.tem_papel('gestor','admin'))
         or exists (select 1 from public.aviso_destinos d
                     where d.aviso_id = avisos.id and d.user_id = (select auth.uid())));
alter policy avisos_ins on public.avisos
  with check ((select public.tem_papel('gestor','admin')) and autor_id = (select auth.uid()));
alter policy avisos_del on public.avisos
  using ((select public.tem_papel('gestor','admin')));
alter policy aviso_destinos_sel on public.aviso_destinos
  using (user_id = (select auth.uid()) or (select public.tem_papel('gestor','admin')));
alter policy aviso_destinos_ins on public.aviso_destinos
  with check ((select public.tem_papel('gestor','admin')));
alter policy aviso_destinos_del on public.aviso_destinos
  using ((select public.tem_papel('gestor','admin')));
alter policy aviso_anexos_ins on public.aviso_anexos
  with check ((select public.tem_papel('gestor','admin')));
alter policy aviso_anexos_del on public.aviso_anexos
  using ((select public.tem_papel('gestor','admin')));

-- ciclos / ciclos_abertos / ciclos_datas / cobranca_prefs / competencias
alter policy ciclosn_sel on public.ciclos using ((select public.current_papel()) is not null);
alter policy ciclosn_ins on public.ciclos with check ((select public.is_at_least('gestor')));
alter policy ciclosn_upd on public.ciclos
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));
alter policy ciclosn_del on public.ciclos using ((select public.is_at_least('gestor')));

alter policy ca_sel on public.ciclos_abertos using ((select public.current_papel()) is not null);
alter policy ca_ins on public.ciclos_abertos with check ((select public.is_at_least('financeiro')));
alter policy ca_del on public.ciclos_abertos using ((select public.is_at_least('financeiro')));

alter policy ciclo_sel on public.ciclos_datas using ((select public.current_papel()) is not null);
alter policy ciclo_ins on public.ciclos_datas with check ((select public.is_at_least('financeiro')));
alter policy ciclo_upd on public.ciclos_datas
  using ((select public.is_at_least('financeiro'))) with check ((select public.is_at_least('financeiro')));
alter policy ciclo_del on public.ciclos_datas using ((select public.is_at_least('gestor')));

alter policy cpref_sel on public.cobranca_prefs using ((select public.current_papel()) is not null);
alter policy cpref_ins on public.cobranca_prefs with check ((select public.is_at_least('financeiro')));
alter policy cpref_upd on public.cobranca_prefs
  using ((select public.is_at_least('financeiro'))) with check ((select public.is_at_least('financeiro')));

alter policy comp_sel on public.competencias using ((select public.current_papel()) is not null);
alter policy comp_ins on public.competencias with check ((select public.current_papel()) is not null);
alter policy comp_upd on public.competencias
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));
alter policy comp_del on public.competencias using ((select public.is_at_least('gestor')));

-- financeiro / auditoria
alter policy mov_sel on public.mov_fin using ((select public.is_at_least('financeiro')));
alter policy mov_del on public.mov_fin using ((select public.is_at_least('admin')));
alter policy registros_sel on public.registros using ((select public.is_at_least('admin')));

-- whatsapp
alter policy wa_canais_sel on public.wa_canais
  using ((select public.is_at_least('gestor')) or dono_id = (select auth.uid()));

alter policy wa_envios_ins on public.wa_envios
  with check (criado_por = (select auth.uid())
              and ((select public.is_at_least('gestor'))
                   or exists (select 1 from public.wa_canais c
                               where c.id = wa_envios.canal_id
                                 and c.dono_id = (select auth.uid()))));

alter policy wa_alvos_ins on public.wa_envio_alvos
  with check (exists (select 1 from public.wa_envios e
                       where e.id = wa_envio_alvos.envio_id
                         and ((select public.is_at_least('gestor'))
                              or e.criado_por = (select auth.uid()))));
alter policy wa_alvos_upd on public.wa_envio_alvos
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));
alter policy wa_alvos_del on public.wa_envio_alvos
  using (status = 'pendente'
         and exists (select 1 from public.wa_envios e
                      where e.id = wa_envio_alvos.envio_id
                        and ((select public.is_at_least('gestor'))
                             or e.criado_por = (select auth.uid()))));

alter policy wa_motor_rodadas_sel on public.wa_motor_rodadas using ((select public.is_at_least('gestor')));
alter policy wa_motor_status_sel on public.wa_motor_status using ((select public.current_papel()) is not null);

alter policy wa_optout_sel on public.wa_optout
  using ((select public.is_at_least('gestor'))
         or (lead_id is not null
             and exists (select 1 from public.leads l where l.id = wa_optout.lead_id)));
alter policy wa_optout_ins on public.wa_optout with check ((select public.is_at_least('gestor')));
alter policy wa_optout_del on public.wa_optout using ((select public.is_at_least('gestor')));

alter policy wa_rcfg_sel on public.wa_regua_config using ((select public.current_papel()) is not null);
alter policy wa_rcfg_upd on public.wa_regua_config
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));

alter policy wa_rdis_sel on public.wa_regua_disparos using ((select public.current_papel()) is not null);

alter policy wa_rmsg_sel on public.wa_regua_msgs using ((select public.current_papel()) is not null);
alter policy wa_rmsg_ins on public.wa_regua_msgs with check ((select public.is_at_least('gestor')));
alter policy wa_rmsg_upd on public.wa_regua_msgs
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));
alter policy wa_rmsg_del on public.wa_regua_msgs using ((select public.is_at_least('gestor')));

alter policy wa_regua_sel on public.wa_regua_regras using ((select public.current_papel()) is not null);
alter policy wa_regua_ins on public.wa_regua_regras with check ((select public.is_at_least('gestor')));
alter policy wa_regua_upd on public.wa_regua_regras
  using ((select public.is_at_least('gestor'))) with check ((select public.is_at_least('gestor')));
alter policy wa_regua_del on public.wa_regua_regras using ((select public.is_at_least('gestor')));

-- ---------------------------------------------------------------------
-- (2) set_senha — comercial só grava senha de cliente PRÓPRIO
--     (corpo vivo reproduzido; a única mudança é o bloco de dono, o mesmo
--      do reveal_senha, logo depois da validação do tipo)
-- ---------------------------------------------------------------------
create or replace function public.set_senha(p_lead uuid, p_tipo text, p_valor text)
  returns void language plpgsql security definer
  set search_path = public, private, extensions, vault, pg_temp
as $$
declare v_papel text := public.current_papel()::text; v_ver smallint; v_key text; v_enc bytea; v_acao text; v_existe boolean;
begin
  if v_papel is null or v_papel not in ('admin','gestor','comercial','cadastro','financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;

  -- mig 65: comercial não grava senha em cliente alheio (mesmo bloco do reveal_senha)
  if v_papel = 'comercial' and not exists (
    select 1 from public.leads l where l.id = p_lead and public.comercial_dono(l.comercial)
  ) then raise exception 'sem permissao' using errcode='42501'; end if;

  if p_valor is null then return; end if;

  select case when p_tipo='inss' then senha_inss_enc is not null else reclame_senha_enc is not null end
    into v_existe from private.lead_segredos where lead_id = p_lead;
  if coalesce(v_existe,false) and v_papel in ('comercial','cadastro','financeiro') then
    raise exception 'sobrescrever ou limpar senha guardada exige gestor' using errcode='42501';
  end if;

  if length(p_valor)=0 then v_enc:=null; v_ver:=null; v_acao:='limpou';
  else
    select versao_atual into v_ver from private.cripto_config where singleton;
    v_key := private.chave(v_ver);
    v_enc := extensions.pgp_sym_encrypt(p_valor, v_key, 'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256');
    v_acao := 'gravou';
  end if;
  insert into private.lead_segredos as s (lead_id, senha_inss_enc, senha_inss_kv, reclame_senha_enc, reclame_senha_kv, atualizado_em, atualizado_por)
  values (p_lead,
    case when p_tipo='inss' then v_enc end, case when p_tipo='inss' then v_ver end,
    case when p_tipo='reclame' then v_enc end, case when p_tipo='reclame' then v_ver end,
    now(), auth.uid())
  on conflict (lead_id) do update set
    senha_inss_enc = case when p_tipo='inss' then v_enc else s.senha_inss_enc end,
    senha_inss_kv = case when p_tipo='inss' then v_ver else s.senha_inss_kv end,
    reclame_senha_enc = case when p_tipo='reclame' then v_enc else s.reclame_senha_enc end,
    reclame_senha_kv = case when p_tipo='reclame' then v_ver else s.reclame_senha_kv end,
    atualizado_em=now(), atualizado_por=auth.uid();
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,v_acao,auth.uid(),v_papel);
end $$;

-- ---------------------------------------------------------------------
-- (3) wa_envios_upd — with_check revalida o canal (o criador não re-aponta
--     o envio para o número de outro atendente); qual segue gestor+ ou criador
-- ---------------------------------------------------------------------
alter policy wa_envios_upd on public.wa_envios
  using ((select public.is_at_least('gestor')) or criado_por = (select auth.uid()))
  with check ((select public.is_at_least('gestor'))
              or exists (select 1 from public.wa_canais c
                          where c.id = wa_envios.canal_id
                            and c.dono_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- (4) guard_profile_update — protege também o email (corpo vivo reproduzido;
--     a única mudança é o bloco do email; backend com auth.uid() null segue
--     liberado, é por onde o reviza-admin renomeia o login)
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update()
  returns trigger language plpgsql security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if; -- backend confiável
  if new.id <> old.id then raise exception 'id do profile e imutavel'; end if;
  -- mig 65: email é o "login" da tela Usuarios e da confirmacao do excluir
  if new.email is distinct from old.email and not public.is_at_least('admin') then
    raise exception 'somente admin altera o email (login)'; end if;
  if new.nome is distinct from old.nome and not public.is_at_least('gestor') then
    raise exception 'somente gestor/admin altera o nome (identidade da carteira e da comissao)'; end if;
  if new.papel is distinct from old.papel and not public.is_at_least('admin') then
    raise exception 'somente admin altera papel'; end if;
  if new.ativo is distinct from old.ativo then
    if old.papel = 'admin' and not public.is_at_least('admin') then
      raise exception 'somente admin altera o ativo de um admin'; end if;
    if not public.is_at_least('gestor') then
      raise exception 'somente gestor/admin altera ativo'; end if;
  end if;
  if old.papel='admin' and old.ativo and (new.papel is distinct from 'admin' or not new.ativo) then
    if (select count(*) from public.profiles where papel='admin' and ativo) <= 1 then
      raise exception 'nao e permitido remover/desativar o ultimo admin ativo'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- (5) Higiene de grants — nada disso é alcançável hoje; defesa em profundidade
-- ---------------------------------------------------------------------
-- helpers SECURITY DEFINER fora do alcance de quem não tem sessão
revoke execute on function public.comercial_dono(text), public.comercial_dono_lead(uuid), public.tg_registrar()
  from public, anon;

-- as 6 tabelas que herdaram GRANT ALL para anon (as policies são todas de
-- authenticated — anon nunca leu nada delas; agora nem tenta)
revoke all on table public.ciclos, public.ciclos_abertos, public.cobranca_prefs,
  public.comissoes, public.notificacoes, public.registros from anon;

-- authenticated nunca precisa de TRUNCATE/TRIGGER/REFERENCES (PostgREST nem emite)
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- default privileges (dono postgres, o role das migrations): tabela criada
-- daqui pra frente não nasce com anon=ALL nem com TRUNCATE/TRIGGER/REFERENCES
-- para authenticated (o default do supabase_admin não é alterável por aqui)
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

-- ---------------------------------------------------------------------
-- (6) search_path fixado nas 2 últimas funções de trigger sem ele
--     (corpos só usam now() e auth.uid() qualificado — nada muda de comportamento)
-- ---------------------------------------------------------------------
alter function public.tg_leads_dia_carimbo() set search_path = '';
alter function public.tg_cobranca_prefs_touch() set search_path = '';
