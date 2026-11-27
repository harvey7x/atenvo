import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMudarStatusTarefa, useTarefasDaConversa, type Tarefa } from '@/data/tarefas';
import { BotaoMini } from '../../components';
import { CaixaConcluir, Pessoa, SeloPrazo, useEquipeComigo, useEuTarefas } from './comum';
import { TarefaModal } from './TarefaModal';
import './tarefas.css';

/* WhatsApp › painel do cliente: as tarefas abertas deste cliente e o "Criar tarefa", que abre o mesmo modal da
   página Tarefas já com o cliente e a conversa ligados (a tarefa leva de volta para esta conversa). */
const MOSTRAR = 3;

export function TarefasDaConversa({ conversaId, contatoId, clienteNome }: { conversaId: string; contatoId: string | null; clienteNome: string }) {
  const navigate = useNavigate();
  const eu = useEuTarefas();
  const { nomeDe } = useEquipeComigo();
  const q = useTarefasDaConversa(conversaId, eu);
  const mudar = useMudarStatusTarefa(eu);
  const [modal, setModal] = useState<{ tarefa: Tarefa | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = q.data ?? [];
  const agora = Date.now();

  return (
    <div className="ctx-b spot" data-tarefas-conversa>
      <div className="tf-ctx-cab">
        <div className="ctx-t">Tarefas</div>
        <BotaoMini onClick={() => { setAviso(null); setModal({ tarefa: null }); }}>＋ Criar tarefa</BotaoMini>
      </div>
      {lista.length === 0 ? (
        <p className="tf-ctx-vazio">{aviso ?? 'Nenhuma tarefa aberta deste cliente.'}</p>
      ) : (
        <ul className="tf-ctx-lista">
          {lista.slice(0, MOSTRAR).map((t) => (
            <li key={t.id}>
              <CaixaConcluir feita={false} rotulo={`Concluir: ${t.titulo}`}
                aoAlternar={() => mudar.mutate({ id: t.id, status: 'concluida' }, { onSuccess: () => setAviso(`Tarefa concluída: ${t.titulo}`), onError: (e) => setAviso((e as Error).message) })} />
              <div className="tf-ctx-tx">
                <button type="button" className="tf-tar-tit" onClick={() => setModal({ tarefa: t })}>{t.titulo}</button>
                <div className="tf-ctx-sub">
                  <SeloPrazo t={t} agora={agora} />
                  {t.responsavelId && <Pessoa nome={nomeDe(t.responsavelId)} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && aviso && <p className="tf-ctx-vazio" role="status">{aviso}</p>}
      {lista.length > MOSTRAR && (
        <button type="button" className="tf-lk tf-ctx-mais" onClick={() => navigate('/tarefas')}>Ver as {lista.length} em Tarefas</button>
      )}
      <TarefaModal aberto={!!modal} aoFechar={() => setModal(null)} tarefa={modal?.tarefa ?? null}
        inicial={{ conversaId, contatoId, clienteNome }}
        aoGravar={(_id, criada) => setAviso(criada ? 'Tarefa criada e ligada a esta conversa.' : 'Tarefa salva.')} />
    </div>
  );
}
