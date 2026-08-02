-- ─────────────────────────────────────────────────────────────────────────────
-- OPT-OUT POR TEXTO ("SAIR") — registra em wa_optout SEMPRE, não só na cadência.
--
-- Antes: o "SAIR" era tratado apenas por bot_remarketing_inbound, que (a) retorna
-- cedo se o contato não tem fila de remarketing ativa e (b) mesmo quando age, só
-- marca a fila + move a opp — nunca grava wa_optout. Resultado: quem pedia pra
-- sair fora da cadência era ignorado, e o disparo em massa não teria como saber.
--
-- Agora: os webhooks (cloud + evolution) chamam wa_optout_inbound em todo texto
-- inbound. Se bater na regex de saída, grava wa_optout (motivo 'sair_texto').
-- Escopo: wa_optout bloqueia APENAS marketing/disparo/remarketing — atendimento
-- humano segue normal. Reverte com wa_optout_remover.
--
-- REGEX: deliberadamente MAIS ESTREITA que a de bot_remarketing_inbound. Auditoria
-- de 2026-08-01 sobre o histórico real: 12 mensagens batiam na regex ampla e ~todas
-- eram conversa normal ("depois que eu SAIR do trabalho", "demora pra SAIR o
-- desconto", "não posso SAIR de casa"). Aqui a detecção roda em TODO inbound de
-- atendimento, então só conta: (a) mensagem-comando curta ("SAIR", "PARAR", "STOP")
-- ou (b) frase explícita de descadastro. A regex ampla continua válida DENTRO da
-- cadência (bot_remarketing_inbound), onde responder "sair" a um toque de marketing
-- tem outro contexto.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 'sair_texto' entra na whitelist de motivos (era: erro_131050 | user_preferences | manual)
create or replace function public.wa_optout_registrar(
  p_contato uuid, p_canal uuid, p_motivo text, p_detalhe text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_waba text;
begin
  select organizacao_id, cloud_waba_id into v_org, v_waba from public.canais where id = p_canal;
  if v_org is null or p_contato is null then return; end if;
  if p_motivo not in ('erro_131050', 'user_preferences', 'manual', 'sair_texto') then raise exception 'motivo_invalido'; end if;

  insert into public.wa_optout (contato_id, canal_id, organizacao_id, waba_id, motivo, detalhe)
  values (p_contato, p_canal, v_org, v_waba, p_motivo, left(coalesce(p_detalhe, ''), 300))
  on conflict (contato_id, canal_id) do nothing;   -- o primeiro "não quero" é o que vale
end $fn$;
revoke all on function public.wa_optout_registrar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.wa_optout_registrar(uuid, uuid, text, text) to service_role;

-- 2) Detector chamado pelos webhooks em todo texto inbound. Retorna true se registrou.
create or replace function public.wa_optout_inbound(p_conversa uuid, p_texto text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare v_contato uuid; v_canal uuid; v_txt text;
begin
  v_txt := btrim(coalesce(p_texto, ''));

  if not (
       -- (a) mensagem-comando: só a palavra (com pontuação/emoji ao redor), ex. "SAIR", "Parar!", "stop"
       (length(v_txt) <= 24 and v_txt ~* '^\W*(sair|parar|pare|stop|remover|descadastrar?)\W*$')
       -- (b) frase explícita de descadastro, em qualquer tamanho
    or v_txt ~* 'n[ãa]o quero (mais )?(receber|mensag)'
    or v_txt ~* 'n[ãa]o (me )?(mande|mandem|manda|envie|enviem|chame|chamem) mais'
    or v_txt ~* 'par(e|a|em) de (me )?(mandar|enviar|chamar|encher)'
    or v_txt ~* '\y(descadastr|cancelar? (a )?inscri)'
    or v_txt ~* 'me (remova|remove|tira|tire)( meu (nome|n[uú]mero))? .{0,16}(lista|contatos|grupo)'
    or v_txt ~* '(tira|tire|remova|remover?) (meu )?(nome|n[uú]mero|contato) .{0,16}lista'
    or v_txt ~* 'remover? (meu )?(n[uú]mero|contato)'
    or v_txt ~* 'sair (d\w+ )?lista'
    or v_txt ~* 'chega de (mensagem|msg|propaganda)'
  ) then
    return false;
  end if;

  select contato_id, canal_id into v_contato, v_canal from public.conversas where id = p_conversa;
  if v_contato is null or v_canal is null then return false; end if;

  perform public.wa_optout_registrar(v_contato, v_canal, 'sair_texto', left(coalesce(p_texto,''), 300));
  return true;
end $fn$;
revoke all on function public.wa_optout_inbound(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_optout_inbound(uuid, text) to service_role;
