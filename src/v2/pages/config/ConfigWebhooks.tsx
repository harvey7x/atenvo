/* CONFIGURAÇÕES → WEBHOOKS · AVISAR OUTRO SISTEMA (26/11, "igual" aos Webhooks do sistema que a Reviza usava antes). A
   lista dos endereços (com o último resultado e ligar/desligar), o "Testar", o editor (nome, endereço https, os momentos e
   o segredo da assinatura) e os últimos envios. Só o administrador. Dados: @/data/webhooks (migration 124). */
import { useState } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { EVENTOS, ehOk, useApagarWebhook, useEnviosWebhook, useSalvarWebhook, useTestarWebhook, useWebhooks, validarWebhook, type EventoWebhook, type Webhook } from '@/data/webhooks';
import '../painel/painel.css';
import './camposMotivos.css';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import './webhooks.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const ROT_EV: Record<string, string> = { ...Object.fromEntries(EVENTOS.map((e) => [e.valor, e.rotulo])), teste: 'Teste' };
const resultado = (s: number | null, erro: string | null, resolvido: boolean) =>
  ehOk(s) ? { tx: `Recebido (${s})`, tom: 'ok' } : s === null && !erro ? { tx: 'Enviando…', tom: 'neutro' } : { tx: (erro || `HTTP ${s}`) + (resolvido ? '' : ' · vai tentar de novo'), tom: 'erro' };

export function ConfigWebhooks() {
  const q = useWebhooks();
  const envios = useEnviosWebhook();
  const salvar = useSalvarWebhook();
  const testar = useTestarWebhook();
  const [janela, setJanela] = useState<{ w: Webhook | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const lista = q.data ?? [];
  const env = envios.data ?? [];
  const okN = env.filter((e) => ehOk(e.status)).length;
  const falhasN = env.filter((e) => e.resolvido && !ehOk(e.status)).length;
  const ultimo = lista.map((w) => w.ultimoEnvioEm).filter(Boolean).sort().pop() ?? null;
  const nomeDe = (id: string) => lista.find((w) => w.id === id)?.nome ?? 'webhook apagado';
  const fazerTeste = async (w: Webhook) => {
    try { await testar.mutateAsync(w.id); setAviso({ tom: 'ok', texto: `Teste mandado para "${w.nome}". O resultado aparece em "Últimos envios" em alguns segundos.` }); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  return (
    <div className="pn cfgw cfgwh" data-config-webhooks>
      <AcoesNoTopo><BotaoPrimario onClick={() => setJanela({ w: null })}>＋ Novo webhook</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      {lista.length > 0 && (
        <GradeMetricas rotulo="Os webhooks em números">
          <CartaoMetricaFixo icone="sinal" titulo="Endereços" valor={lista.length} detalhe={<span>{lista.filter((w) => w.ativo).length} {lista.filter((w) => w.ativo).length === 1 ? 'ligado' : 'ligados'}</span>} rodape={<span>{lista.some((w) => w.desligadoMotivo) ? 'Um desligou sozinho: confira' : 'Todos respondendo'}</span>} />
          <CartaoMetricaFixo icone="certo" titulo="Recebidos" valor={okN} detalhe={<span>dos últimos {env.length} envios</span>} rodape={<span>O outro sistema respondeu 2xx</span>} />
          <CartaoMetricaFixo icone="alerta" titulo="Falharam" valor={falhasN} detalhe={<span>depois de 3 tentativas</span>} rodape={<span>{falhasN ? 'Veja o motivo na lista' : 'Nenhuma falha definitiva'}</span>} />
          <CartaoMetricaFixo icone="relogio" titulo="Último envio" valor={ultimo ? quando(ultimo).split(' ')[1] ?? quando(ultimo) : '—'} detalhe={<span>{ultimo ? quando(ultimo).split(' ')[0] : 'nada enviado ainda'}</span>} rodape={<span>Hora de São Paulo</span>} />
        </GradeMetricas>
      )}
      {q.isLoading ? <p className="pn-vazio">Carregando…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível carregar os webhooks" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
        : lista.length === 0 ? <CardVidro className="pn-card"><EstadoVazio titulo="Nenhum webhook" descricao="Cadastre o endereço de outro sistema (uma planilha, um ERP, uma automação) para ele receber os leads, as vendas e as reuniões na hora." acao={{ rotulo: '＋ Novo webhook', onClick: () => setJanela({ w: null }) }} /></CardVidro>
        : (
          <CardVidro spot className="pn-card sobe">
            <div className="pn-card-cab"><div><h3>Endereços</h3><p>Cada momento escolhido manda um POST com os dados, assinado com o segredo do webhook. Não manda nada para cliente nenhum.</p></div></div>
            <ul className="cfgwh-lista">
              {lista.map((w) => {
                const r = w.ultimoStatus === null && !w.ultimoEnvioEm ? null : ehOk(w.ultimoStatus);
                return (
                  <li key={w.id} className={w.ativo ? undefined : 'desl'}>
                    <div className="cfgwh-tx">
                      <b>{w.nome}</b>
                      <span className="cfgwh-url">{w.url}</span>
                      <small>{w.eventos.map((e) => ROT_EV[e] ?? e).join(' · ')}
                        {' · '}{r === null ? 'ainda não mandou nada' : r ? `último envio recebido (${quando(w.ultimoEnvioEm)})` : <span className="cfgwh-falha">último envio falhou ({w.ultimoStatus ?? 'sem resposta'}{w.falhasSeguidas > 1 ? `, ${w.falhasSeguidas} seguidas` : ''})</span>}</small>
                      {w.desligadoMotivo && <small className="cfgwh-falha">Desligado sozinho: {w.desligadoMotivo}</small>}
                    </div>
                    <span className="cfgwh-ac">
                      <Toggle ligado={w.ativo} rotulo={`Webhook ${w.nome} ligado`} disabled={salvar.isPending}
                        aoMudar={(v) => void salvar.mutateAsync({ ...w, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `"${w.nome}" ligado.` : `"${w.nome}" desligado: não manda mais nada até ligar de novo.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} />
                      <BotaoSec mini disabled={!w.ativo || testar.isPending} onClick={() => void fazerTeste(w)}>Testar</BotaoSec>
                      <BotaoSec mini onClick={() => setJanela({ w })}>Editar</BotaoSec>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardVidro>
        )}

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>Últimos envios</h3><p>Os 60 mais recentes. Quando o outro sistema falha, o Atenvo tenta de novo até 3 vezes.</p></div></div>
        {(envios.data ?? []).length === 0 ? <p className="pn-vazio">Nada enviado ainda.</p> : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab cfgwh-tab">
              <thead><tr><th scope="col">Momento</th><th scope="col">Webhook</th><th scope="col">Quando</th><th scope="col">Resultado</th><th scope="col">Tentativas</th></tr></thead>
              <tbody>
                {(envios.data ?? []).map((e) => {
                  const r = resultado(e.status, e.erro, e.resolvido);
                  return (
                    <tr key={e.id}>
                      <td>{ROT_EV[e.evento] ?? e.evento}</td>
                      <td>{nomeDe(e.webhookId)}</td>
                      <td className="num">{quando(e.criadoEm)}</td>
                      <td><span className={'cfgwh-res ' + r.tom}>{r.tx}</span></td>
                      <td className="num">{e.tentativas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardVidro>

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
        <div className="pn-card-cab"><div><h3>Como o outro sistema recebe</h3><p>Para quem vai programar o lado de lá.</p></div></div>
        <ul className="cfgwh-doc">
          <li><b>Método:</b> POST, com o corpo em JSON: <code>{'{ "evento": "lead_novo", "quando": "…", "dados": { "cliente": "…", "telefone": "…", "etapa": "…", … } }'}</code></li>
          <li><b>Cabeçalhos:</b> <code>X-Atenvo-Evento</code> (o momento), <code>X-Atenvo-Envio</code> (o número do envio) e <code>X-Atenvo-Assinatura</code> = <code>sha256=</code> + HMAC-SHA256 do corpo com o segredo do webhook.</li>
          <li><b>Resposta:</b> qualquer 2xx em até 8 segundos conta como recebido. Outra resposta ou demora: tenta de novo 2, 4 e 6 minutos depois.</li>
        </ul>
      </CardVidro>

      {janela && <JanelaWebhook key={janela.w?.id ?? 'novo'} w={janela.w} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaWebhook({ w, aoFechar, aoAvisar }: { w: Webhook | null; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarWebhook();
  const apagar = useApagarWebhook();
  const [nome, setNome] = useState(w?.nome ?? '');
  const [url, setUrl] = useState(w?.url ?? 'https://');
  const [eventos, setEventos] = useState<EventoWebhook[]>(w?.eventos ?? ['lead_novo', 'venda']);
  const [verSegredo, setVerSegredo] = useState(false);
  const [trocar, setTrocar] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending || apagar.isPending;
  const gravarW = async () => {
    const e = validarWebhook({ nome, url, eventos }); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ id: w?.id, nome, url, eventos, ativo: w?.ativo ?? true, trocarSegredo: trocar }); aoAvisar(w ? `"${nome.trim()}" salvo.${trocar ? ' O segredo mudou: atualize o sistema de lá.' : ''}` : `"${nome.trim()}" criado. Use "Testar" para conferir o endereço.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(w?.segredo ?? ''); setErro(''); aoAvisar('Segredo copiado.'); } catch { setErro('Não deu para copiar. Selecione e copie à mão.'); } };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={560}
      titulo={<div>{w ? 'Editar webhook' : 'Novo webhook'}<div className="mod-sub">Outro sistema recebe os momentos que você escolher</div></div>}
      rodape={<>
        {w && (confirmarApagar
          ? <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void apagar.mutateAsync(w.id).then(() => { aoAvisar(`"${w.nome}" apagado.`); aoFechar(); }).catch((x) => setErro((x as Error).message))}>{apagar.isPending ? 'Apagando…' : 'Confirmar: apagar'}</button>
          : <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => setConfirmarApagar(true)}>Apagar</button>)}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravarW()}>{salvar.isPending ? 'Salvando…' : w ? 'Salvar' : 'Criar webhook'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form" data-webhook-editor>
        <label className="pn-us-campo"><span>Nome</span>
          <input className="inp" value={nome} maxLength={80} autoFocus placeholder="ex.: Planilha do comercial" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </label>
        <label className="pn-us-campo"><span>Endereço (https)</span>
          <input className="inp" value={url} maxLength={500} inputMode="url" placeholder="https://…" onChange={(e) => { setUrl(e.target.value); setErro(''); }} />
        </label>
        <fieldset className="pn-us-campo cfgwh-evs"><legend>Quando avisar</legend>
          {EVENTOS.map((e) => (
            <label key={e.valor} className="cfgwh-ev">
              <input type="checkbox" checked={eventos.includes(e.valor)} onChange={(ev) => { setEventos((l) => (ev.target.checked ? [...l, e.valor] : l.filter((x) => x !== e.valor))); setErro(''); }} />
              <span><b>{e.rotulo}</b><small>{e.detalhe}</small></span>
            </label>
          ))}
        </fieldset>
        {w && (
          <div className="pn-us-campo"><span>Segredo da assinatura</span>
            <div className="cfgwh-seg">
              <code>{verSegredo ? w.segredo : '•'.repeat(24)}</code>
              <BotaoSec mini onClick={() => setVerSegredo((x) => !x)}>{verSegredo ? 'Esconder' : 'Mostrar'}</BotaoSec>
              <BotaoSec mini onClick={() => void copiar()}>Copiar</BotaoSec>
            </div>
            <label className="cfgwh-ev"><input type="checkbox" checked={trocar} onChange={(e) => setTrocar(e.target.checked)} /><span><b>Trocar o segredo ao salvar</b><small>o sistema de lá vai precisar do novo</small></span></label>
          </div>
        )}
        {!w && <p className="cfgc-dica">O segredo da assinatura é criado sozinho; depois de criar, abra "Editar" para ver e copiar.</p>}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
