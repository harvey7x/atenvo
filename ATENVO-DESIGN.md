# Atenvo Obsidian — Design System v1

> **Este documento é a fonte de verdade visual da Atenvo v2.**
> Nenhuma cor, fonte, espaçamento ou efeito entra no código fora do que está definido aqui.
> Se algo necessário não estiver especificado, PARE e pergunte ao Matheus — não invente.

Direção: dark profissional "nível escritório". Sério, denso, futurista sem ser espalhafatoso.
Referências: Linear (estrutura, densidade, tipografia) + dark glass corporativo (vidro fosco sobre luz ambiente).
O que este design NÃO é: amigável, colorido, infantil, arredondado demais, cheio de emoji, gradiente decorativo ou animação chamativa.

---

## 1. Princípios (nesta ordem de prioridade)

1. **Legível antes de bonito.** Atendentes passam o dia inteiro no sistema. Contraste e conforto vêm antes de qualquer efeito.
2. **Vidro é hierarquia, não papel de parede.** Glass só em superfícies estruturais fixas. Conteúdo denso é sempre opaco.
3. **Uma cor de acento.** Todo o resto é cinza ou cor funcional (verde = ok, vermelho = problema, âmbar = atenção).
4. **Densidade calma.** Compacto, mas com respiro consistente. Nada gigante, nada apertado ao ponto de sufocar.
5. **Performance é design.** Efeito que engasga o scroll no notebook das atendentes é efeito errado.

---

## 2. Fundação — tokens

Criar `src/styles/tokens.css`, importado UMA vez na raiz do app. Todo estilo do sistema referencia estas variáveis. Proibido hex solto em componente.

```css
:root {
  /* ===== Canvas e superfícies (escada de elevação) ===== */
  --bg-canvas: #0a0b0d;        /* fundo da página */
  --surface-1: #111214;        /* painéis opacos, listas, cards de conteúdo */
  --surface-2: #17181b;        /* hover, linha selecionada, mensagem recebida */
  --surface-3: #1d1f23;        /* item ativo, pressed */
  --surface-overlay: rgba(10, 11, 13, 0.72);  /* véu atrás de modais */

  /* ===== Vidro (glass) ===== */
  --glass-bg: rgba(255, 255, 255, 0.03);
  --glass-bg-strong: rgba(255, 255, 255, 0.05);   /* modais, popovers */
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.05); /* fio de luz no topo */
  --glass-blur: 12px;
  --glass-blur-strong: 16px;

  /* ===== Texto ===== */
  --text-primary: #ececee;     /* nunca #fff puro */
  --text-secondary: #9a9ba2;
  --text-muted: #5d5e66;       /* SÓ meta/placeholder — nunca informação essencial */
  --text-disabled: #43444a;

  /* ===== Acento (decisão de marca — trocar SÓ aqui propaga pro sistema todo) ===== */
  --accent: #2f9e77;
  --accent-hover: #37b389;
  --accent-text: #3fbf8f;              /* versão clara p/ texto pequeno sobre escuro */
  --accent-tint: rgba(47, 158, 119, 0.10);
  --accent-tint-border: rgba(47, 158, 119, 0.22);
  --on-accent: #04120c;                /* texto sobre fundo accent sólido */

  /* ===== Cores funcionais (significado, não decoração) ===== */
  --success: #3fbf8f;
  --danger: #e0654f;
  --danger-tint: rgba(224, 101, 79, 0.10);
  --danger-tint-border: rgba(224, 101, 79, 0.25);
  --warning: #d9a441;
  --warning-tint: rgba(217, 164, 65, 0.10);

  /* ===== Bordas ===== */
  --border-hairline: rgba(255, 255, 255, 0.07);  /* divisores, linhas de tabela */
  --border-default: rgba(255, 255, 255, 0.10);   /* inputs, botões, cards */
  --border-strong: rgba(255, 255, 255, 0.14);    /* hover de borda */

  /* ===== Raios ===== */
  --radius-sm: 6px;    /* botões, inputs, badges */
  --radius-md: 8px;    /* dropdowns, itens */
  --radius-lg: 10px;   /* cards */
  --radius-xl: 12px;   /* modais */

  /* ===== Tipografia ===== */
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* ===== Espaçamento (escala de 4) ===== */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px;  --space-8: 40px;

  /* ===== Controles ===== */
  --control-h-sm: 28px;
  --control-h-md: 32px;   /* padrão */
  --control-h-lg: 36px;

  /* ===== Movimento ===== */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur-base: 160ms;

  /* ===== Camadas ===== */
  --z-ambient: 0; --z-content: 1; --z-sticky: 10;
  --z-dropdown: 50; --z-overlay: 90; --z-modal: 100; --z-toast: 110;
}
```

---

## 3. Luz ambiente (as "orbs")

O vidro só existe se houver luz atrás pra desfocar. Cada página recebe **no máximo 2** manchas de luz estáticas, atrás de todo o conteúdo:

```css
.ambient-orb {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: var(--z-ambient);
}
.ambient-orb--accent {
  top: -120px; right: -80px; width: 420px; height: 340px;
  background: rgba(47, 158, 119, 0.14); filter: blur(90px);
}
.ambient-orb--cool {
  bottom: -160px; left: 160px; width: 380px; height: 300px;
  background: rgba(84, 120, 214, 0.10); filter: blur(100px);
}
```

Regras: **estáticas** (sem animação), **fora** de qualquer container com scroll, nunca mais de 2 por página. Se o accent mudar de cor, a orb accent muda junto (usar a cor do token).

---

## 4. Regras do vidro

Receita de superfície glass (sempre as 3 partes juntas):

```css
.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-highlight);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--surface-1); }
}
```

**PODE ter vidro (superfícies fixas e únicas):** sidebar, topbar, cards de métrica do dashboard, modais, dropdowns/popovers, command palette (⌘K), toasts.

**PROIBIDO ter vidro:** itens de lista com scroll (conversas, contatos, linhas de tabela, cards do funil), bolhas de mensagem, qualquer elemento que se repete N vezes. Esses usam `--surface-1`/`--surface-2` opacos.

**Limite duro:** no máximo ~5 superfícies com `backdrop-filter` visíveis ao mesmo tempo numa tela. Blur é caro; ultrapassou, vira `--surface-1` opaco.

---

## 5. Tipografia

- Fonte: **Inter**, self-hosted via `@fontsource/inter` (pesos 400 e 500 apenas). Proibido Google Fonts em runtime.
- Base do app: **13px**. Escala completa:

| Uso | Tamanho | Peso | Extras |
|---|---|---|---|
| Meta, timestamps, labels de tabela | 11px | 400 | cor `--text-muted` ou `--text-secondary` |
| Texto secundário, preview | 12px | 400 | |
| Corpo padrão (mensagens, inputs, células) | 13px | 400 | |
| Subtítulo, nome em destaque | 15px | 500 | `letter-spacing: -0.01em` |
| Título de página | 18px | 500 | `letter-spacing: -0.01em` |
| Números grandes de dashboard | 22px | 500 | `letter-spacing: -0.02em` |

- **Pesos 400 e 500 somente.** Proibido 600, 700, bold.
- Todo número que muda (contadores, métricas, horários) recebe `font-variant-numeric: tabular-nums`.
- Sentence case em tudo (labels, botões, títulos). Proibido CAPS LOCK e Title Case.
- Wordmark provisório: "atenvo" minúsculo, Inter 500, `letter-spacing: -0.03em`. Logo definitivo vem depois, fora deste escopo.

---

## 6. Ícones

- Set único: **lucide-react**. Proibido misturar com qualquer outro set ou usar emoji na interface.
- `strokeWidth={1.5}` sempre (o default 2 é grosso demais pra esta estética).
- Tamanhos: 16px (navegação, inline, botões) e 18px (destaques). Nada maior em UI de trabalho.
- Ícone decorativo acompanha texto; ícone sozinho exige `aria-label`.

---

## 7. Componentes — especificações

**Botão primário** — fundo `--accent` sólido, texto `--on-accent`, altura `--control-h-md`, raio `--radius-sm`, peso 500, 13px. Hover: `--accent-hover`. **Máximo 1 por vista.** Sem gradiente, sem sombra.

**Botão secundário** — fundo transparente, borda `--border-default`, texto `--text-primary`. Hover: fundo `--surface-2`, borda `--border-strong`.

**Botão ghost** — sem borda, texto `--text-secondary`. Hover: fundo `--surface-2`, texto `--text-primary`.

**Botão destrutivo** — ghost com texto `--danger`; hover fundo `--danger-tint`. Ação irreversível SEMPRE pede confirmação em modal.

**Input / select / textarea** — altura `--control-h-md`, fundo `--surface-1`, borda `--border-default`, raio `--radius-sm`, texto 13px, placeholder `--text-muted`. Focus: borda `--accent` + `box-shadow: 0 0 0 3px var(--accent-tint)`.

**Card opaco (conteúdo)** — fundo `--surface-1`, borda `--border-hairline`, raio `--radius-lg`. É o card padrão de listas e conteúdo denso.

**Card glass (dashboard/destaque)** — receita `.glass`, raio `--radius-lg`, padding `--space-3` a `--space-4`.

**Tabela densa** — linhas de 36–40px, sem zebra; divisor `--border-hairline`; hover `--surface-2`; header 11px `--text-muted` sentence case; números alinhados à direita com tabular-nums.

**Badges / etiquetas** — 11px, raio `--radius-sm`, padding 2px 7px, receita tint: fundo `cor 10%`, borda `cor 22–25%`, texto na versão clara da cor. As etiquetas coloridas existentes são **remapeadas** pra versões dessaturadas neste padrão — nunca cor viva chapada.

**Modal** — `--glass-bg-strong` + `--glass-blur-strong`, borda `--border-default`, raio `--radius-xl`, sobre véu `--surface-overlay` com `backdrop-filter: blur(8px)`. Largura máx 480px (confirmação) / 640px (formulário).

**Sidebar** — 52–56px, só ícones, glass, borda direita `--border-hairline`. Item ativo: fundo `rgba(255,255,255,0.07)` + ícone `--text-primary`; inativos `--text-muted`. Tooltip com o nome ao passar o mouse.

**Topbar** — 48px, glass, título da página à esquerda, busca (estilo ⌘K) e avatar à direita.

**Toast** — glass, canto inferior direito, ícone funcional (sucesso/erro/atenção), some em 4s, sem emoji.

**Estados obrigatórios em todo componente interativo:** hover, focus-visible (anel accent), active, disabled (texto `--text-disabled`, sem opacity), loading (skeleton `--surface-2` com pulso sutil), empty state (ícone 18px + uma frase objetiva + botão de ação — sem ilustração, sem mascote).

**Movimento** — transições de 120–160ms `--ease-out` em hover/abrir/fechar. Zero animação decorativa. Respeitar `prefers-reduced-motion` (desliga transições não essenciais).

---

## 8. Acessibilidade (não negociável)

- Texto de corpo sobre qualquer superfície: contraste mínimo **4.5:1**. (`--text-primary` e `--text-secondary` sobre as superfícies definidas passam; conferir em novos pares.)
- `--text-muted` NUNCA carrega informação essencial (só meta, placeholder, decoração textual).
- Componentes de UI e bordas de estado: mínimo 3:1 contra o fundo.
- Foco visível por teclado em tudo que é clicável.
- Texto sobre vidro: se o fundo atrás for imprevisível, aplicar scrim (gradiente escuro sutil dentro do painel). Sobre as orbs padrão, os tokens já garantem leitura.
- Alvos de clique ≥ 32px no desktop (o futuro mobile exigirá 40px+).

---

## 9. Anti-padrões (se aparecer, é bug de design)

- Preto `#000` ou branco `#fff` puros
- `font-weight` 600+, qualquer bold pesado
- Gradiente decorativo em botão, texto ou card
- Emoji em qualquer parte da interface
- Glass em item de lista ou elemento repetido
- Glow/neon forte, sombra colorida
- Cantos "pill" em cards ou modais
- Ícones de sets misturados
- Cor de etiqueta saturada/chapada sem o tratamento tint
- Animação acima de 200ms ou que se repete sozinha
- CAPS LOCK, Title Case em labels
- Hex solto em componente (fora de tokens.css)

---

## 10. Checklist de aceitação (por tela migrada)

1. `grep` de hex no diff: zero cores fora de `tokens.css`
2. Zero emoji; ícones só lucide stroke 1.5
3. No máximo 1 botão primário visível por vista
4. Contagem de superfícies com blur ≤ 5; nenhuma em item de lista
5. Scroll fluido com 200+ itens na lista da tela (testar de verdade)
6. Estados presentes: hover, focus, loading, empty, erro
7. **Comportamento idêntico ao anterior** — nenhuma função mudou, nada sumiu
8. Layout íntegro em 1280px e 1440px; utilizável em 1024px
9. Contraste conferido em qualquer par cor/fundo novo
