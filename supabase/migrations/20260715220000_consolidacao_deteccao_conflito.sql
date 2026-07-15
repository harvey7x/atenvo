-- Consolidação de canal por número: de "fundir silenciosamente" para "DETECTAR CONFLITO".
--
-- ANTES: quando um canal recém-conectado tinha o mesmo numero_conectado de um canal mais antigo,
-- wa_consolidar_canal_por_numero MOVIA os dados, DELETAVA o canal novo (perdendo o nome) e REATIVAVA
-- o antigo. Efeito: todo número re-adicionado "virava LUIZA". (Auditoria 2026-07-15.)
--
-- AGORA: se o número já pertence a OUTRO canal NÃO-removido, marca o canal novo como CONFLITO
-- (status_integracao='atencao', ativo=false, conflito_com=<canal existente>) e NÃO funde, NÃO deleta,
-- NÃO reativa o antigo, NÃO perde o nome. O painel mostra o conflito e o usuário decide.
-- O caso legítimo de reconexão do MESMO canal não dispara nada (id <> p_canal_ativo exclui a si próprio).

-- marcador de conflito (aditivo; não mexe no enum status_integracao)
alter table public.canais
  add column if not exists conflito_com uuid references public.canais(id) on delete set null,
  add column if not exists conflito_em timestamptz;
comment on column public.canais.conflito_com is
  'Quando setado: este canal autenticou um número que já pertence ao canal referenciado. NÃO foi fundido; aguarda decisão do usuário no painel.';

create or replace function public.wa_consolidar_canal_por_numero(p_org uuid, p_canal_ativo uuid)
returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_num text; v_prov text; v_hist uuid; v_hist_nome text;
begin
  select numero_conectado, provider into v_num, v_prov
  from canais where id = p_canal_ativo and organizacao_id = p_org and tipo = 'whatsapp';
  if v_num is null then return p_canal_ativo; end if;

  -- outro canal (NÃO removido) com o MESMO número? (o mais antigo)
  select id, nome_interno into v_hist, v_hist_nome from canais
   where organizacao_id = p_org and tipo = 'whatsapp' and provider = v_prov
     and numero_conectado = v_num and id <> p_canal_ativo
     and status_integracao <> 'removido'
   order by criado_em asc limit 1;
  if v_hist is null then return p_canal_ativo; end if;   -- sem conflito: canal novo segue normal

  -- CONFLITO: não funde, não deleta, não reativa o antigo. Só marca o canal novo e sinaliza no painel.
  update canais set status_integracao = 'atencao', ativo = false, conflito_com = v_hist, conflito_em = now()
   where id = p_canal_ativo;

  insert into audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (p_org, null, 'canal_conflito_numero', 'canais', p_canal_ativo,
          jsonb_build_object('canal_novo', p_canal_ativo, 'conflita_com', v_hist, 'nome_existente', v_hist_nome, 'numero', right(v_num, 4)));

  return v_hist;
end $function$;
