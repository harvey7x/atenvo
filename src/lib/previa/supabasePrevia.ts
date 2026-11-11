/* Cliente Supabase FALSO da prévia de design (VITE_PREVIA): o mesmo formato de chamadas
   do supabase-js, respondido em memória com os dados fictícios de dadosPrevia.ts.
   Nada sai pra rede (ver bloqueioRede.ts). Gravações ficam só na memória da aba. */
import { criarBanco, type Banco, type Linha } from './dadosPrevia';
import { gsCarregar } from '@/v2/data/cobranca/demoStore';
import type { LadoColuna, LadoLinha, PlColunaPatch, PlDados, PlItem, PlanilhaRepo, TipoLinha } from '@/v2/data/cobranca/planilha';

type Erro = { message: string } | null;
type Resp = { data: unknown; error: Erro; count?: number | null; status?: number };

const pegar = (r: Linha, caminho: string): unknown =>
  caminho.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Linha)[k] : undefined), r);
const id = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

/* os DEFAULTS das colunas no banco de verdade (migrations 11/24/26/54/56) — o insert do PostgREST
   devolve a linha com eles; sem isto um envio programado na prévia nascia sem enviados/erros/pulados
   (Campanhas: "NaN% · /1 enviadas") e o destinatário sem status (sem selo, "Na fila" no lugar de "Agendada") */
const DEFAULTS: Record<string, Linha> = {
  wa_envios: { estado: 'rascunho', origem: 'manual', total: 0, enviados: 0, erros: 0, pulados: 0 },
  wa_envio_alvos: { status: 'pendente', tentativas: 0, parte_atual: 0 },
};
/* embed do PostgREST que a tela usa: wa_envio_alvos → wa_envios(nome, origem, canal_id, agendado_para,
   estado), lido AO VIVO do envio (cancelar/agendar aparece na hora). Os destinatários do seed já vêm
   com o embed pronto e ficam como estão */
function comEmbed(db: Banco, tabela: string, r: Linha): Linha {
  if (tabela !== 'wa_envio_alvos' || r.wa_envios !== undefined) return r;
  const e = (db.tabelas.wa_envios ?? []).find((x) => x.id === r.envio_id);
  return { ...r, wa_envios: e ? { nome: e.nome, origem: e.origem, canal_id: e.canal_id, agendado_para: e.agendado_para ?? null, estado: e.estado } : null };
}

class Consulta implements PromiseLike<Resp> {
  private filtros: ((r: Linha) => boolean)[] = [];
  private ordens: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private faixa: [number, number] | null = null;
  private modo: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private carga: Linha | Linha[] | null = null;
  private unico: 'single' | 'maybe' | null = null;
  private soContar = false;
  constructor(private db: Banco, private tabela: string) {}

  select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.head) this.soContar = true; return this; }
  insert(v: Linha | Linha[]) { this.modo = 'insert'; this.carga = v; return this; }
  update(v: Linha) { this.modo = 'update'; this.carga = v; return this; }
  upsert(v: Linha | Linha[]) { this.modo = 'upsert'; this.carga = v; return this; }
  delete() { this.modo = 'delete'; return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => String(pegar(r, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtros.push((r) => String(pegar(r, c)) !== String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtros.push((r) => s.has(String(pegar(r, c)))); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (v === null ? pegar(r, c) == null : pegar(r, c) === v)); return this; }
  not(c: string, op: string, v: unknown) { if (op === 'is' && v === null) this.filtros.push((r) => pegar(r, c) != null); return this; }
  gte(c: string, v: unknown) { this.filtros.push((r) => pegar(r, c) != null && String(pegar(r, c)) >= String(v)); return this; }
  gt(c: string, v: unknown) { this.filtros.push((r) => pegar(r, c) != null && String(pegar(r, c)) > String(v)); return this; }
  lte(c: string, v: unknown) { this.filtros.push((r) => pegar(r, c) != null && String(pegar(r, c)) <= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtros.push((r) => pegar(r, c) != null && String(pegar(r, c)) < String(v)); return this; }
  ilike(c: string, p: string) {
    const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
    this.filtros.push((r) => re.test(String(pegar(r, c) ?? '')));
    return this;
  }
  like(c: string, p: string) { return this.ilike(c, p); }
  match(o: Linha) { for (const [k, v] of Object.entries(o)) this.eq(k, v); return this; }
  or() { return this; }
  filter() { return this; }
  contains() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  returns() { return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }
  order(col: string, o?: { ascending?: boolean }) { this.ordens.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.faixa = [a, b]; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }

  then<A = Resp, B = never>(ok?: ((v: Resp) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.executar()).then(ok, falha);
  }

  private executar(): Resp {
    const t = (this.db.tabelas[this.tabela] ??= []);
    const casa = (r: Linha) => this.filtros.every((f) => f(r));
    if (this.modo === 'insert' || this.modo === 'upsert') {
      const novos = (Array.isArray(this.carga) ? this.carga : [this.carga ?? {}]).map((r) => ({ id: id(), created_at: new Date().toISOString(), ...DEFAULTS[this.tabela], ...r }));
      t.push(...novos);
      this.db.aoMudar?.(this.tabela);
      return this.fim(novos);
    }
    if (this.modo === 'update') {
      const alvos = t.filter(casa);
      for (const r of alvos) Object.assign(r, this.carga);
      this.db.aoMudar?.(this.tabela);
      return this.fim(alvos);
    }
    if (this.modo === 'delete') {
      const fora = t.filter(casa);
      this.db.tabelas[this.tabela] = t.filter((r) => !casa(r));
      this.db.aoMudar?.(this.tabela);
      return this.fim(fora);
    }
    // o embed entra ANTES dos filtros: .eq('wa_envios.origem', …) (o !inner da tela) filtra por ele
    let rows = t.map((r) => comEmbed(this.db, this.tabela, r)).filter(casa);
    for (const o of [...this.ordens].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = pegar(a, o.col), y = pegar(b, o.col);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return o.asc ? c : -c;
      });
    }
    const total = rows.length;
    if (this.faixa) rows = rows.slice(this.faixa[0], this.faixa[1] + 1);
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.soContar) return { data: null, error: null, count: total };
    return { ...this.fim(rows.map((r) => ({ ...r }))), count: total };
  }

  private fim(rows: Linha[]): Resp {
    if (this.unico === 'single') return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: 'Nenhuma linha (prévia)' } };
    if (this.unico === 'maybe') return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

/** rpc() do supabase-js também é encadeável (.select/.single): aqui resolve o valor (fixo ou
    assíncrono); exceção vira { error } como o PostgREST devolve — nunca rejeita a promessa */
class Rpc implements PromiseLike<Resp> {
  constructor(private valor: () => unknown) {}
  select() { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  then<A = Resp, B = never>(ok?: ((v: Resp) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.valor())
      .then(
        (data): Resp => ({ data, error: null }),
        (e): Resp => ({ data: null, error: { message: e instanceof Error && e.message ? e.message : String(e) } }),
      )
      .then(ok, falha);
  }
}

/* A folha da Gestão ("Excel 2.0"): no real é a RPC planilha_dados (mig 57/58) e as RPCs
   planilha_* de edição. Aqui quem responde é o repositório DEMO da planilha (mesmas regras
   da migration, ligado ao mesmo store fictício dos clientes), e a resposta sai no MESMO
   formato jsonb do banco — a tela segue pelo caminho real (normalizarDados). Sem isto a
   prévia recebia null, a folha vinha vazia e a Gestão caía na tela antiga com a faixa
   "A planilha nova ainda não foi carregada". */
/* import tardio: a planilha importa '@/lib/supabase', que importa este arquivo — carregar na
   primeira chamada evita o ciclo na ordem de avaliação dos módulos */
let _folha: PlanilhaRepo | null = null;
const folhaDemo = async (): Promise<PlanilhaRepo> =>
  (_folha ??= (await import('@/v2/data/cobranca/planilha.demo')).criarPlanilhaRepoDemo());
const folhaNoFormatoDoBanco = (d: PlDados) => ({
  blocos: d.blocos.map((b) => ({ id: b.id, dia: b.dia, situacao: b.situacao, comp_base: b.compBase })),
  colunas: d.colunas.map((c) => ({ id: c.id, ordem: c.ordem, titulo: c.titulo, tipo: c.tipo, campo: c.campo, mes_pos: c.mesPos, largura: c.largura, oculta: c.oculta })),
  linhas: d.linhas.map((l) => ({
    id: l.id, ordem: l.ordem, tipo: l.tipo, bloco: l.bloco, lead_id: l.leadId, altura: l.altura,
    c: Object.fromEntries(Object.entries(l.c).map(([k, v]) => [k, [v.t, v.s]])),
    ...(l.e && Object.keys(l.e).length ? { e: l.e } : {}),
  })),
});

export function criarSupabasePrevia() {
  const db = criarBanco();
  const T = db.tabelas;
  /* USUÁRIOS da prévia: o que se cria/edita/exclui na tela Usuários sobrevive ao recarregar, e o
     "Ver como" do selo (selo.ts) troca quem está logado — pra ver o sistema como cada pessoa
     (ex.: a atendente só enxerga o Atendimento). Só na prévia; nada sai do navegador. */
  const LS_PERFIS = 'previa-perfis-v2';
  const LS_VER = 'previa-ver-como';
  try { const salvo = JSON.parse(localStorage.getItem(LS_PERFIS) || 'null'); if (Array.isArray(salvo) && salvo.length) T.profiles = salvo; } catch { /* sem armazenamento: só a memória */ }
  const salvarPerfis = () => { try { localStorage.setItem(LS_PERFIS, JSON.stringify(T.profiles)); } catch { /* idem */ } };
  db.aoMudar = (tabela) => { if (tabela === 'profiles') salvarPerfis(); };
  try {
    const ver = localStorage.getItem(LS_VER);
    const p = ver ? T.profiles.find((x) => x.id === ver && x.ativo) : null;
    if (p) db.usuario = { id: String(p.id), email: String(p.email), user_metadata: { name: p.nome } };
  } catch { /* idem */ }
  (window as unknown as { __previa?: unknown }).__previa = {
    perfis: () => T.profiles.map((p) => ({ ...p })),
    eu: () => db.usuario.id,
    verComo: (pid: string) => { try { localStorage.setItem(LS_VER, pid); } catch { /* idem */ } location.reload(); },
    restaurar: () => { try { localStorage.removeItem(LS_PERFIS); localStorage.removeItem(LS_VER); } catch { /* idem */ } location.reload(); },
  };
  const sessao = { access_token: 'previa', refresh_token: 'previa', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: db.usuario };
  let logado = true;
  type OuvinteAuth = (evento: string, s: typeof sessao | null) => void;
  const ouvintesAuth = new Set<OuvinteAuth>();
  const avisarAuth = (evento: string) => { setTimeout(() => ouvintesAuth.forEach((cb) => cb(evento, logado ? sessao : null)), 0); };
  const conversa = (cid: unknown) => T.wa_conversas.find((c) => c.id === cid);
  const agoraIso = () => new Date().toISOString();

  const rpcs: Record<string, (a: Linha) => unknown> = {
    // 1º acesso de quem nasceu com senha temporária (visto pelo "Ver como"): trocou → entra
    senha_redefinida: () => { const p = T.profiles.find((x) => x.id === db.usuario.id); if (p) p.deve_trocar_senha = false; salvarPerfis(); return null; },
    wa_canais_visao_equipe: () => T.wa_canais.map(({ qr: _q, instancia: _i, ...r }) => r),
    wa_marcar_lida: (a) => { const c = conversa(a.p_conversa); if (c) c.nao_lidas = 0; return null; },
    wa_envios_resumo: () => ({ enviadas: 75, entregues: 71, lidas: 58, responderam: 34, erros: 1, pulados: 3, na_fila: 0, agendados: 0, optouts: 0 }),
    wa_regua_progresso: () => [
      { regua_msg_id: 'rg-dia', passo_nome: 'Cobrança do dia', status: 'enviado', entrega: 'lida', respondeu: true, n: 34 },
      { regua_msg_id: 'rg-dia', passo_nome: 'Cobrança do dia', status: 'enviado', entrega: 'entregue', respondeu: false, n: 40 },
      { regua_msg_id: 'rg-dia', passo_nome: 'Cobrança do dia', status: 'erro', entrega: null, respondeu: false, n: 1 },
    ],
    licenca_estado: () => ({ estado: 'ok' }),
    configuracao_estado: () => ({ status: 'inativo', etapas: { planilha: true, whatsapp: true, mensalidade: true }, whatsapp: { modo: null, numeroUnicoId: null }, concluidaEm: null }),
    configuracao_cobertura_whatsapp: () => [],
    wa_tel_chave: (a) => String(a.p ?? '').replace(/\D/g, '').slice(-8),
    /* cancelar envio (mig 54): quem ainda não recebeu (pendente) fica "cancelado" com o motivo; o envio
       vira cancelado. Já concluído/cancelado: nada muda (0) — como a RPC do banco */
    wa_envio_cancelar: (a) => {
      const e = T.wa_envios.find((x) => x.id === a.p_envio);
      if (!e) throw new Error('envio nao encontrado');
      if (e.estado !== 'rascunho' && e.estado !== 'enviando') return { ok: true, cancelados: 0 };
      let n = 0;
      for (const al of T.wa_envio_alvos) {
        if (al.envio_id === a.p_envio && (al.status ?? 'pendente') === 'pendente') { al.status = 'cancelado'; al.motivo = 'envio cancelado'; n++; }
      }
      e.estado = 'cancelado';
      return { ok: true, cancelados: n };
    },
    /* sino (mig 29): marcar uma / todas como lidas */
    notif_marcar_lida: (a) => { const n = T.notificacoes.find((x) => x.id === a.p_id); if (n && !n.lida_em) n.lida_em = agoraIso(); return null; },
    notif_marcar_todas: () => { for (const n of T.notificacoes) if (!n.lida_em) n.lida_em = agoraIso(); return null; },
    lixeira_listar: () => [],
    sync_estado: () => null,
    planilha_dados: async () => folhaNoFormatoDoBanco(await (await folhaDemo()).carregar()),
    planilha_salvar: async (a) => (await folhaDemo()).salvar((a.p_itens as PlItem[]) ?? [], a.p_origem as string | undefined),
    planilha_coluna_criar: async (a) => (await folhaDemo()).colunaCriar({
      ref: String(a.p_ref), lado: a.p_lado as LadoColuna, tipo: a.p_tipo as 'livre' | 'mes', titulo: String(a.p_titulo ?? ''),
      cab: (a.p_cab as Record<string, string> | undefined) ?? undefined,
    }),
    planilha_coluna_alterar: async (a) => (await folhaDemo()).colunaAlterar(String(a.p_coluna), (a.p_patch as PlColunaPatch) ?? {}),
    planilha_coluna_excluir: async (a) => (await folhaDemo()).colunaExcluir(String(a.p_coluna)),
    planilha_linha_inserir: async (a) => (await folhaDemo()).linhaInserir(String(a.p_ref), a.p_lado as LadoLinha, a.p_tipo as TipoLinha),
    planilha_linha_excluir: async (a) => (await folhaDemo()).linhaExcluir(String(a.p_linha)),
    planilha_linha_mover: async (a) => (await folhaDemo()).linhaMover(String(a.p_linha), String(a.p_ref), a.p_lado as LadoLinha),
  };

  // mensagem nossa: entra como "enviada" e o "visto" chega sozinho, como no aparelho
  const enviarMsg = (b: Linha) => {
    const c = conversa(b.conversa_id);
    if (!c) return { ok: false, erro: 'conversa não encontrada' };
    const tipo = (b.midia_tipo as string | undefined) ?? 'texto';
    const msg: Linha = {
      id: id(), conversa_id: c.id, direcao: 'saida', tipo, conteudo: (b.texto as string) || (tipo === 'documento' ? (b.midia_nome as string) : null),
      midia_path: (b.midia_path as string) ?? null, resposta_a: (b.resposta_a as string) ?? null, apagada: false, status: 'enviada', created_at: agoraIso(),
    };
    T.wa_mensagens.push(msg);
    c.ultima_em = msg.created_at;
    c.ultima_previa = tipo === 'texto' ? String(msg.conteudo ?? '') : `[${tipo}]`;
    setTimeout(() => { msg.status = 'entregue'; }, 1200);
    setTimeout(() => { msg.status = 'lida'; }, 4200);
    return { ok: true, id: msg.id };
  };

  /* cobertura da régua por comercial (o que o motor real devolve junto com a prévia): clientes
     em cobrança, quantos têm telefone e o número de WhatsApp do comercial — sem ela a Régua
     mostrava "Sem número" e "0 com telefone" para todos, ao contrário do que Números mostra */
  const coberturaRegua = () => {
    const por = new Map<string, { clientes: number; com_telefone: number }>();
    for (const l of gsCarregar().linhas) {
      if (l.situacao !== 'cancelado' || !l.comercial) continue;
      const c = por.get(l.comercial) ?? { clientes: 0, com_telefone: 0 };
      c.clientes += 1;
      if ((l.telefone || '').replace(/\D/g, '').length >= 10) c.com_telefone += 1;
      por.set(l.comercial, c);
    }
    return [...por].sort(([a], [b]) => a.localeCompare(b)).map(([comercial, c]) => {
      const k = T.wa_canais.find((x) => x.nome === comercial);
      return {
        comercial, ...c, motivo: k ? null : 'nenhum WhatsApp com esse comercial como dono',
        numero: k ? { id: String(k.id), nome: String(k.nome), numero: (k.numero as string) ?? null, conectado: k.estado === 'conectado', reserva: false } : null,
      };
    });
  };

  const funcoes: Record<string, (b: Linha) => unknown> = {
    'reviza-wa-enviar': (b) => {
      if (b.acao === 'ler') return { ok: true };
      if (b.acao === 'apagar') { const m = T.wa_mensagens.find((x) => x.id === b.mensagem_id); if (m) m.apagada = true; return { ok: true }; }
      return enviarMsg(b);
    },
    'reviza-wa-motor': (b) => {
      if (b.acao !== 'previa') return { ok: true };
      const cfg = T.wa_regua_config[0];
      const lead = b.lead_id ? T.wa_conversas.find((c) => c.lead_id === b.lead_id) : null;
      const canal = lead ? T.wa_canais.find((k) => k.id === lead.canal_id) : null;
      const dia = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const itens = lead ? [
        { data: dia(3), passo_id: 'rg-lembrete', passo_nome: 'Lembrete amigável', quando: -3 },
        { data: dia(6), passo_id: 'rg-dia', passo_nome: 'Cobrança do dia', quando: 0 },
        { data: dia(9), passo_id: 'rg-depois', passo_nome: 'Segunda chamada', quando: 3 },
      ].map((p) => ({
        ...p, lead_id: lead.lead_id, nome: lead.nome_contato, comercial: canal?.nome ?? '', telefone: lead.telefone, dia: null, alvo: 'padrao',
        comp: '2026-11', venc: dia(6), status: 'vai_receber', motivo: null, envio_id: null, falta: null, texto: null,
        numero: canal ? { id: canal.id, nome: canal.nome, numero: canal.numero, reserva: false } : null,
      })) : [];
      return { hoje: dia(0), de: b.de, ate: b.ate, itens, cobertura: coberturaRegua(), config: cfg };
    },
    'reviza-wa-instancia': () => ({ ok: true }),
    'reviza-admin': (b) => {
      const loginDe = (e: unknown) => String(e ?? '').replace(/@reviza\.local$/i, '');
      const gerar = () => `Rv-${Math.random().toString(36).slice(2, 11)}`;
      const achar = () => T.profiles.find((x) => x.id === b.id);
      if (b.acao === 'criar') {
        const usuario = String(b.usuario ?? '').trim().toLowerCase();
        if (!usuario) return { error: 'Usuario invalido (use letras, numeros, ponto, hifen).' };
        if (T.profiles.some((x) => loginDe(x.email) === usuario)) return { error: 'Ja existe um usuario com esse login.' };
        const senha = (b.senha as string) || gerar();
        T.profiles.push({ id: id(), nome: String(b.nome || usuario), email: `${usuario}@reviza.local`, papel: b.papel ?? 'comercial', ativo: true,
          deve_trocar_senha: b.senha ? b.exigirTroca !== false : true, created_at: agoraIso(), modulos: Array.isArray(b.modulos) ? b.modulos : null });
        salvarPerfis();
        return { usuario, senha };
      }
      if (b.acao === 'resetar') { const p = achar(); if (p) p.deve_trocar_senha = true; salvarPerfis(); return { senha: gerar() }; }
      if (b.acao === 'definir_senha') { const p = achar(); if (p) p.deve_trocar_senha = !!b.exigirTroca; salvarPerfis(); return {}; }
      if (b.acao === 'renomear') { const p = achar(); if (p) p.email = `${String(b.usuario)}@reviza.local`; salvarPerfis(); return { usuario: b.usuario }; }
      if (b.acao === 'excluir') {
        const p = achar(); if (!p) return { error: 'id invalido' };
        if (String(b.confirmar ?? '').trim().toLowerCase() !== loginDe(p.email)) return { error: 'Confirmação não confere: digite o login do usuário.' };
        T.profiles = T.profiles.filter((x) => x.id !== b.id); salvarPerfis(); return {};
      }
      return { ok: true };
    },
  };

  const canalFalso = () => {
    const ch = { on: () => ch, subscribe: (cb?: (s: string) => void) => { cb?.('SUBSCRIBED'); return ch; }, unsubscribe: async () => 'ok', send: async () => 'ok' };
    return ch;
  };

  return {
    from: (tabela: string) => new Consulta(db, tabela),
    rpc: (nome: string, args?: Linha) => new Rpc(() => (rpcs[nome] ? rpcs[nome](args ?? {}) : null)),
    functions: {
      invoke: async (nome: string, o?: { body?: Linha }) => ({ data: funcoes[nome] ? funcoes[nome](o?.body ?? {}) : { ok: true }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async (path: string, arquivo: Blob) => { db.midia.set(path, URL.createObjectURL(arquivo)); return { data: { path }, error: null }; },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: db.midia.get(path) ?? '' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: db.midia.get(path) ?? '' } }),
        download: async () => ({ data: new Blob(), error: null }),
        remove: async () => ({ data: [], error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
    /* como o supabase-js: "Sair" encerra a sessão e AVISA quem assina (SIGNED_OUT → a tela
       de entrada aparece); "Entrar" (qualquer e-mail/senha — dados fictícios) volta com SIGNED_IN.
       Só na memória da aba: recarregar a prévia entra de novo como Matheus. */
    auth: {
      getSession: async () => ({ data: { session: logado ? sessao : null }, error: null }),
      getUser: async () => ({ data: { user: logado ? db.usuario : null }, error: null }),
      onAuthStateChange: (cb: OuvinteAuth) => {
        ouvintesAuth.add(cb);
        return { data: { subscription: { unsubscribe: () => { ouvintesAuth.delete(cb); } } } };
      },
      signInWithPassword: async () => { logado = true; avisarAuth('SIGNED_IN'); return { data: { session: sessao, user: db.usuario }, error: null }; },
      signOut: async () => { logado = false; avisarAuth('SIGNED_OUT'); return { error: null }; },
      updateUser: async () => ({ data: { user: db.usuario }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      refreshSession: async () => ({ data: { session: sessao, user: db.usuario }, error: null }),
    },
    channel: () => canalFalso(),
    removeChannel: async () => 'ok',
    removeAllChannels: async () => [],
  };
}
