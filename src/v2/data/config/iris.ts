/* IRIS — a atendente virtual do Atendimento (dono 24/11: "deixar a íris pré-configurada só para eles ativarem do mesmo jeito
   que a gente está usando aqui na Atenvo e para eles criarem outras versões também… essa tela da íris bem completa").

   MOTOR NEUTRO + VERSÕES (plano em ~/reviza-sist/iris/PLANO.md). Uma VERSÃO é tudo o que muda de uma empresa (ou de uma
   campanha) para outra: quem ela é, os fatos da empresa, o que oferece, as perguntas, os documentos, quem da equipe recebe,
   os textos e áudios, as retomadas, os horários e o que ela nunca diz. O motor (no servidor) só guarda a mecânica.
   Cada versão mora numa linha de `ia_agentes` (cofre da chave, liga/desliga) com a configuração na coluna `iris` (jsonb);
   cada número do Atendimento escolhe a versão que atende nele (`bot_canal_config.ia_agente_id`), liga e desliga, e pode
   ficar em modo teste (só responde os números de teste).
   A versão pré-configurada é a Iris do Atenvo com "CAF" trocado pelo nome da empresa: os FATOS da Reviza (CNPJ, advogado,
   honorários, prazo) nunca são inventados — ficam "falta preencher" e a Iris não liga sem eles. Os textos entram como
   "adaptado do Atenvo, falta aprovar". */
import { BIA_FAQ, BIA_GATILHOS, BIA_REGRAS, BIA_ROTEIRO } from './irisBiaReviza';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isPrevia, supabase } from '@/lib/supabase';
import { ORG_REVIZA } from '@/context/OrgContext';
import { temRecurso } from './recursos';
import { TEXTOS_BASE } from './irisTextosBase';

/* ============================== formato ============================== */
export type GrupoTexto = 'abertura' | 'analise' | 'documentos' | 'senha' | 'equipe' | 'produto_revisao' | 'produto_rmc' | 'fechados'
  | 'objecoes' | 'retomadas' | 'acompanhamento' | 'outros';
export interface TextoIris {
  id: string; grupo: GrupoTexto; quando: string; tipo: 'texto' | 'audio'; texto: string;
  aprovado: boolean; origem: 'atenvo' | 'novo' | 'editado';
}
export interface FatoIris { id: string; pergunta: string; resposta: string }
export interface ProdutoIris {
  id: string; nome: string; ativo: boolean; descricao: string;
  /** só na revisão de juros: as financeiras que entram na análise */
  financeiras?: string[];
  podeDizer: string; naoPodeDizer: string;
}
export type TipoPergunta = 'sim_nao' | 'lista' | 'nome' | 'cpf' | 'livre';
export interface PerguntaIris { id: string; texto: string; tipo: TipoPergunta; seNao: 'nao_elegivel' | 'segue'; ativa: boolean }
export interface DocumentoIris { id: string; rotulo: string; ativo: boolean; obrigatorio: boolean; dica: string }
export type Turno = 'manha' | 'tarde' | 'dia';
export interface AtendenteIris { usuarioId: string; nome: string; turno: Turno; recebe: boolean }

export interface IrisConfig {
  identidade: { assistente: string; rotulo: string; empresa: string; papel: string; instrucoes: string; respostaRobo: string };
  empresa: {
    razaoSocial: string; cnpj: string; endereco: string; cidade: string; advogado: string; oab: string;
    honorarios: string; prazoProcesso: string; fatos: FatoIris[];
    regioes: { modo: 'brasil' | 'estados'; estados: string[] };
  };
  produtos: ProdutoIris[];
  qualificacao: { perguntas: PerguntaIris[]; naoElegivel: string; arquivarNaoElegivel: boolean };
  documentos: { ativo: boolean; itens: DocumentoIris[]; mesesComprovante: number; aceitaTerceiro: boolean; ajudaInssPorLigacao: boolean;
    /** como na Iris do Atenvo (desde 18/11): para revisão e portabilidade, oferece que o cliente passe a senha do gov.br */
    senhaGovbr: boolean };
  equipe: {
    ligacao: boolean; mensagem: boolean; perguntaPeriodo: boolean;
    distribuicao: 'equipe_do_numero' | 'rodizio' | 'mesma_pessoa'; responsavelFixo: string | null;
    atendentes: AtendenteIris[]; avisar: string[]; pediuPessoa: 'passa' | 'continua'; valorPerguntadoVezes: number;
  };
  tom: {
    tratamento: 'senhor' | 'voce'; emojiNaSaudacao: boolean; maxBolhas: number; maxCaracteres: number;
    audio: boolean; apresentacaoEmAudio: boolean; maxAudiosPorEtapa: number; risadaNoAudio: boolean;
  };
  textos: TextoIris[];
  retomadas: { ativo: boolean; parouNoMeioHoras: number; segundaTentativaHoras: number; toques: boolean; diasDosToques: number[];
    tetoDia: number; tetoSemana: number; tentarDepoisDoNao: boolean };
  horarios: { dias: number[]; inicio: string; fim: string; manha: [string, string]; tarde: [string, string];
    janelaEnvio: [string, string]; feriados: boolean; foraDoHorario: 'responde_e_avisa' | 'espera' };
  proibido: { valores: boolean; prazosExatos: boolean; prometerAprovacao: boolean; urgencia: boolean; naoRepeteSenha: boolean;
    frases: string[]; termos: string[] };
  modelo: { conversa: string; documentos: string; dificil: string; maxChamadasDia: number };
  /* 26/11, "igual" ao sistema que a Reviza usava antes (Agentes › Configurar): */
  /** quando ela começa: espera antes de responder (o cliente termina de digitar) e as frases que fazem ela começar */
  inicio: { esperaSeg: number; soComGatilho: boolean; gatilhos: string[] };
  /** o roteiro e as regras escritos pela empresa, do jeito dela (vão para o motor junto com o resto) */
  roteiro: { texto: string; regras: string };
  /** a assinatura no fim das mensagens */
  assinatura: { ativa: boolean; texto: string };
  /** áudio: nunca, sempre, ou só quando o cliente manda áudio */
  audioModo: { modo: 'desligado' | 'sempre' | 'igual_ao_lead' };
  /** principal (tem número) ou secundária (atende só quando a principal passa a conversa para ela) */
  papel: { tipo: 'principal' | 'secundaria'; quandoReceber: string[]; descricao: string; podePassarPara: string[] };
  /** o catálogo de produtos e serviços que ela pode oferecer (Configurações › Produtos e serviços) */
  catalogo: { usar: boolean; produtoIds: string[]; maxPorResposta: number };
}

export type OrigemVersao = 'pre_configurada' | 'nova' | 'duplicada' | 'importada';
export interface VersaoIris {
  id: string; nome: string; descricao: string; origem: OrigemVersao; ativa: boolean;
  chaveDefinidaEm: string | null; criadoEm: string; atualizadoEm: string; config: IrisConfig;
}
export interface NumeroIris {
  id: string; nome: string; numero: string | null; conectado: boolean;
  versaoId: string | null; ligado: boolean; modoTeste: boolean; numerosTeste: string[];
}

/* ============================== rótulos ============================== */
export const GRUPOS_TEXTO: { id: GrupoTexto; rotulo: string; desc: string }[] = [
  { id: 'abertura', rotulo: 'Abertura', desc: 'Quando o cliente chega e ela se apresenta.' },
  { id: 'analise', rotulo: 'Análise', desc: 'Como ela explica a análise e dá o resultado.' },
  { id: 'produto_revisao', rotulo: 'Revisão de juros', desc: 'As perguntas e explicações da revisão do empréstimo pessoal.' },
  { id: 'produto_rmc', rotulo: 'Cartão RMC/RCC', desc: 'O cartão consignado que desconta direto do benefício.' },
  { id: 'documentos', rotulo: 'Documentos', desc: 'O pedido, a ajuda e a confirmação dos documentos.' },
  { id: 'senha', rotulo: 'Senha do gov.br', desc: 'O roteiro aprovado para quando a documentação do INSS precisa da senha.' },
  { id: 'equipe', rotulo: 'Passar para a equipe', desc: 'Ligação, mensagem, horário de quem cuida do caso.' },
  { id: 'objecoes', rotulo: 'Dúvidas e objeções', desc: 'As respostas para o que o cliente costuma perguntar ou temer.' },
  { id: 'fechados', rotulo: 'Clientes já fechados', desc: 'Para quem já é cliente e pergunta do processo.' },
  { id: 'retomadas', rotulo: 'Retomadas', desc: 'Quando o cliente parou no meio e ela volta a chamar.' },
  { id: 'acompanhamento', rotulo: 'Acompanhamento', desc: 'Os três toques para quem sumiu, e o encerramento.' },
  { id: 'outros', rotulo: 'Outros', desc: 'Textos criados nesta versão.' },
];
export const ROTULO_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde', dia: 'Manhã e tarde' };
export const MODELOS_GEMINI = [
  { valor: 'gemini-3.6-flash', rotulo: 'Gemini 3.6 Flash', desc: 'rápido e econômico · o que a Iris usa hoje' },
  { valor: 'gemini-3.7-flash', rotulo: 'Gemini 3.7 Flash', desc: 'geração mais nova' },
  { valor: 'gemini-pro-latest', rotulo: 'Gemini Pro', desc: 'o mais capaz · custo maior' },
];
export const ESTADOS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

/* ============================== a Iris pré-configurada ============================== */
const FINANCEIRAS_ATENVO = ['Agibank', 'BMG', 'Facta', 'Mercantil', 'Crefisa'];

/** A Iris como ela atende hoje no Atenvo, com o nome da empresa trocado. Os fatos da empresa ficam em branco (a Reviza
 *  preenche; nada é inventado) e os textos entram "adaptados do Atenvo, falta aprovar". */
export function irisPreConfigurada(empresa = 'Reviza'): IrisConfig {
  return {
    identidade: {
      assistente: 'Iris', rotulo: 'atendente virtual', empresa,
      papel: 'Faz o primeiro atendimento no WhatsApp: se apresenta, entende o que o cliente precisa, faz a análise inicial, pede os documentos e deixa tudo pronto para o atendente concluir. Não fecha a venda: quem conclui é o atendente.',
      instrucoes: 'Fala como uma atendente educada e simpática, um pouquinho menos entusiasmada que uma vendedora. Mensagens curtas, uma ideia por vez. Explica com calma para quem é mais velho. Nunca pressiona, nunca promete valor nem prazo, e nunca confirma uma ligação sozinha: pergunta como o cliente prefere e deixa avisado.',
      respostaRobo: 'Sou a {assistente}, {rotulo} da {empresa}. Se preferir falar com uma pessoa, é só me pedir.',
    },
    empresa: {
      razaoSocial: '', cnpj: '', endereco: '', cidade: '', advogado: '', oab: '', honorarios: '', prazoProcesso: '',
      fatos: [
        { id: 'custo', pergunta: 'Tem algum custo para começar?', resposta: '' },
        { id: 'dez_anos', pergunta: 'Até quanto tempo para trás dá para revisar?', resposta: 'A revisão olha os empréstimos pessoais dos últimos dez anos, mesmo os que já foram quitados.' },
        { id: 'presencial', pergunta: 'Posso ir até vocês pessoalmente?', resposta: '' },
      ],
      regioes: { modo: 'brasil', estados: [] },
    },
    produtos: [
      { id: 'revisao', nome: 'Revisão de juros abusivos do empréstimo pessoal', ativo: true,
        descricao: 'Confere se o empréstimo pessoal teve juros acima do razoável. Se teve, o advogado entra com uma ação pedindo de volta o que foi cobrado a mais nos últimos dez anos. Não é empréstimo novo.',
        financeiras: [...FINANCEIRAS_ATENVO],
        podeDizer: 'Como a revisão funciona, que não é dinheiro novo, que vale também para empréstimo já quitado, quais financeiras entram.',
        naoPodeDizer: 'Quanto o cliente vai receber, o prazo exato do processo, que o resultado é garantido.' },
      { id: 'rmc', nome: 'Cancelamento do cartão consignado (RMC/RCC)', ativo: true,
        descricao: 'O cartão consignado que desconta todo mês direto do benefício: pede o cancelamento do desconto e o ressarcimento do que já foi descontado.',
        podeDizer: 'O que é o cartão RMC/RCC e que dá para pedir o cancelamento e o ressarcimento.',
        naoPodeDizer: 'Valores do ressarcimento e prazos.' },
      { id: 'emprestimo', nome: 'Empréstimo', ativo: false,
        descricao: 'Análise de empréstimo: a análise é pré-aprovada, o valor só sai depois da documentação, e o atendente conclui por ligação.',
        podeDizer: 'Que a análise é gratuita e pré-aprovada, e quais documentos precisa.',
        naoPodeDizer: 'O valor liberado antes dos documentos e da análise do atendente.' },
      { id: 'portabilidade', nome: 'Portabilidade', ativo: false,
        descricao: 'Levar o empréstimo para outro banco com condição melhor. Quem confirma se é possível é o atendente, depois de olhar o benefício.',
        podeDizer: 'Que a portabilidade é uma possibilidade, a ser confirmada pelo atendente.',
        naoPodeDizer: 'Que a portabilidade está garantida, taxas e valores.' },
      { id: 'fechados', nome: 'Clientes que já fecharam', ativo: true,
        descricao: 'Para quem já é cliente: responde sobre o andamento do processo e deixa avisado quem cuida do caso.',
        podeDizer: 'Que o processo segue, o prazo médio da empresa e que quem cuida do caso dá o retorno.',
        naoPodeDizer: 'Data certa de quando termina, valores, e qualquer pedido de pagamento.' },
    ],
    qualificacao: {
      perguntas: [
        { id: 'beneficio', texto: 'O senhor recebe algum benefício do INSS, como aposentadoria ou pensão?', tipo: 'sim_nao', seNao: 'segue', ativa: true },
        { id: 'financeiras', texto: 'O senhor tem, ou já teve, empréstimo pessoal em alguma destas: {financeiras_ou}?', tipo: 'lista', seNao: 'nao_elegivel', ativa: true },
        { id: 'cartao', texto: 'E no seu benefício, tem desconto de cartão consignado, aquele RMC ou RCC?', tipo: 'sim_nao', seNao: 'segue', ativa: true },
        { id: 'nome', texto: 'Qual é o seu nome completo?', tipo: 'nome', seNao: 'segue', ativa: true },
        { id: 'cpf', texto: 'Pode me enviar o seu CPF, só os números?', tipo: 'cpf', seNao: 'segue', ativa: true },
      ],
      naoElegivel: 'Entendi. Pelo que o senhor me contou, hoje a gente não tem como ajudar nesse caso. Se mudar alguma coisa, é só me chamar aqui, tá?',
      arquivarNaoElegivel: true,
    },
    documentos: {
      ativo: true,
      itens: [
        { id: 'identidade', rotulo: 'RG ou CNH (frente e verso)', ativo: true, obrigatorio: true, dica: 'Foto do celular serve, com a frente e o verso.' },
        { id: 'comprovante', rotulo: 'Comprovante de residência', ativo: true, obrigatorio: true, dica: 'Recente. Se estiver no nome de outra pessoa da casa, a gente faz uma declaração.' },
        { id: 'email', rotulo: 'E-mail', ativo: true, obrigatorio: true, dica: 'Para o atendente mandar o contrato.' },
        { id: 'extrato_inss', rotulo: 'Extrato de empréstimos do INSS (Meu INSS)', ativo: true, obrigatorio: false, dica: 'Quem não souber tirar, ela oferece que um atendente entre com a senha do gov.br e pegue, ou uma ligação.' },
      ],
      mesesComprovante: 2, aceitaTerceiro: true, ajudaInssPorLigacao: true, senhaGovbr: true,
    },
    equipe: {
      ligacao: true, mensagem: true, perguntaPeriodo: true,
      distribuicao: 'equipe_do_numero', responsavelFixo: null, atendentes: [], avisar: [],
      pediuPessoa: 'passa', valorPerguntadoVezes: 2,
    },
    tom: { tratamento: 'senhor', emojiNaSaudacao: true, maxBolhas: 2, maxCaracteres: 150, audio: true, apresentacaoEmAudio: true, maxAudiosPorEtapa: 2, risadaNoAudio: true },
    textos: TEXTOS_BASE.map((t) => ({ ...t })),
    retomadas: { ativo: true, parouNoMeioHoras: 3, segundaTentativaHoras: 24, toques: true, diasDosToques: [1, 3, 6], tetoDia: 1, tetoSemana: 3, tentarDepoisDoNao: true },
    horarios: { dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00', manha: ['09:00', '12:00'], tarde: ['13:00', '18:00'], janelaEnvio: ['09:00', '19:30'], feriados: true, foraDoHorario: 'responde_e_avisa' },
    proibido: {
      valores: true, prazosExatos: true, prometerAprovacao: true, urgencia: true, naoRepeteSenha: true,
      frases: ['última chance', 'é rapidinho', 'pode confiar', 'garantido'], termos: [],
    },
    modelo: { conversa: 'gemini-3.6-flash', documentos: 'gemini-3.6-flash', dificil: 'gemini-pro-latest', maxChamadasDia: 500 },
    inicio: { esperaSeg: 15, soComGatilho: false, gatilhos: [] },
    roteiro: { texto: '', regras: '' },
    assinatura: { ativa: false, texto: '{assistente}, da {empresa}' },
    audioModo: { modo: 'igual_ao_lead' },
    papel: { tipo: 'principal', quandoReceber: [], descricao: '', podePassarPara: [] },
    catalogo: { usar: false, produtoIds: [], maxPorResposta: 2 },
  };
}

/** A BIA DA REVIZA, como no sistema que a Reviza usava antes (o agente "COMERCIAL REVIZA RS"): o roteiro, as regras, as 8
 *  perguntas e os 63 gatilhos de lá, com os dados do escritório que estão no roteiro. Nasce desligada e sem chave. */
export function irisDaBia(): IrisConfig {
  const base = irisPreConfigurada('Reviza');
  return {
    ...base,
    identidade: {
      ...base.identidade, assistente: 'Bia', rotulo: 'IA de pré-análise jurídica', empresa: 'Reviza',
      papel: 'Faz a pré-análise jurídica no WhatsApp: convida o cliente para a revisão dos juros do empréstimo, pede os 3 documentos (histórico de empréstimo consignado, RG ou CNH e comprovante de endereço), confirma os bancos, pede o extrato de cada banco e passa para um especialista humano.',
      respostaRobo: 'Sou a {assistente}, {rotulo} da {empresa}. Um especialista humano assume depois. Se preferir falar com uma pessoa agora, é só me pedir.',
    },
    empresa: {
      ...base.empresa,
      endereco: 'Rua Uruguai, 287, sala 21 — Centro Histórico', cidade: 'Porto Alegre/RS', advogado: 'Dr. Gregory Pimentel', oab: 'OAB/RS 121.383',
      honorarios: 'Você não paga nada antes. Os honorários são de 30% somente sobre o valor que for recuperado. Se não recuperar, não paga nada.',
      fatos: BIA_FAQ.map((f, n) => ({ id: `faq-${n + 1}`, pergunta: f.pergunta, resposta: f.resposta })),
      regioes: { modo: 'brasil', estados: [] },
    },
    documentos: {
      ...base.documentos,
      itens: base.documentos.itens.map((d) => (d.id === 'email' ? { ...d, ativo: false, obrigatorio: false } : d.id === 'extrato_inss' ? { ...d, rotulo: 'Histórico de empréstimo consignado (Meu INSS)', obrigatorio: true } : d)),
      senhaGovbr: false,
    },
    tom: { ...base.tom, tratamento: 'voce', audio: true },
    horarios: { ...base.horarios, dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '23:59', janelaEnvio: ['08:00', '20:00'] },
    proibido: { ...base.proibido, termos: ['simulação'] },
    inicio: { esperaSeg: 15, soComGatilho: true, gatilhos: [...BIA_GATILHOS] },
    roteiro: { texto: BIA_ROTEIRO, regras: BIA_REGRAS },
    assinatura: { ativa: false, texto: '{assistente}, da {empresa}' },
    audioModo: { modo: 'sempre' },
  };
}

/** Versão nova "em branco": o mesmo esqueleto, sem produto, sem pergunta e só com a abertura. */
export function irisEmBranco(empresa = 'Reviza'): IrisConfig {
  const base = irisPreConfigurada(empresa);
  return {
    ...base,
    identidade: { ...base.identidade, papel: '', instrucoes: '' },
    empresa: { ...base.empresa, fatos: [] },
    produtos: base.produtos.map((p) => ({ ...p, ativo: false })),
    qualificacao: { perguntas: [], naoElegivel: '', arquivarNaoElegivel: false },
    documentos: { ...base.documentos, ativo: false },
    textos: base.textos.filter((t) => t.grupo === 'abertura'),
  };
}

/* ============================== texto com as variáveis preenchidas ============================== */
const ouLista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`);
const eLista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
export const VARIAVEIS: { chave: string; desc: string }[] = [
  { chave: 'assistente', desc: 'o nome dela' }, { chave: 'rotulo', desc: 'como ela se chama (atendente virtual)' },
  { chave: 'empresa', desc: 'o nome da empresa' }, { chave: 'primeiro_nome', desc: 'o primeiro nome do cliente' },
  { chave: 'tratamento', desc: 'o senhor / a senhora' }, { chave: 'atendente', desc: 'quem cuida do caso' },
  { chave: 'financeiras', desc: 'a lista das financeiras' }, { chave: 'prazo_processo', desc: 'o prazo médio do processo' },
  { chave: 'honorarios', desc: 'quanto e quando o cliente paga' }, { chave: 'razao_social', desc: 'a razão social' },
  { chave: 'cnpj', desc: 'o CNPJ' }, { chave: 'endereco', desc: 'o endereço' }, { chave: 'cidade', desc: 'a cidade' },
  { chave: 'advogado', desc: 'o advogado responsável' }, { chave: 'oab', desc: 'a OAB do advogado' },
];
/** O texto como o cliente leria, com dados de exemplo no lugar do cliente e do atendente. */
export function exemplo(texto: string, c: IrisConfig): string {
  const fin = c.produtos.find((p) => p.id === 'revisao')?.financeiras ?? [];
  const atd = c.equipe.atendentes[0]?.nome?.split(' ')[0] || 'Bianca';
  const mapa: Record<string, string> = {
    assistente: c.identidade.assistente || 'Iris', rotulo: c.identidade.rotulo || 'atendente virtual', empresa: c.identidade.empresa || 'Reviza',
    primeiro_nome: 'Maria', tratamento: c.tom.tratamento === 'senhor' ? 'A senhora' : 'Você', pronome: 'ela', atendente: atd,
    periodo: 'de manhã', turno: 'de manhã e à tarde', opcoes: 'de manhã ou de tarde', dia: 'Amanhã', quando: 'de manhã',
    financeiras: eLista(fin), financeiras_ou: ouLista(fin), prazo_processo: c.empresa.prazoProcesso || '[prazo do processo]',
    saudacao: 'Maria', honorarios: c.empresa.honorarios || '[quanto e quando paga]', razao_social: c.empresa.razaoSocial || '[razão social]',
    cnpj: c.empresa.cnpj || '[CNPJ]', endereco: c.empresa.endereco || '[endereço]', cidade: c.empresa.cidade || '[cidade]',
    advogado: c.empresa.advogado || '[advogado]', oab: c.empresa.oab || '[OAB]',
  };
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => mapa[k] ?? m);
}

/* ============================== pronta para ligar? ============================== */
export interface ItemProntidao { id: string; titulo: string; ok: boolean; detalhe: string; secao: string; obrigatorio: boolean }
export function prontidao(v: VersaoIris, numeros: NumeroIris[]): ItemProntidao[] {
  const c = v.config;
  const ativos = new Set(c.produtos.filter((p) => p.ativo).map((p) => p.id));
  const precisaAdvogado = ativos.has('revisao') || ativos.has('rmc') || ativos.has('fechados');
  const faltaEmpresa = [
    !c.identidade.empresa.trim() && 'nome da empresa', !c.empresa.razaoSocial.trim() && 'razão social', !c.empresa.cnpj.trim() && 'CNPJ',
    !c.empresa.cidade.trim() && 'cidade', precisaAdvogado && !c.empresa.advogado.trim() && 'advogado responsável',
    precisaAdvogado && !c.empresa.oab.trim() && 'OAB', !c.empresa.honorarios.trim() && 'quanto e quando se paga',
    ativos.has('fechados') && !c.empresa.prazoProcesso.trim() && 'prazo médio do processo',
  ].filter(Boolean) as string[];
  const gruposUsados = new Set(textosDaVersao(c).map((t) => t.grupo));
  const pendentes = c.textos.filter((t) => gruposUsados.has(t.grupo) && !t.aprovado).length;
  const recebem = c.equipe.atendentes.filter((a) => a.recebe).length;
  const meus = numeros.filter((n) => n.versaoId === v.id);
  return [
    { id: 'chave', titulo: 'Chave do Google guardada', ok: !!v.chaveDefinidaEm, secao: 'avancado', obrigatorio: true,
      detalhe: v.chaveDefinidaEm ? 'A chave está no cofre. Ninguém consegue ler de volta.' : 'A Iris conversa pelo Gemini, do Google, com a chave da própria empresa.' },
    { id: 'empresa', titulo: 'Fatos da empresa preenchidos', ok: faltaEmpresa.length === 0, secao: 'empresa', obrigatorio: true,
      detalhe: faltaEmpresa.length ? `Falta: ${faltaEmpresa.join(', ')}.` : 'Ela só diz o que está cadastrado aqui.' },
    { id: 'produtos', titulo: 'Pelo menos um assunto que ela atende', ok: ativos.size > 0, secao: 'oferece', obrigatorio: true,
      detalhe: ativos.size ? `${ativos.size} ${ativos.size === 1 ? 'assunto ligado' : 'assuntos ligados'}.` : 'Ligue o que a empresa oferece.' },
    // como no Atenvo: rascunho não é usado (ela segue sem ele), então não impede ligar — só avisa
    { id: 'textos', titulo: 'Rascunhos de texto', ok: pendentes === 0, secao: 'textos', obrigatorio: false,
      detalhe: pendentes ? `${pendentes} ${pendentes === 1 ? 'texto ainda é rascunho' : 'textos ainda são rascunho'}: ela não usa até alguém aprovar (igual ao Atenvo).` : 'Todos os textos que ela usa estão aprovados.' },
    { id: 'equipe', titulo: 'Quem recebe os clientes', ok: recebem > 0 || c.equipe.distribuicao === 'equipe_do_numero', secao: 'equipe', obrigatorio: true,
      detalhe: c.equipe.distribuicao === 'equipe_do_numero' ? 'Vai para a equipe dona de cada número.' : recebem ? `${recebem} ${recebem === 1 ? 'pessoa recebe' : 'pessoas recebem'}.` : 'Escolha quem recebe os clientes prontos.' },
    { id: 'numeros', titulo: 'Números escolhidos', ok: meus.length > 0, secao: 'resumo', obrigatorio: true,
      detalhe: meus.length ? `${meus.length} ${meus.length === 1 ? 'número' : 'números'} com esta IA.` : 'Escolha em quais números esta IA atende.' },
  ];
}

/** Os textos que esta versão usa: os dos assuntos ligados e os gerais. */
export function textosDaVersao(c: IrisConfig): TextoIris[] {
  const ativos = new Set(c.produtos.filter((p) => p.ativo).map((p) => p.id));
  return c.textos.filter((t) => (t.grupo === 'produto_revisao' ? ativos.has('revisao')
    : t.grupo === 'produto_rmc' ? ativos.has('rmc')
    : t.grupo === 'fechados' ? ativos.has('fechados')
    : t.grupo === 'documentos' ? c.documentos.ativo
    : t.grupo === 'senha' ? c.documentos.ativo && c.documentos.senhaGovbr
    : t.grupo === 'acompanhamento' || t.grupo === 'retomadas' ? c.retomadas.ativo
    : true));
}

/* ============================== arquivo (exportar / importar) ============================== */
export interface ArquivoIris { tipo: 'iris-versao'; formato: 1; nome: string; descricao: string; feitoEm: string; config: IrisConfig }
export function exportarVersao(v: VersaoIris): ArquivoIris {
  // nunca leva a chave nem os números: só a configuração
  return { tipo: 'iris-versao', formato: 1, nome: v.nome, descricao: v.descricao, feitoEm: new Date().toISOString(), config: v.config };
}
const str = (x: unknown, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : '');
/** Lê um arquivo de fora (fonte NÃO confiável): só o que a tela conhece, cada campo do tipo certo; o resto vem da pré-configurada. */
export function lerArquivo(bruto: string): { ok: true; nome: string; descricao: string; config: IrisConfig } | { ok: false; erro: string } {
  if (bruto.length > 2_000_000) return { ok: false, erro: 'O arquivo é grande demais.' };
  let j: unknown; try { j = JSON.parse(bruto); } catch { return { ok: false, erro: 'Não é um arquivo de configuração da Iris.' }; }
  const a = j as Partial<ArquivoIris>;
  if (!a || a.tipo !== 'iris-versao' || typeof a.config !== 'object' || !a.config) return { ok: false, erro: 'Não é um arquivo de configuração da Iris.' };
  if (/"(chave|api_?key|secret|token)"\s*:/i.test(bruto)) return { ok: false, erro: 'O arquivo traz uma chave. Por segurança, a chave nunca vai em arquivo: cole-a direto na tela.' };
  const base = irisPreConfigurada();
  const c = mesclar(base, a.config as unknown) as IrisConfig;
  return { ok: true, nome: str(a.nome, 80) || 'Versão importada', descricao: str(a.descricao, 300), config: c };
}
/** Junta o que veio por cima do modelo, só onde o tipo bate (texto com texto, número com número, lista com lista). Item de
 *  lista é lido pelo próprio molde (o 1º do modelo, ou o de MOLDES quando o modelo vem vazio): chave que faltar no item
 *  fica vazia — nunca copiada de outro item —, e as OPCIONAIS só existem se vierem. */
const MOLDES: Record<string, Record<string, unknown>> = {
  'equipe.atendentes': { usuarioId: '', nome: '', turno: 'dia', recebe: false },
};
const OPCIONAIS = new Set(['financeiras']);
/** os textos longos (o roteiro e as regras da empresa): até 30 mil letras; o resto, até 4 mil */
const LONGOS = new Set(['roteiro.texto', 'roteiro.regras']);
function vazioDe(m: unknown): unknown {
  if (Array.isArray(m)) return [];
  if (m && typeof m === 'object') return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, vazioDe(v)]));
  return typeof m === 'string' ? '' : typeof m === 'number' ? 0 : typeof m === 'boolean' ? false : null;
}
function mesclar(modelo: unknown, veio: unknown, caminho = ''): unknown {
  if (Array.isArray(modelo)) {
    if (!Array.isArray(veio)) return modelo;
    const molde = MOLDES[caminho] ?? modelo[0];
    if (molde === undefined) return veio.filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 200)).slice(0, 200);
    if (molde === null || typeof molde !== 'object') return veio.filter((x) => typeof x === typeof molde).slice(0, 300);
    return veio.slice(0, 300).filter((x) => !!x && typeof x === 'object' && !Array.isArray(x)).map((x) => {
      const it = x as Record<string, unknown>; const saida: Record<string, unknown> = {};
      for (const [k, m] of Object.entries(molde as Record<string, unknown>)) {
        if (k in it) saida[k] = mesclar(m, it[k], `${caminho}.${k}`);
        else if (!OPCIONAIS.has(k)) saida[k] = vazioDe(m);
      }
      return saida;
    });
  }
  if (modelo && typeof modelo === 'object') {
    if (!veio || typeof veio !== 'object' || Array.isArray(veio)) return modelo;
    const saida: Record<string, unknown> = {};
    for (const k of Object.keys(modelo as Record<string, unknown>)) {
      saida[k] = mesclar((modelo as Record<string, unknown>)[k], (veio as Record<string, unknown>)[k], caminho ? `${caminho}.${k}` : k);
    }
    return saida;
  }
  if (typeof modelo === 'string') return typeof veio === 'string' ? veio.slice(0, LONGOS.has(caminho) ? 30000 : 4000) : (veio === null ? null : modelo);
  if (typeof modelo === 'number') return typeof veio === 'number' && Number.isFinite(veio) ? veio : modelo;
  if (typeof modelo === 'boolean') return typeof veio === 'boolean' ? veio : modelo;
  if (modelo === null) return typeof veio === 'string' ? veio.slice(0, 200) : null;
  return modelo;
}

/* ============================== banco ============================== */
type Row = Record<string, unknown>;
const ligado = () => !!supabase && (isPrevia || temRecurso('iris'));
/** O motor da Iris (as funções que conversam com o cliente) já está no servidor desta instalação? Sem ele a tela serve
 *  para configurar, mas ligar a Iris num número fica travado: o Atendimento acharia que a IA está atendendo e ninguém
 *  responderia. */
export const temMotorIris = () => temRecurso('iris-motor');
const CHAVE = ['iris-versoes'];
const CHAVE_NUM = ['iris-numeros'];

/* A configuração mora dentro de ia_agentes.comportamentos (jsonb que já existe no servidor desde a 93): `iris` (a
   configuração inteira), `iris_descricao` e `iris_origem`. Assim a tela funciona sem mudar o banco; o motor lê dali. */
function mapVersao(r: Row): VersaoIris {
  const comp = (r.comportamentos as Row | null) ?? {};
  const cfg = (comp.iris as IrisConfig | null) ?? null;
  return {
    id: String(r.id), nome: String(r.nome ?? 'Iris'), descricao: String(comp.iris_descricao ?? ''),
    origem: ((comp.iris_origem as OrigemVersao) || 'nova'), ativa: !!r.ativo,
    chaveDefinidaEm: (r.chave_definida_em as string) || null, criadoEm: String(r.criado_em ?? ''), atualizadoEm: String(r.atualizado_em ?? r.criado_em ?? ''),
    config: cfg ? (mesclar(irisPreConfigurada(), cfg) as IrisConfig) : irisPreConfigurada(),
  };
}
/** o que o motor antigo (ia_agentes) também lê, para as duas leituras nunca discordarem */
function colunasDoMotor(c: IrisConfig, descricao: string, origem: OrigemVersao): Row {
  return {
    modelo: c.modelo.conversa, provedor: 'gemini', persona_prompt: c.identidade.instrucoes,
    comportamentos: {
      iris: c, iris_descricao: descricao, iris_origem: origem,
      horario: { ativo: true, inicio: c.horarios.inicio, fim: c.horarios.fim, dias: c.horarios.dias },
      janela: { inicio: c.horarios.janelaEnvio[0], fim: c.horarios.janelaEnvio[1] },
      nudges_ativos: c.retomadas.ativo, max_chamadas_dia: c.modelo.maxChamadasDia,
      proibidos: c.proibido.termos, permitir_emojis: c.tom.emojiNaSaudacao, simular_digitacao: true,
      modelo_docs: c.modelo.documentos, modelo_pro: c.modelo.dificil,
      espera_seg: c.inicio.esperaSeg, gatilhos_inicio: c.inicio.soComGatilho ? c.inicio.gatilhos : [], audio_modo: c.audioModo.modo,
      assinatura: c.assinatura.ativa ? c.assinatura.texto : null, papel: c.papel.tipo,
    },
  };
}

export function useVersoesIris() {
  return useQuery({
    queryKey: CHAVE, enabled: ligado(), staleTime: 15_000,
    queryFn: async (): Promise<VersaoIris[]> => {
      const { data, error } = await supabase!.from('ia_agentes')
        .select('id, nome, ativo, chave_definida_em, criado_em, atualizado_em, comportamentos')
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as Row[]) ?? []).map(mapVersao);
    },
  });
}

export function useNumerosIris() {
  return useQuery({
    queryKey: CHAVE_NUM, enabled: ligado(), staleTime: 15_000,
    queryFn: async (): Promise<NumeroIris[]> => {
      const { data, error } = await supabase!.from('canais')
        .select('id, nome_interno, numero_conectado, status_integracao, bot_canal_config(ia_enabled, ia_modo_teste, ia_agente_id, numeros_teste)')
        .eq('tipo', 'whatsapp').neq('status_integracao', 'removido').order('nome_interno');
      if (error) throw new Error(error.message);
      return ((data as Row[]) ?? []).map((r) => {
        const raw = r.bot_canal_config as Row | Row[] | null;
        const cfg = (Array.isArray(raw) ? raw[0] : raw) ?? {};
        return {
          id: String(r.id), nome: String(r.nome_interno ?? 'Número'), numero: (r.numero_conectado as string) || null,
          conectado: r.status_integracao === 'conectado', versaoId: (cfg.ia_agente_id as string) || null,
          ligado: !!cfg.ia_enabled, modoTeste: cfg.ia_modo_teste !== false,
          numerosTeste: Array.isArray(cfg.numeros_teste) ? (cfg.numeros_teste as string[]) : [],
        };
      });
    },
  });
}

export function useSalvarVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; nome: string; descricao: string; origem: OrigemVersao; config: IrisConfig }) => {
      const { error } = await supabase!.from('ia_agentes')
        .update({ nome: v.nome.trim() || 'Iris', ...colunasDoMotor(v.config, v.descricao, v.origem), atualizado_em: new Date().toISOString() })
        .eq('id', v.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); },
  });
}

export function useCriarVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { nome: string; descricao: string; origem: OrigemVersao; config: IrisConfig }): Promise<string> => {
      const { data, error } = await supabase!.from('ia_agentes')
        .insert({ organizacao_id: ORG_REVIZA, nome: v.nome.trim() || 'Iris', ativo: false, ...colunasDoMotor(v.config, v.descricao, v.origem) })
        .select('id').single();
      if (error) throw new Error(error.message);
      return String((data as Row).id);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); },
  });
}

export function useExcluirVersao() {
  const qc = useQueryClient();
  return useMutation({
    // no banco, apagar a versão desliga a Iris dos números dela e apaga a chave do cofre
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('ia_agentes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); void qc.invalidateQueries({ queryKey: CHAVE_NUM }); },
  });
}

export function useAtivarVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; ativa: boolean }) => {
      const { error } = await supabase!.from('ia_agentes').update({ ativo: v.ativa }).eq('id', v.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); },
  });
}

export function useSalvarChaveIris() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; chave: string }) => {
      const { error } = await supabase!.rpc('ia_agente_salvar_chave', { p_agente: v.id, p_chave: v.chave.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE }); },
  });
}

/** Quais números atendem com esta versão (a lista inteira: os que ficarem de fora deixam de usá-la). */
export function useNumerosDaVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; canais: string[] }) => {
      const { error } = await supabase!.rpc('ia_agente_vincular_canais', { p_agente: v.id, p_canais: v.canais });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE_NUM }); },
  });
}

export function useLigarNumero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { canal: string; ligado: boolean }) => {
      const { error } = await supabase!.rpc('ia_canal_ativar', { p_canal: v.canal, p_ativo: v.ligado });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE_NUM }); },
  });
}

export function useModoTesteNumero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { canal: string; teste: boolean; numeros: string[] }) => {
      const { error } = await supabase!.rpc('ia_canal_modo_teste', { p_canal: v.canal, p_teste: v.teste, p_numeros: v.numeros });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: CHAVE_NUM }); },
  });
}

export interface MetricasIris { conversasAtivas: number; respostasHoje: number; retomadasHoje: number; passadasEquipe7d: number }
export function useMetricasIris(id: string | null) {
  return useQuery({
    queryKey: ['iris-metricas', id], enabled: ligado() && !!id, refetchInterval: 60_000,
    queryFn: async (): Promise<MetricasIris> => {
      const { data, error } = await supabase!.rpc('ia_agente_metricas', { p_agente: id });
      if (error) throw new Error(error.message);
      const r = ((Array.isArray(data) ? data[0] : data) ?? {}) as Row;
      return { conversasAtivas: Number(r.sessoes_ativas ?? 0), respostasHoje: Number(r.chamadas_hoje ?? 0), retomadasHoje: Number(r.nudges_hoje ?? 0), passadasEquipe7d: Number(r.handoffs_7d ?? 0) };
    },
  });
}

export interface BolhaTeste { de: 'cliente' | 'iris'; texto: string; audio?: boolean; nota?: string }
export function useConversarIris() {
  return useMutation({
    mutationFn: async (v: { id: string; historico: BolhaTeste[] }): Promise<BolhaTeste[]> => {
      const { data, error } = await supabase!.functions.invoke('ia-agente-conversar', {
        body: { agente_id: v.id, mensagens: v.historico.map((b) => ({ papel: b.de === 'cliente' ? 'user' : 'model', texto: b.texto })) },
      });
      if (error) throw new Error(error.message);
      const r = data as { bolhas?: { texto: string; bloqueada?: boolean; audio?: boolean }[]; erro?: string } | null;
      if (r?.erro) throw new Error(r.erro);
      return (r?.bolhas ?? []).map((b) => ({ de: 'iris' as const, texto: b.texto, audio: !!b.audio, nota: b.bloqueada ? 'segurada pela trava: não iria para o cliente' : undefined }));
    },
  });
}

export function useTestarChaveIris() {
  return useMutation({
    mutationFn: async (id: string): Promise<{ ok: boolean; detalhe: string }> => {
      const { data, error } = await supabase!.functions.invoke('ia-agente-testar', { body: { agente_id: id } });
      if (error) return { ok: false, detalhe: error.message };
      const r = data as { ok?: boolean; erro?: string; modelo?: string } | null;
      return r?.ok ? { ok: true, detalhe: `O Google respondeu${r.modelo ? ` (${r.modelo})` : ''}.` } : { ok: false, detalhe: r?.erro || 'O Google não respondeu.' };
    },
  });
}
