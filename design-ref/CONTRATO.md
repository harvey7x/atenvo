# Contrato do redesign Platina
1. NUNCA edite arquivos de páginas ou componentes visuais antigos. Toda página
   nova nasce em `src/v2/`. O código antigo é somente leitura, como referência
   funcional.
2. Recriação, não repintura: o layout, o posicionamento e a hierarquia de cada
   página seguem o MOCKUP (`design-ref/atenvo-sistema-completo-platina.html`),
   não a página antiga. Se a página não tem mockup, siga o MANUAL DE EXTENSÃO
   no fim deste arquivo.
3. Paridade funcional é obrigatória: toda ação, campo, filtro e permissão que
   existe na página antiga precisa existir na nova, mesmo que o mockup não
   mostre. O que o mockup não cobre, você desenha seguindo os padrões dele.
   Nada de funcionalidade nova sem pedido explícito.
4. Reuse a lógica existente (hooks, serviços, queries, mutations, RLS, auth,
   multi-tenant). Se estiver acoplada ao JSX antigo, extraia para um hook em
   `src/v2/hooks/` sem mudar o comportamento, e use o hook na página nova.
5. Tokens e efeitos: use exclusivamente os tokens de `src/v2/tokens.css`
   (extraídos do mockup). Cor existe apenas como semântica (verde/âmbar/rubro)
   e no pulso do canal. Ação primária é o botão platina. Tipografia: Instrument
   Sans, família única. Momentos de display (saudações, títulos de auth) usam
   .p-display — 600, gradiente platina. Onde o mockup mostrar Newsreader
   itálica, vale esta regra (Adendo nº 1).
6. Hierarquia de movimento: ambiente (luz em deriva, lento) · carga (entrada em
   cascata, contadores, uma vez) · interação (hover, spotlight, instantâneo).
   DADO É CALMO: tabelas e formulários não têm efeito interno além de hover.
   Tudo respeita prefers-reduced-motion. A intensidade global sai do token
   `--fx` (1 = demo, 0.5 = operação).
7. Todos os estados são desenhados: carregando (skeleton em vidro com shimmer
   sutil), vazio (mensagem + ação), erro (mensagem + tentar de novo). O mockup
   mostra o estado ideal; os demais seguem os mesmos padrões.
8. Performance: orçamento de blur (sidebar + topbar + cards visíveis; nunca
   backdrop-filter dentro de listas longas ou células de tabela). Relatórios
   exportados/impressos saem em tema claro.
9. Uma página por sessão. Ao terminar: rode o build, teste a rota, faça commit
   na branch `redesign/platina` com mensagem `v2: <página>`, e PARE com um
   reporte: o que foi recriado, o que a página antiga tinha que o mockup não
   mostrava (e como você resolveu), e o que ficou pendente. Aguarde aprovação.

## Adendo nº 2 — régua do tempo
Tempo em célula/etiqueta usa `src/v2/lib/tempo.ts`: horizonte curto
(< 48h) fala o relativo primeiro ("em 3h") com a data de apoio; horizonte
longo fala a data primeiro (dd/mm/aa, hh:mm SP) com o relativo humanizado
de apoio (dias até 30, meses depois). Sempre tabular-nums.

## Adendo nº 3 — usos declarados de cor
Âmbar em estrela de favorito é uso declarado (convenção universal de
favorito), não status semântico. Sempre via token `--ambar`, nunca hex solto.

## Adendo nº 4 — rótulos do ConfirmDialogV2
"Voltar" (cancelar) e "Aguarde…" (busy) são o padrão v2 declarado dos
diálogos de confirmação — evitam o ambíguo "Cancelar" em diálogos cuja
própria ação confirmada é cancelar algo.

## Manual de extensão (páginas sem mockup)
- Cabeçalho de página: título + subtítulo à esquerda, ações à direita
  (padrão .ph do mockup). Máximo um botão primário por tela.
- Se a página tem métricas: linha de KPIs em cards de vidro (máx. 4).
- Se a página é lista/gestão: filtros em chips + tabela padrão + barra de
  seleção platina + paginação (copie a anatomia de Contatos/Cobranças).
- Se a página é formulário/edição: navegação interna à esquerda + painel de
  vidro com campos, divisores e toggles (copie Configurações).
- Se a página é detalhe de um item: cabeçalho de identidade + colunas
  principal/contexto (copie o painel de contexto do WhatsApp).
- Nunca invente cor nova, ícone estilizado ou efeito fora do inventário.
