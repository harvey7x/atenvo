/* CONFIGURAÇÕES → COFRE DE CONVERSAS (26/11, "igual" ao sistema que a Reviza usava antes). O aviso do que a senha protege
   (só a visualização), o estado (desligado / ligado desde…), "Criar a senha" (liga o cofre), "Trocar a senha" (pede a
   atual), "Desligar o cofre" (pede a senha e destranca tudo) e a lista das conversas trancadas. Só o administrador.
   A senha quem digita é o administrador; o servidor guarda só o hash. Dados: @/data/cofre (migration 113). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, ModalV2 } from '../../components';
import { SENHA_MAX, SENHA_MIN, useDefinirSenhaCofre, useDesligarCofre, useEstadoCofre, useListaTrancadas, validarSenhaCofre, type ResultadoSenha } from '@/data/cofre';
import '../painel/painel.css';
import './camposMotivos.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : '');
const MSG: Record<Exclude<ResultadoSenha, 'ok'>, string> = { errada: 'Senha do cofre errada.', travado: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' };

export function ConfigCofre() {
  const est = useEstadoCofre();
  const lista = useListaTrancadas(est.data?.ligado === true);
  const nav = useNavigate();
  const [janela, setJanela] = useState<'criar' | 'trocar' | 'desligar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const e = est.data;
  return (
    <div className="pn cfgw cfgk" data-config-cofre>
      {aviso && <div className="gs-aviso ok" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="cfgk-alerta" role="note">
        <b>A senha protege só o que aparece na tela.</b> Não substitui o login, não impede que as mensagens cheguem e não impede a IA de responder. Use uma senha forte e não mande por grupo nem por mensagem.
      </div>
      <CardVidro spot className="pn-card sobe">
        {est.isLoading ? <p className="pn-vazio">Carregando o cofre…</p>
          : est.isError ? <EstadoErro titulo="Não foi possível carregar o cofre" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void est.refetch()} />
          : (
            <div className="cfgk-estado">
              <span className={'cfgk-ic' + (e?.ligado ? ' on' : '')} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d={e?.ligado ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'} /></svg>
              </span>
              <div className="cfgk-tx">
                <b>{e?.ligado ? 'Cofre ligado' : 'Cofre desligado'}</b>
                <span>{e?.ligado ? `Senha criada em ${quando(e.definidoEm)}${e.definidoPor ? ` por ${e.definidoPor}` : ''}. Qualquer pessoa que vê a conversa pode trancar pelo ⋯ da conversa; para ler, digita a senha.` : 'Crie a senha para começar a trancar conversas.'}</span>
              </div>
              <div className="cfgk-ac">
                {e?.ligado
                  ? <><BotaoSec onClick={() => setJanela('trocar')}>Trocar a senha</BotaoSec><button type="button" className="p-btn btn-perigo" onClick={() => setJanela('desligar')}>Desligar o cofre</button></>
                  : <BotaoPrimario onClick={() => setJanela('criar')}>Criar a senha</BotaoPrimario>}
              </div>
            </div>
          )}
      </CardVidro>
      <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>Conversas trancadas</h3><p>{e?.ligado ? (e.trancadas ? `${e.trancadas} ${e.trancadas === 1 ? 'conversa trancada' : 'conversas trancadas'}.` : 'Nenhuma conversa trancada.') : 'Crie a senha do cofre antes de trancar conversas.'}</p></div></div>
        {e?.ligado && (lista.data ?? []).length > 0 && (
          <ul className="cfgm-lista">
            {(lista.data ?? []).map((c) => (
              <li key={c.conversaId} className="fixo">
                <span className="cfgk-cad" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </span>
                <span className="cfgm-nome"><button type="button" className="cfgm-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(c.conversaId))}>{c.contato}</button><small>Para ler ou tirar do cofre, abra a conversa e digite a senha.</small></span>
              </li>
            ))}
          </ul>
        )}
      </CardVidro>
      {janela && <JanelaSenha modo={janela} aoFechar={() => setJanela(null)} aoAvisar={setAviso} />}
    </div>
  );
}

function JanelaSenha({ modo, aoFechar, aoAvisar }: { modo: 'criar' | 'trocar' | 'desligar'; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const definir = useDefinirSenhaCofre();
  const desligar = useDesligarCofre();
  const [atual, setAtual] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const ocupado = definir.isPending || desligar.isPending;
  const ir = async () => {
    setErro('');
    try {
      if (modo === 'desligar') {
        const r = await desligar.mutateAsync(atual);
        if (r !== 'ok') { setErro(MSG[r]); return; }
        aoAvisar('Cofre desligado. Todas as conversas foram destrancadas.'); aoFechar(); return;
      }
      const e = validarSenhaCofre(senha, confirma); if (e) { setErro(e); return; }
      const r = await definir.mutateAsync({ senha, atual: modo === 'trocar' ? atual : undefined });
      if (r !== 'ok') { setErro(r === 'errada' ? 'A senha atual está errada.' : MSG[r]); return; }
      aoAvisar(modo === 'criar' ? 'Cofre ligado. Agora dá para trancar conversas pelo ⋯ da conversa.' : 'Senha do cofre trocada.');
      aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  const titulo = modo === 'criar' ? 'Criar a senha do cofre' : modo === 'trocar' ? 'Trocar a senha do cofre' : 'Desligar o cofre';
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={440}
      titulo={<div>{titulo}<div className="mod-sub">{modo === 'desligar' ? 'Todas as conversas trancadas voltam a aparecer para quem as vê' : 'Uma senha única para todas as conversas trancadas'}</div></div>}
      rodape={<>
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        {modo === 'desligar'
          ? <button type="button" className="p-btn btn-perigo" disabled={ocupado || !atual} onClick={() => void ir()}>{ocupado ? 'Desligando…' : 'Desligar o cofre'}</button>
          : <BotaoPrimario disabled={ocupado} onClick={() => void ir()}>{ocupado ? 'Salvando…' : modo === 'criar' ? 'Criar e ligar' : 'Trocar a senha'}</BotaoPrimario>}
      </>}>
      <form className="pn-us-form" onSubmit={(ev) => { ev.preventDefault(); void ir(); }}>
        {modo !== 'criar' && (
          <div className="pn-us-campo"><label htmlFor="cofre-atual">{modo === 'desligar' ? 'Senha do cofre' : 'Senha atual'}</label>
            <input id="cofre-atual" className="inp" type="password" autoComplete="off" value={atual} maxLength={SENHA_MAX} autoFocus onChange={(e) => { setAtual(e.target.value); setErro(''); }} /></div>
        )}
        {modo !== 'desligar' && (
          <>
            <div className="pn-us-campo"><label htmlFor="cofre-nova">{modo === 'criar' ? 'Senha' : 'Nova senha'}</label>
              <input id="cofre-nova" className="inp" type="password" autoComplete="new-password" value={senha} maxLength={SENHA_MAX} autoFocus={modo === 'criar'} onChange={(e) => { setSenha(e.target.value); setErro(''); }} />
              <span className="cfgc-dica">Pelo menos {SENHA_MIN} letras ou números. Não é a senha de entrar no sistema.</span></div>
            <div className="pn-us-campo"><label htmlFor="cofre-conf">Repita a senha</label>
              <input id="cofre-conf" className="inp" type="password" autoComplete="new-password" value={confirma} maxLength={SENHA_MAX} onChange={(e) => { setConfirma(e.target.value); setErro(''); }} /></div>
          </>
        )}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        <button type="submit" hidden />
      </form>
    </ModalV2>
  );
}
