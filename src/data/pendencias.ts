/* ============================================================================
   Pendências do processo — PROTÓTIPO (modo demonstração, sem backend).
   Depois que o cliente fecha e o processo entra, às vezes o juiz pede algo:
   reassinar um documento, mandar um documento novo, confirmar uma informação.
   A pendência é aberta para UM cliente; a 1ª mensagem sai pelo NÚMERO DE
   PENDÊNCIAS (um WhatsApp só para isso, sem API) e, se ele não responder,
   os lembretes programados saem nos dias seguintes — até ele responder.
   Tudo aqui vive em memória: nada é enviado, nada vai pro banco.
   ============================================================================ */
import { useSyncExternalStore } from 'react';

export type TipoPendencia = 'reassinatura' | 'documento' | 'informacao' | 'outro';
export type TipoBloco = 'texto' | 'audio' | 'imagem' | 'documento' | 'video';
export type StatusPendencia = 'aguardando' | 'respondeu' | 'sem_resposta' | 'resolvida';
export type EstadoPasso = 'enviado' | 'agendado' | 'cancelado';

export interface Bloco {
  id: string;
  tipo: TipoBloco;
  /** texto (ou legenda da mídia) — aceita variáveis */
  texto?: string;
  arquivoNome?: string;
  duracaoSeg?: number;
  /** real: arquivo já no bucket (path com o id da org na frente) */
  storagePath?: string;
  mime?: string;
  tamanho?: number;
  /** real: upload em andamento */
  subindo?: boolean;
}
/** um envio da régua: o 1º é o dia 0 (na hora), os outros são os lembretes */
export interface Passo {
  id: string;
  dia: number;
  hora: string; // "09:00"
  blocos: Bloco[];
}
export interface PassoPendencia extends Passo {
  estado: EstadoPasso;
  /** quando saiu / quando vai sair (ISO) */
  quando: string;
  /** "Mandar mensagem agora": fora da régua (não é 1ª nem lembrete) */
  avulso?: boolean;
  /** real: o que aconteceu com o envio DE VERDADE depois da fila (passo 'enviado').
   *  undefined = sem informação (demo) → conta como entregue. */
  entrega?: 'fila' | 'enviada' | 'falhou';
  /** real: por que não saiu (frase curta para a tela) */
  motivoFalha?: string;
}
export interface Modelo {
  id: string;
  tipo: TipoPendencia;
  nome: string;
  passos: Passo[];
}
export interface ClienteFechado {
  id: string;
  nome: string;
  telefone: string;
  processo: string;
  acao: string;
  responsavel: string;
  fechadoEm: string;
}
export interface Evento { quando: string; texto: string; de?: 'cliente' | 'nos' | 'sistema' }
export interface Pendencia {
  id: string;
  clienteId: string;
  tipo: TipoPendencia;
  /** o que o juiz pediu, em poucas palavras — vira a variável {pendencia} */
  oQue: string;
  prazo?: string; // ISO (data)
  /** nº do processo (opcional) — variável {processo} */
  processo?: string;
  responsavel: string;
  responsavelId?: string;
  conversaId?: string;
  criadaEm: string;
  status: StatusPendencia;
  pausada?: boolean;
  passos: PassoPendencia[];
  resposta?: { texto: string; quando: string };
  resolvidaEm?: string;
  eventos: Evento[];
  /** real: de onde o servidor conta os dias em "Mudar lembretes" (ISO). Sem = data da 1ª mensagem. */
  baseLembretes?: string;
}
export interface AjustesPendencias {
  numero: { nome: string; telefone: string; conectado: boolean };
  canalId?: string;
  /** chave geral: desligado = nada sai (real nasce desligado) */
  ativo?: boolean;
  diasUteis: boolean;
  janelaIni: string;
  janelaFim: string;
  limiteDia: number;
  avisarResponsavel: boolean;
}

export const ROTULO_TIPO: Record<TipoPendencia, string> = {
  reassinatura: 'Reassinar documento',
  documento: 'Mandar documento novo',
  informacao: 'Confirmar informação',
  outro: 'Outro pedido',
};
export const ROTULO_BLOCO: Record<TipoBloco, string> = {
  texto: 'Texto', audio: 'Áudio', imagem: 'Imagem', documento: 'Documento', video: 'Vídeo',
};
export const VARIAVEIS = [
  { chave: '{primeiro_nome}', rotulo: 'Primeiro nome' },
  { chave: '{pendencia}', rotulo: 'O que precisa' },
  { chave: '{prazo}', rotulo: 'Prazo' },
  { chave: '{processo}', rotulo: 'Nº do processo' },
  { chave: '{atendente}', rotulo: 'Seu nome' },
];
export const SIMULADO = 'Demonstração: nada foi enviado.';

/* Limites do servidor (pend_gravar_passos / pend_validar_blocos / pendencias_config_salvar) — manter iguais. */
export const MAX_ENVIOS = 12;
export const MAX_BLOCOS = 8;
export const MAX_TEXTO = 4096;
export const LIMITE_DIA_MIN = 8;
export const LIMITE_DIA_MAX = 500;
/** = pendencias_config_salvar: limite_invalido fora de 8..500 */
export const limiteDiaValido = (n: number) => Number.isInteger(n) && n >= LIMITE_DIA_MIN && n <= LIMITE_DIA_MAX;
/** Ajustes: por que os envios NÃO podem ficar ligados com o que está na tela ('' = podem).
 *  = pendencias_config_salvar: ligar exige número (ligar_sem_numero) e número conectado (numero_desconectado).
 *  Já ligado no MESMO número que caiu: o servidor aceita salvar (e desligar). Trocar para um número
 *  desconectado com os envios ligados: a tela recusa (nada sairia). */
export function travaEnvios(x: { ativo: boolean; temNumero: boolean; conectado: boolean; jaLigado: boolean; mesmoNumero: boolean }): '' | 'ligar_sem_numero' | 'numero_desconectado' {
  if (!x.ativo) return '';
  if (!x.temNumero) return 'ligar_sem_numero';
  if (!x.conectado && !(x.jaLigado && x.mesmoNumero)) return 'numero_desconectado';
  return '';
}
/* = DOC_EXTS do evolution-send (quem ENVIA): foto (jpg/png) como documento passa no banco
   antigo mas não sai — foto vai como bloco Imagem. Manter igual ao evolution-send. */
export const EXT_DOC = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'ppt', 'pptx', 'zip'];
/** extensão como o servidor lê (regex '^.*\.'): sem ponto = '' */
export const extDe = (nome: string) => (nome.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();

/* ============================ relógio e datas ============================ */
export const agora = () => new Date();
const DIA = 86_400_000;
export function emDias(d: number, hora = '09:00', base = agora()) {
  const [h, m] = hora.split(':').map(Number);
  const x = new Date(base.getTime() + d * DIA);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
}
const haMin = (min: number) => new Date(agora().getTime() - min * 60_000).toISOString();
export function quandoCurto(iso: string) {
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const dif = Math.round((dd.getTime() - hoje.getTime()) / DIA);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dif === 0) return `hoje ${hora}`;
  if (dif === 1) return `amanhã ${hora}`;
  if (dif === -1) return `ontem ${hora}`;
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} ${hora}`;
}
export function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((agora().getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
export function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
/** dias até o prazo (negativo = passou) */
export function diasAte(iso: string) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DIA);
}
export function frasePrazo(iso?: string) {
  if (!iso) return '';
  const d = diasAte(iso);
  if (d < 0) return `prazo passou há ${-d} ${-d === 1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'prazo vence hoje';
  if (d === 1) return 'prazo vence amanhã';
  return `prazo em ${d} dias`;
}
/* ============================ horário de envio ============================
   Espelham o servidor (migrações 20261008160000 + 20261008190000):
   - lembrete = data do início + N dias, na hora; com "só dias úteis", sábado/domingo vai para a segunda;
   - o tick só despacha dentro da janela (e em dia útil, se ligado): o que vence fora dela sai na abertura seguinte. */
type Janela = Pick<AjustesPendencias, 'janelaIni' | 'janelaFim' | 'diasUteis'>;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fimDeSemana = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** instante de "dia N às HH:MM" contado da data de `base` (= pend_instante + empurrão do fim de semana) */
export function instanteLembrete(base: Date, dia: number, hora: string, diasUteis: boolean) {
  const [h, m] = (hora === 'agora' ? '09:00' : hora).split(':').map(Number);
  const x = new Date(base); x.setDate(x.getDate() + dia); x.setHours(h, m, 0, 0);
  if (diasUteis) while (fimDeSemana(x)) x.setDate(x.getDate() + 1);
  return x.toISOString();
}
export function dentroDaJanela(d: Date, j: Janela) {
  const t = hhmm(d);
  return t >= j.janelaIni && t < j.janelaFim && !(j.diasUteis && fimDeSemana(d));
}
/** primeiro instante >= d em que o motor pode despachar */
export function proximaJanela(d: Date, j: Janela): Date {
  if (dentroDaJanela(d, j)) return new Date(d);
  const [h, m] = j.janelaIni.split(':').map(Number);
  const x = new Date(d);
  if (hhmm(x) >= j.janelaFim) x.setDate(x.getDate() + 1);
  x.setHours(h, m, 0, 0);
  if (j.diasUteis) while (fimDeSemana(x)) x.setDate(x.getDate() + 1);
  return x;
}
/** instante em que algo marcado para `iso` sai: o que já venceu sai agora; fora do horário (ou no fim de
 *  semana, com "só dias úteis") espera a abertura seguinte. A MESMA regra com os envios ligados ou não. */
export function saidaPrevista(iso: string, j: Janela, agoraMs = Date.now()): Date {
  return proximaJanela(new Date(Math.max(new Date(iso).getTime(), agoraMs)), j);
}
/** a data prevista em palavras ("amanhã 09:00", "12/10 14:00"). Ligado ou desligado, o mesmo envio mostra
 *  a mesma data; só o que já venceu muda de nome: "em instantes" (vai sair) × "em espera" (parado). */
export function dataPrevista(iso: string, j: Janela, parado = false): string {
  const sai = saidaPrevista(iso, j);
  if (sai.getTime() <= Date.now() + 90_000) return parado ? 'em espera' : 'em instantes';
  return quandoCurto(sai.toISOString());
}
/** quando algo marcado para `iso` sai de verdade, em palavras ("em instantes", "amanhã 09:00", "quando os envios forem ligados") */
export function previsaoSaida(iso: string, aj: AjustesPendencias): string {
  if (!aj.ativo) return 'quando os envios forem ligados';
  if (!aj.numero.conectado) return `quando o número ${nomeBonito(aj.numero.nome)} voltar a conectar`;
  return dataPrevista(iso, aj);
}
/** versão curta para a linha do tempo */
export function previsaoCurta(iso: string, aj: AjustesPendencias): string {
  if (!aj.ativo) return 'envios desligados';
  if (!aj.numero.conectado) return 'número desconectado';
  return `sai ${previsaoSaida(iso, aj)}`;
}

export const primeiroNome = (n: string) => {
  const p = n.trim().split(/\s+/)[0] ?? '';
  return p.charAt(0) + p.slice(1).toLowerCase();
};
const MINUSC = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
export const nomeBonito = (n: string) => n.split(/\s+/).map((p) => (MINUSC.has(p) ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase())).join(' ');
export const iniciais = (n: string) => n.split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const mmss = (s?: number) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

/** troca as variáveis pelo dado do cliente (prévia do que ele vai receber).
 *  Igual ao servidor (pend_preencher): dado que falta vira VAZIO, não marcador. */
export function preencher(t: string, ctx: { cliente: ClienteFechado; oQue: string; prazo?: string; processo?: string; atendente: string }) {
  return t
    .split('{primeiro_nome}').join(primeiroNome(ctx.cliente.nome))
    .split('{pendencia}').join(ctx.oQue.trim())
    .split('{prazo}').join(ctx.prazo ? dataBR(ctx.prazo) : '')
    .split('{processo}').join((ctx.processo ?? '').trim())
    .split('{atendente}').join(ctx.atendente);
}
/** variável usada no texto sem o dado (vai em branco) — '' se está tudo certo */
export function variavelSemDado(passos: Passo[], ctx: { prazo?: string; processo?: string }) {
  const txt = passos.flatMap((p) => p.blocos.map((b) => b.texto ?? '')).join('\n');
  if (txt.includes('{prazo}') && !ctx.prazo) return 'Sem prazo: onde a mensagem usa “Prazo” vai ficar em branco.';
  if (txt.includes('{processo}') && !(ctx.processo ?? '').trim()) return 'Sem nº do processo: onde a mensagem usa “Nº do processo” vai ficar em branco.';
  return '';
}
export function resumoBlocos(bs: Bloco[]) {
  if (!bs.length) return 'sem mensagem';
  return bs.map((b) => ROTULO_BLOCO[b.tipo]).join(' + ');
}

let seq = 0;
export const novoId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
export const novoBloco = (tipo: TipoBloco): Bloco => ({ id: novoId('b'), tipo, texto: tipo === 'texto' ? '' : undefined });

/* ============================ dados de exemplo ============================ */
const USUARIO = 'Matheus';
export const usuarioAtual = () => USUARIO;

const CLIENTES: ClienteFechado[] = [
  { id: 'c1', nome: 'MARIA APARECIDA DOS SANTOS', telefone: '(51) 99812-4471', processo: '5001873-22.2026.8.21.0001', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-42) },
  { id: 'c2', nome: 'JOÃO CARLOS PEREIRA', telefone: '(51) 98144-0932', processo: '5003310-87.2026.8.21.0010', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-35) },
  { id: 'c3', nome: 'IVONE TEREZINHA MACHADO', telefone: '(54) 99630-1288', processo: '5000945-11.2026.8.21.0039', acao: 'Revisão de empréstimo', responsavel: 'Juliana', fechadoEm: emDias(-60) },
  { id: 'c4', nome: 'ANTÔNIO MARCOS DA SILVA', telefone: '(51) 99577-6402', processo: '5007721-04.2026.8.21.0008', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-28) },
  { id: 'c5', nome: 'NEUSA MARIA OLIVEIRA', telefone: '(53) 98420-7715', processo: '5002288-63.2026.8.21.0022', acao: 'Revisão de empréstimo', responsavel: 'Juliana', fechadoEm: emDias(-74) },
  { id: 'c6', nome: 'CLAUDIO ROBERTO FAGUNDES', telefone: '(51) 99201-3354', processo: '5004410-29.2026.8.21.0001', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-19) },
  { id: 'c7', nome: 'ROSANGELA DE FÁTIMA LIMA', telefone: '(55) 99118-2046', processo: '5001102-70.2026.8.21.0027', acao: 'Juros abusivos', responsavel: 'Giovana', fechadoEm: emDias(-51) },
  { id: 'c8', nome: 'PEDRO HENRIQUE BORGES', telefone: '(51) 98706-5590', processo: '5006634-18.2026.8.21.0001', acao: 'Revisão de empréstimo', responsavel: 'Matheus', fechadoEm: emDias(-12) },
  { id: 'c9', nome: 'LUCIA HELENA RAMOS', telefone: '(51) 99340-8817', processo: '5005519-45.2026.8.21.0015', acao: 'Juros abusivos', responsavel: 'Juliana', fechadoEm: emDias(-88) },
  { id: 'c10', nome: 'VALDIR JOSÉ KLEIN', telefone: '(54) 99973-1120', processo: '5000387-92.2026.8.21.0041', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-23) },
  { id: 'c11', nome: 'SANDRA REGINA COSTA', telefone: '(51) 98455-2209', processo: '5008812-37.2026.8.21.0001', acao: 'Revisão de empréstimo', responsavel: 'Giovana', fechadoEm: emDias(-9) },
  { id: 'c12', nome: 'OSMAR LUIZ BECKER', telefone: '(51) 99611-4093', processo: '5002976-50.2026.8.21.0033', acao: 'Juros abusivos', responsavel: 'Matheus', fechadoEm: emDias(-66) },
];

const t = (texto: string): Bloco => ({ id: novoId('b'), tipo: 'texto', texto });
const a = (arquivoNome: string, duracaoSeg: number): Bloco => ({ id: novoId('b'), tipo: 'audio', arquivoNome, duracaoSeg });

/* Textos de exemplo: o dono troca pelos dele (copy é dele). */
const MODELOS: Modelo[] = [
  {
    id: 'm-reass', tipo: 'reassinatura', nome: 'Reassinatura',
    passos: [
      { id: 'p1', dia: 0, hora: 'agora', blocos: [
        t('Olá, {primeiro_nome}! Aqui é {atendente}, do escritório. Tudo bem?'),
        t('No seu processo, o juiz pediu: {pendencia}. É rapidinho e resolve pelo celular. Posso te mandar o link para assinar?'),
      ] },
      { id: 'p2', dia: 1, hora: '09:00', blocos: [a('lembrete_reassinatura.ogg', 38)] },
      { id: 'p3', dia: 3, hora: '14:00', blocos: [t('{primeiro_nome}, passando para lembrar da assinatura que o juiz pediu. O prazo é {prazo}. Me responde aqui quando puder 🙏')] },
      { id: 'p4', dia: 6, hora: '09:00', blocos: [a('ultimo_aviso.ogg', 31), t('Sem essa assinatura o processo fica parado. Consegue hoje?')] },
    ],
  },
  {
    id: 'm-doc', tipo: 'documento', nome: 'Documento novo',
    passos: [
      { id: 'p1', dia: 0, hora: 'agora', blocos: [
        t('Olá, {primeiro_nome}! Aqui é {atendente}, do escritório. Tudo bem?'),
        t('O juiz pediu um documento novo no seu processo: {pendencia}. Pode tirar uma foto e mandar por aqui mesmo.'),
      ] },
      { id: 'p2', dia: 1, hora: '09:00', blocos: [a('como_tirar_foto_documento.ogg', 44)] },
      { id: 'p3', dia: 3, hora: '14:00', blocos: [t('{primeiro_nome}, conseguiu separar o documento? O prazo do juiz é {prazo}.')] },
    ],
  },
  {
    id: 'm-info', tipo: 'informacao', nome: 'Confirmar informação',
    passos: [
      { id: 'p1', dia: 0, hora: 'agora', blocos: [t('Olá, {primeiro_nome}! Aqui é {atendente}, do escritório. Preciso confirmar uma informação do seu processo: {pendencia}. Pode me responder?')] },
      { id: 'p2', dia: 2, hora: '09:00', blocos: [a('confirmar_informacao.ogg', 27)] },
    ],
  },
];

function rodarPassos(modelo: Modelo, inicio: Date, enviados: number, cancelarResto = false): PassoPendencia[] {
  return modelo.passos.map((p, i) => {
    const estado: EstadoPasso = i < enviados ? 'enviado' : cancelarResto ? 'cancelado' : 'agendado';
    /* o que ainda vai sair segue pend_gravar_passos + pend_dia_util (fim de semana → segunda, MESMA hora);
       o que já saiu fica na data da história de exemplo (a resposta do cliente vem depois dele) */
    const quando = p.hora === 'agora' ? inicio.toISOString()
      : estado === 'enviado' ? emDias(p.dia, p.hora, inicio) : instanteLembrete(inicio, p.dia, p.hora, true);
    return { ...p, blocos: p.blocos.map((b) => ({ ...b, id: novoId('b') })), quando, estado };
  });
}
const desde = (d: number, hh = 10) => { const x = new Date(agora().getTime() - d * DIA); x.setHours(hh, 12, 0, 0); return x; };

function semente(): Pendencia[] {
  const [mR, mD, mI] = MODELOS;
  const ini = (id: string, d: number, hh = 10) => ({ id, criadaEm: desde(d, hh).toISOString() });
  const lista: Pendencia[] = [
    {
      ...ini('pd1', 0, 9), clienteId: 'c1', tipo: 'reassinatura', oQue: 'reassinar a procuração com firma reconhecida',
      prazo: emDias(9), responsavel: 'Matheus', status: 'respondeu',
      passos: rodarPassos(mR, desde(0, 9), 1, true),
      resposta: { texto: 'Bom dia! Pode mandar sim, mas eu não sei fazer pelo celular, minha neta me ajuda à tarde', quando: haMin(18) },
      eventos: [],
    },
    {
      ...ini('pd2', 2), clienteId: 'c2', tipo: 'documento', oQue: 'extrato do benefício do INSS atualizado',
      prazo: emDias(4), responsavel: 'Matheus', status: 'aguardando',
      passos: rodarPassos(mD, desde(2), 2), eventos: [],
    },
    {
      ...ini('pd3', 1, 15), clienteId: 'c4', tipo: 'reassinatura', oQue: 'assinar a declaração de hipossuficiência de novo',
      prazo: emDias(12), responsavel: 'Matheus', status: 'aguardando',
      passos: rodarPassos(mR, desde(1, 15), 2), eventos: [],
    },
    {
      ...ini('pd4', 0, 11), clienteId: 'c6', tipo: 'informacao', oQue: 'se o endereço continua o mesmo da petição',
      responsavel: 'Matheus', status: 'aguardando',
      passos: rodarPassos(mI, desde(0, 11), 1), eventos: [],
    },
    {
      ...ini('pd5', 7), clienteId: 'c10', tipo: 'documento', oQue: 'comprovante de residência em nome dele',
      prazo: emDias(-1), responsavel: 'Matheus', status: 'sem_resposta',
      passos: rodarPassos(mD, desde(7), 3), eventos: [],
    },
    {
      ...ini('pd6', 0, 8), clienteId: 'c3', tipo: 'documento', oQue: 'RG frente e verso legível',
      prazo: emDias(6), responsavel: 'Juliana', status: 'respondeu',
      passos: rodarPassos(mD, desde(0, 8), 1, true),
      resposta: { texto: 'Imagem', quando: haMin(52) },
      eventos: [],
    },
    {
      ...ini('pd7', 3), clienteId: 'c5', tipo: 'reassinatura', oQue: 'reassinar o contrato de honorários',
      prazo: emDias(8), responsavel: 'Juliana', status: 'aguardando',
      passos: rodarPassos(mR, desde(3), 3), eventos: [],
    },
    {
      ...ini('pd8', 5), clienteId: 'c8', tipo: 'reassinatura', oQue: 'reassinar a procuração (assinatura não conferiu)',
      responsavel: 'Matheus', status: 'resolvida', resolvidaEm: desde(4, 16).toISOString(),
      passos: rodarPassos(mR, desde(5), 2, true),
      resposta: { texto: 'Assinei agora, confere aí', quando: desde(4, 15).toISOString() },
      eventos: [],
    },
    {
      ...ini('pd9', 9), clienteId: 'c12', tipo: 'documento', oQue: 'certidão de casamento',
      responsavel: 'Matheus', status: 'resolvida', resolvidaEm: desde(8, 11).toISOString(),
      passos: rodarPassos(mD, desde(9), 1, true),
      resposta: { texto: 'certidao_casamento.pdf', quando: desde(8, 10).toISOString() },
      eventos: [],
    },
    {
      ...ini('pd10', 1), clienteId: 'c7', tipo: 'informacao', oQue: 'número da conta onde recebe o benefício',
      prazo: emDias(15), responsavel: 'Giovana', status: 'aguardando',
      passos: rodarPassos(mI, desde(1), 1), eventos: [],
    },
  ];
  /* nº do processo vem na pendência (como no real: {processo} usa o da pendência) */
  return lista.map((p) => ({ ...p, processo: CLIENTES.find((c) => c.id === p.clienteId)?.processo, eventos: eventosIniciais(p) }));
}
function eventosIniciais(p: Pendencia): Evento[] {
  const ev: Evento[] = [{ quando: p.criadaEm, texto: `Pendência aberta por ${p.responsavel}`, de: 'sistema' }];
  p.passos.filter((x) => x.estado === 'enviado').forEach((x, i) => ev.push({ quando: x.quando, texto: i === 0 ? `Primeira mensagem enviada (${resumoBlocos(x.blocos)})` : `Lembrete ${i} enviado (${resumoBlocos(x.blocos)})`, de: 'nos' }));
  if (p.resposta) ev.push({ quando: p.resposta.quando, texto: 'Cliente respondeu. Lembretes parados.', de: 'cliente' });
  if (p.status === 'sem_resposta') ev.push({ quando: p.passos[p.passos.length - 1].quando, texto: 'Acabaram os lembretes sem resposta', de: 'sistema' });
  if (p.resolvidaEm) ev.push({ quando: p.resolvidaEm, texto: 'Marcada como resolvida', de: 'sistema' });
  return ev.sort((x, y) => x.quando.localeCompare(y.quando));
}

/* ============================ store ============================ */
interface Estado {
  pendencias: Pendencia[];
  modelos: Modelo[];
  clientes: ClienteFechado[];
  ajustes: AjustesPendencias;
}
let estado: Estado = {
  pendencias: semente(),
  modelos: MODELOS,
  clientes: CLIENTES,
  ajustes: {
    numero: { nome: 'PENDÊNCIAS', telefone: '(51) 99488-3071', conectado: true },
    ativo: true, diasUteis: true, janelaIni: '09:00', janelaFim: '19:00', limiteDia: 40, avisarResponsavel: true,
  },
};
const ouvintes = new Set<() => void>();
function set(f: (e: Estado) => Estado) { estado = f(estado); ouvintes.forEach((o) => o()); }
/** leitura do estado da demonstração fora do React (testes) */
export const estadoDemo = () => estado;
export function usePendDemo() {
  return useSyncExternalStore((o) => { ouvintes.add(o); return () => ouvintes.delete(o); }, () => estado);
}
const mudarPend = (id: string, f: (p: Pendencia) => Pendencia) => set((e) => ({ ...e, pendencias: e.pendencias.map((p) => (p.id === id ? f(p) : p)) }));
const ev = (texto: string, de: Evento['de'] = 'sistema'): Evento => ({ quando: agora().toISOString(), texto, de });

/** demo: o "motor" sai na hora se pudesse sair de verdade (ligado, número conectado, dentro da janela) */
const saiNaHora = (aj: AjustesPendencias) => !!aj.ativo && aj.numero.conectado && dentroDaJanela(agora(), aj);

export const pendAcoes = {
  /* = pendencia_criar: responsável = encarregado do cliente; 1ª no início, lembretes contados da data do início */
  criar(dados: { clienteId: string; tipo: TipoPendencia; oQue: string; prazo?: string; processo?: string; passos: Passo[]; agendarPara?: string }) {
    const aj = estado.ajustes;
    const inicio = dados.agendarPara && new Date(dados.agendarPara).getTime() > agora().getTime() ? new Date(dados.agendarPara) : agora();
    const saiJa = !dados.agendarPara && saiNaHora(aj);
    const passos: PassoPendencia[] = dados.passos.map((p, i) => (i === 0
      ? { ...p, dia: 0, hora: 'agora', quando: inicio.toISOString(), estado: saiJa ? 'enviado' : 'agendado' }
      : { ...p, dia: Math.max(1, p.dia), quando: instanteLembrete(inicio, Math.max(1, p.dia), p.hora, aj.diasUteis), estado: 'agendado' }));
    const cli = estado.clientes.find((c) => c.id === dados.clienteId);
    const p: Pendencia = {
      id: novoId('pd'), clienteId: dados.clienteId, tipo: dados.tipo, oQue: dados.oQue, prazo: dados.prazo, processo: dados.processo,
      responsavel: cli?.responsavel || USUARIO, criadaEm: agora().toISOString(), status: 'aguardando', passos: ordenarPassos(passos), eventos: [],
    };
    p.eventos = [ev(`Pendência aberta por ${USUARIO}`), ...(saiJa ? [ev(`Primeira mensagem enviada (${resumoBlocos(passos[0].blocos)})`, 'nos')] : [])];
    set((e) => ({ ...e, pendencias: [p, ...e.pendencias] }));
    return p;
  },
  resolver(id: string) {
    mudarPend(id, (p) => ({
      ...p, status: 'resolvida', resolvidaEm: agora().toISOString(),
      passos: p.passos.map((x) => (x.estado === 'agendado' ? { ...x, estado: 'cancelado' } : x)),
      eventos: [...p.eventos, ev('Marcada como resolvida')],
    }));
  },
  /* = pendencia_reabrir (idempotente): se NADA saiu, volta a ser pendência nova (1ª agora, ou na data
     marcada se ainda for futura; lembretes contados dela); se saiu, volta para respondeu/sem resposta */
  reabrir(id: string) {
    const aj = estado.ajustes;
    mudarPend(id, (p) => {
      if (p.status !== 'resolvida') return p;
      const saiu = p.passos.some((x) => x.estado === 'enviado' && x.entrega !== 'falhou');
      const volta = saiu ? [] : p.passos.filter((x, i) => (x.estado === 'cancelado' || x.entrega === 'falhou') && !ehAvulso(x, i));
      const base = new Date(Math.max(agora().getTime(), volta[0] ? new Date(volta[0].quando).getTime() : 0));
      const saiJa = base.getTime() <= agora().getTime() && saiNaHora(aj);
      const novos: PassoPendencia[] = volta.map((x, i) => ({
        ...x, entrega: undefined, motivoFalha: undefined,
        ...(i === 0
          ? { dia: 0, hora: 'agora', quando: base.toISOString(), estado: saiJa ? 'enviado' as const : 'agendado' as const }
          : { dia: Math.max(1, x.dia), quando: instanteLembrete(base, Math.max(1, x.dia), x.hora, aj.diasUteis), estado: 'agendado' as const }),
      }));
      return {
        ...p, status: p.resposta ? 'respondeu' : novos.length ? 'aguardando' : 'sem_resposta', resolvidaEm: undefined,
        passos: novos.length ? novos : p.passos, eventos: [...p.eventos, ev('Reaberta')],
      };
    });
  },
  pausar(id: string, pausada: boolean) {
    mudarPend(id, (p) => ({ ...p, pausada, eventos: [...p.eventos, ev(pausada ? 'Lembretes pausados' : 'Lembretes retomados')] }));
  },
  /* = pendencia_lembretes('retomar'): apaga o que ainda não saiu (menos as avulsas), zera a resposta e conta os dias A PARTIR DE HOJE */
  retomar(id: string, passos: Passo[]) {
    const aj = estado.ajustes;
    mudarPend(id, (p) => {
      const novos: PassoPendencia[] = passos.map((x) => ({ ...x, id: novoId('p'), dia: Math.max(1, x.dia), quando: instanteLembrete(agora(), Math.max(1, x.dia), x.hora, aj.diasUteis), estado: 'agendado' }));
      return {
        ...p, status: 'aguardando', pausada: false, resposta: undefined,
        passos: ordenarPassos([...p.passos.filter((x) => x.estado !== 'agendado' || x.avulso), ...novos]),
        eventos: [...p.eventos, ev(`Lembretes programados de novo (${novos.length})`)],
      };
    });
  },
  /* = pendencia_lembretes('trocar'): troca só os LEMBRETES que ainda não saíram; a 1ª e as avulsas ficam.
     Dias contados da data da 1ª mensagem (a tela só oferece isso depois que a 1ª saiu). */
  trocarLembretes(id: string, passos: Passo[]) {
    const aj = estado.ajustes;
    mudarPend(id, (p) => {
      const [primeira, ...resto] = p.passos;
      const fica = [primeira, ...resto.filter((x) => x.estado !== 'agendado' || x.avulso)];
      const base = new Date(primeira?.quando ?? agora());
      const novos: PassoPendencia[] = passos.map((x) => ({ ...x, dia: Math.max(1, x.dia), quando: instanteLembrete(base, Math.max(1, x.dia), x.hora, aj.diasUteis), estado: 'agendado' }));
      return { ...p, passos: ordenarPassos([...fica, ...novos]), eventos: [...p.eventos, ev('Lembretes alterados')] };
    });
  },
  /* = pendencia_enviar_agora + tick (motor 20261008190000): a avulsa sai em qualquer status menos
     resolvida, mesmo com os lembretes pausados — só depende de o envio poder sair agora */
  enviarAgora(id: string, blocos: Bloco[]) {
    const aj = estado.ajustes;
    mudarPend(id, (p) => {
      if (p.status === 'resolvida') throw new Error('pendencia_resolvida');
      const sai = saiNaHora(aj);
      const novo: PassoPendencia = { id: novoId('p'), dia: 0, hora: 'agora', blocos, avulso: true, estado: sai ? 'enviado' : 'agendado', quando: agora().toISOString() };
      return {
        ...p, passos: ordenarPassos([...p.passos, novo]),
        eventos: [...p.eventos, ev(sai ? `Mensagem avulsa enviada (${resumoBlocos(blocos)})` : 'Mensagem avulsa na fila', 'nos')],
      };
    });
  },
  salvarModelo(m: Modelo) {
    set((e) => ({ ...e, modelos: e.modelos.some((x) => x.id === m.id) ? e.modelos.map((x) => (x.id === m.id ? m : x)) : [...e.modelos, m] }));
  },
  excluirModelo(id: string) { set((e) => ({ ...e, modelos: e.modelos.filter((m) => m.id !== id) })); },
  /* = pendencias_config_salvar: janela invertida, limite fora de 8..500 e ligar com o número caído são recusados */
  ajustar(f: Partial<AjustesPendencias>) {
    const antes = estado.ajustes;
    const j = { ...antes, ...f };
    if (!j.janelaIni || !j.janelaFim || j.janelaFim <= j.janelaIni) throw new Error('janela_invalida');
    if (!limiteDiaValido(j.limiteDia)) throw new Error('limite_invalido');
    if (j.ativo && !antes.ativo && !j.numero.conectado) throw new Error('numero_desconectado');
    set((e) => ({ ...e, ajustes: { ...e.ajustes, ...f } }));
  },
};

/* ============================ derivados ============================ */
/** Ordem da linha do tempo. Entra na ordem de GRAVAÇÃO (= coluna ordem do banco): a 1ª e os
 *  lembretes ficam nessa ordem (a numeração "Lembrete N" nunca pula, nem depois de "Voltar a lembrar").
 *  As mensagens avulsas entram no ponto do tempo em que foram mandadas. */
export function ordenarPassos<T extends PassoPendencia>(ps: T[]): T[] {
  if (ps.length < 2) return ps;
  const t = (x: T) => new Date(x.quando).getTime();
  const avulsa = (x: T, i: number) => i > 0 && (!!x.avulso || x.hora === 'agora');
  const out = ps.filter((x, i) => !avulsa(x, i));
  ps.filter(avulsa).sort((a, b) => t(a) - t(b)).forEach((a) => {
    let pos = 1; // nunca antes da 1ª
    for (let k = 1; k < out.length; k++) if (t(out[k]) <= t(a)) pos = k + 1;
    out.splice(pos, 0, a);
  });
  return out;
}
export const ehAvulso = (x: PassoPendencia, i: number) => i > 0 && (!!x.avulso || x.hora === 'agora');
export function proximoEnvio(p: Pendencia) {
  if (p.status !== 'aguardando' || p.pausada) return undefined;
  return p.passos.find((x) => x.estado === 'agendado');
}
/** último envio que CHEGOU a sair (ignora o que falhou) */
export function ultimoEnvio(p: Pendencia) {
  return [...p.passos].reverse().find((x) => x.estado === 'enviado' && x.entrega !== 'falhou');
}
/** quantos envios saíram de verdade (na fila e falhou não contam) */
export function entregues(p: Pendencia) {
  return p.passos.filter((x) => x.estado === 'enviado' && (x.entrega ?? 'enviada') === 'enviada').length;
}
/** o envio mais recente que não saiu (para o alerta) */
export function envioFalhou(p: Pendencia) {
  return [...p.passos].reverse().find((x) => x.estado === 'enviado' && x.entrega === 'falhou');
}
/** nome do envio na linha do tempo: Primeira mensagem / Lembrete N / Mensagem avulsa */
export function rotuloEnvio(p: Pendencia, x: PassoPendencia) {
  const i = p.passos.indexOf(x);
  if (i <= 0) return 'Primeira mensagem';
  if (ehAvulso(x, i)) return 'Mensagem avulsa';
  return `Lembrete ${p.passos.slice(1, i + 1).filter((y, k) => !ehAvulso(y, k + 1)).length}`;
}
/** "Mudar lembretes". Motor atual (20261008160000): só depois que a 1ª saiu e sem avulsa esperando —
 *  ao trocar ele apaga TODOS os passos que não saíram (inclusive a 1ª e a avulsa).
 *  Motor novo (com lembrar_desde): preserva a 1ª e as avulsas, então vale sempre. */
export function podeMudarLembretes(p: Pendencia, motorNovo = false) {
  if (p.status !== 'aguardando') return false;
  return motorNovo || (p.passos[0]?.estado === 'enviado' && !p.passos.some((x) => x.avulso && x.estado === 'agendado'));
}
/** "Mandar mensagem agora". Motor atual: só sai com a pendência rodando (aguardando e sem pausa);
 *  em "Sem resposta" ou pausada ficaria parada para sempre. Motor novo: sai também nesses casos. */
export function podeMandarAgora(p: Pendencia, motorNovo = false) {
  if (p.status === 'aguardando') return motorNovo || !p.pausada;
  return motorNovo && p.status === 'sem_resposta';
}
export function clonarPassos(ps: Passo[]): Passo[] {
  return ps.map((p) => ({ ...p, id: novoId('p'), blocos: p.blocos.map((b) => ({ ...b, id: novoId('b') })) }));
}
