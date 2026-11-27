// reviza-planilha-sync — sincronização Google Planilhas ⇄ sistema (Reviza), nos 2
// sentidos, com "a planilha manda em tudo" como regra de desempate.
// v1 (19/10): rodada = PUSH (outbox sistema→planilha) → PULL (diff 3 vias S×E×P,
//  incremental — NUNCA trunca) → APLICAR (sync_aplicar, transação única com
//  advisory lock). Freio de segurança antes de aplicar (saídas demais, mudança em
//  massa ou estrutura divergente → pendência para o admin com "Aplicar mesmo assim").
//  FAIL-CLOSED: sem credencial, sem teste ok, com conferência pendente ou com freio
//  ativo, nenhuma rodada roda nem escreve.
// verify_jwt=false — cada porta tem a sua checagem (padrão reviza-licenca):
//  · ?acao=credencial|testar|conferir|aplicar|agora → JWT de usuário ATIVO com papel
//    aprovador (cadastro/financeiro/gestor/admin — o espelho do papelAprova do front);
//  · ?acao=cron   → x-motor-secret (MOTOR_SECRET, clonado na mig 72);
//  · ?acao=onedit → segredo próprio da planilha (sync_planilha_config.na_hora_segredo),
//    com rate-limit de 60s (o Apps Script do "na hora" chama aqui).
// A CHAVE da conta de serviço chega no corpo de ?acao=credencial, vai cifrada ao
// banco por sync_credencial_gravar e NUNCA aparece em log, retorno ou erro.
// Toda ação de usuário devolve o sync_estado() NOVO (chamado como o usuário), que o
// front joga direto no cache (shape EstadoSync do contrato, chaves camelCase).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CAMPOS_SENHA, Casado, Coluna, LeadCasar, Mapa, Pags,
  arred2, cpfChave, letra, marcaSenha, montarMapa, nbChave, nomeChave,
} from './folha.ts';
import {
  ABA_CANCELADOS, ABA_MENSAL, ConflitoNovo, EspelhoLinha, ItemAplicar, Preparo, Sistema,
  diffFolha, preparar, rotuloColuna,
} from './diff.ts';
import {
  CredencialGoogle, ErroGoogle, InfoPlanilha,
  escreverValores, inserirLinhas, lerCredencial, lerValores, obterPlanilha, testarAssinatura,
} from './google.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-motor-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const msgDe = (e: unknown) => String((e as Error)?.message ?? e);

/** comparação em tempo constante (mesmo padrão do reviza-wa-motor) */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

const PAPEIS_APROVADORES = new Set(['cadastro', 'financeiro', 'gestor', 'admin']);
const MSG_SEM_ACESSO = 'Sem acesso à planilha: ela deixou de estar compartilhada com a conta do sistema.';
const LIMITE_CHAVE_BYTES = 20 * 1024;
const TETO_NOVOS_POR_RODADA = 10;
const TETO_OUTBOX_POR_RODADA = 300;
// cobre a planilha INTEIRA: linha sem par além do teto viraria 'novo' SEM olhar a
// Lixeira (duplicata criada com o original arquivado — perda disfarçada). ~830 linhas
// hoje; a busca é uma chamada só e o SQL aguenta a lista.
const TETO_LIXEIRA_POR_RODADA = 1000;

/** lê TODAS as linhas (PostgREST corta em 1000) — padrão todas() do reviza-wa-motor */
async function todas<T>(rotulo: string, monta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const PAG = 1000; const out: T[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await monta(i * PAG, i * PAG + PAG - 1);
    if (error) throw new Error(`leitura de ${rotulo} falhou: ${error.message}`);
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAG) break;
  }
  return out;
}
const lotes = <T>(xs: T[], n = 200): T[][] => { const r: T[][] = []; for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n)); return r; };

/* =====================================================================
   CONFIGURAÇÃO (sync_planilha_config, singleton)
   ===================================================================== */
type SyncCfg = {
  planilha_id: string | null; planilha_url: string | null; conta_email: string | null;
  chave_enviada_em: string | null; teste: { ok?: boolean } | null;
  aplicada_em: string | null; configurada_em: string | null; exige_conferencia: boolean;
  automatico: boolean; intervalo_min: number; na_hora_segredo: string | null;
  freio_saidas: number; freio_pct: number; processando_ate: string | null; ultima_rodada_em: string | null;
};

async function lerCfg(admin: Admin): Promise<SyncCfg | null> {
  const { data, error } = await admin.from('sync_planilha_config')
    .select('planilha_id, planilha_url, conta_email, chave_enviada_em, teste, aplicada_em, configurada_em, exige_conferencia, automatico, intervalo_min, na_hora_segredo, freio_saidas, freio_pct, processando_ate, ultima_rodada_em')
    .limit(1).maybeSingle();
  if (error) throw new Error(`config da sincronização: ${error.message}`);
  return (data as SyncCfg | null) ?? null;
}
async function salvarCfg(admin: Admin, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('sync_planilha_config')
    .update({ ...patch, atualizado_em: new Date().toISOString() }).eq('singleton', true);
  if (error) throw new Error(`gravar config da sincronização: ${error.message}`);
}

async function credencialAtual(admin: Admin): Promise<CredencialGoogle | null> {
  const { data, error } = await admin.rpc('sync_credencial_ler');
  if (error) throw new Error(`credencial: ${error.message}`);
  if (typeof data !== 'string' || !data) return null;
  const r = lerCredencial(data);
  if (!r.ok) { console.error('[reviza-planilha-sync] credencial guardada não parseia (o conteúdo não é logado)'); return null; }
  return r.cred;
}

async function freioAtivo(admin: Admin): Promise<{ id: string } | null> {
  const { data, error } = await admin.from('sync_freio').select('id').is('resolvido_em', null)
    .order('detectado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`freio: ${error.message}`);
  return (data as { id: string } | null) ?? null;
}

async function logRodada(
  admin: Admin, origem: string, resultado: string, da: number, para: number, duracaoMs: number, mensagem: string | null,
): Promise<void> {
  const { error } = await admin.from('sync_rodadas').insert({
    id: crypto.randomUUID(), quando: new Date().toISOString(), origem, resultado,
    da_planilha: da, para_planilha: para, duracao_ms: Math.round(duracaoMs), mensagem,
  });
  if (error) console.error('[reviza-planilha-sync] log da rodada:', error.message);
  await salvarCfg(admin, { ultima_rodada_em: new Date().toISOString() }).catch((e) => console.error('[reviza-planilha-sync] ultima_rodada_em:', msgDe(e)));
}

async function gravarConflitos(admin: Admin, conflitos: ConflitoNovo[]): Promise<void> {
  if (!conflitos.length) return;
  const agora = new Date().toISOString();
  for (const lote of lotes(conflitos, 100)) {
    const { error } = await admin.from('sync_conflitos').insert(lote.map((c) => ({
      id: crypto.randomUUID(), quando: agora, lead_id: c.lead_id, campo: c.campo,
      valor_planilha: c.valor_planilha, valor_sistema: c.valor_sistema,
    })));
    if (error) console.error('[reviza-planilha-sync] gravar conflitos:', error.message);
  }
}

/* =====================================================================
   LEITURA DO SISTEMA (service_role; tabelas sem policy) + DO GOOGLE
   ===================================================================== */
type ColunaDb = { id: string; ordem: number; titulo: string; tipo: 'campo' | 'mes' | 'livre'; campo: string | null; mes_pos: number | null };

async function carregarSistema(admin: Admin): Promise<Sistema> {
  const { data: colsDb, error: eC } = await admin.from('planilha_colunas')
    .select('id, ordem, titulo, tipo, campo, mes_pos').order('ordem', { ascending: true }).order('id', { ascending: true });
  if (eC) throw new Error(`colunas: ${eC.message}`);
  const colunas: Coluna[] = ((colsDb ?? []) as ColunaDb[]).map((c, i) => ({
    id: c.id, pos: i, tipo: c.tipo, campo: c.campo, mesPos: c.mes_pos, titulo: c.titulo ?? '',
  }));
  const mapa: Mapa = montarMapa(colunas);

  const { data: blocos, error: eB } = await admin.from('planilha_blocos').select('id, dia, situacao, comp_base');
  if (eB) throw new Error(`blocos: ${eB.message}`);

  const linhasTodas = await todas<{ id: string; ordem: number; tipo: string; bloco: string | null; lead_id: string | null }>(
    'linhas', (de, ate) => admin.from('planilha_linhas').select('id, ordem, tipo, bloco, lead_id')
      .order('ordem', { ascending: true }).order('id', { ascending: true }).range(de, ate));
  const linhas = linhasTodas.filter((l) => l.tipo !== 'cliente' || l.lead_id);   // lead na Lixeira = linha oculta

  const celulasTodas = await todas<{ linha_id: string; coluna_id: string; texto: string | null }>(
    'células', (de, ate) => admin.from('planilha_celulas').select('linha_id, coluna_id, texto')
      .order('linha_id', { ascending: true }).order('coluna_id', { ascending: true }).range(de, ate));
  const celulas = new Map<string, string>();
  for (const c of celulasTodas) celulas.set(`${c.linha_id}\u0000${c.coluna_id}`, c.texto ?? '');

  const leads = await todas<LeadCasar>('leads', (de, ate) =>
    admin.from('leads').select('id, nome, cpf, nb, banco, dia, situacao, comercial, parado_pendente')
      .order('id', { ascending: true }).range(de, ate));

  const pagsLista = await todas<{ lead_id: string; comp: string; status: string; valor: number | null }>(
    'pagamentos', (de, ate) => admin.from('pagamentos').select('lead_id, comp, status, valor')
      .order('id', { ascending: true }).range(de, ate));
  const pags: Pags = new Map();
  for (const p of pagsLista) {
    (pags.get(p.lead_id) ?? pags.set(p.lead_id, new Map()).get(p.lead_id)!)
      .set(p.comp, [p.status, p.valor === null ? null : arred2(Number(p.valor))] as const);
  }

  const { data: novosPend, error: eN } = await admin.from('sync_outbox')
    .select('lead_id').eq('status', 'pendente').eq('tipo', 'cliente_novo');
  if (eN) throw new Error(`outbox: ${eN.message}`);
  const naoSair = new Set<string>(((novosPend ?? []) as { lead_id: string | null }[])
    .map((x) => x.lead_id).filter((x): x is string => !!x));

  return { mapa, blocos: blocos ?? [], linhas, celulas, leads, pags, naoSair };
}

async function lerEspelho(admin: Admin): Promise<EspelhoLinha[]> {
  return await todas<EspelhoLinha>('espelho', (de, ate) =>
    admin.from('sync_espelho').select('aba, linha, hash, valores, tipo, lead_id')
      .order('aba', { ascending: true }).order('linha', { ascending: true }).range(de, ate));
}

type Colheita = {
  sistema: Sistema; info: InfoPlanilha; mensal: string[][]; cancelados: string[][];
  espelho: EspelhoLinha[]; prep: Preparo;
};

/** UMA leitura do Google por rodada: spreadsheets.get + batchGet das 2 abas */
async function colherDados(admin: Admin, cred: CredencialGoogle, cfg: SyncCfg): Promise<Colheita | { erro: string }> {
  const sistema = await carregarSistema(admin);
  const info = await obterPlanilha(cred, cfg.planilha_id!);
  const titulos = info.abas.map((a) => a.titulo);
  for (const aba of [ABA_MENSAL, ABA_CANCELADOS]) {
    if (!titulos.includes(aba)) return { erro: `A aba "${aba}" não foi encontrada na planilha.` };
  }
  // 2 colunas a mais que o mapa: é assim que uma coluna NOVA criada no fim aparece
  const fim = letra(sistema.mapa.ncol + 1);
  const [mensal, cancelados] = await lerValores(cred, cfg.planilha_id!, [
    `'${ABA_MENSAL}'!A1:${fim}`, `'${ABA_CANCELADOS}'!A1:${fim}`,
  ]);
  const prep = preparar(mensal, sistema);
  const espelho = await lerEspelho(admin);
  return { sistema, info, mensal, cancelados, espelho, prep };
}

/** linhas sem lead casado → procura na Lixeira (restaurar em vez de criar de novo).
    Contrato da mig 71: entrada = lista [{cpf, nome, nb}]; saída ALINHADA por índice
    [{trash_id, lead_id}] (nulos quando não achou). */
async function buscarLixeira(admin: Admin, prep: Preparo, mapa: Mapa): Promise<Map<number, { trash_id: string; lead_id: string }>> {
  const out = new Map<number, { trash_id: string; lead_id: string }>();
  const idxs = prep.semPar.slice(0, TETO_LIXEIRA_POR_RODADA);
  if (!idxs.length) return out;
  const posCpf = mapa.posCampo.get('cpf');
  const posNome = mapa.posCampo.get('nome')!;
  const posNb = mapa.posCampo.get('nb');
  const chaves = idxs.map((idx) => {
    const t = prep.folha.linhas[idx].t;
    return {
      cpf: posCpf !== undefined ? cpfChave(t[posCpf]) : null,
      nome: nomeChave(t[posNome]) || null,
      nb: posNb !== undefined ? (nbChave(t[posNb]) || null) : null,
    };
  });
  const { data, error } = await admin.rpc('sync_lixeira_buscar', { p: chaves });
  if (error) throw new Error(`busca na Lixeira: ${error.message}`);
  const lista = (Array.isArray(data) ? data : []) as { trash_id?: string | null; lead_id?: string | null }[];
  idxs.forEach((idx, i) => {
    const achado = lista[i];
    if (achado?.trash_id && achado?.lead_id) out.set(idx, { trash_id: achado.trash_id, lead_id: achado.lead_id });
  });
  return out;
}

/* =====================================================================
   PUSH — outbox sistema→planilha (antes do pull; a planilha manda nos conflitos)
   ===================================================================== */
type ItemOutbox = {
  id: string; criado_em: string; tipo: string; linha_id: string | null; coluna_id: string | null;
  lead_id: string | null; valor_novo: string | null; valor_esperado: string | null;
};
type ResultadoPush = {
  enviados: number; conflitos: ConflitoNovo[];
  /** a planilha mudou entre a leitura e a escrita: nada foi enviado, itens seguem pendentes */
  adiado?: string;
};

async function marcarOutbox(admin: Admin, ids: string[], status: string, motivo: string | null): Promise<void> {
  if (!ids.length) return;
  const { error } = await admin.from('sync_outbox')
    .update({ status, processado_em: new Date().toISOString(), motivo })
    .in('id', ids).eq('status', 'pendente');
  if (error) console.error('[reviza-planilha-sync] marcar outbox:', error.message);
}

async function processarPush(
  admin: Admin, cred: CredencialGoogle, cfg: SyncCfg, col: Colheita,
): Promise<ResultadoPush> {
  const { sistema, prep, info } = col;
  const m = sistema.mapa;
  const r: ResultadoPush = { enviados: 0, conflitos: [] };
  const { data: pend, error } = await admin.from('sync_outbox')
    .select('id, criado_em, tipo, linha_id, coluna_id, lead_id, valor_novo, valor_esperado')
    .eq('status', 'pendente').order('criado_em', { ascending: true }).limit(TETO_OUTBOX_POR_RODADA);
  if (error) throw new Error(`outbox pendente: ${error.message}`);
  const itens = (pend ?? []) as ItemOutbox[];
  if (!itens.length) return r;

  const colPorId = new Map(m.colunas.map((c) => [c.id, c]));
  const sisLinhaPorId = new Map(sistema.linhas.map((l) => [l.id, l]));
  const leadIdx = new Map<string, number>();
  prep.folha.linhas.forEach((_ln, i) => { const c = prep.casados.get(i); if (c) leadIdx.set(c.leadId, i); });
  const abaMensal = info.abas.find((a) => a.titulo === ABA_MENSAL)!;

  const enviadosNovos: string[] = [];
  /** itens de célula escritos na planilha nesta rodada: id → valor que FOI escrito */
  const escritoPor = new Map<string, string | null>();
  const emConflito: { id: string; motivo: string }[] = [];
  const descartados: { id: string; motivo: string }[] = [];
  const escritas: { range: string; values: string[][] }[] = [];

  /* ---- clientes novos do sistema: monta as linhas ANTES de qualquer escrita (a
     senha vem por RPC — fora do caminho crítico da verificação logo abaixo) ---- */
  const novos = itens.filter((i) => i.tipo === 'cliente_novo').slice(0, TETO_NOVOS_POR_RODADA);
  const valoresNovo = new Map<string, string[]>();
  for (const item of novos) {
    const sis = item.linha_id ? sisLinhaPorId.get(item.linha_id) : null;
    if (!sis?.lead_id || leadIdx.has(sis.lead_id)) continue;       // os descartes ficam no laço de escrita
    // os textos do PRÓPRIO sistema (senha incluída: a planilha já guarda senha em texto)
    const valores: string[] = [];
    for (const c of m.colunas) {
      if (c.campo && CAMPOS_SENHA.has(c.campo)) {
        const { data: senha, error: eS } = await admin.rpc('sync_senha_ler', {
          p_lead: sis.lead_id, p_tipo: c.campo === 'senha_inss' ? 'inss' : 'reclame',
        });
        if (eS) throw new Error(`senha para o push: ${eS.message}`);
        valores.push(typeof senha === 'string' ? senha : '');
      } else {
        valores.push(sistema.celulas.get(`${sis.id}\u0000${c.id}`) ?? '');
      }
    }
    valoresNovo.set(item.id, valores);
  }

  /* ---- a planilha mudou desde a leitura da rodada? Uma linha inserida, removida ou
     reordenada no meio deslocaria TODAS as escritas abaixo do ponto (célula gravada na
     linha do VIZINHO; cliente novo caindo dentro de um ciclo). Imediatamente antes de
     escrever, relê só a coluna do NOME e confere cada linha-alvo: qualquer diferença →
     o push INTEIRO é adiado (nada é escrito nem marcado; a próxima rodada relê). ---- */
  {
    const alvos = new Set<number>();                               // r 0-based do snapshot
    if (valoresNovo.size) {
      let fimN = -1;
      for (let i = 0; i < prep.folha.linhas.length; i++) if (prep.folha.linhas[i].bloco === 'NOVOS') fimN = i;
      if (fimN >= 0) alvos.add(prep.folha.linhas[fimN].r);         // a âncora da inserção
    }
    for (const item of itens) {
      if (item.tipo !== 'celula') continue;
      const colna = item.coluna_id ? colPorId.get(item.coluna_id) : null;
      const sis = item.linha_id ? sisLinhaPorId.get(item.linha_id) : null;
      if (!colna || !sis) continue;
      const ln = sis.tipo === 'cliente'
        ? (sis.lead_id && leadIdx.has(sis.lead_id) ? prep.folha.linhas[leadIdx.get(sis.lead_id)!] : undefined)
        : prep.folha.linhas.find((l) => l.tipo === sis.tipo && l.bloco === sis.bloco);
      if (ln) alvos.add(ln.r);
    }
    if (alvos.size) {
      const posNome = m.posCampo.get('nome')!;
      const colN = letra(posNome);
      const rs = [...alvos];
      const rMin = Math.min(...rs);
      const rMax = Math.max(...rs);
      const [nomes] = await lerValores(cred, cfg.planilha_id!, [`'${ABA_MENSAL}'!${colN}${rMin + 1}:${colN}${rMax + 1}`]);
      const porR = new Map(prep.folha.linhas.map((l) => [l.r, l]));
      for (const rAlvo of rs) {
        const esperado = porR.get(rAlvo)?.t[posNome] ?? '';
        const atual = nomes?.[rAlvo - rMin]?.[0] ?? '';
        if (atual !== esperado) {
          return { ...r, adiado: 'A planilha mudou de lugar durante a rodada — o envio foi adiado e tenta de novo na próxima sincronização.' };
        }
      }
    }
  }

  /* ---- clientes novos → linha no FIM da seção NOVOS ---- */
  for (const item of novos) {
    const sis = item.linha_id ? sisLinhaPorId.get(item.linha_id) : null;
    if (!sis || !sis.lead_id) { descartados.push({ id: item.id, motivo: 'cliente não existe mais no sistema' }); continue; }
    if (leadIdx.has(sis.lead_id)) { descartados.push({ id: item.id, motivo: 'o cliente já tem linha na planilha' }); continue; }
    let fimNovos = -1;
    for (let i = 0; i < prep.folha.linhas.length; i++) if (prep.folha.linhas[i].bloco === 'NOVOS') fimNovos = i;
    if (fimNovos < 0) { descartados.push({ id: item.id, motivo: 'a seção NOVOS não foi encontrada na planilha' }); continue; }
    const valores = valoresNovo.get(item.id);
    if (!valores) { descartados.push({ id: item.id, motivo: 'cliente não existe mais no sistema' }); continue; }
    const aposLinha = prep.folha.linhas[fimNovos].r + 1;           // 1-based: insere DEPOIS dela
    await inserirLinhas(cred, cfg.planilha_id!, abaMensal.sheetId, aposLinha, 1);
    await escreverValores(cred, cfg.planilha_id!, [{
      range: `'${ABA_MENSAL}'!A${aposLinha + 1}:${letra(m.ncol - 1)}${aposLinha + 1}`, values: [valores],
    }]);
    // espelha na memória: o pull compara contra o pós-push
    const nova = { r: aposLinha, ordem: 0, tipo: 'cliente' as const, bloco: 'NOVOS', t: valores };
    for (const ln of prep.folha.linhas) if (ln.r >= aposLinha) ln.r += 1;
    const idxNovo = fimNovos + 1;
    // reindexa casados/semPar depois do ponto de inserção
    const casadosNovo = new Map<number, Casado>();
    for (const [i, v] of prep.casados) casadosNovo.set(i >= idxNovo ? i + 1 : i, v);
    prep.casados.clear(); for (const [i, v] of casadosNovo) prep.casados.set(i, v);
    prep.semPar = prep.semPar.map((i) => (i >= idxNovo ? i + 1 : i));
    prep.folha.linhas.splice(idxNovo, 0, nova);
    prep.folha.linhas.forEach((ln, i) => { ln.ordem = 1000 * (i + 1); });
    prep.casados.set(idxNovo, { leadId: sis.lead_id, passada: 'P1', candidatos: 1, empate: false });
    prep.clientes += 1;
    leadIdx.set(sis.lead_id, idxNovo);
    col.mensal.splice(aposLinha, 0, [...valores]);
    enviadosNovos.push(item.id);
    r.enviados += 1;
  }

  /* ---- células: localizar pela CHAVE, conferir o valor esperado, escrever em lote ---- */
  for (const item of itens) {
    if (item.tipo !== 'celula') continue;
    const colna = item.coluna_id ? colPorId.get(item.coluna_id) : null;
    if (!colna) { descartados.push({ id: item.id, motivo: 'coluna não existe mais' }); continue; }
    if (colna.campo && CAMPOS_SENHA.has(colna.campo)) { descartados.push({ id: item.id, motivo: 'coluna de senha não sincroniza por célula' }); continue; }
    const sis = item.linha_id ? sisLinhaPorId.get(item.linha_id) : null;
    if (!sis) { descartados.push({ id: item.id, motivo: 'linha não existe mais no sistema' }); continue; }
    if (sis.tipo === 'cliente') {
      const idx = sis.lead_id ? leadIdx.get(sis.lead_id) : undefined;
      if (idx === undefined) {
        emConflito.push({ id: item.id, motivo: 'cliente não encontrado na planilha — a planilha manda' });
        r.conflitos.push({ lead_id: sis.lead_id, campo: rotuloColuna(colna, null), valor_planilha: '(linha não encontrada na planilha)', valor_sistema: item.valor_novo ?? '' });
        continue;
      }
      const ln = prep.folha.linhas[idx];
      if (ln.bloco !== sis.bloco) {
        emConflito.push({ id: item.id, motivo: 'linha em outra seção na planilha — mova a linha na planilha' });
        r.conflitos.push({ lead_id: sis.lead_id, campo: 'Linha', valor_planilha: `seção ${ln.bloco ?? '—'} — mova a linha na planilha`, valor_sistema: `seção ${sis.bloco ?? '—'}` });
        continue;
      }
      const atual = ln.t[colna.pos] ?? '';
      // a planilha já tem exatamente este valor (ex.: células da linha que o
      // cliente_novo acabou de escrever): nada a enviar, nada em desacordo
      if (atual === (item.valor_novo ?? '')) {
        descartados.push({ id: item.id, motivo: 'a planilha já tinha este valor' });
        continue;
      }
      if (atual !== (item.valor_esperado ?? '')) {
        emConflito.push({ id: item.id, motivo: 'a célula mudou na planilha desde a última sincronização — a planilha manda' });
        r.conflitos.push({ lead_id: sis.lead_id, campo: rotuloColuna(colna, null), valor_planilha: atual, valor_sistema: item.valor_novo ?? '' });
        continue;
      }
      escritas.push({ range: `'${ABA_MENSAL}'!${letra(colna.pos)}${ln.r + 1}`, values: [[item.valor_novo ?? '']] });
      ln.t[colna.pos] = item.valor_novo ?? '';
      if (col.mensal[ln.r]) col.mensal[ln.r][colna.pos] = item.valor_novo ?? '';
      escritoPor.set(item.id, item.valor_novo ?? null);
      r.enviados += 1;
    } else {
      // cabeçalho/rótulo: localizar pelo bloco
      const ln = prep.folha.linhas.find((l) => l.tipo === sis.tipo && l.bloco === sis.bloco);
      if (!ln) { emConflito.push({ id: item.id, motivo: 'linha não encontrada na planilha' }); continue; }
      const atual = ln.t[colna.pos] ?? '';
      if (atual === (item.valor_novo ?? '')) {
        descartados.push({ id: item.id, motivo: 'a planilha já tinha este valor' });
        continue;
      }
      if (atual !== (item.valor_esperado ?? '')) {
        emConflito.push({ id: item.id, motivo: 'a célula mudou na planilha desde a última sincronização — a planilha manda' });
        r.conflitos.push({ lead_id: null, campo: rotuloColuna(colna, null), valor_planilha: atual, valor_sistema: item.valor_novo ?? '' });
        continue;
      }
      escritas.push({ range: `'${ABA_MENSAL}'!${letra(colna.pos)}${ln.r + 1}`, values: [[item.valor_novo ?? '']] });
      ln.t[colna.pos] = item.valor_novo ?? '';
      if (col.mensal[ln.r]) col.mensal[ln.r][colna.pos] = item.valor_novo ?? '';
      escritoPor.set(item.id, item.valor_novo ?? null);
      r.enviados += 1;
    }
  }

  if (escritas.length) await escreverValores(cred, cfg.planilha_id!, escritas);
  // O gatilho pode ter ATUALIZADO um item pendente durante a rodada (nova edição no
  // sistema na mesma célula): marcar 'enviado' às cegas perderia essa edição PARA SEMPRE
  // (o valor novo nunca iria à planilha e o diff S==E nunca a recuperaria). Relê os
  // itens de célula escritos: valor igual → enviado; mudou → o item fica pendente com o
  // valor_esperado trocado pelo que acabou de ir à planilha (o próximo push leva a
  // edição nova sem conflito falso).
  {
    const ids = [...escritoPor.keys()];
    const mudaram = new Set<string>();
    if (ids.length) {
      const { data: deNovo, error: eRe } = await admin.from('sync_outbox')
        .select('id, valor_novo').in('id', ids).eq('status', 'pendente');
      if (eRe) console.error('[reviza-planilha-sync] releitura da outbox:', eRe.message);
      for (const x of ((deNovo ?? []) as { id: string; valor_novo: string | null }[])) {
        if ((x.valor_novo ?? '') !== (escritoPor.get(x.id) ?? '')) {
          mudaram.add(x.id);
          const { error: eUp } = await admin.from('sync_outbox')
            .update({ valor_esperado: escritoPor.get(x.id) ?? null }).eq('id', x.id).eq('status', 'pendente');
          if (eUp) console.error('[reviza-planilha-sync] valor_esperado pós-push:', eUp.message);
        }
      }
    }
    await marcarOutbox(admin, ids.filter((id) => !mudaram.has(id)), 'enviado', null);
  }
  await marcarOutbox(admin, enviadosNovos, 'enviado', null);
  for (const c of emConflito) await marcarOutbox(admin, [c.id], 'conflito', c.motivo);
  for (const d of descartados) await marcarOutbox(admin, [d.id], 'descartado', d.motivo);
  await gravarConflitos(admin, r.conflitos);
  return r;
}

/* =====================================================================
   ESPELHO — upsert só do que mudou + remoção do que sumiu
   ===================================================================== */
async function gravarEspelho(admin: Admin, antes: EspelhoLinha[], depois: EspelhoLinha[]): Promise<void> {
  const chave = (l: EspelhoLinha) => `${l.aba}\u0000${l.linha}`;
  const antigos = new Map(antes.map((l) => [chave(l), l]));
  const upserts: EspelhoLinha[] = [];
  const vistos = new Set<string>();
  for (const l of depois) {
    vistos.add(chave(l));
    const a = antigos.get(chave(l));
    if (!a || a.hash !== l.hash || a.tipo !== l.tipo || a.lead_id !== l.lead_id) upserts.push(l);
  }
  for (const lote of lotes(upserts, 200)) {
    const { error } = await admin.from('sync_espelho').upsert(lote, { onConflict: 'aba,linha' });
    if (error) throw new Error(`gravar espelho: ${error.message}`);
  }
  const sobras = antes.filter((l) => !vistos.has(chave(l)));
  for (const aba of [ABA_MENSAL, ABA_CANCELADOS]) {
    const nums = sobras.filter((l) => l.aba === aba).map((l) => l.linha);
    for (const lote of lotes(nums, 300)) {
      const { error } = await admin.from('sync_espelho').delete().eq('aba', aba).in('linha', lote);
      if (error) throw new Error(`limpar espelho: ${error.message}`);
    }
  }
}

/* =====================================================================
   RODADA — trava → push → pull → freio → aplicar → espelho → log
   ===================================================================== */
type Origem = 'automatica' | 'manual' | 'na_hora' | 'primeira';
type SaidaRodada = { resultado: 'ok' | 'sem_mudancas' | 'erro' | 'freio'; daPlanilha: number; paraPlanilha: number; mensagem: string | null };
type OpcoesRodada = {
  origem: Origem;
  ignorarFreio?: boolean;
  /** modo 'aplicar': dispensa configurada_em/exige_conferencia (é a própria resolução) */
  aplicando?: boolean;
  atorId?: string | null;
  mensagemOk?: string | null;
};

/** pré-condições fail-closed; devolve a recusa (sem rodar) ou null */
async function recusaRodada(admin: Admin, cfg: SyncCfg | null, cred: CredencialGoogle | null, o: OpcoesRodada): Promise<string | null> {
  if (!cfg) return 'A sincronização ainda não foi configurada.';
  if (!cfg.planilha_id) return 'Informe o link da planilha antes.';
  if (!cred) return 'Envie a chave da conta de serviço antes.';
  if (cfg.teste?.ok !== true) return o.aplicando ? 'Teste a conexão antes de conferir as mudanças.' : 'Teste a conexão antes de sincronizar.';
  if (!o.aplicando) {
    if (!cfg.configurada_em) return 'A sincronização ainda não foi configurada.';
    if (cfg.exige_conferencia) return 'Confira as mudanças da planilha nova antes de sincronizar.';
    if (!o.ignorarFreio && await freioAtivo(admin)) return 'Há uma rodada pausada pelo freio de segurança. Confira e aplique antes.';
  }
  return null;
}

async function rodada(admin: Admin, cfg: SyncCfg, cred: CredencialGoogle, o: OpcoesRodada): Promise<SaidaRodada | { recusa: string }> {
  const inicio = Date.now();
  // trava: só UMA rodada por vez (padrão processando_ate do motor; renovável)
  let ate = new Date(Date.now() + 180_000).toISOString();
  const { data: trava, error: eT } = await admin.from('sync_planilha_config')
    .update({ processando_ate: ate }).eq('singleton', true)
    .or(`processando_ate.is.null,processando_ate.lt."${new Date().toISOString()}"`).select('singleton');
  if (eT) throw new Error(`trava da rodada: ${eT.message}`);
  if (!trava?.length) return { recusa: 'Já há uma sincronização em andamento. Aguarde um instante e tente de novo.' };
  const renovar = async (ms: number): Promise<boolean> => {
    const novo = new Date(Date.now() + ms).toISOString();
    const { data: ok } = await admin.from('sync_planilha_config')
      .update({ processando_ate: novo }).eq('singleton', true).eq('processando_ate', ate).select('singleton');
    if (ok?.length) { ate = novo; return true; }
    return false;
  };
  const fim = async (resultado: SaidaRodada['resultado'], da: number, para: number, mensagem: string | null): Promise<SaidaRodada> => {
    await logRodada(admin, o.origem, resultado, da, para, Date.now() - inicio, mensagem);
    return { resultado, daPlanilha: da, paraPlanilha: para, mensagem };
  };

  try {
    let col: Colheita;
    try {
      const c = await colherDados(admin, cred, cfg);
      if ('erro' in c) return await fim('erro', 0, 0, c.erro);
      col = c;
    } catch (e) {
      if (e instanceof ErroGoogle) {
        const msg = e.codigo === 'sem_acesso' ? MSG_SEM_ACESSO
          : e.codigo === 'formato_excel' ? 'A planilha está no formato do Excel — use Arquivo → Salvar como Planilhas Google.'
          : 'O Google não respondeu a tempo.';
        return await fim('erro', 0, 0, msg);
      }
      throw e;
    }
    if (!(await renovar(180_000))) return { recusa: 'Outra sincronização assumiu a rodada.' };

    // 'aplicar' com a estrutura quebrada (mudou entre o conferir e o aplicar) não pode
    // terminar em 'sem_mudancas' — marcaria aplicada_em/configurada_em sem aplicar nada
    if (o.aplicando && col.prep.erroEstrutura) {
      return await fim('erro', 0, 0, `Não deu para ler a planilha: ${col.prep.erroEstrutura}.`);
    }

    // PUSH (se a folha não parseou, não dá para localizar linhas: pula e deixa pendente)
    let push: ResultadoPush = { enviados: 0, conflitos: [] };
    if (!col.prep.erroEstrutura) {
      try {
        push = await processarPush(admin, cred, cfg, col);
      } catch (e) {
        if (e instanceof ErroGoogle) return await fim('erro', 0, push.enviados, e.codigo === 'sem_acesso' ? MSG_SEM_ACESSO : 'O Google falhou no meio do envio — os itens pendentes tentam de novo na próxima rodada.');
        throw e;
      }
    }

    // PULL — diff 3 vias. No 'aplicar' (primeira aplicação ou planilha TROCADA) o
    // espelho guardado é de OUTRA planilha: o diff roda como 1ª rodada (sem espelho,
    // S×P direto, sem conflitos espúrios) e o espelho é reconstruído no fim.
    const lixeira = col.prep.erroEstrutura ? new Map<number, { trash_id: string; lead_id: string }>() : await buscarLixeira(admin, col.prep, col.sistema.mapa);
    const res = diffFolha({
      prep: col.prep, cancelados: col.cancelados, sistema: col.sistema,
      espelho: o.aplicando ? [] : col.espelho,
      lixeira, limites: { saidas: cfg.freio_saidas ?? 10, pct: cfg.freio_pct ?? 20 },
    });

    // senhas: sem espelho o SQL compara e só grava se mudou; com espelho, conflito se os dois mudaram
    const itens: ItemAplicar[] = [...res.itens];
    let daPlanilha = res.mudancas;
    const conflitosSenha: ConflitoNovo[] = [];
    for (const s of res.senhas) {
      if (!s.conta) { itens.push(s.item); continue; }
      const { data: atual, error: eS } = await admin.rpc('sync_senha_ler', { p_lead: s.lead_id, p_tipo: s.tipo });
      if (eS) throw new Error(`senha para o diff: ${eS.message}`);
      const pHash = marcaSenha(typeof atual === 'string' ? atual : '');
      if (pHash === s.sHash) { daPlanilha -= 1; continue; }         // sistema já tem: só o espelho muda
      itens.push(s.item);
      if (s.eHash !== null && pHash !== s.eHash) {
        conflitosSenha.push({ lead_id: s.lead_id, campo: s.campo, valor_planilha: '•••', valor_sistema: '•••' });
      }
    }

    // FREIO antes de aplicar
    if (res.freio && !o.ignorarFreio) {
      const ativo = await freioAtivo(admin);
      const linhaFreio = {
        detectado_em: new Date().toISOString(), motivo: res.freio.motivo, grupos: res.grupos,
      };
      if (ativo) await admin.from('sync_freio').update(linhaFreio).eq('id', ativo.id);
      else await admin.from('sync_freio').insert({ id: crypto.randomUUID(), ...linhaFreio });
      return await fim('freio', 0, push.enviados, `Pausada pelo freio de segurança: ${res.freio.resumo}`);
    }
    if (o.ignorarFreio) {
      await admin.from('sync_freio').update({ resolvido_em: new Date().toISOString(), resolvido_por: o.atorId ?? null })
        .is('resolvido_em', null);
    }

    // APLICAR — uma chamada transacional (advisory lock no SQL)
    if (itens.length) {
      if (!(await renovar(360_000))) return { recusa: 'Outra sincronização assumiu a rodada.' };
      const { error: eA } = await admin.rpc('sync_aplicar', { p: { itens } });
      if (eA) {
        console.error('[reviza-planilha-sync] sync_aplicar:', (eA as { code?: string }).code ?? 'erro');
        return await fim('erro', 0, push.enviados, `Erro ao aplicar as mudanças no sistema (código ${(eA as { code?: string }).code ?? 'desconhecido'}). Nada foi aplicado nesta rodada.`);
      }
    }

    await gravarConflitos(admin, [...res.conflitos, ...conflitosSenha]);
    // erroEstrutura (+ "Aplicar mesmo assim"): espelhoNovo vem VAZIO — gravar apagaria
    // o espelho inteiro e a próxima rodada aplicaria tudo sem registrar conflitos
    if (!col.prep.erroEstrutura) await gravarEspelho(admin, col.espelho, res.espelhoNovo);
    await prune(admin);

    const semNada = daPlanilha === 0 && push.enviados === 0 && itens.length === 0;
    return await fim(semNada ? 'sem_mudancas' : 'ok', daPlanilha, push.enviados, o.mensagemOk ?? push.adiado ?? null);
  } finally {
    await admin.from('sync_planilha_config').update({ processando_ate: null })
      .eq('singleton', true).eq('processando_ate', ate);
  }
}

async function prune(admin: Admin): Promise<void> {
  try {
    const corte = async (tabela: string, colunaData: string, manter: number) => {
      const { data } = await admin.from(tabela).select(colunaData)
        .order(colunaData, { ascending: false }).range(manter, manter);
      const alvo = (data as Record<string, string>[] | null)?.[0]?.[colunaData];
      if (alvo) await admin.from(tabela).delete().lt(colunaData, alvo);
    };
    await corte('sync_rodadas', 'quando', 200);
    await corte('sync_conflitos', 'quando', 200);
    const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString();
    await admin.from('sync_outbox').delete().neq('status', 'pendente').lt('processado_em', seteDias);
    await admin.from('sync_conferencias').delete().is('aplicada_em', null).lt('gerada_em', seteDias);
  } catch (e) {
    console.error('[reviza-planilha-sync] prune:', msgDe(e));
  }
}

/* =====================================================================
   TESTAR — spreadsheets.get + batchGet; o resultado vai em config.teste
   (mesmos textos/correções da prévia do front; erro de teste NÃO é exceção)
   ===================================================================== */
type ItemConfere = { rotulo: string; ok: boolean };
type ErroTeste = { codigo: string; titulo: string; detalhe: string; correcao: string[] };
type ResultadoTeste = {
  ok: boolean; quando: string; abas: string[]; clientes: number | null;
  localidade: ItemConfere | null; fuso: ItemConfere | null; erro: ErroTeste | null;
};

const CORRECAO_TESTAR_DE_NOVO = 'Volte aqui e clique em Testar de novo.';
const LOCALES: Record<string, string> = { pt_BR: 'Brasil', pt_PT: 'Portugal', en_US: 'Estados Unidos', es_AR: 'Argentina' };

async function executarTeste(cred: CredencialGoogle, planilhaId: string, mapa: Mapa): Promise<ResultadoTeste> {
  const quando = new Date().toISOString();
  const base: Pick<ResultadoTeste, 'ok' | 'quando'> = { ok: false, quando };
  let info: InfoPlanilha;
  try {
    info = await obterPlanilha(cred, planilhaId);
  } catch (e) {
    if (e instanceof ErroGoogle && e.codigo === 'sem_acesso') {
      return {
        ...base, abas: [], clientes: null, localidade: null, fuso: null,
        erro: {
          codigo: 'sem_acesso', titulo: 'A conta do sistema não tem acesso à planilha',
          detalhe: `O Google recusou a leitura: a planilha ainda não foi compartilhada com ${cred.client_email}, ou foi compartilhada só como Leitor.`,
          correcao: [
            'Na planilha, clique em [[Compartilhar]] (botão no canto superior direito).',
            'Cole o e-mail da conta do sistema e escolha [[Editor]].',
            'Desmarque [[Notificar pessoas]] e clique em [[Compartilhar]].',
            CORRECAO_TESTAR_DE_NOVO,
          ],
        },
      };
    }
    if (e instanceof ErroGoogle && e.codigo === 'formato_excel') {
      return {
        ...base, abas: [], clientes: null, localidade: null, fuso: null,
        erro: {
          codigo: 'formato_excel', titulo: 'A planilha ainda está no formato do Excel (.xlsx)',
          detalhe: 'O Google não lê planilhas abertas no modo de compatibilidade do Excel.',
          correcao: [
            'Abra a planilha no Google Planilhas.',
            'Use {Arquivo > Salvar como Planilhas Google}.',
            'Cole aqui o link da planilha nova (passo do link).',
            CORRECAO_TESTAR_DE_NOVO,
          ],
        },
      };
    }
    return {
      ...base, abas: [], clientes: null, localidade: null, fuso: null,
      erro: { codigo: 'falha', titulo: 'Não foi possível ler a planilha', detalhe: 'O Google não respondeu a tempo.', correcao: ['Aguarde um minuto e clique em Testar de novo.'] },
    };
  }
  const abas = info.abas.map((a) => a.titulo);
  const localidade: ItemConfere = { rotulo: LOCALES[info.locale] ?? info.locale ?? '—', ok: (info.locale ?? '').startsWith('pt_BR') };
  const fuso: ItemConfere = {
    rotulo: info.timeZone === 'America/Sao_Paulo' ? 'São Paulo (GMT-03:00)' : (info.timeZone || '—'),
    ok: info.timeZone === 'America/Sao_Paulo',
  };
  let clientes: number | null = null;
  if (abas.includes(ABA_MENSAL)) {
    try {
      const [mensal] = await lerValores(cred, planilhaId, [`'${ABA_MENSAL}'!A1:${letra(mapa.ncol - 1)}`]);
      try {
        const sintetico: Sistema = { mapa, blocos: [], linhas: [], celulas: new Map(), leads: [], pags: new Map(), naoSair: new Set() };
        const prep = preparar(mensal, sintetico);
        clientes = prep.erroEstrutura ? mensal.filter((row) => row.some((c) => c.trim() !== '')).length : prep.clientes;
      } catch { clientes = null; }
    } catch { clientes = null; }
  }
  const faltando = [ABA_MENSAL, ABA_CANCELADOS].find((a) => !abas.includes(a));
  if (faltando) {
    return {
      ...base, abas, clientes, localidade, fuso,
      erro: {
        codigo: 'aba_faltando', titulo: `A aba "${faltando}" não foi encontrada`,
        detalhe: `Abas encontradas na planilha: ${abas.join(', ') || 'nenhuma'}.`,
        correcao: [
          faltando === ABA_CANCELADOS
            ? 'No rodapé da planilha, clique duas vezes no nome da aba que guarda os clientes cancelados.'
            : 'No rodapé da planilha, clique duas vezes no nome da aba que guarda os clientes mensais.',
          `Renomeie para [[${faltando}]], exatamente assim, e aperte Enter.`,
          `Se a aba não existir, crie uma (botão + no rodapé) com esse nome e o mesmo cabeçalho da aba ${faltando === ABA_CANCELADOS ? ABA_MENSAL : ABA_CANCELADOS}.`,
          CORRECAO_TESTAR_DE_NOVO,
        ],
      },
    };
  }
  if (!localidade.ok) {
    return {
      ...base, abas, clientes, localidade, fuso,
      erro: {
        codigo: 'localidade', titulo: 'A localidade da planilha não é Brasil',
        detalhe: `Com a localidade ${localidade.rotulo}, uma data como 05/10 vira 10 de maio e valores com vírgula são lidos errado.`,
        correcao: [
          'Na planilha, abra {Arquivo > Configurações}.',
          'Em [[Localidade]], escolha Brasil. Em [[Fuso horário]], escolha (GMT-03:00) Horário de São Paulo.',
          'Clique em [[Salvar configurações]].',
          CORRECAO_TESTAR_DE_NOVO,
        ],
      },
    };
  }
  return { ok: true, quando, abas, clientes, localidade, fuso, erro: null };
}

/* =====================================================================
   CONFERIR — leitura + diff SEM aplicar; grava sync_conferencias
   ===================================================================== */
async function executarConferir(admin: Admin, cred: CredencialGoogle, cfg: SyncCfg): Promise<{ erro?: string }> {
  const c = await colherDados(admin, cred, cfg);
  if ('erro' in c) return { erro: c.erro };
  if (c.prep.erroEstrutura) return { erro: `Não deu para ler a planilha: ${c.prep.erroEstrutura}.` };
  const lixeira = await buscarLixeira(admin, c.prep, c.sistema.mapa);
  // planilha nova (1ª vez ou trocada): o espelho guardado é de outra planilha — confere S×P direto
  const espelho = (cfg.exige_conferencia || !cfg.configurada_em) ? [] : c.espelho;
  const res = diffFolha({
    prep: c.prep, cancelados: c.cancelados, sistema: c.sistema, espelho,
    lixeira, limites: { saidas: Number.MAX_SAFE_INTEGER, pct: 100_000 },   // conferir não freia: ele É a conferência
  });
  const total = res.grupos.reduce((s, g) => s + g.total, 0);
  // só a última conferência não aplicada interessa (o sync_estado mostra essa)
  await admin.from('sync_conferencias').delete().is('aplicada_em', null);
  const { error } = await admin.from('sync_conferencias').insert({
    id: crypto.randomUUID(), gerada_em: new Date().toISOString(), grupos: res.grupos, total,
  });
  if (error) return { erro: `Não foi possível guardar a conferência: ${error.message}` };
  return {};
}

/* =====================================================================
   HTTP
   ===================================================================== */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const motorSecret = Deno.env.get('MOTOR_SECRET') ?? '';
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const acao = new URL(req.url).searchParams.get('acao') ?? '';

  try {
    /* ---- CRON (a cada 15 min): inerte sem automatico/credencial — fail-closed ---- */
    if (acao === 'cron') {
      const viaSecret = !!motorSecret && igual(req.headers.get('x-motor-secret') ?? '', motorSecret);
      if (!viaSecret) return json({ erro: 'não autorizado' }, 401);
      try {
        const cfg = await lerCfg(admin);
        if (!cfg?.automatico) return json({ ok: true, inerte: 'automático desligado' });
        const cred = await credencialAtual(admin);
        const recusa = await recusaRodada(admin, cfg, cred, { origem: 'automatica' });
        if (recusa) return json({ ok: true, inerte: recusa });
        const r = await rodada(admin, cfg, cred!, { origem: 'automatica' });
        if ('recusa' in r) return json({ ok: true, inerte: r.recusa });
        return json({ ok: true, resultado: r.resultado, da_planilha: r.daPlanilha, para_planilha: r.paraPlanilha });
      } catch (e) {
        console.error('[reviza-planilha-sync] cron:', msgDe(e));
        return json({ ok: false, erro: msgDe(e).slice(0, 200) });   // 200: nunca derruba o cron
      }
    }

    /* ---- ONEDIT ("atualização na hora", Apps Script): segredo próprio + rate-limit ---- */
    if (acao === 'onedit') {
      const cfg = await lerCfg(admin);
      if (!cfg?.na_hora_segredo) return json({ erro: 'não configurado' }, 401);
      const u = new URL(req.url);
      let segredo = u.searchParams.get('segredo') ?? '';
      if (!segredo) {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        segredo = typeof body.segredo === 'string' ? body.segredo : '';
      }
      if (!igual(segredo, cfg.na_hora_segredo)) return json({ erro: 'não autorizado' }, 401);
      if (cfg.ultima_rodada_em && Date.now() - new Date(cfg.ultima_rodada_em).getTime() < 60_000) {
        return json({ ok: true, ignorado: 'a última rodada foi há menos de 1 minuto' });
      }
      if (!cfg.automatico) return json({ ok: true, inerte: 'sincronização desligada' });
      const cred = await credencialAtual(admin);
      const recusa = await recusaRodada(admin, cfg, cred, { origem: 'na_hora' });
      if (recusa) return json({ ok: true, inerte: recusa });
      const r = await rodada(admin, cfg, cred!, { origem: 'na_hora' });
      if ('recusa' in r) return json({ ok: true, inerte: r.recusa });
      return json({ ok: true, resultado: r.resultado });
    }

    /* ---- demais ações: usuário ATIVO com papel aprovador ---- */
    const asUser = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user?.id) return json({ error: 'não autenticado' }, 401);
    const { data: perfil } = await asUser.from('profiles').select('ativo, papel').eq('id', u.user.id).maybeSingle();
    if (!perfil?.ativo || !PAPEIS_APROVADORES.has(String(perfil.papel ?? ''))) {
      return json({ error: 'sem permissão para gerir a sincronização' }, 403);
    }
    const uid = u.user.id;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    /** o estado NOVO, como o usuário vê (é o que o front joga no cache) */
    const estadoNovo = async (): Promise<Response> => {
      const { data, error } = await asUser.rpc('sync_estado');
      if (error) return json({ error: `estado da sincronização: ${error.message}` }, 500);
      return json(data ?? {});
    };

    const cfg = await lerCfg(admin);
    if (!cfg) return json({ error: 'A sincronização ainda não está disponível (migração pendente).' }, 500);

    if (acao === 'credencial') {
      const chave = typeof body.chave === 'string' ? body.chave : '';
      if (!chave) return json({ error: 'Envie o conteúdo do arquivo .json da chave.' }, 400);
      if (chave.length > LIMITE_CHAVE_BYTES) return json({ error: 'O arquivo é grande demais para ser uma chave do Google.' }, 400);
      const r = lerCredencial(chave);
      if (!r.ok) return json({ error: r.erro }, 400);
      try { await testarAssinatura(r.cred); } catch {
        return json({ error: 'A chave privada não pôde ser lida pelo sistema. Baixe uma chave nova (JSON) e envie de novo.' }, 400);
      }
      const { error } = await admin.rpc('sync_credencial_gravar', {
        p_chave: chave, p_email: r.cred.client_email, p_projeto: r.cred.project_id,
      });
      if (error) {
        console.error('[reviza-planilha-sync] credencial não gravada:', (error as { code?: string }).code ?? 'erro');
        return json({ error: 'Não foi possível guardar a chave agora. Tente de novo.' }, 500);
      }
      return await estadoNovo();
    }

    if (acao === 'testar') {
      if (!cfg.planilha_id) return json({ error: 'Informe o link da planilha antes de testar.' }, 400);
      const cred = await credencialAtual(admin);
      if (!cred) return json({ error: 'Envie a chave antes de testar.' }, 400);
      const sistema = await carregarSistema(admin);
      const teste = await executarTeste(cred, cfg.planilha_id, sistema.mapa);
      await salvarCfg(admin, { teste });
      return await estadoNovo();
    }

    if (acao === 'conferir') {
      if (!cfg.planilha_id) return json({ error: 'Informe o link da planilha antes.' }, 400);
      const cred = await credencialAtual(admin);
      if (!cred) return json({ error: 'Envie a chave antes de conferir.' }, 400);
      if (cfg.teste?.ok !== true) return json({ error: 'Teste a conexão antes de conferir as mudanças.' }, 400);
      try {
        const r = await executarConferir(admin, cred, cfg);
        if (r.erro) return json({ error: r.erro }, 400);
      } catch (e) {
        if (e instanceof ErroGoogle) return json({ error: e.codigo === 'sem_acesso' ? MSG_SEM_ACESSO : 'O Google não respondeu a tempo. Tente de novo.' }, 502);
        throw e;
      }
      return await estadoNovo();
    }

    if (acao === 'aplicar') {
      const confId = typeof body.conferencia === 'string' ? body.conferencia : '';
      const { data: ult, error: eU } = await admin.from('sync_conferencias')
        .select('id').is('aplicada_em', null).order('gerada_em', { ascending: false }).limit(1).maybeSingle();
      if (eU) return json({ error: `conferência: ${eU.message}` }, 500);
      if (!ult || ult.id !== confId) return json({ error: 'A conferência mudou. Confira de novo antes de aplicar.' }, 400);
      const cred = await credencialAtual(admin);
      const o: OpcoesRodada = {
        origem: cfg.configurada_em ? 'manual' : 'primeira',
        ignorarFreio: true, aplicando: true, atorId: uid,
        mensagemOk: cfg.configurada_em ? 'Conferência da planilha nova aplicada.' : 'Primeira sincronização (conferência aplicada).',
      };
      const recusa = await recusaRodada(admin, cfg, cred, o);
      if (recusa) return json({ error: recusa }, 400);
      const r = await rodada(admin, cfg, cred!, o);
      if ('recusa' in r) return json({ error: r.recusa }, 409);
      if (r.resultado === 'erro') return json({ error: r.mensagem ?? 'Não foi possível aplicar agora. Tente de novo.' }, 502);
      const agora = new Date().toISOString();
      await admin.from('sync_conferencias').update({ aplicada_em: agora }).eq('id', confId);
      await salvarCfg(admin, {
        aplicada_em: agora,
        configurada_em: cfg.configurada_em ?? agora,
        exige_conferencia: false,
      });
      return await estadoNovo();
    }

    if (acao === 'agora') {
      const ignorarFreio = body.ignorar_freio === true;       // o "Aplicar mesmo assim" do front
      const cred = await credencialAtual(admin);
      const o: OpcoesRodada = { origem: 'manual', ignorarFreio, atorId: uid };
      const recusa = await recusaRodada(admin, cfg, cred, o);
      if (recusa) return json({ error: recusa }, 400);
      const r = await rodada(admin, cfg, cred!, o);
      if ('recusa' in r) return json({ error: r.recusa }, 409);
      return await estadoNovo();
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('[reviza-planilha-sync]', msgDe(e));
    return json({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 502);
  }
});
