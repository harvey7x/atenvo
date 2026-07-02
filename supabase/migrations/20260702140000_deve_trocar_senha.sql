-- Troca de senha obrigatória no primeiro acesso (ex.: senha temporária definida por admin).
-- Flag por usuário (global): enquanto true, o front bloqueia o app e força /alterar-senha.
alter table public.usuarios
  add column if not exists deve_trocar_senha boolean not null default false;

-- Chamada pelo próprio usuário logado após trocar a senha (supabase.auth.updateUser).
-- Some com a flag -> libera o acesso normal. Nunca recebe/guarda o valor da senha.
create or replace function public.senha_trocada()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  update public.usuarios set deve_trocar_senha = false, atualizado_em = now() where id = auth.uid();
end
$function$;

grant execute on function public.senha_trocada() to authenticated;
