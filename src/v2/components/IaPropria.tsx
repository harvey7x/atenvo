/* IA COM A CHAVE DA PRÓPRIA EMPRESA no WhatsApp (25/11) — as duas peças que ficam no Atendimento:
   · ResumoAtendimento: o bloco "Resumo do atendimento" do painel do cliente (vizinho de "Mídia, documentos e links").
     "Gerar resumo" → o que o cliente quer, os documentos recebidos e os que faltam, o próximo passo e como ele está,
     com "gerado às hh:mm" e "Gerar de novo".
   · TranscreverAudio: o "Transcrever" embaixo do áudio que ainda não tem transcrição. O texto fica gravado na
     mensagem: da próxima vez todo mundo já vê.
   Sem a chave de IA conectada, os botões ficam desligados com "conecte a sua chave de IA" (o administrador vai direto
   para Configurações › Integrações; as outras pessoas são avisadas de que é com o administrador).
   Só na Reviza e com o recurso 'ia-propria' ligado na instalação. Dados: @/data/iaPropria. */
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { isRevizaMode } from '@/lib/supabase';
import { quandoFoiGerado, traduzErroIa, transcricaoDemo, useDocsDemo, useGerarResumo, useIaDisponivel, useIdentificarDocumentos, useResumoAtendimento, useTranscreverAudio } from '@/data/iaPropria';
import { rotuloDoDoc, situacaoDosDocs, type DocIa, type EstadoDoc } from '@/data/documentosIa';
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

/* ================= Documentos reconhecidos pela IA (25/11) ================= */
/** o documento de cada mensagem: o que o servidor gravou ou, na demonstração, o que ficou no navegador */
export function useDocDe(demo: boolean): (m: WaMessage) => DocIa | null {
  const ligada = iaPropriaLigada();
  const docsDemo = useDocsDemo(demo && ligada);
  return useCallback((m: WaMessage) => (!ligada ? null : m.doc ?? (demo && m.id ? docsDemo[m.id] ?? null : null)), [ligada, demo, docsDemo]);
}

const IcCerto = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const IcAtencao = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 7v6" /><path d="M12 17h.01" /></svg>;
const ESTADO_TXT: Record<EstadoDoc, string> = { chegou: 'chegou', pedir_de_novo: 'pedir de novo', falta: 'falta' };

/** "Documentos da revisão" no painel do cliente: o que chegou, o que falta e o que precisa ser pedido de novo */
export function DocumentosDaConversa(props: { conversaId: string; msgs: WaMessage[]; demo: boolean; aoIrParaMensagem: (id: string) => void }) {
  if (!iaPropriaLigada() || !props.conversaId) return null;
  return <DocumentosBloco key={props.conversaId} {...props} />;
}

function DocumentosBloco({ conversaId, msgs, demo, aoIrParaMensagem }: { conversaId: string; msgs: WaMessage[]; demo: boolean; aoIrParaMensagem: (id: string) => void }) {
  const disp = useIaDisponivel();
  const docDe = useDocDe(demo);
  const ident = useIdentificarDocumentos();
  const [erro, setErro] = useState<string | null>(null);
  const [aindaTem, setAindaTem] = useState(false);
  const sit = useMemo(() => situacaoDosDocs(msgs, docDe), [msgs, docDe]);
  if (!sit.algumIdentificado && sit.semIdentificar === 0) return null; // o cliente não mandou foto nem documento
  const configurada = disp.data?.configurada === true;
  const chegaram = sit.revisao.filter((l) => l.estado === 'chegou').length;
  const identificar = () => {
    if (!configurada || ident.isPending) return;
    setErro(null);
    ident.mutate({ conversaId, msgsDemo: demo ? msgs : undefined }, {
      onSuccess: (r) => setAindaTem(r.faltamMais),
      onError: (e) => setErro(traduzErroIa(e)),
    });
  };
  const n = sit.semIdentificar;
  return (
    <div className="mdc-ia" data-docs-ia aria-busy={ident.isPending || undefined}>
      <div className="mdc-ia-cab">
        <span className="ctx-t">Documentos da revisão</span>
        {sit.algumIdentificado && <span className="q num" title="Documentos da revisão que já chegaram">{chegaram} de {sit.revisao.length}</span>}
      </div>
      {sit.algumIdentificado && (
        <ul className="mdc-ia-lista">
          {sit.revisao.map((l) => (
            <li key={l.tipo} className={'e-' + l.estado}>
              <span className="mk">{l.estado === 'chegou' ? <IcCerto /> : l.estado === 'pedir_de_novo' ? <IcAtencao /> : null}</span>
              <span className="nm">{l.rotulo}</span>
              {l.mensagemId
                ? <button type="button" className="sit lnk" title="Ver este arquivo na conversa" onClick={() => aoIrParaMensagem(l.mensagemId!)}>{ESTADO_TXT[l.estado]}</button>
                : <span className="sit">{ESTADO_TXT[l.estado]}</span>}
              {l.estado === 'pedir_de_novo' && l.obs && <span className="obs">{l.obs}</span>}
            </li>
          ))}
        </ul>
      )}
      {sit.outros.length > 0 && (
        <p className="mdc-ia-outros">
          <b>Também chegou:</b>{' '}
          {sit.outros.map((o, i) => (
            <span key={o.mensagemId}>
              {i > 0 && ', '}
              <button type="button" className="lnk" title={o.doc.obs || 'Ver na conversa'} onClick={() => aoIrParaMensagem(o.mensagemId)}>{rotuloDoDoc(o.doc)}</button>
              {!o.doc.legivel && <span className="ruim"> (não dá para ler)</span>}
            </span>
          ))}
        </p>
      )}
      {ident.isPending ? (
        <p className="mdc-ia-lendo" role="status">Olhando os arquivos… pode levar até 1 minuto.</p>
      ) : n > 0 ? (
        <>
          {!sit.algumIdentificado && <p className="ria-tx">A IA olha as fotos e os PDFs que o cliente mandou e diz o que é cada um, se dá para ler e o que ainda falta.</p>}
          <div className="ria-acoes">
            <BotaoSec mini disabled={!configurada} onClick={identificar}>
              {sit.algumIdentificado ? `Identificar mais ${n}` : n === 1 ? 'Identificar o arquivo' : `Identificar os ${n} arquivos`}
            </BotaoSec>
            {(aindaTem || n > 8) && <span className="ria-dica">de 8 em 8</span>}
          </div>
          {!configurada && disp.isSuccess && <SemChave />}
        </>
      ) : null}
      {erro && !ident.isPending && <p className="ria-erro" role="alert">{erro}</p>}
    </div>
  );
}
