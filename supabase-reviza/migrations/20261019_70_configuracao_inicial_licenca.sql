-- ============================================================================
-- Reviza · mig 70 — CONFIGURAÇÃO INICIAL (gate das 3 etapas) + licença v2
--
-- Decisões do dono (19/10, via Matheus):
-- · Ao entrar no sistema, a equipe (comercial) vê "acesso pendente" e quem
--   aprova (cadastro/financeiro/gestor/admin — a MESMA lista do débito parado,
--   public.pode_aprovar_parado(); papel_rank NÃO serve: o cadastro fica abaixo
--   do comercial) vê o assistente de 3 etapas: Planilha, WhatsApp, Mensalidade.
-- · Contas de suporte (profiles.suporte: Matheus, Teste (verificação)) entram
--   com aviso, nunca bloqueiam.
-- · FAIL-OPEN: erro de leitura nunca tranca ninguém — configuracao_estado()
--   devolve 'inativo' em qualquer falha.
-- · ORDEM DE ATIVAÇÃO (crítica): o gate NASCE DESLIGADO
--   (configuracao_sistema.gate_ativo = false → status 'inativo' e o front não
--   mostra nada). Motivo: ligar antes do PUSHINPAY_TOKEN existir prenderia a
--   equipe numa etapa 3 impossível de concluir. Ligar é decisão do usuário,
--   depois dos tokens:
--     update public.configuracao_sistema set gate_ativo = true where singleton;
--
-- Licença v2 (licenca_estado):
-- · passa a olhar a fatura ABERTA MAIS ANTIGA (um mês que ficou para trás é o
--   que trava) em vez da fatura do mês corrente;
-- · campo novo `proxima_em` ('AAAA-MM-DD'): o vencimento do mês seguinte ao da
--   fatura (com tudo pago: o primeiro mês sem fatura paga) — o front mostra
--   "próxima mensalidade";
-- · FAIL-SAFE novo: fatura aberta SEM pix_copia_cola E SEM qr_base64 nunca
--   devolve 'bloqueado' (fica 'aviso') — ninguém é trancado sem ter como pagar.
-- · Seed da fatura de OUTUBRO/2026 (vencida desde 05/10; próxima 05/11), pix
--   nulos: a edge reviza-licenca gera o Pix na primeira rodada com token.
--   sistema_licenca.ativo NÃO muda (continua false — fail-open).
--
-- Dependências/ordem: aplicar DEPOIS das migs ≤69 e ANTES da 71 (a etapa
-- 'planilha' lê public.sync_planilha_config, criada na 71; entre as duas o
-- gate responde 'inativo' pelo master switch + exception fail-open).
-- Shapes JSON = contrato do front (src/v2/data/cobranca/configuracao.ts):
-- chaves camelCase idênticas (EstadoConfiguracao, CoberturaWhatsapp).
-- Tudo idempotente: if not exists / on conflict / create or replace / revoke+grant.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1) profiles.suporte — isento do gate (entra com aviso, nunca bloqueia)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists suporte boolean not null default false;

-- seed: nomes confirmados no vivo em 19/10 (admin Matheus e "Teste (verificação)")
update public.profiles set suporte = true
 where nome in ('Matheus', 'Teste (verificação)') and not suporte;

-- ---------------------------------------------------------------------
-- 2) configuracao_sistema (singleton) — master switch + estado das etapas
--    Escrita SÓ por RPC/service; leitura SÓ pela RPC (sem policy).
-- ---------------------------------------------------------------------
create table if not exists public.configuracao_sistema (
  singleton            boolean primary key default true check (singleton),
  gate_ativo           boolean not null default false,   -- master switch: false = recurso inexistente ('inativo')
  modo_whatsapp        text check (modo_whatsapp in ('por-atendente', 'unico')),
  canal_unico_id       uuid references public.wa_canais(id) on delete set null,
  etapa_planilha_em    timestamptz,
  etapa_whatsapp_em    timestamptz,
  etapa_mensalidade_em timestamptz,
  concluida_em         timestamptz,
  atualizado_em        timestamptz not null default now(),
  atualizado_por       uuid
);
insert into public.configuracao_sistema (singleton) values (true) on conflict (singleton) do nothing;

alter table public.configuracao_sistema enable row level security;
-- sem policy: authenticated não lê nem escreve direto (grants no padrão da mig 65;
-- o service_role escreve pelos default privileges + bypassrls, como sistema_faturas na 67)
revoke all on table public.configuracao_sistema from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Etapas calculadas NO SERVIDOR (fonte única p/ estado/concluir/salvar):
--    · planilha    = sync configurada (1ª aplicação) E (automático ligado OU a
--                    etapa já foi carimbada — desligar o automático depois não
--                    re-tranca a equipe);
--    · whatsapp    = modo escolhido E ≥1 canal conectado E (modo ≠ 'unico' OU o
--                    canal único aponta canal conectado);
--    · mensalidade = NENHUMA fatura aberta E ≥1 fatura paga (sem fatura nenhuma
--                    — token ausente — fica false: "indisponível e não conclui").
-- ---------------------------------------------------------------------
create or replace function private.cfg_etapas() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.configuracao_sistema%rowtype;
  v_planilha boolean := false;
  v_whats boolean := false;
  v_mens boolean := false;
begin
  select * into c from public.configuracao_sistema where singleton;
  select (sp.configurada_em is not null) and (sp.automatico or c.etapa_planilha_em is not null)
    into v_planilha
    from public.sync_planilha_config sp
   where sp.singleton;
  v_planilha := coalesce(v_planilha, false);
  v_whats := c.modo_whatsapp is not null
    and exists (select 1 from public.wa_canais w where w.estado = 'conectado')
    and (c.modo_whatsapp <> 'unico'
         or exists (select 1 from public.wa_canais w
                     where w.id = c.canal_unico_id and w.estado = 'conectado'));
  v_mens := not exists (select 1 from public.sistema_faturas f where f.status = 'aberta')
    and exists (select 1 from public.sistema_faturas f where f.status = 'paga');
  return jsonb_build_object('planilha', v_planilha, 'whatsapp', v_whats, 'mensalidade', v_mens);
end $$;
revoke all on function private.cfg_etapas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) configuracao_estado() — shape EXATO de EstadoConfiguracao.
--    Qualquer papel ativo chama (o comercial precisa p/ a TelaEspera).
--    FAIL-OPEN: sem papel, gate desligado ou QUALQUER erro → 'inativo'.
-- ---------------------------------------------------------------------
create or replace function public.configuracao_estado() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.configuracao_sistema%rowtype;
  v_etapas jsonb;
  v_inativo constant jsonb := jsonb_build_object(
    'status', 'inativo',
    'etapas', jsonb_build_object('planilha', false, 'whatsapp', false, 'mensalidade', false),
    'whatsapp', jsonb_build_object('modo', null, 'numeroUnicoId', null),
    'concluidaEm', null);
begin
  if public.current_papel() is null then return v_inativo; end if;
  select * into c from public.configuracao_sistema where singleton;
  if not coalesce(c.gate_ativo, false) then return v_inativo; end if;
  v_etapas := private.cfg_etapas();
  return jsonb_build_object(
    'status', case
      when c.concluida_em is not null
        or ((v_etapas->>'planilha')::boolean and (v_etapas->>'whatsapp')::boolean
            and (v_etapas->>'mensalidade')::boolean)
      then 'concluida' else 'pendente' end,
    'etapas', v_etapas,
    'whatsapp', jsonb_build_object('modo', c.modo_whatsapp, 'numeroUnicoId', c.canal_unico_id),
    'concluidaEm', c.concluida_em);
exception when others then
  return v_inativo;  -- fail-open: erro de leitura nunca tranca ninguém
end $$;

-- ---------------------------------------------------------------------
-- 5) configuracao_concluir_etapa(p_etapa) — revalida no servidor e carimba.
--    A Etapa 2 conclui pela configuracao_whatsapp_salvar (o front chama ela);
--    aqui o ramo 'whatsapp' revalida a MESMA condição (idempotente).
-- ---------------------------------------------------------------------
create or replace function public.configuracao_concluir_etapa(p_etapa text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_et jsonb;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_etapa not in ('planilha', 'whatsapp', 'mensalidade') then
    raise exception 'etapa inválida' using errcode = '22023';
  end if;
  perform 1 from public.configuracao_sistema where singleton for update;

  if p_etapa = 'planilha' then
    -- concluir exige o automático ligado AGORA (o carimbo é o que mantém a
    -- etapa concluída se desligarem o automático depois)
    if not exists (select 1 from public.sync_planilha_config
                    where configurada_em is not null and automatico) then
      raise exception 'Para concluir a etapa da planilha, aplique a primeira sincronização e ligue o automático.'
        using errcode = '55000';
    end if;
    update public.configuracao_sistema
       set etapa_planilha_em = coalesce(etapa_planilha_em, now()),
           atualizado_em = now(), atualizado_por = auth.uid()
     where singleton;
  elsif p_etapa = 'whatsapp' then
    if not (private.cfg_etapas()->>'whatsapp')::boolean then
      raise exception 'Para concluir a etapa do WhatsApp, escolha o modo e conecte um número (botão Concluir da etapa).'
        using errcode = '55000';
    end if;
    update public.configuracao_sistema
       set etapa_whatsapp_em = coalesce(etapa_whatsapp_em, now()),
           atualizado_em = now(), atualizado_por = auth.uid()
     where singleton;
  else
    if not (private.cfg_etapas()->>'mensalidade')::boolean then
      raise exception 'O pagamento da mensalidade ainda não foi confirmado — o Pix precisa cair antes de concluir a etapa.'
        using errcode = '55000';
    end if;
    update public.configuracao_sistema
       set etapa_mensalidade_em = coalesce(etapa_mensalidade_em, now()),
           atualizado_em = now(), atualizado_por = auth.uid()
     where singleton;
  end if;

  v_et := private.cfg_etapas();
  if (v_et->>'planilha')::boolean and (v_et->>'whatsapp')::boolean and (v_et->>'mensalidade')::boolean then
    update public.configuracao_sistema
       set concluida_em = coalesce(concluida_em, now()),
           atualizado_em = now(), atualizado_por = auth.uid()
     where singleton;
  end if;
  return public.configuracao_estado();
end $$;

-- ---------------------------------------------------------------------
-- 6) configuracao_whatsapp_salvar(p_modo, p_numero_unico_id) — Etapa 2.
--    NÃO toca em wa_regua_config: salvar a escolha NÃO liga a régua.
-- ---------------------------------------------------------------------
create or replace function public.configuracao_whatsapp_salvar(p_modo text, p_numero_unico_id uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_et jsonb;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  if p_modo not in ('por-atendente', 'unico') then
    raise exception 'modo inválido (por-atendente ou unico)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.wa_canais where estado = 'conectado') then
    raise exception 'Conecte pelo menos um número de WhatsApp antes de concluir.' using errcode = '55000';
  end if;
  if p_modo = 'unico' then
    if p_numero_unico_id is null then
      raise exception 'Escolha qual número fará todos os envios da cobrança.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.wa_canais where id = p_numero_unico_id and estado = 'conectado') then
      raise exception 'O número escolhido não está conectado — conecte-o (ou escolha outro) antes de concluir.'
        using errcode = '55000';
    end if;
  end if;

  perform 1 from public.configuracao_sistema where singleton for update;
  update public.configuracao_sistema
     set modo_whatsapp = p_modo,
         canal_unico_id = case when p_modo = 'unico' then p_numero_unico_id else null end,
         etapa_whatsapp_em = now(),
         atualizado_em = now(), atualizado_por = auth.uid()
   where singleton;

  v_et := private.cfg_etapas();
  if (v_et->>'planilha')::boolean and (v_et->>'whatsapp')::boolean and (v_et->>'mensalidade')::boolean then
    update public.configuracao_sistema
       set concluida_em = coalesce(concluida_em, now()),
           atualizado_em = now(), atualizado_por = auth.uid()
     where singleton;
  end if;
  return public.configuracao_estado();
end $$;

-- ---------------------------------------------------------------------
-- 7) configuracao_cobertura_whatsapp() — shape EXATO de CoberturaWhatsapp.
--    `numero` vai CRU (dígitos/E.164 do canal): o front formata (+55 51 …).
--    `clientes` = clientes EM COBRANÇA do comercial (situacao = 'cancelado',
--    casando o nome como o resto do sistema: upper(btrim(...))).
-- ---------------------------------------------------------------------
create or replace function public.configuracao_cobertura_whatsapp() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  return jsonb_build_object(
    'comerciais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'usuarioId', t.id,
               'nome', t.nome,
               'clientes', t.clientes,
               'status', t.status,
               'numero', t.numero)
             order by t.clientes desc, t.nome)
        from (
          select p.id, p.nome,
                 (select count(*) from public.leads l
                   where l.situacao = 'cancelado'
                     and upper(btrim(coalesce(l.comercial, ''))) = upper(btrim(p.nome))) as clientes,
                 case when w.estado is null then 'sem-numero'
                      when w.estado = 'conectado' then 'conectado'
                      else 'desconectado' end as status,
                 case when w.estado = 'conectado' then w.numero end as numero
            from public.profiles p
            left join lateral (
              select c.estado, c.numero
                from public.wa_canais c
               where c.dono_id = p.id
               order by (c.estado = 'conectado') desc, c.updated_at desc
               limit 1
            ) w on true
           where p.ativo and p.papel = 'comercial'
        ) t), '[]'::jsonb),
    'numeros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nome', c.nome,
               'numero', c.numero,
               'conectado', c.estado = 'conectado',
               'donoId', c.dono_id)
             order by (c.estado = 'conectado') desc, c.created_at)
        from public.wa_canais c), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- 8) licenca_estado() v2 — fatura ABERTA MAIS ANTIGA + proxima_em + fail-safe
--    (replace do corpo da mig 67; mesmo nome, mesmos grants; o shape antigo é
--    preservado — comp/valor_centavos/vence_em/bloqueia_em/pix/qr/pago_em).
-- ---------------------------------------------------------------------
create or replace function public.licenca_estado()
  returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg public.sistema_licenca;
  f public.sistema_faturas;
  v_paga public.sistema_faturas;
  v_ano int; v_mes int;
  v_vence date;             -- dia_venc do mês DA FATURA aberta (BRT)
  v_bloqueia timestamptz;   -- dia_venc às hora_bloqueio BRT, como instante absoluto
  v_prox date;              -- dia_venc do mês SEGUINTE ao da fatura
begin
  select * into v_cfg from public.sistema_licenca where singleton;

  -- FAIL-OPEN: recurso desligado → nada trava (como na mig 67)
  if not coalesce(v_cfg.ativo, false) then
    return jsonb_build_object('estado', 'ok');
  end if;

  -- v2: a régua é a fatura ABERTA MAIS ANTIGA (um mês que ficou para trás é o que trava)
  select * into f from public.sistema_faturas where status = 'aberta' order by comp limit 1;

  if f.id is null then
    -- nada em aberto (sem fatura / tudo pago / cancelada) → ok.
    -- Com histórico pago: pago_em da mais recente + proxima_em = vencimento do
    -- primeiro mês sem fatura paga.
    select * into v_paga from public.sistema_faturas where status = 'paga' order by comp desc limit 1;
    if v_paga.id is null then
      return jsonb_build_object('estado', 'ok');
    end if;
    v_ano := substr(v_paga.comp, 1, 4)::int;
    v_mes := substr(v_paga.comp, 6, 2)::int;
    v_prox := make_date(case when v_mes = 12 then v_ano + 1 else v_ano end,
                        case when v_mes = 12 then 1 else v_mes + 1 end,
                        v_cfg.dia_venc::int);
    return jsonb_build_object('estado', 'ok', 'pago_em', v_paga.pago_em,
                              'proxima_em', to_char(v_prox, 'YYYY-MM-DD'));
  end if;

  -- fatura ABERTA — a régua é do MÊS DA FATURA (não do mês corrente). O cast
  -- "timestamp at time zone" lê a data/hora como PAREDE de São Paulo e devolve
  -- o timestamptz certo (mesma conta da mig 67).
  v_ano := substr(f.comp, 1, 4)::int;
  v_mes := substr(f.comp, 6, 2)::int;
  v_vence := make_date(v_ano, v_mes, v_cfg.dia_venc::int);
  v_bloqueia := (v_vence::timestamp + make_interval(hours => v_cfg.hora_bloqueio::int)) at time zone 'America/Sao_Paulo';
  v_prox := make_date(case when v_mes = 12 then v_ano + 1 else v_ano end,
                      case when v_mes = 12 then 1 else v_mes + 1 end,
                      v_cfg.dia_venc::int);

  return jsonb_build_object(
    -- FAIL-SAFE: fatura aberta SEM Pix (copia-e-cola E QR nulos) nunca bloqueia —
    -- ninguém é trancado sem ter como pagar (ex.: a seed de 2026-10 antes do token)
    'estado', case when now() >= v_bloqueia
                    and (f.pix_copia_cola is not null or f.qr_base64 is not null)
               then 'bloqueado' else 'aviso' end,
    'comp', f.comp,
    'valor_centavos', f.valor_centavos,
    'vence_em', to_char(v_vence, 'YYYY-MM-DD'),
    'bloqueia_em', v_bloqueia,
    'pix_copia_cola', f.pix_copia_cola,
    'qr_base64', f.qr_base64,
    'pago_em', f.pago_em,
    'proxima_em', to_char(v_prox, 'YYYY-MM-DD')
  );
end $$;

-- ---------------------------------------------------------------------
-- 9) Seed da fatura de OUTUBRO/2026 (decisão do dono: vencida desde 05/10;
--    próxima 05/11). Pix nulos: a edge reviza-licenca gera na primeira rodada
--    com PUSHINPAY_TOKEN. Enquanto sistema_licenca.ativo = false, nada muda
--    para a equipe (licenca_estado → 'ok').
-- ---------------------------------------------------------------------
insert into public.sistema_faturas (comp, valor_centavos)
values ('2026-10', 10000)
on conflict (comp) do nothing;

-- ---------------------------------------------------------------------
-- 10) Grants (padrão mig 65: nada a public/anon; authenticated só EXECUTE)
-- ---------------------------------------------------------------------
revoke all on function
  public.configuracao_estado(),
  public.configuracao_concluir_etapa(text),
  public.configuracao_whatsapp_salvar(text, uuid),
  public.configuracao_cobertura_whatsapp(),
  public.licenca_estado()
from public, anon;
grant execute on function
  public.configuracao_estado(),
  public.configuracao_concluir_etapa(text),
  public.configuracao_whatsapp_salvar(text, uuid),
  public.configuracao_cobertura_whatsapp(),
  public.licenca_estado()
to authenticated;
