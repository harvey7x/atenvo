-- CORREÇÃO DE SEGURANÇA — wa_dentro_janela era um oráculo sem dono.
--
-- Ela é SECURITY DEFINER (precisa ser: o worker roda como service_role) e tinha EXECUTE para
-- `authenticated` SEM checar organização. Um usuário logado de QUALQUER org podia perguntar
-- "a conversa X está dentro da janela?" para um UUID arbitrário e receber true/false — ou seja,
-- descobrir se uma conversa existe e se teve inbound recente em org alheia. Sinal fraco (exige
-- adivinhar UUID), mas é vazamento entre inquilinos e não custa nada fechar.
--
-- Agora: chamada AUTENTICADA só responde de conversa da própria org; service_role (auth.uid()
-- null, backend confiável) segue respondendo tudo, que é o que o bot-remarketing precisa.

create or replace function public.wa_dentro_janela(p_conversa uuid, p_horas int default 24)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_org uuid; v_ult timestamptz;
begin
  select c.organizacao_id, c.ultima_entrada_em into v_org, v_ult
    from public.conversas c where c.id = p_conversa;
  if v_org is null then return false; end if;                       -- conversa inexistente

  -- auth.uid() null = service_role (worker/webhook). Usuário logado só enxerga a própria org.
  if auth.uid() is not null and not (public.is_platform_admin() or public.is_member(v_org)) then
    return false;
  end if;

  return coalesce(v_ult > now() - make_interval(hours => greatest(p_horas, 1)), false);
end $fn$;

revoke all on function public.wa_dentro_janela(uuid, int) from public, anon;
grant execute on function public.wa_dentro_janela(uuid, int) to authenticated, service_role;

comment on function public.wa_dentro_janela is
  'Conversa está dentro da janela de 24h da Cloud API (contada da última mensagem DO CLIENTE)? Chamada autenticada só responde sobre a própria organização; service_role responde sempre.';
