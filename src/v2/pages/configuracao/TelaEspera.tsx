/* ------------------------------------------------------------------
   Configuração inicial — TELA DE ESPERA (papel comercial) + cromo
   compartilhado dos takeovers:
   · TopoConfig  faixa superior do assistente (marca ALFA GROUP + rótulo
                 à esquerda; identidade de quem está logado + Sair à direita);
   · Identidade  avatar + nome + papel (some quando não há nome);
   · BotaoSair   'fantasma' (topo) ou 'sec' (rodapé do card da espera);
   · TelaEspera  card central: marca, título, texto combinado, estado
                 "Aguardando a administração" e quem está conectado.
   Sem emoji: ícones SVG de traço 1.7, como o menu.
   ------------------------------------------------------------------ */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LogoAtenvo } from '../../components/LogoAtenvo';
import { BotaoSec } from '../../components/Botao';
import { usePapel } from '../../data/cobranca/sessao';
import { ETAPAS, useSessaoConfig, type EtapaId } from '../../data/cobranca/configuracao';
import type { Papel } from '../../data/cobranca/types';
import { FigEsperaEquipe } from './figuras/figurasSistema';
import { ROTULO_ETAPA, TrilhaEtapas } from './TrilhaEtapas';

export { IcCheck } from './TrilhaEtapas';

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente',
};

/** "Ana Paula Ribeiro" → "AP" */
export const iniciais = (n: string) => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** nome (perfil → sessão) e papel de quem está logado */
function useIdentidade(): { nome: string; papel: string | null } {
  const perfil = usePapel();
  const { user } = useAuth();
  const { papel } = useSessaoConfig();
  const nome = (perfil.data?.nome ?? '').trim() || (user?.name ?? '').trim();
  return { nome, papel: papel ? ROTULO_PAPEL[papel] : null };
}

function IcSair({ tam }: { tam: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
    </svg>
  );
}

/** botão Sair do takeover (o menu do avatar fica coberto pelo gate) */
export function BotaoSair({ variante = 'fantasma' }: { variante?: 'fantasma' | 'sec' }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);
  const sair = async () => {
    setSaindo(true);
    try { await signOut(); navigate('/login', { replace: true }); } finally { setSaindo(false); }
  };
  const rotulo = saindo ? 'Saindo…' : 'Sair';
  if (variante === 'sec') {
    return (
      <BotaoSec mini className="cini-sair-sec" onClick={() => { void sair(); }} disabled={saindo}>
        <IcSair tam={14} />{rotulo}
      </BotaoSec>
    );
  }
  // no estreito fica só o ícone: o texto vira cini-vh e o nome acessível segue no aria-label
  return (
    <button type="button" className="cini-sair" onClick={() => { void sair(); }} disabled={saindo} aria-label={rotulo}>
      <IcSair tam={16} /><span className="cini-sair-tx">{rotulo}</span>
    </button>
  );
}

/** avatar + nome + papel (no estreito fica só o avatar; o resto vai ao title e ao leitor de tela) */
export function Identidade() {
  const { nome, papel } = useIdentidade();
  if (!nome) return null;
  return (
    <div className="cini-id" title={papel ? `${nome} · ${papel}` : nome}>
      <span className="cini-av" aria-hidden>{iniciais(nome)}</span>
      <span className="cini-id-tx">
        <span className="cini-id-nome">{nome}</span>
        {papel && <span className="cini-id-papel">{papel}</span>}
      </span>
    </div>
  );
}

/** faixa superior do assistente: marca + rótulo à esquerda, ações à direita */
export function TopoConfig({ children, identidade = true }: { children?: ReactNode; identidade?: boolean }) {
  return (
    <header className="cini-topo">
      <div className="cini-topo-marca">
        <LogoAtenvo className="cini-logo" />
        {/* o logo já se anuncia como "ALFA GROUP" */}
        <span className="cini-wordmark" aria-hidden>Reviza CRM</span>
        <span className="cini-topo-div" aria-hidden />
        <span className="cini-topo-rot">Configuração inicial</span>
      </div>
      <div className="cini-topo-acoes">
        {children}
        {identidade && <Identidade />}
        <span className="cini-acoes-div" aria-hidden />
        <BotaoSair />
      </div>
    </header>
  );
}

export function TelaEspera({ idTitulo, etapas, mostrarEtapas = false }: {
  idTitulo: string;
  etapas?: Record<EtapaId, boolean>;
  /** trilha das três etapas no card (decisão do dono: desligada) */
  mostrarEtapas?: boolean;
}) {
  const { nome, papel } = useIdentidade();
  return (
    <div className="cini-espera">
      <div className="vidro cini-espera-card">
        <LogoAtenvo className="cini-espera-logo" />
        <p className="cini-eyebrow" aria-hidden>Reviza CRM</p>
        {/* ilustração serena do que está acontecendo (decorativa: o texto abaixo já diz tudo) */}
        <div className="cini-espera-fig" aria-hidden>
          <FigEsperaEquipe />
        </div>
        <h1 id={idTitulo} className="cini-espera-titulo" tabIndex={-1} data-foco-inicial>Seu acesso está pendente</h1>
        <p className="cini-espera-tx">
          Antes de continuar, o sistema precisa de algumas configurações iniciais, feitas pela administração do escritório.
          Aguarde a conclusão — o acesso é liberado automaticamente assim que tudo estiver pronto.
        </p>
        <div className="cini-espera-status" role="status">
          <span className="cini-anel" aria-hidden />
          <span>Aguardando a administração</span>
        </div>
        {mostrarEtapas && etapas && (
          <TrilhaEtapas tamanho="s" rotulo="Etapas da configuração"
            itens={ETAPAS.map((e) => ({ id: e, ...ROTULO_ETAPA[e], feita: etapas[e] }))} />
        )}
        <div className={'cini-espera-pe' + (nome ? '' : ' cini-espera-pe-so')}>
          {nome && (
            <div className="cini-espera-quem">
              <span className="cini-av" aria-hidden>{iniciais(nome)}</span>
              <span className="cini-espera-quem-tx">
                <span className="cini-espera-quem-rot">Conectado como</span>
                <span className="cini-espera-quem-nome">{papel ? `${nome} · ${papel}` : nome}</span>
              </span>
            </div>
          )}
          <BotaoSair variante="sec" />
        </div>
      </div>
      <p className="cini-espera-nota">Dúvidas? Fale com o administrativo do escritório.</p>
    </div>
  );
}
