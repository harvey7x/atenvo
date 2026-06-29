# Ambiente de demonstração da Atenvo

Demo **isolada** da produção: projeto Supabase próprio + projeto Cloudflare Pages próprio + dados
100% fictícios. A produção (`afmzuoavvnpfossiiypz` / `atenvo-cs4`) **não** é tocada nem acessada pela demo.

## Modo demo no código (já entregue, produção-safe)
Ativado **apenas** quando `VITE_DEMO_MODE=true` (build do site demo). Em produção a flag é falsa e nada muda.

- `src/lib/demo.ts` — flag `DEMO_MODE` + `acaoSimulada()` (mensagem "Esta ação está simulada no ambiente de demonstração.").
- Barra fixa no topo: **"DEMO — Ambiente com dados fictícios"** (`AppShell`), discreta, mantendo a marca.
- **Integrações reais bloqueadas** (fail-closed) no `invoke()` de `whatsapp.ts` e `facebook.ts`:
  - WhatsApp: `evolution-manage` (create/qr/status/disconnect/remove) e `evolution-send` → simulado.
  - Facebook: `meta-auth-start`, `meta-pages`, `meta-manage` (connect/disconnect) e `meta-send-message` → simulado.
  - Leituras de DB (`meta-manage status`, `atribuir-atendimento`) permanecem para a demo parecer funcional.
- Botão **"Restaurar dados da demonstração"** (Configurações, só admin e só em demo) → RPC `demo_reset`.

> Sem WhatsApp/Facebook reais, sem e-mail, sem envio de mensagens, sem pagamentos, sem Evolution/Meta reais,
> sem service_role no frontend. As chaves de produção não são reutilizadas.

## Login da demo (criado pelo seed)
- **email:** `demo@atenvo.com`
- **senha:** `AtenvoDemo!2026` (temporária — troque após a 1ª apresentação)
- Usuários fictícios: **Matheus** (Administrador), **Marina** (Supervisora), **Carlos** (Atendente).

## Passo a passo de bring-up (o que falta, depende de você)
1. **Supabase demo:** crie um projeto novo no painel; me envie `Project URL` + `anon key` e confirme que o
   Supabase CLI pode linká-lo (`supabase link --project-ref <ref-demo>`).
2. **Schema:** aplico todas as migrations no demo (`supabase db push` apontando ao ref demo) — mesmo schema da produção.
3. **Edge Functions:** deploy no demo **sem segredos reais** (EVOLUTION_*/META_* vazios) → qualquer chamada externa
   falha fechada; o bloqueio no cliente já cobre isso.
4. **Seed + reset:** gero e **valido contra o projeto demo** (não dá para validar antes — auth.users + identities,
   trigger de limite de plano, colunas geradas): cria usuários, chips/origens, 40–60 contatos, conversas, Kanban,
   cobranças, economia e a massa de relatórios com as diferenças pedidas; cria a RPC `demo_reset` (admin) que
   limpa **somente** as tabelas da org demo e recria a massa, registrando a data do último reset.
5. **Cloudflare Pages demo:** crie um 2º projeto Pages (ou domínio `demo.atenvo.com`) ligado a este repo, com as
   variáveis de `.env.demo.example` (VITE_DEMO_MODE=true + URL/anon do Supabase demo). Build/deploy independentes.

## Massa fictícia (resumo do seed a aplicar)
- **Chips/origens:** Chip 1 — Tráfego Matheus (trafego, gestor Matheus); Chip 2 — Tráfego Marina (trafego, gestora
  Marina); Chip 3 — Sistema URA (ura, sem gestor); Página Facebook — Central Financeira Demo.
- **Contatos:** 40–60, nomes/telefones/CPFs claramente fictícios, distribuídos por Tráfego 1/2, URA, Orgânico,
  Indicação, Facebook.
- **Conversas:** recebidas/enviadas, horários variados, abertas/resolvidas/sem resposta, atribuídas a Matheus/Marina/
  Carlos, com scripts e anexos simulados e transferências, por chip.
- **Kanban:** oportunidades nas etapas reais da organização, em andamento/ganho/perdido, responsáveis e origens
  variados, datas nos últimos 90 dias.
- **Cobranças:** contratos ativos, parcelas previstas/pagas/vencidas, finalizadas e canceladas, com eventos e
  **economia preenchida** (valor_original_descontado, novo_valor_descontado, valor_economizado, banco, serviço,
  responsável, origem).
- **Diferenças para os relatórios:** Chip 1 mais leads; Chip 2 melhor conversão; Chip 3/URA mais volume e menor
  qualificação; Marina mais fechamentos; Carlos mais conversas respondidas; Matheus maior receita; mês atual melhor
  que o anterior em alguns indicadores; inadimplência e tempo de resposta plausíveis (nada zerado).

## Isolamento da produção (garantias)
- Projeto Supabase e projeto Cloudflare **separados**, com URL/anon próprios.
- A demo só conhece a URL/anon do projeto demo (env do Pages demo) — sem credenciais de produção.
- Migrations só de schema (portáveis); **seed/`demo_reset` operam apenas no projeto demo**, nunca na produção.
