# Auditoria de Design — Atenvo
### Diagnóstico, benchmark e plano de evolução visual
*27 de julho de 2026 · acompanha o mockup `atenvo-direcao-visual-mockup.html`*

---

## 0. Leitura estratégica (por que isso vale dinheiro)

Antes do design, o negócio. O Atenvo tem duas vidas: hoje ele é a ferramenta interna da CAF; amanhã ele é um SaaS multi-tenant vendido para outros escritórios de assessoria. Nessas duas vidas, o visual cumpre funções diferentes — e as duas pagam:

1. **Na operação (hoje):** um painel confuso custa segundos por interação, multiplicado por atendente, por dia. Hierarquia ruim gera erro operacional — cobrança esquecida, conversa sem resposta, lead frio. Design aqui é eficiência, não estética.
2. **Na venda (amanhã):** ninguém compra software B2B caro que *parece* barato. Na demo, o comprador não consegue avaliar teu banco de dados nem tuas edge functions — ele avalia o que vê. Visual genérico ancora o preço para baixo antes de tu abrir a boca. Visual premium é a única prova de qualidade que o prospect consegue verificar sozinho em 30 segundos. Num produto financeiro, isso dobra de peso: **desleixo visual lê como risco**, e risco mata venda de assessoria.

O objetivo do redesign não é "ficar bonito". É fazer o painel **parecer tão sério quanto a operação que ele carrega** — e sustentar o posicionamento de preço que tu vai querer cobrar.

**Uma ressalva de sequenciamento, dita com a honestidade que tu pediu:** a operação está sem WhatsApp desde 23/07 e o caminho crítico continua sendo o parceiro do Meta + ativação do 1390. Redesign é o item certo para *depois* que lead estiver entrando. Este relatório existe para tu ter o plano pronto e não improvisar quando chegar a hora — não para furar a fila do que fatura.

---

## 1. Diagnóstico do Atenvo atual

Separando, como sempre, fato de suposição.

**Fatos confirmados (do histórico do projeto):**
- Stack: React 18 + TypeScript + Vite no front (Cloudflare Pages), Supabase no back.
- O painel foi construído dirigindo IA (Claude Code), em ritmo de operação — decisões visuais foram tomadas tela a tela, sob pressão, sem um sistema definido antes.
- Existe uma branch de redesign parada, não deployada, e uma "reformulação v2" anotada como dívida.
- O produto tem ~12 áreas (Login, Dashboard, WhatsApp, Kanban, Contatos, Agendamentos, Relacionamento, Cobranças, Integrações, Relatórios, Configurações, Planos) — muita superfície para manter consistente sem sistema.
- Tua própria percepção como dono: "funcional, mas genérico; não parece premium nem memorável". Percepção de dono costuma chegar antes da métrica.

**Suposições de alta probabilidade (verificar na Fase 0, roteiro na seção 10):**
Estas são as causas que produzem exatamente o sintoma que tu descreveu em painéis construídos assim. Cada uma é verificável em minutos com o Claude Code:

1. **Defaults aceitos.** Tailwind/shadcn com tokens de fábrica: os mesmos cinzas, o mesmo azul/índigo, o mesmo radius, a mesma sombra `shadow-sm` de todo app feito com IA em 2025-2026. É o motivo nº 1 de "parece template": não é que o design seja ruim — é que ele é **idêntico ao de milhares de outros produtos**. A identidade colapsa para a do kit.
2. **Ausência de escala.** Espaçamentos ad hoc (`p-3` aqui, `p-4` ali, `p-6` acolá), tamanhos de fonte variados por tela, radius diferentes entre botão, card e modal. O olho não sabe dizer *o que* está errado, mas registra desalinhamento como amadorismo.
3. **Hierarquia tipográfica achatada.** Título de página, título de card e corpo com pesos e tamanhos próximos demais. Tudo grita igual = nada se destaca.
4. **Cor primária superusada.** Azul em botão, link, ícone, badge, gráfico e destaque ao mesmo tempo. Quando a cor de ação está em todo lugar, ela deixa de significar "aja aqui".
5. **Cards uniformes sem propósito.** Tudo virou card do mesmo peso — métrica, lista, formulário, aviso. Card genérico é o sintoma clássico de dashboard de template.
6. **Tabelas pesadas ou cruas.** Bordas em grade completa, densidade inconsistente entre telas, números sem alinhamento à direita nem algarismos tabulares — num produto que lida com **dinheiro**, isso corrói confiança.
7. **Estados não desenhados.** Vazio = tela branca ou "Nenhum registro"; carregando = spinner solto; erro = texto cru. Estados são metade da experiência real e quase nunca recebem design em painéis feitos às pressas.
8. **Ícones e densidades misturados.** Tamanhos de ícone variando, telas densas (WhatsApp, Kanban) e telas soltas (Configurações) sem transição de linguagem.
9. **Login herdado.** Primeira tela que qualquer prospect vê, provavelmente a menos trabalhada.

**Onde a percepção de qualidade mais sofre (ordem de dano):**
1. **Login** — primeira impressão; define a âncora mental de "produto sério" ou "sistema improvisado" antes de qualquer feature.
2. **Dashboard** — a tela-vitrine da demo e a primeira do dia do atendente.
3. **WhatsApp** — onde o time vive; qualquer aspereza aqui é sentida centenas de vezes por dia.
4. **Tabelas (Cobranças, Contatos)** — onde mora o dinheiro; é onde "genérico" vira "não confio".

**O que provavelmente já está bom:** a arquitetura de informação (as 12 áreas fazem sentido para o domínio), o fluxo operacional (construído em cima de operação real, não de wireframe), e a decisão de ser um painel denso e utilitário — isso não deve mudar. O problema do Atenvo não é *o que* ele mostra; é *como* ele veste o que mostra.

**Risco a nomear:** redesign sem sistema repete o ciclo. Se a Fase 1 (tokens) for pulada e o trabalho começar "embelezando telas", em 6 meses o painel volta a divergir — só que com mais telas para arrumar.

---

## 2. Benchmark de mercado

O padrão que separa os painéis de referência em 2026 é consistente: **contenção em vez de densidade decorativa**. Os melhores produtos (Stripe, Linear, Mercury, Attio) mostram 5–9 elementos na visão inicial, escondem o resto atrás de cliques, usam cor apenas para status e deixam a hierarquia fazer o trabalho. Dashboards que tentam mostrar tudo de uma vez leem como "pensamento inacabado". Interfaces B2B estão ficando mais calmas, com menos decoração e hierarquia mais forte, e a densidade deixou de sinalizar capacidade — priorização é o que sinaliza maturidade.

### 2.1 CRM e atendimento

**Attio** — *a referência nº 1 para o Atenvo.* Tabelas densas com linhas de ~36px, bordas de 1px quase invisíveis, tipografia de 13px impecável, um acento usado com escassez cirúrgica, edição inline, command menu (⌘K). Sensação: precisão e controle — "operador no cockpit". **Adaptar:** o sistema de tabelas inteiro, a disciplina do acento, a densidade com respiro. **Não copiar:** a densidade máxima como padrão único — teu time inclui operadores não-técnicos; densidade deve ser confortável por padrão, compacta por opção.

**Intercom** — inbox de 3 painéis (lista de conversas / conversa / contexto do contato), contadores de não-resolvidas, resumo inteligente no card da conversa. Sensação: fila sob controle. **Adaptar:** a anatomia dos 3 painéis para a tela WhatsApp, os filtros de fila (Todas / Minhas / Sem resposta), o painel lateral de contexto (dados do contato + funil + cobranças + agendamentos numa coluna colapsável). **Não copiar:** a superfície gigante de features de marketing — o Atenvo ganha sendo focado.

**HubSpot** — a barra-resumo no topo (valor do pipeline em destaque, tamanho impondo hierarquia). **Adaptar:** só esse padrão de summary bar para Dashboard e Relatórios. **Não copiar:** o peso geral — HubSpot é o exemplo do que acontece quando um CRM acumula 15 anos de features sem podar.

**Pylon** — trata o painel como **fila de ação ranqueada**, não relatório passivo: unifica canais e resume antes de pedir triagem. **Adaptar:** o conceito de "Precisa de ação" como bloco central do Dashboard (já está no mockup).

### 2.2 Dashboards financeiros

**Stripe** — abre com o número que importa (volume/receita) no quadrante superior esquerdo, gráfico limpo, cor mínima (verde = sucesso, vermelho = falha, e só). Tipografia de dados exemplar. Sensação: institucional, auditável. **Adaptar:** a disciplina de "um número norte por tela", algarismos tabulares, gráficos numa família de cor só. **Não copiar:** a escala da navegação (Stripe tem dezenas de produtos; o Atenvo tem 12 áreas — sidebar simples resolve).

**Mercury** — saldo total acima da dobra, respiro generoso, zero gráfico decorativo, estados vazios lindos. Provou que fintech premium = **calma**, porque desordem em tela de dinheiro lê como desconfiança. Sensação: banco privado. **Adaptar:** o tom para Cobranças e Planos; a regra "clareza é o sinal de confiança". **Não copiar:** o minimalismo extremo — o Atenvo é operacional, precisa de mais densidade que um extrato.

**Ramp** — enquadra dado como **resultado** ("você economizou X" > "gasto: Y") e tem o melhor padrão de bulk actions: seleciona linhas → barra de ações aparece. **Adaptar:** bulk actions em Cobranças e Contatos; enquadrar Relatórios por resultado ("R$ recuperados", "leads convertidos"), não só por contagem.

### 2.3 SaaS B2B / produtividade

**Linear** — o padrão-ouro de "premium por contenção": lista limpa, quase nenhum chrome, whitespace deliberado, análise separada em aba própria (Insights), motion de 100–150ms, foco em teclado. Prova que **calma vence densidade em ferramenta de uso diário**. **Adaptar:** separar "tela de fazer" de "tela de analisar" (WhatsApp/Kanban vs. Relatórios), a disciplina de motion, estados de foco. **Não copiar:** o dark-first e o roxo — linguagem de dev tool, não de assessoria financeira.

**Notion** — economia de interface: controles aparecem no hover, o resto some. **Adaptar:** ações de linha/card que só aparecem no hover (menos ruído em telas densas). **Não copiar:** a flexibilidade infinita — o Atenvo ganha sendo opinativo; ferramenta de tarefa funciona melhor com layout fixo e curado, builder é para produto de analytics.

**Asana ("My Tasks")** — a home é pessoal e orientada a ação, não organizacional. **Adaptar:** o Dashboard do atendente responde "o que EU preciso fazer agora", não "como está a empresa" (isso é papel de Relatórios e da visão do admin).

### 2.4 Dark premium (e por que observar sem seguir)

**Linear, Supabase, Sentry, Raycast, Railway** — dark bem-feito é sistema: superfícies em carvão (nunca preto puro), camadas neutras para profundidade, **um** acento, cor saturada reservada a severidade. Supabase empacota densidade enorme com um verde só. Sentry faz o vermelho saltar porque todo o resto é neutro. **Lição transferível ao light:** a disciplina de acento único + cor-só-para-status vale igual. **Por que não seguir dark-first:** dark é a linguagem de ferramenta de desenvolvedor e sessão noturna; teu usuário é operador de escritório, em sala clara, lendo texto e valores o dia todo — e teu comprador é dono de assessoria, que associa claro/limpo a banco e contabilidade, não a terminal. Dark vira opção de conforto na Fase 5, nunca a identidade.

### 2.5 Light premium

**Stripe, Attio, Mercury, Plausible** — o light premium de 2026 se sustenta em quatro coisas: neutros levemente temperados (não cinza-azulado default), **borda de 1px no lugar de sombra**, tipografia com hierarquia real e acento escasso. Plausible ainda ensina: quando o conjunto de métricas é finito, uma página só, sem abas, é mais rápida e mais elegante que navegação.

### 2.6 Sidebars, tabelas e onboarding

- **Sidebar:** Linear e Attio — 220–250px, grupos com rótulos discretos, item ativo inconfundível, colapsável para ícones, seletor de workspace no topo (que no Atenvo vira o **seletor de tenant** — teu multi-tenant merece esse lugar de destaque).
- **Tabelas:** Attio (densidade + edição inline), Stripe (números), **Resend** (tabela-log que lê por contraste e cor de status em vez de bordas pesadas — padrão perfeito para o histórico de mensagens/cobranças).
- **Onboarding e vazios:** os melhores produtos tratam a primeira sessão como feature — checklist de ativação e dados de exemplo no lugar de tela em branco. Para um SaaS que será vendido a outros escritórios, o estado vazio É a demo: cada tela vazia do Atenvo deve vender a tela cheia ("Nenhuma cobrança ainda — crie a primeira e acompanhe pagamentos aqui" + botão).

### 2.7 Respondendo às 7 perguntas da pesquisa

1. **O que fazem visualmente melhor?** Contenção: um acento, neutros disciplinados, hierarquia por tamanho/peso — não por cor e caixa.
2. **Como organizam informação?** Divulgação progressiva: 5–9 elementos na visão inicial, um "número norte" no topo-esquerda, detalhe atrás de clique. Papel importa: tela do operador ≠ tela do gestor.
3. **Cards, tabelas e filtros?** Card só quando agrupa de verdade (métrica, lista, painel); tabela com borda mínima, hover, números à direita; filtros globais no topo da página valendo para tudo (Datadog), não um filtro por widget.
4. **Sidebar e navegação?** Curta, agrupada, colapsável, com identidade (o item ativo é onde a marca aparece). Busca global ⌘K substitui menu profundo.
5. **Como fica premium?** Nos detalhes de 1px: bordas consistentes, radius único, algarismos tabulares, estados desenhados, motion curto. Premium é ausência de ruído, não presença de efeito.
6. **O que aprender e adaptar?** Attio (tabelas/densidade), Intercom (inbox 3 painéis), Stripe/Mercury (confiança financeira), Linear (calma + motion), Ramp (bulk actions + métricas de resultado), Pylon (fila de ação).
7. **O que NÃO copiar?** Dark-first e neon (dev tool), glassmorphism e efeito vitrine do Dribbble (bonito em screenshot, ruim com dado real), a customização infinita do Notion/Grafana (o Atenvo ganha sendo opinativo), o peso do HubSpot, e qualquer template shadcn de prateleira — o objetivo é justamente sair dessa identidade coletiva.

---

## 3. Principais problemas visuais (priorizados por impacto)

| # | Problema | Impacto | Onde dói mais |
|---|----------|---------|----------------|
| P0 | Identidade = defaults do kit (cores, radius, sombras de fábrica) | Percepção "template" em todas as telas | Sistema inteiro |
| P0 | Sem escala de espaçamento/tipografia — cada tela decide a sua | Sensação de improviso; inconsistência entre páginas | Sistema inteiro |
| P0 | Cor de ação sem escassez; cor usada como decoração | Nada se destaca; urgência não lê como urgência | Dashboard, tabelas |
| P1 | Tabelas sem tratamento de dado financeiro (alinhamento, tabular, status) | Corrói confiança onde mora o dinheiro | Cobranças, Contatos, Relatórios |
| P1 | Estados vazio/carregando/erro não desenhados | Produto parece inacabado; demo quebra em tela vazia | Todas, sobretudo p/ novos tenants |
| P1 | Hierarquia achatada (títulos ≈ corpo) | Leitura lenta; telas "gritam igual" | Dashboard, Relatórios |
| P2 | Login sem identidade | Primeira impressão fraca na venda | Login |
| P2 | Ícones/densidade sem norma | Ruído visual acumulado | WhatsApp, Kanban |
| P2 | Modais para tudo (inclusive criar/editar entidades) | Fluxo truncado em telas de trabalho | Contatos, Cobranças, Agendamentos |

## 4. Oportunidades

1. **Assinatura visual barata e forte** — o "trilho de status" (barra vertical de 3px) como gesto único repetido: item ativo da sidebar, alertas do dashboard, conversa não lida, card urgente no Kanban. Custa quase nada, cria impressão digital.
2. **A sidebar grafite como âncora de marca** — um bloco escuro fixo à esquerda diferencia o Atenvo de todo painel branco-shadcn sem pagar o custo de um dark mode completo, e dá ao seletor de tenant (teu multi-tenant!) um palco digno.
3. **Números tratados como dinheiro** — tabular, à direita, centavos atenuados. Detalhe que nenhum concorrente improvisado tem e todo comprador de assessoria *sente* mesmo sem saber nomear.
4. **Dashboard como fila de ação** — o bloco "Precisa de ação" transforma o painel de relatório passivo em cockpit. É argumento de venda ("o Atenvo te diz o que fazer"), não só estética.
5. **Estado vazio como vendedor** — cada tela vazia explicando o valor + CTA. De brinde, vira o onboarding dos próximos tenants.
6. **⌘K / busca global** — barato com a base já estruturada, e é o tipo de detalhe que faz demo parecer produto de 10x o preço.

---

## 5. Direção visual recomendada — "Precisão Operacional"

**Decisão dark × light × híbrido:** **light-first com sidebar grafite** (híbrido de âncora). Conteúdo claro porque o usuário é operador de escritório em sessão longa de leitura de texto e valores, e porque claro/limpo é a linguagem de confiança do universo financeiro (Stripe, Mercury, bancos). Sidebar grafite (`#161C28`, azul-carvão — nunca preto puro) porque dá identidade imediata, emoldura a operação como "cockpit" e resolve o problema do "mais um painel branco". Dark mode completo: opcional, Fase 5, nunca identidade.

**Personalidade-alvo em 5 palavras:** sério, preciso, calmo, brasileiro-institucional, operacional.

### Paleta (papel de cada cor)

| Token | Hex | Papel |
|-------|-----|-------|
| Grafite | `#161C28` | Sidebar, tinta institucional, gráficos monocromáticos |
| Papel | `#F6F7F9` | Fundo da área de conteúdo |
| Superfície | `#FFFFFF` | Cards, tabelas, topbar, modais |
| Borda | `#E6E9EF` / forte `#D7DBE4` | Toda separação; substitui sombra |
| Tinta | `#1B2330` | Texto primário |
| Texto-2 / Texto-3 | `#5D6673` / `#8A93A2` | Secundário / rótulos |
| **Cobalto** | `#1F4FD8` (hover `#1843BC`, tint `#EDF2FE`) | **Único** azul de ação: botão primário, item ativo, link, foco |
| Verde | `#137A5B` (tint `#E7F5EF`) | Status positivo: pago, ativo, conectado |
| Âmbar | `#B45309` (tint `#FCF0E1`) | Atenção: pendente, aguardando |
| Vermelho | `#C0362C` (tint `#FBEBE9`) | Crítico: vencido, erro, desconectado — e ação destrutiva |

Regra de ouro: **semânticas nunca decoram.** Verde só significa "bom", vermelho só significa "problema". Gráficos usam a família do cobalto/grafite em opacidades — nunca arco-íris.

### Tipografia

- **IBM Plex Sans** para tudo (400/450/500/600). Escolha deliberada: séria, "de engenharia", ótima em pt-BR, e fora do trio Inter/Geist/Roboto que todo template usa — é a fuga do genérico sem excentricidade.
- Escala: página 20/600 · seção 16/600 · corpo 14/450 · secundário 13 · rótulo/tabela-header 11,5–12/500 · KPI 26–28/600.
- `font-variant-numeric: tabular-nums` em **todo** valor, contagem, data e telefone. IBM Plex Mono opcional para IDs técnicos (Integrações).

### Forma, profundidade e movimento

- Radius: **8px** controles (botão, input, chip) · **12px** containers (card, modal, drawer) · pill para badges/avatares. Nada fora disso.
- Espaço: base 4px; componentes respiram em múltiplos de 8; padding de card 16–20; gutter de página 24.
- Profundidade: **borda 1px em repouso; sombra só no que flutua** (modal, drawer, popover, card sendo arrastado no Kanban).
- Motion: 120–160ms ease-out; hover sutil; skeleton no lugar de spinner; zero animação decorativa.

### Componentes-chave (como devem ser)

- **Sidebar:** 236px, grafite, grupos Operação / Gestão / Sistema, item ativo com trilho cobalto + fundo 7% branco, badges de contagem (WhatsApp) e alerta (Cobranças), seletor de tenant no topo, usuário no rodapé, colapsável a 64px.
- **Topbar:** 54px, branca, busca global com ⌘K à esquerda, sino + avatar à direita. Sem breadcrumb decorativo — o título da página faz esse papel.
- **Cabeçalho de página padrão (todas as 12 telas):** título 20/600 + subtítulo 13 cinza à esquerda; filtro de período + ação primária à direita. Uma ação primária por tela, sempre no mesmo lugar.
- **Cards:** três espécies apenas — métrica (rótulo/valor/delta), lista (header com título+link "ver todas") e painel (formulários/config). Mesmo raio, mesma borda, sem sombra.
- **Tabelas:** header 11,5px cinza em fundo `#FBFBFD`, linhas 44px (compacto 36px por toggle), divisor só horizontal e sutil, hover, números à direita, ações de linha no hover (kebab), seleção → barra de bulk actions, sticky header em listas longas.
- **Botões:** primário (cobalto, 1 por região), secundário (borda), ghost (toolbar), destrutivo (vermelho, só em confirmação). Alturas 32/36/40.
- **Formulários:** rótulo em cima 13/500, input 38px, foco = borda cobalto + anel `#EDF2FE`, erro inline com ícone, ajuda 12px cinza. Agrupar por seções com título.
- **Modal × Drawer:** modal ≤ 480px só para confirmar/decidir; **drawer lateral (480–620px)** para criar/editar/detalhar entidade (contato, cobrança, agendamento) — mantém a lista visível atrás e o contexto vivo.
- **Badges de status:** pill com tint + ponto colorido + texto (`● Pago`). Nunca fundo saturado, nunca só cor sem texto.

### Telas densas

- **WhatsApp:** 3 painéis — lista 340px (filtros Todas/Minhas/Sem resposta como segmented control, item com avatar + nome 14/500 + preview truncado + hora + trilho/badge de não lida) · conversa central (bolhas neutras, enviada com tint cobalto suave, composer com respostas rápidas) · contexto 320px colapsável (contato, etapa do funil, cobranças, agendamentos, notas). É a fusão Intercom + WhatsApp Web que o operador já sabe usar.
- **Kanban:** colunas em `Papel` com header nome + contagem + **soma R$**; cards brancos 12px com título 14/500, valor tabular, badge de status, avatar do responsável; trilho vermelho em card estagnado; sombra apenas durante o drag.
- **Agendamentos:** semana como padrão, "hoje" destacado, eventos com tint por tipo (ligação/reunião/retorno), lista "Hoje" à direita.
- **Relatórios:** barra de filtros global sticky (período, atendente, canal) valendo para a página inteira; linha de KPIs; gráficos monocromáticos; tabela drill-down; exportar no cabeçalho. Enquadrar por resultado (R$ recuperado, conversão), não só por volume.

### Aparência por tela restante (antes provável → depois)

- **Login:** card genérico centrado → card 400px sobre fundo `Papel` com marca, um tint quase imperceptível de cobalto no topo, microcopy de confiança ("Acesso da equipe · CAF Assessoria"). Sem foto de banco de imagem, sem gradiente.
- **Dashboard:** grade de widgets iguais → cabeçalho padrão + 4 KPIs + "Precisa de ação" + lista financeira (o mockup é este layout).
- **Contatos:** tabela crua → tabela padrão com busca, chips de filtro, bulk actions, drawer de detalhe.
- **Relacionamento:** lista solta → fila de follow-ups com trilho de urgência e ação de 1 clique (abrir conversa).
- **Cobranças:** grade pesada → tabela financeira exemplar (a do mockup) + resumo no topo (a receber / vencido / recebido no mês).
- **Integrações:** lista técnica → cards por integração com logo, badge `● Conectado`/`● Erro`, última sincronização, ação única. Segredos em IBM Plex Mono com copiar.
- **Configurações:** páginas soltas → nav vertical interna (Perfil, Equipe, Bot, Notificações…) + painéis de formulário padronizados.
- **Planos e uso:** texto → card do plano atual + medidores finos de uso (mensagens, contatos, assentos) + CTA de upgrade à la Stripe Billing. No multi-tenant, esta tela é literalmente a tela que fatura.

---

## 6. Princípios de design do novo Atenvo

1. **Hierarquia antes de decoração.** Se precisa de cor para destacar, o tamanho/peso falhou primeiro.
2. **Cada tela responde uma pergunta.** Dashboard: "o que exige ação?" · WhatsApp: "quem espera resposta?" · Cobranças: "quem paga e quem atrasou?" O que não serve à pergunta sai da visão inicial.
3. **Cor é status, nunca enfeite.** Cobalto = aja aqui. Verde/âmbar/vermelho = estado do mundo. Resto neutro.
4. **Denso sem ser pesado.** Borda no lugar de sombra, respiro em escala de 8, densidade compacta por opção do usuário — não por acidente.
5. **Consistência compra confiança.** Mesmo cabeçalho, mesma tabela, mesmo drawer nas 12 telas. O usuário aprende uma vez.
6. **Estados são metade do produto.** Vazio vende, carregando tranquiliza (skeleton), erro orienta (o que houve + como resolver).
7. **Escassez cria valor.** Uma ação primária por tela, um azul no sistema, uma assinatura (o trilho). O que é raro, pesa.

## 7. Componentes a redesenhar (ordem de ataque)

**P0 — fundação:** tokens (cores, tipo, espaço, radius, sombra) · Button · Input/Select/Textarea · Badge/Chip de status · Card (3 espécies) · Table (header, linha, hover, bulk bar, densidade) · Modal + Drawer · Tabs/Segmented · Toast · Skeleton · EmptyState · PageHeader.
**P1 — shell:** Sidebar (grupos, trilho, tenant, colapso) · Topbar (busca ⌘K, sino, avatar) · AppShell responsivo (sidebar → drawer no mobile).
**P2 — compostos:** item de conversa · bolha de mensagem · card de Kanban · card de integração · medidor de uso · calendário.

---

## 8. Sistema visual proposto (tokens prontos para o Code)

```css
:root {
  /* cor */
  --grafite:#161C28; --grafite-2:#1E2634;
  --papel:#F6F7F9; --superficie:#FFFFFF;
  --borda:#E6E9EF; --borda-forte:#D7DBE4;
  --tinta:#1B2330; --texto-2:#5D6673; --texto-3:#8A93A2;
  --acao:#1F4FD8; --acao-hover:#1843BC; --acao-tint:#EDF2FE;
  --ok:#137A5B;   --ok-tint:#E7F5EF;
  --alerta:#B45309; --alerta-tint:#FCF0E1;
  --erro:#C0362C; --erro-tint:#FBEBE9;
  /* forma */
  --r-controle:8px; --r-container:12px;
  --sombra-flutuante:0 12px 32px rgba(22,28,40,.14);
  /* tipo */
  --fonte:'IBM Plex Sans',system-ui,sans-serif;
  --t-pagina:20px; --t-secao:16px; --t-corpo:14px; --t-sec:13px; --t-rotulo:12px; --t-kpi:26px;
  /* movimento */
  --dur:140ms; --ease:cubic-bezier(.2,.8,.2,1);
}
```

Regras de governança que valem mais que os tokens: **(a)** nenhuma cor, tamanho ou radius fora dos tokens — se precisar de um novo, ele nasce no arquivo de tokens, nunca inline; **(b)** `tabular-nums` obrigatório em número; **(c)** sombra proibida fora de flutuantes; **(d)** todo PR de tela responde ao checklist: usa PageHeader? usa a Table padrão? tem os 3 estados? uma ação primária só?

---

## 9. Plano de redesign por fases

> **Pré-condição estratégica:** 1390 ativo e lead entrando. O redesign roda em branch própria, por trás da operação, e cada fase entra inteira — nunca meia-tela nova convivendo com meia-tela velha na mesma página.

**Fase 0 — Auditoria factual (1 sessão de Code, ~15 min de execução).** Confirmar as suposições da seção 1: inventário de cores hex usadas, tamanhos de fonte, valores de padding/radius distintos, variantes de botão existentes, screenshots das 12 telas. Saída: o "antes" documentado — vira material de comparação e de marketing depois.

**Fase 1 — Design System (2–4 sessões).** Tokens no CSS/Tailwind config + refazer os componentes P0 em cima deles + uma rota interna `/design` exibindo tudo (o showroom que garante consistência dali em diante). *Pronto quando:* qualquer tela nova pode ser montada só com peças do showroom.

**Fase 2 — AppShell (1–2 sessões).** Sidebar grafite com grupos e tenant, topbar com ⌘K, PageHeader aplicado, responsivo. *Pronto quando:* as 12 telas velhas já vivem dentro do shell novo sem quebrar — o ganho de percepção aqui é imediato e desproporcional ao esforço.

**Fase 3 — Telas de alto tráfego (3–5 sessões).** Dashboard → Cobranças → WhatsApp → Kanban, nessa ordem (vitrine primeiro, dinheiro segundo, volume de uso depois). *Pronto quando:* cada tela usa 100% componentes do sistema e tem os 3 estados desenhados.

**Fase 4 — Cauda (2–3 sessões).** Contatos, Agendamentos, Relacionamento, Relatórios, Integrações, Configurações, Planos, Login.

**Fase 5 — Polimento contínuo.** Estados vazios com ilustração leve, atalhos de teclado, microinterações, dark mode opcional, auditoria trimestral de consistência.

### Prompt pronto — Fase 0 (colar no Claude Code)

```
Auditoria de design, só leitura, nada de mudança.

1) Liste todas as cores hex/hsl usadas no frontend (src/), com contagem
   de ocorrências, separando: neutros, azuis/primárias, verdes, vermelhos,
   amarelos, outros.
2) Liste todos os tamanhos de fonte e pesos em uso, e todos os valores
   distintos de padding/gap/margin e de border-radius.
3) Liste as variantes de botão existentes (classes/props) e onde cada
   uma aparece.
4) Existe algum arquivo de tema/tokens (tailwind.config, CSS vars)?
   Está sendo respeitado ou há valores inline por fora?
5) Para cada uma das telas (Login, Dashboard, WhatsApp, Kanban, Contatos,
   Agendamentos, Relacionamento, Cobranças, Integrações, Relatórios,
   Configurações, Planos): o que renderiza quando não há dados? Existe
   estado de carregando e de erro desenhado?
Me devolve um relatório em português simples, com números, sem opinar
em solução ainda.
```

### Prompt pronto — Fase 1 (após aprovar a Fase 0)

```
Vamos implantar o design system "Precisão Operacional". Branch própria,
sem tocar produção.

1) Cria os tokens abaixo como CSS variables globais e mapeia no Tailwind
   (cores, radius, sombra, fonte, durações):
   [colar o bloco de tokens da seção 8 do relatório]
2) Adiciona IBM Plex Sans (400/450/500/600) como fonte padrão, com
   fallback system-ui, e ativa font-variant-numeric: tabular-nums numa
   classe utilitária .num.
3) Refatora APENAS estes componentes para usar os tokens, sem mudar
   comportamento: Button (primário/secundário/ghost/destrutivo, alturas
   32/36/40), Input/Select, Badge de status (pill tint + ponto + texto),
   Card, Table (header cinza 12px, linha 44px, hover, números à direita),
   Modal, Toast, Skeleton, EmptyState (ícone + título + texto + CTA),
   PageHeader (título 20/600 + subtítulo + ações à direita).
4) Cria uma rota interna /design que exibe todos esses componentes em
   todos os estados, usando dados de exemplo da nossa operação.
Me mostra o diff por partes e me explica em linguagem simples o que
mudou, o risco e como desfazer. Não deploya.
```

---

## 10. Fontes da pesquisa

Síntese construída sobre: 925 Studios — "35 SaaS Dashboard Design Examples, Trends and Patterns (2026)" (padrões Stripe/Linear/Mercury/Attio/Ramp, divulgação progressiva, fintech trust, dark discipline); designdotmd — "The shadcn trap: why shadcn looks generic and how to fix it" (o mecanismo do visual-template e a saída via tokens); AdminLTE.IO — roundup de dashboards SaaS 2026 (onboarding/empty states como feature, sistema consistente como diferencial); Muzli e SaaSFrame/Mobbin como galerias de referência contínua; mais o conhecimento consolidado dos produtos citados (Attio, Intercom, Stripe, Mercury, Ramp, Linear, Notion, Supabase, Sentry, Resend, Plausible, HubSpot, Pylon).

---

# Anexo A — Antes / depois conceitual

Comparação componente a componente. A coluna "antes" descreve o padrão típico de painel construído sem sistema (a ser confirmado na Fase 0); a coluna "depois" é o que está desenhado nos arquivos de mockup.

| Elemento | Antes (padrão de kit) | Depois ("Precisão Operacional") | O que o usuário sente |
|---|---|---|---|
| **Sidebar** | Branca ou cinza clara, itens em lista única, ativo marcado por fundo azul-claro | Grafite `#161C28`, 3 grupos rotulados, trilho cobalto de 3px no ativo, seletor de tenant no topo, badges de contagem | "Isso é um sistema, não um site" |
| **Item ativo** | Fundo colorido preenchido | Trilho de 3px + fundo 7% branco | Localização instantânea, sem ruído |
| **Topbar** | Logo repetida + breadcrumb decorativo | 54px, busca global ⌘K à esquerda, sino + avatar à direita | Menos chrome, mais atalho |
| **Título de página** | Mesmo peso do resto | 20/600 + subtítulo que entrega o número da tela | Sabe onde está e o que importa |
| **KPI** | Card com ícone colorido grande e gradiente | Rótulo 12,5 / valor 26 tabular / delta em pill semântico | Número é o herói, não a caixa |
| **Card** | Um molde genérico para tudo, com `shadow-sm` | 3 espécies (métrica, lista, painel), borda 1px, sem sombra | Cada bloco tem propósito |
| **Tabela** | Grade fechada, valores à esquerda, coluna de botões | Divisor horizontal sutil, R$ à direita tabular, ações no hover, bulk bar grafite | "Isso aguenta minha operação" |
| **Status** | Texto solto ou fundo saturado | Pill com tint + ponto + texto | Lê em print, PDF e daltonismo |
| **Botão** | Vários azuis cheios competindo | Um primário por região; resto secundário/ghost | Sabe o que fazer sem pensar |
| **Criar/editar** | Modal cobrindo a lista | Drawer lateral 480–620px | Não perde o contexto |
| **Vazio** | "Nenhum registro encontrado" | Ícone + o que é + o valor + CTA | Convite, não beco sem saída |
| **Carregando** | Spinner centralizado | Skeleton com a forma do conteúdo | Percepção de rapidez |
| **Erro** | "Erro ao carregar dados" | O que houve + estado dos dados + "Tentar novamente" | Confiança em vez de susto |
| **Login** | Card genérico centralizado | Linha cobalto no topo, tenant nomeado, rodapé de confiança | Ancoragem de preço antes da demo |
| **WhatsApp** | Duas colunas, contexto escondido | 3 painéis, cronômetro de espera, selo do bot, transcrição de áudio | Fila sob controle |
| **Kanban** | Colunas com contagem só | Soma em R$ por coluna, trilho de estagnação | Funil vira previsão de caixa |

---

# Anexo B — Prompts prontos para as Fases 2 e 3

Colar no Claude Code, um de cada vez, sempre em branch própria e sem deploy.

### Fase 2 — AppShell

```
Fase 2 do redesign: AppShell. Branch própria, sem tocar produção.
Só usa tokens e componentes do design system da Fase 1 — nada de valor
solto no código.

1) SIDEBAR (236px, fundo var(--grafite)):
   - Topo: marca + seletor de tenant (mostra o tenant atual, abre lista).
   - Três grupos com rótulo discreto (11px, maiúsculo, cinza):
     OPERAÇÃO: Dashboard, WhatsApp, Kanban, Agendamentos
     GESTÃO: Contatos, Relacionamento, Cobranças, Relatórios
     SISTEMA: Integrações, Configurações, Planos e uso
   - Item ativo: fundo rgba(255,255,255,.07) + barra vertical de 3px na
     cor de ação, colada na borda esquerda da sidebar.
   - Badges de contagem em WhatsApp (azul) e Cobranças vencidas (vermelho).
   - Rodapé: avatar + nome + papel do usuário.
   - Colapsável para 56px (só ícones), estado salvo por usuário.

2) TOPBAR (54px, branca, borda inferior 1px):
   - Busca global à esquerda com atalho ⌘K / Ctrl+K abrindo um command
     menu que busca contatos, conversas e cobranças.
   - À direita: sino de notificações com ponto quando houver não lidas,
     e avatar com menu (perfil, tema, sair).

3) PAGEHEADER reutilizável, aplicado nas 12 telas:
   título 20/600 + subtítulo 13px cinza à esquerda; slot de filtros e
   UMA ação primária à direita.

4) RESPONSIVO: abaixo de 1024px a sidebar vira drawer com overlay;
   abaixo de 768px a topbar ganha botão de menu. Nenhuma tabela pode
   estourar a largura — scroll horizontal contido no container.

Não muda o conteúdo das telas nesta fase: só troca o invólucro.
Me mostra o diff em partes, explica em português simples o risco de cada
parte e como reverter. Não deploya.
```

### Fase 3 — Telas de alto tráfego

```
Fase 3, tela 1 de 4: DASHBOARD. Só componentes do design system.

Estrutura, de cima para baixo:
1) PageHeader: "Dashboard" + subtítulo com a data e o resumo do dia.
   Filtro de período (7/30/90 dias) + ação primária "Novo contato".
2) Linha de 4 KPIs: conversas aguardando, novos leads hoje, a receber
   na semana (R$), taxa de resposta. Cada um com rótulo, valor grande
   tabular e um delta em pill (verde/vermelho/âmbar/neutro).
3) Grade 5/7:
   - Esquerda, card de lista "Precisa de ação": até 5 itens, cada um com
     barra vertical de 3px na cor da urgência (vermelho = vencido/atrasado,
     âmbar = esperando, azul = agendado), título, subtítulo e horário.
     Clicar leva direto para a tela de origem.
   - Direita, card de lista "Cobranças da semana": tabela padrão com
     cliente, parcela, valor à direita, badge de status e vencimento.
     Link "Ver todas" no cabeçalho.
4) Os três estados obrigatórios: skeleton no carregamento (com a forma
   dos KPIs e das listas), estado vazio por bloco com texto que explica
   o valor e um CTA, e estado de erro com "Tentar novamente".

Regras: uma única ação primária na tela; nenhuma cor fora dos tokens
semânticos; todo número com tabular-nums; nenhuma sombra em card.

Depois desta, seguimos na ordem: Cobranças, WhatsApp, Kanban.
Me mostra o diff e explica em português simples. Não deploya.
```

> Para WhatsApp e Kanban, os arquivos `atenvo-telas-densas.html` funcionam como especificação visual — anexar ao prompt e pedir reprodução fiel da estrutura, não da marcação.

---

# Anexo C — Como saber se funcionou

Design sem métrica vira gosto pessoal, e gosto pessoal não se defende em reunião. Quatro medidas, todas baratas:

1. **Tempo até a primeira ação no dia** (abrir o painel → abrir a primeira conversa). Deve cair — é o teste do "Precisa de ação".
2. **Conversas ultrapassando 30 min sem resposta.** Deve cair com o cronômetro na fila. É a métrica que liga design a dinheiro: lead frio é lead perdido.
3. **Leads parados há mais de 7 dias no Kanban.** Deve cair com o trilho de estagnação.
4. **Teste dos 5 segundos com alguém de fora:** abre o Dashboard por 5 segundos, fecha e pergunta o que a pessoa lembra. Se ela não disser o número que importa, a hierarquia ainda não está certa.

E o teste comercial, que vale por todos: mostrar o painel novo para um dono de escritório e perguntar quanto ele acha que custa por mês. Se o número subir em relação ao painel de hoje, o redesign se pagou.
