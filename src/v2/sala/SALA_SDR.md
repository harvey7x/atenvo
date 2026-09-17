# Sala SDR — visão inicial do painel (Fase 1)

Dashboard operacional isométrico: os leads aparecem como bonecos que **caminham**
entre as zonas de um escritório conforme a etapa do funil. É a nova **tela inicial**
do painel de Atendimento; o dashboard antigo (`/dashboard`) e o inbox (`/whatsapp`)
seguem intactos e acessíveis. Fase 1 é **só o desenho, com dados fictícios** — nada
de Supabase (ver "Contrato de dados").

Referência de comportamento/layout: `atenvo-sala-sdr-v7.html` (HTML puro). O **estilo
visual é o da Atenvo**, não o da demo — ver "Design system" abaixo.

## Redesenho (v2) — cena esticada + dashboard completo (blueprint multi-agente)

A pedido do dono, a segunda versão elevou muito o acabamento (síntese de 4 propostas
de design + 3 jurados; espinha "Vidro Executivo" + enxertos):

- **Layout:** a cena passou a **ocupar a largura total no topo** (`.sala-palco`,
  altura `clamp(380px, 56vh, 660px)`, com uma **command bar de vidro flutuante** —
  relógio, seletor de semanas, HUD, controles) e um **DASHBOARD completo em largura
  total embaixo** (`salaDashboard.tsx`, bento 12-col, recharts). O painel de detalhe
  virou um **DRAWER** que desliza sobre o palco (a sala segue viva atrás).
- **Ambiente muito mais detalhado** (só SVG+CSS, custo-por-frame ~zero, tudo em `#fundo`
  ou estático): **videowall** de 6 tiles na parede do fundo (números vivos via
  `renderCena`), **feixes de luz volumétrica** golden-hour + **poeira**, **piso polido**
  com reflexo, **oclusão de contato** (sombras que dão "peso de foto"), **pendentes
  frios** sobre os pods, **nameplates de metal escovado** (`ripasEscovado`), **LED de
  ocupação** por baia (`occ-<id>`), **skirting LED**, **kanban físico** na parede
  esquerda, **cachepôs**/plantas statement, **bancada de café** em mármore com LED, e o
  **bloom dourado + onda verde** que pulsa a cada assinatura (o "wow").
- **Dashboard (18 widgets)** lendo `snap.resumo` (agregado **estável**, montado sempre —
  anti-piscar): strip de 8 KPIs + placar, funil do dia, mapa das zonas, leads/hora
  (anúncio×remarketing), SLA de 1ª resposta (gauge+histograma), **leaderboard dos SDRs**
  (herói), funil do bot, conclusão/tempo/mensagens da triagem, remarketing, motivos de
  não-trabalhável (Pareto), encaminhados, arrasto de semanas (multi-série clicável) e feed.

---

## 1) Design system usado (Passo 1 — a prova de que a Sala segue o padrão da casa)

Tudo escopado em `.v2 .sala`, consumindo os tokens de `src/v2/tokens.css` + `base.css`
+ `components/componentes.css` (a mesma cascata do resto do v2):

| Token da casa | Uso na Sala |
|---|---|
| `--base #0A0B0D`, `--vidro-a/b`, `.vidro` + `::before` (fio) | fundo, cartão da cena, painel lateral, cards |
| `--txt / --txt-2 / --txt-3` | tipografia (títulos, rótulos, legendas) |
| `--fonte` (Instrument Sans Variable) | **única** família — a demo usava IBM Plex, aposentada |
| `--r-card 16px`, `--r-ctl 9px` | raios de cartão e de controle |
| `--verde / --ambar / --rubro` (+ `-rgb`) | semânticos: ganho, arrasto, alerta/sem-resposta |
| `--azul #4C8DFF` (acento da casa, skinAurora) | estado "ativo" (na mesa / aguardando SDR) |
| `.p-display`, `.caps`, `.num`, `.pg-entra`, `--ease` | display, tabular-nums, entrada de página |
| `.p-btn .btn-sec .btn-mini` | botões dos controles |
| tema dual + `[data-perf="lite"]` + `prefers-reduced-motion` | respeitados (ver Qualidade) |

### Pele operacional (a única cor "nova", e é encoding, não marca)
A Sala precisa distinguir **6 situações** do funil ao mesmo tempo — isso é *data
encoding*, não decoração. O contrato do v2 permite cor como semântica; reaproveitei
os 3 semânticos da casa e adicionei o mínimo, **escopado em `.v2 .sala`** e documentado:

- `--sala-triagem` (violeta) — triagem/bot/remarketing. É a 6ª categoria; o v2 não tem
  roxo, então é o único tom introduzido. No tema claro escurece p/ manter contraste.
- `--sala-ativo` = `var(--azul)` — na mesa / aguardando SDR (o azul acento da casa).
- `--sala-espera` = `var(--txt-2)` — neutro (aguardando cliente / não-trabalhável).
- `--sala-rubro` = `var(--rubro)`, `--sala-ok` = `var(--verde)` — semânticos da casa.
- `--sdr-gi/ju/ma` — cor de identidade dos 3 SDRs (crachá + anel). Paleta de *pessoas*.

A **cena isométrica** (piso, paredes, móveis) é ilustração: materiais neutros escuros,
retunados pra assentar no `--base`. O canvas da cena fica **escuro nos dois temas** de
propósito — é um palco/tela, como um vídeo. Todo o **cromo** (painéis, cards, HUD, feed,
tipografia, botões) segue os tokens da casa e vira junto no tema claro.

---

## 2) Arquitetura

A cena é um SVG com centenas de nós animados a 60fps — **React não reconcilia por
quadro** (e o próprio brief exige "só reordenar profundidade quando muda"). Então:

- **Motor imperativo, agnóstico de framework** (`sala/*.ts`): dono do `<svg>`, roda o
  loop `requestAnimationFrame` (cena + tick), guarda o estado e o publica por
  `assinar()` + `snapshot()`.
- **React só o cromo e os painéis** (`pages/SalaSdr.tsx`): lê o motor com
  `useSyncExternalStore`. O snapshot muda **a cada tick (1×/s) ou comando**, não por
  quadro — o painel re-renderiza ~1×/s, a cena voa a 60fps.

### Arquivos (`src/v2/sala/`)
- `tipos.ts` — **Contrato de dados** (`LeadView`, `AtendenteView`, `SalaState`,
  `EtapaLead`). É a ponte Fase 1 ↔ Fase 2.
- `config.ts` — **CONFIG**: todos os limites de tempo (remarketing 15 min, 3 tentativas,
  3 documentos, alerta 10 min…) num só objeto comentado. `ATENDENTES`/`BOT` são
  **placeholders** no topo (Fase 2: atendentes reais da org).
- `iso.ts` — projeção isométrica 2:1 + primitivas de móvel (box, monitor, planta…).
- `boneco.ts` — gerador de bonecos (variação de idade/óculos/barba/saia/bengala) + bot.
- `cena.ts` — as **10 zonas**, o corredor, o mobiliário e a camada ordenada por
  profundidade (`x+y`).
- `motor.ts` — a simulação (tick, rotas, virada de semana), a câmera, a seleção, o
  loop e a montagem do snapshot que o React lê.
- `pages/SalaSdr.tsx` + `pages/salaSdr.css` — a página (palco + command bar + drawer) e o estilo.
- `pages/salaDashboard.tsx` + `pages/salaDashboard.css` — o dashboard bento (recharts), lazy, abaixo do palco.

---

## 3) O que a Sala faz (paridade com a demo)

- **Cena** isométrica ~22×16, câmera com zoom ao clicar num boneco/mesa (Esc / clique no
  chão volta), ordenação por profundidade, 3 SDRs + bot Matheo, bonecos que **caminham**
  entre as zonas com passos/digitação/ligação.
- **10 zonas**: recepção (fila+balcão), aguardando atendente, mesa do SDR, aguardando
  cliente, sem resposta, remarketing, documentação, assinatura, não-trabalhável (com
  motivo) e saída.
- **Painéis** (card da casa) ao clicar: **cliente** (ficha, prévia da conversa em bolhas,
  histórico, "Abrir conversa"/"Transferir" demonstrativos), **SDR** (abas Agora/Conversas/
  Atividade + KPIs) e **bot** (triados, % conclusão, onde os leads param, remarketing).
- **HUD** por zona, **TV** na parede (números do dia + leads/hora), **feed** de eventos.
- **Seletor de semanas + recuperação**: semana atual viva; anteriores **congeladas**
  (foto). Aberto vive só na semana atual; fechado vive só na semana em que fechou. Arrasto
  ("2ª/3ª semana") + "Virar semana". A recuperação **nunca esvazia sozinha**.

> **Correção sobre a demo:** na demo, o histórico das semanas passadas sumia ~33 min de
> simulação depois (a limpeza retirava qualquer fechado 45 min após `fimEm`, e o seed é
> carimbado às 9:00). Aqui a limpeza só retira conclusões **da semana corrente** que já
> descansaram; o histórico de semanas anteriores **nunca** é removido — é o que mantém o
> seletor navegável, como o brief exige.

---

## 4) Contrato de dados (Fase 1 ↔ Fase 2) — **não implementar a Fase 2 agora**

A cena consome `SalaState` (`tipos.ts`). Hoje quem produz é o mock (`motor.ts`); o motor
já expõe `estadoSala()` projetando o estado interno em `LeadView[]` para provar o formato.
Na **Fase 2**, um produtor lendo o Supabase real (conversas, `atendente_id`, estado do
bot/triagem, alertas de lead quente, cadência de remarketing) emite o **mesmo** `SalaState`
e a cena não percebe a diferença. A régua de "semana" e de "sem resposta há N min" passa a
vir das datas reais (entrada / última interação). Nada é apagado — muda só o recorte exibido.

O `orgId` já entra por contexto (`useOrg`) no `SalaSdr.tsx`, para a Fase 2 encaixar sem
refatorar (multi-tenant: a Sala mostra os dados da org logada).

---

## 5) Como rodar

```bash
cd ~/Desktop/atenvo-sala-sdr          # worktree da branch feat/sala-sdr
npm install                            # (ou reuse o node_modules do repo)
VITE_ENABLE_DEMO_MODE=true npm run dev # modo demo: sem backend real
# abrir http://localhost:5173/sala  (login demo aceita qualquer e-mail + senha 6+)
```

A Sala é a **rota inicial** (`/`, `/sala`). O dashboard antigo fica em `/dashboard`.

---

## 6) Qualidade
- Responsivo: desktop = cena + painel lado a lado; ≤1100px empilha.
- Acessibilidade: bonecos/mesas focáveis por teclado (Enter/Espaço abrem; Esc volta),
  foco visível, `prefers-reduced-motion` desliga passos/digitação e o zoom vira instantâneo.
- Performance: 60fps; DOM/SVG só é reordenado quando a profundidade muda. Respeita o
  Modo de Performance (`[data-perf="lite"]`). **Sem** `localStorage`/`sessionStorage`.
- Sem erros de console.

## 7) Decisões / dúvidas em aberto (para o dono)
- **Entrypoint:** a Sala virou a visão inicial (index → `/sala`) e a home do módulo
  Atendimento. Reverter é uma linha (App.tsx + AppShellV2 MODULOS). Confirmar se é isso
  mesmo, ou se prefere manter `/whatsapp` como home e a Sala só no menu.
- **Nomes dos SDRs** (Giovana/Juliana/Mateus) e do bot (Matheo) são placeholders — Fase 2
  puxa os atendentes reais.
- Nada foi deployado. Branch `feat/sala-sdr`, worktree isolado, `node_modules` linkado.
