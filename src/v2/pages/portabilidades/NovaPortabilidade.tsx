/* Portabilidades — Nova portabilidade: procura o cliente (nome ou telefone), escolhe,
   coloca o valor que ele vai receber e o atendente. A divisão aparece na hora, pela mesma regra da tela. */
import { useRef, useState } from 'react';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../../components';
import { centavosDe, dividir, mascaraReais } from '@/data/portabilidades';
import { iniciais, nomeBonito } from '@/data/pendencias';
import { useBuscaClientes, type ClienteBusca, type Fonte } from './fonte';
import { Partes } from './pecas';
import { IcBusca, IcX } from './icones';

export function NovaPortabilidade({ f, aoFechar, aoCriar }: {
  f: Fonte;
  aoFechar: () => void;
  aoCriar: (id: string, atendenteId: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [cli, setCli] = useState<ClienteBusca | null>(null);
  const [valor, setValor] = useState('');
  const [atendenteId, setAtendenteId] = useState(f.usuario.id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const { lista, carregando } = useBuscaClientes(busca);
  const campoValor = useRef<HTMLInputElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  const total = centavosDe(valor);
  const pode = !!cli && total > 0 && !salvando;

  const escolher = (c: ClienteBusca) => {
    setCli(c);
    setErro('');
    /* atendente = o encarregado do cliente (se for da equipe); senão, quem está adicionando */
    setAtendenteId(c.responsavelId && f.atendentes.some((a) => a.id === c.responsavelId) ? c.responsavelId : f.usuario.id);
    requestAnimationFrame(() => campoValor.current?.focus());
  };
  const trocarCliente = () => {
    setCli(null);
    requestAnimationFrame(() => campoBusca.current?.focus());
  };
  const salvar = async () => {
    if (!cli) { setErro('Escolha o cliente.'); return; }
    if (!(total > 0)) { setErro('Coloque o valor que o cliente vai receber.'); campoValor.current?.focus(); return; }
    setSalvando(true); setErro('');
    try {
      const id = await f.acoes.criar({ clienteId: cli.id, valorTotal: total, atendenteId });
      aoCriar(id, atendenteId);
    } catch (e) {
      setErro(f.erroAmigavel(e));
      setSalvando(false);
    }
  };
  const fechar = () => { if (!salvando) aoFechar(); };
  const nomeAtendente = f.atendentes.find((a) => a.id === atendenteId)?.nome ?? '—';

  return (
    <ModalV2 aberto aoFechar={fechar} fecharNoVeu={!salvando} titulo="Nova portabilidade" largura={540}
      rodape={<>
        <BotaoSec onClick={fechar} disabled={salvando}>Cancelar</BotaoSec>
        <BotaoPrimario onClick={() => void salvar()} disabled={!pode}>{salvando ? 'Adicionando…' : 'Adicionar'}</BotaoPrimario>
      </>}>
      <form className="pt-nv" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="pt-nv-campo">
          <span className="pt-nv-rot" id="pt-nv-cli">Cliente</span>
          {cli ? (
            <div className="pt-nv-esc">
              <span className="pt-av" aria-hidden>{iniciais(cli.nome)}</span>
              <span className="pt-nv-esc-tx">
                <b>{nomeBonito(cli.nome)}</b>
                <span><span className="num">{cli.telefone}</span>{cli.responsavel && cli.responsavel !== '—' && <> · Encarregado: {cli.responsavel}</>}</span>
              </span>
              <button type="button" className="pt-link" onClick={trocarCliente} disabled={salvando}>Trocar</button>
            </div>
          ) : (
            <>
              <label className="pt-nv-busca">
                <IcBusca />
                <input ref={campoBusca} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procure por nome ou telefone"
                  aria-labelledby="pt-nv-cli" autoComplete="off"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (lista.length === 1) escolher(lista[0]); } }} />
                {busca && <button type="button" className="pt-x" onClick={() => setBusca('')} aria-label="Limpar a busca"><IcX t={12} /></button>}
              </label>
              <div className="pt-nv-res" role="listbox" aria-labelledby="pt-nv-cli">
                {carregando ? <p className="pt-nv-vazio">Procurando…</p>
                  : lista.length === 0 ? <p className="pt-nv-vazio">Nenhum cliente com esse nome ou telefone.</p>
                    : lista.map((c) => (
                      <button key={c.id} type="button" role="option" aria-selected={false} className="pt-cand" onClick={() => escolher(c)}>
                        <span className="pt-av" aria-hidden>{iniciais(c.nome)}</span>
                        <span className="pt-cand-tx">
                          <b>{nomeBonito(c.nome)}</b>
                          <span><span className="num">{c.telefone}</span>{c.responsavel && c.responsavel !== '—' && <> · {c.responsavel}</>}</span>
                        </span>
                        {c.abertas > 0 && <span className="pt-selo" data-tom="azul">{c.abertas === 1 ? '1 em aberto' : `${c.abertas} em aberto`}</span>}
                      </button>
                    ))}
              </div>
            </>
          )}
        </div>

        <div className="pt-nv-dupla">
          <div className="pt-nv-campo">
            <label className="pt-nv-rot" htmlFor="pt-nv-valor">Valor que o cliente vai receber</label>
            <span className="pt-rs-w">
              <span aria-hidden>R$</span>
              <input ref={campoValor} id="pt-nv-valor" className="inp num" inputMode="numeric" placeholder="0,00" value={valor}
                onChange={(e) => { setValor(mascaraReais(e.target.value)); setErro(''); }} disabled={salvando} />
            </span>
          </div>
          <div className="pt-nv-campo">
            <label className="pt-nv-rot" htmlFor="pt-nv-at">Atendente</label>
            <select id="pt-nv-at" className="inp" value={atendenteId} onChange={(e) => setAtendenteId(e.target.value)} disabled={salvando}>
              {f.atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.id === f.usuario.id ? ' (você)' : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="pt-nv-div">
          <div className="pt-valor-cab">
            <span className="pt-rot">Como o valor se divide</span>
          </div>
          <Partes d={dividir(total)} atendente={nomeAtendente} />
        </div>

        {erro && <p className="pt-erro" role="alert">{erro}</p>}
        {/* Enter no campo de valor salva */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ModalV2>
  );
}
