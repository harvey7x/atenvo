/* CONFIGURAÇÕES → ATENDIMENTO → RETOMADA AUTOMÁTICA (25/11). Copiado do sistema que a Reviza usava antes ("follow-ups"):
   mensagens que vão sozinhas quando o cliente para de responder; se ele responder, param.
   No alto, a chave geral (DESLIGADA de saída; para ligar, uma confirmação explica que as mensagens vão sozinhas para os
   clientes). Três abas: Sequências (uma por etapa do Kanban, até 12 mensagens, cada uma com a espera sem resposta, o texto
   com {nome}, {primeiro_nome} e {atendente} e a prévia), Horário e ritmo (dias, horas, intervalo entre duas mensagens do
   mesmo número e limite por dia) e Histórico (o que foi, para quem, de qual etapa, em qual mensagem e como terminou).
   Os textos que já vêm escritos são rascunhos marcados "Texto de exemplo — troque pelo seu": o servidor nunca envia
   texto de exemplo. Só administrador. Dados: @/data/retomada. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CONFIG_PADRAO, DIAS_SEMANA, ESPERA_MAX, ESPERA_MIN, INTERVALO_PADRAO_S, MAX_PASSOS, OPCOES_INTERVALO, ROTULO_EXEMPLO, TETO_MAX, TEXTO_MAX, VARIAVEIS,
  capacidadeDia, diasTexto, duracaoTexto, esperaCurta, hhmm, intervaloEfetivo, juntarEspera, minutosDe, passoNovo, previaTexto, separarEspera, temExemplo, validarConfig, validarPassos,
  useAtivarSequencia, useEtapasFunil, useExcluirSequencia, useHistoricoRetomada, useRetomadaConfig, useSalvarRetomadaConfig, useSalvarSequencia, useSequenciasRetomada,
  type ConfigRetomada, type EnvioRetomada, type EtapaFunil, type PassoRetomada, type SequenciaRetomada, type StatusEnvio, type UnidadeEspera,
} from '@/data/retomada';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, EstadoVazio, LinhaToggle, ModalV2, Segmentado, Toggle } from '../../components';
import '../painel/painel.css';
import './retomada.css';

type Aba = 'sequencias' | 'regras' | 'historico';
type Aviso = { texto: string; tom: 'ok' | 'erro' } | null;
const tz = { timeZone: 'America/Sao_Paulo' } as const;
function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  const hoje = new Date().toLocaleDateString('pt-BR', tz) === d.toLocaleDateString('pt-BR', tz);
  return hoje ? `hoje, ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
const ordinal = (i: number) => `${i + 1}ª`;
const listaE = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const resumoPassos = (ps: PassoRetomada[]) => `${ps.length} ${ps.length === 1 ? 'mensagem' : 'mensagens'}: ${listaE(ps.map((p) => esperaCurta(p.esperaMin)))} sem resposta`;
const ritmoTexto = (c: Pick<ConfigRetomada, 'intervaloS' | 'tetoDia'>) => `1 a cada ${duracaoTexto(intervaloEfetivo(c.intervaloS))} · até ${c.tetoDia} por dia`;
const horarioTexto = (c: Pick<ConfigRetomada, 'dias' | 'horaIni' | 'horaFim'>) => `${diasTexto(c.dias)} · ${c.horaIni} às ${c.horaFim}`;
const ehHojeSP = (iso: string) => { const d = new Date(iso); return !isNaN(d.getTime()) && d.toLocaleDateString('pt-BR', tz) === new Date().toLocaleDateString('pt-BR', tz); };

const ROT_STATUS: Record<StatusEnvio, string> = { enviado: 'Enviada', agendado: 'Enviando', cancelado: 'Cancelada', falhou: 'Não foi' };
const TOM_STATUS: Record<StatusEnvio, 'ok' | 'atencao' | 'erro' | 'neutro'> = { enviado: 'ok', agendado: 'neutro', cancelado: 'neutro', falhou: 'erro' };

export function ConfigRetomada() {
  const cfgQ = useRetomadaConfig();
  const seqQ = useSequenciasRetomada();
  const etQ = useEtapasFunil();
  const [aba, setAba] = useState<Aba>('sequencias');
  const histQ = useHistoricoRetomada(true);
  const salvarCfg = useSalvarRetomadaConfig();
  const ativarSeq = useAtivarSequencia();
  const excluirSeq = useExcluirSequencia();
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<SequenciaRetomada | 'nova' | null>(null);
  const [confirmaLigar, setConfirmaLigar] = useState(false);
  const [confirmaAtivar, setConfirmaAtivar] = useState<SequenciaRetomada | null>(null);
  const [excluir, setExcluir] = useState<SequenciaRetomada | null>(null);

  const cfg = cfgQ.data ?? CONFIG_PADRAO;
  const seqs = seqQ.data ?? [];
  const etapas = etQ.data ?? [];
  const etapaDe = (s: Pick<SequenciaRetomada, 'colunaId'>): EtapaFunil | null => etapas.find((e) => e.colunaId === s.colunaId) ?? null;
  const umFunil = new Set(etapas.map((e) => e.funilId)).size <= 1;
  const nomeEtapa = (s: Pick<SequenciaRetomada, 'colunaId'>) => { const e = etapaDe(s); return e ? (umFunil ? e.colunaNome : `${e.funilNome} › ${e.colunaNome}`) : 'Etapa removida do Kanban'; };
  const prontas = seqs.filter((s) => s.ativo && !temExemplo(s));
  const comExemplo = seqs.filter((s) => s.ativo && temExemplo(s));
  const hoje = (histQ.data ?? []).filter((h) => ehHojeSP(h.quando));
  const enviadasHoje = hoje.filter((h) => h.status === 'enviado').length;
  const avisar = (texto: string, tom: 'ok' | 'erro' = 'ok') => setAviso({ texto, tom });

  const mudarChave = async (ligar: boolean) => {
    if (ligar) { setConfirmaLigar(true); return; }
    try { await salvarCfg.mutateAsync({ ...cfg, ativo: false }); avisar('Retomada automática desligada. Nenhuma mensagem automática sai a partir de agora.'); }
    catch (e) { avisar((e as Error).message, 'erro'); }
  };
  const ligar = async () => {
    try { await salvarCfg.mutateAsync({ ...cfg, ativo: true }); avisar('Retomada automática ligada. Vale para as conversas que ficarem sem resposta a partir de agora.'); }
    catch (e) { avisar((e as Error).message, 'erro'); }
    setConfirmaLigar(false);
  };
  const alternarSeq = async (s: SequenciaRetomada, ativo: boolean, confirmado = false) => {
    if (ativo && cfg.ativo && !temExemplo(s) && !confirmado) { setConfirmaAtivar(s); return; }
    try {
      await ativarSeq.mutateAsync({ id: s.id, ativo });
      avisar(ativo ? `Sequência de ${nomeEtapa(s)} ativada.` : `Sequência de ${nomeEtapa(s)} pausada. Nenhuma mensagem dela sai até ativar de novo.`);
    } catch (e) { avisar((e as Error).message, 'erro'); }
    setConfirmaAtivar(null);
  };
  const fazerExcluir = async () => {
    if (!excluir) return;
    try { await excluirSeq.mutateAsync(excluir.id); avisar(`Sequência de ${nomeEtapa(excluir)} excluída.`); }
    catch (e) { avisar((e as Error).message, 'erro'); }
    setExcluir(null);
  };

  if (cfgQ.isLoading || seqQ.isLoading) return <div className="pn cfgi rtm"><p className="pn-vazio">Carregando a retomada automática…</p></div>;
  if (cfgQ.isError || seqQ.isError) return <div className="pn cfgi rtm"><EstadoErro titulo="Não foi possível carregar a retomada automática" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => { void cfgQ.refetch(); void seqQ.refetch(); }} /></div>;

  return (
    <div className="pn cfgi rtm" data-config-retomada>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe rtm-chave">
        <div className="rtm-chave-lin">
          <Toggle ligado={cfg.ativo} aoMudar={(v) => void mudarChave(v)} rotulo="Retomada automática" disabled={salvarCfg.isPending} />
          <div className="rtm-chave-tx">
            <b>{cfg.ativo ? 'Retomada automática ligada' : 'Retomada automática desligada'}</b>
            <span>{cfg.ativo
              ? `Ligada ${cfg.ligadoEm ? `desde ${quando(cfg.ligadoEm)}` : ''}. As sequências ativas mandam mensagens sozinhas para quem ficou sem responder desde então.`
              : 'Nenhuma mensagem automática sai. Monte as sequências com calma e ligue quando os textos estiverem prontos.'}</span>
          </div>
          <BadgeStatus tom={cfg.ativo ? 'ok' : 'neutro'}>{cfg.ativo ? 'Ligada' : 'Desligada'}</BadgeStatus>
        </div>
        <dl className="rtm-ficha">
          <div><dt>Sequências prontas</dt><dd className="num">{prontas.length} de {seqs.length}</dd></div>
          <div><dt>Enviadas hoje</dt><dd className="num">{enviadasHoje}</dd></div>
          <div><dt>Quando envia</dt><dd>{horarioTexto(cfg)}</dd></div>
          <div><dt>Ritmo por número</dt><dd>{ritmoTexto(cfg)}</dd></div>
        </dl>
      </CardVidro>

      <div className="cfgr-abas" role="tablist" aria-label="Retomada automática">
        {([['sequencias', 'Sequências'], ['regras', 'Horário e ritmo'], ['historico', 'Histórico']] as [Aba, string][]).map(([v, r]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} className={aba === v ? 'on' : undefined} onClick={() => setAba(v)}>{r}</button>
        ))}
      </div>

      {aba === 'sequencias' && (
        <>
          <CardVidro className="pn-card sobe">
            <div className="pn-card-cab">
              <div><h3>Sequências por etapa</h3><p>Uma sequência por etapa do Kanban. Cada mensagem espera um tempo sem resposta; se o cliente responder, a sequência para.</p></div>
              {seqs.length > 0 && <div className="cfgi-acoes"><BotaoPrimario onClick={() => setEditando('nova')}>＋ Nova sequência</BotaoPrimario></div>}
            </div>
            {seqs.length === 0
              ? <EstadoVazio titulo="Nenhuma sequência ainda" descricao="Escolha a etapa do Kanban e escreva as mensagens que vão quando o cliente para de responder." acao={{ rotulo: '＋ Nova sequência', onClick: () => setEditando('nova') }} />
              : (
                <ul className="rtm-seqs">
                  {seqs.map((s) => {
                    const ex = temExemplo(s); const e = etapaDe(s);
                    return (
                      <li key={s.id} className={s.ativo ? 'rtm-seq' : 'rtm-seq pausada'} data-seq={s.colunaId}>
                        <div className="rtm-seq-nm">
                          <b>{e?.colunaNome ?? 'Etapa removida do Kanban'}</b>
                          <small>{e ? (umFunil ? 'Kanban' : e.funilNome) : 'Edite e escolha outra etapa'}</small>
                        </div>
                        <ol className="rtm-seq-tempos" aria-label={resumoPassos(s.passos)}>
                          {s.passos.map((p, i) => <li key={i}><span>{ordinal(i)}</span>{esperaCurta(p.esperaMin)}</li>)}
                        </ol>
                        <div className="rtm-seq-st">
                          {!s.ativo ? <BadgeStatus tom="neutro">Pausada</BadgeStatus> : ex ? <BadgeStatus tom="atencao">Texto de exemplo</BadgeStatus> : <BadgeStatus tom="ok">Ativa</BadgeStatus>}
                        </div>
                        <div className="rtm-seq-acoes">
                          <BotaoSec mini onClick={() => setEditando(s)}>Editar</BotaoSec>
                          <BotaoSec mini disabled={ativarSeq.isPending} onClick={() => void alternarSeq(s, !s.ativo)}>{s.ativo ? 'Pausar' : 'Ativar'}</BotaoSec>
                          <button type="button" className="cfgi-link perigo" onClick={() => setExcluir(s)}>Excluir</button>
                        </div>
                        {ex && <p className="rtm-seq-nota">Ainda com texto de exemplo: esta sequência não envia nada até você trocar os textos.</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </CardVidro>
          <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
            <div className="pn-card-cab"><div><h3>Como a retomada decide</h3></div></div>
            <ul className="cfgi-lista">
              <li>O tempo de cada mensagem conta da <b>última mensagem nossa</b> na conversa: a do atendente ou a anterior da sequência.</li>
              <li>Se o cliente responder, a sequência para. Quando ele ficar sem resposta de novo, ela recomeça da 1ª mensagem.</li>
              <li>Só recebe quem já falou com a gente e está com a conversa aberta. Ficam de fora quem pediu para sair, conversa arquivada ou fechada, e quando a IA está atendendo.</li>
              <li>Ao ligar, vale para as conversas que ficarem sem resposta dali em diante. Quem já estava parado antes não recebe nada.</li>
              <li>Texto de exemplo nunca é enviado. No WhatsApp oficial, só dentro das 24 horas da última mensagem do cliente.</li>
            </ul>
          </CardVidro>
        </>
      )}

      {aba === 'regras' && <AbaRegras cfg={cfg} aoAvisar={avisar} />}
      {aba === 'historico' && <AbaHistorico q={histQ} />}

      {editando && (
        <EditorSequencia seq={editando === 'nova' ? null : editando} etapas={etapas} carregandoEtapas={etQ.isLoading} ocupadas={seqs.filter((s) => editando === 'nova' || s.id !== editando.id).map((s) => s.colunaId)}
          chaveLigada={cfg.ativo} aoFechar={() => setEditando(null)} aoSalvar={(t) => { avisar(t); setEditando(null); }} />
      )}

      <ConfirmDialogV2 aberto={confirmaLigar} titulo="Ligar a retomada automática?" rotuloConfirmar="Ligar e começar a enviar" carregando={salvarCfg.isPending}
        aoConfirmar={() => void ligar()} aoCancelar={() => setConfirmaLigar(false)}
        mensagem={(
          <div className="rtm-conf">
            <p>Com a retomada ligada, o sistema <b>manda mensagens sozinho para os clientes</b> pelo WhatsApp do Atendimento, sem ninguém clicar em enviar.</p>
            <ul>
              <li>Vale para as conversas que ficarem sem resposta <b>a partir de agora</b>. Quem já estava parado antes não recebe nada.</li>
              <li>Só em {horarioTexto(cfg)}, no máximo {ritmoTexto(cfg)} em cada número.</li>
              <li>Se o cliente responder, a sequência para na hora.</li>
            </ul>
            {prontas.length > 0
              ? <p>Vão enviar: <b>{listaE(prontas.map(nomeEtapa))}</b>.</p>
              : <p>Nenhuma sequência está pronta para enviar ainda: crie ou ative uma, com os seus textos.</p>}
            {comExemplo.length > 0 && <p className="rtm-alerta">Ainda com texto de exemplo, não enviam até você trocar: {listaE(comExemplo.map(nomeEtapa))}.</p>}
          </div>
        )} />
      <ConfirmDialogV2 aberto={!!confirmaAtivar} titulo="Ativar esta sequência?" rotuloConfirmar="Ativar" carregando={ativarSeq.isPending}
        aoConfirmar={() => { if (confirmaAtivar) void alternarSeq(confirmaAtivar, true, true); }} aoCancelar={() => setConfirmaAtivar(null)}
        mensagem={confirmaAtivar ? <>A retomada automática está ligada: a sequência de <b>{nomeEtapa(confirmaAtivar)}</b> começa a mandar mensagens para as conversas desta etapa que ficarem sem resposta a partir de agora.</> : null} />
      <ConfirmDialogV2 aberto={!!excluir} titulo="Excluir esta sequência?" rotuloConfirmar="Excluir sequência" destrutivo carregando={excluirSeq.isPending}
        aoConfirmar={() => void fazerExcluir()} aoCancelar={() => setExcluir(null)}
        mensagem={excluir ? <>As mensagens de <b>{nomeEtapa(excluir)}</b> param de sair. O histórico do que já foi enviado continua.</> : null} />
    </div>
  );
}

/* ---------------- Horário e ritmo ---------------- */
const HORAS = Array.from({ length: 49 }, (_, i) => hhmm(i * 30));
function AbaRegras({ cfg, aoAvisar }: { cfg: ConfigRetomada; aoAvisar: (t: string, tom?: 'ok' | 'erro') => void }) {
  const salvar = useSalvarRetomadaConfig();
  const [f, setF] = useState(cfg);
  const [erro, setErro] = useState('');
  const sujo = f.dias.join() !== cfg.dias.join() || f.horaIni !== cfg.horaIni || f.horaFim !== cfg.horaFim || f.intervaloS !== cfg.intervaloS || f.tetoDia !== cfg.tetoDia;
  useEffect(() => { if (!sujo) setF(cfg); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const muda = (p: Partial<ConfigRetomada>) => { setF((x) => ({ ...x, ...p })); setErro(''); };
  const horas = (atual: string) => (HORAS.includes(atual) ? HORAS : [...HORAS, atual].sort((a, b) => minutosDe(a) - minutosDe(b)));
  const intervalos = OPCOES_INTERVALO.includes(f.intervaloS) ? OPCOES_INTERVALO : [...OPCOES_INTERVALO, f.intervaloS].sort((a, b) => a - b);
  const cabe = capacidadeDia(f);
  const gravar = async () => {
    const e = validarConfig(f); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ ...cfg, dias: f.dias, horaIni: f.horaIni, horaFim: f.horaFim, intervaloS: f.intervaloS, tetoDia: f.tetoDia }); aoAvisar('Horário e ritmo salvos.'); }
    catch (x) { setErro((x as Error).message); }
  };
  return (
    <>
      <CardVidro className="pn-card sobe rtm-regras">
        <div className="pn-card-cab"><div><h3>Quando pode enviar</h3><p>Fora destes dias e horas nada sai: o que vencer fica para o próximo horário permitido. Horário de Brasília.</p></div></div>
        <div className="pn-us-form">
          <div className="pn-us-campo">
            <span className="pn-us-rot" id="rtm-dias-rot">Dias</span>
            <div className="rtm-dias" role="group" aria-labelledby="rtm-dias-rot">
              {DIAS_SEMANA.map((d) => {
                const on = f.dias.includes(d.dia);
                return <button key={d.dia} type="button" aria-pressed={on} aria-label={d.longo} className={on ? 'on' : undefined}
                  onClick={() => muda({ dias: on ? f.dias.filter((x) => x !== d.dia) : [...f.dias, d.dia].sort((a, b) => a - b) })}>{d.curto}</button>;
              })}
            </div>
          </div>
          <div className="pn-us-campo">
            <span className="pn-us-rot">Horário</span>
            <div className="rtm-horario">
              <label className="rtm-sr" htmlFor="rtm-ini">Começa às</label>
              <span>Das</span>
              <select id="rtm-ini" className="inp" value={f.horaIni} onChange={(e) => muda({ horaIni: e.target.value })}>{horas(f.horaIni).filter((h) => h !== '24:00').map((h) => <option key={h} value={h}>{h}</option>)}</select>
              <span>às</span>
              <label className="rtm-sr" htmlFor="rtm-fim">Termina às</label>
              <select id="rtm-fim" className="inp" value={f.horaFim} onChange={(e) => muda({ horaFim: e.target.value })}>{horas(f.horaFim).filter((h) => h !== '00:00').map((h) => <option key={h} value={h}>{h === '24:00' ? '24:00 (meia-noite)' : h}</option>)}</select>
            </div>
          </div>
        </div>
      </CardVidro>
      <CardVidro className="pn-card sobe rtm-regras" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>Ritmo de cada número</h3><p>Para o WhatsApp não tratar como envio em massa: as mensagens automáticas de um mesmo número saem espaçadas e com limite por dia.</p></div></div>
        <div className="pn-us-form rtm-ritmo">
          <div className="pn-us-campo">
            <label htmlFor="rtm-int">Intervalo mínimo entre duas mensagens do mesmo número</label>
            <select id="rtm-int" className="inp" value={f.intervaloS} onChange={(e) => muda({ intervaloS: Number(e.target.value) })}>
              {intervalos.map((s) => <option key={s} value={s}>{duracaoTexto(s)}{s === INTERVALO_PADRAO_S ? ' (padrão)' : ''}</option>)}
            </select>
            <span className="pn-us-dica">Nunca menos de 45 segundos. O sistema confere uma vez por minuto, então {duracaoTexto(f.intervaloS)} vira, na prática, uma a cada {duracaoTexto(intervaloEfetivo(f.intervaloS))}.</span>
          </div>
          <div className="pn-us-campo">
            <label htmlFor="rtm-teto">Limite por número, por dia</label>
            <input id="rtm-teto" className="inp" type="number" inputMode="numeric" min={1} max={TETO_MAX} value={Number.isFinite(f.tetoDia) ? f.tetoDia : ''}
              onChange={(e) => muda({ tetoDia: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) })} />
            <span className="pn-us-dica">Conta só as mensagens da retomada automática, de 1 a {TETO_MAX}.</span>
          </div>
        </div>
        <p className="cfgi-nota" role="note">
          Na prática: cada número manda no máximo uma retomada a cada {duracaoTexto(intervaloEfetivo(f.intervaloS))} e até {Number.isFinite(f.tetoDia) ? Math.min(f.tetoDia, cabe) : cabe} por dia em {horarioTexto(f)}.
          {Number.isFinite(f.tetoDia) && cabe < f.tetoDia ? ` Nesse horário cabem ${cabe}, então o limite de ${f.tetoDia} não chega a ser usado.` : ''}
        </p>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </CardVidro>
      {sujo && (
        <div className="cfgi-salvar" role="region" aria-label="Salvar horário e ritmo">
          <span>Há mudanças no horário e no ritmo que ainda não foram salvas.</span>
          <BotaoSec disabled={salvar.isPending} onClick={() => { setF(cfg); setErro(''); }}>Descartar</BotaoSec>
          <BotaoPrimario disabled={salvar.isPending} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</BotaoPrimario>
        </div>
      )}
    </>
  );
}

/* ---------------- Histórico ---------------- */
type Filtro = 'todas' | 'enviadas' | 'nao';
function AbaHistorico({ q }: { q: ReturnType<typeof useHistoricoRetomada> }) {
  const ir = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const todas = q.data ?? [];
  const linhas = todas.filter((h) => filtro === 'todas' || (filtro === 'enviadas' ? h.status === 'enviado' : h.status === 'falhou' || h.status === 'cancelado'));
  return (
    <CardVidro className="pn-card sobe">
      <div className="pn-card-cab">
        <div><h3>Histórico</h3><p>O que a retomada mandou, do mais novo para o mais antigo.</p></div>
        <Segmentado<Filtro> rotulo="Filtrar o histórico" valor={filtro} aoMudar={setFiltro}
          opcoes={[{ valor: 'todas', rotulo: 'Todas' }, { valor: 'enviadas', rotulo: 'Enviadas' }, { valor: 'nao', rotulo: 'Não foram' }]} />
      </div>
      {q.isLoading ? <p className="pn-vazio">Carregando…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível carregar o histórico" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
        : linhas.length === 0 ? <p className="pn-vazio">{todas.length ? 'Nada com este filtro.' : 'Nada enviado ainda. Quando a retomada mandar a primeira mensagem, ela aparece aqui.'}</p>
        : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab rtm-tab">
              <thead><tr><th scope="col">Cliente</th><th scope="col">Etapa</th><th scope="col">Mensagem</th><th scope="col">Quando</th><th scope="col">Situação</th><th scope="col"><span className="pn-vh">Ações</span></th></tr></thead>
              <tbody>
                {linhas.map((h: EnvioRetomada) => (
                  <tr key={h.id}>
                    <td><span className="pn-eq-nm"><span>{h.cliente}</span></span></td>
                    <td><span className="rtm-tx">{h.etapa}</span></td>
                    <td><span className="num">{ordinal(h.passo - 1)}{h.totalPassos ? ` de ${h.totalPassos}` : ''}</span></td>
                    <td><span className="num">{quando(h.quando)}</span></td>
                    <td><BadgeStatus tom={TOM_STATUS[h.status]}>{ROT_STATUS[h.status]}</BadgeStatus>{h.motivo && <small className="rtm-motivo">{h.motivo}</small>}</td>
                    <td className="pn-fin-acoes">{h.conversaId && <BotaoSec mini onClick={() => ir(`/whatsapp?conversa=${h.conversaId}`)}>Abrir conversa</BotaoSec>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </CardVidro>
  );
}

/* ---------------- a janela da sequência ---------------- */
function EditorSequencia({ seq, etapas, carregandoEtapas, ocupadas, chaveLigada, aoFechar, aoSalvar }: {
  seq: SequenciaRetomada | null; etapas: EtapaFunil[]; carregandoEtapas: boolean; ocupadas: string[]; chaveLigada: boolean;
  aoFechar: () => void; aoSalvar: (texto: string) => void;
}) {
  const salvar = useSalvarSequencia();
  const funis = useMemo(() => [...new Map(etapas.map((e) => [e.funilId, e.funilNome])).entries()].map(([id, nome]) => ({ id, nome })), [etapas]);
  const livres = (funilId: string) => etapas.filter((e) => e.funilId === funilId && !ocupadas.includes(e.colunaId));
  const inicial = seq ? etapas.find((e) => e.colunaId === seq.colunaId) : etapas.find((e) => !ocupadas.includes(e.colunaId));
  const [funilId, setFunilId] = useState(inicial?.funilId ?? funis[0]?.id ?? '');
  const [colunaId, setColunaId] = useState(inicial?.colunaId ?? ''); // etapa que saiu do Kanban: escolher outra
  const [ativo, setAtivo] = useState(seq?.ativo ?? true);
  const [passos, setPassos] = useState<PassoRetomada[]>(seq ? seq.passos.map((p) => ({ ...p })) : [passoNovo(0)]);
  const [erro, setErro] = useState('');
  const textos = useRef<(HTMLTextAreaElement | null)[]>([]);
  useEffect(() => { // etapas que chegaram depois de abrir a janela
    if (!funilId && funis[0]) setFunilId(funis[0].id);
    if (!colunaId && inicial) { setFunilId(inicial.funilId); setColunaId(inicial.colunaId); }
  }, [etapas]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoesEtapa = livres(funilId); // a da própria sequência entra (ocupadas não a inclui)
  const etapaAtual = etapas.find((e) => e.colunaId === colunaId);
  const mudaPasso = (i: number, p: Partial<PassoRetomada>) => { setPassos((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x))); setErro(''); };
  const inserir = (i: number, v: string) => {
    const el = textos.current[i]; const tx = passos[i].texto;
    const ini = el?.selectionStart ?? tx.length; const fim = el?.selectionEnd ?? tx.length;
    const novo = (tx.slice(0, ini) + v + tx.slice(fim)).slice(0, TEXTO_MAX);
    mudaPasso(i, { texto: novo, exemplo: false });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(ini + v.length, ini + v.length); } });
  };
  const gravar = async () => {
    if (!colunaId || !etapaAtual) { setErro('Escolha a etapa do Kanban.'); return; }
    const e = validarPassos(passos); if (e) { setErro(e); return; }
    try {
      await salvar.mutateAsync({ id: seq?.id ?? null, funilId: etapaAtual.funilId, colunaId, ativo, passos });
      const ex = passos.some((p) => p.exemplo);
      aoSalvar(`Sequência de ${etapaAtual.colunaNome} salva.${ex ? ' Ela ainda tem texto de exemplo: não envia até você trocar.' : ''}`);
    } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!salvar.isPending) aoFechar(); }} fecharNoVeu={false} largura={700}
      titulo={<div>{seq ? 'Editar sequência' : 'Nova sequência'}<div className="mod-sub">A etapa do Kanban e as mensagens que vão quando o cliente para de responder</div></div>}
      rodape={<><BotaoSec disabled={salvar.isPending} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={salvar.isPending || !colunaId} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar sequência'}</BotaoPrimario></>}>
      <div className="pn-us-form rtm-editor" data-editor-retomada>
        <div className={funis.length > 1 ? 'rtm-duas' : undefined}>
          {funis.length > 1 && (
            <div className="pn-us-campo">
              <label htmlFor="rtm-funil">Funil</label>
              <select id="rtm-funil" className="inp" value={funilId} onChange={(e) => { const f = e.target.value; setFunilId(f); setColunaId(livres(f)[0]?.colunaId ?? ''); setErro(''); }}>
                {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
          <div className="pn-us-campo">
            <label htmlFor="rtm-etapa">Etapa do Kanban</label>
            {carregandoEtapas ? <span className="pn-us-dica">Carregando as etapas…</span>
              : opcoesEtapa.length === 0 ? <span className="pn-us-dica">Todas as etapas deste funil já têm sequência. Edite a que já existe.</span>
              : (
                <select id="rtm-etapa" className="inp" value={colunaId} onChange={(e) => { setColunaId(e.target.value); setErro(''); }}>
                  {!colunaId && <option value="">Escolha a etapa</option>}
                  {opcoesEtapa.map((e) => <option key={e.colunaId} value={e.colunaId}>{e.colunaNome}</option>)}
                </select>
              )}
            <span className="pn-us-dica">Vale para os clientes que estão nesta etapa. Etapas que encerram o lead, como Fechado e Perdido, não aparecem.</span>
          </div>
        </div>
        <LinhaToggle ligado={ativo} aoMudar={setAtivo} titulo="Sequência ativa"
          descricao={ativo ? 'Envia quando a retomada automática estiver ligada.' : 'Pausada: fica guardada e não envia nada.'} />

        <ol className="rtm-passos">
          {passos.map((p, i) => {
            const esp = separarEspera(p.esperaMin);
            return (
              <li key={i} className="rtm-passo" data-passo={i + 1}>
                <div className="rtm-passo-cab">
                  <b>{ordinal(i)} mensagem</b>
                  {p.exemplo && <span className="rtm-exemplo">{ROTULO_EXEMPLO}</span>}
                  <span className="cfgi-esp" />
                  {passos.length > 1 && <button type="button" className="cfgi-link perigo" onClick={() => { setPassos((xs) => xs.filter((_, j) => j !== i)); setErro(''); }}>Remover</button>}
                </div>
                <div className="rtm-espera">
                  <label htmlFor={`rtm-esp-${i}`}>Enviar depois de</label>
                  <input id={`rtm-esp-${i}`} className="inp" type="number" inputMode="numeric" min={1} max={esp.unidade === 'dias' ? ESPERA_MAX / 1440 : ESPERA_MAX / 60} value={esp.valor}
                    onChange={(e) => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); mudaPasso(i, { esperaMin: Math.min(ESPERA_MAX, Math.max(ESPERA_MIN, juntarEspera(v, esp.unidade))) }); }} />
                  <select className="inp" aria-label={`Unidade da espera da ${ordinal(i)} mensagem`} value={esp.unidade}
                    onChange={(e) => mudaPasso(i, { esperaMin: Math.min(ESPERA_MAX, Math.max(ESPERA_MIN, juntarEspera(esp.valor, e.target.value as UnidadeEspera))) })}>
                    <option value="horas">{esp.valor === 1 ? 'hora' : 'horas'}</option>
                    <option value="dias">{esp.valor === 1 ? 'dia' : 'dias'}</option>
                  </select>
                  <span>sem resposta</span>
                </div>
                <span className="pn-us-dica">{i === 0 ? 'Conta da última mensagem nossa na conversa.' : `Conta da ${ordinal(i - 1)} mensagem, se o cliente não respondeu.`}</span>
                <textarea ref={(el) => { textos.current[i] = el; }} className="inp cfgo-texto" aria-label={`Texto da ${ordinal(i)} mensagem`} value={p.texto} maxLength={TEXTO_MAX}
                  onChange={(e) => mudaPasso(i, { texto: e.target.value, exemplo: false })} />
                <div className="rtm-vars">
                  <div className="cfgo-vars"><small>Inserir:</small>{VARIAVEIS.map((v) => <button key={v.chave} type="button" title={`${v.rotulo} (ex.: ${v.exemplo})`} onClick={() => inserir(i, v.chave)}>{v.chave}</button>)}</div>
                  <small className="num">{p.texto.length}/{TEXTO_MAX}</small>
                </div>
                <div className="rtm-previa">
                  <small>Como o cliente vê</small>
                  <div className="rtm-bolha">{previaTexto(p.texto) || <i>Mensagem vazia</i>}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="cfgi-acoes">
          <BotaoSec disabled={passos.length >= MAX_PASSOS} onClick={() => { setPassos((xs) => [...xs, passoNovo(xs.length)]); setErro(''); }}>＋ Adicionar mensagem</BotaoSec>
          <span className="pn-us-dica">{passos.length} de {MAX_PASSOS} mensagens</span>
        </div>
        <span className="pn-us-dica">Variáveis: {'{primeiro_nome}'} e {'{nome}'} são o nome do cliente; {'{atendente}'} é o primeiro nome do atendente da conversa (sem atendente, vira "nossa equipe").</span>
        {chaveLigada && ativo && <p className="cfgi-nota" role="note">A retomada automática está ligada: ao salvar, esta sequência passa a valer para as conversas que ficarem sem resposta a partir de agora.</p>}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}

