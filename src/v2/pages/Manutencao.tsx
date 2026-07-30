import './manutencao.css';

/* Página única de manutenção (decisão de escopo do dono): áreas ainda
   não recriadas no v2 mostram esta cerimônia honesta na família Platina.
   Sem barra de progresso falsa, sem prazo prometido. */

export default function ManutencaoV2({ area, descontinuada = false }: { area: string; descontinuada?: boolean }) {
  return (
    <div className="mnt">
      <div className="luz" aria-hidden />
      <div className="mnt-conteudo sobe">
        <div className="mnt-marca" aria-hidden>A</div>
        <div className="mnt-eyebrow">{descontinuada ? 'Descontinuado' : 'Em manutenção'}</div>
        <h2 className="mnt-titulo">{descontinuada ? 'Esta área foi descontinuada.' : 'Estamos construindo esta área.'}</h2>
        <p className="mnt-sub">{descontinuada ? `${area} · não faz mais parte do Atenvo.` : `${area} · Em breve no novo Atenvo.`}</p>
      </div>
    </div>
  );
}
