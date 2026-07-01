# Convites por e-mail — configuração e operação

O código já suporta os dois modos, selecionados **só** pela secret de backend `INVITE_MODE`
(o frontend nunca escolhe o modo). Modo atual: **`manual_link`** (contingência aprovada).
Para ativar o envio automático por e-mail é preciso concluir a config abaixo **no painel do
Supabase** (não é aplicável por código a partir daqui, e não rodamos `config push` porque o
`config.toml` local tem defaults de dev que sobrescreveriam a produção).

## 1. Redirect URLs (Auth → URL Configuration)
- **Site URL**: `https://atenvo-cs4.pages.dev` (ou o domínio oficial da Atenvo quando existir).
- **Redirect URLs (allowlist)** — adicionar exatamente:
  - `https://atenvo-cs4.pages.dev/definir-senha`
  - `https://atenvo-cs4.pages.dev/definir-senha?ativar=1`
  - (recomendado, tolerante a query) `https://atenvo-cs4.pages.dev/definir-senha**`
- A Edge Function já constrói o redirect a partir da secret `SITE_URL` (nunca de headers).
  Secret `SITE_URL` = `https://atenvo-cs4.pages.dev` (já definida).

## 2. SMTP (Auth → SMTP Settings) — **ação do administrador** (credenciais nunca passam por aqui)
- host, porta, usuário, senha, TLS: preencher no painel com um provedor transacional
  (ex.: Resend/Postmark/SES/SendGrid).
- **Remetente**: `Atenvo <convites@dominio-da-atenvo>` (não usar e-mail pessoal como definitivo).
- Requer um **domínio próprio** para SPF/DKIM/DMARC (ver seção DNS).

## 3. Templates (Auth → Email Templates) — colar o HTML de `supabase/templates/`
| Template | Assunto | Arquivo | Botão |
|---|---|---|---|
| Invite user | Você foi convidado para a Atenvo | [invite.html](templates/invite.html) | Aceitar convite |
| Reset Password (Recovery) | Defina sua senha de acesso à Atenvo | [recovery.html](templates/recovery.html) | Definir senha |
| Magic Link | Confirme seu acesso à Atenvo | [magic_link.html](templates/magic_link.html) | Acessar e aceitar convite |
- Nenhum template exibe token/senha; usam apenas `{{ .ConfirmationURL }}` no botão.

## 4. TTL dos links (Auth) — dois prazos independentes
- **Token do Supabase** (validade criptográfica): config de OTP do projeto (padrão ~1h para
  recovery/magic link; ~24h para invite). É o painel que define.
- **Expiração da Atenvo** (`convites.expira_em`, 7 dias): aplicada pela RPC `convite_aceitar`
  (bloqueia expirado mesmo que o token do Auth ainda abra sessão). **Não** presumir que mudar
  `expira_em` altera a validade do token do Auth.

## 5. Ativar o modo e-mail (após 1–4 prontos)
```
npx supabase secrets set INVITE_MODE=email --project-ref afmzuoavvnpfossiiypz
```
Sem redeploy obrigatório (a função lê a env em cold start). No modo `email`:
usa só `inviteUserByEmail`, não retorna link manual, registra `envio_solicitado`
(nunca declara entrega). Existentes com senha aceitam via login/link, sem redefinir senha.

## 6. Contingência (voltar ao link manual)
```
npx supabase secrets set INVITE_MODE=manual_link --project-ref afmzuoavvnpfossiiypz
```
Admin autorizado altera a secret; a UI passa a oferecer "Copiar link" (mostrado uma vez).
Normalizado o SMTP, voltar para `email`. O frontend nunca seleciona o modo.

## 7. DNS (domínio próprio) — dependências externas
- SPF, DKIM, DMARC no domínio de envio.
- Sem domínio próprio, o envio depende do SMTP/remetente do provedor e a entregabilidade fica limitada.
