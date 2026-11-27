/* DASHBOARD › CRM (26/11, "igual" à visão do CRM no Dashboard do sistema que a Reviza usava antes): quantos cards entraram,
   quantos viraram venda, o funil por etapa, de que estado são os clientes (pelo DDD), as etiquetas mais usadas, as próximas
   reuniões da Agenda e o resumo das tarefas por pessoa. Gráficos em barras. Dados: @/data/dashboardCrm (migration 120). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { taxaVenda, useDashboardCrm } from '@/data/dashboardCrm';
import { BotaoSec, CardVidro, EstadoErro, Segmentado, Skeleton } from '../../components';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import { Secao, Vazio } from './comum';
import './resumoDia.css';
import './financeiroAba.css';
import './crmAba.css';

const PERIODOS = [{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }, { valor: '365', rotulo: '12 meses' }];
const int = (v: number) => v.toLocaleString('pt-BR');
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86_400_000);
  const dia = d.toLocaleDateString('pt-BR', tz);
  const hora = d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' });
  if (dia === hoje.toLocaleDateString('pt-BR', tz)) return `Hoje, ${hora}`;
  if (dia === amanha.toLocaleDateString('pt-BR', tz)) return `Amanhã, ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { ...tz, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')}, ${hora}`;
};
const TIPO: Record<string, string> = { reuniao: 'Reunião', ligacao: 'Ligação', retorno: 'Retorno', videochamada: 'Videochamada' };
const periodoTexto = (dias: number) => (dias === 365 ? 'nos últimos 12 meses' : `nos últimos ${dias} dias`);

function Barras({ itens, rotulo }: { itens: { nome: string; valor: number; nota?: string; marca?: string | null }[]; rotulo: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="rsd-barras fin-barras crm-barras" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.nome} title={i.nota ? `${i.nome}: ${i.nota}` : i.nome}>
          <span className="rsd-b-rot">{i.marca !== undefined && <i className="crm-marca" style={{ background: i.marca || 'var(--txt-3)' }} aria-hidden />}{i.nome}</span>
          <span className="rsd-b-trilho" aria-hidden><span style={{ width: `${Math.max(3, (i.valor / max) * 100)}%` }} /></span>
          <span className="rsd-b-n num">{int(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

export function CrmAba() {
  const [dias, setDias] = useState('30');
  const q = useDashboardCrm(Number(dias));
  const nav = useNavigate();
  const d = q.data;
  const ufs = d ? (d.porUf.length > 10 ? [...d.porUf.slice(0, 9), { uf: 'Outros estados', qtd: d.porUf.slice(9).reduce((s, x) => s + x.qtd, 0) }] : d.porUf) : [];
  const t = d?.tarefas;
  return (
    <div className="rsd fin crm" data-dashboard-crm aria-busy={q.isFetching || undefined}>
      <div className="rsd-topo">
        <div className="rsd-dia">
          <b>CRM</b>
          <span>Os cards que entraram no funil {periodoTexto(Number(dias))}, a Agenda e as tarefas da equipe.</span>
        </div>
        <div className="rsd-escolha"><Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} /></div>
      </div>

      {q.isError && !d ? <CardVidro className="d5-sec"><EstadoErro titulo="Não foi possível montar o CRM" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} /></CardVidro>
        : !d || !t ? <Skeleton altura={280} raio={14} />
        : (
          <>
            <GradeMetricas rotulo="O CRM em números">
              <CartaoMetricaFixo icone="entra" titulo="Entraram no funil" valor={int(d.cards)} detalhe={<span>{d.cards === 1 ? 'card novo' : 'cards novos'}</span>} rodape={<span>{periodoTexto(d.dias).replace('nos', 'Nos')}</span>} />
              <CartaoMetricaFixo icone="trofeu" titulo="Viraram venda" valor={int(d.vendas)} detalhe={<span>{pct(taxaVenda(d))} dos que entraram</span>} rodape={<span>Na etapa de venda do funil</span>} />
              <CartaoMetricaFixo icone="fora" titulo="Descartados" valor={int(d.perdidos)} detalhe={<span>{d.cards ? pct(d.perdidos / d.cards) : '0%'} dos que entraram</span>} rodape={<span>Na etapa de descarte</span>} />
              <CartaoMetricaFixo icone="calendario" titulo="Reuniões" valor={int(d.reunioes7d)} detalhe={<span>marcadas para os próximos 7 dias</span>} rodape={<span>Da Agenda</span>} />
            </GradeMetricas>

            {d.cards === 0 ? (
              <CardVidro className="d5-sec"><Vazio texto="Nenhum card entrou no funil no período." detalhe="Escolha um período maior no topo." /></CardVidro>
            ) : (
              <div className="rsd-duas">
                <Secao titulo="Funil por etapa" sub="Em que etapa estão hoje os cards que entraram no período.">
                  <Barras rotulo="Cards por etapa" itens={d.funil.map((x) => ({ nome: x.etapa, valor: x.qtd, marca: x.cor, nota: `${int(x.qtd)} ${x.qtd === 1 ? 'card' : 'cards'} (${d.cards ? pct(x.qtd / d.cards) : '0%'})` }))} />
                </Secao>
                <Secao titulo="Clientes por estado" sub="Pelo DDD do telefone de cada cliente.">
                  <Barras rotulo="Clientes por estado" itens={ufs.map((x) => ({ nome: x.uf, valor: x.qtd, nota: `${int(x.qtd)} ${x.qtd === 1 ? 'cliente' : 'clientes'}` }))} />
                </Secao>
              </div>
            )}

            <div className="rsd-duas">
              <Secao titulo="Etiquetas mais usadas" sub="Nos cards que entraram no período e nos contatos deles.">
                {d.etiquetas.length ? <Barras rotulo="Etiquetas mais usadas" itens={d.etiquetas.map((x) => ({ nome: x.nome, valor: x.qtd, marca: x.cor, nota: `${int(x.qtd)} ${x.qtd === 1 ? 'card' : 'cards'}` }))} /> : <Vazio texto="Nenhuma etiqueta nos cards do período." />}
              </Secao>
              <Secao titulo="Próximas reuniões" sub="As marcadas na Agenda, da mais próxima para a mais distante." acao={<BotaoSec mini onClick={() => nav('/agenda')}>Abrir a Agenda</BotaoSec>}>
                {d.reunioes.length === 0 ? <Vazio texto="Nenhuma reunião marcada." detalhe="Marque pela Agenda ou pelo painel do cliente no WhatsApp." /> : (
                  <div className="d5-tab-rolo">
                    <table className="d5-tab rsd-tab fin-tab crm-tab">
                      <thead><tr><th scope="col">Quando</th><th scope="col">Cliente</th><th scope="col">Tipo</th><th scope="col">Com</th></tr></thead>
                      <tbody>
                        {d.reunioes.map((r) => (
                          <tr key={r.id}>
                            <td className="num">{quando(r.inicio)}</td>
                            <td>{r.conversaId ? <button type="button" className="fin-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(r.conversaId!))}>{r.cliente ?? r.titulo}</button> : (r.cliente ?? r.titulo)}</td>
                            <td>{TIPO[r.tipo] ?? r.tipo}</td>
                            <td>{r.responsavel ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Secao>
            </div>

            <Secao titulo="Tarefas" sub={`Abertas agora e concluídas ${periodoTexto(d.dias)}.`} acao={<BotaoSec mini onClick={() => nav('/tarefas')}>Abrir as Tarefas</BotaoSec>}>
              <dl className="crm-tar">
                <div><dt>Pendentes</dt><dd className="num">{int(t.pendentes)}</dd></div>
                <div><dt>Em andamento</dt><dd className="num">{int(t.andamento)}</dd></div>
                <div className={t.atrasadas ? 'atraso' : undefined}><dt>Atrasadas</dt><dd className="num">{int(t.atrasadas)}</dd></div>
                <div><dt>Concluídas</dt><dd className="num">{int(t.concluidas)}</dd></div>
                <div><dt>Criadas</dt><dd className="num">{int(t.criadas)}</dd></div>
              </dl>
              {t.porPessoa.length === 0 ? <Vazio texto="Nenhuma tarefa aberta nem concluída no período." /> : (
                <div className="d5-tab-rolo">
                  <table className="d5-tab rsd-tab fin-tab crm-tab">
                    <thead><tr><th scope="col">Pessoa</th><th scope="col">Abertas</th><th scope="col">Concluídas</th><th scope="col">Atrasadas</th></tr></thead>
                    <tbody>
                      {t.porPessoa.map((p) => (
                        <tr key={p.nome}><td>{p.nome}</td><td className="num">{int(p.abertas)}</td><td className="num">{int(p.concluidas)}</td><td className={'num' + (p.atrasadas ? ' crm-atraso' : '')}>{int(p.atrasadas)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>
          </>
        )}
    </div>
  );
}
