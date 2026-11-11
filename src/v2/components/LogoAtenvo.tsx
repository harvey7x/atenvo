/* ------------------------------------------------------------------
   Marca ALFA GROUP (branch de demonstração alfa-demo) — monograma de
   triângulo em OURO, escala 1:1 em qualquer tamanho (sidebar, login,
   favicon). Combina com a base preto/branco + acento dourado do sistema.
   Componente segue chamado LogoAtenvo p/ não mexer nos imports.
   ------------------------------------------------------------------ */
export function LogoAtenvo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ALFA GROUP">
      <defs>
        <linearGradient id="ag-go" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F8E29A" />
          <stop offset=".5" stopColor="#D9A93B" />
          <stop offset="1" stopColor="#A9761B" />
        </linearGradient>
        <linearGradient id="ag-go2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBEAB0" />
          <stop offset="1" stopColor="#C79430" />
        </linearGradient>
        <filter id="ag-sh" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#D9A93B" floodOpacity=".22" />
        </filter>
      </defs>
      <g filter="url(#ag-sh)">
        <path d="M128 26 L232 220 L24 220 Z" fill="none" stroke="url(#ag-go)" strokeWidth="15" strokeLinejoin="round" />
        <path d="M128 78 L188 206 L112 206 L146 142 L104 142 L68 206" fill="none" stroke="url(#ag-go2)" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M98 180 L158 180" stroke="url(#ag-go)" strokeWidth="13" strokeLinecap="round" />
      </g>
    </svg>
  );
}
