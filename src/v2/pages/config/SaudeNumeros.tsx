/* SAÚDE DOS NÚMEROS do Atendimento (Configurações › WhatsApp, 25/11). Um cartão por número, com as mesmas barras dos
   cartões do Painel (mensagens que chegaram por dia, 7 dias), a nota (Boa / Atenção / Risco) e o motivo em português
   simples. As regras ficam em @/data/saudeNumeros (avaliarSaude). Só administrador; recurso 'saude-numeros'. */
import { spHoje } from '@/data/relatorios';
import { ROTULO_NOTA, avaliarSaude, useSaudeNumeros, type NotaSaude, type SaudeNumero } from '@/data/saudeNumeros';
import { BadgeStatus, EstadoErro } from '../../components';
import { CartaoMetrica, GradeMetricas, TituloBloco, diaDoBalao } from '../../components/CartaoMetrica';
import './saudeNumeros.css';

export const TOM_NOTA: Record<NotaSaude, 'ok' | 'atencao' | 'erro'> = { boa: 'ok', atencao: 'atencao', risco: 'erro' };
const int = (v: number) => v.toLocaleString('pt-BR');

function Cartao({ n, hoje }: { n: SaudeNumero; hoje: string }) {
  const a = avaliarSaude(n);
  const resp = n.chamadas7d ? Math.round((n.responderam7d / n.chamadas7d) * 100) : null;
  return (
    <CartaoMetrica icone="sinal" titulo={n.nome} className={'svn-cartao ' + a.nota}
      data={n.serie.map((d) => ({ date: d.dia, value: d.recebidas }))}
      total={int(n.hoje.recebidas)} unidade={n.hoje.recebidas === 1 ? 'chegou hoje' : 'chegaram hoje'}
      formatar={(v) => `${int(v)} ${v === 1 ? 'mensagem chegou' : 'mensagens chegaram'}`} formatarData={(d) => diaDoBalao(d, hoje)} variacao={false}
      cabDireita={<BadgeStatus tom={TOM_NOTA[a.nota]}>{ROTULO_NOTA[a.nota]}</BadgeStatus>}
      numSub={<span className="num">{int(n.hoje.enviadas)} {n.hoje.enviadas === 1 ? 'enviada' : 'enviadas'} · {int(n.hoje.falharam)} {n.hoje.falharam === 1 ? 'falhou' : 'falharam'}{resp != null ? ` · ${resp}% responderam (7 dias)` : ''}</span>}
      rodape={(
        <span className={'svn-motivos ' + a.nota}>
          {a.motivos.slice(0, 2).map((m) => <span key={m}>{m}</span>)}
        </span>
      )} />
  );
}

export function SaudeNumeros() {
  const q = useSaudeNumeros();
  const hoje = spHoje();
  const lista = q.data ?? [];
  const notas = lista.map((n) => avaliarSaude(n).nota);
  const emRisco = notas.filter((x) => x === 'risco').length;
  const emAtencao = notas.filter((x) => x === 'atencao').length;
  const sub = q.isLoading ? 'Conferindo os números…'
    : emRisco ? `${emRisco} ${emRisco === 1 ? 'número precisa' : 'números precisam'} de cuidado agora${emAtencao ? `, ${emAtencao} em atenção` : ''}.`
    : emAtencao ? `${emAtencao} ${emAtencao === 1 ? 'número' : 'números'} em atenção. As barras mostram as mensagens que chegaram em cada dia.`
    : 'Todos enviando e recebendo normalmente. As barras mostram as mensagens que chegaram em cada dia.';
  return (
    <section className="svn sobe" data-saude-numeros aria-labelledby="svn-tit">
      <TituloBloco titulo="Saúde dos números do Atendimento" sub={<span id="svn-tit">{sub}</span>} />
      {q.isError ? <EstadoErro titulo="Não foi possível conferir a saúde dos números" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
        : !q.isLoading && lista.length === 0 ? <p className="pn-vazio">Nenhum número do Atendimento ainda.</p>
        : (
          <GradeMetricas rotulo="Saúde dos números do Atendimento" colunas={3}>
            {lista.map((n) => <Cartao key={n.canalId} n={n} hoje={hoje} />)}
          </GradeMetricas>
        )}
    </section>
  );
}
