-- Reviza — régua de mensagens no MODELO DA DEMO (mensagens com blocos de
-- conteúdo, mensagens por grupo e por cliente). Semeia a sequência padrão
-- idêntica à da demo. Também libera upload/leitura no bucket wa-midia.
-- Aplicada 2026-09-10 via MCP como "reviza_13_wa_regua_msgs".

create table public.wa_regua_msgs (
  id          uuid primary key default gen_random_uuid(),
  alvo        text not null check (alvo in ('padrao','grupo','cliente')),
  nome        text not null default '',
  quando      int  not null default 0,                 -- dias vs vencimento (-3, 0, +2, +7…)
  blocos      jsonb not null default '[]'::jsonb,      -- [{tipo:'texto'|'imagem'|'video'|'audio', corpo?, nome?}]
  grupo_nome  text,                                     -- alvo=grupo
  criterio    text,                                     -- 'todos' | 'comp:<comportamento>' | 'atend:<nome>'
  cli_id      uuid references public.leads(id) on delete cascade,
  cli_nome    text,
  data_envio  date,                                     -- alvo=cliente
  ativo       boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger wa_regua_msgs_updated_at before update on public.wa_regua_msgs for each row execute function public.tg_set_updated_at();

alter table public.wa_regua_msgs enable row level security;
create policy wa_rmsg_sel on public.wa_regua_msgs for select to authenticated using (public.current_papel() is not null);
create policy wa_rmsg_ins on public.wa_regua_msgs for insert to authenticated with check (public.is_at_least('gestor'));
create policy wa_rmsg_upd on public.wa_regua_msgs for update to authenticated using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));
create policy wa_rmsg_del on public.wa_regua_msgs for delete to authenticated using (public.is_at_least('gestor'));

-- sequência padrão (mesmos textos da demo aprovada pelo dono)
insert into public.wa_regua_msgs (alvo, nome, quando, blocos) values
  ('padrao', 'Lembrete amigável', -3, '[{"tipo":"texto","corpo":"Oi {nome}! Aqui é o {atendente}. Passando pra lembrar que sua mensalidade de {valor} vence dia {vencimento}. Qualquer dúvida, é só chamar. 😊"}]'::jsonb),
  ('padrao', 'Cobrança do dia', 0, '[{"tipo":"texto","corpo":"Olá {nome}, hoje é o vencimento da sua mensalidade de {valor}. Você pode confirmar o pagamento por aqui mesmo. Obrigado!"}]'::jsonb),
  ('padrao', 'Aviso de atraso', 2, '[{"tipo":"texto","corpo":"{nome}, notamos que a mensalidade de {valor} (venc. {vencimento}) ainda consta em aberto. Conseguiu acertar? Estou à disposição."}]'::jsonb),
  ('padrao', 'Retomada', 7, '[{"tipo":"texto","corpo":"Oi {nome}, faz alguns dias da última mensalidade. Quer que eu te ajude a regularizar? Podemos combinar da melhor forma pra você."}]'::jsonb);

-- mídia da régua/conversas: operadores ativos podem subir e ler no bucket wa-midia
create policy wa_midia_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'wa-midia' and public.current_papel() is not null);
create policy wa_midia_sel on storage.objects for select to authenticated
  using (bucket_id = 'wa-midia' and public.current_papel() is not null);
