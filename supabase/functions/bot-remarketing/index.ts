// bot-remarketing — cadência de reengajamento por IA. MODO SEGURO (inerte por default):
//  * REMARKETING_ATIVO=nao por DEFAULT → só faz o sync do Kanban, não envia nada.
//  * dry_run=true por DEFAULT → mesmo com master on, grava/loga simulação; Evolution não é chamada.
//  * envio real SÓ com REMARKETING_ATIVO=sim E dry_run=false.
//  * auth por x-bot-secret == webhook_config.bot_remarketing (padrão do cron). Deploy --no-verify-jwt.
//  * Guardas: janela seg-sáb 09-18 SP, teto diário (env), 1 toque/opp/dia (RPC), pausa/humano/sem-whatsapp (RPC),
//    e checagem FINAL da coluna no instante do envio (anti-race: time fechou o cliente entre o tick e o disparo).
//
// DOIS NÚMEROS (24/07/2026): o toque sai SEMPRE pelo CANAL DE DISPARO (papel='disparo',
// transporte='cloud_api'), resolvido por wa_canal_disparo() NO MOMENTO DO ENVIO — nunca por
// bot_remarketing.canal_id, que é cópia congelada do canal de ENTRADA (chip de tráfego).
// Sem canal de disparo => NÃO envia. Nunca cai para a Evolution por omissão.
//  * IA por toque (Claude→Gemini) + MESMO guardrail.ts; se a IA cair/guardrail barrar 2x → copy fixo do ângulo.
//
// BLOCO 5 — JANELA DE 24H (só afeta canal transporte='cloud_api'; Evolution segue idêntica):
//    dentro da janela  → texto livre gerado pela IA, como sempre;
//    fora da janela    → template APROVADO, com as variáveis preenchidas;
//    fora e sem template → NÃO ENVIA. Marca 'bloqueada_janela' e NÃO consome o toque da cadência
//    (senão o lead perderia toques em silêncio). Nunca, em hipótese alguma, cai para texto livre:
//    a Meta recusaria (131047) e, pior, texto livre fora da janela é o que derruba número oficial.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { gerarResposta, type Msg } from '../bot-runner/ia.ts';
import { saidaSuja } from '../bot-runner/guardrail.ts';
import { primeiroNome } from '../bot-runner/fluxo.ts';
import { anguloDoToque, systemRemarketing, preencherNome } from '../bot-runner/remarketing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Este worker NÃO fala mais com a Evolution: o remarketing sai exclusivamente pelo canal de
// disparo (cloud_api). Sem EVO_BASE/EVO_KEY aqui, não há como voltar a cair no chip de tráfego.
const ATIVO = (Deno.env.get('REMARKETING_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const TETO_DIA = Math.max(0, Number(Deno.env.get('REMARKETING_TETO_DIA')) || 20);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-bot-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---- janela SP (Brasil sem horário de verão desde 2019 → UTC-3 fixo) ----
function agoraSP(): { weekday: string; hour: number; diaISO: string } {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), diaISO: `${get('year')}-${get('month')}-${get('day')}` };
}
function dentroDaJanela(s: { weekday: string; hour: number }): boolean {
  return s.weekday !== 'Sun' && s.hour >= 9 && s.hour < 18; // seg-sáb, 09:00-17:59
}

/** Extrai o código numérico do erro da Meta da mensagem do adaptador. O transporte junta
 *  message/error_user_msg/details numa string; 131050 (opt-out) e 131047 (fora da janela)
 *  precisam ser distinguidos de falha de rede, senão o painel acusa o canal como restrito à toa. */
function codigoMeta(msg: string): number | undefined {
  const m = (msg || '').match(/\b(13\d{4})\b/);
  return m ? Number(m[1]) : undefined;
}

// gera a mensagem do toque: IA (Claude→Gemini) → guardrail → fallback fixo do ângulo (nunca morre/suja).
async function gerarToque(admin: any, row: any, angulo: ReturnType<typeof anguloDoToque>): Promise<{ texto: string; via: 'ia' | 'fallback' }> {
  // contexto leve (nome/banco/financeiras) do estado da conversa
  let nome = '', banco = '', fins: string[] = [];
  if (row.conversa_id) {
    const { data: est } = await admin.from('bot_conversa_estado').select('dados_qualificacao').eq('conversa_id', row.conversa_id).maybeSingle();
    const d = (est?.dados_qualificacao ?? {}) as Record<string, unknown>;
    nome = String(d.nome_completo ?? '');
    banco = String(d.banco ?? '');
    fins = Array.isArray(d.financeiras) ? (d.financeiras as string[]) : [];
  }
  if (!nome && row.contato_id) {
    const { data: ct } = await admin.from('contatos').select('nome').eq('id', row.contato_id).maybeSingle();
    nome = String(ct?.nome ?? '');
  }
  const primeiro = primeiroNome(nome);
  const fallback = preencherNome(angulo.fallback, primeiro);

  const ctx: string[] = [];
  if (nome) ctx.push(`nome=${nome}`);
  if (banco) ctx.push(`banco=${banco}`);
  if (fins.length) ctx.push(`financeiras=${fins.join('/')}`);
  const system = systemRemarketing(angulo, ctx.join(', ') || null);
  const messages: Msg[] = [{ role: 'user', content: `[reengajamento automático — toque ${angulo.dia >= 0 ? 'D+' + angulo.dia : ''}] Escreva a mensagem deste toque.` }];

  try {
    let saida = await gerarResposta({ messages, system, dificil: true });
    let texto = limparSaida(saida);
    if (saidaSuja(texto)) {
      saida = await gerarResposta({ messages, system: system + '\n\n⚠️ Não cite valores, percentuais, prazos, garantias nem credenciais. Reescreva limpo.', dificil: true });
      texto = limparSaida(saida);
      if (saidaSuja(texto)) return { texto: fallback, via: 'fallback' };
    }
    texto = preencherNome(texto, primeiro);
    return texto ? { texto, via: 'ia' } : { texto: fallback, via: 'fallback' };
  } catch { return { texto: fallback, via: 'fallback' }; }
}
// remove qualquer bloco <estado> que a IA possa emitir por hábito, e apara.
function limparSaida(s: string): string { return (s ?? '').replace(/<estado>[\s\S]*/i, '').trim(); }

/* ===================== Templates (fora da janela de 24h) ===================== */

export interface TemplateRow {
  id: string; nome: string; idioma: string; corpo: string;
  variaveis: unknown; meta_template_id: string | null;
}
/** Nome do contato (para {{1}} do template). Consulta pontual, só quando vai usar. */
async function nomeDoContato(admin: any, row: { contato_id?: string | null }): Promise<string> {
  if (!row.contato_id) return '';
  const { data } = await admin.from('contatos').select('nome').eq('id', row.contato_id).maybeSingle();
  return String(data?.nome ?? '');
}
/** Valores das {{1}},{{2}}… na ORDEM cadastrada. Hoje só sabemos preencher a variável de nome;
 *  qualquer outra sai com o `exemplo` cadastrado — nunca vazio, porque a Meta recusa parâmetro
 *  em branco (132000) e um template pela metade é pior que não enviar. */
function varsDoTemplate(tpl: TemplateRow, primeiro: string): string[] {
  const defs = Array.isArray(tpl.variaveis) ? tpl.variaveis as Array<Record<string, unknown>> : [];
  return defs.map((d) => {
    const rotulo = String(d?.rotulo ?? '').toLowerCase();
    if (/nome|primeiro|cliente/.test(rotulo) && primeiro) return primeiro;
    const ex = String(d?.exemplo ?? '').trim();
    return ex || primeiro || 'cliente';
  });
}
/** Reconstrói o corpo com as variáveis, para gravar na conversa o que o cliente realmente leu. */
function preencherTemplate(corpo: string, vars: string[]): string {
  return (corpo ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => vars[Number(n) - 1] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const secretHeader = req.headers.get('x-bot-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'bot_remarketing').maybeSingle();
    if (!wc?.secret || secretHeader !== wc.secret) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean; force?: boolean };
    const dryRun = body.dry_run !== false;   // DEFAULT seguro
    const force = body.force === true;       // testes: fura janela + master off (mas nunca envia se !ATIVO)

    // 1) SYNC Kanban → fila (sempre roda, mesmo inerte)
    const { data: sync } = await admin.rpc('bot_remarketing_sync');

    // 2) master off → só sync (a menos que force, p/ exercitar em dry_run)
    if (!ATIVO && !force) return json({ ok: true, sync, skipped: 'master_off', ativo: false, dry_run: dryRun });

    // 3) janela SP
    const sp = agoraSP();
    if (!dentroDaJanela(sp) && !force) return json({ ok: true, sync, skipped: 'fora_janela', sp });

    // 4) teto diário (conta toques já disparados hoje, SP)
    const inicioDiaSP = new Date(`${sp.diaISO}T00:00:00-03:00`).toISOString();
    const { count: hoje } = await admin.from('bot_remarketing')
      .select('id', { count: 'exact', head: true }).gte('ultimo_toque_em', inicioDiaSP);
    const restante = Math.max(0, TETO_DIA - (hoje ?? 0));
    if (restante <= 0) return json({ ok: true, sync, skipped: 'teto_diario', teto: TETO_DIA, hoje });

    // 5) filas prontas (todas as travas de humano/pausa/1-por-dia/destino já aplicadas na RPC)
    const { data: due } = await admin.rpc('bot_remarketing_due', { p_limit: restante });
    const fila = (due ?? []) as Array<any>;

    const resultados: any[] = [];
    let enviados = 0;
    // "não tem template aprovado" é problema de CONFIGURAÇÃO da org, igual para todos os leads dela.
    // Sem esta memória por tick, cada lead bloqueado geraria uma linha de audit_log a cada 10 min —
    // ruído que esconde o que importa. Aqui a org é avisada UMA vez por execução.
    const orgSemTemplate = new Set<string>();
    const orgSemCanal = new Set<string>();
    for (const row of fila) {
      if (enviados >= restante) break;

      // ══════ 6) CANAL DE DISPARO — resolvido AGORA, não na entrada da fila ══════
      // bot_remarketing.canal_id é cópia CONGELADA de conversas.canal_id, tirada quando a opp
      // entrou em REMARKETING. As 52 linhas existentes apontam 100% para canal Evolution — ou
      // seja, ler dali para enviar faria o remarketing sair pelo chip de TRÁFEGO, que é
      // exatamente o que derrubava os números. A coluna fica como registro histórico
      // ("de onde a conversa veio") e NUNCA mais decide destino.
      // organizacao_id vem da FILA (bot_remarketing_due). Sem ela, wa_canal_disparo(null) devolve
      // null e o toque vira 'sem_canal_disparo' pelo motivo errado — parecendo comportamento certo.
      const orgRow = (row.organizacao_id as string | null) ?? null;
      if (!orgRow) {
        resultados.push({ id: row.id, toque: row.toque, status_envio: 'sem_organizacao' });
        continue;
      }
      const { data: canalDisparoId } = await admin.rpc('wa_canal_disparo', { p_org: orgRow });

      if (!canalDisparoId) {
        // Nenhum canal de disparo, ou ambíguo (2+ sem disparo_padrao). NÃO cai para a Evolution
        // por omissão — cair de volta no número de tráfego é o bug que esta frente existe para matar.
        resultados.push({ id: row.id, toque: row.toque, status_envio: 'sem_canal_disparo' });
        const chaveOrg = String(orgRow ?? '-');
        if (!orgSemCanal.has(chaveOrg)) {
          orgSemCanal.add(chaveOrg);
          try {
            await admin.from('audit_log').insert({
              usuario_id: null, acao: 'bot_remarketing', entidade: 'bot_remarketing', entidade_id: row.id,
              organizacao_id: orgRow,
              dados_depois: { status_envio: 'sem_canal_disparo', dry_run: dryRun, nota: 'nenhum canal cloud_api com papel disparo ativo, ou mais de um sem disparo_padrao — um registro por execução' },
            });
          } catch { /* audit best-effort */ }
        }
        continue;
      }

      const { data: canal } = await admin.from('canais')
        .select('id, organizacao_id, nome_interno, numero_conectado, instancia_externa, transporte, cloud_phone_number_id, envio_restrito, status_integracao, ativo')
        .eq('id', canalDisparoId as string).maybeSingle();
      // wa_canal_disparo já garante cloud_api + ativo + papel; isto é cinto e suspensório.
      const ehCloud = (canal?.transporte as string | null) === 'cloud_api';
      if (!canal || !ehCloud) {
        resultados.push({ id: row.id, toque: row.toque, status_envio: 'sem_canal_disparo', motivo: 'canal_invalido' });
        continue;
      }
      // O worker NÃO passa pelo evolution-send, então as barreiras de "quem pode disparar"
      // precisam existir aqui dentro — senão ele contorna todas elas.
      if (canal.envio_restrito) {
        resultados.push({ id: row.id, toque: row.toque, status_envio: 'canal_restrito' });
        continue;
      }

      // ══════ 6.2) OPT-OUT DA META — antes de qualquer trabalho ══════
      // 131050/user_preferences: a pessoa disse à Meta que não quer marketing deste número.
      // Reenviar depois disso é o caminho mais rápido para derrubar o rating.
      const { data: optout } = await admin.rpc('wa_optout_ativo', { p_contato: row.contato_id, p_canal: canal.id });
      if (optout === true) {
        resultados.push({ id: row.id, toque: row.toque, status_envio: 'optout_meta' });
        // não consome o toque: se um dia der 'resume', a cadência continua de onde parou.
        continue;
      }

      // ══════ 6.3) JANELA POR (CANAL DE DISPARO, CONTATO) ══════
      // A janela é do NÚMERO REMETENTE. Perguntar pela conversa daria "aberta" por causa do
      // inbound no número de atendimento — janela fantasma, e a Meta recusaria com 131047.
      const { data: d } = await admin.rpc('wa_dentro_janela', { p_canal: canal.id, p_contato: row.contato_id });
      const dentroJanela = d === true;
      // toque do banco é 0-based (índice de ANGULOS); o template é 1-based, como no painel.
      const toqueTemplate = (row.toque ?? 0) + 1;
      let tpl: TemplateRow | null = null;
      if (!dentroJanela) {
        const { data: t } = await admin.rpc('wa_template_para_envio', { p_org: orgRow, p_toque: toqueTemplate });
        tpl = ((Array.isArray(t) ? t[0] : t) ?? null) as TemplateRow | null;
        if (!tpl) {
          // REGRA DURA: sem template aprovado para ESTE toque, não sai e NÃO consome a cadência —
          // se consumisse, o lead perderia toques em silêncio por um problema de configuração.
          resultados.push({ id: row.id, toque: row.toque, status_envio: 'bloqueada_janela', motivo: `sem_template_toque_${toqueTemplate}` });
          const chaveToque = `${orgRow ?? '-'}|${toqueTemplate}`;
          if (!orgSemTemplate.has(chaveToque)) {
            orgSemTemplate.add(chaveToque);
            try {
              await admin.from('audit_log').insert({
                usuario_id: null, acao: 'bot_remarketing', entidade: 'bot_remarketing', entidade_id: row.id,
                organizacao_id: orgRow,
                dados_depois: { status_envio: 'bloqueada_janela', motivo: 'sem_template_aprovado', toque: toqueTemplate, transporte: 'cloud_api', dry_run: dryRun, nota: 'um registro por execução e por toque' },
              });
            } catch { /* audit best-effort */ }
          }
          continue;
        }
      }

      // 6.1) gera a mensagem (IA é a parte lenta, ~1-2s no Claude). Fora da janela o texto da IA
      //      NÃO é enviado — quem vai é o template — mas continua servindo de contexto/histórico.
      const angulo = anguloDoToque(row.toque ?? 0);
      const usaTemplate = !dentroJanela;   // o canal de disparo é sempre cloud_api
      // o nome só é buscado no ramo do template — no ramo normal quem já busca é o gerarToque,
      // e consultar duas vezes seria custo novo num caminho que não mudou.
      const primeiro = usaTemplate ? primeiroNome(await nomeDoContato(admin, row)) : '';
      const { texto, via } = usaTemplate
        ? { texto: preencherTemplate(tpl!.corpo, varsDoTemplate(tpl!, primeiro)), via: 'template' as const }
        : await gerarToque(admin, row, angulo);

      // 7) checagem FINAL anti-race — IMEDIATAMENTE antes do envio, depois da IA: relê a coluna FRESCA
      //     do banco (RPC = query nova, não valor cacheado do due), sob FOR UPDATE. Se o time fechou/moveu
      //     a opp durante o tick OU durante a geração da IA, cancela e NÃO envia.
      const { data: pode } = await admin.rpc('bot_remarketing_checar_envio', { p_id: row.id });
      if (!pode) { resultados.push({ id: row.id, skipped: 'saiu_da_coluna' }); continue; }

      // ══════ 8) ENVIO — sempre pela Cloud API, sempre pelo canal de disparo ══════
      let envio: { ok: boolean; id?: string; erro?: string; codigo?: number } = { ok: true };
      let statusEnvio = 'simulada';
      let outboxErro: string | null = null;      // envio OK mas a mensagem não entrou na conversa
      let contabilidadeErro: string | null = null; // envio OK mas a cadência não avançou
      const modoEnvio = dentroJanela ? 'cloud_texto' : 'cloud_template';
      if (ATIVO && !dryRun) {
        // DESTINO: só contato com wa_id de inbound registrado. A Cloud API não tem onWhatsApp,
        // então não dá para validar o número antes — e cada template é dinheiro. Nunca outbound-first.
        const { data: ident } = await admin.from('contato_identidades')
          .select('valor_normalizado').eq('contato_id', row.contato_id).eq('tipo', 'whatsapp')
          .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
        const destino = ident?.valor_normalizado ?? null;
        // ANTI-AUTOENVIO: o worker não passa pelo evolution-send, que é quem normalmente barra isso.
        const ehProprioNumero = !!destino && !!canal.cloud_phone_number_id
          && destino === (canal as { numero_conectado?: string | null }).numero_conectado;

        if (!canal.cloud_phone_number_id || !destino) {
          envio = { ok: false, erro: !destino ? 'sem_destino' : 'sem_phone_number_id' };
          statusEnvio = 'falhou';
        } else if (ehProprioNumero) {
          envio = { ok: false, erro: 'autoenvio' };
          statusEnvio = 'falhou';
        } else {
          const tx = enviadorDe(canal as { transporte?: string | null; instancia_externa?: string | null; cloud_phone_number_id?: string | null });
          try {
            const enviado = dentroJanela
              ? await tx.sendText(destino, texto)
              : await tx.sendTemplate(destino, { nome: tpl!.nome, idioma: tpl!.idioma, variaveis: varsDoTemplate(tpl!, primeiro) });
            envio = { ok: !!enviado?.key?.id, id: enviado?.key?.id, erro: enviado?.key?.id ? undefined : 'sem_id_externo' };
          } catch (e) {
            const msg = (e as Error)?.message ?? 'erro_cloud';
            envio = { ok: false, erro: msg.slice(0, 300), codigo: codigoMeta(msg) };
          }
          statusEnvio = envio.ok ? 'enviada' : 'falhou';

          // 131050 = a pessoa pediu à Meta para parar de receber marketing deste número.
          // "Do not retry sending messages to this user" — vira ESTADO, não tentativa perdida.
          //
          // O status só muda DEPOIS de a persistência dar certo. Marcar antes fazia a resposta
          // dizer 'optout_meta' mesmo quando wa_optout ficava vazia — e aí o contato voltaria à
          // fila amanhã, e todo dia depois, contra alguém que pediu à Meta para parar. É onde a
          // Meta mais olha, e quem apanha é o número pago.
          if (envio.codigo === 131050) {
            const { error: eOpt } = await admin.rpc('wa_optout_registrar', {
              p_contato: row.contato_id, p_canal: canal.id, p_motivo: 'erro_131050', p_detalhe: envio.erro ?? null,
            });
            if (eOpt) {
              statusEnvio = 'optout_nao_persistido';
              envio.erro = `optout_falhou:${(eOpt.message ?? '').slice(0, 160)}`;
            } else {
              statusEnvio = 'optout_meta';
            }
          }

          if (envio.ok && row.conversa_id) {
            const nowIso = new Date().toISOString();
            // OUTBOX: a mensagem JÁ saiu e a Meta JÁ cobrou. Se este insert falhar em silêncio, o
            // cliente recebeu algo que não existe na conversa — o atendente vê a resposta dele
            // vinda do nada. Erro aqui não pode ser engolido.
            const { error: eMsg } = await admin.from('mensagens').insert({
              organizacao_id: orgRow ?? undefined, conversa_id: row.conversa_id,
              direcao: 'saida', tipo: 'texto', conteudo: texto, autor_id: null, origem: 'bot',
              status: 'enviada', id_externo: envio.id ?? null,
              metadados: dentroJanela
                ? { via: 'remarketing', transporte: 'cloud_api', canal_disparo: canal.nome_interno }
                : { via: 'remarketing', transporte: 'cloud_api', canal_disparo: canal.nome_interno, template: tpl!.nome, template_id: tpl!.id, toque: toqueTemplate },
            });
            if (eMsg) outboxErro = (eMsg.message ?? 'insert_falhou').slice(0, 200);
            await admin.from('conversas').update({ ultima_interacao_em: nowIso }).eq('id', row.conversa_id);
          }
        }
      }

      // 9) CONTABILIDADE. Avança a cadência só se o envio não falhou de fato (em dry_run sempre
      //    avança — simula progressão). Idempotente por (fila, toque): p_toque_esperado faz a RPC
      //    virar no-op se alguém já contabilizou este mesmo toque, então repetir não pula passo.
      //
      //    Se o envio DEU CERTO e isto falhar, o toque não avança e no próximo ciclo o MESMO lead
      //    recebe o MESMO template — pago duas vezes, e repetição idêntica é sinal de spam para a
      //    Meta. Não dá para desfazer um envio já cobrado; o que dá é NÃO deixar isso virar
      //    silêncio: status próprio + audit_log com o wamid, para achar exatamente o que saiu.
      let proximo: string | null = null;
      if (statusEnvio !== 'falhou' && statusEnvio !== 'optout_meta' && statusEnvio !== 'optout_nao_persistido') {
        const { data: prox, error: eCad } = await admin.rpc('bot_remarketing_registrar_toque', {
          p_id: row.id, p_toque_esperado: row.toque ?? 0, p_wamid: envio.id ?? null,
        });
        if (eCad) {
          contabilidadeErro = (eCad.message ?? 'registrar_toque_falhou').slice(0, 200);
          if (statusEnvio === 'enviada') statusEnvio = 'enviada_sem_contabilidade';
        } else {
          proximo = (prox as string) ?? null;
        }
        // conta no teto do dia de qualquer jeito: o dinheiro foi gasto mesmo que a cadência não tenha andado.
        enviados++;
      }

      // audit
      try {
        const { data: brOrg } = await admin.from('bot_remarketing').select('organizacao_id').eq('id', row.id).maybeSingle();
        await admin.from('audit_log').insert({
          usuario_id: null, acao: 'bot_remarketing', entidade: 'bot_remarketing', entidade_id: row.id,
          organizacao_id: brOrg?.organizacao_id ?? null,
          dados_depois: { toque: row.toque, angulo: angulo.foco, via, status_envio: statusEnvio, erro: envio.erro ?? null, dry_run: dryRun, proximo_em: proximo, modo_envio: modoEnvio, template: tpl?.nome ?? null,
            wamid: envio.id ?? null, outbox_erro: outboxErro, contabilidade_erro: contabilidadeErro },
        });
      } catch { /* audit best-effort */ }

      resultados.push({ id: row.id, toque: row.toque, via, status_envio: statusEnvio, modo_envio: modoEnvio, template: tpl?.nome ?? null, texto: dryRun ? texto : undefined, proximo_em: proximo,
        ...(outboxErro ? { outbox_erro: outboxErro } : {}), ...(contabilidadeErro ? { contabilidade_erro: contabilidadeErro } : {}) });
    }

    return json({ ok: true, sync, ativo: ATIVO, dry_run: dryRun, sp, teto: TETO_DIA, hoje, processados: fila.length, enviados, resultados });
  } catch (e) { return json({ error: (e as Error)?.message ?? 'erro' }, 500); }
});
