/* IA COM A CHAVE DA PRÓPRIA EMPRESA no WhatsApp (25/11) — as duas peças que ficam no Atendimento:
   · ResumoAtendimento: o bloco "Resumo do atendimento" do painel do cliente (vizinho de "Mídia, documentos e links").
     "Gerar resumo" → o que o cliente quer, os documentos recebidos e os que faltam, o próximo passo e como ele está,
     com "gerado às hh:mm" e "Gerar de novo".
   · TranscreverAudio: o "Transcrever" embaixo do áudio que ainda não tem transcrição. O texto fica gravado na
     mensagem: da próxima vez todo mundo já vê.
   Sem a chave de IA conectada, os botões ficam desligados com "conecte a sua chave de IA" (o administrador vai direto
   para Configurações › Integrações; as outras pessoas são avisadas de que é com o administrador).
   Só na Reviza e com o recurso 'ia-propria' ligado na instalação. Dados: @/data/iaPropria. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { isRevizaMode } from '@/lib/supabase';
import { quandoFoiGerado, traduzErroIa, transcricaoDemo, useGerarResumo, useIaDisponivel, useResumoAtendimento, useTranscreverAudio } from '@/data/iaPropria';
import type { WaMessage } from '@/data/whatsappDemo';
import { temRecurso } from '../data/config/recursos';
import { BotaoSec } from './Botao';
import './iaPropria.css';

export const ROTA_CHAVE_IA = '/config/integracoes/ia';
/** a IA própria existe nesta instalação? (fora da Reviza, nunca: lá não há chave da empresa para usar) */
export const iaPropriaLigada = (): boolean => isRevizaMode && temRecurso('ia-propria');

function SemChave({ curto }: { curto?: boolean }) {
  const { currentOrg } = useOrg();
  const admin = currentOrg?.role === 'admin';
  if (curto) return admin
    ? <Link className="ria-semchave-l" to={ROTA_CHAVE_IA}>conecte a sua chave de IA</Link>
    : <span className="ria-semchave-t" title="O administrador conecta a chave de IA da empresa em Configurações › Integrações.">sem chave de IA conectada</span>;
  return (
    <p className="ria-semchave" role="note">
      {admin
        ? <>Para usar, conecte a sua chave de IA. <Link to={ROTA_CHAVE_IA}>Conectar a chave de IA</Link></>
        : <>Para usar, o administrador precisa conectar a chave de IA da empresa em Configurações › Integrações.</>}
    </p>
  );
}

/* ================= Resumo do atendimento ================= */
export function ResumoAtendimento(props: { conversaId: string; msgs: WaMessage[]; demo: boolean }) {
  if (!iaPropriaLigada() || !props.conversaId) return null;
  return <ResumoAtendimentoBloco key={props.conversaId} {...props} />;
}

function ResumoAtendimentoBloco({ conversaId, msgs, demo }: { conversaId: string; msgs: WaMessage[]; demo: boolean }) {
  const disp = useIaDisponivel();
  const guardado = useResumoAtendimento(conversaId);
  const gerar = useGerarResumo();
  const [erro, setErro] = useState<string | null>(null);
  const configurada = disp.data?.configurada === true;
  const r = guardado.data ?? null;
  const pedir = (refazer: boolean) => {
    if (!configurada || gerar.isPending) return;
    setErro(null);
    gerar.mutate({ conversaId, refazer, msgsDemo: demo ? msgs : undefined }, { onError: (e) => setErro(traduzErroIa(e)) });
  };
  return (
    <div className="ctx-b spot ria" data-resumo-ia aria-busy={gerar.isPending || undefined}>
      <div className="ria-cab">
        <span className="ctx-t">Resumo do atendimento</span>
        {r && !gerar.isPending && <span className="ria-quando num">{quandoFoiGerado(r.geradoEm)}</span>}
      </div>

      {gerar.isPending ? (
        <div className="ria-lendo" role="status">
          <span className="ria-linha" /><span className="ria-linha" /><span className="ria-linha curta" />
          <span className="ria-dica">Lendo a conversa… pode levar cerca de 1 minuto.</span>
        </div>
      ) : r ? (
        <>
          <dl className="ria-lista">
            <div><dt>O que quer</dt><dd>{r.quer || 'A conversa ainda não diz.'}</dd></div>
            <div>
              <dt>Documentos</dt>
              <dd>
                {r.recebidos.length ? <span className="ria-docs"><b>Recebidos:</b> {r.recebidos.join(', ')}</span> : <span className="ria-docs">Nenhum documento recebido ainda.</span>}
                {r.faltando.length > 0 && <span className="ria-docs falta"><b>Faltam:</b> {r.faltando.join(', ')}</span>}
              </dd>
            </div>
            <div><dt>Próximo passo</dt><dd>{r.proximoPasso || '—'}</dd></div>
            {r.humor && <div><dt>Como está</dt><dd>{r.humor}</dd></div>}
          </dl>
          {r.desatualizado && <p className="ria-novas">Chegaram mensagens depois deste resumo.</p>}
          <div className="ria-pe">
            <span className="ria-autor">{r.geradoPor ? `Por ${r.geradoPor}, com IA` : 'Feito com IA'}</span>
            <button type="button" className="ria-lnk" disabled={!configurada} aria-disabled={!configurada || undefined}
              title={configurada ? 'Gerar o resumo de novo com as mensagens de agora' : 'Conecte a chave de IA para gerar de novo'} onClick={() => pedir(true)}>Gerar de novo</button>
          </div>
          {!configurada && disp.isSuccess && <SemChave />}
        </>
      ) : (
        <>
          <p className="ria-tx">A IA lê a conversa e resume o que o cliente quer, os documentos, o próximo passo e como ele está.</p>
          <div className="ria-acoes">
            <BotaoSec mini disabled={!configurada} onClick={() => pedir(false)}>Gerar resumo</BotaoSec>
            <span className="ria-dica">pode levar cerca de 1 minuto</span>
          </div>
          {!configurada && disp.isSuccess && <SemChave />}
          {guardado.isError && <p className="ria-erro" role="alert">Não deu para ver o último resumo agora.</p>}
        </>
      )}
      {erro && !gerar.isPending && <p className="ria-erro" role="alert">{erro}</p>}
    </div>
  );
}

/* ================= Transcrever (embaixo do áudio) ================= */
/** texto da transcrição já feita na prévia (guardada no navegador) — a bolha mostra como se viesse da mensagem */
export const transcricaoGuardada = (m: WaMessage, demo: boolean): string | null => (demo && iaPropriaLigada() ? transcricaoDemo(m.id) : null);

export function TranscreverAudio({ m, demo, aoTranscrever }: { m: WaMessage; demo: boolean; aoTranscrever: (texto: string) => void }) {
  // áudio que dá para mandar: gravado no sistema (id real) e, fora da demonstração, com o arquivo no bucket
  if (!iaPropriaLigada() || !m.id || m.transcricao || (!demo && !m.anexoPath)) return null;
  return <TranscreverBotao m={m} aoTranscrever={aoTranscrever} />;
}
function TranscreverBotao({ m, aoTranscrever }: { m: WaMessage; aoTranscrever: (texto: string) => void }) {
  const disp = useIaDisponivel();
  const tr = useTranscreverAudio();
  const [erro, setErro] = useState<string | null>(null);
  const configurada = disp.data?.configurada === true;
  const ir = () => {
    if (!configurada || tr.isPending) return;
    setErro(null);
    tr.mutate({ mensagemId: m.id! }, { onSuccess: aoTranscrever, onError: (e) => setErro(traduzErroIa(e)) });
  };
  return (
    <div className="transc-acao" data-transcrever>
      <button type="button" className={'transc-btn' + (configurada ? '' : ' off')} disabled={tr.isPending} aria-disabled={!configurada || undefined}
        title={configurada ? 'Transformar o áudio em texto com a IA' : 'Conecte a chave de IA para transcrever'} onClick={ir}>
        {tr.isPending ? 'Transcrevendo…' : 'Transcrever'}
      </button>
      {!configurada && disp.isSuccess && <><span className="transc-sep" aria-hidden>·</span><SemChave curto /></>}
      {erro && <span className="transc-erro" role="alert">{erro}</span>}
    </div>
  );
}
