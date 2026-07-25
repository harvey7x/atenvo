# Bugs encontrados durante o redesign (NÃO corrigir junto com visual)

> Regra de ouro: cada mudança altera VISUAL ou COMPORTAMENTO, nunca os dois.
> Este arquivo é o mapa da revisão funcional que vem depois, tela a tela.

## Fase 0 (auditoria, 25/07/2026)

Nenhum bug **funcional** encontrado (a fase foi só leitura de estilos). Ficam registrados
3 problemas **latentes** que hoje já causam efeito visual errado e podem confundir a migração:

1. **Vazamento de CSS do Facebook no WhatsApp** — `Facebook.css` define `.ctag`, `.conv-tags`
   e `.doc-*` **sem** o prefixo `.fb-app` (Facebook.css:277-285+). Como todo CSS é global,
   essas regras também se aplicam à tela de WhatsApp, que tem classes com o mesmo nome.
   Hoje o efeito é sutil; num redesign vira fonte de "mudei A e quebrou B".

2. **Tokens fantasma com fallback** — `Onboarding.css`, `EmptyState.tsx` e `OrgContext.tsx`
   usam `var(--text, …)`, `var(--text-muted, #889)`, `var(--border, …)`: tokens que **não
   existem** no app atual (valem os fallbacks hardcoded). O perigo: `--text-muted` é um nome
   do design system NOVO — no momento em que o tokens.css criar esse nome, essas três telas
   mudam de aparência "sozinhas". Tratar na migração de cada uma.

3. **Colisão `.cfg-*`** — `Integracoes.css` define `.cfg-field/.cfg-form/.cfg-ta` sem prefixo,
   e `Configuracoes.css` define os mesmos nomes sob `.config-page`. Ordem de import decide
   quem ganha. Resolver quando cada tela for migrada.

## Fase 3.2 (shell, 25/07/2026)

4. **Kanban: loop de re-renderização ao abrir a tela ("Maximum update depth exceeded")**
   — encontrado durante a validação do shell novo, mas **NÃO é causado pelo redesign**.

   FATOS (medidos no navegador, dev server, org real com 269 leads na coluna de entrada):
   - Ao navegar para /kanban com a página recém-carregada (cache de dados frio), o console
     recebe um fluxo contínuo de erros "Maximum update depth exceeded" (~130–270 em 6s),
     com stack apontando para o componente `Kanban`. A tela continua funcionando e o loop
     cessa quando as queries assentam; navegações seguintes (cache quente) não geram erro.
   - Teste de isolamento por bisseção (git stash seletivo, protocolo idêntico a frio):
     o loop ocorreu com o shell novo E TAMBÉM com o código 100% anterior ao redesign
     (272 erros no controle). Ou seja: pré-existente e dependente de DADOS — começou a
     se manifestar durante a janela de testes, com qualquer versão do visual.

   SUSPEITA (não confirmada): o efeito em `src/pages/Kanban.tsx:231-233` roda a cada
   mudança de identidade de `k.leads` e sempre grava um objeto NOVO em `setOptim`
   (mesmo quando o conteúdo não mudou), o que realimenta re-render enquanto as queries
   do Kanban (leads/SLA/fichas) estiverem trocando de identidade em sequência.

   RISCO: hoje é ruído de console + trabalho desperdiçado de render na entrada da tela
   (pode virar travamento perceptível com mais leads). Investigar na migração do Kanban
   (Fase 3), fora de qualquer mudança visual.
