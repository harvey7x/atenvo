/* CONFIGURAÇÕES → IRIS (dono 24/11): "deixar a íris pré-configurada só para eles ativarem do mesmo jeito que a gente está
   usando aqui na Atenvo e para eles criarem outras versões também… essa tela da íris bem completa".
   No alto, as VERSÕES (a pré-configurada e as que a empresa criar, duplicar ou importar). Abaixo, a versão escolhida, em
   partes: resumo (pronta para ligar? números, desempenho), quem ela é, a empresa, o que oferece, a análise, documentos,
   equipe, textos e áudios, retomadas, horários, o que ela nunca diz, testar e avançado. Nada é salvo até "Salvar".
   Formato e regras em data/config/iris.ts; plano em ~/reviza-sist/iris/PLANO.md. Só o administrador entra aqui. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, ConfirmDialogV2, EstadoErro, EstadoVazio, Kpi, ModalV2, Toggle } from '../../../components';
import { IconeTile } from '../../../components/CartaoMetrica';
import { AcoesNoTopo } from '../../comunicacao/MenuMais';
import { isPrevia } from '@/lib/supabase';
import { formatarTelefone } from '../../../lib/telefone';
import { ambientesCadastrados } from '../../../data/modulos';
import { useConexoesWA } from '../../../data/config/conexoes';
import {
  MODELOS_GEMINI, exportarVersao, temMotorIris, irisDaBia, irisEmBranco, irisPreConfigurada, lerArquivo, prontidao,
  useAtivarVersao, useConversarIris, useCriarVersao, useExcluirVersao, useLigarNumero, useMetricasIris, useModoTesteNumero,
  useNumerosDaVersao, useNumerosIris, useSalvarChaveIris, useSalvarVersao, useTestarChaveIris, useVersoesIris,
  type BolhaTeste, type IrisConfig, type NumeroIris, type VersaoIris,
} from '../../../data/config/iris';
import { Bloco, Liga, Numero } from './campos';
import { Ic } from './icones';
import { SecDocumentos, SecEmpresa, SecEquipe, SecHorarios, SecNunca, SecOferece, SecQualificacao, SecQuem, SecRetomadas, SecTextos } from './secoes';
import { BlocoSenha, PortaoSenha, SecCopiloto, SecInicio, SecOutras, SecRoteiro } from './secoesExtra';
import { useEdicaoAberta, useSenhasIris } from '@/data/irisSenha';
import '../../painel/painel.css';
import './iris.css';

type Secao = 'resumo' | 'quem' | 'roteiro' | 'empresa' | 'oferece' | 'inicio' | 'analise' | 'documentos' | 'equipe' | 'outras' | 'textos' | 'retomadas' | 'horarios' | 'nunca' | 'testar' | 'copiloto' | 'avancado';
const SECOES: { id: Secao; rotulo: string; grupo: string; desc: string }[] = [
  { id: 'resumo', rotulo: 'Resumo', grupo: '', desc: 'O que falta para ela atender, em quais números ela está e como ela está indo.' },
  { id: 'quem', rotulo: 'Quem ela é', grupo: 'Identidade', desc: 'O nome, como ela se apresenta, o trabalho dela e o jeito de falar.' },
  { id: 'roteiro', rotulo: 'Roteiro e regras', grupo: 'Identidade', desc: 'O roteiro e as regras do jeito da empresa, em texto livre. Ela segue isso do começo ao fim.' },
  { id: 'empresa', rotulo: 'A empresa', grupo: 'Identidade', desc: 'Os fatos que ela pode dizer: dados, valores, prazos e de onde atende.' },
  { id: 'oferece', rotulo: 'O que oferece', grupo: 'Identidade', desc: 'Os assuntos que ela atende. O que estiver desligado ela não oferece.' },
  { id: 'inicio', rotulo: 'Quando ela começa', grupo: 'Atendimento', desc: 'Quanto tempo ela espera o cliente terminar de digitar e as frases que fazem ela começar.' },
  { id: 'analise', rotulo: 'Análise inicial', grupo: 'Atendimento', desc: 'As perguntas que ela faz para saber se o cliente pode ser atendido.' },
  { id: 'documentos', rotulo: 'Documentos', grupo: 'Atendimento', desc: 'O que ela pede depois da análise e como confere cada documento.' },
  { id: 'equipe', rotulo: 'Passar para a equipe', grupo: 'Atendimento', desc: 'Como ela entrega o cliente pronto e quem da equipe recebe.' },
  { id: 'outras', rotulo: 'Outras IAs', grupo: 'Atendimento', desc: 'Se esta IA é a principal de um número ou uma secundária, que recebe a conversa quando a principal passa.' },
  { id: 'textos', rotulo: 'Textos e áudios', grupo: 'Atendimento', desc: 'As frases fixas dela. Ela só usa um texto depois de aprovado.' },
  { id: 'retomadas', rotulo: 'Retomadas', grupo: 'Ritmo', desc: 'Quando ela volta a chamar quem parou, sem insistir.' },
  { id: 'horarios', rotulo: 'Horários', grupo: 'Ritmo', desc: 'Os dias, os turnos e quando ela pode chamar o cliente.' },
  { id: 'nunca', rotulo: 'O que ela nunca diz', grupo: 'Ritmo', desc: 'As regras e as palavras que ela não usa em hipótese nenhuma.' },
  { id: 'testar', rotulo: 'Conversar para testar', grupo: 'Ferramentas', desc: 'Você faz o papel do cliente e vê como ela responde.' },
  { id: 'copiloto', rotulo: 'Copiloto', grupo: 'Ferramentas', desc: 'Peça uma revisão: a IA da empresa lê esta configuração e sugere trechos prontos para copiar.' },
  { id: 'avancado', rotulo: 'Avançado', grupo: 'Ferramentas', desc: 'A chave do Google, os modelos, o teto do dia, exportar, duplicar e excluir.' },
];
const ROT_ORIGEM: Record<VersaoIris['origem'], string> = { pre_configurada: 'Pré-configurada', nova: 'Criada aqui', duplicada: 'Cópia', importada: 'Importada' };
const SLOTS = 4;
const inicial = (n: string) => (n.trim().replace(/[^\p{L}\p{N}]/gu, '')[0] ?? 'I').toUpperCase();
type Estado = { tom: 'ok' | 'atencao' | 'neutro'; txt: string };
function estadoDe(v: VersaoIris, numeros: NumeroIris[]): Estado {
  const nums = numeros.filter((n) => n.versaoId === v.id);
  if (!v.ativa) return { tom: 'neutro', txt: 'Desligada' };
  if (nums.some((n) => n.ligado && !n.modoTeste)) return { tom: 'ok', txt: 'Atendendo' };
  if (nums.some((n) => n.ligado)) return { tom: 'atencao', txt: 'Em teste' };
  return { tom: 'neutro', txt: 'Ligada, sem número' };
}
const fone = (n: string | null) => (n ? formatarTelefone(n) || n : 'sem número');
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Rascunho { nome: string; descricao: string; config: IrisConfig }

export function ConfigIris() {
  const versoesQ = useVersoesIris();
  const numerosQ = useNumerosIris();
  const con = useConexoesWA();
  const versoes = versoesQ.data ?? [];
  const numeros = numerosQ.data ?? [];
  const pessoas = useMemo(() => con.usuarios.filter((u) => u.ativo && ambientesCadastrados(u.papel, u.modulos).includes('atendimento') && u.papel !== 'admin')
    .map((u) => ({ id: u.id, nome: u.nome || u.usuario })), [con.usuarios]);

  const [selId, setSelId] = useState<string | null>(null);
  const sel = versoes.find((v) => v.id === selId) ?? versoes[0] ?? null;
  const [rasc, setRasc] = useState<Rascunho | null>(null);
  const [secao, setSecao] = useState<Secao>('resumo');
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; txt: string } | null>(null);
  const [janela, setJanela] = useState<null | 'nova' | 'importar' | 'excluir' | 'trocar'>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  // o rascunho acompanha a versão escolhida (e volta ao salvo quando ela muda por fora)
  useEffect(() => { if (sel) setRasc({ nome: sel.nome, descricao: sel.descricao, config: sel.config }); else setRasc(null); }, [sel?.id, sel?.atualizadoEm]); // eslint-disable-line react-hooks/exhaustive-deps
  const sujo = !!sel && !!rasc && (rasc.nome !== sel.nome || rasc.descricao !== sel.descricao || !igual(rasc.config, sel.config));

  // a senha de edição (migration 115): a versão protegida só muda depois de "Abrir a edição" (30 min nesta aba)
  const senhasQ = useSenhasIris();
  const protegida = sel ? senhasQ.data?.[sel.id] ?? null : null;
  const edicaoAberta = useEdicaoAberta(sel?.id ?? null);
  const travada = !!protegida && !edicaoAberta;
  const salvar = useSalvarVersao();
  const criar = useCriarVersao();
  const excluir = useExcluirVersao();
  const ativar = useAtivarVersao();

  const set = (fn: (c: IrisConfig) => IrisConfig) => setRasc((r) => (r ? { ...r, config: fn(r.config) } : r));
  const avisar = (tom: 'ok' | 'erro', txt: string) => { setAviso({ tom, txt }); topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const escolher = (id: string) => { if (sujo) { setDestino(id); setJanela('trocar'); return; } setSelId(id); setSecao('resumo'); };
  const fazerSalvar = async () => {
    if (!sel || !rasc) return;
    try { await salvar.mutateAsync({ id: sel.id, ...rasc, origem: sel.origem }); avisar('ok', `"${rasc.nome}" foi salva.`); } catch (e) { avisar('erro', `Não foi possível salvar: ${(e as Error).message}`); }
  };
  const criarVersao = async (nome: string, origem: VersaoIris['origem'], config: IrisConfig, descricao = '') => {
    try { const id = await criar.mutateAsync({ nome, descricao, origem, config }); setSelId(id); setSecao('resumo'); setJanela(null); avisar('ok', `"${nome}" foi criada. Ela nasce desligada.`); }
    catch (e) { avisar('erro', `Não foi possível criar: ${(e as Error).message}`); }
  };

  // 1ª visita: a Iris pré-configurada já nasce (desligada) — "deixar a íris pré-configurada só para eles ativarem"
  const semeou = useRef(false);
  useEffect(() => {
    if (semeou.current || versoesQ.isLoading || versoesQ.isError || !versoesQ.isFetched || versoes.length > 0) return;
    semeou.current = true;
    void criar.mutateAsync({ nome: 'Iris', descricao: 'A Iris pré-configurada, como a do Atenvo, com o nome da empresa.', origem: 'pre_configurada', config: irisPreConfigurada() }).catch(() => { /* fica o vazio com o botão */ });
  }, [versoesQ.isLoading, versoesQ.isError, versoesQ.isFetched, versoes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const itens = sel && rasc ? prontidao({ ...sel, config: rasc.config }, numeros) : [];
  const faltam = itens.filter((i) => i.obrigatorio && !i.ok);
  const meus = sel ? numeros.filter((n) => n.versaoId === sel.id) : [];
  const atendendo = meus.filter((n) => n.ligado && sel?.ativa);
  const carregando = versoesQ.isLoading || numerosQ.isLoading;

  return (
    <div className="pn cfgw irs" ref={topo}>
      <AcoesNoTopo>
        <BotaoSec onClick={() => setJanela('importar')}>Importar</BotaoSec>
        <BotaoPrimario onClick={() => setJanela('nova')}>＋ Nova IA</BotaoPrimario>
      </AcoesNoTopo>

      {aviso && <div className={'gs-aviso ' + (aviso.tom === 'ok' ? 'ok' : 'erro')} role="status"><span>{aviso.txt}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      {carregando ? <p className="pn-vazio">Carregando as IAs…</p>
        : versoesQ.isError ? <EstadoErro titulo="Não foi possível carregar as IAs" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void versoesQ.refetch()} />
        : versoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma IA ainda" descricao="Comece pela Iris pré-configurada: ela vem como a do Atenvo, com o nome da empresa, e nasce desligada."
            acao={{ rotulo: 'Criar a Iris pré-configurada', onClick: () => void criarVersao('Iris', 'pre_configurada', irisPreConfigurada()) }} />
        ) : (
          <>
            <div className="irs-slots" role="tablist" aria-label="Atendentes de IA">
              {versoes.map((v) => {
                const nums = numeros.filter((n) => n.versaoId === v.id);
                const pr = prontidao(v, numeros);
                const prontos = pr.filter((i) => i.ok).length;
                const est = estadoDe(v, numeros);
                const ativos = v.config.produtos.filter((p) => p.ativo).length;
                return (
                  <button key={v.id} type="button" role="tab" aria-selected={sel?.id === v.id} className={'irs-slot' + (sel?.id === v.id ? ' on' : '')} onClick={() => escolher(v.id)}>
                    <span className="irs-slot-topo">
                      <span className={'irs-av' + (est.tom === 'ok' ? ' viva' : '')} aria-hidden>{inicial(v.nome)}</span>
                      <span className="irs-slot-nome"><b>{v.nome}</b><span>{ROT_ORIGEM[v.origem]}</span></span>
                      <BadgeStatus tom={est.tom}>{est.txt}</BadgeStatus>
                    </span>
                    <span className="irs-slot-fatos">
                      <span><Ic nome="numero" tam={13} />{nums.length ? `${nums.length} ${nums.length === 1 ? 'número' : 'números'}` : 'Sem número'}</span>
                      <span><Ic nome="oferece" tam={13} />{ativos} {ativos === 1 ? 'assunto' : 'assuntos'}</span>
                    </span>
                    <span className="irs-slot-pronta">
                      <span className="irs-barra" aria-hidden><i style={{ width: `${(prontos / pr.length) * 100}%` }} className={prontos === pr.length ? 'ok' : ''} /></span>
                      <span className={prontos === pr.length ? 'ok' : ''}>{prontos === pr.length ? 'Pronta para ligar' : `${prontos} de ${pr.length} passos para ligar`}</span>
                    </span>
                  </button>
                );
              })}
              {Array.from({ length: versoes.length < SLOTS ? SLOTS - versoes.length : Math.max(1, (SLOTS - (versoes.length % SLOTS)) % SLOTS) }, (_, n) => (
                <button key={`vazio-${n}`} type="button" className="irs-slot vazio" onClick={() => setJanela('nova')}>
                  <span className="irs-slot-mais" aria-hidden><Ic nome="mais" tam={18} /></span>
                  <b>Adicionar IA</b>
                  <span>Slot vazio</span>
                </button>
              ))}
            </div>

            {sel && rasc && (
              <>
              <div className="irs-cab">
                <span className={'irs-av grande' + (estadoDe(sel, numeros).tom === 'ok' ? ' viva' : '')} aria-hidden>{inicial(rasc.nome)}</span>
                <div className="irs-cab-tx">
                  <input className="irs-nome" aria-label="Nome da IA" value={rasc.nome} maxLength={80} onChange={(e) => setRasc({ ...rasc, nome: e.target.value })} />
                  <input className="irs-desc" aria-label="Para que serve esta IA" value={rasc.descricao} maxLength={300} placeholder="Para que serve esta IA (ex.: atende a campanha do cartão RMC)" onChange={(e) => setRasc({ ...rasc, descricao: e.target.value })} />
                  <div className="irs-cab-chips">
                    <BadgeStatus tom={estadoDe(sel, numeros).tom}>{estadoDe(sel, numeros).txt}</BadgeStatus>
                    <span className="irs-chip"><Ic nome="numero" tam={13} />{meus.length ? `${meus.length} ${meus.length === 1 ? 'número' : 'números'}` : 'Sem número'}</span>
                    <span className="irs-chip"><Ic nome="ia" tam={13} />{MODELOS_GEMINI.find((m) => m.valor === rasc.config.modelo.conversa)?.rotulo ?? rasc.config.modelo.conversa}</span>
                    <span className="irs-chip">{ROT_ORIGEM[sel.origem]}</span>
                  </div>
                </div>
                <div className="irs-cab-acoes">
                  <BotaoSec onClick={() => setSecao('testar')}>Conversar para testar</BotaoSec>
                </div>
              </div>
              <div className="irs-editor">
                <nav className="irs-nav" aria-label="Partes da IA">
                  {SECOES.map((s, n) => {
                    const pend = itens.find((i) => i.secao === s.id && i.obrigatorio && !i.ok);
                    return (
                      <div key={s.id}>
                        {s.grupo && s.grupo !== SECOES[n - 1]?.grupo && <span className="irs-nav-grupo">{s.grupo}</span>}
                        <button type="button" className={'irs-nav-item' + (secao === s.id ? ' on' : '')} aria-current={secao === s.id ? 'page' : undefined} onClick={() => setSecao(s.id)}>
                          <Ic nome={s.id} /><span>{s.rotulo}</span>{pend && <i className="irs-pend" title={pend.detalhe} aria-label="falta resolver" />}
                        </button>
                      </div>
                    );
                  })}
                </nav>

                <div className="irs-conteudo">
                  <header className="irs-sec-cab">
                    <h2>{SECOES.find((s) => s.id === secao)?.rotulo}</h2>
                    <p>{SECOES.find((s) => s.id === secao)?.desc}</p>
                  </header>
                  {secao === 'resumo' && (
                    <SecResumo v={sel} itens={itens} faltam={faltam.length} numeros={numeros} meus={meus} atendendo={atendendo.length} versoes={versoes} irPara={setSecao}
                      aoAtivar={async (a) => {
                        if (sujo) { avisar('erro', 'Salve as mudanças antes de ligar ou desligar.'); return; }
                        try { await ativar.mutateAsync({ id: sel.id, ativa: a }); avisar('ok', a ? `"${sel.nome}" está ligada. Ela atende nos números ligados abaixo.` : `"${sel.nome}" foi desligada: ela para de responder em todos os números.`); }
                        catch (e) { avisar('erro', (e as Error).message); }
                      }} />
                  )}
                  {travada && secao !== 'resumo' && secao !== 'testar' && <PortaoSenha v={sel} />}
                  {!(travada && secao !== 'resumo' && secao !== 'testar') && (<>
                  {secao === 'quem' && <SecQuem c={rasc.config} set={set} />}
                  {secao === 'roteiro' && <SecRoteiro c={rasc.config} set={set} />}
                  {secao === 'inicio' && <SecInicio c={rasc.config} set={set} />}
                  {secao === 'outras' && <SecOutras c={rasc.config} set={set} v={sel} versoes={versoes} />}
                  {secao === 'copiloto' && <SecCopiloto v={sel} c={rasc.config} />}
                  {secao === 'empresa' && <SecEmpresa c={rasc.config} set={set} />}
                  {secao === 'oferece' && <SecOferece c={rasc.config} set={set} />}
                  {secao === 'analise' && <SecQualificacao c={rasc.config} set={set} />}
                  {secao === 'documentos' && <SecDocumentos c={rasc.config} set={set} />}
                  {secao === 'equipe' && <SecEquipe c={rasc.config} set={set} pessoas={pessoas} />}
                  {secao === 'textos' && <SecTextos c={rasc.config} set={set} />}
                  {secao === 'retomadas' && <SecRetomadas c={rasc.config} set={set} />}
                  {secao === 'horarios' && <SecHorarios c={rasc.config} set={set} />}
                  {secao === 'nunca' && <SecNunca c={rasc.config} set={set} />}
                  {secao === 'testar' && <SecTestar v={sel} sujo={sujo} irPara={setSecao} />}
                  {secao === 'avancado' && (
                    <SecAvancado v={sel} c={rasc.config} set={set} aviso={avisar}
                      aoDuplicar={() => void criarVersao(`${rasc.nome} (cópia)`, 'duplicada', rasc.config, rasc.descricao)}
                      aoExcluir={() => setJanela('excluir')} protegida={protegida} />
                  )}
                  </>)}
                </div>
              </div>
              </>
            )}
          </>
        )}

      {sujo && (
        <div className="cfgi-salvar irs-salvar" role="region" aria-label="Mudanças não salvas">
          <span>Mudanças em "{rasc?.nome}" ainda não salvas.</span>
          <BotaoSec onClick={() => sel && setRasc({ nome: sel.nome, descricao: sel.descricao, config: sel.config })}>Descartar</BotaoSec>
          <BotaoPrimario onClick={() => void fazerSalvar()} disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
        </div>
      )}

      <JanelaNova aberta={janela === 'nova'} atual={sel && rasc ? { nome: rasc.nome, config: rasc.config } : null} criando={criar.isPending}
        aoFechar={() => setJanela(null)} aoCriar={(nome, origem, config) => void criarVersao(nome, origem, config)} />
      <JanelaImportar aberta={janela === 'importar'} aoFechar={() => setJanela(null)} criando={criar.isPending}
        aoCriar={(nome, descricao, config) => void criarVersao(nome, 'importada', config, descricao)} />
      <ConfirmDialogV2 aberto={janela === 'excluir'} titulo={`Excluir "${sel?.nome ?? ''}"?`} destrutivo carregando={excluir.isPending} rotuloConfirmar="Excluir a IA"
        mensagem={<>A Iris para de atender nos {meus.length === 1 ? 'número que usa' : 'números que usam'} esta IA e a chave do Google guardada nela é apagada. Os textos e as configurações se perdem; se quiser guardar, exporte o arquivo antes (em Avançado).</>}
        aoCancelar={() => setJanela(null)}
        aoConfirmar={async () => { if (!sel) return; try { await excluir.mutateAsync(sel.id); setSelId(null); setJanela(null); avisar('ok', 'A IA foi excluída.'); } catch (e) { setJanela(null); avisar('erro', (e as Error).message); } }} />
      <ConfirmDialogV2 aberto={janela === 'trocar'} titulo="Sair sem salvar?" rotuloConfirmar="Sair sem salvar" destrutivo
        mensagem={<>As mudanças em "{rasc?.nome}" ainda não foram salvas e vão se perder.</>}
        aoCancelar={() => { setJanela(null); setDestino(null); }}
        aoConfirmar={() => { setJanela(null); if (destino) { setSelId(destino); setSecao('resumo'); } setDestino(null); }} />
    </div>
  );
}

/* ------------------------------ resumo ------------------------------ */
function SecResumo({ v, itens, faltam, numeros, meus, atendendo, versoes, irPara, aoAtivar }: {
  v: VersaoIris; itens: ReturnType<typeof prontidao>; faltam: number; numeros: NumeroIris[]; meus: NumeroIris[]; atendendo: number;
  versoes: VersaoIris[]; irPara: (s: Secao) => void; aoAtivar: (a: boolean) => void;
}) {
  const met = useMetricasIris(v.id);
  const m = met.data;
  const motor = temMotorIris();
  return (
    <>
      {!motor && (
        <div className="irs-nota irs-nota-forte" role="note">
          <b>Ela ainda não atende clientes.</b> Dá para configurar tudo agora: quem ela é, os fatos da empresa, os textos, a equipe e os números. Ligar fica travado até o motor da Iris entrar no servidor — sem ele, o Atendimento ia achar que a IA está respondendo e o cliente ficaria sem resposta.
        </div>
      )}
      <div className="kpis irs-kpis">
        <Kpi rotulo="Conversas agora" icone={<IconeTile nome="balao" />} valor={m?.conversasAtivas ?? 0} nota={v.ativa ? `em ${atendendo} ${atendendo === 1 ? 'número' : 'números'}` : 'IA desligada'} />
        <Kpi rotulo="Respostas hoje" icone={<IconeTile nome="envia" />} valor={m?.respostasHoje ?? 0} nota={`teto de ${v.config.modelo.maxChamadasDia} por dia`} />
        <Kpi rotulo="Retomadas hoje" icone={<IconeTile nome="repete" />} valor={m?.retomadasHoje ?? 0} nota="quem parou e ela chamou de novo" />
        <Kpi rotulo="Passadas para a equipe" icone={<IconeTile nome="pessoas" />} valor={m?.passadasEquipe7d ?? 0} nota="nos últimos 7 dias" />
      </div>

      <Bloco titulo={faltam ? `Para ligar, falta${faltam > 1 ? 'm' : ''} ${faltam} ${faltam === 1 ? 'passo' : 'passos'}` : 'Pronta para ligar'}
        desc="Ela só pode atender quando tudo isso estiver resolvido."
        acao={<Liga titulo={v.ativa ? 'Ligada' : 'Desligada'} ligado={v.ativa} aoMudar={aoAtivar} travado={!motor ? 'Começa quando o motor entrar' : !v.ativa && faltam ? 'Resolva os passos antes' : undefined} />}>
        <ul className="irs-pronto">
          {itens.map((i) => (
            <li key={i.id} className={i.ok ? 'ok' : 'falta'}>
              <span className="irs-pronto-ic" aria-hidden>{i.ok ? '✓' : ''}</span>
              <div><b>{i.titulo}</b><span>{i.detalhe}</span></div>
              {!i.ok && i.secao !== 'resumo' && <BotaoSec mini onClick={() => irPara(i.secao as Secao)}>Resolver</BotaoSec>}
            </li>
          ))}
        </ul>
      </Bloco>

      <BlocoNumeros v={v} numeros={numeros} meus={meus} versoes={versoes} />
    </>
  );
}

function BlocoNumeros({ v, numeros, meus, versoes }: { v: VersaoIris; numeros: NumeroIris[]; meus: NumeroIris[]; versoes: VersaoIris[] }) {
  const vincular = useNumerosDaVersao();
  const ligar = useLigarNumero();
  const teste = useModoTesteNumero();
  const [testeDe, setTesteDe] = useState<NumeroIris | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nomeVersao = (id: string | null) => versoes.find((x) => x.id === id)?.nome ?? null;
  const tentar = async (p: Promise<unknown>) => { setErro(null); try { await p; } catch (e) { setErro((e as Error).message); } };
  return (
    <Bloco titulo="Em quais números ela atende" desc="Cada número do Atendimento é atendido por uma IA. O modo teste faz ela responder só os números de teste, para conferir antes de abrir para todos.">
      {erro && <p className="irs-erro" role="alert">{erro}</p>}
      {numeros.length === 0 ? <p className="irs-vazio">Nenhum número do Atendimento ainda. Conecte em Configurações → WhatsApp.</p> : (
        <div className="irs-tab-rolo">
          <table className="irs-tab">
            <thead><tr><th scope="col">Número</th><th scope="col">IA</th><th scope="col">Iris neste número</th><th scope="col">Modo teste</th></tr></thead>
            <tbody>
              {numeros.map((n) => {
                const daqui = n.versaoId === v.id;
                const outra = !daqui && nomeVersao(n.versaoId);
                return (
                  <tr key={n.id} className={daqui ? 'on' : ''}>
                    <td><b>{n.nome}</b><span className="irs-sub-l">{fone(n.numero)}{!n.conectado && ' · desconectado'}</span></td>
                    <td>
                      <label className="irs-check">
                        <input type="checkbox" checked={daqui} onChange={(e) => void tentar(vincular.mutateAsync({ id: v.id, canais: e.target.checked ? [...meus.map((x) => x.id), n.id] : meus.filter((x) => x.id !== n.id).map((x) => x.id) }))} />
                        {daqui ? 'Esta IA' : outra ? `Usa "${outra}"` : 'Nenhuma'}
                      </label>
                    </td>
                    <td>{daqui ? <Toggle ligado={n.ligado} rotulo={`Iris no número ${n.nome}`} disabled={!temMotorIris()} aoMudar={(a) => void tentar(ligar.mutateAsync({ canal: n.id, ligado: a }))} /> : <span className="irs-sub-l">—</span>}</td>
                    <td>{daqui ? (
                      <span className="irs-teste">
                        <Toggle ligado={n.modoTeste} rotulo={`Modo teste no número ${n.nome}`} disabled={!temMotorIris()} aoMudar={(a) => void tentar(teste.mutateAsync({ canal: n.id, teste: a, numeros: n.numerosTeste }))} />
                        {n.modoTeste && <button type="button" className="irs-link" onClick={() => setTesteDe(n)}>{n.numerosTeste.length ? `${n.numerosTeste.length} ${n.numerosTeste.length === 1 ? 'número de teste' : 'números de teste'}` : 'escolher os números de teste'}</button>}
                      </span>
                    ) : <span className="irs-sub-l">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="irs-dica">Para ela atender num número: a IA ligada, o número marcado com esta IA e ela ligada nele. Com o modo teste, só os números de teste recebem resposta.</p>
      <JanelaNumerosTeste numero={testeDe} aoFechar={() => setTesteDe(null)} aoSalvar={async (lista) => { if (!testeDe) return; await tentar(teste.mutateAsync({ canal: testeDe.id, teste: true, numeros: lista })); setTesteDe(null); }} />
    </Bloco>
  );
}

function JanelaNumerosTeste({ numero, aoFechar, aoSalvar }: { numero: NumeroIris | null; aoFechar: () => void; aoSalvar: (l: string[]) => void }) {
  const [txt, setTxt] = useState('');
  useEffect(() => { setTxt((numero?.numerosTeste ?? []).join('\n')); }, [numero]);
  const lista = txt.split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10);
  return (
    <ModalV2 aberto={!!numero} aoFechar={aoFechar} titulo={`Números de teste · ${numero?.nome ?? ''}`} largura={460}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario onClick={() => aoSalvar(lista)}>Salvar {lista.length} {lista.length === 1 ? 'número' : 'números'}</BotaoPrimario></>}>
      <p className="irs-dica">Com o modo teste ligado, a Iris só responde estes números. Um por linha, com DDD.</p>
      <textarea className="inp irs-area" rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="51999990000" aria-label="Números de teste" />
    </ModalV2>
  );
}

/* ------------------------------ testar ------------------------------ */
function SecTestar({ v, sujo, irPara }: { v: VersaoIris; sujo: boolean; irPara: (s: Secao) => void }) {
  const conversar = useConversarIris();
  const [bolhas, setBolhas] = useState<BolhaTeste[]>([]);
  const [txt, setTxt] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [bolhas.length]);
  const mandar = async () => {
    const t = txt.trim(); if (!t || conversar.isPending) return;
    const hist = [...bolhas, { de: 'cliente' as const, texto: t }];
    setBolhas(hist); setTxt('');
    try { const resp = await conversar.mutateAsync({ id: v.id, historico: hist }); setBolhas([...hist, ...resp]); }
    catch (e) { setBolhas([...hist, { de: 'iris', texto: '', nota: `Não respondeu: ${(e as Error).message}` }]); }
  };
  if (!temMotorIris()) return (
    <Bloco titulo="Conversa de teste">
      <EstadoVazio titulo="Começa junto com o motor da Iris" descricao="A conversa de teste usa o mesmo motor que atende os clientes. Quando ele entrar no servidor, é aqui que você conversa com ela antes de ligar." />
    </Bloco>
  );
  if (!v.chaveDefinidaEm) return (
    <Bloco titulo="Conversa de teste">
      <EstadoVazio titulo="Falta a chave do Google" descricao="Para conversar com ela, guarde a chave do Gemini em Avançado." acao={{ rotulo: 'Ir para Avançado', onClick: () => irPara('avancado') }} />
    </Bloco>
  );
  return (
    <Bloco titulo="Conversa de teste" desc="É a mesma IA dos números, com a configuração SALVA, mas nada vai para o WhatsApp."
      acao={bolhas.length > 0 && <BotaoSec mini onClick={() => setBolhas([])}>Começar de novo</BotaoSec>}>
      {sujo && <p className="irs-erro" role="note">Há mudanças não salvas: o teste usa a versão salva.</p>}
      {isPrevia && <p className="irs-dica" role="note">Na prévia não há Gemini: as respostas seguem um roteiro de exemplo. No sistema de verdade é ela respondendo com a configuração desta IA.</p>}
      <div className="irs-chat" aria-live="polite">
        {bolhas.length === 0 && <p className="irs-vazio">Escreva como um cliente escreveria. Ex.: "oi, vi o anúncio da revisão".</p>}
        {bolhas.map((b, n) => (
          <div key={n} className={'irs-bolha ' + b.de}>
            {b.texto && <p>{b.audio && <span className="irs-bolha-audio">nota de voz · </span>}{b.texto}</p>}
            {b.nota && <span className="irs-bolha-nota">{b.nota}</span>}
          </div>
        ))}
        {conversar.isPending && <div className="irs-bolha iris digitando"><p>digitando…</p></div>}
        <div ref={fim} />
      </div>
      <form className="irs-chat-form" onSubmit={(e) => { e.preventDefault(); void mandar(); }}>
        <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Mensagem do cliente" aria-label="Mensagem do cliente" maxLength={800} />
        <BotaoPrimario type="submit" disabled={!txt.trim() || conversar.isPending}>Mandar</BotaoPrimario>
      </form>
    </Bloco>
  );
}

/* ------------------------------ avançado ------------------------------ */
function SecAvancado({ v, c, set, aviso, aoDuplicar, aoExcluir, protegida }: {
  v: VersaoIris; c: IrisConfig; set: (fn: (c: IrisConfig) => IrisConfig) => void; aviso: (tom: 'ok' | 'erro', t: string) => void; aoDuplicar: () => void; aoExcluir: () => void;
  protegida: { definidaEm: string; definidaPor: string | null } | null;
}) {
  const salvarChave = useSalvarChaveIris();
  const testar = useTestarChaveIris();
  const [chave, setChave] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; detalhe: string } | null>(null);
  const exportar = () => {
    const blob = new Blob([JSON.stringify(exportarVersao({ ...v, config: c }), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `iris-${(v.nome || 'versao').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const mudM = (k: keyof IrisConfig['modelo'], val: string | number) => set((x) => ({ ...x, modelo: { ...x.modelo, [k]: val } }));
  return (
    <>
      <Bloco titulo="Chave do Google (Gemini)" desc="A Iris pensa e fala pelo Gemini, do Google, com a conta da própria empresa: o custo de cada conversa sai nessa conta.">
        <div className="irs-chave">
          <BadgeStatus tom={v.chaveDefinidaEm ? 'ok' : 'atencao'}>{v.chaveDefinidaEm ? `Guardada em ${new Date(v.chaveDefinidaEm).toLocaleDateString('pt-BR')}` : 'Nenhuma chave guardada'}</BadgeStatus>
          <span className="irs-dica">A chave fica no cofre do sistema: depois de guardada, ninguém consegue ler de volta, nem o administrador.</span>
        </div>
        <form className="irs-chave-form" onSubmit={async (e) => {
          e.preventDefault(); if (chave.trim().length < 20) return;
          try { await salvarChave.mutateAsync({ id: v.id, chave }); setChave(''); setResultado(null); aviso('ok', 'A chave foi guardada no cofre.'); } catch (er) { aviso('erro', (er as Error).message); }
        }}>
          <input className="inp" type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={v.chaveDefinidaEm ? 'Colar uma chave nova para trocar' : 'Colar a chave (começa com AIza…)'} aria-label="Chave do Gemini" />
          <BotaoPrimario type="submit" disabled={chave.trim().length < 20 || salvarChave.isPending}>{v.chaveDefinidaEm ? 'Trocar a chave' : 'Guardar a chave'}</BotaoPrimario>
          <BotaoSec type="button" disabled={!v.chaveDefinidaEm || testar.isPending || !temMotorIris()} title={temMotorIris() ? undefined : 'O teste da chave entra junto com o motor da Iris'} onClick={async () => setResultado(await testar.mutateAsync(v.id))}>{testar.isPending ? 'Testando…' : 'Testar a chave'}</BotaoSec>
        </form>
        {resultado && <p className={resultado.ok ? 'irs-ok' : 'irs-erro'} role="status">{resultado.detalhe}</p>}
      </Bloco>
      <Bloco titulo="Modelos" desc="Qual versão do Gemini ela usa em cada tipo de trabalho.">
        <div className="irs-grade3">
          {([['conversa', 'Conversa'], ['documentos', 'Ler documentos'], ['dificil', 'Casos difíceis']] as const).map(([k, r]) => (
            <label key={k} className="irs-campo"><span className="irs-rot">{r}</span>
              <select className="inp" value={c.modelo[k]} onChange={(e) => mudM(k, e.target.value)}>
                {MODELOS_GEMINI.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo} · {m.desc}</option>)}
              </select>
            </label>
          ))}
        </div>
        <Numero rotulo="Respostas por dia, no máximo, em cada número" valor={c.modelo.maxChamadasDia} min={50} max={5000} aoMudar={(n) => mudM('maxChamadasDia', n)}
          dica="Um freio de custo: passou disso, ela para e a equipe assume até o dia seguinte." />
      </Bloco>
      <BlocoSenha v={v} protegida={protegida} aviso={aviso} />
      <Bloco titulo="Arquivo e cópias">
        <div className="irs-acoes-linha">
          <div><b>Exportar esta IA</b><span>Um arquivo com toda a configuração, para guardar ou levar para outro sistema. Não leva a chave nem os números.</span></div>
          <BotaoSec onClick={exportar}>Exportar arquivo</BotaoSec>
        </div>
        <div className="irs-acoes-linha">
          <div><b>Duplicar</b><span>Cria outra IA igual a esta (com as mudanças da tela), desligada e sem chave. Bom para uma campanha diferente.</span></div>
          <BotaoSec onClick={aoDuplicar}>Duplicar</BotaoSec>
        </div>
        <div className="irs-acoes-linha perigo">
          <div><b>Excluir esta IA</b><span>Para de atender nos números dela e apaga a chave guardada.</span></div>
          <BotaoSec className="btn-perigo" onClick={aoExcluir}>Excluir</BotaoSec>
        </div>
      </Bloco>
    </>
  );
}

/* ------------------------------ janelas ------------------------------ */
function JanelaNova({ aberta, atual, criando, aoFechar, aoCriar }: {
  aberta: boolean; atual: { nome: string; config: IrisConfig } | null; criando: boolean; aoFechar: () => void;
  aoCriar: (nome: string, origem: VersaoIris['origem'], config: IrisConfig) => void;
}) {
  const [nome, setNome] = useState('');
  const [base, setBase] = useState<'pre' | 'copia' | 'branco' | 'bia'>('pre');
  useEffect(() => { if (aberta) { setNome(''); setBase(atual ? 'copia' : 'pre'); } }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (base === 'bia' && !nome.trim()) setNome('Bia'); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const empresa = atual?.config.identidade.empresa || 'Reviza';
  const opcoes: { v: typeof base; t: string; d: string; off?: boolean }[] = [
    { v: 'pre', t: 'Como a Iris pré-configurada', d: 'Igual à Iris do Atenvo: revisão de juros, cartão RMC, clientes fechados, documentos e retomadas.' },
    ...(atual ? [{ v: 'copia' as typeof base, t: `Uma cópia de "${atual.nome}"`, d: 'Tudo igual à IA aberta, para mudar só o que for diferente.' }] : []),
    { v: 'bia', t: 'A Bia do sistema de antes', d: 'Como a Reviza usava: o roteiro, as regras, as 8 perguntas frequentes e os 63 gatilhos do agente COMERCIAL REVIZA RS, com espera de 15 s e áudio sempre.' },
    { v: 'branco', t: 'Em branco', d: 'Só o esqueleto: sem assuntos, sem perguntas e só os textos de abertura.' },
  ];
  return (
    <ModalV2 aberto={aberta} aoFechar={aoFechar} titulo="Nova IA" largura={520}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={!nome.trim() || criando} onClick={() => aoCriar(nome.trim(), base === 'copia' ? 'duplicada' : base === 'pre' ? 'pre_configurada' : base === 'bia' ? 'importada' : 'nova',
          base === 'copia' && atual ? atual.config : base === 'pre' ? irisPreConfigurada(empresa) : base === 'bia' ? irisDaBia() : irisEmBranco(empresa))}>{criando ? 'Criando…' : 'Criar'}</BotaoPrimario></>}>
      <label className="irs-campo largo"><span className="irs-rot">Nome</span>
        <input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Luna · campanha do cartão RMC" autoFocus />
      </label>
      <div className="irs-opcoes col" role="radiogroup" aria-label="Começar de">
        {opcoes.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={base === o.v} disabled={o.off} className={'irs-opcao' + (base === o.v ? ' on' : '')} onClick={() => setBase(o.v)}>
            <b>{o.t}</b><span>{o.d}</span>
          </button>
        ))}
      </div>
      <p className="irs-dica">A IA nova nasce desligada e sem chave.</p>
    </ModalV2>
  );
}

function JanelaImportar({ aberta, aoFechar, criando, aoCriar }: { aberta: boolean; aoFechar: () => void; criando: boolean; aoCriar: (nome: string, descricao: string, c: IrisConfig) => void }) {
  const [txt, setTxt] = useState('');
  const [nome, setNome] = useState('');
  useEffect(() => { if (aberta) { setTxt(''); setNome(''); } }, [aberta]);
  const lido = txt.trim() ? lerArquivo(txt) : null;
  const abrir = (f: File | undefined) => { if (!f) return; if (f.size > 2_000_000) { setTxt('{}'); return; } void f.text().then(setTxt); };
  let mensagem: ReactNode = null;
  if (lido && !lido.ok) mensagem = <p className="irs-erro" role="alert">{lido.erro}</p>;
  if (lido && lido.ok) mensagem = <p className="irs-ok">Arquivo "{lido.nome}" lido: {lido.config.produtos.filter((p) => p.ativo).length} assuntos, {lido.config.textos.length} textos. Entra como IA nova, desligada.</p>;
  return (
    <ModalV2 aberto={aberta} aoFechar={aoFechar} titulo="Importar uma IA" largura={520}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={!lido || !lido.ok || criando} onClick={() => { if (lido && lido.ok) aoCriar(nome.trim() || lido.nome, lido.descricao, lido.config); }}>{criando ? 'Importando…' : 'Importar'}</BotaoPrimario></>}>
      <p className="irs-dica">O arquivo vem de "Exportar arquivo" (em Avançado). Ele nunca traz a chave nem os números.</p>
      <label className="irs-arquivo">
        <input type="file" accept="application/json,.json" onChange={(e) => abrir(e.target.files?.[0])} />
        <span>Escolher o arquivo</span>
      </label>
      <textarea className="inp irs-area" rows={4} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="…ou cole o conteúdo do arquivo aqui" aria-label="Conteúdo do arquivo" />
      {mensagem}
      {lido && lido.ok && (
        <label className="irs-campo largo"><span className="irs-rot">Nome da IA</span>
          <input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={lido.nome} maxLength={80} />
        </label>
      )}
    </ModalV2>
  );
}

export default ConfigIris;
