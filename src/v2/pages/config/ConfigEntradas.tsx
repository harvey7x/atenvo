/* CONFIGURAÇÕES → INTEGRAÇÕES → RECEBER DE OUTROS SISTEMAS (dono 23/11 — a URA: ela liga para o cliente e, se
   ele tem interesse, manda uma mensagem; o fornecedor integra com o nosso por webhook).
   Cada endereço tem uma chave secreta e um número de WhatsApp do Atendimento: tudo o que chega por ele vira
   conversa nesse número (e na equipe dona dele) e lead em LEAD NOVO. A tela cria o endereço, mostra o que copiar
   para o fornecedor, testa, liga/desliga e lista o que chegou. Dados: data/config/entradas.ts. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, ModalV2 } from '../../components';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { formatarTelefone } from '../../lib/telefone';
import { useConexoesWA } from '../../data/config/conexoes';
import {
  EXEMPLO_ENVIO, enderecoTelein, lerTeclas, useAlterarEntrada, useCriarEntrada, useEntradas, useEventosEntradas, useExcluirEntrada, useTestarEntrada,
  type Entrada, type ResultadoEvento,
} from '../../data/config/entradas';
import '../painel/painel.css';

const ROT: Record<ResultadoEvento, string> = { ok: 'Virou lead', teste: 'Teste', ignorada: 'Outra tecla', sem_telefone: 'Sem telefone', desligada: 'Desligado', sem_numero: 'Sem número', erro: 'Erro' };
const TOM: Record<ResultadoEvento, 'ok' | 'atencao' | 'erro' | 'neutro'> = { ok: 'ok', teste: 'neutro', ignorada: 'neutro', sem_telefone: 'erro', desligada: 'atencao', sem_numero: 'atencao', erro: 'erro' };
const teclasTx = (o: string[]) => (o.length ? `tecla ${o.join(' ou ')}` : 'qualquer tecla');
const ERRO_TESTE: Record<string, string> = {
  chave_invalida: 'O endereço não foi reconhecido.', desligada: 'O recebimento deste endereço está desligado.',
  sem_telefone: 'O envio de teste não trouxe um telefone válido.', sem_numero: 'Escolha o número de WhatsApp deste endereço.',
};
function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  const tz = { timeZone: 'America/Sao_Paulo' } as const;
  const hoje = new Date().toLocaleDateString('pt-BR', tz) === d.toLocaleDateString('pt-BR', tz);
  return hoje ? `hoje, ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
/** telefone com o meio escondido: o suficiente para reconhecer, sem expor o número inteiro na lista */
const foneCurto = (t: string | null) => { if (!t) return '—'; const f = formatarTelefone(t) || t; return f.replace(/(\d{4,5})-(\d{4})$/, (_m, _a, b) => `•••••-${b}`); };

function Copiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return <BotaoSec mini onClick={() => { void navigator.clipboard?.writeText(texto).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1600); }); }}>{ok ? 'Copiado' : rotulo}</BotaoSec>;
}

export function ConfigEntradas() {
  const ir = useNavigate();
  const q = useEntradas();
  const ev = useEventosEntradas();
  const con = useConexoesWA();
  const alterar = useAlterarEntrada();
  const testar = useTestarEntrada();
  const [nova, setNova] = useState(false);
  const [excluir, setExcluir] = useState<Entrada | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const numeros = useMemo(() => con.lista.filter((c) => c.ambiente === 'atendimento'), [con.lista]);
  const nomeNumero = (id: string | null) => numeros.find((n) => n.id === id)?.nome ?? null;
  const entradas = q.data ?? [];
  const nomeEntrada = (id: string) => entradas.find((e) => e.id === id)?.nome ?? '—';

  const fazerTeste = async (e: Entrada) => {
    setAviso(null);
    try {
      const r = await testar.mutateAsync(e);
      setAviso(r.ok ? { tom: 'ok', texto: `Teste recebido em ${e.nome}: o endereço está funcionando. Nada foi criado.` } : { tom: 'erro', texto: ERRO_TESTE[r.erro ?? ''] ?? 'O teste não passou. Tente de novo.' });
    } catch { setAviso({ tom: 'erro', texto: 'Não foi possível falar com o endereço. Confira a internet e tente de novo.' }); }
  };

  return (
    <div className="pn cfgw cfgr">
      <AcoesNoTopo><BotaoPrimario onClick={() => setNova(true)}>＋ Novo endereço</BotaoPrimario></AcoesNoTopo>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab pn-us-cab"><div><h3>Endereços para receber</h3><p>Cada sistema de fora recebe o seu endereço. O que chegar vira conversa no número escolhido e lead em LEAD NOVO.</p></div></div>
        {q.isLoading ? <p className="pn-vazio">Carregando…</p>
          : q.isError ? <EstadoErro titulo="Não foi possível carregar" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
          : entradas.length === 0 ? <EstadoVazio titulo="Nenhum endereço ainda" descricao="Crie o endereço da URA (ou de outro sistema) e passe para o fornecedor." acao={{ rotulo: '＋ Novo endereço', onClick: () => setNova(true) }} />
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgr-tab">
                <thead><tr><th scope="col">Sistema</th><th scope="col">WhatsApp que atende</th><th scope="col">Vira lead</th><th scope="col">Situação</th><th scope="col">Último recebido</th><th scope="col">Recebidos</th><th scope="col"><span className="pn-vh">Ações</span></th></tr></thead>
                <tbody>
                  {entradas.map((e) => (
                    <tr key={e.id} className={e.ativo ? undefined : 'pn-us-inativo'}>
                      <td><span className="pn-eq-nm"><span>{e.nome}</span><small className="num">endereço terminado em {e.chave.slice(-6)}</small></span></td>
                      <td><span className="pn-us-amb-tx">{nomeNumero(e.canalId) ?? 'Escolha um número'}</span></td>
                      <td><span className="pn-us-amb-tx">{teclasTx(e.opcoes)}</span></td>
                      <td><BadgeStatus tom={e.ativo ? 'ok' : 'atencao'}>{e.ativo ? 'Recebendo' : 'Desligado'}</BadgeStatus></td>
                      <td><span className="pn-us-amb-tx num">{quando(e.ultimoEventoEm)}</span></td>
                      <td><span className="num">{e.totalEventos}</span></td>
                      <td className="pn-fin-acoes"><span className="pn-us-acoes">
                        <Copiar texto={enderecoTelein(e.chave)} rotulo="Copiar endereço" />
                        <BotaoSec mini disabled={testar.isPending} onClick={() => void fazerTeste(e)}>Testar</BotaoSec>
                        <BotaoSec mini disabled={alterar.isPending} onClick={() => alterar.mutate({ entrada: e, ativo: !e.ativo })}>{e.ativo ? 'Desligar' : 'Ligar'}</BotaoSec>
                        <BotaoSec mini onClick={() => setExcluir(e)}>Excluir</BotaoSec>
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </CardVidro>

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>Últimos recebimentos</h3><p>O que os sistemas de fora mandaram, do mais novo para o mais antigo.</p></div></div>
        {(ev.data ?? []).length === 0 ? <p className="pn-vazio">Nada recebido ainda. Use "Testar" para conferir o endereço.</p> : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfgr-tab">
              <thead><tr><th scope="col">Quando</th><th scope="col">Sistema</th><th scope="col">Cliente</th><th scope="col">Resultado</th><th scope="col"><span className="pn-vh">Ações</span></th></tr></thead>
              <tbody>
                {(ev.data ?? []).map((x) => (
                  <tr key={x.id}>
                    <td><span className="pn-us-amb-tx num">{quando(x.recebidoEm)}</span></td>
                    <td><span className="pn-us-amb-tx">{nomeEntrada(x.entradaId)}</span></td>
                    <td><span className="pn-eq-nm"><span>{x.nome || 'Sem nome'}</span><small className="num">{foneCurto(x.telefone)}</small></span></td>
                    <td><BadgeStatus tom={TOM[x.resultado]}>{ROT[x.resultado]}</BadgeStatus>{x.detalhe && <span className={TOM[x.resultado] === 'erro' || TOM[x.resultado] === 'atencao' ? 'pn-us-1a' : 'cfgr-det'}>{x.detalhe}</span>}</td>
                    <td className="pn-fin-acoes"><span className="pn-us-acoes">{x.conversaId && <BotaoSec mini onClick={() => ir(`/whatsapp?conversa=${x.conversaId}`)}>Abrir conversa</BotaoSec>}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardVidro>

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
        <div className="pn-card-cab"><div><h3>Como ligar na URA reversa (Telein)</h3><p>A URA liga, o cliente aperta a tecla e a Telein chama o endereço com os dados dele.</p></div></div>
        <ol className="cfgr-passos">
          <li>Aqui, crie o endereço e clique em <b>Copiar endereço</b>. Ele já vem com os campos da Telein: nome, telefone, mailing, campanha, tecla, email, endereço e cidade.</li>
          <li>Na Telein, em <b>Ura Reversa e Discadora › Criar Campanhas</b>, abra as configurações da campanha.</li>
          <li>Cole no campo <b>URL</b>, em <b>Executar ao selecionar uma opção</b>, e clique em <b>Salvar</b>.</li>
          <li>Em <b>Escolha qual chip utilizar</b>, use o mesmo número de WhatsApp que está conectado aqui: assim a resposta do cliente chega no Atenvo, na mesma conversa.</li>
          <li>Volte aqui e confira em <b>Últimos recebimentos</b>.</li>
        </ol>
        <div className="pn-card-cab cfgr-sub"><div><h3>Outros sistemas</h3><p>Qualquer sistema pode chamar o mesmo tipo de endereço.</p></div></div>
        <div className="cfgr-instr">
          <dl className="cfgr-dl">
            <div><dt>Método</dt><dd>POST (também aceita GET com os dados no endereço)</dd></div>
            <div><dt>Formato</dt><dd>JSON ou formulário</dd></div>
            <div><dt>Campos</dt><dd><b>telefone</b> (obrigatório, com DDD) · <b>nome</b> · <b>mensagem</b> · campanha · mailing · opcao · email · endereco · cidade — também aceita numero, phone, name, message, texto, celular</dd></div>
            <div><dt>Respostas</dt><dd>200 recebido · 401 endereço errado · 403 desligado · 422 sem telefone</dd></div>
            <div><dt>Marcadores</dt><dd>Valor que chega como *marcador* (não trocado) conta como vazio</dd></div>
          </dl>
          <div className="cfgr-exemplo">
            <div className="cfgr-exemplo-cab"><span>Exemplo do envio</span><Copiar texto={JSON.stringify(EXEMPLO_ENVIO, null, 2)} /></div>
            <pre>{JSON.stringify(EXEMPLO_ENVIO, null, 2)}</pre>
          </div>
        </div>
        <p className="cfgr-nota">Se a URA mandar o WhatsApp de um número que não está conectado aqui, o lead chega do mesmo jeito, mas a resposta do cliente vai para a URA: aí o atendente continua a conversa pelo número escolhido neste endereço.</p>
      </CardVidro>

      {nova && <JanelaNova numeros={numeros.map((n) => ({ id: n.id, nome: n.nome }))} aoFechar={() => setNova(false)} aoCriar={(t) => setAviso({ tom: 'ok', texto: t })} />}
      {excluir && <JanelaExcluir entrada={excluir} aoFechar={() => setExcluir(null)} aoExcluir={(t) => setAviso({ tom: 'ok', texto: t })} />}
    </div>
  );
}

function JanelaNova({ numeros, aoFechar, aoCriar }: { numeros: { id: string; nome: string }[]; aoFechar: () => void; aoCriar: (t: string) => void }) {
  const criar = useCriarEntrada();
  const [nome, setNome] = useState('URA');
  const [canal, setCanal] = useState(numeros[0]?.id ?? '');
  const [teclas, setTeclas] = useState('');
  const [erro, setErro] = useState('');
  const [feita, setFeita] = useState<Entrada | null>(null);
  const gravar = async () => {
    setErro('');
    try { const e = await criar.mutateAsync({ nome, canalId: canal, opcoes: lerTeclas(teclas) }); setFeita(e); aoCriar(`Endereço ${e.nome} criado. Copie e passe para o fornecedor.`); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível criar. Tente de novo.'); }
  };
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={560}
      titulo={<div>{feita ? 'Endereço criado' : 'Novo endereço'}<div className="mod-sub">{feita ? 'Passe este endereço para o fornecedor' : 'Para receber de outro sistema, como a URA'}</div></div>}
      rodape={feita ? <BotaoPrimario onClick={aoFechar}>Concluir</BotaoPrimario>
        : <><BotaoSec onClick={aoFechar} disabled={criar.isPending}>Cancelar</BotaoSec><BotaoPrimario disabled={criar.isPending || numeros.length === 0} onClick={() => void gravar()}>{criar.isPending ? 'Criando…' : 'Criar endereço'}</BotaoPrimario></>}>
      {feita ? (
        <div className="pn-us-form">
          <span className="pn-us-rot">Endereço para colar na Telein (Executar ao selecionar uma opção)</span>
          <div className="cfgr-endereco"><code>{enderecoTelein(feita.chave)}</code><Copiar texto={enderecoTelein(feita.chave)} rotulo="Copiar endereço" /></div>
          <span className="pn-us-dica">Guarde como uma senha: quem tiver este endereço consegue mandar clientes para o sistema. Se vazar, exclua e crie outro.</span>
        </div>
      ) : (
        <div className="pn-us-form">
          <div className="pn-us-campo">
            <label htmlFor="ent-nome">Nome do sistema</label>
            <input id="ent-nome" className="inp" value={nome} maxLength={40} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
            <span className="pn-us-dica">Aparece na conversa ("Chegou pela integração URA") e vira etiqueta no cliente.</span>
          </div>
          <div className="pn-us-campo">
            <label htmlFor="ent-canal">WhatsApp do Atendimento que vai atender</label>
            {numeros.length === 0
              ? <span className="pn-us-dica">Conecte primeiro um número do Atendimento em Configurações › WhatsApp.</span>
              : <select id="ent-canal" className="inp" value={canal} onChange={(e) => { setCanal(e.target.value); setErro(''); }}>{numeros.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}</select>}
            <span className="pn-us-dica">A conversa abre neste número; o gerente da equipe dele vê e passa para um atendente.</span>
          </div>
          <div className="pn-us-campo">
            <label htmlFor="ent-teclas">Teclas que viram lead (opcional)</label>
            <input id="ent-teclas" className="inp" value={teclas} placeholder="ex.: 1" maxLength={20} inputMode="numeric" onChange={(e) => setTeclas(e.target.value)} />
            <span className="pn-us-dica">A tecla que o cliente aperta no fim do áudio. Em branco, qualquer tecla vira lead; as outras ficam registradas em Últimos recebimentos.</span>
          </div>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
    </ModalV2>
  );
}

function JanelaExcluir({ entrada, aoFechar, aoExcluir }: { entrada: Entrada; aoFechar: () => void; aoExcluir: (t: string) => void }) {
  const excluir = useExcluirEntrada();
  const [erro, setErro] = useState('');
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={440} titulo={<div>Excluir o endereço {entrada.nome}?<div className="mod-sub">As conversas que já chegaram continuam</div></div>}
      rodape={<><BotaoSec onClick={aoFechar} disabled={excluir.isPending}>Voltar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={excluir.isPending} onClick={() => { setErro(''); excluir.mutate(entrada, { onSuccess: () => { aoExcluir(`Endereço ${entrada.nome} excluído.`); aoFechar(); }, onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível excluir.') }); }}>{excluir.isPending ? 'Excluindo…' : 'Excluir endereço'}</button></>}>
      <div className="pn-us-form">
        <p className="cfge-texto">O sistema de fora deixa de conseguir mandar clientes por este endereço na hora. Para voltar a receber, crie um endereço novo e passe para o fornecedor.</p>
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
