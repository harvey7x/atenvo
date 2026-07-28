# Inventário do app real — redesign Platina

> Gerado em 2026-07-27 por varredura de 21 agentes (roteador + 1 agente por página).
> Complementa o `CONTRATO.md`. Fonte de verdade da PARIDADE FUNCIONAL: antes de recriar
> uma página, confira aqui as fontes de dados, o veredito de acoplamento e a lista de
> funcionalidades que a v2 precisa manter.

## Decisões aprovadas (2026-07-27)

- **Dashboard**: APROVADA — vira a home `/` no corte final. Versão enxuta: só KPIs com fonte já existente em `src/data/*`, "Precisa de ação" agregando queries atuais, tabela de cobranças reaproveitada. Nenhuma métrica que exija engenharia de dados nova.
- **Contatos**: APROVADA — UI sobre `src/data/contatos.ts`, paridade com o que a camada já oferece.
- **Relacionamento**: ENTROU na ordem (decisão 2026-07-27, revisão da ADIADA): o frontend v1 chegou ao main (rota /relacionamento + src/pages/Relacionamento.tsx + src/data/relacionamento.ts) e a paridade agora o exige. Sessão dele: entre Kanban e Facebook; página real no main = verdade funcional, pg-relacionamento do mockup = verdade visual; item volta à sidebar v2 (grupo Gestão). Novos commits do módulo chegam pela cadência de merge — recriar contra a versão estável.
- **Agendamentos**: recriar a central real (6 status, sequências) com os padrões do mockup, não o calendário. `Agendamentos.tsx` (morto) → lista de limpeza do corte final. **v2.1 (Ordem de Redesenho, 2026-07-27):** a aba Visão geral é o PAINEL DE COMANDO (KPIs, timeline de próximos envios, atividade da semana com clique-no-dia, Precisa de ação) — apresentação enriquecida além do manual, aprovada pelo dono; regra absoluta: só agregação client-side dos dados já carregados, zero ação/query/mutação nova; demais abas mantêm a tabela de gestão com todas as ações.
- **Scripts v2.1 (Ordem de Redesenho, 2026-07-27)**: a lista deixa de ser tabela e vira ARSENAL — galeria de cards que mostram o script como bolha de mensagem (faixa de favoritos no topo, seções por categoria; `{{variáveis}}` com realce tipográfico; script só-mídia mostra tipo+nome do anexo, nunca "—"; pill "Sequência · N passos"); drawer de detalhe com a sequência INTEIRA numerada + variáveis usadas; barra de filtros reorganizada (busca · Segmentado de canal sem contagens · ★Favoritos / chips de categoria) e "Gerenciar" vira BotaoSec no cabeçalho (gerencia CATEGORIAS). Mesmo precedente do painel de Agendamentos: apresentação enriquecida aprovada pelo dono; zero ação/query/mutação nova — única exceção declarada: hook-espelho `useScriptsResumoEtapas` (mesma tabela/escopo/custo do `useScriptEtapaCounts` do v1, só colunas a mais). Anatomia `.drawer-v2 .cab/.corpo/.fechar-p` promovida de agendamentos.css a componentes.css (pertence ao componente).
- **Configurações**: abas reais com o layout do mockup. **Integrações e demais divergências**: paridade funcional manda. **Sessão feita (2026-07-27):** anatomia cfg do mockup (cfg-nav 186px + cfg-painel) com as 6 abas REAIS; chamadas inline extraídas para src/v2/services/conta.ts (demo_reset + auth.updateUser email); tema Claro/Escuro/Sistema OCULTO no v2 (Platina é tema único — precedente do login; prefs.tema fica intacta no banco até o corte); window.prompt do e-mail e window.confirm de status/etiqueta viraram ModalV2/ConfirmDialogV2 com textos idênticos; popover de cor em portal (regra 10 — backdrop-filter do painel vira containing block de position:fixed); cascata .sobe roda só na primeira carga (trocas de aba não re-animam — hierarquia de movimento) e a troca de aba zera o scroll do palco; papel exibido como pill neutra (papel não é semáforo; status usa BadgeStatus semântico).
- **Notificação de resposta**: na sessão do shell, só o componente visual + botão de simulação; fiação realtime na sessão do WhatsApp.
- **Contatos (página NOVA, sessão feita, 2026-07-28)**: nasce v2-nativa sobre src/data/contatos.ts (lista completa da org; filtros/paginação client-side 25/pg). Rito da página nova: mockup×capacidade cruzado — coluna "Etapa" e bulks "Enviar mensagem"/"Mudar etapa" do mockup NÃO têm sustentação (moverOportunidade só existe dentro de useKanban) → bulk = Exportar CSV client-side (precedente Cobranças); botão "Importar" omitido; coluna "Status" de cobrança sustentada por agregação client-side de useCobrancas (ativa+proximaCobranca<hoje → Vencida). OPT-OUT em 1ª classe via hook-espelho declarado useBloqueiosOrg (mesma tabela/RLS de useBloqueio, org inteira) — badge na lista, bloco na ficha, "Agendar mensagem" bloqueado com motivo; bloquear/desbloquear via RPCs existentes. Ficha em DrawerV2 (anatomia ctx do WhatsApp) agrega useOportunidadesDoContato + useCobrancas + useAgendamentosOrg + useAtivacaoDoContato; Abrir conversa via conversaAtivaDoContato → /v2/whatsapp?conversa=. Nota honesta: st (Cliente/Lead/…) é derivado de etiquetas pela camada — na operação real quase tudo é "Lead".
- **Relatórios (sessão feita, 2026-07-28)**: verdade funcional = camada VIVA src/data/relatorios.ts (regras A→D preservadas — pessoa única, sem número interno, rótulos honestos, atribuição com fallback "Não atribuído"); 5 abas, filtros completos com chips removíveis e gate de papel atendente; tooltips das definições byte a byte. Padrões do pg-relatorios: LineChart/Bars/MiniBars do v1 viraram barras verticais .barv (única anatomia de gráfico do mockup, com destaque hoje2), Funnel→barras horizontais, Donut mantido com tons neutros + SEMÂNTICOS (ganho verde/perdido rubro); KPIs SEM contador animado (dado é calmo em página densa); tabelas RelTabela com busca/ordenação/paginação/Exportar CSV (client-side, lógica idêntica). Demo com seed completo das 5 abas (v1 sem backend mostrava só vazio); "Exportar PDF" do mockup não existe na camada → fora (CSV por tabela cobre).
- **Maturação (sessão feita, 2026-07-28)**: órfã classificada como PAINEL DE OPERAÇÃO + formulários acessórios (não só formulário/edição como o inventário sugeria): banner de modo no topo (âmbar simulação / verde ativo), KPIs client-side (total/aquecendo/em risco + ring da média — precedente do painel), cards de chip com anatomia própria (fundo sólido leve, regra 8: sem vidro aninhado na grade), seções empilhadas como o v1 (sem nav lateral). Demo (:5176) = seed completo com QR fake e conexão simulada (v1 sem backend mostrava só nota — tradução declarada); real intocado (operação estava em MODO ATIVO com 2 chips reais aquecendo durante a validação).

## Ordem final aprovada

1a Fundação → 1b Shell → Login (+NotFound/ConfigError) → Plano e uso → Fluxos de senha → Cobranças → Agendamentos → Scripts → Configurações → Maturação → Contatos → Relatórios → Dashboard → Integrações → Kanban → **Relacionamento** → Facebook → WhatsApp. (Relacionamento incluído em 2026-07-27; o restante conforme aprovação original.)

Processo: a cada 3-4 sessões (e sempre que `bot-cloud-1390` chegar ao main), merge do main em `redesign/platina` com reporte de conflitos. Fluxos de senha: extração de hooks 100% idêntica em comportamento + teste manual dos 3 fluxos + convite nos modos mock e supabase antes do commit.

## Roteador — `src/App.tsx`

Roteador em src/App.tsx: usa createBrowserRouter normalmente e createHashRouter quando aberto via file://. Estrutura de guards: (1) ProtectedRoute (src/components/ProtectedRoute.tsx) — sem sessão redireciona para /login preservando a origem em state.from; com user.deveTrocarSenha força /alterar-senha bloqueando todo o resto; (2) AppShell (src/components/AppShell.tsx) — layout autenticado com Sidebar + Topbar; /alterar-senha fica DENTRO do ProtectedRoute mas FORA do AppShell (sem navegação); (3) RequireRole (src/components/RequireRole.tsx) — usado em /maturacao e /plano-uso com role admin; não redireciona, renderiza card 'Acesso restrito' dentro do shell. Redirects: índice '/' → /whatsapp (Navigate replace); não há rota de dashboard (é feature requerida ainda não construída, conforme memória do projeto). O handle de cada rota carrega title/subtitle (consumidos pela Topbar) e a flag fullBleed (todas as páginas do shell exceto /maturacao e /plano-uso). Deep-links por query string: /configuracoes?tab=<conta|equipe|canais|atendimento|notif|prefs>&section=..., /integracoes#facebook e #maturacao (âncoras), /whatsapp e /kanban leem useSearchParams para abrir conversa/oportunidade específica. Páginas com dispatcher real/mock por flag de backend: WhatsApp (WA_REAL), Facebook (FB_REAL), Cobrancas (WA_REAL → CobrancasApp em src/components/CobrancasApp.tsx), Relatorios (REL_REAL), Scripts (SCRIPTS_REAL), Maturacao (MATURACAO_REAL) — no redesign, cada uma tem dois estados visuais. As 'abas internas' de /integracoes e /maturacao são seções empilhadas na mesma página (âncoras/scroll), não tabs clicáveis como em /configuracoes, /relatorios e /agendamentos.

## Mapeamento rota real → mockup

| Rota | Arquivo | Mockup | Nota |
|---|---|---|---|
| `/login` | src/pages/Login.tsx | #login (overlay) | mockup direto |
| `/redefinir-senha` | src/pages/RedefinirSenha.tsx | — órfã | família visual do login |
| `/definir-senha` | src/pages/DefinirSenha.tsx | — órfã | família visual do login |
| `/alterar-senha` | src/pages/AlterarSenha.tsx | — órfã | família visual do login |
| `/ (index)` | src/App.tsx (Navigate inline) | pg-dashboard | DECISÃO: Dashboard APROVADA (versão enxuta) e vira a home "/" no corte final |
| `/whatsapp` | src/pages/WhatsApp.tsx | pg-whatsapp | mockup direto — última da ordem |
| `/facebook` | src/pages/Facebook.tsx | — órfã | anatomia do pg-whatsapp |
| `/kanban` | src/pages/Kanban.tsx | pg-kanban | mockup direto |
| `/agendamentos` | src/pages/AgendamentosMensagens.tsx | pg-agendamentos (só os PADRÕES) | DECISÃO: recriar a central real de mensagens agendadas (6 status, sequências) com segmentado/chips/tabela/trilhos do mockup — NÃO a grade de calendário |
| `/scripts` | src/pages/Scripts.tsx | — órfã | manual de extensão: lista/gestão + editor |
| `/cobrancas` | src/pages/Cobrancas.tsx | pg-cobrancas | mockup direto |
| `/integracoes` | src/pages/Integracoes.tsx | pg-integracoes | paridade funcional manda sobre os 4 cards do mockup |
| `/relatorios` | src/pages/Relatorios.tsx | pg-relatorios | mockup 1 visão; real mantém 5 abas + filtros + CSV |
| `/configuracoes` | src/pages/Configuracoes.tsx | pg-config | DECISÃO: abas REAIS (Conta/Equipe/Canais/Atendimento/Notif/Prefs) com o layout do mockup |
| `/maturacao` | src/pages/Maturacao.tsx | — órfã | manual de extensão · admin |
| `/plano-uso` | src/pages/PlanoUso.tsx | pg-planos | mockup direto · admin (RequireRole) |
| `* (catch-all)` | src/pages/NotFound.tsx | — órfã | trivial, junto do login |
| `(fora do roteador — renderização condicional)` | src/pages/Onboarding.tsx | — órfã | família do login |
| `(fora do roteador — renderização condicional)` | src/pages/ConfigError.tsx | — órfã | família do login |
| `(fora do roteador — código morto preservado)` | src/pages/Agendamentos.tsx | pg-agendamentos (coincidência) | CÓDIGO MORTO — entra na lista de limpeza do corte final |

**Mockup sem página real:** `pg-dashboard` (aprovada, enxuta), `pg-contatos` (aprovada), `pg-relacionamento` (adiada).

## Análise por página

### `/whatsapp` — src/pages/WhatsApp.tsx

**1854 linhas · complexidade 5/5 · acoplamento: MISTA**

Caixa de atendimento do WhatsApp (fullBleed): lista de conversas com abas/filtros por canal e status, chat com envio de texto/mídia/áudio, scripts e sequências, agendamento de mensagens, atribuição/transferência de atendente, etiquetas, higiene de conversas, SLA, KanbanContatoBox e vínculo LID; usa dados reais (WA_REAL) ou demo mock.

Abas internas: Todos · Meus · Não atribuídos · Não lidas · Pendentes · Arquivadas

Veredito: Todo o acesso a dados (queries, RPCs, edge functions, realtime) já vive em hooks/serviços de src/data/* — a página não tem nenhum supabase.from inline. Porém ~600 linhas de orquestração crítica ficam inline no componente: espelho local `contacts` com updates otimistas e reconciliação lista×histórico, regra de marcar-lida (seleção explícita + foco), auto-seleção do canal de resposta com override manual (refs), fluxo de envio com cid/timeout de 25s e retry — a v2 precisa extrair isso para hooks (ex.: useInboxState, useEnvioMensagem) ou copiar fielmente.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useWaConversations (from('conversas') com embeds contatos/canais/mensagens[10] + from('oportunidades') p/ etapa + realtime postgres_changes em mensagens/conversas/contatos, refetch 30s) | hook | src/data/whatsapp.ts |
| useWaMensagens (histórico completo, from('mensagens')) | hook | src/data/whatsapp.ts |
| useSendWaMessage (invoca edge 'evolution-send': texto/mídia/retry/reply/assinatura) | hook | src/data/whatsapp.ts |
| useAtribuirAtendimento (invoca edge 'atribuir-atendimento'; invalida wa-conversas/kanban) | hook | src/data/whatsapp.ts |
| useWaCanais (from('canais') tipo=whatsapp, status/transporte/envio_restrito/entrega_status) | hook | src/data/whatsapp.ts |
| useWaCanalEnvioSaude (from('mensagens') últimas 10 saídas, avaliarEnvioSaude, refetch 20s) | hook | src/data/whatsapp.ts |
| useIniciarConversaWa (from contato_identidades/contatos/conversas, reusa conversa não fechada) | hook | src/data/whatsapp.ts |
| useWaAtividades (from('conversa_atividades') + usuarios — timeline assumir/transferir/devolver) | hook | src/data/whatsapp.ts |
| useMensagensAgendadas (from('mensagens_agendadas')) | hook | src/data/whatsapp.ts |
| useAgendarSequencia / useEditarAgendamento / useCancelarAgendamento (rpc agendar_sequencia / editar_agendamento / cancelar_agendamento) | hook | src/data/whatsapp.ts |
| waArquivar (rpc wa_arquivar_conversa) / waMarcarLida (rpc wa_marcar_lida) / removerMensagemFalha (rpc remover_mensagem_falha) | rpc | src/data/whatsapp.ts |
| waValidarNumero / waVincularNumero (edge 'evolution-send' actions validar_numero/vincular_numero — vínculo LID Caso D) | edge-function | src/data/whatsapp.ts |
| waRecarregarAudio (edge 'wa-midia' action retry-audio) | edge-function | src/data/whatsapp.ts |
| subirMidiaWa / urlAssinadaMidiaWa / urlDownloadMidiaWa (storage bucket 'script-midia': upload + signed URLs) | servico | src/data/whatsapp.ts |
| normalizeWaPhone / mascararNumero / nomeArquivoMidia / rotuloBaixarMidia / WA_REAL | servico | src/data/whatsapp.ts |
| useSlaAlertas (rpc sla_alertas_ativos, refetch 60s) + indexPorChave/tipoLabel/tempoRelativo | hook | src/data/sla.ts + src/data/slaView.ts |
| useHigieneConversa (from('conversa_higiene_adiamentos')) / useRegistrarAdiamento (rpc higiene_registrar_adiamento) | hook | src/data/higiene.ts |
| useScripts (from('scripts')) / useScriptEtapaCounts / aguardarConfirmacaoEnvio (poll em mensagens) / traduzErroEnvio (puro) | hook | src/data/scripts.ts |
| useStatusDefs (from('conversa_status_def')) / useEtiquetas (from('etiquetas')) / useOrgUsuarios + useAssinaturaPref (from('organizacao_usuarios')) | hook | src/data/atendimento.ts |
| useAtendimentoActions (definirStatusConversa/definirEtiquetasConversa → update conversas; atualizarContato → update contatos; salvarAssinatura → update organizacao_usuarios) | servico | src/data/atendimento.ts |
| useJanelaCanal (from('canal_janela') — janela 24h Cloud API por par canal×contato) + rotuloJanela | hook | src/data/cloudApi.ts |
| KanbanContatoBox → useOportunidadesDoContato / useFunisDaOrg / chamarGarantirEntrada (rpc garantir_oportunidade_lead_novo) + FichaJudicialBox | hook | src/components/KanbanContatoBox.tsx + src/data/kanban.ts |
| useAuth (usuário logado: id/nome/email) | contexto | src/context/AuthContext.tsx |
| useOrg (currentOrg.id/name/role — org e permissão) | contexto | src/context/OrgContext.tsx |
| WA_CONTACTS / initials / avatarColor (modo demo mock quando WA_REAL=false) | servico | src/data/whatsappDemo.ts |
| Regras puras: higieneConversa (decidirDono/decidirNome/estadoHigiene/textoBloqueio), conversaEtiquetas (etiquetasDaConversa/responsavelEfetivo), dataConversa (construirItensConversa — separador de dia), nomeCliente, agendamentoMensagem (canalValidoParaEnvio), config/higiene (corte/adaptação) | servico | src/lib/* + src/config/higiene.ts |

Paridade obrigatória:
- Lista: busca por nome/última msg/telefone; 6 abas (Todos/Meus/Não atribuídos/Não lidas/Pendentes/Arquivadas) com contadores que usam os mesmos predicados do filtro; arquivadas só na aba própria (ou busca ativa)
- Filtro popover (funil): por canal/número e por status configurável
- Ordenação: fixadas no topo → recência pura (não-lidas NÃO reordena); agrupamento por responsável com 'Não atribuídos' primeiro e nomes em ordem alfabética
- Card da conversa: avatar, flags 📌/🔕/🗄️, nome com fallback telefone mascarado/'Cliente sem nome' (nunca LID), chip etapa Kanban com cor da coluna, indicador ⚠ agregado (atrasado/SLA/precisa humano/nome incompleto no tooltip), chips canal e atendente, 'Finalizado', preview, tempo relativo com tick de 1min, badge não lidas 99+
- Barra lateral colorida por tier de espera (<30min neutro / 30min-2h âmbar / 2-24h vermelho / >24h crítico)
- Estados: skeleton enquanto live.isLoading (nunca 'Nenhuma conversa' durante carga) vs vazio real; EmptyState 'Selecione uma conversa' no chat
- Deep-link ?conversa=<id> (Kanban): seleciona, limpa filtros, scroll até o card, consome o param; seleção persistida em sessionStorage
- Marcar como lida automática APENAS após clique do usuário na conversa + documento visível + janela focada (nunca em restauração de ID); retenta em focus/visibilitychange
- Nova conversa: modal canal conectado + telefone (normalizado) + nome opcional; reusa conversa não fechada; foca o compositor sem enviar nada
- Cabeçalho do chat: avatar+nome do cliente, chips etapa/canal de resposta/janela 24h (Cloud API, aberta/fechada)/atendente; botões Assumir (sem dono efetivo) ou Transferir, Arquivar/Desarquivar, Modo foco (persistido em localStorage, Esc sai, esconde/mostra lista), menu Ações
- Menu Ações (3 pontos): editar dados, marcar lida/não lida, arquivar/desarquivar, copiar telefone (com fallback execCommand), fechar conversa (ConfirmDialog; usa status slug 'fechada')
- Higiene 1 — sem responsável: banner com Assumir; bloqueia envio conforme entrada progressiva (conversa nova bloqueia já, antiga após adaptação/corte ISO)
- Higiene 2 — nome fraco/comércio: banner Editar nome / Lembrar depois (máx 2 adiamentos) / Cliente ainda não informou (libera 24h); depois bloqueia envio; placeholders do textarea explicam o motivo
- Mensagens: separadores de dia; bolhas texto (WhatsAppText), imagem (lightbox + legenda), vídeo, áudio (player AudioMessage; 'Áudio indisponível' com recarregar via edge), documento (Baixar/Abrir via URL assinada), quoted reply, tag 'Enviada pelo celular', ticks lida/entregue/enviada/pendente/falhou (desconhecido = sem tick)
- Falha de envio: Ver erro (traduzErroEnvio em diálogo), Tentar novamente (retry_mensagem_id, sem duplicar, trava duplo-clique), Remover (ConfirmDialog destrutivo + RPC); timeout de 25s marca pendente→falhou
- Responder mensagem específica: botão por bolha, reply-box no composer com cancelar, preview por tipo, payload reply_to no envio
- Composer — Responder por: chips de todos os canais reais (desconectado marcado 'off'), auto-seleção pelo último canal recebido→canal de origem, escolha manual persiste na conversa (não é atropelada por inbound); mock: Chip 1/2/3
- Assinatura: sem/atendente/empresa/personalizado (input extra), preview *Nome:*, persistida em organizacao_usuarios
- Avisos do composer: canal restrito (bloqueia), envio instável/indisponível/entrega restrita (informativo), semDestino LID (bloqueia + botão Vincular número); canal desconectado bloqueia silenciosamente (placeholder)
- Bloqueios de envio combinados: canalIndisponivel | canalRestrito | semDestino | higieneBloqueia desabilitam textarea/imagem/áudio/documento; enviar exige draft + conversa + canal conectado
- Envio de mídia: imagem/documento via MediaComposer (caption), áudio via AudioRecorder (gravação=PTT vs arquivo anexado; diag de observabilidade); upload ao bucket privado antes do envio
- Agendamento: botão relógio abre AgendarMensagemModal (criar sequência 1..N blocos com mídia, ou editar texto/canal/data); lista de agendadas na conversa (agendada/processando/falhou/bloqueada) com Editar/Cancelar (window.confirm); canais agendáveis filtrados por canalValidoParaEnvio
- Scripts: popover com scripts do canal whatsapp + contagem de msgs por etapa; ScriptSequenceModal envia sequência com variáveis (cliente/atendente/empresa/telefone) e confirmação real de envio (polling)
- Vínculo LID (Caso D): modal em 2 passos — Validar no WhatsApp (onWhatsApp) → Confirmar e vincular; telemetria sanitizada no console; refetch da lista
- Atribuição: Assumir / Transferir (modal com busca, seleção, papel, motivo OBRIGATÓRIO) / Devolver para a fila — tudo otimista com rollback e trava de duplo-clique; timeline 'Atividade do atendimento' (assumiu/transferiu/devolveu + motivo)
- Painel Dados do cliente: modo edição (nome, e-mail com validação regex, observações, responsável via select), status picker (popover de status ativos com cor), etiquetas coloridas (toggle add/remove via popover), origem do lead, último canal utilizado (alias/provider/número mascarado/quando), última interação, documentos (mock), copiar telefone
- Permissão: podeGerenciarAtendimento(currentOrg.role) exibe links 'Gerenciar status…'/'Gerenciar etiquetas…' → /configuracoes
- KanbanContatoBox: oportunidade aberta (funil/etapa/responsável/serviço/benefício/valor + Ver no Kanban + FichaJudicialBox) ou 'Adicionar ao Kanban' (modal escolhe funil, RPC idempotente)
- SLA: alertas ativos por conversa viram alertas no tooltip ⚠ do card (somente leitura)
- Responsivo: 3 colunas; painel de dados colapsável (desktop) / drawer com overlay (<1200px); botão reabrir; popovers com posicionamento medido, fecham em clique fora/resize/Esc
- Realtime + polling: postgres_changes (mensagens/conversas/contatos) com coalescing de 900ms para a lista e invalidação imediata do histórico; refetch backstop 30s + on focus; relógio de 1min para tempos relativos
- Modo demo (WA_REAL=false): dados mock WA_CONTACTS, ações locais com toasts, sem chamadas reais

### `/configuracoes` — src/pages/Configuracoes.tsx

**698 linhas · complexidade 4/5 · acoplamento: MISTA**

Configurações (fullBleed) com abas controladas por estado e deep-link via ?tab= (e ?section= dentro de Atendimento): perfil/avatar/e-mail/tema (Conta), convites e papéis (Equipe), canais conectados (Canais), status/etiquetas/horários de atendimento (Atendimento), preferências de notificação (Notificações) e preferências gerais (Preferências); inclui reset de demonstração para admin em DEMO_MODE.

Abas internas: Conta · Equipe · Canais · Atendimento · Notificações · Preferências

Veredito: Praticamente toda a camada de dados já vive em hooks/serviços reutilizáveis (src/data/configuracoes.ts, atendimento.ts, whatsapp.ts, facebook.ts), mas o componente ainda tem duas chamadas supabase inline no corpo: supabase.rpc('demo_reset') no DemoReset e supabase.auth.updateUser({email}) no alterarEmail do ContaPanel (via window.prompt) — ambas triviais de extrair; o resto a página v2 pode simplesmente importar.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useMeuPerfil (supabase.from('usuarios')) | hook | src/data/configuracoes.ts |
| useSalvarPerfil (rpc 'atualizar_perfil') | hook | src/data/configuracoes.ts |
| salvarAvatar (rpc 'atualizar_avatar') | servico | src/data/configuracoes.ts |
| subirAvatar (storage bucket 'script-midia' upload) | servico | src/data/configuracoes.ts |
| urlAvatar (storage createSignedUrl 'script-midia') | servico | src/data/configuracoes.ts |
| useOrgFull (supabase.from('organizacoes')) | hook | src/data/configuracoes.ts |
| useSalvarOrg (rpc 'atualizar_organizacao') | hook | src/data/configuracoes.ts |
| useEquipe (rpc 'equipe_listar' — membros+convites+vagas) | hook | src/data/configuracoes.ts |
| useEquipeActions (rpcs 'equipe_alterar_papel'/'equipe_definir_status' + functions.invoke('convidar-usuario') p/ convidar/reenviar/cancelar) | hook | src/data/configuracoes.ts |
| useContatosBuscaCfg (supabase.from('contatos') autocomplete, min 2 chars, exclui mesclados) | hook | src/data/configuracoes.ts |
| usePreferencias (supabase.from('usuario_preferencias')) | hook | src/data/configuracoes.ts |
| useSalvarPreferencias (rpc 'salvar_preferencias') | hook | src/data/configuracoes.ts |
| useConfigAtendimento (supabase.from('configuracoes') chave='atendimento') | hook | src/data/configuracoes.ts |
| useSalvarConfigAtendimento (upsert em 'configuracoes') | hook | src/data/configuracoes.ts |
| traduzCfg (tradução de erros das RPCs p/ PT-BR) | servico | src/data/configuracoes.ts |
| useStatusDefs (from 'conversa_status_def', fallback mock sem backend) | hook | src/data/atendimento.ts |
| useEtiquetas (from 'etiquetas', fallback mock) | hook | src/data/atendimento.ts |
| useAtendimentoActions (CRUD em 'conversa_status_def'/'etiquetas' + count/reassign em 'conversas': criar/atualizar/reordenar/definirPadrao/excluir status, contarConversasComStatus, criar/atualizar/excluir etiqueta) | hook | src/data/atendimento.ts |
| useWaCanais + flag WA_REAL (from 'canais' tipo='whatsapp') | hook | src/data/whatsapp.ts |
| useFbStatus (functions.invoke('meta-manage', action:'status')) | hook | src/data/facebook.ts |
| supabase.rpc('demo_reset') — inline no componente DemoReset | rpc | src/pages/Configuracoes.tsx |
| supabase.auth.updateUser({email}) — inline em alterarEmail (ContaPanel) | query-inline | src/pages/Configuracoes.tsx |
| useOrg (currentOrg.id + currentOrg.role) | contexto | src/context/OrgContext.tsx |
| useAuth (user, refreshProfile após salvar perfil) | contexto | src/context/AuthContext.tsx |
| useToast | hook | src/hooks/useToast.ts |
| useTheme (aplicação do tema light/dark) | hook | src/hooks/useTheme.ts |
| DEMO_MODE (VITE_DEMO_MODE) | servico | src/lib/demo.ts |
| podeGerenciarAtendimento + PALETA_CORES | servico | src/types/atendimento.ts |

Paridade obrigatória:
- 6 abas por estado (conta, equipe, canais, atendimento, notif, prefs) com deep-link ?tab= (sincroniza quando o param muda) e ?section=status|etiquetas dentro de Atendimento (scrollIntoView suave + destaque visual de 2.2s no card alvo)
- Card 'Ambiente de demonstração' visível só com DEMO_MODE && role admin: botão destrutivo com ConfirmDialog, rpc demo_reset, registro do horário do último reset, estado busy
- Conta/Perfil: upload de avatar (input file image/*, bucket privado com signed URL), remover foto, campos nome/cargo/telefone, e-mail readonly com botão Alterar (window.prompt -> auth.updateUser -> link de confirmação), Cancelar (restaura form do servidor), Salvar (mutation + refreshProfile p/ atualizar sidebar), estados loading e erro do perfil
- Conta/Empresa: nome, nome fantasia, CNPJ (validação client de 14 dígitos), telefone, email, fuso (3 opções BR), idioma travado pt-BR, moeda BRL/USD; campos disabled e rodapé Salvar oculto quando !podeGerenciar (admin/supervisor)
- Equipe: lista unificada membros+convites via rpc equipe_listar; header mostra uso de vagas do plano (ativos+pendentes de limite); filtros chips Todos/Ativos/Pendentes/Inativos + select de perfil; tabela com avatar/nome/'(você)'/email, badges de papel e status (com dot), último acesso ('Nunca'/'—'), data 'Desde'; empty state por filtro; rodapé com contagem membros/convites
- Equipe/ações por linha (menu dots): membro — só admin e nunca a própria conta: alterar papel (admin/supervisor/atendente), desativar/reativar; convite — admin, ou supervisor apenas p/ convites de atendente: reenviar, copiar link (clipboard, só modo link manual), cancelar; erros traduzidos via traduzCfg
- Modal Convidar usuário: nome com autocomplete de contatos (>=2 chars, preenche telefone ao selecionar), e-mail obrigatório com regex, telefone obrigatório se envio por WhatsApp, select de perfil (opção admin só p/ admin), checkbox 'Enviar convite pelo WhatsApp' + select de canal conectado (pré-seleciona o primeiro) — visível só se há canal WA conectado; estados de resultado: enviado_whatsapp, falha_envio (Tentar novamente + Copiar link se admin), link_gerado (copiar link), criado sem confirmação; busy bloqueia fechar; request_id idempotente no convidar
- Canais: cards resumo WhatsApp (alias, número, tipo de origem traduzido, gestor; badge por status conectado/sincronizando/desconectado/atencao/erro) e Facebook (páginas com estado 'conectado'); botão 'Abrir Integrações' (navigate /integracoes) e 'Configurar origem comercial' (podeGerenciar); estados: WA_REAL false, loading, lista vazia
- Configurações de atendimento (edição só admin): horário início/fim (time), conversa sem resposta após (min), inatividade p/ encerrar (min), status padrão de nova conversa (select alimentado por useStatusDefs), dias da semana como chips toggle, mensagem fora do horário (textarea), nota de que a automação backend é pendente; Salvar com pending
- Status das conversas (admin/supervisor): renome inline (blur/Enter), popover de cor (paleta PALETA_CORES + color input personalizado + Aplicar; commit em blur/Escape/click-fora; posicionamento com flip vertical), badge 'sistema', tornar padrão (estrela; padrão exibe badge), reordenar subir/descer, toggle ativo/inativo, excluir com contagem de conversas em uso — se >0 exige status substituto e reatribui ('Excluir e reatribuir'), senão window.confirm; adicionar novo (cor + nome, Enter ou botão)
- Etiquetas: renome inline, descrição inline opcional (blur), mesmo popover de cor, toggle ativa/inativa, excluir com window.confirm, adicionar (cor+nome+descrição); nome único por organização com erro traduzido; empty state 'Nenhuma etiqueta ainda'
- Notificações: preferências individuais com auto-save (otimista, rollback em erro) — 5 toggles por e-mail (novos_leads, sem_resposta, cobrancas_vencendo, resumo_diario, convite_aceito) e 6 no app (push, som, aguardando, novos_membros, cobrancas, mencoes); aviso de que o envio real de e-mail/push está pendente
- Preferências: tema segmentado Claro/Escuro/Sistema (persiste 'system' mas aplica o resolvido via matchMedia+useTheme), idioma travado, formato de data (3 opções), densidade confortável/compacta (aplica data-densidade no documentElement, inclusive no load), página inicial (/whatsapp,/kanban,/cobrancas,/relatorios), toggles 'Mostrar dicas' e 'Reproduzir sons'; tudo auto-save com rollback
- Permissões transversais: podeAdmin = role 'admin'; podeGerenciar = podeGerenciarAtendimento(role) (admin/supervisor); textos explicativos quando o usuário não pode editar; loading '...Carregando' em todo painel antes do primeiro dado

### `/definir-senha` — src/pages/DefinirSenha.tsx

**239 linhas · complexidade 3/5 · acoplamento: MISTA**

Fluxo de ativação por convite: decide a fase (senha/pendente/já ativo/erro/sem sessão) pela sessão real + RPC convite_estado (nunca por ?ativar ou tem_senha), coleta a senha do convidado e ao concluir encerra a sessão e envia para /login; aceita todos os formatos de link do Supabase (code, hash, invite, recovery).

Veredito: A decisão de fase (decidirFase) é pura/exportada e updatePassword vive no AuthContext, mas todo o resto — polling de getSession, RPCs convite_estado/convite_aceitar com retry, refreshSession, signOut e a máquina de estados de ativação (ativar/concluirAtivacao/finalizar) — está inline no corpo do componente. Para a v2 vale extrair um hook useAtivacaoConvite que devolva fase/erro/busy/senhaOk e as ações, deixando a página nova só renderizar.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAuth (updatePassword, mode) | contexto | src/context/AuthContext.tsx |
| useTheme (theme, setTheme) | hook | src/hooks/useTheme.tsx |
| useToast (toast) | hook | src/hooks/useToast.tsx |
| supabase.auth.getSession() — polling 8x/500ms (~4s) no useEffect e de novo em ativar() | query-inline | src/pages/DefinirSenha.tsx (via src/lib/supabase) |
| supabase.auth.refreshSession() + supabase.auth.getUser() | query-inline | src/pages/DefinirSenha.tsx |
| supabase.rpc('convite_estado') | rpc | src/pages/DefinirSenha.tsx (inline no useEffect) |
| supabase.rpc('convite_aceitar') — com retry 1x em erro transitório | rpc | src/pages/DefinirSenha.tsx (inline em ativar()) |
| supabase.auth.signOut() | query-inline | src/pages/DefinirSenha.tsx (em finalizar()) |
| decidirFase(EstadoConvite) — função pura exportada que mapeia convite/vinculo/expirado -> fase | servico | src/pages/DefinirSenha.tsx (mesmo arquivo, exportada e testável) |

Paridade obrigatória:
- 7 fases mutuamente exclusivas: carregando, senha, pendente, sucesso, ja_ativo, sem_sessao, erro — decididas pela sessão REAL + RPC convite_estado via decidirFase (NUNCA por ?ativar=1 nem tem_senha)
- Fase inicial: aguarda supabase-js processar o token da URL em qualquer formato (code, hash access_token, invite, recovery) — polling getSession até 8x/500ms (~4s, navegador in-app do WhatsApp é lento); sem sessão -> fase sem_sessao (nunca sugerir 'reabra o link')
- Fallback: se a RPC convite_estado falhar mas houver sessão, cai na fase senha (permite definir mesmo assim)
- mode==='mock' -> Navigate replace para /login (página só existe no modo supabase)
- Formulário de senha: campos Nova senha + Confirmar senha (autoComplete new-password), toggle mostrar/ocultar único que afeta os dois campos (aria-pressed), validação client-side: mínimo 6 caracteres e senhas iguais
- Senha definida UMA única vez (flag senhaOk): se a ativação falhar depois, retries chamam só convite_aceitar — nunca pedem a senha de novo
- ativar() resiliente: getSession -> refreshSession se preciso -> getUser -> rpc convite_aceitar com retry 1x em erro transitório (regex autenticado|jwt|session|auth|network|fetch|timeout|429|502|503); mapeia convite_expirado -> expirado, convite_inexistente/vinculo_invalido -> ja_ativo
- Mapeamento de erro do updatePassword: /expired|invalid|token|otp|session/ -> mensagem amigável 'O link expirou ou já foi utilizado. Se você já definiu a senha, faça login.'
- Fase sucesso: toast 'Senha definida. Seu acesso foi ativado.', mensagem visível ~1.5s, signOut (encerra a sessão do convite) e navigate /login replace
- Fase pendente: subhead muda conforme senhaOk; botão 'Concluir ativação' + link 'Tentar novamente' (ambos chamam concluirAtivacao) + link 'Ir para o login'
- Fases ja_ativo / erro / sem_sessao: mensagem específica + botão 'Ir para o login'; mensagens de erro distintas para convite cancelado e convite expirado (vindas de decidirFase)
- Banner de erro com role=alert e aria-live=polite, reaparece nas fases senha/pendente/erro; digitar em qualquer campo limpa o erro
- Estado busy: spinner nos botões de submit/ativação, todos os botões e links de ação disabled durante operação; guarda contra duplo clique
- Toggle de tema claro/escuro (pill no topo) via useTheme
- Guarda de unmount (flag vivo) no polling do useEffect para não setar estado após desmontar
- Nunca logar senha/token/link; layout single-column reutilizando classes de Login.css (login-page, auth-panel, field, btn, banner, spinner)

### `/alterar-senha` — src/pages/AlterarSenha.tsx

**123 linhas · complexidade 2/5 · acoplamento: MISTA**

Troca de senha OBRIGATÓRIA no primeiro acesso (senha temporária): fica fora do AppShell (sem navegação) e o ProtectedRoute bloqueia todo o resto do app enquanto user.deveTrocarSenha for true; salva via updateUser + RPC senha_trocada e então libera para /whatsapp.

Veredito: A troca de senha em si (updatePassword via supabase.auth.updateUser) e o refreshProfile já vivem no AuthContext e são importáveis, mas a orquestração crítica está inline no componente: a RPC senha_trocada, o signOut({scope:'others'}) e a máquina de estados de retomada (senhaTrocada) que separa "redefinir" de "concluir liberação". A v2 pode copiar essa lógica inline (é curta) ou extraí-la num hook useAlterarSenha antes da recriação.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAuth (user, mode, updatePassword, refreshProfile) | contexto | src/context/AuthContext.tsx |
| supabase.rpc("senha_trocada") | rpc | src/pages/AlterarSenha.tsx (inline, função liberar) |
| supabase.auth.signOut({ scope: "others" }) | query-inline | src/pages/AlterarSenha.tsx (inline, best-effort na função liberar) |
| useToast | hook | src/hooks/useToast.tsx |
| useTheme | hook | src/hooks/useTheme.tsx |

Paridade obrigatória:
- Guardas de redirect no topo: mode==='mock' → /login; !user → /login; !user.deveTrocarSenha → /whatsapp (todos com Navigate replace)
- Campo 'Nova senha' (autoComplete='new-password') com botão mostrar/ocultar senha (o toggle afeta os DOIS campos simultaneamente)
- Campo 'Confirmar nova senha' (autoComplete='new-password')
- Validação client-side de senha forte: mínimo 8 caracteres, ao menos 1 letra (regex inclui acentuadas À-ÿ) e 1 número — mensagem específica
- Validação de coincidência: senha !== conf → 'As senhas não coincidem.'
- Banner de erro inline com role='alert' e aria-live='polite'; erro é limpo ao digitar em qualquer campo
- Fluxo em 2 passos: (1) updatePassword invalida a senha temporária; (2) RPC senha_trocada baixa a flag deveTrocarSenha — a ordem importa
- Estado de retomada senhaTrocada: se a RPC falhar após a senha já ter sido trocada, a UI vira modo 'Concluir' (esconde os campos, muda o subhead para 'Sua senha foi alterada. Falta só liberar o acesso.') e o submit re-tenta SÓ a liberação, sem pedir/redefinir senha de novo
- Após liberar: signOut({scope:'others'}) best-effort (encerra outras sessões, erro silencioso), refreshProfile(), toast 'Senha alterada. Acesso liberado.', navigate('/whatsapp', {replace:true})
- Botão submit com spinner e disabled enquanto busy (guard if(busy) return no onSubmit evita duplo submit)
- Toggle de tema claro/escuro (pill com aria-pressed) — página fica fora do AppShell, então precisa do próprio controle de tema
- Layout de página cheia reutilizando Login.css (classe login-page com gridTemplateColumns '1fr', sem painel lateral)
- Nunca recebe nem exibe a senha temporária (comentário de contrato no cabeçalho do arquivo)

### `/kanban` — src/pages/Kanban.tsx

**822 linhas · complexidade 5/5 · acoplamento: EXTRAIDA**

Funil comercial em colunas (fullBleed): board de oportunidades com drag entre etapas, chips de SLA e canal, modal de detalhe da oportunidade (dados previdenciários, valores, motivo de perda, timeline de eventos), busca de contatos, ficha judicial (FichaJudicialBox) e criação/edição de leads.

Veredito: Kanban.tsx não tem nenhum supabase.from/.rpc inline: todas as queries, mutations, realtime e RPCs vivem em hooks de src/data/* (kanban.ts, contatos.ts, atendimento.ts, fichaJudicial.ts, sla.ts) e a página só orquestra estado de UI (drag, otimista, modais, busca). A v2 pode importar useKanban e os hooks satélites diretamente; o único acesso inline a banco está no filho FichaJudicialModal, que é reutilizável como componente inteiro.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useKanban (funil+colunas+leads, criarColuna, editarColuna, excluirColuna, reordenarColunas, criarLead, editarLead, arquivarLead, moverOportunidade; queries: funis, funil_colunas, oportunidades c/ embeds contatos/responsavel/canais; realtime channel kanban-<org> em oportunidades+funil_colunas; polling 8s) | hook | src/data/kanban.ts |
| useOportunidadesAbertasDeContatos (opp aberta por contato, usada no combobox e no bloqueio de duplicidade) | hook | src/data/kanban.ts |
| useConversasDoContato (herda conversa/canal/chip/atendente no formulário) | hook | src/data/kanban.ts |
| useNaoLidasPorContato (badge de msgs não lidas no card; polling 8s) | hook | src/data/kanban.ts |
| useOportunidadeEventos (histórico comercial ganho/perdido/reaberto no modal de detalhe) | hook | src/data/kanban.ts |
| useBuscaContatos (autocomplete de contatos, debounce 300ms na página, min 2 chars, limit 12) | hook | src/data/contatos.ts |
| useEtiquetas (catálogo de etiquetas + cores) | hook | src/data/atendimento.ts |
| useOrgUsuarios (select de responsável) | hook | src/data/atendimento.ts |
| useFichasStatusDeOportunidades (tag rascunho/finalizada no rodapé do card) | hook | src/data/fichaJudicial.ts |
| useSlaAlertas (chips de SLA nos cards; refetch 30s) | hook | src/data/sla.ts |
| rpc reordenar_colunas_funil (chamada dentro de useKanban.reordenarColunas — reordenação transacional de colunas) | rpc | src/data/kanban.ts |
| rpc sla_alertas_ativos (chamada dentro de useSlaAlertas) | rpc | src/data/sla.ts |
| indexPorChave / sevRank / sevClass / tipoLabel (helpers puros de apresentação de SLA) | servico | src/data/slaView.ts |
| useOrg (currentOrg.id + currentOrg.role → permissão podeConfig) | contexto | src/context/OrgContext.tsx |
| useToast (feedback de ações) | contexto | src/hooks/useToast.tsx |
| FichaJudicialBox → useFichasDaOportunidade / useCriarNovaVersaoFicha (+ FichaJudicialModal: useCriarFichaJudicial/useAtualizarFichaJudicial/useFinalizarFichaJudicial e useAuth) | hook | src/components/FichaJudicialBox.tsx + src/data/fichaJudicial.ts |
| supabase.from('contatos').update / from('oportunidades').update (retroalimentação da ficha — inline no filho, não na página) | query-inline | src/components/FichaJudicialModal.tsx |

Paridade obrigatória:
- Busca de leads (filtra por nome, telefone com match de dígitos >=3, e-mail, tipo de benefício, serviço, instituição, responsável, canal e etiquetas do caso+cliente); estado 'nenhum lead encontrado'
- Drag & drop de CARDS entre colunas: movimento otimista (neutra→neutra), lock por card em movimentação, auto-scroll horizontal nas bordas (~80px) durante o arraste
- Classificação de movimento por funil_colunas.resultado (classificarMovimento): ganho/perdido/reabertura abrem modal de confirmação ANTES de mover — perdido exige motivo (select MOTIVOS_PERDA; 'outro' exige descrição), reabertura exige motivo texto; ganho sem responsável avisa 'sem atribuição'
- Lock otimista via atualizado_em esperado no moverOportunidade; distingue conflito_otimista de sem_permissao; erros traduzidos por traduzErroKanban
- Drag & drop de COLUNAS (só admin/gestor; coluna de entrada não arrasta nem recebe) com ordem otimista + RPC transacional e liberação do lock quando o servidor confirma
- CRUD de coluna: criar (nome + cor da PALETTE de 10), renomear/cor, excluir com realocação obrigatória dos leads para coluna destino; proteções: entrada não exclui, colunas ganho/perdido estruturais não excluem, mínimo 1 coluna
- Menu de contexto do card: Editar, 'Mover para' (lista das demais colunas com dot de cor), Arquivar (status='cancelado')
- Modal Novo lead: combobox pesquisável de contatos (teclado ↑↓ Enter Esc, click-outside) mostrando opp aberta por contato; opção 'criar sem vínculo' (nome+telefone manuais); herança automática de conversa/canal/chip/responsável da conversa mais recente; select de conversa quando contato tem >1
- Bloqueio de duplicidade: contato com oportunidade aberta no mesmo funil desabilita salvar e mostra card com coluna/resp/valor + link 'Abrir oportunidade'; fallback no erro 23505/uq_oport_aberta
- Formulário do lead (novo/editar compartilhado): tipo benefício*, número benefício, instituição, serviço* (defaults de status cancelamento/ressarcimento por tipo — defaultsStatus), situação cancelamento/ressarcimento condicionais (mostraCancel/mostraRess), tipo/data início desconto, 4 valores BRL com parse pt-BR e validação (mensal, ressarcimento estimado, ressarcido, genérico condicional mostraGenerico), etapa, etiquetas do caso (toggle), etiquetas do cliente read-only, resumo/observações; validações de obrigatórios
- Editar com mudança de etapa para/entre coluna terminal: salva os demais campos e reabre o fluxo de confirmação de ganho/perda/reabertura (mesma regra do arraste)
- Card: avatar com badge de não lidas (cap 99), nome + flags Ganho/Perdido (com motivo no title), subtítulo benefício·serviço (serviço oculto quando é o default analise_inicial), instituição, chip de canal (só nome interno), responsável, valor relevante (valorRelevante; sufixo /mês), etiquetas mescladas contato+caso (máx 3 + '+N'), chips de SLA (tipos redundantes ocultos via SLA_OCULTO_NO_CARD), chip prioridade alta, tempo relativo, tag de ficha judicial (rascunho/finalizada)
- Ordenação dos cards na coluna: severidade SLA desc > prioridade alta > ordem
- Modal de detalhe da oportunidade: seções condicionais (Contato, Benefício e serviço, Valores, Organização, Histórico comercial com eventos+motivos+executor, Datas), rodapé com Fechar / Abrir conversa (navega /whatsapp ou /facebook?conversa=<id>) / Editar, FichaJudicialBox embutida (criar ficha, continuar rascunho, visualizar/copiar/nova versão, histórico de versões; aviso quando sem contato vinculado)
- Deep-link ?oportunidade=<uuid>: abre detalhe, destaca e rola até o card; limpa o param (inclusive UUID inválido)
- Permissão podeConfig (role admin|gestor): botões Nova coluna, menu da coluna, arraste de coluna, ghost column; sem permissão o empty state pede para falar com administrador
- Estados: loading do funil, erro com botão Atualizar (refetch), funil sem colunas (empty state com CTA por papel), funil sem leads (empty state inline), coluna vazia ('Sem leads'), botão 'Adicionar lead' por coluna (pré-seleciona a etapa)
- Atualização contínua: realtime postgres_changes + refetchInterval 8s (colunas/leads/não-lidas) e 30s (SLA) — a v2 precisa conviver com isso sem quebrar os estados otimistas (optim/ordemOtim)

### `/integracoes` — src/pages/Integracoes.tsx

**1132 linhas · complexidade 5/5 · acoplamento: EXTRAIDA**

Hub de serviços externos (fullBleed): conexão de números WhatsApp via QR (Evolution) com saúde real do canal, limite de conexões, entrega automática (testes 5/h), comercial/origem por canal, Cloud API oficial (IntegracaoCloudApi), conexão de Página do Facebook, gestão de chips de maturação (QR/proxy) e log de saúde das integrações — seções em rolagem única com âncoras (#facebook, #maturacao), não abas.

Abas internas: WhatsApp · Facebook · Maturação de Números · Saúde das integrações

Veredito: Toda a camada de dados já vive em hooks/serviços reutilizáveis em src/data/* (whatsapp.ts, facebook.ts, maturacao.ts, cloudApi.ts, atendimento.ts) — a página não tem nenhum supabase.from/.rpc inline e a v2 pode importar tudo. O que fica inline no componente é só orquestração de UI (efeito de retorno do OAuth do Facebook lendo ?fb=&code=, invalidação de queries no refresh, derivação visual de chips/alertas e o slot determinístico proximoTeste replicado do agendador) — precisa ser reescrito na v2, mas usa apenas serviços importados.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useOrg (currentOrg.id + currentOrg.role) | contexto | src/context/OrgContext.tsx |
| useWaCanais — supabase.from('canais') tipo=whatsapp, exclui 'removido' | hook | src/data/whatsapp.ts |
| useWaLimite — from('organizacao_limites') + count from('canais') | hook | src/data/whatsapp.ts |
| useWaHealth — edge function 'wa-health' (refetch 60s) | hook | src/data/whatsapp.ts |
| useEntregaAutoResumo — rpc wa_entrega_auto_resumo | hook | src/data/whatsapp.ts |
| useRodarTesteEntrega — edge 'evolution-manage' (teste de entrega) | hook | src/data/whatsapp.ts |
| useFontesAquisicao — from('fontes_aquisicao') | hook | src/data/whatsapp.ts |
| waRemove / waOcultar — edge 'evolution-manage' actions remove/ocultar | servico | src/data/whatsapp.ts |
| waUpdateComercial — rpc atualizar_canal_comercial | servico | src/data/whatsapp.ts |
| waCreateInstance / waReconnect / waQr / waStatus (via WhatsAppConnect) — edge 'evolution-manage' | servico | src/data/whatsapp.ts (usado por src/components/WhatsAppConnect.tsx) |
| mascararNumero (util de exibição) | servico | src/data/whatsapp.ts |
| useFbStatus — edge 'meta-manage' action status | hook | src/data/facebook.ts |
| fbAuthStart / fbPages / fbConnect / fbDisconnect — edges 'meta-auth-start', 'meta-pages', 'meta-manage' | servico | src/data/facebook.ts |
| useOrgUsuarios — from('organizacao_usuarios') join usuarios | hook | src/data/atendimento.ts |
| usePainelMaturacao — rpc maturacao_painel (refetch 30s) | hook | src/data/maturacao.ts |
| useCriarChip / useExcluirChip / useQrChip / useStatusChip (poll 3s) / useAplicarProxy — edge 'maturacao-manage' | hook | src/data/maturacao.ts |
| useAtualizarChip — rpc maturacao_chip_atualizar | hook | src/data/maturacao.ts |
| useDefinirProxy / useRemoverProxy — rpcs maturacao_chip_proxy_definir/remover | hook | src/data/maturacao.ts |
| useProxyChip — from('maturacao_chips') campos de proxy sem senha | hook | src/data/maturacao.ts |
| useCloudDiagnostico / useCloudAcoes / useWaTemplates / useTemplateAcoes (via IntegracaoCloudApi) — edge 'cloud-manage' + rpcs de templates | hook | src/data/cloudApi.ts (usado por src/components/IntegracaoCloudApi.tsx) |
| isSupabaseConfigured / FB_REAL / MATURACAO_REAL (flags de backend real) | servico | src/lib/supabase.ts, src/data/facebook.ts, src/data/maturacao.ts |
| useSearchParams — retorno OAuth ?fb=connect&code / ?fb=error&motivo | contexto | react-router-dom (efeito inline em Integracoes.tsx) |
| useQueryClient — invalidações wa-canais/wa-limite/wa-conversas/fb-status/fb-conversas/mat-painel/rel-* | contexto | @tanstack/react-query (inline em Integracoes.tsx) |

Paridade obrigatória:
- Cards de resumo: total de integrações conectadas (WA+FB), WhatsApp ativos vs contratados com limite do plano (incluidos+adicionais), Facebook conectados, e card roxo de maturação (só admin, fora do total de atendimento)
- Seção WhatsApp QR (Evolution): lista SÓ canais transporte != 'cloud_api' (o oficial não entra, mas conta no limite); filtro Ativos / Desconectados (N) / Todos; ativo = conectado|sincronizando
- Por canal WA: alias + número mascarado; exatamente 3 chips (Sessão via wa-health estado/cor, Entrega via entrega_status ok/instavel/restrito, Auto entregues_1h/total_1h quando apto); 1 alerta único por prioridade (conflito de número > envio restrito > instável > aguardando 1º teste > origem comercial não configurada)
- Ações por canal WA: Ver diagnóstico (todos os papéis); Rodar teste agora (podeConfig + ea.apto, disabled se pendente_recente, trata pulado='ja_aguardando_ack'); Configurar origem comercial (podeConfig); Reconectar (podeConfig + inativo + sem conflito, reusa canal); Desconectar (podeConfig + ativo, preserva canal); Remover/ocultar (podeConfig, some da lista preservando histórico)
- Botão Conectar WhatsApp: gate por podeConfig; disabled quando waUsados >= limite com aviso 'Limite atingido (X/Y)'; botão Atualizar invalida wa-canais/wa-limite/wa-conversas/fb-status/fb-conversas
- Modal WhatsAppConnect: criação (alias obrigatório + fonte de aquisição slug fixo) ou reconexão auto-iniciada; QR expira em 60s e renova sozinho; polling de status 3s até conectar; Cancelar antes de conectar REMOVE a instância para liberar a vaga
- DiagnosticoModal (read-only): badge de saúde + recomendação; grid com estado da sessão/recebimento/envio+taxa/erros consecutivos/instância/número/último recebido/último entregue/webhook/versão Evolution/origem comercial/gestor; último erro técnico; bloco Entrega automática (destino, 5/h, última hora, últimos 5 testes, último resultado sem ACK cru, latência, próximo teste por slot determinístico hash do canalId, pausado até); últimos 10 envios REAIS a clientes; ações Atualizar/Reconectar/Desconectar condicionadas a podeAgir do wa-health
- ConfigOrigemModal: nome interno, tipo de origem (7 tipos fixos), gestor responsável (lista useOrgUsuarios), fonte de aquisição, campanha, observação comercial; salva via RPC e invalida wa-canais + todas as queries rel-*
- ConfirmDialogs de remoção WA/FB com textos distintos por modo (desconectar vs ocultar) e tipo; falha parcial não finge sucesso (mantém item, loga erro, toast warn)
- Seção Facebook (#facebook): fluxo OAuth completo — fbAuthStart redireciona, retorno via ?fb=connect&code chama fbPages e abre seleção de Página (com estado vazio explicativo e Cancelar), ?fb=error&motivo mapeia 6 motivos (login/state/config/vault/sessao/meta); limpar params com replace
- Lista de Páginas FB: badge composto (Desconectado / Token inválido / Webhook pendente / Conectado); ações Reconectar e Remover conexão; erros específicos 'outra_org' e permissão (forbidden = só admin/supervisor)
- Seção API Oficial (IntegracaoCloudApi, #api-oficial): checklist de secrets do servidor (META_WHATSAPP_TOKEN, META_WA_APP_SECRET, META_WA_VERIFY_TOKEN, CLOUD_API_ATIVO, CLOUD_BOT_DISPATCH), URL do webhook com Copiar, aviso quando não há canal de disparo definido; números oficiais com papel (atendimento/disparo/ambos) e confirmação na Meta; ações Verificar na Meta (por canal), Papel (com flag disparo padrão), Remover, Cadastrar número oficial (alias, phone_number_id, WABA opcional, papel); atendente vê a seção sem o painel (diagnóstico só carrega com podeConfig para evitar 403)
- Templates Cloud API: lista com status Meta (aprovado/pendente/rejeitado/pausado/desativado/rascunho), toque do remarketing (1-5), variáveis {{n}} detectadas do corpo com rótulo/exemplo; ações Editar, Usar no toque N (exige aprovado + toque), Marcar como enviado à Meta (rascunho), Remover, Novo modelo, Sincronizar com a Meta
- Seção Maturação (#maturacao): gate DUPLO — podeMaturacao = SÓ admin (não usar podeConfig: gestor tomaria 'sem acesso' nas RPCs); estados backend-off / sem permissão / loading / erro / vazio; chips com badges de conexão, status de maturação (novo/aquecendo/pausado/maduro/banido/erro), score de saúde 0-100 com classe, e proxy (pendente/ativo com resumo/sem proxy); alertas de perfil não confirmado e erro de proxy
- Ações por chip de maturação: Conectar/Reconectar (MatQrModal: checkbox 'já defini foto, nome e recado' OBRIGATÓRIO antes de liberar o QR; QR renova 60s; polling 3s; ao conectar dispara aquecimento automático com toast distinto se perfil pendente); Proxy (MatProxyModal: prefill sem senha — senha em branco mantém a atual; salvar = gravar RPC + aplicar na Evolution com estado 'pendente' se recusar; Remover proxy com confirm); Excluir (definitivo, derruba sessão e apaga histórico do chip)
- MatNovoModal: apelido obrigatório (max 40), operadora opcional (Vivo/Claro/TIM/Oi/Outra), proxy opcional validado ANTES de criar (host + porta 1-65535); guarda chip_id criado para retry sem duplicar; se proxy falhar, orienta a não ler o QR antes de corrigir
- Seção Saúde das integrações: placeholder estático 'Nenhum evento recente' (sem fonte de dados hoje — decidir na v2 se implementa ou mantém)
- Estados 'backend não configurado' (isSupabaseConfigured / FB_REAL / MATURACAO_REAL false) em todas as seções, com botões que só mostram toast
- Página é fullBleed com rolagem única e âncoras #facebook, #api-oficial e #maturacao (ids nas sections) — links externos dependem dessas âncoras; CSS escopado em Integracoes.css reutilizado pelo IntegracaoCloudApi (.int-section/.int-card/.conn-row/.btn-sm/.badge)

### `/relatorios` — src/pages/Relatorios.tsx

**595 linhas · complexidade 5/5 · acoplamento: EXTRAIDA**

Relatórios de desempenho (fullBleed): filtros por período (presets + custom), canal, origem, responsável, etapa, status e conexão; abas com KPIs e tabelas DataTable exportáveis em CSV; atendente vê apenas os próprios dados (filtro travado por papel); some se REL_REAL for falso.

Abas internas: Resumo · Vendas · Atendimento e equipe · Financeiro · Detalhamento

Veredito: Toda a busca e semântica de dados (queries Supabase, períodos SP, dedup por pessoa canônica, exclusão do número interno, agregações) vive em hooks/funções puras de src/data/relatorios.ts — a página importa e consome, sem nenhum supabase.from/rpc/invoke inline. O que existe no componente são apenas derivações de apresentação sobre dados já carregados (ordenar conexRows, escolher gargalos, frasesConexoes), que a v2 pode replicar ou copiar livremente.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useRelatorioOpcoes (opções de filtro: responsáveis, origens, colunas do funil, conexões WA) | hook | src/data/relatorios.ts |
| useResumo (KPIs executivos com comparação vs período anterior) | hook | src/data/relatorios.ts |
| useComercial (funil, série de oportunidades/dia, por status, paradas +7d) | hook | src/data/relatorios.ts |
| useAtendimento (conversas, msgs in/out, 1ª resposta, por hora/dia/canal) | hook | src/data/relatorios.ts |
| useEquipe (métricas comerciais + atendimento por atendente, linha 'Não atribuído') | hook | src/data/relatorios.ts |
| useFinanceiro (parcelas, previsão 6m, evolução, por serviço) | hook | src/data/relatorios.ts |
| useOrigens (oportunidades por origem) | hook | src/data/relatorios.ts |
| useConexoes (desempenho por conexão/chip WhatsApp, ~26 métricas por linha) | hook | src/data/relatorios.ts |
| montaLinhasEquipe / montaLinhasConexao / resolvePeriodo / kpi / exportarCSV / spHoje / chaveCanonicaTelefone (funções puras + export CSV client-side; FONTE ÚNICA das linhas por atendente) | servico | src/data/relatorios.ts |
| REL_REAL (flag isSupabaseConfigured && supabase — página some se falso) | servico | src/data/relatorios.ts (deriva de src/lib/supabase.ts) |
| useOrg → currentOrg.id/.name/.role (org ativa + papel; consumido pela página e por TODOS os hooks rel-*) | contexto | src/context/OrgContext |
| useAuth → user.id (trava o filtro responsavel para papel atendente) | contexto | src/context/AuthContext |
| useToast (feedback 'Dados atualizados') | hook | src/hooks/useToast |
| useQueryClient (TanStack) → invalidateQueries de todas as queryKeys prefixo 'rel-' no botão Atualizar | hook | @tanstack/react-query (uso em src/pages/Relatorios.tsx) |
| supabase.from: contatos, conversas, mensagens, oportunidades, cobrancas, cobranca_pagamentos, canais, funil_colunas, fontes_aquisicao, organizacao_usuarios (com paginação fetchAll por .range) — TODAS encapsuladas dentro dos hooks acima, nenhuma na página | hook | src/data/relatorios.ts |

Paridade obrigatória:
- Guard REL_REAL: se falso, renderiza só o vazio 'Relatórios indisponíveis' (nada mais)
- Filtro de período: presets hoje/ontem/7d/30d/mês atual/mês anterior/personalizado; custom mostra 2 inputs date (ini≤fim, max=hoje SP); demais mostram o label do intervalo resolvido; fuso America/Sao_Paulo e fim exclusivo via resolvePeriodo
- Filtros primários: Canal (evolution=WhatsApp / meta=Facebook — afeta só conversas/atendimento) e Responsável (populado por useRelatorioOpcoes)
- Botão 'Mais filtros' expande segunda linha: Origem, Etapa (coluna do funil), Status da oportunidade (em_andamento/ganho/perdido/cancelado), Conexão de WhatsApp
- Permissão por papel: atendente (currentOrg.role==='atendente') tem responsavel travado no próprio user.id (inclusive no 'Limpar tudo'), select Responsável oculto, chip de responsável oculto, blocos 'Desempenho por atendente' (Resumo e Atendimento) ocultos e opção 'Por responsável' do Detalhamento removida
- Chips de filtros ativos com rótulo resolvido (nomes vindos de useRelatorioOpcoes), remoção individual (✕) e botão 'Limpar tudo'
- Botão 'Atualizar': invalida todas as queries com queryKey prefixo 'rel-' + toast 'Dados atualizados'
- Linha de contexto sob as abas: período atual · comparado ao período anterior · nome da organização
- 5 abas: Resumo, Vendas, Atendimento e equipe, Financeiro, Detalhamento (estado local, sem rota)
- Aba Resumo: 6 KPI hero (Pessoas que chamaram, Clientes fechados, Taxa de conversão, Receita recebida, Valores em atraso, Conversas sem resposta) com tooltip explicativo, delta ▲/▼ vs período anterior (sentido maior/menor/neutro, deltaPct null vira '—') ou nota fixa; DataTable por conexão (sem a linha 'sem', ordenada fechados→pessoas→taxa); DataTable por atendente via montaLinhasEquipe (só admin); 4 GargCards de gargalos (sem resposta, paradas +7d, canal com pior conversão com alerta <5%, atendente com mais contatos)
- Aba Vendas: 4 KPIs; painel Funil comercial (barras por etapa real); 'Situação das oportunidades' como Donut, ou stat único quando há 1 status, ou vazio; LineChart 'Novas oportunidades por dia' (vazio informativo se <2 pontos); seção Origens com Bars top-10 (só se >1 origem) + DataTable de origens
- Aba Atendimento: 7 KPIs (inclui 'Tempo até 1ª resposta' que vira 'Indisponível' quando null); MiniBars volume por hora (24) e por dia da semana (Dom–Sáb); Donut conversas por canal; DataTable de atendentes com aviso da regra oficial de atribuição (só admin)
- Aba Financeiro: 8 KPIs; Bars previsão de recebimento 6 meses; LineChart evolução de recebimentos 6 meses; Donut parcelas por status (Pagas/Previstas/Não pagas/Canceladas); Receita por serviço (Bars, ou stat único se 1 serviço); painel Economia gerada (usa useResumo; vazio explicativo se economiaPreenchida=false)
- Aba Detalhamento: seletor interno Por responsável / Por conexão / Por origem; DataTable de carteira por atendente (receita contratada/recebida); SecaoConexoes com 6 painéis de destaque (mais pessoas, mais fechados, melhor conversão, melhor qualificação, maior receita, menor 1ª resposta), painel de frases comparativas (frasesConexoes) e DataTable gigante (~26 colunas com taxas, tempos, receitas, economia, ticket); DataTable por origem; botões de navegação para /cobrancas e /kanban; card 'Outros detalhamentos'
- DataTable genérica (usada 7x): busca textual por searchKeys, ordenação clicável por qualquer coluna (asc/desc com setas), paginação com 10/25/50 por página e pager ‹ ›, contador de registros, vazio 'Nenhum registro.', e Exportar CSV das linhas FILTRADAS com metadados (organização/período/gerado + regras), separador ';', BOM UTF-8 e nome de arquivo derivado do período
- Rótulos especiais: conexão removida vira 'Conexão removida (nome)' via snapshot; tipo de origem traduzido (Tráfego/URA/Orgânico/...); 'Não configurado' para tipo/gestor vazios; linha 'Não atribuído' na equipe
- Estados por seção via <Estado>: 'Carregando dados…', 'Erro ao carregar: <msg>', e vazios específicos (Vazio) distinguindo zero de indisponível; KPI null renderiza card 'Indisponível' com o tooltip como texto
- Formatação PT-BR consistente: inteiros, BRL, % com 1 casa, minutos→'Xh Ymin', pluralização, datas dd/mm/aaaa

### `/facebook` — src/pages/Facebook.tsx

**797 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

Caixa de atendimento do Messenger/Facebook (fullBleed): dispatcher FB_REAL renderiza inbox real (conversas, envio de texto/mídia/áudio, scripts, status/etiquetas, KanbanContatoBox) ou versão de demonstração mock.

Veredito: O componente não tem nenhuma query/mutation Supabase inline — todo acesso a dados vive em hooks/serviços de src/data (facebook.ts, scripts.ts, atendimento.ts, kanban.ts) que a página v2 pode importar direto. O que resta no corpo é orquestração de UI reaproveitável com cuidado: estado local espelho para otimismo (setContacts sobre live.data) e invalidações diretas com queryKeys hardcoded ['fb-conversas'] / ['etiquetas'].

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useFbConversations | hook | src/data/facebook.ts (query 'fb-conversas': conversas + contatos!inner + canais(tipo=facebook) + mensagens; polling 6s + realtime postgres_changes em mensagens/conversas; ordena aguardando→abertas→encerradas) |
| useSendFbMessage | hook | src/data/facebook.ts (invoca edge function meta-send-message com texto; lê erro real em error.context) |
| useSendFbMedia | hook | src/data/facebook.ts (invoca edge function meta-send-message com etapa_id/audio_path/midia_path + legenda) |
| useFbStatus | hook | src/data/facebook.ts (edge function meta-manage action=status — páginas conectadas, base do bloqueio de envio) |
| meta-send-message / meta-manage | edge-function | supabase/functions (chamadas via supabase.functions.invoke dentro de src/data/facebook.ts) |
| subirAudioGravado / subirMidiaInbox | servico | src/data/facebook.ts (upload no bucket privado 'script-midia' sob prefixo da org) |
| traduzErroFb | servico | src/data/facebook.ts (tradução de erros da Meta, incl. janela 24h '(#10)') |
| useScripts('facebook') | hook | src/data/scripts.ts (supabase.from('scripts'), filtra ativos com canal facebook) |
| useScriptEtapaCounts | hook | src/data/scripts.ts (supabase.from('script_etapas') — contagem de etapas de texto por script) |
| urlAssinadaAnexo | servico | src/data/scripts.ts (createSignedUrl 1h no bucket 'script-midia' — imagens/vídeos/docs/áudio, sempre sob demanda) |
| useStatusDefs | hook | src/data/atendimento.ts (supabase.from('conversa_status_def')) |
| useEtiquetas | hook | src/data/atendimento.ts (supabase.from('etiquetas')) |
| useOrgUsuarios | hook | src/data/atendimento.ts (organizacao_usuarios + usuarios, status=ativo — seletor de responsável) |
| useAtendimentoActions (definirStatusConversa, definirEtiquetasContato, criarEtiqueta, atualizarContato) | hook | src/data/atendimento.ts (updates em conversas/contatos, insert em etiquetas) |
| useAuth | contexto | src/context/AuthContext.tsx (user.id p/ aba Minhas; user.name/email p/ variáveis de script) |
| useOrg | contexto | src/context/OrgContext.tsx (currentOrg.id em uploads/invalidations; currentOrg.name em variáveis) |
| useOportunidadesDoContato / useFunisDaOrg | hook | src/data/kanban.ts (usados dentro de KanbanContatoBox — componente compartilhado reutilizável) |
| chamarGarantirEntrada → rpc garantir_oportunidade_entrada | rpc | src/data/kanban.ts (via KanbanContatoBox, 'Adicionar ao Kanban') |
| fetchEtapasParaEnvio / useRegistrarExecucaoScript | servico | src/data/scripts.ts (via ScriptSequenceModal: carrega etapas e audita em script_execucoes) |
| removerMensagemFalha → rpc remover_mensagem_falha | rpc | src/data/whatsapp.ts (via ScriptSequenceModal, remove mensagem falhada sem duplicar) |
| useFichasDaOportunidade / useCriarNovaVersaoFicha | hook | src/data/fichaJudicial.ts (via FichaJudicialBox dentro do KanbanContatoBox) |
| FB_CONTACTS / FB_QUICK | servico | src/data/facebookDemo.ts (dados estáticos — só na versão mock FacebookMock quando FB_REAL=false) |

Paridade obrigatória:
- Dispatcher FB_REAL: renderiza FacebookInbox (real) ou FacebookMock (demo estática com popovers filter/attach/quick e ações toast-only) — decidir na v2 se o mock é mantido
- Lista de conversas: busca por nome/última mensagem + 4 abas (Todas / Minhas = respId===user.id / Não atribuídas = sem respId / Pendentes = unread>0 ou aguardando resposta, com tooltip explicativo)
- Ordenação do hook: conversas abertas aguardando resposta primeiro (mais antiga no topo), depois abertas por atividade, encerradas por último — deve ser preservada
- Card da conversa: avatar por iniciais/cor, nome, ícone de alerta + 'Aguardando há X' com cor por faixa (neutro <30min / âmbar / vermelho ≥2h / crítico ≥24h), nome da Página, prévia, até 2 etiquetas + '+N' com cor via corDaEtiqueta, badge de não lidas (99+)
- Estados da lista: 'Carregando conversas…', vazio por aba, e tela cheia 'Facebook não conectado' (fbStatus.isFetched + nenhuma página conectada + zero conversas) com CTA para /integracoes?tab=facebook
- Chat vazio: EmptyState 'Selecione uma conversa' quando current.id vazio
- Header do chat: avatar, nome, email ou 'Messenger', meta-células Canal/Página/Status (bolinha colorida)/até 3 etiquetas, botão Editar dados (desabilitado sem contatoId)
- Bolhas por tipo: texto; imagem com URL assinada sob demanda + lightbox + fallback 'Imagem indisponível' com retry; áudio via AudioMessage (resolve URL no player); vídeo com player e fallback; documento com nome/extensão/tamanho e botão Abrir (URL assinada gerada na hora, nunca persistida)
- Ack de envio: ✓/✓✓ colorido (lida azul, entregue, enviada, pendente 🕗, falhou !) + rótulo 'via Página' para mensagens enviadas pelo Business Suite (origem='pagina')
- Falha de envio: banner na bolha com erro traduzido (traduzErroFb — janela 24h do Messenger, token inválido, arquivo grande etc.) e botão 'Tentar novamente' que reenvia por etapaId ou anexoPath (retryMidia)
- Composer: textarea auto-resize (máx 120px), Enter envia / Shift+Enter quebra linha, envio otimista (bolha 'pendente' local antes da mutation), label 'Responder no Messenger · Página'
- Bloqueio por canal desconectado: se a Página da conversa não está 'conectado' — aviso âmbar com link Reconectar, placeholder alterado, textarea/botões de envio/áudio/mídia desabilitados (histórico permanece visível)
- Popover Scripts: lista scripts do canal facebook com contagem de etapas ('N msgs'), vazio orienta criar em Scripts; abre ScriptSequenceModal (envio sequencial texto+imagem/áudio com intervalo 2,5s, interpolação {{variáveis}} com ctx cliente/atendente/empresa, confirmação real por etapa, retry só do que faltou, remoção de mensagem falhada via RPC, auditoria em script_execucoes)
- AudioRecorder: gravação no microfone, limite 25MB, upload no bucket privado e envio real (lança em falha)
- Popover Mídias → MediaComposer: imagem/vídeo/documento com legenda opcional; upload no bucket + envio via meta-send-message
- Painel Dados do cliente: colapsável (botão recolher/reabrir; drawer com overlay em <1200px; seleção de conversa no mobile fecha o drawer)
- Edição inline do contato: nome, e-mail (validação regex, erro 'E-mail inválido.'), observações, responsável (select de usuários ativos da org, opção 'Não atribuído'); estados Salvando…/erro; atualização otimista + acoes.atualizarContato
- Seletor de Status: popover com status ATIVOS da org (bolinha de cor), aplicação otimista + definirStatusConversa, fallback 'Definir status' / '—'
- Etiquetas do CONTATO (não da conversa): chips coloridos com remover (X), popover buscar/criar com autofocus, Enter cria, botão 'Criar "nome"', trava anti clique-duplo (etqSaving), propagação otimista para TODAS as conversas do mesmo contatoId, cor padrão #19C37D ao criar, invalidação de ['etiquetas'] e ['fb-conversas']
- KanbanContatoBox: mostra oportunidade aberta (funil/etapa/responsável/serviço/benefício/valor + 'Ver no Kanban') ou 'Adicionar ao Kanban' (modal com escolha de funil quando há mais de um, RPC garantir_oportunidade_entrada) + FichaJudicialBox aninhada
- Campos informativos: Página/Canal, Origem do lead, Última interação (locale pt-BR), Observações internas
- Lightbox de imagem: overlay clicável, botão fechar, fecha em onError
- Comportamentos globais: auto-scroll das mensagens ao trocar conversa/receber msg, reset de editMode/picker ao trocar conversa, seleção mantida entre refetches (fallback para primeira conversa), resize listener 1200px para modo mobile/drawer
- Tempo real: polling de 6s + subscription realtime em mensagens/conversas invalidando ['fb-conversas'] — a v2 herda isso de graça usando useFbConversations

### `/agendamentos` — src/pages/AgendamentosMensagens.tsx

**518 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

Central de Agendamentos de Mensagens (fullBleed): lista agendamentos da organização agrupados por sequência, com cards de contagem por status, edição/cancelamento/reagendamento e criação de novas sequências — a rota foi reaproveitada da antiga agenda presencial (Fase 2B).

Abas internas: Visão geral · Programados · Enviados · Falhas · Bloqueados · Cancelados

Veredito: Todas as leituras/mutations vivem em hooks de src/data (whatsapp.ts, atendimento.ts, contatos.ts) via RPCs seguras, e até a consulta pontual de conversa é função de serviço exportada (conversaAtivaDoContato) — a página não tem nenhum supabase.from/rpc inline. O que fica no componente é só derivação pura (agrupamento por sequencia_id e filtros, apoiados em helpers de src/lib/agendamentoMensagem.ts), que a v2 pode copiar ou promover a lib sem tocar na camada de dados.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAgendamentosOrg (supabase.from('mensagens_agendadas') + join contatos, refetch 30s) | hook | src/data/whatsapp.ts:960 |
| useWaCanais (supabase.from('canais') tipo=whatsapp) | hook | src/data/whatsapp.ts:560 |
| useOrgUsuarios (supabase.from('organizacao_usuarios') + join usuarios) | hook | src/data/atendimento.ts:63 |
| useBuscaContatos (supabase.from('contatos') .or ilike, min 2 chars, limit 12) | hook | src/data/contatos.ts:140 |
| useAgendarSequencia -> rpc('agendar_sequencia') | rpc | src/data/whatsapp.ts:908 |
| useEditarAgendamento -> rpc('editar_agendamento') | rpc | src/data/whatsapp.ts:923 |
| useCancelarAgendamento -> rpc('cancelar_agendamento') | rpc | src/data/whatsapp.ts:938 |
| useReagendarAgendamento -> rpc('reagendar_agendamento') | rpc | src/data/whatsapp.ts:997 |
| conversaAtivaDoContato (supabase.from('conversas') pontual, resolve conversa do Novo agendamento) | servico | src/data/whatsapp.ts:897 |
| subirMidiaWa (storage upload bucket privado 'script-midia'; usado pelo AgendarMensagemModal filho) | servico | src/data/whatsapp.ts:677 |
| useOrg (currentOrg.id — usado na página e no modal filho) | contexto | src/context/OrgContext.tsx |
| WA_REAL (gate: sem backend configurado a página vira aviso estático) | servico | src/data/whatsapp.ts:10 |
| traduzErroAgendamento (tradução de códigos de erro das RPCs p/ texto amigável — já embutida nos hooks) | servico | src/data/whatsapp.ts:1012 |
| agendamentoMensagem (contarCards, rangePeriodo, statusSequencia, agendaEditavel/Reagendavel, máscaras/validações SP usadas no modal) | servico | src/lib/agendamentoMensagem.ts |
| useToast (feedback de sucesso/erro das mutations) | hook | src/hooks/useToast |

Paridade obrigatória:
- Gate WA_REAL: sem backend, renderiza só 'Disponível com o backend configurado.'
- 6 abas (Visão geral/Programados/Enviados/Falhas/Bloqueados/Cancelados), cada uma com texto de vazio próprio e botão 'Ver todos os agendamentos'
- 5 cards indicadores clicáveis (Programados/Enviados/Falhas/Bloqueados/Cancelados) que fazem toggle da aba correspondente; contam GRUPOS (sequência = 1), não mensagens
- Agrupamento por sequencia_id (senão pelo id): status geral via statusSequencia, soma de tentativas, primeiro erro/motivo_bloqueio, ordenação por ordem_na_sequencia e executar_em, lista ordenada do mais recente
- Filtro de período no topo (Todo o período/Hoje/Amanhã/7d/30d) via rangePeriodo sobre executar_em do primeiro item
- Painel de filtros recolhível (abre também se filtro ativo): busca livre por cliente/telefone/conteúdo dos itens, canal, atendente criador, tipo de mensagem; botão 'Limpar filtros' e marcador '·' no botão Filtros
- Tabela com colunas Data/hora (fuso America/Sao_Paulo), Cliente (avatar de iniciais + telefone), Canal (pill nome_canal_snapshot), Tipo (chip 'Sequência · N' ou tipo), Conteúdo (prévia: texto > nome_arquivo > tipo), Atendente (nome resolvido via useOrgUsuarios), Status (badge ST_META), Tentativas
- Clique na linha abre/fecha painel lateral de detalhes (classe com-painel no container); trocar de aba limpa a seleção
- Painel lateral: cabeçalho do cliente com botão 'Abrir conversa' (navega /whatsapp?conversa=<id>), dl com Canal/Status/Tipo/Tentativas/Criado por/Criado em/Agendado para/Enviado em (condicional)
- KPIs de desempenho SÓ para sequência: total, enviadas, falhas (falhou+bloqueada), % sucesso
- Lista de mensagens do grupo com numeração (se sequência), data/hora, status individual, texto/arquivo, '✓ Enviada em' e erro (motivo_bloqueio || ultimo_erro)
- Ações condicionais no rodapé do painel (rodapé some se nenhuma): Editar + Cancelar (só mensagem única com agendaEditavel=status 'agendada'), Reagendar (só única com agendaReagendavel: falhou/bloqueada/expirada), Cancelar pendentes (sequência com itens 'agendada')
- Confirmação de cancelamento em Modal próprio (nunca window.confirm) com rótulo dinâmico ('Cancelar N mensagens'), estado 'Cancelando…' (isPending), closeOnBackdrop travado durante a mutation; cancelar sequência itera cancelarMut item a item
- Novo agendamento em 2 passos: modal de busca de cliente (>=2 chars, mostra até 8, autoFocus, vazio 'Nenhum cliente encontrado'), resolve conversa ativa via conversaAtivaDoContato — erro amigável se o contato não tem conversa aberta
- AgendarMensagemModal (filho) em 3 modos — criar sequência: até 20 blocos (texto/imagem/áudio/vídeo/documento) com mover/duplicar/remover, upload p/ bucket script-midia, gravação de áudio (AudioRecorder), legendas; editar: texto/canal/data-hora (mídia mantém arquivo); reagendar: só canal/data-hora (texto read-only)
- Modal filho: só lista canais válidos p/ envio (canalValidoParaEnvio), atalhos de horário (Hoje +5min, Hoje à tarde, Amanhã 09:00/14:00, Em 3 dias), máscaras DD/MM/AAAA e HH:mm em fuso SP, validações (telefone acionável, horário futuro +1min, mídia por mime/tamanho 16/25MB), resumo do envio, aviso de janela longa, pré-visualização estilo chat com 'via <canal>'
- Toasts: 'Agendamento criado.', 'Mensagem reagendada — voltou para a fila.', 'Agendamento atualizado.', 'Agendamento cancelado.', 'Mensagens pendentes canceladas.' + mensagens de erro traduzidas das RPCs
- Estados da lista: carregando (5 skeletons + header), erro com botão 'Tentar novamente' (refetch), vazio geral com CTA 'Novo agendamento', vazio por filtro com 'Limpar filtros', vazio por aba; refetch automático a cada 30s
- Sem condição por papel no front: qualquer usuário da org vê e opera tudo (isolamento por RLS/org no backend)

### `/scripts` — src/pages/Scripts.tsx

**536 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

Biblioteca de scripts e mídias (fullBleed): CRUD de scripts com categorias, favoritos, canais (WhatsApp/Facebook), etapas em sequência (texto/imagem/áudio/vídeo/documento), variáveis de substituição e preview estilo celular por canal; filtro por canal (todos/whatsapp/facebook/ambos) e busca.

Veredito: Zero queries inline no componente: todo acesso a Supabase (tabelas scripts/script_categorias/script_etapas e Storage script-midia) vive em src/data/scripts.ts como hooks react-query e funções async reutilizáveis, que a v2 pode importar diretamente. O componente contém apenas estado de UI (filtros, construtor de etapas, modais, drawer) e lógica de orquestração/validação de formulário, que é o que será reescrito no redesign.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useScripts | hook | src/data/scripts.ts |
| useScriptCategorias | hook | src/data/scripts.ts |
| useScriptMutations (criar/atualizar/excluir/favoritar em scripts; excluir limpa Storage best-effort) | hook | src/data/scripts.ts |
| useScriptCategoriaMutations (criar/renomear/excluir em script_categorias) | hook | src/data/scripts.ts |
| useScriptEtapaMutations.salvarEtapas (reconcilia script_etapas + upload no bucket script-midia) | hook | src/data/scripts.ts |
| fetchEtapas(scriptId) — carrega script_etapas ordenadas | servico | src/data/scripts.ts |
| urlAssinadaAnexo(path) — storage.createSignedUrl no bucket script-midia | servico | src/data/scripts.ts |
| substituirVariaveis / SCRIPT_VARIAVEIS / formatarTamanho (utilitários puros) | servico | src/data/scripts.ts |
| SCRIPTS_REAL (gate isSupabaseConfigured) | servico | src/data/scripts.ts |
| useAuth (user.name/email p/ contexto do preview e autor_id) | contexto | src/context/AuthContext |
| useOrg (currentOrg.id em todas as queries; currentOrg.name no preview) | contexto | src/context/OrgContext |

Paridade obrigatória:
- Gate SCRIPTS_REAL: sem Supabase configurado renderiza EmptyState 'Backend não configurado'
- Busca com debounce de 250ms sobre título + conteúdo (case-insensitive)
- Filtro por categoria na sidebar ('Todas as categorias' + contagem de scripts por categoria)
- Filtro por canal: todos/whatsapp/facebook/ambos com contagens — script sem canais classifica como 'ambos' (classificaCanal)
- Filtro 'Apenas favoritos' (toggle)
- CRUD de categorias: criar e renomear em modal (validação: nome obrigatório + duplicidade case-insensitive na org), apagar com ConfirmDialog cuja mensagem avisa que N scripts serão movidos para 'Sem categoria'; kebab menu por categoria; ao apagar categoria ativa, filtro volta para 'all'
- Lista de cards: título, badges de canal (fallback WA+FB quando canais=[]), preview do conteúdo (1ª msg, \n colapsado), estrela de favoritar (toggle otimista via mutation), kebab com Editar/Duplicar/Apagar; contador '{N} scripts' no cabeçalho
- Auto-seleção: mantém script selecionado se ainda existe; senão seleciona o 1º da lista filtrada (ou 1º geral)
- Painel de detalhe (3ª coluna): breadcrumb categoria › título, ações Editar/Favoritar/Duplicar/Copiar(clipboard writeText do conteudo)/Excluir, badges de canal, descrição, conteúdo da 1ª mensagem em pre-wrap; estado vazio 'Selecione um script'
- Responsivo: <1700px o painel editor vira drawer (classe editor-open/has-drawer, botão flutuante de reabrir, overlay que fecha); >=1700px sempre aberto; clicar num card em modo drawer abre o painel
- Construtor (modal 860px, criar/editar): Título* (obrigatório), Descrição, Categoria (select com 'Sem categoria'), Canal* toggles WhatsApp/Facebook (mínimo 1), Tags (CSV), checkboxes Favorito e Ativo
- Prefill ao criar: canais e categoria herdam dos filtros ativos da listagem
- Sequência de etapas: toolbar adiciona texto/imagem/áudio/vídeo/documento; por etapa: mover cima/baixo, duplicar (sem id), excluir (mínimo 1 etapa); texto = textarea com contador de caracteres; mídia = file input oculto com accept por tipo (ACCEPT map), preview (img/audio/video/doc-card), nome+tamanho formatado, botão 'Trocar', campo Legenda opcional
- Validação ao salvar: título obrigatório, >=1 canal, >=1 etapa com conteúdo; erro por etapa ('Mensagem vazia.'/'Selecione um arquivo.') e erro geral do backend inline no modal
- Salvar: scripts.conteudo = 1ª etapa de texto; criar ou atualizar script e depois salvarEtapas (reconcilia: upload+insert/update ANTES dos deletes; remove objetos órfãos do Storage); fecha modal, seleciona o script salvo, toast
- Editar: abre modal imediatamente com fallback provisório ([{texto, conteudo}]) enquanto fetchEtapas carrega; gera URLs assinadas (urlAssinadaAnexo) para preview das mídias existentes; falha no fetch mantém o fallback silenciosamente
- Chips de variáveis (SCRIPT_VARIAVEIS: nome_cliente, primeiro_nome_cliente, nome_atendente, email_atendente, nome_empresa, telefone, data_atual): insere na posição do cursor da textarea de TEXTO ativa (activeMsg ref), restaurando foco/seleção; ignora etapas de mídia
- Preview estilo celular por canal: toggle WhatsApp/Facebook só quando ambos marcados; FB mostra cabeçalho '{titulo} · Messenger'; bolhas na ordem das etapas (texto interpolado com substituirVariaveis e contexto demo: cliente 'Maria Silva', atendente=user.name, empresa=org.name, tel fake), mídia renderizada (img/audio/video/doc), legenda de mídia interpolada, hora fake 09:41; vazio: 'As mensagens aparecem aqui.'
- Duplicar script: cria '{titulo} (cópia)' copiando SÓ etapas de texto; toast avisa 'mídias não copiadas' quando havia mídia
- Excluir script: ConfirmDialog destrutivo (label 'Excluir'); mutation limpa Storage best-effort antes do DELETE; limpa seleção se era o atual
- Estados da lista: isLoading ('Carregando…'), isError ('Erro ao carregar scripts.'), vazio contextual com 8 mensagens distintas conforme filtro ativo (sem scripts / busca / favoritos / cada filtro de canal / categoria) + CTA 'Criar primeiro script'/'Novo script'
- Kebab menus (script e categoria) com backdrop que fecha ao clicar fora; abrir um fecha o outro
- Toasts de sucesso/erro em todas as ações (useToast); erros de mutation mostrados como toast 'warn'
- Sem condicional por papel no front — RLS cuida (delete de categoria exige admin/supervisor); paridade = mostrar tudo a todos

### `/cobrancas` — src/pages/Cobrancas.tsx

**195 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

Cobranças da organização aos próprios clientes (fullBleed): quando WA_REAL renderiza o app real (src/components/CobrancasApp.tsx, sobre as tabelas cobrancas/cobranca_pagamentos); caso contrário mostra tabela mock com dados seed (contratos, ciclos restantes, status) e menu de ações de demonstração.

Veredito: Toda a camada de dados (queries com joins, métricas, 4 mutations via RPC com invalidação react-query) já vive em src/data/cobrancas.ts e hooks auxiliares (useBuscaContatos, useOrgUsuarios) — CobrancasApp.tsx só compõe hooks com estado local de UI (filtro/busca/modais via useMemo/useState). O Cobrancas.tsx da rota é apenas o gate WA_REAL + mock com seed descartável; a v2 pode importar os hooks diretamente sem nenhuma extração prévia.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| WA_REAL (flag que decide mock vs app real; existe também COB_REAL equivalente) | servico | src/data/whatsapp.ts (COB_REAL em src/data/cobrancas.ts) |
| useOrg (currentOrg.id para escopo das queries; currentOrg.role para gate gestor) | contexto | src/context/OrgContext |
| useCobrancas — supabase.from('cobrancas').select(SEL_COB com joins contatos + responsavel:usuarios).eq('organizacao_id') | hook | src/data/cobrancas.ts |
| useCobranca(id) — detalhe com cobranca_pagamentos(*) + cobranca_eventos(+usuarios) embutidos | hook | src/data/cobrancas.ts |
| useCobrancasMetricas — supabase.from('cobranca_pagamentos') e agrega métricas do mês + previsão de 6 meses no cliente | hook | src/data/cobrancas.ts |
| useCriarCobranca → rpc('criar_cobranca_com_parcelas') | rpc | src/data/cobrancas.ts |
| useRegistrarBaixa → rpc('registrar_baixa_parcela') | rpc | src/data/cobrancas.ts |
| useAlterarStatusParcela → rpc('alterar_status_parcela') | rpc | src/data/cobrancas.ts |
| useCancelarCobranca → rpc('cancelar_cobranca') | rpc | src/data/cobrancas.ts |
| useBuscaContatos(term) — autocomplete de contatos no ContatoPicker (debounce 300ms, mínimo 2 chars) | hook | src/data/contatos.ts |
| useOrgUsuarios — lista de usuários da org para o select de responsável | hook | src/data/atendimento.ts |
| useToast — feedback de sucesso/erro | hook | src/hooks/useToast |
| parseMoedaBRL / formataMoedaBRL — parse e formatação de moeda | servico | src/lib/fichaJudicialNormalizers.ts |
| statusCobrancaLabel / statusParcelaLabel — rótulos de status | servico | src/data/cobrancas.ts |
| Modal / ConfirmDialog — componentes de diálogo reutilizados | servico | src/components/Modal.tsx e src/components/ConfirmDialog.tsx |

Paridade obrigatória:
- Gate WA_REAL: renderiza CobrancasApp real; fallback mock (tabela seed, form demo, banner regra 50%/6 meses, menu e paginação fake) é demonstração e pode ser descartado na v2
- 4 stat cards de métricas: Previsto no mês, Recebido no mês, Em atraso (tom amber), A receber — em BRL, com '—' enquanto carrega
- Filtro por status (select): Todas / Ativas / Concluídas / Canceladas (ativa = status != finalizado/cancelado)
- Busca textual client-side sobre nome, telefone, CPF e responsável
- Permissão gestor = role 'admin' ou 'gestor' (via useOrg): só gestor vê 'Nova cobrança', CTA do vazio, ações de parcela e 'Cancelar cobrança'
- Tabela de cobranças: Cliente (avatar iniciais + nome + telefone), Valor mensal, 'X de Y pagas', Próxima cobrança (dd/mm/aaaa), badge de status (Ativa/Concluída/Cancelada), Responsável (avatar ou '—'); linha inteira clicável abre detalhe
- Estados da lista: carregando ('Carregando cobranças…'), erro com mensagem, vazio absoluto (CTA 'Criar primeira cobrança' p/ gestor) distinto de vazio por filtro/busca ('Ajuste a busca ou os filtros'), rodapé com contagem
- Seção 'Previsão de faturamento (6 meses)': cards por mês (mm/aaaa) com previsto, recebido, atraso condicional e qtd de parcelas; só aparece se algum mês tem previsto > 0
- Modal Nova cobrança: ContatoPicker com busca debounced (300ms, >=2 chars, dropdown com loading/vazio, botão Trocar); valor mensal (parseMoedaBRL); qtd parcelas validada 1–60; data da primeira (date input, default hoje); responsável opcional (useOrgUsuarios); descrição do serviço; observações; resumo calculado ao vivo (valor da parcela, nº parcelas, total previsto, primeira e última estimada com clamp de fim de mês); validações com mensagens; estado busy travando fechar/submit
- Modal Detalhe: resumo (telefone, responsável, valor mensal, total previsto, pagas X de Y, próxima); tabela de parcelas (#, vencimento, valor, status com 'Atrasada' derivada de prevista+vencida, pago em, valor pago); histórico de eventos (descrição, autor, timestamp pt-BR) com estado 'Sem eventos'; estados carregando/não encontrada
- Ações por parcela (só gestor): Pagar (abre BaixaModal), Não paga (prevista→nao_paga), Reabrir (nao_paga→prevista), Estornar (paga→prevista) — via rpc alterar_status_parcela
- BaixaModal: registrar pagamento integral (parcial não permitido), data default hoje, observação opcional, erro inline — via rpc registrar_baixa_parcela
- Cancelar cobrança: só gestor e status não cancelado/finalizado; ConfirmDialog destrutivo com aviso (futuras canceladas, pagas preservadas, irreversível) — via rpc cancelar_cobranca
- Tradução de erros de RPC/RLS (traduz(): sem_permissao, parcela_ja_paga, cobranca_cancelada, cobranca_finalizada, valor_invalido, ciclos_invalido, contato_invalido, transicao_nao_permitida)
- Invalidação react-query após toda mutação (lista + métricas + detalhe da cobrança) — já embutida nos hooks de mutation
- Toasts de sucesso ('Cobrança criada', 'Pagamento registrado', 'Parcela atualizada', 'Cobrança cancelada') e de erro traduzido
- Rota fullBleed: página precisa gerenciar a própria altura (.content é overflow:hidden — ver memória rota-fullbleed-altura); estilos compartilhados em src/pages/Cobrancas.css

### `/maturacao` — src/pages/Maturacao.tsx

**777 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

Maturação de Números (aquecimento de chips, isolado do atendimento; envolta em RequireRole admin — papel sem permissão vê card 'Acesso restrito'): painel de chips com QR/status/score, sementes externas, biblioteca de conteúdo, estratégia de aquecimento (perfis/ramp) e configuração do motor (dry_run/ativo).

Abas internas: Chips em maturação · Sementes externas · Biblioteca de conteúdo · Estratégia de aquecimento · Configuração

Veredito: Todo acesso a dados vive em hooks React Query no módulo src/data/maturacao.ts (RPCs, queries e edge function maturacao-manage encapsuladas, com tradução de erros e invalidação de cache embutidas); a página só compõe esses hooks com estado local de UI (modais, rascunho de config, countdown do QR). A v2 pode importar o módulo inteiro e reconstruir a UI sem extração prévia.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useOrg (currentOrg.id/role) | contexto | src/context/OrgContext.tsx |
| useToast | hook | src/hooks/useToast |
| useQueryClient (invalidação manual de ['mat-painel', org] ao fechar QrModal) | hook | @tanstack/react-query (uso direto na página) |
| MATURACAO_REAL (flag isSupabaseConfigured) | hook | src/data/maturacao.ts |
| usePainelMaturacao → rpc maturacao_painel (refetchInterval 30s, staleTime 15s) | hook | src/data/maturacao.ts |
| useConfigMaturacao → rpc maturacao_config_obter | hook | src/data/maturacao.ts |
| useSalvarConfig → rpc maturacao_config_salvar (setQueryData em onSuccess) | hook | src/data/maturacao.ts |
| useAplicarPerfil → rpc maturacao_aplicar_perfil (invalida config+painel) | hook | src/data/maturacao.ts |
| useCriarChip → edge function maturacao-manage {action:'criar'} (cria chip + instância Evolution aquec_*) | hook | src/data/maturacao.ts |
| useAtualizarChip → rpc maturacao_chip_atualizar (usado p/ perfil_ok) | hook | src/data/maturacao.ts |
| useIniciarChip → rpc maturacao_chip_iniciar | hook | src/data/maturacao.ts |
| usePausarChip → rpc maturacao_chip_pausar | hook | src/data/maturacao.ts |
| useExcluirChip → edge function maturacao-manage {action:'remover'} (derruba instância + delete) | hook | src/data/maturacao.ts |
| useQrChip → edge function maturacao-manage {action:'qr'} | hook | src/data/maturacao.ts |
| useStatusChip → edge function maturacao-manage {action:'status'} (polling 3s enquanto QrModal aberto) | hook | src/data/maturacao.ts |
| useSementes → supabase.from('maturacao_sementes').select (dentro do hook) | hook | src/data/maturacao.ts |
| useAdicionarSemente → rpc maturacao_semente_adicionar | hook | src/data/maturacao.ts |
| useExcluirSemente → rpc maturacao_semente_excluir | hook | src/data/maturacao.ts |
| useConteudo → supabase.from('maturacao_conteudo').select (dentro do hook) | hook | src/data/maturacao.ts |
| useAdicionarConteudo → rpc maturacao_conteudo_adicionar (texto apenas; storage/mime null) | hook | src/data/maturacao.ts |
| useExcluirConteudo → rpc maturacao_conteudo_excluir | hook | src/data/maturacao.ts |
| helpers puros: saudeChip, classeScore, formatarNumero, traduzMaturacao + labels (SAUDE/STATUS/SCORE/TIPO/CATEGORIA/RISCO), PERFIS, DIAS_SEMANA | hook | src/data/maturacao.ts |
| DISPONÍVEL SEM UI NA PÁGINA: useProxyChip (from('maturacao_chips') select proxy_*), useDefinirProxy/useRemoverProxy (RPCs proxy), useAplicarProxy (edge {action:'proxy'}) | hook | src/data/maturacao.ts |

Paridade obrigatória:
- Gate de papel: rota envolta em <RequireRole role="admin"> no App.tsx (handle title 'Maturação de Números', SEM fullBleed); papel não-admin vê card 'Acesso restrito' — o gate fica no router, a página nova não precisa reimplementá-lo, mas a rota v2 precisa manter o wrapper
- Guard MATURACAO_REAL: sem backend configurado, renderiza só nota informativa e nada mais
- Banner de modo (informação principal): dry_run vs ativo, textos distintos, botão 'Ativar envios reais'/'Voltar para simulação' com ConfirmDialog dedicado (mensagens diferentes por direção; 'ativo' pede confirmação de perfis+sementes) via useSalvarConfig({modo})
- Card 'Saúde média do pool': ring com média simples dos scores (classeScore ≥75/≥50/<50), só renderiza quando há chips
- Seção Chips: header com contagem total, quantos 'aquecendo' e quantos 'em risco' (saudeChip==='vermelho'); estados loading ('Carregando chips…'), erro (mensagem traduzida) e vazio (CTA explicativo com QR); grid de cards
- ChipCard: semáforo de saúde (saudeChip: erros_7d>=3 vermelho etc.), badges status_maturacao + status_integracao, ring de score 0-100 com classe, barra de rampa (dia_rampa / dias_para_maduro da config, % e pendentes_hoje), KPIs 7d (enviadas/entregues/lidas/erros com destaque bad), taxa de entrega calculada + 'Último erro há X' relativo
- ChipCard ações: checkbox 'Perfil pronto' (useAtualizarChip perfilOk, toasts distintos marcar/desmarcar); Conectar/Reconectar (abre QrModal); Iniciar rampa (desabilitado sem perfil_ok+conectado ou se banido, com title/hint do motivoBloqueio em 3 variantes) vs Pausar (motivo 'pausa manual') conforme status 'aquecendo'; Excluir com ConfirmDialog destructive (aviso de exclusão DEFINITIVA + derrubada da sessão); todos os botões travados enquanto qualquer mutation do card está pending
- NovoChipModal: campo apelido (obrigatório, maxLength 40), select operadora opcional (Vivo/Claro/TIM/Oi/Outra/Não informada), erro inline, botões travados durante criação, fecha bloqueado durante pending; ao criar ENCADEIA direto para o QrModal com o chip_id retornado
- QrModal: gera QR ao abrir; countdown de 60s com auto-renovação do QR enquanto não conecta; polling de status a cada 3s (useStatusChip); estado 'conectado' troca o corpo (check + número formatado + instrução perfil pronto) e o footer (Concluir); botão 'Gerar novo QR' manual; exibe label do status_integracao corrente; ao fechar invalida a query ['mat-painel', org]
- EstrategiaSec: 4 presets de rampa (expresso_7/rapido_14/padrao_30/conservador_45 com resumo de volume, duração e chip de risco), seleção com aria-pressed, clique no ativo é no-op; preset de risco 'alto' exige ConfirmDialog destructive antes de aplicar; badge 'Personalizado' quando perfil_rampa==='custom' (nenhum preset marcado); nota educativa sobre risco
- SementesSec: lista (loading / linha-vazia com orientação 'cadastre pelo menos duas') com botão Remover por item; form apelido (max 40) + número (max 15, inputMode numeric, DDI+DDD) com validação de obrigatórios e erro inline; toasts de sucesso
- ConteudoSec: lista com texto (fallback '(mídia)'), meta tipo · categoria · usos, Remover por item; form com selects Tipo (texto/figurinha/audio/imagem) e Categoria (abertura/resposta/conversa) + input texto max 280 obrigatório; NOTA: a mutation atual só grava texto (storage/mime sempre null)
- ConfigSec: rascunho local semeado uma única vez quando a config chega; estado loading próprio; select Modo desabilitado (apenas informativo, troca é no banner); selects hora_inicio/hora_fim 00:00-23:00 com validação janela (fim > início, mensagem inline + toast); range pct_sementes 0-100 step 5 com % ao lado e hint citando dia_sementes; toggles dos 7 dias da semana com validação mínimo 1 dia; botão Salvar desabilitado quando inválido/pending; rodapé informativo timezone · dias_para_maduro · min_sementes
- Tratamento de erros: todas as mutations passam por traduzMaturacao (mapeia raise exception das RPCs/RLS para frases de admin) e saem como toast 'warn' ou erro inline de formulário
- Auto-refresh de fundo: painel refaz a cada 30s e no focus da janela (motor roda por cron, sem realtime) — a v2 deve preservar esse comportamento apenas usando o hook
- Fora de escopo de paridade mas disponível: UI de proxy por chip (campos proxy_resumo/proxy_ativo/proxy_pendente já vêm na RPC do painel e os 4 hooks existem no data layer, nada renderizado hoje)

### `(fora do roteador — código morto preservado)` — src/pages/Agendamentos.tsx

**604 linhas · complexidade 4/5 · acoplamento: EXTRAIDA**

NÃO é rota e não é importada por ninguém (código morto intencional): antiga agenda de agendamentos PRESENCIAIS com calendário dia/semana/mês, layout de colunas para eventos sobrepostos, conflito de atendente e histórico — a rota /agendamentos foi reaproveitada para AgendamentosMensagens.

Veredito: Todo acesso a dados (queries, mutations, RPC remarcar_agendamento e busca de conflito) já vive em src/data/agendamentos.ts e src/data/atendimento.ts — o componente só compõe hooks e refetch. O que fica inline na página são utilitários PUROS de apresentação (layoutColunas p/ eventos sobrepostos, spParts/spISO/spOffsetMs de fuso America/Sao_Paulo, formatadores PT-BR, traduzErro, descreveAtividade) que a v2 deve mover p/ um util compartilhado, mas não exigem extração de lógica de dados.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAgendamentos(inicioISO, fimISO) — SELECT agendamentos no intervalo com joins atendente/contatos, polling 30s | hook | src/data/agendamentos.ts |
| useProximosAgendamentos(desde, ate) — mesmos joins, exclui cancelado, limit 30, polling 60s | hook | src/data/agendamentos.ts |
| useCriarAgendamento — mutation INSERT em agendamentos | hook | src/data/agendamentos.ts |
| useAtualizarAgendamento — mutation UPDATE com concorrência otimista via atualizado_em (ERRO_CONCORRENCIA) | hook | src/data/agendamentos.ts |
| useRemarcarAgendamento — mutation que chama supabase.rpc('remarcar_agendamento') (valida permissão/conflito, retorna pode_forcar) | rpc | src/data/agendamentos.ts |
| checarConflitoAtendente(orgId, atendenteId, ini, fim, excluirId) — função async avulsa (não-hook) que consulta agendamentos sobrepostos p/ aviso ao vivo | servico | src/data/agendamentos.ts |
| useHistorico(agendamentoId) — SELECT agendamento_atividades com join usuarios (auditoria) | hook | src/data/agendamentos.ts |
| useContatosBusca(termo) — SELECT contatos por nome/telefone (ilike, ≥2 chars, ignora mesclado_em) p/ autocomplete do modal | hook | src/data/agendamentos.ts |
| useOrgUsuarios — usuários ativos da org (organizacao_usuarios join usuarios) p/ filtro e seletor de atendente | hook | src/data/atendimento.ts |
| useOrg (currentOrg.id p/ queries, currentOrg.role p/ permissão gestor) | contexto | src/context/OrgContext.tsx |
| useAuth (user.id p/ criadoPor e checagem de dono) | contexto | src/context/AuthContext.tsx |
| AG_REAL / AG_STATUS / AG_TIPOS / agStatusInfo / ERRO_CONCORRENCIA — constantes/flag de backend configurado | servico | src/data/agendamentos.ts |

Paridade obrigatória:
- Três visões: Dia / Semana / Mês, com default responsivo (dia se largura <720px) e alternância por botões
- Navegação temporal: botão Hoje, setas anterior/próximo (passo 1 dia, 7 dias ou 1 mês conforme visão) e título do período formatado em PT-BR (fmtPeriodo)
- Filtros na toolbar: por atendente (useOrgUsuarios) e por status (AG_STATUS) — aplicados client-side sobre a query do intervalo
- Grade dia/semana: horas 08:00–19:00 (56px/h), cards de evento com layout de COLUNAS para sobreposição temporal (layoutColunas — faixas reutilizáveis por grupo encadeado), 3 tamanhos de card (compact/normal/expanded conforme altura), tooltip com detalhes, cor por status (fundo/borda translúcidos)
- Linha do agora (indicador vermelho) na coluna de hoje quando dentro do expediente; 'hoje' calculado no fuso America/Sao_Paulo
- Clique em área vazia da coluna cria novo agendamento pré-preenchido (hora arredondada a 30min, clamp 08:00–18:00)
- Visão Mês: grid de semanas completas, máx. 3 eventos por célula + badge '+N', dias fora do mês esmaecidos, clique no dia navega para visão Dia
- Painel lateral recolhível (aberto por default só >1100px): MiniCal (navegação de mês independente; escolher dia muda âncora e sai de mês→semana), legenda de status, e painel Próximos agendamentos
- Próximos agendamentos: janela fixa hoje+22 dias (independe da visão), exclui cancelados e já terminados (fimEm >= agora), agrupado por dia com rótulos Hoje/Amanhã/DD-MM, clique abre o modal, botão 'Ver todos' volta p/ hoje na visão Dia e limpa filtro de status; estado vazio próprio
- Rodapé de resumo: total do período + contadores Confirmados / Pendentes / Cancelados+faltas / Realizados
- Modal criar/editar (AgModal): campos cliente* (com autocomplete de contatos ≥2 chars, vínculo a contato_id com chip '✓ vinculado' e link 'abrir' → /contatos?contato=ID), telefone, atendente, data, hora início/fim, tipo (AG_TIPOS; 'Outro' abre campo livre), status, unidade/local, endereço, observações
- Validações do formulário: cliente obrigatório, hora fim > início, data+horários obrigatórios; conversão parede-SP→UTC via spISO
- Permissões: criar = qualquer um; editar = gestor/admin OU dono (criadoPor ou atendenteId == user); senão modo somente-leitura com banner; reatribuir atendente só gestor (atendente comum vê só a si mesmo no seletor)
- Ações rápidas na edição: Confirmar, Realizado, Não compareceu, Remarcar, Cancelar (motivo obrigatório via prompt → campo motivo_cancelamento)
- Concorrência otimista: toda atualização envia atualizadoEmEsperado; conflito vira mensagem amigável (traduzErro cobre conflito_concorrencia, sem_permissao_reatribuir, sem_permissao, motivo_obrigatorio, periodo_invalido)
- Modal de remarcação (RemarcarModal): resumo cliente/atendente/período atual, nova data+horários, motivo obrigatório; AVISO ao vivo de conflito de atendente (checarConflitoAtendente via useEffect debounced-by-deps) e guard definitivo na RPC — resposta 'conflito' mostra quem/quando e, se pode_forcar, botão 'Remarcar mesmo assim'
- Aba Histórico (só edição): trilha de auditoria legível (criou / confirmou / marcou realizado / não compareceu / cancelou / remarcou com de→para de horário / trocou atendente de→para), com autor ('Sistema' se nulo), data/hora SP e motivo; estados carregando e vazio
- Estado sem backend: AG_REAL=false mostra 'Disponível com o backend configurado.' no lugar do calendário
- Atualização de dados: refetch do intervalo e dos próximos ao fechar/salvar o modal, além do polling embutido nos hooks (30s/60s)
- Todo cálculo de datas no fuso America/Sao_Paulo (spParts/spISO/spOffsetMs robustos a DST e a datas inválidas) — a v2 precisa preservar essa semântica de horário de parede

### `/login` — src/pages/Login.tsx

**219 linhas · complexidade 2/5 · acoplamento: EXTRAIDA**

Tela de login (e-mail/senha) com validação local, fluxo de recuperação de senha por e-mail (resetPassword), suporte a modo mock/supabase, prévia decorativa do Kanban e toggle de tema; usuário já logado é redirecionado para a rota de origem ou '/'.

Veredito: Toda a lógica de dados (autenticação, reset de senha, distinção mock/supabase, classificação de erro invalid/config/server) vive no AuthContext; a página só mantém estado local de formulário e validação client-side. A v2 pode importar useAuth/useTheme/useToast diretamente sem nenhuma extração prévia.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAuth (user, loading, mode, signIn, resetPassword) | contexto | src/context/AuthContext.tsx |
| useTheme (theme, setTheme) | contexto | src/hooks/useTheme.tsx |
| useToast (toast) | contexto | src/hooks/useToast.tsx |
| supabase.auth.signInWithPassword / resetPasswordForEmail (+ supabase.from("usuarios") em buildSessionUser) — encapsulados no AuthContext, nunca chamados pela página | servico | src/context/AuthContext.tsx |

Paridade obrigatória:
- Redirecionar usuário já logado (quando !loading && user) para location.state.from.pathname ?? '/' via <Navigate replace>
- Campo e-mail: obrigatório + regex de formato; erro inline por campo (classe is-invalid + hint); erro limpa ao digitar; autoComplete='username', inputMode='email'
- Campo senha: obrigatório + mínimo 6 caracteres; erro inline por campo que limpa ao digitar; autoComplete='current-password'
- Toggle mostrar/ocultar senha (type text/password) com aria-pressed e aria-label dinâmico
- Submit 'Entrar': guarda anti-duplo-clique (busy), spinner no botão, disabled durante requisição; ao sucesso navigate para rota de origem com replace
- Banner de erro de login (role=alert, aria-live=polite) com mensagem por reason: 'invalid' = credenciais inválidas, 'config' = servidor não configurado, demais = falha de conexão (nunca tratar erro de servidor como senha inválida)
- 'Esqueci minha senha': valida e-mail preenchido/válido antes (mensagem no hint do e-mail), estado 'Enviando…' + disabled (recuperando), chama resetPassword; sucesso = toast NEUTRO que não revela se o e-mail existe; erro = toast warn
- Checkbox 'Manter conectado' (hoje decorativo, defaultChecked, sem lógica associada)
- Toggle de tema claro/escuro (pill com 2 botões, aria-pressed) via useTheme, persiste em localStorage + data-theme no html
- Nota de modo demonstração exibida somente quando mode === 'mock' (instrui configurar VITE_SUPABASE_URL/ANON_KEY)
- Prévia decorativa do Kanban no painel de marca (aria-hidden, dados estáticos COLS) + logo/hero copy — puramente visual, sem dados reais
- Texto 'Acesso restrito a colaboradores autorizados' no rodapé do formulário

### `/redefinir-senha` — src/pages/RedefinirSenha.tsx

**129 linhas · complexidade 2/5 · acoplamento: EXTRAIDA**

Destino do link de recuperação de senha (redirectTo do Supabase): aguarda o supabase-js processar o token do hash (evento PASSWORD_RECOVERY) e permite definir nova senha; em modo mock redireciona para /login.

Veredito: Toda a lógica de dados vive no AuthContext (flag recovery via evento PASSWORD_RECOVERY do onAuthStateChange, updatePassword, signOut, mode mock/supabase) — a página não faz nenhuma query/rpc/edge function inline. O que resta no componente é apenas orquestração de UI (grace timer de 2s, regex de token na URL, validação de formulário), trivialmente reproduzível na v2.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| useAuth (user, loading, recovery, updatePassword, signOut, mode) | contexto | src/context/AuthContext.tsx |
| useToast | hook | src/hooks/useToast.tsx |
| useTheme | hook | src/hooks/useTheme.tsx |

Paridade obrigatória:
- Redirect imediato para /login quando mode === 'mock' (sem backend real não há recuperação)
- Detecção de token na URL via regex /access_token=|type=recovery|code=/ sobre hash+search (indica link de recuperação válido)
- Estado 'aguardando' (grace de 2s via setTimeout) enquanto o supabase-js processa o token do hash — mostra 'Validando o link de recuperação…'
- Habilitação do formulário quando recovery === true OU usuário já logado (podeDefinir = recovery || !!user)
- Estado 'link inválido/expirado' (sem sessão de recuperação, grace vencida, sem token na URL, loading falso) com link 'Voltar ao login'
- Campo 'Nova senha' com toggle mostrar/ocultar (aria-pressed, ícone olho) e autoComplete new-password
- Campo 'Confirmar nova senha' (compartilha o mesmo showPw)
- Validação client-side: mínimo 6 caracteres e senhas coincidentes, com banner de erro (role=alert, aria-live=polite)
- Limpar erro ao digitar em qualquer campo (onChange seta setErro(null))
- Submit chama updatePassword do AuthContext; guard contra duplo submit (busy) e botão com spinner enquanto busy
- Mapeamento de erro do backend: /expired|invalid|token|otp|session/i vira mensagem 'O link expirou ou já foi utilizado. Solicite um novo na tela de login.'
- Fluxo de sucesso: signOut() forçado + toast 'Senha redefinida. Entre com a nova senha.' + navigate('/login', {replace:true})
- Toggle de tema claro/escuro (pill com dois botões, aria-pressed) via useTheme
- Layout single-column (login-page com gridTemplateColumns: 1fr), estilos herdados de Login.css

### `/plano-uso` — src/pages/PlanoUso.tsx

**159 linhas · complexidade 2/5 · acoplamento: EXTRAIDA**

Plano e uso (RequireRole admin): status da assinatura, consumo e limites por recurso (usuários, WhatsApp, Facebook), total mensal e contratação de adicionais — botão de contratar ainda só informa via toast (meio de cobrança não definido); dados vêm do adapter billing.

Veredito: Toda a lógica de dados (queries Supabase, montagem do snapshot, cálculos de limite/total) vive no adapter billing e em helpers puros de src/types/billing.ts; o componente tem apenas um useEffect trivial de fetch (com guard de resposta obsoleta) e estado local de UI (qty do stepper). A página v2 pode importar billing.getSnapshot + helpers diretamente, sem extração prévia.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| billing.getSnapshot(orgId) — adapter billing (supabaseBilling quando env configurado, senão mockBilling) | servico | src/adapters/index.ts → src/adapters/supabaseBilling.ts (queries internas: planos, organizacao_limites, counts de organizacao_usuarios e canais, assinaturas, faturas) / src/adapters/mockBilling.ts |
| useOrg (currentOrg.id dispara o fetch e o reset do snapshot) | contexto | src/context/OrgContext.tsx |
| useToast (feedback do botão Contratar adicional) | hook | src/hooks/useToast.tsx |
| effectiveLimit / monthlyTotal / priceOf + tipos BillingSnapshot, ResourceKind, SubscriptionStatus (helpers puros de cálculo) | servico | src/types/billing.ts |

Paridade obrigatória:
- Guard de rota RequireRole role=admin (App.tsx linha 90) + title/subtitle via route handle ('Plano e uso' / 'Assinatura, consumo e contratação de adicionais...')
- Estado de carregamento 'Carregando plano…' (center-screen) enquanto snapshot é null; refetch e reset ao trocar currentOrg.id, com flag 'active' contra resposta obsoleta
- Card do plano: nome + badge de status da assinatura com 7 estados mapeados (sem_assinatura, aguardando_pagamento, ativa, em_atraso, cancelada, isenta exibida como 'Ativa', teste) com cores próprias; fallback para 'ativa' quando subscription ausente
- Lista de inclusos do plano: N usuários, N WhatsApp, N Facebook + 'Acesso aos módulos principais'; preço-base formatado em BRL (Intl pt-BR) com sufixo /mês
- Card 'Total mensal estimado': monthlyTotal(snap) + breakdown 'Plano-base X + Y em adicionais' ou '· sem adicionais'
- Seção 'Uso e limites' para users/whatsapp/facebook (ordem fixa): usado de limite (effectiveLimit = incluso + adicional), barra de progresso limitada a 100% com classe warn quando ratio >= 1, hint 'N incluso(s) + N adicional(is)' e sufixo '· no limite' quando no teto
- Seção 'Contratar adicionais': 1 card por recurso com ícone/cor por tipo, label e description vindos de snap.addOnPrices, preço unitário 'R$ X/mês por unidade'
- Stepper de quantidade por recurso: mínimo 1, botão '−' disabled em qty<=1, aria-labels 'Diminuir'/'Aumentar', estado local independente por recurso (default 1)
- Subtotal por card = preço unitário × qty, formatado em BRL
- Botão 'Contratar adicional': hoje apenas toast informativo ('A contratação de adicionais entra quando o meio de cobrança for definido.') — sem checkout nem mutation; manter comportamento até definição do meio de cobrança
- Nota informativa final (ícone lock) distinguindo 'Plano e uso' (assinatura Atenvo) de 'Cobranças' (cobranças da org aos próprios clientes) e avisando que a contratação é apenas informativa
- Dado disponível não renderizado: snap.charges (histórico de faturas, até 12) e snap.subscription.active já vêm no snapshot — candidatos naturais para a v2 sem trabalho de backend

### `/ (index)` — src/App.tsx (Navigate inline)

**105 linhas · complexidade 1/5 · acoplamento: EXTRAIDA**

Redirect puro: a rota índice dentro do AppShell faz <Navigate to="/whatsapp" replace /> — não há dashboard/home.

Veredito: A rota índice é um redirect puro (linha 36 de /Users/matheus/Desktop/atenvo/src/App.tsx): `{ index: true, element: <Navigate to="/whatsapp" replace /> }` — zero fontes de dados, zero estado, zero UI própria. Não há nada a extrair; qualquer página v2 pode substituir o elemento inline sem tocar em lógica de dados.

Paridade obrigatória:
- Redirect imediato de '/' para '/whatsapp' usando replace (nao empilha entrada no historico — o botao voltar nunca retorna ao index)
- Fica aninhada sob ProtectedRoute (src/components/ProtectedRoute.tsx): sem sessao redireciona a /login com state.from; user.deveTrocarSenha forca /alterar-senha; estado loading mostra 'Carregando…' — comportamento herdado que a rota indice v2 mantem automaticamente se permanecer no mesmo nivel de aninhamento
- Fica aninhada sob AppShell — o redirect acontece dentro do shell autenticado (sidebar/topo), nao antes dele
- Nota para o redesign: nao existe dashboard/home hoje; a memoria do projeto registra Dashboard como feature requerida ainda nao construida. Se a v2 criar uma home real na rota indice, este Navigate inline deve ser removido e o destino padrao '/whatsapp' deixa de ser paridade obrigatoria (a paridade e apenas 'usuario logado que abre / cai em algum lugar util')

### `* (catch-all)` — src/pages/NotFound.tsx

**15 linhas · complexidade 1/5 · acoplamento: EXTRAIDA**

Página 404 simples com logo e link 'Voltar ao início' para '/'; captura qualquer caminho fora do roteador (inclusive fora da área autenticada).

Veredito: Página 100% estática, sem nenhuma fonte de dados: nenhum hook, query, RPC, edge function ou contexto — apenas JSX com o componente compartilhado Logo (src/components/Logo.tsx) e um Link do react-router-dom. Não há lógica a extrair; a v2 pode ser recriada livremente sem tocar em dados.

Paridade obrigatória:
- Registro no roteador como path '*' em src/App.tsx (linha 96), FORA da área autenticada — captura qualquer rota inválida, logado ou não; a v2 deve preservar essa posição no roteador
- Link 'Voltar ao início' apontando para '/' via <Link> do react-router-dom (navegação SPA, sem full reload)
- Exibição do logo oficial via componente compartilhado Logo (src/components/Logo.tsx) — símbolo verde fixo, texto adapta ao tema via --logo-ink
- Mensagem de erro: título 'Página não encontrada' + subtexto 'O endereço acessado não existe.'
- Layout centrado reutilizando as classes visuais da tela de login (.login / .login-card / .btn btn-primary btn-block) — na v2, garantir equivalente visual mesmo que as classes mudem
- Sem estados de loading/vazio/erro, sem permissões, sem formulários — página síncrona pura

### `(fora do roteador — renderização condicional)` — src/pages/Onboarding.tsx

**61 linhas · complexidade 1/5 · acoplamento: EXTRAIDA**

NÃO é rota: renderizada pelo OrgProvider (src/context/OrgContext.tsx linha 168) quando o usuário autenticado não tem organização — formulário mínimo de nome da empresa que gera slug e chama a RPC provisionar_organizacao; ao concluir o provider redireciona para /whatsapp.

Veredito: A página é 100% apresentacional: não faz nenhuma query/RPC inline — toda a lógica de dados (RPC provisionar_organizacao, retry de slug, redirect e invalidação do cache) já vive no OrgProvider e chega via prop onProvision, e o preview de slug reusa src/lib/slug.ts. A v2 só precisa manter a mesma assinatura de prop `{ onProvision: (nome: string) => Promise<void> }` e ser referenciada na linha 168 do OrgContext.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| onProvision (prop) → supabase.rpc("provisionar_organizacao", { p_nome, p_slug }) com retry automático de slug em conflito (23505/duplicate → `${slug}-${randomSuffix()}`) | rpc | src/context/OrgContext.tsx (função onProvision, linhas 95–116; injetada na página como prop) |
| OrgProvider (decide quando renderizar a página via resolverContextoInicial; após sucesso faz gotoWhatsApp() + invalidateQueries(['orgs'])) | contexto | src/context/OrgContext.tsx (linhas 122–169) + src/lib/resolverContexto.ts |
| slugify(nome) — preview do slug em tempo real (útil apenas para exibição; o slug real é recalculado pelo provider) | servico | src/lib/slug.ts |
| AuthContext (indireto: user/mode determinam realEnabled do provider; modo mock exercita o fluxo sem backend via localStorage atenvo-mock-no-org) | contexto | src/context/AuthContext.tsx (consumido pelo OrgProvider, não pela página) |

Paridade obrigatória:
- Campo único 'Nome da empresa' (input text, maxLength=80, autoFocus, placeholder 'Ex.: Assessoria Silva', label associado por htmlFor)
- Preview do slug em tempo real abaixo do campo ('Endereço: <slug>') usando slugify — atualiza a cada tecla; fallback 'empresa' quando vazio
- Validação de envio: botão habilitado somente com nome.trim().length >= 2 e sem requisição em andamento (podeEnviar)
- Submissão por Enter no input além do clique no botão
- Estado busy: botão muda para 'Criando…' e fica disabled durante a chamada; em SUCESSO busy permanece true (o pai redireciona para /whatsapp) — não resetar
- Estado de erro: mensagem inline com role='alert' (mensagem da RPC ou fallback 'Não foi possível criar a organização.'); busy volta a false para permitir nova tentativa; erro limpo ao reenviar
- Chamar onProvision(nome.trim()) — nome sem espaços nas pontas; o slug final é responsabilidade do provider (inclui retry com sufixo aleatório em conflito de slug)
- Logo oficial da Atenvo (componente Logo) no topo do card + título 'Crie sua organização' + subtítulo explicativo
- Sem condição por papel: qualquer usuário autenticado sem vínculo algum vê a tela (a triagem convidado/inativo/erro/carregando é feita ANTES pelo OrgProvider — a v2 não deve reimplementá-la)
- Funciona também em modo mock (onProvision do provider trata o branch sem backend) — a página não deve assumir supabase configurado
- Tela standalone fullscreen (fora do shell/sidebar do app) com card centralizado — estilos próprios em src/pages/Onboarding.css

### `(fora do roteador — renderização condicional)` — src/pages/ConfigError.tsx

**33 linhas · complexidade 1/5 · acoplamento: EXTRAIDA**

NÃO é rota: renderizada pelo OrgProvider (src/context/OrgContext.tsx linha 168) quando o usuário autenticado não tem organização — formulário mínimo de nome da empresa que gera slug e chama a RPC provisionar_organizacao; ao concluir o provider redireciona para /whatsapp.

Veredito: Toda a "lógica de dados" já vive em src/lib/supabase.ts (supabaseEnv/isMisconfigured, constantes de módulo derivadas de env); o componente apenas importa e faz um filtro puro de 2 itens para montar a lista de variáveis ausentes. A v2 pode importar supabaseEnv diretamente, sem nenhuma extração prévia.

| Fonte de dados | Tipo | Onde vive |
|---|---|---|
| supabaseEnv (constante { hasUrl, hasKey } derivada de import.meta.env) | servico | src/lib/supabase.ts |

Paridade obrigatória:
- Listar dinamicamente APENAS as variáveis ausentes (VITE_SUPABASE_URL se !supabaseEnv.hasUrl; VITE_SUPABASE_ANON_KEY se !supabaseEnv.hasKey) — a lista varia conforme o que falta
- Mensagem de bloqueio explicando que o acesso/login está travado porque o backend não está configurado e que é preciso definir as env vars e publicar de novo
- Dica de escape: instrução para habilitar VITE_ENABLE_DEMO_MODE=true para ambiente apenas de demonstração sem backend
- Exibir o Logo oficial (componente Logo reutilizado, src/components/Logo.tsx) — não recriar o SVG
- RESTRIÇÃO DE AMBIENTE: renderiza fora de QueryClientProvider/AuthProvider/OrgProvider/ToastProvider (só ThemeProvider) — a v2 não pode usar useAuth, useOrg, react-query nem toasts
- Resiliência visual: estilos com CSS vars + fallback dark hardcodado (funciona mesmo se o tema não aplicar); layout centralizado full-viewport (100dvh) como card único
- Sem ações, botões, formulários, filtros ou permissões — página puramente informativa e estática; nenhum estado de loading/erro/vazio além da própria lista condicional
