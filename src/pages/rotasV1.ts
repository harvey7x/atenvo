/* v1 inteiro num chunk só, carregado SOB DEMANDA pelas rotas /v1/* (src/App.tsx).
   Antes estes imports eram estáticos no App.tsx e o v1 todo (JS + CSS de página) ia no
   bundle de entrada de TODA rota. Mantê-los juntos (em vez de um lazy por página) preserva
   o ambiente que o v1 sempre teve: as páginas v1 usam classes do CSS umas das outras
   (ex.: o WhatsApp v1 depende do Facebook.css para bolha de imagem/documento e lightbox) e
   a ordem relativa entre os CSS de página fica a mesma de antes. A ORDEM abaixo é a do
   antigo App.tsx — não reordenar. Nada do v2 deve importar daqui. */
export { AppShell } from '@/components/AppShell';
export { Login } from './Login';
export { RedefinirSenha } from './RedefinirSenha';
export { AlterarSenha } from './AlterarSenha';
export { DefinirSenha } from './DefinirSenha';
export { WhatsApp } from './WhatsApp';
export { Facebook } from './Facebook';
export { Kanban } from './Kanban';
export { AgendamentosMensagens } from './AgendamentosMensagens';
export { Relacionamento } from './Relacionamento';
export { Scripts } from './Scripts';
export { Cobrancas } from './Cobrancas';
export { Integracoes } from './Integracoes';
export { Relatorios } from './Relatorios';
export { Configuracoes } from './Configuracoes';
export { PlanoUso } from './PlanoUso';
export { Maturacao } from './Maturacao';
