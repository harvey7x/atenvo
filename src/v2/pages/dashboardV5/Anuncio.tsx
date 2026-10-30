import type { CanalV5 } from '@/data/dashboardV5.tipos';
import { fmtInt, fmtTelefone, nomeTrafego } from '@/data/dashboardV5.formato';
import { Skeleton } from '../../components';
import { Ajuda, Legenda, PontoStatus, Secao } from './comum';

/* Anúncio e quem já estava no sistema (dono, 30/10: "aqui no dashboard deixo tudo que entrou ao
   total, em outra área a gente coloca os leads que entraram e já estavam no sistema"). A quebra
   das ENTRADAS de cada número, com a régua do Gerenciador de Anúncios (cada dia conta):
   - Pelo anúncio: mandaram a mensagem do anúncio — novos e quem já estava no sistema. É o número
     para comparar com o Gerenciador.
   - Já estavam no sistema: já tinham falado com a CAF e voltaram pelo anúncio; embaixo, por qual
     tráfego tinham entrado antes (os rótulos do relatório diário em PDF).
   - Sem a mensagem do anúncio: o resto das entradas (escreveram direto no número, importados).
   Entradas = Pelo anúncio + Sem a mensagem do anúncio. */

const AJUDA = {
  pelo: 'Clientes que mandaram a mensagem do anúncio para o número — os novos e os que já estavam no sistema —, contando cada dia, como o Gerenciador de Anúncios. É este o número para comparar com o Gerenciador.',
  ja: 'Já tinham falado com a CAF antes e voltaram pela mensagem do anúncio. Eles estão somados nas entradas. Embaixo, por qual tráfego tinham entrado antes.',
  sem: 'Entradas que não vieram pela mensagem do anúncio: escreveram direto no número ou foram importadas à mão. O Gerenciador de Anúncios não conta essas.',
};

/** "Diego 17 · Andrius 4 · Antônio 2" */
function Origens({ c }: { c: CanalV5 }) {
  if (!c.retornosOrigens.length) return null;
  return (
    <small className="d5-orig">
      <Legenda partes={c.retornosOrigens.map((o) => `${nomeTrafego(o.nome)} ${fmtInt(o.n)}`)} />
    </small>
  );
}

const semAnuncio = (c: Pick<CanalV5, 'entradas' | 'peloAnuncio'>) =>
  (c.peloAnuncio == null ? null : Math.max(0, c.entradas - c.peloAnuncio));

export function Anuncio({ canais }: { canais: CanalV5[] }) {
  const linhas = canais.filter((c) => c.entradas > 0);
  const tot = {
    entradas: linhas.reduce((s, c) => s + c.entradas, 0),
    pelo: linhas.some((c) => c.peloAnuncio != null) ? linhas.reduce((s, c) => s + (c.peloAnuncio ?? 0), 0) : null,
    ja: linhas.reduce((s, c) => s + c.retornos, 0),
  };
  return (
    <Secao className="d5-anuncio" titulo="Anúncio e quem já estava no sistema"
      sub="A quebra das entradas de cada número, contando cada dia como o Gerenciador de Anúncios. Compare a coluna Pelo anúncio com o Gerenciador.">
      <div className="d5-tab-rolo">
        <table className="d5-tab">
          <colgroup>
            <col className="d5-c-nome" /><col className="d5-c-n" /><col className="d5-c-n" /><col className="d5-c-orig" /><col className="d5-c-n" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Número</th>
              <th scope="col" className="d5-dir">Entradas</th>
              <th scope="col" className="d5-dir">
                <span className="d5-th-ajuda"><Ajuda rotulo="Pelo anúncio" texto={AJUDA.pelo} /><span>Pelo anúncio</span></span>
              </th>
              <th scope="col" className="d5-dir">
                <span className="d5-th-ajuda"><Ajuda rotulo="Já estavam no sistema" texto={AJUDA.ja} /><span>Já estavam no sistema</span></span>
              </th>
              <th scope="col" className="d5-dir">
                <span className="d5-th-ajuda"><Ajuda rotulo="Sem a mensagem do anúncio" texto={AJUDA.sem} /><span>Sem a mensagem do anúncio</span></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => {
              const sem = semAnuncio(c);
              return (
                <tr key={c.canalId ?? 'antigos'} className={c.situacao === 'antigo' ? 'd5-lin-antigo' : undefined}>
                  <th scope="row" className="d5-nome">
                    <span className="d5-nome-in">
                      <PontoStatus situacao={c.situacao} />
                      <span className="d5-cel2">
                        <b title={c.nome}>{c.situacao === 'antigo' ? 'Números antigos' : c.nome}</b>
                        {c.situacao === 'antigo'
                          ? <small>Removidos ou desconectados</small>
                          : <small className="num d5-tel">{fmtTelefone(c.numero)}</small>}
                      </span>
                    </span>
                  </th>
                  <td className="d5-dir"><b className="num">{fmtInt(c.entradas)}</b></td>
                  <td className="d5-dir"><b className="num">{c.peloAnuncio == null ? '—' : fmtInt(c.peloAnuncio)}</b></td>
                  <td className="d5-dir">
                    <span className="d5-cel2 d5-cel2-dir">
                      <b className={'num' + (c.retornos ? ' d5-ja' : ' d5-mudo')}>{fmtInt(c.retornos)}</b>
                      <Origens c={c} />
                    </span>
                  </td>
                  <td className="d5-dir"><span className={'num' + (sem ? '' : ' d5-mudo')}>{sem == null ? '—' : fmtInt(sem)}</span></td>
                </tr>
              );
            })}
          </tbody>
          {linhas.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row" className="d5-nome"><span className="d5-cel2 d5-tot-rot"><b>Total</b></span></th>
                <td className="d5-dir"><b className="num">{fmtInt(tot.entradas)}</b></td>
                <td className="d5-dir"><b className="num">{tot.pelo == null ? '—' : fmtInt(tot.pelo)}</b></td>
                <td className="d5-dir"><b className="num">{fmtInt(tot.ja)}</b></td>
                <td className="d5-dir"><b className="num">{tot.pelo == null ? '—' : fmtInt(Math.max(0, tot.entradas - tot.pelo))}</b></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Secao>
  );
}

export function AnuncioSkeleton() {
  return (
    <Secao className="d5-anuncio" titulo="Anúncio e quem já estava no sistema">
      <div className="d5-sk-linhas" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} altura={38} raio={6} />)}
      </div>
    </Secao>
  );
}
