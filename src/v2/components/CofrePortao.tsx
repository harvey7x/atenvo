/* COFRE: o que aparece NO LUGAR das mensagens de uma conversa trancada (26/11). A pessoa digita a senha do cofre e a
   conversa fica aberta por 15 minutos nesta aba, ou tira a conversa do cofre (também com a senha). Ninguém vê o conteúdo
   antes disso — nem as mensagens, nem a mídia do painel. Dados: @/data/cofre (migration 113). */
import { useState } from 'react';
import { ABERTA_MIN, SENHA_MAX, type ResultadoSenha } from '@/data/cofre';
import './cofrePortao.css';

const MSG: Record<Exclude<ResultadoSenha, 'ok'>, string> = { errada: 'Senha do cofre errada.', travado: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' };

export function CofrePortao({ aoAbrir, aoTirar }: { aoAbrir: (senha: string) => Promise<ResultadoSenha>; aoTirar: (senha: string) => Promise<ResultadoSenha> }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ir = async (f: (s: string) => Promise<ResultadoSenha>) => {
    if (!senha) { setErro('Digite a senha do cofre.'); return; }
    setOcupado(true); setErro('');
    try { const r = await f(senha); if (r !== 'ok') setErro(MSG[r]); else setSenha(''); }
    catch (x) { setErro((x as Error).message); }
    finally { setOcupado(false); }
  };
  return (
    <div className="cofre-portao" data-cofre-portao role="region" aria-label="Conversa trancada no cofre">
      <span className="cofre-ic" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      </span>
      <b>Conversa trancada no cofre</b>
      <p>As mensagens continuam chegando. Para ler, digite a senha do cofre: a conversa fica aberta por {ABERTA_MIN} minutos nesta aba.</p>
      <form className="cofre-form" onSubmit={(e) => { e.preventDefault(); void ir(aoAbrir); }}>
        <label className="cofre-sr" htmlFor="cofre-senha-conv">Senha do cofre</label>
        <input id="cofre-senha-conv" className="inp" type="password" autoComplete="off" placeholder="Senha do cofre" value={senha} maxLength={SENHA_MAX} onChange={(e) => { setSenha(e.target.value); setErro(''); }} />
        <button type="submit" className="cofre-ok" disabled={ocupado}>{ocupado ? 'Conferindo…' : 'Abrir'}</button>
      </form>
      {erro && <span className="cofre-erro" role="alert">{erro}</span>}
      <button type="button" className="cofre-tirar" disabled={ocupado} onClick={() => void ir(aoTirar)}>Tirar do cofre com esta senha</button>
    </div>
  );
}
