/* ============================================================================
   Fila da Iris — de onde vêm os dados. A mesma tela nos três jeitos:
   - local: demonstração (clientes fictícios) e prévia (foto dos dados de hoje); marcações na página;
   - real: o banco (fonteReal.ts). Este arquivo não fala com o banco (a prévia em HTML usa só ele).
   ============================================================================ */
import { useEffect, useMemo, useState } from 'react';
import type { Marca, TipoMarca } from './dados';
import { textosDoLead, type Lead } from './lead';
import { registrarFilaLocal, useDonosLocais } from './recados';

export type Periodo = 'hoje' | '7d' | 'mes' | 'mes_ant';
export interface NumeroAtendente { atendente: string; recebidos: number; fechados: number; /** marcações feitas no período (fila_iris_marcacoes_numeros) */ marcacoes?: number }

export interface FonteFila {
  modo: 'demo' | 'previa' | 'real';
  /** o que aparece ao lado do título ("Prévia · dados de hoje", "Demonstração"…) */
  rotulo: string;
  carregando: boolean;
  erro: string | null;
  leads: Lead[];
  marcar: (id: string, tipo: TipoMarca, texto?: string) => void;
  tirarMarca: (id: string, marcaId: string) => void;
  /** correção manual da leitura dos documentos (null = volta ao automático) */
  corrigirDocs: (id: string, estado: 'completos' | 'incompletos' | null) => void;
  tirarDaFila: (id: string) => void;
  numeros: (p: Periodo) => NumeroAtendente[] | null;
  /** relê a fila agora (o real; local não precisa) — o "Ver na fila" do aviso da Iris pede a fila fresca */
  recarregar?: () => Promise<void>;
  /** a conversa com o cliente na ficha (dono 12/11: "aqui eu quero que apareça a conversa com o cliente"). É um
      GANCHO no real (lê o histórico como o WhatsApp); na demonstração/prévia, uma conversa de exemplo */
  usarConversa?: (l: Lead) => ConversaFicha;
}

/** uma mensagem da conversa, como a ficha mostra */
export interface MensagemFicha {
  id: string;
  dir: 'in' | 'out';
  texto: string;
  /** texto | imagem | audio | video | documento */
  tipo: string;
  em: number;
  /** a nossa: veio da IA (robô/Iris) ou do celular */
  quem?: 'ia' | 'celular';
  transcricao?: string;
}
export interface ConversaFicha { mensagens: MensagemFicha[] | null; carregando: boolean; erro: string | null; exemplo?: 'demo' | 'previa' }

/** a conversa de EXEMPLO da demonstração e da prévia (no real são as mensagens de verdade): o caminho de sempre
    (a Iris abre, o cliente responde, os documentos) e termina na última mensagem do cliente que a fila conhece */
export function conversaDeExemplo(l: Lead, modo: 'demo' | 'previa'): ConversaFicha {
  const fim = l.ud ?? l.nu ?? Date.now() - 60 * 60_000;
  const t = (min: number) => fim - min * 60_000;
  const nome = l.nome.split(/\s+/)[0] ?? '';
  const m: MensagemFicha[] = [
    { id: 'e1', dir: 'out', quem: 'ia', tipo: 'texto', em: t(180), texto: `Olá${nome ? `, ${nome}` : ''}! Aqui é a Iris, da CAF. Vi que você pediu informações sobre o seu benefício. Posso te ajudar?` },
    { id: 'e2', dir: 'in', tipo: 'texto', em: t(170), texto: 'Oi, pode sim' },
    { id: 'e3', dir: 'out', quem: 'ia', tipo: 'texto', em: t(165), texto: 'Para começar, me mande uma foto do seu documento com foto (frente e verso) e um comprovante de residência.' },
  ];
  if (l.cat === 'quente' || l.cat === 'documentacao' || l.docPessoal) m.push({ id: 'e4', dir: 'in', tipo: 'imagem', em: t(120), texto: 'Imagem' });
  if (l.cat === 'quente') m.push({ id: 'e5', dir: 'in', tipo: 'imagem', em: t(110), texto: 'Imagem' }, { id: 'e6', dir: 'out', quem: 'ia', tipo: 'texto', em: t(100), texto: 'Recebi tudo, obrigado! Já passei para o seu atendente seguir com você.' });
  if (l.cat === 'documentacao') m.push({ id: 'e5', dir: 'out', quem: 'ia', tipo: 'texto', em: t(100), texto: 'Recebi o documento. Falta só o comprovante de residência para seguir.' });
  if (l.cat === 'sem_resposta') m.push({ id: 'e5', dir: 'out', quem: 'ia', tipo: 'texto', em: t(60), texto: 'Oi! Conseguiu separar os documentos? Estou aqui para te ajudar.' });
  /* a última mensagem do cliente que a fila conhece (texto ou "[audio]"/"[imagem]"…) fecha a conversa */
  const disse = l.disse.replace(/\s+/g, ' ').trim();
  const midia = disse.match(/^\[(\w+)\]$/);
  if (midia) m.push({ id: 'e9', dir: 'in', tipo: midia[1] === 'image' ? 'imagem' : midia[1], em: fim, texto: '' });
  else if (disse) m.push({ id: 'e9', dir: 'in', tipo: 'texto', em: fim, texto: disse });
  return { mensagens: m.sort((a, b) => a.em - b.em), carregando: false, erro: null, exemplo: modo };
}

/** começo do período (horário de Brasília). Mês = o mês da casa, do dia 11 ao dia 10 (regra do placar do CAF). */
export function inicioPeriodo(p: Periodo, agora = new Date()): Date {
  const d = new Date(agora);
  if (p === '7d') return new Date(agora.getTime() - 7 * 86_400_000);
  d.setHours(0, 0, 0, 0);
  if (p === 'hoje') return d;
  if (d.getDate() < 11) d.setMonth(d.getMonth() - 1);
  d.setDate(11);
  if (p === 'mes_ant') d.setMonth(d.getMonth() - 1);
  return d;
}

/** fim do período: agora; o mês passado termina onde o mês atual começa */
export function fimPeriodo(p: Periodo, agora = new Date()): Date {
  return p === 'mes_ant' ? inicioPeriodo('mes', agora) : new Date(agora.getTime() + 60_000);
}

/** "11/10 a 10/11", "11/11 até agora"… para a nota dos números */
export function textoPeriodo(p: Periodo, agora = new Date()): string {
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (p === 'hoje') return `hoje, ${dm(agora)}`;
  if (p === '7d') return 'últimos 7 dias';
  const ini = inicioPeriodo(p, agora);
  if (p === 'mes') return `mês da casa, ${dm(ini)} até hoje`;
  const fim = new Date(inicioPeriodo('mes', agora).getTime() - 86_400_000);
  return `mês da casa, ${dm(ini)} a ${dm(fim)}`;
}

/* recalcula a categoria e os textos quando o atendente corrige a documentação (só no modo local) */
function comDocs(l: Lead, estado: 'completos' | 'incompletos' | null): Lead {
  const docsManual = estado ?? undefined;
  const automatico = l.docPessoal && l.comprovante ? 'quente' : 'documentacao';
  const cat = l.cat === 'historico' || l.cat === 'sem_resposta' && !estado ? l.cat
    : docsManual === 'completos' ? 'quente' : docsManual === 'incompletos' ? 'documentacao' : automatico;
  const [situacao, curta] = textosDoLead({ ...l, cat, docsManual });
  return { ...l, cat, docsManual, lista: cat === 'quente' ? 1 : cat === 'documentacao' ? 3 : l.lista, situacao, curta };
}

/* ---------------------------------------------------------------- local (demonstração e prévia) */
export function useFonteLocal(inicial: Lead[], modo: 'demo' | 'previa', rotulo: string, numeros?: Partial<Record<Periodo, NumeroAtendente[]>>): FonteFila {
  const [leads, setLeads] = useState<Lead[]>(inicial);
  const mexer = (id: string, f: (l: Lead) => Lead | null) => setLeads((t) => t.flatMap((l) => {
    if (l.id !== id) return [l];
    const n = f(l);
    return n ? [n] : [];
  }));
  /* o recado do administrador da demonstração: o repasse troca o dono (a loja guarda; vale ao voltar para a página)
     e a loja consulta o dono/prioridade de agora — o último retrato fica valendo em qualquer página */
  const donos = useDonosLocais();
  const comDono = useMemo(() => (Object.keys(donos).length
    ? leads.map((l) => (donos[l.id] && donos[l.id] !== l.atendente ? { ...l, atendente: donos[l.id] } : l)) : leads), [leads, donos]);
  useEffect(() => {
    const retrato = new Map(comDono.map((l) => [l.id, { dono: l.atendente, cat: l.cat }]));
    registrarFilaLocal((id) => retrato.get(id) ?? null);
  }, [comDono]);
  return useMemo<FonteFila>(() => ({
    modo, rotulo, carregando: false, erro: null, leads: comDono,
    marcar: (id, tipo, texto) => mexer(id, (l) => {
      const agora = Date.now();
      if (tipo === 'nao_atendeu') {
        const ja = l.marcas.find((m) => m.tipo === 'nao_atendeu');
        const nova: Marca = ja ? { ...ja, vezes: (ja.vezes ?? 1) + 1, em: agora } : { id: `m${agora}`, tipo, vezes: 1, em: agora };
        return { ...l, marcas: [nova, ...l.marcas.filter((m) => m.tipo !== 'nao_atendeu')] };
      }
      if (tipo !== 'falta' && l.marcas.some((m) => m.tipo === tipo)) return l;
      return { ...l, marcas: [{ id: `m${agora}`, tipo, texto, em: agora }, ...l.marcas] };
    }),
    tirarMarca: (id, mid) => mexer(id, (l) => ({ ...l, marcas: l.marcas.filter((m) => m.id !== mid) })),
    corrigirDocs: (id, estado) => mexer(id, (l) => comDocs(l, estado)),
    tirarDaFila: (id) => mexer(id, () => null),
    numeros: (p) => numeros?.[p] ?? null,
    usarConversa: (l) => conversaDeExemplo(l, modo),
  }), [comDono, modo, rotulo, numeros]);
}
