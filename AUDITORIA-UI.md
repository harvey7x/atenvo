# Auditoria de UI — Fase 0 do redesign (Atenvo Obsidian)

> Gerada em 25/07/2026, somente leitura — nenhuma linha de código foi alterada.
> Base: HEAD `fbe33ba` + `ATENVO-DESIGN.md` (lido por inteiro).
> Legenda: **FATO** = medido no código, com arquivo:linha. **AVALIAÇÃO** = minha opinião, marcada como tal.

---

## 1. Telas e rotas existentes

Rotas reais em `src/App.tsx` (todas carregadas de uma vez — **não há lazy loading**, então todo CSS de toda página fica ativo em todas as telas o tempo todo):

| Rota | Título | Arquivo da página | CSS |
|---|---|---|---|
| `/login` | Login | `src/pages/Login.tsx` | `Login.css` (127 l.) |
| `/redefinir-senha`, `/definir-senha`, `/alterar-senha` | Auth | `RedefinirSenha.tsx`, `DefinirSenha.tsx`, `AlterarSenha.tsx` | usam Login.css/global |
| `/whatsapp` *(rota inicial — o index redireciona pra cá)* | WhatsApp | `WhatsApp.tsx` (~1.900 l.) | `WhatsApp.css` (**901 l.**) |
| `/facebook` | Facebook | `Facebook.tsx` | `Facebook.css` (291 l.) |
| `/kanban` | Kanban | `Kanban.tsx` | `Kanban.css` (471 l.) |
| `/agendamentos` | Agendamentos de Mensagens | `AgendamentosMensagens.tsx` | `AgendamentosMensagens.css` (221 l.) |
| `/relacionamento` | Relacionamento | `Relacionamento.tsx` | `Relacionamento.css` (143 l.) |
| `/scripts` | Scripts | `Scripts.tsx` | `Scripts.css` (306 l.) |
| `/cobrancas` | Cobranças | `Cobrancas.tsx` (+ `CobrancasApp.tsx`) | `Cobrancas.css` (298 l.) |
| `/integracoes` | Integrações | `Integracoes.tsx` (+ `IntegracaoCloudApi.tsx`) | `Integracoes.css` (448 l.) |
| `/relatorios` | Relatórios | `Relatorios.tsx` | `Relatorios.css` (308 l.) |
| `/configuracoes` | Configurações | `Configuracoes.tsx` | `Configuracoes.css` (303 l.) |
| `/maturacao` *(só admin)* | Maturação de Números | `Maturacao.tsx` | `Maturacao.css` (227 l.) |
| `/plano-uso` *(só admin)* | Plano e uso | `PlanoUso.tsx` | estilos no global/inline |
| `*` | 404 | `NotFound.tsx` | — |

Existem ainda, fora das rotas: `Onboarding.tsx` (+CSS), `Agendamentos.tsx` (página antiga, **preservada de propósito** — comentário em App.tsx:12-13, não roteada), `ConfigError.tsx`.

Shell: `AppShell.tsx` + `Sidebar.tsx` + `Topbar.tsx` (estilos no `global.css:44-137`).

### ⚠️ FATO importante: a lista da FASE 3 não bate 1:1 com as rotas
O plano fala em telas que **não existem** com esses nomes:
- **"Dashboard / visão geral"** — não existe; o index redireciona para `/whatsapp`. (A memória do projeto registra Dashboard como funcionalidade desejada e **não construída**.)
- **"Contatos"** — a aba foi **removida** em 24/07 a seu pedido ("não faz sentido, já temos o Kanban").
- **"Atendimento"** — presumo (SUPOSIÇÃO) que seja WhatsApp + Facebook.
- **"Funil"** = Kanban; **"Disparos/remarketing"** = presumo Relacionamento + Agendamentos.
- E ficam **fora da lista**: Scripts, Cobranças, Relatórios, Maturação, Plano e uso.
➡️ **Pergunta ao final desta auditoria** (não vou inventar o mapeamento).

---

## 2. Onde vivem os estilos + cores hardcoded

**Arquitetura (FATO):** CSS puro, 23 arquivos, **5.040 linhas**. Sem Tailwind, sem styled-components, sem CSS Modules, sem biblioteca de UI (package.json só tem react, react-dom, react-router, supabase-js, react-query). Cada página importa seu `.css`; o Vite junta tudo num bundle global.

**Tema (FATO):** o app hoje é **light-first com dark opcional**. `global.css:5-21` define os tokens em valores claros; `[data-theme="dark"]` (linhas 22-34) sobrescreve. O toggle vive em `src/hooks/useTheme.tsx` (localStorage `atenvo-theme`, default **light**), com switch na Sidebar. O alvo do redesign é dark-only — ou seja, não é "ajustar o dark existente", é **inverter a base**.

**FATO estrutural crítico:** os tokens **não moram só no global.css**. Oito páginas re-declaram a paleta inteira dentro do próprio escopo, com bloco dark próprio: `WhatsApp.css:6-28`, `Kanban.css:4-28`, `Integracoes.css:4-29`, `Relatorios.css:4-29`, `Cobrancas.css:4-23`, `Scripts.css:4-23` (tem até um `--gold` próprio), `Facebook.css:7-23` (**redefine `--green` como AZUL**), `Login.css:7-16` (família `--auth-*`). Um `tokens.css` novo será silenciosamente ignorado nessas telas até cada bloco desses ser removido.

**Cores hardcoded (FATO, medido):**
- **903** ocorrências de hex em `src/` + **320** de `rgba()` → ~925 fora de `var()` nos CSS de páginas/componentes.
- **3.272** usos de `var(--…)` — ou seja, o app já é *bastante* tokenizado; o problema é que são os tokens **antigos**, duplicados por página.

Top de hex por arquivo:

| Arquivo | Hex |
|---|---|
| WhatsApp.css | 67 |
| Kanban.css | 57 |
| global.css | 44 |
| Scripts.css | 33 |
| Facebook.css | 31 |
| Configuracoes.css | 28 |
| Integracoes.css | 26 |
| Relatorios.css | 23 |
| Cobrancas.css | 21 |
| Login.css | 20 |
| AgendarMensagemModal.css | 19 |
| Onboarding.css | 13 |
| (+ hex em TSX: Facebook 10, Integracoes 8, PlanoUso 7, Login 6, ConfigError 6, avatar.ts 6, WhatsAppConnect 6…) | |

**Outras violações do documento já medidas (FATO):**
- `font-weight` 600/700/800/bold: **356 ocorrências** em ~20 arquivos (o doc permite só 400/500 — isso muda métrica de texto em quase toda tela).
- Fonte hoje vem do **Google Fonts em runtime** (`index.html:8-10`), incluindo o peso **600** — o doc proíbe (exige `@fontsource/inter` self-hosted, 400/500).
- Estilos inline `style={{}}`: **352 ocorrências** (Facebook.tsx 52, WhatsApp.tsx 31, Integracoes.tsx 29…), parte com cor dinâmica vinda do banco (ver riscos).
- `backdrop-filter` hoje: **1 ocorrência** no app inteiro (`WhatsApp.css:462`). Glass é capacidade **nova**, não ajuste.
- Z-index sem escala: 24 valores distintos em uso (1…1000); modais em 1000, toasts ora 200 ora 300, dropdowns 59-60.
- Breakpoints: ~20 valores distintos de `@media max-width` (860px é o único semi-padrão).
- `prefers-reduced-motion`: existe em só **2** pontos.

**CSS morto relevante (FATO, amostra):** `.pcard-*` e `.prio-*` (global.css:438-468), `.conv-sla*`, `.stub*`, `.barlist*`, `.wiz-*`, `.flux-table`, blocos de shell copiados por página que hardcodam `width:234px` da sidebar antiga (Cobrancas.css:40-73, Kanban.css:40 — hoje inertes). Componentes nunca importados: `GlobalSlaAlert.tsx`, `SlaConversaBanner.tsx`.

---

## 3. Componentes reutilizados × duplicados

**Núcleos reais de reuso hoje (FATO):**
- **`Modal.tsx`** (foco, Esc, clique-fora) — importado por **18 arquivos**. `ConfirmDialog.tsx` o reutiliza. É a melhor âncora existente para a migração.
- **`useToast`** (`src/hooks/useToast.tsx`) — 26 consumidores, autodismiss 2.6s.

**Botões (FATO): 4 sistemas nomeados + ~25 classes locais.**
- `.btn/.btn-primary/.btn-ghost/.btn-sm` (global.css:154-164);
- `.atv-btn` do Modal (Modal.css:30-40, usado em 16 arquivos);
- `.agm2-btn` (só Agendamentos de Mensagens);
- `.ch-resp-btn` (só WhatsApp — e redefinido 3× dentro do próprio arquivo).
- Além disso: `.icon-btn` tem **8 cópias** re-escopadas por página; `.btn-ghost` tem 6; e cada página tem sua família própria (`.rec-btn`, `.fjb-btn`, `.kcb-btn`, `.filter-btn`, `.send-btn`…).
- Inconsistência exemplar: `.btn-primary` usa texto `#04130c` e `.atv-btn.primary` usa `#fff` — dois "primários" divergentes hoje.

**Inputs (FATO): nenhum componente React compartilhado.** Três famílias de classes (`.ctrl` global 44px — com cópias divergentes de 42px e 40px em 3 páginas; `.atv-input/select/textarea` do Modal; e inputs próprios por página: `.input` do Login, `.onb-input`, `.agm2-sel`, `.agn-fld`, `.agmod-fld`, `.msg-input`…).

**Modais/overlays (FATO):** 1 central + 2 overlays reinventados (`WhatsAppConnect` e drawer de Integrações) + 4 drawers com backdrop copiado (Scripts, Kanban, WhatsApp, Facebook).

**Toasts (FATO):** 2 implementações (useToast global + `SlaNotificationToast` com pilha própria) + 3 cópias mortas de CSS de toast por página.

**EmptyState/Skeleton (FATO):** `EmptyState.tsx` existe mas é estilizado **inline com hex solto** e usado só em 3 páginas; **14 outras páginas inventaram o próprio vazio**. Skeleton compartilhado não existe — há 2 implementações locais (AgendamentosMensagens e WhatsApp).

**Tabelas (FATO):** 4 famílias (`.contracts-table`, `.team-table`, `.rel-tbl`, `.rep-table`), nenhuma compartilhada. Kanban e Agendamentos não usam `<table>`.

**AVALIAÇÃO:** o padrão dominante de duplicação não é "componentes concorrentes" — é **CSS copiado e re-escopado por página**, resíduo de protótipos standalone. `Facebook.css` é um fork divergente de `WhatsApp.css` (mesmas classes, valores diferentes). A Fase 2 (biblioteca `ui/`) ataca exatamente a causa raiz.

---

## 4. Emojis, ícones e sets em uso

**Ícones (FATO): 3 sistemas coexistem, nenhum no padrão alvo.**
1. `src/components/icons.tsx` — set compartilhado com 25 nomes, strokeWidth **1.9**, usado por só 6 arquivos (Sidebar etc.);
2. **153 componentes `Ic*` inline** espalhados por 15 arquivos (83 nomes distintos → ~70 são **redefinições do mesmo ícone**: `IcSearch`/`IcPlus`/`IcCheck` existem em 7 arquivos cada);
3. Glifos Unicode usados como ícone: ✓/✓✓ (ticks), ✕, ▶, ❚❚, ↻, ↑/↓, ›.
- strokeWidth em uso: 2 (147×), 1.9 (13×), 2.2 (10×), 1.8 (10×), 2.4 (6×), 2.6 (2×)… — **o 1.5 exigido pelo doc tem zero ocorrências hoje**.
- `lucide-react` **não está instalado**.

**Emojis na interface (FATO, os que o usuário vê):**
- `WhatsApp.tsx:1070-1072` 📌 🔕 🗄️ (flags do card), `:1085` ⚠ (chip de alertas), `:101` 🕗 (tick pendente)
- `Facebook.tsx:61` 🕗
- `Kanban.tsx:544` ⭐ (prioridade alta)
- `Agendamentos.tsx:553` ⚠
- `Relacionamento.tsx:359/363/395/396` 🎙️ 📄 (chips e preview de mídia)
- `SlaNotificationToast.tsx:70` 🔔; `SlaAlertList.tsx:94` 🎉
- Vindos de **dados**: `src/data/slaView.ts:55-61` mapeia tipo de SLA → ⚠️ 🟡 🚨 🎧 (tem teste que trava isso — trocar exige mexer no teste também).

**Imagens (FATO):** zero ilustrações/PNG; todos os `<img>` são conteúdo dinâmico (mídia de mensagens, QR codes). Logo é SVG inline (`Logo.tsx`), com cores hardcoded do verde antigo.

---

## 5. Os 5 maiores riscos deste redesign (AVALIAÇÃO honesta)

**R1 — Não é um design system: são oito.** O trabalho real não é criar `tokens.css` — é desmontar as 8 paletas re-declaradas por página que vão **sobrescrever silenciosamente** os tokens novos (com pegadinhas como `--green` = azul no Facebook.css e `--surface-2` existindo nos dois mundos com valores diferentes). Até a última página migrar, o app fica "meio-obsidian" — é o efeito "quebrado/misturado" que o plano já prevê, mas ele dura a Fase 3 inteira, não só a Fase 1.

**R2 — Sessão paralela no mesmo repositório.** Há outra sessão ativa commitando neste repo (Relacionamento e Maturação nasceram dela nas últimas 48h; já houve **2 colisões de migration num dia**). Um redesign toca 23 CSS + dezenas de TSX — é o pior candidato possível a conflito. **Mitigação que proponho:** branch dedicada + migrar tela a tela com commits pequenos + combinar com a outra frente quem toca o quê. Sem isso, risco de retrabalho é quase certo.

**R3 — Cores dinâmicas vêm do banco e não são tokenizáveis.** Etiquetas (`etiquetas.cor`), colunas do funil (`funil_colunas.cor`), status de conversa e avatares (`src/lib/avatar.ts`) entram por `style={{}}` com hex salvo no banco, e o tint é derivado por concatenação de string (`cor+'22'`) em ≥8 pontos. O doc manda "remapear para tints dessaturados" — isso exige uma **função central de resolução de cor** (runtime) ou migração dos valores no banco. É uma decisão de produto que o documento não fecha (pergunto abaixo).

**R4 — Light→dark-only com pontos cegos.** 8 arquivos CSS têm **zero** bloco dark (Maturacao, AgendamentosMensagens, Modal, FichaJudicialModal, AudioMessage/Recorder, MediaComposer, Onboarding) — hoje funcionam "por sorte" sobre fundo claro. Há ainda um 3º sistema fantasma (`Onboarding.css`/`EmptyState.tsx`/`OrgContext.tsx` usam `var(--text-muted, #889)` — token que **não existe hoje mas é exatamente um nome do doc novo**: no estado intermediário, criá-lo muda telas que ninguém tocou). E os previews de chat imitam o WhatsApp claro (`#e7ded4`, `#d9fdd3`) — precisam de decisão: manter cara de WhatsApp ou obedecer o obsidian?

**R5 — Performance e tipografia na tela mais sensível.** Glass/blur é capacidade nova (1 uso hoje → ~5 superfícies alvo) sobre um app cuja tela principal lista ~370 conversas e acabou de passar por otimização de payload; blur mal posicionado repinta caro em notebook fraco. E a troca de peso 600/700→500 (356 ocorrências) muda a largura de praticamente todo texto — truncamentos e quebras vão se mover em todas as telas; o checklist item 8 (1280/1440/1024) precisa ser levado a sério tela a tela, não no final.

---

## Perguntas abertas (preciso de resposta antes da Fase 3; Fases 1-2 não dependem delas)

1. **Mapa das telas da Fase 3** (não vou inventar): "Dashboard" não existe — criar uma visão geral nova faz parte deste redesign ou sai da lista? "Contatos" foi removida — sai da lista? "Atendimento" = WhatsApp + Facebook? "Disparos" = Relacionamento + Agendamentos? E onde entram Scripts, Cobranças, Relatórios, Maturação e Plano e uso?
2. **Cores do banco (R3):** transformo em runtime (função única que dessatura qualquer hex salvo — reversível, sem tocar dados) ou migramos os valores no banco? Minha sugestão: runtime.
3. **Previews de chat:** as bolhas de conversa (WhatsApp/Facebook) e os previews de template seguem o obsidian ou mantêm a cara "WhatsApp" (fundo bege, bolha verde)? O doc não cobre esse caso.
4. **Acento:** o doc define `#2f9e77`; o app hoje usa `#19C37D`. Confirmo que na Fase 1 o verde **muda** para o novo em tudo que já usa token?
5. **Sessão paralela (R2):** posso trabalhar em branch `redesign-obsidian` e você coordena com a outra frente, certo?
