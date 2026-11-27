# Edge Function `reviza-admin` (projeto ftexrtyswpdcndbkjbtf)

Gestão de usuários que exige a service_role (criar usuário / resetar senha em auth.users).
Deployada via MCP (deploy_edge_function), verify_jwt=true.

Fluxo: valida (com o JWT do chamador) que quem chama é ADMIN ativo; só então usa a
service_role (injetada pelo Supabase como SUPABASE_SERVICE_ROLE_KEY, nunca no client)
para `auth.admin.createUser` / `auth.admin.updateUserById`. Ações: `criar`, `resetar`.
Senha temporária é gerada no servidor e devolvida UMA vez ao admin (usuário troca no 1º acesso).

index.ts abaixo é a fonte de verdade versionada.
