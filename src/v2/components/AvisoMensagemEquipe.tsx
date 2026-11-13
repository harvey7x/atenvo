import { useMemo, useState } from 'react';
import { DEMO_MODE } from '@/lib/demo';
import { EQUIPE } from '../pages/filaIris/dados';
import { useEuLocal } from '../pages/filaIris/recados';
import { useOcupadoNoCanto } from './AvisoIris';
import { BotaoEJanelaMensagem, PainelMensagemEquipe } from './CartaoMensagemEquipe';
import { useMensagensLocais, type FonteMensagens } from './mensagensEquipe';
import { useMensagensReais } from './mensagensEquipeReal';

/* ==================================================================
   A MENSAGEM DO MURILLO no shell (dono 13/11: "enviar uma mensagem que apareça no meio da tela cobrando eles…
   em qualquer ocasião, escolher o atendente ou todos… enviado como Murillo"). Liga a fonte (o banco; na
   demonstração, a loja local com o "Ver como") às peças de CartaoMensagemEquipe.tsx:
   - AvisoMensagemEquipe: no meio da tela de quem recebeu, em qualquer página. Espera qualquer janela/véu aberto
     (ficha, foto, confirmação, Central de Avisos, bom dia) e o RECADO do administrador (ele tem campo de
     resposta e não pode sumir no meio da escrita).
   - BotaoMensagemEquipe: o "Mensagem" da barra do topo, só para o administrador.
   ================================================================== */
/** espera as janelas (diálogos do sistema, gavetas de edição, editores de pendência, a Central de Avisos aberta), os
    menus e painéis que ficam em portal POR CIMA do shell (menu do usuário/sino, paleta de scripts, menus e
    etiquetas do WhatsApp, o "⋮" dos cartões do Kanban, o alerta de lead quente, o seletor de cor das
    Configurações — o véu da mensagem mora dentro do shell e ficaria por baixo deles) e o recado do administrador;
    NÃO a si mesma (o véu dela também é .rcd-veu). As do v1 e a ficha da Fila vêm no SELETOR_JANELA
    (useOcupadoNoCanto). Tudo isso só existe enquanto está aberto. */
const ESPERA = '.veu, .rcd-veu:not(.meq-veu), .rdr-central, .pd-ed, .drawer-v2, .um-backdrop, .spl, .wa-pop, .wa-etqpop, '
  + '.kb-menu, .alq-veu, .cor-pop';

/** a equipe da demonstração (o "Ver como" da Fila diz quem está olhando; o Matheus é o administrador) */
function useEquipeLocal() {
  return useMemo(() => EQUIPE.map((a) => ({ id: a.id, nome: a.nome, admin: !!a.admin })), []);
}

/* ---------------------------------------------------------------- quem recebe */
export function AvisoMensagemEquipe({ oculto = false }: { oculto?: boolean }) {
  return DEMO_MODE ? <AvisoDemo oculto={oculto} /> : <AvisoReal oculto={oculto} />;
}
function AvisoReal({ oculto }: { oculto: boolean }) {
  return <ComEspera fonte={useMensagensReais(true)} oculto={oculto} />;
}
function AvisoDemo({ oculto }: { oculto: boolean }) {
  return <ComEspera fonte={useMensagensLocais(useEuLocal(), useEquipeLocal())} oculto={oculto} />;
}
function ComEspera({ fonte, oculto }: { fonte: FonteMensagens; oculto: boolean }) {
  const ocupado = useOcupadoNoCanto(fonte.minhas.length > 0, ESPERA);
  return <PainelMensagemEquipe fonte={fonte} oculto={oculto || ocupado} />;
}

/* ---------------------------------------------------------------- o administrador (barra do topo) */
export function BotaoMensagemEquipe() {
  return DEMO_MODE ? <BotaoDemo /> : <BotaoReal />;
}
function BotaoReal() {
  const [aberta, setAberta] = useState(false);
  /* com a janela aberta, lê a cada 5 s (o "viu"/"ok" chega logo); fechada, quem lê é o cartão do meio da tela */
  const fonte = useMensagensReais(true, aberta ? 5_000 : false);
  return <BotaoEJanelaMensagem fonte={fonte} aberta={aberta} aoAbrir={setAberta} />;
}
function BotaoDemo() {
  const [aberta, setAberta] = useState(false);
  const fonte = useMensagensLocais(useEuLocal(), useEquipeLocal());
  return <BotaoEJanelaMensagem fonte={fonte} aberta={aberta} aoAbrir={setAberta} />;
}
