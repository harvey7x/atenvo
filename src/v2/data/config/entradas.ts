/* RECEBER DE OUTROS SISTEMAS (dono 23/11 — a URA). Cada ENTRADA é um endereço com uma chave secreta: o sistema
   de fora chama o endereço com telefone, nome e mensagem e aqui isso vira conversa no número de WhatsApp do
   Atendimento escolhido e lead em LEAD NOVO (servidor: migration 94 + função entrada-webhook).
   Só o administrador vê e mexe. Na prévia tudo fica no navegador e o "Testar" é simulado.
   FORMATO DA URA REVERSA (Telein, vídeo do dono 24/11): a Telein chama o endereço por GET com os dados no próprio
   endereço — enderecoTelein() monta o endereço já com os marcadores dela para colar na campanha. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isPrevia, isRevizaMode, supabase } from '@/lib/supabase';
import { temRecurso } from './recursos';

export interface Entrada {
  id: string; nome: string; chave: string; canalId: string | null; ativo: boolean;
  /** só estas teclas viram lead; vazio = qualquer uma */
  opcoes: string[];
  criadoEm: string; ultimoEventoEm: string | null; totalEventos: number;
}
export type ResultadoEvento = 'ok' | 'teste' | 'ignorada' | 'sem_telefone' | 'desligada' | 'sem_numero' | 'erro';
export interface EventoEntrada {
  id: number; entradaId: string; recebidoEm: string; resultado: ResultadoEvento;
  telefone: string | null; nome: string | null; mensagem: string | null; detalhe: string | null; conversaId: string | null;
}

const CHAVE = ['reviza', 'entradas'] as const;
const CHAVE_EV = ['reviza', 'entradas', 'eventos'] as const;
const ligado = () => isRevizaMode && !!supabase && temRecurso('atendimento');
const BASE = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/entrada-webhook`;
/** o endereço que o outro sistema chama (na prévia, um endereço de exemplo) */
export const enderecoDaEntrada = (chave: string) => (isPrevia ? `https://seu-projeto.supabase.co/functions/v1/entrada-webhook/${chave}` : `${BASE}/${chave}`);
/** os marcadores da Telein: ela troca cada *marcador* pelo dado do cliente quando chama o endereço */
export const MARCADORES_TELEIN = 'nome=*nome*&telefone=*numero*&mailing=*mailing*&campanha=*campanha*&opcao=*opcao*&email=*email*&endereco=*endereco*&cidade=*cidade*';
/** o endereço pronto para colar em "Executar ao selecionar uma opção" da campanha da Telein */
export const enderecoTelein = (chave: string) => `${enderecoDaEntrada(chave)}?${MARCADORES_TELEIN}`;
/** "1, 2" → ['1', '2'] (só dígitos, sem repetir) */
export const lerTeclas = (t: string): string[] => [...new Set((t.match(/\d/g) ?? []))];
const hexAleatorio = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

const lerEntrada = (r: Record<string, unknown>): Entrada => ({
  id: String(r.id), nome: String(r.nome ?? ''), chave: String(r.chave ?? ''), canalId: r.canal_id ? String(r.canal_id) : null, ativo: r.ativo !== false,
  opcoes: Array.isArray(r.opcoes) ? (r.opcoes as unknown[]).map(String) : [],
  criadoEm: String(r.criado_em ?? ''), ultimoEventoEm: r.ultimo_evento_em ? String(r.ultimo_evento_em) : null, totalEventos: Number(r.total_eventos ?? 0),
});
const lerEvento = (r: Record<string, unknown>): EventoEntrada => ({
  id: Number(r.id), entradaId: String(r.entrada_id), recebidoEm: String(r.recebido_em ?? ''), resultado: (r.resultado as ResultadoEvento) ?? 'erro',
  telefone: (r.telefone as string) ?? null, nome: (r.nome as string) ?? null, mensagem: (r.mensagem as string) ?? null,
  detalhe: (r.detalhe as string) ?? null, conversaId: (r.conversa_id as string) ?? null,
});

export function useEntradas() {
  return useQuery({
    queryKey: CHAVE, enabled: ligado(), staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('atd_entradas').select('*').order('criado_em', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(lerEntrada);
    },
  });
}
export function useEventosEntradas() {
  return useQuery({
    queryKey: CHAVE_EV, enabled: ligado(), refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('atd_entrada_eventos')
        .select('id, entrada_id, recebido_em, resultado, telefone, nome, mensagem, detalhe, conversa_id')
        .order('recebido_em', { ascending: false }).limit(40);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(lerEvento);
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: CHAVE }); void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); };
}
/** na prévia o banco não tem gatilho: a tela escreve o registro */
function registrarNaPrevia(acao: string, rotulo: string, detalhe: string) {
  if (!isPrevia || !supabase) return;
  void supabase.from('registros').insert({ acao, entidade: 'integração', rotulo, detalhe, mudancas: [] }).then(() => undefined);
}

export function useCriarEntrada() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (a: { nome: string; canalId: string; opcoes?: string[] }) => {
      const nome = a.nome.trim().replace(/\s+/g, ' ');
      if (nome.length < 2) throw new Error('Dê um nome (ex.: URA).');
      if (!a.canalId) throw new Error('Escolha o número de WhatsApp que vai atender.');
      const linha = { nome, canal_id: a.canalId, opcoes: a.opcoes && a.opcoes.length ? a.opcoes : null, ...(isPrevia ? { chave: hexAleatorio(24), ativo: true, total_eventos: 0, ultimo_evento_em: null } : {}) };
      const { data, error } = await supabase!.from('atd_entradas').insert(linha).select('*').single();
      if (error) throw new Error(error.message);
      registrarNaPrevia('criou', nome, 'endereço para receber de outros sistemas');
      return lerEntrada(data as Record<string, unknown>);
    },
    onSuccess: inv,
  });
}
export function useAlterarEntrada() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (a: { entrada: Entrada; ativo?: boolean; canalId?: string }) => {
      const mud: Record<string, unknown> = {};
      if (a.ativo !== undefined) mud.ativo = a.ativo;
      if (a.canalId !== undefined) mud.canal_id = a.canalId;
      const { error } = await supabase!.from('atd_entradas').update(mud).eq('id', a.entrada.id);
      if (error) throw new Error(error.message);
      registrarNaPrevia('alterou', a.entrada.nome, a.ativo !== undefined ? (a.ativo ? 'ligou o recebimento' : 'desligou o recebimento') : 'mudou o número');
    },
    onSuccess: inv,
  });
}
export function useExcluirEntrada() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (e: Entrada) => {
      const { error } = await supabase!.from('atd_entradas').delete().eq('id', e.id);
      if (error) throw new Error(error.message);
      registrarNaPrevia('excluiu', e.nome, 'endereço para receber de outros sistemas');
    },
    onSuccess: inv,
  });
}

/** um envio de exemplo no formato da Telein (o "Testar" manda este, sem criar nada) */
export const EXEMPLO_ENVIO = { nome: 'Maria da Silva', telefone: '5551999990000', mailing: 'teste', campanha: 'teste do Atenvo', opcao: '1', email: '', endereco: '', cidade: '' };
/** manda um envio de TESTE ao endereço: o servidor confere a chave e lê os campos, mas não cria nada */
export function useTestarEntrada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Entrada): Promise<{ ok: boolean; erro?: string; telefone?: string }> => {
      if (isPrevia) {
        await new Promise((r) => setTimeout(r, 500));
        const ok = e.ativo && (!e.opcoes.length || e.opcoes.includes(EXEMPLO_ENVIO.opcao));
        await supabase!.from('atd_entrada_eventos').insert({
          id: Date.now(), entrada_id: e.id, recebido_em: new Date().toISOString(), resultado: ok ? 'teste' : 'desligada',
          telefone: EXEMPLO_ENVIO.telefone, nome: EXEMPLO_ENVIO.nome, mensagem: null, detalhe: ok ? 'teste: lido, nada foi criado · campanha teste do Atenvo · mailing teste · apertou 1' : 'o recebimento está desligado', conversa_id: null,
        });
        return ok ? { ok: true, telefone: EXEMPLO_ENVIO.telefone } : { ok: false, erro: 'desligada' };
      }
      // como a Telein faz: GET com os dados no endereço
      const r = await fetch(`${enderecoDaEntrada(e.chave)}?${new URLSearchParams({ ...EXEMPLO_ENVIO, teste: '1' })}`, { method: 'GET' });
      return (await r.json().catch(() => ({ ok: false, erro: `resposta ${r.status}` }))) as { ok: boolean; erro?: string; telefone?: string };
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CHAVE_EV }); void qc.invalidateQueries({ queryKey: CHAVE }); },
  });
}
