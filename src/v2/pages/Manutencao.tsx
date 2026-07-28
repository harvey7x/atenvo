import './manutencao.css';

/* Página única de manutenção (decisão de escopo do dono): áreas ainda
   não recriadas no v2 mostram esta cerimônia honesta na família Platina.
   Sem barra de progresso falsa, sem prazo prometido. */

export default function ManutencaoV2({ area }: { area: string }) {
  return (
    <div className="mnt">
      <div className="luz" aria-hidden />
      <div className="mnt-conteudo sobe">
        <div className="mnt-marca" aria-hidden>A</div>
        <div className="mnt-eyebrow">Em manutenção</div>
        <h2 className="mnt-titulo">Estamos construindo esta área.</h2>
        <p className="mnt-sub">{area} · Em breve no novo Atenvo.</p>
      </div>
    </div>
  );
}
