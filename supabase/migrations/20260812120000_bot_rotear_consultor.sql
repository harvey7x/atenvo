-- ─────────────────────────────────────────────────────────────────────────────
-- BOT — roteamento de consultor com PLACAR DO DIA (pedido do dono 2026-08-12).
--
-- A decisão de "quem atende" no fecho do fluxo de botões sai do bot-runner (que
-- usava contadores all-time) e passa a viver aqui, versionada:
--   • mulher  → preferência Matheus;
--   • homem   → Giovana/Juliana, quem tiver menos no dia (empate → Giovana, o que
--               na prática alterna as duas);
--   • incerto → menor placar do dia entre os três;
--   • TETO: se seguir a preferência deixar o preferido com MAIS DE 3 atribuições
--     acima de quem tem menos no dia, ignora a preferência e vai pra quem tem menos;
--   • TRAVA: conversa que já tem atendente humano NÃO é tocada (o bot pula o update).
-- Placar = atribuições AUTOMÁTICAS do dia (fuso America/Sao_Paulo), registradas em
-- bot_roteamentos por esta própria RPC. Consulta humana: vw_placar_roteamento_dia.
-- Os UUIDs dos três são os mesmos do mapa CONSULTORES do bot-runner; a RPC ainda
-- exige membro ATIVO da org (organizacao_usuarios.status), então desligar alguém
-- da equipe o tira do rodízio sem tocar em código.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.bot_roteamentos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id     uuid not null references public.conversas(id) on delete cascade,
  contato_id      uuid references public.contatos(id) on delete set null,
  consultor_id    uuid not null references public.usuarios(id),
  genero          text not null check (genero in ('homem','mulher','ambiguo')),
  criado_em       timestamptz not null default now()
);

create index if not exists idx_bot_roteamentos_org_dia
  on public.bot_roteamentos (organizacao_id, criado_em desc);

alter table public.bot_roteamentos enable row level security;

drop policy if exists bot_roteamentos_sel on public.bot_roteamentos;
create policy bot_roteamentos_sel on public.bot_roteamentos
  for select using (public.is_member(organizacao_id));
-- escrita só pela RPC (security definer); nenhuma policy de insert/update/delete.

create or replace function public.bot_rotear_consultor(p_conversa uuid, p_genero text)
returns table (consultor_id uuid, consultor_chave text, ja_tinha_atendente boolean)
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid; v_contato uuid; v_atendente uuid;
  v_genero text;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_escolhido uuid; v_chave text;
begin
  select cv.organizacao_id, cv.contato_id, cv.atendente_id
    into v_org, v_contato, v_atendente
    from public.conversas cv where cv.id = p_conversa;
  if v_org is null then raise exception 'conversa_invalida'; end if;
  -- mesma guarda das primitivas do bot: autenticado exige membership; service_role passa.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- TRAVA: já tem atendente humano -> não atribui e não conta no placar.
  if v_atendente is not null then
    return query select null::uuid, null::text, true; return;
  end if;

  v_genero := case when p_genero in ('homem','mulher') then p_genero else 'ambiguo' end;

  -- Elegíveis = os três consultores fixos ainda membros ATIVOS da org, cada um com
  -- o placar de HOJE (fuso SP). A escolha em um SELECT só:
  --   grupo 0 = preferido do gênero DENTRO do teto (placar - menor <= 3);
  --   grupo 1 = todo o resto, por menor placar (desempate pela ordem fixa).
  -- Homem: as duas entram como preferidas e o placar asc alterna Giovana/Juliana.
  -- Incerto: ninguém é preferido -> cai direto no menor placar do dia.
  select x.id, x.chave into v_escolhido, v_chave
  from (
    select c.id, c.chave, c.ordem, coalesce(p.cnt, 0) as placar,
           min(coalesce(p.cnt, 0)) over () as menor,
           ((v_genero = 'mulher' and c.chave = 'matheus')
             or (v_genero = 'homem' and c.chave in ('giovana','juliana'))) as preferido
    from (values
      ('a31b5fcb-d378-4490-83fe-a47a7c1ee847'::uuid, 'giovana', 1),
      ('d7e59652-d3eb-4d7d-8830-7fc780701a8e'::uuid, 'juliana', 2),
      ('4ac197b4-9600-4756-81aa-1ac29280df09'::uuid, 'matheus', 3)
    ) as c(id, chave, ordem)
    left join lateral (
      select count(*) as cnt from public.bot_roteamentos r
       where r.organizacao_id = v_org and r.consultor_id = c.id
         and (r.criado_em at time zone 'America/Sao_Paulo')::date = v_dia
    ) p on true
    where exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = v_org and ou.usuario_id = c.id and ou.status = 'ativo')
  ) x
  order by (case when x.preferido and (x.placar - x.menor) <= 3 then 0 else 1 end),
           x.placar asc, x.ordem asc
  limit 1;

  if v_escolhido is null then
    return query select null::uuid, null::text, false; return;   -- roteamento indefinido
  end if;

  insert into public.bot_roteamentos (organizacao_id, conversa_id, contato_id, consultor_id, genero)
  values (v_org, p_conversa, v_contato, v_escolhido, v_genero);

  return query select v_escolhido, v_chave, false;
end $fn$;

-- Execução: nunca por anon (padrão da auditoria 2026-07); autenticado passa pela
-- guarda de membership; o bot chama via service_role.
revoke execute on function public.bot_rotear_consultor(uuid, text) from public, anon;
grant execute on function public.bot_rotear_consultor(uuid, text) to authenticated, service_role;

-- PLACAR DO DIA visível (SQL Editor / qualquer client autenticado da org):
-- uma linha por dia × atendente × gênero; some as linhas do dia p/ o total.
create or replace view public.vw_placar_roteamento_dia
with (security_invoker = true) as
select r.organizacao_id,
       (r.criado_em at time zone 'America/Sao_Paulo')::date as dia,
       u.nome as atendente, r.genero, count(*) as atribuicoes
from public.bot_roteamentos r
join public.usuarios u on u.id = r.consultor_id
group by 1, 2, 3, 4;
