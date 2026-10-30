-- Downloads internos da equipe (dono 30/10: "o que tiver que fazer download, tu pode colocar lá").
-- Primeiro arquivo: o pacote do Coletor INSS para Windows. Ele leva o atenvo.json com a chave da
-- ponte do coletor — por isso bucket PRIVADO: só quem é membro da organização baixa, por link
-- assinado de curta duração gerado na tela (Operação → Coletor INSS). Nada de pasta public/ do site
-- (lá qualquer um com o endereço baixaria). Caminho: <organizacao_id>/<arquivo>.
-- Upload só pelo service_role (CLI); a equipe só LÊ (createSignedUrl exige select).
insert into storage.buckets (id, name, public, file_size_limit)
  values ('downloads-internos', 'downloads-internos', false, 104857600)
  on conflict (id) do nothing;

create policy downloads_internos_sel on storage.objects for select to authenticated
  using (bucket_id = 'downloads-internos'
         and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
