/* CONFIGURAÇÕES → ATENDIMENTO AO CLIENTE (26/11, dono: "mais preenchido"). Três telas pequenas numa só, em abas, com os
   números no topo: Lembrete de reunião · Cofre de conversas · Produtos e serviços. Os endereços antigos continuam valendo. */
import { useNavigate } from 'react-router-dom';
import { Segmentado } from '../../components';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import { OPCOES_ANTES, useConfigLembrete } from '@/data/lembreteReuniao';
import { useEstadoCofre } from '@/data/cofre';
import { useProdutos } from '@/data/financeiro';
import { ConfigLembrete } from './ConfigLembrete';
import { ConfigCofre } from './ConfigCofre';
import { ConfigProdutos } from './ConfigProdutos';
import './combinadas.css';

export type AbaCliente = 'lembrete' | 'cofre' | 'produtos';
const int = (n: number) => n.toLocaleString('pt-BR');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function ConfigCliente({ aba, tem }: { aba: AbaCliente; tem: Record<AbaCliente, boolean> }) {
  const nav = useNavigate();
  const lem = useConfigLembrete();
  const cofre = useEstadoCofre(tem.cofre);
  const prod = useProdutos(tem.produtos);
  const abas = ([{ valor: 'lembrete', rotulo: 'Lembrete de reunião' }, { valor: 'cofre', rotulo: 'Cofre de conversas' }, { valor: 'produtos', rotulo: 'Produtos e serviços' }] as { valor: AbaCliente; rotulo: string }[]).filter((a) => tem[a.valor]);
  const ativos = (prod.data ?? []).filter((p) => p.ativo);
  const medio = ativos.length ? ativos.reduce((s, p) => s + p.valor, 0) / ativos.length : 0;
  return (
    <div className="pn cfgw cfgcomb" data-config-cliente>
      <GradeMetricas rotulo="Em números" colunas={3}>
        {tem.lembrete && <CartaoMetricaFixo icone="relogio" titulo="Lembrete de reunião" valor={lem.data?.ativo ? 'Ligado' : 'Desligado'} detalhe={<span>{lem.data?.ativo ? (OPCOES_ANTES.find((o) => o.v === lem.data?.antesMin)?.r ?? '') : 'o cliente não recebe aviso'}</span>} rodape={<span>{lem.data?.segundoMin ? 'Com segundo aviso' : 'Um aviso por reunião'}</span>} />}
        {tem.cofre && <CartaoMetricaFixo icone="carteira" titulo="Cofre" valor={cofre.data?.ligado ? int(cofre.data.trancadas) : 'Desligado'} detalhe={<span>{cofre.data?.ligado ? (cofre.data.trancadas === 1 ? 'conversa trancada' : 'conversas trancadas') : 'crie a senha para usar'}</span>} rodape={<span>{cofre.data?.ligado ? 'Só quem tem a senha abre' : 'Esconde o conteúdo na tela'}</span>} />}
        {tem.produtos && <CartaoMetricaFixo icone="moeda" titulo="Produtos e serviços" valor={int(ativos.length)} detalhe={<span>{ativos.length ? `valor médio ${brl(medio)}` : 'nenhum ativo no catálogo'}</span>} rodape={<span>Para lançar no Financeiro do cliente</span>} />}
      </GradeMetricas>
      <div className="cfgcomb-abas"><Segmentado rotulo="Seção" opcoes={abas} valor={aba} aoMudar={(v) => nav('/config/' + v)} /></div>
      <div className="cfgcomb-corpo">
        {aba === 'lembrete' && <ConfigLembrete />}
        {aba === 'cofre' && <ConfigCofre />}
        {aba === 'produtos' && <ConfigProdutos />}
      </div>
    </div>
  );
}
