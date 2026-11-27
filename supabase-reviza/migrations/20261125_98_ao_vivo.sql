-- 98 · AO VIVO: as conversas abertas AGORA, uma coluna por atendente, por equipe ou por etiqueta (dono 25/11, do sistema
-- que a Reviza usava antes: "Dashboard › Ao vivo — conversas abertas, por usuário"). Só leitura: UMA rotina para o
-- Dashboard (administrador). Nada aqui muda dados, nem as Cobranças, nem o resto do Atendimento.
--
-- A régua (a mesma da lista do WhatsApp):
--   · ABERTA = conversa do WhatsApp não arquivada (arquivada_em vazio) e fora de 'resolvida' e 'fechada'.
--   · as 2000 mais recentes (pela última interação); 'total' diz quantas abertas existem ao todo.
--   · a ÚLTIMA MENSAGEM é a última de verdade: fora as do sistema e as notas internas, e fora a nossa que falhou no envio
--     (o cliente continua sem resposta). O texto vem limpo (sem o carimbo de assinatura "*Nome – MARCA:*"), numa linha,
--     com até 140 letras; a mídia vai pelo tipo (a tela escreve "[áudio]", "[foto]"…).
--   · ESPERANDO = a última mensagem é do cliente (ninguém respondeu depois, nem a IA).
--   · ATENDENTE = o responsável pela conversa (conversas.atendente_id; sem ele, o responsável pelo cliente).
--   · EQUIPE = a equipe do atendente (como pessoa ou gerente); sem atendente em equipe, a equipe dona do número.
--   · ETIQUETAS = as da conversa e as do cliente, sem repetir.
--   · IA = a sessão da IA está ativa, não foi desligada à mão e o número está com a IA ligada e conectado
--     (a mesma conta de ia_atendendo_agora). Saída com origem 'bot' é a IA.
-- Cada conversa leva só os ids do número, do atendente e da equipe; os nomes vão uma vez só nas listas canais, atendentes
-- e equipes (a tela atualiza a cada 30 s: a resposta fica bem menor).

create or replace function public.dash_ao_vivo(p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := p_org;
  v_res jsonb;
begin
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  with
  abertas as (
    select cv.id, cv.contato_id, cv.canal_id, cv.ultimo_numero, cv.atendente_id, cv.etiquetas, cv.nao_lidas, cv.ultima_interacao_em,
           ca.nome_interno as canal_nome, coalesce(nullif(btrim(ca.numero_conectado), ''), nullif(btrim(ca.identificador), ''), cv.ultimo_numero) as canal_numero
      from public.conversas cv
      join public.canais ca on ca.id = cv.canal_id and ca.tipo = 'whatsapp'
     where cv.organizacao_id = v_org
       and cv.arquivada_em is null
       and cv.status not in ('resolvida', 'fechada')
  ),
  recorte as (
    select * from abertas order by ultima_interacao_em desc nulls last, id limit 2000
  ),
  -- os números em que a IA está ligada e conectada agora (ia_canal_atende, de uma vez só)
  canais_ia as (
    select b.canal_id
      from public.bot_canal_config b
      join public.canais ca on ca.id = b.canal_id
     where b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
  ),
  linhas as (
    select r.*, m.direcao, m.tipo, m.msg_em,
           -- sem o carimbo de assinatura do começo ("*Ana – REVIZA:*"), espaços e quebras viram um espaço só
           left(btrim(regexp_replace(regexp_replace(m.bruto, '^\*(?:👤 [^*\n]{1,80}|[^*\n]{1,60} – [^*\n]{1,60}):\*\s*', ''), '\s+', ' ', 'g')), 140) as texto,
           coalesce(r.atendente_id, ct.responsavel_id) as quem,
           ct.nome as ct_nome, ct.telefone as ct_tel, nullif(btrim(ct.foto_url), '') as foto_url, ct.etiquetas as ct_etiquetas,
           coalesce(s.status = 'ativa' and coalesce(s.dados->>'desativado_manual', 'false') <> 'true'
                    and s.canal_id in (select canal_id from canais_ia), false) as ia_ativa
      from recorte r
      left join public.contatos ct on ct.id = r.contato_id
      left join public.ia_sessoes s on s.conversa_id = r.id
      left join lateral (
        select m.direcao::text as direcao, m.tipo::text as tipo, left(coalesce(m.conteudo, ''), 600) as bruto,
               case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.enviada_em, m.criado_em)
                    else coalesce(m.enviada_em, m.criado_em) end as msg_em
          from public.mensagens m
         where m.conversa_id = r.id
           and m.tipo not in ('sistema', 'nota_interna')
           and not (m.direcao = 'saida' and m.status = 'falhou')
         order by m.enviada_em desc, m.criado_em desc
         limit 1
      ) m on true
  ),
  final as (
    select l.*, coalesce(eq_p.id, eq_c.id) as equipe_id,
           coalesce((select array_agg(distinct btrim(e) order by btrim(e))
                       from unnest(coalesce(l.etiquetas, '{}'::text[]) || coalesce(l.ct_etiquetas, '{}'::text[])) e
                      where nullif(btrim(e), '') is not null), '{}'::text[]) as etqs
      from linhas l
      left join lateral (select e.id from public.equipes e
                          where l.quem is not null and (e.gerente_id = l.quem or l.quem = any (e.membros))
                          order by e.nome limit 1) eq_p on true
      left join lateral (select e.id from public.equipes e
                          where l.canal_id = any (e.canais)
                          order by e.nome limit 1) eq_c on true
  ),
  pessoas as (  -- as colunas de atendente: quem está ativo no Atendimento e quem tem conversa aberta agora
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'papel', coalesce(ou.papel::text, u.papel::text),
                                                 'ativo', coalesce(ou.status::text = 'ativo' and u.ativo, false))
                              order by lower(u.nome)), '[]'::jsonb) as j
      from public.usuarios u
      left join public.organizacao_usuarios ou on ou.usuario_id = u.id and ou.organizacao_id = v_org
     where (ou.status::text = 'ativo' and u.ativo)
        or u.id in (select f.quem from final f where f.quem is not null)
  )
  select jsonb_build_object(
    'conversas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'contato_id', f.contato_id,
        'contato', case when nullif(btrim(f.ct_nome), '') is null then coalesce(f.ct_tel, 'Sem nome')
                        when f.ct_nome = 'Identidade protegida' or (f.ct_nome ~ '^[0-9]{12,}$' and f.ct_tel is null)
                          then coalesce(f.ct_tel, 'Identidade protegida')
                        else btrim(f.ct_nome) end,
        'foto_url', f.foto_url,
        'ultima_msg', coalesce(f.texto, ''),
        'ultima_tipo', f.tipo,
        'ultima_direcao', f.direcao,
        'ultima_em', date_trunc('second', coalesce(f.msg_em, f.ultima_interacao_em)),
        'canal_id', f.canal_id,
        'atendente_id', f.quem,
        'equipe_id', f.equipe_id,
        'etiquetas', to_jsonb(f.etqs),
        'ia_ativa', f.ia_ativa,
        'esperando', coalesce(f.direcao = 'entrada', false),
        'nao_lidas', coalesce(f.nao_lidas, 0))
      order by coalesce(f.msg_em, f.ultima_interacao_em) desc nulls last, f.id) from final f), '[]'::jsonb),
    'total', (select count(*) from abertas),
    'limite', 2000,
    'atendentes', (select j from pessoas),
    -- os nomes vão uma vez só (nas listas), não em cada conversa: a resposta fica um terço menor a cada 30 s
    'canais', coalesce((select jsonb_agg(jsonb_build_object('id', x.canal_id, 'nome', nullif(btrim(x.canal_nome), ''), 'numero', x.canal_numero) order by x.canal_nome)
                          from (select distinct on (f.canal_id) f.canal_id, f.canal_nome, f.canal_numero from final f) x), '[]'::jsonb),
    'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by lower(e.nome)) from public.equipes e), '[]'::jsonb),
    'etiquetas', coalesce((select jsonb_agg(jsonb_build_object('nome', t.nome, 'cor', t.cor) order by t.ordem, lower(t.nome))
                             from public.etiquetas t where t.organizacao_id = v_org and t.ativo), '[]'::jsonb),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_ao_vivo(uuid) from public, anon, authenticated;
grant execute on function public.dash_ao_vivo(uuid) to authenticated, service_role;

-- DESFAZER: drop function if exists public.dash_ao_vivo(uuid);
