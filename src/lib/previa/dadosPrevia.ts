/* Dados FICTÍCIOS da prévia de design (VITE_PREVIA): números, conversas, régua e envios
   montados em cima dos clientes de demonstração (gsCarregar) — nenhum dado real. */
import { gsCarregar } from '@/v2/data/cobranca/demoStore';
import vozMaria from './midia/voz-cliente-maria.m4a?url';
import vozTerezinha from './midia/voz-cliente-terezinha.m4a?url';
import vozAtendente from './midia/voz-atendente-luiz.m4a?url';
import extratoFicticio from './midia/comprovante-ficticio.jpg?url';

export type Linha = Record<string, unknown>;
export interface Banco {
  tabelas: Record<string, Linha[]>;
  midia: Map<string, string>;
  usuario: { id: string; email: string; user_metadata: Record<string, unknown> };
  /** chamado depois de cada gravação (a prévia guarda os usuários entre recargas) */
  aoMudar?: (tabela: string) => void;
}

const MIN = 60_000;
const H = 60 * MIN;
const DIA = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const soDig = (s: string) => (s || '').replace(/\D/g, '');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const primeiro = (nome: string) => {
  const p = (nome || '').trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
};
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const svg = (s: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
const COMPROVANTE_PIX = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<rect width="600" height="900" fill="#f4f6f8"/><rect x="40" y="40" width="520" height="820" rx="24" fill="#fff"/>
<circle cx="300" cy="150" r="44" fill="#21c063"/><path d="M280 150l14 14 28-30" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="300" y="240" font-family="Helvetica,Arial" font-size="30" font-weight="700" text-anchor="middle" fill="#111">Pix enviado</text>
<text x="300" y="300" font-family="Helvetica,Arial" font-size="48" font-weight="700" text-anchor="middle" fill="#111">R$ 62,50</text>
<text x="300" y="340" font-family="Helvetica,Arial" font-size="20" text-anchor="middle" fill="#667">COMPROVANTE FICTÍCIO · DEMONSTRAÇÃO</text>
<g font-family="Helvetica,Arial" font-size="22" fill="#445"><text x="90" y="440">Para</text><text x="510" y="440" text-anchor="end" fill="#111">ALFA GROUP</text>
<text x="90" y="500">Instituição</text><text x="510" y="500" text-anchor="end" fill="#111">Banco Exemplo</text>
<text x="90" y="560">Data</text><text x="510" y="560" text-anchor="end" fill="#111">hoje, 09:41</text>
<text x="90" y="620">ID da transação</text><text x="510" y="620" text-anchor="end" fill="#111">E0000000000000</text></g>
<line x1="90" y1="680" x2="510" y2="680" stroke="#e3e6ea" stroke-width="2"/>
<text x="300" y="740" font-family="Helvetica,Arial" font-size="18" text-anchor="middle" fill="#99a">Documento ilustrativo — sem valor</text></svg>`);
// PDF mínimo (uma página em branco com título) — só pro "toque para abrir" do documento.
// Vai como blob: (URL de objeto), não data: — o Chrome bloqueia abrir aba nova com URL data: e o
// clique não fazia nada; blob: é o mesmo caminho do anexo enviado pelo "+" (upload falso), que abre.
// Criado só dentro de criarBanco (prévia): fora do navegador não existe URL.createObjectURL.
const PDF_TEXTO =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 74>>stream\nBT /F1 18 Tf 40 200 Td (Comprovante ficticio - demonstracao) Tj ET\nendstream endobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
const pdfFicticio = () => URL.createObjectURL(new Blob([PDF_TEXTO], { type: 'application/pdf' }));

type Msg = { dir: 'entrada' | 'saida'; tipo?: string; txt?: string | null; midia?: string; ant?: number; status?: string };

/* roteiros de conversa de cobrança (ilustrativos) — {n} = primeiro nome, {a} = comercial, {v} = valor */
const ROTEIROS: { msgs: Msg[]; naoLidas: number }[] = [
  { naoLidas: 2, msgs: [
    { dir: 'saida', txt: 'Bom dia, {n}! Tudo bem? Aqui é o {a}, da ALFA. Passando pra lembrar da mensalidade deste mês: {v}. Pode ser no Pix 🙂', ant: 3 * H },
    { dir: 'entrada', txt: 'Bom dia, tudo bem sim graças a Deus', ant: 50 * MIN },
    { dir: 'entrada', txt: 'Meu benefício ainda não caiu, posso pagar dia 10?', ant: 0 },
  ] },
  { naoLidas: 1, msgs: [
    { dir: 'saida', txt: 'Oi {n}, tudo certo? Hoje é o dia do teu benefício, conforme combinamos. Consegue fazer o pagamento ainda hoje?', ant: 2 * H },
    { dir: 'entrada', tipo: 'audio', midia: 'previa/audio-maria.m4a', ant: 0 },
  ] },
  { naoLidas: 0, msgs: [
    { dir: 'saida', txt: 'Bom dia, {n}! Lembrete da mensalidade de {v} 🙏', ant: 26 * H },
    { dir: 'entrada', txt: 'Vou fazer agora de manhã', ant: 25 * H },
    { dir: 'entrada', tipo: 'documento', txt: 'comprovante-pix.pdf', midia: 'previa/comprovante-pix.pdf', ant: 24 * H },
    { dir: 'saida', txt: 'Recebido! Muito obrigado, {n}. Já dei baixa aqui ✅', ant: 23 * H, status: 'lida' },
    { dir: 'entrada', txt: 'Obrigada meu filho, Deus te abençoe 🙏', ant: 22 * H },
  ] },
  { naoLidas: 1, msgs: [
    { dir: 'saida', txt: 'Boa tarde, {n}! Tudo bem? Sua mensalidade vence amanhã: {v}.', ant: 5 * H },
    { dir: 'entrada', tipo: 'imagem', txt: 'Segue o comprovante', midia: 'previa/comprovante-pix.svg', ant: 0 },
  ] },
  { naoLidas: 0, msgs: [
    { dir: 'entrada', txt: 'Qual a chave do pix mesmo?', ant: 2 * DIA + 3 * H },
    { dir: 'saida', txt: 'A chave é o CNPJ 12.345.678/0001-90 (ALFA GROUP). O valor deste mês é {v} 🙂', ant: 2 * DIA + 2 * H, status: 'lida' },
    { dir: 'entrada', txt: 'Ok, obrigada', ant: 2 * DIA + H },
  ] },
  { naoLidas: 3, msgs: [
    { dir: 'saida', txt: 'Oi {n}! Aqui é o {a}. Vi que a parcela do mês passado ficou em aberto — conseguimos regularizar essa semana?', ant: 4 * H },
    { dir: 'entrada', txt: 'Oi', ant: 30 * MIN },
    { dir: 'entrada', txt: 'Esse mês ficou apertado', ant: 28 * MIN },
    { dir: 'entrada', txt: 'Posso pagar metade agora e o resto no outro mês?', ant: 0 },
  ] },
  { naoLidas: 0, msgs: [
    { dir: 'saida', txt: 'Bom dia, {n}! Passando pra lembrar da mensalidade: {v}.', ant: 3 * DIA },
    { dir: 'entrada', txt: 'Já mandei', ant: 3 * DIA - 20 * MIN },
    { dir: 'saida', tipo: 'audio', midia: 'previa/audio-atendente.m4a', ant: 3 * DIA - 10 * MIN, status: 'lida' },
  ] },
  { naoLidas: 1, msgs: [
    { dir: 'saida', txt: 'Bom dia, {n}! Tudo bem por aí?', ant: 6 * H },
    { dir: 'entrada', tipo: 'audio', midia: 'previa/audio-terezinha.m4a', ant: 0 },
  ] },
  { naoLidas: 0, msgs: [
    { dir: 'entrada', tipo: 'imagem', txt: 'Mandei o extrato pro senhor ver', midia: 'previa/extrato.jpg', ant: 4 * DIA + H },
    { dir: 'saida', txt: 'Recebi, {n}! Vou conferir e te retorno ainda hoje.', ant: 4 * DIA, status: 'lida' },
  ] },
  { naoLidas: 0, msgs: [
    { dir: 'saida', txt: 'Bom dia, {n}! Hoje é o dia do benefício — a mensalidade é {v}.', ant: 5 * DIA },
    { dir: 'entrada', txt: 'Pago hoje à tarde 👍', ant: 5 * DIA - H },
  ] },
];

const FORA_DA_BASE: { nome: string | null; tel: string; previa: string; naoLidas: number; ant: number }[] = [
  { nome: null, tel: '5551984417720', previa: 'Boa tarde, quero saber sobre a revisão do meu benefício', naoLidas: 1, ant: 40 * MIN },
  { nome: 'Rosângela', tel: '5551992013344', previa: 'Quem fala?', naoLidas: 0, ant: 7 * H },
  { nome: null, tel: '5554996612280', previa: 'Recebi uma mensagem de vocês', naoLidas: 2, ant: 3 * H },
  { nome: 'Seu Valdir', tel: '5551981237765', previa: 'Ok', naoLidas: 0, ant: 2 * DIA },
  { nome: null, tel: '5553999104433', previa: 'Bom dia', naoLidas: 0, ant: 3 * DIA },
  { nome: 'Neide filha da Dona Lurdes', tel: '5551995540012', previa: 'Minha mãe pediu pra eu falar com vocês', naoLidas: 0, ant: 4 * DIA },
];

export function criarBanco(): Banco {
  const agora = Date.now();
  const dados = gsCarregar();
  const comerciais = [...new Set(dados.linhas.map((l) => l.comercial).filter(Boolean))].sort();
  const usuario = { id: 'u-matheus', email: 'matheus@reviza.local', user_metadata: { name: 'Matheus' } };

  /* AMBIENTES (11/11): quem entra em Cobranças, em Atendimento ou nos dois — o seletor do topo e a tela
     Usuários mostram. Dois comerciais também atendem; duas atendentes só no Atendimento; a Bruna só Cobranças. */
  const NOS_DOIS = new Set(['Eduardo', 'Paty']);
  const profiles: Linha[] = [
    { id: usuario.id, nome: 'Matheus', email: usuario.email, papel: 'admin', ativo: true, deve_trocar_senha: false, created_at: '2026-09-10T12:00:00Z', modulos: ['cobrancas', 'atendimento'] },
    { id: 'u-bruna', nome: 'Bruna', email: 'bruna@reviza.local', papel: 'financeiro', ativo: true, deve_trocar_senha: false, created_at: '2026-09-10T15:00:00Z', modulos: ['cobrancas'] },
    ...comerciais.map((c, i) => ({
      id: `u-${slug(c)}`, nome: c, email: `${slug(c)}@reviza.local`, papel: 'comercial', ativo: true, deve_trocar_senha: false,
      created_at: `2026-09-${String(11 + i).padStart(2, '0')}T12:00:00Z`,
      modulos: NOS_DOIS.has(c) ? ['cobrancas', 'atendimento'] : ['cobrancas'],
    })),
    { id: 'u-carla', nome: 'Carla', email: 'carla@reviza.local', papel: 'atendente', ativo: true, deve_trocar_senha: false, created_at: '2026-11-03T12:00:00Z', modulos: ['atendimento'] },
    { id: 'u-bianca', nome: 'Bianca', email: 'bianca@reviza.local', papel: 'atendente', ativo: true, deve_trocar_senha: false, created_at: '2026-11-06T12:00:00Z', modulos: ['atendimento'] },
  ];

  const canais: Linha[] = comerciais.map((c, i) => ({
    id: `k-${slug(c)}`, nome: c, instancia: `alfa-${slug(c)}`, numero: `55519${String(81000000 + i * 734219).slice(0, 8)}`,
    estado: i === comerciais.length - 1 ? 'desconectado' : 'conectado', qr: null, dono_id: `u-${slug(c)}`,
    ultimo_erro: null, ultimo_evento_em: iso(agora - (2 + i) * MIN), verificado_em: iso(agora - 12 * MIN), created_at: `2026-09-${String(11 + i).padStart(2, '0')}T12:00:00Z`,
  }));
  const canalDe = (comercial: string) => canais.find((k) => k.nome === comercial) ?? canais[0];

  const midia = new Map<string, string>([
    ['previa/audio-maria.m4a', vozMaria], ['previa/audio-terezinha.m4a', vozTerezinha], ['previa/audio-atendente.m4a', vozAtendente],
    ['previa/comprovante-pix.svg', COMPROVANTE_PIX], ['previa/extrato.jpg', extratoFicticio], ['previa/comprovante-pix.pdf', pdfFicticio()],
  ]);

  const conversas: Linha[] = [];
  const mensagens: Linha[] = [];
  const alvos: Linha[] = [];
  const comTel = dados.linhas.filter((l) => soDig(l.telefone).length >= 10 && l.situacao === 'cancelado');
  // as primeiras com mensagem nova ficam no topo; o resto se espalha pelos últimos dias
  comTel.slice(0, 72).forEach((l, i) => {
    const r = ROTEIROS[i % ROTEIROS.length];
    const naoLidas = i < 26 ? r.naoLidas : 0;
    const base = agora - (i < 26 ? i * 23 * MIN + 4 * MIN : 2 * H + (i - 26) * 3.1 * H);
    const canal = canalDe(l.comercial);
    const telefone = '55' + soDig(l.telefone);
    const id = `cv-${l.id}`;
    const valor = brl((l.valor || 120) / 2);
    const fmt = (t?: string | null) => (t ?? '').replace(/\{n\}/g, primeiro(l.nome)).replace(/\{a\}/g, String(l.comercial || 'Eduardo')).replace(/\{v\}/g, valor);
    let ultima: Linha | null = null;
    r.msgs.forEach((m, k) => {
      const em = base - (m.ant ?? 0);
      const entradaNova = m.dir === 'entrada' && naoLidas > 0 && k >= r.msgs.length - naoLidas;
      const row: Linha = {
        id: `${id}-m${k}`, conversa_id: id, direcao: m.dir, tipo: m.tipo ?? 'texto',
        conteudo: m.tipo === 'audio' ? null : fmt(m.txt) || null, midia_path: m.midia ?? null, resposta_a: null, apagada: false,
        status: m.dir === 'saida' ? (m.status ?? (k === r.msgs.length - 1 ? 'entregue' : 'lida')) : entradaNova ? 'recebida' : 'lida',
        created_at: iso(em),
      };
      mensagens.push(row);
      ultima = row;
    });
    const u = ultima as Linha | null;
    const previa = !u ? null : u.tipo === 'audio' ? '[audio]' : u.tipo === 'imagem' ? `[imagem] ${u.conteudo ?? ''}`.trim() : u.tipo === 'documento' ? `[documento] ${u.conteudo ?? ''}` : String(u.conteudo ?? '');
    conversas.push({
      id, canal_id: canal.id, telefone, nome_contato: l.nome, lead_id: l.id, ultima_previa: previa, ultima_em: u ? u.created_at : iso(base),
      nao_lidas: naoLidas, digitando_ate: null, arquivada: false, created_at: iso(base - 30 * DIA),
    });
    // a régua mandou e o cliente respondeu (bloco "Responderam a cobrança" e "Envios deste cliente")
    const resp = r.msgs.find((m) => m.dir === 'entrada');
    const enviou = r.msgs.find((m) => m.dir === 'saida');
    if (enviou && i < 40) {
      const enviadoEm = base - (enviou.ant ?? 0);
      const respondeu = resp ? base - (resp.ant ?? 0) : null;
      alvos.push({
        id: `al-${l.id}`, envio_id: 'env-regua-hoje', telefone, nome: l.nome, lead_id: l.id, status: 'enviado', erro: null, motivo: null,
        enviado_em: iso(enviadoEm), created_at: iso(enviadoEm - 2 * MIN), canal_id: canal.id, canal_nome: canal.nome, canal_numero: canal.numero,
        conversa_id: id, mensagem: fmt(enviou.txt), comp: '2026-11', venc: null, regua_msg_id: i % 2 ? 'rg-dia' : 'rg-lembrete',
        passo_nome: i % 2 ? 'Cobrança do dia' : 'Lembrete amigável', entrega: 'lida', entregue_em: iso(enviadoEm + MIN), lida_em: iso(enviadoEm + 9 * MIN),
        respondeu_em: respondeu && respondeu > agora - 7 * DIA ? iso(respondeu) : null,
        resposta_previa: resp ? (resp.tipo === 'audio' ? '[audio]' : resp.tipo === 'imagem' ? '[imagem]' : fmt(resp.txt)) : null,
        tentativas: 1, tentar_apos: null, parte_atual: null,
        wa_envios: { nome: i % 2 ? 'Régua · Cobrança do dia' : 'Régua · Lembrete amigável', origem: 'regua', canal_id: canal.id, agendado_para: null, estado: 'concluido' },
      });
    }
  });
  FORA_DA_BASE.forEach((f, i) => {
    const id = `cv-fora-${i}`;
    const em = agora - f.ant;
    conversas.push({ id, canal_id: canais[i % canais.length].id, telefone: f.tel, nome_contato: f.nome, lead_id: null, ultima_previa: f.previa, ultima_em: iso(em), nao_lidas: f.naoLidas, digitando_ate: null, arquivada: false, created_at: iso(em - 2 * DIA) });
    mensagens.push({ id: `${id}-m0`, conversa_id: id, direcao: 'entrada', tipo: 'texto', conteudo: f.previa, midia_path: null, resposta_a: null, apagada: false, status: f.naoLidas ? 'recebida' : 'lida', created_at: iso(em) });
  });

  const reguaMsgs: Linha[] = [
    { id: 'rg-lembrete', alvo: 'padrao', nome: 'Lembrete amigável', quando: -3, ativo: true, grupo_nome: null, criterio: null, cli_id: null, cli_nome: null, data_envio: null, created_at: '2026-09-20T12:00:00Z',
      blocos: [{ tipo: 'texto', corpo: 'Oi {nome}! Aqui é o {atendente}. Passando pra lembrar que sua mensalidade de {valor da parcela} vence {vencimento}. Qualquer dúvida estou por aqui 🙂' }] },
    { id: 'rg-dia', alvo: 'padrao', nome: 'Cobrança do dia', quando: 0, ativo: true, grupo_nome: null, criterio: null, cli_id: null, cli_nome: null, data_envio: null, created_at: '2026-09-20T12:01:00Z',
      blocos: [{ tipo: 'texto', corpo: 'Bom dia {nome}, tudo bem? Hoje é o dia que recebe teu benefício, conforme combinamos. A mensalidade é {valor da parcela} — pode ser no Pix.' }] },
    { id: 'rg-depois', alvo: 'padrao', nome: 'Segunda chamada', quando: 3, ativo: true, grupo_nome: null, criterio: null, cli_id: null, cli_nome: null, data_envio: null, created_at: '2026-09-20T12:02:00Z',
      blocos: [{ tipo: 'texto', corpo: 'Oi {nome}! Ainda não identifiquei o pagamento de {valor da parcela}. Se já pagou, me manda o comprovante por aqui 🙏' }] },
    { id: 'sc-pix', alvo: 'script', nome: 'Chave Pix', quando: 0, ativo: true, grupo_nome: null, criterio: null, cli_id: null, cli_nome: null, data_envio: null, created_at: '2026-09-21T12:00:00Z',
      blocos: [{ tipo: 'texto', corpo: 'A chave Pix é o CNPJ 12.345.678/0001-90 (ALFA GROUP). Valor: {valor da parcela}.' }] },
    { id: 'sc-recebido', alvo: 'script', nome: 'Pagamento recebido', quando: 0, ativo: true, grupo_nome: null, criterio: null, cli_id: null, cli_nome: null, data_envio: null, created_at: '2026-09-21T12:01:00Z',
      blocos: [{ tipo: 'texto', corpo: 'Recebido, {nome}! Muito obrigado — já dei baixa aqui ✅' }] },
  ];

  const envios: Linha[] = [
    { id: 'env-regua-hoje', nome: 'Régua · Cobrança do dia', canal_id: canais[0]?.id ?? null, modelo: '', estado: 'concluido', total: 75, enviados: 74, erros: 1, pulados: 3, agendado_para: null, created_at: iso(agora - 9 * H), origem: 'regua', passo_nome: 'Cobrança do dia', passo_quando: 0, blocos: null, criado_por: null },
    { id: 'env-regua-lembrete', nome: 'Régua · Lembrete amigável', canal_id: canais[1]?.id ?? null, modelo: '', estado: 'concluido', total: 58, enviados: 58, erros: 0, pulados: 2, agendado_para: null, created_at: iso(agora - DIA - 8 * H), origem: 'regua', passo_nome: 'Lembrete amigável', passo_quando: -3, blocos: null, criado_por: null },
    { id: 'env-manual-1', nome: 'Aviso de feriado', canal_id: canais[0]?.id ?? null, modelo: 'Oi! Amanhã é feriado — o atendimento volta na segunda 🙂', estado: 'concluido', total: 120, enviados: 118, erros: 2, pulados: 0, agendado_para: null, created_at: iso(agora - 3 * DIA), origem: 'manual', passo_nome: null, passo_quando: null, blocos: null, criado_por: usuario.id },
  ];

  const reguaConfig: Linha = {
    id: 1, ativa: true, hora_envio: 8, hora_fim: 11, canal_reserva_id: null, dias_envio: 'uteis', teto_diario: 60, pausar_se_respondeu: true,
    delay_min: 20, delay_max: 45, pausa_cada: 15, pausa_min: 5, horario_comercial: { EDUARDO: 7 }, regua_pausada: {}, updated_at: iso(agora - 2 * DIA), updated_by: usuario.id,
  };

  const notificacoes: Linha[] = [
    { id: 'nt-1', tipo: 'financeiro', titulo: 'Pagamento confirmado pelo financeiro', corpo: 'Maria Silva Souza · R$ 62,50', rota: '/cobrancas/financeiro', lida_em: null, criado_em: iso(agora - 35 * MIN), created_at: iso(agora - 35 * MIN) },
    { id: 'nt-2', tipo: 'aviso', titulo: 'Novo aviso do administrativo', corpo: 'Escala do feriado', rota: '/cobrancas/avisos', lida_em: iso(agora - H), criado_em: iso(agora - 3 * H), created_at: iso(agora - 3 * H) },
  ];

  return {
    usuario,
    midia,
    tabelas: {
      profiles,
      wa_canais: canais,
      wa_conversas: conversas,
      wa_mensagens: mensagens,
      wa_regua_msgs: reguaMsgs,
      wa_regua_config: [reguaConfig],
      wa_regua_comercial: [],
      wa_envios: envios,
      wa_envio_alvos: alvos,
      wa_optout: [],
      wa_motor_status: [{ id: 1, ultima_rodada: iso(agora - 40_000), ultima_ok: true, ultimo_erro: null }],
      wa_motor_rodadas: [0, 1, 2, 3].map((k) => ({ id: 900 - k, inicio: iso(agora - (k + 1) * MIN), fim: iso(agora - (k + 1) * MIN + 4000), fonte: 'cron', regua: null, enviadas: k === 3 ? 12 : 0, falhas: 0, puladas: 0, erro: null })),
      notificacoes,
      avisos: [],
      aviso_destinos: [],
      aviso_anexos: [],
      // registros de exemplo (a tela de Registros mostra a lista, não só o vazio)
      registros: [
        { id: 7, quando: iso(agora - 0.3 * H), ator_id: 'u-eduardo', ator_nome: 'Eduardo', ator_papel: 'comercial', acao: 'lançou', entidade: 'pagamento', entidade_id: null, rotulo: 'Maria Aparecida Souza', detalhe: 'informou pagamento de R$ 65,00 (out/26)', mudancas: [] },
        { id: 6, quando: iso(agora - 1.2 * H), ator_id: 'u-bruna', ator_nome: 'Bruna', ator_papel: 'financeiro', acao: 'confirmou', entidade: 'pagamento', entidade_id: null, rotulo: 'José Carlos Pereira', detalhe: 'pagamento de R$ 110,00 (out/26)', mudancas: [] },
        { id: 5, quando: iso(agora - 3 * H), ator_id: 'u-paty', ator_nome: 'Paty', ator_papel: 'comercial', acao: 'editou', entidade: 'cliente', entidade_id: null, rotulo: 'Antônia Ferreira Lima', detalhe: 'atualizou o cadastro (2 campos)', mudancas: [{ c: 'telefone', de: '5199990001', para: '5199990002' }, { c: 'valor', de: '300', para: '350' }] },
        { id: 4, quando: iso(agora - 5 * H), ator_id: 'u-matheus', ator_nome: 'Matheus', ator_papel: 'admin', acao: 'alterou', entidade: 'comissão', entidade_id: null, rotulo: 'Eduardo', detalhe: 'comissão de 50% da mensalidade (antes 40%)', mudancas: [] },
        { id: 3, quando: iso(agora - 26 * H), ator_id: 'u-bruna', ator_nome: 'Bruna', ator_papel: 'financeiro', acao: 'direcionou', entidade: 'cliente', entidade_id: null, rotulo: 'Sebastião R. Nunes', detalhe: 'para o ciclo dia 05', mudancas: [{ c: 'dia', de: null, para: '5' }] },
        { id: 2, quando: iso(agora - 30 * H), ator_id: 'u-matheus', ator_nome: 'Matheus', ator_papel: 'admin', acao: 'configurou', entidade: 'régua', entidade_id: null, rotulo: null, detalhe: 'ligou a régua automática', mudancas: [] },
        { id: 1, quando: iso(agora - 52 * H), ator_id: 'u-matheus', ator_nome: 'Matheus', ator_papel: 'admin', acao: 'cadastrou', entidade: 'usuário', entidade_id: null, rotulo: 'Carla', detalhe: 'papel Atendente · Atendimento', mudancas: [] },
      ],
      comissoes: [],
      comissoes_hist: [],
    },
  };
}
