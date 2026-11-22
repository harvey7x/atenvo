-- 87 — Integrações: Asaas, etapa 1 (dono 22/11): conectar a conta de verdade e guardar as regras.
--
-- O QUE ENTRA: a situação da integração (lida só pelo administrador), a chave de API no COFRE do banco
-- (vault: cifrada; o navegador nunca lê) e a caixa de entrada dos avisos de pagamento do Asaas.
-- O QUE NÃO ENTRA AINDA (etapa 2): gerar a cobrança de cada parcela e dar a baixa no Financeiro.
-- Apenas aditivo: não altera nenhuma tabela, política ou função que já existe.

create table if not exists public.integracoes (
  servico        text primary key check (servico in ('asaas')),
  conectado      boolean not null default false,
  ambiente       text check (ambiente in ('producao', 'testes')),
  conta          jsonb,                       -- {nome, documento, email, chave_pix}
  chave_final    text,                        -- só os 4 últimos caracteres, para reconhecer a chave
  conectado_em   timestamptz,
  conectado_por  text,
  retorno_ativo  boolean not null default false,
  ultimo_retorno timestamptz,
  config         jsonb,                       -- as regras de pagamento (ConfigAsaas)
  updated_at     timestamptz not null default now()
);
alter table public.integracoes enable row level security;
-- só o administrador ativo lê; ninguém grava pelo navegador (quem grava é a função reviza-asaas)
drop policy if exists integracoes_sel on public.integracoes;
create policy integracoes_sel on public.integracoes for select to authenticated
  using ((select public.is_at_least('admin'::public.papel_usuario)));
revoke all on public.integracoes from anon, authenticated;
grant select on public.integracoes to authenticated;
grant all on public.integracoes to service_role;

-- caixa de entrada dos avisos do Asaas: cada aviso entra uma vez só (o Asaas pode repetir o mesmo aviso)
create table if not exists public.asaas_eventos (
  id            text primary key,             -- id do aviso no Asaas (garante "uma vez só")
  tipo          text not null,                -- PAYMENT_CONFIRMED, PAYMENT_RECEIVED…
  pagamento_id  text,
  corpo         jsonb not null,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz                   -- a etapa 2 marca aqui quando deu a baixa
);
alter table public.asaas_eventos enable row level security;   -- sem política: só a função (service_role)
revoke all on public.asaas_eventos from anon, authenticated;
grant all on public.asaas_eventos to service_role;
create index if not exists asaas_eventos_pendentes on public.asaas_eventos (recebido_em) where processado_em is null;

-- COFRE: a chave de API e o segredo do retorno ficam cifrados no vault. Estas três funções são a única
-- porta, e só a função do servidor (service_role) pode chamá-las.
create or replace function public.integracao_segredo_gravar(p_nome text, p_valor text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select s.id into v_id from vault.secrets s where s.name = p_nome;
  if v_id is null then perform vault.create_secret(p_valor, p_nome, 'Reviza CRM · integração', null);
  else perform vault.update_secret(v_id, p_valor, null, null, null);
  end if;
end $$;
create or replace function public.integracao_segredo_ler(p_nome text)
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = p_nome
$$;
create or replace function public.integracao_segredo_apagar(p_nome text)
returns void language sql security definer set search_path = '' as $$
  delete from vault.secrets s where s.name = p_nome
$$;
revoke all on function public.integracao_segredo_gravar(text, text) from public, anon, authenticated;
revoke all on function public.integracao_segredo_ler(text) from public, anon, authenticated;
revoke all on function public.integracao_segredo_apagar(text) from public, anon, authenticated;
grant execute on function public.integracao_segredo_gravar(text, text) to service_role;
grant execute on function public.integracao_segredo_ler(text) to service_role;
grant execute on function public.integracao_segredo_apagar(text) to service_role;

notify pgrst, 'reload schema';

-- DESFAZER (se precisar voltar atrás; não perde nada do que já existia):
--   drop function public.integracao_segredo_apagar(text); drop function public.integracao_segredo_ler(text);
--   drop function public.integracao_segredo_gravar(text, text);
--   drop table public.asaas_eventos; drop table public.integracoes;
--   delete from vault.secrets where name in ('asaas_chave', 'asaas_retorno_token', 'asaas_retorno_id');
