-- ─────────────────────────────────────────────────────────────────────────────
-- LEAD QUENTE, tipo 2: FLUXO CONCLUÍDO (pedido do dono 2026-08-13).
--
-- O lead que TERMINA a qualificação (entrega o CPF e fica "aguardando um
-- consultor") era tratado com menos urgência que o que abandona: nenhum
-- alerta, precisa_humano limpo pelo fecho, só o toast genérico de inbound.
-- Agora o fecho dispara o MESMO modal (som/claim/cronômetro) pra equipe
-- toda — primeiro que pegar, liga; quem assume sobrescreve o rodízio (a RPC
-- de assumir já grava contatos.responsavel_id).
--
-- Decisões do dono: equipe toda (não só o consultor roteado); auto-cancela
-- quando um HUMANO responder na conversa (origem atenvo/telefone — bot não
-- conta); inbound do cliente segue cancelando SÓ o tipo abandono (cliente
-- perguntando "alô?" não resolve um concluído). Aditivo: alerta de abandono
-- intocado; 1 alerta por conversa POR TIPO.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.alertas_lead_quente
  add column if not exists tipo text not null default 'abandono'
  check (tipo in ('abandono', 'concluido'));

-- unique passa a ser por (conversa, tipo): a mesma conversa pode ter tido um
-- abandono cancelado e depois concluir — são dois eventos, dois alertas 1x.
alter table public.alertas_lead_quente
  drop constraint if exists alertas_lead_quente_conversa_unica;
alter table public.alertas_lead_quente
  add constraint alertas_lead_quente_conversa_tipo_unica unique (conversa_id, tipo);

-- ── GATILHO DO FECHO ─────────────────────────────────────────────────────────
-- Dispara na TRANSIÇÃO do passo_botoes para 'fim' (fecho da qualificação; o
-- mini-fluxo de suporte termina em 'suporte_fim' e fica de fora). Instantâneo
-- (sem cron) e idempotente pelo unique — reprocessos do bot não duplicam.
create or replace function public.fn_alerta_lq_fluxo_concluido()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  insert into public.alertas_lead_quente (organizacao_id, conversa_id, contato_id, passo, abandonado_em, tipo)
  select cv.organizacao_id, cv.id, cv.contato_id, 'fim', now(), 'concluido'
    from public.conversas cv
   where cv.id = new.conversa_id
     and cv.status in ('aberta','em_atendimento','pendente')
  on conflict (conversa_id, tipo) do nothing;
  return new;
end $fn$;

drop trigger if exists trg_alerta_lq_fluxo_concluido on public.bot_conversa_estado;
create trigger trg_alerta_lq_fluxo_concluido
  after update of dados_qualificacao on public.bot_conversa_estado
  for each row
  when ((old.dados_qualificacao->>'passo_botoes') is distinct from 'fim'
        and (new.dados_qualificacao->>'passo_botoes') = 'fim')
  execute function public.fn_alerta_lq_fluxo_concluido();

-- ── INBOUND cancela SÓ o tipo abandono ───────────────────────────────────────
-- (comportamento original preservado para abandono; concluído não se resolve
-- com o cliente mandando mais mensagem — se resolve com um humano atendendo.)
create or replace function public.fn_alerta_lq_inbound_cancela()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  update public.alertas_lead_quente
     set status = 'cancelado', cancelado_motivo = 'cliente_respondeu', cancelado_em = now()
   where conversa_id = new.conversa_id and status = 'pendente' and tipo = 'abandono';
  return new;
end $fn$;

-- ── RESPOSTA HUMANA cancela pendentes (os dois tipos) ────────────────────────
-- Saída real de gente: painel ('atenvo') ou celular do atendente ('telefone').
-- Bot ('bot'), sistema e nota interna não contam. A mensagem automática do
-- "Assumir" chega DEPOIS do claim (alerta já 'assumido') — vira no-op.
create or replace function public.fn_alerta_lq_humano_cancela()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  update public.alertas_lead_quente
     set status = 'cancelado', cancelado_motivo = 'atendente_respondeu', cancelado_em = now()
   where conversa_id = new.conversa_id and status = 'pendente';
  return new;
end $fn$;

drop trigger if exists trg_alerta_lq_humano_cancela on public.mensagens;
create trigger trg_alerta_lq_humano_cancela
  after insert on public.mensagens
  for each row
  when (new.direcao = 'saida' and new.origem in ('atenvo', 'telefone'))
  execute function public.fn_alerta_lq_humano_cancela();
