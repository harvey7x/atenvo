/* CONFIGURAÇÕES → PRODUTOS E SERVIÇOS (26/11, "igual" ao sistema que a Reviza usava antes: "o catálogo do que você vende,
   com o valor de cada item"). A lista: nome e descrição, valor, quanto já vendeu, ligado; a janela cria/edita (nome,
   descrição, valor, ativo) e apaga (os lançamentos já feitos ficam, com a descrição). Só o administrador.
   Os produtos aparecem no Financeiro do painel do cliente, no WhatsApp. Dados: @/data/financeiro (migration 112). */
import { useState } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { brl, lerValor, useApagarProduto, useProdutos, useSalvarProduto, useUsoDosProdutos, validarProduto, type Produto } from '@/data/financeiro';
import '../painel/painel.css';
import './camposMotivos.css';

export function ConfigProdutos() {
  const q = useProdutos();
  const salvar = useSalvarProduto();
  const produtos = q.data ?? [];
  const uso = useUsoDosProdutos(produtos.map((p) => p.id));
  const [janela, setJanela] = useState<{ produto: Produto | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const ativos = produtos.filter((p) => p.ativo).length;

  return (
    <div className="pn cfgw cfgp" data-config-produtos>
      <AcoesNoTopo><BotaoPrimario onClick={() => setJanela({ produto: null })}>＋ Novo produto</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab pn-us-cab">
          <div><h3>Produtos e serviços</h3><p>{produtos.length ? `${produtos.length} ${produtos.length === 1 ? 'item' : 'itens'}, ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}. Os ativos aparecem no Financeiro do cliente, no WhatsApp.` : 'O que a empresa vende, com o valor de cada item.'}</p></div>
        </div>
        {q.isLoading ? <p className="pn-vazio">Carregando os produtos…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar os produtos" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : produtos.length === 0 ? <EstadoVazio titulo="Nenhum produto ainda" descricao="Cadastre o primeiro, como a revisão de juros, para lançar a venda no cliente." acao={{ rotulo: '＋ Novo produto', onClick: () => setJanela({ produto: null }) }} />
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgc-tab">
                <thead><tr><th scope="col">Produto ou serviço</th><th scope="col">Valor</th><th scope="col">Vendido</th><th scope="col">Ativo</th><th scope="col"><span className="pn-vh">Ações</span></th></tr></thead>
                <tbody>
                  {produtos.map((p) => {
                    const u = uso.data?.[p.id];
                    return (
                      <tr key={p.id} className={p.ativo ? undefined : 'cfgc-desl'}>
                        <td><span className="cfgc-nome">{p.nome}</span>{p.descricao && <small className="cfgc-ops">{p.descricao}</small>}</td>
                        <td className="num">{brl(p.valor)}</td>
                        <td className="num">{u ? (u.qtd ? `${u.qtd} · ${brl(u.valor)}` : 'Ainda não') : '—'}</td>
                        <td><span className="cfgc-tgl"><Toggle ligado={p.ativo} rotulo={`Produto ${p.nome} ativo`} disabled={salvar.isPending}
                          aoMudar={(v) => void salvar.mutateAsync({ ...p, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `${p.nome} voltou a aparecer no Financeiro.` : `${p.nome} desligado: não aparece mais para lançar.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} /></span></td>
                        <td className="pn-fin-acoes"><span className="pn-us-acoes"><BotaoSec mini onClick={() => setJanela({ produto: p })}>Editar</BotaoSec></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </CardVidro>
      {janela && <JanelaProduto key={janela.produto?.id ?? 'novo'} produto={janela.produto} produtos={produtos} vendido={janela.produto ? (uso.data?.[janela.produto.id]?.qtd ?? 0) : 0}
        aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaProduto({ produto, produtos, vendido, aoFechar, aoAvisar }: { produto: Produto | null; produtos: Produto[]; vendido: number; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarProduto();
  const apagar = useApagarProduto();
  const [nome, setNome] = useState(produto?.nome ?? '');
  const [descricao, setDescricao] = useState(produto?.descricao ?? '');
  const [valor, setValor] = useState(produto ? produto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [erro, setErro] = useState('');
  const [confirma, setConfirma] = useState(false);
  const ocupado = salvar.isPending || apagar.isPending;
  const gravar = async () => {
    const e = validarProduto({ nome, valor }, produtos, produto?.id); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ id: produto?.id, nome, descricao, valor: lerValor(valor)!, ativo }); aoAvisar(produto ? `${nome.trim()} atualizado.` : `${nome.trim()} cadastrado. Já aparece no Financeiro do cliente.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  const remover = async () => {
    if (!produto) return;
    try { await apagar.mutateAsync(produto.id); aoAvisar(`${produto.nome} apagado.`); aoFechar(); } catch (x) { setErro((x as Error).message); }
  };
  if (confirma && produto) {
    return (
      <ModalV2 aberto aoFechar={aoFechar} largura={440} titulo={<div>Apagar {produto.nome}?<div className="mod-sub">Não dá para desfazer</div></div>}
        rodape={<><BotaoSec onClick={() => setConfirma(false)} disabled={ocupado}>Voltar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{ocupado ? 'Apagando…' : 'Apagar produto'}</button></>}>
        <div className="pn-us-form">
          <p className="cfge-texto">{vendido ? `Ele já foi lançado ${vendido} ${vendido === 1 ? 'vez' : 'vezes'}: esses lançamentos ficam no cliente, com a descrição.` : 'Ele ainda não foi lançado em nenhum cliente.'} Para só tirar da lista, desligue o produto.</p>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      </ModalV2>
    );
  }
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={500}
      titulo={<div>{produto ? 'Editar produto ou serviço' : 'Novo produto ou serviço'}<div className="mod-sub">O que aparece para lançar no Financeiro do cliente</div></div>}
      rodape={<>
        {produto && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => { setErro(''); setConfirma(true); }}>Apagar produto</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : produto ? 'Salvar' : 'Cadastrar'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo"><label htmlFor="prod-nome">Nome</label>
          <input id="prod-nome" className="inp" value={nome} maxLength={80} autoFocus placeholder="ex.: Revisão de juros do empréstimo" onChange={(e) => { setNome(e.target.value); setErro(''); }} /></div>
        <div className="pn-us-campo"><label htmlFor="prod-desc">Descrição (opcional)</label>
          <textarea id="prod-desc" className="inp" rows={3} maxLength={500} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div className="pn-us-campo"><label htmlFor="prod-valor">Valor de cada um</label>
          <input id="prod-valor" className="inp num" inputMode="decimal" value={valor} placeholder="0,00" onChange={(e) => { setValor(e.target.value); setErro(''); }} />
          <span className="cfgc-dica">{lerValor(valor) != null ? `Fica ${brl(lerValor(valor)!)}. Dá para mudar o valor na hora de lançar.` : 'Em reais, como 1.300,00.'}</span></div>
        <label className="cfgc-chk"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /><span>Ativo: aparece para lançar no cliente</span></label>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
