# Atenvo — SaaS multiempresa (React + TS + Vite + Supabase)

Plataforma de atendimento e gestão multi-tenant. O frontend reutiliza fielmente o
design aprovado dos protótipos (nenhuma alteração visual nesta fase). Esta versão
está preparada para **homologação**.

---

## Estado real (o que está pronto de verdade)

**Backend (Supabase / Postgres) — completo e testado**
- 20 migrations reproduzíveis em um Supabase **vazio** (`supabase/migrations/`).
- Multiempresa: `organizacao_id` em todas as tabelas de negócio + RLS por organização e por papel.
- Plano-base: **2 usuários, 1 WhatsApp, 1 Facebook** inclusos (R$ 249,90/mês). Preços versionados na tabela `planos` (nunca fixos no frontend).
- Limites validados **no backend** (triggers), não apenas escondendo botões. Usuário desativado não consome licença.
- Auditoria automática de ações críticas (`audit_log`, imutável).
- Fluxo de perfil: trigger `on_auth_user_created` cria o perfil em `public.usuarios` no signup.
- Provisionamento do primeiro administrador: RPC `provisionar_organizacao(nome, slug)`.

**Frontend — conectado ao Supabase**
- `OrgContext`: organização + papel reais (filtra por `usuario_id`).
- **Contatos**: CRUD real (lista/criar/editar/excluir), filtrando por `organizacao_id`.
- **Plano e uso**: lê plano/limites/uso reais. Contratação de adicionais **bloqueada** até o Asaas.

**Ainda em mock (intencional nesta fase)**
- Páginas **Kanban, Scripts, Cobranças e Configurações→Usuários** (UI pronta, dados simulados).
- Integrações externas **não implementadas**: WhatsApp, Meta/Facebook, Asaas (pagamento).

> **Modos de execução** — o modo mock **nunca é ativado automaticamente**:
> - **Produção:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` são **obrigatórias**. Sem elas, a app mostra uma tela de erro de configuração e **bloqueia o login**.
> - **Demonstração (mock):** somente quando `VITE_ENABLE_DEMO_MODE=true` e sem backend real.
> - Com o Supabase configurado, a flag de demo é ignorada (o backend real tem prioridade).

---

## Stack
React 18 · TypeScript (strict) · Vite 5 · react-router-dom 6 · @supabase/supabase-js 2 · @tanstack/react-query 5

## Scripts
```bash
npm install
npm run dev            # desenvolvimento
npm run typecheck      # tsc --noEmit
npm run build          # tsc --noEmit && vite build  (saída em dist/)
npm run preview        # serve o build

# Supabase local (requer Docker em execução)
npm run supabase:start # sobe o stack local do Supabase
npm run supabase:stop  # encerra o stack local
npm run db:reset       # recria o banco local: migrations + seed (= supabase db reset)
```
O Supabase CLI é uma **dependência de desenvolvimento** (`devDependencies`); `npm install` baixa o binário.

## Variáveis de ambiente (`.env`)
```
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon/publishable — NÃO secreta>
VITE_ENABLE_DEMO_MODE=          # true apenas para ambiente de demonstração (mock)
```
- A chave **anon/publishable** é pública (protegida por RLS). Nunca use a `service_role` no frontend.
- **Produção exige** as duas variáveis do Supabase; sem elas o login é bloqueado.
- Modo demonstração (dados simulados) só liga com `VITE_ENABLE_DEMO_MODE=true`. Veja `.env.example`.

---

## Banco de dados (Supabase CLI)

### Validação **local** (requer Docker)
`supabase db reset` recria o banco local do zero: aplica **todas as migrations** e, em
seguida, o **`supabase/seed.sql`** (dados de demonstração). Serve para validar/migrar
localmente — **não** é o fluxo de homologação remota.
```bash
npm run supabase:start     # sobe o stack local (Docker)
npm run db:reset           # = supabase db reset  (migrations + seed, banco local do zero)
```

### Homologação **remota** (sem `db reset`)
Em um ambiente remoto NÃO se usa `supabase db reset`. Conecte o projeto e aplique as
migrations com revisão prévia:
```bash
supabase link --project-ref <ref-do-projeto-de-homologacao>
supabase db push --dry-run        # 1) revise o que será aplicado, sem alterar nada
supabase db push --include-seed   # 2) aplica migrations + o seed demonstrativo
```

> **Produção (futuro):** aplique **sem** o seed demonstrativo — use `supabase db push`
> (sem `--include-seed`). O `seed.sql` é exclusivamente para demonstração/homologação e
> **não** deve popular a base de produção.

Os GRANTs do Data API são **explícitos** (migration `0020`), sem depender das
concessões automáticas do Supabase: `authenticated` recebe apenas o necessário
(sempre sob RLS), `service_role` recebe acesso total (futuras Edge Functions) e
`anon` não acessa dados. Tabelas comerciais/financeiras (`organizacao_limites`,
`assinaturas`, `faturas`, `pagamentos`) e o `audit_log` são **somente-leitura** para
o frontend; em `usuarios` o frontend só atualiza `nome`/`avatar_url` e em
`organizacoes` apenas as colunas administrativas (sem `status`/`plano`/`assinatura_*`).

### Testes de RLS
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```
São **14 testes (T1–T14)**, entre 2 organizações: isolamento, papéis
(atendente não vê cobranças), escrita cross-org bloqueada, limite de usuários no
backend, bloqueio de alteração de limites pelo frontend, provisionamento do primeiro
admin, edição apenas do próprio perfil, bloqueio de escrita em `usuarios`/`audit_log`,
CRUD de Contatos pelo Data API, leitura de organizações/plano, e bloqueio de escrita
nas tabelas comerciais e dos campos comerciais de `organizacoes`.
Roda em transação e dá `ROLLBACK` (não persiste dados).

---

## Deploy — Cloudflare Pages

| Configuração               | Valor           |
|----------------------------|-----------------|
| **Build command**          | `npm run build` |
| **Build output directory** | `dist`          |
| **Node version**           | 18+             |

Variáveis de ambiente (em *Settings -> Environment variables*):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

SPA: garanta o fallback para `index.html` (Cloudflare Pages já serve SPAs por padrão;
se necessário, adicione um `_redirects` com `/*  /index.html  200`).

---

## Passo a passo de homologação

1. **Criar um projeto Supabase novo e vazio** (este é o ambiente de homologação;
   não reutilizar o projeto de desenvolvimento, que já tem o schema antigo).
2. Conectar e aplicar as migrations + seed no remoto (sem `db reset`):
   ```bash
   supabase link --project-ref <ref>
   supabase db push --dry-run        # revisar o que será aplicado
   supabase db push --include-seed   # aplicar migrations + seed demonstrativo
   ```
3. Rodar os testes de RLS (`psql ... -f supabase/tests/rls_test.sql`) e confirmar os 14 testes (T1–T14).
4. Em *Project Settings -> API*, copiar **Project URL** e a chave **anon/publishable**.
5. No Cloudflare Pages: build `npm run build`, saída `dist`, e definir
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
6. Validar o login com um usuário de demonstração do seed
   (ex.: `henrique@demo.atenvo.local` / `atenvo123`) e checar Contatos e Plano e uso.

> **Produção (futuro):** aplicar com `supabase db push` **sem** `--include-seed` — a base
> de produção não recebe o seed demonstrativo.

> WhatsApp, Meta/Facebook e Asaas continuam fora do escopo desta fase.
