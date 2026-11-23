/* QUEM SÓ TRABALHA NO ATENDIMENTO, ANTES DELE SER LIGADO (23/11). O administrador já pode cadastrar a
   equipe do Atendimento (papel atendente, ambientes, equipes) antes de o Atendimento existir no servidor.
   Quem entra e não tem as Cobranças não tem nada para abrir ainda: em vez de telas vazias, este aviso.
   O banco já não entrega nada das Cobranças para essa pessoa (migration 92). */
import { MolduraAcesso } from './MolduraAcesso';
import { IconeReviza } from '../components/LogoReviza';

export function AtendimentoAguardando({ nome, aoSair }: { nome: string | null; aoSair: () => void }) {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0];
  return (
    <MolduraAcesso>
      <div className="lg-card vidro pg-entra">
        <IconeReviza className="marca2" />
        <div className="caps">Atendimento</div>
        <h1 className="p-display">{primeiro ? `Olá, ${primeiro}.` : 'Olá.'} Seu acesso já está criado.</h1>
        <div className="sub">
          O Atendimento ainda está sendo ligado no sistema. Quando estiver pronto, é só entrar de novo com o mesmo usuário e a mesma senha.
        </div>
        <button type="button" className="entrar" onClick={aoSair}>Sair</button>
      </div>
    </MolduraAcesso>
  );
}
