/* =================== NÚMEROS — WhatsApp da cobrança (dono 28/09: "mais profissional") ===================
   A régua manda cada cliente pelo número do COMERCIAL DONO dele (ou pelo número reserva,
   se configurado). Então a pergunta que a tela responde é "quem a cobrança alcança?":
   barra · 4 indicadores de cobertura · cartão por número (dono, status, carteira, última
   conferência/mensagem, sugestão de dono) · cobertura por comercial (quem ainda precisa
   de número). Markup ÚNICO: real (NumerosReviza) e demo (AbaNumerosDemo) só mudam a fonte.
   As janelas (conectar/QR/gerenciar) continuam nos donos da tela. */
import { useMemo } from 'react';
import { BadgeStatus, CardVidro, EstadoVazio, BotaoPrimario } from '../../components';
import { Indicador, pct1 } from './PainelResumo';
import './painel.css';

export type StatusNumero = 'conectado' | 'sincronizando' | 'desconectado';
export interface NumeroItem {
  id: string;
  nome: string;
  numero: string | null;        // já formatado
  status: StatusNumero;
  dono: string | null;          // nome do comercial dono (null = sem dono)
  donoId?: string | null;       // id do dono (06/11: quem pode gerenciar além do gestor é por ID, nunca pelo nome)
  reserva?: boolean;            // número reserva da régua
  verificadoEm?: string | null;
  ultimoEventoEm?: string | null;
  ultimoErro?: string | null;
  /** usuário cujo nome bate com o do número (só quando está SEM dono) */
  sugestao?: { id: string; nome: string } | null;
}
export interface ComercialCobertura { nome: string; emCobranca: number; comTelefone: number; usuarioId?: string | null }

const chave = (s: string | null | undefined) => (s || '').trim().toUpperCase();
const gente = (s: string) => s.trim().toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase());
const iniciais = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const quando = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
const ROT: Record<StatusNumero, string> = { conectado: 'Conectado', sincronizando: 'Conectando…', desconectado: 'Desconectado' };
const TOM: Record<StatusNumero, 'ok' | 'atencao' | 'erro'> = { conectado: 'ok', sincronizando: 'atencao', desconectado: 'erro' };
type Cobertura = 'proprio' | 'conectando' | 'desconectado' | 'reserva' | 'sem';

export function NumerosVista({ numeros, comerciais, gestor, meuId, meuNome, ocupado, aoConectar, aoGerenciar, aoReconectar, aoDefinirDono }: {
  numeros: NumeroItem[];
  comerciais: ComercialCobertura[];
  gestor: boolean;
  /** 06/11: id/nome de quem está vendo a tela — além do gestor, cada um gerencia SÓ o próprio número
      (null = não sabe quem é, ex. demo administrador: ninguém além do gestor gerencia) */
  meuId?: string | null;
  meuNome?: string | null;
  ocupado?: boolean;
  /** abre "Conectar WhatsApp" (com o dono já escolhido, se vier) */
  aoConectar: (usuarioId?: string | null) => void;
  aoGerenciar: (id: string) => void;
  aoReconectar: (id: string) => void;
  aoDefinirDono?: (canalId: string, usuarioId: string, nome: string) => void;
}) {
  const reservaOk = numeros.some((n) => n.reserva && n.status === 'conectado');
  const meuCanal = meuId ? numeros.find((n) => n.donoId === meuId) ?? null : null;
  const ehMeu = (n: NumeroItem) => !!meuId && n.donoId === meuId;
  const ehMeuNaTabela = (c: { nome: string }) => !!meuNome && chave(c.nome) === chave(meuNome);
  const cobertura = useMemo(() => comerciais.map((c) => {
    const meus = numeros.filter((n) => n.dono && chave(n.dono) === chave(c.nome));
    const conectado = meus.find((n) => n.status === 'conectado');
    const conectando = meus.find((n) => n.status === 'sincronizando');
    const st: Cobertura = conectado ? 'proprio' : conectando ? 'conectando' : meus.length ? 'desconectado' : reservaOk ? 'reserva' : 'sem';
    return { ...c, st, numero: conectado ?? conectando ?? meus[0] ?? null };
  }).sort((a, b) => b.emCobranca - a.emCobranca), [comerciais, numeros, reservaOk]);

  const totalCob = comerciais.reduce((s, c) => s + c.emCobranca, 0);
  const totalTel = comerciais.reduce((s, c) => s + c.comTelefone, 0);
  const alcancaveis = cobertura.filter((c) => c.st === 'proprio' || c.st === 'reserva');
  const alcanceN = alcancaveis.reduce((s, c) => s + c.emCobranca, 0);
  const alcanceTel = alcancaveis.reduce((s, c) => s + c.comTelefone, 0);
  const semNumero = cobertura.filter((c) => (c.st === 'sem' || c.st === 'desconectado' || c.st === 'conectando') && c.emCobranca > 0);
  const conectados = numeros.filter((n) => n.status === 'conectado').length;
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
  // carteira de um número = clientes EM COBRANÇA do dono (ou, sem dono, do nome do número — só informativo)
  const carteiraDe = (n: NumeroItem) => comerciais.find((c) => chave(c.nome) === chave(n.dono ?? n.nome)) ?? null;

  return (
    <div className="pn">
      <div className="pn-barra sobe">
        <div className="pn-barra-esq">
          <span className="pn-barra-rot">WhatsApp da cobrança</span>
          <span className="pn-barra-stat num"><b>{numeros.length}</b> número{numeros.length === 1 ? '' : 's'}</span>
          <span className="pn-barra-stat num"><b>{conectados}</b> conectado{conectados === 1 ? '' : 's'}</span>
        </div>
        <div className="pn-barra-dir">
          {gestor && <BotaoPrimario onClick={() => aoConectar(null)}>＋ Conectar WhatsApp</BotaoPrimario>}
          {!gestor && !meuCanal && meuId && <BotaoPrimario onClick={() => aoConectar(meuId)}>＋ Conectar meu WhatsApp</BotaoPrimario>}
        </div>
      </div>
      {!gestor && <p className="cm-hint" style={{ margin: '-6px 0 2px' }}>Os números da equipe aparecem pra todo mundo acompanhar — mas cada um só conecta e gerencia o <b>próprio</b> WhatsApp.</p>}

      <div className="pn-kpis sobe" style={{ animationDelay: '.04s' }}>
        <Indicador rotulo="Números conectados" valor={<>{conectados}<span className="pn-cent"> de {numeros.length}</span></>} tom={numeros.length && conectados === numeros.length ? 'ok' : conectados ? 'at' : 'er'}
          pe={numeros.length - conectados > 0 ? <><b className="num">{numeros.length - conectados}</b> sem conexão agora</> : numeros.length ? 'todos enviando e recebendo' : 'nenhum número ainda'}
          visual={<div className="pn-trilho"><i className="ok" style={{ width: `${pct(conectados, numeros.length)}%` }} /></div>} />
        <Indicador rotulo="Clientes que a régua alcança" valor={<>{pct1(pct(alcanceN, totalCob))}<span className="pn-cent">%</span></>} tom={alcanceN === totalCob && totalCob ? 'ok' : alcanceN ? 'at' : 'er'}
          pe={<><b className="num">{alcanceN.toLocaleString('pt-BR')}</b> de {totalCob.toLocaleString('pt-BR')} em cobrança têm o comercial com número</>}
          visual={<div className="pn-trilho"><i className={alcanceN ? 'at' : 'er'} style={{ width: `${pct(alcanceN, totalCob)}%` }} /></div>} />
        <Indicador rotulo="Com telefone cadastrado" valor={<>{pct1(pct(totalTel, totalCob))}<span className="pn-cent">%</span></>}
          pe={<><b className="num">{totalTel.toLocaleString('pt-BR')}</b> de {totalCob.toLocaleString('pt-BR')} clientes · {alcanceTel.toLocaleString('pt-BR')} já recebem</>}
          visual={<div className="pn-trilho"><i className="neutro" style={{ width: `${pct(totalTel, totalCob)}%` }} /></div>} />
        <Indicador rotulo="Comerciais sem número" valor={<>{semNumero.length}<span className="pn-cent"> de {cobertura.filter((c) => c.emCobranca > 0).length}</span></>} tom={semNumero.length ? 'er' : 'ok'}
          pe={semNumero.length ? <><b className="num">{semNumero.reduce((s, c) => s + c.emCobranca, 0).toLocaleString('pt-BR')}</b> clientes esperando um número</> : 'todos cobrindo a própria carteira'}
          visual={<div className="pn-trilho"><i className={semNumero.length ? 'er' : 'ok'} style={{ width: `${pct(semNumero.length, cobertura.filter((c) => c.emCobranca > 0).length)}%` }} /></div>} />
      </div>

      {numeros.length === 0 ? (
        <CardVidro spot sobe style={{ borderRadius: 'var(--r-card)' }}>
          <EstadoVazio titulo="Nenhum WhatsApp conectado" descricao="Conecte o número de cada comercial — a cobrança sai pelo número de quem atende o cliente."
            acao={gestor ? { rotulo: 'Conectar WhatsApp', onClick: () => aoConectar(null) } : meuId ? { rotulo: 'Conectar meu WhatsApp', onClick: () => aoConectar(meuId) } : undefined} />
        </CardVidro>
      ) : (
        <div className="pn-nums sobe" style={{ animationDelay: '.08s' }}>
          {numeros.map((n) => {
            const cart = carteiraDe(n);
            const semDono = !n.dono && !n.reserva;
            const titulo = gente(n.dono ?? n.nome);
            const v = quando(n.verificadoEm), e = quando(n.ultimoEventoEm);
            return (
              <CardVidro spot key={n.id} className={`pn-num ${n.status}`}>
                <div className="pn-num-cab">
                  <span className="pn-num-av" aria-hidden>{iniciais(titulo)}</span>
                  <div className="pn-num-quem">
                    <b>{titulo}</b>
                    <span className="num">{n.numero ?? 'Sem número conectado'}</span>
                  </div>
                  <BadgeStatus tom={TOM[n.status]}>{ROT[n.status]}</BadgeStatus>
                </div>

                {semDono ? (
                  <div className="pn-num-alerta">
                    <b>Sem comercial dono</b>
                    <span>A régua não manda por este número até ele ter um dono.</span>
                    {gestor && (n.sugestao && aoDefinirDono
                      ? <button type="button" className="pn-link" disabled={ocupado} onClick={() => aoDefinirDono(n.id, n.sugestao!.id, n.sugestao!.nome)}>Definir {gente(n.sugestao.nome)} como dono</button>
                      : <button type="button" className="pn-link" onClick={() => aoGerenciar(n.id)}>Escolher o dono</button>)}
                  </div>
                ) : (
                  <div className="pn-num-dono">
                    <span>{n.reserva && !n.dono ? 'Número reserva da régua' : <>Comercial dono: <b>{gente(n.dono ?? '')}</b></>}</span>
                    {n.reserva && n.dono && <span className="pn-tag suave">reserva</span>}
                  </div>
                )}

                <div className="pn-num-cart">
                  {cart ? (<>
                    <span className="num"><b>{cart.emCobranca}</b> em cobrança · <b>{cart.comTelefone}</b> com telefone</span>
                    <span className="pn-trilho"><i className={semDono ? 'neutro' : 'ok'} style={{ width: `${pct(cart.comTelefone, cart.emCobranca)}%` }} /></span>
                  </>) : <span className="pn-mut">Sem clientes em cobrança</span>}
                </div>

                {n.ultimoErro && n.status !== 'conectado' && <p className="pn-num-erro">{n.ultimoErro}</p>}

                <div className="pn-num-pe">
                  <span className="pn-num-meta num">
                    {v ? `conferido ${v}` : 'ainda não conferido'}{e ? ` · última mensagem ${e}` : ''}
                  </span>
                  {(gestor || ehMeu(n)) && (n.status === 'desconectado'
                    ? <button type="button" className="pn-link" disabled={ocupado} onClick={() => aoReconectar(n.id)}>Conectar de novo</button>
                    : <button type="button" className="pn-link" onClick={() => aoGerenciar(n.id)}>Gerenciar</button>)}
                </div>
              </CardVidro>
            );
          })}
        </div>
      )}

      {cobertura.length > 0 && (
        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.12s' }}>
          <div className="pn-card-cab">
            <div><h3>Cobertura por comercial</h3><p>A régua manda cada cliente pelo número do comercial dele. Quem está sem número fica esperando.</p></div>
          </div>
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab">
              <thead>
                <tr>
                  <th scope="col">Comercial</th>
                  <th scope="col" className="num">Em cobrança</th>
                  <th scope="col">Com telefone</th>
                  <th scope="col">Número</th>
                  <th scope="col"><span className="pn-vh">Ação</span></th>
                </tr>
              </thead>
              <tbody>
                {cobertura.map((c) => (
                  <tr key={c.nome}>
                    <td><span className="pn-eq-nome estatico"><span className="pn-av" aria-hidden>{iniciais(gente(c.nome))}</span><span className="pn-eq-nm">{gente(c.nome)}</span></span></td>
                    <td className="num"><b>{c.emCobranca}</b></td>
                    <td>
                      <span className="pn-eq-adim">
                        <span className="pn-eq-adim-v num">{c.comTelefone}</span>
                        <span className="pn-trilho"><i className="neutro" style={{ width: `${pct(c.comTelefone, c.emCobranca)}%` }} /></span>
                        <span className="pn-mut num">{pct1(pct(c.comTelefone, c.emCobranca))}%</span>
                      </span>
                    </td>
                    <td>
                      {c.st === 'proprio' ? <BadgeStatus tom="ok">Conectado{c.numero?.numero ? ` · ${c.numero.numero}` : ''}</BadgeStatus>
                        : c.st === 'conectando' ? <BadgeStatus tom="atencao">Conectando…</BadgeStatus>
                        : c.st === 'desconectado' ? <BadgeStatus tom="erro">Número desconectado</BadgeStatus>
                        : c.st === 'reserva' ? <BadgeStatus tom="atencao">Pelo número reserva</BadgeStatus>
                        : <BadgeStatus tom="neutro">Sem número</BadgeStatus>}
                    </td>
                    <td className="pn-fin-acoes">
                      {(gestor || ehMeuNaTabela(c)) && (c.st === 'sem' || c.st === 'reserva') && <button type="button" className="pn-link" onClick={() => aoConectar(gestor ? (c.usuarioId ?? null) : meuId)}>Conectar número</button>}
                      {(gestor || ehMeuNaTabela(c)) && c.st === 'conectando' && c.numero && <button type="button" className="pn-link" onClick={() => aoGerenciar(c.numero!.id)}>Gerenciar</button>}
                      {(gestor || ehMeuNaTabela(c)) && c.st === 'desconectado' && c.numero && <button type="button" className="pn-link" disabled={ocupado} onClick={() => aoReconectar(c.numero!.id)}>Conectar de novo</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardVidro>
      )}
    </div>
  );
}
