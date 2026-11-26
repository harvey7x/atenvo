/* CONFIGURAÇÕES → FUNIL (26/11, dono: "mais preenchido, sem muitos espaços"). As quatro telas pequenas do funil viraram
   UMA, em abas, com a faixa de números no topo: Botão de venda · Origem do lead · Motivos de fechamento · Campos do
   cliente. Os endereços antigos (/config/venda etc.) continuam valendo e abrem a aba certa. As telas de cada aba são as
   mesmas de antes (ConfigVenda, ConfigOrigens, ConfigMotivos, ConfigCampos): nada mudou no que elas fazem. */
import { useNavigate } from 'react-router-dom';
import { Segmentado } from '../../components';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import { rotuloBotao, useConfigVenda, useHistoricoVendas, useOrigens, useResumoOrigens } from '@/data/vendaOrigem';
import { useHistoricoMotivos, useMotivos } from '@/data/motivosFechamento';
import { useCampos } from '@/data/camposPersonalizados';
import { ConfigVenda } from './ConfigVenda';
import { ConfigOrigens } from './ConfigOrigens';
import { ConfigMotivos } from './ConfigMotivos';
import { ConfigCampos } from './ConfigCampos';
import './combinadas.css';

export type AbaFunil = 'venda' | 'origens' | 'motivos' | 'campos';
export const ABAS_FUNIL: { valor: AbaFunil; rotulo: string }[] = [
  { valor: 'venda', rotulo: 'Botão de venda' }, { valor: 'origens', rotulo: 'Origem do lead' }, { valor: 'motivos', rotulo: 'Motivos de fechamento' }, { valor: 'campos', rotulo: 'Campos do cliente' },
];
const int = (n: number) => n.toLocaleString('pt-BR');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function ConfigFunil({ aba, temVenda, temCampos }: { aba: AbaFunil; temVenda: boolean; temCampos: boolean }) {
  const nav = useNavigate();
  const cfg = useConfigVenda();
  const vendas = useHistoricoVendas(30);
  const origens = useOrigens();
  const resumoOrigens = useResumoOrigens(30);
  const motivos = useMotivos();
  const histMotivos = useHistoricoMotivos(30);
  const campos = useCampos(temCampos);
  const abas = ABAS_FUNIL.filter((a) => ((a.valor === 'venda' || a.valor === 'origens') ? temVenda : temCampos));
  const topOrigem = resumoOrigens.data?.porOrigem[0];
  const topMotivo = histMotivos.data?.porMotivo[0];
  return (
    <div className="pn cfgw cfgcomb" data-config-funil>
      <GradeMetricas rotulo="O funil em números">
        {temVenda && <CartaoMetricaFixo icone="trofeu" titulo="Vendas em 30 dias" valor={int(vendas.data?.total ?? 0)} detalhe={<span>{vendas.data?.valor ? brl(vendas.data.valor) : 'marcadas pelo botão'}</span>} rodape={<span>Botão: “{rotuloBotao(cfg.data)}”</span>} />}
        {temVenda && <CartaoMetricaFixo icone="entra" titulo="Origem mais comum" valor={topOrigem ? topOrigem.origem : '—'} detalhe={<span>{topOrigem ? `${int(topOrigem.qtd)} ${topOrigem.qtd === 1 ? 'lead' : 'leads'} em 30 dias` : 'nenhum lead no período'}</span>} rodape={<span>{int((origens.data ?? []).length)} {(origens.data ?? []).length === 1 ? 'origem cadastrada' : 'origens cadastradas'}</span>} />}
        {temCampos && <CartaoMetricaFixo icone="fora" titulo="Motivo mais usado" valor={topMotivo ? topMotivo.motivo : '—'} detalhe={<span>{topMotivo ? `${int(topMotivo.qtd)} de ${int(histMotivos.data?.total ?? 0)} fechamentos` : 'nenhum fechamento em 30 dias'}</span>} rodape={<span>{int((motivos.data ?? []).filter((m) => m.ativo).length)} motivos ligados</span>} />}
        {temCampos && <CartaoMetricaFixo icone="lista" titulo="Campos do cliente" valor={int((campos.data ?? []).filter((c) => c.ativo).length)} detalhe={<span>{(campos.data ?? []).filter((c) => c.ativo && c.noCartao).length} no cartão do Kanban</span>} rodape={<span>Preenchidos no painel do WhatsApp</span>} />}
      </GradeMetricas>
      <div className="cfgcomb-abas">
        <Segmentado rotulo="Seção do funil" opcoes={abas} valor={aba} aoMudar={(v) => nav('/config/' + v)} />
      </div>
      <div className="cfgcomb-corpo">
        {aba === 'venda' && <ConfigVenda />}
        {aba === 'origens' && <ConfigOrigens />}
        {aba === 'motivos' && <ConfigMotivos />}
        {aba === 'campos' && <ConfigCampos />}
      </div>
    </div>
  );
}
