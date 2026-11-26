/* CONFIGURAÇÕES → MOTIVOS DE FECHAMENTO (26/11, "igual" ao sistema que a Reviza usava antes: lá as opções que aparecem
   ao fechar uma conversa e o histórico de quem fechou e por quê). À esquerda a lista, na ordem do "Fechar conversa"
   (criar, renomear, ligar/desligar, subir/descer; "Outro motivo" fica sempre no fim). À direita o histórico do período:
   quantas fecharam por motivo e quem fechou (barras), e embaixo os últimos fechamentos. Só o administrador.
   Dados: @/data/motivosFechamento (migration 110). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, ModalV2, Segmentado, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { OUTRO_MOTIVO } from '@/data/fechamento';
import { MOTIVO_NOME_MAX, useApagarMotivo, useHistoricoMotivos, useMotivos, useOrdenarMotivos, useSalvarMotivo, validarMotivo, type Motivo } from '@/data/motivosFechamento';
import '../painel/painel.css';
import './camposMotivos.css';

const PERIODOS = [{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }];
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const hoje = new Date().toLocaleDateString('pt-BR', tz) === d.toLocaleDateString('pt-BR', tz);
  return hoje ? `hoje, ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}` : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
const int = (n: number) => n.toLocaleString('pt-BR');

function Seta({ cima }: { cima?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{cima ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}</svg>;
}

function Barras({ itens, rotulo }: { itens: { nome: string; qtd: number }[]; rotulo: string }) {
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  return (
    <ul className="cfgm-barras" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.nome}>
          <span className="cfgm-b-rot" title={i.nome}>{i.nome}</span>
          <span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (i.qtd / max) * 100)}%` }} /></span>
          <span className="cfgm-b-n num">{int(i.qtd)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ConfigMotivos() {
  const q = useMotivos();
  const salvar = useSalvarMotivo();
  const ordenar = useOrdenarMotivos();
  const [dias, setDias] = useState('30');
  const hist = useHistoricoMotivos(Number(dias));
  const nav = useNavigate();
  const [janela, setJanela] = useState<{ motivo: Motivo | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const motivos = q.data ?? [];
  const ligados = motivos.filter((m) => m.ativo).length;

  const ligar = async (m: Motivo, v: boolean) => {
    if (!v && ligados <= 1) { setAviso({ tom: 'erro', texto: 'Deixe ao menos um motivo ligado, além de "Outro motivo".' }); return; }
    try { await salvar.mutateAsync({ ...m, ativo: v }); setAviso({ tom: 'ok', texto: v ? `"${m.nome}" voltou ao Fechar conversa.` : `"${m.nome}" saiu do Fechar conversa. O histórico continua contando.` }); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  const mover = async (i: number, d: -1 | 1) => {
    const ids = motivos.map((m) => m.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await ordenar.mutateAsync(ids); } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  const h = hist.data;

  return (
    <div className="pn cfgw cfgm" data-config-motivos>
      <AcoesNoTopo><BotaoPrimario onClick={() => setJanela({ motivo: null })}>＋ Novo motivo</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <div className="cfgm-grade">
        <CardVidro spot className="pn-card sobe">
          <div className="pn-card-cab"><div><h3>Motivos</h3><p>As opções do "Fechar conversa", nesta ordem.</p></div></div>
          {q.isLoading ? <p className="pn-vazio">Carregando os motivos…</p>
            : q.isError ? <EstadoErro titulo="Não foi possível carregar os motivos" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
            : (
              <ul className="cfgm-lista">
                {motivos.map((m, i) => (
                  <li key={m.id} className={m.ativo ? undefined : 'desl'}>
                    <Toggle ligado={m.ativo} rotulo={`Motivo ${m.nome} ligado`} disabled={salvar.isPending} aoMudar={(v) => void ligar(m, v)} />
                    <span className="cfgm-nome">{m.nome}</span>
                    <span className="cfgc-ordem">
                      <button type="button" className="cfgc-seta" aria-label={`Subir ${m.nome}`} disabled={i === 0 || ordenar.isPending} onClick={() => void mover(i, -1)}><Seta cima /></button>
                      <button type="button" className="cfgc-seta" aria-label={`Descer ${m.nome}`} disabled={i === motivos.length - 1 || ordenar.isPending} onClick={() => void mover(i, 1)}><Seta /></button>
                    </span>
                    <BotaoSec mini onClick={() => setJanela({ motivo: m })}>Editar</BotaoSec>
                  </li>
                ))}
                <li className="fixo">
                  <span className="cfgm-fixo-tx">Sempre</span>
                  <span className="cfgm-nome">{OUTRO_MOTIVO}<small>Sempre no fim, com o motivo escrito por quem fecha.</small></span>
                </li>
              </ul>
            )}
        </CardVidro>

        <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
          <div className="pn-card-cab cfgm-hist-cab">
            <div><h3>Histórico</h3><p>{h ? (h.total ? `${int(h.total)} ${h.total === 1 ? 'conversa fechada' : 'conversas fechadas'} nos últimos ${h.dias} dias.` : `Nenhuma conversa fechada nos últimos ${h.dias} dias.`) : 'Quantas conversas fecharam por cada motivo.'}</p></div>
            <Segmentado rotulo="Período do histórico" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
          </div>
          {hist.isLoading ? <p className="pn-vazio">Carregando o histórico…</p>
            : hist.isError ? <EstadoErro titulo="Não foi possível carregar o histórico" descricao={(hist.error as Error).message} aoTentarDeNovo={() => void hist.refetch()} />
            : !h || h.total === 0 ? <p className="pn-vazio">Quando a equipe fechar conversas, os motivos aparecem aqui.</p>
            : (
              <div className="cfgm-hist">
                <div><h4>Por motivo</h4><Barras rotulo="Conversas fechadas por motivo" itens={h.porMotivo.map((x) => ({ nome: x.motivo, qtd: x.qtd }))} /></div>
                <div><h4>Quem fechou</h4><Barras rotulo="Conversas fechadas por pessoa" itens={h.porPessoa.map((x) => ({ nome: x.nome, qtd: x.qtd }))} /></div>
              </div>
            )}
        </CardVidro>
      </div>

      {h && h.recentes.length > 0 && (
        <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
          <div className="pn-card-cab"><div><h3>Últimos fechamentos</h3><p>Quem fechou, quando e por quê. Clique no cliente para abrir a conversa.</p></div></div>
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Motivo</th><th scope="col">Quem fechou</th><th scope="col">Quando</th></tr></thead>
              <tbody>
                {h.recentes.map((r, i) => (
                  <tr key={r.conversaId + r.quando + i}>
                    <td><button type="button" className="cfgm-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(r.conversaId))}>{r.contato}</button></td>
                    <td className="cfgm-mot"><span>{r.base}</span>{r.motivo !== r.base && <small>{r.base === OUTRO_MOTIVO ? r.motivo : r.motivo.replace(r.base + ' — ', '')}</small>}</td>
                    <td>{r.quem ?? 'Alguém da equipe'}</td>
                    <td className="num">{quando(r.quando)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
      )}

      {janela && <JanelaMotivo key={janela.motivo?.id ?? 'novo'} motivo={janela.motivo} motivos={motivos} ligados={ligados} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaMotivo({ motivo, motivos, ligados, aoFechar, aoAvisar }: { motivo: Motivo | null; motivos: Motivo[]; ligados: number; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarMotivo();
  const apagar = useApagarMotivo();
  const [nome, setNome] = useState(motivo?.nome ?? '');
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending || apagar.isPending;
  const ultimoLigado = !!motivo?.ativo && ligados <= 1;

  const gravar = async () => {
    const e = validarMotivo(nome, motivos, motivo?.id); if (e) { setErro(e); return; }
    try {
      await salvar.mutateAsync({ id: motivo?.id, nome, ordem: motivo?.ordem ?? motivos.length, ativo: motivo?.ativo ?? true });
      aoAvisar(motivo ? `Motivo renomeado para "${nome.trim()}".` : `"${nome.trim()}" entrou no Fechar conversa.`);
      aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  const remover = async () => {
    if (!motivo) return;
    if (ultimoLigado) { setErro('Deixe ao menos um motivo ligado, além de "Outro motivo".'); return; }
    try { await apagar.mutateAsync(motivo.id); aoAvisar(`"${motivo.nome}" saiu da lista. As conversas já fechadas guardam o motivo.`); aoFechar(); } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={460}
      titulo={<div>{motivo ? 'Editar motivo' : 'Novo motivo'}<div className="mod-sub">Aparece no "Fechar conversa" do WhatsApp</div></div>}
      rodape={<>
        {motivo && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{apagar.isPending ? 'Apagando…' : 'Apagar motivo'}</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : motivo ? 'Salvar' : 'Criar motivo'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="mot-nome">Motivo</label>
          <input id="mot-nome" className="inp" value={nome} maxLength={MOTIVO_NOME_MAX} autoFocus placeholder="ex.: Fechou com outra empresa"
            onChange={(e) => { setNome(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void gravar(); } }} />
          {motivo && <span className="cfgc-dica">Renomear não muda as conversas já fechadas: elas guardam o texto de quando fecharam.</span>}
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
