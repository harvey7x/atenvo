/* CONFIGURAÇÕES → IMPORTAÇÃO DO SISTEMA ANTERIOR (26/11, dono: "já pega todo o Kanban deles e integra no nosso… para quando
   eles chegarem já estiver pronto, eles só precisem conectar algumas coisas"). Mostra o que veio do sistema que a Reviza
   usava antes (clientes, cards por etapa, vendas, conversas) e deixa o administrador passar os cards de cada responsável
   de lá para a pessoa daqui: sozinho pelo mesmo nome ("Ligar pelo nome") ou escolhendo na lista. Só o administrador.
   Dados: @/data/importacaoAnterior (migration 117). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoSec, CardVidro, EstadoErro } from '../../components';
import { mesmoNome, nomeConexao, SEM_RESPONSAVEL, useConversasImportadas, useEstadoImportacao, useLigarConexao, useLigarResponsaveis, type ConexaoDeLa, type RespDeLa } from '@/data/importacaoAnterior';
import '../painel/painel.css';
import './camposMotivos.css';
import './importacao.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const int = (n: number) => n.toLocaleString('pt-BR');
const dataHora = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
};
const nomeDeLa = (n: string) => (/^#\d+$/.test(n) ? `Usuário apagado lá (${n})` : n);

export function ConfigImportacao() {
  const q = useEstadoImportacao();
  const ligar = useLigarResponsaveis();
  const nav = useNavigate();
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const e = q.data;

  if (q.isLoading) return <div className="pn cfgw"><p className="pn-vazio">Carregando o que veio do sistema anterior…</p></div>;
  if (q.isError || !e) return <div className="pn cfgw"><EstadoErro titulo="Não foi possível carregar a importação" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} /></div>;
  if (e.linhas === 0) return <div className="pn cfgw"><CardVidro className="pn-card"><p className="pn-vazio">Nada foi importado do sistema anterior ainda.</p></CardVidro></div>;

  const comPessoa = e.responsaveis.filter((r) => r.nome !== SEM_RESPONSAVEL);
  const pelaMesmoNome = comPessoa.filter((r) => { const p = mesmoNome(r, e.equipe); return p && p.id !== r.ligadoA; });
  const passados = comPessoa.filter((r) => r.ligadoA).reduce((s, r) => s + r.qtd, 0);
  const totalComPessoa = comPessoa.reduce((s, r) => s + r.qtd, 0);
  const max = Math.max(1, ...e.porEtapa.map((x) => x.qtd));

  const passar = async (r: RespDeLa, pessoaId: string) => {
    setAviso(null);
    try {
      const n = await ligar.mutateAsync({ nome: r.nome, pessoaId: pessoaId || null });
      const p = e.equipe.find((x) => x.id === pessoaId);
      setAviso({ tom: 'ok', texto: p ? `${int(n)} ${n === 1 ? 'card de' : 'cards de'} ${nomeDeLa(r.nome)} agora ${n === 1 ? 'é' : 'são'} de ${p.nome}.` : `Os cards de ${nomeDeLa(r.nome)} voltaram a ficar sem dono.` });
    } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  const ligarTodos = async () => {
    setAviso(null);
    try {
      const n = await ligar.mutateAsync({});
      setAviso({ tom: 'ok', texto: n ? `${int(n)} ${n === 1 ? 'card passou' : 'cards passaram'} para quem tem o mesmo nome aqui.` : 'Ninguém da equipe tem o mesmo nome de um responsável de lá.' });
    } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };

  return (
    <div className="pn cfgw cfgimp" data-config-importacao>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe">
        <dl className="cfgimp-resumo">
          <div><dt>Clientes</dt><dd className="num">{int(e.contatos)}</dd></div>
          <div><dt>Cards no Kanban</dt><dd className="num">{int(e.porStatus.abertos + e.porStatus.vendas + e.porStatus.descartados)}</dd></div>
          <div><dt>Em andamento</dt><dd className="num">{int(e.porStatus.abertos)}</dd></div>
          <div><dt>Vendas fechadas</dt><dd className="num">{int(e.porStatus.vendas)}</dd></div>
          <div><dt>Descartados</dt><dd className="num">{int(e.porStatus.descartados)}</dd></div>
          <div><dt>Mensagens</dt><dd className="num">{int(e.mensagens)}</dd></div>
        </dl>
        <p className="cfgimp-nota">
          Arquivo lido em {dataHora(e.lidoEm)}. Cada cliente entrou no funil na mesma etapa em que estava lá.
          Quem tinha dois números lá virou um cliente só, com um card em andamento (a etapa mais adiantada) e a venda, se houve, à parte.
        </p>
        <div className="cfgimp-acoes"><BotaoSec onClick={() => nav('/kanban')}>Abrir o Kanban</BotaoSec></div>
      </CardVidro>

      <div className="cfgm-grade">
        <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
          <div className="pn-card-cab"><div><h3>Por etapa</h3><p>Quantos cards ficaram em cada etapa do funil.</p></div></div>
          <ul className="cfgm-barras" aria-label="Cards por etapa">
            {e.porEtapa.map((x) => (
              <li key={x.etapa}>
                <span className="cfgm-b-rot" title={x.etapa}>{x.etapa}</span>
                <span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (x.qtd / max) * 100)}%` }} /></span>
                <span className="cfgm-b-n num">{int(x.qtd)}</span>
              </li>
            ))}
          </ul>
        </CardVidro>

        <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
          <div className="pn-card-cab cfgimp-resp-cab">
            <div>
              <h3>Responsáveis de lá</h3>
              <p>{passados ? `${int(passados)} de ${int(totalComPessoa)} cards já estão com alguém daqui.` : 'Os cards guardam quem cuidava deles lá. Quando a pessoa tiver login aqui, passe os cards para ela.'}</p>
            </div>
            <BotaoSec disabled={ligar.isPending || pelaMesmoNome.length === 0} onClick={() => void ligarTodos()}
              title={pelaMesmoNome.length ? `Passa os cards de ${pelaMesmoNome.map((r) => r.nome).join(', ')}` : 'Ninguém da equipe tem o mesmo nome de um responsável de lá'}>
              Ligar pelo nome{pelaMesmoNome.length ? ` (${pelaMesmoNome.length})` : ''}
            </BotaoSec>
          </div>
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab cfgimp-tab">
              <thead><tr><th scope="col">Responsável lá</th><th scope="col">Cards</th><th scope="col">Em andamento</th><th scope="col">Passar para</th></tr></thead>
              <tbody>
                {e.responsaveis.map((r) => (
                  <tr key={r.nome} className={r.ligadoA ? 'ligado' : undefined}>
                    <td>{nomeDeLa(r.nome)}</td>
                    <td className="num">{int(r.qtd)}</td>
                    <td className="num">{int(r.abertos)}</td>
                    <td>
                      {r.nome === SEM_RESPONSAVEL ? <span className="cfgimp-sem">Fica para a distribuição</span> : (
                        <select className="inp" value={r.ligadoA ?? ''} disabled={ligar.isPending} aria-label={`Passar os cards de ${nomeDeLa(r.nome)} para`}
                          onChange={(ev) => void passar(r, ev.target.value)}>
                          <option value="">Ninguém ainda</option>
                          {e.equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cfgimp-nota">Só passam os cards que ainda estão sem dono ou com quem foi escolhido aqui; o que a equipe já trocou fica como está.</p>
        </CardVidro>
      </div>

      <ConversasDeLa aoAvisar={setAviso} />
    </div>
  );
}

/* As conversas de lá: quanto já veio e, por conexão de lá, para que número daqui elas vão. A lista do WhatsApp só mostra
   conversa com número; enquanto o administrador não escolhe, as de lá ficam guardadas (com o card ligado a elas). */
function ConversasDeLa({ aoAvisar }: { aoAvisar: (a: { texto: string; tom: 'ok' | 'erro' }) => void }) {
  const q = useConversasImportadas();
  const ligar = useLigarConexao();
  const nav = useNavigate();
  const c = q.data;
  if (q.isLoading) return <CardVidro className="pn-card"><p className="pn-vazio">Carregando as conversas de lá…</p></CardVidro>;
  if (q.isError || !c) return <CardVidro className="pn-card"><EstadoErro titulo="Não foi possível carregar as conversas" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} /></CardVidro>;
  const faltaBaixar = Math.max(0, c.contatosLa - c.baixados);
  const semNumero = c.conexoes.reduce((s, x) => s + x.semNumero, 0);
  const temNumero = c.numeros.length > 0;
  const passar = async (x: ConexaoDeLa, canalId: string) => {
    if (!canalId) return;
    try {
      const n = await ligar.mutateAsync({ conexao: x.conexao, canalId });
      const num = c.numeros.find((p) => p.id === canalId);
      aoAvisar({ tom: 'ok', texto: `${int(n)} ${n === 1 ? 'conversa de' : 'conversas de'} ${nomeConexao(x.conexao)} ${n === 1 ? 'foi' : 'foram'} para ${num?.nome ?? 'o número escolhido'}. Já aparecem no WhatsApp.` });
    } catch (e) { aoAvisar({ tom: 'erro', texto: (e as Error).message }); }
  };
  return (
    <CardVidro className="pn-card sobe" style={{ animationDelay: '.15s' }}>
      <div className="pn-card-cab cfgimp-resp-cab">
        <div>
          <h3>Conversas de lá</h3>
          <p>{faltaBaixar > 0
            ? `${int(c.baixados)} de ${int(c.contatosLa)} contatos já vieram (${int(c.mensagensBaixadas)} mensagens). O resto chega sozinho, devagar, no limite que o sistema de antes permite.`
            : `Os ${int(c.contatosLa)} contatos de lá já vieram, com ${int(c.mensagensBaixadas)} mensagens.`}</p>
        </div>
        {temNumero && semNumero === 0 && c.conversas > 0 && <BotaoSec onClick={() => nav('/whatsapp')}>Abrir o WhatsApp</BotaoSec>}
      </div>
      <dl className="cfgimp-resumo cfgimp-resumo-4">
        <div><dt>Conversas</dt><dd className="num">{int(c.conversas)}</dd></div>
        <div><dt>Mensagens</dt><dd className="num">{int(c.mensagens)}</dd></div>
        <div><dt>Abertas</dt><dd className="num">{int(c.conexoes.reduce((s, x) => s + x.abertas, 0))}</dd></div>
        <div><dt>Sem número</dt><dd className="num">{int(semNumero)}</dd></div>
      </dl>
      {!temNumero && c.conversas > 0 && (
        <p className="cfgimp-aviso" role="note">
          O WhatsApp daqui mostra só as conversas que têm um número. Conecte os números em Configurações › WhatsApp e volte aqui para
          escolher qual número fica com as conversas de cada conexão de lá. Até lá elas ficam guardadas, com o card do Kanban ligado a elas.
        </p>
      )}
      {c.conexoes.length > 0 && (
        <div className="pn-mapa-rolo">
          <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab cfgimp-tab">
            <thead><tr><th scope="col">Conexão lá</th><th scope="col">Conversas</th><th scope="col">Abertas</th><th scope="col">Vai para o número</th></tr></thead>
            <tbody>
              {c.conexoes.map((x) => (
                <tr key={x.conexao || '_sem'} className={x.canalId && x.semNumero === 0 ? 'ligado' : undefined}>
                  <td>{nomeConexao(x.conexao)}</td>
                  <td className="num">{int(x.conversas)}</td>
                  <td className="num">{int(x.abertas)}</td>
                  <td>
                    <select className="inp" value={x.canalId ?? ''} disabled={!temNumero || ligar.isPending} aria-label={`Número daqui para as conversas de ${nomeConexao(x.conexao)}`}
                      onChange={(ev) => void passar(x, ev.target.value)}>
                      <option value="">{temNumero ? 'Escolha o número' : 'Nenhum número conectado'}</option>
                      {c.numeros.map((p) => <option key={p.id} value={p.id} disabled={!p.ativo}>{p.nome}{p.numero ? ` · ${p.numero.slice(-4)}` : ''}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cfgimp-nota">
        O que teve mensagem nos últimos 15 dias entra aberto; o resto entra arquivado (a busca acha, e a conversa volta sozinha quando o cliente escrever).
        Foto, áudio e documento vieram só como aviso (“[Áudio]”, “[Foto]”): o sistema de antes não entrega os arquivos.
      </p>
    </CardVidro>
  );
}
