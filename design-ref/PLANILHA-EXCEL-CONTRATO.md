# Gestão de cobranças = "Excel 2.0" — CONTRATO DE IMPLEMENTAÇÃO (25/09/2026)

> **Estado (25/09, fim do dia):** mig 57 APLICADA no ftexrtyswpdcndbkjbtf; carga feita (`planilha_substituir`, backup `private.bkp_<tabela>_20260925_144856`, 10 tabelas); `--conferir` = 0 divergências. Front pronto na prévia (5198/5197), **zip aguardando o "confirmo" do dono**.
> **Mudanças em relação ao texto abaixo (valem mais que ele):** CSV lido como **cp1252** (fallback latin1 byte a byte); **ano das datas curtas** = ano corrente, e se cair > hoje+7 dias → ano anterior; se AAAA-MM > mês do 1º pagamento do cliente → ano anterior; nunca < 2025 (vale também p/ fechamento); backup = `bkp_*_AAAAMMDD_HHMMSS` cobrindo leads/pagamentos/lead_segredos/entradas/mov_fin/competencias + 4 planilha_*; recarga exige `"recarregar": true`; só vão pra Lixeira os ids em `remover` (+ trava `leads_vistos`); célula de mês vazia ou `-` **preserva** `fora`; realtime NÃO publica `planilha_celulas` — publica `planilha_versao` (1 linha, n++ por RPC que escreve) e o front usa debounce 1,5 s/máx 5 s; troca de bloco move texto/cor junto com o MÊS; saindo de NOVOS nada é apagado; comercial não troca o COMERCIAL do cliente; senha/CPF/NB/telefone não entram em linha vazia/rótulo; **Enter fora de edição desce** (edita = F2/duplo clique/digitar); Recortar > 200 células pede confirmação.

Pedido do dono (literal, via Matheus): "quero que a planilha fique nessa parte do sistema, **exatamente a mesma planilha**, pode limpar tudo dessa parte e substituir; mesmo que tu identifique algo estranho, mantenha exatamente; quero que fique **que nem o Excel**, dê pra **colocar cores**, seja do **mesmo formato**, **criar colunas novas**, como se fosse um Excel 2.0".

Decisões já tomadas com o dono (NÃO rediscutir):
- Fonte: `~/Downloads/MENSAIS(Planilha1).csv` (latin1, `;`, CRLF). Sem cores originais (o CSV não tem) — a equipe pinta no sistema.
- **CPF completo** na grade (como na planilha).
- **Tudo continua ligado**: as colunas da planilha seguem alimentando leads/pagamentos (régua, painel, comissões, calendário, conversas, Novos).
- Regras de segurança do projeto continuam: **senha nunca em texto em repouso** (senhas vivem cifradas em `private.lead_segredos`, exibidas via `senhas_grade`); banco só `ftexrtyswpdcndbkjbtf`; nenhuma mensagem de WhatsApp é enviada; régua segue desligada.

## 1. Anatomia da planilha (fatos verificados)
- 842 linhas × 56 colunas; colunas 25–55 vazias. Colunas usadas **0..24** (25 colunas, letras **A..Y**).
- 0 `DATA FECHAMENTO` · 1 `COMERCIAL` · 2 `CLIENTE` · 3 `NB` · 4 `BANCO` · 5 `CPF` · 6 `SENHA INSS` · 7 `PARCELA TOTAL` · 8 `SENHA RECLAME AQUI E DATA RECLAMAÇAO` (texto "reclame aqui DD/MM - <senha>", com variantes) · 9 `DATA QUE PAROU O DEBITO` · 10..23 = 14 meses (cabeçalho = data INSS do bloco) · 24 = sem título (telefone em 36 linhas; 2 com texto de conta bancária).
- 10 tabelas empilhadas, cada uma com SUA linha de cabeçalho (linhas CSV 0, 51, 91, 144, 191, 244, 347, 478, 590, 676). Blocos → ciclo: D24, D25, D28, D29, D30, D01, D02, D05, D06, D07. Linhas em branco separam blocos (50, 90, 143, 190, 243, 346, 477, 589; entre 675 e 676 NÃO há linha em branco). Linha 789 = rótulo "NOVOS"/"OLHAR QUANDO INNS VOLTAR" (texto nas colunas dela, exatamente como está) e 790–826 = 37 clientes NOVOS (sem ciclo). 827–841 vazias (não importar as vazias do fim).
- Meses por **POSIÇÃO**: coluna 10+k = k-ésimo mês do bloco. Competência (como o banco já guarda = mês em que o dinheiro cai): D24..D30 → `2025-08` + k; D01..D07 → `2025-09` + k. Os textos dos cabeçalhos NÃO são chave (há 4 errados).
- Células de mês: número inteiro (pago), `NÃO PAGOU` (também minúsculo), `-`, vazio, `--`, datas escritas, telefones, notas. **Guardar o texto EXATO** (inclusive espaços no fim — ex. "AUGUSTO ").

## 2. Modelo de dados (migration `supabase-reviza/migrations/20260925_57_planilha_excel.sql`)
Tudo **aditivo**. Nada existente é removido.

```sql
create table public.planilha_blocos (
  id text primary key,                 -- 'D24','D25',...,'D07','NOVOS' (ou 'Dnn' criado depois)
  dia smallint check (dia between 1 and 31),   -- null só em NOVOS
  situacao public.situacao_debito not null,     -- 'cancelado' (ciclo) | 'ativo' (NOVOS)
  comp_base text,                      -- 'YYYY-MM' do mês da 1ª coluna de mês (null em NOVOS)
  criado_em timestamptz not null default now()
);
create table public.planilha_colunas (
  id uuid primary key default gen_random_uuid(),
  ordem numeric not null,              -- posição visual (fracionária p/ inserir entre)
  titulo text not null default '',     -- nome curto p/ menus ("PARCELA TOTAL", "Mês 1", "Nova coluna")
  tipo text not null check (tipo in ('campo','mes','livre')),
  campo text check (campo in ('fechamento','comercial','nome','nb','banco','cpf','senha_inss','valor','reclame','parou','telefone')),
  mes_pos smallint check (mes_pos >= 0),
  largura smallint not null default 110 check (largura between 30 and 900),
  oculta boolean not null default false,
  criado_em timestamptz not null default now(),
  check ((tipo='campo') = (campo is not null)), check ((tipo='mes') = (mes_pos is not null))
);
create unique index on public.planilha_colunas(campo) where campo is not null;
create unique index on public.planilha_colunas(mes_pos) where mes_pos is not null;
create table public.planilha_linhas (
  id uuid primary key default gen_random_uuid(),
  ordem numeric not null,              -- ordem GLOBAL da folha (1000, 2000, …; fracionária p/ inserir)
  tipo text not null check (tipo in ('cliente','cabecalho','vazia','rotulo')),
  bloco text references public.planilha_blocos(id) on update cascade,  -- null só em 'vazia'/'rotulo' soltas
  lead_id uuid unique references public.leads(id) on delete set null, -- só 'cliente'; null = cliente na Lixeira (linha oculta)
  altura smallint,                     -- px (null = padrão)
  criado_em timestamptz not null default now()
);
create index on public.planilha_linhas(ordem);
create table public.planilha_celulas (
  linha_id uuid not null references public.planilha_linhas(id) on delete cascade,
  coluna_id uuid not null references public.planilha_colunas(id) on delete cascade,
  texto text,                          -- texto EXATO exibido. SEMPRE null nas colunas campo 'senha_inss' e 'reclame' de linhas 'cliente'
  estilo jsonb,                        -- {"bg":"#RRGGBB","fg":"#RRGGBB","b":true,"i":true,"al":"l|c|r"} (chaves opcionais)
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (linha_id, coluna_id)
);
```
- RLS ligada nas 4. **SELECT**: `planilha_blocos`/`planilha_colunas` = qualquer papel ativo (`current_papel() is not null`). `planilha_linhas`: tipo <> 'cliente' → qualquer papel ativo; tipo='cliente' → `lead_id is not null and (current_papel() <> 'comercial' or comercial_dono_lead(lead_id))` com papel ativo. `planilha_celulas`: visível se a linha é visível (exists na linha com a mesma regra). **Nenhuma policy de escrita** (escrita só por RPC SECURITY DEFINER). `grant select` a authenticated; revoke tudo de anon.
- Adicionar as 4 tabelas à publication `supabase_realtime` (e o front assina — ver §4).

### 2.1 Parsers (a MESMA regra em SQL e em TS — funções `private.pl_*` e `planilha.ts`)
- `valor BR` (PARCELA TOTAL e célula de mês): remove `R$`, espaços; troca `O`/`o` por `0` **não** (não "consertar": se não parsear, é texto). Aceita `263,81`, `230,9`, `224`, `1.343,50`, `1343.50`. Regra: se tem `,` → `.` é milhar e `,` é decimal; senão se tem `.` com exatamente 3 dígitos depois e nada mais → milhar; senão `.` decimal. Resultado numeric ≥ 0; senão NULL.
- `NÃO PAGOU`: `upper(unaccent-like(trim(texto)))` = `NAO PAGOU` (aceitar "não pagou", "NAO PAGOU", "NÃO PAGOU ").
- Mês → estado: `NÃO PAGOU` → `nao_pagou`; valor BR > 0 → `pago`(valor); **qualquer outra coisa** (vazio, `-`, `--`, datas, notas, telefones, `0`) → **sem linha em pagamentos**.
- Data curta (fechamento, reclamação DD/MM, parou): aceita `DD/mmm` (jan..dez, pt, com ou sem ponto), `DD/MM`, `DD/MM/YYYY`, `DD/MM/YY`. Ano quando faltar: meses **out–dez → 2025**, **jan–set → 2026** (regra do negócio: carteira começou ago/2025). Saída ISO `YYYY-MM-DD`; falhou → NULL (campo ISO não muda; o TEXTO da célula muda sempre).
- Telefone (col 24): extrai a 1ª sequência com 10–13 dígitos (ignorando `()-. espaço`) → `leads.telefone` = esses dígitos; se não achar, **não mexe** em `leads.telefone`.
- Formatadores reversos (lead/pagamento mudou fora da planilha → texto da célula): valor → `263,81` / `224` (sem `R$`, vírgula decimal, sem zeros finais inúteis: 230.90 → `230,9`); pago → mesmo formatador; nao_pagou → `NÃO PAGOU`; fora → `-`; sem pagamento → '' (só se o texto atual da célula for um estado de pagamento — número, NÃO PAGOU, `-`, vazio; NUNCA apagar nota); fechamento ISO → `DD/mmm` (ex. `15/jan`).

### 2.2 Ligação coluna ↔ sistema (linha 'cliente' com lead)
| campo | lead | regra |
|---|---|---|
| fechamento | `fechamento` (ISO) | data curta |
| comercial | `comercial` | `btrim(texto)` (texto exato fica na célula) |
| nome | `nome` | `btrim(texto)` |
| nb / banco / cpf | idem | `btrim(texto)` |
| senha_inss | `set_senha(lead,'inss',texto)` | célula.texto = NULL sempre |
| valor | `valor` | valor BR; não parseou → não muda |
| reclame | `set_senha(lead,'reclame',texto)` (texto CRU inteiro, como o import já faz) + `data_reclamacao` = data curta achada no texto | célula.texto = NULL sempre |
| parou | `parou` = texto cru; `data_parou` = data curta achada no texto | |
| telefone | `telefone` | extração acima |
| mes (mes_pos k) | `pagamentos(lead, comp_base+k)` | estado acima |
| livre | — | só célula |

- O **bloco** da linha define `leads.dia` = `bloco.dia` e `leads.situacao` = `bloco.situacao` (NOVOS = 'ativo').

### 2.3 RPCs (SECURITY DEFINER, `search_path ''`, revoke de public/anon, grant a authenticated)
Todas setam `perform set_config('planilha.sync','1',true)` antes de mexer em leads/pagamentos (os gatilhos reversos ignoram quando = '1').
1. `planilha_dados() returns jsonb` — **SECURITY INVOKER** (respeita RLS). Um JSON só: `{blocos:[{id,dia,situacao,comp_base}], colunas:[{id,ordem,titulo,tipo,campo,mes_pos,largura,oculta}], linhas:[{id,ordem,tipo,bloco,lead_id,altura,c:{"<coluna_id>":[texto,estilo]}}]}` com linhas em `ordem`, só linhas visíveis e não órfãs (cliente com lead_id null fica fora), células só com texto ou estilo não nulos.
2. `planilha_salvar(p_itens jsonb, p_origem text default 'edicao') returns jsonb` — itens `[{l:linha_id, c:coluna_id, t?:texto|null, s?:estilo|null}]` (chave ausente = não mexe; `"t":null`/`""` = limpar). Máx 5000 itens. **Tudo-ou-nada** (1ª falta de permissão → exception com mensagem clara em PT citando a coluna/linha). Por item:
   - linha não-cliente: exige `is_at_least('financeiro')`.
   - linha cliente: `pode_editar` = papel in (cadastro, financeiro, gestor, admin) ou (comercial e `comercial_dono_lead`). Estilo/livre/campo comuns exigem `pode_editar`. Senhas: delega a `set_senha` (que já barra sobrescrever sem gestor). Mês: novo estado pago/nao_pagou exige `is_at_least('financeiro')` ou comercial dono; **remover** um pagamento existente (virar "sem linha") exige `is_at_least('financeiro')`; cadastro não mexe em mês.
   - aplica: upsert/delete da célula (texto+estilo; se ambos null → delete), depois a ligação §2.2. Pagamento: insert/update/delete em `pagamentos` (pago_em = now() só se virou pago ou o valor mudou; `confirmado_por = auth.uid()`), `insert into competencias on conflict do nothing`.
   - Se `jsonb_array_length(p_itens)=1` e virou `pago` → mesma notificação `celula_recebida` do `marcar_celula` (ao comercial dono). Em lote não notifica.
   - Auditoria: `private.registrar('editou planilha','planilha', null, <rótulo>, '<n> célula(s)')` 1 vez por chamada; e por célula de mês que mudou de estado (se ≤ 20 itens) `private.registrar('marcou pago'|'marcou não pago'|'limpou mês','grade', lead, nome, comp_rotulo…)`.
   - Retorna `{ok:true, avisos:[…]}` (ex.: "PARCELA TOTAL 'R$ 3,4O' não é número — o valor do sistema não mudou").
3. `planilha_coluna_criar(p_ref uuid, p_lado text 'esq'|'dir', p_tipo text 'livre'|'mes', p_titulo text) returns uuid` — financeiro+. `mes` → `mes_pos = max+1` (só aceita criar o PRÓXIMO mês) e grava nos cabeçalhos dos blocos o texto passado em `p_cab jsonb {"<bloco_id>":"24/out"}` (parâmetro extra opcional). Ordem = entre a ref e a vizinha.
4. `planilha_coluna_alterar(p_coluna uuid, p_patch jsonb)` — `titulo|largura|oculta|ordem`. largura/oculta/ordem/titulo = financeiro+.
5. `planilha_coluna_excluir(p_coluna uuid)` — gestor+; **só tipo 'livre'**.
6. `planilha_linha_inserir(p_ref uuid, p_lado text 'acima'|'abaixo', p_tipo text) returns uuid` — bloco = bloco da ref. `cliente`: cria lead (situacao/dia do bloco; nome '' ; comercial = do comercial logado se papel comercial) — em bloco 'cancelado' exige `pode_aprovar_parado()`, em NOVOS qualquer papel ativo; `vazia`/`rotulo`/`cabecalho`: financeiro+.
7. `planilha_linha_excluir(p_linha uuid)` — cliente: gestor+ → `delete from leads` (vai pra Lixeira pelo gatilho; a linha fica com lead_id null e some da grade; restaurar religa). Outras: financeiro+ → delete da linha.
8. `planilha_linha_mover(p_linha uuid, p_ref uuid, p_lado text)` — financeiro+; muda `ordem` e, se o bloco da ref for outro e a linha for cliente, muda `bloco` e o lead (`dia`/`situacao` — a mudança de situação respeita `leads_guard_parado`: setar `reviza.fluxo_parado` NÃO; só aprovadores).
9. `planilha_substituir(p jsonb) returns jsonb` — **admin only**, `statement_timeout 300s`. Carga única (e reusável) "a planilha manda": ver §5.

### 2.4 Gatilhos reversos (mudança feita FORA da planilha → texto da célula)
Ignoram quando `current_setting('planilha.sync', true) = '1'`.
- `leads` AFTER INSERT: cria linha 'cliente' no fim do bloco certo (situacao 'ativo' → 'NOVOS'; senão bloco com `dia` igual e situacao 'cancelado'; se não existir, cria bloco `'D'||lpad(dia,2,'0')` com `comp_base` copiado de um bloco existente do mesmo "lado" do mês (dia ≥ 15 → do D24; senão do D01) + uma linha 'cabecalho' copiando os TEXTOS do cabeçalho do bloco-modelo, no fim da folha) e preenche as células ligadas a partir do lead.
- `leads` AFTER UPDATE: campos ligados que mudaram → reescreve o texto (formatadores §2.1); `dia`/`situacao` mudou → move a linha para o fim do bloco certo (mesma regra de criação de bloco).
- `pagamentos` AFTER INSERT/UPDATE/DELETE: acha a linha do lead, `k = meses(comp) - meses(bloco.comp_base)`; se existe coluna `mes_pos = k` → reescreve (regra §2.1); se `k = max+1` → cria a coluna de mês (titulo 'Mês '||k+1) e escreve; senão ignora.
- `private.leads_trash`: incluir `'planilha_linhas'` nos `vinculos` (ids das linhas do lead). `lead_restaurar`: religar `planilha_linhas.lead_id` (where id in … and lead_id is null).

## 3. Front — dados (`src/v2/data/cobranca/planilha.ts`)
- Tipos: `PlBloco`, `PlColuna`, `PlLinha {id, ordem, tipo, bloco, leadId, altura, c: Record<colId,{t:string|null, s:Estilo|null}>}`, `Estilo {bg?,fg?,b?,i?,al?}`, `PlDados {blocos, colunas, linhas}`.
- Parsers/formatadores do §2.1 exportados (mesma regra do SQL) + `compSoma(base,k)`.
- Repo `PlanilhaRepo` com impl **supabase** (RPCs acima) e **demo** (localStorage `alfa_planilha_v1`, semeada a partir dos dados demo: um bloco por ciclo em `ciclosOrdem`, cabeçalho com os 25 títulos, linhas dos leads, NOVOS no fim; e **sincroniza** com o store demo existente (`demoStore`/`cobrancaRepo.demo`) nas mesmas regras de ligação — demo é o contrato).
- Hooks (react-query v5): `usePlanilha()` (key `['cobranca','planilha']`, refetch 30s + realtime das 4 tabelas com debounce 400 ms), `useSalvarCelulas()` com **update otimista** (aplica no cache na hora; guarda edições pendentes e as re-aplica por cima de refetches até o servidor confirmar; em erro reverte e expõe a mensagem), `useColunaOps()`, `useLinhaOps()`. Após salvar: invalidar também `['cobranca','dados']` (outras telas) e, se tocou senha, `['cobranca','senhas-grade']`.
- `useRealtimeCobranca.ts`: incluir as 4 tabelas novas em `TABELAS` (senão o canal cai) invalidando `['cobranca','planilha']`.

## 4. Front — a grade (`src/v2/pages/planilha/PlanilhaExcel.tsx` + `planilha.css`)
Componente puro (sem fetch): props `{ dados: PlDados; senhas: Map<leadId,{inss:string|null,reclame:string|null}> | null; podeVerSenha; perms: {editarLinha(l):boolean; editarMes(l):boolean; estrutura:boolean; excluirColuna:boolean; excluirCliente:boolean}; filtro?: (l:PlLinha)=>boolean; destaque?: string; onSalvar(itens); onColuna(op); onLinha(op); onAbrirFicha(leadId); irParaBloco?: string }`.
Visual = Excel limpo com os tokens do app (claro/escuro): barra de **letras** (A, B, … Z, AA…) fixa no topo, **números de linha** fixos à esquerda (= posição na folha, 1-based, contando cabeçalhos e vazias), grade com linhas finas (`--linha`), fonte do app 12.5px, altura de linha 26px (ou `altura`), texto numa linha só com reticências e tooltip do texto inteiro. Linhas `cabecalho` em destaque (fundo escuro/contraste, negrito — como o Excel do cliente: fundo preto, texto branco; usar tokens p/ ficar bom nos 2 temas). Células de mês: número em verde e `NÃO PAGOU` em vermelho **apenas como cor de texto automática** (estilo explícito da célula sempre vence). CPF completo. Senhas: colunas senha_inss/reclame mostram o texto revelado (ou `•••••• 🔒` sem permissão).
- **Virtualização por linha** (sem dependência nova): container com scroll, altura total = soma das alturas, renderiza só as linhas visíveis ±10. Colunas todas (≤ ~40). Colunas A–C congeladas (sticky) por padrão, com botão p/ alternar.
- **Seleção**: clique = célula ativa; shift+clique / arrastar = intervalo; clique na letra = coluna inteira; clique no número = linha inteira; Ctrl/Cmd+A = tudo. Retângulo de seleção desenhado por cima (não re-renderizar células ao arrastar).
- **Teclado**: setas, Tab/Shift+Tab, Enter/Shift+Enter (desce/sobe), Home/End, PageUp/PageDown, Ctrl+setas (pula para a borda de dados). **Digitar** qualquer caractere começa a edição substituindo; **F2/Enter/duplo clique** edita mantendo o texto; Esc cancela; Enter/Tab confirmam e movem. Delete/Backspace limpam a seleção (confirmar se > 200 células). Ctrl/Cmd+Z / Ctrl+Y (ou Shift+Z) = desfazer/refazer **multinível** (pilha local de lotes {antes, depois}).
- **Copiar/colar** com o Excel: Ctrl+C gera TSV (aspas no padrão Excel quando há tab/quebra/aspas) via evento `copy`; Ctrl+V lê `text/plain` do evento `paste`, cola a partir da célula ativa (expande), respeitando permissões (células sem permissão são puladas e avisadas). Ctrl+X = copiar + limpar.
- **Barra de formatação** (acima da grade): cor de preenchimento (paleta: sem cor, #00B050 verde, #92D050 verde-claro, #FFFF00 amarelo, #FFC000 laranja, #FF0000 vermelho, #F4B084 salmão, #9BC2E6 azul-claro, #0070C0 azul, #7030A0 roxo, #D9D9D9 cinza, #000000 preto, + "outra cor" via input color), cor do texto (mesma paleta), **negrito**, *itálico*, alinhar esq/centro/dir, **limpar formatação**. Aplica ao intervalo selecionado (lote único). Contraste automático: se fundo escuro e sem fg, texto branco.
- **Menu de coluna** (botão direito/▾ na letra): Inserir coluna à esquerda/direita, **Nova coluna de mês** (próximo mês; cabeçalhos de cada bloco preenchidos com a data do INSS calculada — ver `diaPagamentoINSS`/regra de posição do bloco — ou `mmm/aa` se não der), Renomear (título interno), Ocultar, Mostrar colunas ocultas, Excluir (só 'livre', confirmação). Largura: arrastar a borda da letra (salva no fim do arrasto; durante o arrasto só CSS var). Reordenar: arrastar a letra.
- **Menu de linha** (botão direito no número): Inserir cliente acima/abaixo, Inserir linha em branco acima/abaixo, Abrir ficha do cliente, Excluir linha (cliente → Lixeira, confirmação).
- **Barra de status** (rodapé): "Soma: … · Média: … · Contagem: …" da seleção (números via parser BR), total de linhas/clientes visíveis.
- **Barra de fórmula** (topo, como o Excel): mostra a referência (ex. `H245`) e o texto completo da célula ativa; editável.
- Performance: nada de re-render da grade inteira por tecla/mouse; memo por linha; estado de seleção em ref + camada de overlay.

## 5. Carga única (substituir tudo pela planilha)
Script `scripts/reviza/planilha_substituir.py` (Python 3, sem dependências além da stdlib): lê o CSV (latin1), monta blocos/linhas/células EXATAS, busca os leads atuais via REST (login admin de teste do `.env.reviza.local`/credenciais passadas por env — NUNCA gravar senha em arquivo), **casa cada linha 'cliente' com um lead existente** (prioridade: CPF-dígitos + bloco/dia + NB; depois CPF + nome; depois nome normalizado + dia; cada lead casa no máximo 1 linha; ordem da planilha desempata), gera o payload e chama `planilha_substituir`. Modos: `--dry-run` (só imprime CONTAGENS agregadas: casados/criados/removidos por bloco, sem nomes/CPF/senha), `--aplicar`, `--conferir` (lê `planilha_dados` + `senhas_grade` e compara célula a célula com o CSV; imprime só contagens de divergência por coluna).
`planilha_substituir(p)` (admin): em UMA transação — trunca as 4 tabelas planilha_*; cria blocos/colunas; para cada linha: cria `planilha_linhas` na ordem (1000·i); linha cliente com `lead_id` → atualiza o lead (todos os campos ligados, dia/situacao do bloco) e **substitui os pagamentos** do lead pelos da planilha (apaga os que não estão); sem `lead_id` → cria o lead; senhas via a mesma lógica do `set_senha` (texto vazio = limpa); células (texto exato; nunca nas colunas de senha); leads que não casaram com nenhuma linha → `delete` (vão pra Lixeira, reversível). `set_config('planilha.sync','1',true)` durante tudo. Retorna contagens.
Antes de aplicar: backup `private.bkp_*_20260925` (leads, pagamentos, lead_segredos, entradas, mov_fin, competencias).

## 6. Tela (`GestaoPlanilha` substitui a AbaPlanilha em /cobrancas/planilha)
Topo: título; busca (filtra linhas cliente; cabeçalhos/rotulos dos blocos com resultado ficam); filtros Comercial / Ciclo(bloco) (chips "D24 · 49" que filtram OU rolam até o bloco); ações existentes que precisam continuar: **Lançar pagamento**, **Gerenciar ciclos**, **Lixeira**, **Exportar planilha** (.xlsx idêntico: mesmas linhas/colunas/texto, larguras; sem senhas), **Tela cheia**, **Colunas** (mostrar/ocultar). Ficha do cliente (`FichaLead`) abre pelo menu da linha / duplo clique no nome. Permissões = matriz atual (ver mapa).
