-- 86 — Números: tela visível pra todo mundo; cada um só mexe no PRÓPRIO WhatsApp (dono 06/11).
--
-- wa_canais (tabela real) continua só dono_id=você OU gestor+ (RLS wa_canais_sel INTOCADA — ali
-- mora o QR code, e ver o QR de outra pessoa deixaria QUALQUER UM sequestrar a sessão dela). O que
-- muda é uma NOVA leitura, de só colunas seguras (sem qr, sem instancia), pra qualquer autenticado
-- ativo montar o quadro "quem tá conectado" da equipe inteira — a ação de conectar/gerenciar continua
-- restrita ao dono (ou gestor) na edge function reviza-wa-instancia.
create or replace function public.wa_canais_visao_equipe()
returns table (
  id uuid, nome text, numero text, estado public.wa_estado_canal,
  dono_id uuid, ultimo_evento_em timestamptz, verificado_em timestamptz, ultimo_erro text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select c.id, c.nome, c.numero, c.estado, c.dono_id, c.ultimo_evento_em, c.verificado_em, c.ultimo_erro
      from public.wa_canais c
     order by c.created_at;
end $$;

revoke all on function public.wa_canais_visao_equipe() from public, anon;
grant execute on function public.wa_canais_visao_equipe() to authenticated, service_role;
