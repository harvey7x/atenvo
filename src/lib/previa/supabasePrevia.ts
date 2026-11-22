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
      const novos: Linha[] = (Array.isArray(this.carga) ? this.carga : [this.carga ?? {}]).map((r) => ({ id: id(), created_at: new Date().toISOString(), ...DEFAULTS[this.tabela], ...r }));
      this.db.gatilho?.(this.tabela, 'insert', [], novos);
      t.push(...novos);
      this.db.aoMudar?.(this.tabela);
      return this.fim(novos);
    }
    if (this.modo === 'update') {
      const alvos = t.filter(casa);
      const antes = alvos.map((r) => ({ ...r }));
      for (const r of alvos) Object.assign(r, this.carga);
      this.db.gatilho?.(this.tabela, 'update', antes, alvos);
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
  // integrações (Asaas): a situação sobrevive ao recarregar; a chave de API NÃO é guardada — só o final
  const LS_INTEG = 'previa-integracoes-v1';
  T.integracoes = [{ servico: 'asaas', conectado: false, ambiente: null, conta: null, chave_final: null, conectado_em: null, conectado_por: null, retorno_ativo: false, ultimo_retorno: null, config: null }];
  try { const salvo = JSON.parse(localStorage.getItem(LS_INTEG) || 'null'); if (Array.isArray(salvo) && salvo.length) T.integracoes = salvo; } catch { /* sem armazenamento: só a memória */ }
  const salvarInteg = () => { try { localStorage.setItem(LS_INTEG, JSON.stringify(T.integracoes)); } catch { /* idem */ } };
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
    restaurar: () => { try { localStorage.removeItem(LS_PERFIS); localStorage.removeItem(LS_VER); localStorage.removeItem(LS_INTEG); } catch { /* idem */ } location.reload(); },
  };
  const sessao = { access_token: 'previa', refresh_token: 'previa', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: db.usuario };
  let logado = true;
  type OuvinteAuth = (evento: string, s: typeof sessao | null) => void;
  const ouvintesAuth = new Set<OuvinteAuth>();
  const avisarAuth = (evento: string) => { setTimeout(() => ouvintesAuth.forEach((cb) => cb(evento, logado ? sessao : null)), 0); };
  const conversa = (cid: unknown) => T.wa_conversas.find((c) => c.id === cid);
  const agoraIso = () => new Date().toISOString();

  /* REGISTROS na prévia: no banco de verdade são os gatilhos que gravam "quem fez o quê"; aqui a mesma
     coisa acontece em memória, para a tela Registros mostrar na hora o que se faz nas Configurações
     (criar login, trocar papel/ambientes/telas, senha, conectar e remover WhatsApp). */
  const ROT_AMB: Record<string, string> = { cobrancas: 'Cobranças', atendimento: 'Atendimento' };
  const ROT_PAPEL: Record<string, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
  const quemFaz = () => { const p = T.profiles.find((x) => x.id === db.usuario.id); return { ator_id: db.usuario.id, ator_nome: String(p?.nome ?? 'Administrador'), ator_papel: (p?.papel as string) ?? null }; };
  const proximoRegistro = () => (T.registros ?? []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const registrar = (acao: string, entidade: string, rotulo: string | null, detalhe: string, mudancas: Linha[] = [], entidadeId: string | null = null) => {
    (T.registros ??= []).unshift({ id: proximoRegistro(), quando: agoraIso(), ...quemFaz(), acao, entidade, entidade_id: entidadeId, rotulo, detalhe, mudancas });
  };
  const textoAmb = (v: unknown) => (Array.isArray(v) && v.length ? v.map((a) => ROT_AMB[String(a)] ?? String(a)).join(' · ') : 'padrão do papel');
  const textoTelas = (v: unknown) => (Array.isArray(v) ? `${v.length} tela${v.length === 1 ? '' : 's'}` : 'todas as do papel');
  db.gatilho = (tabela, op, antes, depois) => {
    if (tabela === 'registros' && op === 'insert') {
      // linha vinda da tela (números do Atendimento na prévia): ganha número, hora e quem fez
      for (const r of depois) Object.assign(r, { id: proximoRegistro() + depois.indexOf(r), quando: agoraIso(), ...quemFaz(), entidade_id: r.entidade_id ?? null, mudancas: r.mudancas ?? [] });
      return;
    }
    if (tabela !== 'profiles' || op !== 'update') return;
    depois.forEach((d, i) => {
      const a = antes[i]; const mud: Linha[] = []; const partes: string[] = [];
      if (a.nome !== d.nome) { mud.push({ c: 'nome', de: a.nome ?? null, para: d.nome ?? null }); partes.push('nome'); }
      if (a.papel !== d.papel) { mud.push({ c: 'papel', de: ROT_PAPEL[String(a.papel)] ?? a.papel, para: ROT_PAPEL[String(d.papel)] ?? d.papel }); partes.push('papel'); }
      if (a.ativo !== d.ativo) { mud.push({ c: 'ativo', de: a.ativo ? 'ativo' : 'desativado', para: d.ativo ? 'ativo' : 'desativado' }); partes.push(d.ativo ? 'reativou o acesso' : 'desativou o acesso'); }
      if (JSON.stringify(a.modulos ?? null) !== JSON.stringify(d.modulos ?? null)) { mud.push({ c: 'modulos', de: textoAmb(a.modulos), para: textoAmb(d.modulos) }); partes.push('ambientes'); }
      if (JSON.stringify(a.areas ?? null) !== JSON.stringify(d.areas ?? null)) { mud.push({ c: 'areas', de: textoTelas(a.areas), para: textoTelas(d.areas) }); partes.push('telas liberadas'); }
      if (mud.length) registrar('alterou', 'usuário', String(d.nome ?? ''), partes.join(', '), mud, String(d.id));
    });
  };

  /* NÚMEROS de Cobranças na prévia: conectar gera um QR de mentira e, alguns segundos depois, o número
     aparece conectado — o caminho inteiro da tela, sem nenhuma sessão de WhatsApp de verdade. */
  const qrFalso = () => {
    let cels = ''; let x0 = 400 + Math.floor(Math.random() * 900);
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { x0 = (x0 * 16807) % 2147483647; if (x0 % 5 < 2) cels += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`; }
    const olho = (x: number, y: number) => `<rect x="${x}" y="${y}" width="70" height="70" fill="#fff"/><rect x="${x + 5}" y="${y + 5}" width="60" height="60" fill="none" stroke="#000" stroke-width="10"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30"/>`;
    return 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" fill="#000"><rect width="210" height="210" fill="#fff"/>${cels}${olho(0, 0)}${olho(140, 0)}${olho(0, 140)}</svg>`);
  };
  const conectarDepois = (canal: Linha) => {
    setTimeout(() => {
      if (canal.estado !== 'conectando' || !T.wa_canais.includes(canal)) return;
      Object.assign(canal, { estado: 'conectado', qr: null, numero: canal.numero ?? `55519${String(Math.floor(80000000 + Math.random() * 19999999))}`, ultimo_evento_em: agoraIso(), verificado_em: agoraIso(), ultimo_erro: null });
      registrar('conectou', 'whatsapp', String(canal.nome), 'WhatsApp de Cobranças conectado', [], String(canal.id));
    }, 8000);
  };
  const instanciaWa = (b: Linha): unknown => {
    const k = b.canal_id ? T.wa_canais.find((x) => x.id === b.canal_id) : undefined;
    const nomeDe = (uid: unknown) => String(T.profiles.find((x) => x.id === uid)?.nome ?? '');
    if (b.acao === 'create') {
      // um número por dono: reaproveita o canal dele (reconectar) ou cria
      let c = b.dono_id ? T.wa_canais.find((x) => x.dono_id === b.dono_id) : T.wa_canais.find((x) => !x.dono_id && x.nome === b.nome);
      if (!c) {
        c = { id: id(), nome: String(b.nome ?? 'WhatsApp'), instancia: `previa-${Date.now().toString(36)}`, numero: null, estado: 'desconectado', qr: null, dono_id: b.dono_id ?? null,
          ultimo_erro: null, ultimo_evento_em: null, verificado_em: null, created_at: agoraIso() };
        T.wa_canais.push(c);
      }
      Object.assign(c, { estado: 'conectando', qr: qrFalso() });
      conectarDepois(c);
      return { ok: true, canal_id: c.id };
    }
    if (!k) return { ok: true };
    if (b.acao === 'qr') { Object.assign(k, { estado: 'conectando', qr: qrFalso() }); conectarDepois(k); return { ok: true }; }
    if (b.acao === 'logout') {
      const estava = k.estado;
      Object.assign(k, { estado: 'desconectado', qr: null, ultimo_evento_em: agoraIso() });
      // QR fechado antes de ler: nada foi conectado, então nada a registrar (e canal recém-criado sem número sai da lista)
      if (estava === 'conectado') registrar('desconectou', 'whatsapp', String(k.nome), 'WhatsApp de Cobranças desconectado', [], String(k.id));
      else if (!k.numero) T.wa_canais = T.wa_canais.filter((x) => x !== k);
      return { ok: true };
    }
    if (b.acao === 'remover') { T.wa_canais = T.wa_canais.filter((x) => x !== k); T.wa_conversas = T.wa_conversas.filter((c) => c.canal_id !== k.id); registrar('removeu', 'whatsapp', String(k.nome), 'WhatsApp de Cobranças removido', [], String(k.id)); return { ok: true }; }
    if (b.acao === 'definir_dono') {
      const antes = k.dono_id ? nomeDe(k.dono_id) : 'sem dono';
      k.dono_id = b.dono_id ?? null; if (b.dono_id) k.nome = nomeDe(b.dono_id) || k.nome;
      registrar('alterou', 'whatsapp', String(k.nome), 'comercial dono do número', [{ c: 'dono', de: antes, para: b.dono_id ? nomeDe(b.dono_id) : 'sem dono' }], String(k.id));
      return { ok: true };
    }
    if (b.acao === 'verificar' || b.acao === 'status') { k.verificado_em = agoraIso(); return { ok: true, estado: k.estado, webhook_ok: true }; }
    return { ok: true };
  };

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
    'reviza-wa-instancia': (b) => instanciaWa(b),
    // Asaas na prévia: nenhuma chamada sai daqui. Qualquer chave no formato do Asaas "conecta" uma conta
    // de demonstração; a chave não é guardada (só os 4 últimos caracteres, como no servidor de verdade).
    'reviza-asaas': (b) => {
      const k = T.integracoes.find((x) => x.servico === 'asaas')!;
      const ROT_FORMA: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito' };
      const simNao = (v: unknown) => (v ? 'ligado' : 'desligado');
      const pct = (v: unknown) => `${String(Number(v) || 0).replace('.', ',')}%`;
      if (b.acao === 'conectar') {
        const chave = String(b.chave ?? '').trim();
        if (!chave) return { error: 'access_token_not_found' };
        if (!chave.startsWith('$aact_') || chave.length < 24) return { error: 'invalid_access_token' };
        const dela = chave.startsWith('$aact_prod_') ? 'producao' : chave.startsWith('$aact_hmlg_') ? 'testes' : null;
        if (dela && dela !== b.ambiente) return { error: 'invalid_environment' };
        const troca = !!k.conectado;
        const conta = { nome: 'Reviza (conta de demonstração)', documento: '00.000.000/0001-00', email: 'financeiro@reviza.exemplo' };
        Object.assign(k, { conectado: true, ambiente: b.ambiente === 'testes' ? 'testes' : 'producao', conta, chave_final: chave.slice(-4), conectado_em: agoraIso(), conectado_por: quemFaz().ator_nome, retorno_ativo: true, ultimo_retorno: null });
        salvarInteg();
        registrar(troca ? 'alterou' : 'conectou', 'integração', 'Asaas', troca ? `trocou a chave de API (ambiente de ${k.ambiente === 'testes' ? 'testes' : 'produção'})` : `conta do Asaas conectada no ambiente de ${k.ambiente === 'testes' ? 'testes' : 'produção'}`);
        return { conta };
      }
      if (!k.conectado) return { error: 'nao_conectado' };
      if (b.acao === 'testar') return { conta: k.conta };
      if (b.acao === 'salvar') {
        const de = (k.config ?? {}) as Linha, para = (b.config ?? {}) as Linha;
        const formas = (v: unknown) => (Array.isArray(v) ? v.map((f) => ROT_FORMA[String(f)] ?? String(f)).join(', ') : '');
        const mud: Linha[] = [];
        const nota = (c: string, a: string, d: string) => { if (a !== d) mud.push({ c, de: a, para: d }); };
        nota('formas', formas(de.formas ?? ['pix', 'boleto']), formas(para.formas));
        nota('gerarSozinho', simNao(de.gerarSozinho ?? true), simNao(para.gerarSozinho));
        nota('baixaAutomatica', simNao(de.baixaAutomatica ?? true), simNao(para.baixaAutomatica));
        nota('baixaQuando', de.baixaQuando === 'disponivel' ? 'dinheiro disponível' : 'pagamento confirmado', para.baixaQuando === 'disponivel' ? 'dinheiro disponível' : 'pagamento confirmado');
        nota('avisarComercial', simNao(de.avisarComercial ?? true), simNao(para.avisarComercial));
        nota('multa', pct(de.multa), pct(para.multa));
        nota('juros', pct(de.juros), pct(para.juros));
        nota('avisosAsaas', simNao(de.avisosAsaas), simNao(para.avisosAsaas));
        k.config = para; salvarInteg();
        if (mud.length) registrar('alterou', 'integração', 'Asaas', `regras de pagamento (${mud.length} ${mud.length === 1 ? 'mudança' : 'mudanças'})`, mud);
        return { ok: true };
      }
      if (b.acao === 'desconectar') {
        Object.assign(k, { conectado: false, conta: null, chave_final: null, conectado_em: null, conectado_por: null, retorno_ativo: false, ultimo_retorno: null });
        salvarInteg(); registrar('desconectou', 'integração', 'Asaas', 'conta do Asaas desconectada');
        return { ok: true };
      }
      return { ok: true };
    },
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
          deve_trocar_senha: b.senha ? b.exigirTroca !== false : true, created_at: agoraIso(), modulos: Array.isArray(b.modulos) ? b.modulos : null, areas: Array.isArray(b.areas) ? b.areas : null });
        salvarPerfis();
        registrar('cadastrou', 'usuário', String(b.nome || usuario), `papel ${ROT_PAPEL[String(b.papel ?? 'comercial')] ?? b.papel} · ${textoAmb(b.modulos)}`);
        return { usuario, senha };
      }
      if (b.acao === 'resetar') { const p = achar(); if (p) { p.deve_trocar_senha = true; registrar('alterou', 'usuário', String(p.nome), 'redefiniu a senha (temporária; troca no próximo acesso)', [], String(p.id)); } salvarPerfis(); return { senha: gerar() }; }
      if (b.acao === 'definir_senha') { const p = achar(); if (p) { p.deve_trocar_senha = !!b.exigirTroca; registrar('alterou', 'usuário', String(p.nome), `definiu uma senha nova${b.exigirTroca ? ' (troca no próximo acesso)' : ''}`, [], String(p.id)); } salvarPerfis(); return {}; }
      if (b.acao === 'renomear') { const p = achar(); if (p) { const de = loginDe(p.email); p.email = `${String(b.usuario)}@reviza.local`; registrar('alterou', 'usuário', String(p.nome), 'login de entrada', [{ c: 'login', de, para: String(b.usuario) }], String(p.id)); } salvarPerfis(); return { usuario: b.usuario }; }
      if (b.acao === 'excluir') {
        const p = achar(); if (!p) return { error: 'id invalido' };
        if (String(b.confirmar ?? '').trim().toLowerCase() !== loginDe(p.email)) return { error: 'Confirmação não confere: digite o login do usuário.' };
        T.profiles = T.profiles.filter((x) => x.id !== b.id); salvarPerfis(); registrar('excluiu', 'usuário', String(p.nome), 'excluído do sistema'); return {};
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
