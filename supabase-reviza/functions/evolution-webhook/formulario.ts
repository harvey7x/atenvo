// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// Formulário de anúncio (WhatsApp Flow dos Click-to-WhatsApp da Meta) recebido pela Evolution.
// Puro: sem Deno, sem rede, sem banco — testado em formulario_test.ts.
//
// O lead toca no botão do anúncio ("Participar agora"), preenche o Flow e o WhatsApp entrega uma
// `interactiveResponseMessage` cujo único texto é "Sent". Os campos vêm em
// `nativeFlowResponseMessage.paramsJson` (string JSON), em três formas vistas em produção:
//   (a) Android: { wa_flow_response_params: { flow_id, flow_name, response_message: "<JSON>" } }
//       — response_message.response[].components[] traz name/label/value na ordem da tela;
//   (b) iOS:     a forma (a) + chaves planas "screen_0_Name_0", "screen_0_Email_1", flow_token;
//   (c) só as chaves planas (forma do nfm_reply da Cloud API).
// Lemos (a) quando existe (tem rótulo e ordem) e caímos em (c) quando não.

export interface CampoFormulario { campo: string; rotulo: string; valor: string }
export interface Formulario {
  flow_id: string | null;
  flow_name: string | null;
  campos: CampoFormulario[];
  nome: string | null;      // campo de nome, já limpo (null se ausente ou inválido)
  email: string | null;     // e-mail válido em minúsculas (null se ausente ou inválido)
  texto: string;            // o que aparece no chat
}

const MAX_CAMPOS = 20;
const MAX_VALOR = 300;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// rótulo legível para a forma plana, que só traz o `name` técnico do componente
const ROTULO_PLANO: Record<string, string> = { name: 'Nome', email: 'Email', phone: 'Telefone', cpf: 'CPF' };

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function parseJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'string') return obj(v);
  try { return obj(JSON.parse(v)); } catch { return null; }
}
function limpa(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function valorTexto(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.map(valorTexto).filter(Boolean).join(', ');
  if (typeof v === 'object') return '';                   // estrutura que não sabemos exibir: fica fora
  return limpa(v, MAX_VALOR);
}

function camposDaResposta(params: Record<string, unknown>): CampoFormulario[] {
  const wa = obj(params.wa_flow_response_params);
  const rm = parseJson(wa?.response_message);
  const telas = Array.isArray(rm?.response) ? rm!.response as unknown[] : [];
  const out: CampoFormulario[] = [];
  for (const t of telas) {
    const tela = obj(t);
    const comps = Array.isArray(tela?.components) ? tela!.components as unknown[] : [];
    const form = obj(obj(tela?.screenState)?.form);
    for (const c of comps) {
      const comp = obj(c); if (!comp) continue;
      const campo = limpa(comp.name, 60);
      const valor = valorTexto(comp.value ?? obj(comp.componentData)?.componentValue ?? (campo && form ? form[campo] : undefined));
      if (!campo || !valor) continue;
      out.push({ campo, rotulo: limpa(comp.label, 60) || campo, valor });
    }
  }
  return out;
}

function camposPlanos(params: Record<string, unknown>): CampoFormulario[] {
  const achados: Array<{ tela: number; ordem: number; c: CampoFormulario }> = [];
  for (const [k, v] of Object.entries(params)) {
    const m = /^screen_(\d+)_(.+)_(\d+)$/.exec(k);
    if (!m) continue;
    const campo = limpa(m[2], 60);
    const valor = valorTexto(v);
    if (!campo || !valor) continue;
    const rotulo = ROTULO_PLANO[campo.toLowerCase()] ?? campo.replace(/_/g, ' ');
    achados.push({ tela: Number(m[1]), ordem: Number(m[3]), c: { campo, rotulo, valor } });
  }
  return achados.sort((a, b) => a.tela - b.tela || a.ordem - b.ordem).map((x) => x.c);
}

const ehCampoNome = (c: CampoFormulario) =>
  /^(name|nome|full_?name|nome_?completo)$/i.test(c.campo) || /^nome\b/i.test(c.rotulo);
const ehCampoEmail = (c: CampoFormulario) => /e-?mail/i.test(c.campo) || /e-?mail/i.test(c.rotulo);

// nome digitado pelo lead: precisa ter letra e não pode ser um e-mail; sem / \ < > (mesma régua do sanitizeNome)
export function nomeDoFormulario(v: string | null | undefined): string | null {
  const s = limpa(v, 120).replace(/[/\\<>]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || !/\p{L}/u.test(s) || s.includes('@')) return null;
  return s;
}
export function emailDoFormulario(v: string | null | undefined): string | null {
  const s = limpa(v, 254).toLowerCase();
  return RE_EMAIL.test(s) ? s : null;
}

// ---- RESPOSTA AUTOMÁTICA DO WHATSAPP AO FORMULÁRIO (09/10) ----
// Depois do formulário, o app WhatsApp Business do celular do canal manda sozinho uma mensagem de
// conclusão do Flow. Ela chega como fromMe (source android), igual a uma resposta digitada no
// celular, e era gravada com origem='telefone' — o bot-runner, o gatilho da IA, o bot_pode_atuar e
// o SLA liam como "humano respondeu" e o lead ficava sem ninguém (35 casos de 25/09 a 09/10, todos
// no EMPRÉSTIMO). Texto conferido byte a byte no banco (77 bytes UTF-8, um único texto).
// Ordem vista em produção: formulário primeiro, resposta automática +1,3 s a +6,6 s depois — e 3
// casos em que o celular segurou e mandou 13 a 23 h depois. Por isso a janela é de 48 h.
export const TEXTOS_AUTO_FORMULARIO: readonly string[] = [
  'Agradecemos o envio do formulário. Entraremos em contato com você em breve.',
];
export const JANELA_AUTO_FORMULARIO_MS = 48 * 60 * 60 * 1000;
/** metadados gravados na mensagem reconhecida (origem da linha vira 'bot': não é ato humano). */
export const META_AUTO_FORMULARIO = { via: 'formulario_auto', origem: 'formulario_auto', recebida_via: 'webhook_fromMe' } as const;

const normAuto = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const AUTO_FORMULARIO = new Set(TEXTOS_AUTO_FORMULARIO.map(normAuto));

/** O texto é a resposta automática do WhatsApp ao formulário? Comparação EXATA (só normaliza
 *  Unicode e espaços): frase parecida digitada por gente continua sendo gente. */
export function ehRespostaAutoFormulario(t: unknown): boolean {
  return typeof t === 'string' && AUTO_FORMULARIO.has(normAuto(t));
}

/** Saída pelo celular (fromMe) que deve ser gravada como automática: texto exato + formulário de
 *  entrada nesta conversa dentro da janela. `formularioEmMs` = criado_em do formulário mais recente
 *  (null = não há). Tolera 60 s de relógio entre banco e função. */
export function ehSaidaAutoFormulario(p: { tipo: string; texto: string | null | undefined; formularioEmMs: number | null; agoraMs: number }): boolean {
  if (p.tipo !== 'texto' || !ehRespostaAutoFormulario(p.texto)) return false;
  if (p.formularioEmMs == null || !Number.isFinite(p.formularioEmMs)) return false;
  const dt = p.agoraMs - p.formularioEmMs;
  return dt >= -60_000 && dt <= JANELA_AUTO_FORMULARIO_MS;
}

/**
 * Lê o formulário de uma mensagem JÁ desembrulhada (unwrapMsg). Devolve null quando não é resposta
 * de Flow — resposta de botão comum (quick_reply, paramsJson {"id":...}) continua fora daqui.
 */
export function formularioOf(m: Record<string, unknown> | undefined | null): Formulario | null {
  const irm = obj(m?.interactiveResponseMessage);
  const nf = obj(irm?.nativeFlowResponseMessage);
  if (!nf) return null;
  const params = parseJson(nf.paramsJson);
  if (!params) return null;
  const wa = obj(params.wa_flow_response_params);
  const temPlano = Object.keys(params).some((k) => /^screen_\d+_.+_\d+$/.test(k));
  if (!wa && !temPlano && typeof params.flow_token !== 'string') return null;   // não é Flow

  let campos = camposDaResposta(params);
  if (!campos.length) campos = camposPlanos(params);
  campos = campos.slice(0, MAX_CAMPOS);

  const nome = nomeDoFormulario(campos.find(ehCampoNome)?.valor);
  const email = emailDoFormulario(campos.find(ehCampoEmail)?.valor);
  const linhas = campos.map((c) => `${c.rotulo}: ${c.valor}`);
  const texto = ['Formulário do anúncio', ...(linhas.length ? linhas : ['(enviado sem campos legíveis)'])].join('\n');
  return {
    flow_id: limpa(wa?.flow_id ?? params.flow_id, 40) || null,
    flow_name: limpa(wa?.flow_name, 120) || null,
    campos, nome, email, texto,
  };
}
