/* CONFIGURAÇÕES → CAMPOS DO CLIENTE (26/11, "igual" ao sistema que a Reviza usava antes: lá Campos personalizados, com o
   "Nome completo (RG)"). A lista dos campos na ordem: tipo, opções, se aparece no cartão do Kanban, ligado e quantos
   clientes já têm preenchido; subir/descer muda a ordem do painel do cliente. Uma janela cria e edita (nome, tipo, opções
   da lista, cartão do Kanban) e apaga, avisando quantos clientes perdem o valor. Só o administrador.
   Dados: @/data/camposPersonalizados (migration 110). */
import { useState } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { temRecurso } from '../../data/config/recursos';
import {
  NOME_MAX, OPCOES_MAX, ROTULO_TIPO, TIPOS_CAMPO, limparOpcoes, tiposDisponiveis, useApagarCampo, useCampos, useOrdenarCampos, useSalvarCampo, useUsoDosCampos, validarCampo,
  type Campo, type TipoCampo,
} from '@/data/camposPersonalizados';
import '../painel/painel.css';
import './camposMotivos.css';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export const CARTAO_MAX = 3;

function Seta({ cima }: { cima?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{cima ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}</svg>;
}

export function ConfigCampos() {
  const q = useCampos();
  const salvar = useSalvarCampo();
  const ordenar = useOrdenarCampos();
  const campos = q.data ?? [];
  const uso = useUsoDosCampos(campos.map((c) => c.id));
  const [janela, setJanela] = useState<{ campo: Campo | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const noCartao = campos.filter((c) => c.ativo && c.noCartao).length;

  const mudar = async (c: Campo, p: Partial<Campo>, texto: string) => {
    if (p.noCartao && noCartao >= CARTAO_MAX) { setAviso({ tom: 'erro', texto: `O cartão do Kanban mostra até ${CARTAO_MAX} campos. Tire um antes de pôr outro.` }); return; }
    try { await salvar.mutateAsync({ ...c, ...p }); setAviso({ tom: 'ok', texto }); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };
  const mover = async (i: number, d: -1 | 1) => {
    const ids = campos.map((c) => c.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await ordenar.mutateAsync(ids); } catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };

  return (
    <div className="pn cfgw cfgc" data-config-campos>
      <AcoesNoTopo><BotaoPrimario onClick={() => setJanela({ campo: null })}>＋ Novo campo</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab pn-us-cab">
          <div><h3>Campos do cliente</h3><p>O que a equipe preenche sobre cada cliente, no painel do cliente do WhatsApp, nesta ordem.</p></div>
        </div>
        {q.isLoading ? <p className="pn-vazio">Carregando os campos…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar os campos" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : campos.length === 0 ? <EstadoVazio titulo="Nenhum campo criado" descricao='Crie o primeiro campo, como o "Nome completo (RG)" ou o banco do empréstimo.' acao={{ rotulo: '＋ Novo campo', onClick: () => setJanela({ campo: null }) }} />
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgc-tab">
                <thead>
                  <tr>
                    <th scope="col">Campo</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">No cartão do Kanban</th>
                    <th scope="col">Ligado</th>
                    <th scope="col">Preenchidos</th>
                    <th scope="col">Ordem</th>
                    <th scope="col"><span className="pn-vh">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {campos.map((c, i) => (
                    <tr key={c.id} className={c.ativo ? undefined : 'cfgc-desl'}>
                      <td>
                        <span className="cfgc-nome">{c.nome}</span>
                        {c.tipo === 'lista' && <small className="cfgc-ops">{c.opcoes.join(' · ')}</small>}
                      </td>
                      <td><span className="pn-us-amb-tx">{ROTULO_TIPO[c.tipo]}</span></td>
                      <td><span className="cfgc-tgl"><Toggle ligado={c.noCartao} rotulo={`Mostrar ${c.nome} no cartão do Kanban`} disabled={salvar.isPending || !c.ativo}
                        aoMudar={(v) => void mudar(c, { noCartao: v }, v ? `${c.nome} aparece no cartão do Kanban.` : `${c.nome} saiu do cartão do Kanban.`)} /></span></td>
                      <td><span className="cfgc-tgl"><Toggle ligado={c.ativo} rotulo={`Campo ${c.nome} ligado`} disabled={salvar.isPending}
                        aoMudar={(v) => void mudar(c, { ativo: v, ...(v ? {} : { noCartao: false }) }, v ? `${c.nome} voltou ao painel do cliente.` : `${c.nome} desligado. O que já foi preenchido fica guardado.`)} /></span></td>
                      <td className="num">{uso.data ? plural(uso.data[c.id] ?? 0, 'cliente', 'clientes') : '—'}</td>
                      <td>
                        <span className="cfgc-ordem">
                          <button type="button" className="cfgc-seta" aria-label={`Subir ${c.nome}`} disabled={i === 0 || ordenar.isPending} onClick={() => void mover(i, -1)}><Seta cima /></button>
                          <button type="button" className="cfgc-seta" aria-label={`Descer ${c.nome}`} disabled={i === campos.length - 1 || ordenar.isPending} onClick={() => void mover(i, 1)}><Seta /></button>
                        </span>
                      </td>
                      <td className="pn-fin-acoes"><span className="pn-us-acoes"><BotaoSec mini onClick={() => setJanela({ campo: c })}>Editar</BotaoSec></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {campos.length > 0 && <p className="cfgc-pe">{noCartao ? `${plural(noCartao, 'campo aparece', 'campos aparecem')} no cartão do Kanban (até ${CARTAO_MAX}).` : `Nenhum campo no cartão do Kanban. Ligue até ${CARTAO_MAX} na coluna "No cartão do Kanban".`}</p>}
      </CardVidro>

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.06s' }}>
        <div className="pn-card-cab"><div><h3>Como os campos funcionam</h3><p>Só o administrador cria e muda os campos. Toda a equipe preenche.</p></div></div>
        <div className="pn-us-papeis cfge-explica">
          <div className="pn-us-papel-card"><b>No WhatsApp</b><span>O painel do cliente mostra os campos ligados. Clique no valor para preencher ou mudar.</span></div>
          <div className="pn-us-papel-card"><b>No Kanban</b><span>Os campos marcados aparecem no cartão do lead, embaixo do nome.</span></div>
          <div className="pn-us-papel-card"><b>Desligar ou apagar</b><span>Desligar esconde o campo e guarda o que foi preenchido. Apagar remove o campo e os valores.</span></div>
        </div>
      </CardVidro>

      {janela && <JanelaCampo key={janela.campo?.id ?? 'novo'} campo={janela.campo} campos={campos} usados={janela.campo ? (uso.data?.[janela.campo.id] ?? 0) : 0}
        cheioNoCartao={noCartao >= CARTAO_MAX} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaCampo({ campo, campos, usados, cheioNoCartao, aoFechar, aoAvisar }: {
  campo: Campo | null; campos: Campo[]; usados: number; cheioNoCartao: boolean; aoFechar: () => void; aoAvisar: (t: string) => void;
}) {
  const salvar = useSalvarCampo();
  const apagar = useApagarCampo();
  const [nome, setNome] = useState(campo?.nome ?? '');
  const [tipo, setTipo] = useState<TipoCampo>(campo?.tipo ?? 'texto');
  const [opcoes, setOpcoes] = useState((campo?.opcoes ?? []).join('\n'));
  const [noCartao, setNoCartao] = useState(campo?.noCartao ?? false);
  const [erro, setErro] = useState('');
  const [confirma, setConfirma] = useState(false);
  const ocupado = salvar.isPending || apagar.isPending;
  const lista = limparOpcoes(opcoes.split('\n'));
  const podeCartao = noCartao || !cheioNoCartao || !!campo?.noCartao;
  const tiradas = campo?.tipo === 'lista' && tipo === 'lista' ? campo.opcoes.filter((o) => !lista.includes(o)) : [];

  const gravar = async () => {
    const e = validarCampo({ nome, tipo, opcoes: lista }, campos, campo?.id); if (e) { setErro(e); return; }
    try {
      await salvar.mutateAsync({ id: campo?.id, nome, tipo, opcoes: lista, noCartao: noCartao && (campo?.ativo ?? true), ativo: campo?.ativo ?? true, ordem: campo?.ordem ?? campos.length });
      aoAvisar(campo ? `Campo ${nome.trim()} atualizado.` : `Campo ${nome.trim()} criado. Ele já aparece no painel do cliente.`);
      aoFechar();
    } catch (x) { setErro((x as Error).message); }
  };
  const remover = async () => {
    if (!campo) return;
    try { await apagar.mutateAsync(campo.id); aoAvisar(`Campo ${campo.nome} apagado.`); aoFechar(); } catch (x) { setErro((x as Error).message); }
  };

  if (confirma && campo) {
    return (
      <ModalV2 aberto aoFechar={aoFechar} largura={440} titulo={<div>Apagar o campo {campo.nome}?<div className="mod-sub">Não dá para desfazer</div></div>}
        rodape={<><BotaoSec onClick={() => setConfirma(false)} disabled={ocupado}>Voltar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{ocupado ? 'Apagando…' : 'Apagar campo'}</button></>}>
        <div className="pn-us-form">
          <p className="cfge-texto">{usados ? `${plural(usados, 'cliente tem', 'clientes têm')} esse campo preenchido e perde${usados === 1 ? '' : 'm'} o valor.` : 'Nenhum cliente tem esse campo preenchido.'} Para só esconder e guardar os valores, desligue o campo na lista.</p>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      </ModalV2>
    );
  }

  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={520}
      titulo={<div>{campo ? 'Editar campo' : 'Novo campo'}<div className="mod-sub">{campo ? campo.nome : 'O que a equipe vai preencher sobre cada cliente'}</div></div>}
      rodape={<>
        {campo && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => { setErro(''); setConfirma(true); }}>Apagar campo</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{ocupado ? 'Salvando…' : campo ? 'Salvar alterações' : 'Criar campo'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="cmp-nome">Nome do campo</label>
          <input id="cmp-nome" className="inp" value={nome} maxLength={NOME_MAX} placeholder="ex.: Nome completo (RG)" autoFocus={!campo} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </div>
        <div className="pn-us-campo">
          <label htmlFor="cmp-tipo">Tipo</label>
          <select id="cmp-tipo" className="inp" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoCampo); setErro(''); }}>
            {(() => { const ok = tiposDisponiveis(temRecurso('venda-origem')); return ok.some((t) => t.valor === tipo) ? ok : [...ok, ...TIPOS_CAMPO.filter((t) => t.valor === tipo)]; })().map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
          <span className="cfgc-dica">{TIPOS_CAMPO.find((t) => t.valor === tipo)?.dica}{campo && campo.tipo !== tipo && usados > 0 ? '. Os valores já preenchidos continuam como estão.' : ''}</span>
        </div>
        {tipo === 'lista' && (
          <div className="pn-us-campo">
            <label htmlFor="cmp-ops">Opções, uma por linha</label>
            <textarea id="cmp-ops" className="inp" rows={5} value={opcoes} placeholder={'Agibank\nBMG\nMercantil'} onChange={(e) => { setOpcoes(e.target.value); setErro(''); }} />
            <span className="cfgc-dica">{plural(lista.length, 'opção', 'opções')} (até {OPCOES_MAX}).{tiradas.length ? ` Quem já tem ${tiradas.join(', ')} continua com o valor.` : ''}</span>
          </div>
        )}
        <label className="cfgc-chk">
          <input type="checkbox" checked={noCartao} disabled={!podeCartao} onChange={(e) => setNoCartao(e.target.checked)} />
          <span>Mostrar no cartão do Kanban{!podeCartao ? ` (já tem ${CARTAO_MAX} no cartão)` : ''}</span>
        </label>
        {campo && !campo.ativo && <BadgeStatus tom="atencao">Campo desligado: não aparece no painel do cliente</BadgeStatus>}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
