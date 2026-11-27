/* ------------------------------------------------------------------
   Configuração inicial — ASSISTENTE (admin, gestor, cadastro, financeiro).
   Cabeçalho (título + subtítulo + nota) · TRILHA horizontal das três
   etapas (pendente / atual / concluída — clicar troca o card, sem mover
   o foco) · UM card com a etapa aberta: cabeçalho (tile + título + lead
   + fatos), o corpo da etapa e, quando ela termina, o rodapé fixo
   "Etapa concluída · Próxima etapa". As etapas podem ser feitas em
   qualquer ordem. As três prontas → "Tudo pronto" + "Entrar no sistema".
   ------------------------------------------------------------------ */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BotaoPrimario, BotaoSec } from '../../components/Botao';
import {
  ETAPAS, useConcluirEtapa, useFinalizarConfiguracao, useMensalidadeConfig,
  type EstadoConfiguracao, type EtapaId,
} from '../../data/cobranca/configuracao';
import { EtapaPlanilha, Ic } from './EtapaPlanilha';
import { EtapaWhatsapp } from './EtapaWhatsapp';
import { EtapaMensalidade, pagoEmRotulo } from './EtapaMensalidade';
import { IcCheck, TopoConfig } from './TelaEspera';
import { ROTULO_ETAPA, TrilhaEtapas } from './TrilhaEtapas';

/* ícones das etapas (traço 1.7, família do menu) — 20px no tile de 40 */
const IC = {
  planilha: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false"><rect x="4" y="4" width="16" height="16" rx="2.2" /><path d="M4 9.5h16M4 15h16M10 9.5V20" /></svg>,
  whatsapp: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6z" /><path d="M9 10h6M9 13.5h4" /></svg>,
  mensalidade: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false"><rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 10.5h18M7 15h4" /></svg>,
} satisfies Record<EtapaId, ReactNode>;

/** pausa (a régua segue desligada) */
function IcPausa() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

const INFO: Record<EtapaId, { titulo: string; curto: string; lead: string; fatos: Array<{ ic: ReactNode; tx: string }> }> = {
  planilha: {
    ...ROTULO_ETAPA.planilha,
    lead: 'Conecte a planilha do Google; o sistema sincroniza sozinho.',
    fatos: [
      { ic: <Ic n="sync" s={16} />, tx: 'A cada 15 min, nos dois sentidos' },
      { ic: <Ic n="grade" s={16} />, tx: 'Em conflito, vale a planilha' },
      { ic: <Ic n="doc" s={16} />, tx: 'Aba cancelados tira da cobrança, com histórico' },
    ],
  },
  whatsapp: {
    ...ROTULO_ETAPA.whatsapp,
    lead: 'Conecte os números que vão enviar as mensagens da régua.',
    fatos: [
      { ic: <IcPausa />, tx: 'Esta etapa não liga a régua: os envios automáticos seguem desligados até o dono do escritório decidir' },
    ],
  },
  mensalidade: {
    ...ROTULO_ETAPA.mensalidade,
    lead: 'Cobre a infraestrutura: servidores, banco de dados e a conexão com o WhatsApp.',
    fatos: [{ ic: <Ic n="raio" s={16} />, tx: 'Pix com confirmação automática' }],
  },
};

const reduzMovimento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Assistente({ estado, idTitulo, aoEntrar, aoFechar }: {
  estado: EstadoConfiguracao;
  idTitulo: string;
  /** "Entrar no sistema" (depois das três etapas) */
  aoEntrar: () => void;
  /** só contas de suporte: fechar o assistente sem concluir */
  aoFechar?: () => void;
}) {
  const uid = useId();
  const concluir = useConcluirEtapa();
  const finalizar = useFinalizarConfiguracao();
  const mensalidade = useMensalidadeConfig().data; // detalhe do "Tudo pronto" (cache da etapa 3)
  const feitas = ETAPAS.filter((e) => estado.etapas[e]).length;
  const todas = feitas === ETAPAS.length;
  const primeiraPendente = ETAPAS.find((e) => !estado.etapas[e]) ?? null;
  const [aberta, setAberta] = useState<EtapaId>(primeiraPendente ?? 'planilha');
  const tituloFimRef = useRef<HTMLHeadingElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const proximaDe = (e: EtapaId) => {
    const i = ETAPAS.indexOf(e);
    return [...ETAPAS.slice(i + 1), ...ETAPAS.slice(0, i)].find((x) => !estado.etapas[x]) ?? null;
  };

  // "Próxima etapa": troca o card, sobe até a trilha e leva o foco ao título do card
  const abrir = (e: EtapaId) => {
    setAberta(e);
    window.setTimeout(() => {
      navRef.current?.scrollIntoView({ block: 'start', behavior: reduzMovimento() ? 'auto' : 'smooth' });
      document.getElementById(`${uid}-h`)?.focus({ preventScroll: true });
    }, 30);
  };

  // falha ao registrar a planilha: o aviso fica no topo do corpo — traz à vista
  const erroRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (concluir.isError) erroRef.current?.scrollIntoView({ block: 'nearest', behavior: reduzMovimento() ? 'auto' : 'smooth' });
  }, [concluir.isError]);

  // as três prontas → foco no "Tudo pronto"
  useEffect(() => {
    if (!todas) return;
    const t = window.setTimeout(() => tituloFimRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [todas]);

  /** resumo curto de cada etapa concluída (trilha) */
  const metaDe = (e: EtapaId): string => {
    if (e === 'planilha') return 'Sincronização ligada';
    if (e === 'whatsapp') return estado.whatsapp.modo === 'unico' ? 'Um número só para todos' : 'Um número por atendente';
    return mensalidade?.pagoEm ? `Paga em ${pagoEmRotulo(mensalidade.pagoEm).split(' às ')[0]}` : 'Paga';
  };
  /** detalhe de cada etapa no "Tudo pronto" */
  const detalheFim = (e: EtapaId): string => {
    if (e === 'planilha') return 'Sincronização automática ligada';
    if (e === 'whatsapp') return estado.whatsapp.modo === 'unico' ? 'Um número só para todos' : 'Um número por atendente';
    return mensalidade?.pagoEm ? `Paga em ${pagoEmRotulo(mensalidade.pagoEm)}` : 'Paga';
  };

  const entrar = async () => {
    try { await finalizar.mutateAsync(); } catch { /* "Entrar" nunca prende ninguém: a tela fecha mesmo assim */ }
    aoEntrar();
  };

  const conteudo = (e: EtapaId) => {
    switch (e) {
      case 'planilha':
        // guarda contra clique duplo em "Concluir etapa" enquanto o registro está em andamento
        return <EtapaPlanilha concluida={estado.etapas.planilha} aoConcluir={() => { if (!concluir.isPending) concluir.mutate('planilha'); }} />;
      case 'whatsapp':
        return <EtapaWhatsapp estado={estado} />;
      case 'mensalidade':
        return <EtapaMensalidade concluida={estado.etapas.mensalidade} />;
    }
  };

  const nAberta = ETAPAS.indexOf(aberta);
  const prox = estado.etapas[aberta] ? proximaDe(aberta) : null;

  return (
    <div className="cini-ass">
      <TopoConfig>
        {aoFechar && <BotaoSec mini onClick={aoFechar}>Fechar</BotaoSec>}
      </TopoConfig>

      <div className="cini-ass-miolo">
        <div className={'cini-cab' + (todas ? ' cini-cab-fim' : '')}>
          <div className="cini-cab-tx">
            <h1 id={idTitulo} className="cini-titulo" tabIndex={-1} data-foco-inicial>Configuração inicial do sistema</h1>
            {!todas && <p className="cini-sub">Para liberar o acesso da equipe, conclua as três etapas abaixo.</p>}
          </div>
          {!todas && (
            <p className="cini-cab-nota">
              <Ic n="info" s={14} />
              <span>As etapas podem ser feitas em qualquer ordem. O progresso fica salvo.</span>
            </p>
          )}
        </div>

        {todas ? (
          <section className="vidro cini-fim" aria-labelledby={`${uid}-fim`}>
            <span className="cini-fim-selo" aria-hidden><IcCheck tam={24} /></span>
            <h2 id={`${uid}-fim`} ref={tituloFimRef} tabIndex={-1} className="cini-fim-titulo">Tudo pronto. O acesso da equipe foi liberado.</h2>
            <ul className="cini-fim-lista">
              {ETAPAS.map((e) => (
                <li key={e}>
                  <span className="cini-fim-ok" aria-hidden><IcCheck tam={16} /></span>
                  <span className="cini-fim-tx">
                    <span className="cini-fim-nome">{INFO[e].titulo}</span>
                    <span className="cini-fim-det">{detalheFim(e)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <BotaoPrimario className="cini-fim-cta" onClick={() => { void entrar(); }} disabled={finalizar.isPending}
              aria-busy={finalizar.isPending || undefined}>
              {finalizar.isPending ? 'Entrando…' : 'Entrar no sistema'}
            </BotaoPrimario>
          </section>
        ) : (
          <>
            <TrilhaEtapas ref={navRef} tamanho="m" rotulo="Etapas da configuração" aberta={aberta} aoAbrir={setAberta}
              idPainel={`${uid}-painel`}
              itens={ETAPAS.map((e) => ({ id: e, titulo: INFO[e].titulo, curto: INFO[e].curto, feita: estado.etapas[e], meta: metaDe(e) }))} />

            {/* key: trocar de etapa remonta o card (troca de 160ms) — cada etapa já remontava ao abrir */}
            <section id={`${uid}-painel`} className="vidro cini-painel" aria-labelledby={`${uid}-h`} key={aberta}>
              <header className="cini-pc-cab">
                <span className="cini-tile" aria-hidden>{IC[aberta]}</span>
                <div className="cini-pc-tx">
                  <h2 id={`${uid}-h`} className="cini-pc-tit" tabIndex={-1}>
                    <span className="cini-vh">Etapa {nAberta + 1} de {ETAPAS.length}: </span>{INFO[aberta].titulo}
                  </h2>
                  <p className="cini-pc-lead">{INFO[aberta].lead}</p>
                  <ul className="cini-fatos">
                    {INFO[aberta].fatos.map((f) => (
                      <li key={f.tx}><span className="cini-fatos-ic" aria-hidden>{f.ic}</span><span>{f.tx}</span></li>
                    ))}
                  </ul>
                </div>
              </header>
              <div className="cini-pc-fio" aria-hidden />
              <div className="cini-pc-corpo">
                {/* acima do corpo: depois dele viria o rodapé fixo da etapa, que cobriria o aviso */}
                {aberta === 'planilha' && concluir.isError && (
                  <p className="cini-erro" role="alert" ref={erroRef}>Não foi possível registrar a etapa. Tente de novo.</p>
                )}
                {conteudo(aberta)}
              </div>
              {estado.etapas[aberta] && prox && (
                <div className="cini-pe cini-pe-prox" role="status">
                  <span className="cini-pe-dica cini-pe-conf">
                    <span className="cini-pe-ok" aria-hidden><IcCheck tam={16} /></span>
                    <span>Etapa concluída.</span>
                  </span>
                  <div className="cini-pe-acoes">
                    <BotaoPrimario onClick={() => abrir(prox)}>Próxima etapa: {INFO[prox].titulo}</BotaoPrimario>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
