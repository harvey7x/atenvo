/* FINANCEIRO DO CLIENTE no painel do WhatsApp (26/11, "igual" ao sistema que a Reviza usava antes: "produto/serviço, novo
   lançamento"). O total do que o cliente comprou e o que está em cobrança, os lançamentos (o mais novo em cima) e o
   "Novo lançamento": escolher o produto (traz o valor), a quantidade, o valor, se é venda (receita) ou cobrança, e a data.
   Apagar: quem lançou, o administrador ou o supervisor. Dados: @/data/financeiro (migration 112). */
import { useMemo, useState } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { brl, hojeSP, lerValor, useApagarLancamento, useLancamentosDoContato, useNovoLancamento, useProdutos, validarLancamento, type TipoLanc } from '@/data/financeiro';
import './financeiroDoCliente.css';

const dataCurta = (d: string) => { const [a, m, dd] = d.split('-'); return dd && m ? `${dd}/${m}/${(a ?? '').slice(2)}` : d; };

export function FinanceiroDoCliente({ contatoId }: { contatoId: string | null }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const podeApagarTudo = currentOrg.role === 'admin' || currentOrg.role === 'gestor';
  const lq = useLancamentosDoContato(contatoId);
  const pq = useProdutos();
  const novo = useNovoLancamento();
  const apagar = useApagarLancamento();
  const [aberto, setAberto] = useState(false);
  const [produtoId, setProdutoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<TipoLanc>('receita');
  const [data, setData] = useState(hojeSP());
  const [erro, setErro] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  const lista = lq.data ?? [];
  const produtos = (pq.data ?? []).filter((p) => p.ativo);
  const totais = useMemo(() => lista.reduce((t, l) => ({ ...t, [l.tipo]: t[l.tipo] + l.valorTotal }), { receita: 0, cobranca: 0 } as Record<TipoLanc, number>), [lista]);
  if (!contatoId) return null;

  const limpar = () => { setProdutoId(''); setDescricao(''); setQuantidade('1'); setValor(''); setTipo('receita'); setData(hojeSP()); setErro(''); };
  const escolherProduto = (id: string) => {
    setProdutoId(id); setErro('');
    const p = produtos.find((x) => x.id === id);
    if (p) setValor(p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };
  const lancar = async () => {
    const e = validarLancamento({ descricao, produtoId: produtoId || null, quantidade, valor, data }); if (e) { setErro(e); return; }
    try {
      await novo.mutateAsync({ contatoId, produtoId: produtoId || null, descricao, quantidade: Number(quantidade), valorUnitario: lerValor(valor)!, tipo, data });
      limpar(); setAberto(false);
    } catch (x) { setErro((x as Error).message); }
  };
  const total = (Number(quantidade) || 0) * (lerValor(valor) ?? 0);
  const mostrados = verTodos ? lista : lista.slice(0, 4);

  return (
    <div className="ctx-b spot fdc" data-financeiro-cliente>
      <div className="ctx-t">Financeiro{!aberto && <button type="button" className="lk" onClick={() => { limpar(); setAberto(true); }}>Novo lançamento</button>}</div>
      {(totais.receita > 0 || totais.cobranca > 0) && (
        <div className="fdc-totais">
          <div><span>Comprou</span><b className="num">{brl(totais.receita)}</b></div>
          <div><span>Em cobrança</span><b className="num">{brl(totais.cobranca)}</b></div>
        </div>
      )}

      {aberto && (
        <div className="fdc-form">
          <div className="fdc-tipo" role="radiogroup" aria-label="Tipo do lançamento">
            {([['receita', 'Venda'], ['cobranca', 'Cobrança']] as const).map(([v, r]) => (
              <button key={v} type="button" role="radio" aria-checked={tipo === v} className={tipo === v ? 'on' : undefined} onClick={() => setTipo(v)}>{r}</button>
            ))}
          </div>
          <label className="fdc-campo"><span>Produto ou serviço</span>
            <select className="inp" value={produtoId} onChange={(e) => escolherProduto(e.target.value)}>
              <option value="">{produtos.length ? 'Escolha (ou escreva abaixo)' : 'Nenhum produto cadastrado'}</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} · {brl(p.valor)}</option>)}
            </select>
          </label>
          <label className="fdc-campo"><span>{produtoId ? 'Descrição (opcional)' : 'O que foi'}</span>
            <input className="inp" value={descricao} maxLength={200} placeholder={produtoId ? produtos.find((p) => p.id === produtoId)?.nome : 'ex.: honorário da segunda parcela'} onChange={(e) => { setDescricao(e.target.value); setErro(''); }} />
          </label>
          <div className="fdc-linha">
            <label className="fdc-campo q"><span>Qtd.</span><input className="inp" inputMode="numeric" value={quantidade} maxLength={4} onChange={(e) => { setQuantidade(e.target.value.replace(/\D/g, '')); setErro(''); }} /></label>
            <label className="fdc-campo"><span>Valor de cada</span><input className="inp num" inputMode="decimal" value={valor} placeholder="0,00" onChange={(e) => { setValor(e.target.value); setErro(''); }} /></label>
          </div>
          <label className="fdc-campo"><span>Data</span><input className="inp" type="date" value={data} max={hojeSP()} onChange={(e) => setData(e.target.value)} /></label>
          {erro && <span className="fdc-erro" role="alert">{erro}</span>}
          <div className="fdc-ac">
            <button type="button" className="fdc-ok" disabled={novo.isPending} onClick={() => void lancar()}>{novo.isPending ? 'Lançando…' : `Lançar ${total ? brl(total) : ''}`.trim()}</button>
            <button type="button" className="fdc-sec" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {lq.isLoading ? null : lista.length === 0 ? (!aberto && <p className="fdc-vazio">Nada lançado para este cliente.</p>) : (
        <ul className="fdc-lista">
          {mostrados.map((l) => {
            const pode = podeApagarTudo || l.criadoPor === user?.id || l.criadoPor === 'eu';
            return (
              <li key={l.id}>
                <span className="fdc-d num">{dataCurta(l.data)}</span>
                <span className="fdc-t" title={l.descricao}>{l.descricao}{l.quantidade > 1 && <small> · {l.quantidade} × {brl(l.valorUnitario)}</small>}</span>
                <span className={'fdc-v num' + (l.tipo === 'cobranca' ? ' cob' : '')} title={l.tipo === 'cobranca' ? 'Cobrança (fora da receita)' : 'Venda'}>{brl(l.valorTotal)}</span>
                {pode && <button type="button" className="fdc-x" aria-label={`Apagar o lançamento ${l.descricao}`} disabled={apagar.isPending} onClick={() => void apagar.mutateAsync(l.id).catch((x) => setErro((x as Error).message))}>×</button>}
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > 4 && <button type="button" className="fdc-mais" onClick={() => setVerTodos((v) => !v)}>{verTodos ? 'Mostrar menos' : `Ver os ${lista.length} lançamentos`}</button>}
    </div>
  );
}
