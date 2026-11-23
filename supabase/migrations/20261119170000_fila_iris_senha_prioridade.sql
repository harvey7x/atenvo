-- Fila da Iris: quem passou a senha do INSS é Prioridade (dono 19/11 e 21/11)
--
-- Pedido do dono: "para quem passou a senha do INSS, tá? Esses daí são prioridades para a gente já entrar no
-- INSS e assinar." Escolhas dele: TODOS os casos abertos (card antigo e Remarketing também); no topo de
-- Prioridade, com a marca SENHA DO INSS; e a última mensagem que parece senha NÃO aparece na fila
-- (vira "Mensagem com senha (oculta)"). 21/11: "só aqueles que não foram fechados" — cliente com card ganho (em
-- qualquer data) ou completo no sistema do administrativo (adm_fechados) não ganha a prioridade da senha.
--
-- SÓ A PRESENÇA: nada aqui guarda, devolve ou mostra o valor da senha. Os três sinais:
--   1) a ficha judicial do cliente tem a senha do INSS preenchida (quando: a criação da ficha);
--   2) o roteiro da Iris aceitou a senha (ia_eventos govbr_roteiro: senha_aceita, senha_aceita_pos_handoff,
--      credencial_repetida). O "chamou humano / auxílio senha" NÃO entra: ele também sai quando o cliente só pergunta
--      se pode mandar a senha;
--   3) o cliente digitou a senha na conversa: o relógio dos avisos (a cada minuto) marca só QUANDO, em
--      fila_iris_senha_digitada, pela detecção fila_iris_texto_tem_senha (passo 2: "senha … X" com X de 6 a 40
--      caracteres e um número; o formato da senha do gov.br numa mensagem curta; a resposta de uma palavra com letra
--      e número depois de a gente pedir a senha por texto; e-mail, site e R$ não contam).
-- A senha só conta se veio depois da criação do card aberto (a de um caso antigo não vale para o card novo). Quem
-- entra só pela senha (card antigo ou Remarketing) entra com UM card (o mais novo com a senha), e só se não tiver um
-- card que já entra na fila (sem linha repetida).
-- Marcado "fora da fila" continua fora. Fechado/perdido continua fora.
-- Os avisos "A Iris passou" não mudam de texto: quem está em Prioridade só pela senha não gera o aviso de
-- documentação completa; quando completar a documentação, gera (como antes).
--
-- A CHAVE COMEÇA DESLIGADA (a fila fica como antes, com a máscara e a marcação das mensagens já rodando). Ligar
-- só depois que a tela nova estiver no ar E as abas abertas recarregarem (a tela velha mostraria quem está só pela
-- senha como "Documentação completa"):
--   update public.fila_iris_config set senha_prioridade = true;
-- Desligar sem desfazer (a fila volta a ser como antes e as colunas da senha vêm sem valor — a tela volta aos textos
-- de antes): update public.fila_iris_config set senha_prioridade = false;
-- Desfazer tudo (funções de 19/11 de volta): supabase/ops/fila_iris_senha_desfazer.sql

set lock_timeout = '5s';

-- 0) trava: esta migration foi escrita sobre o texto vivo de 19/11
do $trava$
declare v_base text; v_itens text; v_tick text;
begin
  -- o relógio dos avisos (cron a cada minuto) espera esta migration: a batida que cair agora pula a volta
  perform pg_advisory_xact_lock(hashtext('fila_iris_avisos_tick'));
  select md5(prosrc) into v_base from pg_proc where oid = 'public.fila_iris_itens_base(uuid, uuid)'::regprocedure;
  select md5(prosrc) into v_itens from pg_proc where oid = 'public.fila_iris_itens(uuid, uuid)'::regprocedure;
  select md5(prosrc) into v_tick from pg_proc where oid = 'public.fila_iris_avisos_tick()'::regprocedure;
  if v_base is distinct from '2fc1340b5c0d1aacd4ef7a53459fddea' then
    raise exception 'fila_iris_itens_base mudou depois de 19/11 (md5 %): confira antes de aplicar', v_base;
  end if;
  if v_itens is distinct from '639820d98c73c75216b100f37084fec0' then
    raise exception 'fila_iris_itens mudou depois de 19/11 (md5 %): confira antes de aplicar', v_itens;
  end if;
  if v_tick is distinct from '3a98474f57c712a2e19499b4de3543b1' then
    raise exception 'fila_iris_avisos_tick mudou depois de 19/11 (md5 %): confira antes de aplicar', v_tick;
  end if;
end
$trava$;

create or replace function pg_temp.fila_trocar(p_def text, p_de text, p_para text, p_onde text)
returns text language plpgsql as $f$
begin
  if (length(p_def) - length(replace(p_def, p_de, ''))) / length(p_de) <> 1 then
    raise exception '%: o trecho "%" não está lá uma vez só', p_onde, left(p_de, 70);
  end if;
  return replace(p_def, p_de, p_para);
end
$f$;

-- 1) QUANDO o cliente digitou a senha do INSS na conversa. Só a presença: o valor nunca é guardado
-- (sem chave estrangeira: criar uma travaria contatos e organizacoes até o fim desta migration — os leads novos
-- esperariam; um cliente apagado deixa uma linha órfã, inofensiva)
create table if not exists public.fila_iris_senha_digitada (
  contato_id uuid primary key,
  organizacao_id uuid not null,
  primeiro_em timestamptz not null,
  ultimo_em timestamptz not null
);
create index if not exists fila_iris_senha_digitada_org_idx on public.fila_iris_senha_digitada (organizacao_id);
alter table public.fila_iris_senha_digitada enable row level security;
-- sem política: só as funções leem e gravam
revoke all on table public.fila_iris_senha_digitada from anon, authenticated;
comment on table public.fila_iris_senha_digitada is
  'Quando o cliente digitou a senha do INSS na conversa (dono 19/11). SÓ A PRESENÇA: o valor nunca é guardado aqui.';

-- 2) A MENSAGEM TRAZ A SENHA? (detecção: só sim/não, para marcar QUANDO o cliente passou a senha). Vale:
--   a) "senha: X", "a senha (da minha mãe) é X": X de 6 a 40 caracteres com número; "senha X", "senha do gov X",
--      "a senha que eu uso é X" (até 6 palavras depois de "senha") e "X é a senha" (até 3 antes): X de 6 a 40 com letra
--      E número (número de benefício, CPF e telefone não contam);
--   b) mensagem curta (até 4 palavras) com uma palavra no formato da senha do gov.br: 8 a 40 caracteres com maiúscula,
--      minúscula, número e símbolo — sem precisar de pedido (o pedido costuma ser em áudio);
--   c) com p_pedimos (a gente pediu a senha por texto nas 72 h antes): a mensagem é uma palavra só, de 6 a 40
--      caracteres, com letra e número.
--   E-mail, site e dinheiro (R$) nunca contam. Formatação do WhatsApp (*negrito*, _itálico_) e pontuação das pontas saem.
create or replace function public.fila_iris_texto_tem_senha(p_texto text, p_pedimos boolean default false)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $f$
declare
  v_pal text[];
  v_lim text[] := '{}';
  v_cru text;
  v text;
  v_x text;
  v_i integer;
  v_j integer;
  v_n integer;
begin
  if p_texto is null or p_texto !~ '[0-9#$%&*@_+=]' then
    return false;
  end if;
  -- sem a palavra "senha", só a mensagem curta pode trazer a senha (b, c): a mensagem longa sai aqui, sem separar palavras
  if p_texto !~* 'senha' and btrim(p_texto) !~ '^\S+(\s+\S+){0,5}$' then
    return false;
  end if;
  -- as palavras sem a pontuação das pontas e sem a formatação do WhatsApp (as só de emoji/pontuação saem)
  v_pal := regexp_split_to_array(btrim(p_texto), '\s+');
  foreach v_cru in array v_pal loop
    v := regexp_replace(v_cru, '^[("''“‘\[*_~]+|[)"''”’\].,;:!?*_~]+$', '', 'g');
    if v ~ '[A-Za-zÀ-ÿ0-9]' then
      v_lim := v_lim || v;
    end if;
  end loop;
  v_n := coalesce(array_length(v_lim, 1), 0);
  -- a) com a palavra "senha"
  if p_texto ~* 'senha' then
    foreach v_x in array array[
        (regexp_match(p_texto, 'senha[^\n:=]{0,30}[:=]\s*([^\s,;]+)', 'i'))[1],
        (regexp_match(p_texto, 'senha\s+(?:d[aeo]s?\s+(?:[\w.]+\s+){1,4}|del[ae]s?\s+)?(?:é|e|eh)\s+([^\s,;]+)', 'i'))[1]] loop
      v_x := regexp_replace(coalesce(v_x, ''), '^[("''“‘\[*_~]+|[)"''”’\].,;:!?*_~]+$', '', 'g');
      if length(v_x) between 6 and 40 and v_x ~ '[0-9]'
         and v_x !~* '@[^@.]+\.[a-z]{2,}' and v_x !~* '\.(com|br|gov|org|net)(/|$)' and v_x !~* '^(https?:|www\.|r\$)' then
        return true;
      end if;
    end loop;
    for v_i in 1 .. v_n loop
      if v_lim[v_i] ~* 'senha' then
        for v_j in greatest(1, v_i - 3) .. least(v_n, v_i + 6) loop
          v_x := v_lim[v_j];
          if v_j <> v_i and length(v_x) between 6 and 40 and v_x ~ '[0-9]' and v_x ~ '[A-Za-zÀ-ÿ]' and v_x !~* 'senha'
             and v_x !~* '@[^@.]+\.[a-z]{2,}' and v_x !~* '\.(com|br|gov|org|net)(/|$)' and v_x !~* '^(https?:|www\.|r\$)' then
            return true;
          end if;
        end loop;
      end if;
    end loop;
  end if;
  -- b) mensagem curta com uma palavra no formato da senha do gov.br
  if v_n between 1 and 4 then
    foreach v_x in array v_lim loop
      if length(v_x) between 8 and 40 and v_x ~ '[A-ZÀ-Þ]' and v_x ~ '[a-zß-ÿ]' and v_x ~ '[0-9]' and v_x ~ '[^A-Za-zÀ-ÿ0-9]'
         and v_x !~* '@[^@.]+\.[a-z]{2,}' and v_x !~* '\.(com|br|gov|org|net)(/|$)' and v_x !~* '^(https?:|www\.|r\$)' then
        return true;
      end if;
    end loop;
  end if;
  -- c) depois de a gente pedir a senha: a resposta de uma palavra só, com letra e número
  if p_pedimos and v_n = 1 and length(v_lim[1]) between 6 and 40 and v_lim[1] ~ '[A-Za-zÀ-ÿ]' and v_lim[1] ~ '[0-9]'
     and v_lim[1] !~* '@[^@.]+\.[a-z]{2,}' and v_lim[1] !~* '\.(com|br|gov|org|net)(/|$)' and v_lim[1] !~* '^(https?:|www\.|r\$)' then
    return true;
  end if;
  return false;
end
$f$;
revoke all on function public.fila_iris_texto_tem_senha(text, boolean) from public, anon, authenticated;

-- 2b) o texto parece uma senha? A fila NÃO mostra essa mensagem: "Mensagem com senha (oculta)". Regra LARGA (esconder
-- demais custa um clique; mostrar uma senha, não) e que cobre TUDO o que a detecção acima aceita:
--   a) alguma palavra com cara de senha: 8 a 40 caracteres (contando a pontuação das pontas: "Ana2024!"), uma letra e
--      (um número ou um símbolo no meio); não é e-mail, site, dinheiro nem só números;
--   b) até 8 palavras depois ou 3 antes de "senha"/"login"/"usuário" (ou colado: "senha:Ana@12"), uma palavra de 4 a
--      40 caracteres com número ou símbolo (um e-mail aí também esconde);
--   c) o que a detecção acha (fila_iris_texto_tem_senha, como se a gente tivesse pedido: a palavra só "Jose12").
-- Sem número nem símbolo não há senha: a maioria das mensagens sai na primeira linha.
create or replace function public.fila_iris_parece_senha(p_texto text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $f$
declare
  v_pal text[];
  v_cru text;
  v text;
  v_i integer := 0;
  v_rot integer := 0;
  v_cand integer := 0;
  v_tem_rot boolean;
  v_eh_rot boolean;
begin
  if p_texto is null or p_texto !~ '[0-9#$%&*@_+=]' then
    return false;
  end if;
  if public.fila_iris_texto_tem_senha(p_texto, true) then
    return true;
  end if;
  v_tem_rot := p_texto ~* '(senha|login|password|usu[aá]rio)';
  v_pal := regexp_split_to_array(btrim(p_texto), '\s+');
  foreach v_cru in array v_pal loop
    v_i := v_i + 1;
    v_eh_rot := v_tem_rot and v_cru ~* '(senha|login|password|usu[aá]rio)';
    -- o valor colado no rótulo ("senha:Ana@12", "login=maria2024")
    if v_eh_rot and v_cru ~* '(senha|login|password|usu[aá]rio)s?[:=]+\S{4,40}$'
       and substring(v_cru from '[:=]+(\S*)$') ~ '[0-9#$%&*@_+=]' then
      return true;
    end if;
    -- até 3 palavras antes do rótulo ("Ana@12 é a senha")
    if v_eh_rot and v_cand > 0 and v_i - v_cand <= 3 then
      return true;
    end if;
    if length(v_cru) >= 4 and v_cru ~ '[0-9#$%&*@_+=]' then
      -- sem a pontuação das pontas nem a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~)
      v := regexp_replace(v_cru, '^[("''“‘\[*_~]+|[)"''”’\].,;:!?*_~]+$', '', 'g');
      -- a) a palavra tem cara de senha (também a colada no rótulo: "senha-Ana@2024"); o tamanho conta as pontas
      if greatest(length(v), length(v_cru)) between 8 and 40 and v ~ '[A-Za-zÀ-ÿ]'
         and (v ~ '[0-9]' or v ~ '[A-Za-zÀ-ÿ0-9][#$%&*@_+=][A-Za-zÀ-ÿ0-9]')
         and v !~* '@[^@.]+\.[a-z]{2,}' and v !~* '\.(com|br|gov|org|net)(/|$)' and v !~* '^(https?:|www\.)'
         and v !~* '^r\$' and v !~ '^[0-9]+$' then
        return true;
      end if;
      if not v_eh_rot and length(v) between 4 and 40 and v ~ '[0-9#$%&*@_+=]' and v !~* '^r\$' then
        -- b) até 8 palavras depois do rótulo
        if v_rot > 0 and v_i - v_rot <= 8 then
          return true;
        end if;
        v_cand := v_i;
      end if;
    end if;
    if v_eh_rot then
      v_rot := v_i;
    end if;
  end loop;
  return false;
end
$f$;
revoke all on function public.fila_iris_parece_senha(text) from public, anon, authenticated;

-- 3) marca QUANDO o cliente digitou a senha nas mensagens gravadas entre p_desde e p_ate (só a presença), pela
-- detecção do passo 2. Quem chama: o relógio dos avisos (a cada minuto, as novas) e esta migration (todas, uma vez)
create or replace function public.fila_iris_senha_marcar(p_org uuid, p_desde timestamptz, p_ate timestamptz)
returns integer
language plpgsql
set search_path = public, pg_temp
as $f$
declare v_n integer;
begin
  with novas as (
    -- as mensagens do cliente gravadas na janela, com número ou símbolo (sem isso não há senha); a hora que vale é a
    -- do envio
    select c.contato_id, m.conversa_id, m.criado_em, coalesce(m.enviada_em, m.criado_em) as em, m.conteudo as t
      from public.mensagens m join public.conversas c on c.id = m.conversa_id
     where m.organizacao_id = p_org and m.criado_em > p_desde and m.criado_em <= p_ate
       and m.direcao = 'entrada' and m.tipo::text = 'texto' and m.conteudo ~ '[0-9#$%&*@_+=]'
  ), ok as (
    select n.contato_id, min(n.em) as primeiro, max(n.em) as ultimo
      from novas n
     where public.fila_iris_texto_tem_senha(n.t,
             -- a gente pediu a senha por texto nas 72 h antes (só conta para a resposta de uma palavra; nota interna e
             -- mensagem do sistema não contam)
             btrim(n.t) !~ '\s\S+\s\S+\s' and exists (
               select 1 from public.mensagens o
                where o.conversa_id = n.conversa_id and o.direcao = 'saida' and o.tipo not in ('nota_interna', 'sistema')
                  and o.criado_em between n.criado_em - interval '72 hours' and n.criado_em
                  and o.conteudo ~* 'senha' and o.conteudo !~* 'nunca pedimos senhas'))
     group by n.contato_id
  )
  insert into public.fila_iris_senha_digitada as sd (contato_id, organizacao_id, primeiro_em, ultimo_em)
  select o.contato_id, p_org, o.primeiro, o.ultimo from ok o
  on conflict (contato_id) do update
     set primeiro_em = least(sd.primeiro_em, excluded.primeiro_em),
         ultimo_em = greatest(sd.ultimo_em, excluded.ultimo_em)
   where excluded.primeiro_em < sd.primeiro_em or excluded.ultimo_em > sd.ultimo_em;
  get diagnostics v_n = row_count;
  return v_n;
end
$f$;
revoke all on function public.fila_iris_senha_marcar(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 4) as mensagens que já existem (uma vez; antes de travar as tabelas da fila); daqui em diante o relógio marca as novas
do $varre$
declare r record;
begin
  for r in select organizacao_id from public.fila_iris_config loop
    perform public.fila_iris_senha_marcar(r.organizacao_id, '-infinity'::timestamptz, now());
  end loop;
end
$varre$;

-- 5) a chave (desligar sem desfazer) e até onde as mensagens já foram olhadas
alter table public.fila_iris_config
  add column if not exists senha_prioridade boolean not null default false,
  add column if not exists senha_varrida_ate timestamptz;
comment on column public.fila_iris_config.senha_prioridade is
  'Quem passou a senha do INSS é Prioridade na fila (dono 19/11). Nasce false (ligar depois que as abas recarregarem a tela nova); false = a fila como antes.';
-- a varredura de cima foi até o começo desta transação; o relógio continua dali (com 5 min de folga)
update public.fila_iris_config set senha_varrida_ate = now();

-- 6) o relógio guarda quem está em Prioridade só pela senha (para avisar quando completar a documentação)
alter table public.fila_iris_estado add column if not exists so_senha boolean not null default false;

-- 7) a fila: + senha_inss, senha_em e senha_na_ficha no fim (o retorno muda: recriar a base e o invólucro)
drop function public.fila_iris_itens(uuid, uuid);
drop function public.fila_iris_itens_base(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fila_iris_itens_base(p_org uuid, p_dono uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text, categoria text, aguardando boolean, coluna text, campanha text, entrou_em timestamp with time zone, ult_cliente_em timestamp with time zone, ult_nossa_em timestamp with time zone, ult_doc_em timestamp with time zone, doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamp with time zone, marcacoes jsonb, ult_cliente_texto text, ult_nossa_texto text, ult_nossa_origem text, senha_inss boolean, senha_em timestamp with time zone, senha_na_ficha boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cfg public.fila_iris_config;
  v_dono uuid := p_dono;
begin
  -- SEM checagem de acesso: só a fila_iris_itens (que checa) e o relógio dos avisos chamam esta função
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;

  return query
  with senhas as (
    -- dono 19/11: "para quem passou a senha do INSS — esses daí são prioridades para a gente já entrar no INSS e
    -- assinar". SÓ A PRESENÇA (o valor da senha nunca sai daqui): a ficha do cliente tem a senha; a Iris recebeu a
    -- senha; o cliente digitou a senha na conversa (marcado pelo relógio dos avisos em fila_iris_senha_digitada).
    -- senha_em = o sinal mais recente; ficha_em = o da ficha (para dizer onde a senha está)
    select x.contato_id, max(x.em) as senha_em, max(x.em) filter (where x.na_ficha) as ficha_em
      from (
        select f.contato_id, f.criado_em as em, true as na_ficha
          from public.fichas_judiciais f
         where f.organizacao_id = p_org and f.contato_id is not null
           -- a versão atual da ficha (uma versão nova pode ter tirado a senha), com algo que pode ser senha
           and not exists (select 1 from public.fichas_judiciais f2 where f2.ficha_anterior_id = f.id)
           and length(btrim(f.senha_inss)) >= 4
           and btrim(f.senha_inss) !~* '^(n[aã]o|n[aã]o tem|sem|sem senha|nenhuma?|-+|x+|[.]+|0+)$'
        union all
        select cv.contato_id, e.criado_em, false
          from public.ia_eventos e join public.conversas cv on cv.id = e.conversa_id
         where e.organizacao_id = p_org
           -- o roteiro aceitou a senha ("chamou humano / auxílio senha" não: sai também quando o cliente só pergunta)
           and e.tipo = 'govbr_roteiro' and e.detalhe->>'saida' in ('senha_aceita', 'senha_aceita_pos_handoff', 'credencial_repetida')
        union all
        select sd.contato_id, sd.ultimo_em, false
          from public.fila_iris_senha_digitada sd
         where sd.organizacao_id = p_org
      ) x
     where cfg.senha_prioridade is true
       -- dono 21/11: "só aqueles que não foram fechados" — card ganho em qualquer data ou completo no administrativo
       and not exists (select 1 from public.oportunidades og where og.contato_id = x.contato_id and og.status = 'ganho')
       and not exists (select 1 from public.adm_fechados af where af.organizacao_id = p_org and af.contato_id = x.contato_id)
     group by x.contato_id
  ), cards as (
    select o.id as opp_id, o.contato_id, o.criado_em, fc.nome as col, sn.senha_em,
           -- a senha MAIS NOVA está na ficha do cliente (senão, na conversa)
           coalesce(sn.ficha_em >= sn.senha_em, false) as senha_ficha,
           -- o card entra na fila como sempre: fora do Remarketing, cliente novo (desde cfg.inicio) ou da lista da Iris
           -- de 11/11, de qualquer data
           (not (fc.nome = any (cfg.colunas_fora))
            and (coalesce(o.entrada_em, o.criado_em) >= cfg.inicio
                 or exists (select 1 from public.fila_iris_divisao dv where dv.contato_id = o.contato_id))) as no_escopo
      from public.oportunidades o
      join public.funil_colunas fc on fc.id = o.coluna_id
      -- a senha conta só se veio depois da entrada deste card (a de um caso antigo, já encerrado, não vale)
      left join senhas sn on sn.contato_id = o.contato_id and sn.senha_em >= coalesce(o.entrada_em, o.criado_em)
     where o.organizacao_id = p_org and o.status = 'em_andamento'
  ), cards_cli as (
    select k.*,
           bool_or(k.no_escopo) over (partition by k.contato_id) as cli_no_escopo,
           row_number() over (partition by k.contato_id order by (k.senha_em is not null) desc, k.criado_em desc, k.opp_id) as n_cli
      from cards k
  ), abertas as (
    select k.opp_id, k.contato_id, k.criado_em, k.col, k.senha_em, k.senha_ficha
      from cards_cli k
     where k.no_escopo
        -- dono 19/11 ("todos os abertos"): quem passou a senha do INSS entra mesmo de card antigo ou do Remarketing
        -- (qualquer coluna de cfg.colunas_fora — hoje só REMARKETING) — com um card só (o mais novo com a senha) e só se
        -- não tiver um card que já entra na fila
        or (k.senha_em is not null and not k.cli_no_escopo and k.n_cli = 1)
  ), pend as (
    -- prioridade 0 (assinou e falta o histórico de créditos): vale para clientes antigos também,
    -- e para o caso já completo no CAF (o kit assinado completa o caso mesmo sem o histórico)
    select distinct on (p.contato_id) p.contato_id, p.falta, p.assinado_em,
           public.adm_usuario_do_vendedor(p_org, p.vendedor) as vend_id
      from public.adm_pendencias p
     where p.organizacao_id = p_org and p.contato_id is not null
       and p.assinado and 'historico' = any (p.falta)
     order by p.contato_id, p.assinado_em desc nulls last
  ), alvo as (
    select coalesce(a.contato_id, pd.contato_id) as contato_id, a.opp_id, a.criado_em, a.col, a.senha_em, a.senha_ficha,
           pd.contato_id is not null as hist, pd.falta as pend_falta, pd.assinado_em as pend_assinado_em, pd.vend_id
      from abertas a full join pend pd on pd.contato_id = a.contato_id
  ), dono as (
    -- prioridade 0: fica com o vendedor do caso no CAF (quem já está com ele); sem ele, o dono de sempre
    select al.*, cv.id as conv_id, cv.canal_id,
           coalesce(case when al.hist then al.vend_id end, cv.atendente_id, ct.responsavel_id,
                    (select o2.responsavel_id from public.oportunidades o2 where o2.id = al.opp_id)) as dono_id,
           ct.nome as ct_nome, ct.telefone as ct_tel
      from alvo al
      join public.contatos ct on ct.id = al.contato_id
      left join lateral (select c.id, c.atendente_id, c.canal_id from public.conversas c
                          where c.contato_id = al.contato_id order by c.ultima_interacao_em desc nulls last limit 1) cv on true
     -- fechado/perdido sai da fila; a prioridade 0 não (sai quando o histórico chega ao CAF)
     where al.hist or not exists (select 1 from public.oportunidades og
                        where og.contato_id = al.contato_id and og.status in ('ganho','perdido','cancelado')
                          and og.fechado_em >= coalesce(al.criado_em, '-infinity'::timestamptz))
  ), filtrado as (
    select d.* from dono d where v_dono is null or d.dono_id = v_dono
  ), msg as (
    select f.contato_id,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo not in ('sistema','nota_interna')) as u_in,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida' and m.tipo not in ('sistema','nota_interna')) as u_out,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo in ('imagem','documento')) as u_doc
      from filtrado f join public.mensagens m on m.conversa_id = f.conv_id
     group by f.contato_id
  ), ses as (
    select distinct on (s.conversa_id) s.conversa_id, s.docs
      from public.ia_sessoes s join filtrado f on f.conv_id = s.conversa_id
     order by s.conversa_id, s.atualizado_em desc
  ), marc as (
    select mk.contato_id,
           jsonb_agg(jsonb_build_object('id', mk.id, 'tipo', mk.tipo, 'texto', mk.texto, 'vezes', mk.vezes,
                                        'em', mk.atualizado_em, 'vence_em', case when mk.tipo in ('nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta') then greatest(mk.prazo_desde, coalesce(fe.na_fila_desde, now())) + make_interval(hours => coalesce(cfg.horas_marcacao, 36)) end, 'ult', (select jsonb_build_object('texto', au.texto, 'por', au.usuario_id, 'por_nome', (select u.nome from public.usuarios u where u.id = au.usuario_id), 'em', au.criado_em) from public.fila_iris_marcacao_atualizacoes au where au.marcacao_id = mk.id order by au.criado_em desc limit 1)) order by mk.atualizado_em desc) as lista,
           bool_or(mk.tipo = 'fora_da_fila') as fora,
           bool_or(mk.tipo = 'docs_completos') as forca_ok,
           bool_or(mk.tipo = 'docs_incompletos') as forca_nao
      from public.fila_iris_marcacoes mk
      -- o prazo só corre com o cliente na fila do dono de agora (o relógio dos avisos guarda desde quando);
      -- sem a linha do relógio (acabou de entrar, ou trocou de dono), começa agora
      -- (o dono pela mesma régua do relógio: o card mais novo do cliente entre TODOS os cards, não só os da fila de
      -- quem pede — o vencimento é o mesmo para o atendente, o administrador e o relógio; e a linha do relógio só
      -- vale com a batida viva)
      left join (select distinct on (d.contato_id) d.contato_id, d.dono_id from dono d
                  order by d.contato_id, d.criado_em desc nulls last, d.opp_id) fd on fd.contato_id = mk.contato_id
      left join public.fila_iris_estado fe on fe.contato_id = mk.contato_id and fe.dono_id = fd.dono_id
             and cfg.avisos_tick_em > now() - interval '5 minutes'
     where mk.organizacao_id = p_org and mk.removido_em is null
       and mk.contato_id in (select f.contato_id from filtrado f)
     group by mk.contato_id
  ), junto as (
    select f.*, mg.u_in, mg.u_out, mg.u_doc,
      coalesce((se.docs->'doc_pessoal'->>'frente')::boolean and (se.docs->'doc_pessoal'->>'verso')::boolean, false) as d_ok,
      coalesce(se.docs ? 'comprovante', false) as c_ok,
      (coalesce(se.docs ? 'doc_pessoal' or se.docs ? 'comprovante', false) or mg.u_doc is not null) as algum,
      mc.lista, coalesce(mc.fora, false) as fora, coalesce(mc.forca_ok, false) as f_ok, coalesce(mc.forca_nao, false) as f_nao
      from filtrado f
      left join msg mg on mg.contato_id = f.contato_id
      left join ses se on se.conversa_id = f.conv_id
      left join marc mc on mc.contato_id = f.contato_id
  ), cls as (
    select j.*,
      case
        when j.hist then 'historico'
        -- dono 19/11: quem passou a senha do INSS é Prioridade (com ou sem toda a documentação)
        when j.senha_em is not null then 'quente'
        when (j.f_ok or (j.d_ok and j.c_ok)) and not j.f_nao then 'quente'
        when (j.algum or j.f_nao) and coalesce(j.u_doc, j.u_in) <= now() - make_interval(hours => cfg.horas_documentacao) then 'documentacao'
        when not j.algum and j.u_in is not null and j.u_out > j.u_in and j.u_out <= now() - make_interval(hours => cfg.horas_sem_resposta) then 'sem_resposta'
        else null
      end as cat
      from junto j
     where not j.fora
  )
  select c.contato_id, c.conv_id, c.opp_id, c.dono_id, c.ct_nome, c.ct_tel,
         c.cat, (c.u_in is not null and (c.u_out is null or c.u_in > c.u_out)),
         c.col, coalesce(nullif(cn.campanha, ''), cn.nome_interno),
         c.criado_em, c.u_in, c.u_out, c.u_doc,
         (c.d_ok or c.f_ok) and not c.f_nao, (c.c_ok or c.f_ok) and not c.f_nao,
         c.pend_falta, c.pend_assinado_em, coalesce(c.lista, '[]'::jsonb),
         -- o que o cliente escreveu por último (sempre: a fila mostra a última mensagem dele em cada linha)
         case when c.u_in is not null then
           (select case when public.fila_iris_parece_senha(m3.conteudo) then 'Mensagem com senha (oculta)'
                        else left(coalesce(nullif(m3.conteudo, ''), '[' || m3.tipo::text || ']'), 160) end
              from public.mensagens m3
             where m3.conversa_id = c.conv_id and m3.direcao = 'entrada' and m3.tipo not in ('sistema', 'nota_interna')
             order by coalesce(m3.enviada_em, m3.criado_em) desc limit 1)
         end,
         -- a NOSSA última mensagem (dono 13/11: a fila mostra a última mensagem da conversa, de quem for): o texto e de
         -- onde saiu (bot = IA/robô, atenvo = painel, telefone = celular) — a mesma régua do u_out
         nos.texto, nos.origem,
         -- dono 19/11: passou a senha do INSS (só a presença, quando e se ela está na ficha do cliente); com a chave
         -- desligada, sem valor (a tela volta aos textos de antes)
         case when cfg.senha_prioridade is true then c.senha_em is not null end, c.senha_em,
         case when cfg.senha_prioridade is true then coalesce(c.senha_ficha, false) end
    from cls c
    left join public.canais cn on cn.id = c.canal_id
    left join lateral (
      select case when public.fila_iris_parece_senha(m4.conteudo) then 'Mensagem com senha (oculta)'
                  else left(coalesce(nullif(m4.conteudo, ''), '[' || m4.tipo::text || ']'), 160) end as texto, m4.origem
        from public.mensagens m4
       where m4.conversa_id = c.conv_id and m4.direcao = 'saida' and m4.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m4.enviada_em, m4.criado_em) desc
       limit 1) nos on c.u_out is not null
   where c.cat is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fila_iris_itens(p_org uuid, p_dono uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text, categoria text, aguardando boolean, coluna text, campanha text, entrou_em timestamp with time zone, ult_cliente_em timestamp with time zone, ult_nossa_em timestamp with time zone, ult_doc_em timestamp with time zone, doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamp with time zone, marcacoes jsonb, ult_cliente_texto text, ult_nossa_texto text, ult_nossa_origem text, senha_inss boolean, senha_em timestamp with time zone, senha_na_ficha boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin boolean;
  v_dono uuid;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  v_admin := public.papel_na_org(p_org) = 'admin';
  v_dono := case when v_admin then p_dono else auth.uid() end;
  return query select * from public.fila_iris_itens_base(p_org, v_dono);
end;
$function$;

revoke all on function public.fila_iris_itens_base(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fila_iris_itens_base(uuid, uuid) to service_role;
revoke all on function public.fila_iris_itens(uuid, uuid) from public, anon;
grant execute on function public.fila_iris_itens(uuid, uuid) to authenticated, service_role;

-- 8) o relógio dos avisos: marca a senha digitada antes de ler a fila; o aviso de Prioridade só com a documentação
do $tick$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fila_iris_avisos_tick()'::regprocedure);
  v_def := pg_temp.fila_trocar(v_def,
    E'      -- um comando só: os CTEs que gravam enxergam o MESMO retrato (o estado de antes desta rodada)',
    E'      -- dono 19/11 (senha do INSS é Prioridade): marca QUANDO o cliente digitou a senha nas mensagens novas (só a\n'
    || E'      -- presença, nunca o valor), antes de ler a fila. Um erro aqui não para os avisos\n'
    || E'      begin\n'
    || E'        perform public.fila_iris_senha_marcar(cfg.organizacao_id,\n'
    || E'                                              coalesce(cfg.senha_varrida_ate, ''-infinity''::timestamptz) - interval ''5 minutes'', now());\n'
    || E'        update public.fila_iris_config set senha_varrida_ate = now() where organizacao_id = cfg.organizacao_id;\n'
    || E'      exception when others then\n'
    || E'        raise warning ''fila_iris_senha_marcar (org %): %'', cfg.organizacao_id, sqlerrm;\n'
    || E'      end;\n'
    || E'      -- um comando só: os CTEs que gravam enxergam o MESMO retrato (o estado de antes desta rodada)',
    'fila_iris_avisos_tick (batida: varre as mensagens)');
  v_def := pg_temp.fila_trocar(v_def,
    E'                 when ''quente'' then coalesce(i.ult_doc_em, i.ult_cliente_em)',
    E'                 -- quem está em Prioridade só pela senha do INSS (sem a documentação completa) não gera o aviso\n'
    || E'                 -- "mandou toda a documentação"\n'
    || E'                 when ''quente'' then case when coalesce(i.senha_inss, false) and not (i.doc_pessoal and i.comprovante) then null\n'
    || E'                                      else coalesce(i.ult_doc_em, i.ult_cliente_em) end',
    'fila_iris_avisos_tick (aviso só com a documentação)');
  v_def := pg_temp.fila_trocar(v_def,
    E'               coalesce(i.marcacoes, ''[]''::jsonb) as marcacoes\n'
    || E'          from public.fila_iris_itens_base(cfg.organizacao_id, null) i',
    E'               coalesce(i.marcacoes, ''[]''::jsonb) as marcacoes,\n'
    || E'               -- em Prioridade só pela senha do INSS (sem a documentação completa)\n'
    || E'               coalesce(i.senha_inss and not (i.doc_pessoal and i.comprovante), false) as so_senha\n'
    || E'          from public.fila_iris_itens_base(cfg.organizacao_id, null) i',
    'fila_iris_avisos_tick (so_senha no retrato)');
  v_def := pg_temp.fila_trocar(v_def,
    E'           and (e.contato_id is null or e.categoria <> a.categoria or e.dono_id is distinct from a.dono_id)',
    E'           -- (quem estava em Prioridade só pela senha e completou a documentação também avisa)\n'
    || E'           and (e.contato_id is null or e.categoria <> a.categoria or e.dono_id is distinct from a.dono_id\n'
    || E'                or (e.so_senha and not a.so_senha))',
    'fila_iris_avisos_tick (completou a documentação avisa)');
  v_def := pg_temp.fila_trocar(v_def,
    E'        insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde, na_fila_desde)\n'
    || E'        select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now(), now() from atual a\n'
    || E'        on conflict (contato_id) do update\n'
    || E'           set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now(),\n'
    || E'               na_fila_desde = case when e.dono_id is distinct from excluded.dono_id then now() else e.na_fila_desde end\n'
    || E'         where e.categoria is distinct from excluded.categoria or e.dono_id is distinct from excluded.dono_id',
    E'        insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde, na_fila_desde, so_senha)\n'
    || E'        select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now(), now(), a.so_senha from atual a\n'
    || E'        on conflict (contato_id) do update\n'
    || E'           set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now(),\n'
    || E'               na_fila_desde = case when e.dono_id is distinct from excluded.dono_id then now() else e.na_fila_desde end,\n'
    || E'               so_senha = excluded.so_senha\n'
    || E'         where e.categoria is distinct from excluded.categoria or e.dono_id is distinct from excluded.dono_id\n'
    || E'            or e.so_senha is distinct from excluded.so_senha',
    'fila_iris_avisos_tick (estado guarda so_senha)');
  execute v_def;
end
$tick$;
