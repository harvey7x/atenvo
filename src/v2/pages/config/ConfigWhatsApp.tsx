/* CONFIGURAÇÕES → WHATSAPP (dono 22/11): "conectar o WhatsApp via QR Code, e aí tem que escolher para
   que é esse WhatsApp — se é para as pessoas do ambiente Cobranças ou do Atendimento".
   Uma lista com os números dos dois ambientes; "Conectar WhatsApp" pergunta primeiro o ambiente:
     · Cobranças → o comercial dono do número (a régua manda os clientes dele por esse número);
     · Atendimento → o nome do número (recebe quem chama a empresa).
   Depois o QR Code e a confirmação. Gerenciar: dono (Cobranças), verificar, conectar de novo,
   desconectar e remover. Os dados e as chamadas vêm de data/config/conexoes.ts. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, Kpi, ModalV2 } from '../../components';
import { IconeTile } from '../../components/CartaoMetrica';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { formatarTelefone } from '../../lib/telefone';
import { ROTULO_AMBIENTE, ambientesDoPerfil, type Ambiente } from '../../data/modulos';
import { useConectarWA, useDefinirDonoWA, useDesconectarWA, useNovoQrWA, useRemoverWA, useVerificarCanalWA } from '../../data/wa/wa';
import { temRecurso } from '../../data/config/recursos';
import { useAcoesAtendimento, useConexoesWA, type ConexaoWA, type EstadoConexao } from '../../data/config/conexoes';
import { useEquipes } from '../../data/config/equipes';
import type { UsuarioRow } from '../../data/cobranca/usuarios';
import '../painel/painel.css';

const ROT_ESTADO: Record<EstadoConexao, string> = { conectado: 'Conectado', conectando: 'Conectando…', desconectado: 'Desconectado' };
const TOM_ESTADO: Record<EstadoConexao, 'ok' | 'atencao' | 'erro'> = { conectado: 'ok', conectando: 'atencao', desconectado: 'erro' };
const DESC_AMBIENTE: Record<Ambiente, string> = {
  cobrancas: 'A régua de cobrança e as Conversas de Cobranças saem por este número. Cada número tem um comercial dono: os clientes dele recebem por ele.',
  atendimento: 'Recebe quem chama a empresa. As conversas entram no WhatsApp e no Kanban do Atendimento, para a equipe de atendimento.',
};
const fone = (n: string | null) => (n ? formatarTelefone(n) || n : null);
const iniciais = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
/** "14:32" se for hoje; "21/11 14:32" se não */
function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  const tz = { timeZone: 'America/Sao_Paulo' } as const;
  const hoje = new Date().toLocaleDateString('pt-BR', tz) === d.toLocaleDateString('pt-BR', tz);
  return hoje ? `hoje, ${d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { ...tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
const SeloAmbiente = ({ a }: { a: Ambiente }) => <span className={`cfgw-amb ${a}`}>{ROTULO_AMBIENTE[a]}</span>;

/** o Atendimento existe nesta instalação? (config/recursos.ts) Sem ele, esta é a tela dos números de Cobranças */
const TEM_ATD = temRecurso('atendimento');
type Filtro = 'todos' | Ambiente;
type Janela = { tipo: 'conectar'; reconectar?: ConexaoWA } | { tipo: 'gerenciar'; chave: string };

export function ConfigWhatsApp() {
  const q = useConexoesWA();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const avisar = (texto: string, tom: 'ok' | 'erro' = 'ok') => setAviso({ texto, tom });

  const lista = q.lista;
  // equipes (23/11): cada número do Atendimento é de uma equipe (Configurações → Equipes)
  const equipesQ = useEquipes();
  const equipeDoNumero = (id: string) => (equipesQ.data ?? []).find((e) => e.canais.includes(id))?.nome ?? null;
  const n = (f: (c: ConexaoWA) => boolean) => lista.filter(f).length;
  const conectados = n((c) => c.estado === 'conectado');
  const visiveis = filtro === 'todos' ? lista : lista.filter((c) => c.ambiente === filtro);
  const aberta = janela?.tipo === 'gerenciar' ? lista.find((c) => c.chave === janela.chave) ?? null : null;
  const comerciaisAtivos = q.usuarios.filter((u) => u.ativo && u.papel === 'comercial');
  const comNumero = comerciaisAtivos.filter((u) => lista.some((c) => c.ambiente === 'cobrancas' && c.donoId === u.id)).length;
  const notaAmb = (a: Ambiente) => { const t = n((c) => c.ambiente === a); const on = n((c) => c.ambiente === a && c.estado === 'conectado'); return t ? `${on} de ${t} conectado${on === 1 ? '' : 's'}` : 'Nenhum número ainda'; };

  return (
    <div className="pn cfgw">
      <AcoesNoTopo>
        <BotaoPrimario onClick={() => setJanela({ tipo: 'conectar' })}>＋ Conectar WhatsApp</BotaoPrimario>
      </AcoesNoTopo>

      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <div className="kpis sobe">
        <Kpi rotulo="Números conectados" icone={<IconeTile nome="sinal" />} valor={conectados} nota={lista.length ? `de ${lista.length} cadastrado${lista.length === 1 ? '' : 's'}` : 'Nenhum número ainda'} />
        {TEM_ATD ? (<>
          <Kpi rotulo="Cobranças" icone={<IconeTile nome="moeda" />} valor={n((c) => c.ambiente === 'cobrancas')} nota={notaAmb('cobrancas')} />
          <Kpi rotulo="Atendimento" icone={<IconeTile nome="balao" />} valor={n((c) => c.ambiente === 'atendimento')} nota={notaAmb('atendimento')} />
        </>) : (<>
          <Kpi rotulo="Comerciais com número" icone={<IconeTile nome="moeda" />} valor={comNumero} nota={`de ${comerciaisAtivos.length} ${comerciaisAtivos.length === 1 ? 'comercial ativo' : 'comerciais ativos'}`} />
          <Kpi rotulo="Comerciais sem número" icone={<IconeTile nome="balao" />} valor={comerciaisAtivos.length - comNumero} nota={comerciaisAtivos.length - comNumero ? 'A régua não alcança os clientes deles' : 'Todos cobertos pela régua'} />
        </>)}
        <Kpi rotulo="Sem conexão" icone={<IconeTile nome="alerta" />} valor={n((c) => c.estado !== 'conectado')} nota={n((c) => c.estado !== 'conectado') ? 'Não enviam nem recebem agora' : 'Todos enviando e recebendo'} />
      </div>

      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.06s' }}>
        <div className="pn-card-cab pn-us-cab">
          {TEM_ATD && <div className="pn-us-filtros">
            <div className="pn-fin-seg" role="tablist" aria-label="Filtrar por ambiente">
              {([['todos', 'Todos', lista.length], ['cobrancas', 'Cobranças', n((c) => c.ambiente === 'cobrancas')], ['atendimento', 'Atendimento', n((c) => c.ambiente === 'atendimento')]] as const).map(([id, rot, tot]) => (
                <button key={id} type="button" role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : undefined} onClick={() => setFiltro(id)}>{rot}<span className="num">{tot}</span></button>
              ))}
            </div>
          </div>}
          {!TEM_ATD && <div><h3>Números da régua de cobrança</h3><p>Cada número tem um comercial dono: os clientes dele recebem por ele.</p></div>}
        </div>
        {q.carregando ? <p className="pn-vazio">Carregando os números…</p>
          : q.falhou && !lista.length ? <EstadoErro titulo="Não foi possível carregar os números" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={q.recarregar} />
          : lista.length === 0 ? <EstadoVazio titulo="Nenhum WhatsApp conectado" descricao={TEM_ATD ? 'Conecte o primeiro número e diga se ele é das Cobranças ou do Atendimento.' : 'Conecte o primeiro número e escolha o comercial dono dele.'} acao={{ rotulo: '＋ Conectar WhatsApp', onClick: () => setJanela({ tipo: 'conectar' }) }} />
          : visiveis.length === 0 ? <p className="pn-vazio">Nenhum número neste ambiente.</p>
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab">
                <thead>
                  <tr>
                    <th scope="col">Número</th>
                    {TEM_ATD && <th scope="col">Ambiente</th>}
                    <th scope="col">Quem usa</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Última atividade</th>
                    <th scope="col"><span className="pn-vh">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => (
                    <tr key={c.chave} className={c.estado === 'desconectado' ? 'pn-us-inativo' : undefined}>
                      <td>
                        <span className="pn-eq-nome estatico">
                          <span className="pn-av" aria-hidden>{iniciais(c.nome)}</span>
                          <span className="pn-eq-nm"><span>{c.nome}</span><small className="num">{fone(c.numero) ?? 'aguardando o QR Code'}</small></span>
                        </span>
                      </td>
                      {TEM_ATD && <td><SeloAmbiente a={c.ambiente} /></td>}
                      <td><span className="pn-us-amb-tx">{c.ambiente === 'cobrancas' ? (c.semDono ? 'Sem dono — só os administradores veem' : `${c.nome} (comercial dono)`) : equipeDoNumero(c.id) ? `Equipe ${equipeDoNumero(c.id)}` : 'Sem equipe ainda'}</span></td>
                      <td>
                        <BadgeStatus tom={TOM_ESTADO[c.estado]}>{ROT_ESTADO[c.estado]}</BadgeStatus>
                        {c.erro && c.estado !== 'conectado' && <span className="pn-us-1a">{c.erro}</span>}
                      </td>
                      <td><span className="pn-us-amb-tx num">{quando(c.ultimaAtividade)}</span></td>
                      <td className="pn-fin-acoes">
                        <span className="pn-us-acoes">
                          {c.estado !== 'conectado' && <BotaoSec mini onClick={() => setJanela({ tipo: 'conectar', reconectar: c })}>{c.estado === 'conectando' ? 'Ver QR Code' : 'Conectar de novo'}</BotaoSec>}
                          <BotaoSec mini onClick={() => setJanela({ tipo: 'gerenciar', chave: c.chave })}>Gerenciar</BotaoSec>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </CardVidro>

      {TEM_ATD && <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.1s' }}>
        <div className="pn-card-cab"><div><h3>Para que serve cada ambiente</h3><p>Ao conectar um número você escolhe onde ele trabalha. Um número trabalha em um ambiente só.</p></div></div>
        <div className="pn-us-papeis cfgw-explica">
          {(['cobrancas', 'atendimento'] as const).map((a) => (
            <div key={a} className="pn-us-papel-card">
              <b>{ROTULO_AMBIENTE[a]}<span className="num">{n((c) => c.ambiente === a)}</span></b>
              <span>{DESC_AMBIENTE[a]}</span>
            </div>
          ))}
        </div>
      </CardVidro>}

      {janela?.tipo === 'conectar' && (
        <JanelaConectar reconectar={janela.reconectar} usuarios={q.usuarios} conexoes={lista} aoFechar={() => setJanela(null)} aoAvisar={avisar} />
      )}
      {aberta && (
        <JanelaGerenciar c={aberta} usuarios={q.usuarios} aoFechar={() => setJanela(null)} aoAvisar={avisar}
          aoReconectar={() => setJanela({ tipo: 'conectar', reconectar: aberta })} />
      )}
    </div>
  );
}

/* ---------------- conectar: ambiente → QR Code → pronto ---------------- */
const comerciaisDe = (usuarios: UsuarioRow[]) => usuarios.filter((u) => u.ativo && ambientesDoPerfil(u.papel, u.modulos).includes('cobrancas'));

function JanelaConectar({ reconectar, usuarios, conexoes, aoFechar, aoAvisar }: {
  reconectar?: ConexaoWA; usuarios: UsuarioRow[]; conexoes: ConexaoWA[]; aoFechar: () => void; aoAvisar: (t: string, tom?: 'ok' | 'erro') => void;
}) {
  const conectarCob = useConectarWA();
  const novoQrCob = useNovoQrWA();
  const desconectarCob = useDesconectarWA();
  const atd = useAcoesAtendimento();
  const { canaisCob } = useConexoesWA();

  const [fase, setFase] = useState<'escolha' | 'qr' | 'ok'>(reconectar ? 'qr' : 'escolha');
  const [ambiente, setAmbiente] = useState<Ambiente | null>(reconectar?.ambiente ?? (TEM_ATD ? null : 'cobrancas'));
  const [donoSel, setDonoSel] = useState('');
  const [nomeAtd, setNomeAtd] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sessao, setSessao] = useState<{ id: string; novo: boolean } | null>(null);
  const [qrAtd, setQrAtd] = useState<string | null>(null);
  const [numeroOk, setNumeroOk] = useState<string | null>(null);
  const comerciais = useMemo(() => comerciaisDe(usuarios), [usuarios]);
  const jaTem = (uid: string) => conexoes.some((c) => c.ambiente === 'cobrancas' && c.donoId === uid);
  const nomeFinal = ambiente === 'cobrancas' ? (reconectar?.nome ?? comerciais.find((u) => u.id === donoSel)?.nome ?? '') : (reconectar?.nome ?? nomeAtd.trim());

  const iniciar = async () => {
    setErro('');
    if (!ambiente) { setErro('Escolha o ambiente deste WhatsApp.'); return; }
    setOcupado(true);
    try {
      if (ambiente === 'cobrancas') {
        const u = comerciais.find((x) => x.id === donoSel);
        if (!reconectar && !u) { setErro('Escolha o comercial dono do número.'); return; }
        const r = await conectarCob.mutateAsync(reconectar ? { nome: reconectar.nome, dono_id: reconectar.donoId } : { nome: u!.nome || u!.usuario, dono_id: u!.id });
        const id = r.canal_id ? String(r.canal_id) : reconectar?.id;
        if (!id) throw new Error('Não foi possível preparar a conexão. Tente de novo.');
        setSessao({ id, novo: !reconectar && !jaTem(donoSel) });
      } else {
        if (!reconectar && !nomeAtd.trim()) { setErro('Dê um nome a este número (ex.: Atendimento principal).'); return; }
        const sAtd = await atd.iniciar(reconectar ? { nome: reconectar.nome, reconectarId: reconectar.id } : { nome: nomeAtd });
        setSessao({ id: sAtd.id, novo: !reconectar }); setQrAtd(sAtd.qr);
      }
      setFase('qr');
    } catch (e) { setErro((e as Error)?.message || 'Falha ao iniciar a conexão.'); if (reconectar) setFase('escolha'); }
    finally { setOcupado(false); }
  };
  // reconectar: abre direto no QR (uma vez — o StrictMode monta duas)
  const iniciou = useRef(false);
  useEffect(() => { if (reconectar && !iniciou.current) { iniciou.current = true; void iniciar(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cobranças: o QR e a situação vêm do canal (a lista se atualiza sozinha enquanto conecta)
  const canalCob = ambiente === 'cobrancas' && sessao ? canaisCob.find((c) => c.id === sessao.id) : undefined;
  useEffect(() => {
    if (fase === 'qr' && canalCob?.estado === 'conectado') { setNumeroOk(canalCob.numero); setFase('ok'); }
  }, [fase, canalCob?.estado, canalCob?.numero]);
  // Atendimento: pergunta a situação a cada 3 s
  const atdRef = useRef(atd); atdRef.current = atd;
  useEffect(() => {
    if (fase !== 'qr' || ambiente !== 'atendimento' || !sessao) return;
    let vivo = true;
    const t = window.setInterval(async () => {
      try { const r = await atdRef.current.situacao(sessao.id); if (vivo && r.conectado) { setNumeroOk(r.numero); setFase('ok'); } } catch { /* segue tentando */ }
    }, 3000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [fase, ambiente, sessao]);

  const qr = ambiente === 'cobrancas' ? canalCob?.qr ?? null : qrAtd;
  const novoQr = async () => {
    if (!sessao) return;
    setOcupado(true);
    try { if (ambiente === 'cobrancas') await novoQrCob.mutateAsync(sessao.id); else setQrAtd(await atd.novoQr(sessao.id)); }
    catch (e) { aoAvisar((e as Error)?.message || 'Não foi possível gerar um novo QR Code.', 'erro'); }
    finally { setOcupado(false); }
  };
  // fechar no meio do QR: a sessão que não chegou a conectar é encerrada (não fica "conectando" para sempre)
  const fechar = () => {
    if (fase === 'qr' && sessao) {
      if (ambiente === 'cobrancas') desconectarCob.mutate(sessao.id);
      else void atd.cancelar(sessao.id, sessao.novo);
    }
    if (fase === 'ok') aoAvisar(`WhatsApp de ${nomeFinal || 'novo número'} conectado em ${ROTULO_AMBIENTE[ambiente ?? 'cobrancas']}${numeroOk ? ` · ${fone(numeroOk)}` : ''}.`);
    aoFechar();
  };

  const titulo = fase === 'ok' ? 'WhatsApp conectado' : reconectar ? 'Conectar de novo' : 'Conectar WhatsApp';
  const sub = fase === 'escolha' ? (TEM_ATD ? 'Primeiro, diga para qual ambiente é este número' : 'Escolha o comercial dono do número') : `${ROTULO_AMBIENTE[ambiente ?? 'cobrancas']}${nomeFinal ? ` · ${nomeFinal}` : ''}`;
  return (
    <ModalV2 aberto aoFechar={fechar} largura={fase === 'escolha' ? 560 : 440} fecharNoVeu={fase !== 'qr'}
      titulo={<div>{titulo}<div className="mod-sub">{sub}</div></div>}
      rodape={fase === 'escolha'
        ? <><BotaoSec onClick={fechar}>Cancelar</BotaoSec><BotaoPrimario disabled={ocupado || !ambiente} onClick={() => void iniciar()}>{ocupado ? 'Preparando…' : 'Gerar QR Code'}</BotaoPrimario></>
        : fase === 'qr'
          ? <><BotaoSec onClick={fechar}>Cancelar</BotaoSec><BotaoSec disabled={ocupado || !sessao} onClick={() => void novoQr()}>{ocupado ? 'Gerando…' : 'Gerar novo QR Code'}</BotaoSec></>
          : <BotaoPrimario onClick={fechar}>Concluir</BotaoPrimario>}>
      {fase === 'escolha' && (
        <div className="pn-us-form">
          {TEM_ATD && <div className="pn-us-campo">
            <span className="pn-us-rot">Para qual ambiente é este WhatsApp?</span>
            <div className="pn-us-opcoes" role="radiogroup" aria-label="Ambiente do número">
              {(['cobrancas', 'atendimento'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={ambiente === a} className={ambiente === a ? 'on' : undefined} onClick={() => { setAmbiente(a); setErro(''); }}>
                  <b>{ROTULO_AMBIENTE[a]}</b><span>{DESC_AMBIENTE[a]}</span>
                </button>
              ))}
            </div>
          </div>}
          {ambiente === 'cobrancas' && (
            <div className="pn-us-campo">
              <label htmlFor="cw-dono">Comercial dono do número</label>
              <select id="cw-dono" className="inp" value={donoSel} onChange={(e) => { setDonoSel(e.target.value); setErro(''); }}>
                <option value="">Escolha o comercial</option>
                {comerciais.map((u) => <option key={u.id} value={u.id}>{u.nome || u.usuario}{jaTem(u.id) ? ' — já tem número (conecta de novo)' : ''}</option>)}
              </select>
              <span className="pn-us-dica">As conversas deste número aparecem só para esse comercial e para os administradores.</span>
            </div>
          )}
          {ambiente === 'atendimento' && (
            <div className="pn-us-campo">
              <label htmlFor="cw-nome">Nome do número</label>
              <input id="cw-nome" className="inp" value={nomeAtd} placeholder="ex.: Atendimento principal" maxLength={40} onChange={(e) => { setNomeAtd(e.target.value); setErro(''); }} />
              <span className="pn-us-dica">É como a equipe vai reconhecer este número no WhatsApp do Atendimento.</span>
            </div>
          )}
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
      {fase === 'qr' && (
        <div className="cfgw-qr">
          {qr
            ? <img src={qr} alt="QR Code para conectar o WhatsApp" width={224} height={224} />
            : <div className="cfgw-qr-vazio" role="status">{erro || 'Gerando o QR Code…'}</div>}
          <ol className="cfgw-passos">
            <li>No celular deste número, abra o <b>WhatsApp</b>.</li>
            <li>Toque em <b>Aparelhos conectados</b> e depois em <b>Conectar um aparelho</b>.</li>
            <li>Aponte a câmera para este código.</li>
          </ol>
          <p className="cfgw-espera" role="status"><i aria-hidden />Aguardando a leitura do código… ele expira rápido; se falhar, gere um novo.</p>
        </div>
      )}
      {fase === 'ok' && (
        <div className="cfgw-ok">
          <span className="cfgw-ok-ic" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
          <b>{nomeFinal || 'Número'} está conectado</b>
          <span className="num">{fone(numeroOk) ?? 'número confirmado'}</span>
          <p>Este WhatsApp trabalha no ambiente <b>{ROTULO_AMBIENTE[ambiente ?? 'cobrancas']}</b>{ambiente === 'cobrancas' ? ': a régua e as Conversas de Cobranças já podem usar este número.' : ': as conversas entram no WhatsApp e no Kanban do Atendimento.'}</p>
        </div>
      )}
    </ModalV2>
  );
}

/* ---------------- gerenciar um número ---------------- */
function JanelaGerenciar({ c, usuarios, aoFechar, aoAvisar, aoReconectar }: {
  c: ConexaoWA; usuarios: UsuarioRow[]; aoFechar: () => void; aoAvisar: (t: string, tom?: 'ok' | 'erro') => void; aoReconectar: () => void;
}) {
  const definirDono = useDefinirDonoWA();
  const verificar = useVerificarCanalWA();
  const desconectarCob = useDesconectarWA();
  const removerCob = useRemoverWA();
  const atd = useAcoesAtendimento();
  const [confirmaRemover, setConfirmaRemover] = useState(false);
  const [ocupadoAtd, setOcupadoAtd] = useState(false);
  const ocupado = definirDono.isPending || desconectarCob.isPending || removerCob.isPending || ocupadoAtd;
  const comerciais = useMemo(() => comerciaisDe(usuarios), [usuarios]);
  const falha = (e: unknown) => aoAvisar((e as Error)?.message || String(e), 'erro');

  const desconectar = async () => {
    try {
      if (c.ambiente === 'cobrancas') await desconectarCob.mutateAsync(c.id);
      else { setOcupadoAtd(true); await atd.desconectar(c.id, c.nome); }
      aoAvisar(`${c.nome}: WhatsApp desconectado. O número continua na lista; é possível conectar de novo quando quiser.`); aoFechar();
    } catch (e) { falha(e); } finally { setOcupadoAtd(false); }
  };
  const remover = async () => {
    try {
      if (c.ambiente === 'cobrancas') await removerCob.mutateAsync(c.id);
      else { setOcupadoAtd(true); await atd.remover(c.id, c.nome); }
      aoAvisar(`Número de ${c.nome} removido.`); aoFechar();
    } catch (e) { falha(e); } finally { setOcupadoAtd(false); }
  };

  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={460}
      titulo={<div>{c.nome}<div className="mod-sub">{fone(c.numero) ?? 'sem número confirmado'} · {ROTULO_AMBIENTE[c.ambiente]}</div></div>}
      rodape={confirmaRemover
        ? <><BotaoSec onClick={() => setConfirmaRemover(false)} disabled={ocupado}>Voltar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void remover()}>{ocupado ? 'Removendo…' : 'Remover definitivamente'}</button></>
        : <>
          <button type="button" className="num-remover" disabled={ocupado} onClick={() => setConfirmaRemover(true)}>Remover número</button>
          <span className="num-rodape-esp" />
          {c.estado !== 'conectado' && <BotaoSec disabled={ocupado} onClick={aoReconectar}>{c.estado === 'conectando' ? 'Ver QR Code' : 'Conectar de novo'}</BotaoSec>}
          {c.estado !== 'desconectado' && <BotaoSec disabled={ocupado} onClick={() => void desconectar()}>Desconectar</BotaoSec>}
          <BotaoSec onClick={aoFechar}>Fechar</BotaoSec>
        </>}>
      {confirmaRemover ? (
        <p className="cfgw-confirma">Remover o número de <b>{c.nome}</b>? {c.ambiente === 'cobrancas' ? 'As conversas desse número saem da tela Conversas de Cobranças.' : 'Ele sai da lista; as conversas continuam no histórico do Atendimento.'} Esta ação não pode ser desfeita.</p>
      ) : (
        <div className="pn-us-form">
          <dl className="cfgw-ficha">
            <div><dt>Situação</dt><dd><BadgeStatus tom={TOM_ESTADO[c.estado]}>{ROT_ESTADO[c.estado]}</BadgeStatus></dd></div>
            <div><dt>Ambiente</dt><dd><SeloAmbiente a={c.ambiente} /></dd></div>
            <div><dt>Última atividade</dt><dd className="num">{quando(c.ultimaAtividade)}</dd></div>
          </dl>
          {c.erro && c.estado !== 'conectado' && <p className="pn-us-alerta">{c.erro}</p>}
          {c.ambiente === 'cobrancas' && (
            <div className="pn-us-campo">
              <label htmlFor="cw-g-dono">Comercial dono do número</label>
              <select id="cw-g-dono" className="inp" value={c.donoId ?? ''} disabled={ocupado}
                onChange={(e) => definirDono.mutate({ canal_id: c.id, dono_id: e.target.value || null }, {
                  onSuccess: () => aoAvisar(e.target.value ? 'Dono do número atualizado: a régua passa a enviar por ele os clientes desse comercial, e ele vê as conversas.' : 'Número sem dono: só os administradores veem as conversas.'),
                  onError: falha,
                })}>
                <option value="">Sem dono (só os administradores veem)</option>
                {comerciais.map((u) => <option key={u.id} value={u.id}>{u.nome || u.usuario}</option>)}
              </select>
              <span className="pn-us-dica">A régua envia cada cliente pelo número do comercial dele; por isso o dono precisa ser o comercial certo.</span>
            </div>
          )}
          {c.ambiente === 'cobrancas' && (
            <div><BotaoSec mini disabled={verificar.isPending} onClick={() => verificar.mutate(c.id, {
              onSuccess: (x) => aoAvisar(`${c.nome}: ${x.estado === 'conectado' ? 'conectado e recebendo respostas normalmente' : String(x.estado ?? 'sem resposta')}.`),
              onError: falha,
            })}>{verificar.isPending ? 'Verificando…' : 'Verificar conexão'}</BotaoSec></div>
          )}
          <p className="pn-us-dica">Um número trabalha em um ambiente só. Para usar este no {c.ambiente === 'cobrancas' ? 'Atendimento' : 'ambiente Cobranças'}, remova-o aqui e conecte de novo escolhendo o outro ambiente.</p>
        </div>
      )}
    </ModalV2>
  );
}
