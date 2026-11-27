/* ------------------------------------------------------------------
   Marca do REVIZA CRM — a logo é a que o DONO criou e mandou em 21/11
   ("acabei de criar a logo, pode usar essa"): o ícone de app em vidro
   dourado-alaranjado com o R. Usamos o arquivo dele, recortado da imagem
   original (src/assets/reviza-crm-icone.png, 320px); nada redesenhado.
   Originais e tamanhos: ~/Desktop/reviza-crm-logo.
   ------------------------------------------------------------------ */
import icone from '../../assets/reviza-crm-icone.png';

export function IconeReviza({ className, tam }: { className?: string; tam?: number }) {
  return <img className={className} src={icone} width={tam} height={tam} alt="Reviza CRM" draggable={false} />;
}
