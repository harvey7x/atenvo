import type { WaContact, WaMessage } from '@/data/whatsappDemo';

/* ------------------------------------------------------------------
   Seed do demo do WhatsApp v2 — cenário do mockup pg-wa enriquecido:
   urgências com cronômetro, não-lidas, bot "◈ Matheo", áudio com
   transcrição (.transc), documento, quoted, etapa do Kanban, opt-out
   (Cleusa, contato 'wa-cleusa-ct' em relacionamento_bloqueio demo).
   Nada aqui toca backend: WA_REAL=false ⇒ ações locais.
   ------------------------------------------------------------------ */

const IN = (text: string, time: string, extra?: Partial<WaMessage>): WaMessage => ({ dir: 'in', text, time, ...extra });
const OUT = (text: string, time: string, extra?: Partial<WaMessage>): WaMessage => ({ dir: 'out', text, time, status: 'lida', ...extra });

export function seedWa(): WaContact[] {
  const agora = Date.now();
  const min = 60_000;
  const iso = (t: number) => new Date(t).toISOString();
  const base: WaContact = {
    id: '', name: '', phone: '', chip: 'LUIZA', time: '', unread: 0, tabs: [], status: 'Em atendimento',
    last: '', email: '', stage: '', resp: '', origin: 'WhatsApp', tags: [], lastInter: '', notes: '', doc: null, msgs: [],
    canalAtual: 'LUIZA', contatoId: null, respId: null, aguardando: false,
  };
  return [
    {
      ...base,
      id: 'wa-maria', name: 'Maria Aparecida Souza', phone: '5551988124407', contatoId: 'wa-maria-ct',
      time: '14:38', unread: 2, lastAtMs: agora - 4 * min, aguardando: true, aguardandoDesde: iso(agora - 4 * min),
      etapa: 'Documentação', etapaCor: '#f59e0b', respId: 'u-mock', iaAtiva: true, iaStatus: 'ativa', iaEtapa: 'coleta_docs',
      last: 'Áudio · 0:34', lastInter: 'há 4 min', tags: ['Urgente'], notes: 'Prefere áudio. A filha ajuda com o celular — ligar depois das 18h.',
      msgs: [
        IN('Boa tarde! Vi o anúncio de vocês sobre desconto no benefício.', '14:31', { tsISO: iso(agora - 11 * min), id: 'wm-1' }),
        OUT('Boa tarde, dona Maria! Aqui é o Matheo, da CAF Assessoria. Muitos aposentados têm descontos que valem a pena verificar. Posso conferir o seu?', '14:32', { tsISO: iso(agora - 10 * min), id: 'wm-2', origemBot: true }),
        IN('Pode sim, meu filho', '14:35', { tsISO: iso(agora - 7 * min), id: 'wm-3' }),
        IN('', '14:38', {
          tsISO: iso(agora - 4 * min), id: 'wm-4', tipo: 'audio',
          transcricao: 'Meu nome é Maria Aparecida, eu recebo aposentadoria desde 2019 e vi uns descontos que eu não reconheço.',
          ...( { seconds: 34 } as Partial<WaMessage>),
        }),
      ],
    },
    {
      ...base,
      id: 'wa-jose', name: 'José Carlos Ferreira', phone: '5551987770001', contatoId: 'wa-jose-ct',
      time: '14:02', unread: 1, lastAtMs: agora - 58 * min, aguardando: true, aguardandoDesde: iso(agora - 58 * min),
      /* sessão AINDA ATIVA com aguardando_humano = o estado âmbar VIVO (a IA está de pé,
         esperando um humano ajudar com a senha; se fosse 'pausada' o flag seria resto morto) */
      etapa: 'EM ATENDIMENTO', respId: null, chip: 'LUIZA', iaAtiva: true, iaStatus: 'ativa', iaEtapa: 'extratos', iaAguardando: 'auxilio_senha', precisaHumano: true,
      precisaHumanoMotivo: 'auxilio_senha', precisaHumanoEm: iso(agora - 57 * min),
      last: 'Não consegui entrar no aplicativo…', lastInter: 'há 58 min', tags: ['Revisão de contrato'],
      msgs: [
        IN('Não consegui entrar no aplicativo do banco, moço.', '14:02', { tsISO: iso(agora - 58 * min), id: 'wj-1' }),
      ],
    },
    {
      ...base,
      /* Cenário de HANDOFF completo: o bot atendeu, a cliente não tem acesso ao gov.br,
         a IA pediu humano (sem_acesso_govbr) e o Henrique assumiu — no mesmo fio ficam
         bolhas do bot (marca IA), o evento de handoff e a resposta humana. */
      id: 'wa-ivone', name: 'Ivone Castro dos Santos', phone: '5551987770009', contatoId: 'wa-ivone-ct',
      time: '14:22', unread: 0, lastAtMs: agora - 18 * min, respId: 'u-mock',
      /* triagem_govbr = etapa real do fluxo onde este handoff acontece (sem acesso ao gov.br) */
      etapa: 'EM ATENDIMENTO', iaStatus: 'handoff', iaEtapa: 'triagem_govbr', iaAguardando: 'sem_acesso_govbr', precisaHumano: true,
      precisaHumanoMotivo: 'sem_acesso_govbr', precisaHumanoEm: iso(agora - 26 * min),
      last: 'Ah, que bom! Obrigada, meu filho', lastInter: 'há 18 min', tags: ['Revisão de contrato'],
      msgs: [
        IN('Boa tarde! Quero ver isso dos descontos no meu benefício', '13:50', { tsISO: iso(agora - 32 * min), id: 'wi-1' }),
        OUT('Boa tarde, dona Ivone! Aqui é o Matheo, da CAF Assessoria. Para eu conferir os descontos, a senhora tem acesso ao Meu INSS (gov.br)?', '13:52', { tsISO: iso(agora - 30 * min), id: 'wi-2', origemBot: true }),
        IN('Nunca usei isso de gov, meu filho. Não tenho senha não', '13:55', { tsISO: iso(agora - 27 * min), id: 'wi-3' }),
        OUT('Dona Ivone, aqui é o Henrique, da equipe da CAF. Pode deixar que sigo com a senhora daqui — vamos criar o acesso juntos, passo a passo.', '14:02', { tsISO: iso(agora - 20 * min), id: 'wi-4' }),
        IN('Ah, que bom! Obrigada, meu filho', '14:04', { tsISO: iso(agora - 18 * min), id: 'wi-5' }),
      ],
    },
    {
      ...base,
      /* contatoId kct-5 = mesmo cliente do seed do Kanban (lead kl-5) e da ficha judicial
         demo — o painel da conversa mostra a ficha real com o envio à planilha simulado.
         canalId aponta o canal seed LUIZA (fonte Tráfego) → sugestão de Tráfego CAMPANHA. */
      id: 'wa-antonio', name: 'Antônio Pereira Lima', phone: '5551987770002', contatoId: 'kct-5', canalId: 'wa-canal-luiza',
      time: '13:47', unread: 0, lastAtMs: agora - 33 * min, aguardando: true, aguardandoDesde: iso(agora - 33 * min),
      etapa: 'Qualificado', etapaCor: '#8b5cf6', respId: 'u-mock', tags: ['Juros abusivos'],
      last: 'Matheo: Perfeito, seu Antônio…', lastInter: 'há 33 min',
      msgs: [
        IN('Recebi a carta do banco aqui', '13:40', { tsISO: iso(agora - 40 * min), id: 'wa-1' }),
        IN('', '13:44', { tsISO: iso(agora - 36 * min), id: 'wa-2', tipo: 'documento', nome: 'Contrato_Emprestimo.pdf', mime: 'application/pdf', tamanho: 1_258_291 }),
        OUT('Perfeito, seu Antônio. Recebi o contrato — vou analisar os descontos e te retorno ainda hoje.', '13:47', { tsISO: iso(agora - 33 * min), id: 'wa-3', origemBot: true }),
      ],
    },
    {
      ...base,
      id: 'wa-terezinha', name: 'Terezinha M. Alves', phone: '5551987770003', contatoId: 'wa-terezinha-ct',
      time: '11:20', unread: 0, lastAtMs: agora - 200 * min, respId: 'u-mock', chip: 'URA', canalAtual: 'URA',
      /* sessão pausada SEM pendência = barra neutra "IA pausada" (bolinha neutra + Reativar ghost) */
      iaStatus: 'pausada', iaEtapa: 'qualificacao_inss',
      last: 'Você: Combinado, te ligo amanhã.', lastInter: 'há 3 h',
      msgs: [
        IN('Pode me ligar amanhã de manhã?', '11:18', { tsISO: iso(agora - 202 * min), id: 'wt-1' }),
        OUT('Combinado, te ligo amanhã.', '11:20', { tsISO: iso(agora - 200 * min), id: 'wt-2', quoted: { remetente: 'Terezinha M. Alves', tipo: 'texto', texto: 'Pode me ligar amanhã de manhã?' } }),
      ],
    },
    {
      ...base,
      id: 'wa-sebastiao', name: 'Sebastião R. Nunes', phone: '5551987770004', contatoId: 'wa-sebastiao-ct',
      time: '10:05', unread: 0, lastAtMs: agora - 275 * min, respId: null, status: 'Pendente',
      last: 'Obrigado, moço. Deus abençoe', lastInter: 'há 4 h',
      msgs: [
        OUT('Seu Sebastião, sua análise inicial está pronta — não achamos descontos indevidos. Qualquer coisa é só chamar!', '10:02', { tsISO: iso(agora - 278 * min), id: 'ws-1', viaTelefone: true }),
        IN('Obrigado, moço. Deus abençoe', '10:05', { tsISO: iso(agora - 275 * min), id: 'ws-2' }),
      ],
    },
    {
      ...base,
      id: 'wa-cleusa', name: 'Cleusa M. Barros', phone: '5551987770005', contatoId: 'wa-cleusa-ct',
      time: 'Ontem', unread: 0, lastAtMs: agora - 1500 * min, respId: 'u-mock', status: 'Fechada',
      // perdida via oppStatus (como no dado real) — NÃO via etapa string; a situação vira 'perdido'
      etapa: 'Documentação', etapaCor: '#f59e0b', oppStatus: 'perdido',
      last: 'Não tenho interesse, obrigada.', lastInter: 'ontem',
      msgs: [
        IN('Não tenho interesse, obrigada.', '16:12', { tsISO: iso(agora - 1500 * min), id: 'wc-1' }),
        OUT('Sem problema, dona Cleusa! Deixamos seu contato em paz. Qualquer coisa, estamos por aqui.', '16:15', { tsISO: iso(agora - 1497 * min), id: 'wc-2', status: 'lida' }),
      ],
    },
  ];
}
