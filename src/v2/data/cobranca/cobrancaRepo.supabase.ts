/* =====================================================================
   Implementação REAL da CobrancaRepo: Supabase (projeto dedicado da
   Reviza). Segurança = RLS + RPCs SECURITY DEFINER. Senhas nunca vêm no
   load (só via reveal_senha); comprovantes em bucket privado (só o path
   no banco, URL assinada sob demanda).
   ===================================================================== */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CobrancaRepo, CicloDataRow, MoverTurmaResultado, EsvaziarResultado } from './cobrancaRepo';
import type {
  Dados, GLinha, Entrada, MovFin, NovoLead, PatchLead, SitDebito,
  LancarPagamentoInput, MarcarCelulaInput, CampoSenha, StatusCancelamento, ResultadoCancelamento,
} from './types';

const BUCKET = 'comprovantes';

/* ---- helpers ---- */
function dataUrlParaBlob(url: string): Blob {
  const [meta, b64] = url.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* mapeia uma linha do banco -> GLinha (senha/reclameSenha nunca vêm daqui) */
function rowParaLead(r: Record<string, unknown>, celulas: string[]): GLinha {
  return {
    id: String(r.id), nome: (r.nome as string) ?? '', comercial: (r.comercial as string) ?? '',
    dia: Number(r.dia ?? 0), banco: (r.banco as string) ?? '', nb: (r.nb as string) ?? '',
    cpf: (r.cpf as string) ?? '', senha: '', reclameLogin: (r.reclame_login as string) ?? '', reclameSenha: '',
    valor: Number(r.valor ?? 0), salario: r.salario != null ? Number(r.salario) : undefined,
    faixa: (r.faixa_beneficio as GLinha['faixa']) ?? undefined,
    ultimoPgto: (r.ultimo_pgto as string) ?? '',
    fechamento: (r.fechamento as string) ?? '', recebe: (r.recebe as string) ?? '', telefone: (r.telefone as string) ?? '',
    situacao: (r.situacao as GLinha['situacao']) ?? 'ativo',
    dataReclamacao: (r.data_reclamacao as string) ?? '', dataParou: (r.data_parou as string) ?? '',
    parou: (r.parou as string) ?? '', obs: (r.obs as string) ?? undefined, celulas,
    paradoPendente: r.parado_pendente === true,
    paradoSolicitadoPor: (r.parado_solicitado_por as string) ?? undefined,
    paradoSolicitadoNome: (r.parado_solicitado_nome as string) ?? undefined,
    paradoSolicitadoEm: (r.parado_solicitado_em as string) ?? undefined,
    paradoAprovadoNome: (r.parado_aprovado_nome as string) ?? undefined,
    paradoAprovadoEm: (r.parado_aprovado_em as string) ?? undefined,
    cancelamento: (r.cancelamento as GLinha['cancelamento']) ?? null,
    canceladoEm: (r.cancelado_em as string) ?? undefined,
    canceladoPorNome: (r.cancelado_por_nome as string) ?? undefined,
    cancelamentoMotivo: (r.cancelamento_motivo as string) ?? undefined,
    cancelamentoEm: (r.cancelamento_em as string) ?? undefined,
    cancelamentoPorNome: (r.cancelamento_por_nome as string) ?? undefined,
  };
}

/** resposta das RPCs dos Cancelados (mig 81): {n, token do Desfazer} */
function resultadoCanc(data: unknown): ResultadoCancelamento {
  const r = (data ?? {}) as { n?: number; token?: string | null };
  return { n: Number(r.n ?? 0), token: r.token ? String(r.token) : null };
}

/* GLinha/patch -> colunas do banco (só as chaves presentes; sem senhas) */
function patchParaRow(patch: PatchLead): Record<string, unknown> {
  const map: Record<string, string> = {
    nome: 'nome', comercial: 'comercial', dia: 'dia', banco: 'banco', nb: 'nb', cpf: 'cpf',
    reclameLogin: 'reclame_login', valor: 'valor', salario: 'salario', faixa: 'faixa_beneficio', ultimoPgto: 'ultimo_pgto', fechamento: 'fechamento',
    recebe: 'recebe', telefone: 'telefone', situacao: 'situacao', dataReclamacao: 'data_reclamacao',
    dataParou: 'data_parou', parou: 'parou', obs: 'obs',
  };
  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(map)) {
    // chave PRESENTE com valor undefined = intenção de LIMPAR (ex.: Benefício "—"):
    // grava NULL — undefined puro sumiria no JSON do PATCH e o campo não limpava.
    if (k in patch) { const v = (patch as Record<string, unknown>)[k]; row[col] = v === undefined ? null : v; }
  }
  // contrato do adapter: dia 0 (front, "aguardando ciclo") ↔ NULL (banco).
  // Sem isso, salvar a ficha de um aguardando viola o check dia between 1 and 31.
  if ('dia' in row && Number(row.dia) === 0) row.dia = null;
  return row;
}

/** payload de import: GLinha → shape que as RPCs cobranca_importar* esperam */
function linhasParaImport(linhas: GLinha[]): Record<string, unknown>[] {
  return linhas.map((l) => ({
    nome: l.nome, comercial: l.comercial || null, banco: l.banco || null, nb: l.nb || null,
    cpf: l.cpf || null, reclame_login: l.reclameLogin || null,
    senha: l.senha || null, reclame_senha: l.reclameSenha || null,
    valor: l.valor ?? 0, salario: l.salario ?? null,
    ultimo_pgto: l.ultimoPgto || null, fechamento: l.fechamento || null, recebe: l.recebe || null,
    telefone: l.telefone || null, data_reclamacao: l.dataReclamacao || null,
    data_parou: l.dataParou || null, parou: l.parou || null, celulas: l.celulas,
  }));
}

export function criarRepoSupabase(c: SupabaseClient): CobrancaRepo {
  const uid = async () => (await c.auth.getUser()).data.user?.id ?? null;
  const meuNome = async () => {
    const u = (await c.auth.getUser()).data.user;
    if (!u) return '—';
    const { data } = await c.from('profiles').select('nome').eq('id', u.id).maybeSingle();
    return (data?.nome as string) || u.email || '—';
  };
  const garantirComp = async (comp: string) => {
    const { error } = await c.from('competencias').upsert({ comp }, { onConflict: 'comp', ignoreDuplicates: true });
    falhar(error);
  };
  const subirComprovante = async (leadId: string, comp: string, cp?: { nome: string; url?: string; path?: string }) => {
    if (!cp) return null;
    if (cp.path) return cp.path;                       // já está no Storage
    if (!cp.url) return null;
    const blob = cp.url.startsWith('data:') ? dataUrlParaBlob(cp.url) : await (await fetch(cp.url)).blob();
    const rid = (() => { try { return crypto.randomUUID(); } catch { return String(Date.now()); } })();
    const path = `${leadId}/${comp}/${rid}-${cp.nome}`;
    const { error } = await c.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type });
    if (error) throw error;
    return path;
  };
  const falhar = (e: { message?: string } | null) => { if (e) throw new Error(e.message || 'Falha no Supabase'); };
  // mensagens das RPCs da aprovação do débito parado (migs 52/53) vêm sem acento
  // do banco — aqui viram o texto que o usuário lê (o resto passa igual)
  const MSG_PARADO: Record<string, string> = {
    'este cliente ja esta em cobranca': 'Este cliente já está em cobrança.',
    'este cliente ja esta aguardando aprovacao': 'Este cliente já está aguardando aprovação.',
    'este cliente nao esta aguardando aprovacao': 'Este cliente não está mais aguardando aprovação — alguém já decidiu.',
    'escolha o ciclo (dia de 1 a 31)': 'Escolha o ciclo (dia de 1 a 31).',
    'valor invalido': 'Valor da parcela inválido.',
    'cliente nao encontrado': 'Cliente não encontrado — pode ter sido removido.',
    'so quem pediu (ou o financeiro/cadastro/administrador) pode cancelar': 'Só quem pediu (ou o financeiro, o cadastro ou o administrador) pode cancelar.',
    'este cliente nao e mais seu': 'Este cliente não é mais seu.',
    'este pedido ja foi decidido (aprovado ou recusado) — peca ao financeiro para reverter': 'Este pedido já foi decidido (aprovado ou recusado) — peça ao financeiro para reverter.',
    'nada para desfazer: o cliente mudou depois da decisao': 'Nada para desfazer: o cliente mudou depois da decisão.',
  };
  const falharParado = (e: { message?: string } | null) => {
    if (e) throw new Error((e.message && MSG_PARADO[e.message]) || e.message || 'Falha no Supabase');
  };

  return {
    async carregar(): Promise<Dados> {
      // PostgREST corta em 1000 linhas por resposta — paginar tudo que pode passar
      // disso (pagamentos são milhares) senão metade dos ciclos aparece zerada.
      const PAG = 1000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todas = async (build: (de: number, ate: number) => any) => {
        const out: any[] = [];
        for (let de = 0; ; de += PAG) {
          const { data, error } = await build(de, de + PAG - 1); falhar(error);
          const lote = data ?? []; out.push(...lote);
          if (lote.length < PAG) break;
        }
        return out;
      };
      const [compsR, entrR, ciclosR, abertosR, ordemR] = await Promise.all([
        c.from('competencias').select('comp').order('ordem', { ascending: true }),
        c.from('entradas').select('id, lead_id, lead_nome, comp, valor, por_nome, comprovante_path, quando').eq('estado', 'pendente').order('quando', { ascending: false }),
        c.from('ciclos_datas').select('dia, comp, inicio, fim, cobranca'),
        c.from('ciclos_abertos').select('dia'),
        c.from('cobranca_prefs').select('valor').eq('chave', 'ciclos_ordem').maybeSingle(),
      ]);
      falhar(compsR.error); falhar(entrR.error); falhar(ciclosR.error); falhar(abertosR.error); falhar(ordemR.error);
      // ordem de importação = ordem da planilha (dono 15/09): o grid usa isso como "Ordem: planilha"
      const leadsData = await todas((de, ate) => c.from('leads').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(de, ate));
      const pagsData = await todas((de, ate) => c.from('pagamentos').select('lead_id, comp, status, valor').order('lead_id', { ascending: true }).range(de, ate));
      const movData = await todas((de, ate) => c.from('mov_fin').select('id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, quando').order('quando', { ascending: false }).range(de, ate));

      const comps = (compsR.data ?? []).map((r) => String(r.comp));
      // índice de pagamentos por lead|comp
      const pg = new Map<string, { status: string; valor: number | null }>();
      for (const p of pagsData) pg.set(`${p.lead_id}|${p.comp}`, { status: String(p.status), valor: p.valor as number | null });
      const celulasDe = (leadId: string) => comps.map((cp) => {
        const x = pg.get(`${leadId}|${cp}`);
        if (!x || x.status === 'fora') return '-';
        if (x.status === 'nao_pagou') return 'NÃO PAGOU';
        return x.valor != null ? String(x.valor) : '-';
      });
      const todos = (leadsData ?? []).map((r) => rowParaLead(r as Record<string, unknown>, celulasDe(String((r as { id: string }).id))));
      const linhas = todos.filter((l) => !l.cancelamento);
      const cancelados = todos.filter((l) => !!l.cancelamento);

      const pendentes: Entrada[] = (entrR.data ?? []).map((e) => ({
        id: String(e.id), leadId: String(e.lead_id ?? ''), leadNome: (e.lead_nome as string) ?? '—',
        comp: String(e.comp), valor: Number(e.valor ?? 0), por: (e.por_nome as string) ?? '—',
        quando: (e.quando as string) ?? '',
        comprovante: e.comprovante_path ? { nome: 'comprovante', url: '', path: String(e.comprovante_path) } : undefined,
      }));
      const historico: MovFin[] = (movData ?? []).map((m, i) => ({
        id: m.id != null ? String(m.id) : `mov-${i}`, leadNome: (m.lead_nome as string) ?? '—',
        comercial: String(m.comercial_nome ?? '—').replace(/\s*\(comercial\)/i, '').trim() || '—',
        comp: String(m.comp), valor: Number(m.valor ?? 0), status: (m.status as MovFin['status']),
        quando: (m.quando as string) ?? '',
        comprovante: m.comprovante_path ? { nome: 'comprovante', url: '', path: String(m.comprovante_path) } : undefined,
      }));
      const ciclosDatas: Dados['ciclosDatas'] = {};
      for (const r of ciclosR.data ?? []) {
        const dia = String(r.dia); const cp = String(r.comp);
        (ciclosDatas![dia] ??= {})[cp] = { inicio: (r.inicio as string) ?? '', fim: (r.fim as string) ?? '', cobranca: (r.cobranca as string) ?? undefined };
      }
      const ciclosAbertos = ((abertosR.data ?? []) as { dia: number }[]).map((r) => Number(r.dia)).filter((d) => d >= 1 && d <= 31);
      const ordemRaw = (ordemR.data as { valor?: unknown } | null)?.valor;
      const ciclosOrdem = Array.isArray(ordemRaw) ? (ordemRaw as unknown[]).map(Number).filter((d) => d >= 1 && d <= 31) : undefined;
      return { comps, linhas, cancelados, pendentes, historico, ciclosDatas, ciclosAbertos, ciclosOrdem };
    },

    async criarLead(input: NovoLead): Promise<GLinha> {
      const row = { ...patchParaRow(input as PatchLead), created_by: await uid() };
      const { data, error } = await c.from('leads').insert(row).select('*').single();
      falhar(error);
      const id = String((data as { id: string }).id);
      if (input.senha) falhar((await c.rpc('set_senha', { p_lead: id, p_tipo: 'inss', p_valor: input.senha })).error);
      if (input.reclameSenha) falhar((await c.rpc('set_senha', { p_lead: id, p_tipo: 'reclame', p_valor: input.reclameSenha })).error);
      return { ...input, id, celulas: input.celulas ?? [] };
    },
    async editarLead(id: string, patch: PatchLead): Promise<void> {
      const row = patchParaRow(patch);
      if (Object.keys(row).length) { const { error } = await c.from('leads').update(row).eq('id', id); falhar(error); }
      if (patch.senha !== undefined) falhar((await c.rpc('set_senha', { p_lead: id, p_tipo: 'inss', p_valor: patch.senha })).error);
      if (patch.reclameSenha !== undefined) falhar((await c.rpc('set_senha', { p_lead: id, p_tipo: 'reclame', p_valor: patch.reclameSenha })).error);
    },
    async excluirLead(id: string): Promise<void> {
      // .select() confirma o efeito: se a RLS (leads_del = só gestor) filtrar a
      // linha, o DELETE volta 0 linhas SEM erro → precisamos lançar, senão o
      // "desfazer" de um cadastro daria falso-sucesso pra quem não é gestor.
      const { data, error } = await c.from('leads').delete().eq('id', id).select('id'); falhar(error);
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir este cliente (só gestor/admin). O cliente NÃO foi removido.');
    },
    async restaurarExcluido(cap: GLinha): Promise<void> {
      // o delete disparou o gatilho da lixeira (mig 32): acha o registro recém-
      // excluído DESSE lead (por lead_id — identidade, não nome, pra não trazer
      // homônimo errado) e restaura inteiro (dados + senhas + histórico).
      const { data, error } = await c.rpc('lixeira_listar'); falhar(error);
      const itens = (data ?? []) as { id: string; lead_id: string; nome: string; deletado_em: string }[];
      const porId = itens
        .filter((t) => String(t.lead_id) === String(cap.id))
        .sort((a, b) => (b.deletado_em ?? '').localeCompare(a.deletado_em ?? ''))[0];
      // fallback por nome só se o id não bater (não deveria acontecer)
      const alvo = porId ?? itens
        .filter((t) => (t.nome ?? '').trim().toUpperCase() === (cap.nome ?? '').trim().toUpperCase())
        .sort((a, b) => (b.deletado_em ?? '').localeCompare(a.deletado_em ?? ''))[0];
      if (!alvo) throw new Error('Não encontrei o cliente na lixeira para restaurar. Abra a Lixeira na Gestão e restaure de lá.');
      const { error: e2 } = await c.rpc('lead_restaurar', { p_trash_id: alvo.id }); falhar(e2);
    },
    async removerNovos(): Promise<{ removidos: string[] }> {
      const { data, error } = await c.rpc('remover_novos'); falhar(error);
      const r = (data ?? {}) as { removidos?: string[] };
      return { removidos: (r.removidos ?? []).map(String) };
    },
    async restaurarNovos(caps: GLinha[], ids: string[]): Promise<void> {
      // no real, a lixeira tem tudo — restaura pelos ids que o SERVIDOR apagou
      // (não os do cache: cobre Novos cadastrados por outra sessão nesse meio-tempo)
      const alvo = ids.length ? ids : caps.map((l) => l.id);
      if (!alvo.length) return;
      const { error } = await c.rpc('restaurar_leads', { p_lead_ids: alvo }); falhar(error);
    },

    // CANCELADOS (migs 79/80): RPCs com a permissão no banco; devolvem o estado de ANTES (Desfazer)
    async cancelarLeads(ids: string[], motivo?: string): Promise<ResultadoCancelamento> {
      const { data, error } = await c.rpc('leads_cancelar', { p_ids: ids, p_motivo: motivo?.trim() || null }); falhar(error);
      return resultadoCanc(data);
    },
    async statusCancelamento(ids: string[], status: StatusCancelamento): Promise<ResultadoCancelamento> {
      const { data, error } = await c.rpc('leads_cancelamento_status', { p_ids: ids, p_status: status }); falhar(error);
      return resultadoCanc(data);
    },
    async voltarDosCancelados(ids: string[]): Promise<ResultadoCancelamento> {
      const { data, error } = await c.rpc('leads_cancelados_voltar', { p_ids: ids }); falhar(error);
      return resultadoCanc(data);
    },
    async desfazerCancelamento(r: ResultadoCancelamento): Promise<{ n: number; total: number }> {
      if (!r.token) return { n: 0, total: 0 };
      const { data, error } = await c.rpc('leads_cancelamento_desfazer', { p_token: r.token }); falhar(error);
      const x = (data ?? {}) as { n?: number; total?: number };
      return { n: Number(x.n ?? 0), total: Number(x.total ?? 0) };
    },

    async lancarPagamento({ leadId, comp, valor, comprovante }: LancarPagamentoInput): Promise<Entrada> {
      await garantirComp(comp);
      const path = await subirComprovante(leadId, comp, comprovante);
      const lead = (await c.from('leads').select('nome').eq('id', leadId).maybeSingle()).data as { nome?: string } | null;
      const nome = await meuNome();
      const { data, error } = await c.from('entradas').insert({
        lead_id: leadId, lead_nome: lead?.nome ?? '—', comp, valor,
        por_id: await uid(), por_nome: `${nome} (comercial)`, estado: 'pendente', comprovante_path: path,
      }).select('id, quando').single();
      falhar(error);
      return {
        id: String((data as { id: string }).id), leadId, leadNome: lead?.nome ?? '—', comp, valor,
        por: `${nome} (comercial)`, quando: (data as { quando: string }).quando,
        comprovante: path ? { nome: comprovante?.nome ?? 'comprovante', url: '', path } : undefined,
      };
    },
    async confirmarEntrada(entradaId: string): Promise<void> {
      const { error } = await c.rpc('confirmar_entrada', { p_entrada_id: entradaId }); falhar(error);
    },
    async recusarEntrada(entradaId: string, motivo?: string): Promise<void> {
      const { error } = await c.rpc('recusar_entrada', { p_entrada_id: entradaId, p_motivo: motivo ?? null }); falhar(error);
    },
    async excluirMov(movId: string): Promise<void> {
      // policy mov_del: só admin apaga do ledger; não desfaz a célula da grade
      // .select() confirma o efeito: RLS barrando = 0 linhas SEM erro (falso "excluído")
      const { data, error } = await c.from('mov_fin').delete().eq('id', movId).select('id'); falhar(error);
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir este lançamento (só o administrador). Nada foi apagado.');
    },

    async marcarCelula({ leadId, comp, valor, comprovante }: MarcarCelulaInput): Promise<void> {
      await garantirComp(comp);
      const path = await subirComprovante(leadId, comp, comprovante);
      const { error } = await c.rpc('marcar_celula', { p_lead: leadId, p_comp: comp, p_status: 'pago', p_valor: valor, p_comprovante_path: path });
      falhar(error);
    },
    async marcarNaoPagou(leadId: string, comp: string): Promise<void> {
      await garantirComp(comp);
      const { error } = await c.rpc('marcar_celula', { p_lead: leadId, p_comp: comp, p_status: 'nao_pagou', p_valor: null, p_comprovante_path: null });
      falhar(error);
    },
    async limparCelula(leadId: string, comp: string): Promise<void> {
      await garantirComp(comp);
      const { error } = await c.rpc('marcar_celula', { p_lead: leadId, p_comp: comp, p_status: 'fora', p_valor: null, p_comprovante_path: null });
      falhar(error);
    },
    async adicionarMes(comp: string): Promise<void> {
      await garantirComp(comp); // a coluna nasce vazia; carregar() já a devolve (ordem = YYYYMM gerada)
    },

    async editarCiclo(dia: number, comp: string, campo: 'inicio' | 'fim' | 'cobranca', valor: string, padrao: { inicio: string; fim: string }): Promise<void> {
      await garantirComp(comp);
      // lê o estado ATUAL na hora (anti-corrida: edições rápidas não se sobrescrevem)
      const atual = (await c.from('ciclos_datas').select('inicio, fim, cobranca').eq('dia', dia).eq('comp', comp).maybeSingle()).data as { inicio: string | null; fim: string | null; cobranca: string | null } | null;
      const win: Record<string, string | null> = {
        inicio: atual?.inicio ?? padrao.inicio, fim: atual?.fim ?? padrao.fim, cobranca: atual?.cobranca ?? null,
      };
      win[campo] = valor || null;
      const { error } = await c.from('ciclos_datas').upsert(
        { dia, comp, inicio: win.inicio || null, fim: win.fim || null, cobranca: win.cobranca || null }, { onConflict: 'dia,comp' });
      falhar(error);
    },
    async moverTurma(diaDe: number, diaPara: number): Promise<MoverTurmaResultado> {
      // RPC transacional (mig 41): move os leads E limpa as datas manuais órfãs
      // do calendário num passo só; devolve os ids exatos pro desfazer.
      const { data, error } = await c.rpc('mover_turma', { p_de: diaDe, p_para: diaPara });
      falhar(error);
      const r = (data ?? {}) as { movidos?: string[]; origem_datas?: CicloDataRow[]; destino_limpas?: number; fusao?: boolean };
      return {
        movidos: (r.movidos ?? []).map(String),
        origemDatas: (r.origem_datas ?? []).map((x) => ({ dia: Number(x.dia), comp: String(x.comp), inicio: x.inicio ?? null, fim: x.fim ?? null, cobranca: x.cobranca ?? null })),
        destinoLimpas: Number(r.destino_limpas ?? 0),
        fusao: !!r.fusao,
      };
    },
    async reporCiclosDatas(rows: CicloDataRow[]): Promise<void> {
      if (!rows.length) return;
      const { error } = await c.from('ciclos_datas').upsert(
        rows.map((x) => ({ dia: x.dia, comp: x.comp, inicio: x.inicio, fim: x.fim, cobranca: x.cobranca })),
        { onConflict: 'dia,comp' });
      falhar(error);
    },
    async moverLeadsPorId(ids: string[], dia: number, deDia?: number): Promise<void> {
      if (!ids.length) return;
      let q = c.from('leads').update({ dia }).in('id', ids);
      // só quem ainda está no dia de origem; deDia 0 = "aguardando" (NULL no banco)
      if (deDia != null) q = deDia === 0 ? q.is('dia', null) : q.eq('dia', deDia);
      const { error } = await q;
      falhar(error);
    },
    async salvarOrdemCiclos(dias: number[]): Promise<void> {
      const { error } = await c.from('cobranca_prefs').upsert({ chave: 'ciclos_ordem', valor: dias }, { onConflict: 'chave' });
      falhar(error);
    },
    async abrirCiclo(dia: number): Promise<void> {
      const { error } = await c.from('ciclos_abertos').upsert({ dia, criado_por: await uid() }, { onConflict: 'dia', ignoreDuplicates: true });
      falhar(error);
    },
    async fecharCiclo(dia: number): Promise<void> {
      // .select() confirma o efeito: RLS filtrada = 0 linhas SEM erro → lançar,
      // senão o toast diria "fechado" com o dia ainda aberto (sucesso falso).
      const { data, error } = await c.from('ciclos_abertos').delete().eq('dia', dia).select('dia');
      falhar(error);
      if (!data || data.length === 0) throw new Error('Não deu pra fechar o ciclo (permissão ou ele já não estava aberto).');
    },
    async esvaziarCiclos(): Promise<EsvaziarResultado> {
      const { data, error } = await c.rpc('esvaziar_ciclos');
      falhar(error);
      const r = (data ?? {}) as { afetados?: { id: string; dia: number }[]; datas_removidas?: CicloDataRow[] };
      return {
        afetados: (r.afetados ?? []).map((x) => ({ id: String(x.id), dia: Number(x.dia) })),
        datasRemovidas: (r.datas_removidas ?? []).map((x) => ({ dia: Number(x.dia), comp: String(x.comp), inicio: x.inicio ?? null, fim: x.fim ?? null, cobranca: x.cobranca ?? null })),
      };
    },
    async esvaziarCiclo(dia: number): Promise<{ afetados: string[] }> {
      const { data, error } = await c.rpc('esvaziar_ciclo', { p_dia: dia });
      falhar(error);
      const r = (data ?? {}) as { afetados?: string[] };
      return { afetados: (r.afetados ?? []).map(String) };
    },
    async senhasGrade(): Promise<{ leadId: string; inss: string; reclame: string }[]> {
      const { data, error } = await c.rpc('senhas_grade');
      falhar(error);
      return ((data ?? []) as { lead_id: string; inss: string | null; reclame: string | null }[])
        .map((x) => ({ leadId: String(x.lead_id), inss: x.inss ?? '', reclame: x.reclame ?? '' }));
    },
    async marcarParado(leadId: string, dataParou: string): Promise<void> {
      // dia = null → "aguardando ciclo": o direcionamento é um comando separado na Gestão
      const { error } = await c.from('leads').update({ situacao: 'cancelado', data_parou: dataParou, dia: null }).eq('id', leadId);
      falhar(error);
    },
    // aprovação do débito parado — RPCs da mig 52 (permissão + aviso no sino no banco)
    async solicitarParado(leadId: string, dataParou: string): Promise<void> {
      const { error } = await c.rpc('solicitar_parado', { p_lead: leadId, p_data_parou: dataParou || null });
      falharParado(error);
    },
    async aprovarParado(leadId: string, a: { dia: number; valor: number | null; dataParou: string }): Promise<void> {
      const { error } = await c.rpc('aprovar_parado', { p_lead: leadId, p_dia: a.dia, p_valor: a.valor, p_data_parou: a.dataParou || null });
      falharParado(error);
    },
    async recusarParado(leadId: string, motivo?: string): Promise<void> {
      const { error } = await c.rpc('recusar_parado', { p_lead: leadId, p_motivo: motivo || null });
      falharParado(error);
    },
    async cancelarParado(leadId: string, dataParouAnterior?: string): Promise<void> {
      const { error } = await c.rpc('cancelar_parado', { p_lead: leadId, p_data_parou: dataParouAnterior || null });
      falharParado(error);
    },
    async reabrirParado(leadId: string, a: { dia: number; valor: number; dataParou: string }): Promise<void> {
      const { error } = await c.rpc('reabrir_parado', { p_lead: leadId, p_dia: a.dia > 0 ? a.dia : null, p_valor: a.valor, p_data_parou: a.dataParou || null });
      falharParado(error);
    },
    async contarPendentesParado(): Promise<number> {
      // head+count: não baixa linha nenhuma, só o número (índice parcial da mig 52)
      const { count, error } = await c.from('leads').select('id', { count: 'exact', head: true }).eq('parado_pendente', true).eq('situacao', 'ativo').is('cancelamento', null);
      falhar(error);
      return count ?? 0;
    },

    async importarComCiclo({ linhas, comps, situacao, cicloNome, dataCobranca }: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; cicloNome: string; dataCobranca: string }) {
      const { data, error } = await c.rpc('cobranca_importar', {
        p_situacao: situacao, p_ciclo_nome: cicloNome, p_data_cobranca: dataCobranca,
        p_comps: comps, p_linhas: linhasParaImport(linhas),
      });
      falhar(error);
      const res = (data ?? {}) as { leads?: number; dia?: number; celulas_ignoradas?: number };
      return { leads: res.leads ?? linhas.length, dia: res.dia ?? Number(dataCobranca.slice(8, 10)), celulasIgnoradas: res.celulas_ignoradas ?? 0 };
    },
    // dentro de um ciclo existente: o dia é fixo, ciclos_datas fica intocada (RPC mig 46)
    async importarNoCiclo({ linhas, comps, situacao, dia }: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; dia: number }) {
      const { data, error } = await c.rpc('cobranca_importar_no_ciclo', {
        p_situacao: situacao, p_dia: dia, p_comps: comps, p_linhas: linhasParaImport(linhas),
      });
      falhar(error);
      const res = (data ?? {}) as { leads?: number; celulas_ignoradas?: number };
      return { leads: res.leads ?? linhas.length, celulasIgnoradas: res.celulas_ignoradas ?? 0 };
    },

    async assinarComprovante(comp: { url?: string; path?: string }): Promise<string> {
      if (comp.path) {
        const { data, error } = await c.storage.from(BUCKET).createSignedUrl(comp.path, 60);
        falhar(error);
        return data?.signedUrl ?? '';
      }
      return comp.url ?? '';
    },
    async revelarSenha(leadId: string, campo: CampoSenha): Promise<string> {
      const { data, error } = await c.rpc('reveal_senha', { p_lead: leadId, p_tipo: campo });
      falhar(error);
      return (data as string) ?? '';
    },
  };
}
