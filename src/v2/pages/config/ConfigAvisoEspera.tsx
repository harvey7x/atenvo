/* CONFIGURAÇÕES → ATENDIMENTO → AVISO DE ESPERA (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá o
   tempo de resposta só aparecia no relatório, depois). Aqui o sino avisa ENQUANTO o cliente espera.
   No alto, a chave (DESLIGADA de saída). Depois: a meta, quando avisar os gestores, como contar o tempo (horário
   comercial ou o tempo todo) e quem recebe; ao lado, quem passou da meta agora (com o que está na tela, antes de
   salvar) e um exemplo de como o aviso chega no sino. Só administrador. Dados: @/data/avisoEspera. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AVISO_PADRAO, OPCOES_GESTOR, OPCOES_META, fmtMinutos, quemRecebe, useAvisoEsperaConfig, useEsperandoAgora, useSalvarAvisoEspera, validarAviso,
  type ConfigAvisoEspera, type ModoEspera,
} from '@/data/avisoEspera';
import { BadgeStatus, BotaoPrimario, CardVidro, EstadoErro, LinhaToggle, Segmentado, Toggle } from '../../components';
import '../painel/painel.css';
import './retomada.css';
import './avisoEspera.css';

type Aviso = { texto: string; tom: 'ok' | 'erro' } | null;
const tz = { timeZone: 'America/Sao_Paulo' } as const;
function quando(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const hoje = new Date().toLocaleDateString('pt-BR', tz) === d.toLocaleDateString('pt-BR', tz);
  return hoje ? `hoje, ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
const comAtual = (ops: number[], v: number) => (ops.includes(v) ? ops : [...ops, v].sort((a, b) => a - b));
const MODOS: { valor: ModoEspera; rotulo: string }[] = [{ valor: 'uteis', rotulo: 'Horário comercial' }, { valor: 'corrido', rotulo: 'O tempo todo' }];

export function ConfigAvisoEspera() {
  const cfgQ = useAvisoEsperaConfig();
  const salvar = useSalvarAvisoEspera();
  const cfg = cfgQ.data ?? AVISO_PADRAO;
  const [f, setF] = useState<ConfigAvisoEspera>(cfg);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [erro, setErro] = useState('');
  const sujo = f.metaMin !== cfg.metaMin || f.gestorAposMin !== cfg.gestorAposMin || f.modo !== cfg.modo || f.avisarResponsavel !== cfg.avisarResponsavel || f.avisarGestores !== cfg.avisarGestores;
  useEffect(() => { if (!sujo) setF(cfg); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const agoraQ = useEsperandoAgora(f.metaMin, f.modo, !cfgQ.isLoading);
  const muda = (p: Partial<ConfigAvisoEspera>) => {
    setF((x) => {
      const n = { ...x, ...p };
      // o aviso aos gestores nunca vem antes da meta
      if (p.metaMin != null && n.gestorAposMin < n.metaMin) n.gestorAposMin = n.metaMin;
      return n;
    });
    setErro('');
  };

  const mudarChave = async (ligar: boolean) => {
    const novo = { ...cfg, ...(sujo ? f : {}), ativo: ligar };
    const e = validarAviso(novo); if (e) { setErro(e); return; }
    try {
      await salvar.mutateAsync(novo);
      setAviso({ tom: 'ok', texto: ligar ? `Aviso de espera ligado. ${quemRecebe(novo)}` : 'Aviso de espera desligado. O sino não avisa mais quem está esperando.' });
    } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  const gravar = async () => {
    const e = validarAviso({ ...f, ativo: cfg.ativo }); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ ...f, ativo: cfg.ativo }); setAviso({ tom: 'ok', texto: 'Regras do aviso salvas.' }); }
    catch (x) { setErro((x as Error).message); }
  };

  if (cfgQ.isLoading) return <div className="pn cfgi rtm"><p className="pn-vazio">Carregando o aviso de espera…</p></div>;
  if (cfgQ.isError) return <div className="pn cfgi rtm"><EstadoErro titulo="Não foi possível carregar o aviso de espera" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void cfgQ.refetch()} /></div>;

  const agora = agoraQ.data ?? [];
  const exemplo = agora[0];
  return (
    <div className="pn cfgi rtm avs" data-config-aviso-espera>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe rtm-chave">
        <div className="rtm-chave-lin">
          <Toggle ligado={cfg.ativo} aoMudar={(v) => void mudarChave(v)} rotulo="Aviso de cliente esperando" disabled={salvar.isPending} />
          <div className="rtm-chave-tx">
            <b>{cfg.ativo ? 'Aviso de espera ligado' : 'Aviso de espera desligado'}</b>
            <span>{cfg.ativo
              ? `${cfg.ligadoEm ? `Ligado desde ${quando(cfg.ligadoEm)}. ` : ''}${quemRecebe(cfg)} O aviso chega no sino do topo, com o link da conversa.`
              : 'Quando ligado, o sino do topo avisa quem precisa responder assim que um cliente passa da meta sem resposta.'}</span>
          </div>
          <BadgeStatus tom={cfg.ativo ? 'ok' : 'neutro'}>{cfg.ativo ? 'Ligado' : 'Desligado'}</BadgeStatus>
        </div>
      </CardVidro>

      <div className="avs-grade">
        <CardVidro className="pn-card sobe rtm-regras">
          <div className="pn-card-cab"><div><h3>Regras do aviso</h3><p>Conta desde a primeira mensagem do cliente que ficou sem resposta. Resposta da equipe ou da IA encerra a espera.</p></div></div>
          <div className="pn-us-form">
            <div className="pn-us-campo">
              <label htmlFor="avs-meta">Meta de resposta</label>
              <select id="avs-meta" className="inp" value={f.metaMin} onChange={(e) => muda({ metaMin: Number(e.target.value) })}>
                {comAtual(OPCOES_META, f.metaMin).map((m) => <option key={m} value={m}>{fmtMinutos(m)}{m === 30 ? ' (padrão)' : ''}</option>)}
              </select>
              <span className="pn-us-dica">Passou disso sem resposta, o responsável pela conversa recebe o aviso.</span>
            </div>
            <div className="pn-us-campo">
              <label htmlFor="avs-gestor">Avisar os gestores com</label>
              <select id="avs-gestor" className="inp" value={f.gestorAposMin} disabled={!f.avisarGestores} onChange={(e) => muda({ gestorAposMin: Number(e.target.value) })}>
                {comAtual(OPCOES_GESTOR, f.gestorAposMin).filter((m) => m >= f.metaMin).map((m) => <option key={m} value={m}>{fmtMinutos(m)}{m === f.metaMin ? ' (junto com a meta)' : ''}</option>)}
              </select>
              <span className="pn-us-dica">O administrador e os gestores. Conversa sem responsável vai para eles já na meta.</span>
            </div>
            <div className="pn-us-campo">
              <span className="pn-us-rot">Contar o tempo</span>
              <Segmentado rotulo="Contar o tempo" opcoes={MODOS} valor={f.modo} aoMudar={(v) => muda({ modo: v })} />
              <span className="pn-us-dica">{f.modo === 'uteis'
                ? 'Só de segunda a sexta, das 8h às 18h (horário de Brasília): mensagem da noite começa a contar às 8h.'
                : 'Conta a noite e o fim de semana também: o aviso sai a qualquer hora.'}</span>
            </div>
            <div className="pn-us-campo avs-quem">
              <span className="pn-us-rot">Quem recebe</span>
              <LinhaToggle titulo="O responsável pela conversa" descricao={`Na meta: ${fmtMinutos(f.metaMin)} sem resposta.`} ligado={f.avisarResponsavel} aoMudar={(v) => muda({ avisarResponsavel: v })} />
              <LinhaToggle titulo="Os gestores" descricao={`Com ${fmtMinutos(f.gestorAposMin)} sem resposta.`} ligado={f.avisarGestores} aoMudar={(v) => muda({ avisarGestores: v })} />
            </div>
          </div>
          <p className="cfgi-nota" role="note">{quemRecebe(f)} Cada espera avisa uma vez só em cada nível.</p>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
          <div className="cfgi-acoes avs-salvar">
            <BotaoPrimario onClick={() => void gravar()} disabled={!sujo || salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar regras'}</BotaoPrimario>
          </div>
        </CardVidro>

        <div className="avs-lado">
          <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
            <div className="pn-card-cab"><div><h3>Passaram da meta agora</h3><p>Com a meta de {fmtMinutos(f.metaMin)}{sujo ? ' (ainda não salva)' : ''}. Atualiza a cada minuto.</p></div></div>
            {agoraQ.isLoading ? <p className="pn-vazio">Conferindo as conversas…</p>
              : agoraQ.isError ? <p className="pn-vazio">Não deu para conferir agora.</p>
              : agora.length === 0 ? <p className="avs-vazio">Ninguém esperando além de {fmtMinutos(f.metaMin)}.</p>
              : (
                <ul className="avs-lista">
                  {agora.slice(0, 8).map((e) => (
                    <li key={e.conversaId}>
                      <div className="avs-nm"><b>{e.contato}</b><small>{e.responsavel ? `Responsável: ${e.responsavel}` : 'Sem responsável'}</small></div>
                      <span className="avs-t num">{fmtMinutos(e.esperaMin)}</span>
                      <Link className="cfgi-link" to={`/whatsapp?conversa=${encodeURIComponent(e.conversaId)}`}>Abrir</Link>
                    </li>
                  ))}
                </ul>
              )}
            {agora.length > 8 && <p className="avs-mais num">e mais {agora.length - 8}</p>}
          </CardVidro>

          <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
            <div className="pn-card-cab"><div><h3>Como chega no sino</h3><p>Exemplo do aviso, com um cliente da lista acima.</p></div></div>
            <div className="avs-sino" aria-label="Exemplo de aviso no sino">
              <b>Cliente esperando resposta há {fmtMinutos(Math.max(f.metaMin, exemplo?.esperaMin ?? f.metaMin))}</b>
              <span>{exemplo?.contato ?? 'Maria da Silva'} mandou mensagem e ainda não teve resposta. A meta da equipe é {fmtMinutos(f.metaMin)}.</span>
              <small>Clicando, abre a conversa.</small>
            </div>
          </CardVidro>
        </div>
      </div>
    </div>
  );
}
