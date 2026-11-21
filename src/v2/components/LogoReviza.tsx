/* ------------------------------------------------------------------
   Marca do REVIZA CRM (dono 21/11: "o nome do sistema vai se chamar
   Revisa CRM" — grafia com Z, a do endereço do sistema). Ícone no formato
   de app: quadrado de cantos bem redondos, corpo escuro com o dourado-
   alaranjado subindo de baixo, um fio de luz na borda e o R em blocos de
   cantos arredondados (arco chanfrado, perna destacada por um vão), do creme ao laranja. Desenho PRÓPRIO.
   Os arquivos de origem (SVG/PNG) estão em ~/Desktop/reviza-crm-logo e o
   gerador em ~/reviza-sist/logo/gerar.cjs.
   ------------------------------------------------------------------ */
import { useId } from 'react';

/** o R sozinho, na caixa 100×100 (para contornos e usos de uma tinta só) */
/* os cantos redondos vêm do traço (largura 6, junta redonda) na mesma tinta do preenchimento — por isso as
   formas estão 3 para dentro (e o olho, 3 para fora) */
export const R_REVIZA = 'M23 25.5 L29.5 19 H62.8 L77 33.2 V43.8 L66.8 54 H37 V81 H23 Z M37 27 H59.2 L67 34.8 V39.2 L59.2 47 H37 Z M52.3 66 H70.3 L82.4 81 H64.4 Z';

export function IconeReviza({ className, tam }: { className?: string; tam?: number }) {
  const id = 'rz' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className={className} viewBox="0 0 256 256" width={tam} height={tam} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reviza CRM" focusable="false">
      <defs>
        <linearGradient id={`${id}-corpo`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C1712" /><stop offset=".50" stopColor="#130F0B" />
          <stop offset=".76" stopColor="#241505" /><stop offset=".89" stopColor="#8F4E0A" />
          <stop offset=".965" stopColor="#EE8A1B" /><stop offset="1" stopColor="#FFC566" />
        </linearGradient>
        <radialGradient id={`${id}-brasa`} cx="128" cy="286" r="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE7B0" stopOpacity=".98" /><stop offset=".3" stopColor="#FFAA3D" stopOpacity=".9" />
          <stop offset=".62" stopColor="#E4720F" stopOpacity=".34" /><stop offset="1" stopColor="#E4720F" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-lustro`} cx="70" cy="18" r="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".13" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-borda`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".30" /><stop offset=".35" stopColor="#FFFFFF" stopOpacity=".05" />
          <stop offset=".75" stopColor="#FFB95A" stopOpacity=".35" /><stop offset="1" stopColor="#FFEBC2" stopOpacity=".95" />
        </linearGradient>
        <linearGradient id={`${id}-letra`} x1="0" y1="16" x2="0" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFF6E6" /><stop offset=".42" stopColor="#FFCB83" /><stop offset="1" stopColor="#F5871A" />
        </linearGradient>
        <clipPath id={`${id}-corte`}><rect width="256" height="256" rx="60" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-corte)`}>
        <rect width="256" height="256" fill={`url(#${id}-corpo)`} />
        <rect width="256" height="256" fill={`url(#${id}-brasa)`} />
        <rect width="256" height="256" fill={`url(#${id}-lustro)`} />
      </g>
      <rect x="1.25" y="1.25" width="253.5" height="253.5" rx="58.75" fill="none" stroke={`url(#${id}-borda)`} strokeWidth="2.5" />
      <path transform="translate(36.3 40) scale(1.76)" d={R_REVIZA} fill={`url(#${id}-letra)`} fillRule="evenodd"
        stroke={`url(#${id}-letra)`} strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}
