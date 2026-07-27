import { CardVidro, EstadoVazio } from '../components';

type EmConstrucaoProps = {
  titulo: string;
  subtitulo: string;
};

/**
 * Marcador de posição das páginas v2 ainda não recriadas — demonstra o
 * padrão .ph + cascata do shell. Cada rota troca este componente pela
 * página real na sessão dela (ordem no INVENTARIO.md).
 */
export default function EmConstrucao({ titulo, subtitulo }: EmConstrucaoProps) {
  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>{titulo}</h2>
          <p>{subtitulo}</p>
        </div>
      </div>
      <CardVidro sobe atraso={0.08}>
        <EstadoVazio
          titulo="Esta página ainda não foi recriada"
          descricao="Ela chega na sessão dela, seguindo a ordem aprovada do redesign. A página antiga continua funcionando normalmente fora do /v2."
        />
      </CardVidro>
    </>
  );
}
