/* =====================================================================
   Sincronização Google Planilhas ⇄ sistema (Reviza) — CAMADA DE DADOS.

   O dono quer ver PRIMEIRO as telas; o backend vem depois da aprovação.
   Este módulo é o CONTRATO entre as telas (Etapa 1 do assistente de
   configuração + painel de sincronização da Gestão) e o futuro backend:

   · `EstadoSync`           — tudo o que as telas leem (um único objeto);
   · `buscarEstadoSync()`   — leitura;
   · ações (`salvarLink`, `enviarChave`, `testar`, `conferir`, `aplicar`,
     `ligarAutomatico`, `sincronizarAgora`, `aplicarFreio`) — cada uma
     devolve o EstadoSync NOVO inteiro (o cache react-query é trocado de
     uma vez; nenhuma tela remonta estado à mão);
   · `useSyncPlanilha()` / `useAcaoSync()` — hooks das telas.

   Implementação HOJE:
   1) PRÉVIA — em DEV (import.meta.env.DEV) ou no modo demo, quando a URL
      traz ?config=… | ?sync=… | ?planilha=…: dados de exemplo plausíveis
      e ações SIMULADAS em memória (latência, sucesso, erro). Nada vai ao
      banco, nada vai ao navegador (sem localStorage/sessionStorage).
   2) REAL (modo reviza sem prévia): RPC sync_estado() + RPCs
      sync_link_salvar/sync_automatico + edge reviza-planilha-sync
      (?acao=credencial|testar|conferir|aplicar|agora). Sem permissão
      (comercial, 42501) ou sem o backend (migrations ainda não
      aplicadas, PGRST…) → 'indisponivel': as telas não renderizam nada
      (o selo e o botão da Gestão somem; o gate fica inativo).

   A CHAVE da conta de serviço NUNCA é guardada aqui: `enviarChave` recebe o
   texto do .json, valida e (no backend) o repassa para ser guardado
   criptografado. O estado só carrega o e-mail da conta.
   ===================================================================== */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isDemoMode, isRevizaMode, supabase } from '@/lib/supabase';
import { papelAprova } from './sessao';
import { parametrosPrevia, urlInicialPrevia } from './configuracao';
import type { Papel } from './types';

/** chave de cache react-query do estado da sincronização */
export const chaveSync = ['reviza', 'planilha-sync'] as const;

/* ================= tipos (o contrato) ================= */

/** 'previa' = dados de exemplo; 'real' = backend (futuro); 'indisponivel' = sem backend → telas inativas */
export type ModoSync = 'previa' | 'real' | 'indisponivel';

/** os 6 passos da Etapa 1, na ordem */
export type PassoId = 'link' | 'acesso' | 'chave' | 'teste' | 'conferir' | 'automatico';
export const PASSOS: readonly PassoId[] = ['link', 'acesso', 'chave', 'teste', 'conferir', 'automatico'];

export type CodigoErroTeste = 'sem_acesso' | 'aba_faltando' | 'localidade' | 'formato_excel' | 'falha';

export interface ItemConfere { rotulo: string; ok: boolean }

export interface ErroTeste {
  codigo: CodigoErroTeste;
  titulo: string;
  detalhe: string;
  /** passos da correção (aceitam a marcação de guia: {Menu > Item} e [[nome]]) */
  correcao: string[];
}

export interface ResultadoTeste {
  ok: boolean;
  quando: string;               // ISO
  abas: string[];               // abas encontradas
  clientes: number | null;      // linhas de cliente lidas em CLIENTES MENSAL
  localidade: ItemConfere | null;
  fuso: ItemConfere | null;
  erro: ErroTeste | null;
}

export type GrupoMudancaId = 'novos' | 'ciclo' | 'saem' | 'pagamentos' | 'telefones';
export interface ItemMudanca { nome: string; detalhe: string }
export interface GrupoMudanca {
  id: GrupoMudancaId;
  /** 'clientes novos' (o número vai à parte) */
  rotulo: string;
  /** frase de uma linha sobre o efeito */
  efeito: string;
  total: number;
  /** pode vir truncada pelo backend; `total` é o número real */
  itens: ItemMudanca[];
}

export interface Conferencia {
  id: string;
  geradaEm: string;
  grupos: GrupoMudanca[];
  /** soma dos totais */
  total: number;
}

export type OrigemRodada = 'automatica' | 'manual' | 'na_hora' | 'primeira';
export type ResultadoRodada = 'ok' | 'sem_mudancas' | 'erro' | 'freio';
export interface RodadaSync {
  id: string;
  quando: string;
  origem: OrigemRodada;
  resultado: ResultadoRodada;
  /** mudanças levadas da planilha para o sistema */
  daPlanilha: number;
  /** mudanças levadas do sistema para a planilha */
  paraPlanilha: number;
  duracaoMs: number;
  mensagem: string | null;
}

export interface ConflitoSync {
  id: string;
  quando: string;
  cliente: string;
  campo: string;
  valorPlanilha: string;
  valorSistema: string;
}

export interface FreioSync {
  detectadoEm: string;
  motivo: string;
  grupos: GrupoMudanca[];
}

export interface AvisoNaHora { url: string; segredo: string }

export interface EstadoSync {
  modo: ModoSync;
  planilha: { id: string; url: string } | null;
  /** só o e-mail da conta de serviço — a chave nunca volta */
  conta: { email: string; enviadaEm: string } | null;
  teste: ResultadoTeste | null;
  conferencia: Conferencia | null;
  /** última conferência aplicada */
  aplicadaEm: string | null;
  /** primeira aplicação = a sincronização EXISTE (não volta a null) */
  configuradaEm: string | null;
  /** trocou a planilha depois de configurada: as rodadas pausam até conferir + aplicar */
  exigeConferencia: boolean;
  automatico: boolean;
  intervaloMin: number;
  /** URL + segredo para o Apps Script ("atualização na hora", opcional) */
  naHora: AvisoNaHora | null;
  ultimaRodada: RodadaSync | null;
  proximaRodada: string | null;
  /** mais recente primeiro */
  log: RodadaSync[];
  conflitos: ConflitoSync[];
  /** rodada pausada pelo freio de segurança, esperando "Aplicar mesmo assim" */
  freio: FreioSync | null;
}

/** saúde resumida (selo da Gestão e cabeçalho do painel) */
export type SaudeSync = 'pendente' | 'freio' | 'conferir' | 'testar' | 'erro' | 'desligada' | 'ok';

/* ================= regras puras (testadas em planilhaSync.test.ts) ================= */

export const ABAS_OBRIGATORIAS = ['CLIENTES MENSAL', 'cancelados'] as const;

export type ResultadoLink = { ok: true; id: string; url: string } | { ok: false; erro: string };

/** Lê o link colado e devolve o ID da planilha (docs.google.com/spreadsheets/d/<ID>/…). */
export function extrairIdPlanilha(texto: string): ResultadoLink {
  const t = (texto ?? '').trim();
  if (!t) return { ok: false, erro: 'Cole o link da planilha do Google.' };
  if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com|office\.com|officeapps\.live\.com/i.test(t)) {
    return { ok: false, erro: 'Este link é do Excel Online. Leve a planilha para o Google (instruções acima) e cole o link do Google Planilhas.' };
  }
  if (/docs\.google\.com\/(document|presentation|forms)\//i.test(t)) {
    return { ok: false, erro: 'Este link é de um documento do Google, não de uma planilha.' };
  }
  if (/drive\.google\.com\/(file\/d|open)/i.test(t)) {
    return { ok: false, erro: 'Este é o link do arquivo enviado ao Drive. Abra o arquivo, use Arquivo → Salvar como Planilhas Google e cole o link da planilha nova.' };
  }
  const m = t.match(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/i);
  if (m) {
    const id = m[1];
    if (id.length < 25) return { ok: false, erro: 'O link parece incompleto. Copie de novo o endereço inteiro da planilha.' };
    // rtpof=true = arquivo do Excel aberto no modo de compatibilidade: a API do Google não lê
    if (/[?&#]rtpof=true/i.test(t)) {
      return { ok: false, erro: 'Esta planilha ainda está no formato do Excel (.xlsx). Use Arquivo → Salvar como Planilhas Google e cole o link da planilha nova.' };
    }
    return { ok: true, id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
  }
  // só o ID colado
  if (/^[A-Za-z0-9_-]{25,}$/.test(t)) return { ok: true, id: t, url: `https://docs.google.com/spreadsheets/d/${t}/edit` };
  return { ok: false, erro: 'Não reconheci este link. Ele deve começar com docs.google.com/spreadsheets/d/…' };
}

/** limite de tamanho do .json da chave (uma chave real tem ~2,3 KB) */
export const LIMITE_CHAVE_BYTES = 20 * 1024;

export type ResultadoChave =
  | { ok: true; email: string; projeto: string | null }
  | { ok: false; erro: string };

/** Validação LOCAL e leve do .json da conta de serviço — nada é guardado. */
export function validarChaveLocal(texto: string): ResultadoChave {
  let j: unknown;
  try { j = JSON.parse(texto); } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido. Envie o arquivo .json baixado em Chaves → Adicionar chave → Criar nova chave → JSON.' };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { ok: false, erro: 'O arquivo não tem o formato de uma chave do Google.' };
  }
  const o = j as Record<string, unknown>;
  if (o.type !== 'service_account') {
    if ('installed' in o || 'web' in o) {
      return { ok: false, erro: 'Este arquivo é de um "ID do cliente OAuth", não de uma conta de serviço. Crie a chave dentro da conta reviza-sync (passo anterior).' };
    }
    return { ok: false, erro: 'Este arquivo não é a chave de uma conta de serviço do Google.' };
  }
  const email = typeof o.client_email === 'string' ? o.client_email.trim() : '';
  if (!email || !email.includes('@')) {
    return { ok: false, erro: 'A chave está incompleta: falta o e-mail da conta de serviço. Baixe uma chave nova.' };
  }
  const pk = typeof o.private_key === 'string' ? o.private_key : '';
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pk)) {
    return { ok: false, erro: 'A chave está incompleta: falta a chave privada. Baixe uma chave nova.' };
  }
  const projeto = typeof o.project_id === 'string' && o.project_id.trim() ? o.project_id.trim() : null;
  return { ok: true, email, projeto };
}

/** cada passo está concluído? (sequencial: um passo só conta se os anteriores contam) */
export function passosConcluidos(e: EstadoSync, acessoConfirmado = false): Record<PassoId, boolean> {
  const bruto: Record<PassoId, boolean> = {
    link: !!e.planilha,
    acesso: !!e.conta || acessoConfirmado,
    chave: !!e.conta,
    teste: !!e.teste?.ok,
    conferir: !!e.aplicadaEm && !e.exigeConferencia,
    automatico: e.automatico,
  };
  const out = { ...bruto };
  let anteriores = true;
  for (const p of PASSOS) {
    out[p] = anteriores && bruto[p];
    anteriores = out[p];
  }
  return out;
}

/** Etapa 1 concluída = primeira sincronização aplicada + automático ligado (e tudo antes em ordem) */
export const etapaPlanilhaConcluida = (e: EstadoSync | null | undefined): boolean =>
  !!e && e.modo !== 'indisponivel' && passosConcluidos(e).automatico;

/** a Gestão mostra selo + botão só quando a sincronização existe */
export const syncVisivel = (e: EstadoSync | null | undefined): boolean =>
  !!e && e.modo !== 'indisponivel' && !!e.planilha && !!e.configuradaEm;

export function saudeSync(e: EstadoSync): SaudeSync {
  if (!e.configuradaEm) return 'pendente';
  if (e.freio) return 'freio';
  if (e.exigeConferencia) return 'conferir';
  // a rodada falhou: o bloco de erro já traz o teste — não vira "pausa" junto
  if (e.ultimaRodada?.resultado === 'erro') return 'erro';
  if (!e.teste?.ok) return 'testar';
  if (!e.automatico) return 'desligada';
  return 'ok';
}

/** admin, gestor, cadastro e financeiro gerem a sincronização (mesma lista do papelAprova); comercial não.
    Na prévia, ?papel= força o papel. */
export function podeGerirSync(papel: Papel | null | undefined, gestor?: boolean): boolean {
  const forcado = papelPrevia();
  return forcado ? papelAprova(forcado) : papelAprova(papel, gestor);
}

/* ---------- formatação (Brasília) ---------- */
const TZ = 'America/Sao_Paulo';
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });

/** '14:32' */
export const horaBR = (iso: string): string => fmtHora.format(new Date(iso));
/** '19/10 às 14:32' */
export const dataHoraBR = (iso: string): string => `${fmtDia.format(new Date(iso))} às ${fmtHora.format(new Date(iso))}`;

/** 'agora há pouco' | 'há 1 min' | 'há 12 min' | 'há 2 h' | 'há 3 dias' */
export function haQuanto(iso: string, agora: Date): string {
  const min = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export const fmtInt = (n: number): string => n.toLocaleString('pt-BR');

/* ================= prévia (DEV / demo + querystring) ================= */

type CenarioPrevia = 'vazia' | 'ok' | 'erro' | 'freio';
interface PreviaCfg {
  ativa: boolean;
  cenario: CenarioPrevia;
  /** ?planilha=a…f — começa a Etapa 1 com os passos anteriores prontos */
  passoInicial: PassoId | null;
  /** ?teste=sem-acesso|aba-faltando|localidade — o 1º teste falha assim (o 2º passa) */
  erroTeste: CodigoErroTeste | null;
  papel: Papel | null;
}

const CONFIG_OK = new Set(['admin-planilha-ok', 'admin-whats-ok', 'admin-pago', 'concluida']);
const CONFIG_VALIDOS = new Set(['equipe', 'admin', ...CONFIG_OK]);
const PASSO_POR_LETRA: Record<string, PassoId> = { a: 'link', b: 'acesso', c: 'chave', d: 'teste', e: 'conferir', f: 'automatico' };
const ERRO_POR_PARAM: Record<string, CodigoErroTeste> = { 'sem-acesso': 'sem_acesso', 'aba-faltando': 'aba_faltando', localidade: 'localidade' };
const PAPEIS: readonly Papel[] = ['admin', 'gestor', 'comercial', 'financeiro', 'cadastro'];

let previaCache: PreviaCfg | null = null;
/* Lida UMA vez por carga de página: a navegação do SPA tira a querystring
   da URL e a prévia não pode sumir no meio da sessão. */
function lerPrevia(): PreviaCfg {
  if (previaCache) return previaCache;
  const nada: PreviaCfg = { ativa: false, cenario: 'vazia', passoInicial: null, erroTeste: null, papel: null };
  if (!import.meta.env.DEV && !isDemoMode) return (previaCache = nada);
  let q: URLSearchParams;
  try {
    /* mesma leitura da prévia da configuração: querystring + hash da URL atual; sem
       parâmetro de prévia nela, a URL de quando o app abriu (o redirect
       /cobrancas → /cobrancas/painel descarta a querystring antes desta 1ª leitura) */
    const atual = parametrosPrevia(window.location.search + window.location.hash);
    const temPrevia = (p: URLSearchParams) => p.has('config') || p.has('sync') || p.has('planilha');
    q = temPrevia(atual) ? atual : parametrosPrevia(urlInicialPrevia());
  } catch { return (previaCache = nada); }
  const config = q.get('config');
  const sync = q.get('sync');
  const passo = PASSO_POR_LETRA[(q.get('planilha') ?? '').toLowerCase()] ?? null;
  const configOk = config != null && CONFIG_VALIDOS.has(config);
  const syncOk = sync === 'ok' || sync === 'erro' || sync === 'freio';
  if (!configOk && !syncOk && !passo) return (previaCache = nada);
  const cenario: CenarioPrevia = syncOk ? (sync as CenarioPrevia) : config && CONFIG_OK.has(config) ? 'ok' : 'vazia';
  const pq = q.get('papel') as Papel | null;
  return (previaCache = {
    ativa: true,
    cenario,
    passoInicial: cenario === 'vazia' ? passo : null,
    erroTeste: ERRO_POR_PARAM[q.get('teste') ?? ''] ?? null,
    papel: pq && PAPEIS.includes(pq) ? pq : null,
  });
}

/** prévia ?planilha=c…f: o passo B (só instruções, sem dado no backend) já vem confirmado */
export function acessoConfirmadoPrevia(): boolean {
  const p = lerPrevia();
  return p.ativa && p.passoInicial != null && PASSOS.indexOf(p.passoInicial) > 1;
}

/** a prévia está ativa nesta carga de página? */
export const previaSyncAtiva = (): boolean => lerPrevia().ativa;
/** papel forçado pela prévia (?papel=), ou null */
export const papelPrevia = (): Papel | null => (lerPrevia().ativa ? lerPrevia().papel : null);

/* ---------- dados de exemplo (fictícios — nada de cliente real) ---------- */
const NOMES = ['MARIA', 'JOSÉ', 'ANA', 'JOÃO', 'ANTÔNIO', 'FRANCISCA', 'CARLOS', 'PAULO', 'LÚCIA', 'PEDRO', 'SANDRA', 'LUIZ', 'MARCOS', 'TEREZINHA', 'RAIMUNDO', 'VERA', 'JORGE', 'IVONE', 'ROBERTO', 'NEUSA', 'SÉRGIO', 'CLEUSA', 'VALDIR', 'ROSELI'];
const MEIOS = ['APARECIDA', 'DE FÁTIMA', 'CARLOS', 'HELENA', 'AUGUSTO', 'CRISTINA', 'EDUARDO', 'LUCIA', 'ROBERTO', 'BEATRIZ'];
const SOBRENOMES = ['SILVA', 'SANTOS', 'OLIVEIRA', 'SOUZA', 'PEREIRA', 'LIMA', 'CARVALHO', 'FERREIRA', 'RODRIGUES', 'ALMEIDA', 'COSTA', 'GOMES', 'MARTINS', 'ROCHA', 'RIBEIRO', 'BARBOSA', 'MACHADO', 'MOREIRA'];
const CICLOS = ['D24', 'D25', 'D28', 'D29', 'D30', 'D01', 'D02', 'D05', 'D06', 'D07'];
const COMERCIAIS = ['BRUNA', 'DIEGO', 'PATY', 'RAFAEL'];
const nomeFicticio = (i: number) =>
  `${NOMES[(i * 7) % NOMES.length]} ${MEIOS[(i * 3) % MEIOS.length]} ${SOBRENOMES[(i * 5 + 2) % SOBRENOMES.length]}`;
const reais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const telFicticio = (i: number) => `(51) 9${String(8100 + ((i * 37) % 1900)).padStart(4, '0')}-${String((i * 7919) % 10000).padStart(4, '0')}`;

function grupoExemplo(id: GrupoMudancaId, total: number, base: number): GrupoMudanca {
  const itens: ItemMudanca[] = [];
  for (let i = 0; i < total; i++) {
    const k = base + i;
    const nome = nomeFicticio(k);
    const ciclo = CICLOS[k % CICLOS.length];
    let detalhe = '';
    if (id === 'novos') detalhe = `Entra no ${ciclo} · parcela ${reais(180 + ((k * 13) % 9) * 13)} · comercial ${COMERCIAIS[k % COMERCIAIS.length]}`;
    else if (id === 'ciclo') detalhe = `${ciclo} → ${CICLOS[(k + 3) % CICLOS.length]}`;
    else if (id === 'saem') detalhe = 'Movido para a aba cancelados · histórico preservado';
    else if (id === 'pagamentos') detalhe = `${['ago/26', 'set/26', 'out/26'][k % 3]} · ${reais(45 + ((k * 7) % 12) * 5.5)} · ${ciclo}`;
    else detalhe = telFicticio(k);
    itens.push({ nome, detalhe });
  }
  const R: Record<GrupoMudancaId, [string, string]> = {
    novos: ['clientes novos', 'Entram na cobrança no ciclo indicado na planilha.'],
    ciclo: ['mudaram de ciclo', 'Passam a ser cobrados no novo dia.'],
    saem: ['saem da cobrança', 'Estão na aba cancelados — o histórico fica guardado.'],
    pagamentos: ['pagamentos', 'Valores lançados nas colunas de mês.'],
    telefones: ['telefones', 'Números novos ou corrigidos na coluna TELEFONE.'],
  };
  return { id, rotulo: R[id][0], efeito: R[id][1], total, itens };
}

function conferenciaExemplo(agora: Date): Conferencia {
  const grupos = [
    grupoExemplo('novos', 7, 11),
    grupoExemplo('ciclo', 15, 40),
    grupoExemplo('saem', 13, 90),
    grupoExemplo('pagamentos', 129, 130),
    grupoExemplo('telefones', 498, 300),
  ];
  return { id: `conf-${agora.getTime()}`, geradaEm: agora.toISOString(), grupos, total: grupos.reduce((s, g) => s + g.total, 0) };
}

const EMAIL_EXEMPLO = 'reviza-sync@reviza-planilha.iam.gserviceaccount.com';
const ID_EXEMPLO = '1qZ8xVf3KpR2mT6yWb9nL4cD7hJ0sA5eUoGi-XyBvNw';
const ID_EXEMPLO_2 = '1Hn4bTq7WcZ2vR9kLm3PxD8sYf6aJ0eUgNo-QwErTy';
const NA_HORA_EXEMPLO: AvisoNaHora = {
  url: 'https://exemplo.supabase.co/functions/v1/reviza-planilha-sync?acao=avisar',
  segredo: 'exemplo-7f3a9c2e41d84b6f',
};

function testeOk(agora: Date): ResultadoTeste {
  return {
    ok: true, quando: agora.toISOString(), abas: [...ABAS_OBRIGATORIAS], clientes: 802,
    localidade: { rotulo: 'Brasil', ok: true }, fuso: { rotulo: 'São Paulo (GMT-03:00)', ok: true }, erro: null,
  };
}

function testeComErro(codigo: CodigoErroTeste, agora: Date, email: string): ResultadoTeste {
  const base = { ok: false, quando: agora.toISOString() };
  if (codigo === 'sem_acesso') {
    return {
      ...base, abas: [], clientes: null, localidade: null, fuso: null,
      erro: {
        codigo, titulo: 'A conta do sistema não tem acesso à planilha',
        detalhe: `O Google recusou a leitura: a planilha ainda não foi compartilhada com ${email}, ou foi compartilhada só como Leitor.`,
        correcao: [
          'Na planilha, clique em [[Compartilhar]] (botão no canto superior direito).',
          'Cole o e-mail da conta do sistema e escolha [[Editor]].',
          'Desmarque [[Notificar pessoas]] e clique em [[Compartilhar]].',
          'Volte aqui e clique em Testar de novo.',
        ],
      },
    };
  }
  if (codigo === 'aba_faltando') {
    return {
      ...base, abas: ['CLIENTES MENSAL', 'Página2'], clientes: 802,
      localidade: { rotulo: 'Brasil', ok: true }, fuso: { rotulo: 'São Paulo (GMT-03:00)', ok: true },
      erro: {
        codigo, titulo: 'A aba "cancelados" não foi encontrada',
        detalhe: 'Abas encontradas na planilha: CLIENTES MENSAL, Página2.',
        correcao: [
          'No rodapé da planilha, clique duas vezes no nome da aba que guarda os clientes cancelados.',
          'Renomeie para [[cancelados]], exatamente assim, e aperte Enter.',
          'Se a aba não existir, crie uma (botão + no rodapé) com esse nome e o mesmo cabeçalho da aba CLIENTES MENSAL.',
          'Volte aqui e clique em Testar de novo.',
        ],
      },
    };
  }
  if (codigo === 'localidade') {
    return {
      ...base, abas: [...ABAS_OBRIGATORIAS], clientes: 802,
      localidade: { rotulo: 'Estados Unidos', ok: false }, fuso: { rotulo: 'Nova York (GMT-05:00)', ok: false },
      erro: {
        codigo, titulo: 'A localidade da planilha não é Brasil',
        detalhe: 'Com a localidade Estados Unidos, uma data como 05/10 vira 10 de maio e valores com vírgula são lidos errado.',
        correcao: [
          'Na planilha, abra {Arquivo > Configurações}.',
          'Em [[Localidade]], escolha Brasil. Em [[Fuso horário]], escolha (GMT-03:00) Horário de São Paulo.',
          'Clique em [[Salvar configurações]].',
          'Volte aqui e clique em Testar de novo.',
        ],
      },
    };
  }
  return {
    ...base, abas: [], clientes: null, localidade: null, fuso: null,
    erro: { codigo, titulo: 'Não foi possível ler a planilha', detalhe: 'O Google não respondeu a tempo.', correcao: ['Aguarde um minuto e clique em Testar de novo.'] },
  };
}

function rodada(quando: Date, origem: OrigemRodada, resultado: ResultadoRodada, daPlanilha: number, paraPlanilha: number, mensagem: string | null = null): RodadaSync {
  return { id: `r-${quando.getTime()}-${origem}`, quando: quando.toISOString(), origem, resultado, daPlanilha, paraPlanilha, duracaoMs: 2400 + Math.round((quando.getTime() / 1000) % 1800), mensagem };
}

const MIN = 60_000;
const MSG_SEM_ACESSO = 'Sem acesso à planilha: ela deixou de estar compartilhada com a conta do sistema.';

function estadoVazio(modo: ModoSync): EstadoSync {
  return {
    modo, planilha: null, conta: null, teste: null, conferencia: null, aplicadaEm: null, configuradaEm: null,
    exigeConferencia: false, automatico: false, intervaloMin: 15, naHora: null, ultimaRodada: null, proximaRodada: null,
    log: [], conflitos: [], freio: null,
  };
}

/** estado inativo (modo real sem backend): as telas não renderizam nada */
export const estadoIndisponivel = (): EstadoSync => estadoVazio('indisponivel');

function semearConfigurada(agora: Date, cenario: CenarioPrevia): EstadoSync {
  const t = agora.getTime();
  const ultima = new Date(t - 3 * MIN);
  const log: RodadaSync[] = [];
  const contas: Array<[number, number]> = [[2, 1], [0, 0], [0, 0], [4, 0], [1, 2], [0, 0], [0, 0], [3, 1], [0, 0], [6, 2]];
  contas.forEach(([a, b], i) => {
    const q = new Date(ultima.getTime() - i * 15 * MIN);
    log.push(rodada(q, i === 4 ? 'na_hora' : 'automatica', a + b ? 'ok' : 'sem_mudancas', a, b));
  });
  const aplicada = new Date(t - 2 * 24 * 60 * MIN - 47 * MIN);
  log.push(rodada(aplicada, 'primeira', 'ok', 659, 0, 'Primeira sincronização (conferência aplicada).'));
  const e: EstadoSync = {
    ...estadoVazio('previa'),
    planilha: { id: ID_EXEMPLO, url: `https://docs.google.com/spreadsheets/d/${ID_EXEMPLO}/edit` },
    conta: { email: EMAIL_EXEMPLO, enviadaEm: new Date(aplicada.getTime() - 20 * MIN).toISOString() },
    teste: testeOk(new Date(aplicada.getTime() - 10 * MIN)),
    aplicadaEm: aplicada.toISOString(),
    configuradaEm: aplicada.toISOString(),
    automatico: true,
    naHora: NA_HORA_EXEMPLO,
    ultimaRodada: log[0],
    proximaRodada: new Date(ultima.getTime() + 15 * MIN).toISOString(),
    log,
    conflitos: [
      { id: 'c1', quando: new Date(t - 48 * MIN).toISOString(), cliente: nomeFicticio(3), campo: 'Telefone', valorPlanilha: telFicticio(3), valorSistema: telFicticio(4) },
      { id: 'c2', quando: new Date(t - 5 * 60 * MIN).toISOString(), cliente: nomeFicticio(8), campo: 'Pagamento set/26', valorPlanilha: 'R$ 58,00', valorSistema: 'R$ 116,00' },
      { id: 'c3', quando: new Date(t - 26 * 60 * MIN).toISOString(), cliente: nomeFicticio(15), campo: 'Ciclo', valorPlanilha: 'D05', valorSistema: 'D02' },
    ],
  };
  if (cenario === 'erro') {
    const falha = rodada(new Date(t - 12 * MIN), 'automatica', 'erro', 0, 0, MSG_SEM_ACESSO);
    e.log = [falha, ...log.slice(1)];
    e.ultimaRodada = falha;
  } else if (cenario === 'freio') {
    const pausa = rodada(ultima, 'automatica', 'freio', 0, 0, 'Pausada pelo freio de segurança: 64 clientes sairiam da cobrança de uma vez.');
    e.log = [pausa, ...log.slice(1)];
    e.ultimaRodada = pausa;
    e.freio = {
      detectadoEm: pausa.quando,
      motivo: 'A planilha tiraria 64 clientes da cobrança de uma vez — acima do limite de segurança de 20 por rodada. Pode ser uma exclusão por engano (por exemplo, linhas apagadas ou movidas para a aba errada).',
      grupos: [grupoExemplo('saem', 64, 500), grupoExemplo('pagamentos', 9, 620), grupoExemplo('telefones', 2, 700)],
    };
  }
  return e;
}

function semearParcial(agora: Date, ate: PassoId): EstadoSync {
  const e = estadoVazio('previa');
  const i = PASSOS.indexOf(ate);
  if (i > 0) e.planilha = { id: ID_EXEMPLO, url: `https://docs.google.com/spreadsheets/d/${ID_EXEMPLO}/edit` };
  if (i > 2) e.conta = { email: EMAIL_EXEMPLO, enviadaEm: new Date(agora.getTime() - 4 * MIN).toISOString() };
  if (i > 3) e.teste = testeOk(new Date(agora.getTime() - 2 * MIN));
  if (i > 4) {
    e.aplicadaEm = new Date(agora.getTime() - MIN).toISOString();
    e.configuradaEm = e.aplicadaEm;
    const r = rodada(new Date(agora.getTime() - MIN), 'primeira', 'ok', 662, 0, 'Primeira sincronização (conferência aplicada).');
    e.ultimaRodada = r; e.log = [r];
  }
  return e;
}

/* ---------- store em memória da prévia ---------- */
let store: EstadoSync | null = null;
/** o usuário já mexeu (alguma ação gravou)? a semeadura tardia não pode atropelar */
let tocado = false;
let testesFeitos = 0;
/** prévia ?sync=erro: a falha persiste até um teste passar */
let falhaPendente = false;

function estadoPrevia(): EstadoSync {
  if (store) return store;
  const p = lerPrevia();
  const agora = new Date();
  if (p.cenario === 'vazia') store = p.passoInicial ? semearParcial(agora, p.passoInicial) : estadoVazio('previa');
  else store = semearConfigurada(agora, p.cenario);
  falhaPendente = p.cenario === 'erro';
  return store;
}
const gravar = (e: EstadoSync): EstadoSync => { tocado = true; store = e; return e; };
const espera = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** prévia: o shell diz que a etapa já está concluída (ex.: ?config=admin-whats-ok) mas o store
    nasceu vazio → semeia o estado configurado. Fora da prévia não faz nada. */
export function semearPreviaConcluida(): EstadoSync | null {
  if (!lerPrevia().ativa) return null;
  const atual = estadoPrevia();
  if (tocado || etapaPlanilhaConcluida(atual)) return atual;
  store = semearConfigurada(new Date(), 'ok');
  return store;
}

/** prévia: um .json de exemplo para ver o passo da chave sem ter uma conta Google (null fora da prévia) */
export function chaveExemploPrevia(): string | null {
  if (!lerPrevia().ativa) return null;
  return JSON.stringify({
    type: 'service_account', project_id: 'reviza-planilha', private_key_id: 'exemplo',
    private_key: '-----BEGIN PRIVATE KEY-----\nEXEMPLO-DA-PREVIA\n-----END PRIVATE KEY-----\n',
    client_email: EMAIL_EXEMPLO, client_id: '000000000000000000000',
  });
}
/** prévia: link de exemplo (null fora da prévia) — outro ID quando a de exemplo já está registrada (Trocar planilha) */
export function linkExemploPrevia(): string | null {
  if (!lerPrevia().ativa) return null;
  const id = store?.planilha?.id === ID_EXEMPLO ? ID_EXEMPLO_2 : ID_EXEMPLO;
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`;
}

/* ================= backend real (RPCs mig 71 + edge reviza-planilha-sync) ================= */

const MSG_SYNC_INDISPONIVEL = 'A sincronização com a planilha ainda não está disponível.';

/** sem permissão (comercial, 42501) ou sem o backend (RPC inexistente, PGRST…) → telas inativas */
function ehErroDePermissao(e: { code?: string | null } | null | undefined): boolean {
  const code = typeof e?.code === 'string' ? e.code : '';
  return code === '42501' || code.startsWith('PGRST');
}

/** RPC `sync_estado()` → EstadoSync (chaves camelCase idênticas ao contrato) */
async function buscarEstadoReal(): Promise<EstadoSync> {
  if (!isRevizaMode || !supabase) return estadoIndisponivel();
  const { data, error } = await supabase.rpc('sync_estado');
  if (error) {
    if (ehErroDePermissao(error)) return estadoIndisponivel();
    throw new Error(error.message); // outro erro: a query tenta de novo (react-query)
  }
  return data as EstadoSync;
}

/** RPC que devolve o EstadoSync novo inteiro (link e automático não passam pela edge) */
async function rpcSync(fn: 'sync_link_salvar' | 'sync_automatico', args: Record<string, unknown>): Promise<EstadoSync> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as EstadoSync;
}

/** edge `reviza-planilha-sync?acao=…` no padrão chamarAdmin: a mensagem vem no corpo (error/erro) */
async function invocarSync(acao: string, body: Record<string, unknown>): Promise<EstadoSync> {
  const { data, error } = await supabase!.functions.invoke(`reviza-planilha-sync?acao=${acao}`, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json?.();
      const m = j?.error ?? j?.erro;
      if (m) msg = String(m);
    } catch { /* corpo não-JSON: fica a mensagem original */ }
    throw new Error(msg || 'Não foi possível concluir. Tente de novo.');
  }
  const d = (data ?? null) as Record<string, unknown> | null;
  const errCorpo = d && (d.error ?? d.erro);
  if (errCorpo) throw new Error(String(errCorpo));
  if (!d || typeof d.modo !== 'string') throw new Error('Resposta inesperada do servidor.');
  return d as unknown as EstadoSync;
}

async function chamarReal(acao: string, corpo?: Record<string, unknown>): Promise<EstadoSync> {
  if (!isRevizaMode || !supabase) throw new Error(MSG_SYNC_INDISPONIVEL);
  // RPC direto
  if (acao === 'link') return rpcSync('sync_link_salvar', { p_url: String(corpo?.url ?? '') });
  if (acao === 'automatico') return rpcSync('sync_automatico', { p_ligar: corpo?.ligar === true });
  // edge — a chave da conta de serviço vai SÓ no corpo do POST (nunca a localStorage/sessionStorage/log)
  if (acao === 'chave') return invocarSync('credencial', { chave: corpo?.chave });
  if (acao === 'aplicar') return invocarSync('aplicar', { conferencia: corpo?.conferencia });
  if (acao === 'freio') return invocarSync('agora', { ignorar_freio: true }); // o "Aplicar mesmo assim"
  if (acao === 'testar' || acao === 'conferir' || acao === 'agora') return invocarSync(acao, {});
  throw new Error(MSG_SYNC_INDISPONIVEL);
}

/* ================= API pública (contrato) ================= */

export async function buscarEstadoSync(): Promise<EstadoSync> {
  if (lerPrevia().ativa) return estadoPrevia();
  return buscarEstadoReal();
}

/** registra o link da planilha (valida o formato; troca de planilha depois de configurada exige conferência) */
export async function salvarLink(url: string): Promise<EstadoSync> {
  const r = extrairIdPlanilha(url);
  if (!r.ok) throw new Error(r.erro);
  if (!lerPrevia().ativa) return chamarReal('link', { url: r.url });
  await espera(700);
  const e = estadoPrevia();
  if (e.planilha?.id === r.id) return e;
  const trocou = !!e.configuradaEm;
  return gravar({
    ...e, planilha: { id: r.id, url: r.url }, teste: null, conferencia: null,
    exigeConferencia: trocou, aplicadaEm: trocou ? e.aplicadaEm : null,
    proximaRodada: trocou ? null : e.proximaRodada,
  });
}

/** envia o .json da conta de serviço. O texto NÃO é guardado em lugar nenhum do navegador. */
export async function enviarChave(conteudoJson: string): Promise<EstadoSync> {
  const v = validarChaveLocal(conteudoJson);
  if (!v.ok) throw new Error(v.erro);
  if (!lerPrevia().ativa) return chamarReal('chave', { chave: conteudoJson });
  await espera(900);
  const e = estadoPrevia();
  return gravar({ ...e, conta: { email: v.email, enviadaEm: new Date().toISOString() }, teste: null });
}

/** testa a leitura da planilha com a conta do sistema (o resultado vem em estado.teste — erro de teste NÃO é exceção) */
export async function testar(): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('testar');
  const e0 = estadoPrevia();
  if (!e0.planilha) throw new Error('Informe o link da planilha antes de testar.');
  if (!e0.conta) throw new Error('Envie a chave antes de testar.');
  await espera(1300);
  const e = estadoPrevia();
  const p = lerPrevia();
  const agora = new Date();
  testesFeitos += 1;
  let teste: ResultadoTeste;
  if (testesFeitos === 1 && p.erroTeste) teste = testeComErro(p.erroTeste, agora, e.conta?.email ?? EMAIL_EXEMPLO);
  else if (falhaPendente && testesFeitos === 1) teste = testeComErro('sem_acesso', agora, e.conta?.email ?? EMAIL_EXEMPLO);
  else { teste = testeOk(agora); falhaPendente = false; }
  return gravar({ ...e, teste });
}

/** lê a planilha e compara com o sistema — NADA é gravado até `aplicar` */
export async function conferir(): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('conferir');
  const e0 = estadoPrevia();
  if (!e0.teste?.ok) throw new Error('Teste a conexão antes de conferir as mudanças.');
  await espera(1600);
  return gravar({ ...estadoPrevia(), conferencia: conferenciaExemplo(new Date()) });
}

/** aplica a conferência indicada (a planilha passa a mandar) */
export async function aplicar(conferenciaId: string): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('aplicar', { conferencia: conferenciaId });
  const e0 = estadoPrevia();
  if (!e0.conferencia || e0.conferencia.id !== conferenciaId) throw new Error('A conferência mudou. Confira de novo antes de aplicar.');
  await espera(1800);
  const e = estadoPrevia();
  const agora = new Date();
  const c = e.conferencia as Conferencia;
  const r = rodada(agora, e.configuradaEm ? 'manual' : 'primeira', 'ok', c.total, 0, e.configuradaEm ? 'Conferência da planilha nova aplicada.' : 'Primeira sincronização (conferência aplicada).');
  return gravar({
    ...e, aplicadaEm: agora.toISOString(), configuradaEm: e.configuradaEm ?? agora.toISOString(),
    exigeConferencia: false, conferencia: null, ultimaRodada: r, log: [r, ...e.log],
    proximaRodada: e.automatico ? new Date(agora.getTime() + e.intervaloMin * MIN).toISOString() : null,
  });
}

/** liga/desliga a rodada automática (a cada 15 min) */
export async function ligarAutomatico(ligar: boolean): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('automatico', { ligar });
  const e0 = estadoPrevia();
  if (ligar && (!e0.aplicadaEm || e0.exigeConferencia)) throw new Error('Aplique a conferência antes de ligar o automático.');
  await espera(600);
  const e = estadoPrevia();
  const agora = new Date();
  return gravar({
    ...e, automatico: ligar,
    proximaRodada: ligar ? new Date(agora.getTime() + e.intervaloMin * MIN).toISOString() : null,
    naHora: e.naHora ?? (ligar ? NA_HORA_EXEMPLO : null),
  });
}

/** roda uma sincronização agora (fora do relógio) */
export async function sincronizarAgora(): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('agora');
  const e0 = estadoPrevia();
  if (!e0.configuradaEm) throw new Error('A sincronização ainda não foi configurada.');
  if (e0.exigeConferencia) throw new Error('Confira as mudanças da planilha nova antes de sincronizar.');
  if (e0.freio) throw new Error('Há uma rodada pausada pelo freio de segurança. Confira e aplique antes.');
  if (!e0.teste?.ok) throw new Error('Teste a conexão antes de sincronizar.');
  await espera(1400);
  const e = estadoPrevia();
  const agora = new Date();
  const r = falhaPendente
    ? rodada(agora, 'manual', 'erro', 0, 0, MSG_SEM_ACESSO)
    : rodada(agora, 'manual', 'ok', 2, 1);
  return gravar({
    ...e, ultimaRodada: r, log: [r, ...e.log].slice(0, 40),
    proximaRodada: e.automatico ? new Date(agora.getTime() + e.intervaloMin * MIN).toISOString() : null,
  });
}

/** "Aplicar mesmo assim": libera a rodada pausada pelo freio de segurança */
export async function aplicarFreio(): Promise<EstadoSync> {
  if (!lerPrevia().ativa) return chamarReal('freio');
  const e0 = estadoPrevia();
  if (!e0.freio) return e0;
  await espera(1500);
  const e = estadoPrevia();
  const f = e.freio as FreioSync;
  const agora = new Date();
  const r = rodada(agora, 'manual', 'ok', f.grupos.reduce((s, g) => s + g.total, 0), 0, 'Rodada pausada aplicada manualmente.');
  return gravar({
    ...e, freio: null, ultimaRodada: r, log: [r, ...e.log].slice(0, 40),
    proximaRodada: e.automatico ? new Date(agora.getTime() + e.intervaloMin * MIN).toISOString() : null,
  });
}

/* ================= hooks das telas ================= */

/** estado da sincronização (null enquanto carrega) */
export function useSyncPlanilha() {
  const q = useQuery<EstadoSync>({
    queryKey: chaveSync,
    queryFn: buscarEstadoSync,
    staleTime: 30_000,
  });
  return { estado: q.data ?? null, carregando: q.isLoading };
}

/** envolve uma ação: pendente/erro locais + troca o cache pelo estado devolvido */
export function useAcaoSync<A extends unknown[]>(fn: (...args: A) => Promise<EstadoSync>) {
  const qc = useQueryClient();
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar = useCallback(async (...args: A): Promise<EstadoSync | null> => {
    setPendente(true); setErro(null);
    try {
      const e = await fn(...args);
      qc.setQueryData(chaveSync, e);
      return e;
    } catch (x) {
      setErro(x instanceof Error && x.message ? x.message : 'Não foi possível concluir. Tente de novo.');
      return null;
    } finally {
      setPendente(false);
    }
  }, [fn, qc]);
  const limparErro = useCallback(() => setErro(null), []);
  return { executar, pendente, erro, limparErro };
}
