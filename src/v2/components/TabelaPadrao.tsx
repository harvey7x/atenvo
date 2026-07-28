import type { ReactNode } from 'react';
import './componentes.css';

/* ------------------------------------------------------------------
   Tabela padrão do mockup: thead em caps, hover de linha, seleção
   com checkbox, barra bulk platina (aparece quando há seleção) e
   rodapé com paginação. DADO É CALMO: nenhum efeito interno além
   do hover (contrato, item 6) e nada de backdrop-filter em células
   (item 8) — o vidro fica no contêiner externo.
   ------------------------------------------------------------------ */

export type Coluna<T> = {
  chave: string;
  titulo: ReactNode;
  /** Alinhamento à direita (th.d/td.d — valores e datas). */
  dir?: boolean;
  /** Classes do <td>, como no mockup: 'nome', 'num', 'nome num'… */
  classe?: string | ((linha: T) => string);
  largura?: string;
  render: (linha: T) => ReactNode;
};

type Paginacao = {
  pagina: number;
  totalPaginas: number;
  aoIr: (pagina: number) => void;
};

type TabelaPadraoProps<T> = {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  /** Habilita a coluna de checkboxes + barra bulk. */
  selecao?: {
    selecionadas: ReadonlySet<string>;
    aoAlternar: (id: string) => void;
    aoLimpar: () => void;
    /** Ações da barra platina (ex.: Enviar mensagem, Exportar). */
    acoes: { rotulo: string; onClick: (ids: string[]) => void }[];
    rotuloContagem?: (n: number) => string;
  };
  rodape?: { texto: ReactNode; paginacao?: Paginacao };
  /** Linha inteira clicável (ex.: abrir detalhe). Cliques em botões/checkbox internos não disparam. */
  aoClicarLinha?: (linha: T) => void;
};

export function Checkbox({ marcado, aoAlternar, rotulo }: {
  marcado: boolean;
  aoAlternar: () => void;
  rotulo?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={rotulo ?? 'Selecionar'}
      className={marcado ? 'cbx on' : 'cbx'}
      onClick={(ev) => {
        ev.stopPropagation();
        aoAlternar();
      }}
    />
  );
}

/* Mesma anatomia do mockup: ‹ 1 2 3 … 214 › — três primeiras (ou últimas)
   quando perto da borda, vizinhança da atual no meio. */
function paginasVisiveis(pagina: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (pagina <= 3) return [1, 2, 3, '…', total];
  if (pagina >= total - 2) return [1, '…', total - 2, total - 1, total];
  return [1, '…', pagina - 1, pagina, pagina + 1, '…', total];
}

export function TabelaPadrao<T>({ colunas, linhas, chave, selecao, rodape, aoClicarLinha }: TabelaPadraoProps<T>) {
  const ids = linhas.map(chave);
  const selecionadas = selecao?.selecionadas ?? new Set<string>();
  const pg = rodape?.paginacao;

  return (
    <div>
      {selecao && selecionadas.size > 0 && (
        <div className="bulk">
          <Checkbox marcado aoAlternar={selecao.aoLimpar} rotulo="Limpar seleção" />
          <span className="c num">
            {selecao.rotuloContagem
              ? selecao.rotuloContagem(selecionadas.size)
              : `${selecionadas.size} selecionados`}
          </span>
          <div className="bs">
            {selecao.acoes.map((a) => (
              <button key={a.rotulo} type="button" onClick={() => a.onClick([...selecionadas])}>
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}
      <table>
        <thead>
          <tr>
            {selecao && <th style={{ width: 36 }} aria-label="Seleção" />}
            {colunas.map((c) => (
              <th key={c.chave} className={c.dir ? 'd' : undefined} style={c.largura ? { width: c.largura } : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => {
            const id = ids[i];
            const sel = selecionadas.has(id);
            return (
              <tr
                key={id}
                className={sel ? 'sel' : undefined}
                style={aoClicarLinha ? { cursor: 'pointer' } : undefined}
                onClick={aoClicarLinha ? (ev) => {
                  // não rouba cliques de controles internos (checkbox, botões, links)
                  if ((ev.target as HTMLElement).closest('button, a, input, select')) return;
                  aoClicarLinha(linha);
                } : undefined}
              >
                {selecao && (
                  <td>
                    <Checkbox marcado={sel} aoAlternar={() => selecao.aoAlternar(id)} />
                  </td>
                )}
                {colunas.map((c) => {
                  const classe = typeof c.classe === 'function' ? c.classe(linha) : c.classe;
                  const cls = [c.dir ? 'd' : '', classe ?? ''].filter(Boolean).join(' ');
                  return (
                    <td key={c.chave} className={cls || undefined}>
                      {c.render(linha)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rodape && (
        <div className="rodape-tab">
          <span className="num">{rodape.texto}</span>
          {pg && pg.totalPaginas > 1 && (
            <nav className="pag" aria-label="Paginação">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={pg.pagina <= 1}
                onClick={() => pg.aoIr(pg.pagina - 1)}
              >‹</button>
              {paginasVisiveis(pg.pagina, pg.totalPaginas).map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} aria-hidden>…</span>
                ) : (
                  <button
                    type="button"
                    key={p}
                    className={p === pg.pagina ? 'on num' : 'num'}
                    aria-current={p === pg.pagina ? 'page' : undefined}
                    onClick={() => pg.aoIr(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="Próxima página"
                disabled={pg.pagina >= pg.totalPaginas}
                onClick={() => pg.aoIr(pg.pagina + 1)}
              >›</button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
