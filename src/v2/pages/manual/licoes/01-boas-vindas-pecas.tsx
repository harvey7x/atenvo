/* Lição 1 — ilustrações e atividades próprias (prefixo mv-bv-): sumário,
   "como funciona", financeiras, quem faz o quê, de quem é a tarefa, trilha do
   manual, consulta rápida, simulador da nota, caminho do cliente, conversas em
   paralelo, valores e regras de ouro. Só tokens do tema (claro e escuro).
   Números da prova vêm de tipos.ts; títulos e resumos das lições vêm de LICOES,
   lido só na hora de renderizar (index.ts importa esta lição: import circular). */
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Aviso, IcCheck, IcX, Lista } from '../pecas';
import { MODULOS, NOTA_MINIMA_PCT, PERGUNTAS_POR_PROVA, type ModuloId } from '../tipos';
import { LICOES } from '.';

/* ------------------------------------------------------------ números da prova (nunca fixos no texto) */
/** Menor número de acertos que chega à nota mínima, com o mesmo arredondamento da prova. */
function minimoAcertos(total: number, pct: number) {
  for (let a = 0; a <= total; a++) if (Math.round((a / total) * 100) >= pct) return a;
  return total;
}
export const PROVA = {
  total: PERGUNTAS_POR_PROVA,
  pct: NOTA_MINIMA_PCT,
  minimo: minimoAcertos(PERGUNTAS_POR_PROVA, NOTA_MINIMA_PCT),
} as const;
/** Nota (em %) com `acertos` certas na prova. */
export const notaDe = (acertos: number) => Math.round((acertos / PROVA.total) * 100);

/** Quantidade de lições da trilha (lida na hora de renderizar). */
export function QtdLicoes() {
  return <>{LICOES.length}</>;
}

/* ------------------------------------------------------------ módulos da trilha (lista) */
const DESC_MODULO: Record<ModuloId, string> = {
  fundamentos: 'a empresa, o consignado e os juros abusivos, e quem é o nosso cliente.',
  venda: 'os dois canais, o primeiro contato, como converter, objeções e follow-up.',
  documentacao: 'Meu INSS, gov.br (imposto de renda e CPF) e documentos pessoais.',
  fechamento: 'cadastro, procurações e assinatura; segurança, ética e LGPD.',
};
/** "lição 3", "lições 13 e 14" ou "lições 1 a 4". */
function faixaLicoes(nums: number[]) {
  if (nums.length === 1) return `lição ${nums[0]}`;
  if (nums.length === 2) return `lições ${nums[0]} e ${nums[1]}`;
  return `lições ${nums[0]} a ${nums[nums.length - 1]}`;
}
/** Os módulos com as lições de cada um, contados a partir de LICOES. */
export function ModulosDaTrilha() {
  const itens = MODULOS.map((mod, mi) => {
    const nums = LICOES.flatMap((l, k) => (l.modulo === mod.id ? [k + 1] : []));
    return (
      <>
        <b>Módulo {mi + 1} · {mod.titulo}</b>{nums.length ? ` (${faixaLicoes(nums)})` : ''}: {DESC_MODULO[mod.id]}
      </>
    );
  });
  return <Lista itens={itens} />;
}

/** Aviso verde que aponta para a lição seguinte a esta, com o título dela. */
export function ProximaLicao({ children }: { children: ReactNode }) {
  const k = LICOES.findIndex((l) => l.id === 'boas-vindas');
  const prox = k >= 0 ? LICOES[k + 1] : undefined;
  return <Aviso tom="verde" titulo={prox ? `Próxima lição: ${prox.titulo}` : 'Próxima lição'}>{children}</Aviso>;
}

/** ids das seções da lição (o sumário rola até elas). */
export const SEC = {
  caf: 'bv-caf',
  papel: 'bv-papel',
  mapa: 'bv-mapa',
  estudar: 'bv-estudar',
  caminho: 'bv-caminho',
  dia: 'bv-dia',
  valores: 'bv-valores',
  regras: 'bv-regras',
  resumo: 'bv-resumo',
} as const;

/* ------------------------------------------------------------ ícones */
const Ic = ({ children, t = 20 }: { children: ReactNode; t?: number }) => (
  <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const IcMoeda = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M14.6 9.3c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.7.8-2.7 1.9s1.1 1.7 2.7 2.1 2.8 1 2.8 2.2-1.2 2-2.8 2c-1.3 0-2.4-.6-2.8-1.6M12 6.3v1.6M12 16.3v1.5" /></Ic>;
const IcLupa = () => <Ic><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Ic>;
const IcBalanca = () => <Ic><path d="M12 4v15.5M7.5 19.5h9M5 7.5h14" /><path d="M5 7.5l-2.6 5.6a2.6 2.6 0 005.2 0L5 7.5zM19 7.5l-2.6 5.6a2.6 2.6 0 005.2 0L19 7.5z" /></Ic>;
const IcCarteira = () => <Ic><rect x="3" y="7" width="18" height="12.5" rx="2.5" /><path d="M3 10.5h18M16 14.5h2.2M6.5 7l8.5-3 1.4 3" /></Ic>;
const IcRobo = () => <Ic><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 5v3M9.5 12.5v1M14.5 12.5v1M9.5 16.2h5" /><circle cx="12" cy="4" r="1" /></Ic>;
const IcPessoa = () => <Ic><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" /></Ic>;
const IcCoracao = () => <Ic><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0112 7a4.2 4.2 0 017.5 2.5c0 5.6-7.5 10-7.5 10z" /></Ic>;
const IcVerdade = () => <Ic><path d="M20 11.5a7.8 7.8 0 01-8 7.6 8.3 8.3 0 01-3.5-.7L4 19.5l1-4a7.4 7.4 0 01-1-3.9A7.8 7.8 0 0112 4a7.8 7.8 0 018 7.5z" /><path d="M9 11.6l2 2 4-4" /></Ic>;
const IcRelogio = () => <Ic><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Ic>;
const IcEscudo = () => <Ic><path d="M12 3.5l7 2.6v5.6c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6.1l7-2.6z" /><path d="M9 12l2 2 4-4" /></Ic>;
const IcLista = () => <Ic><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2" /></Ic>;
const IcCalendario = () => <Ic><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Ic>;
const IcBalao = () => <Ic><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Ic>;
const IcAa = () => <Ic><path d="M3 18l5-12 5 12M4.8 14h6.4" /><path d="M20.5 18v-5.2a2.8 2.8 0 00-5.4-1M20.5 15.2c-3.4-.4-5.5.4-5.5 1.6 0 1 .9 1.6 2 1.6 1.6 0 3-1.1 3.5-2.4" /></Ic>;
const IcSeta = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/* ------------------------------------------------------------ sumário */
const SUMARIO: { id: string; t: string }[] = [
  { id: SEC.caf, t: 'A CAF em 1 minuto' },
  { id: SEC.papel, t: 'O seu papel' },
  { id: SEC.mapa, t: 'O mapa do manual' },
  { id: SEC.estudar, t: 'Como estudar' },
  { id: SEC.caminho, t: 'O caminho do cliente' },
  { id: SEC.dia, t: 'O dia do atendente' },
  { id: SEC.valores, t: 'Os 4 valores' },
  { id: SEC.regras, t: 'As 10 regras de ouro' },
  { id: SEC.resumo, t: 'Resumo da lição' },
];
export function Sumario() {
  function ir(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <nav className="vidro mv-bv-sum" aria-label="Nesta lição">
      <span className="mv-bv-sum-tit">Nesta lição</span>
      <ol>
        {SUMARIO.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => ir(s.id)}>
              <span className="mv-bv-sum-n num">{i + 1}</span>{s.t}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------ como funciona (CAF em 1 minuto) */
const ETAPAS_CAF: { ic: ReactNode; t: string; d: string }[] = [
  { ic: <IcMoeda />, t: 'O desconto', d: 'O aposentado tem empréstimo consignado numa financeira. A parcela sai direto do benefício, todo mês.' },
  { ic: <IcLupa />, t: 'A análise', d: 'Ele chama a CAF pelo WhatsApp. Você confere se ele pode ser atendido e junta os documentos.' },
  { ic: <IcBalanca />, t: 'A ação', d: 'O nosso advogado, Dr. Rafael Menezes, entra com a ação pedindo o ressarcimento do que foi descontado nos últimos 10 anos.' },
  { ic: <IcCarteira />, t: 'O resultado', d: 'Leva em média de 6 a 12 meses. Se houver ressarcimento, 30% ficam como honorários do advogado, só no final.' },
];
export function ComoFunciona() {
  return (
    <div className="mv-bv-como">
      <ol className="mv-bv-fluxo" aria-label="Como funciona o processo, em 4 etapas">
        {ETAPAS_CAF.map((e, i) => (
          <li key={e.t} className="mv-bv-etapa">
            <span className="mv-bv-etapa-ic">{e.ic}</span>
            <small className="num">Etapa {i + 1}</small>
            <b>{e.t}</b>
            <p>{e.d}</p>
          </li>
        ))}
      </ol>
      <div className="mv-bv-ex">
        <div className="mv-bv-ex-cab">
          <span className="mv-tag">Exemplo</span>
          <span>Se o cliente receber <b className="num">R$ 10.000</b> no final do processo:</span>
        </div>
        <div className="mv-bv-ex-barra" aria-hidden><i /><i /></div>
        <div className="mv-bv-ex-leg">
          <span><i data-c="cliente" aria-hidden /><b className="num">R$ 7.000</b> ficam com o cliente (70%)</span>
          <span><i data-c="adv" aria-hidden /><b className="num">R$ 3.000</b> são os honorários do advogado (30%)</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ financeiras */
export function Financeiras() {
  const top = ['Agibank', 'Mercantil', 'BMG'];
  const outras = ['Facta', 'Crefisa'];
  return (
    <div className="mv-bv-fin" role="list" aria-label="As 5 financeiras com que trabalhamos">
      {top.map((f) => (
        <div key={f} className="vidro mv-bv-fin-it" data-top="" role="listitem">
          <b>{f}</b><small>entre as que mais chegam</small>
        </div>
      ))}
      {outras.map((f) => (
        <div key={f} className="vidro mv-bv-fin-it" role="listitem">
          <b>{f}</b><small>também trabalhamos</small>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ quem faz o quê */
const VERBOS: { t: string; d: string }[] = [
  { t: 'Qualificar', d: 'Conferir as 3 portas: benefício do INSS (dele ou de um familiar) e empréstimo numa das 5 financeiras.' },
  { t: 'Convencer', d: 'Explicar o processo em palavras simples, tirar dúvidas e, no canal de empréstimo, mostrar os caminhos.' },
  { t: 'Coletar documentos', d: 'Meu INSS, gov.br e documentos pessoais, um de cada vez, com paciência.' },
  { t: 'Encaminhar', d: 'Cadastro, procurações e assinatura digital pelo gov.br. Aí o caso segue para o advogado.' },
];
export function QuemFazOQue() {
  return (
    <div className="mv-bv-raias-box">
    <div className="mv-bv-raias">
      <section className="mv-bv-raia" data-quem="robo" aria-label="Robô">
        <header>
          <span className="mv-bv-raia-ic"><IcRobo /></span>
          <div><b>Robô e IA</b><small>atendimento automático</small></div>
        </header>
        <span className="mv-bv-raia-sub">Canal de juros abusivos</span>
        <ul>
          <li>Boas-vindas e vídeo de 30 segundos</li>
          <li>Pergunta se quer a análise gratuita</li>
          <li>Pede nome completo e CPF</li>
          <li>Avisa que a análise foi iniciada</li>
        </ul>
        <span className="mv-bv-raia-sub">Canal de empréstimo</span>
        <ul>
          <li>Boas-vindas com imagem, nome e CPF</li>
          <li>A IA confere as 3 portas</li>
          <li>Avisa “pré-aprovada” e manda a lista de documentos</li>
          <li>Pergunta sobre o gov.br e o Meu INSS</li>
        </ul>
        <p className="mv-bv-raia-nota">No canal de empréstimo, a IA nunca cita valores, taxas ou juros.</p>
      </section>

      <div className="mv-bv-raia-seta" aria-hidden><IcSeta /><span>passa a conversa</span></div>

      <section className="mv-bv-raia" data-quem="voce" aria-label="Você, o atendente">
        <header>
          <span className="mv-bv-raia-ic"><IcPessoa /></span>
          <div><b>Você</b><small>atendente · o trecho mais longo</small></div>
        </header>
        <ol className="mv-bv-verbos">
          {VERBOS.map((v, i) => (
            <li key={v.t}>
              <span className="mv-bv-verbo-n num">{i + 1}</span>
              <div><b>{v.t}</b><p>{v.d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mv-bv-raia-seta" aria-hidden><IcSeta /><span>entrega o caso</span></div>

      <section className="mv-bv-raia" data-quem="adv" aria-label="Advogado">
        <header>
          <span className="mv-bv-raia-ic"><IcBalanca /></span>
          <div><b>Advogado</b><small>Dr. Rafael Menezes</small></div>
        </header>
        <ul>
          <li>Entra com a ação pedindo o ressarcimento dos últimos 10 anos</li>
          <li>Conduz o processo: em média de 6 a 12 meses</li>
          <li>Honorários de 30%, só no final, do que o cliente receber</li>
        </ul>
        <p className="mv-bv-raia-nota">Dúvida jurídica do cliente? Não responda por conta própria: confirme com o seu gestor.</p>
      </section>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------ antes de você chegar */
export function AntesDeVoce() {
  const feito = [
    'Viu o anúncio e chamou a CAF no WhatsApp',
    'Recebeu o vídeo de 30 segundos',
    'Respondeu SIM para a análise gratuita',
    'Informou o nome completo',
    'Informou o CPF',
    'Recebeu o aviso de que a análise foi iniciada',
  ];
  const falta = [
    'Ninguém conferiu se ele recebe benefício do INSS',
    'Ninguém perguntou sobre as financeiras',
    'Ninguém explicou o processo nem os 30%',
    'Nenhum documento foi pedido ainda',
  ];
  return (
    <div className="vidro mv-bv-antes-lado">
      <div>
        <span className="mv-bv-antes-tit">O que o cliente já fez</span>
        <ul className="mv-bv-check" data-tom="feito">
          {feito.map((t) => <li key={t}><span aria-hidden><IcCheck /></span>{t}</li>)}
        </ul>
      </div>
      <div>
        <span className="mv-bv-antes-tit">O que ainda falta (é com você)</span>
        <ul className="mv-bv-check" data-tom="falta">
          {falta.map((t) => <li key={t}><span aria-hidden />{t}</li>)}
        </ul>
      </div>
      <div>
        <span className="mv-bv-antes-tit">Promessas que você herda do robô</span>
        <ul className="mv-bv-promessas">
          <li><q>análise gratuita</q><span>Nada de cobrança: o processo é gratuito para começar.</span></li>
          <li><q>Seus dados são usados somente para a consulta.</q><span>CPF e documentos servem só para o processo do cliente.</span></li>
          <li><q>Nunca pedimos senhas, códigos ou qualquer pagamento.</q><span>Você nunca pede dinheiro, senha nem código. Se o próprio cliente decidir passar a senha do gov.br, ela serve só para buscar os documentos do Meu INSS (lição 10).</span></li>
          <li><q>Em alguns minutos retorno aqui com uma atualização.</q><span>O cliente está contando com uma resposta rápida.</span></li>
        </ul>
      </div>
      <p className="mv-bv-espera">
        <b>O cliente está esperando você.</b> O robô prometeu um retorno “em alguns minutos”. Quem cumpre essa
        promessa é o atendente.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ de quem é a tarefa? */
type Quem = 'robo' | 'voce' | 'adv';
const NOME_QUEM: Record<Quem, string> = { robo: 'Robô', voce: 'Você', adv: 'Advogado' };
const DE_QUEM: Record<Quem, string> = { robo: 'Não: é do robô.', voce: 'Não: é sua, do atendente.', adv: 'Não: é do advogado.' };
const TAREFAS: { t: string; q: Quem; porque: string }[] = [
  { t: 'Dar as boas-vindas e pedir o nome completo e o CPF', q: 'robo', porque: 'É o começo automático da conversa, nos dois canais. Quando você chega, o cliente já informou nome e CPF.' },
  { t: 'Explicar o processo com calma e responder às dúvidas do cliente', q: 'voce', porque: 'O robô só começa a conversa. Explicar, tirar dúvidas e convencer é o coração do seu trabalho.' },
  { t: 'Entrar com a ação pedindo o ressarcimento dos últimos 10 anos', q: 'adv', porque: 'Quem entra com a ação é o nosso advogado, o Dr. Rafael Menezes.' },
  { t: 'Mandar o vídeo de 30 segundos no canal de juros abusivos', q: 'robo', porque: 'O vídeo faz parte do começo automático do canal de juros abusivos.' },
  { t: 'Buscar com o cliente os extratos do Meu INSS', q: 'voce', porque: 'Coletar os documentos é com você. Muitos clientes não sabem entrar no Meu INSS e precisam da sua ajuda.' },
  { t: 'Explicar ao cliente do canal de empréstimo o que quer dizer “pré-aprovada”', q: 'voce', porque: 'A IA avisa a “pré-aprovada”, mas nunca cita valores, taxas ou juros. Explicar com honestidade que não é valor liberado, e depois a situação real do cliente, é trabalho seu.' },
  { t: 'Receber os honorários de 30% no final do processo', q: 'adv', porque: 'Os 30% são os honorários do advogado, retirados do que o cliente receber, só no final.' },
  { t: 'Ajudar o cliente a trocar a senha depois de buscar os documentos', q: 'voce', porque: 'Quando o cliente passa a senha, a gente usa só para buscar os documentos e depois ajuda ele a trocar.' },
];
export function DeQuemETarefa() {
  const [resp, setResp] = useState<Record<number, Quem>>({});
  const feitos = Object.keys(resp).length;
  const acertos = TAREFAS.filter((t, i) => resp[i] === t.q).length;
  return (
    <div className="mv-bv-tarefas">
      {TAREFAS.map((t, i) => {
        const r = resp[i];
        const estado = r === undefined ? undefined : r === t.q ? 'certo' : 'errado';
        return (
          <div key={t.t} className="vidro mv-bv-tarefa" data-estado={estado}>
            <p className="mv-bv-tarefa-t"><span className="num">{i + 1}.</span> {t.t}</p>
            {r === undefined ? (
              <div className="mv-bv-tarefa-bts" role="group" aria-label={`De quem é: ${t.t}`}>
                {(Object.keys(NOME_QUEM) as Quem[]).map((q) => (
                  <button key={q} type="button" onClick={() => setResp((s) => ({ ...s, [i]: q }))}>{NOME_QUEM[q]}</button>
                ))}
              </div>
            ) : (
              <p className="mv-bv-tarefa-r" role="status">
                <b>{estado === 'certo' ? 'Acertou.' : DE_QUEM[t.q]}</b> {t.porque}
              </p>
            )}
          </div>
        );
      })}
      {feitos === TAREFAS.length && (
        <div className="mv-bv-tarefas-fim" role="status">
          <b className="num">{acertos} de {TAREFAS.length}</b> acertos.
          <button type="button" className="mv-link" onClick={() => setResp({})}>Fazer de novo</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ trilha do manual */
/* Rótulo curto de cada lição na estrada (o título inteiro não cabe no desenho).
   Título, resumo e módulo vêm da própria lição (LICOES). */
const CURTO: Record<string, string> = {
  'boas-vindas': 'Boas-vindas',
  empresa: 'O que a gente faz',
  consignado: 'Consignado e juros',
  cliente: 'Quem é o cliente',
  canais: 'Os dois canais',
  'primeiro-contato': 'Primeiro contato',
  conversao: 'Converter o cliente',
  objecoes: 'Objeções',
  followup: 'Follow-up',
  inss: 'Meu INSS',
  gov: 'gov.br: IR e CPF',
  pessoais: 'Documentos pessoais',
  assinatura: 'Procurações',
  etica: 'Segurança e LGPD',
};
type ParadaTrilha = { m: number | 'prova'; curto: string; titulo: string; aprende: string };
const PROVA_TRILHA: ParadaTrilha = {
  m: 'prova', curto: 'Prova final', titulo: 'Prova final',
  aprende: `${PROVA.total} perguntas sorteadas de todas as lições. Para passar, ${PROVA.pct}% de acertos (${PROVA.minimo} de ${PROVA.total}). Pode refazer quantas vezes precisar.`,
};
/** As paradas da trilha. Só chame durante a renderização (LICOES é import circular). */
function paradasDaTrilha(): ParadaTrilha[] {
  return LICOES.map((l) => ({
    m: Math.max(0, MODULOS.findIndex((mod) => mod.id === l.modulo)),
    curto: CURTO[l.id] ?? l.titulo,
    titulo: l.titulo,
    aprende: l.resumo,
  }));
}

/** Posição de cada parada na estrada em "S" (5 por linha). */
const POR_LINHA = 5;
function posTrilha(k: number) {
  const linha = Math.floor(k / POR_LINHA);
  const col = k % POR_LINHA;
  return { x: linha % 2 === 0 ? 100 + col * 140 : 660 - col * 140, y: 70 + linha * 120 };
}
/** A estrada em "S" que passa por todas as paradas. */
function estradaTrilha(n: number) {
  const linhas = Math.ceil(n / POR_LINHA);
  const fim = posTrilha(n - 1);
  let d = 'M100,70';
  for (let l = 0; l < linhas; l++) {
    const y = 70 + l * 120;
    const ultima = l === linhas - 1;
    if (l % 2 === 0) {
      d += ` H${ultima ? fim.x : 660}`;
      if (!ultima) d += ` C755,${y} 755,${y + 120} 660,${y + 120}`;
    } else {
      d += ` H${ultima ? fim.x : 100}`;
      if (!ultima) d += ` C5,${y} 5,${y + 120} 100,${y + 120}`;
    }
  }
  return d;
}

export function TrilhaManual() {
  const [sel, setSel] = useState(0); // índice da lição; o último é a prova
  const trilha = paradasDaTrilha();
  const nParadas = trilha.length + 1; // + a prova
  const licao = sel < trilha.length ? trilha[sel] : null;
  const det = licao ?? PROVA_TRILHA;
  const estrada = estradaTrilha(nParadas);
  const altura = 70 + (Math.ceil(nParadas / POR_LINHA) - 1) * 120 + 55;
  /* rótulo de cada módulo acima da primeira parada dele */
  const rotulos = MODULOS.map((mod, mi) => {
    const k = trilha.findIndex((p) => p.m === mi);
    if (k < 0) return null;
    const p = posTrilha(k);
    const anchor: 'start' | 'middle' | 'end' = p.x <= 140 ? 'start' : p.x >= 620 ? 'end' : 'middle';
    const dx = anchor === 'start' ? -18 : anchor === 'end' ? 18 : 0;
    return { mi, titulo: mod.titulo, x: p.x + dx, y: p.y - 36, anchor };
  });
  function tecla(e: KeyboardEvent<SVGGElement>, k: number) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(k); }
  }
  return (
    <div className="mv-bv-trilha">
      <svg className="mv-bv-largo" viewBox={`0 0 760 ${altura}`} width="100%" role="group"
        aria-label={`Trilha do manual: ${MODULOS.length} módulos, ${trilha.length} lições e a prova final. Clique numa parada para ver o que ela ensina.`}>
        <path className="mv-bv-estrada" d={estrada} />
        <path className="mv-bv-estrada-fio" d={estrada} />
        {rotulos.map((r) => r && (
          <text key={r.mi} className="mv-bv-mod-t" data-m={r.mi} x={r.x} y={r.y} textAnchor={r.anchor}>
            {`Módulo ${r.mi + 1} · ${r.titulo}`.toUpperCase()}
          </text>
        ))}
        {Array.from({ length: nParadas }, (_, k) => {
          const p = posTrilha(k);
          const ehProva = k === trilha.length;
          const parada = ehProva ? PROVA_TRILHA : trilha[k];
          return (
            <g key={k} className="mv-bv-no" data-m={parada.m} data-sel={sel === k ? '' : undefined}
              role="button" tabIndex={0} aria-pressed={sel === k}
              aria-label={ehProva ? 'Prova final' : `Lição ${k + 1}: ${parada.titulo}`}
              onClick={() => setSel(k)} onKeyDown={(e) => tecla(e, k)}>
              <circle className="mv-bv-no-alvo" cx={p.x} cy={p.y} r="30" />
              {ehProva && <circle className="mv-bv-no-anel" cx={p.x} cy={p.y} r="23" />}
              <circle className="mv-bv-no-c" cx={p.x} cy={p.y} r="17" />
              {ehProva
                ? <path className="mv-bv-no-ic" transform={`translate(${p.x - 8} ${p.y - 8}) scale(.6667)`}
                  d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1.5A3.5 3.5 0 007.5 11M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M12 14v3M8.5 20.5h7" />
                : <text className="mv-bv-no-n" x={p.x} y={p.y + 4.5} textAnchor="middle">{k + 1}</text>}
              <text className="mv-bv-no-t" x={p.x} y={p.y + 38} textAnchor="middle">{parada.curto}</text>
              {k === 0 && <text className="mv-bv-aqui" x={p.x} y={p.y + 54} textAnchor="middle">você está aqui</text>}
            </g>
          );
        })}
      </svg>

      {/* telas estreitas: a mesma trilha em lista */}
      <div className="mv-bv-estreito mv-bv-trilha-lista">
        {MODULOS.map((mod, mi) => (
          <div key={mod.id} className="mv-bv-trilha-mod" data-m={mi}>
            <span>Módulo {mi + 1} · {mod.titulo}</span>
            <div>
              {trilha.map((l, k) => (l.m !== mi ? null : (
                <button key={l.titulo} type="button" aria-pressed={sel === k} onClick={() => setSel(k)}>
                  <span className="num">{k + 1}</span>{l.curto}
                </button>
              )))}
            </div>
          </div>
        ))}
        <div className="mv-bv-trilha-mod" data-m="prova">
          <span>No fim da trilha</span>
          <div>
            <button type="button" aria-pressed={sel === trilha.length} onClick={() => setSel(trilha.length)}>Prova final</button>
          </div>
        </div>
      </div>

      <div className="mv-bv-trilha-det" data-m={det.m} aria-live="polite">
        <small>
          {licao && typeof licao.m === 'number'
            ? `Módulo ${licao.m + 1} · ${MODULOS[licao.m].titulo} · Lição ${sel + 1} de ${trilha.length}`
            : `Depois das ${trilha.length} lições`}
        </small>
        <b>{det.titulo}{sel === 0 && <span className="mv-bv-aqui-tag">Você está aqui</span>}</b>
        <p>{det.aprende}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ consulta rápida */
const IcMapa = () => <Ic><circle cx="12" cy="12" r="3" /><circle cx="4.5" cy="5.5" r="1.8" /><circle cx="19.5" cy="5.5" r="1.8" /><circle cx="4.5" cy="18.5" r="1.8" /><circle cx="19.5" cy="18.5" r="1.8" /><path d="M6 6.8l3.6 3.4M18 6.8l-3.6 3.4M6 17.2l3.6-3.4M18 17.2l-3.6-3.4" /></Ic>;
const CONSULTA: { ic: ReactNode; t: string; quando: string; d: string }[] = [
  { ic: <IcLista />, t: 'Checklist do cliente', quando: 'Antes de encaminhar o caso', d: 'Confere, item por item, se nenhum documento ficou para trás.' },
  { ic: <IcCalendario />, t: 'Calculadora de períodos', quando: 'Na hora dos extratos do Meu INSS', d: 'Mostra os 10 períodos certos do extrato de pagamento, a partir do mês atual.' },
  { ic: <IcMapa />, t: 'Mapa da venda', quando: 'Quando se perder numa conversa', d: 'A venda inteira num desenho: perfil, canal, objeções, ganchos, documentos e fechamento.' },
  { ic: <IcBalao />, t: 'Mensagens prontas', quando: 'Para responder no WhatsApp', d: 'Textos para copiar e colar. Adapte ao jeito do cliente antes de enviar.' },
  { ic: <IcAa />, t: 'Glossário', quando: 'Quando aparecer uma palavra nova', d: 'Todos os termos do manual, explicados de um jeito simples.' },
];
export function ConsultaRapida() {
  return (
    <div className="vidro mv-bv-consulta" role="list" aria-label="As ferramentas da consulta rápida">
      <span className="mv-bv-consulta-cab" aria-hidden>Consulta rápida · no menu à esquerda</span>
      {CONSULTA.map((c) => (
        <div key={c.t} className="mv-bv-consulta-it" role="listitem">
          <span className="mv-bv-consulta-ic">{c.ic}</span>
          <b>{c.t}</b>
          <span className="mv-bv-consulta-q">{c.quando}</span>
          <p>{c.d}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ simulador da nota da prova */
export function SimuladorNota() {
  const [acertos, setAcertos] = useState<number>(PROVA.minimo);
  const pct = notaDe(acertos);
  const passou = pct >= PROVA.pct;
  const faltam = PROVA.minimo - acertos;
  return (
    <div className="vidro mv-bv-nota">
      <div className="mv-bv-nota-cab">
        <label htmlFor="mv-bv-nota-faixa">Arraste para simular: se você acertar</label>
        <b className="num">{acertos} de {PROVA.total}</b>
      </div>
      <input id="mv-bv-nota-faixa" className="mv-bv-nota-faixa" type="range" min={0} max={PROVA.total} step={1}
        value={acertos} onChange={(e) => setAcertos(Number(e.target.value))} />
      <div className="mv-bv-nota-bolas" aria-hidden style={{ '--bv-n': PROVA.total } as CSSProperties}>
        {Array.from({ length: PROVA.total }, (_, i) => (
          <i key={i} data-ok={i < acertos ? '' : undefined}
            data-corte={i === PROVA.minimo - 1 ? `${PROVA.pct}%` : undefined} />
        ))}
      </div>
      <div className="mv-bv-nota-res" data-ok={passou ? '' : undefined} role="status">
        <b className="num">{pct}%</b>
        <span>
          {passou
            ? 'Aprovado. A prova confirma que você está pronto para atender.'
            : `Ainda não. ${faltam === 1 ? 'Falta 1 acerto' : `Faltam ${faltam} acertos`} para chegar a ${PROVA.pct}%. Revise as lições e faça outra prova: as perguntas mudam a cada tentativa.`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ caminho do cliente */
type Zona = 'antes' | 'voce' | 'adv';
const PARADAS: { t: string; d: string; z: Zona }[] = [
  { t: 'Anúncio', d: 'no Facebook', z: 'antes' },
  { t: 'Robô', d: 'nome e CPF', z: 'antes' },
  { t: 'Qualificar', d: 'as 3 portas', z: 'voce' },
  { t: 'Convencer', d: 'explicar o processo', z: 'voce' },
  { t: 'Meu INSS', d: 'carta e extratos', z: 'voce' },
  { t: 'gov.br', d: 'IR de 3 anos e CPF', z: 'voce' },
  { t: 'Pessoais', d: 'RG e comprovante', z: 'voce' },
  { t: 'Procurações', d: 'cadastro e assinatura', z: 'voce' },
  { t: 'Ação na Justiça', d: 'média: 6 a 12 meses', z: 'adv' },
  { t: 'Ressarcimento', d: '30% só no final', z: 'adv' },
];
function posCaminho(k: number) {
  return k < 5 ? { x: 90 + k * 145, y: 100 } : { x: 670 - (k - 5) * 145, y: 255 };
}
export function CaminhoCliente() {
  return (
    <div className="mv-bv-cam">
      <svg className="mv-bv-largo" viewBox="0 0 760 345" width="100%" role="img"
        aria-label="O caminho do cliente em 10 paradas: anúncio e robô (antes de você); qualificar, convencer, Meu INSS, gov.br, documentos pessoais e procurações (você); ação na Justiça e ressarcimento (advogado).">
        <rect className="mv-bv-zona" data-z="antes" x="12" y="18" width="289" height="160" rx="14" />
        <rect className="mv-bv-zona" data-z="voce" x="309" y="18" width="439" height="320" rx="14" />
        <rect className="mv-bv-zona" data-z="adv" x="12" y="188" width="289" height="150" rx="14" />
        <text className="mv-bv-zona-t" data-z="antes" x="28" y="42">ANTES DE VOCÊ</text>
        <text className="mv-bv-zona-t" data-z="voce" x="325" y="42">VOCÊ · ATENDENTE</text>
        <text className="mv-bv-zona-t" data-z="adv" x="28" y="212">ADVOGADO</text>
        <path className="mv-bv-cam-estrada" d="M90,100 H715 Q735,100 735,120 V235 Q735,255 715,255 H90" />
        <path className="mv-bv-cam-fio" d="M90,100 H715 Q735,100 735,120 V235 Q735,255 715,255 H90" />
        {PARADAS.map((p, k) => {
          const { x, y } = posCaminho(k);
          return (
            <g key={p.t} className="mv-bv-cam-no" data-z={p.z}>
              <circle cx={x} cy={y} r="18" />
              <text className="mv-bv-cam-n" x={x} y={y + 4.5} textAnchor="middle">{k + 1}</text>
              <text className="mv-bv-cam-t" x={x} y={y + 38} textAnchor="middle">{p.t}</text>
              <text className="mv-bv-cam-d" x={x} y={y + 54} textAnchor="middle">{p.d}</text>
            </g>
          );
        })}
      </svg>

      {/* telas estreitas: o mesmo caminho em lista */}
      <ol className="mv-bv-estreito mv-bv-cam-lista" aria-label="O caminho do cliente em 10 paradas">
        {PARADAS.map((p, k) => (
          <li key={p.t} data-z={p.z}>
            <span className="num">{k + 1}</span>
            <div><b>{p.t}</b><small>{p.d}</small></div>
          </li>
        ))}
      </ol>

      <div className="mv-bv-cam-leg" aria-hidden>
        <span data-z="antes"><i />Antes de você</span>
        <span data-z="voce"><i />Você</span>
        <span data-z="adv"><i />Advogado (Dr. Rafael Menezes)</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ conversas em paralelo */
const QUADRO: { etapa: string; nome: string; canal: string; prox: string }[] = [
  { etapa: 'Chegou agora', nome: 'Dona Cida', canal: 'Juros abusivos', prox: 'Se apresentar e confirmar o benefício do INSS' },
  { etapa: 'Qualificando', nome: 'Seu Antônio', canal: 'Juros abusivos', prox: 'Perguntar em quais financeiras tem empréstimo' },
  { etapa: 'Conversando', nome: 'Dona Lúcia', canal: 'Empréstimo', prox: 'Explicar que hoje não há margem e mostrar os caminhos' },
  { etapa: 'Documentos', nome: 'Dona Maria', canal: 'Juros abusivos', prox: 'Faltam os extratos de pagamento de 10 anos' },
  { etapa: 'Fechamento', nome: 'Seu José', canal: 'Empréstimo', prox: 'Conta gov.br no bronze: ajudar a subir para prata' },
];
export function ConversasParalelo() {
  return (
    <ol className="mv-bv-quadro" aria-label="Exemplo: cinco conversas, cada uma numa etapa">
      {QUADRO.map((c, i) => (
        <li key={c.nome} className="mv-bv-col">
          <span className="mv-bv-col-t"><span className="num">{i + 1}</span>{c.etapa}</span>
          <div className="mv-bv-card">
            <b>{c.nome}</b>
            <small>{c.canal}</small>
            <p><span>Próximo passo</span>{c.prox}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------ os 4 valores */
const PILARES: { ic: ReactNode; t: string; tom: string; porque: string; pratica: string[] }[] = [
  {
    ic: <IcCoracao />, t: 'Respeito ao idoso', tom: 'azul',
    porque: 'O nosso público principal é aposentado e pensionista. Muitos têm dificuldade com o celular, e é natural que desconfiem de quem fala de dinheiro pelo WhatsApp.',
    pratica: ['Frases curtas, sem gíria e sem abreviação', 'Tratar por “o senhor” ou “a senhora”, ou por “você” se o cliente preferir', 'Explicar de novo, com calma, quantas vezes for preciso'],
  },
  {
    ic: <IcVerdade />, t: 'Honestidade', tom: 'verde',
    porque: 'É a confiança que faz o cliente mandar os documentos. Uma promessa que não se cumpre derruba essa confiança e o nome da CAF.',
    pratica: ['Nunca prometer valor nem garantir resultado', 'Falar dos 30% desde o começo', 'No canal de empréstimo, dizer a verdade sobre a “pré-aprovada” e a margem'],
  },
  {
    ic: <IcRelogio />, t: 'Rapidez', tom: 'ambar',
    porque: 'O robô avisou o cliente que logo alguém retornaria (“em alguns minutos”, “em instantes”). Cliente que espera esfria, desconfia e desiste.',
    pratica: ['Responder logo que a conversa chegar', 'Precisa de tempo para confirmar algo? Avise o cliente', 'Retomar quem parou no meio do caminho (lição 9)'],
  },
  {
    ic: <IcEscudo />, t: 'Segurança dos dados', tom: 'rubro',
    porque: 'Você vai lidar com CPF, documentos, extratos e, às vezes, a senha do gov.br. O cliente confiou isso à CAF.',
    pratica: ['Usar os dados só para o processo do cliente', 'Recebeu a senha? Só para buscar os documentos; depois, ajudar a trocar', 'Não repassar dados para quem não faz parte do atendimento'],
  },
];
export function Pilares() {
  return (
    <div className="mv-bv-pilares">
      {PILARES.map((p) => (
        <section key={p.t} className="vidro mv-bv-pilar" data-tom={p.tom} aria-label={p.t}>
          <header><span className="mv-bv-pilar-ic">{p.ic}</span><b>{p.t}</b></header>
          <p className="mv-bv-pilar-pq"><span>Por que importa</span>{p.porque}</p>
          <div className="mv-bv-pilar-na">
            <span>Na prática</span>
            <ul>{p.pratica.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ as 10 regras de ouro */
const REGRAS: { t: string; porque: string }[] = [
  { t: 'Confira se a pessoa pode ser atendida antes de tudo.', porque: 'São 3 portas: recebe algum benefício do INSS (aposentadoria, pensão, auxílio, BPC/LOAS)? Se não recebe, algum familiar (pai, mãe, avô, avó, filho) recebe? E tem empréstimo em uma das 5 financeiras? Conferir cedo evita que o cliente perca tempo mandando documentos à toa.' },
  { t: 'Nunca prometa valor nem resultado.', porque: 'Cada caso depende da análise. Fale em “análise”, “possibilidade” e “em média”. Prometer e não cumprir destrói a confiança do cliente na CAF.' },
  { t: 'Fale dos 30% com clareza, desde o começo.', porque: 'O cliente não paga nada para começar; no final, 30% do que ele receber ficam como honorários do advogado. Quem entende isso no início não se sente enganado no final.' },
  { t: 'Nunca peça dinheiro ao cliente.', porque: 'O processo é gratuito para começar. No canal de juros abusivos, o robô já avisa o cliente de que a CAF nunca pede pagamento. Qualquer pedido de dinheiro parece golpe e quebra a confiança.' },
  { t: 'Escute primeiro, ofereça depois.', porque: 'Quem vem pelo canal de empréstimo quer dinheiro rápido e não pediu o processo. Entenda o que ele precisa, verifique a situação e só então mostre os caminhos: aumento de margem, portabilidade e o processo.' },
  { t: 'Fale com respeito, calma e palavras simples.', porque: 'O nosso público principal é aposentado e pensionista, muitas vezes uma pessoa idosa. Frases curtas, sem gíria e sem pressa fazem o cliente se sentir seguro para seguir com você.' },
  { t: 'Recebeu um “não”? Agradeça e não insista.', porque: 'Quando o cliente diz NÃO ou não pode ser atendido, a regra é agradecer com carinho e encerrar. A porta fica aberta: se ele mudar de ideia, pode chamar de novo.' },
  { t: 'Senha e dados servem só para o processo.', porque: 'Não peça nem exija a senha: o robô já avisou o cliente de que a CAF nunca pede senhas. Se o próprio cliente não conseguir entrar no Meu INSS e decidir passar a senha do gov.br, use só para buscar os documentos, com total segurança, e depois ajude ele a trocar a senha. Dados do cliente não saem do atendimento.' },
  { t: 'Documento certo de primeira.', porque: 'Extratos nos períodos certos (10 anos), comprovante de residência do mês atual ou do mês passado, e-mail do cliente. Documento errado faz o cliente repetir tudo e atrasa o processo.' },
  { t: 'Na dúvida, pergunte. Nunca invente.', porque: 'Se o cliente perguntar algo que você não sabe, diga que vai confirmar e pergunte ao seu gestor. Uma resposta inventada pode virar uma promessa que a CAF não tem como cumprir.' },
];
export function RegrasOuro() {
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set());
  const todas = abertas.size === REGRAS.length;
  function alternar(i: number) {
    setAbertas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  return (
    <div className="mv-bv-regras-wrap">
      <div className="mv-bv-regras-topo">
        <span className="num">{abertas.size} de {REGRAS.length} explicações abertas</span>
        <button type="button" className="mv-link" onClick={() => setAbertas(todas ? new Set() : new Set(REGRAS.map((_, i) => i)))}>
          {todas ? 'Fechar todas' : 'Abrir todas'}
        </button>
      </div>
      <ol className="mv-bv-regras">
        {REGRAS.map((r, i) => {
          const aberta = abertas.has(i);
          return (
            <li key={r.t} className="vidro mv-bv-regra" data-aberta={aberta ? '' : undefined}>
              <button type="button" aria-expanded={aberta} onClick={() => alternar(i)}>
                <span className="mv-bv-regra-n num">{String(i + 1).padStart(2, '0')}</span>
                <b>{r.t}</b>
                <span className="mv-bv-regra-mais">{aberta ? 'Fechar' : 'Por quê?'}</span>
              </button>
              {aberta && <p>{r.porque}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------ mensagem de exemplo (certo × errado) */
export function MsgExemplo({ texto, pontos, tom }: { texto: string; pontos: string[]; tom: 'bom' | 'ruim' }) {
  return (
    <div className="mv-bv-msgex" data-tom={tom}>
      <p className="mv-bv-msgex-b">{texto}</p>
      <ul>
        {pontos.map((p) => (
          <li key={p}><span aria-hidden>{tom === 'bom' ? <IcCheck /> : <IcX />}</span>{p}</li>
        ))}
      </ul>
    </div>
  );
}
