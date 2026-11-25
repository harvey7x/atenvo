import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PRIORIDADES, ROTULO_PRIORIDADE, ROTULO_STATUS, STATUS_TAREFA, podeApagar, rascunhoDe, rascunhoVazio, useExcluirTarefa, useSalvarTarefa,
  type RascunhoTarefa, type Tarefa,
} from '@/data/tarefas';
import { BotaoPrimario, BotaoSec, ModalV2, Segmentado } from '../../components';
import { CaixaConcluir, IcConversa, IcMais, IcX, useEquipeComigo, useEuTarefas } from './comum';
import './tarefas.css';

/* Criar e editar uma tarefa (a página Tarefas e o "Criar tarefa" do painel do cliente no WhatsApp usam este mesmo
   modal). `inicial` pré-preenche uma tarefa nova (ex.: o cliente da conversa); `tarefa` abre uma existente. */

export function TarefaModal({ aberto, aoFechar, tarefa, inicial, projetos = [], aoGravar }: {
  aberto: boolean;
  aoFechar: () => void;
  tarefa?: Tarefa | null;
  inicial?: Partial<RascunhoTarefa>;
  projetos?: string[];
  /** depois de gravar: o id e se foi criada agora */
  aoGravar?: (id: string, criada: boolean, r: RascunhoTarefa) => void;
}) {
  const navigate = useNavigate();
  const eu = useEuTarefas();
  const { equipe, nomeDe } = useEquipeComigo();
  const salvar = useSalvarTarefa(eu);
  const excluir = useExcluirTarefa(eu);
  const [r, setR] = useState<RascunhoTarefa>(() => rascunhoVazio());
  const [erro, setErro] = useState<string | null>(null);
  const [novoItem, setNovoItem] = useState('');
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const idProjetos = useId();
  const tituloRef = useRef<HTMLInputElement>(null);

  // ao abrir: a tarefa existente ou uma nova (por padrão comigo, prioridade média)
  useEffect(() => {
    if (!aberto) return;
    setR(tarefa ? rascunhoDe(tarefa) : rascunhoVazio({ responsavelId: eu.id, ...inicial }));
    setErro(null); setNovoItem(''); setConfirmarApagar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, tarefa?.id]);

  const set = <K extends keyof RascunhoTarefa>(k: K, v: RascunhoTarefa[K]) => setR((x) => ({ ...x, [k]: v }));
  const ocupado = salvar.isPending || excluir.isPending;
  const feitos = r.itens.filter((i) => i.feito).length;

  function addItem() {
    const t = novoItem.trim();
    if (!t) return;
    if (r.itens.length >= 50) { setErro('A tarefa pode ter até 50 subtarefas.'); return; }
    setR((x) => ({ ...x, itens: [...x.itens, { texto: t, feito: false }] }));
    setNovoItem('');
  }
  async function gravar() {
    if (!r.titulo.trim()) { setErro('Escreva o que precisa ser feito.'); tituloRef.current?.focus(); return; }
    if (r.hora && !r.dia) { setErro('Escolha o dia do prazo (a hora sozinha não vale).'); return; }
    // o que ficou escrito no campo de subtarefa entra junto
    const final = novoItem.trim() ? { ...r, itens: [...r.itens, { texto: novoItem.trim(), feito: false }] } : r;
    setErro(null);
    try {
      const id = await salvar.mutateAsync({ id: tarefa?.id ?? null, rascunho: final });
      aoGravar?.(id, !tarefa, final);
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  async function apagar() {
    if (!tarefa) return;
    try {
      await excluir.mutateAsync(tarefa.id);
      aoFechar();
    } catch (e) {
      setErro((e as Error).message); setConfirmarApagar(false);
    }
  }

  const criadoPor = tarefa ? nomeDe(tarefa.criadoPor) : null;
  const rodape = confirmarApagar ? (
    <>
      <span className="tf-mod-conf">Apagar esta tarefa? Não tem como desfazer.</span>
      <BotaoSec disabled={ocupado} onClick={() => setConfirmarApagar(false)}>Voltar</BotaoSec>
      <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={apagar}>{excluir.isPending ? 'Apagando…' : 'Apagar'}</button>
    </>
  ) : (
    <>
      {tarefa && podeApagar(tarefa, eu) && (
        <button type="button" className="tf-mod-apagar" disabled={ocupado} onClick={() => setConfirmarApagar(true)}>Apagar tarefa</button>
      )}
      <BotaoSec disabled={ocupado} onClick={aoFechar}>Cancelar</BotaoSec>
      <BotaoPrimario disabled={ocupado} onClick={gravar}>{salvar.isPending ? 'Gravando…' : tarefa ? 'Salvar' : 'Criar tarefa'}</BotaoPrimario>
    </>
  );

  return (
    <ModalV2 aberto={aberto} aoFechar={() => { if (!ocupado) aoFechar(); }} fecharNoVeu={!ocupado} largura={580}
      titulo={tarefa ? 'Tarefa' : 'Nova tarefa'} rodape={rodape}>
      <div className="tf-form" data-tarefa-modal>
        <div className="campo">
          <label htmlFor="tf-titulo">O que precisa ser feito</label>
          <input id="tf-titulo" ref={tituloRef} className="inp tf-titulo-inp" maxLength={200} value={r.titulo}
            placeholder={r.clienteNome ? `Ex.: Ligar para ${r.clienteNome.split(' ')[0]} para pegar o extrato do INSS` : 'Ex.: Conferir o comprovante de endereço'}
            onChange={(e) => set('titulo', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gravar(); }} />
        </div>

        {r.clienteNome && (
          <div className="tf-cliente" data-tarefa-cliente>
            <span className="tf-cliente-ic"><IcConversa /></span>
            <span className="tf-cliente-tx"><span className="tf-cliente-rot">Cliente</span><b>{r.clienteNome}</b></span>
            {r.conversaId && (
              <button type="button" className="tf-lk" onClick={() => { aoFechar(); navigate(`/whatsapp?conversa=${encodeURIComponent(r.conversaId!)}`); }}>Abrir conversa</button>
            )}
            <button type="button" className="tf-ib" aria-label="Tirar o cliente da tarefa" title="Tirar o cliente da tarefa"
              onClick={() => setR((x) => ({ ...x, conversaId: null, contatoId: null, clienteNome: null }))}><IcX /></button>
          </div>
        )}

        <div className="campo">
          <label htmlFor="tf-desc">Detalhes <span className="tf-opc">(opcional)</span></label>
          <textarea id="tf-desc" className="inp" rows={3} maxLength={4000} value={r.descricao} placeholder="O que a pessoa precisa saber para fazer"
            onChange={(e) => set('descricao', e.target.value)} />
        </div>

        <div className="tf-linha">
          <div className="campo">
            <label htmlFor="tf-resp">Responsável</label>
            <select id="tf-resp" className="inp" value={r.responsavelId ?? ''} onChange={(e) => set('responsavelId', e.target.value || null)}>
              <option value="">Sem responsável</option>
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.id === eu.id ? `${p.nome} (você)` : p.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <span className="tf-rot-campo">Prioridade</span>
            <Segmentado rotulo="Prioridade" valor={r.prioridade} aoMudar={(v) => set('prioridade', v)}
              opcoes={PRIORIDADES.map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))} />
          </div>
        </div>

        <div className="tf-linha">
          <div className="campo">
            <label htmlFor="tf-dia">Prazo</label>
            <div className="tf-prazo-campos">
              <input id="tf-dia" type="date" className="inp" value={r.dia} onChange={(e) => set('dia', e.target.value)} aria-label="Dia do prazo" />
              <input id="tf-hora" type="time" className="inp" value={r.hora} disabled={!r.dia} onChange={(e) => set('hora', e.target.value)} aria-label="Hora do prazo (opcional)" title="Hora (opcional)" />
              {r.dia && <button type="button" className="tf-ib" aria-label="Tirar o prazo" title="Tirar o prazo" onClick={() => setR((x) => ({ ...x, dia: '', hora: '' }))}><IcX /></button>}
            </div>
            <span className="tf-dica">{!r.dia ? 'Sem prazo' : r.hora ? 'Vence nesse dia e hora' : 'Sem hora: vale até o fim do dia'}</span>
          </div>
          <div className="campo">
            <label htmlFor="tf-status">Situação</label>
            <select id="tf-status" className="inp" value={r.status} onChange={(e) => set('status', e.target.value as RascunhoTarefa['status'])}>
              {STATUS_TAREFA.map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="tf-proj">Projeto <span className="tf-opc">(opcional)</span></label>
          <input id="tf-proj" className="inp" list={idProjetos} maxLength={80} value={r.projeto} placeholder="Ex.: Documentação, Revisão de juros"
            onChange={(e) => set('projeto', e.target.value)} />
          <datalist id={idProjetos}>{projetos.map((p) => <option key={p} value={p} />)}</datalist>
        </div>

        <div className="tf-subs" data-tarefa-subtarefas>
          <div className="tf-subs-cab">
            <span className="tf-subs-tit">Subtarefas</span>
            {r.itens.length > 0 && <span className="tf-subs-n num">{feitos} de {r.itens.length}</span>}
          </div>
          {r.itens.length > 0 && (
            <ul className="tf-subs-lista">
              {r.itens.map((it, i) => (
                <li key={it.id ?? `n${i}`} className={it.feito ? 'feito' : ''}>
                  <CaixaConcluir feita={it.feito} rotulo={`Subtarefa ${it.texto}`}
                    aoAlternar={() => setR((x) => ({ ...x, itens: x.itens.map((y, j) => (j === i ? { ...y, feito: !y.feito } : y)) }))} />
                  <input className="tf-sub-inp" value={it.texto} maxLength={300} aria-label={`Subtarefa ${i + 1}`}
                    onChange={(e) => setR((x) => ({ ...x, itens: x.itens.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) }))} />
                  <button type="button" className="tf-ib" aria-label={`Tirar a subtarefa ${it.texto}`} title="Tirar"
                    onClick={() => setR((x) => ({ ...x, itens: x.itens.filter((_, j) => j !== i) }))}><IcX /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="tf-sub-novo">
            <span className="tf-sub-mais" aria-hidden><IcMais /></span>
            <input className="tf-sub-inp" value={novoItem} maxLength={300} placeholder="Adicionar subtarefa e apertar Enter" aria-label="Nova subtarefa"
              onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
            {novoItem.trim() && <button type="button" className="tf-lk" onClick={addItem}>Adicionar</button>}
          </div>
        </div>

        {tarefa && (
          <p className="tf-meta">
            Criada{criadoPor ? ` por ${criadoPor}` : ''} em {new Date(tarefa.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            {tarefa.concluidaEm ? ` · concluída em ${new Date(tarefa.concluidaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        )}
        {erro && <div className="aviso-inline erro tf-erro" role="alert">{erro}</div>}
      </div>
    </ModalV2>
  );
}
