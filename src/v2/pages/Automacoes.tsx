/* ATENDIMENTO › AUTOMAÇÕES (26/11, "igual" ao sistema que a Reviza usava antes):
     /automacoes/sequencias  os modelos de mensagens em série (com a espera antes de cada uma), as categorias e o histórico de
                             envios. A pessoa aplica na conversa pelo ⋯ do WhatsApp; não começa sozinha.
     /automacoes/palavras    as regras que mudam o card de etapa quando o cliente (ou a equipe) escreve uma palavra-chave, com
                             o "testar a regra" e o histórico do que cada regra fez.
   As mensagens agendadas (uma mensagem num dia e hora) ficam em /agendamentos, a central de sempre.
   Dados: @/data/automacoes (migration 116). */
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Segmentado, Toggle } from '../components';
import {
  ESPERAS_PASSO, MODOS_PALAVRA, fmtEspera, testarRegra, useAnexosDosScripts, useApagarRegra, useApagarSequencia, useHistoricoAutomacoes, useRegrasPalavras,
  useSalvarRegra, useSalvarSequencia, useSequencias, validarRegra, validarSequencia, type ModoPalavra, type Palavra, type Passo, type RegraPalavras, type Sequencia,
} from '@/data/automacoes';
import { usePessoasEEtapas } from '@/data/avisosEquipe';
import { Formularios } from './automacoes/Formularios';
import { Disparos } from './automacoes/Disparos';
import { isRevizaMode } from '@/lib/supabase';
import { temRecurso } from '../data/config/recursos';
import './painel/painel.css';
import './config/config.css';
import './config/camposMotivos.css';
import './automacoes.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const ROT_TIPO: Record<Passo['tipo'], string> = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento' };

export default function Automacoes() {
  const { secao } = useParams();
  const { currentOrg } = useOrg();
  const nav = useNavigate();
  const formsLigado = isRevizaMode && temRecurso('formularios');
  const dispLigado = isRevizaMode && temRecurso('disparos');
  if (secao !== 'sequencias' && secao !== 'palavras' && !(secao === 'formularios' && formsLigado) && !(secao === 'disparos' && dispLigado)) return <Navigate to="/automacoes/sequencias" replace />;
  const gestao = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  return (
    <div className="aut pn cfgw" data-automacoes>
      <div className="ph sobe">
        <div>
          <h2>{secao === 'sequencias' ? 'Sequências' : secao === 'formularios' ? 'Formulários' : secao === 'disparos' ? 'Disparos' : 'Automação por palavras'}</h2>
          <p className="cfga-sub">{secao === 'sequencias'
            ? 'Mensagens em série, com esperas entre elas, que você dispara na conversa na hora que escolher. Não começam sozinhas.'
            : secao === 'formularios' ? 'Um link que o cliente preenche (e pode marcar um horário): ele vira cliente e card no Kanban.'
            : secao === 'disparos' ? 'A mesma mensagem para um grupo de clientes, num ritmo seguro para o número. Nada sai sem você confirmar.'
            : 'O card muda de etapa sozinho quando o cliente, ou a equipe, escreve uma palavra-chave.'}</p>
        </div>
        <div className="acoes">
          <Segmentado rotulo="Automações" valor={secao} aoMudar={(v) => nav('/automacoes/' + v)}
            opcoes={[{ valor: 'sequencias', rotulo: 'Sequências' }, { valor: 'palavras', rotulo: 'Por palavras' }, ...(formsLigado ? [{ valor: 'formularios', rotulo: 'Formulários' }] : []), ...(dispLigado ? [{ valor: 'disparos', rotulo: 'Disparos' }] : [])]} />
          <BotaoSec onClick={() => nav('/agendamentos')}>Mensagens agendadas</BotaoSec>
        </div>
      </div>
      {secao === 'sequencias' ? <Sequencias gestao={gestao} />
        : secao === 'formularios' ? (currentOrg.role === 'admin' ? <Formularios /> : <p className="pn-vazio">Só o administrador mexe nos formulários.</p>)
        : secao === 'disparos' ? (currentOrg.role === 'admin' ? <Disparos /> : <p className="pn-vazio">Só o administrador cria disparos.</p>)
        : currentOrg.role === 'admin' ? <Palavras /> : <p className="pn-vazio">Só o administrador mexe nas regras por palavra.</p>}
    </div>
  );
}

/* ============================== sequências ============================== */
function Sequencias({ gestao }: { gestao: boolean }) {
  const q = useSequencias();
  const salvar = useSalvarSequencia();
  const [aba, setAba] = useState<'modelos' | 'historico'>('modelos');
  const [janela, setJanela] = useState<{ s: Sequencia | null } | null>(null);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const lista = (q.data ?? []).filter((s) => !busca.trim() || `${s.nome} ${s.categoria ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const categorias = useMemo(() => [...new Set((q.data ?? []).map((s) => s.categoria).filter(Boolean) as string[])].sort(), [q.data]);
  const porCategoria = useMemo(() => {
    const m = new Map<string, Sequencia[]>();
    for (const s of lista) { const k = s.categoria ?? 'Sem categoria'; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [lista]);
  return (
    <>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="aut-barra">
        <Segmentado rotulo="Sequências" valor={aba} aoMudar={(v) => setAba(v as 'modelos' | 'historico')} opcoes={[{ valor: 'modelos', rotulo: 'Modelos' }, { valor: 'historico', rotulo: 'Histórico de envios' }]} />
        {aba === 'modelos' && <input className="inp aut-busca" placeholder="Buscar sequência" aria-label="Buscar sequência" value={busca} onChange={(e) => setBusca(e.target.value)} />}
        {aba === 'modelos' && gestao && <BotaoPrimario onClick={() => setJanela({ s: null })}>＋ Nova sequência</BotaoPrimario>}
      </div>
      {aba === 'historico' ? <Historico tipo="sequencias" /> : (
        q.isLoading ? <p className="pn-vazio">Carregando as sequências…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar as sequências" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : lista.length === 0 ? <CardVidro className="pn-card"><EstadoVazio titulo={busca ? 'Nenhuma sequência com esse nome' : 'Nenhuma sequência ainda'} descricao="Crie a primeira: mensagens em série, com esperas entre elas. Depois, no WhatsApp, o ⋯ da conversa tem “Aplicar uma sequência”."
            acao={gestao && !busca ? { rotulo: '＋ Nova sequência', onClick: () => setJanela({ s: null }) } : undefined} /></CardVidro>
          : porCategoria.map(([cat, ss]) => (
            <CardVidro key={cat} spot className="pn-card sobe">
              <div className="pn-card-cab"><div><h3>{cat}</h3><p>{ss.length} {ss.length === 1 ? 'sequência' : 'sequências'}</p></div></div>
              <ul className="aut-seqs">
                {ss.map((s) => {
                  const total = s.passos.reduce((t, p, i) => t + (i ? Math.max(p.esperaMin || 1, 1) : 0), 0);
                  return (
                    <li key={s.id} className={s.ativo ? undefined : 'desl'}>
                      <div className="aut-seq-tx">
                        <b>{s.nome}</b>
                        <span>{s.passos.length} {s.passos.length === 1 ? 'mensagem' : 'mensagens'} · {total ? `dura ${fmtEspera(total)}` : 'tudo de uma vez'}{s.pararSeResponder ? ' · para se o cliente responder' : ''}</span>
                        {s.descricao && <small>{s.descricao}</small>}
                        <ol className="aut-mini">
                          {s.passos.slice(0, 4).map((p, i) => <li key={i}><em>{i === 0 ? 'Na hora' : `+${fmtEspera(p.esperaMin)}`}</em>{p.tipo === 'texto' ? p.texto : `${ROT_TIPO[p.tipo]}: ${p.nome ?? 'arquivo'}`}</li>)}
                          {s.passos.length > 4 && <li><em>…</em>mais {s.passos.length - 4}</li>}
                        </ol>
                      </div>
                      {gestao && (
                        <span className="aut-seq-ac">
                          <Toggle ligado={s.ativo} rotulo={`Sequência ${s.nome} ligada`} disabled={salvar.isPending}
                            aoMudar={(v) => void salvar.mutateAsync({ ...s, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `"${s.nome}" ligada.` : `"${s.nome}" desligada: não aparece para aplicar.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} />
                          <BotaoSec mini onClick={() => setJanela({ s })}>Editar</BotaoSec>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardVidro>
          ))
      )}
      {janela && <JanelaSequencia key={janela.s?.id ?? 'nova'} s={janela.s} todas={q.data ?? []} categorias={categorias} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </>
  );
}

function JanelaSequencia({ s, todas, categorias, aoFechar, aoAvisar }: { s: Sequencia | null; todas: Sequencia[]; categorias: string[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarSequencia();
  const apagar = useApagarSequencia();
  const anexos = useAnexosDosScripts();
  const [nome, setNome] = useState(s?.nome ?? '');
  const [categoria, setCategoria] = useState(s?.categoria ?? '');
  const [descricao, setDescricao] = useState(s?.descricao ?? '');
  const [passos, setPassos] = useState<Passo[]>(s?.passos ?? [{ tipo: 'texto', texto: '', esperaMin: 0 }]);
  const [parar, setParar] = useState(s?.pararSeResponder ?? true);
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending || apagar.isPending;
  const mudar = (i: number, p: Partial<Passo>) => { setPassos((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x))); setErro(''); };
  const mover = (i: number, d: -1 | 1) => setPassos((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const gravar = async () => {
    const e = validarSequencia({ nome, passos }, todas, s?.id); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ id: s?.id, nome, categoria: categoria || null, descricao: descricao || null, passos, pararSeResponder: parar, ativo: s?.ativo ?? true }); aoAvisar(s ? `"${nome.trim()}" salva.` : `"${nome.trim()}" criada. Aplique pelo ⋯ da conversa no WhatsApp.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={680}
      titulo={<div>{s ? 'Editar sequência' : 'Nova sequência'}<div className="mod-sub">Mensagens em série; a espera vale antes de cada uma</div></div>}
      rodape={<>
        {s && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void apagar.mutateAsync(s.id).then(() => { aoAvisar(`"${s.nome}" apagada. O que já foi agendado continua.`); aoFechar(); }).catch((x) => setErro((x as Error).message))}>Apagar</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : s ? 'Salvar' : 'Criar sequência'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="aut-grade2">
          <div className="pn-us-campo"><label htmlFor="sq-nome">Nome</label><input id="sq-nome" className="inp" value={nome} maxLength={80} autoFocus={!s} placeholder="ex.: Lembrar os documentos" onChange={(e) => { setNome(e.target.value); setErro(''); }} /></div>
          <div className="pn-us-campo"><label htmlFor="sq-cat">Categoria</label><input id="sq-cat" className="inp" list="sq-cats" value={categoria} maxLength={40} placeholder="ex.: Documentos" onChange={(e) => setCategoria(e.target.value)} />
            <datalist id="sq-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
        </div>
        <div className="pn-us-campo"><label htmlFor="sq-desc">Para que serve (opcional)</label><input id="sq-desc" className="inp" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} /></div>
        <ol className="aut-passos">
          {passos.map((p, i) => (
            <li key={i}>
              <div className="aut-passo-cab">
                <span className="aut-passo-n">{i + 1}</span>
                {i === 0 ? <span className="aut-passo-espera">Sai na hora em que a pessoa aplicar</span> : (
                  <label className="aut-passo-espera">Esperar
                    <select className="inp" value={ESPERAS_PASSO.some((x) => x.valor === p.esperaMin) ? p.esperaMin : -1} onChange={(e) => mudar(i, { esperaMin: Number(e.target.value) < 0 ? p.esperaMin : Number(e.target.value) })}>
                      {ESPERAS_PASSO.filter((x) => x.valor > 0).map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
                      {!ESPERAS_PASSO.some((x) => x.valor === p.esperaMin) && <option value={-1}>{fmtEspera(p.esperaMin)}</option>}
                    </select>
                    depois da anterior
                  </label>
                )}
                <select className="inp aut-passo-tipo" aria-label={`Tipo da mensagem ${i + 1}`} value={p.tipo === 'texto' ? 'texto' : 'midia'}
                  onChange={(e) => mudar(i, e.target.value === 'texto' ? { tipo: 'texto', storagePath: undefined, mime: undefined, nome: undefined } : { tipo: 'documento', texto: '' })}>
                  <option value="texto">Texto</option><option value="midia">Mídia de um script</option>
                </select>
                <span className="aut-passo-ac">
                  <button type="button" className="cfgc-seta" aria-label={`Subir a mensagem ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="cfgc-seta" aria-label={`Descer a mensagem ${i + 1}`} disabled={i === passos.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" className="cfgc-seta" aria-label={`Tirar a mensagem ${i + 1}`} disabled={passos.length === 1} onClick={() => setPassos((l) => l.filter((_, k) => k !== i))}>×</button>
                </span>
              </div>
              {p.tipo === 'texto'
                ? <textarea className="inp" rows={3} maxLength={4096} value={p.texto} placeholder="A mensagem para o cliente" aria-label={`Texto da mensagem ${i + 1}`} onChange={(e) => mudar(i, { texto: e.target.value })} />
                : (
                  <select className="inp" aria-label={`Arquivo da mensagem ${i + 1}`} value={p.storagePath ?? ''} onChange={(e) => { const a = (anexos.data ?? []).find((x) => x.storagePath === e.target.value); if (a) mudar(i, { tipo: a.tipo, storagePath: a.storagePath, mime: a.mime, nome: a.nome, tamanho: a.tamanho ?? undefined, anexoRotulo: a.rotulo }); }}>
                    <option value="">{(anexos.data ?? []).length ? 'Escolha o arquivo (dos Scripts)' : 'Nenhum script com arquivo'}</option>
                    {(anexos.data ?? []).map((a) => <option key={a.id} value={a.storagePath}>{ROT_TIPO[a.tipo]} · {a.rotulo}</option>)}
                    {p.storagePath && !(anexos.data ?? []).some((a) => a.storagePath === p.storagePath) && <option value={p.storagePath}>{p.anexoRotulo ?? p.nome ?? 'arquivo'}</option>}
                  </select>
                )}
            </li>
          ))}
        </ol>
        {passos.length < 20 && <div><BotaoSec onClick={() => setPassos((l) => [...l, { tipo: 'texto', texto: '', esperaMin: 60 }])}>＋ Mensagem</BotaoSec></div>}
        <label className="cfgc-chk"><input type="checkbox" checked={parar} onChange={(e) => setParar(e.target.checked)} /><span>Parar se o cliente responder (o resto é cancelado)</span></label>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}

/* ============================== palavras ============================== */
function Palavras() {
  const q = useRegrasPalavras();
  const etapas = usePessoasEEtapas().data?.etapas ?? [];
  const salvar = useSalvarRegra();
  const [aba, setAba] = useState<'regras' | 'historico'>('regras');
  const [janela, setJanela] = useState<{ r: RegraPalavras | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const regras = q.data ?? [];
  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? null;
  return (
    <>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <div className="aut-barra">
        <Segmentado rotulo="Automação por palavras" valor={aba} aoMudar={(v) => setAba(v as 'regras' | 'historico')} opcoes={[{ valor: 'regras', rotulo: `Regras (${regras.length})` }, { valor: 'historico', rotulo: 'Histórico' }]} />
        {aba === 'regras' && <BotaoPrimario onClick={() => setJanela({ r: null })}>＋ Nova regra</BotaoPrimario>}
      </div>
      {aba === 'historico' ? <Historico tipo="regras" /> : (
        q.isLoading ? <p className="pn-vazio">Carregando as regras…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar as regras" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : regras.length === 0 ? <CardVidro className="pn-card"><EstadoVazio titulo="Nenhuma regra" descricao="Crie regras para mover o card de etapa quando uma palavra aparecer na conversa." acao={{ rotulo: '＋ Nova regra', onClick: () => setJanela({ r: null }) }} /></CardVidro>
          : (
            <CardVidro spot className="pn-card sobe">
              <div className="pn-card-cab"><div><h3>Regras</h3><p>Valem na ordem da lista: a primeira que casar com a mensagem move o card. Card fechado não muda.</p></div></div>
              <ul className="aut-seqs">
                {regras.map((r) => (
                  <li key={r.id} className={r.ativo ? undefined : 'desl'}>
                    <div className="aut-seq-tx">
                      <b>{r.nome}</b>
                      <span>{r.quem === 'lead' ? 'Quando o cliente escreve' : r.quem === 'equipe' ? 'Quando a equipe escreve' : 'Quando alguém escreve'} {r.operador === 'e' ? 'todas estas' : 'uma destas'}: {r.palavras.map((p) => `“${p.texto}”`).join(', ')}{r.ignorar.length ? ` · ignora: ${r.ignorar.join(', ')}` : ''}</span>
                      <small>{r.onde === 'ultima' ? 'Olha a última mensagem' : r.onde === 'ultimas' ? `Olha as últimas ${r.ultimasN} mensagens` : 'Olha a conversa toda'} → o card vai para <b>{nomeEtapa(r.colunaId) ?? 'etapa apagada'}</b></small>
                    </div>
                    <span className="aut-seq-ac">
                      <Toggle ligado={r.ativo} rotulo={`Regra ${r.nome} ligada`} disabled={salvar.isPending}
                        aoMudar={(v) => void salvar.mutateAsync({ ...r, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `"${r.nome}" ligada.` : `"${r.nome}" desligada.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} />
                      <BotaoSec mini onClick={() => setJanela({ r })}>Editar</BotaoSec>
                    </span>
                  </li>
                ))}
              </ul>
            </CardVidro>
          )
      )}
      {janela && <JanelaRegra key={janela.r?.id ?? 'nova'} r={janela.r} total={regras.length} etapas={etapas} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </>
  );
}

function JanelaRegra({ r, total, etapas, aoFechar, aoAvisar }: { r: RegraPalavras | null; total: number; etapas: { id: string; nome: string; resultado: string | null }[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarRegra();
  const apagar = useApagarRegra();
  const [nome, setNome] = useState(r?.nome ?? '');
  const [descricao, setDescricao] = useState(r?.descricao ?? '');
  const [palavras, setPalavras] = useState<Palavra[]>(r?.palavras ?? []);
  const [nova, setNova] = useState(''); const [novoModo, setNovoModo] = useState<ModoPalavra>('contem');
  const [ignorar, setIgnorar] = useState<string[]>(r?.ignorar ?? []);
  const [novaIgn, setNovaIgn] = useState('');
  const [operador, setOperador] = useState<RegraPalavras['operador']>(r?.operador ?? 'ou');
  const [onde, setOnde] = useState<RegraPalavras['onde']>(r?.onde ?? 'ultima');
  const [n, setN] = useState(r?.ultimasN ?? 5);
  const [quem, setQuem] = useState<RegraPalavras['quem']>(r?.quem ?? 'lead');
  const [coluna, setColuna] = useState(r?.colunaId ?? '');
  const [teste, setTeste] = useState('');
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending || apagar.isPending;
  const destinos = etapas.filter((e) => e.resultado !== 'perdido');
  const inserirPalavra = () => { const t = nova.trim(); if (!t) return; if (!palavras.some((p) => p.texto.toLowerCase() === t.toLowerCase() && p.modo === novoModo)) setPalavras([...palavras, { texto: t, modo: novoModo }]); setNova(''); setErro(''); };
  const inserirIgnorar = () => { const t = novaIgn.trim(); if (t && !ignorar.includes(t)) setIgnorar([...ignorar, t]); setNovaIgn(''); };
  const res = teste.trim() ? testarRegra({ palavras, ignorar, operador }, teste) : null;
  const gravar = async () => {
    const e = validarRegra({ nome, palavras, colunaId: coluna || null }); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ id: r?.id, nome, descricao: descricao || null, palavras, ignorar, operador, onde, ultimasN: n, quem, colunaId: coluna || null, ativo: r?.ativo ?? true, ordem: r?.ordem ?? total }); aoAvisar(r ? `"${nome.trim()}" salva.` : `"${nome.trim()}" criada e ligada.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={620}
      titulo={<div>{r ? 'Editar regra' : 'Nova regra'}<div className="mod-sub">Quando a palavra aparecer, o card muda de etapa sozinho</div></div>}
      rodape={<>
        {r && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void apagar.mutateAsync(r.id).then(() => { aoAvisar(`"${r.nome}" apagada.`); aoFechar(); }).catch((x) => setErro((x as Error).message))}>Apagar</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : r ? 'Salvar' : 'Criar regra'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo"><label htmlFor="rp-nome">Nome da regra</label><input id="rp-nome" className="inp" value={nome} maxLength={80} autoFocus={!r} placeholder="ex.: Mandou documento" onChange={(e) => { setNome(e.target.value); setErro(''); }} /></div>
        <div className="pn-us-campo"><label htmlFor="rp-desc">Para que serve (opcional)</label><input id="rp-desc" className="inp" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div className="pn-us-campo"><span className="cfga-rot">Palavras ou frases para detectar</span>
          <div className="aut-tags">{palavras.map((p, i) => <span key={i} className="aut-tag">{p.texto}<em>{MODOS_PALAVRA.find((m) => m.valor === p.modo)?.rotulo}</em><button type="button" aria-label={`Tirar ${p.texto}`} onClick={() => setPalavras(palavras.filter((_, k) => k !== i))}>×</button></span>)}</div>
          <div className="aut-linha">
            <input className="inp" value={nova} placeholder="Digite a palavra ou frase" aria-label="Palavra ou frase" onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inserirPalavra(); } }} />
            <select className="inp" aria-label="Como comparar" value={novoModo} onChange={(e) => setNovoModo(e.target.value as ModoPalavra)}>{MODOS_PALAVRA.map((m) => <option key={m.valor} value={m.valor} title={m.dica}>{m.rotulo}</option>)}</select>
            <BotaoSec onClick={inserirPalavra}>Pôr</BotaoSec>
          </div>
          <span className="cfgc-dica">Sem acento e sem maiúscula: "documento" casa com "DOCUMENTO".</span>
        </div>
        <div className="pn-us-campo"><span className="cfga-rot">Palavras para ignorar (opcional)</span>
          <div className="aut-tags">{ignorar.map((x) => <span key={x} className="aut-tag">{x}<button type="button" aria-label={`Tirar ${x}`} onClick={() => setIgnorar(ignorar.filter((y) => y !== x))}>×</button></span>)}</div>
          <div className="aut-linha"><input className="inp" value={novaIgn} placeholder="ex.: ainda não, depois" aria-label="Palavra para ignorar" onChange={(e) => setNovaIgn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inserirIgnorar(); } }} /><BotaoSec onClick={inserirIgnorar}>Pôr</BotaoSec></div>
          <span className="cfgc-dica">Se uma delas aparecer, a regra não vale.</span>
        </div>
        <div className="aut-grade2">
          <label className="pn-us-campo"><span>Operador</span><select className="inp" value={operador} onChange={(e) => setOperador(e.target.value as 'ou' | 'e')}><option value="ou">OU (qualquer palavra)</option><option value="e">E (todas as palavras)</option></select></label>
          <label className="pn-us-campo"><span>Mensagens de quem</span><select className="inp" value={quem} onChange={(e) => setQuem(e.target.value as RegraPalavras['quem'])}><option value="lead">Só as do cliente</option><option value="equipe">Só as da equipe</option><option value="todas">Todas as mensagens</option></select></label>
          <label className="pn-us-campo"><span>Onde procurar</span><select className="inp" value={onde} onChange={(e) => setOnde(e.target.value as RegraPalavras['onde'])}><option value="ultima">Na última mensagem</option><option value="ultimas">Nas últimas mensagens</option><option value="conversa">Na conversa toda</option></select></label>
          {onde === 'ultimas' && <label className="pn-us-campo"><span>Quantas mensagens</span><input className="inp" type="number" min={1} max={50} value={n} onChange={(e) => setN(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} /></label>}
        </div>
        <label className="pn-us-campo"><span>Para onde o card vai</span>
          <select className="inp" value={coluna} onChange={(e) => { setColuna(e.target.value); setErro(''); }}>
            <option value="">Escolha a etapa</option>
            {destinos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <span className="cfgc-dica">Etapa de perda não entra: a perda pede o motivo, que só uma pessoa dá.</span>
        </label>
        <div className="pn-us-campo aut-teste"><span className="cfga-rot">Testar a regra</span>
          <input className="inp" value={teste} placeholder="Escreva uma mensagem de exemplo" aria-label="Mensagem de exemplo" onChange={(e) => setTeste(e.target.value)} />
          {res && <BadgeStatus tom={res.casou ? 'ok' : 'neutro'}>{res.casou ? `Casa (por “${res.palavra}”): o card iria para ${destinos.find((d) => d.id === coluna)?.nome ?? 'a etapa escolhida'}` : res.ignorada ? `Não casa: tem “${res.ignorada}”, que é ignorada` : 'Não casa'}</BadgeStatus>}
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}

/* ============================== histórico ============================== */
function Historico({ tipo }: { tipo: 'sequencias' | 'regras' }) {
  const [dias, setDias] = useState('30');
  const q = useHistoricoAutomacoes(Number(dias));
  const nav = useNavigate();
  const h = q.data;
  return (
    <CardVidro spot className="pn-card sobe">
      <div className="pn-card-cab cfgm-hist-cab">
        <div><h3>{tipo === 'sequencias' ? 'Histórico de envios' : 'O que as regras fizeram'}</h3><p>Nos últimos {dias} dias.</p></div>
        <Segmentado rotulo="Período" valor={dias} aoMudar={setDias} opcoes={[{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }]} />
      </div>
      {q.isLoading ? <p className="pn-vazio">Carregando…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível carregar o histórico" descricao={(q.error as Error).message} aoTentarDeNovo={() => void q.refetch()} />
        : tipo === 'sequencias' ? (
          !h || h.sequencias.length === 0 ? <p className="pn-vazio">Nenhuma sequência aplicada no período.</p> : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab">
                <thead><tr><th scope="col">Sequência</th><th scope="col">Aplicada</th><th scope="col">Enviadas</th><th scope="col">Ainda vão sair</th><th scope="col">Paradas</th><th scope="col">Falharam</th></tr></thead>
                <tbody>{h.sequencias.map((s) => <tr key={s.nome}><td>{s.nome}</td><td className="num">{s.aplicadas}×</td><td className="num">{s.enviadas}</td><td className="num">{s.agendadas}</td><td className="num">{s.paradas}</td><td className="num">{s.falharam}</td></tr>)}</tbody>
              </table>
            </div>
          )
        ) : (
          !h || h.regras.length === 0 ? <p className="pn-vazio">Nenhuma regra mexeu em card no período.</p> : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab">
                <thead><tr><th scope="col">Cliente</th><th scope="col">Regra</th><th scope="col">Palavra</th><th scope="col">De → para</th><th scope="col">Quando</th></tr></thead>
                <tbody>{h.regras.map((x, i) => (
                  <tr key={x.quando + i}>
                    <td>{x.conversaId ? <button type="button" className="cfgm-lnk" onClick={() => nav('/whatsapp?conversa=' + encodeURIComponent(x.conversaId!))}>{x.contato}</button> : x.contato}</td>
                    <td>{x.regra}</td><td>“{x.palavra}”</td><td>{x.de ?? '—'} → {x.para ?? '—'}</td><td className="num">{quando(x.quando)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        )}
    </CardVidro>
  );
}
