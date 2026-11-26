/* ATENDIMENTO › AUTOMAÇÕES › FORMULÁRIOS (26/11, "igual" aos Formulários do sistema que a Reviza usava antes). A lista dos
   formulários (link para copiar, respostas de 7 e 30 dias, ligar/desligar), o editor (perguntas, o card que nasce, o
   agendamento e a mensagem final) e as últimas respostas. Só o administrador. Dados: @/data/formularios (migration 123). */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Segmentado, Toggle } from '../../components';
import {
  CAMPOS_FIXOS, DIAS_SEMANA, MENSAGEM_FINAL_PADRAO, TIPOS_CAMPO, linkDoFormulario, slugDe, useApagarFormulario, useFormularios,
  useResumoFormularios, useSalvarFormulario, validarFormulario, type CampoForm, type Formulario, type FormularioNovo, type TipoCampo,
} from '@/data/formularios';
import { usePessoasEEtapas } from '@/data/avisosEquipe';
import { useEtiquetas } from '@/data/atendimento';
import { CartaoMetricaFixo, GradeMetricas } from '../../components/CartaoMetrica';
import './formularios.css';

const tz = { timeZone: 'America/Sao_Paulo' } as const;
const quando = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); };
const VAZIO: FormularioNovo = {
  nome: '', slug: '', titulo: '', descricao: '', campos: [...CAMPOS_FIXOS], colunaId: null, etiquetas: [], responsavelId: null,
  agenda: { ligado: false, duracao_min: 30, dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00', antecedencia_h: 2, ate_dias: 14, tipo: 'reuniao' },
  mensagemFinal: MENSAGEM_FINAL_PADRAO, ativo: true,
};

export function Formularios() {
  const q = useFormularios();
  const resumo = useResumoFormularios();
  const salvar = useSalvarFormulario();
  const { data: pe } = usePessoasEEtapas();
  const [aba, setAba] = useState<'lista' | 'respostas'>('lista');
  const [janela, setJanela] = useState<{ f: Formulario | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const forms = q.data ?? [];
  const soma = (k: 'd7' | 'd30' | 'reunioes') => Object.values(resumo.data?.porFormulario ?? {}).reduce((s, x) => s + (x[k] || 0), 0);
  const ligados = forms.filter((f) => f.ativo).length;
  const nomeEtapa = (id: string | null) => (id ? pe?.etapas.find((e) => e.id === id)?.nome : null) ?? 'a etapa de entrada';
  const copiar = async (f: Formulario) => {
    try { await navigator.clipboard.writeText(linkDoFormulario(f.slug)); setAviso({ tom: 'ok', texto: `Link de "${f.nome}" copiado. Cole no anúncio, no Instagram ou onde quiser.` }); }
    catch { setAviso({ tom: 'erro', texto: 'Não deu para copiar. O link é: ' + linkDoFormulario(f.slug) }); }
  };
  return (
    <>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      {forms.length > 0 && (
        <GradeMetricas rotulo="Os formulários em números">
          <CartaoMetricaFixo icone="lista" titulo="Formulários" valor={forms.length} detalhe={<span>{ligados} {ligados === 1 ? 'recebendo respostas' : 'recebendo respostas'}</span>} rodape={<span>{forms.length - ligados ? `${forms.length - ligados} fechado${forms.length - ligados === 1 ? '' : 's'}` : 'Todos abertos'}</span>} />
          <CartaoMetricaFixo icone="entra" titulo="Respostas" valor={soma('d7')} detalhe={<span>nos últimos 7 dias</span>} rodape={<span>{soma('d30')} em 30 dias</span>} />
          <CartaoMetricaFixo icone="calendario" titulo="Reuniões marcadas" valor={soma('reunioes')} detalhe={<span>pelo próprio cliente, em 30 dias</span>} rodape={<span>Caem na Agenda</span>} />
          <CartaoMetricaFixo icone="pessoas" titulo="Com agendamento" valor={forms.filter((f) => f.agenda.ligado).length} detalhe={<span>{forms.filter((f) => f.agenda.ligado).length === 1 ? 'formulário em que o cliente escolhe o horário' : 'formulários em que o cliente escolhe o horário'}</span>} rodape={<span>Os outros só pedem os dados</span>} />
        </GradeMetricas>
      )}
      <div className="aut-barra">
        <Segmentado rotulo="Formulários" valor={aba} aoMudar={(v) => setAba(v as 'lista' | 'respostas')} opcoes={[{ valor: 'lista', rotulo: `Formulários (${forms.length})` }, { valor: 'respostas', rotulo: 'Respostas' }]} />
        {aba === 'lista' && <BotaoPrimario onClick={() => setJanela({ f: null })}>＋ Novo formulário</BotaoPrimario>}
      </div>
      {aba === 'respostas' ? <Respostas /> : (
        q.isLoading ? <p className="pn-vazio">Carregando os formulários…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar os formulários" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : forms.length === 0 ? <CardVidro className="pn-card"><EstadoVazio titulo="Nenhum formulário" descricao="Crie um formulário e mande o link: quem preencher vira cliente e card no Kanban, e pode até marcar um horário." acao={{ rotulo: '＋ Novo formulário', onClick: () => setJanela({ f: null }) }} /></CardVidro>
          : (
            <CardVidro spot className="pn-card sobe">
              <div className="pn-card-cab"><div><h3>Formulários</h3><p>Quem preenche vira cliente e card no Kanban. Nada é enviado para o cliente pelo WhatsApp.</p></div></div>
              <ul className="aut-seqs">
                {forms.map((f) => {
                  const r = resumo.data?.porFormulario[f.id];
                  return (
                    <li key={f.id} className={f.ativo ? undefined : 'desl'}>
                      <div className="aut-seq-tx">
                        <b>{f.nome}</b>
                        <span className="frm-link">{linkDoFormulario(f.slug).replace(/^https?:\/\//, '')}</span>
                        <small>O card nasce em <b>{nomeEtapa(f.colunaId)}</b>{f.etiquetas.length ? ` · ${f.etiquetas.join(', ')}` : ''}{f.agenda.ligado ? ' · com agendamento' : ''} · {r ? `${r.d7} ${r.d7 === 1 ? 'resposta' : 'respostas'} em 7 dias, ${r.d30} em 30` : 'nenhuma resposta ainda'}</small>
                      </div>
                      <span className="aut-seq-ac">
                        <Toggle ligado={f.ativo} rotulo={`Formulário ${f.nome} recebendo respostas`} disabled={salvar.isPending}
                          aoMudar={(v) => void salvar.mutateAsync({ ...f, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `"${f.nome}" voltou a receber respostas.` : `"${f.nome}" parou de receber respostas: o link mostra que está fechado.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} />
                        <BotaoSec mini onClick={() => void copiar(f)}>Copiar link</BotaoSec>
                        <BotaoSec mini onClick={() => window.open(linkDoFormulario(f.slug), '_blank', 'noopener')}>Abrir</BotaoSec>
                        <BotaoSec mini onClick={() => setJanela({ f })}>Editar</BotaoSec>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardVidro>
          )
      )}
      {janela && <JanelaFormulario key={janela.f?.id ?? 'novo'} f={janela.f} todos={forms} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </>
  );
}

function Respostas() {
  const q = useResumoFormularios();
  const nav = useNavigate();
  const r = q.data?.recentes ?? [];
  return (
    <CardVidro className="pn-card sobe">
      <div className="pn-card-cab"><div><h3>Últimas respostas</h3><p>As 50 mais recentes de todos os formulários.</p></div></div>
      {q.isLoading ? <p className="pn-vazio">Carregando…</p> : r.length === 0 ? <p className="pn-vazio">Nenhuma resposta ainda.</p> : (
        <div className="pn-mapa-rolo">
          <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgm-tab frm-tab">
            <thead><tr><th scope="col">Cliente</th><th scope="col">Formulário</th><th scope="col">Quando</th><th scope="col">Horário marcado</th><th scope="col">Card</th></tr></thead>
            <tbody>
              {r.map((x, i) => (
                <tr key={x.quando + i}>
                  <td>{x.cliente || '—'}{x.repetido && <small className="frm-rep">já era cliente</small>}</td>
                  <td>{x.formulario}</td>
                  <td className="num">{quando(x.quando)}</td>
                  <td className="num">{x.reuniao ? quando(x.reuniao) : '—'}</td>
                  <td>{x.oportunidadeId ? <button type="button" className="cfgm-lnk" onClick={() => nav('/kanban')}>Ver no Kanban</button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardVidro>
  );
}

function JanelaFormulario({ f, todos, aoFechar, aoAvisar }: { f: Formulario | null; todos: Formulario[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarFormulario();
  const apagar = useApagarFormulario();
  const { data: pe } = usePessoasEEtapas();
  const etiquetasCat = useEtiquetas().data ?? [];
  const [v, setV] = useState<FormularioNovo>(() => (f ? structuredClone(f) : structuredClone(VAZIO)));
  const [slugMexido, setSlugMexido] = useState(!!f);
  const [erro, setErro] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const ocupado = salvar.isPending || apagar.isPending;
  const set = (p: Partial<FormularioNovo>) => { setV((x) => ({ ...x, ...p })); setErro(''); };
  const setAgenda = (p: Partial<FormularioNovo['agenda']>) => set({ agenda: { ...v.agenda, ...p } });
  const extras = v.campos.filter((c) => c.chave !== 'nome' && c.chave !== 'telefone' && c.chave !== 'email');
  const temEmail = v.campos.some((c) => c.chave === 'email');
  const montar = (lista: CampoForm[], email: boolean): CampoForm[] => [...CAMPOS_FIXOS.map((c) => v.campos.find((x) => x.chave === c.chave) ?? c),
    ...(email ? [v.campos.find((c) => c.chave === 'email') ?? { chave: 'email', rotulo: 'Seu e-mail', tipo: 'email' as const, obrigatorio: false }] : []), ...lista];
  const setExtras = (lista: CampoForm[]) => set({ campos: montar(lista, temEmail) });
  const novaChave = () => { let n = extras.length + 1; while (v.campos.some((c) => c.chave === `c_${n}`)) n += 1; return `c_${n}`; };
  const mover = (i: number, d: -1 | 1) => { const l = extras.slice(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setExtras(l); };
  const pessoas = pe?.pessoas ?? []; const etapas = useMemo(() => (pe?.etapas ?? []).filter((e) => e.resultado !== 'ganho' && e.resultado !== 'perdido'), [pe]);

  const gravarForm = async () => {
    const e = validarFormulario(v, todos); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync(v); aoAvisar(f ? `"${v.nome.trim()}" salvo.` : `"${v.nome.trim()}" criado. Copie o link na lista.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  const remover = async () => {
    if (!f) return;
    try { await apagar.mutateAsync(f.id); aoAvisar(`"${f.nome}" apagado. Os clientes e cards que ele criou continuam.`); aoFechar(); } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={720}
      titulo={<div>{f ? 'Editar formulário' : 'Novo formulário'}<div className="mod-sub">Quem preencher vira cliente e card no Kanban</div></div>}
      rodape={<>
        {f && (confirmarApagar
          ? <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{apagar.isPending ? 'Apagando…' : 'Confirmar: apagar'}</button>
          : <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => setConfirmarApagar(true)}>Apagar</button>)}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravarForm()}>{salvar.isPending ? 'Salvando…' : f ? 'Salvar' : 'Criar formulário'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form frm-editor" data-formulario-editor>
        <div className="frm-duas">
          <label className="pn-us-campo"><span>Nome (só a equipe vê)</span>
            <input id="frm-nome" className="inp" value={v.nome} maxLength={80} autoFocus placeholder="ex.: Revisão do empréstimo"
              onChange={(e) => set({ nome: e.target.value, ...(slugMexido ? {} : { slug: slugDe(e.target.value) }) })} />
          </label>
          <label className="pn-us-campo"><span>Endereço do link</span>
            <span className="frm-slug"><small>…/f/</small><input id="frm-slug" className="inp" value={v.slug} maxLength={41} placeholder="revisao-emprestimo"
              onChange={(e) => { setSlugMexido(true); set({ slug: slugDe(e.target.value) || e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }} /></span>
          </label>
        </div>
        <label className="pn-us-campo"><span>Título (o cliente vê)</span>
          <input className="inp" value={v.titulo} maxLength={120} placeholder="ex.: Descubra se você pagou juros a mais" onChange={(e) => set({ titulo: e.target.value })} />
        </label>
        <label className="pn-us-campo"><span>Texto de apresentação</span>
          <textarea className="inp" rows={2} value={v.descricao} maxLength={600} placeholder="Uma ou duas frases sobre o que acontece depois de preencher." onChange={(e) => set({ descricao: e.target.value })} />
        </label>

        <fieldset className="frm-bloco">
          <legend>Perguntas</legend>
          <ul className="frm-pergs">
            <li className="fixa"><span>Seu nome</span><small>Sempre, obrigatória</small></li>
            <li className="fixa"><span>Seu WhatsApp</span><small>Sempre, obrigatória</small></li>
            <li className="fixa"><label className="frm-chk"><input type="checkbox" checked={temEmail} onChange={(e) => set({ campos: montar(extras, e.target.checked) })} />Pedir o e-mail (opcional para o cliente)</label></li>
            {extras.map((c, i) => (
              <li key={c.chave} className="frm-perg">
                <input className="inp" aria-label="Pergunta" value={c.rotulo} maxLength={120} placeholder="ex.: Em qual banco é o empréstimo?"
                  onChange={(e) => setExtras(extras.map((x) => (x.chave === c.chave ? { ...x, rotulo: e.target.value } : x)))} />
                <select className="inp" aria-label="Tipo de resposta" value={c.tipo} onChange={(e) => setExtras(extras.map((x) => (x.chave === c.chave ? { ...x, tipo: e.target.value as TipoCampo, opcoes: e.target.value === 'opcoes' ? (x.opcoes ?? ['', '']) : undefined } : x)))}>
                  {TIPOS_CAMPO.filter((t) => t.valor !== 'email').map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </select>
                <label className="frm-chk"><input type="checkbox" checked={c.obrigatorio} onChange={(e) => setExtras(extras.map((x) => (x.chave === c.chave ? { ...x, obrigatorio: e.target.checked } : x)))} />Obrigatória</label>
                <span className="frm-perg-ac">
                  <button type="button" className="cfgc-seta" aria-label="Subir a pergunta" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" className="cfgc-seta" aria-label="Descer a pergunta" disabled={i === extras.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" className="cfgc-seta" aria-label="Tirar a pergunta" onClick={() => setExtras(extras.filter((x) => x.chave !== c.chave))}>×</button>
                </span>
                {c.tipo === 'opcoes' && (
                  <textarea className="inp frm-opcoes" rows={3} aria-label="Opções, uma por linha" placeholder={'Uma opção por linha\nBMG\nFacta'} value={(c.opcoes ?? []).join('\n')}
                    onChange={(e) => setExtras(extras.map((x) => (x.chave === c.chave ? { ...x, opcoes: e.target.value.split('\n') } : x)))} />
                )}
              </li>
            ))}
          </ul>
          <BotaoSec mini disabled={v.campos.length >= 20} onClick={() => setExtras([...extras, { chave: novaChave(), rotulo: '', tipo: 'texto', obrigatorio: false }])}>＋ Pergunta</BotaoSec>
        </fieldset>

        <fieldset className="frm-bloco">
          <legend>O card que nasce</legend>
          <div className="frm-duas">
            <label className="pn-us-campo"><span>Etapa</span>
              <select className="inp" value={v.colunaId ?? ''} onChange={(e) => set({ colunaId: e.target.value || null })}>
                <option value="">A etapa de entrada do funil</option>
                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <label className="pn-us-campo"><span>Responsável</span>
              <select className="inp" value={v.responsavelId ?? ''} onChange={(e) => set({ responsavelId: e.target.value || null })}>
                <option value="">Sem dono (fica para a distribuição)</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          </div>
          {etiquetasCat.length > 0 && (
            <div className="pn-us-campo"><span>Etiquetas</span>
              <div className="frm-etqs" role="group" aria-label="Etiquetas do card">
                {etiquetasCat.map((t) => {
                  const on = v.etiquetas.includes(t.nome);
                  return <button key={t.id} type="button" aria-pressed={on} className={'frm-etq' + (on ? ' on' : '')} onClick={() => set({ etiquetas: on ? v.etiquetas.filter((x) => x !== t.nome) : [...v.etiquetas, t.nome] })}><i style={{ background: t.cor || 'var(--txt-3)' }} />{t.nome}</button>;
                })}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="frm-bloco">
          <legend>Agendamento</legend>
          <label className="frm-chk frm-chk-l"><Toggle ligado={v.agenda.ligado} rotulo="O cliente escolhe um horário" aoMudar={(x) => setAgenda({ ligado: x })} />O cliente escolhe um horário livre e a reunião cai na Agenda</label>
          {v.agenda.ligado && (
            <>
              <div className="frm-tres">
                <label className="pn-us-campo"><span>Tipo</span>
                  <select className="inp" value={v.agenda.tipo ?? 'reuniao'} onChange={(e) => setAgenda({ tipo: e.target.value as 'reuniao' })}>
                    <option value="reuniao">Reunião</option><option value="ligacao">Ligação</option><option value="videochamada">Videochamada</option>
                  </select>
                </label>
                <label className="pn-us-campo"><span>Duração</span>
                  <select className="inp" value={String(v.agenda.duracao_min ?? 30)} onChange={(e) => setAgenda({ duracao_min: Number(e.target.value) })}>
                    {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
                <label className="pn-us-campo"><span>Com quem</span>
                  <select className="inp" value={v.agenda.responsavel_id ?? ''} onChange={(e) => setAgenda({ responsavel_id: e.target.value || null })}>
                    <option value="">O responsável do card</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
              </div>
              <div className="pn-us-campo"><span>Dias</span>
                <div className="frm-dias" role="group" aria-label="Dias da semana">
                  {DIAS_SEMANA.map((d) => {
                    const on = (v.agenda.dias ?? []).includes(d.n);
                    return <button key={d.n} type="button" aria-pressed={on} className={'frm-dia' + (on ? ' on' : '')} onClick={() => setAgenda({ dias: on ? (v.agenda.dias ?? []).filter((x) => x !== d.n) : [...(v.agenda.dias ?? []), d.n].sort() })}>{d.r}</button>;
                  })}
                </div>
              </div>
              <div className="frm-tres">
                <label className="pn-us-campo"><span>Das</span><input className="inp" type="time" value={v.agenda.inicio ?? '09:00'} onChange={(e) => setAgenda({ inicio: e.target.value })} /></label>
                <label className="pn-us-campo"><span>Até</span><input className="inp" type="time" value={v.agenda.fim ?? '18:00'} onChange={(e) => setAgenda({ fim: e.target.value })} /></label>
                <label className="pn-us-campo"><span>Antecedência mínima</span>
                  <select className="inp" value={String(v.agenda.antecedencia_h ?? 2)} onChange={(e) => setAgenda({ antecedencia_h: Number(e.target.value) })}>
                    {[0, 1, 2, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Nenhuma' : `${h} h`}</option>)}
                  </select>
                </label>
              </div>
              <div className="frm-duas">
                <label className="pn-us-campo"><span>Mostra os próximos</span>
                  <select className="inp" value={String(v.agenda.ate_dias ?? 14)} onChange={(e) => setAgenda({ ate_dias: Number(e.target.value) })}>
                    {[3, 7, 14, 21, 30].map((d) => <option key={d} value={d}>{d} dias</option>)}
                  </select>
                </label>
                <label className="frm-chk frm-chk-baixo"><input type="checkbox" checked={!!v.agenda.obrigatorio} onChange={(e) => setAgenda({ obrigatorio: e.target.checked })} />Escolher horário é obrigatório</label>
              </div>
            </>
          )}
        </fieldset>

        <label className="pn-us-campo"><span>Mensagem depois de enviar</span>
          <textarea className="inp" rows={2} value={v.mensagemFinal} maxLength={400} onChange={(e) => set({ mensagemFinal: e.target.value })} />
        </label>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
