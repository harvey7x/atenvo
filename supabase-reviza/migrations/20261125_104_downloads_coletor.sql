-- 104 · Download do COLETOR INSS no Reviza (dono 25/11: "aqui no coletor tu pode colocar o arquivo real").
-- A tela Atendimento › Ferramentas › Coletor INSS gera um link assinado (2 min) de <org>/coletor-inss-windows.zip no depósito
-- FECHADO downloads-internos; o guia de instalação em PDF fica no mesmo lugar (<org>/guia-coletor-inss.pdf).
-- Quem lê: só quem é membro ativo da empresa da pasta (a 1ª pasta do caminho é o id da empresa). Ninguém grava pela tela:
-- os arquivos são colocados pelo servidor (chave de serviço). Nada mais muda.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('downloads-internos', 'downloads-internos', false, 62914560, array['application/zip', 'application/x-zip-compressed', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "downloads internos: a equipe baixa os da própria empresa" on storage.objects;
create policy "downloads internos: a equipe baixa os da própria empresa" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'downloads-internos'
    and exists (
      select 1 from public.organizacao_usuarios ou
       where ou.usuario_id = auth.uid() and ou.status = 'ativo'
         and ou.organizacao_id::text = (storage.foldername(name))[1]
    )
  );
