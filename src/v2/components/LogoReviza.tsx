/* 28/11 (dono: "copiar tudo do Reviza… só deixa o nosso logo"): as telas vindas do Reviza pedem o ícone por
   este nome; aqui ele é a marca do ATENVO (LogoAtenvo). O arquivo do Reviza (src/assets/reviza-crm-icone.png) fica
   só no repositório dele. */
import { LogoAtenvo } from './LogoAtenvo';

export function IconeReviza({ className, tam }: { className?: string; tam?: number }) {
  return (
    <span className={className} style={tam ? { display: 'inline-block', width: tam, height: tam, lineHeight: 0 } : { display: 'contents' }} aria-label="Atenvo" role="img">
      <LogoAtenvo />
    </span>
  );
}
