/* ------------------------------------------------------------------
   Marca Atenvo (teste/skin-aurora-azul) — recriação vetorial da
   referência do dono: quadrado arredondado escuro com bloom azul
   CONCENTRADO na base + rim light azul na borda inferior, seta/"A"
   em chevron branco com sombra projetada (profundidade) e diamante
   flutuando no entalhe com sombra própria. Mesmo desenho em qualquer
   tamanho (sidebar 29px, login 42px, favicon) — quem dimensiona é o
   CSS do ponto de uso; public/favicon.svg é cópia 1:1.
   ------------------------------------------------------------------ */
export function LogoAtenvo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        {/* stops azuis em style + var(--lg-*): o atributo SVG não resolve var(),
            o style resolve — fallback = azul de produção; o acento verde
            (skinAurora, [data-acento="verde"]) só redefine as vars */}
        <linearGradient id="lgAt-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07080C" />
          <stop offset=".5" stopColor="#0A101D" />
          <stop offset=".8" style={{ stopColor: 'var(--lg-bg3, #17337A)' }} />
          <stop offset="1" style={{ stopColor: 'var(--lg-bg4, #3E7BF0)' }} />
        </linearGradient>
        {/* bloom apertado, colado na base — não um gradiente difuso */}
        <radialGradient id="lgAt-glow" cx=".5" cy="1.08" r=".62">
          <stop offset="0" style={{ stopColor: 'var(--lg-glow1, #7FB4FF)' }} stopOpacity=".95" />
          <stop offset=".45" style={{ stopColor: 'var(--lg-glow2, #3E7BF0)' }} stopOpacity=".42" />
          <stop offset="1" style={{ stopColor: 'var(--lg-glow2, #3E7BF0)' }} stopOpacity="0" />
        </radialGradient>
        {/* rim light: o FIO da borda acende embaixo e fica neutro em cima */}
        <linearGradient id="lgAt-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".18" />
          <stop offset=".55" style={{ stopColor: 'var(--lg-rim1, #7FA8FF)' }} stopOpacity=".14" />
          <stop offset=".88" style={{ stopColor: 'var(--lg-rim2, #8FBCFF)' }} stopOpacity=".75" />
          <stop offset="1" style={{ stopColor: 'var(--lg-rim3, #AFD2FF)' }} stopOpacity=".95" />
        </linearGradient>
        <linearGradient id="lgAt-seta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" style={{ stopColor: 'var(--lg-seta1, #E9EFFA)' }} />
          <stop offset="1" style={{ stopColor: 'var(--lg-seta2, #AEC4EA)' }} />
        </linearGradient>
        <linearGradient id="lgAt-dia" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--lg-dia1, #F2F7FF)' }} />
          <stop offset="1" style={{ stopColor: 'var(--lg-dia2, #8FB0E6)' }} />
        </linearGradient>
        <filter id="lgAt-sombra" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#04060D" floodOpacity=".6" />
        </filter>
        <filter id="lgAt-sombra2" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#04060D" floodOpacity=".55" />
        </filter>
      </defs>
      <rect x="4" y="4" width="248" height="248" rx="58" fill="url(#lgAt-bg)" />
      <rect x="4" y="4" width="248" height="248" rx="58" fill="url(#lgAt-glow)" />
      <circle cx="128" cy="128" r="86" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1.5" />
      <circle cx="128" cy="128" r="108" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="1.5" />
      <path d="M128 50 L196 196 L128 150 L60 196 Z" fill="url(#lgAt-seta)" filter="url(#lgAt-sombra)" />
      <path d="M128 166 L154 188 L128 226 L102 188 Z" fill="url(#lgAt-dia)" filter="url(#lgAt-sombra2)" />
      <rect x="5.5" y="5.5" width="245" height="245" rx="56.5" fill="none" stroke="url(#lgAt-rim)" strokeWidth="2.5" />
    </svg>
  );
}
