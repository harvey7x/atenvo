/* Luz ambiente do Atenvo Obsidian (ATENVO-DESIGN.md, seção 3).
 *
 * Duas manchas de luz ESTÁTICAS, fixas, atrás de todo o conteúdo — são elas que dão
 * sentido ao vidro (blur sem luz atrás não desfoca nada). Regras do documento:
 * no máximo 2 por página, nenhuma animação, e sempre FORA de container com scroll —
 * por isso o componente é montado no shell (irmão do conteúdo), não dentro dele.
 * aria-hidden: é decoração pura, leitor de tela não deve anunciá-la. */
export function AmbientOrbs() {
  return (
    <div aria-hidden="true">
      <span className="ambient-orb ambient-orb--accent" />
      <span className="ambient-orb ambient-orb--cool" />
    </div>
  );
}
