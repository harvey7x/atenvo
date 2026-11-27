/* CONFIGURAÇÕES → BOTÃO DE VENDA (26/11, "igual" ao sistema que a Reviza usava antes: abas Ajustes e Histórico).
   Ajustes: o nome do botão que marca a venda (no WhatsApp e no Kanban), com a prévia de como aparece; e o envio da venda
   para a Meta como conversão — fica desligado e travado até as Conversões da Meta estarem conectadas.
   Histórico: as vendas marcadas em 7, 30 ou 90 dias, quem marcou (barras) e a lista. Só o administrador.
   Dados: @/data/vendaOrigem (migration 111). */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, CardVidro, EstadoErro, Segmentado, Toggle } from '../../components';
import { BOTAO_MAX, BOTAO_PADRAO, EVENTOS_META, rotuloBotao, useConfigVenda, useHistoricoVendas, useSalvarConfigVenda, validarNomeBotao } from '@/data/vendaOrigem';
import '../painel/painel.css';
import './camposMotivos.css';

const PERIODOS = [{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }];
const ABAS = [{ valor: 'ajustes', rotulo: 'Ajustes' }, { valor: 'historico', rotulo: 'Histórico' }];
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ConfigVenda() {
  const [aba, setAba] = useState<'ajustes' | 'historico'>('ajustes');
  return (
    <div className="pn cfgw cfgv" data-config-venda>
      <div className="cfgv-abas"><Segmentado rotulo="Botão de venda" opcoes={ABAS} valor={aba} aoMudar={(v) => setAba(v as 'ajustes' | 'historico')} /></div>
      {aba === 'ajustes' ? <Ajustes /> : <Historico />}
    </div>
  );
}

function Ajustes() {
  const q = useConfigVenda();
  const salvar = useSalvarConfigVenda();
  const [nome, setNome] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  useEffect(() => { if (q.data) setNome(q.data.nomeBotao ?? ''); }, [q.data]);
  if (q.isLoading) return <p className="pn-vazio">Carregando…</p>;
  if (q.isError) return <EstadoErro titulo="Não foi possível carregar o botão de venda" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />;
  const cfg = q.data!;
  const sujo = (nome.trim().replace(/\s+/g, ' ') || null) !== (cfg.nomeBotao ?? null);
  const gravar = async () => {
    const e = validarNomeBotao(nome); if (e) { setAviso({ tom: 'erro', texto: e }); return; }
    try { await salvar.mutateAsync({ ...cfg, nomeBotao: nome.trim() || null }); setAviso({ tom: 'ok', texto: `O botão agora se chama "${nome.trim() || BOTAO_PADRAO}" no WhatsApp e no Kanban.` }); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  return (
    <>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="cfgm-grade">
        <CardVidro spot className="pn-card sobe">
          <div className="pn-card-cab"><div><h3>Nome do botão</h3><p>Como o botão que marca a venda aparece na conversa do WhatsApp e no Kanban.</p></div></div>
          <div className="pn-us-form">
            <div className="pn-us-campo">
              <label htmlFor="venda-nome">Nome</label>
              <input id="venda-nome" className="inp" value={nome} maxLength={BOTAO_MAX} placeholder={BOTAO_PADRAO} onChange={(e) => { setNome(e.target.value); setAviso(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && sujo) void gravar(); }} />
              <span className="cfgc-dica">Até {BOTAO_MAX} letras. Em branco, o botão se chama "{BOTAO_PADRAO}". Ele leva o card para a etapa de venda do funil.</span>
            </div>
            <div className="cfgv-previa"><span className="cfgc-dica">Como aparece:</span><span className="cfgv-pilula">{nome.trim().replace(/\s+/g, ' ') || BOTAO_PADRAO}</span></div>
            <div><BotaoPrimario disabled={!sujo || salvar.isPending} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario></div>
          </div>
        </CardVidro>
        <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
          <div className="pn-card-cab"><div><h3>Venda na Meta</h3><p>Quando alguém marcar "{rotuloBotao(cfg)}", a venda vai para a Meta como conversão, e os anúncios aprendem quem compra.</p></div></div>
          <div className="cfgv-meta">
            <Toggle ligado={cfg.metaEventoAtivo} disabled rotulo="Enviar a venda para a Meta" aoMudar={() => undefined} />
            <div>
              <b>Desligado: falta conectar as Conversões da Meta</b>
              <span>Para ligar, o administrador conecta o conjunto de dados (o pixel) e o token das Conversões da Meta em Integrações. Só valem as vendas marcadas depois de ligar.</span>
            </div>
          </div>
          <div className="pn-us-campo cfgv-evento">
            <label htmlFor="venda-evento">Evento</label>
            <select id="venda-evento" className="inp" value={cfg.metaEvento} disabled>
              {EVENTOS_META.map((e) => <option key={e.valor} value={e.valor}>{e.rotulo}</option>)}
            </select>
          </div>
        </CardVidro>
      </div>
    </>
  );
}

function Barras({ itens, rotulo }: { itens: { nome: string; qtd: number }[]; rotulo: string }) {
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  return (
    <ul className="cfgm-barras" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.nome}><span className="cfgm-b-rot" title={i.nome}>{i.nome}</span><span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (i.qtd / max) * 100)}%` }} /></span><span className="cfgm-b-n num">{i.qtd}</span></li>
      ))}
    </ul>
  );
}

function Historico() {
  const [dias, setDias] = useState('30');
  const q = useHistoricoVendas(Number(dias));
  const cfg = useConfigVenda().data;
  const nav = useNavigate();
  const h = q.data;
  return (
    <>
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab cfgm-hist-cab">
          <div><h3>Vendas marcadas</h3><p>{h ? (h.total ? `${h.total} ${h.total === 1 ? 'venda' : 'vendas'} nos últimos ${h.dias} dias${h.valor ? `, ${brl(h.valor)} no valor dos cards` : ''}.` : `Nenhuma venda marcada nos últimos ${h.dias} dias.`) : `Quem marcou "${rotuloBotao(cfg)}" e quando.`}</p></div>
          <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
        </div>
        {q.isLoading ? <p className="pn-vazio">Carregando as vendas…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar as vendas" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} />
          : !h || h.total === 0 ? <p className="pn-vazio">Quando alguém marcar "{rotuloBotao(cfg)}" no WhatsApp ou no Kanban, a venda aparece aqui.</p>
          : (
            <div className="cfgv-hist">
              <div><h4 className="cfgv-h4">Quem marcou</h4><Barras rotulo="Vendas por pessoa" itens={h.porPessoa} /></div>
              <div className="pn-mapa-rolo">
                <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab">
                  <thead><tr><th scope="col">Cliente</th><th scope="col">Marcado em</th><th scope="col">Quem marcou</th><th scope="col">Valor</th><th scope="col">Situação</th></tr></thead>
                  <tbody>
                    {h.vendas.map((v) => (
                      <tr key={v.id}>
                        <td>{v.conversaId ? <button type="button" className="cfgm-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(v.conversaId!))}>{v.contato}</button> : v.contato}</td>
                        <td className="num">{quando(v.quando)}</td>
                        <td>{v.quem ?? 'Alguém da equipe'}</td>
                        <td className="num">{v.valor != null ? brl(v.valor) : '—'}</td>
                        <td>Confirmada</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </CardVidro>
    </>
  );
}
