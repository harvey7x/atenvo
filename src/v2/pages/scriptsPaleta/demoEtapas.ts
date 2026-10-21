import { SCRIPTS_REAL, definirEtapasDemoScripts, type EtapaItem, type Script, type ScriptCategoria } from '@/data/scripts';
import { resumirEtapas, type ResumoEtapas } from '../../hooks/scriptsResumo';
import type { EtapaPrevia } from './etapas';

/* ------------------------------------------------------------------
   DEMO É O CONTRATO — scripts de amostra do inbox (sem backend).
   sd-1…sd-7 são os MESMOS que viviam em WhatsApp.tsx (texto intacto;
   o mobile repete sd-1…sd-4). sd-8…sd-12 espelham títulos reais do
   arsenal, em caixa alta como o time cadastra. Cada um tem a sua
   SEQUÊNCIA (texto com variáveis, áudio, imagem, vídeo, documento) —
   registrada no compositor para a prévia e o "Usar este script"
   mostrarem exatamente as mesmas mensagens.
   ------------------------------------------------------------------ */

const base = { canais: ['whatsapp'], ativo: true, autorId: null, criadoEm: '', atualizadoEm: '' } as const;
const mk = (s: Pick<Script, 'id' | 'titulo' | 'descricao' | 'conteudo' | 'categoriaId' | 'favorito' | 'tags'>): Script =>
  ({ ...base, canais: [...base.canais], ...s });

export const CATEGORIAS_DEMO: ScriptCategoria[] = [{ id: 'sdc-1', nome: 'Necessidades', ordem: 1 }];

export const SCRIPTS_DEMO: Script[] = [
  mk({ id: 'sd-1', titulo: 'Boas-vindas ao cliente', descricao: null, conteudo: 'Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?', categoriaId: null, favorito: true, tags: [] }),
  mk({ id: 'sd-2', titulo: 'Pedir CPF', descricao: null, conteudo: 'Para conferir os descontos no benefício eu preciso do seu CPF, pode me enviar?', categoriaId: null, favorito: true, tags: [] }),
  mk({ id: 'sd-3', titulo: 'Explicar o processo', descricao: null, conteudo: 'A análise é simples: conferimos seu benefício, identificamos descontos indevidos e cuidamos do cancelamento e do ressarcimento.', categoriaId: null, favorito: false, tags: [] }),
  mk({ id: 'sd-4', titulo: 'Agendar ligação', descricao: null, conteudo: 'Posso te ligar para explicar melhor. Qual o melhor horário para você?', categoriaId: null, favorito: false, tags: [] }),
  // espelho do arsenal REAL: títulos em caixa alta como o time cadastra, categoria própria,
  // descrição e mídia — é assim que o seletor aparece em produção.
  mk({ id: 'sd-5', titulo: 'PEGAR DOCS MEUS INSS', descricao: 'COMO PEGAR OS DOCUMENTOS DO MEU INSS', conteudo: 'Passo a passo para baixar os documentos no Meu INSS.', categoriaId: 'sdc-1', favorito: false, tags: ['documentos'] }),
  mk({ id: 'sd-6', titulo: 'GERAR CÓDIGO DE ACESSO GOV', descricao: null, conteudo: 'Como gerar o código de acesso do GOV.', categoriaId: 'sdc-1', favorito: false, tags: ['gov'] }),
  mk({ id: 'sd-7', titulo: 'ASSINANDO PELO CELULAR', descricao: 'Como assinar as proc pelo celular', conteudo: 'Vídeo mostrando a assinatura pelo celular.', categoriaId: 'sdc-1', favorito: false, tags: ['assinatura'] }),
  mk({ id: 'sd-8', titulo: 'PORTAL MIR PELO CELULAR', descricao: null, conteudo: 'Como acessar o Portal MIR pelo celular.', categoriaId: 'sdc-1', favorito: false, tags: ['mir'] }),
  mk({ id: 'sd-9', titulo: 'CONTRATOS CREFISA', descricao: 'Como pedir os contratos na Crefisa', conteudo: 'Passo a passo para solicitar os contratos na Crefisa.', categoriaId: 'sdc-1', favorito: false, tags: ['contratos', 'crefisa'] }),
  mk({ id: 'sd-10', titulo: 'VIDEO DA FACTA', descricao: 'Como pegar seus contratos na Facta', conteudo: 'Vídeo com o passo a passo da Facta.', categoriaId: 'sdc-1', favorito: false, tags: ['contratos', 'facta'] }),
  mk({ id: 'sd-11', titulo: 'ALTERAR NUMERO BMG', descricao: null, conteudo: 'Como alterar o número de celular cadastrado no BMG.', categoriaId: 'sdc-1', favorito: false, tags: ['bmg'] }),
  mk({ id: 'sd-12', titulo: 'AUMENTAR NIVEL GOV', descricao: 'Como subir a conta gov.br para prata ou ouro', conteudo: 'Como aumentar o nível da conta gov.br.', categoriaId: 'sdc-1', favorito: false, tags: ['gov'] }),
];

let seq = 0;
const tx = (conteudo: string): EtapaPrevia => ({ id: `sde-${++seq}`, tipo: 'texto', conteudo });
const md = (tipo: Exclude<EtapaItem['tipo'], 'texto'>, nome: string, mime: string, tamanho: number, conteudo = '', duracao?: number): EtapaPrevia =>
  ({ id: `sde-${++seq}`, tipo, conteudo, nome, mime, tamanho, storagePath: `demo/${nome}`, ...(duracao ? { duracao } : {}) });

// áudio/vídeo de amostra trazem a duração (o atendente decide pelo tempo, não pelo tamanho)
export const ETAPAS_DEMO: Record<string, EtapaPrevia[]> = {
  'sd-1': [
    tx('Olá {{nome_cliente}}! Aqui é {{seu_nome}}, da {{empresa}}. Como posso ajudar?'),
    md('audio', 'boas-vindas-atendimento.ogg', 'audio/ogg', 61_440, '', 42),
  ],
  'sd-2': [tx('Para conferir os descontos no benefício eu preciso do seu CPF, pode me enviar?')],
  'sd-3': [
    tx('A análise é simples: conferimos seu benefício, identificamos descontos indevidos e cuidamos do cancelamento e do ressarcimento.'),
    md('documento', 'como-funciona-a-revisao.pdf', 'application/pdf', 248_000),
  ],
  'sd-4': [
    tx('Posso te ligar para explicar melhor. Qual o melhor horário para você?'),
    tx('Se preferir, eu ligo neste mesmo número: {{telefone}}.'),
    // variável que o compositor NÃO preenche sozinho: mantém visível no demo o estado
    // âmbar "ajuste antes de enviar" (aviso na etapa + rodapé) — é assim em produção
    tx('Na ligação eu confirmo com você o valor da parcela: {{valor_parcela}}.'),
  ],
  'sd-5': [
    tx('Passo a passo para baixar os documentos no Meu INSS.'),
    md('imagem', 'meu-inss-tela-inicial.jpg', 'image/jpeg', 412_000, '1. Entre no Meu INSS com o CPF e a senha do gov.br'),
    md('video', 'meu-inss-extrato-emprestimos.mp4', 'video/mp4', 6_400_000, '2. Toque em *Extrato de Empréstimos* e baixe o PDF', 58),
    tx('Depois é só me mandar o PDF por aqui, {{primeiro_nome_cliente}}. Qualquer dúvida, me chama!'),
  ],
  'sd-6': [
    tx('Como gerar o código de acesso do GOV.'),
    md('video', 'gerar-codigo-acesso-gov.mp4', 'video/mp4', 8_600_000, '', 84),
    tx('Assim que gerar o código, me manda aqui que eu sigo com a sua análise.'),
  ],
  'sd-7': [
    md('video', 'assinatura-pelo-celular.mp4', 'video/mp4', 5_200_000, 'Vídeo mostrando a assinatura pelo celular.', 51),
    md('documento', 'procuracao-modelo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 96_000),
    md('audio', 'explicando-a-assinatura.ogg', 'audio/ogg', 74_000, '', 49),
  ],
  'sd-8': [
    tx('Vou te mostrar como entrar no Portal MIR pelo celular, {{primeiro_nome_cliente}}.'),
    md('imagem', 'portal-mir-pelo-celular.jpg', 'image/jpeg', 356_000, 'Abra o navegador do celular e entre no Portal MIR'),
    tx('Conseguiu entrar? Me avisa aqui que eu sigo com você.'),
  ],
  'sd-9': [
    tx('Passo a passo para solicitar os contratos na Crefisa.'),
    md('documento', 'contratos-crefisa.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 214_000),
    md('audio', 'explicacao-contratos-crefisa.ogg', 'audio/ogg', 68_000, '', 45),
  ],
  'sd-10': [
    tx('Segue o vídeo com o passo a passo para pegar seus contratos na Facta:'),
    md('video', 'contratos-facta.mp4', 'video/mp4', 9_800_000, '', 97),
    tx('Se travar em alguma tela, me manda um print que eu te ajudo.'),
  ],
  'sd-11': [
    tx('Para o código do BMG chegar, o celular cadastrado precisa ser o seu atual: {{telefone}}.'),
    md('imagem', 'bmg-alterar-celular.jpg', 'image/jpeg', 298_000, 'No app: *Perfil* → Dados pessoais → Celular'),
    tx('Trocou? Me avisa que eu peço o código de novo.'),
    md('audio', 'bmg-alterar-celular.ogg', 'audio/ogg', 52_000, '', 35),
  ],
  'sd-12': [
    tx('Sua conta gov.br precisa estar no nível *prata* ou *ouro* para liberar o extrato.'),
    md('video', 'nivel-gov-prata-ouro.mp4', 'video/mp4', 7_200_000, 'Validação pelo reconhecimento facial no app gov.br', 66),
    tx('Quando terminar, me avisa por aqui, {{primeiro_nome_cliente}}.'),
  ],
};

/** Resumo do demo pela MESMA regra do hook real (resumirEtapas). */
export const RESUMO_DEMO: Record<string, ResumoEtapas> = Object.fromEntries(
  Object.entries(ETAPAS_DEMO).map(([id, etapas]) => [id, resumirEtapas(etapas)]),
);

// o compositor do demo abre as mesmas sequências da prévia (produção nunca registra)
if (!SCRIPTS_REAL) definirEtapasDemoScripts(ETAPAS_DEMO);
