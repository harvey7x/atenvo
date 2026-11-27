/* CONFIGURAÇÕES → INTEGRAÇÕES → INTELIGÊNCIA ARTIFICIAL (CHAVE PRÓPRIA) (25/11). No sistema que a Reviza usava antes:
   "Chave de IA — use a sua própria chave; o custo passa a ser seu".
   O administrador escolhe o provedor (Google Gemini, o padrão — a Iris já usa o Gemini — ou OpenAI), cola a chave
   que a PRÓPRIA empresa criou na conta dela e o servidor confere com uma chamada mínima antes de guardar. A chave
   fica só no servidor: a tela mostra no máximo "configurada em dd/mm por Fulano · termina em …1234".
   Com a chave, o WhatsApp ganha o "Resumo do atendimento" (painel do cliente) e o "Transcrever" (áudios).
   Testar, Trocar e Remover (com confirmação). Dados: @/data/iaPropria. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPrevia } from '@/lib/supabase';
import {
  CHAVE_EXEMPLO, conferirChaveIa, explicarUltimoErro, MSG_IA, nomeProvedor, PROVEDORES_IA, textoChaveConfigurada,
  traduzErroIa, useChaveIa, useRemoverChaveIa, useSalvarChaveIa, useTestarChaveIa, type EstadoChaveIa, type ProvedorIa,
} from '@/data/iaPropria';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, ModalV2 } from '../../components';
import '../painel/painel.css';

export const IcIa = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 3.5 11.6 8a2 2 0 0 0 1.2 1.2l4.7 1.6-4.7 1.6a2 2 0 0 0-1.2 1.2L10 18.3l-1.6-4.7a2 2 0 0 0-1.2-1.2L2.5 10.8l4.7-1.6A2 2 0 0 0 8.4 8z" />
    <path d="M18.5 14.5v5M16 17h5" />
  </svg>
);
const quando = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
type Avisar = (texto: string, tom?: 'ok' | 'erro') => void;

export function ConfigChaveIa() {
  const q = useChaveIa();
  const ir = useNavigate();
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const [janela, setJanela] = useState<'conectar' | 'remover' | null>(null);
  const avisar: Avisar = (texto, tom = 'ok') => setAviso({ texto, tom });
  const testar = useTestarChaveIa();
  const remover = useRemoverChaveIa();
  const c = q.data;
  const testarAgora = async () => {
    try { await testar.mutateAsync(); avisar(`A chave respondeu: o ${nomeProvedor(c?.provedor)} está aceitando a chave.`); }
    catch (x) { avisar(traduzErroIa(x), 'erro'); }
  };
  const tirar = async () => {
    try { await remover.mutateAsync(); avisar('A chave de IA foi removida do sistema. O Resumo do atendimento e o Transcrever ficam desligados.'); }
    catch (x) { avisar(traduzErroIa(x), 'erro'); }
    setJanela(null);
  };
  return (
    <div className="pn cfgi" data-config-ia>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      {q.isLoading ? <p className="pn-vazio">Consultando a chave de IA…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível consultar a chave de IA" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
        : !c?.configurada ? (
          <div className="cfgi-duas">
            <CardVidro spot className="pn-card sobe">
              <div className="pn-card-cab"><div><h3>Conectar a chave de IA</h3><p>Use a sua própria chave: o custo passa a ser da sua conta.</p></div></div>
              <ol className="cfgw-passos">
                <li>Crie a chave na conta da empresa no <b>Google AI Studio</b> (recomendado) ou na <b>OpenAI</b>. O passo a passo está ao lado.</li>
                <li>Cole a chave aqui. O sistema confere com o provedor e guarda a chave só no servidor.</li>
                <li>Pronto: no <b>WhatsApp</b>, o painel do cliente ganha o <b>Resumo do atendimento</b> e os áudios ganham o <b>Transcrever</b>.</li>
              </ol>
              <div className="cfgi-acoes"><BotaoPrimario onClick={() => setJanela('conectar')}>Conectar a chave de IA</BotaoPrimario></div>
              <div className="cfgi-sep" />
              <div className="pn-card-cab"><div><h3>O que a IA faz com a chave</h3></div></div>
              <ul className="cfgi-lista">
                <li><b>Resumo do atendimento</b>: lê a conversa e mostra o que o cliente quer, os documentos que chegaram e os que faltam, o próximo passo e como ele está.</li>
                <li><b>Transcrever</b>: transforma o áudio do cliente em texto. O texto fica na conversa para toda a equipe.</li>
              </ul>
            </CardVidro>
            <ComoCriar atraso={0.05} />
          </div>
        ) : (
          <>
            <CardVidro spot className="pn-card sobe">
              <div className="cfgi-conta">
                <span className="cfgi-ic on"><IcIa /></span>
                <div className="cfgi-conta-nm"><b>{nomeProvedor(c.provedor)}</b><span>{textoChaveConfigurada(c)}</span></div>
                {c.ultimoErro ? <BadgeStatus tom="erro">Precisa de atenção</BadgeStatus> : <BadgeStatus tom="ok">Conectada</BadgeStatus>}
              </div>
              {c.ultimoErro && <p className="cfgi-nota" role="alert">{explicarUltimoErro(c.ultimoErro)}</p>}
              <dl className="cfgw-ficha">
                <div><dt>Último teste</dt><dd className="num">{quando(c.ultimoTesteEm)}{c.ultimoTesteEm ? (c.ultimoErro ? ' · falhou' : ' · funcionou') : ''}</dd></div>
                <div><dt>Onde a IA trabalha</dt><dd>No WhatsApp: Resumo do atendimento e Transcrever áudio</dd></div>
                <div><dt>Quem paga o uso</dt><dd>A conta da empresa {c.provedor === 'openai' ? 'na OpenAI' : 'no Google'}</dd></div>
              </dl>
              <div className="cfgi-acoes">
                <BotaoPrimario onClick={() => ir('/whatsapp')}>Ver no WhatsApp</BotaoPrimario>
                <BotaoSec disabled={testar.isPending} onClick={() => void testarAgora()}>{testar.isPending ? 'Testando…' : 'Testar'}</BotaoSec>
                <span className="cfgi-esp" />
                <button type="button" className="cfgi-link" onClick={() => setJanela('conectar')}>Trocar a chave</button>
                <button type="button" className="cfgi-link perigo" onClick={() => setJanela('remover')}>Remover</button>
              </div>
            </CardVidro>
            <ComoCriar atraso={0.05} lado />
          </>
        )}

      {janela === 'conectar' && <JanelaChave atual={c ?? null} aoFechar={() => setJanela(null)} aoAvisar={avisar} />}
      <ConfirmDialogV2 aberto={janela === 'remover'} titulo="Remover a chave de IA?" rotuloConfirmar="Remover" destrutivo carregando={remover.isPending}
        mensagem="O Resumo do atendimento e o Transcrever param de funcionar até uma chave nova ser conectada. Os resumos e as transcrições já feitos continuam aparecendo. A chave continua existindo na conta do provedor: se quiser apagá-la de vez, apague lá também."
        aoConfirmar={() => void tirar()} aoCancelar={() => setJanela(null)} />
    </div>
  );
}

function ComoCriar({ atraso, lado }: { atraso: number; lado?: boolean }) {
  return (
    <CardVidro spot className="pn-card sobe" style={{ animationDelay: `${atraso}s` }} data-como-criar>
      <div className="pn-card-cab"><div><h3>Como criar a sua chave</h3><p>Faça com o login da empresa, não com um login pessoal.</p></div></div>
      <div className={lado ? 'cfgia-provs lado' : 'cfgia-provs'}>
      <div className="cfgia-prov">
        <h4>Google Gemini <span>recomendado</span></h4>
        <ol className="cfgw-passos">
          <li>Entre em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"><b>aistudio.google.com</b></a> com a conta Google da empresa.</li>
          <li>Toque em <b>Get API key</b> (obter chave) e depois em <b>Create API key</b> (criar chave).</li>
          <li>Para o uso do dia a dia, ative o <b>faturamento</b> do projeto no Google. Sem ele, o Google limita bastante o uso.</li>
          <li>Copie a chave (ela começa com <b>AIza</b>) e cole aqui.</li>
        </ol>
      </div>
      <div className="cfgi-sep" />
      <div className="cfgia-prov">
        <h4>OpenAI</h4>
        <ol className="cfgw-passos">
          <li>Entre em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"><b>platform.openai.com</b></a> com a conta da empresa.</li>
          <li>Em <b>Billing</b> (cobrança), coloque crédito: a OpenAI cobra antes do uso.</li>
          <li>Em <b>API keys</b>, toque em <b>Create new secret key</b>, dê um nome (por exemplo, Atenvo) e copie a chave (ela começa com <b>sk-</b>). Ela só aparece uma vez.</li>
          <li>Cole a chave aqui.</li>
        </ol>
      </div>
      </div>
      <div className="cfgi-sep" />
      <p className="cfgi-nota" role="note">O uso é cobrado na conta da própria empresa, no Google ou na OpenAI: cada resumo e cada transcrição gastam um pouco de crédito. A chave fica guardada só no servidor e, depois de salva, ninguém consegue ver a chave de novo, nem o administrador.</p>
    </CardVidro>
  );
}

function JanelaChave({ atual, aoFechar, aoAvisar }: { atual: EstadoChaveIa | null; aoFechar: () => void; aoAvisar: Avisar }) {
  const salvar = useSalvarChaveIa();
  const trocando = !!atual?.configurada;
  const [provedor, setProvedor] = useState<ProvedorIa>(atual?.provedor ?? 'gemini');
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending;
  const p = PROVEDORES_IA.find((x) => x.id === provedor)!;
  const enviar = async () => {
    const ruim = conferirChaveIa(provedor, chave);
    if (ruim) { setErro(MSG_IA[ruim]); return; }
    setErro('');
    try {
      await salvar.mutateAsync({ provedor, chave });
      aoAvisar(`Chave ${provedor === 'openai' ? 'da OpenAI' : 'do Google Gemini'} conectada. O Resumo do atendimento e o Transcrever já funcionam no WhatsApp.`);
      aoFechar();
    } catch (x) { setErro(traduzErroIa(x)); }
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!ocupado) aoFechar(); }} largura={540} fecharNoVeu={!ocupado}
      titulo={<div>{trocando ? 'Trocar a chave de IA' : 'Conectar a chave de IA'}<div className="mod-sub">A chave que a sua empresa criou no Google ou na OpenAI</div></div>}
      rodape={<><BotaoSec disabled={ocupado} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={() => void enviar()}>{ocupado ? `Conferindo com ${provedor === 'openai' ? 'a OpenAI' : 'o Google'}…` : 'Conferir e salvar'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <span className="pn-us-rot">De onde é a chave?</span>
          <div className="cfgo-numeros cfgia-duas" role="radiogroup" aria-label="Provedor da chave de IA">
            {PROVEDORES_IA.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={provedor === x.id} className={provedor === x.id ? 'on' : undefined} disabled={ocupado}
                onClick={() => { setProvedor(x.id); setErro(''); }}>
                <b>{x.nome}</b>
                <span>{x.id === 'gemini' ? `Recomendado · ${x.site}` : x.site}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pn-us-campo">
          <label htmlFor="ia-chave">Chave {provedor === 'openai' ? 'da OpenAI' : 'do Google Gemini'}</label>
          <input id="ia-chave" className="inp" type="password" value={chave} placeholder={provedor === 'openai' ? 'sk-…' : 'AIza…'} autoComplete="off" spellCheck={false} data-1p-ignore disabled={ocupado}
            onChange={(e) => { setChave(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); }} />
          <span className="pn-us-dica">Antes de salvar, o sistema confere a chave com {provedor === 'openai' ? 'a OpenAI' : 'o Google'} (sem gastar crédito). Ela fica guardada só no servidor e não aparece de novo. Criar a chave: {p.site}.</span>
          {trocando && <span className="pn-us-dica">A chave de agora ({atual?.final ? `termina em …${atual.final}` : nomeProvedor(atual?.provedor)}) é trocada por esta assim que ela for aceita.</span>}
          {isPrevia && <span className="cfgo-linha-links"><button type="button" className="cfgi-link" onClick={() => { setChave(CHAVE_EXEMPLO[provedor]); setErro(''); }}>Usar uma chave de exemplo</button></span>}
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
