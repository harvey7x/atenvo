/* ------------------------------------------------------------------
   CONFIGURAÇÃO INICIAL OBRIGATÓRIA (Reviza) — o portão.
   Montado no AppShellV2 no MESMO ponto do LicencaGate (entre a topbar
   e o palco). Quem vê o quê sai de decidir.ts (função pura):
   · assistente (admin/gestor/cadastro/financeiro) e espera (comercial):
     TAKEOVER de tela cheia em portal .v2, role=dialog + aria-modal, foco
     inicial no título, Esc NÃO fecha, app atrás inerte (inert no #root)
     e scroll travado;
   · aviso-isento (contas de suporte): faixa discreta no topo do conteúdo,
     com atalho para abrir o assistente (esse pode fechar);
   · nada: concluída / inativa (sem backend) / carregando / erro.
   Enquanto a configuração está pendente o shell NÃO monta o LicencaGate
   (useConfiguracaoPendente) — quem cobra a mensalidade é a etapa 3.
   ------------------------------------------------------------------ */
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isDemoMode, isRevizaMode } from '@/lib/supabase';
import { lazyComRecarga } from '@/lib/recargaChunk';
import { criarRaizPortalV2 } from '../../components/portal';
import { BotaoSec } from '../../components/Botao';
import { useConfiguracao, usePreviaConfig, useSessaoConfig } from '../../data/cobranca/configuracao';
import { decidirConfiguracao } from './decidir';
import { TelaEspera, TopoConfig } from './TelaEspera';
import './configuracao.css';

// o assistente (e as três etapas) só baixa quando alguém precisa dele
const Assistente = lazyComRecarga(() => import('./Assistente'));

/** atributo na raiz enquanto o takeover está montado: sobe os modais (ModalV2) acima do véu */
const ATRIBUTO_RAIZ = 'data-config-inicial';

function Takeover({ idTitulo, children }: { idTitulo: string; children: ReactNode }) {
  const veuRef = useRef<HTMLDivElement>(null);

  // raiz de portal com a classe v2 (regra 10 — mesmo ciclo do ModalV2/LicencaGate)
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = criarRaizPortalV2(document) as unknown as HTMLElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); };
  }, []);

  // scroll do app travado + app atrás inerte (Tab não escapa para trás do véu)
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = [html.style.overflow, body.style.overflow] as const;
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden';
    html.setAttribute(ATRIBUTO_RAIZ, '');
    const app = document.getElementById('root');
    const jaInerte = app?.hasAttribute('inert') ?? true;
    if (app && !jaInerte) app.setAttribute('inert', '');
    const focoAntes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // a paleta ⌘K do shell abriria ATRÁS do véu (e roubaria o foco): bloqueada na captura
    const semPaleta = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', semPaleta, true);
    return () => {
      window.removeEventListener('keydown', semPaleta, true);
      html.style.overflow = prev[0]; body.style.overflow = prev[1];
      html.removeAttribute(ATRIBUTO_RAIZ);
      if (app && !jaInerte) app.removeAttribute('inert');
      if (focoAntes && document.contains(focoAntes)) focoAntes.focus();
    };
  }, []);

  // foco inicial no título (o leitor de tela anuncia onde a pessoa está)
  useEffect(() => {
    if (!raiz) return;
    const t = window.setTimeout(() => {
      veuRef.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [raiz]);

  if (!raiz) return null;
  // Esc não fecha: nenhum handler de teclado aqui de propósito (é um portão, não um aviso)
  return createPortal(
    <div className="cini-veu" role="dialog" aria-modal="true" aria-labelledby={idTitulo} ref={veuRef}>
      {children}
    </div>,
    raiz,
  );
}

/** enquanto o chunk do assistente baixa */
function CarregandoAssistente({ idTitulo }: { idTitulo: string }) {
  return (
    <div className="cini-ass">
      <TopoConfig />
      <div className="cini-carregando" role="status">
        <span className="cini-anel cini-anel-g" aria-hidden />
        <span id={idTitulo} tabIndex={-1} data-foco-inicial>Carregando a configuração inicial…</span>
      </div>
    </div>
  );
}

/** contas de suporte: aviso discreto, sem bloqueio */
function FaixaIsento({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <div className="cini-faixa" role="status">
      <span className="cini-faixa-dot" aria-hidden />
      <span className="cini-faixa-tx">
        <b>Configuração inicial pendente</b>
        <span className="cini-faixa-sub"> · A equipe vê a tela de espera até a administração concluir as três etapas.</span>
      </span>
      <BotaoSec mini className="cini-faixa-btn" onClick={aoAbrir}>Abrir assistente</BotaoSec>
    </div>
  );
}

export function ConfiguracaoGate() {
  const previa = usePreviaConfig();
  const cfgQ = useConfiguracao();
  const sessao = useSessaoConfig();
  const estado = cfgQ.data;
  const decisao = decidirConfiguracao({
    modo: isRevizaMode ? 'reviza' : isDemoMode ? 'demo' : 'outro',
    previa: previa != null,
    status: estado?.status,
    erro: cfgQ.isError || sessao.erro,
    papel: sessao.papel,
    isento: sessao.isento,
  });
  const idTitulo = useId();

  const [isentoAbriu, setIsentoAbriu] = useState(false);
  const assistenteAgora = decisao === 'assistente' || (decisao === 'aviso-isento' && isentoAbriu);
  // quem estava no assistente vê o "Tudo pronto" mesmo depois do banco liberar
  // (a 3ª etapa conclui → status 'concluida' → a decisão vira 'nada')
  const [segurarFinal, setSegurarFinal] = useState(false);
  useEffect(() => { if (assistenteAgora) setSegurarFinal(true); }, [assistenteAgora]);

  if (estado && (assistenteAgora || (segurarFinal && estado.status === 'concluida'))) {
    return (
      <Takeover idTitulo={idTitulo}>
        <Suspense fallback={<CarregandoAssistente idTitulo={idTitulo} />}>
          <Assistente
            estado={estado}
            idTitulo={idTitulo}
            aoEntrar={() => { setSegurarFinal(false); setIsentoAbriu(false); }}
            aoFechar={decisao === 'aviso-isento' ? () => { setSegurarFinal(false); setIsentoAbriu(false); } : undefined}
          />
        </Suspense>
      </Takeover>
    );
  }
  if (decisao === 'espera') {
    return <Takeover idTitulo={idTitulo}><TelaEspera idTitulo={idTitulo} etapas={estado?.etapas} /></Takeover>;
  }
  if (decisao === 'aviso-isento') return <FaixaIsento aoAbrir={() => setIsentoAbriu(true)} />;
  return null;
}
