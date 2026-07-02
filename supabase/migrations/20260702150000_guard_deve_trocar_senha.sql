-- Guard de backend p/ troca de senha obrigatória: quem tem deve_trocar_senha=true deixa de ser
-- "membro ativo" para o RLS até trocar a senha. Assim, chamadas DIRETAS às APIs (PostgREST) são
-- bloqueadas mesmo que o ProtectedRoute do front seja contornado. Exceções preservadas:
--   - ler o PRÓPRIO perfil: policy usuarios_sel usa (id = auth.uid()), não is_member;
--   - trocar a senha: supabase.auth.updateUser (GoTrue, fora do RLS);
--   - logout: GoTrue;
--   - senha_trocada(): SECURITY DEFINER (não passa por is_member).
-- Usuários sem a flag: comportamento inalterado (NOT EXISTS é verdadeiro).
create or replace function public.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.organizacao_usuarios
    where organizacao_id = org and usuario_id = auth.uid() and status = 'ativo'
  )
  and not exists (
    select 1 from public.usuarios u where u.id = auth.uid() and u.deve_trocar_senha = true
  );
$function$;
