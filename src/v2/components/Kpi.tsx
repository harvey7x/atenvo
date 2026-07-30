import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CardVidro } from './CardVidro';
import './componentes.css';

export type FormatoContador = 'int' | 'mil';

function formata(v: number, formato: FormatoContador) {
  return formato === 'mil' ? v.toLocaleString('pt-BR') : String(v);
}

/**
 * Contador animado do mockup: parte do valor exibido (0 na carga) até o alvo
 * em 900ms com ease-out cúbico, após 320ms de espera inicial. Se o alvo mudar
 * depois (query/realtime), anima do valor atual para o novo sem esperar.
 * Com prefers-reduced-motion mostra o valor final direto.
 */
export function useContador(alvo: number, formato: FormatoContador = 'int'): string {
  const [texto, setTexto] = useState('0');
  const exibido = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      exibido.current = alvo;
      setTexto(formata(alvo, formato));
      return;
    }
    const de = exibido.current;
    if (de === alvo) {
      setTexto(formata(alvo, formato));
      return;
    }
    let quadro = 0;
    let t0: number | null = null;
    function passo(ts: number) {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / 900, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const atual = Math.round(de + (alvo - de) * e);
      exibido.current = atual;
      setTexto(formata(atual, formato));
      if (p < 1) quadro = requestAnimationFrame(passo);
    }
    // espera de 320ms só na carga (partindo de 0), como no mockup
    const espera = window.setTimeout(() => {
      quadro = requestAnimationFrame(passo);
    }, de === 0 ? 320 : 0);
    return () => {
      window.clearTimeout(espera);
      cancelAnimationFrame(quadro);
    };
  }, [alvo, formato]);

  return texto;
}

/**
 * Gradientes compartilhados das sparklines (ids globais do mockup).
 * Renderize UMA vez por página que use <Kpi> com sparkline.
 */
export function DefsSpark() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {/* cores via style (não atributo): var() só resolve em contexto CSS — no light a
            sparkline vira tinta grafite em vez de branco invisível (auditoria). */}
        <linearGradient id="gPrata" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'rgb(var(--tint))' }} stopOpacity=".9" />
          <stop offset="1" style={{ stopColor: 'var(--txt-2)' }} stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="gPrataArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--tint))' }} stopOpacity=".14" />
          <stop offset="1" style={{ stopColor: 'rgb(var(--tint))' }} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Sparkline que se desenha (viewBox 120×34; y em 0–34, menor = mais alto). */
export function Spark({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) return null;
  const passo = 120 / (pontos.length - 1);
  const cords = pontos.map((y, i) => `${Math.round(i * passo)},${y}`);
  const linha = `M${cords.join(' L')}`;
  const area = `${cords.join(' ')} 120,34 0,34`;
  return (
    <svg className="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden>
      <polygon points={area} />
      <path pathLength={1} d={linha} />
    </svg>
  );
}

export type TomDelta = 'ok' | 'atencao' | 'neutro' | 'erro';
const TOM_DELTA: Record<TomDelta, string> = {
  ok: 'd-ok',
  atencao: 'd-at',
  neutro: 'd-ne',
  erro: 'd-er',
};

type KpiProps = {
  rotulo: string;
  /** Valor numérico do contador animado. */
  valor: number;
  formato?: FormatoContador;
  /** Texto antes do número (ex.: "R$ "). */
  prefixo?: ReactNode;
  /** Sufixo apagado (.cent — ex.: ",00", "%", "min"). */
  sufixo?: ReactNode;
  delta?: { tom: TomDelta; texto: ReactNode };
  /** Pontos da sparkline (omitida se ausente). */
  spark?: number[];
  /** Tinge o valor na semântica (ex.: vencidas em rubro, recebido em verde). */
  tomValor?: 'ok' | 'erro';
  sobe?: boolean;
  atraso?: number;
};

/** Card de KPI do dashboard: rótulo, contador animado, delta e sparkline. */
export function Kpi({ rotulo, valor, formato = 'int', prefixo, sufixo, delta, spark, tomValor, sobe, atraso }: KpiProps) {
  const texto = useContador(valor, formato);
  const corValor = tomValor === 'ok' ? 'var(--verde)' : tomValor === 'erro' ? 'var(--rubro)' : undefined;
  return (
    <CardVidro spot sobe={sobe} atraso={atraso} className="kpi">
      <div className="rot">{rotulo}</div>
      <div className="val num" style={corValor ? { color: corValor } : undefined}>
        {prefixo}
        <span>{texto}</span>
        {sufixo !== undefined && <span className="cent">{sufixo}</span>}
      </div>
      {delta && <span className={`delta ${TOM_DELTA[delta.tom]}`}>{delta.texto}</span>}
      {spark && <Spark pontos={spark} />}
    </CardVidro>
  );
}
