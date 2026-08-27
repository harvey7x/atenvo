/* ------------------------------------------------------------------
   Marca Atenvo (teste/skin-aurora-azul) — recriação vetorial da
   referência do dono: quadrado arredondado escuro com bloom azul na
   base, seta/"A" em chevron branco (ápice alto, entalhe côncavo) e
   diamante flutuando no entalhe. Mesmo desenho em qualquer tamanho
   (sidebar 29px, login 42px, favicon) — quem dimensiona é o CSS do
   ponto de uso (.marca/.marca2); public/favicon.svg é cópia 1:1.
   ------------------------------------------------------------------ */
export function LogoAtenvo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="lgAt-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#08090D" />
          <stop offset=".52" stopColor="#0B1322" />
          <stop offset=".82" stopColor="#1E3E85" />
          <stop offset="1" stopColor="#3E7BF0" />
        </linearGradient>
        <radialGradient id="lgAt-glow" cx=".5" cy="1.05" r=".78">
          <stop offset="0" stopColor="#66A3FF" stopOpacity=".8" />
          <stop offset=".55" stopColor="#3E7BF0" stopOpacity=".26" />
          <stop offset="1" stopColor="#3E7BF0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lgAt-seta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#B6C8EC" />
        </linearGradient>
        <linearGradient id="lgAt-dia" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF1FF" />
          <stop offset="1" stopColor="#96B5EA" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="248" height="248" rx="58" fill="url(#lgAt-bg)" />
      <rect x="4" y="4" width="248" height="248" rx="58" fill="url(#lgAt-glow)" />
      <rect x="5.5" y="5.5" width="245" height="245" rx="56.5" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1.5" />
      <circle cx="128" cy="128" r="86" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1.5" />
      <path d="M128 50 L196 196 L128 150 L60 196 Z" fill="url(#lgAt-seta)" />
      <path d="M128 166 L154 188 L128 226 L102 188 Z" fill="url(#lgAt-dia)" />
    </svg>
  );
}
