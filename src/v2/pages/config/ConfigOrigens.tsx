/* CONFIGURAÇÕES → ORIGEM DO LEAD (26/11, "igual" ao sistema que a Reviza usava antes: "o sistema identifica sozinho; sem
   origem, o lead aparece como Indefinida"). Três partes:
     De onde vieram   as conversas novas do período por origem (barras) e os anúncios que mais trouxeram gente
     Origens          as que a empresa cadastra (como "Indicação de cliente" ou "URA"): nome, código e ligada
     Números          a origem de cada número de WhatsApp do Atendimento (quem chega nele, vem dessa origem)
   O anúncio do Facebook/Instagram o próprio sistema reconhece (não precisa cadastrar). Só o administrador.
   Dados: @/data/vendaOrigem (migration 111). */
import { useMemo, useState } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2, Segmentado, Toggle } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { formatarTelefone } from '../../lib/telefone';
import { useConexoesWA } from '../../data/config/conexoes';
import {
  slugOrigem, useApagarOrigem, useDefinirOrigemDoNumero, useOrigemDosNumeros, useOrigens, useResumoOrigens, useSalvarOrigem, validarOrigem, type Origem,
} from '@/data/vendaOrigem';
import '../painel/painel.css';
import './camposMotivos.css';

const PERIODOS = [{ valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: '90', rotulo: '90 dias' }];
const COMO: Record<string, string> = { anuncio: 'o sistema reconhece o anúncio', numero: 'pela origem do número', nenhuma: 'sem anúncio e sem origem no número' };
const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : '0%');

export function ConfigOrigens() {
  const [dias, setDias] = useState('30');
  const res = useResumoOrigens(Number(dias));
  const ori = useOrigens();
  const con = useConexoesWA();
  const numeros = useMemo(() => con.lista.filter((c) => c.ambiente === 'atendimento'), [con.lista]);
  const doNumero = useOrigemDosNumeros(numeros.map((n) => n.id));
  const definir = useDefinirOrigemDoNumero();
  const salvar = useSalvarOrigem();
  const [janela, setJanela] = useState<{ origem: Origem | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const origens = ori.data ?? [];
  const r = res.data;
  const max = Math.max(1, ...(r?.porOrigem ?? []).map((x) => x.qtd));
  const maxAn = Math.max(1, ...(r?.anuncios ?? []).map((x) => x.qtd));

  const mudarNumero = async (canalId: string, nome: string, origemId: string) => {
    try { await definir.mutateAsync({ canalId, origemId: origemId || null }); setAviso({ tom: 'ok', texto: origemId ? `Quem chegar em ${nome} vem de "${origens.find((o) => o.id === origemId)?.nome}".` : `${nome} ficou sem origem.` }); }
    catch (x) { setAviso({ tom: 'erro', texto: (x as Error).message }); }
  };

  return (
    <div className="pn cfgw cfgo" data-config-origens>
      <AcoesNoTopo><BotaoPrimario onClick={() => setJanela({ origem: null })}>＋ Nova origem</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab cfgm-hist-cab">
          <div><h3>De onde vieram</h3><p>{r ? (r.total ? `${r.total} ${r.total === 1 ? 'conversa nova' : 'conversas novas'} nos últimos ${r.dias} dias.` : `Nenhuma conversa nova nos últimos ${r.dias} dias.`) : 'As conversas novas do período, por origem.'}</p></div>
          <Segmentado rotulo="Período" opcoes={PERIODOS} valor={dias} aoMudar={setDias} />
        </div>
        {res.isLoading ? <p className="pn-vazio">Carregando…</p>
          : res.isError ? <EstadoErro titulo="Não foi possível carregar as origens" descricao={(res.error as Error).message} aoTentarDeNovo={() => void res.refetch()} />
          : !r || r.total === 0 ? <p className="pn-vazio">Quando chegarem conversas novas, a origem de cada uma aparece aqui.</p>
          : (
            <div className="cfgo-res">
              <div>
                <h4 className="cfgv-h4">Por origem</h4>
                <ul className="cfgm-barras" aria-label="Conversas novas por origem">
                  {r.porOrigem.map((x) => (
                    <li key={x.origem} title={`${x.origem}: ${COMO[x.como]}`}>
                      <span className="cfgm-b-rot">{x.origem}</span>
                      <span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (x.qtd / max) * 100)}%` }} /></span>
                      <span className="cfgm-b-n num">{x.qtd}<small className="cfgo-pct"> {pct(x.qtd, r.total)}</small></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="cfgv-h4">Anúncios que mais trouxeram</h4>
                {r.anuncios.length === 0 ? <p className="cfgc-dica">Nenhuma conversa veio de anúncio no período.</p> : (
                  <ul className="cfgm-barras" aria-label="Conversas por anúncio">
                    {r.anuncios.map((x) => (
                      <li key={x.anuncio}><span className="cfgm-b-rot" title={x.anuncio}>{x.anuncio}</span><span className="cfgm-b-trilho" aria-hidden><span style={{ width: `${Math.max(4, (x.qtd / maxAn) * 100)}%` }} /></span><span className="cfgm-b-n num">{x.qtd}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        <p className="cfgc-pe">Como o sistema decide: primeiro o anúncio do Facebook ou do Instagram (reconhecido sozinho); depois a origem do número de WhatsApp em que o cliente chegou; sem nenhum dos dois, "Indefinida".</p>
      </CardVidro>

      <div className="cfgm-grade">
        <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
          <div className="pn-card-cab"><div><h3>Origens</h3><p>As que a empresa cadastra. O anúncio não precisa: o sistema reconhece.</p></div></div>
          {ori.isLoading ? <p className="pn-vazio">Carregando…</p>
            : ori.isError ? <EstadoErro titulo="Não foi possível carregar as origens" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void ori.refetch()} />
            : origens.length === 0 ? <EstadoVazio titulo="Nenhuma origem cadastrada" descricao='Cadastre as que não são anúncio, como "Indicação de cliente" ou "URA".' acao={{ rotulo: '＋ Nova origem', onClick: () => setJanela({ origem: null }) }} />
            : (
              <ul className="cfgm-lista">
                {origens.map((o) => (
                  <li key={o.id} className={o.ativo ? undefined : 'desl'}>
                    <Toggle ligado={o.ativo} rotulo={`Origem ${o.nome} ligada`} disabled={salvar.isPending}
                      aoMudar={(v) => void salvar.mutateAsync({ ...o, ativo: v }).then(() => setAviso({ tom: 'ok', texto: v ? `"${o.nome}" ligada.` : `"${o.nome}" desligada: não aparece mais para escolher.` })).catch((x) => setAviso({ tom: 'erro', texto: (x as Error).message }))} />
                    <span className="cfgm-nome">{o.nome}<small>{[o.slug ? `código ${o.slug}` : null, o.descricao].filter(Boolean).join(' · ') || 'Sem descrição'}</small></span>
                    <span />
                    <BotaoSec mini onClick={() => setJanela({ origem: o })}>Editar</BotaoSec>
                  </li>
                ))}
              </ul>
            )}
        </CardVidro>

        <CardVidro className="pn-card sobe" style={{ animationDelay: '.08s' }}>
          <div className="pn-card-cab"><div><h3>Números de WhatsApp</h3><p>Quem chega no número, sem vir de anúncio, fica com a origem escolhida aqui.</p></div></div>
          {con.carregando ? <p className="pn-vazio">Carregando os números…</p>
            : numeros.length === 0 ? <p className="pn-vazio">Nenhum número do Atendimento conectado ainda. Conecte em Configurações › WhatsApp.</p>
            : (
              <ul className="cfgm-lista cfgo-nums">
                {numeros.map((n) => (
                  <li key={n.id}>
                    <span className="cfgm-nome">{n.nome}<small className="num">{n.numero ? formatarTelefone(n.numero) || n.numero : 'aguardando o QR Code'}</small></span>
                    <select className="inp" aria-label={`Origem de ${n.nome}`} value={doNumero.data?.[n.id] ?? ''} disabled={definir.isPending || doNumero.isLoading}
                      onChange={(e) => void mudarNumero(n.id, n.nome, e.target.value)}>
                      <option value="">Sem origem</option>
                      {origens.filter((o) => o.ativo || o.id === doNumero.data?.[n.id]).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
        </CardVidro>
      </div>

      {janela && <JanelaOrigem key={janela.origem?.id ?? 'nova'} origem={janela.origem} origens={origens} aoFechar={() => setJanela(null)} aoAvisar={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaOrigem({ origem, origens, aoFechar, aoAvisar }: { origem: Origem | null; origens: Origem[]; aoFechar: () => void; aoAvisar: (t: string) => void }) {
  const salvar = useSalvarOrigem();
  const apagar = useApagarOrigem();
  const [nome, setNome] = useState(origem?.nome ?? '');
  const [slug, setSlug] = useState(origem?.slug ?? '');
  const [descricao, setDescricao] = useState(origem?.descricao ?? '');
  const [erro, setErro] = useState('');
  const ocupado = salvar.isPending || apagar.isPending;
  const gravar = async () => {
    const e = validarOrigem({ nome, slug: slug || null }, origens, origem?.id); if (e) { setErro(e); return; }
    try { await salvar.mutateAsync({ id: origem?.id, nome, slug: slug || slugOrigem(nome), descricao, ativo: origem?.ativo ?? true }); aoAvisar(origem ? `Origem "${nome.trim()}" atualizada.` : `Origem "${nome.trim()}" criada. Escolha os números dela ao lado.`); aoFechar(); }
    catch (x) { setErro((x as Error).message); }
  };
  const remover = async () => {
    if (!origem) return;
    try { await apagar.mutateAsync(origem.id); aoAvisar(`Origem "${origem.nome}" apagada.`); aoFechar(); } catch (x) { setErro((x as Error).message); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={480}
      titulo={<div>{origem ? 'Editar origem' : 'Nova origem'}<div className="mod-sub">De onde o lead veio, quando não é anúncio</div></div>}
      rodape={<>
        {origem && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{apagar.isPending ? 'Apagando…' : 'Apagar origem'}</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : origem ? 'Salvar' : 'Criar origem'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="ori-nome">Nome da origem</label>
          <input id="ori-nome" className="inp" value={nome} maxLength={60} autoFocus placeholder="ex.: Indicação de cliente" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </div>
        <div className="pn-us-campo">
          <label htmlFor="ori-slug">Código (opcional)</label>
          <input id="ori-slug" className="inp" value={slug} maxLength={40} placeholder={slugOrigem(nome) || 'ex.: indicacao'} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setErro(''); }} />
          <span className="cfgc-dica">O nome curto que outros sistemas mandam (como o "utm_source" de um link). Em branco, o sistema cria a partir do nome.</span>
        </div>
        <div className="pn-us-campo">
          <label htmlFor="ori-desc">Descrição (opcional)</label>
          <input id="ori-desc" className="inp" value={descricao} maxLength={200} placeholder="ex.: quem chegou pela indicação de outro cliente" onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
