-- 99 · NOTA INTERNA COM @ NA CONVERSA (dono 25/11, a partir do sistema que a Reviza usava antes: "nota só pra equipe, use @
-- pra marcar alguém"). O atendente escreve, no próprio WhatsApp do cliente, um recado PARA A EQUIPE:
--   · a nota fica no fio da conversa (só a equipe vê) e NUNCA vai para o cliente;
--   · quem foi marcado com @ recebe um aviso (atd_notificacoes) com o link da conversa.
--
-- Como a nota é guardada: uma linha em `mensagens` com tipo = 'nota_interna' (o tipo já existe desde a 93), direcao 'saida',
-- origem 'nota', status 'enviada' e autor_id = quem escreveu. É o mesmo formato das notas automáticas que o próprio banco já
-- grava (ligação registrada, pedido do gestor). Por isso, sem mudar mais nada, a nota:
--   · não passa pelo envio (evolution-send) — só esta rotina grava; o reenvio só aceita mensagem com status 'falhou';
--   · não pausa a IA (fn_ia_sessao_mensagem), não limpa "precisa de humano" (sla_mensagem_humano) e não cancela o alerta do
--     lead quente (trg_alerta_lq_humano_cancela só olha origem 'atenvo'/'telefone') — todos já ignoram 'nota_interna';
--   · não mexe em não lidas nem na hora da última conversa (quem mexe é o envio e a mensagem do cliente, não as notas);
--   · não vira prévia na lista nem "resposta" (a lista e o tempo real do painel já pulam 'sistema'/'nota_interna');
--   · no tempo de resposta (migration 97) a nota não conta como resposta — ajustado lá no mesmo dia.
--   metadados: { mencoes: [ids], mencoes_nomes: [nomes], autor_nome } — nomes guardados para a nota continuar legível mesmo
--   se a pessoa sair da empresa depois.
--
-- Quem pode escrever: quem pode LER a conversa (a mesma regra do banco para as conversas: administrador, o gerente da equipe e
-- o atendente do cliente — atd_vejo_conversa) e é membro ativo da empresa com o sistema em dia.
-- Quem pode ser marcado: só gente ATIVA da mesma empresa (o resto é descartado em silêncio), até 20 por nota, sem o próprio autor.

create or replace function public.atd_nota_criar(p_conversa uuid, p_texto text, p_mencoes uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_cliente text;
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_autor   text;
  v_ids     uuid[];
  v_nomes   text[];
  v_id      uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if p_conversa is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;

  select cv.organizacao_id, nullif(btrim(ct.nome), '')
    into v_org, v_cliente
    from public.conversas cv left join public.contatos ct on ct.id = cv.contato_id
   where cv.id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;

  -- membro ativo com o sistema em dia (a mesma regra de quem grava mensagens) E enxerga esta conversa
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.org_operacional(v_org))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not public.atd_vejo_conversa(p_conversa) then raise exception 'sem_permissao' using errcode = '42501'; end if;

  if char_length(v_texto) = 0 then raise exception 'nota_vazia' using errcode = '22023'; end if;
  if char_length(v_texto) > 4000 then raise exception 'nota_longa' using errcode = '22023'; end if;

  select nullif(btrim(u.nome), '') into v_autor from public.usuarios u where u.id = v_uid;

  -- marcados: só pessoas ATIVAS desta empresa (vínculo ativo e cadastro ativo), sem repetir, sem o autor, no máximo 20
  select coalesce(array_agg(x.id order by x.nome), '{}'), coalesce(array_agg(x.nome order by x.nome), '{}')
    into v_ids, v_nomes
    from (select u.id, coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome
            from public.organizacao_usuarios ou
            join public.usuarios u on u.id = ou.usuario_id
           where ou.organizacao_id = v_org and ou.status = 'ativo' and coalesce(u.ativo, true)
             and ou.usuario_id = any (coalesce(p_mencoes, '{}'::uuid[]))
             and ou.usuario_id <> v_uid
           order by u.nome
           limit 20) x;

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, autor_id, enviada_em, metadados)
  values (v_org, p_conversa, 'saida', 'nota_interna', 'nota', 'enviada', v_texto, v_uid, now(),
          jsonb_build_object('mencoes', to_jsonb(v_ids), 'mencoes_nomes', to_jsonb(v_nomes), 'autor_nome', v_autor))
  returning id into v_id;

  -- um aviso para cada pessoa marcada, com o link da conversa
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  select v_org, m, 'nota_mencao',
         coalesce(v_autor, 'Alguém da equipe') || ' marcou você numa nota',
         coalesce(v_cliente || ': ', '') || left(v_texto, 240) || case when char_length(v_texto) > 240 then '…' else '' end,
         '/whatsapp?conversa=' || p_conversa, p_conversa
    from unnest(v_ids) m;

  return v_id;
end;
$$;
revoke all on function public.atd_nota_criar(uuid, text, uuid[]) from public, anon;
grant execute on function public.atd_nota_criar(uuid, text, uuid[]) to authenticated, service_role;
comment on function public.atd_nota_criar(uuid, text, uuid[]) is
  'Nota interna da equipe na conversa (nunca vai ao cliente) + aviso para cada @ marcado. Migration 99.';

-- DESFAZER: drop function if exists public.atd_nota_criar(uuid, text, uuid[]);
--   (as notas já gravadas ficam na conversa como as notas automáticas; os avisos ficam em atd_notificacoes, tipo 'nota_mencao')
