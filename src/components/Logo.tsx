/** Logo oficial da Atenvo — SVG aprovado, copiado literalmente dos protótipos.
    Símbolo sempre verde; a tipografia adapta a cor ao tema via --logo-ink. */
export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="logo">
      <svg className="mark" viewBox="0 0 40 40" fill="none" role="img" aria-label="Atenvo">
        <circle cx="17" cy="21" r="12.8" fill="none" stroke="#19c37d" strokeWidth="3.7" strokeLinecap="round" strokeDasharray="72 9" transform="rotate(-52 17 21)" />
        <polygon points="30.5,4 32.3,9.2 37.5,11 32.3,12.8 30.5,18 28.7,12.8 23.5,11 28.7,9.2" fill="#19c37d" />
      </svg>
      {showText && <span className="logo-text">Atenvo</span>}
    </div>
  );
}
