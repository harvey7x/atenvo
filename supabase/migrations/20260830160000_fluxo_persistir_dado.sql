-- ============================================================================
-- Fluxos do bot — persistência GENÉRICA do dado coletado na ficha do contato.
--
-- Por que não reusar bot_coletar_nome/bot_registrar_cpf: aquelas RPCs são
-- específicas da operação INSS/CAF — bot_coletar_nome carimba a oportunidade com
-- "… - Análise de descontos" (mentira num fluxo de outro assunto) e
-- bot_registrar_cpf SOBRESCREVE contatos.cpf sem guarda. Para um fluxo montado
-- pelo cliente (produto genérico), a persistência precisa ser neutra e defensiva:
--   • nome: só sobrescreve nome genérico/de origem whatsapp/sistema (mesma guarda
--           da casa), fonte='bot'; a oportunidade já existe (garantir_oportunidade
--           _lead_novo roda em todo inbound) e passa a exibir o nome do contato.
--   • cpf/email/telefone: só preenchem se o campo estiver VAZIO (nunca clobber).
--   • o valor coletado (mascarado p/ cpf) fica em dados_qualificacao.fluxo_<dado>,
--     onde o humano enxerga — CPF cru só na coluna própria contatos.cpf.
-- Best-effort: se algo falhar, o handler ignora (o dado segue no cf_dados).
-- ============================================================================
create or replace function public.fluxo_persistir_dado(
  p_conversa uuid, p_dado text, p_valor text, p_valor_mascarado text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; v_nome_atual text; v_fonte text; v_generico boolean;
begin
  select organizacao_id, contato_id into c from public.conversas where id = p_conversa;
  if not found then return; end if;

  if p_dado = 'nome' then
    select nome, nome_fonte into v_nome_atual, v_fonte from public.contatos where id = c.contato_id;
    v_generico := v_nome_atual is null or btrim(v_nome_atual) = '' or v_nome_atual !~ '[A-Za-zÀ-ÿ]'
                  or lower(btrim(v_nome_atual)) in ('cliente','identidade protegida');
    if v_generico or v_fonte is null or v_fonte in ('whatsapp','sistema') then
      update public.contatos set nome = btrim(p_valor), nome_fonte = 'bot' where id = c.contato_id;
    end if;
  elsif p_dado = 'cpf' then
    update public.contatos set cpf = regexp_replace(coalesce(p_valor,''), '\D', '', 'g')
      where id = c.contato_id and (cpf is null or btrim(cpf) = '');
  elsif p_dado = 'email' then
    update public.contatos set email = lower(btrim(p_valor))
      where id = c.contato_id and (email is null or btrim(email) = '');
  elsif p_dado = 'telefone' then
    update public.contatos set telefone = regexp_replace(coalesce(p_valor,''), '\D', '', 'g')
      where id = c.contato_id and (telefone is null or btrim(telefone) = '');
  end if;

  update public.bot_conversa_estado
    set dados_qualificacao = dados_qualificacao
          || jsonb_build_object('fluxo_' || p_dado, coalesce(p_valor_mascarado, p_valor)),
        ultima_atividade_em = now()
    where conversa_id = p_conversa;
end $$;

revoke all on function public.fluxo_persistir_dado(uuid, text, text, text) from public, anon;
grant execute on function public.fluxo_persistir_dado(uuid, text, text, text) to service_role;
