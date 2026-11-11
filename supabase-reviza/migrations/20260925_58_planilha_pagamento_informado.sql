-- =====================================================================
-- 58 — Planilha: informar pagamento + comprovante → financeiro aprova
-- (dono 25/09): "nessa planilha aonde tem os pagamentos, tem que ter a opção de
--  informar pagamento e anexar o comprovante — aí quando fizerem isso, o
--  comprovante vai pro financeiro aprovar; quando o financeiro aprovar, fica
--  verde o pagamento; enquanto não aprova fica amarelo; negado fica vermelho;
--  opção de colocar não pago também, aí fica vermelho."
--
-- O fluxo de aprovação JÁ EXISTE (public.entradas + confirmar_entrada/recusar_entrada).
-- Esta migration só liga a planilha a ele. Tudo ADITIVO.
--   (a) entradas.motivo — o motivo da recusa passa a ser guardado (tooltip da célula);
--       entradas.superada_em — a recusa deixa de pintar a célula quando o pagamento
--       daquele mês muda depois dela (inclusive APAGADO pela grade) ou quando o
--       financeiro a dispensa (i). Backfill com a regra antiga (updated_at > resolvido_em).
--   (b) recusar_entrada grava o motivo (resto do corpo IGUAL ao que está no banco)
--   (c) planilha_dados: cada linha cliente ganha "e" (estado da ENTRADA por coluna de mês):
--         "e": {"<coluna_id>": {"st":"pendente"|"recusada", "id":<uuid>, "v":<valor>,
--                               "por":<por_nome>, "em":<quando>, "dec":<resolvido_em|null>,
--                               "mot":<motivo|null>, "cp":<tem comprovante>}}
--       Por (lead, comp) que caia numa coluna de mês do bloco da linha (comp = comp_base + mes_pos):
--         1º qualquer entrada PENDENTE (a mais nova) → "pendente";
--         senão a última DECIDIDA: recusada e não superada (superada_em null) → "recusada";
--         confirmada (ou recusa superada/dispensada) → nada.
--       "e" é omitido quando vazio. As cores (verde/amarelo/vermelho) são do front:
--       pendente > pago > nao_pagou > recusada.
--   (d) gatilho em entradas (CONSTRAINT TRIGGER ADIADO — roda no commit, depois das travas
--       em leads, a mesma ordem lead → versão do planilha_salvar: sem deadlock): sobe
--       planilha_versao (grades abertas atualizam) e, ao INFORMAR (insert pendente), avisa
--       no sino quem aprova (financeiro, gestor e admin ativos).
--   (e) antes do insert em entradas: cliente, quem informou, quando e comprovante vêm do
--       BANCO (o navegador não escolhe os textos do aviso/da dica); comprovante tem de
--       existir no bucket e ser de quem informa; 1 pendência por (cliente, mês).
--   (f) ent_ins: comercial só informa pagamento de cliente DELE (antes a policy aceitava
--       qualquer lead); ninguém forja motivo/superada_em no insert.
--       ent_sel: comercial só LÊ as entradas dos clientes dele (ou que ele informou).
--   (g) índice único: no máximo 1 entrada pendente por (lead, comp).
--   (h) gatilho em pagamentos: mudou/apagou o pagamento do mês → recusa daquele mês superada.
--   (i) dispensar_recusa(p_entrada_id): financeiro+ tira o vermelho de um mês recusado
--       (a célula volta a ficar sem cor de estado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) motivo da recusa + recusa superada
-- ---------------------------------------------------------------------
alter table public.entradas add column if not exists motivo text;
alter table public.entradas add column if not exists superada_em timestamptz;

-- backfill: recusas que a regra antiga já tratava como superadas
update public.entradas en set superada_em = p.updated_at
  from public.pagamentos p
 where en.estado = 'recusada' and en.superada_em is null
   and p.lead_id = en.lead_id and p.comp = en.comp and p.updated_at > en.resolvido_em;

-- ---------------------------------------------------------------------
-- (b) recusar_entrada: igual à viva + guarda o motivo
-- ---------------------------------------------------------------------
create or replace function public.recusar_entrada(p_entrada_id uuid, p_motivo text default null::text)
  returns void
  language plpgsql
  security definer
  set search_path to ''
as $$
declare e public.entradas%rowtype;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into e from public.entradas where id=p_entrada_id for update;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'pendente' then raise exception 'entrada ja decidida'; end if;

  update public.entradas set estado='recusada', resolvido_por=auth.uid(), resolvido_em=now(),
         motivo=nullif(btrim(p_motivo), '')
   where id=p_entrada_id;
  insert into public.competencias(comp) values (e.comp) on conflict do nothing;
  insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, origem_entrada_id, decidido_por)
  values (e.lead_id, e.lead_nome, e.por_nome, e.comp, e.valor, 'recusada', e.comprovante_path, e.id, auth.uid());

  perform public.notificar(e.por_id, 'pagamento_recusado',
    'Pagamento não localizado: ' || coalesce(e.lead_nome, 'cliente'),
    'R$ ' || replace(to_char(e.valor, 'FM999999990.00'), '.', ',') || ' de ' || public.comp_rotulo(e.comp) || ' — o financeiro não achou a entrada no extrato'
      || case when p_motivo is not null and btrim(p_motivo) <> '' then ' (' || btrim(p_motivo) || ')' else '' end
      || '. Confira com o cliente.',
    '/cobrancas/planilha');
end $$;

-- ---------------------------------------------------------------------
-- (c) planilha_dados (SECURITY INVOKER → RLS): igual à 57 + "e" nas linhas cliente.
--     As contas de mês são inline (o authenticated não executa private.pl_meses).
-- ---------------------------------------------------------------------
create or replace function public.planilha_dados() returns jsonb
  language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'blocos', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'dia', b.dia, 'situacao', b.situacao, 'comp_base', b.comp_base)
                       order by (select min(x.ordem) from public.planilha_linhas x where x.bloco = b.id) nulls last, b.id)
        from public.planilha_blocos b), '[]'::jsonb),
    'colunas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'ordem', c.ordem, 'titulo', c.titulo, 'tipo', c.tipo, 'campo', c.campo,
                                          'mes_pos', c.mes_pos, 'largura', c.largura, 'oculta', c.oculta)
                       order by c.ordem, c.id)
        from public.planilha_colunas c), '[]'::jsonb),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'ordem', l.ordem, 'tipo', l.tipo, 'bloco', l.bloco, 'lead_id', l.lead_id,
                                          'altura', l.altura, 'c', coalesce(cc.c, '{}'::jsonb))
                       || case when ee.e is null then '{}'::jsonb else jsonb_build_object('e', ee.e) end
                       order by l.ordem, l.id)
        from public.planilha_linhas l
        left join (
          select ce.linha_id, jsonb_object_agg(ce.coluna_id::text, jsonb_build_array(ce.texto, ce.estilo)) as c
            from public.planilha_celulas ce
           where ce.texto is not null or ce.estilo is not null
           group by ce.linha_id
        ) cc on cc.linha_id = l.id
        -- estado da entrada por coluna de mês (só linha cliente com lead; índice entradas_lead_idx)
        left join lateral (
          select jsonb_object_agg(co.id::text, jsonb_build_object(
                   'st', x.estado, 'id', x.id, 'v', x.valor, 'por', x.por_nome, 'em', x.quando,
                   'dec', x.resolvido_em, 'mot', x.motivo, 'cp', coalesce(x.comprovante_path, '') <> '')) as e
            from (
              -- por competência: 1º a pendente mais nova; senão a última decisão
              select distinct on (en.comp) en.id, en.comp, en.valor, en.por_nome, en.quando, en.estado,
                     en.resolvido_em, en.motivo, en.comprovante_path, en.superada_em
                from public.entradas en
               where l.tipo = 'cliente' and en.lead_id = l.lead_id and en.comp ~ '^[0-9]{4}-[0-9]{2}$'
               order by en.comp, (en.estado = 'pendente') desc, coalesce(en.resolvido_em, en.quando) desc, en.quando desc, en.id desc
            ) x
            join public.planilha_blocos b on b.id = l.bloco and b.comp_base ~ '^[0-9]{4}-[0-9]{2}$'
            join public.planilha_colunas co on co.tipo = 'mes'
             and co.mes_pos = (substr(x.comp, 1, 4)::int * 12 + substr(x.comp, 6, 2)::int)
                            - (substr(b.comp_base, 1, 4)::int * 12 + substr(b.comp_base, 6, 2)::int)
           where x.estado = 'pendente'
              or (x.estado = 'recusada' and x.superada_em is null)
        ) ee on true
       where l.tipo <> 'cliente' or l.lead_id is not null), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- (d) gatilho em entradas: versão da planilha + sino de quem aprova.
--     ADIADO p/ o commit: confirmar/recusar travam leads (FK de pagamentos/mov_fin) e o
--     planilha_salvar trava leads no começo e a versão no fim — travar a versão aqui no
--     meio fechava o ciclo (deadlock). No commit a ordem fica lead → versão para todos.
-- ---------------------------------------------------------------------
create or replace function private.pl_tg_entradas() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare a record; v_titulo text; v_corpo text;
begin
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado
     and old.superada_em is not distinct from new.superada_em then return null; end if;
  perform private.pl_versao_bump();
  -- adiado: só avisa se, no commit, a entrada ainda está pendente
  if tg_op = 'INSERT' and new.estado = 'pendente'
     and exists (select 1 from public.entradas en where en.id = new.id and en.estado = 'pendente') then
    v_titulo := 'Pagamento para conferir: ' || coalesce(new.lead_nome, 'cliente');
    v_corpo := 'R$ ' || replace(to_char(new.valor, 'FM999999990.00'), '.', ',') || ' de ' || public.comp_rotulo(new.comp)
            || ' — informado por ' || coalesce(nullif(btrim(new.por_nome), ''), '—');
    -- notificar() já pula quem informou (gestor/admin que informa não recebe o próprio aviso)
    for a in select id from public.profiles
              where ativo and papel = any (array['financeiro', 'gestor', 'admin']::public.papel_usuario[]) loop
      perform public.notificar(a.id, 'pagamento_informado', v_titulo, v_corpo, '/cobrancas/financeiro');
    end loop;
  end if;
  return null;
end $$;

-- constraint trigger não aceita OR REPLACE: o drop fica
drop trigger if exists entradas_planilha on public.entradas;
create constraint trigger entradas_planilha after insert or update of estado, superada_em on public.entradas
  deferrable initially deferred
  for each row execute function private.pl_tg_entradas();

-- ---------------------------------------------------------------------
-- (e) antes do insert: os textos vêm do banco, não do navegador.
--     Sem usuário (service_role/motor): como veio.
-- ---------------------------------------------------------------------
create or replace function private.pl_tg_entradas_ins() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_nome text; v_papel text;
begin
  if v_uid is null then return new; end if;
  if new.valor is null or new.valor <= 0 then
    raise exception 'Valor inválido: informe um valor maior que zero.' using errcode = '22023';
  end if;
  select nullif(btrim(p.nome), ''), p.papel::text into v_nome, v_papel from public.profiles p where p.id = v_uid;
  new.lead_nome := coalesce((select nullif(l.nome, '') from public.leads l where l.id = new.lead_id), '—');
  new.por_nome  := coalesce(v_nome, '—') || coalesce(' (' || v_papel || ')', '');
  new.quando    := now();
  new.comprovante_path := nullif(btrim(new.comprovante_path), '');
  -- quem não pode informar este cliente cai na policy ent_ins (42501) sem saber se o mês
  -- já tem pendência ou se o arquivo existe
  if not (public.tem_papel('gestor', 'admin') or public.comercial_dono_lead(new.lead_id)) then return new; end if;
  if new.comprovante_path is not null and not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'comprovantes' and o.name = new.comprovante_path
          and (o.owner = v_uid or o.owner_id = v_uid::text)) then
    raise exception 'Comprovante não encontrado — anexe o arquivo de novo.' using errcode = '22023';
  end if;
  if new.estado = 'pendente' and exists (
       select 1 from public.entradas en
        where en.lead_id = new.lead_id and en.comp = new.comp and en.estado = 'pendente') then
    raise exception 'Já há pagamento deste mês aguardando o financeiro.' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists entradas_normaliza on public.entradas;
create trigger entradas_normaliza before insert on public.entradas
  for each row execute function private.pl_tg_entradas_ins();

-- ---------------------------------------------------------------------
-- (f) quem informa: comercial DONO do cliente, gestor, admin (cadastro/financeiro não).
--     Mesmas travas de antes + motivo/superada_em nunca vêm do insert.
--     Quem lê: qualquer papel ativo, exceto o comercial — esse só os clientes dele
--     (ou o que ele mesmo informou). O motor usa service_role (fora da RLS).
-- ---------------------------------------------------------------------
drop policy if exists ent_ins on public.entradas;
create policy ent_ins on public.entradas for insert to authenticated
  with check (public.tem_papel('comercial','gestor','admin')
              and por_id = auth.uid()
              and estado = 'pendente'
              and resolvido_por is null and resolvido_em is null
              and motivo is null and superada_em is null
              and (public.tem_papel('gestor','admin') or public.comercial_dono_lead(lead_id)));

drop policy if exists ent_sel on public.entradas;
create policy ent_sel on public.entradas for select to authenticated
  using ((select public.current_papel()) is not null
         and ((select public.current_papel()) <> 'comercial'::public.papel_usuario
              or por_id = (select auth.uid())
              or public.comercial_dono_lead(lead_id)));

-- ---------------------------------------------------------------------
-- (g) no máximo 1 pendência por (cliente, mês): duplo clique, modal antigo ou dois
--     informando o mesmo mês não geram 2 avisos. (O gatilho (e) já dá a mensagem;
--     o índice segura a corrida.)
-- ---------------------------------------------------------------------
create unique index if not exists entradas_pendente_uq on public.entradas (lead_id, comp)
  where estado = 'pendente';

-- ---------------------------------------------------------------------
-- (h) pagamento do mês mudou (grade, ficha, importador, motor — inclusive APAGADO):
--     a recusa daquele (lead, comp) deixa de pintar a célula. Sem olhar planilha.sync:
--     o apagar pela grade é justamente o caso.
-- ---------------------------------------------------------------------
create or replace function private.pl_tg_pag_supera_recusa() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.lead_id, old.comp, old.status, old.valor)
                          is not distinct from (new.lead_id, new.comp, new.status, new.valor) then
    return null;
  end if;
  update public.entradas set superada_em = now()
   where estado = 'recusada' and superada_em is null
     and ((tg_op <> 'INSERT' and lead_id = old.lead_id and comp = old.comp)
       or (tg_op <> 'DELETE' and lead_id = new.lead_id and comp = new.comp));
  return null;
end $$;

drop trigger if exists pagamentos_supera_recusa on public.pagamentos;
create trigger pagamentos_supera_recusa after insert or update or delete on public.pagamentos
  for each row execute function private.pl_tg_pag_supera_recusa();

-- ---------------------------------------------------------------------
-- (i) dispensar a recusa de um mês (financeiro+): a célula recusada e vazia não tem
--     outra saída (limpar célula vazia não muda nada). A versão sobe no gatilho (d).
-- ---------------------------------------------------------------------
create or replace function public.dispensar_recusa(p_entrada_id uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare e public.entradas%rowtype; v_n int;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into e from public.entradas where id = p_entrada_id;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'recusada' then raise exception 'entrada nao recusada'; end if;
  update public.entradas set superada_em = now()
   where estado = 'recusada' and superada_em is null
     and (id = p_entrada_id or (e.lead_id is not null and lead_id = e.lead_id and comp = e.comp));
  get diagnostics v_n = row_count;
  if v_n > 0 then   -- já dispensada/superada: nada muda, nada registra
    perform private.registrar('dispensou recusa', 'grade', e.lead_id::text, e.lead_nome,
      public.comp_rotulo(e.comp) || ' · ' || private.brl(e.valor));
  end if;
end $$;

revoke all on function private.pl_tg_entradas(), private.pl_tg_entradas_ins(), private.pl_tg_pag_supera_recusa()
  from public, anon, authenticated;
revoke all on function public.planilha_dados(), public.recusar_entrada(uuid, text), public.dispensar_recusa(uuid) from public, anon;
grant execute on function public.planilha_dados(), public.recusar_entrada(uuid, text), public.dispensar_recusa(uuid) to authenticated;
