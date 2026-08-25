-- Carimbo da planilha na ficha judicial (integracao CONTROLE CLIENTES AGENDADOS).
-- A migration 20260825140446 criou senha_inss/planilha_enviada_em/planilha_linha, mas
-- fn_ficha_before bloqueava QUALQUER update de ficha finalizada (ficha_finalizada_imutavel)
-- e exigia usuario autenticado — a edge function enviar-planilha (service role) nao
-- conseguia registrar o envio. Este ajuste abre um desvio ESTREITO: um UPDATE que muda
-- somente senha_inss / planilha_enviada_em / planilha_linha (nada mais, comparado via
-- to_jsonb) passa mesmo em ficha finalizada e sem uid, preservando finalizada_em e autor.
-- Toda outra alteracao segue sob as regras originais (imutabilidade, membro ativo etc.).

CREATE OR REPLACE FUNCTION public.fn_ficha_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
        v_sync boolean := coalesce(current_setting('atenvo.sync_resp', true), '0') = '1';
        ant record; vconv record;
        -- carimbo da planilha (enviar-planilha): UPDATE que muda SOMENTE
        -- senha_inss / planilha_enviada_em / planilha_linha (e nada mais).
        v_carimbo boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_carimbo := (to_jsonb(NEW) - 'senha_inss' - 'planilha_enviada_em' - 'planilha_linha' - 'atualizado_em' - 'atualizado_por')
               = (to_jsonb(OLD) - 'senha_inss' - 'planilha_enviada_em' - 'planilha_linha' - 'atualizado_em' - 'atualizado_por');
  end if;

  if uid is null then
    if not (v_sync or v_carimbo) then raise exception 'usuario_autenticado_obrigatorio'; end if;
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
    if v_carimbo then
      -- so o carimbo da planilha muda: vale mesmo com a ficha finalizada e
      -- preserva finalizada_em/autor. Nada mais foi alterado (garantido acima).
      NEW.atualizado_por := coalesce(uid, OLD.atualizado_por); NEW.atualizado_em := now();
      return NEW;
    end if;
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
    -- canal só é validado na CRIAÇÃO: a conversa pode migrar de canal depois (canal_id da ficha é
    -- imutável) e a checagem no UPDATE deixava a ficha permanentemente ineditável (canal_conversa_divergente).
    if tg_op = 'INSERT' and NEW.canal_id is not null
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
end $function$
