/* AMBIENTES da Reviza (dono 11/11): o sistema tem dois — Cobranças (a Reviza de sempre) e
   Atendimento (o Atenvo dentro da Reviza). "Nem todo mundo vai ter acesso ao atendimento, e nem
   todo mundo do atendimento vai ter acesso a cobranças": cada usuário tem a lista de ambientes que
   enxerga (profiles.modulos), e o seletor do topo da barra lateral só mostra esses.
   Regras fixas por papel (a lista gravada só vale para os demais):
   - Administrador: os dois, sempre (é quem gerencia os usuários dos dois lados);
   - Atendente: só o Atendimento (não tem papel na cobrança);
   - Gestor, Financeiro, Comercial, Cadastro: o que o administrador marcar — sem nada marcado
     (contas de antes dos ambientes), Cobranças. */

import { temRecurso } from './config/recursos';
export type Ambiente = 'cobrancas' | 'atendimento';
export const AMBIENTES: readonly Ambiente[] = ['cobrancas', 'atendimento'];
export const ROTULO_AMBIENTE: Record<Ambiente, string> = { cobrancas: 'Cobranças', atendimento: 'Atendimento' };

const ehAmbiente = (m: unknown): m is Ambiente => m === 'cobrancas' || m === 'atendimento';

/** papéis cujo acesso é fixo (o administrador não escolhe) */
export function ambientesFixos(papel: string | null | undefined): Ambiente[] | null {
  if (papel === 'admin') return ['cobrancas', 'atendimento'];
  if (papel === 'atendente') return ['atendimento'];
  return null;
}

/** os ambientes que um usuário enxerga, a partir do papel e da lista gravada no perfil */
/** sem o Atendimento no servidor desta instalação, ninguém recebe esse ambiente (ver config/recursos.ts) */
const soOQueExiste = (l: Ambiente[]): Ambiente[] => {
  if (temRecurso('atendimento')) return l;
  const f = l.filter((a) => a !== 'atendimento');
  return f.length ? f : ['cobrancas'];
};
export function ambientesDoPerfil(papel: string | null | undefined, modulos: unknown): Ambiente[] {
  return soOQueExiste(ambientesCadastrados(papel, modulos));
}
/** os ambientes GRAVADOS no perfil, mesmo o que esta instalação ainda não tem ligado (23/11): é o que vale
    nas listas de gente (quem é das Cobranças, quem pode entrar numa equipe) e na tela de Usuários.
    ambientesDoPerfil é o que a pessoa consegue abrir HOJE. */
export function ambientesCadastrados(papel: string | null | undefined, modulos: unknown): Ambiente[] {
  const fixos = ambientesFixos(papel);
  if (fixos) return fixos;
  const lista = Array.isArray(modulos) ? AMBIENTES.filter((a) => (modulos as unknown[]).some((m) => ehAmbiente(m) && m === a)) : [];
  return lista.length ? lista : ['cobrancas'];
}

/** liga/desliga um ambiente na lista (nunca deixa vazia: sem nenhum, a pessoa não entraria em nada) */
export function alternarAmbiente(atual: readonly Ambiente[], a: Ambiente): Ambiente[] {
  const tem = atual.includes(a);
  const prox = tem ? atual.filter((x) => x !== a) : [...atual, a];
  return prox.length ? AMBIENTES.filter((x) => prox.includes(x)) : [...atual];
}

/* Telas do Atendimento na Reviza (dono 11/11: "Eu só vou querer WhatsApp, presenciais, script, Kanban,
   dashboard, unificador de documentos, conversor de arquivos e coletor do INSS" — e Configurações, onde
   ficam os usuários). Lista do que ENTRA, não do que sai: qualquer outra tela do Atenvo aberta pela URL
   volta ao WhatsApp (Pendências, Painel da Equipe e Central de Avisos inclusive — "não vou querer").
   Integrações fica sem item no menu: é por ela que Configurações → Canais e o "Conectar número…" do
   WhatsApp ligam os números. A raiz ('/') passa: ela mesma manda para o início do ambiente. */
export const ROTAS_ATENDIMENTO = ['/whatsapp', '/pos-venda', '/presenciais', '/scripts', '/kanban', '/dashboard', '/ferramentas', '/configuracoes', '/integracoes'] as const;
export const rotaAtendimentoPermitida = (pathname: string) =>
  pathname === '/' || ROTAS_ATENDIMENTO.some((r) => pathname === r || pathname.startsWith(`${r}/`));
