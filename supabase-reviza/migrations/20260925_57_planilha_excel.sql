-- =====================================================================
-- 57 — Gestão de cobranças = "Excel 2.0" (dono 25/09 via Matheus):
-- "quero que a planilha fique nessa parte do sistema, exatamente a mesma
--  planilha ... dê pra colocar cores, criar colunas novas, como se fosse um
--  Excel 2.0". Contrato: design-ref/PLANILHA-EXCEL-CONTRATO.md (§2 e §5).
--
-- Tudo ADITIVO. Nada existente é removido. Enquanto a planilha não for
-- carregada (planilha_substituir), os gatilhos novos não fazem nada.
--
-- Modelo: 4 tabelas (blocos, colunas, linhas, células). A célula guarda o
-- TEXTO EXATO + estilo. As colunas ligadas (campo/mês) continuam alimentando
-- leads/pagamentos (régua, painel, comissões, calendário, Novos):
--   planilha → sistema: RPCs (SECURITY DEFINER) com planilha.sync='1';
--   sistema → planilha: gatilhos em leads/pagamentos (ignoram planilha.sync='1').
-- Senhas NUNCA em texto em repouso: células de senha_inss/reclame das linhas
-- 'cliente' ficam sempre nulas; a senha vai cifrada via public.set_senha.
--
-- API (tudo em public, grant a authenticated):
--   planilha_dados() → jsonb                               (SECURITY INVOKER, RLS)
--   planilha_salvar(p_itens jsonb, p_origem text='edicao') → {ok, avisos, n}
--   planilha_coluna_criar(p_ref uuid, p_lado text, p_tipo text, p_titulo text, p_cab jsonb=null) → uuid
--   planilha_coluna_alterar(p_coluna uuid, p_patch jsonb) → void
--   planilha_coluna_excluir(p_coluna uuid) → void
--   planilha_linha_inserir(p_ref uuid, p_lado text, p_tipo text) → uuid
--   planilha_linha_excluir(p_linha uuid) → void
--   planilha_linha_mover(p_linha uuid, p_ref uuid, p_lado text) → void
--   planilha_substituir(p jsonb) → jsonb                    (admin; carga única/reusável)
-- Realtime: planilha_blocos/colunas/linhas + planilha_versao (1 linha; cada RPC que
-- escreve soma 1 por chamada). planilha_celulas fica FORA da publication.
--
-- Payload de planilha_substituir (gerado por scripts/reviza/planilha_substituir.py):
--   { "blocos":  [{"id":"D24","dia":24,"situacao":"cancelado","comp_base":"2025-08"}, …,
--                 {"id":"NOVOS","dia":null,"situacao":"ativo","comp_base":null}],
--     "colunas": [{"titulo":"DATA FECHAMENTO","tipo":"campo","campo":"fechamento","largura":110,"oculta":false}, …,
--                 {"titulo":"Mês 1","tipo":"mes","mes_pos":0}, …, {"titulo":"TELEFONE","tipo":"campo","campo":"telefone"}],
--     "linhas":  [{"tipo":"cabecalho","bloco":"D24","c":["DATA FECHAMENTO ", …]},
--                 {"tipo":"cliente","bloco":"D24","lead_id":"<uuid>|null","c":[…]},
--                 {"tipo":"vazia","bloco":null},
--                 {"tipo":"rotulo","bloco":null,"c":[…]}],
--     "backup": true,              (opcional; padrão true → private.bkp_*_AAAAMMDD_HHMMSS, as 10 tabelas)
--     "recarregar": false,         (obrigatório true se a planilha já foi carregada — a recarga apaga cores/notas/colunas novas)
--     "leads_vistos": 778,         (opcional; trava otimista: aborta se count(leads) mudou desde a leitura)
--     "remover": ["<uuid>", …],    (leads que vão pra Lixeira; SÓ estes. Quem não está nem nas linhas nem aqui ganha linha no fim do bloco)
--     "manter_pendentes": true }   (opcional; padrão true → não apaga quem aguarda aprovação de débito parado)
--   c[j] = texto EXATO da coluna j (índice em "colunas"); null/"" = sem célula.
--   Nas linhas 'cliente', c[senha_inss]/c[reclame] trazem a senha em texto: vai
--   cifrada (mesma regra do set_senha; vazio = limpa) e a célula fica nula.
--   Opcionais por linha: "s":[estilo|null,…] (paralelo a c) e "altura".
--   Ordem: coluna j → 1000·(j+1); linha i → 1000·i.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.planilha_blocos (
  id text primary key,                                   -- 'D24',…,'D07','NOVOS' (ou 'Dnn' criado depois)
  dia smallint check (dia between 1 and 31),             -- null só em NOVOS
  situacao public.situacao_debito not null,              -- 'cancelado' (ciclo) | 'ativo' (NOVOS)
  comp_base text check (comp_base ~ '^[0-9]{4}-[0-9]{2}$'), -- 'YYYY-MM' da 1ª coluna de mês (null em NOVOS)
  criado_em timestamptz not null default now()
);

create table if not exists public.planilha_colunas (
  id uuid primary key default gen_random_uuid(),
  ordem numeric not null,                                -- posição visual (fracionária p/ inserir entre)
  titulo text not null default '',
  tipo text not null check (tipo in ('campo','mes','livre')),
  campo text check (campo in ('fechamento','comercial','nome','nb','banco','cpf','senha_inss','valor','reclame','parou','telefone')),
  mes_pos smallint check (mes_pos >= 0),
  largura smallint not null default 110 check (largura between 30 and 900),
  oculta boolean not null default false,
  criado_em timestamptz not null default now(),
  check ((tipo = 'campo') = (campo is not null)),
  check ((tipo = 'mes') = (mes_pos is not null))
);
create unique index if not exists planilha_colunas_campo_uq on public.planilha_colunas (campo) where campo is not null;
create unique index if not exists planilha_colunas_mes_pos_uq on public.planilha_colunas (mes_pos) where mes_pos is not null;
create index if not exists planilha_colunas_ordem_idx on public.planilha_colunas (ordem);

create table if not exists public.planilha_linhas (
  id uuid primary key default gen_random_uuid(),
  ordem numeric not null,                                -- ordem GLOBAL da folha
  tipo text not null check (tipo in ('cliente','cabecalho','vazia','rotulo')),
  bloco text references public.planilha_blocos(id) on update cascade,
  lead_id uuid unique references public.leads(id) on delete set null, -- null = cliente na Lixeira (linha oculta)
  altura smallint,
  criado_em timestamptz not null default now(),
  check (tipo = 'cliente' or lead_id is null)
);
create index if not exists planilha_linhas_ordem_idx on public.planilha_linhas (ordem);
create index if not exists planilha_linhas_bloco_ordem_idx on public.planilha_linhas (bloco, ordem);

create table if not exists public.planilha_celulas (
  linha_id uuid not null references public.planilha_linhas(id) on delete cascade,
  coluna_id uuid not null references public.planilha_colunas(id) on delete cascade,
  texto text,                                            -- texto EXATO. Sempre null em senha_inss/reclame de linhas 'cliente'
  estilo jsonb,                                          -- {"bg","fg","b","i","al"}
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (linha_id, coluna_id)
);
create index if not exists planilha_celulas_coluna_idx on public.planilha_celulas (coluna_id);

-- versão da planilha (1 linha só): toda RPC que escreve soma 1 por chamada (no fim).
-- O Realtime ouve ESTA tabela no lugar de planilha_celulas: colar 500 células vira 1 evento
-- (e não 500 checagens de RLS por cliente conectado).
create table if not exists public.planilha_versao (
  id int primary key default 1 check (id = 1),
  n bigint not null default 0,
  em timestamptz not null default now()
);
insert into public.planilha_versao (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) RLS + grants (escrita SÓ por RPC)
-- ---------------------------------------------------------------------
alter table public.planilha_blocos  enable row level security;
alter table public.planilha_colunas enable row level security;
alter table public.planilha_linhas  enable row level security;
alter table public.planilha_celulas enable row level security;
alter table public.planilha_versao  enable row level security;

drop policy if exists planilha_versao_sel on public.planilha_versao;
create policy planilha_versao_sel on public.planilha_versao for select to authenticated
  using ((select public.current_papel()) is not null);

drop policy if exists planilha_blocos_sel on public.planilha_blocos;
create policy planilha_blocos_sel on public.planilha_blocos for select to authenticated
  using ((select public.current_papel()) is not null);

drop policy if exists planilha_colunas_sel on public.planilha_colunas;
create policy planilha_colunas_sel on public.planilha_colunas for select to authenticated
  using ((select public.current_papel()) is not null);

-- cliente: some quando está na Lixeira (lead_id null); comercial só vê os dele
drop policy if exists planilha_linhas_sel on public.planilha_linhas;
create policy planilha_linhas_sel on public.planilha_linhas for select to authenticated
  using (
    (select public.current_papel()) is not null
    and (tipo <> 'cliente'
         or (lead_id is not null
             and ((select public.current_papel()) <> 'comercial' or public.comercial_dono_lead(lead_id))))
  );

-- célula visível ⇔ linha visível (a subconsulta passa pela RLS de planilha_linhas).
-- EXISTS (e não IN): o Realtime checa 1 linha por evento → busca pelo índice (~1 ms)
-- em vez de montar o hash de todas as linhas visíveis (~28 ms); em lote custa o mesmo.
drop policy if exists planilha_celulas_sel on public.planilha_celulas;
create policy planilha_celulas_sel on public.planilha_celulas for select to authenticated
  using (exists (select 1 from public.planilha_linhas l where l.id = planilha_celulas.linha_id));

revoke all on table public.planilha_blocos, public.planilha_colunas, public.planilha_linhas, public.planilha_celulas, public.planilha_versao from anon, authenticated;
grant select on table public.planilha_blocos, public.planilha_colunas, public.planilha_linhas, public.planilha_celulas, public.planilha_versao to authenticated;

-- ---------------------------------------------------------------------
-- 3) Parsers e formatadores (§2.1) — a MESMA regra de planilha.ts
-- ---------------------------------------------------------------------

-- assinaturas que mudaram na revisão (só existem se uma versão anterior desta migration
-- rodou em algum ambiente; na 1ª aplicação não fazem nada). Sem isso o "create or replace"
-- criaria uma sobrecarga e a chamada com parâmetro padrão ficaria ambígua.
drop function if exists private.pl_data_partes(text, text, text);
drop function if exists private.pl_data(text);
drop function if exists private.pl_data_no_texto(text);
drop function if exists private.pl_fmt_data(text);
drop function if exists private.pl_equivale(text, text, text);
drop function if exists private.pl_reescrever_meses(uuid);
drop function if exists private.pl_mover_para_bloco(uuid, text);
drop function if exists private.pl_coluna_mes_nova(int, numeric);

-- trim de TODO espaço (inclui tab, quebra e nbsp), igual ao String.trim()
create or replace function private.pl_trim(p text) returns text
  language sql immutable set search_path = ''
as $$ select regexp_replace(p, '^[\s\u00a0]+|[\s\u00a0]+$', '', 'g') $$;

-- valor BR → numeric ≥ 0 (null = não é número; não "conserta" O/o)
--   tira R$ e espaços; com ',' → '.' é milhar e ',' decimal;
--   sem ',' e '.' seguido de exatamente 3 dígitos (e nada mais) → milhar; senão '.' decimal.
--   ≥ 10.000.000 → null (telefone/lixo nunca vira valor; e cabe em numeric(12,2)).
create or replace function private.pl_valor(p text) returns numeric
  language plpgsql immutable set search_path = ''
as $$
declare s text; v numeric;
begin
  if p is null then return null; end if;
  s := regexp_replace(p, 'R\$', '', 'gi');
  s := regexp_replace(s, '[\s\u00a0]', '', 'g');
  if s = '' then return null; end if;
  if strpos(s, ',') > 0 then
    if s ~ '^[0-9]{1,3}(\.[0-9]{3})+,[0-9]+$' or s ~ '^[0-9]+,[0-9]+$' then
      v := replace(replace(s, '.', ''), ',', '.')::numeric;
    else return null; end if;
  elsif s ~ '^[0-9]+\.[0-9]{3}$' or s ~ '^[0-9]{1,3}(\.[0-9]{3}){2,}$' then
    v := replace(s, '.', '')::numeric;
  elsif s ~ '^[0-9]+(\.[0-9]+)?$' then
    v := s::numeric;
  else return null; end if;
  if v >= 10000000 then return null; end if;
  return v;
end $$;

-- "NÃO PAGOU" (aceita não pagou / NAO PAGOU / espaços sobrando)
create or replace function private.pl_nao_pagou(p text) returns boolean
  language sql immutable set search_path = ''
as $$ select coalesce(
  upper(regexp_replace(translate(private.pl_trim(p), 'ÃãÁáÂâÀà', 'AAAAAAAA'), '[\s\u00a0]+', ' ', 'g')) = 'NAO PAGOU',
  false) $$;

-- célula de mês → estado: 'nao_pagou' | 'pago' (valor > 0) | null (sem linha em pagamentos)
create or replace function private.pl_mes_estado(p text) returns text
  language sql immutable set search_path = ''
as $$ select case
  when private.pl_nao_pagou(p) then 'nao_pagou'
  when coalesce(private.pl_valor(p), 0) > 0 then 'pago'
  else null end $$;

-- texto é um "estado de pagamento" (número, NÃO PAGOU, '-', vazio)? — só esses o gatilho pode apagar
create or replace function private.pl_eh_estado(p text) returns boolean
  language sql immutable set search_path = ''
as $$ select p is null or private.pl_trim(p) in ('', '-') or private.pl_nao_pagou(p) or private.pl_valor(p) is not null $$;

-- partes de data curta → ISO. Ano faltando = o mais recente que (1) não passa de hoje+7 dias
-- e (2) com p_ref ('AAAA-MM' = 1º mês PAGO do cliente) não passa desse mês — fechamento,
-- parou e reclamação vêm antes do 1º pagamento; nunca antes de 2025 (a carteira começou
-- em ago/2025). Até 30/09/2026 dá o mesmo que a regra antiga (out–dez → 2025, jan–set → 2026)
-- e continua certa depois. STABLE: depende da data de hoje.
create or replace function private.pl_data_partes(p_d text, p_m text, p_a text, p_ref text default null) returns text
  language plpgsql stable set search_path = ''
as $$
declare d int; m int; a int; ult int; v_hoje date;
begin
  if p_d is null or p_m is null then return null; end if;
  d := p_d::int;
  if p_m ~ '^[0-9]+$' then m := p_m::int;
  else m := array_position(array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'], lower(left(p_m, 3)));
  end if;
  if m is null or m < 1 or m > 12 or d < 1 or d > 31 then return null; end if;
  if p_a is null or p_a = '' then
    v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
    a := extract(year from v_hoje)::int;
    if make_date(a, m, least(d, 28)) > v_hoje + 7 then a := a - 1; end if;
    while a > 2025 and p_ref is not null and lpad(a::text, 4, '0') || '-' || lpad(m::text, 2, '0') > p_ref loop
      a := a - 1;
    end loop;
    if a < 2025 then a := 2025; end if;
  elsif length(p_a) = 2 then a := 2000 + p_a::int;
  else a := p_a::int; end if;
  if a < 1 then return null; end if;
  ult := case when m = 2 then case when (a % 4 = 0 and a % 100 <> 0) or a % 400 = 0 then 29 else 28 end
              when m in (4, 6, 9, 11) then 30 else 31 end;
  if d < 1 or d > ult then return null; end if;
  return lpad(a::text, 4, '0') || '-' || lpad(m::text, 2, '0') || '-' || lpad(d::text, 2, '0');
end $$;

-- data curta (texto inteiro): DD/mmm(.) · DD/MM · DD/MM/AAAA · DD/MM/AA → 'YYYY-MM-DD' | null
create or replace function private.pl_data(p text, p_ref text default null) returns text
  language plpgsql stable set search_path = ''
as $$
declare m text[];
begin
  m := regexp_match(private.pl_trim(p), '^([0-9]{1,2})/([0-9]{1,2}|[A-Za-z]{3}\.?)(?:/([0-9]{4}|[0-9]{2}))?$');
  if m is null then return null; end if;
  return private.pl_data_partes(m[1], m[2], m[3], p_ref);
end $$;

-- 1ª data curta ACHADA no texto (reclame "reclame aqui DD/MM - …", parou "PAROU … DD/MM")
create or replace function private.pl_data_no_texto(p text, p_ref text default null) returns text
  language plpgsql stable set search_path = ''
as $$
declare m text[]; v text;
begin
  if p is null then return null; end if;
  for m in select regexp_matches(p, '(?<![0-9])([0-9]{1,2})/([0-9]{1,2}|[A-Za-z]{3}\.?)(?:/([0-9]{4}|[0-9]{2}))?(?![0-9A-Za-z])', 'g') loop
    v := private.pl_data_partes(m[1], m[2], m[3], p_ref);
    if v is not null then return v; end if;
  end loop;
  return null;
end $$;

-- telefone: 1ª sequência de 10–13 dígitos, ignorando ( ) - . espaço (e travessões/nbsp) → só dígitos | null
create or replace function private.pl_tel(p text) returns text
  language sql immutable set search_path = ''
as $$ select (regexp_match(regexp_replace(coalesce(p, ''), '[().\s\u00a0\u2010-\u2015-]', '', 'g'),
                          '(?<![0-9])[0-9]{10,13}(?![0-9])'))[1] $$;

-- valor → '263,81' / '224' / '230,9' (sem R$, vírgula decimal, sem zeros finais)
create or replace function private.pl_fmt_valor(p numeric) returns text
  language sql immutable set search_path = ''
as $$ select replace(trim_scale(p)::text, '.', ',') $$;

-- ISO → 'DD/mmm' (ex. 15/jan) só quando essa data curta volta IDÊNTICA pela regra do ano
-- (com o mesmo p_ref); senão 'DD/MM/AAAA'. Não-ISO volta como está.
create or replace function private.pl_fmt_data(p text, p_ref text default null) returns text
  language plpgsql stable set search_path = ''
as $$
declare v_curta text;
begin
  if p is null or p !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' then return nullif(p, ''); end if;
  v_curta := substr(p, 9, 2) || '/' || (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substr(p, 6, 2)::int];
  if private.pl_data(v_curta, p_ref) is not distinct from p then return v_curta; end if;
  return substr(p, 9, 2) || '/' || substr(p, 6, 2) || '/' || substr(p, 1, 4);
end $$;

-- 'YYYY-MM' ↔ nº de meses
create or replace function private.pl_meses(p text) returns int
  language sql immutable set search_path = ''
as $$ select case when p ~ '^[0-9]{4}-[0-9]{2}$' then substr(p, 1, 4)::int * 12 + substr(p, 6, 2)::int - 1 end $$;

create or replace function private.pl_comp_soma(p_base text, p_k int) returns text
  language sql immutable set search_path = ''
as $$ select case when private.pl_meses(p_base) is not null and p_k is not null then
  lpad(((private.pl_meses(p_base) + p_k) / 12)::text, 4, '0') || '-' || lpad(((private.pl_meses(p_base) + p_k) % 12 + 1)::text, 2, '0') end $$;

-- 'YYYY-MM' → 'mmm/aa' (ex. 'out/26') — cabeçalho da coluna de mês criada pelo sistema
create or replace function private.pl_mmm_aa(p_comp text) returns text
  language sql immutable set search_path = ''
as $$ select case when p_comp ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
  (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substr(p_comp, 6, 2)::int] || '/' || substr(p_comp, 3, 2) end $$;

-- estado do pagamento → texto da célula (mantém o texto atual quando já diz a mesma coisa;
-- sem pagamento só apaga se o texto atual for um estado — NUNCA apaga nota)
create or replace function private.pl_mes_texto(p_atual text, p_status text, p_valor numeric) returns text
  language sql immutable set search_path = ''
as $$ select case
  when p_status = 'pago' then
    case when not private.pl_nao_pagou(p_atual) and private.pl_valor(p_atual) = p_valor then p_atual
         else private.pl_fmt_valor(p_valor) end
  when p_status = 'nao_pagou' then case when private.pl_nao_pagou(p_atual) then p_atual else 'NÃO PAGOU' end
  when p_status = 'fora' then case when private.pl_trim(p_atual) = '-' then p_atual else '-' end
  else case when private.pl_eh_estado(p_atual) then null else p_atual end
  end $$;

-- estilo aceito: {"bg":"#RRGGBB","fg":"#RRGGBB","b":true,"i":true,"al":"l|c|r"}; vazio → null
create or replace function private.pl_estilo(p jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$ select case when jsonb_typeof(p) = 'object' then nullif(jsonb_strip_nulls(jsonb_build_object(
    'bg', case when p->>'bg' ~ '^#[0-9A-Fa-f]{6}$' then p->>'bg' end,
    'fg', case when p->>'fg' ~ '^#[0-9A-Fa-f]{6}$' then p->>'fg' end,
    'b',  case when p->'b' = 'true'::jsonb then true end,
    'i',  case when p->'i' = 'true'::jsonb then true end,
    'al', case when p->>'al' in ('l', 'c', 'r') then p->>'al' end)), '{}'::jsonb) end $$;

-- campo do lead ↔ texto da célula já "diz" o mesmo valor? (gatilho reverso não reescreve)
create or replace function private.pl_equivale(p_campo text, p_atual text, p_valor text, p_ref text default null) returns boolean
  language sql stable set search_path = ''
as $$ select case p_campo
  when 'fechamento' then coalesce(private.pl_data(p_atual, p_ref) = p_valor, false)
                         or coalesce(private.pl_trim(p_atual), '') = coalesce(private.pl_trim(p_valor), '')
  when 'valor' then coalesce(private.pl_valor(p_atual) = p_valor::numeric, false)
                    or (coalesce(private.pl_trim(p_atual), '') = '' and coalesce(p_valor::numeric, 0) = 0)
  when 'telefone' then coalesce(private.pl_tel(p_atual) = private.pl_tel(p_valor), false)
                       or coalesce(private.pl_trim(p_atual), '') = coalesce(private.pl_trim(p_valor), '')
  else coalesce(btrim(p_atual), '') = coalesce(btrim(p_valor), '')
  end $$;

-- A, B, …, Z, AA, …
create or replace function private.pl_letra(p int) returns text
  language plpgsql immutable set search_path = ''
as $$
declare s text := ''; n int := p;
begin
  while n > 0 loop s := chr(65 + (n - 1) % 26) || s; n := (n - 1) / 26; end loop;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- 4) Ajudantes internos (private; só rodam dentro de funções definer)
-- ---------------------------------------------------------------------

-- referência "H245 (PARCELA TOTAL)" como o usuário vê (linhas visíveis p/ ele)
create or replace function private.pl_ref(p_linha uuid, p_coluna uuid) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare v_papel text := public.current_papel()::text; l public.planilha_linhas%rowtype; v_c int; v_l int; v_tit text;
begin
  select * into l from public.planilha_linhas where id = p_linha;
  select count(*) into v_c from public.planilha_colunas c, public.planilha_colunas x
   where x.id = p_coluna and (c.ordem < x.ordem or (c.ordem = x.ordem and c.id <= x.id));
  select titulo into v_tit from public.planilha_colunas where id = p_coluna;
  select count(*) into v_l from public.planilha_linhas x
   where (x.ordem < l.ordem or (x.ordem = l.ordem and x.id <= l.id))
     and (x.tipo <> 'cliente' or (x.lead_id is not null and (v_papel <> 'comercial' or public.comercial_dono_lead(x.lead_id))));
  return private.pl_letra(v_c) || v_l::text || case when coalesce(v_tit, '') <> '' then ' (' || btrim(v_tit) || ')' else '' end;
end $$;

-- mês de referência da regra do ano (datas curtas do cliente): 1º mês PAGO dele | null
create or replace function private.pl_mes_ref(p_lead uuid) returns text
  language sql stable security definer set search_path = ''
as $$ select min(comp) from public.pagamentos where lead_id = p_lead and status = 'pago' $$;

-- sobe a versão da planilha (1× por chamada de RPC que escreve; o Realtime avisa o front)
create or replace function private.pl_versao_bump() returns void
  language sql security definer set search_path = ''
as $$ insert into public.planilha_versao as v (id, n, em) values (1, 1, now())
      on conflict (id) do update set n = v.n + 1, em = now() $$;

-- grava o texto de UMA célula (mantém o estilo). null/'' = limpa (apaga a célula se ficar sem nada)
create or replace function private.pl_set_texto(p_linha uuid, p_coluna uuid, p_texto text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if p_texto is null or p_texto = '' then
    delete from public.planilha_celulas where linha_id = p_linha and coluna_id = p_coluna and estilo is null;
    update public.planilha_celulas set texto = null, atualizado_em = now(), atualizado_por = auth.uid()
     where linha_id = p_linha and coluna_id = p_coluna and texto is not null;
  else
    insert into public.planilha_celulas as c (linha_id, coluna_id, texto, atualizado_por)
    values (p_linha, p_coluna, p_texto, auth.uid())
    on conflict (linha_id, coluna_id) do update
      set texto = excluded.texto, atualizado_em = now(), atualizado_por = excluded.atualizado_por
      where c.texto is distinct from excluded.texto;
  end if;
end $$;

-- ordem p/ uma linha nova antes/depois de uma ordem de referência (ponto médio).
-- Quando o vão fica < 0,000001 (≈ 30 inserções no mesmo lugar), empurra as linhas do lado
-- de lá 1000 posições antes de dividir: a ordem nunca colide nem perde precisão (nem no
-- double do front). VOLATILE: pode escrever.
create or replace function private.pl_ordem_linha(p_ref numeric, p_depois boolean, p_excluir uuid default null) returns numeric
  language plpgsql volatile security definer set search_path = ''
as $$
declare v numeric;
begin
  if p_depois then
    select min(ordem) into v from public.planilha_linhas where ordem > p_ref and id is distinct from p_excluir;
    if v is null then return p_ref + 1000; end if;
    if v - p_ref < 0.000001 then
      update public.planilha_linhas set ordem = ordem + 1000 where ordem > p_ref and id is distinct from p_excluir;
      v := v + 1000;
    end if;
  else
    select max(ordem) into v from public.planilha_linhas where ordem < p_ref and id is distinct from p_excluir;
    if v is null then return p_ref - 1000; end if;
    if p_ref - v < 0.000001 then
      update public.planilha_linhas set ordem = ordem - 1000 where ordem < p_ref and id is distinct from p_excluir;
      v := v - 1000;
    end if;
  end if;
  return trim_scale((p_ref + v) / 2);
end $$;

create or replace function private.pl_ordem_coluna(p_ref numeric, p_depois boolean) returns numeric
  language plpgsql volatile security definer set search_path = ''
as $$
declare v numeric;
begin
  if p_depois then
    select min(ordem) into v from public.planilha_colunas where ordem > p_ref;
    if v is null then return p_ref + 1000; end if;
    if v - p_ref < 0.000001 then
      update public.planilha_colunas set ordem = ordem + 1000 where ordem > p_ref;
      v := v + 1000;
    end if;
  else
    select max(ordem) into v from public.planilha_colunas where ordem < p_ref;
    if v is null then return p_ref - 1000; end if;
    if p_ref - v < 0.000001 then
      update public.planilha_colunas set ordem = ordem - 1000 where ordem < p_ref;
      v := v - 1000;
    end if;
  end if;
  return trim_scale((p_ref + v) / 2);
end $$;

-- ordem p/ o FIM de um bloco (depois da última linha dele, antes da próxima da folha).
-- Mesma regra do vão mínimo (inserções seguidas no fim do mesmo bloco).
create or replace function private.pl_fim_do_bloco(p_bloco text, p_excluir uuid default null) returns numeric
  language plpgsql volatile security definer set search_path = ''
as $$
declare v_ult numeric; v_prox numeric;
begin
  select max(ordem) into v_ult from public.planilha_linhas where bloco = p_bloco and id is distinct from p_excluir;
  if v_ult is null then
    select max(ordem) into v_ult from public.planilha_linhas where id is distinct from p_excluir;
    return coalesce(v_ult, 0) + 1000;
  end if;
  select min(ordem) into v_prox from public.planilha_linhas where ordem > v_ult and id is distinct from p_excluir;
  if v_prox is null then return v_ult + 1000; end if;
  if v_prox - v_ult < 0.000001 then
    update public.planilha_linhas set ordem = ordem + 1000 where ordem > v_ult and id is distinct from p_excluir;
    v_prox := v_prox + 1000;
  end if;
  return trim_scale((v_ult + v_prox) / 2);
end $$;

-- bloco de uma linha "solta" (bloco null): o mais próximo acima; senão abaixo
create or replace function private.pl_bloco_vizinho(p_ordem numeric, p_excluir uuid default null) returns text
  language sql stable security definer set search_path = ''
as $$ select coalesce(
  (select bloco from public.planilha_linhas where bloco is not null and ordem <= p_ordem and id is distinct from p_excluir order by ordem desc limit 1),
  (select bloco from public.planilha_linhas where bloco is not null and ordem >  p_ordem and id is distinct from p_excluir order by ordem asc  limit 1)) $$;

-- bloco certo p/ (situacao, dia): 'ativo' → NOVOS; 'cancelado' → bloco do dia (cria 'Dnn' se faltar,
-- com comp_base do D24 (dia ≥ 15) ou do D01 e cabeçalho copiado do modelo, no fim da folha).
-- 'cancelado' sem dia (aguardando ciclo) → null (a linha fica onde está).
create or replace function private.pl_bloco_para(p_situacao public.situacao_debito, p_dia smallint) returns text
  language plpgsql security definer set search_path = ''
as $$
declare v_id text; v_modelo text; v_base text; v_cab uuid; v_nova uuid; v_n int;
begin
  if p_situacao = 'ativo' then
    select id into v_id from public.planilha_blocos where situacao = 'ativo' order by (id = 'NOVOS') desc, criado_em, id limit 1;
    if v_id is not null then return v_id; end if;
    insert into public.planilha_blocos (id, dia, situacao, comp_base) values ('NOVOS', null, 'ativo', null) on conflict (id) do nothing;
    return 'NOVOS';
  end if;
  if p_dia is null then return null; end if;

  select id into v_id from public.planilha_blocos where situacao = 'cancelado' and dia = p_dia order by criado_em, id limit 1;
  if v_id is not null then return v_id; end if;

  select id, comp_base into v_modelo, v_base from public.planilha_blocos
   where id = case when p_dia >= 15 then 'D24' else 'D01' end and comp_base is not null;
  if v_modelo is null then
    select id, comp_base into v_modelo, v_base from public.planilha_blocos
     where situacao = 'cancelado' and comp_base is not null
     order by ((dia >= 15) = (p_dia >= 15)) desc, abs(dia - p_dia), id limit 1;
  end if;

  v_id := 'D' || lpad(p_dia::text, 2, '0');
  if exists (select 1 from public.planilha_blocos where id = v_id) then
    v_id := v_id || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
  end if;
  insert into public.planilha_blocos (id, dia, situacao, comp_base)
  values (v_id, p_dia, 'cancelado', coalesce(v_base, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')))
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then  -- outra transação criou ao mesmo tempo
    select id into v_id from public.planilha_blocos where situacao = 'cancelado' and dia = p_dia order by criado_em, id limit 1;
    return v_id;
  end if;

  insert into public.planilha_linhas (ordem, tipo, bloco)
  values (coalesce((select max(ordem) from public.planilha_linhas), 0) + 1000, 'cabecalho', v_id)
  returning id into v_nova;
  if v_modelo is not null then
    select id into v_cab from public.planilha_linhas where bloco = v_modelo and tipo = 'cabecalho' order by ordem limit 1;
    if v_cab is not null then
      insert into public.planilha_celulas (linha_id, coluna_id, texto, estilo, atualizado_por)
      select v_nova, coluna_id, texto, estilo, auth.uid() from public.planilha_celulas where linha_id = v_cab;
    end if;
  end if;
  return v_id;
end $$;

-- reescreve as células de mês de uma linha a partir de pagamentos (notas ficam).
-- p_so_pagamento (troca de bloco): só mexe onde HÁ pagamento e a célula não é nota —
-- o que foi digitado sem pagamento nunca é apagado.
create or replace function private.pl_reescrever_meses(p_linha uuid, p_so_pagamento boolean default false) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_lead uuid; v_base text; r record; v_novo text;
begin
  select l.lead_id, b.comp_base into v_lead, v_base
    from public.planilha_linhas l left join public.planilha_blocos b on b.id = l.bloco
   where l.id = p_linha;
  if v_lead is null or v_base is null then return; end if;
  for r in
    select c.id as col, ce.texto as atual, p.status::text as st, p.valor
      from public.planilha_colunas c
      left join public.planilha_celulas ce on ce.linha_id = p_linha and ce.coluna_id = c.id
      left join public.pagamentos p on p.lead_id = v_lead and p.comp = private.pl_comp_soma(v_base, c.mes_pos)
     where c.tipo = 'mes'
  loop
    if p_so_pagamento and (r.st is null or not private.pl_eh_estado(r.atual)) then continue; end if;
    v_novo := private.pl_mes_texto(r.atual, r.st, r.valor);
    if v_novo is distinct from r.atual then perform private.pl_set_texto(p_linha, r.col, v_novo); end if;
  end loop;
end $$;

-- preenche uma linha NOVA a partir do lead (campos + meses). Senhas nunca em texto.
create or replace function private.pl_preencher_linha(p_linha uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_lead uuid; l public.leads%rowtype; c record; v_txt text;
begin
  select lead_id into v_lead from public.planilha_linhas where id = p_linha;
  if v_lead is null then return; end if;
  select * into l from public.leads where id = v_lead;
  if not found then return; end if;
  for c in select id, campo from public.planilha_colunas where tipo = 'campo' loop
    v_txt := case c.campo
      when 'fechamento' then private.pl_fmt_data(l.fechamento, private.pl_mes_ref(l.id))
      when 'comercial'  then l.comercial
      when 'nome'       then nullif(l.nome, '')
      when 'nb'         then l.nb
      when 'banco'      then l.banco
      when 'cpf'        then l.cpf
      when 'valor'      then case when l.valor = 0 then null else private.pl_fmt_valor(l.valor) end
      when 'parou'      then l.parou
      when 'telefone'   then l.telefone
      else null end;
    perform private.pl_set_texto(p_linha, c.id, v_txt);
  end loop;
  perform private.pl_reescrever_meses(p_linha);
end $$;

-- garante a linha 'cliente' do lead (fim do bloco certo). Não faz nada se a planilha
-- ainda não foi carregada ou se o lead está "aguardando ciclo".
create or replace function private.pl_garantir_linha(p_lead uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_linha uuid; l public.leads%rowtype; v_bloco text;
begin
  if not exists (select 1 from public.planilha_colunas) then return null; end if;
  select id into v_linha from public.planilha_linhas where lead_id = p_lead;
  if v_linha is not null then return v_linha; end if;
  select * into l from public.leads where id = p_lead;
  if not found then return null; end if;
  v_bloco := private.pl_bloco_para(l.situacao, l.dia);
  if v_bloco is null then return null; end if;
  insert into public.planilha_linhas (ordem, tipo, bloco, lead_id)
  values (private.pl_fim_do_bloco(v_bloco), 'cliente', v_bloco, p_lead)
  on conflict (lead_id) do nothing
  returning id into v_linha;
  if v_linha is null then
    select id into v_linha from public.planilha_linhas where lead_id = p_lead;
    return v_linha;
  end if;
  perform private.pl_preencher_linha(v_linha);
  return v_linha;
end $$;

-- a linha trocou de bloco: as células de mês acompanham o SEU mês (competência).
--   base nova null (foi p/ NOVOS) ou igual à anterior → nada muda.
--   saindo de NOVOS (base anterior null): o texto digitado fica (em NOVOS o mês é só texto);
--     só escreve onde há pagamento.
--   entre blocos com base diferente (D24..D30 ↔ D01..D07): texto+estilo andam para a coluna do
--     mesmo mês (k novo = k antigo − deslocamento). Mês sem coluna no bloco novo: estado
--     (número, NÃO PAGOU, '-', só cor) sai da grade (o pagamento continua no sistema); nota fica
--     na coluna antiga se ela ficar livre, senão vai para o registro — nada some sem rastro.
--   Por fim, onde há pagamento e a célula não é nota, o texto segue o pagamento.
create or replace function private.pl_meses_trocar_base(p_linha uuid, p_base_ant text, p_base_nova text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_d int; v_cel jsonb; r record; v_n int; v_lead uuid;
begin
  if p_base_nova is null or p_base_nova is not distinct from p_base_ant then return; end if;
  if p_base_ant is not null then
    v_d := private.pl_meses(p_base_nova) - private.pl_meses(p_base_ant);
    select coalesce(jsonb_agg(jsonb_build_object('de', c.id, 'ka', c.mes_pos, 'k', c.mes_pos - v_d, 't', ce.texto, 's', ce.estilo)), '[]'::jsonb)
      into v_cel
      from public.planilha_celulas ce join public.planilha_colunas c on c.id = ce.coluna_id and c.tipo = 'mes'
     where ce.linha_id = p_linha;
    delete from public.planilha_celulas ce using public.planilha_colunas c
     where ce.linha_id = p_linha and ce.coluna_id = c.id and c.tipo = 'mes';
    insert into public.planilha_celulas (linha_id, coluna_id, texto, estilo, atualizado_por)
    select p_linha, c2.id, x->>'t', case when jsonb_typeof(x->'s') = 'object' then x->'s' end, auth.uid()
      from jsonb_array_elements(v_cel) x
      join public.planilha_colunas c2 on c2.tipo = 'mes' and c2.mes_pos = (x->>'k')::int;
    for r in select (x->>'de')::uuid as de, (x->>'ka')::int as ka, x->>'t' as t,
                    case when jsonb_typeof(x->'s') = 'object' then x->'s' end as s
               from jsonb_array_elements(v_cel) x
              where not exists (select 1 from public.planilha_colunas c2 where c2.tipo = 'mes' and c2.mes_pos = (x->>'k')::int)
                and not private.pl_eh_estado(x->>'t')
    loop
      insert into public.planilha_celulas (linha_id, coluna_id, texto, estilo, atualizado_por)
      values (p_linha, r.de, r.t, r.s, auth.uid())
      on conflict (linha_id, coluna_id) do nothing;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        select lead_id into v_lead from public.planilha_linhas where id = p_linha;
        perform private.registrar('nota fora da planilha', 'grade', v_lead::text,
          (select nome from public.leads where id = v_lead),
          public.comp_rotulo(private.pl_comp_soma(p_base_ant, r.ka)) || ' ficou sem coluna no bloco novo. Nota: ' || r.t);
      end if;
    end loop;
  end if;
  perform private.pl_reescrever_meses(p_linha, true);
end $$;

-- move a linha p/ outro bloco (fim dele, ou p_ordem) e realinha os meses (pl_meses_trocar_base)
create or replace function private.pl_mover_para_bloco(p_linha uuid, p_bloco text, p_ordem numeric default null) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_base_ant text; v_base_nova text; v_ordem numeric;
begin
  select b.comp_base into v_base_ant from public.planilha_linhas l join public.planilha_blocos b on b.id = l.bloco where l.id = p_linha;
  select comp_base into v_base_nova from public.planilha_blocos where id = p_bloco;
  -- a ordem ANTES do update (pl_fim_do_bloco pode reabrir o vão e escreve na mesma tabela)
  v_ordem := coalesce(p_ordem, private.pl_fim_do_bloco(p_bloco, p_linha));
  update public.planilha_linhas set bloco = p_bloco, ordem = v_ordem where id = p_linha;
  perform private.pl_meses_trocar_base(p_linha, v_base_ant, v_base_nova);
end $$;

-- coluna de mês nova (mes_pos = p_k) + preenche com os pagamentos que já existem.
-- p_cab_auto (coluna criada pelo sistema): cabeçalho de cada bloco = 'mmm/aa' do mês dele.
create or replace function private.pl_coluna_mes_nova(p_k int, p_ordem numeric default null, p_cab_auto boolean default false) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare v_col uuid; v_ult numeric; v_prox numeric; v_ordem numeric := p_ordem; h record;
begin
  if v_ordem is null then
    select max(ordem) into v_ult from public.planilha_colunas where tipo = 'mes';
    if v_ult is null then select max(ordem) into v_ult from public.planilha_colunas; end if;
    select min(ordem) into v_prox from public.planilha_colunas where ordem > v_ult;
    if v_prox is not null and v_prox - v_ult < 0.000001 then
      update public.planilha_colunas set ordem = ordem + 1000 where ordem > v_ult;
      v_prox := v_prox + 1000;
    end if;
    v_ordem := case when v_ult is null then 1000 when v_prox is null then v_ult + 1000 else trim_scale((v_ult + v_prox) / 2) end;
  end if;
  insert into public.planilha_colunas (ordem, titulo, tipo, mes_pos)
  values (v_ordem, 'Mês ' || (p_k + 1), 'mes', p_k)
  on conflict (mes_pos) where mes_pos is not null do nothing
  returning id into v_col;
  if v_col is null then
    select id into v_col from public.planilha_colunas where mes_pos = p_k;
    return v_col;
  end if;
  insert into public.planilha_celulas (linha_id, coluna_id, texto, atualizado_por)
  select l.id, v_col, private.pl_mes_texto(null, p.status::text, p.valor), auth.uid()
    from public.planilha_linhas l
    join public.planilha_blocos b on b.id = l.bloco and b.comp_base is not null
    join public.pagamentos p on p.lead_id = l.lead_id and p.comp = private.pl_comp_soma(b.comp_base, p_k)
   where l.tipo = 'cliente' and l.lead_id is not null
  on conflict (linha_id, coluna_id) do nothing;
  if p_cab_auto then
    for h in select l.id as linha, bl.comp_base
               from public.planilha_linhas l join public.planilha_blocos bl on bl.id = l.bloco
              where l.tipo = 'cabecalho' and bl.comp_base is not null loop
      perform private.pl_set_texto(h.linha, v_col, private.pl_mmm_aa(private.pl_comp_soma(h.comp_base, p_k)));
    end loop;
  end if;
  return v_col;
end $$;

-- pagamento (lead, comp) mudou fora da planilha → texto da célula de mês.
-- Mês até 3 colunas além da última: cria as colunas que faltam (cabeçalho 'mmm/aa');
-- mais longe que isso: não cria e deixa no registro.
create or replace function private.pl_reflete_pagamento(p_lead uuid, p_comp text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_linha uuid; v_base text; v_k int; v_max int; v_col uuid; v_st text; v_val numeric; v_atual text; v_novo text; i int;
begin
  -- exclusão do lead em cascata: preserva as células (a Lixeira religa a linha)
  if not exists (select 1 from public.leads where id = p_lead) then return; end if;
  select l.id, b.comp_base into v_linha, v_base
    from public.planilha_linhas l join public.planilha_blocos b on b.id = l.bloco
   where l.lead_id = p_lead;
  if v_linha is null or v_base is null then return; end if;
  v_k := private.pl_meses(p_comp) - private.pl_meses(v_base);
  if v_k is null or v_k < 0 then return; end if;
  select status::text, valor into v_st, v_val from public.pagamentos where lead_id = p_lead and comp = p_comp;
  select id into v_col from public.planilha_colunas where mes_pos = v_k;
  if v_col is null then
    if v_st is null then return; end if;   -- apagou um pagamento de mês que nem tem coluna
    select coalesce(max(mes_pos), -1) into v_max from public.planilha_colunas;
    if v_k > v_max + 3 then
      perform private.registrar('pagamento fora da planilha', 'grade', p_lead::text,
        (select nome from public.leads where id = p_lead),
        public.comp_rotulo(p_comp) || ': ' || (v_k - v_max) || ' meses além da última coluna de mês — crie as colunas para ver na grade');
      return;
    end if;
    for i in v_max + 1 .. v_k loop
      v_col := private.pl_coluna_mes_nova(i, null, true);
    end loop;
    if v_col is null then return; end if;
  end if;
  select texto into v_atual from public.planilha_celulas where linha_id = v_linha and coluna_id = v_col;
  v_novo := private.pl_mes_texto(v_atual, v_st, v_val);
  if v_novo is distinct from v_atual then perform private.pl_set_texto(v_linha, v_col, v_novo); end if;
end $$;

-- campo do lead mudou fora da planilha → texto da célula (só se o texto atual não disser o mesmo)
create or replace function private.pl_campo_reflete(p_linha uuid, p_campo text, p_valor text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_col uuid; v_atual text; v_novo text; v_ref text;
begin
  select id into v_col from public.planilha_colunas where campo = p_campo;
  if v_col is null then return; end if;
  select texto into v_atual from public.planilha_celulas where linha_id = p_linha and coluna_id = v_col;
  if p_campo = 'fechamento' then
    v_ref := private.pl_mes_ref((select lead_id from public.planilha_linhas where id = p_linha));
  end if;
  if private.pl_equivale(p_campo, v_atual, p_valor, v_ref) then return; end if;
  v_novo := case p_campo
    when 'fechamento' then private.pl_fmt_data(p_valor, v_ref)
    when 'valor' then private.pl_fmt_valor(p_valor::numeric)
    else p_valor end;
  perform private.pl_set_texto(p_linha, v_col, v_novo);
end $$;

-- só a data_parou mudou (ficha, débito parado): troca a data DENTRO do texto da célula
-- DATA QUE PAROU (a 1ª data válida, a mesma que o parser lê) e mantém a nota. Sem data
-- (voltou p/ Novos, recusado) não apaga nada. Célula vazia → 'PAROU DD/MM'.
create or replace function private.pl_parou_data_reflete(p_linha uuid, p_data text, p_ref text default null) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_re constant text := '(?<![0-9])[0-9]{1,2}/([0-9]{1,2}|[A-Za-z]{3}\.?)(?:/([0-9]{4}|[0-9]{2}))?(?![0-9A-Za-z])';
  v_col uuid; v_atual text; v_curta text; v_m text; i int := 0;
begin
  if p_data is null or p_data !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' then return; end if;
  select id into v_col from public.planilha_colunas where campo = 'parou';
  if v_col is null then return; end if;
  select texto into v_atual from public.planilha_celulas where linha_id = p_linha and coluna_id = v_col;
  if private.pl_data_no_texto(v_atual, p_ref) is not distinct from p_data then return; end if;
  -- DD/MM; com o ano só quando a volta pela regra do ano não daria a mesma data
  v_curta := substr(p_data, 9, 2) || '/' || substr(p_data, 6, 2);
  if private.pl_data(v_curta, p_ref) is distinct from p_data then v_curta := v_curta || '/' || substr(p_data, 1, 4); end if;
  if coalesce(private.pl_trim(v_atual), '') = '' then
    perform private.pl_set_texto(p_linha, v_col, 'PAROU ' || v_curta);
    return;
  end if;
  loop
    i := i + 1;
    v_m := regexp_substr(v_atual, v_re, 1, i);
    exit when v_m is null;
    if private.pl_data_no_texto(v_m, p_ref) is not null then
      -- mês por extenso ("05/set") continua por extenso
      perform private.pl_set_texto(p_linha, v_col, regexp_replace(v_atual, v_re,
        case when v_m ~ '/[A-Za-z]' then private.pl_fmt_data(p_data, p_ref) else v_curta end, 1, i));
      return;
    end if;
  end loop;
  -- texto sem data: a nota fica e a data vai no fim
  perform private.pl_set_texto(p_linha, v_col, v_atual || ' ' || v_curta);
end $$;

-- senha guardada (decifrada) — só p/ comparar dentro das RPCs; nunca sai daqui
create or replace function private.pl_senha_atual(p_lead uuid, p_tipo text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare v_enc bytea; v_kv smallint;
begin
  select case when p_tipo = 'inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo = 'inss' then senha_inss_kv  else reclame_senha_kv  end
    into v_enc, v_kv from private.lead_segredos where lead_id = p_lead;
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $$;

-- backup antes da carga: private.bkp_<tabela>_AAAAMMDD_HHMMSS (uma cópia por execução,
-- inclusive das 4 planilha_* — cores, notas e colunas novas da equipe). Sem "if not exists":
-- nome repetido falha alto (a carga inteira volta) em vez de manter uma cópia velha.
create or replace function private.pl_backup(p_sufixo text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare t text; v_nome text;
begin
  foreach t in array array['public.leads', 'public.pagamentos', 'private.lead_segredos', 'public.entradas', 'public.mov_fin',
                           'public.competencias', 'public.planilha_blocos', 'public.planilha_colunas',
                           'public.planilha_linhas', 'public.planilha_celulas'] loop
    v_nome := 'bkp_' || split_part(t, '.', 2) || '_' || p_sufixo;
    execute format('create table private.%I as table %s', v_nome, t);
    execute format('alter table private.%I enable row level security', v_nome);
    execute format('revoke all on table private.%I from anon, authenticated', v_nome);
  end loop;
  return p_sufixo;
end $$;

-- ---------------------------------------------------------------------
-- 5) Gatilhos reversos (mudança FORA da planilha → célula). Ignoram planilha.sync='1'.
-- ---------------------------------------------------------------------
create or replace function private.pl_tg_leads_ins() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('planilha.sync', true), '') = '1' then return null; end if;
  perform private.pl_garantir_linha(new.id);
  return null;
end $$;

create or replace function private.pl_tg_leads_upd() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare v_linha uuid; v_bloco text; v_dest text;
begin
  if coalesce(current_setting('planilha.sync', true), '') = '1' then return null; end if;
  if not exists (select 1 from public.planilha_colunas) then return null; end if;
  select id, bloco into v_linha, v_bloco from public.planilha_linhas where lead_id = new.id;
  if v_linha is null then
    perform private.pl_garantir_linha(new.id);
    return null;
  end if;
  if new.situacao is distinct from old.situacao or new.dia is distinct from old.dia then
    v_dest := private.pl_bloco_para(new.situacao, new.dia);
    if v_dest is not null and v_dest is distinct from v_bloco then
      perform private.pl_mover_para_bloco(v_linha, v_dest);
    end if;
  end if;
  if new.fechamento is distinct from old.fechamento then perform private.pl_campo_reflete(v_linha, 'fechamento', new.fechamento); end if;
  if new.comercial  is distinct from old.comercial  then perform private.pl_campo_reflete(v_linha, 'comercial',  new.comercial);  end if;
  if new.nome       is distinct from old.nome       then perform private.pl_campo_reflete(v_linha, 'nome',       nullif(new.nome, '')); end if;
  if new.nb         is distinct from old.nb         then perform private.pl_campo_reflete(v_linha, 'nb',         new.nb);         end if;
  if new.banco      is distinct from old.banco      then perform private.pl_campo_reflete(v_linha, 'banco',      new.banco);      end if;
  if new.cpf        is distinct from old.cpf        then perform private.pl_campo_reflete(v_linha, 'cpf',        new.cpf);        end if;
  if new.valor      is distinct from old.valor      then perform private.pl_campo_reflete(v_linha, 'valor',      new.valor::text); end if;
  if new.parou      is distinct from old.parou      then perform private.pl_campo_reflete(v_linha, 'parou',      new.parou);      end if;
  -- só a data mudou (ficha, solicitar/aprovar débito parado): a data entra no texto, a nota fica
  if new.data_parou is distinct from old.data_parou and new.parou is not distinct from old.parou then
    perform private.pl_parou_data_reflete(v_linha, new.data_parou, private.pl_mes_ref(new.id));
  end if;
  if new.telefone   is distinct from old.telefone   then perform private.pl_campo_reflete(v_linha, 'telefone',   new.telefone);   end if;
  return null;
end $$;

create or replace function private.pl_tg_pagamentos() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('planilha.sync', true), '') = '1' then return null; end if;
  if not exists (select 1 from public.planilha_colunas) then return null; end if;
  if tg_op = 'DELETE' then
    perform private.pl_reflete_pagamento(old.lead_id, old.comp);
  else
    if tg_op = 'UPDATE' and (old.lead_id, old.comp) is distinct from (new.lead_id, new.comp) then
      perform private.pl_reflete_pagamento(old.lead_id, old.comp);
    end if;
    perform private.pl_reflete_pagamento(new.lead_id, new.comp);
  end if;
  return null;
end $$;

drop trigger if exists leads_planilha_ai on public.leads;
create trigger leads_planilha_ai after insert on public.leads
  for each row execute function private.pl_tg_leads_ins();

drop trigger if exists leads_planilha_au on public.leads;
create trigger leads_planilha_au after update on public.leads
  for each row when (
       old.situacao   is distinct from new.situacao   or old.dia      is distinct from new.dia
    or old.fechamento is distinct from new.fechamento or old.comercial is distinct from new.comercial
    or old.nome       is distinct from new.nome       or old.nb       is distinct from new.nb
    or old.banco      is distinct from new.banco      or old.cpf      is distinct from new.cpf
    or old.valor      is distinct from new.valor      or old.parou    is distinct from new.parou
    or old.data_parou is distinct from new.data_parou
    or old.telefone   is distinct from new.telefone)
  execute function private.pl_tg_leads_upd();

drop trigger if exists pagamentos_planilha_id on public.pagamentos;
create trigger pagamentos_planilha_id after insert or delete on public.pagamentos
  for each row execute function private.pl_tg_pagamentos();

drop trigger if exists pagamentos_planilha_u on public.pagamentos;
create trigger pagamentos_planilha_u after update on public.pagamentos
  for each row when (
       old.status is distinct from new.status or old.valor is distinct from new.valor
    or old.comp   is distinct from new.comp   or old.lead_id is distinct from new.lead_id)
  execute function private.pl_tg_pagamentos();

-- ---------------------------------------------------------------------
-- 6) Lixeira: guarda a linha da planilha e religa ao restaurar
-- ---------------------------------------------------------------------
create or replace function private.leads_trash() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.leads_lixeira(lead_id, nome, lead, segredos, pagamentos, cascata, vinculos, deletado_por)
  values (
    old.id, old.nome, to_jsonb(old),
    (select to_jsonb(s) from private.lead_segredos s where s.lead_id = old.id),
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.comp), '[]'::jsonb) from public.pagamentos p where p.lead_id = old.id),
    jsonb_build_object(
      'wa_regua_disparos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.wa_regua_disparos t where t.lead_id = old.id),
      'wa_regua_msgs',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.wa_regua_msgs t where t.cli_id  = old.id)
    ),
    jsonb_build_object(
      'entradas',        (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.entradas        where lead_id = old.id),
      'mov_fin',         (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.mov_fin         where lead_id = old.id),
      'wa_conversas',    (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.wa_conversas    where lead_id = old.id),
      'wa_envio_alvos',  (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.wa_envio_alvos  where lead_id = old.id),
      'planilha_linhas', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.planilha_linhas where lead_id = old.id)
    ),
    auth.uid()
  );
  return old;
end $$;

create or replace function public.lead_restaurar(p_trash_id uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare x private.leads_lixeira%rowtype; v_sync text := current_setting('planilha.sync', true); v_n int;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into x from private.leads_lixeira where id = p_trash_id;
  if not found then raise exception 'item da lixeira inexistente'; end if;
  if x.restaurado_em is not null then raise exception 'este cliente ja foi restaurado'; end if;
  if exists (select 1 from public.leads where id = x.lead_id) then raise exception 'o cliente ja esta na base'; end if;

  -- a planilha religa a linha ORIGINAL (com os textos/cores) — os gatilhos reversos não criam outra
  perform set_config('planilha.sync', '1', true);

  -- ciclo apagado depois da exclusão: volta sem ciclo_id (senão a FK barra e o item nunca volta)
  insert into public.leads select * from jsonb_populate_record(null::public.leads,
    x.lead || case when nullif(x.lead->>'ciclo_id', '') is not null
                    and not exists (select 1 from public.ciclos c where c.id = (x.lead->>'ciclo_id')::uuid)
                   then '{"ciclo_id": null}'::jsonb else '{}'::jsonb end);
  if x.segredos is not null then
    insert into private.lead_segredos select * from jsonb_populate_record(null::private.lead_segredos, x.segredos);
  end if;
  insert into public.pagamentos select * from jsonb_populate_recordset(null::public.pagamentos, coalesce(x.pagamentos,'[]'::jsonb))
    on conflict (lead_id, comp) do nothing;

  insert into public.wa_regua_msgs select * from jsonb_populate_recordset(null::public.wa_regua_msgs, coalesce(x.cascata->'wa_regua_msgs','[]'::jsonb))
    on conflict (id) do nothing;
  insert into public.wa_regua_disparos select * from jsonb_populate_recordset(null::public.wa_regua_disparos, coalesce(x.cascata->'wa_regua_disparos','[]'::jsonb))
    on conflict (id) do nothing;

  update public.entradas       t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'entradas','[]'::jsonb)))::uuid)       and t.lead_id is null;
  update public.mov_fin        t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'mov_fin','[]'::jsonb)))::uuid)        and t.lead_id is null;
  update public.wa_conversas   t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_conversas','[]'::jsonb)))::uuid)   and t.lead_id is null;
  update public.wa_envio_alvos t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_envio_alvos','[]'::jsonb)))::uuid) and t.lead_id is null;
  update public.planilha_linhas t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'planilha_linhas','[]'::jsonb)))::uuid) and t.lead_id is null;
  get diagnostics v_n = row_count;

  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  -- item antigo (sem vínculo) ou linha que não existe mais: linha nova no fim do bloco
  if v_n = 0 then perform private.pl_garantir_linha(x.lead_id); end if;

  update private.leads_lixeira set restaurado_em = now() where id = p_trash_id;
  return x.lead_id;
end $$;

-- ---------------------------------------------------------------------
-- 7) RPCs
-- ---------------------------------------------------------------------

-- 7.1 leitura (SECURITY INVOKER → RLS): linhas em ordem, só visíveis; células com texto ou estilo
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
                       order by l.ordem, l.id)
        from public.planilha_linhas l
        left join (
          select ce.linha_id, jsonb_object_agg(ce.coluna_id::text, jsonb_build_array(ce.texto, ce.estilo)) as c
            from public.planilha_celulas ce
           where ce.texto is not null or ce.estilo is not null
           group by ce.linha_id
        ) cc on cc.linha_id = l.id
       where l.tipo <> 'cliente' or l.lead_id is not null), '[]'::jsonb)
  )
$$;

-- 7.2 salvar células (tudo-ou-nada)
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
            if not (public.is_at_least('financeiro') or (v_papel = 'comercial' and public.comercial_dono_lead(l.lead_id))) then
              raise exception 'Sem permissão em %: marcar pago/não pago é com o financeiro, gestor, admin ou o comercial dono.', private.pl_ref(l.id, col.id) using errcode = '42501';
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

-- 7.3 colunas
create or replace function public.planilha_coluna_criar(p_ref uuid, p_lado text, p_tipo text, p_titulo text, p_cab jsonb default null)
  returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_ref numeric; v_ordem numeric; v_col uuid; v_k int; r record; v_linha uuid;
begin
  if not public.is_at_least('financeiro') then raise exception 'Criar coluna é com o financeiro, gestor ou admin.' using errcode = '42501'; end if;
  if p_tipo not in ('livre', 'mes') then raise exception 'tipo de coluna inválido' using errcode = '22023'; end if;
  if p_ref is not null then
    if coalesce(p_lado, '') not in ('esq', 'dir') then raise exception 'lado inválido (esq|dir)' using errcode = '22023'; end if;
    select ordem into v_ref from public.planilha_colunas where id = p_ref;
    if v_ref is null then raise exception 'Coluna de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;
    v_ordem := private.pl_ordem_coluna(v_ref, p_lado = 'dir');
  end if;

  if p_tipo = 'livre' then
    if v_ordem is null then select coalesce(max(ordem), 0) + 1000 into v_ordem from public.planilha_colunas; end if;
    insert into public.planilha_colunas (ordem, titulo, tipo)
    values (v_ordem, coalesce(nullif(btrim(p_titulo), ''), 'Nova coluna'), 'livre')
    returning id into v_col;
  else
    -- só o PRÓXIMO mês
    select coalesce(max(mes_pos), -1) + 1 into v_k from public.planilha_colunas;
    v_col := private.pl_coluna_mes_nova(v_k, v_ordem);
    if nullif(btrim(p_titulo), '') is not null then
      update public.planilha_colunas set titulo = btrim(p_titulo) where id = v_col;
    end if;
    -- cabeçalho de cada bloco (ex. {"D24":"24/out"})
    if jsonb_typeof(p_cab) = 'object' then
      for r in select key, value from jsonb_each_text(p_cab) loop
        for v_linha in select id from public.planilha_linhas where bloco = r.key and tipo = 'cabecalho' loop
          perform private.pl_set_texto(v_linha, v_col, r.value);
        end loop;
      end loop;
    end if;
  end if;
  perform private.pl_versao_bump();
  return v_col;
end $$;

create or replace function public.planilha_coluna_alterar(p_coluna uuid, p_patch jsonb)
  returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_at_least('financeiro') then raise exception 'Mudar coluna é com o financeiro, gestor ou admin.' using errcode = '42501'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'patch inválido' using errcode = '22023'; end if;
  update public.planilha_colunas set
    titulo  = case when p_patch ? 'titulo' then coalesce(p_patch->>'titulo', '') else titulo end,
    largura = case when p_patch ? 'largura' and jsonb_typeof(p_patch->'largura') = 'number'
                   then least(900, greatest(30, round((p_patch->>'largura')::numeric)))::smallint else largura end,
    oculta  = case when p_patch ? 'oculta' and jsonb_typeof(p_patch->'oculta') = 'boolean'
                   then (p_patch->>'oculta')::boolean else oculta end,
    ordem   = case when p_patch ? 'ordem' and jsonb_typeof(p_patch->'ordem') = 'number'
                   then (p_patch->>'ordem')::numeric else ordem end
  where id = p_coluna;
  if not found then raise exception 'Coluna não encontrada — recarregue.' using errcode = 'P0002'; end if;
  perform private.pl_versao_bump();
end $$;

create or replace function public.planilha_coluna_excluir(p_coluna uuid)
  returns void language plpgsql security definer set search_path = ''
as $$
declare v_tipo text;
begin
  if not public.is_at_least('gestor') then raise exception 'Excluir coluna é com o gestor ou admin.' using errcode = '42501'; end if;
  select tipo into v_tipo from public.planilha_colunas where id = p_coluna;
  if v_tipo is null then raise exception 'Coluna não encontrada — recarregue.' using errcode = 'P0002'; end if;
  if v_tipo <> 'livre' then
    raise exception 'Só colunas criadas na planilha (livres) podem ser excluídas — as da planilha original e os meses alimentam o sistema.' using errcode = '22023';
  end if;
  delete from public.planilha_colunas where id = p_coluna;
  perform private.pl_versao_bump();
end $$;

-- 7.4 linhas
create or replace function public.planilha_linha_inserir(p_ref uuid, p_lado text, p_tipo text)
  returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_papel text := public.current_papel()::text;
  v_sync text := current_setting('planilha.sync', true);
  r public.planilha_linhas%rowtype; b public.planilha_blocos%rowtype;
  v_bloco text; v_ordem numeric; v_lead uuid; v_linha uuid;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  if coalesce(p_lado, '') not in ('acima', 'abaixo') then raise exception 'lado inválido (acima|abaixo)' using errcode = '22023'; end if;
  if coalesce(p_tipo, '') not in ('cliente', 'cabecalho', 'vazia', 'rotulo') then raise exception 'tipo de linha inválido' using errcode = '22023'; end if;
  select * into r from public.planilha_linhas where id = p_ref;
  if not found then raise exception 'Linha de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;
  v_bloco := r.bloco;

  if p_tipo = 'cliente' then
    -- acima do cabeçalho/rótulo a linha fica visualmente no bloco de CIMA, mas o cliente iria
    -- para o bloco da referência: recusa (abaixo do cabeçalho = 1ª linha do bloco, certo)
    if p_lado = 'acima' and r.tipo in ('cabecalho', 'rotulo') then
      raise exception 'Para incluir cliente num bloco, use "Inserir cliente abaixo" no cabeçalho ou numa linha do bloco.' using errcode = '22023';
    end if;
    if v_bloco is null then v_bloco := private.pl_bloco_vizinho(r.ordem); end if;
    if v_bloco is null then raise exception 'Escolha uma linha dentro de um bloco (ciclo ou NOVOS).' using errcode = '22023'; end if;
    select * into b from public.planilha_blocos where id = v_bloco;
    if b.situacao = 'cancelado' and not public.pode_aprovar_parado() then
      raise exception 'Cliente direto em cobrança (bloco %) precisa de aprovação: cadastre em NOVOS e marque "débito parado".', v_bloco using errcode = '42501';
    end if;
  elsif not public.is_at_least('financeiro') then
    raise exception 'Inserir linha em branco, rótulo ou cabeçalho é com o financeiro, gestor ou admin.' using errcode = '42501';
  end if;

  v_ordem := private.pl_ordem_linha(r.ordem, p_lado = 'abaixo');
  perform set_config('planilha.sync', '1', true);
  if p_tipo = 'cliente' then
    insert into public.leads (nome, comercial, situacao, dia, created_by)
    values ('', case when v_papel = 'comercial' then public.meu_nome() end, b.situacao, b.dia, auth.uid())
    returning id into v_lead;
  end if;
  insert into public.planilha_linhas (ordem, tipo, bloco, lead_id)
  values (v_ordem, p_tipo, v_bloco, v_lead)
  returning id into v_linha;
  if v_lead is not null then perform private.pl_preencher_linha(v_linha); end if;
  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  perform private.pl_versao_bump();
  return v_linha;
end $$;

create or replace function public.planilha_linha_excluir(p_linha uuid)
  returns void language plpgsql security definer set search_path = ''
as $$
declare r public.planilha_linhas%rowtype;
begin
  if public.current_papel() is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into r from public.planilha_linhas where id = p_linha;
  if not found then return; end if;
  if r.tipo = 'cliente' then
    if not public.is_at_least('gestor') then
      raise exception 'Excluir cliente (vai para a Lixeira) é com o gestor ou admin.' using errcode = '42501';
    end if;
    if r.lead_id is null then return; end if;
    delete from public.leads where id = r.lead_id;   -- Lixeira pelo gatilho; a linha fica oculta (lead_id null)
  else
    if not public.is_at_least('financeiro') then
      raise exception 'Excluir linha é com o financeiro, gestor ou admin.' using errcode = '42501';
    end if;
    delete from public.planilha_linhas where id = p_linha;
  end if;
  perform private.pl_versao_bump();
end $$;

create or replace function public.planilha_linha_mover(p_linha uuid, p_ref uuid, p_lado text)
  returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_sync text := current_setting('planilha.sync', true);
  v_fluxo text;
  r public.planilha_linhas%rowtype; ref public.planilha_linhas%rowtype; b public.planilha_blocos%rowtype;
  ld public.leads%rowtype;
  v_ordem numeric; v_dest text; v_dia smallint;
begin
  if not public.is_at_least('financeiro') then raise exception 'Mover linha é com o financeiro, gestor ou admin.' using errcode = '42501'; end if;
  if coalesce(p_lado, '') not in ('acima', 'abaixo') then raise exception 'lado inválido (acima|abaixo)' using errcode = '22023'; end if;
  if p_linha = p_ref then return; end if;
  select * into r from public.planilha_linhas where id = p_linha;
  if not found then raise exception 'Linha não encontrada — recarregue.' using errcode = 'P0002'; end if;
  select * into ref from public.planilha_linhas where id = p_ref;
  if not found then raise exception 'Linha de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;

  -- a ordem primeiro (pode reabrir o vão); o UPDATE da linha vem depois
  v_ordem := private.pl_ordem_linha(ref.ordem, p_lado = 'abaixo', p_linha);
  if r.tipo = 'cliente' then
    v_dest := coalesce(ref.bloco, private.pl_bloco_vizinho(v_ordem, p_linha));
  end if;

  if v_dest is null or v_dest is not distinct from r.bloco then
    update public.planilha_linhas set ordem = v_ordem where id = p_linha;
  else
    select * into b from public.planilha_blocos where id = v_dest;
    if r.lead_id is not null then
      select * into ld from public.leads where id = r.lead_id for update;
      perform set_config('planilha.sync', '1', true);
      if ld.situacao = 'ativo' and b.situacao = 'cancelado' then
        -- Novos → cobrança só pelo fluxo do débito parado (aprovação registrada e avisada a quem pediu)
        if not coalesce(ld.parado_pendente, false) then
          raise exception 'Para levar um cliente dos Novos para a cobrança, marque "débito parado" nos Novos — a aprovação coloca no ciclo.' using errcode = '22023';
        end if;
        v_fluxo := current_setting('reviza.fluxo_parado', true);
        perform public.aprovar_parado(r.lead_id, b.dia, null, null);
        perform set_config('reviza.fluxo_parado', coalesce(v_fluxo, ''), true);
      else
        -- dia/situação do bloco (o guard do débito parado vale: financeiro+ é aprovador); NOVOS mantém o dia
        v_dia := coalesce(b.dia, case when b.situacao = 'ativo' then ld.dia end);
        update public.leads set dia = v_dia, situacao = b.situacao
         where id = r.lead_id and (dia, situacao) is distinct from (v_dia, b.situacao);
      end if;
      perform set_config('planilha.sync', coalesce(v_sync, ''), true);
    end if;
    -- bloco + ordem escolhida; os meses acompanham o seu mês (e nada digitado em NOVOS some)
    perform private.pl_mover_para_bloco(p_linha, v_dest, v_ordem);
  end if;
  perform private.pl_versao_bump();
end $$;

-- 7.5 carga única (e reusável): "a planilha manda"
create or replace function public.planilha_substituir(p jsonb)
  returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '300s'
as $$
declare
  v_uid uuid := auth.uid();
  v_sync text := current_setting('planilha.sync', true);
  v_sufixo text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD_HH24MISS');
  v_backup text;
  v_manter boolean := coalesce((p->>'manter_pendentes')::boolean, true);
  v_remover uuid[] := '{}'; v_vistos bigint; v_agora bigint;
  v_ref text; v_dia smallint;
  b jsonb; c jsonb; r jsonb; j bigint; i bigint;
  v_cols uuid[] := '{}'; v_idx jsonb := '{}'::jsonb; v_mes int[] := '{}'; v_mespos int[] := '{}';
  v_col uuid; v_linha uuid; v_lead uuid; v_tipo text; v_bloco text;
  bl public.planilha_blocos%rowtype;
  v_senha_i int; v_recl_i int;
  t_nome text; t_com text; t_nb text; t_banco text; t_cpf text; t_fech text; t_val text; t_parou text; t_recl text; t_tel text; t_senha text;
  n_nome text; n_com text; n_nb text; n_banco text; n_cpf text; n_fech text; n_val numeric; n_parou text; n_dparou text; n_drecl text; n_tel text;
  ld public.leads%rowtype;
  v_leads uuid[] := '{}'; v_repl uuid[] := '{}';
  v_pl uuid[] := '{}'; v_pc text[] := '{}'; v_ps text[] := '{}'; v_pv numeric[] := '{}'; v_pt text[] := '{}';
  v_t text; v_st text; m int;
  n_blocos int := 0; n_cols int := 0; n_linhas int := 0; n_cli int := 0; n_cas int := 0; n_cri int := 0;
  n_cel int := 0; n_sen int := 0; n_rem int := 0; n_mant int := 0; n_pdel int := 0; n_pgrav int := 0; v_rc int;
  v_por_bloco jsonb := '{}'::jsonb;
begin
  if public.current_papel() is distinct from 'admin' then raise exception 'sem permissao (só admin)' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'blocos') <> 'array' or jsonb_typeof(p->'colunas') <> 'array'
     or jsonb_typeof(p->'linhas') <> 'array' then
    raise exception 'payload inválido (blocos, colunas e linhas)' using errcode = '22023';
  end if;
  if jsonb_array_length(p->'colunas') = 0 or jsonb_array_length(p->'linhas') = 0 then
    raise exception 'payload vazio' using errcode = '22023';
  end if;
  if p ? 'remover' and jsonb_typeof(p->'remover') not in ('array', 'null') then
    raise exception 'payload inválido ("remover" precisa ser uma lista de ids)' using errcode = '22023';
  end if;

  -- trava de recarga: recarregar TRUNCA a planilha (cores, notas, colunas novas da equipe)
  if exists (select 1 from public.planilha_linhas) and coalesce((p->>'recarregar')::boolean, false) is not true then
    raise exception 'A planilha já foi carregada. Recarregar apaga cores, notas e colunas criadas pela equipe — para isso envie "recarregar": true (script: --recarregar).' using errcode = '55000';
  end if;
  -- trava otimista: a base mudou entre a leitura do script e agora → rodar de novo
  v_vistos := nullif(p->>'leads_vistos', '')::bigint;
  if v_vistos is not null then
    select count(*) into v_agora from public.leads;
    if v_agora <> v_vistos then
      raise exception 'A base de clientes mudou desde a leitura (% vistos, % agora) — rode o script de novo.', v_vistos, v_agora using errcode = '40001';
    end if;
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_remover
    from jsonb_array_elements_text(case when jsonb_typeof(p->'remover') = 'array' then p->'remover' else '[]'::jsonb end) x;

  if coalesce((p->>'backup')::boolean, true) then v_backup := private.pl_backup(v_sufixo); end if;

  perform set_config('planilha.sync', '1', true);
  truncate public.planilha_celulas, public.planilha_linhas, public.planilha_colunas, public.planilha_blocos;

  -- blocos
  for b in select value from jsonb_array_elements(p->'blocos') loop
    insert into public.planilha_blocos (id, dia, situacao, comp_base)
    values (b->>'id', (b->>'dia')::smallint, (b->>'situacao')::public.situacao_debito, nullif(b->>'comp_base', ''));
    n_blocos := n_blocos + 1;
  end loop;

  -- colunas (índice j-1 no array "c" das linhas)
  for c, j in select value, ordinality from jsonb_array_elements(p->'colunas') with ordinality loop
    insert into public.planilha_colunas (ordem, titulo, tipo, campo, mes_pos, largura, oculta)
    values (1000 * j, coalesce(c->>'titulo', ''), c->>'tipo', nullif(c->>'campo', ''), (c->>'mes_pos')::smallint,
            coalesce((c->>'largura')::smallint, 110), coalesce((c->>'oculta')::boolean, false))
    returning id into v_col;
    v_cols := v_cols || v_col;
    if nullif(c->>'campo', '') is not null then v_idx := v_idx || jsonb_build_object(c->>'campo', j - 1); end if;
    if c->>'tipo' = 'mes' then v_mes := v_mes || (j - 1)::int; v_mespos := v_mespos || (c->>'mes_pos')::int; end if;
    n_cols := n_cols + 1;
  end loop;
  v_senha_i := (v_idx->>'senha_inss')::int;
  v_recl_i := (v_idx->>'reclame')::int;

  -- linhas
  for r, i in select value, ordinality from jsonb_array_elements(p->'linhas') with ordinality loop
    v_tipo := r->>'tipo';
    v_bloco := nullif(r->>'bloco', '');
    v_lead := null;
    if v_tipo not in ('cliente', 'cabecalho', 'vazia', 'rotulo') then raise exception 'linha %: tipo inválido', i using errcode = '22023'; end if;

    if v_tipo = 'cliente' then
      select * into bl from public.planilha_blocos where id = v_bloco;
      if not found then raise exception 'linha %: cliente sem bloco válido', i using errcode = '22023'; end if;
      t_nome  := r->'c'->>((v_idx->>'nome')::int);
      t_com   := r->'c'->>((v_idx->>'comercial')::int);
      t_nb    := r->'c'->>((v_idx->>'nb')::int);
      t_banco := r->'c'->>((v_idx->>'banco')::int);
      t_cpf   := r->'c'->>((v_idx->>'cpf')::int);
      t_fech  := r->'c'->>((v_idx->>'fechamento')::int);
      t_val   := r->'c'->>((v_idx->>'valor')::int);
      t_parou := r->'c'->>((v_idx->>'parou')::int);
      t_recl  := r->'c'->>((v_idx->>'reclame')::int);
      t_tel   := r->'c'->>((v_idx->>'telefone')::int);

      -- referência da regra do ano (datas curtas sem ano): 1º mês PAGO da própria linha
      -- (bloco com mês-base); em NOVOS o mês é só texto → 1º pago que o cliente já tem
      v_ref := null;
      if bl.comp_base is not null then
        for m in 1 .. coalesce(array_length(v_mes, 1), 0) loop
          if private.pl_mes_estado(r->'c'->>v_mes[m]) = 'pago' then
            v_ref := least(v_ref, private.pl_comp_soma(bl.comp_base, v_mespos[m]));
          end if;
        end loop;
      elsif nullif(r->>'lead_id', '') is not null then
        v_ref := private.pl_mes_ref((r->>'lead_id')::uuid);
      end if;

      if nullif(r->>'lead_id', '') is not null then
        select * into ld from public.leads where id = (r->>'lead_id')::uuid for update;
        if not found then raise exception 'linha %: cliente % não existe mais', i, r->>'lead_id' using errcode = 'P0002'; end if;
        if ld.id = any(v_leads) then raise exception 'linha %: cliente casado com mais de uma linha', i using errcode = '22023'; end if;
        -- entrar num bloco de cobrança aprovaria o débito parado sem o fluxo (sem aprovador, sem aviso)
        if coalesce(ld.parado_pendente, false) and bl.situacao = 'cancelado' then
          raise exception 'linha %: o cliente aguarda aprovação de débito parado — aprove nos Novos (ou deixe a linha em NOVOS) antes de carregar.', i using errcode = '22023';
        end if;
        v_lead := ld.id;
        n_nome  := case when v_idx ? 'nome'      then coalesce(btrim(t_nome), '')  else ld.nome end;
        n_com   := case when v_idx ? 'comercial' then nullif(btrim(t_com), '')     else ld.comercial end;
        n_nb    := case when v_idx ? 'nb'        then nullif(btrim(t_nb), '')      else ld.nb end;
        n_banco := case when v_idx ? 'banco'     then nullif(btrim(t_banco), '')   else ld.banco end;
        n_cpf   := case when v_idx ? 'cpf'       then nullif(btrim(t_cpf), '')     else ld.cpf end;
        n_fech  := coalesce(private.pl_data(t_fech, v_ref), ld.fechamento);
        n_val   := coalesce(private.pl_valor(t_val), ld.valor);
        n_parou := case when v_idx ? 'parou'     then nullif(t_parou, '')          else ld.parou end;
        n_dparou := coalesce(private.pl_data_no_texto(t_parou, v_ref), ld.data_parou);
        n_drecl := coalesce(private.pl_data_no_texto(t_recl, v_ref), ld.data_reclamacao);
        n_tel   := coalesce(private.pl_tel(t_tel), ld.telefone);
        -- NOVOS (sem dia) mantém o dia que o cliente já tinha
        v_dia   := coalesce(bl.dia, case when bl.situacao = 'ativo' then ld.dia end);
        update public.leads set
          nome = n_nome, comercial = n_com, nb = n_nb, banco = n_banco, cpf = n_cpf, fechamento = n_fech, valor = n_val,
          parou = n_parou, data_parou = n_dparou, data_reclamacao = n_drecl, telefone = n_tel,
          dia = v_dia, situacao = bl.situacao
        where id = v_lead
          and (nome, comercial, nb, banco, cpf, fechamento, valor, parou, data_parou, data_reclamacao, telefone, dia, situacao)
              is distinct from (n_nome, n_com, n_nb, n_banco, n_cpf, n_fech, n_val, n_parou, n_dparou, n_drecl, n_tel, v_dia, bl.situacao);
        n_cas := n_cas + 1;
        v_por_bloco := jsonb_set(v_por_bloco, array[bl.id], coalesce(v_por_bloco->bl.id, '{"casados":0,"criados":0}'::jsonb)
                         || jsonb_build_object('casados', coalesce((v_por_bloco->bl.id->>'casados')::int, 0) + 1));
      else
        insert into public.leads (nome, comercial, nb, banco, cpf, fechamento, valor, parou, data_parou, data_reclamacao, telefone,
                                  dia, situacao, created_by)
        values (coalesce(btrim(t_nome), ''), nullif(btrim(t_com), ''), nullif(btrim(t_nb), ''), nullif(btrim(t_banco), ''),
                nullif(btrim(t_cpf), ''), private.pl_data(t_fech, v_ref), coalesce(private.pl_valor(t_val), 0), nullif(t_parou, ''),
                private.pl_data_no_texto(t_parou, v_ref), private.pl_data_no_texto(t_recl, v_ref), private.pl_tel(t_tel),
                bl.dia, bl.situacao, v_uid)
        returning id into v_lead;
        n_cri := n_cri + 1;
        v_por_bloco := jsonb_set(v_por_bloco, array[bl.id], coalesce(v_por_bloco->bl.id, '{"casados":0,"criados":0}'::jsonb)
                         || jsonb_build_object('criados', coalesce((v_por_bloco->bl.id->>'criados')::int, 0) + 1));
      end if;
      v_leads := v_leads || v_lead;
      n_cli := n_cli + 1;

      -- senhas (mesma lógica do set_senha; vazio = limpa; igual à guardada = não mexe)
      if v_senha_i is not null then
        t_senha := coalesce(r->'c'->>v_senha_i, '');
        if t_senha <> coalesce(private.pl_senha_atual(v_lead, 'inss'), '') then
          perform public.set_senha(v_lead, 'inss', t_senha); n_sen := n_sen + 1;
        end if;
      end if;
      if v_recl_i is not null then
        t_senha := coalesce(t_recl, '');
        if t_senha <> coalesce(private.pl_senha_atual(v_lead, 'reclame'), '') then
          perform public.set_senha(v_lead, 'reclame', t_senha); n_sen := n_sen + 1;
        end if;
      end if;

      -- pagamentos desejados (só blocos com mês-base; NOVOS não mexe nos pagamentos)
      if bl.comp_base is not null then
        v_repl := v_repl || v_lead;
        for m in 1 .. coalesce(array_length(v_mes, 1), 0) loop
          v_t := r->'c'->>v_mes[m];
          v_st := private.pl_mes_estado(v_t);
          v_pl := v_pl || v_lead;
          v_pc := v_pc || private.pl_comp_soma(bl.comp_base, v_mespos[m]);
          v_ps := v_ps || v_st;
          v_pv := v_pv || case when v_st = 'pago' then private.pl_valor(v_t) end;
          v_pt := v_pt || v_t;
        end loop;
      end if;
    end if;

    insert into public.planilha_linhas (ordem, tipo, bloco, lead_id, altura)
    values (1000 * i, v_tipo, v_bloco, v_lead, (r->>'altura')::smallint)
    returning id into v_linha;
    n_linhas := n_linhas + 1;

    insert into public.planilha_celulas (linha_id, coluna_id, texto, estilo, atualizado_por)
    select v_linha, v_cols[x.k::int], x.txt, x.est, v_uid
      from (
        select k, case when v_tipo = 'cliente' and (k - 1 = v_senha_i or k - 1 = v_recl_i) then null else nullif(t, '') end as txt,
               private.pl_estilo(r->'s'->((k - 1)::int)) as est
          from jsonb_array_elements_text(coalesce(r->'c', '[]'::jsonb)) with ordinality as e(t, k)
      ) x
     where x.k <= coalesce(array_length(v_cols, 1), 0) and (x.txt is not null or x.est is not null);
    get diagnostics v_rc = row_count;
    n_cel := n_cel + v_rc;
  end loop;

  -- pagamentos: a planilha manda (apaga os que não estão; célula vazia ou '-' mantém um "fora")
  insert into public.competencias (comp)
  select distinct d.comp from unnest(v_pc, v_ps) as d(comp, st) where d.st is not null
  on conflict do nothing;

  delete from public.pagamentos pg
   where pg.lead_id = any(v_repl)
     and not exists (
       select 1 from unnest(v_pl, v_pc, v_ps, v_pt) as d(lead_id, comp, st, txt)
        where d.lead_id = pg.lead_id and d.comp = pg.comp
          and (d.st is not null or (pg.status = 'fora' and coalesce(private.pl_trim(d.txt), '') in ('', '-'))));
  get diagnostics n_pdel = row_count;

  insert into public.pagamentos (lead_id, comp, status, valor, pago_em, confirmado_por)
  select d.lead_id, d.comp, d.st::public.status_pagamento, d.v, case when d.st = 'pago' then now() end, v_uid
    from unnest(v_pl, v_pc, v_ps, v_pv) as d(lead_id, comp, st, v)
   where d.st is not null
  on conflict (lead_id, comp) do update set
    status = excluded.status, valor = excluded.valor, pago_em = excluded.pago_em, confirmado_por = excluded.confirmado_por
  where (public.pagamentos.status, public.pagamentos.valor) is distinct from (excluded.status, excluded.valor);
  get diagnostics n_pgrav = row_count;

  -- Lixeira (reversível) SÓ para os ids de "remover" (o que o script viu e decidiu); quem aguarda
  -- aprovação fica. Lead que não está nem nas linhas nem em "remover" (criado depois da leitura,
  -- pendente) ganha linha no fim do bloco dele.
  delete from public.leads lx
   where lx.id = any(v_remover)
     and not (lx.id = any(v_leads))
     and not (v_manter and coalesce(lx.parado_pendente, false));
  get diagnostics n_rem = row_count;
  for v_lead in select id from public.leads where not (id = any(v_leads)) order by id loop
    perform private.pl_garantir_linha(v_lead);
    n_mant := n_mant + 1;
  end loop;

  perform private.registrar('substituiu planilha', 'planilha', null, 'Gestão de cobranças',
    n_linhas || ' linhas · ' || n_cas || ' casados · ' || n_cri || ' criados · ' || n_rem || ' para a Lixeira');

  perform private.pl_versao_bump();
  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  return jsonb_build_object('ok', true,
    'blocos', n_blocos, 'colunas', n_cols, 'linhas', n_linhas, 'celulas', n_cel,
    'clientes', n_cli, 'casados', n_cas, 'criados', n_cri, 'removidos', n_rem, 'mantidos', n_mant,
    'pagamentos_gravados', n_pgrav, 'pagamentos_apagados', n_pdel, 'senhas_alteradas', n_sen,
    'por_bloco', v_por_bloco, 'backup', v_backup);
end $$;

-- ---------------------------------------------------------------------
-- 8) Grants das funções
-- ---------------------------------------------------------------------
revoke all on function
  private.pl_trim(text), private.pl_valor(text), private.pl_nao_pagou(text), private.pl_mes_estado(text),
  private.pl_eh_estado(text), private.pl_data_partes(text, text, text, text), private.pl_data(text, text), private.pl_data_no_texto(text, text),
  private.pl_tel(text), private.pl_fmt_valor(numeric), private.pl_fmt_data(text, text), private.pl_meses(text),
  private.pl_comp_soma(text, int), private.pl_mmm_aa(text), private.pl_mes_texto(text, text, numeric), private.pl_estilo(jsonb),
  private.pl_equivale(text, text, text, text), private.pl_letra(int), private.pl_ref(uuid, uuid), private.pl_mes_ref(uuid),
  private.pl_versao_bump(),
  private.pl_set_texto(uuid, uuid, text), private.pl_ordem_linha(numeric, boolean, uuid), private.pl_ordem_coluna(numeric, boolean),
  private.pl_fim_do_bloco(text, uuid), private.pl_bloco_vizinho(numeric, uuid), private.pl_bloco_para(public.situacao_debito, smallint),
  private.pl_reescrever_meses(uuid, boolean), private.pl_preencher_linha(uuid), private.pl_garantir_linha(uuid),
  private.pl_meses_trocar_base(uuid, text, text), private.pl_mover_para_bloco(uuid, text, numeric),
  private.pl_coluna_mes_nova(int, numeric, boolean), private.pl_reflete_pagamento(uuid, text),
  private.pl_campo_reflete(uuid, text, text), private.pl_parou_data_reflete(uuid, text, text),
  private.pl_senha_atual(uuid, text), private.pl_backup(text),
  private.pl_tg_leads_ins(), private.pl_tg_leads_upd(), private.pl_tg_pagamentos()
from public, anon, authenticated;

revoke all on function
  public.planilha_dados(), public.planilha_salvar(jsonb, text),
  public.planilha_coluna_criar(uuid, text, text, text, jsonb), public.planilha_coluna_alterar(uuid, jsonb),
  public.planilha_coluna_excluir(uuid), public.planilha_linha_inserir(uuid, text, text),
  public.planilha_linha_excluir(uuid), public.planilha_linha_mover(uuid, uuid, text),
  public.planilha_substituir(jsonb), public.lead_restaurar(uuid)
from public, anon;
grant execute on function
  public.planilha_dados(), public.planilha_salvar(jsonb, text),
  public.planilha_coluna_criar(uuid, text, text, text, jsonb), public.planilha_coluna_alterar(uuid, jsonb),
  public.planilha_coluna_excluir(uuid), public.planilha_linha_inserir(uuid, text, text),
  public.planilha_linha_excluir(uuid), public.planilha_linha_mover(uuid, uuid, text),
  public.planilha_substituir(jsonb), public.lead_restaurar(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- 9) Realtime (o front assina em useRealtimeCobranca). Idempotente.
--    planilha_celulas fica FORA: uma colagem em massa seriam milhares de eventos (cada um
--    checando RLS por cliente conectado). As RPCs sobem planilha_versao 1× por chamada e as
--    células mudadas pelos gatilhos reversos chegam pelos eventos de leads/pagamentos.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['planilha_blocos', 'planilha_colunas', 'planilha_linhas', 'planilha_versao'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planilha_celulas') then
    alter publication supabase_realtime drop table public.planilha_celulas;
  end if;
end $$;
