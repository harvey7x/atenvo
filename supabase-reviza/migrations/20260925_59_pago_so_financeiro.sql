-- =====================================================================
-- 59 — PAGO (verde) só com o financeiro: o comercial não grava mais "pago" direto
-- (dono 25/09): "quando o financeiro aprovar, fica verde o pagamento; enquanto não
--  aprova fica amarelo". Complementa a 58 (informar pagamento + comprovante → aprovação).
--
-- REVOGA a regra de 15/09 (mig 39) em que o comercial dono "marca pago/valor dos dele":
--   · planilha_salvar: número numa célula de mês de cliente (= pago) só financeiro, gestor
--     e admin gravam; o comercial dono só marca NÃO PAGOU, e não por cima de um mês já
--     pago (aprovado). Resto do corpo IGUAL à 57 (conferido com o vivo: md5 do corpo).
--   · marcar_celula (ficha): mesma regra. Resto do corpo IGUAL à 39 (idem).
--   O comercial informa o valor pelo "Informar pagamento…" (amarelo) → financeiro aprova (verde).
-- Aplicar junto com a 58 (depois dela). Grants iguais aos de antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- planilha_salvar (corpo da 57; muda só a permissão de marcar pago/não pago)
-- ---------------------------------------------------------------------
create or replace function public.planilha_salvar(p_itens jsonb, p_origem text default 'edicao') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_papel text := public.current_papel()::text;
  v_uid uuid := auth.uid();
  v_sync text := current_setting('planilha.sync', true);
  v_n int;
  it jsonb;
  l public.planilha_linhas%rowtype;
  col public.planilha_colunas%rowtype;
  v_cur_t text; v_cur_s jsonb;
  v_tem_t boolean; v_tem_s boolean; v_t text; v_s jsonb;
  v_senha_col boolean; v_muda_t boolean; v_muda_s boolean; v_senha_mudou boolean;
  v_novo_t text; v_novo_s jsonb;
  v_base text; v_comp text; v_st text; v_val numeric; v_pst text; v_pval numeric; v_pexiste boolean;
  v_tipo_senha text; v_atual text; v_d text; v_num numeric;
  v_patch jsonb := '{}'::jsonb; v_lp jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_alt int := 0;
  v_so_lead uuid; v_varios boolean := false; v_nao_cliente boolean := false;
  v_nome text; v_com text; v_dono uuid; v_titulo text;
  k text; x jsonb;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'itens inválidos' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_itens);
  if v_n = 0 then return jsonb_build_object('ok', true, 'avisos', '[]'::jsonb, 'n', 0); end if;
  if v_n > 5000 then raise exception 'Máximo de 5000 células por vez (vieram %).', v_n using errcode = '22023'; end if;

  perform set_config('planilha.sync', '1', true);

  -- trava os clientes do lote ANTES de tudo e em ordem de id (a mesma ordem lead → célula dos
  -- gatilhos): colar enquanto alguém salva a ficha não vira deadlock
  perform 1 from public.leads ld
   where ld.id in (select pl.lead_id from public.planilha_linhas pl
                    where pl.id in (select (e->>'l')::uuid from jsonb_array_elements(p_itens) e
                                     where jsonb_typeof(e) = 'object'
                                       and coalesce(e->>'l', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
   order by ld.id
   for update;

  for it in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(it) <> 'object' or coalesce(it->>'l', '') = '' or coalesce(it->>'c', '') = '' then
      raise exception 'item inválido (precisa de l e c)' using errcode = '22023';
    end if;
    select * into l from public.planilha_linhas where id = (it->>'l')::uuid;
    if not found then raise exception 'Linha não encontrada — a planilha mudou, recarregue.' using errcode = 'P0002'; end if;
    select * into col from public.planilha_colunas where id = (it->>'c')::uuid;
    if not found then raise exception 'Coluna não encontrada — a planilha mudou, recarregue.' using errcode = 'P0002'; end if;

    v_tem_t := it ? 't';
    v_tem_s := it ? 's';
    v_t := case when v_tem_t then nullif(it->>'t', '') end;
    v_s := case when v_tem_s then private.pl_estilo(it->'s') end;

    v_cur_t := null; v_cur_s := null;
    select texto, estilo into v_cur_t, v_cur_s from public.planilha_celulas where linha_id = l.id and coluna_id = col.id;

    v_senha_col := l.tipo = 'cliente' and col.campo in ('senha_inss', 'reclame');
    v_muda_s := v_tem_s and v_s is distinct from v_cur_s;
    v_muda_t := v_tem_t and (v_senha_col or v_t is distinct from v_cur_t);  -- senha: compara com a guardada abaixo
    if not (v_muda_t or v_muda_s) then continue; end if;

    -- permissões
    if l.tipo <> 'cliente' then
      if not public.is_at_least('financeiro') then
        raise exception 'Sem permissão em %: linhas de cabeçalho, rótulo e em branco são do financeiro, gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
      end if;
      -- linha em branco/rótulo é visível a TODOS os papéis: senha, CPF, NB e telefone não
      -- ficam em texto ali (e o "cliente" digitado nela nem vira cliente). Cabeçalho é livre.
      if v_muda_t and v_t is not null and l.tipo in ('vazia', 'rotulo')
         and col.campo in ('senha_inss', 'reclame', 'cpf', 'nb', 'telefone') then
        raise exception 'Sem permissão em %: senha, CPF, NB e telefone só vão em linha de cliente — use "Inserir cliente".', private.pl_ref(l.id, col.id) using errcode = '42501';
      end if;
      v_nao_cliente := true;
    else
      if l.lead_id is null then raise exception 'Este cliente está na Lixeira — restaure antes de editar.' using errcode = '42501'; end if;
      if not (v_papel in ('cadastro', 'financeiro', 'gestor', 'admin')
              or (v_papel = 'comercial' and public.comercial_dono_lead(l.lead_id))) then
        raise exception 'Sem permissão em %: cliente de outro comercial.', private.pl_ref(l.id, col.id) using errcode = '42501';
      end if;
      if col.tipo = 'mes' and v_muda_t and v_papel = 'cadastro' then
        raise exception 'Sem permissão em %: o cadastro não mexe nos meses.', private.pl_ref(l.id, col.id) using errcode = '42501';
      end if;
      if v_so_lead is null then v_so_lead := l.lead_id; elsif v_so_lead <> l.lead_id then v_varios := true; end if;
    end if;

    v_senha_mudou := false;

    -- ligação com o sistema (só cliente, só quando o texto muda)
    if l.tipo = 'cliente' and v_muda_t then
      if col.tipo = 'mes' then
        select comp_base into v_base from public.planilha_blocos where id = l.bloco;
        if v_base is not null then
          v_comp := private.pl_comp_soma(v_base, col.mes_pos);
          v_st := private.pl_mes_estado(v_t);
          v_val := case when v_st = 'pago' then private.pl_valor(v_t) end;
          v_pst := null; v_pval := null;
          select status::text, valor into v_pst, v_pval from public.pagamentos where lead_id = l.lead_id and comp = v_comp;
          v_pexiste := found;
          if v_st is null then
            -- vazio ou '-' sobre um "fora" (tirado da régua) mantém o fora: '-' é o que o gatilho
            -- escreve, e célula vazia não põe ninguém de volta na cobrança
            if v_pexiste and not (v_pst = 'fora' and coalesce(private.pl_trim(v_t), '') in ('', '-')) then
              if not public.is_at_least('financeiro') then
                raise exception 'Sem permissão em %: apagar um pagamento já lançado é com o financeiro, gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
              end if;
              delete from public.pagamentos where lead_id = l.lead_id and comp = v_comp;
              if v_n <= 20 then
                perform private.registrar('limpou mês', 'grade', l.lead_id::text,
                  (select nome from public.leads where id = l.lead_id), public.comp_rotulo(v_comp));
              end if;
            end if;
          elsif not (v_pexiste and v_pst = v_st and v_pval is not distinct from v_val) then
            -- (59) PAGO só o financeiro+ grava: o comercial dono informa com comprovante
            -- ("Informar pagamento…" → entradas → financeiro aprova) e aqui só marca NÃO PAGOU,
            -- e nunca por cima de um pago já aprovado
            if not public.is_at_least('financeiro') then
              if not (v_papel = 'comercial' and public.comercial_dono_lead(l.lead_id)) then
                raise exception 'Sem permissão em %: marcar não pago é com o financeiro, gestor, admin ou o comercial dono.', private.pl_ref(l.id, col.id) using errcode = '42501';
              end if;
              if v_st = 'pago' then
                raise exception 'Sem permissão em %: pagamento é informado com comprovante ("Informar pagamento…") — o financeiro aprova.', private.pl_ref(l.id, col.id) using errcode = '42501';
              end if;
              if v_pexiste and v_pst = 'pago' then
                raise exception 'Sem permissão em %: tirar um pagamento já aprovado é com o financeiro, gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
              end if;
            end if;
            insert into public.competencias (comp) values (v_comp) on conflict do nothing;
            insert into public.pagamentos (lead_id, comp, status, valor, pago_em, confirmado_por)
            values (l.lead_id, v_comp, v_st::public.status_pagamento, v_val, case when v_st = 'pago' then now() end, v_uid)
            on conflict (lead_id, comp) do update set
              status = excluded.status,
              valor = excluded.valor,
              pago_em = excluded.pago_em,
              confirmado_por = excluded.confirmado_por;
            if v_n <= 20 then
              perform private.registrar(case v_st when 'pago' then 'marcou pago' else 'marcou não pago' end, 'grade', l.lead_id::text,
                (select nome from public.leads where id = l.lead_id),
                public.comp_rotulo(v_comp) || case when v_st = 'pago' then ' · ' || private.brl(v_val) else '' end);
            end if;
            -- mesma notificação do marcar_celula (só edição de UMA célula)
            if v_n = 1 and v_st = 'pago' then
              select ld.nome, ld.comercial into v_nome, v_com from public.leads ld where ld.id = l.lead_id;
              select p.id into v_dono from public.profiles p
               where p.ativo and upper(btrim(p.nome)) = upper(btrim(coalesce(v_com, '')))
               order by p.created_at limit 1;
              v_titulo := 'Recebido: ' || coalesce(v_nome, 'cliente') || ' · ' || public.comp_rotulo(v_comp);
              delete from public.notificacoes
               where user_id = v_dono and tipo = 'celula_recebida' and titulo = v_titulo and lida_em is null;
              perform public.notificar(v_dono, 'celula_recebida', v_titulo,
                'R$ ' || replace(to_char(coalesce(v_val, 0), 'FM999999990.00'), '.', ',') || ' marcado como pago na grade.',
                '/cobrancas/planilha');
            end if;
          end if;
        end if;

      elsif col.tipo = 'campo' then
        v_lp := coalesce(v_patch->(l.lead_id::text), '{}'::jsonb);
        case col.campo
          when 'senha_inss', 'reclame' then
            v_tipo_senha := case col.campo when 'senha_inss' then 'inss' else 'reclame' end;
            -- máscara colada de volta ("•••••• 🔒") nunca vira senha
            if strpos(coalesce(v_t, ''), '•') > 0 then
              v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ': senha mascarada (•••) não foi gravada');
            elsif v_papel = 'cadastro' then
              -- o cadastro não pode revelar senha: não decifra nem compara (senão "acertou o
              -- chute" = ok e "errou" = erro vira oráculo). Mesma regra do set_senha: com senha
              -- guardada, qualquer valor é recusado.
              if exists (select 1 from private.lead_segredos s where s.lead_id = l.lead_id
                           and (case v_tipo_senha when 'inss' then s.senha_inss_enc else s.reclame_senha_enc end) is not null) then
                raise exception 'Sem permissão em %: trocar ou apagar uma senha já guardada é com o gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
              end if;
              if v_t is not null then
                perform public.set_senha(l.lead_id, v_tipo_senha, v_t);
                v_senha_mudou := true;
              end if;
            else
              v_atual := private.pl_senha_atual(l.lead_id, v_tipo_senha);
              if coalesce(v_t, '') <> coalesce(v_atual, '') then
                if v_atual is not null and v_papel in ('comercial', 'financeiro') then
                  raise exception 'Sem permissão em %: trocar ou apagar uma senha já guardada é com o gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
                end if;
                perform public.set_senha(l.lead_id, v_tipo_senha, coalesce(v_t, ''));
                v_senha_mudou := true;
              end if;
            end if;
            if col.campo = 'reclame' then
              v_d := private.pl_data_no_texto(v_t, private.pl_mes_ref(l.lead_id));
              if v_d is not null then v_lp := v_lp || jsonb_build_object('data_reclamacao', v_d); end if;
            end if;
          when 'fechamento' then
            v_d := private.pl_data(v_t, private.pl_mes_ref(l.lead_id));
            if v_d is not null then v_lp := v_lp || jsonb_build_object('fechamento', v_d);
            else v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ' ''' || coalesce(v_t, '') || ''' não é data (DD/mmm, DD/MM ou DD/MM/AAAA) — a data do sistema não mudou');
            end if;
          when 'valor' then
            v_num := private.pl_valor(v_t);
            if v_num is not null then v_lp := v_lp || jsonb_build_object('valor', v_num);
            else v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ' ''' || coalesce(v_t, '') || ''' não é número — o valor do sistema não mudou');
            end if;
          when 'nome' then v_lp := v_lp || jsonb_build_object('nome', coalesce(btrim(v_t), ''));
          when 'parou' then
            v_lp := v_lp || jsonb_build_object('parou', v_t);
            v_d := private.pl_data_no_texto(v_t, private.pl_mes_ref(l.lead_id));
            if v_d is not null then v_lp := v_lp || jsonb_build_object('data_parou', v_d); end if;
          when 'telefone' then
            v_d := private.pl_tel(v_t);
            if v_d is not null then v_lp := v_lp || jsonb_build_object('telefone', v_d); end if;
          when 'comercial' then
            -- mesma regra do WITH CHECK de leads_upd: o comercial não passa o cliente para outro
            -- nome nem o deixa sem comercial (maiúsculas/espaços do próprio nome pode)
            if v_papel = 'comercial' and not public.comercial_dono(v_t) then
              raise exception 'Sem permissão em %: trocar o comercial do cliente é com o cadastro, financeiro, gestor ou admin.', private.pl_ref(l.id, col.id) using errcode = '42501';
            end if;
            v_lp := v_lp || jsonb_build_object('comercial', nullif(btrim(v_t), ''));
          else  -- nb, banco, cpf
            v_lp := v_lp || jsonb_build_object(col.campo, nullif(btrim(v_t), ''));
        end case;
        if v_lp <> '{}'::jsonb then v_patch := v_patch || jsonb_build_object(l.lead_id::text, v_lp); end if;
      end if;
    end if;

    -- a célula (texto exato + estilo). Senha de cliente: texto sempre nulo.
    v_novo_t := case when v_senha_col then null when v_tem_t then v_t else v_cur_t end;
    v_novo_s := case when v_tem_s then v_s else v_cur_s end;
    if v_novo_t is distinct from v_cur_t or v_novo_s is distinct from v_cur_s then
      if v_novo_t is null and v_novo_s is null then
        delete from public.planilha_celulas where linha_id = l.id and coluna_id = col.id;
      else
        insert into public.planilha_celulas as ce (linha_id, coluna_id, texto, estilo, atualizado_em, atualizado_por)
        values (l.id, col.id, v_novo_t, v_novo_s, now(), v_uid)
        on conflict (linha_id, coluna_id) do update set
          texto = excluded.texto, estilo = excluded.estilo, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
      end if;
      v_alt := v_alt + 1;
    elsif v_senha_mudou then
      v_alt := v_alt + 1;
    end if;
  end loop;

  -- campos do lead: 1 update por cliente (gatilhos de leads rodam 1 vez)
  for k, x in select key, value from jsonb_each(v_patch) loop
    update public.leads ld set
      fechamento      = case when x ? 'fechamento'      then x->>'fechamento'           else ld.fechamento end,
      comercial       = case when x ? 'comercial'       then x->>'comercial'            else ld.comercial end,
      nome            = case when x ? 'nome'            then coalesce(x->>'nome', '')   else ld.nome end,
      nb              = case when x ? 'nb'              then x->>'nb'                   else ld.nb end,
      banco           = case when x ? 'banco'           then x->>'banco'                else ld.banco end,
      cpf             = case when x ? 'cpf'             then x->>'cpf'                  else ld.cpf end,
      valor           = case when x ? 'valor'           then (x->>'valor')::numeric     else ld.valor end,
      data_reclamacao = case when x ? 'data_reclamacao' then x->>'data_reclamacao'      else ld.data_reclamacao end,
      parou           = case when x ? 'parou'           then x->>'parou'                else ld.parou end,
      data_parou      = case when x ? 'data_parou'      then x->>'data_parou'           else ld.data_parou end,
      telefone        = case when x ? 'telefone'        then x->>'telefone'             else ld.telefone end
    where ld.id = k::uuid
      and (ld.fechamento, ld.comercial, ld.nome, ld.nb, ld.banco, ld.cpf, ld.valor, ld.data_reclamacao, ld.parou, ld.data_parou, ld.telefone)
          is distinct from (
            case when x ? 'fechamento'      then x->>'fechamento'           else ld.fechamento end,
            case when x ? 'comercial'       then x->>'comercial'            else ld.comercial end,
            case when x ? 'nome'            then coalesce(x->>'nome', '')   else ld.nome end,
            case when x ? 'nb'              then x->>'nb'                   else ld.nb end,
            case when x ? 'banco'           then x->>'banco'                else ld.banco end,
            case when x ? 'cpf'             then x->>'cpf'                  else ld.cpf end,
            case when x ? 'valor'           then (x->>'valor')::numeric     else ld.valor end,
            case when x ? 'data_reclamacao' then x->>'data_reclamacao'      else ld.data_reclamacao end,
            case when x ? 'parou'           then x->>'parou'                else ld.parou end,
            case when x ? 'data_parou'      then x->>'data_parou'           else ld.data_parou end,
            case when x ? 'telefone'        then x->>'telefone'             else ld.telefone end);
  end loop;

  if v_alt > 0 then
    perform private.registrar('editou planilha', 'planilha', null,
      case when v_so_lead is not null and not v_varios and not v_nao_cliente
           then (select nome from public.leads where id = v_so_lead) else 'Planilha' end,
      v_alt || ' célula(s)' || case when coalesce(p_origem, 'edicao') <> 'edicao' then ' · ' || p_origem else '' end);
    perform private.pl_versao_bump();
  end if;

  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  return jsonb_build_object('ok', true, 'avisos', v_avisos, 'n', v_alt);
end $$;

-- ---------------------------------------------------------------------
-- marcar_celula (corpo da 39; muda só a permissão fora do 'fora')
-- ---------------------------------------------------------------------
create or replace function public.marcar_celula(p_lead uuid, p_comp text, p_status status_pagamento, p_valor numeric default null::numeric, p_comprovante_path text default null::text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_nome text; v_com text; v_dono uuid; v_titulo text;
begin
  if p_status = 'fora' then
    if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  else
    -- (59) comercial dono: só NÃO PAGOU, e nunca por cima de um pago já aprovado
    -- (pago = "Informar pagamento…" com comprovante → o financeiro aprova)
    if not public.is_at_least('financeiro') then
      if not (public.current_papel()::text = 'comercial' and public.comercial_dono_lead(p_lead))
         or p_status <> 'nao_pagou'
         or exists (select 1 from public.pagamentos where lead_id = p_lead and comp = p_comp and status = 'pago') then
        raise exception 'sem permissao' using errcode='42501';
      end if;
    end if;
  end if;
  if p_status='pago' and p_valor is null then raise exception 'valor obrigatorio para pago' using errcode='22023'; end if;

  insert into public.competencias(comp) values (p_comp) on conflict do nothing;
  insert into public.pagamentos(lead_id, comp, status, valor, comprovante_path, pago_em, confirmado_por)
  values (p_lead, p_comp, p_status, case when p_status='pago' then p_valor else null end,
          p_comprovante_path, case when p_status='pago' then now() else null end, auth.uid())
  on conflict (lead_id,comp) do update set
    status=excluded.status,
    valor=case when excluded.status='pago' then excluded.valor else null end,
    comprovante_path=coalesce(excluded.comprovante_path, public.pagamentos.comprovante_path),
    pago_em=case when excluded.status='pago' then now() else null end,
    confirmado_por=auth.uid();

  if p_comprovante_path is not null and p_status='pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id=p_lead;
    insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, decidido_por)
    values (p_lead, v_nome, v_com, p_comp, p_valor, 'confirmada', p_comprovante_path, auth.uid());
  end if;

  if p_status = 'pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id = p_lead;
    select p.id into v_dono from public.profiles p
      where p.ativo and upper(btrim(p.nome)) = upper(btrim(coalesce(v_com, '')))
      order by p.created_at limit 1;
    v_titulo := 'Recebido: ' || coalesce(v_nome, 'cliente') || ' · ' || public.comp_rotulo(p_comp);
    delete from public.notificacoes
      where user_id = v_dono and tipo = 'celula_recebida' and titulo = v_titulo and lida_em is null;
    perform public.notificar(v_dono, 'celula_recebida', v_titulo,
      'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',') || ' marcado como pago na grade.',
      '/cobrancas/planilha');
  end if;

  perform private.registrar(
    case p_status when 'pago' then 'marcou pago' when 'nao_pagou' then 'marcou não pago' else 'tirou da régua' end,
    'grade', p_lead::text,
    (select nome from public.leads where id = p_lead),
    public.comp_rotulo(p_comp) || case when p_status='pago' then ' · ' || private.brl(p_valor) else '' end);
end $function$;

revoke all on function public.planilha_salvar(jsonb, text),
  public.marcar_celula(uuid, text, public.status_pagamento, numeric, text) from public, anon;
grant execute on function public.planilha_salvar(jsonb, text),
  public.marcar_celula(uuid, text, public.status_pagamento, numeric, text) to authenticated;
