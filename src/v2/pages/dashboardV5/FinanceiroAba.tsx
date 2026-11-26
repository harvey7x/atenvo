/* DASHBOARD › FINANCEIRO (26/11, "igual" ao sistema que a Reviza usava antes): a receita do período (em quantos clientes e
   o valor médio por cliente), as cobranças em aberto (fora da receita), a receita por responsável e por produto (barras), por
   mês (barras) e os clientes que mais compraram. Filtro por responsável e período. Só o administrador (como o resto do
   Dashboard). Os valores vêm do Financeiro de cada cliente, no painel do WhatsApp. Dados: @/data/financeiro (migration 112). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { brl, useResumoFinanceiro } from '@/data/financeiro';
import { useOrgUsuarios } from '@/data/atendimento';
import { CardVidro, EstadoErro, Segmentado, Skeleton } from '../../components';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import { Secao, Vazio } from './comum';
import './resumoDia.css';
import './financeiroAba.css';

const PERIODOS = [{ valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }, { valor: '365', rotulo: '12 meses' }];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => { const [a, mm] = m.split('-'); return `${MESES[Number(mm) - 1] ?? mm}/${(a ?? '').slice(2)}`; };

function Barras({ itens, rotulo, fmt = brl }: { itens: { nome: string; valor: number; nota?: string }[]; rotulo: string; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="rsd-barras fin-barras" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.nome} title={i.nota ? `${i.nome}: ${i.nota}` : i.nome}>
          <span className="rsd-b-rot">{i.nome}</span>
          <span className="rsd-b-trilho" aria-hidden><span style={{ width: `${Math.max(3, (i.valor / max) * 100)}%` }} /></span>
          <span className="rsd-b-n num">{fmt(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

export function FinanceiroAba() {
  const [dias, setDias] = useState('30');
  const [resp, setResp] = useState('');
  const usuarios = useOrgUsuarios().data ?? [];
  const q = useResumoFinanceiro(Number(dias), resp || null);
  const nav = useNavigate();
  const r = q.data;
  const nomeResp = resp ? (usuarios.find((u) => u.id === resp)?.nome ?? resp) : null;
  return (
    <div className="rsd fin" data-financeiro aria-busy={q.isFetching || undefined}>
      <div className="rsd-topo">
        <div className="rsd-dia">
          <b>Financeiro{nomeResp ? ` de ${nomeResp}` : ''}</b>
          <span>O que foi lançado no Financeiro de cada cliente, no painel do WhatsApp.</span>
        </div>
        <div className="rsd-escolha">
          <select className="inp fin-resp" aria-label="Responsável" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Toda a equipe</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
        </div>
      </div>

      {q.isError && !r ? <CardVidro className="d5-sec"><EstadoErro titulo="Não foi possível montar o financeiro" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} /></CardVidro>
        : !r ? <Skeleton altura={280} raio={14} />
        : (
          <>
            <GradeMetricas rotulo="O financeiro em números">
              <CartaoMetricaFixo icone="moeda" titulo="Receita" valor={brl(r.receita)} detalhe={<span>{r.clientesReceita} {r.clientesReceita === 1 ? 'cliente' : 'clientes'} · {r.lancamentos} {r.lancamentos === 1 ? 'lançamento' : 'lançamentos'}</span>} rodape={<span>Nos últimos {r.dias === 365 ? '12 meses' : `${r.dias} dias`}</span>} />
              <CartaoMetricaFixo icone="pessoas" titulo="Por cliente" valor={brl(r.ticketMedio)} detalhe={<span>O valor médio de cada cliente que comprou</span>} rodape={<span>{r.catalogo} {r.catalogo === 1 ? 'produto ativo' : 'produtos ativos'} no catálogo</span>} />
              <CartaoMetricaFixo icone="carteira" titulo="Cobranças em aberto" valor={brl(r.cobrancas)} detalhe={<span>{r.clientesCobranca} {r.clientesCobranca === 1 ? 'cliente' : 'clientes'}</span>} rodape={<span>Fora da receita até virar receita</span>} />
              <CartaoMetricaFixo icone="trofeu" titulo="Maior cliente" valor={r.topClientes[0] ? brl(r.topClientes[0].valor) : '—'} detalhe={<span>{r.topClientes[0]?.contato ?? 'Ninguém comprou no período'}</span>} rodape={<span>{r.topClientes[0]?.responsavel ? `com ${r.topClientes[0].responsavel}` : ' '}</span>} />
            </GradeMetricas>
            {r.receita === 0 && r.cobrancas === 0 ? (
              <CardVidro className="d5-sec"><Vazio texto="Nada lançado no período." detalhe="No WhatsApp, o painel do cliente tem o Financeiro: escolha o produto e lance a venda ou a cobrança." /></CardVidro>
            ) : (
              <>
                <div className="rsd-duas">
                  <Secao titulo="Por responsável" sub="A receita dos clientes de cada pessoa (o responsável pelo card).">
                    {r.porResponsavel.length ? <Barras rotulo="Receita por responsável" itens={r.porResponsavel.map((x) => ({ nome: x.nome, valor: x.valor, nota: `${x.qtd} ${x.qtd === 1 ? 'cliente' : 'clientes'}` }))} /> : <Vazio texto="Nenhuma receita no período." />}
                  </Secao>
                  <Secao titulo="Por produto ou serviço" sub="O que mais vendeu, em valor.">
                    {r.porProduto.length ? <Barras rotulo="Receita por produto" itens={r.porProduto.map((x) => ({ nome: x.nome, valor: x.valor, nota: `${x.qtd} vendido${x.qtd === 1 ? '' : 's'}` }))} /> : <Vazio texto="Nenhuma receita no período." />}
                  </Secao>
                </div>
                <div className="rsd-duas">
                  <Secao titulo="Por mês" sub="A receita de cada mês do período.">
                    {r.porMes.length ? <Barras rotulo="Receita por mês" itens={r.porMes.map((x) => ({ nome: rotuloMes(x.mes), valor: x.valor }))} /> : <Vazio texto="Nenhuma receita no período." />}
                  </Secao>
                  <Secao titulo="Clientes que mais compraram" sub="Clique para abrir o cliente no WhatsApp.">
                    {r.topClientes.length === 0 ? <Vazio texto="Nenhuma receita no período." /> : (
                      <div className="d5-tab-rolo">
                        <table className="d5-tab rsd-tab fin-tab">
                          <thead><tr><th scope="col">Cliente</th><th scope="col">Responsável</th><th scope="col">Valor</th></tr></thead>
                          <tbody>
                            {r.topClientes.map((c) => (
                              <tr key={c.contatoId}>
                                <td>{c.conversaId ? <button type="button" className="fin-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(c.conversaId!))}>{c.contato}</button> : c.contato}</td>
                                <td>{c.responsavel}</td>
                                <td className="num">{brl(c.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Secao>
                </div>
              </>
            )}
          </>
        )}
    </div>
  );
}
