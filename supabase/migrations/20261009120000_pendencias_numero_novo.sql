-- ============================================================================
-- PENDÊNCIAS — NÚMERO QUE NÃO ESTÁ NO SISTEMA (09/10/2026, pedido do dono)
-- Na Nova pendência dá para mandar para um número que ainda não é contato: o atendente
-- digita o número + o nome do cliente; o contato nasce aqui (origem 'Pendências') e a
-- pendência segue a MESMA lógica de sempre (1ª mensagem + lembretes pelo número das pendências).
--
-- O que muda, em uma frase cada:
--  * pendencias_checar_numero(tel): normaliza, diz se é válido e, se já é de alguém, de quem.
--  * pendencia_criar_numero(nome, tel, ...): reaproveita o contato do número (sem renomear) ou
--    cria o contato; trava pela pessoa (mesma chave do webhook) para 2 cliques não criarem 2.
--  * A criação da pendência mora em pend_criar_interno (usada pelas duas RPCs; lógica única).
--  * pendencia_criar aceita cliente fechado OU que já tem pendência ("Nova pendência para este
--    cliente" funciona com quem foi cadastrado por número).
--  * pendencias_clientes_fechados lista também quem tem pendência sem oportunidade ganha
--    (servico e fechado_em nulos nesses; ordem pela pendência mais recente).
--  * Kanban: garantir_oportunidade_lead_novo NÃO cria "Lead Novo" para contato com pendência
--    (decisão do dono: pendência fica só na aba). Oportunidade ativa existente segue devolvida.
--  * Contato mesclado: criar pendência segue o alvo do merge (nunca abre conversa/pendência no
--    absorvido). merge_contatos NÃO muda aqui (função central, fora do escopo): pendência aberta
--    ANTES de um merge fica no contato absorvido (merge é raro e manual; ver memória).
--  * Número que já é de um contato SEM NOME (nome sem letra: telefone/emoji) ganha o nome digitado.
--  * Busca da lista acha o celular inteiro pela chave canônica (com ou sem o 9º dígito).
--
-- Só "create or replace": dá para rodar de novo sem efeito. NÃO mexe em pendencias_config.ativo.
-- ============================================================================

-- ---------------------------------------------------------------- helpers
/* telefone digitado → '55DDDNNNNNNNN' (12 ou 13 dígitos) ou null.
   Só dígitos; 10/11 dígitos ganham o 55; 12/13 dígitos precisam começar com 55; DDD 11..99. */
create or replace function public.pend_normalizar_telefone(p_tel text)
returns text language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
begin
  if length(d) in (10, 11) then
    d := '55' || d;
  elsif not (length(d) in (12, 13) and left(d, 2) = '55') then
    return null;
  end if;
  if substr(d, 3, 2)::int < 11 then return null; end if;
  return d;
end $$;

/* criação da pendência (lógica única de pendencia_criar e pendencia_criar_numero).
   p_exigir_fechado = true: o contato precisa ter oportunidade ganha OU já ter alguma pendência.
   A oportunidade ganha mais recente vai em oportunidade_id (null quando não há).
   Contato MESCLADO: segue o alvo do merge (A→B→C, até 5 saltos) e a pendência nasce no contato
   vivo — é para ele que o merge levou conversas, oportunidades e pendências e é nele que a resposta
   do cliente cai. Nunca abre conversa nem pendência num contato já mesclado. */
create or replace function public.pend_criar_interno(
  p_contato uuid, p_tipo text, p_o_que text, p_prazo date, p_processo text, p_passos jsonb,
  p_iniciar_em timestamptz, p_exigir_fechado boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_cfg public.pendencias_config%rowtype; v_canal public.canais%rowtype;
  v_resp uuid; v_tel text; v_opp uuid; v_conv uuid; v_id uuid; v_base timestamptz;
  v_alvo uuid; v_saltos int := 0;
begin
  loop
    select organizacao_id, responsavel_id, telefone, mesclado_para
      into v_org, v_resp, v_tel, v_alvo
      from public.contatos where id = p_contato;
    exit when v_org is null or v_alvo is null;
    v_saltos := v_saltos + 1;
    if v_saltos > 5 then raise exception 'contato_mesclado'; end if;   -- cadeia longa/ciclo: não adivinha
    p_contato := v_alvo;
  end loop;
  if v_org is null then raise exception 'contato_invalido'; end if;
  perform public.pend_exigir_membro(v_org);
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;
  select id into v_opp from public.oportunidades
   where organizacao_id = v_org and contato_id = p_contato and status = 'ganho' order by fechado_em desc nulls last limit 1;
  if v_opp is null and p_exigir_fechado
     and not exists (select 1 from public.pendencias where organizacao_id = v_org and contato_id = p_contato) then
    raise exception 'cliente_nao_fechado';
  end if;
  if p_tipo not in ('reassinatura','documento','informacao','outro') then raise exception 'tipo_invalido'; end if;
  if nullif(btrim(coalesce(p_o_que,'')), '') is null then raise exception 'o_que_vazio'; end if;
  if jsonb_typeof(p_passos) <> 'array' or jsonb_array_length(p_passos) < 1 then raise exception 'sem_mensagem'; end if;

  select * into v_cfg from public.pendencias_config where organizacao_id = v_org;
  if v_cfg.canal_id is null then raise exception 'sem_numero_pendencias'; end if;
  select * into v_canal from public.canais where id = v_cfg.canal_id and organizacao_id = v_org;
  if v_canal.id is null or not v_canal.ativo or v_canal.status_integracao::text = 'removido'
     or coalesce(v_canal.transporte, '') <> 'evolution' then raise exception 'numero_pendencias_invalido'; end if;

  v_base := case when p_iniciar_em is null or p_iniciar_em <= now() then now() else p_iniciar_em end;

  -- conversa: a mesma regra do webhook (uma ativa por contato; arquivada reabre). Sem nenhuma, cria.
  select cv.id into v_conv from public.conversas cv
   where cv.organizacao_id = v_org and cv.contato_id = p_contato and cv.status <> 'fechada'
   order by cv.arquivada_em asc nulls first, cv.ultima_interacao_em desc nulls last limit 1;
  if v_conv is null then
    begin
      insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, status, atendente_id)
      values (v_org, p_contato, v_canal.id, v_canal.id, 'aberta', v_resp) returning id into v_conv;
    exception when unique_violation then
      select cv.id into v_conv from public.conversas cv
       where cv.organizacao_id = v_org and cv.contato_id = p_contato and cv.status <> 'fechada'
       order by cv.arquivada_em asc nulls first limit 1;
    end;
  end if;
  -- a resposta vai para o encarregado do cliente
  update public.conversas set atendente_id = v_resp where id = v_conv and atendente_id is null and v_resp is not null;

  -- cliente sem encarregado: a pendência fica com quem abriu (aparece no "Minhas" e recebe o aviso)
  insert into public.pendencias (organizacao_id, contato_id, oportunidade_id, conversa_id, canal_id, tipo, o_que, prazo,
                                 processo, responsavel_id, criado_por)
  values (v_org, p_contato, v_opp, v_conv, v_canal.id, p_tipo, btrim(p_o_que), p_prazo,
          nullif(btrim(coalesce(p_processo,'')), ''), coalesce(v_resp, auth.uid()), auth.uid())
  returning id into v_id;

  perform public.pend_gravar_passos(v_id, v_org, v_base, p_passos, true);
  perform public.pend_evento(v_id, v_org, 'aberta', 'Pendência aberta');
  return v_id;
end $$;

-- ---------------------------------------------------------------- leitura: conferir número
/* {"valido", "telefone": '55DDDNNNNNNNN'|null, "contato": null | {id, nome, telefone, fechado,
   responsavel_nome, tem_pendencia}}. Contato pela mesma resolução do webhook (identidade WhatsApp
   pela chave canônica → contatos.telefone; mesclado devolve o alvo do merge, seguindo a cadeia
   A→B→C como pend_criar_interno, para a tela mostrar o MESMO cliente que vai receber). Só leitura. */
create or replace function public.pendencias_checar_numero(p_telefone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual(); v_tel text; v_id uuid; v_c jsonb; v_alvo uuid; v_saltos int := 0;
begin
  perform public.pend_exigir_membro(v_org);
  v_tel := public.pend_normalizar_telefone(p_telefone);
  if v_tel is null then
    return jsonb_build_object('valido', false, 'telefone', null, 'contato', null);
  end if;
  v_id := public.wa_resolver_contato_por_numero(v_org, v_tel);
  while v_id is not null and v_saltos < 5 loop
    select mesclado_para into v_alvo from public.contatos where id = v_id;
    exit when v_alvo is null;
    v_id := v_alvo; v_saltos := v_saltos + 1;
  end loop;
  if v_id is not null then
    select jsonb_build_object(
             'id', c.id, 'nome', c.nome, 'telefone', c.telefone,
             'fechado', exists (select 1 from public.oportunidades o
                                 where o.organizacao_id = v_org and o.contato_id = c.id and o.status = 'ganho'),
             'responsavel_nome', u.nome,
             'tem_pendencia', exists (select 1 from public.pendencias p
                                       where p.organizacao_id = v_org and p.contato_id = c.id))
      into v_c
      from public.contatos c left join public.usuarios u on u.id = c.responsavel_id
     where c.id = v_id and c.organizacao_id = v_org;
  end if;
  return jsonb_build_object('valido', true, 'telefone', v_tel, 'contato', v_c);
end $$;

-- ---------------------------------------------------------------- criar: número novo
/* número + nome digitados. Número já de alguém (fechado, lead ou mesclado → alvo) → usa esse contato
   (não renomeia). Senão cria o contato (encarregado = quem cadastrou). Trava pela pessoa com a MESMA chave do webhook
   (wa_inbound_garantir_contato_conversa): dois cliques, duas pessoas ou o cliente escrevendo no
   mesmo instante não criam dois contatos. Não exige oportunidade ganha. */
create or replace function public.pendencia_criar_numero(
  p_nome text, p_telefone text, p_tipo text, p_o_que text, p_prazo date, p_processo text, p_passos jsonb,
  p_iniciar_em timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.pend_org_atual();
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));   -- = limparNome da tela
  v_tel text; v_contato uuid;
begin
  perform public.pend_exigir_membro(v_org);
  -- nome: 2..80 caracteres e com letra (só número/telefone não vale) — igual a nomeClienteValido da tela
  if length(v_nome) < 2 or length(v_nome) > 80 or v_nome !~ '[[:alpha:]]' then raise exception 'nome_invalido'; end if;
  v_tel := public.pend_normalizar_telefone(p_telefone);
  if v_tel is null then raise exception 'telefone_invalido'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'wa_inbound:' || v_org::text || ':pn:' || public.chave_canonica_telefone(v_tel), 0));
  -- statement novo depois da trava: enxerga o contato que quem esperava acabou de criar
  v_contato := public.wa_resolver_contato_por_numero(v_org, v_tel);
  -- contato existente SEM NOME (nome sem nenhuma letra: telefone, emoji) ganha o nome digitado
  if v_contato is not null then
    update public.contatos set nome = v_nome, nome_fonte = 'manual'
     where id = v_contato and coalesce(nome, '') !~ '[[:alpha:]]';
  end if;
  if v_contato is null then
    insert into public.contatos (nome, telefone, origem, organizacao_id, responsavel_id,
                                 identidade_tipo, identidade_fonte, nome_fonte, identidade_resolvida_em)
    values (v_nome, v_tel, 'Pendências', v_org, auth.uid(),
            'telefone', 'manual', 'manual', now())
    returning id into v_contato;
  end if;

  return public.pend_criar_interno(v_contato, p_tipo, p_o_que, p_prazo, p_processo, p_passos, p_iniciar_em, false);
end $$;

-- ---------------------------------------------------------------- criar: cliente da lista (assinatura intacta)
/* cliente fechado (oportunidade ganha) OU que já tem pendência (cadastrado por número) */
create or replace function public.pendencia_criar(
  p_contato uuid, p_tipo text, p_o_que text, p_prazo date, p_processo text, p_passos jsonb, p_iniciar_em timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.pend_criar_interno(p_contato, p_tipo, p_o_que, p_prazo, p_processo, p_passos, p_iniciar_em, true);
end $$;

-- ---------------------------------------------------------------- leitura: clientes (fechados + com pendência)
/* fechados (oportunidade ganha) + quem tem pendência sem ganho (servico/fechado_em nulos).
   Ordem: fechamento mais recente; quem não fechou entra pela pendência mais recente. */
create or replace function public.pendencias_clientes_fechados(p_busca text default null, p_limite int default 40)
returns table (contato_id uuid, nome text, telefone text, responsavel_id uuid, responsavel_nome text,
               fechado_em timestamptz, servico text, abertas int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public.pend_org_atual(); v_q text := nullif(btrim(coalesce(p_busca,'')), ''); v_d text;
begin
  perform public.pend_exigir_membro(v_org);
  v_d := nullif(regexp_replace(coalesce(v_q,''), '\D', '', 'g'), '');
  return query
  with g as (
    select distinct on (o.contato_id) o.contato_id, o.fechado_em, coalesce(o.tipo_servico, o.titulo) servico
      from public.oportunidades o
     where o.organizacao_id = v_org and o.status = 'ganho'
     order by o.contato_id, o.fechado_em desc nulls last
  ), pe as (
    select p.contato_id, max(p.criado_em) ult
      from public.pendencias p
     where p.organizacao_id = v_org
     group by p.contato_id
  ), base as (
    select coalesce(g.contato_id, pe.contato_id) cid, g.fechado_em, g.servico,
           coalesce(g.fechado_em, pe.ult) chave
      from g full join pe on pe.contato_id = g.contato_id
  )
  select c.id, c.nome, c.telefone, c.responsavel_id, u.nome, b.fechado_em, b.servico,
         (select count(*)::int from public.pendencias p where p.contato_id = c.id and p.status <> 'resolvida')
    from base b join public.contatos c on c.id = b.cid
    left join public.usuarios u on u.id = c.responsavel_id
   where c.mesclado_para is null
     and (v_q is null or c.nome ilike '%' || v_q || '%'
          or (v_d is not null and length(v_d) >= 4 and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') like '%' || v_d || '%')
          -- celular inteiro (10–13 dígitos), com ou sem o 9º dígito: mesma chave canônica do webhook
          or (v_d is not null and length(v_d) between 10 and 13
              and public.chave_canonica_telefone(c.telefone) = public.chave_canonica_telefone(v_d)))
   order by b.chave desc nulls last
   limit greatest(1, least(coalesce(p_limite, 40), 200));
end $$;

-- ---------------------------------------------------------------- Kanban: pendência não vira Lead Novo
/* definição VIVA (09/10) + a guarda 'tem_pendencia' depois de 'ja_ativa' e antes de criar */
create or replace function public.garantir_oportunidade_lead_novo(p_contato uuid, p_conversa uuid default null::uuid, p_canal uuid default null::uuid, p_origem text default null::text, p_forcar boolean default false)
 returns table(oportunidade_id uuid, criou boolean, motivo text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid; v_funil uuid; v_id uuid; v_tem_fechada boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  -- mesma guarda da primitiva: chamada autenticada exige membership; service_role (uid null) é backend confiável.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- Funil principal = padrao=true (não pelo nome). Desempate determinístico.
  select id into v_funil from public.funis
   where organizacao_id = v_org and padrao and not arquivado
   order by ordem asc, criado_em asc, id asc limit 1;
  -- Fallback: org sem padrão marcado -> funil não-arquivado mais antigo (evita "lead sumido" silencioso).
  if v_funil is null then
    select id into v_funil from public.funis
     where organizacao_id = v_org and not arquivado
     order by ordem asc, criado_em asc, id asc limit 1;
  end if;
  if v_funil is null then
    return query select null::uuid, false, 'sem_funil'; return;
  end if;

  -- Já tem oportunidade ATIVA no funil? Retorna a existente (não duplica).
  select id into v_id from public.oportunidades
   where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil and status = 'em_andamento'
   limit 1;
  if v_id is not null then
    return query select v_id, false, 'ja_ativa'; return;
  end if;

  -- DECISÃO DO DONO (09/10): contato com pendência (aba Pendências) fica só na aba; nada no Kanban.
  if exists (select 1 from public.pendencias where organizacao_id = v_org and contato_id = p_contato) then
    return query select null::uuid, false, 'tem_pendencia'; return;
  end if;

  -- DECISÃO DO DONO: contato que já teve oportunidade FECHADA não reentra automático.
  -- (p_forcar=true reserva o caminho manual para reengajar um perdido/ganho, se um dia houver regra.)
  if not p_forcar then
    select exists(
      select 1 from public.oportunidades
       where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil
         and status in ('ganho','perdido','cancelado')
    ) into v_tem_fechada;
    if v_tem_fechada then
      return query select null::uuid, false, 'tem_opp_fechada'; return;
    end if;
  end if;

  -- Cria via primitiva idempotente (coluna de entrada, atendente/etiquetas herdados, ON CONFLICT).
  v_id := public.garantir_oportunidade_entrada(p_contato, v_funil, p_origem, p_conversa, p_canal);
  return query select v_id, (v_id is not null), coalesce(case when v_id is not null then 'criada' end, 'nao_criada');
end $function$;

-- ---------------------------------------------------------------- grants (padrão da feature)
-- helpers internos: ninguém de fora executa (pend_criar_interno pularia a exigência de cliente fechado)
revoke all on function public.pend_normalizar_telefone(text),
  public.pend_criar_interno(uuid,text,text,date,text,jsonb,timestamptz,boolean) from public, anon, authenticated;

revoke all on function public.pendencias_checar_numero(text),
  public.pendencia_criar_numero(text,text,text,text,date,text,jsonb,timestamptz),
  public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencias_clientes_fechados(text,int) from public, anon;
grant execute on function public.pendencias_checar_numero(text),
  public.pendencia_criar_numero(text,text,text,text,date,text,jsonb,timestamptz),
  public.pendencia_criar(uuid,text,text,date,text,jsonb,timestamptz),
  public.pendencias_clientes_fechados(text,int) to authenticated;
-- garantir_oportunidade_lead_novo: "create or replace" mantém os grants vivos (authenticated + service_role)
