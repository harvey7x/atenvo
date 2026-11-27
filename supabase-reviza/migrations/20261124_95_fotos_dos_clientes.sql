-- 95 · Fotos REAIS dos clientes no Atendimento (dono 24/11: "quero que apareça as fotos reais dos clientes lá no Reviza").
-- A foto de perfil do WhatsApp é buscada pela função contato-foto no servidor de conexão do WhatsApp (o mesmo do QR Code),
-- baixada e guardada no depósito FECHADO contato-fotos; contatos.foto_url (que já existe, da 93) recebe o link assinado e
-- contatos.foto_sync_em a hora da busca. Quem esconde a foto (ou não tem) fica com foto_url vazio → iniciais na tela.
-- Nada aqui muda as Cobranças.

-- 1) o depósito fechado (só o servidor grava; a tela usa o link assinado guardado no contato)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contato-fotos', 'contato-fotos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 2) para quem buscar a foto: o número de WhatsApp do contato e o número NOSSO conectado que conversa com ele
--    (o da última conversa; se ele estiver desconectado, qualquer outro conectado). Com p_contato: só aquele contato,
--    vencido ou não (a função decide). Sem p_contato: a fila do agendador — só quem nunca foi buscado ou tem mais de
--    7 dias, conversas mais recentes primeiro, no máximo 30 por vez.
create or replace function public.atd_fotos_alvos(p_contato uuid default null, p_limite integer default 8)
returns table (contato_id uuid, organizacao_id uuid, numero text, instancia text, foto_url text, foto_sync_em timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ultima as (
    select distinct on (cv.contato_id)
           cv.contato_id, cv.organizacao_id, coalesce(cv.ultimo_canal_id, cv.canal_id) as canal_id,
           coalesce(cv.ultima_interacao_em, cv.atualizado_em) as quando
      from public.conversas cv
     where p_contato is null or cv.contato_id = p_contato
     order by cv.contato_id, coalesce(cv.ultima_interacao_em, cv.atualizado_em) desc nulls last
  )
  select u.contato_id, u.organizacao_id, alvo.numero, coalesce(meu.instancia_externa, outro.instancia_externa), c.foto_url, c.foto_sync_em
    from ultima u
    join public.contatos c on c.id = u.contato_id
    cross join lateral (
      select coalesce(
        (select coalesce(nullif(regexp_replace(coalesce(ci.valor_normalizado, ''), '\D', '', 'g'), ''),
                         nullif(regexp_replace(coalesce(ci.valor, ''), '\D', '', 'g'), ''))
           from public.contato_identidades ci
          where ci.contato_id = u.contato_id and ci.tipo = 'whatsapp'
          order by ci.atualizado_em desc
          limit 1),
        nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '')) as numero
    ) alvo
    left join public.canais meu
      on meu.id = u.canal_id and meu.provider = 'evolution' and meu.tipo = 'whatsapp'
     and meu.status_integracao = 'conectado' and meu.instancia_externa is not null and meu.ativo
    left join lateral (
      select q.instancia_externa
        from public.canais q
       where q.organizacao_id = u.organizacao_id and q.provider = 'evolution' and q.tipo = 'whatsapp'
         and q.status_integracao = 'conectado' and q.instancia_externa is not null and q.ativo
       order by q.conectado_em desc nulls last
       limit 1
    ) outro on true
   where alvo.numero is not null
     and length(alvo.numero) >= 10
     and coalesce(meu.instancia_externa, outro.instancia_externa) is not null
     and (p_contato is not null or c.foto_sync_em is null or c.foto_sync_em < now() - interval '7 days')
   order by u.quando desc nulls last
   limit greatest(1, least(coalesce(p_limite, 8), 30));
$$;

revoke all on function public.atd_fotos_alvos(uuid, integer) from public, anon, authenticated;
grant execute on function public.atd_fotos_alvos(uuid, integer) to service_role;
