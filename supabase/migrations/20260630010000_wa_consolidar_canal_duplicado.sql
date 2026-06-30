-- Consolida um canal WhatsApp ATIVO recém-criado no canal HISTÓRICO do MESMO número (mesma org/provider).
-- Reaproveita o canal histórico (preserva canal_id, conversas, snapshots, relatórios) e repõe nele a
-- instância técnica atual. Match por número EXATO (nunca por nome). Idempotente: sem irmão -> no-op.
-- Chamada pelo evolution-webhook em connection.update(open) para curar reconexões que criaram canal novo.
create or replace function public.wa_consolidar_canal_por_numero(p_org uuid, p_canal_ativo uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hist uuid; v_inst text; v_status integracao_status; v_ativo boolean; v_num text; v_prov text;
begin
  select instancia_externa, status_integracao, ativo, numero_conectado, provider
    into v_inst, v_status, v_ativo, v_num, v_prov
  from canais where id = p_canal_ativo and organizacao_id = p_org and tipo = 'whatsapp';
  if not found or v_num is null then return p_canal_ativo; end if;

  select id into v_hist from canais
   where organizacao_id = p_org and tipo = 'whatsapp' and provider = v_prov
     and numero_conectado = v_num and id <> p_canal_ativo
   order by criado_em asc limit 1;
  if v_hist is null then return p_canal_ativo; end if;

  -- move dados do canal duplicado para o histórico (merge de conversa por contato quando houver).
  update mensagens m set conversa_id = h.id
    from conversas d join conversas h on h.canal_id = v_hist and h.contato_id = d.contato_id
   where d.canal_id = p_canal_ativo and m.conversa_id = d.id;
  delete from conversas d using conversas h
   where d.canal_id = p_canal_ativo and h.canal_id = v_hist and h.contato_id = d.contato_id;
  update conversas set canal_id = v_hist where canal_id = p_canal_ativo;
  update conversas set ultimo_canal_id = v_hist where ultimo_canal_id = p_canal_ativo;
  update contatos set canal_origem_id = v_hist where canal_origem_id = p_canal_ativo;
  update oportunidades set canal_origem_id = v_hist where canal_origem_id = p_canal_ativo;
  update fichas_judiciais set canal_id = v_hist where canal_id = p_canal_ativo;
  update integracoes set canal_id = v_hist where canal_id = p_canal_ativo;

  -- APAGA o duplicado PRIMEIRO (libera a vaga do limite), depois reativa o histórico com a instância atual.
  delete from canais where id = p_canal_ativo;
  update canais set instancia_externa = v_inst, status_integracao = v_status, ativo = v_ativo,
    numero_conectado = coalesce(numero_conectado, v_num), conectado_em = now(), ultima_sincronizacao = now()
   where id = v_hist;
  return v_hist;
end $$;

revoke all on function public.wa_consolidar_canal_por_numero(uuid, uuid) from public, anon;
grant execute on function public.wa_consolidar_canal_por_numero(uuid, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
