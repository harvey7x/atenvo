/* CONFIGURAÇÕES → AVISOS PARA A EQUIPE (26/11, "igual" ao sistema que a Reviza usava antes: os 7 avisos dos momentos que
   importam, quem recebe cada um, "pôr a mesma pessoa em vários avisos" e o relatório do que saiu).
   Abas: Avisos (a lista: nome e texto, quando dispara, quem recebe, ligado; a janela edita tudo, com as variáveis e a
   prévia de como chega no sino) e Relatório (quantos saíram por aviso, em barras, e os últimos).
   O aviso chega no SINO de cada pessoa escolhida, com o link da conversa; nada sai pelo WhatsApp. Só o administrador.
   Dados: @/data/avisosEquipe (migration 114). */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, ModalV2, Segmentado, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import {
  GATILHOS, ROTULO_GATILHO, VARIAVEIS, previaDoAviso, useApagarAviso, useAvisosEquipe, useMesmaPessoaEmVarios, usePessoasEEtapas, useRelatorioAvisos, useSalvarAviso, validarAviso,
  type AvisoEquipe, type Etapa, type Gatilho, type Pessoa,
} from '@/data/avisosEquipe';
import '../painel/painel.css';
import './camposMotivos.css';

const ABAS = [{ valor: 'avisos', rotulo: 'Avisos' }, { valor: 'relatorio', rotulo: 'Relatório' }];
const PERIODOS = [{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }];
const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const nomes = (ids: string[], pessoas: Pessoa[]) => ids.map((id) => pessoas.find((p) => p.id === id)?.nome).filter(Boolean) as string[];

export function ConfigAvisosEquipe() {
  const [aba, setAba] = useState<'avisos' | 'relatorio'>('avisos');
  const [janela, setJanela] = useState<{ aviso: AvisoEquipe | null } | null>(null);
  const [mesma, setMesma] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const q = useAvisosEquipe();
  const pe = usePessoasEEtapas();
  const pessoas = pe.data?.pessoas ?? [];
  const etapas = pe.data?.etapas ?? [];
  const avisos = q.data ?? [];
  return (
    <div className="pn cfgw cfga" data-config-avisos-equipe>
      <AcoesNoTopo>
        <BotaoSec onClick={() => setMesma(true)} disabled={!avisos.length}>Pôr a mesma pessoa em vários avisos</BotaoSec>
        <BotaoPrimario onClick={() => setJanela({ aviso: null })}>＋ Novo aviso</BotaoPrimario>
      </AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="cfgv-abas"><Segmentado rotulo="Avisos para a equipe" opcoes={ABAS} valor={aba} aoMudar={(v) => setAba(v as 'avisos' | 'relatorio')} /></div>
      {aba === 'avisos'
        ? <ListaAvisos q={q} avisos={avisos} pessoas={pessoas} etapas={etapas} aoEditar={(a) => setJanela({ aviso: a })} aoAvisar={setAviso} />
        : <Relatorio />}
      {janela && <JanelaAviso key={janela.aviso?.id ?? 'novo'} aviso={janela.aviso} total={avisos.length} pessoas={pessoas} etapas={etapas} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
      {mesma && <JanelaMesmaPessoa avisos={avisos} pessoas={pessoas} aoFechar={() => setMesma(false)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function ListaAvisos({ q, avisos, pessoas, etapas, aoEditar, aoAvisar }: {
  q: ReturnType<typeof useAvisosEquipe>; avisos: AvisoEquipe[]; pessoas: Pessoa[]; etapas: Etapa[];
  aoEditar: (a: AvisoEquipe) => void; aoAvisar: (a: { texto: string; tom: 'ok' | 'erro' }) => void;
}) {
  const salvar = useSalvarAviso();
  const semNinguem = avisos.filter((a) => a.ativo && a.destinatarios.length === 0).length;
  return (
    <>
      {semNinguem > 0 && <div className="cfgk-alerta" role="note"><b>{semNinguem === avisos.filter((a) => a.ativo).length ? 'Ninguém recebe os avisos ainda.' : `${semNinguem} ${semNinguem === 1 ? 'aviso ligado está' : 'avisos ligados estão'} sem ninguém para receber.`}</b> Escolha quem recebe em cada aviso, ou use "Pôr a mesma pessoa em vários avisos".</div>}
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab pn-us-cab"><div><h3>Avisos</h3><p>{avisos.length ? `${avisos.length} avisos, ${avisos.filter((a) => a.ativo).length} ligados. Cada um chega no sino de quem foi escolhido, com o link da conversa.` : 'Os avisos que chegam no sino da equipe.'}</p></div></div>
        {q.isLoading ? <p className="pn-vazio">Carregando os avisos…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar os avisos" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgc-tab cfga-tab">
                <thead><tr><th scope="col">Aviso</th><th scope="col">Quando</th><th scope="col">Quem recebe</th><th scope="col">Ligado</th><th scope="col"><span className="pn-vh">Ações</span></th></tr></thead>
                <tbody>
                  {avisos.map((a) => {
                    const ns = nomes(a.destinatarios, pessoas);
                    const etapa = etapas.find((e) => e.id === a.colunaId)?.nome;
                    return (
                      <tr key={a.id} className={a.ativo ? undefined : 'cfgc-desl'}>
                        <td><span className="cfgc-nome">{a.nome}</span><small className="cfgc-ops">{previaDoAviso(a.modelo, a.gatilho, etapa)}</small></td>
                        <td><span className="pn-us-amb-tx">{a.gatilho === 'etapa' ? (etapa ? `Entrou em ${etapa}` : <BadgeStatus tom="atencao">Escolha a etapa</BadgeStatus>) : ROTULO_GATILHO[a.gatilho].replace(/^Quando /, '').replace(/^./, (c) => c.toUpperCase())}</span></td>
                        <td>{ns.length ? <span className="pn-us-amb-tx cfge-nomes">{ns.join(', ')}</span> : <span className="cfga-ninguem">Ninguém</span>}</td>
                        <td><span className="cfgc-tgl"><Toggle ligado={a.ativo} rotulo={`Aviso ${a.nome} ligado`} disabled={salvar.isPending}
                          aoMudar={(v) => void salvar.mutateAsync({ ...a, ativo: v }).then(() => aoAvisar({ tom: 'ok', texto: v ? `"${a.nome}" ligado.` : `"${a.nome}" desligado.` })).catch((x) => aoAvisar({ tom: 'erro', texto: (x as Error).message }))} /></span></td>
                        <td className="pn-fin-acoes"><span className="pn-us-acoes"><BotaoSec mini onClick={() => aoEditar(a)}>Editar</BotaoSec></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <p className="cfgc-pe">O mesmo aviso não se repete para o mesmo cliente no mesmo dia. Nenhum aviso sai pelo WhatsApp: chega só no sino.</p>
      </CardVidro>
    </>
  );
}

function Relatorio() {
  const [dias, setDias] = useState('30');
  const q = useRelatorioAvisos(Number(dias));
  const nav = useNavigate();
  const r = q.data;
  const max = Math.max(1, ...(r?.porAviso ?? []).map((x) => x.qtd));
  return (
    <CardVidro spot className="pn-card sobe">
      <div className="pn-card-cab cfgm-hist-cab">
        <div><h3>O que saiu</h3><p>{r ? (r.total ? `${r.total} ${r.total === 1 ? 'aviso enviado' : 'avisos enviados'} nos últimos ${r.dias} dias.` : `Nenhum aviso enviado nos últimos ${r.dias} dias.`) : 'Os avisos que chegaram no sino da equipe.'}</p></div>
        <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
      </div>
      {q.isLoading ? <p className="pn-vazio">Carregando…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível carregar o relatório" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} />
        : !r || r.total === 0 ? <p className="pn-vazio">Quando um aviso disparar para alguém, ele aparece aqui.</p>
        : (
          <div className="cfgv-hist">
            <div>
              <h4 className="cfgv-h4">Por aviso</h4>
              <ul className="cfgm-barras" aria-label="Avisos enviados por tipo">
                {r.porAviso.map((x) => <li key={x.avisoId} title={`${x.pessoas} ${x.pessoas === 1 ? 'pessoa avisada' : 'pessoas avisadas'}`}><span className="cfgm-b-rot">{x.nome}</span><span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (x.qtd / max) * 100)}%` }} /></span><span className="cfgm-b-n num">{x.qtd}</span></li>)}
              </ul>
            </div>
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab">
                <thead><tr><th scope="col">Cliente</th><th scope="col">Aviso</th><th scope="col">Pessoas</th><th scope="col">Quando</th></tr></thead>
                <tbody>
                  {r.recentes.map((x, i) => (
                    <tr key={x.quando + i}>
                      <td>{x.conversaId ? <button type="button" className="cfgm-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(x.conversaId!))}>{x.contato}</button> : x.contato}</td>
                      <td>{x.aviso}</td><td className="num">{x.pessoas}</td><td className="num">{quando(x.quando)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </CardVidro>
  );
}

function Pessoas({ pessoas, marcadas, aoMudar }: { pessoas: Pessoa[]; marcadas: string[]; aoMudar: (ids: string[]) => void }) {
  if (!pessoas.length) return <p className="cfgc-dica">Nenhuma pessoa no Atendimento ainda. Libere o Atendimento em Usuários e acessos.</p>;
  return (
    <div className="cfga-pessoas" role="group" aria-label="Quem recebe">
      {pessoas.map((p) => {
        const on = marcadas.includes(p.id);
        return <label key={p.id} className={'cfga-pessoa' + (on ? ' on' : '')}><input type="checkbox" checked={on} onChange={(e) => aoMudar(e.target.checked ? [...marcadas, p.id] : marcadas.filter((x) => x !== p.id))} /><span>{p.nome}</span></label>;
      })}
    </div>
  );
}

function JanelaAviso({ aviso, total, pessoas, etapas, aoFechar, aoAvisar }: { aviso: AvisoEquipe | null; total: number; pessoas: Pessoa[]; etapas: Etapa[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarAviso();
  const apagar = useApagarAviso();
  const [nome, setNome] = useState(aviso?.nome ?? '');
  const [modelo, setModelo] = useState(aviso?.modelo ?? '{{nome}} · {{telefone}} · {{resumo}}');
  const [gatilho, setGatilho] = useState<Gatilho>(aviso?.gatilho ?? 'etapa');
  const [colunaId, setColunaId] = useState(aviso?.colunaId ?? '');
  const [dest, setDest] = useState<string[]>(aviso?.destinatarios ?? []);
  const [ativo, setAtivo] = useState(aviso?.ativo ?? true);
  const [erro, setErro] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const ocupado = salvar.isPending || apagar.isPending;
  const proprio = !aviso || aviso.chave.startsWith('proprio-');
  const etapa = etapas.find((e) => e.id === colunaId)?.nome;
  const inserir = (v: string) => {
    const el = ref.current; if (!el) { setModelo((m) => m + v); return; }
    const a = el.selectionStart ?? modelo.length, b = el.selectionEnd ?? modelo.length;
    const novo = modelo.slice(0, a) + v + modelo.slice(b); setModelo(novo);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + v.length, a + v.length); });
  };
  const gravar = async () => {
    const e = validarAviso({ nome, modelo, gatilho, colunaId: colunaId || null }); if (e) { setErro(e); return; }
    try {
      await salvar.mutateAsync({ id: aviso?.id, chave: aviso?.chave, nome, modelo, gatilho, colunaId: colunaId || null, destinatarios: dest, ativo, ordem: aviso?.ordem ?? total });
      aoAvisar(dest.length ? `"${nome.trim()}" salvo: chega para ${dest.length} ${dest.length === 1 ? 'pessoa' : 'pessoas'}.` : `"${nome.trim()}" salvo, mas ninguém recebe ainda.`);
      aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={600}
      titulo={<div>{aviso ? 'Editar aviso' : 'Novo aviso'}<div className="mod-sub">Chega no sino de quem você escolher, com o link da conversa</div></div>}
      rodape={<>
        {aviso && proprio && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void apagar.mutateAsync(aviso.id).then(() => { aoAvisar(`"${aviso.nome}" apagado.`); aoFechar(); }).catch((x) => setErro((x as Error).message))}>Apagar aviso</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo"><label htmlFor="av-nome">Nome</label><input id="av-nome" className="inp" value={nome} maxLength={60} autoFocus={!aviso} onChange={(e) => { setNome(e.target.value); setErro(''); }} /></div>
        <div className="cfga-quando">
          <div className="pn-us-campo"><label htmlFor="av-gat">Quando avisa</label>
            <select id="av-gat" className="inp" value={gatilho} onChange={(e) => setGatilho(e.target.value as Gatilho)}>
              {GATILHOS.map((g) => <option key={g.valor} value={g.valor}>{g.rotulo}</option>)}
            </select>
            <span className="cfgc-dica">{GATILHOS.find((g) => g.valor === gatilho)?.dica}</span></div>
          {gatilho === 'etapa' && (
            <div className="pn-us-campo"><label htmlFor="av-etapa">Etapa</label>
              <select id="av-etapa" className="inp" value={colunaId} onChange={(e) => setColunaId(e.target.value)}>
                <option value="">Escolha a etapa</option>
                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              {!colunaId && <span className="cfgc-dica">Sem a etapa, este aviso não dispara.</span>}</div>
          )}
        </div>
        <div className="pn-us-campo"><label htmlFor="av-modelo">Texto do aviso</label>
          <textarea id="av-modelo" ref={ref} className="inp" rows={3} maxLength={600} value={modelo} onChange={(e) => { setModelo(e.target.value); setErro(''); }} />
          <div className="cfga-vars">{VARIAVEIS.map((v) => <button key={v.chave} type="button" className="cfga-var" title={`Põe ${v.rotulo}`} onClick={() => inserir(v.chave)}>{v.chave}</button>)}</div>
          <div className="cfga-previa"><span className="cfgc-dica">Como chega no sino:</span><div className="cfga-sino"><b>{nome.trim() || 'Aviso'}</b><span>{previaDoAviso(modelo, gatilho, etapa)}</span></div></div>
        </div>
        <div className="pn-us-campo"><span className="cfga-rot">Quem recebe</span><Pessoas pessoas={pessoas} marcadas={dest} aoMudar={setDest} /></div>
        <label className="cfgc-chk"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /><span>Ligado</span></label>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}

function JanelaMesmaPessoa({ avisos, pessoas, aoFechar, aoAvisar }: { avisos: AvisoEquipe[]; pessoas: Pessoa[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const mudar = useMesmaPessoaEmVarios();
  const [pessoa, setPessoa] = useState(pessoas[0]?.id ?? '');
  const inicial = useMemo(() => new Set(avisos.filter((a) => a.destinatarios.includes(pessoa)).map((a) => a.id)), [avisos, pessoa]);
  const [marcar, setMarcar] = useState<Set<string> | null>(null);
  const sel = marcar ?? inicial;
  const [erro, setErro] = useState('');
  const nome = pessoas.find((p) => p.id === pessoa)?.nome ?? '';
  const ir = async () => {
    try { const n = await mudar.mutateAsync({ pessoaId: pessoa, avisos, marcar: sel }); aoAvisar(n ? `${nome} agora recebe ${sel.size} ${sel.size === 1 ? 'aviso' : 'avisos'}.` : 'Nada mudou.'); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={480} titulo={<div>A mesma pessoa em vários avisos<div className="mod-sub">Marque os avisos que ela recebe</div></div>}
      rodape={<><BotaoSec onClick={aoFechar} disabled={mudar.isPending}>Cancelar</BotaoSec><BotaoPrimario disabled={!pessoa || mudar.isPending} onClick={() => void ir()}>{mudar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-campo"><label htmlFor="mp-pessoa">Pessoa</label>
          <select id="mp-pessoa" className="inp" value={pessoa} onChange={(e) => { setPessoa(e.target.value); setMarcar(null); }}>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></div>
        <div className="cfga-lista-av">
          {avisos.map((a) => (
            <label key={a.id} className="cfgc-chk"><input type="checkbox" checked={sel.has(a.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(a.id); else n.delete(a.id); setMarcar(n); }} /><span>{a.nome}{!a.ativo && ' (desligado)'}</span></label>
          ))}
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
