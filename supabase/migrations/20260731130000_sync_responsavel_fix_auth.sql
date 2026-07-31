-- Correção do 20260731120000: o fan-out de responsabilidade também toca cobrancas e fichas_judiciais,
-- cujos triggers BEFORE (fn_cobranca_before / fn_ficha_before) EXIGEM auth.uid() (usuario_autenticado_obrigatorio).
-- O caminho principal — botão "Assumir" via Edge atribuir-atendimento — roda com service_role (auth.uid() = null),
-- então assumir um cliente que tenha cobrança ATIVA (ou ficha em rascunho) abortaria a transação inteira.
--
-- Solução: tornar os dois triggers CIENTES do sync. A flag transaction-local atenvo.sync_resp só é
-- setável de dentro de sync_responsavel_cliente (SECURITY DEFINER, revogado de public/anon). Quando
-- uid é null E a flag está ativa, é comprovadamente o fan-out via service_role — liberamos a exigência
-- de autor autenticado e a checagem de membro-ator, mantendo TODAS as validações de integridade
-- (responsavel_invalido, imutabilidade, org, senha). Usuário autenticado nunca cai no ramo liberado
-- (uid não é null) → continua com validação total mesmo que tente forjar a flag.

-- ===== 1. fan-out: também blinda fichas contra responsável inativo (como já fazia com cobranças) =====
create or replace function public.sync_responsavel_cliente(
  p_contato       uuid,
  p_resp_anterior uuid,
  p_novo_resp     uuid,
  p_ator          uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org     uuid;
  v_conv    int := 0;
  v_opp     int := 0;
  v_ficha   int := 0;
  v_cob     int := 0;
  v_agd     int := 0;
  v_resp_ok boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then return; end if;

  perform set_config('atenvo.sync_resp', '1', true);

  -- novo dono válido p/ tabelas que exigem membro ATIVO (cobranças e fichas). null (liberar) sempre ok.
  v_resp_ok := p_novo_resp is null or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = p_novo_resp and status = 'ativo');

  update public.conversas
     set atendente_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status in ('aberta','em_atendimento','pendente')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_conv = row_count;

  update public.oportunidades
     set responsavel_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status = 'em_andamento'
     and responsavel_id is distinct from p_novo_resp;
  get diagnostics v_opp = row_count;

  -- fichas em rascunho: só quando o novo dono é válido (fn_ficha_before exige responsavel ativo)
  if v_resp_ok then
    update public.fichas_judiciais
       set responsavel_id = p_novo_resp
     where organizacao_id = v_org and contato_id = p_contato
       and status = 'rascunho'
       and responsavel_id is distinct from p_novo_resp;
    get diagnostics v_ficha = row_count;

    update public.cobrancas
       set responsavel_id = p_novo_resp
     where organizacao_id = v_org and contato_id = p_contato
       and status = 'ativo'
       and responsavel_id is distinct from p_novo_resp;
    get diagnostics v_cob = row_count;
  end if;

  update public.agendamentos
     set atendente_id = p_novo_resp
   where organizacao_id = v_org and contato_id = p_contato
     and status in ('pendente','confirmado','remarcado')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_agd = row_count;

  perform set_config('atenvo.sync_resp', '0', true);

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (
    v_org, p_ator, 'sync_responsavel_cliente', 'contatos', p_contato,
    jsonb_build_object('responsavel_id', p_resp_anterior),
    jsonb_build_object(
      'responsavel_id',         p_novo_resp,
      'conversas_afetadas',     v_conv,
      'oportunidades_afetadas', v_opp,
      'fichas_afetadas',        v_ficha,
      'cobrancas_afetadas',     v_cob,
      'agendamentos_afetados',  v_agd
    )
  );
end $$;

-- ===== 2. cobranças: trigger ciente do sync =====
create or replace function public.fn_cobranca_before() returns trigger
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        v_sync boolean := coalesce(current_setting('atenvo.sync_resp', true), '0') = '1';
        v_org_contato uuid; v_opp_org uuid; v_opp_contato uuid;
begin
  -- fan-out de responsabilidade (service_role, uid null) é liberado pela flag; o resto valida normal.
  if uid is null then
    if not v_sync then raise exception 'usuario_autenticado_obrigatorio'; end if;
  elsif not public.is_platform_admin() and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=uid and status='ativo')
    then raise exception 'usuario_nao_membro_ativo';
  end if;
  if tg_op = 'INSERT' then
    NEW.criado_por := uid;
  else
    NEW.criado_por := OLD.criado_por; NEW.atualizado_em := now();
    if NEW.organizacao_id is distinct from OLD.organizacao_id or NEW.contato_id is distinct from OLD.contato_id
      then raise exception 'vinculo_imutavel'; end if;
  end if;
  select organizacao_id into v_org_contato from public.contatos where id = NEW.contato_id;
  if v_org_contato is distinct from NEW.organizacao_id then raise exception 'contato_outra_org'; end if;
  if NEW.oportunidade_id is not null then
    select organizacao_id, contato_id into v_opp_org, v_opp_contato from public.oportunidades where id = NEW.oportunidade_id;
    if v_opp_org is distinct from NEW.organizacao_id then raise exception 'oportunidade_outra_org'; end if;
    if v_opp_contato is distinct from NEW.contato_id then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.responsavel_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id=NEW.organizacao_id and usuario_id=NEW.responsavel_id and status='ativo')
    then raise exception 'responsavel_invalido'; end if;
  return NEW;
end $$;

-- ===== 3. fichas: trigger ciente do sync (+ preserva atualizado_por quando uid é null) =====
create or replace function public.fn_ficha_before() returns trigger
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        v_sync boolean := coalesce(current_setting('atenvo.sync_resp', true), '0') = '1';
        ant record; vconv record;
begin
  if uid is null then
    if not v_sync then raise exception 'usuario_autenticado_obrigatorio'; end if;
  elsif not exists (select 1 from public.organizacao_usuarios
                 where organizacao_id = NEW.organizacao_id and usuario_id = uid and status = 'ativo') then
    raise exception 'usuario_nao_membro_ativo';
  end if;

  if tg_op = 'INSERT' then
    if NEW.status <> 'rascunho' then raise exception 'ficha_nasce_rascunho'; end if;
    NEW.criado_por := uid; NEW.atualizado_por := uid;
    NEW.criado_em := now(); NEW.atualizado_em := now(); NEW.finalizada_em := null;
    if NEW.ficha_anterior_id is not null then
      select * into ant from public.fichas_judiciais where id = NEW.ficha_anterior_id for update;
      if ant.id is null then raise exception 'ficha_anterior_invalida'; end if;
      if ant.organizacao_id <> NEW.organizacao_id then raise exception 'ficha_anterior_outra_org'; end if;
      if ant.contato_id is distinct from NEW.contato_id or ant.oportunidade_id is distinct from NEW.oportunidade_id
        then raise exception 'ficha_anterior_vinculo_divergente'; end if;
      if ant.status <> 'finalizada' then raise exception 'ficha_anterior_nao_finalizada'; end if;
      NEW.versao := ant.versao + 1;
    else
      NEW.versao := 1;
    end if;
  else  -- UPDATE
    if OLD.status = 'finalizada' then raise exception 'ficha_finalizada_imutavel'; end if;
    NEW.finalizada_em := null;  -- frontend nunca controla
    if NEW.organizacao_id is distinct from OLD.organizacao_id
       or NEW.contato_id is distinct from OLD.contato_id
       or NEW.oportunidade_id is distinct from OLD.oportunidade_id
       or NEW.conversa_id is distinct from OLD.conversa_id
       or NEW.canal_id is distinct from OLD.canal_id
       or NEW.versao is distinct from OLD.versao
       or NEW.ficha_anterior_id is distinct from OLD.ficha_anterior_id
       or NEW.criado_por is distinct from OLD.criado_por
       or NEW.criado_em is distinct from OLD.criado_em then
      raise exception 'campos_imutaveis_alterados';
    end if;
    -- no fan-out (uid null) preserva o autor original; atualizado_por é NOT NULL.
    NEW.atualizado_por := coalesce(uid, OLD.atualizado_por); NEW.atualizado_em := now();
    if NEW.status = 'finalizada' and OLD.status <> 'finalizada' then
      if NEW.responsavel_id is null then raise exception 'finalizar: gerente obrigatorio'; end if;
      if coalesce(btrim(NEW.nome),'')='' then raise exception 'finalizar: nome obrigatorio'; end if;
      if not public.cpf_valido(NEW.cpf) then raise exception 'finalizar: cpf invalido'; end if;
      if coalesce(btrim(NEW.beneficio_numero),'')='' then raise exception 'finalizar: numero do beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.especie_codigo),'')='' and coalesce(btrim(NEW.especie_descricao),'')=''
        then raise exception 'finalizar: especie obrigatoria'; end if;
      if NEW.tipo_beneficio is null then raise exception 'finalizar: tipo de beneficio obrigatorio'; end if;
      if coalesce(btrim(NEW.telefone),'')='' then raise exception 'finalizar: telefone obrigatorio'; end if;
      if NEW.data_consulta is null then raise exception 'finalizar: data da ficha obrigatoria'; end if;
      NEW.finalizada_em := now();
    end if;
  end if;

  -- responsável (gerente) deve ser membro ativo da mesma org
  if NEW.responsavel_id is not null and not exists (
       select 1 from public.organizacao_usuarios
       where organizacao_id = NEW.organizacao_id and usuario_id = NEW.responsavel_id and status = 'ativo')
    then raise exception 'responsavel_invalido'; end if;

  -- consistência: todos os vínculos pertencem ao MESMO cliente (org já garantida pela FK composta)
  if NEW.oportunidade_id is not null then
    perform 1 from public.oportunidades
      where id = NEW.oportunidade_id and organizacao_id = NEW.organizacao_id and contato_id = NEW.contato_id;
    if not found then raise exception 'oportunidade_contato_divergente'; end if;
  end if;
  if NEW.conversa_id is not null then
    select canal_id, ultimo_canal_id, contato_id into vconv
      from public.conversas where id = NEW.conversa_id and organizacao_id = NEW.organizacao_id;
    if not found or vconv.contato_id is distinct from NEW.contato_id then raise exception 'conversa_contato_divergente'; end if;
    if NEW.canal_id is not null
       and NEW.canal_id is distinct from vconv.canal_id
       and NEW.canal_id is distinct from vconv.ultimo_canal_id then
      raise exception 'canal_conversa_divergente';
    end if;
  end if;

  -- sanitização de senha (textos) + rejeição precisa em estruturas JSONB
  NEW.texto_original := public.redige_senha(NEW.texto_original);
  NEW.texto_ficha    := public.redige_senha(NEW.texto_ficha);
  if  NEW.revisoes::text ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.avisos::text   ~* '"(senha|senha_inss|senha_meu_inss|password)"[[:space:]]*:'
   or NEW.revisoes::text ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
   or NEW.avisos::text   ~* 'senha[ \t]*(meu[ \t]+inss|inss|gov\.?br|gov)?[ \t]*:[ \t]*[^",}[:space:]]'
    then raise exception 'senha_em_estrutura_proibida'; end if;

  return NEW;
end $$;
