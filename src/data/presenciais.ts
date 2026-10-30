import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Presenciais (pedido do dono 29/10): atendimento presencial marcado num
   calendário. Marcar avisa o grupo DOCUMENTOS CLIENTES CAF e põe o card em
   "Reunião Marcada"; no dia, às 8h, sai o lembrete. Quem manda é o banco
   (presencial_marcar / _remarcar / _desmarcar + fila presenciais_avisos).

   TEXTOS aprovados pelo dono em 29/10 — a fonte é o banco (presencial_texto);
   estas funções só montam a PRÉVIA da tela e o modo demonstração, com a
   mesma regra (testado em presenciais.test.ts com as saídas do banco).
   ------------------------------------------------------------------ */

export const PRES_REAL = isSupabaseConfigured && !!supabase;
const TZ = 'America/Sao_Paulo';

export type StatusPresencial = 'marcado' | 'desmarcado';
/** Situação do último aviso no grupo: pendente (na fila), enviado, incerto, falhou, bloqueado. */
export type StatusAviso = 'pendente' | 'enviando' | 'enviado' | 'incerto' | 'falhou' | 'bloqueado' | null;

export interface Presencial {
  id: string;
  contatoId: string;
  clienteNome: string;
  telefone: string | null;
  quando: string;              // ISO
  observacao: string | null;
  status: StatusPresencial;
  marcadoPor: string | null;   // nome
  conversaId: string | null;
  aviso: StatusAviso;
}

/* ---------- textos (prévia; a fonte é o banco) ---------- */

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function partesSP(iso: string): { a: number; m: number; d: number; h: number; min: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { a: v('year'), m: v('month'), d: v('day'), h: v('hour'), min: v('minute') };
}
const dd = (n: number) => String(n).padStart(2, '0');

/** "14h" / "16h30" */
export function horaTxt(iso: string): string {
  const { h, min } = partesSP(iso);
  return `${h}h${min ? dd(min) : ''}`;
}
/** "sexta, 30/10" */
export function diaTxt(iso: string): string {
  const { a, m, d } = partesSP(iso);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${dd(d)}/${dd(m)}`;
}
/** "na sexta, 30/10" / "no sábado, 31/10" */
export function naTxt(iso: string): string {
  const { a, m, d } = partesSP(iso);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${dow === 0 || dow === 6 ? 'no' : 'na'} ${diaTxt(iso)}`;
}

export function textoPresencial(tipo: 'marcado' | 'remarcado' | 'desmarcado', nome: string, quando: string, quem: string): string {
  if (tipo === 'marcado') {
    return `📅 *PRESENCIAL MARCADO*\n${nome} foi marcado para atendimento presencial ${naTxt(quando)}, às ${horaTxt(quando)}.\n`
      + `Marcado por ${quem}. No dia, aviso aqui de novo.`;
  }
  if (tipo === 'remarcado') {
    return `🔁 *PRESENCIAL REMARCADO*\n${nome} passou para ${diaTxt(quando)}, às ${horaTxt(quando)}.\nRemarcado por ${quem}.`;
  }
  return `❌ *PRESENCIAL DESMARCADO*\nO atendimento de ${nome} ${naTxt(quando)}, às ${horaTxt(quando)} foi desmarcado por ${quem}.`;
}

export function textoLembrete(itens: { quando: string; nome: string; quem: string }[]): string | null {
  if (!itens.length) return null;
  const linhas = [...itens].sort((x, y) => x.quando.localeCompare(y.quando) || x.nome.localeCompare(y.nome))
    .map((i) => `${horaTxt(i.quando)} · ${i.nome} · marcado por ${i.quem}`);
  return `📍 *HOJE TEM PRESENCIAL*\n${linhas.join('\n')}\nNão se esqueçam!`;
}

/** Dia (YYYY-MM-DD) em São Paulo. */
export function diaSP(iso: string): string {
  const { a, m, d } = partesSP(iso);
  return `${a}-${dd(m)}-${dd(d)}`;
}
/** Data + hora digitadas na tela (horário de São Paulo, UTC-3 sem horário de verão) → ISO. */
export function instanteSP(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

/** Erro do banco → frase para a equipe. */
export function erroPresencial(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('presencial_ja_marcado')) return 'Este cliente já tem um presencial marcado. Use "Remarcar" nele.';
  if (m.includes('presencial_no_passado')) return 'Escolha um dia e horário que ainda não passaram.';
  if (m.includes('presencial_longe_demais')) return 'A data está longe demais. Marque no máximo para daqui a um ano.';
  if (m.includes('presencial_desmarcado')) return 'Este presencial já foi desmarcado.';
  if (m.includes('contato_nao_encontrado')) return 'Cliente não encontrado.';
  if (m.includes('sem_permissao')) return 'Você não tem permissão para isso.';
  return msg || 'Não deu certo. Tente de novo.';
}

/* ---------- banco ---------- */

interface DbPresencial {
  id: string; contato_id: string; cliente_nome: string; telefone: string | null; quando: string;
  observacao: string | null; status: StatusPresencial; marcado_por: string | null; conversa_id: string | null; aviso: StatusAviso;
}

export function usePresenciais(iniISO: string, fimISO: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['presenciais', currentOrg.id, iniISO, fimISO],
    enabled: PRES_REAL,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Presencial[]> => {
      const { data, error } = await supabase!.rpc('presenciais_periodo', { p_org: currentOrg.id, p_ini: iniISO, p_fim: fimISO });
      if (error) throw new Error(error.message);
      return ((data ?? []) as DbPresencial[]).map((r) => ({
        id: r.id, contatoId: r.contato_id, clienteNome: r.cliente_nome, telefone: r.telefone, quando: r.quando,
        observacao: r.observacao, status: r.status, marcadoPor: r.marcado_por, conversaId: r.conversa_id, aviso: r.aviso,
      }));
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['presenciais'] });
    qc.invalidateQueries({ queryKey: ['kanban-leads'] }); // o card vai para "Reunião Marcada"
  };
}

export function useMarcarPresencial() {
  const { currentOrg } = useOrg();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { contatoId: string; quando: string; observacao: string }) => {
      const { error } = await supabase!.rpc('presencial_marcar', {
        p_org: currentOrg.id, p_contato: a.contatoId, p_quando: a.quando, p_observacao: a.observacao || null,
      });
      if (error) throw new Error(erroPresencial(error.message));
    },
    onSuccess: invalidar,
  });
}

export function useRemarcarPresencial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (a: { id: string; quando: string }) => {
      const { error } = await supabase!.rpc('presencial_remarcar', { p_id: a.id, p_quando: a.quando });
      if (error) throw new Error(erroPresencial(error.message));
    },
    onSuccess: invalidar,
  });
}

export function useDesmarcarPresencial() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('presencial_desmarcar', { p_id: id });
      if (error) throw new Error(erroPresencial(error.message));
    },
    onSuccess: invalidar,
  });
}
