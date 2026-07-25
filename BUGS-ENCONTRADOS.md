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
