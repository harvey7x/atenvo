/* Telas de WhatsApp da instância Reviza — MESMO markup da demo (a demo é o
   contrato), alimentado pelo backend real (Evolution + Supabase dedicado):
   · Números  = cards por atendente (conectar via QR real, um número por atendente)
   · Conversas = lista + telefone (fone) da demo, com thread real e envio real
   · Régua    = sequência padrão / grupos / cliente específico (persistida)
   · Envios   = fila real (o motor de disparo liga na próxima etapa) */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { formatarTelefone } from '../lib/telefone';
import { criarRaizPortalV2 } from '../components/portal';
import { AudioRecorderV2, BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, Input, ModalV2, Toggle } from '../components';
import { MenuMais } from './comunicacao/MenuMais';
import { TextoComVariaveis } from './comunicacao/Variaveis';
// import direto (fora do barril): a foto ilustrativa puxa a lista de nomes do IBGE (~90 KB) — só esta tela precisa dela
import { FotoCliente } from '../components/FotoCliente';
import { WaTexto } from '../components/BolhaWa';
import {
  CartoesReguaComercial, DiaDaVersao, EditorMsg, FichaLead, IcT, IC_PATH, IconeBloco, ROTULO_BLOCO,
  decidirVersao, diaProprioValido, diaVaiColidir, type VersaoCom,
  gruposNoDia, nomeComercial, previewMsg, quandoCurto, quandoExtenso, quandoSub, resumoBlocos, rid, rotuloCriterio, tiposUnicos, VARS_MSG, DICA_VAR,
  type Bloco, type CliMsg, type EdReg, type GrupoMsg, type MsgDef,
} from './cobrancaMotor';
import { usePapel } from '../data/cobranca/sessao';
import { secaoDoPapel } from '../data/cobranca/secoes';
import { useEditarLead } from '../data/cobranca/hooks';
import { ROTULO_COMP, type ClienteAnalise, type Comportamento } from './cobrancaAnalytics';
import { clientesReais, linhasComCancelados } from './revizaAnalytics';
import { ROTULO_CANCELAMENTO } from '../data/cobranca/cancelados';
import { useParteDoComercial } from '../data/cobranca/comissoes';
import {
  AbasRegua, CabecalhoReguaComercial, ConfigReguaLista, ConfirmarPausaRegua, TabelaComerciaisRegua,
  type AbaRegua, type LinhaComercialRegua, type NumeroDoComercial,
} from './regua/ReguaTela';
import { useDadosCobranca } from '../data/cobranca/hooks';
import { useUsuarios } from '../data/cobranca/usuarios';
import { ambientesCadastrados as ambientesDoPerfil } from '../data/modulos';
import { NumerosVista, type ComercialCobertura, type NumeroItem } from './painel/NumerosVista';
import {
  corDe, diaSP, fmtHa, horaSP, iniciaisDe, mmss, nomeAgenda, ondaDe, rotuloDiaFio, rotuloHoraLista, tomEspera, Tiques,
  IcAbaConversas, IcAbaEnvios, IcAbaNumeros, IcAbaRegua, IcAlerta, IcApagada, IcBaixar, IcBateria, IcBusca, IcCadeado, IcCamera,
  IcContatoMini, IcDescer, IcDocMini, IcEmoji, IcEnviar, IcFechar, IcFigurinhaMini, IcFotoMini, IcGestao, IcLixo, IcMais,
  IcMaisOpcoes, IcMic, IcPasta, IcPausa, IcPlay, IcRelogio, IcReticencias, IcResponder, IcSinal, IcVideoMini, IcVoltar, IcWifi,
} from './fone/zapUi';
import './fone.css';
import './fone-zap.css';
import type { Dados, GLinha } from '../data/cobranca/types';
import {
  useCanaisWA, useCanaisEquipeWA, useConectarWA, useNovoQrWA, useDesconectarWA, useRemoverWA,
  useConversasWA, useMensagensWA, useEnviarWA, useMarcarLidaWA, useLerWA, useApagarMsgWA,
  useReguaWA, useSalvarReguaMsg, useExcluirReguaMsg, useReguaConfigWA, useSalvarReguaConfigWA, usePreviaReguaWA,
  useReguaVersoesWA, useSalvarVersaoWA, useExcluirVersaoWA, chaveComercial, type ReguaVersaoWA,
  useVerificarCanalWA, useDefinirDonoWA, useAlvosWA, useConversaWA, useResumoEnviosWA,
  useEnviosWA, useCriarEnvioWA,
  subirMidiaWA, urlMidiaWA, tipoDaMidia, horaBrasilia, useHorarioComercialWA, usePausaReguaWA,
  type AlvoWA, type CanalWA, type ConversaWA, type MensagemWA, type ReguaMsgWA, type TipoMidiaWA, type ReguaConfigWA,
} from '../data/wa/wa';

const VAZIO: Dados = { comps: [], linhas: [], pendentes: [], historico: [] };
export const soDigitos = (s: string) => (s || '').replace(/\D/g, '');
/** telefone no FORMATO ÚNICO da ALFA — "(51) 99999-0101" (src/v2/lib/telefone.ts) */
export const fmtTel = (t: string) => formatarTelefone(t) || t;
/** "eduardo"/"JUNIOR"/"—" → "Eduardo"/"Junior"/"" (nome que o cliente lê) */
const nomeGente = (n: string | null | undefined) => { const t = String(n ?? '').trim(); return !t || t === '—' ? '' : t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase()); };
export const horaDe = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
/** iniciais pro avatar; nome que é só telefone (contato sem nome) vira um ícone de pessoa */
const iniciaisNome = (n: string): ReactNode => { const ps = String(n ?? '').trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p)); return ps.length ? ps.slice(0, 2).map((p) => p[0]).join('').toUpperCase() : <IcT d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={15} mr={0} />; };
const dataBRcurta2 = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso; };

/** aplica as variáveis {…} com os dados de UM cliente — MESMA régua do motor no servidor.
    Devolve também o que faltou: mensagem com dado faltando NUNCA deve sair. */
export function aplicarVarsCliente(t: string, d: { nome: string; valorTotal: number | null; atendente: string; dia: number | null }): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  if (/\{nome( completo)?\}/i.test(t) && !(d.nome || '').trim()) faltando.push('nome do cliente');
  if (/\{(valor da parcela|parcela mensal|meia parcela|valor)\}/i.test(t) && !(d.valorTotal != null && d.valorTotal > 0)) faltando.push('valor da parcela');
  if (/\{vencimento\}/i.test(t) && !(d.dia != null && d.dia > 0)) faltando.push('dia de vencimento');
  const fmt = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const primeiro = (d.nome || '').trim().split(/\s+/)[0] ?? '';
  const dia2 = d.dia != null && d.dia > 0 ? String(d.dia).padStart(2, '0') : '';
  const texto = t
    .replace(/\{nome completo\}/gi, (d.nome || '').trim())
    .replace(/\{nome\}/gi, primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : '')
    .replace(/\{valor da parcela\}/gi, d.valorTotal != null ? fmt(d.valorTotal / 2) : '')   // 27/10: só a meia parcela
    .replace(/\{parcela mensal\}/gi, d.valorTotal != null ? fmt(d.valorTotal / 2) : '')
    .replace(/\{meia parcela\}/gi, d.valorTotal != null ? fmt(d.valorTotal / 2) : '')
    .replace(/\{valor\}/gi, d.valorTotal != null ? fmt(d.valorTotal / 2) : '')
    .replace(/dia \{vencimento\}/gi, dia2 ? `dia ${dia2}` : '')
    .replace(/\{vencimento\}/gi, dia2 ? `dia ${dia2}` : '')
    .replace(/\{nome do atendente\}/gi, d.atendente || '')
    .replace(/\{atendente\}/gi, d.atendente || '');
  return { texto, faltando };
}

/* =================== NÚMEROS (conexões WhatsApp — quantas quiser, por atendente) =================== */
type StatusCard = 'conectado' | 'sincronizando' | 'desconectado';
const statusDe = (c?: Pick<CanalWA, 'estado'>): StatusCard => (c?.estado === 'conectado' ? 'conectado' : c?.estado === 'conectando' ? 'sincronizando' : 'desconectado');

export function NumerosReviza({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string) => void }) {
  const { data } = useDadosCobranca();
  const dados = data ?? VAZIO;
  const sessao = usePapel().data;
  const meuId = sessao?.id ?? null;
  const meuNome = sessao?.nome ?? null;
  const canaisQ = useCanaisWA();             // o canal de VERDADE (com qr) — o seu, ou todos se gestor
  const canais = canaisQ.data ?? [];
  // 06/11 (dono: "a tela aparece pra todos, cada um conecta só o próprio"): o QUADRO da equipe inteira
  // vem de uma visão sem qr/instancia (mig 86) — todo mundo vê quem tá conectado, sem poder sequestrar
  // a sessão de ninguém. Gerenciar continua abrindo o canal de VERDADE (canaisQ), que a RLS já trava
  // no seu ou, se gestor, em qualquer um.
  const canaisEquipeQ = useCanaisEquipeWA();
  const canaisEquipe = canaisEquipeQ.data ?? [];
  const conectar = useConectarWA();
  const novoQr = useNovoQrWA();
  const desconectar = useDesconectarWA();
  const remover = useRemoverWA();
  const verificar = useVerificarCanalWA();
  const definirDono = useDefinirDonoWA();
  const [novo, setNovo] = useState(false);
  const [donoSel, setDonoSel] = useState('');                     // id do usuário do atendente
  const [aberto, setAberto] = useState<string | null>(null);      // canal_id do modal de gestão
  const [confirmaRemover, setConfirmaRemover] = useState(false);
  // atendentes = usuários ativos do sistema (o número conectado passa a ser DELE:
  // só ele e os administradores veem as conversas) — a lista inteira só o gestor enxerga (RLS de
  // profiles); self-service não precisa dela, já sabe quem é (sessao)
  const usuariosQ = useUsuarios(gestor);
  const reservaId = useReguaConfigWA().data?.canal_reserva_id ?? null;
  // só quem tem o ambiente Cobranças: um número da régua dado a quem só tem o Atendimento ficaria sem
  // ninguém vendo as conversas dele
  const atendentes = (usuariosQ.data ?? []).filter((u) => u.ativo && ambientesDoPerfil(u.papel, u.modulos).includes('cobrancas'));

  // carteira EM COBRANÇA por comercial (é quem a régua manda pelo número do dono)
  const comerciais = useMemo<ComercialCobertura[]>(() => {
    const m = new Map<string, ComercialCobertura>();
    for (const l of dados.linhas) {
      if (l.situacao !== 'cancelado') continue;
      const nome = (l.comercial || '').trim(); if (!nome) continue;
      const k = nome.toUpperCase();
      const x = m.get(k) ?? { nome, emCobranca: 0, comTelefone: 0, usuarioId: (usuariosQ.data ?? []).find((u) => u.ativo && (u.nome || '').trim().toUpperCase() === k)?.id ?? null };
      x.emCobranca += 1; if (soDigitos(l.telefone ?? '').length >= 10) x.comTelefone += 1; m.set(k, x);
    }
    return [...m.values()];
  }, [dados, usuariosQ.data]);
  // números no formato da tela; sem dono → sugere o usuário cujo nome bate com o do número
  const numeros = useMemo<NumeroItem[]>(() => canaisEquipe.map((c) => {
    const nomeC = c.nome.trim().toLowerCase();
    const sug = c.dono_id ? null : (usuariosQ.data ?? []).find((u) => u.ativo && [u.nome, u.usuario].some((x) => (x || '').trim().toLowerCase() === nomeC));
    return {
      id: c.id, nome: c.nome, numero: c.numero ? fmtTel(c.numero) : null, status: statusDe(c), donoId: c.dono_id,
      dono: c.dono_id ? (usuariosQ.data ?? []).find((u) => u.id === c.dono_id)?.nome ?? c.nome : null,
      reserva: c.id === reservaId, verificadoEm: c.verificado_em, ultimoEventoEm: c.ultimo_evento_em, ultimoErro: c.ultimo_erro,
      sugestao: sug ? { id: sug.id, nome: sug.nome || sug.usuario } : null,
    };
  }), [canaisEquipe, usuariosQ.data, reservaId]);
  const canalAberto = aberto ? canais.find((c) => c.id === aberto) : undefined;
  const souDonoDoAberto = !!meuId && canalAberto?.dono_id === meuId;
  const ocupado = conectar.isPending || novoQr.isPending || desconectar.isPending || remover.isPending;

  const iniciar = () => {
    const u = atendentes.find((x) => x.id === donoSel);
    if (!u) { aoAvisar('Escolha o comercial dono do número.'); return; }
    conectar.mutate({ nome: u.nome || u.usuario, dono_id: u.id }, {
      onSuccess: (r) => { setNovo(false); setDonoSel(''); if (r.canal_id) { setConfirmaRemover(false); setAberto(String(r.canal_id)); } },
      onError: (e) => aoAvisar((e as Error).message),
    });
  };
  // self-service (06/11): direto pro QR, sem escolher atendente — é sempre você mesmo
  const conectarMeuWhats = () => {
    if (!meuId) { aoAvisar('Não foi possível identificar o seu usuário. Atualize a página.'); return; }
    conectar.mutate({ nome: meuNome || 'Atendente', dono_id: meuId }, {
      onSuccess: (r) => { if (r.canal_id) { setConfirmaRemover(false); setAberto(String(r.canal_id)); } },
      onError: (e) => aoAvisar((e as Error).message),
    });
  };
  const reconectar = (c: CanalWA) => {
    setConfirmaRemover(false); setAberto(c.id);
    conectar.mutate({ nome: c.nome, dono_id: c.dono_id }, { onError: (e) => aoAvisar((e as Error).message) });
  };
  const fechar = () => { setAberto(null); setConfirmaRemover(false); };

  return (
    <>
      {canaisEquipeQ.isLoading ? <div className="cm-hint">Carregando…</div> : (
        <NumerosVista numeros={numeros} comerciais={comerciais} gestor={gestor} meuId={meuId} meuNome={meuNome} ocupado={ocupado || definirDono.isPending}
          aoConectar={(uid) => { if (gestor) { setDonoSel(uid ?? ''); setNovo(true); } else { conectarMeuWhats(); } }}
          aoGerenciar={(id) => { setConfirmaRemover(false); setAberto(id); }}
          aoReconectar={(id) => { const c = canais.find((x) => x.id === id); if (c) reconectar(c); }}
          aoDefinirDono={(canalId, uid, nome) => definirDono.mutate({ canal_id: canalId, dono_id: uid }, {
            onSuccess: () => aoAvisar(`${nomeGente(nome)} agora é o dono do número: a régua passa a enviar por ele os clientes desse comercial, e ele vê as conversas.`),
            onError: (e) => aoAvisar((e as Error).message),
          })} />
      )}

      {novo && (
        <ModalV2 aberto aoFechar={() => setNovo(false)} largura={420}
          titulo={<div>Conectar WhatsApp<div className="mod-sub">Um número por comercial; é possível conectar quantos forem necessários</div></div>}
          rodape={<><BotaoSec onClick={() => setNovo(false)}>Cancelar</BotaoSec><BotaoPrimario onClick={iniciar} disabled={conectar.isPending}>{conectar.isPending ? 'Preparando…' : 'Gerar QR code'}</BotaoPrimario></>}>
          <div className="form-grid">
            <div className="campo"><label>Comercial (usuário do sistema)</label>
              <select className="inp" value={donoSel} autoFocus onChange={(e) => setDonoSel(e.target.value)}>
                <option value="">{usuariosQ.isLoading ? 'Carregando…' : 'Escolha o comercial'}</option>
                {atendentes.map((u) => <option key={u.id} value={u.id}>{u.nome || u.usuario}</option>)}
              </select>
            </div>
            <p className="cm-hint" style={{ margin: 0 }}>As conversas deste número aparecem <b>só para esse comercial e para os administradores</b>.</p>
            <p className="cm-hint" style={{ margin: 0 }}>Na próxima tela aparece o QR code. Abra o WhatsApp do comercial → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.</p>
          </div>
        </ModalV2>
      )}

      {aberto && canalAberto && (
        <ModalV2 aberto aoFechar={fechar} largura={400}
          titulo={<div>{canalAberto.estado === 'conectado' ? 'Número conectado' : 'Conectar número'}<div className="mod-sub">{canalAberto.nome}</div></div>}
          rodape={<>
            {gestor && !confirmaRemover && (
              <button type="button" className="num-remover" onClick={() => setConfirmaRemover(true)} disabled={ocupado}>Remover número</button>
            )}
            {gestor && confirmaRemover && (<>
              <span className="num-rodape-esp" />
              <BotaoSec onClick={() => setConfirmaRemover(false)} disabled={ocupado}>Voltar</BotaoSec>
              <button type="button" className="p-btn btn-perigo" onClick={() => remover.mutate(canalAberto.id, { onSuccess: () => { fechar(); aoAvisar(`Número de ${canalAberto.nome} removido.`); }, onError: (e) => aoAvisar((e as Error).message) })} disabled={ocupado}>
                {remover.isPending ? 'Removendo…' : 'Remover definitivamente'}
              </button>
            </>)}
            {!confirmaRemover && <span className="num-rodape-esp" />}
            {!confirmaRemover && (gestor || souDonoDoAberto) && canalAberto.estado !== 'conectado' && (
              <BotaoSec onClick={() => novoQr.mutate(canalAberto.id, { onError: (e) => aoAvisar((e as Error).message) })} disabled={ocupado}>
                {novoQr.isPending ? 'Gerando…' : 'Gerar novo QR'}
              </BotaoSec>
            )}
            {!confirmaRemover && (gestor || souDonoDoAberto) && canalAberto.estado !== 'desconectado' && (
              <BotaoSec onClick={() => { desconectar.mutate(canalAberto.id, { onError: (e) => aoAvisar((e as Error).message) }); fechar(); }} disabled={ocupado}>Desconectar</BotaoSec>
            )}
            {!confirmaRemover && <BotaoSec onClick={fechar}>Fechar</BotaoSec>}
          </>}>
          {gestor && !confirmaRemover && (
            <div className="num-dono">
              <div className="campo"><label>Comercial dono do número</label>
                <select className="inp" value={canalAberto.dono_id ?? ''} disabled={definirDono.isPending || usuariosQ.isLoading}
                  onChange={(e) => definirDono.mutate({ canal_id: canalAberto.id, dono_id: e.target.value || null }, {
                    onSuccess: () => aoAvisar(e.target.value ? 'Dono do número atualizado: a régua passa a enviar por este número os clientes desse comercial, e ele vê as conversas.' : 'Número sem dono: só os administradores veem as conversas.'),
                    onError: (er) => aoAvisar((er as Error).message),
                  })}>
                  <option value="">{usuariosQ.isLoading ? 'Carregando…' : 'Sem dono (só administradores veem)'}</option>
                  {atendentes.map((u) => <option key={u.id} value={u.id}>{u.nome || u.usuario}</option>)}
                </select>
              </div>
              <p className="cm-hint" style={{ margin: 0 }}>A régua envia cada cliente pelo número do <b>comercial dele</b>; por isso o dono do número precisa ser o comercial certo. Ele e os administradores veem as conversas deste número.</p>
            </div>
          )}
          {(gestor || souDonoDoAberto) && !confirmaRemover && (
            <div className="num-dono">
              {canalAberto.ultimo_erro && <p className="cm-hint" style={{ margin: 0, color: 'var(--cor-alerta-txt, var(--ambar))' }}>{canalAberto.ultimo_erro}</p>}
              <div><BotaoSec mini disabled={verificar.isPending} onClick={() => verificar.mutate(canalAberto.id, {
                onSuccess: (x) => aoAvisar(`${canalAberto.nome}: ${x.estado === 'conectado' ? 'conectado' : String(x.estado)}${x.webhook_reaplicado ? ' · recebimento de respostas reconfigurado' : x.webhook_ok ? ' · recebendo respostas normalmente' : ''}${x.detalhe ? ` · ${String(x.detalhe)}` : ''}.`),
                onError: (er) => aoAvisar((er as Error).message),
              })}>{verificar.isPending ? 'Verificando…' : 'Verificar conexão'}</BotaoSec></div>
            </div>
          )}
          <div className="cm-qr">
            {confirmaRemover ? (
              <p>Remover o número de <b>{canalAberto.nome}</b>? As conversas desse número saem da tela Conversas. Esta ação não pode ser desfeita.</p>
            ) : canalAberto.estado === 'conectado' ? (
              <>
                <p>WhatsApp de <b>{canalAberto.nome}</b> conectado{canalAberto.numero ? <> no número <b className="num nowrap">{fmtTel(canalAberto.numero)}</b></> : null}. Pronto para enviar e receber.</p>
                <p className="cm-hint" style={{ margin: '4px 0 0' }}>Conferido <span className="num nowrap">{canalAberto.verificado_em ? new Date(canalAberto.verificado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : 'ainda não'}</span> · última mensagem recebida <span className="num nowrap">{canalAberto.ultimo_evento_em ? new Date(canalAberto.ultimo_evento_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—'}</span></p>
              </>
            ) : canalAberto.qr ? (
              <>
                <img src={canalAberto.qr} alt="QR Code para conectar o WhatsApp" width={232} height={232}
                  style={{ borderRadius: 12, background: '#fff', padding: 8, display: 'block', margin: '0 auto' }} />
                <p>Abra o WhatsApp do comercial → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> e aponte a câmera. O código expira rápido; se falhar, gere um novo.</p>
              </>
            ) : (
              <>
                <div className="cm-qr-quad" aria-hidden><span>QR</span></div>
                <p>{conectar.isPending || canaisQ.isFetching ? 'Gerando o QR code…' : 'Preparando a conexão…'}</p>
              </>
            )}
          </div>
        </ModalV2>
      )}
    </>
  );
}

/* =================== CONVERSAS (chat em tela cheia, estilo Atenvo) =================== */
const TOM_COMP: Record<Comportamento, 'ok' | 'atencao' | 'erro' | 'neutro'> = { em_dia: 'ok', voltou: 'atencao', faltou: 'atencao', inadimplente: 'erro' };

export function ConversasReviza() {
  const navigate = useNavigate();
  const { data, isError: dadosErro, refetch: refetchDados } = useDadosCobranca();
  const dados = data ?? VAZIO;
  // enquanto a Gestão carrega, NÃO dá pra afirmar que um número está "fora da base"
  const dadosProntos = data !== undefined;
  const clientes = useMemo(() => clientesReais(dados), [dados]);
  const porTel = useMemo(() => {
    const m = new Map<string, ClienteAnalise>();
    for (const c of clientes) { const d = soDigitos(c.whatsapp ?? ''); if (d) m.set(d.slice(-8), c); }
    return m;
  }, [clientes]);

  const q = useConversasWA();
  const canaisQ = useCanaisWA();
  const enviosQ = useEnviosWA();
  const reguaQ = useReguaWA();
  const sessao = usePapel().data;
  const parteCom = useParteDoComercial(sessao?.papel === 'comercial');   // ficha: a parte dele nos meses pagos
  const gestor = !!sessao?.gestor;
  const editarLead = useEditarLead();
  const enviarDireto = useEnviarWA();
  const salvarScript = useSalvarReguaMsg();
  const [fichaAberta, setFichaAberta] = useState(false);
  const [nsMsg, setNsMsg] = useState<MsgDef | null>(null);   // compositor completo de script (texto/áudio/foto/vídeo/doc + delay + variáveis)
  const [enviandoScript, setEnviandoScript] = useState<string | null>(null);
  const [avisoLado, setAvisoLado] = useState('');
  const porTelLinha = useMemo(() => {
    const m = new Map<string, GLinha>();
    // conversa de quem está nos Cancelados também mostra o cliente (é por ali que se reativa)
    for (const l of linhasComCancelados(dados)) { const d = soDigitos(l.telefone ?? ''); if (d) m.set(d.slice(-8), l); }
    return m;
  }, [dados]);
  const [selId, setSelId] = useState<string | null>(null);
  // atalho vindo de Envios ("Conversa"): /cobrancas/conversas?c=<id> abre direto a conversa
  const [params] = useSearchParams();
  const cParam = params.get('c');
  useEffect(() => { if (cParam) setSelId(cParam); }, [cParam]);
  const [busca, setBusca] = useState('');
  // "Fora da base" (quem não está na Gestão) virou uma pasta como as Arquivadas do WhatsApp (dono 29/09)
  const [listaModo, setListaModo] = useState<'base' | 'fora'>('base');
  const [filtroLista, setFiltroLista] = useState<'tudo' | 'naolidas'>('tudo');
  // texto de script esperando o campo: AMARRADO à conversa (dados de um cliente nunca caem no campo de outro)
  const [scriptPendente, setScriptPendente] = useState<{ conv: string; texto: string } | null>(null);
  const conversas = q.data ?? [];
  const canais = canaisQ.data ?? [];
  const envios = enviosQ.data ?? [];
  const clienteDe = (c: ConversaWA) => porTel.get(soDigitos(c.telefone).slice(-8));
  // só clientes da base aparecem (pedido do dono 11/09 — senão polui); o resto fica atrás de um toggle
  const daBase = useMemo(() => conversas.filter((c) => porTel.has(soDigitos(c.telefone).slice(-8))), [conversas, porTel]);
  const outras = conversas.length - daBase.length;
  // Gestão não carregou: não dá pra separar cliente de contato — mostra TODAS (com aviso), nunca esconde a lista
  const semGestao = dadosErro && data === undefined;
  const foraLista = useMemo(() => conversas.filter((c) => !porTel.has(soDigitos(c.telefone).slice(-8))), [conversas, porTel]);
  const noFora = listaModo === 'fora' && !semGestao;
  const base = semGestao ? conversas : noFora ? foraLista : daBase;
  const visiveis = filtroLista === 'naolidas' ? base.filter((c) => c.nao_lidas > 0) : base;
  const casaBusca = useMemo(() => {
    const sem = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const s = sem(busca.trim());
    if (!s) return null;
    const dig = soDigitos(s);
    return (c: ConversaWA) => {
      const nome = porTel.get(soDigitos(c.telefone).slice(-8))?.nome ?? '';
      return sem(nome).includes(s) || sem(c.nome_contato ?? '').includes(s) || (dig.length >= 3 && soDigitos(c.telefone).includes(dig));
    };
  }, [busca, porTel]);
  const filtradas = useMemo(() => (casaBusca ? visiveis.filter(casaBusca) : visiveis), [visiveis, casaBusca]);
  // buscando na lista principal: quem está na pasta "Fora da base" também aparece (bloco à parte)
  const achadosFora = useMemo(() => (casaBusca && !noFora && !semGestao && dadosProntos ? foraLista.filter(casaBusca) : []), [casaBusca, noFora, semGestao, dadosProntos, foraLista]);
  // atalho de Envios: conversa fora das 200 mais recentes (ou arquivada) é buscada pelo id
  const convExtraQ = useConversaWA(selId && !conversas.some((c) => c.id === selId) ? selId : null);
  const sel = selId ? conversas.find((c) => c.id === selId) ?? (convExtraQ.data?.id === selId ? convExtraQ.data : null) : null;   // fone abre na LISTA, como um celular
  const listaRef = useRef<HTMLDivElement>(null);
  // a lista fica montada POR BAIXO da conversa (como no aparelho, e voltar preserva a rolagem):
  // enquanto a conversa está aberta ela sai do Tab, do clique e do leitor de tela
  useLayoutEffect(() => {
    const l = listaRef.current; if (!l) return;
    if (sel) l.setAttribute('inert', ''); else l.removeAttribute('inert');
  }, [sel]);
  // entrou/saiu da pasta "Fora da base": o foco vai pro "voltar" / volta pra linha da pasta
  const modoAntRef = useRef(listaModo);
  useEffect(() => {
    if (modoAntRef.current === listaModo) return;
    modoAntRef.current = listaModo;
    const l = listaRef.current;
    const rolo = l?.querySelector<HTMLElement>('.zp-lista-rol'); if (rolo) rolo.scrollTop = 0;   // cada lista começa do topo
    const alvo = listaModo === 'fora' ? l?.querySelector<HTMLElement>('.zp-lista-cab .zp-link') : l?.querySelector<HTMLElement>('.zp-arq');
    (alvo ?? l?.querySelector<HTMLElement>('.zp-busca input'))?.focus({ preventScroll: true });
  }, [listaModo]);
  const saiuDeRef = useRef<string | null>(null);
  useEffect(() => {
    if (sel || !saiuDeRef.current) return;
    const lista = listaRef.current;
    const linha = lista?.querySelector<HTMLElement>(`[data-id="${saiuDeRef.current}"]`);
    if (linha) {
      linha.focus({ preventScroll: true });
      // a rolagem é a de antes; só traz a linha pra vista se ela saiu (a lista reordenou com mensagem nova).
      // .zp-lista-rol é o offsetParent da linha: offsetTop = posição dentro da lista rolada
      const rolo = lista?.querySelector<HTMLElement>('.zp-lista-rol');
      const abas = lista?.querySelector<HTMLElement>('.zp-abas')?.offsetHeight ?? 0;
      if (rolo && (linha.offsetTop < rolo.scrollTop || linha.offsetTop + linha.offsetHeight > rolo.scrollTop + rolo.clientHeight - abas)) {
        rolo.scrollTop = Math.max(0, linha.offsetTop - (rolo.clientHeight - abas) / 2 + linha.offsetHeight / 2);
      }
    } else lista?.querySelector<HTMLInputElement>('.zp-busca input')?.focus({ preventScroll: true });
    saiuDeRef.current = null;
  }, [sel]);

  const estadoDe = (c: ConversaWA): { estado: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' } => {
    const cl = clienteDe(c);
    return cl ? { estado: ROTULO_COMP[cl.comportamento], tom: TOM_COMP[cl.comportamento] } : { estado: 'Contato', tom: 'neutro' };
  };
  const nomeDe = (c: ConversaWA) => clienteDe(c)?.nome ?? c.nome_contato ?? fmtTel(c.telefone);

  const cliSel = sel ? clienteDe(sel) : null;
  const linhaSel = sel ? porTelLinha.get(soDigitos(sel.telefone).slice(-8)) ?? null : null;
  // envios (régua e manuais) DESTE cliente — pelo cadastro; contato fora da base, pela conversa
  const alvosCliQ = useAlvosWA({ desdeIso: null, status: 'todos', origem: 'todas', busca: '', leadId: sel?.lead_id ?? linhaSel?.id ?? null, conversaId: sel?.lead_id || linhaSel ? null : sel?.id ?? null }, !!sel);
  const filaCli = (alvosCliQ.data?.pages ?? []).flat().slice(0, 6);
  const canalNomeDe = (id: string | null) => canais.find((k) => k.id === id)?.nome ?? '';

  /* variáveis dos scripts com os dados do cliente da conversa aberta (helper único).
     Se faltar dado da planilha, devolve null e avisa — mensagem quebrada não sai. */
  const aplicarVarsFront = (t: string): string | null => {
    const r = aplicarVarsCliente(t, {
      nome: (cliSel?.nome ?? sel?.nome_contato ?? '').trim(),
      valorTotal: cliSel ? cliSel.mensalidade * 2 : null,
      // quem fala é o DONO do número da conversa (é por ele que a mensagem sai)
      atendente: nomeGente(sel ? canalNomeDe(sel.canal_id) : '') || nomeGente(cliSel?.atendente),
      dia: cliSel ? Number(cliSel.ciclo.replace(/\D/g, '')) || null : null,
    });
    if (r.faltando.length) { setAvisoLado(`Este cliente está sem ${r.faltando.join(' e ')}. Complete o cadastro na Gestão antes de usar o script.`); return null; }
    return r.texto;
  };
  // scripts = os do chat (alvo 'script', NÃO disparam sozinhos) + os textos ativos da sequência padrão
  const scripts = (reguaQ.data ?? []).filter((m) => (m.alvo === 'script' || m.alvo === 'padrao') && m.ativo);
  const textoDoScript = (m: ReguaMsgWA): string => {
    const b = (m.blocos ?? []).find((x) => x.tipo === 'texto');
    return (b?.corpo ?? '').trim();
  };
  /* partes enviáveis de um script: texto com corpo, ou mídia com arquivo salvo (path) */
  const blocosEnviaveis = (m: ReguaMsgWA): Bloco[] =>
    ((m.blocos ?? []) as Bloco[]).filter((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : !!b.path));
  const TIPO_MIDIA_DE: Record<string, TipoMidiaWA> = { imagem: 'imagem', video: 'video', audio: 'audio', documento: 'documento' };
  /* envia o script COMPLETO na conversa aberta: blocos na ordem, com o delay de cada um;
     valida TODAS as variáveis antes do 1º disparo — ou sai tudo certo, ou não sai nada */
  const enviarScript = async (m: ReguaMsgWA) => {
    const conv = sel; if (!conv || enviandoScript) return;
    const bs = blocosEnviaveis(m);
    if (!bs.length) { setAvisoLado('Este script não tem conteúdo para enviar. Abra a Régua completa e confira as partes.'); return; }
    const prontos: { bloco: Bloco; texto: string }[] = [];
    for (const b of bs) {
      const cru = (b.corpo ?? '').trim();
      const tx = cru ? aplicarVarsFront(cru) : '';
      if (tx == null) return;   // variável sem dado — aviso já mostrado, nada sai
      prontos.push({ bloco: b, texto: tx });
    }
    setEnviandoScript(m.id);
    try {
      for (let i = 0; i < prontos.length; i++) {
        const { bloco: b, texto: tx } = prontos[i];
        if (i > 0) await new Promise((r) => setTimeout(r, Math.max(0, Math.min(60, Number(b.espera ?? 3))) * 1000));
        await new Promise<void>((res, rej) => enviarDireto.mutate(
          b.tipo === 'texto'
            ? { conversa_id: conv.id, texto: tx }
            : { conversa_id: conv.id, texto: tx, midia_path: b.path!, midia_tipo: TIPO_MIDIA_DE[b.tipo] ?? 'documento', midia_nome: b.nome ?? 'arquivo' },
          { onSuccess: () => res(), onError: (e) => rej(e) },
        ));
      }
      setAvisoLado(`"${m.nome}" enviado para ${nomeDe(conv)}: ${prontos.length} ${prontos.length === 1 ? 'parte' : 'partes, na ordem'}.`);
    } catch (e) { setAvisoLado((e as Error).message); }
    finally { setEnviandoScript(null); }
  };
  const agora = new Date(); const hojeIni = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const resumoHojeQ = useResumoEnviosWA(new Date(hojeIni).toISOString(), new Date(hojeIni + 864e5).toISOString());
  const rH = resumoHojeQ.data;
  const agendados = envios.filter((e) => e.estado === 'rascunho' && e.agendado_para && new Date(e.agendado_para).getTime() > Date.now()).length;
  const naoLidasBase = (semGestao ? conversas : daBase).filter((c) => c.nao_lidas > 0);
  const naoLidasFora = semGestao ? 0 : foraLista.filter((c) => c.nao_lidas > 0).length;
  const carregandoBase = !dadosProntos && !dadosErro;
  const esperando = [...naoLidasBase].sort((a, b) => (b.ultima_em ?? '').localeCompare(a.ultima_em ?? '')).slice(0, 6);
  // quem respondeu uma cobrança nos últimos 7 dias (régua ou envio manual) — atalho pra conversa
  // janela e ordem pela RESPOSTA; 1 linha por conversa (o cliente pode ter respondido a mais de um passo)
  const respQ = useAlvosWA({ desdeIso: new Date(hojeIni - 6 * 864e5).toISOString(), status: 'responderam', origem: 'todas', busca: '', porResposta: true }, !sel);
  const responderam = (() => {
    const vistos = new Set<string>();
    return (respQ.data?.pages ?? []).flat().filter((a) => !!a.conversa_id && !vistos.has(a.conversa_id) && !!vistos.add(a.conversa_id)).slice(0, 6);
  })();
  // próximas mensagens da régua pra ESTE cliente (a mesma conta do motor; nada é enviado)
  const cfgReguaQ = useReguaConfigWA();
  const reguaLigada = cfgReguaQ.data?.ativa === true;
  const hojeIso = isoLocalR(new Date(hojeIni));
  const proxQ = usePreviaReguaWA({ de: hojeIso, ate: isoLocalR(new Date(hojeIni + 20 * 864e5)), lead_id: linhaSel?.id ?? null }, !!linhaSel);
  // o que já foi gerado (na fila / enviado) aparece em "Envios deste cliente" — aqui só o que ainda vem
  const proximas = (proxQ.data?.itens ?? []).filter((i) => i.lead_id === linhaSel?.id && i.status !== 'gerado').slice(0, 4);
  const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusFila = (f: AlvoWA): { t: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' } =>
    f.status === 'enviado' ? { t: f.respondeu_em ? 'Respondeu' : f.entrega === 'lida' ? 'Lida' : f.entrega === 'entregue' ? 'Entregue' : 'Enviada', tom: 'ok' }
    : f.status === 'erro' ? { t: 'Erro', tom: 'erro' }
    : f.status === 'pulado' ? { t: 'Não enviada', tom: 'neutro' }
    : f.status === 'cancelado' ? { t: 'Cancelada', tom: 'neutro' }
    : f.status === 'enviando' ? { t: 'Enviando…', tom: 'atencao' }
    : f.wa_envios?.agendado_para && new Date(f.wa_envios.agendado_para).getTime() > Date.now() ? { t: 'Agendada', tom: 'neutro' }
    : f.wa_envios?.origem === 'regua' && !reguaLigada ? { t: 'Parada', tom: 'atencao' }
    : { t: 'Na fila', tom: 'atencao' };
  const ROT_PROX: Record<string, { t: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' }> = {
    // futuro = cinza; verde só para o que já aconteceu (o mesmo sentido de Envios)
    vai_receber: { t: reguaLigada ? 'Vai receber' : 'Sairia', tom: 'neutro' }, gerado: { t: 'Já gerada', tom: 'neutro' },
    aguardando: { t: 'Aguardando', tom: 'atencao' }, pulado: { t: 'Não recebe', tom: 'neutro' },
  };
  const situacaoSel = linhaSel?.cancelamento ? `Cancelados · ${ROTULO_CANCELAMENTO[linhaSel.cancelamento]}`
    : linhaSel?.situacao === 'ativo' ? (linhaSel.paradoPendente ? 'Débito parado · aguardando aprovação' : 'Novo · débito ativo') : 'Em cobrança';
  const mesesPagos = cliSel ? cliSel.meses.filter((m) => m.status === 'paga').length : 0;
  const ROT_MES: Record<string, string> = { paga: 'Paga', atraso: 'Em atraso', nao_paga: 'Não paga', prevista: 'Prevista' };
  const dt = (iso: string | null | undefined) => (iso ? dataBRcurta2(iso) : '—');

  return (
    <div className="fx-raiz sobe">
      {/* ---- painel ao lado do aparelho ---- */}
      <div className="fx-lado">
        {avisoLado && (
          <div className="ev-aviso fx-span2" role="status">
            <span className="ev-aviso-ic"><IcT d="M12 16v-4M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" s={14} mr={0} /></span>
            <span className="ev-aviso-t">{avisoLado}</span>
            <button type="button" className="cv2-x" onClick={() => setAvisoLado('')} aria-label="Fechar aviso">×</button>
          </div>
        )}

        <div className="cv2-kpis fx-span2">
          <div className={naoLidasBase.length > 0 ? 'cv2-kpi atencao' : 'cv2-kpi'}><span>Não lidas</span><b className="num">{carregandoBase ? '—' : naoLidasBase.length}</b><i>{carregandoBase ? 'carregando…' : naoLidasBase.length === 1 ? 'conversa esperando resposta' : 'conversas esperando resposta'}</i></div>
          <div className="cv2-kpi"><span>Conversas</span><b className="num">{carregandoBase ? '—' : semGestao ? conversas.length : daBase.length}{!carregandoBase && conversas.length >= 200 ? '+' : ''}</b><i>{carregandoBase ? 'carregando…' : semGestao ? 'todas (cadastro não carregou)' : outras > 0 ? `de clientes · ${outras} fora da base` : 'de clientes da base'}</i></div>
          <div className="cv2-kpi"><span>Enviadas hoje</span><b className="num">{rH?.enviadas ?? 0}</b><i>{rH?.responderam ? `${rH.responderam} responderam` : 'régua + envios manuais'}</i></div>
          <div className="cv2-kpi"><span>Agendados</span><b className="num">{agendados}</b><i>{agendados === 1 ? 'envio programado' : 'envios programados'}</i></div>
        </div>

        {sel && cliSel ? (
          <CardVidro spot className="cv2-cli fx-span2">
            <div className="cv2-cli-cab">
              <span className={`cv2-av t-${estadoDe(sel).tom}`} aria-hidden>{iniciaisNome(cliSel.nome)}<FotoCliente ilustrativa nome={nomeAgenda(nomeDe(sel), sel.telefone)} id={sel.lead_id ?? sel.id} tam={46} /></span>
              <div className="cv2-cli-quem">
                <b>{cliSel.nome}</b>
                <span className="num">{fmtTel(sel.telefone)}{nomeGente(cliSel.atendente) ? ` · ${nomeGente(cliSel.atendente)}` : ''}</span>
                <div className="cv2-chips">
                  <BadgeStatus tom={estadoDe(sel).tom}>{estadoDe(sel).estado}</BadgeStatus>
                  <span className="ev-chip">Ciclo {cliSel.ciclo}</span>
                  <span className={linhaSel?.paradoPendente ? 'ev-chip regua' : 'ev-chip'}>{situacaoSel}</span>
                </div>
              </div>
              <div className="cv2-cli-acoes">
                {linhaSel && <BotaoSec mini onClick={() => setFichaAberta(true)}>Editar cadastro</BotaoSec>}
                <BotaoSec mini onClick={() => navigate('/cobrancas/planilha')}>Ver na Gestão</BotaoSec>
              </div>
            </div>

            <div className="cv2-valores">
              <div><span>Parcela mensal</span><b className="num">{brl(cliSel.mensalidade)}</b></div>
              <div><span>Parcela total</span><b className="num">{brl(cliSel.mensalidade * 2)}</b></div>
              <div><span>Total pago</span><b className="num">{brl(cliSel.faturamentoTotal)}</b></div>
              <div><span>Meses pagos</span><b className="num">{mesesPagos}<small> de {cliSel.meses.length}</small></b></div>
            </div>

            {cliSel.meses.length > 0 && (
              <div className="cv2-bloco">
                <div className="cv2-bloco-cab">
                  <span className="ev-rot">Pagamentos mês a mês</span>
                  <span className="cv2-leg" aria-hidden><span><i className="paga" />Paga</span><span><i className="atraso" />Em atraso</span><span><i className="nao_paga" />Não paga</span><span><i className="prevista" />Prevista</span></span>
                </div>
                <div className="cv2-meses" aria-label="Pagamentos mês a mês">
                  {cliSel.meses.map((m) => (
                    <span key={m.competencia} className={`cv2-mes ${m.status}`} title={`${m.competencia.slice(5)}/${m.competencia.slice(0, 4)} · ${ROT_MES[m.status] ?? m.status}`}>
                      <i /><b className="num">{m.competencia.slice(5)}/{m.competencia.slice(2, 4)}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="cv2-dados">
              <div className="cv2-bloco">
                <span className="ev-rot">Benefício</span>
                <div className="cv2-kv">
                  <div><span>Banco</span><b>{linhaSel?.banco || '—'}</b></div>
                  <div><span>NB</span><b className="num">{linhaSel?.nb || '—'}</b></div>
                  <div><span>CPF</span><b className="num">{linhaSel?.cpf ? `•••.•••.${soDigitos(linhaSel.cpf).slice(-5, -2)}-${soDigitos(linhaSel.cpf).slice(-2)}` : '—'}</b></div>
                  <div><span>Banco que recebe</span><b>{linhaSel?.recebe || '—'}</b></div>
                  <div><span>Valor do benefício</span><b>{linhaSel?.faixa === 'ate_1sm' ? 'Até 1 salário mínimo' : linhaSel?.faixa === 'acima_1sm' ? 'Acima de 1 salário mínimo' : '—'}</b></div>
                </div>
              </div>
              <div className="cv2-bloco">
                <span className="ev-rot">Datas</span>
                <div className="cv2-kv">
                  <div><span>Fechamento</span><b className="num">{dt(linhaSel?.fechamento)}</b></div>
                  <div><span>Último pagamento</span><b className="num">{dt(linhaSel?.ultimoPgto)}</b></div>
                  <div><span>Reclamação</span><b className="num">{dt(linhaSel?.dataReclamacao)}</b></div>
                  <div><span>Parou o desconto</span><b className="num">{dt(linhaSel?.dataParou)}</b></div>
                </div>
              </div>
            </div>
            {linhaSel?.obs && <p className="cv2-obs">“{linhaSel.obs}”</p>}
          </CardVidro>
        ) : sel && !dadosProntos ? (
          <CardVidro spot className="cv2-card fx-span2"><p className="cv2-vazio">{dadosErro ? 'Não foi possível carregar o cadastro da Gestão agora. Recarregue a página.' : 'Carregando o cadastro do cliente…'}</p></CardVidro>
        ) : sel ? (
          <CardVidro spot className="cv2-cli fx-span2">
            <div className="cv2-cli-cab">
              <span className="cv2-av t-neutro" aria-hidden>{iniciaisNome(nomeDe(sel))}<FotoCliente ilustrativa nome={nomeAgenda(nomeDe(sel), sel.telefone)} id={sel.lead_id ?? sel.id} tam={46} /></span>
              <div className="cv2-cli-quem">
                <b>{nomeDe(sel)}</b>
                {nomeDe(sel) !== fmtTel(sel.telefone) && <span className="num">{fmtTel(sel.telefone)}</span>}
                <div className="cv2-chips"><span className="ev-chip">Fora da base</span></div>
              </div>
            </div>
            <p className="cv2-nota">Este número não está cadastrado na Gestão, então não há ficha, valores nem régua para ele. Se for um cliente, cadastre o telefone na Gestão e a conversa passa a mostrar tudo aqui.</p>
          </CardVidro>
        ) : (
          <>
            <CardVidro spot className="cv2-card">
              <div className="cv2-card-cab"><b>Esperando resposta</b>{naoLidasBase.length > 0 && <span className="cv2-n num">{naoLidasBase.length}</span>}</div>
              {carregandoBase ? <p className="cv2-vazio">Carregando…</p> : esperando.length === 0 ? <p className="cv2-vazio">Nenhuma conversa esperando resposta{naoLidasFora > 0 ? ` de cliente — ${naoLidasFora} fora da base` : ''}.</p> : (
                <div className="cv2-lista">
                  {esperando.map((c) => (
                    <button type="button" key={c.id} className="cv2-item" onClick={() => setSelId(c.id)}>
                      <span className={`cv2-av p t-${estadoDe(c).tom}`} aria-hidden>{iniciaisNome(nomeDe(c))}<FotoCliente ilustrativa nome={nomeAgenda(nomeDe(c), c.telefone)} id={c.lead_id ?? c.id} tam={32} /></span>
                      <span className="cv2-item-mid"><b>{nomeDe(c)}</b><i>{textoPreviaWa(c.ultima_previa).texto || '—'}</i></span>
                      <span className="cv2-item-fim"><span className="num">{quandoLista(c.ultima_em)}</span><span className="cv2-badge num">{c.nao_lidas}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </CardVidro>
            <CardVidro spot className="cv2-card">
              <div className="cv2-card-cab"><b>Responderam a cobrança</b><span className="ev-sub">últimos 7 dias</span></div>
              {respQ.isLoading ? <p className="cv2-vazio">Carregando…</p> : respQ.isError && !respQ.data ? <p className="cv2-vazio">Não foi possível carregar agora ({respQ.error?.message}).</p> : responderam.length === 0 ? <p className="cv2-vazio">Ninguém respondeu uma mensagem da régua ou de um envio nos últimos 7 dias.</p> : (
                <div className="cv2-lista">
                  {responderam.map((a) => { const rp = textoPreviaWa(a.resposta_previa); return (
                    <button type="button" key={a.id} className="cv2-item" onClick={() => setSelId(a.conversa_id!)}>
                      <span className="cv2-av p" aria-hidden>{iniciaisNome(a.nome ?? '')}<FotoCliente ilustrativa nome={nomeAgenda(a.nome ?? '', a.telefone)} id={a.lead_id ?? a.conversa_id ?? a.id} tam={32} /></span>
                      <span className="cv2-item-mid"><b>{a.nome ?? fmtTel(a.telefone)}</b><i>{rp.texto ? (rp.midia ? rp.texto : `“${rp.texto}”`) : `respondeu “${a.passo_nome ?? a.wa_envios?.nome ?? 'envio'}”`}</i></span>
                      <span className="cv2-item-fim"><span className="num">{a.respondeu_em ? new Date(a.respondeu_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span></span>
                    </button>
                  ); })}
                </div>
              )}
            </CardVidro>
          </>
        )}

        {sel && (
          <>
            <CardVidro spot className="cv2-card">
              <div className="cv2-card-cab"><b>Envios deste cliente</b><button type="button" className="ev-link" onClick={() => navigate('/cobrancas/envios?aba=feitos')}>Ver em Envios <IcT d="m9 18 6-6-6-6" s={12} mr={0} /></button></div>
              {alvosCliQ.isLoading ? <p className="cv2-vazio">Carregando…</p> : filaCli.length === 0 ? (
                <p className="cv2-vazio">Nenhuma mensagem da régua ou de envio em massa para este cliente ainda. Use o relógio no aparelho para programar uma.</p>
              ) : (
                <div className="cv2-tl">
                  {filaCli.map((f) => { const st = statusFila(f); return (
                    <div key={f.id} className="cv2-tl-i" title={f.mensagem ?? f.erro ?? f.motivo ?? ''}>
                      <i className={`t-${st.tom}`} aria-hidden />
                      <div className="cv2-tl-c">
                        <b>{f.wa_envios?.origem === 'regua' ? f.passo_nome ?? 'Régua' : f.wa_envios?.nome ?? 'Envio'}</b>
                        <span className="num">{f.wa_envios?.origem === 'regua' ? 'Régua · ' : 'Manual · '}{new Date(f.enviado_em ?? (f.status === 'pendente' ? f.wa_envios?.agendado_para : null) ?? f.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{f.canal_nome ? ` · por ${nomeGente(f.canal_nome)}` : ''}</span>
                      </div>
                      <BadgeStatus tom={st.tom}>{st.t}</BadgeStatus>
                    </div>
                  ); })}
                </div>
              )}
            </CardVidro>
            <CardVidro spot className="cv2-card">
              <div className="cv2-card-cab"><b>Próximas da régua</b><span className="ev-sub">{reguaLigada ? 'próximos 20 dias' : 'régua desligada · só prévia'}</span></div>
              {!dadosProntos ? <p className="cv2-vazio">{dadosErro ? 'Cadastro indisponível agora.' : 'Carregando…'}</p>
                : !linhaSel ? <p className="cv2-vazio">Contato fora da base não recebe a régua.</p>
                : proxQ.isLoading ? <p className="cv2-vazio">Calculando…</p>
                : proxQ.isError ? <p className="cv2-vazio">Não foi possível calcular agora ({proxQ.error?.message}).</p>
                : proximas.length === 0 ? <p className="cv2-vazio">Nenhum passo da régua cai nos próximos 20 dias para este cliente.</p> : (
                <div className="cv2-tl">
                  {proximas.map((p) => { const st = ROT_PROX[p.status] ?? { t: p.status, tom: 'neutro' as const }; return (
                    <div key={`${p.passo_id}-${p.data}`} className="cv2-tl-i" title={p.motivo ?? ''}>
                      <span className={p.data === hojeIso ? 'cv2-data hoje num' : 'cv2-data num'}>{p.data === hojeIso ? 'hoje' : `${p.data.slice(8, 10)}/${p.data.slice(5, 7)}`}</span>
                      <div className="cv2-tl-c">
                        <b>{p.passo_nome}</b>
                        <span>{p.motivo ?? (p.status === 'vai_receber' && p.numero ? `sai por ${nomeGente(p.numero.nome)}` : `${quandoCurto(p.quando)} do vencimento`)}</span>
                      </div>
                      <BadgeStatus tom={st.tom}>{st.t}</BadgeStatus>
                    </div>
                  ); })}
                </div>
              )}
            </CardVidro>
          </>
        )}

        <CardVidro spot className="cv2-card fx-span2">
          <div className="cv2-card-cab">
            <div className="cv2-card-tt"><b>Scripts</b></div>
            <span className="cv2-card-acoes">
              {gestor && <BotaoSec mini onClick={() => setNsMsg({ id: rid('s'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] })}><IcT d={IC_PATH.mais} s={12} />Novo script</BotaoSec>}
              <button type="button" className="ev-link" onClick={() => navigate('/cobrancas/regua')}>Régua completa <IcT d="m9 18 6-6-6-6" s={12} mr={0} /></button>
            </span>
          </div>
          {scripts.length === 0 ? (
            <p className="cv2-vazio">Nenhum script ainda{gestor ? '. Crie o primeiro em “Novo script” (texto, áudio, foto, vídeo e documento, com intervalo entre as partes)' : ''}.</p>
          ) : (
            <div className="cv2-scripts">
              {scripts.map((m) => {
                const t = textoDoScript(m);
                const partes = blocosEnviaveis(m);
                const mandavel = !!sel && partes.length > 0;
                return (
                  <div key={m.id} className="cv2-script">
                    <div className="cv2-script-cab">
                      <b title={m.nome}>{m.nome}</b>
                      <span className="ev-chip">{m.alvo === 'padrao' ? `Régua · ${quandoCurto(m.quando)}` : 'Script'}</span>
                    </div>
                    <p className="cv2-script-txt"><TextoComVariaveis texto={previewMsg(m as { blocos: Bloco[] }) || '—'} /></p>
                    <div className="cv2-script-pe">
                      <span className="cv2-script-tps">{tiposUnicos((m.blocos ?? []) as Bloco[]).map((tp) => <em key={tp}><IconeBloco tipo={tp} s={10} /> {ROTULO_BLOCO[tp]}</em>)}{partes.length > 1 && <em className="num">{partes.length} partes</em>}</span>
                      <span className="cv2-script-bts">
                        {/* ação padrão: coloca o texto no chat para revisar; enviar na hora fica no menu (1 clique a menos de risco) */}
                        <button type="button" className="cv2-bt" disabled={!sel || !t}
                          title={!sel ? 'Abra uma conversa' : !t ? 'Este script não tem texto para inserir' : 'Coloca o texto no chat para você revisar antes de enviar'}
                          onClick={() => { const tx = aplicarVarsFront(t); if (tx != null && sel) setScriptPendente({ conv: sel.id, texto: tx }); }}>{enviandoScript === m.id ? 'Enviando…' : 'Usar no chat'}</button>
                        <MenuMais rotulo={`Mais ações para o script ${m.nome}`} itens={[{
                          rotulo: partes.length > 1 ? `Enviar agora (${partes.length} partes)` : 'Enviar agora', desabilitado: !mandavel || !!enviandoScript,
                          dica: !sel ? 'Abra uma conversa' : partes.length > 1 ? `Envia as ${partes.length} partes na ordem, com o intervalo configurado` : 'Envia agora nesta conversa, sem revisar',
                          onClick: () => { void enviarScript(m); },
                        }]} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardVidro>

      {nsMsg && (
        <ModalV2 aberto aoFechar={() => setNsMsg(null)} largura={560}
          titulo={<div>Novo script<div className="mod-sub">Texto, áudio, foto, vídeo e documento, na ordem, com intervalo e variáveis. Só sai quando alguém enviar.</div></div>}
          rodape={<><BotaoSec onClick={() => setNsMsg(null)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={salvarScript.isPending} onClick={() => {
              if (!nsMsg.nome.trim()) { setAvisoLado('Dê um nome ao script.'); return; }
              const ok = nsMsg.blocos.some((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : !!b.path));
              if (!ok) { setAvisoLado('Adicione ao menos um conteúdo: texto escrito ou arquivo anexado.'); return; }
              const semArq = nsMsg.blocos.filter((b) => b.tipo !== 'texto' && !b.path);
              // alvo 'script': fica só aqui nas Conversas — NÃO vira passo automático da régua
              salvarScript.mutate({ alvo: 'script', nome: nsMsg.nome.trim(), quando: 0, ativo: true, blocos: nsMsg.blocos }, {
                onSuccess: () => {
                  setAvisoLado(semArq.length
                    ? `Script "${nsMsg.nome.trim()}" criado — atenção: ${semArq.map((b) => ROTULO_BLOCO[b.tipo]).join(', ')} sem arquivo salvo, ${semArq.length === 1 ? 'essa parte não sai' : 'essas partes não saem'} no envio.`
                    : `Script "${nsMsg.nome.trim()}" criado.`);
                  setNsMsg(null);
                },
                onError: (e) => setAvisoLado((e as Error).message),
              });
            }}>{salvarScript.isPending ? 'Salvando…' : 'Salvar script'}</BotaoPrimario></>}>
          <EditorMsg msg={nsMsg} setMsg={setNsMsg} setAviso={setAvisoLado} aoSubirMidia={subirMidiaWA} />
        </ModalV2>
      )}
      </div>

      {fichaAberta && linhaSel && (
        <FichaLead key={linhaSel.id} inicial={linhaSel} comps={dados.comps}
          ciclos={[...new Set([...dados.linhas.map((l) => l.dia), linhaSel.dia].filter((d) => d > 0))].sort((a, b) => a - b)}
          comerciais={[...new Set(dados.linhas.map((l) => l.comercial).filter(Boolean))].sort()}
          gestor={gestor} podeGrade={false} podeAprovar={!!sessao?.podeAprovar}
          parteDoMes={parteCom ? (comp, v) => parteCom(linhaSel.comercial, comp, v) : undefined}
          aoSalvar={(l, tocados) => {
            // só os campos TOCADOS (rastreio 17/09): objeto inteiro regravava o
            // dia/valor velhos por cima de um mover ciclo concorrente
            // `if (tocados)`: lista vazia = nada mexido = patch vazio (fecha sem gravar)
            const patch: Partial<GLinha> = {};
            if (tocados) for (const k of tocados) (patch as Record<string, unknown>)[k] = (l as unknown as Record<string, unknown>)[k];
            else Object.assign(patch, l);
            delete patch.celulas; // grade é só leitura aqui (podeGrade=false)
            if (!patch.senha) delete patch.senha;
            if (!patch.reclameSenha) delete patch.reclameSenha;
            if (!Object.keys(patch).length) { setFichaAberta(false); return; }
            editarLead.mutate({ id: l.id, patch }, {
              onSuccess: () => { setFichaAberta(false); setAvisoLado('Cadastro salvo.'); },
              onError: (e) => setAvisoLado((e as Error).message),
            });
          }}
          aoFechar={() => setFichaAberta(false)} />
      )}


      {/* ---- o aparelho: o celular do Painel da Equipe do Atenvo (WhatsApp do iPhone), aqui FUNCIONAL.
              Lista ↔ conversa, com voltar; a lista fica montada por baixo (voltar preserva a rolagem) ---- */}
      <div className="fz-fone">
        <AparelhoZap conversa={!!sel}>
          <div className="zp-lista" ref={listaRef}>
            <div className="zp-lista-cab">
              {noFora ? (
                <div className="zp-acoes">
                  <button type="button" className="zp-link" onClick={() => { setListaModo('base'); setBusca(''); }} aria-label="Voltar para Conversas"><IcVoltar />Conversas</button>
                </div>
              ) : (
                <div className="zp-acoes">
                  {/* ⋯ e câmera: o desenho do iPhone (enfeite, como no Painel da Equipe); o "+" verde é ação de
                      verdade — nova mensagem = o Novo envio da aba Envios (só pra quem abre Envios) */}
                  <span className="zp-circ" aria-hidden><IcReticencias /></span>
                  <span className="zp-acoes-dir">
                    <span className="zp-ic-solto" aria-hidden><IcCamera /></span>
                    {secaoDoPapel(sessao?.papel ?? null, 'envios')
                      ? <button type="button" className="zp-novo" title="Nova mensagem (abre o Novo envio)" aria-label="Nova mensagem" onClick={() => navigate('/cobrancas/envios?novo=1')}><IcMais /></button>
                      : <span className="zp-novo" aria-hidden><IcMais /></span>}
                  </span>
                </div>
              )}
              <h3 className="zp-titulo">{noFora ? 'Fora da base' : 'Conversas'}</h3>
              {!noFora && (() => {
                if (canaisQ.isLoading) return <p className="zp-numeros">Verificando o número…</p>;
                if (canaisQ.isError && !canaisQ.data) return <p className="zp-numeros">Não foi possível ver os números agora</p>;
                const on = canais.filter((k) => k.estado === 'conectado');
                const ponto = on.length === 0 ? 'zp-ponto zp-ponto-off' : on.length < canais.length ? 'zp-ponto zp-ponto-meio' : 'zp-ponto';
                const um = canais.length === 1 ? canais[0] : null;
                return (
                  <p className="zp-numeros">
                    <span className={ponto} aria-hidden />
                    <span className="zp-numeros-t">
                      {um ? <>{nomeGente(um.nome) || 'WhatsApp'}{um.numero ? ` · ${fmtTel(um.numero)}` : ''}{on.length ? '' : ' · desconectado'}</>
                        : canais.length ? `${on.length} de ${canais.length} números conectados` : 'Nenhum número conectado'}
                    </span>
                  </p>
                );
              })()}
              <label className="zp-busca">
                <IcBusca />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar" aria-label={noFora ? 'Pesquisar número fora da base' : 'Pesquisar por nome ou número'} />
                {busca && <button type="button" className="zp-busca-x" onClick={() => setBusca('')} aria-label="Limpar busca"><IcFechar w={11} /></button>}
              </label>
              {!noFora && (
                <FaixaChips>
                  <button type="button" aria-pressed={filtroLista === 'tudo'} className={filtroLista === 'tudo' ? 'zp-chip zp-chip-on' : 'zp-chip'} onClick={() => setFiltroLista('tudo')}>Tudo</button>
                  <button type="button" aria-pressed={filtroLista === 'naolidas'} className={filtroLista === 'naolidas' ? 'zp-chip zp-chip-on' : 'zp-chip'} onClick={() => setFiltroLista('naolidas')}>
                    Não lidas{naoLidasBase.length > 0 ? <span className="zp-chip-n">{naoLidasBase.length}</span> : null}
                  </button>
                </FaixaChips>
              )}
            </div>
            {semGestao && (
              <div className="zp-aviso-lista" role="status">
                <span>O cadastro da Gestão não carregou — mostrando todas as conversas, sem separar clientes.</span>
                <button type="button" className="zp-acao-txt" onClick={() => { void refetchDados(); }}>Tentar de novo</button>
              </div>
            )}
            <div className="zp-lista-rol">
              {/* dentro da pasta, a explicação no topo (como o aviso das Arquivadas no iPhone) */}
              {noFora && <p className="zp-arq-nota">Números que não estão na Gestão. Cadastre o telefone do cliente e a conversa passa para a lista principal.</p>}
              {/* pasta "Fora da base" no topo da lista, no lugar das Arquivadas do WhatsApp: o número em verde,
                  sem selo (desenho do Painel da Equipe) — as não lidas da pasta quando há, senão o total */}
              {!noFora && !semGestao && dadosProntos && outras > 0 && !busca.trim() && filtroLista === 'tudo' && (
                <button type="button" className="zp-arq" onClick={() => { setListaModo('fora'); setBusca(''); }}
                  aria-label={`Fora da base: ${outras} conversa${outras === 1 ? '' : 's'}${naoLidasFora ? `, ${naoLidasFora} não lida${naoLidasFora === 1 ? '' : 's'}` : ''}`}>
                  <span className="zp-arq-ic" aria-hidden><IcPasta /></span>
                  <span className="zp-arq-t">Fora da base</span>
                  <span className="zp-arq-n" aria-hidden>{naoLidasFora > 0 ? (naoLidasFora > 99 ? '99+' : naoLidasFora) : outras}</span>
                </button>
              )}
              {q.isLoading || (!dadosProntos && !dadosErro) ? (
                <div role="status" aria-label="Carregando conversas">
                  {[0, 1, 2, 3, 4].map((i) => <div key={i} className="zp-linha zp-esq" aria-hidden><span className="zp-av" /><span className="zp-linha-tx"><i /><i /></span></div>)}
                </div>
              ) : q.isError && !q.data ? (
                <div className="zp-vazio">
                  <b>Não foi possível carregar agora</b>
                  <span>As conversas não carregaram. Confira a internet e tente de novo.</span>
                  <button type="button" className="zp-acao-txt" onClick={() => { void q.refetch(); }}>Tentar de novo</button>
                </div>
              ) : filtradas.length === 0 && achadosFora.length === 0 ? (
                <div className="zp-vazio">
                  <b>{busca.trim() ? 'Nada encontrado' : noFora ? 'Nenhum contato fora da base' : conversas.length === 0 ? 'Nenhuma conversa ainda' : filtroLista === 'naolidas' ? 'Tudo respondido' : 'Nenhuma conversa de cliente ainda'}</b>
                  <span>{busca.trim() ? 'Confira o nome ou o número digitado.'
                    : noFora ? 'Todas as conversas são de clientes cadastrados.'
                    : conversas.length === 0 ? 'As mensagens dos números conectados aparecem aqui.'
                    : filtroLista === 'naolidas' ? 'Nenhuma conversa esperando resposta.'
                    : 'Quando um cliente da Gestão mandar mensagem, a conversa aparece aqui.'}</span>
                </div>
              ) : filtradas.slice(0, 80).map((c) => (
                <LinhaZap key={c.id} c={c} nome={nomeDe(c)} agora={agora.getTime()} aoAbrir={setSelId} />
              ))}
              {achadosFora.length > 0 && (
                <>
                  <div className="zp-secao">Fora da base</div>
                  {achadosFora.slice(0, 40).map((c) => <LinhaZap key={c.id} c={c} nome={nomeDe(c)} agora={agora.getTime()} aoAbrir={setSelId} />)}
                </>
              )}
              {/* fim da lista, como no Painel da Equipe: quantas conversas — e, se cortou, quantas faltam */}
              {!(q.isLoading || (!dadosProntos && !dadosErro)) && !(q.isError && !q.data) && filtradas.length + achadosFora.length > 0 && (() => {
                const total = filtradas.length + achadosFora.length;
                const mostradas = Math.min(filtradas.length, 80) + Math.min(achadosFora.length, 40);
                const mais = conversas.length >= 200 ? '+' : '';   // a lista vem cortada nas 200 mais recentes (igual ao número de cima)
                return <div className="zp-fim-lista">{mostradas < total ? `${mostradas} de ${total}${mais} conversas · use a busca` : `${total}${mais} ${total === 1 && !mais ? 'conversa' : 'conversas'}`}</div>;
              })()}
            </div>
            <TabBarFone ativa="conversas" naoLidas={naoLidasBase.length} papel={sessao?.papel ?? null} aoIr={(slug) => navigate(`/cobrancas/${slug}`)} />
          </div>
          {sel && (
            <div className="zp-empurra" key={sel.id}>
              <ChatReviza conversa={sel} titulo={nomeDe(sel)} estado={estadoDe(sel)} aoVoltar={() => { saiuDeRef.current = sel.id; setSelId(null); }}
                dadosProntos={dadosProntos}
                // como no Painel da Equipe (lá as arquivadas ficam fora): a MESMA base da aba e do chip, sem a pasta "Fora da base"
                naoLidasOutras={naoLidasBase.filter((c) => c.id !== sel.id).length}
                canal={canais.find((k) => k.id === sel.canal_id) ?? null}
                inserirTexto={scriptPendente?.conv === sel.id ? scriptPendente.texto : null} aoConsumirInsercao={() => setScriptPendente(null)} leadId={linhaSel?.id ?? null} />
            </div>
          )}
        </AparelhoZap>
      </div>
    </div>
  );
}

/* chips de filtro: rolam pro lado com a roda do mouse — e só seguram a roda enquanto ainda há o que rolar
   (listener nativo não-passivo; o onWheel do React é passivo e deixava a página rolar junto) */
function FaixaChips({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const roda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth; if (max <= 0) return;
      if ((e.deltaY > 0 && el.scrollLeft < max - 1) || (e.deltaY < 0 && el.scrollLeft > 0)) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, []);
  return <div className="zp-filtros" role="group" aria-label="Filtro de conversas" ref={ref}>{children}</div>;
}

/* o aparelho do Painel da Equipe do Atenvo: desenhado no tamanho real do iPhone (418 × 872 com a
   moldura; tela de 390 × 844 pontos) e reduzido com `zoom` — texto nítido e proporções de verdade.
   Altura = o que sobra da janela abaixo do TOPO do aparelho (medido, com a página no alto), menos
   20px de respiro, até 860px: o aparelho cabe INTEIRO ao abrir a tela em qualquer janela — antes era
   clamp(620px, 100dvh − 150px, 860px), conta de quando o cabeçalho da página era mais baixo, e em
   1280×720 o campo de mensagem e as abas ficavam fora. Piso de 480px: janela menor que isso rola e o
   aparelho gruda no topo (sticky). Em tela de celular (≤ 640px) não se desenha outro celular: zoom 1
   e o CSS tira a moldura. */
const ALTURA_APARELHO = 872;
const RESPIRO_APARELHO = 20;
/** topo do aparelho na janela com a página rolada até o alto: o aparelho é o 1º item da .fx-raiz nos
    dois leiautes (lado a lado e, ≤ 1060px, em cima do painel). Soma de offsetTop — não muda com a
    rolagem nem com a animação de entrada da página (transform). */
function topoDoAparelho(el: HTMLElement | null): number {
  const raiz = el?.closest<HTMLElement>('.fx-raiz') ?? null;
  if (!raiz) return 166;
  let y = 0;
  for (let e: HTMLElement | null = raiz; e; ) {
    y += e.offsetTop;
    const pai = e.offsetParent as HTMLElement | null;
    if (pai) y += pai.clientTop;
    e = pai;
  }
  return y;
}
function zoomDoAparelho(topo: number): number {
  if (typeof window === 'undefined') return 0.77;
  if (window.matchMedia?.('(max-width: 640px)').matches) return 1;
  const alvo = Math.min(860, Math.max(480, window.innerHeight - topo - RESPIRO_APARELHO));
  return alvo / ALTURA_APARELHO;
}
function AparelhoZap({ conversa, children }: { conversa: boolean; children: ReactNode }) {
  const telRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(() => zoomDoAparelho(166));
  // mede antes da 1ª pintura (sem pulo de tamanho), de novo no resize e quando o que está ACIMA do
  // aparelho na página (o cabeçalho) muda de altura
  useLayoutEffect(() => {
    const medir = () => setZoom(zoomDoAparelho(topoDoAparelho(telRef.current)));
    medir();
    window.addEventListener('resize', medir);
    const raiz = telRef.current?.closest('.fx-raiz');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    for (let s = raiz?.previousElementSibling; s; s = s.previousElementSibling) ro?.observe(s);
    return () => { window.removeEventListener('resize', medir); ro?.disconnect(); };
  }, []);
  // barra de status do iOS com a hora de verdade
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 15000); return () => clearInterval(t); }, []);
  return (
    <div className={conversa ? 'zp-tel zp-tel-conv' : 'zp-tel'} ref={telRef} style={{ zoom }}>
      <span className="zp-bt zp-bt-acao" aria-hidden />
      <span className="zp-bt zp-bt-vol1" aria-hidden />
      <span className="zp-bt zp-bt-vol2" aria-hidden />
      <span className="zp-bt zp-bt-lig" aria-hidden />
      <div className="zp-moldura">
        <div className={conversa ? 'zp-tela zp-tela-conv' : 'zp-tela'}>
          <div className="zp-status" aria-hidden>
            <span className="zp-status-h">{horaSP(agora)}</span>
            <span className="zp-status-ic"><IcSinal /><IcWifi /><IcBateria /></span>
          </div>
          <span className="zp-ilha" aria-hidden />
          <div className="zp-app">{children}</div>
          <span className="zp-home" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/* barra de abas do "app" (dono 29/09: a lista tinha muito vazio embaixo), no desenho da barra do
   WhatsApp do iPhone. São ATALHOS reais pras telas do WhatsApp da cobrança — só as que o papel pode
   abrir (secaoDoPapel) */
const ABAS_FONE: { slug: string; rot: string; Ic: () => JSX.Element }[] = [
  { slug: 'conversas', rot: 'Conversas', Ic: IcAbaConversas },
  { slug: 'envios', rot: 'Envios', Ic: IcAbaEnvios },
  { slug: 'regua', rot: 'Régua', Ic: IcAbaRegua },
  { slug: 'numeros', rot: 'Números', Ic: IcAbaNumeros },
];
function TabBarFone({ ativa, naoLidas, papel, aoIr }: { ativa: string; naoLidas: number; papel: Parameters<typeof secaoDoPapel>[0]; aoIr: (slug: string) => void }) {
  const abas = ABAS_FONE.filter((a) => a.slug === ativa || secaoDoPapel(papel, a.slug));
  if (abas.length < 2) return null;
  return (
    <nav className="zp-abas" aria-label="Atalhos do WhatsApp da cobrança">
      {abas.map(({ slug, rot, Ic }) => {
        const n = slug === 'conversas' ? naoLidas : 0;
        return (
          <button type="button" key={slug} className={slug === ativa ? 'zp-aba zp-aba-on' : 'zp-aba'} aria-current={slug === ativa ? 'page' : undefined}
            aria-label={n > 0 ? `${rot}, ${n} não lida${n === 1 ? '' : 's'}` : undefined}
            onClick={() => { if (slug !== ativa) aoIr(slug); }}>
            <Ic />
            {n > 0 && <b className="zp-aba-n" aria-hidden>{n > 99 ? '99+' : n}</b>}
            <i>{rot}</i>
          </button>
        );
      })}
    </nav>
  );
}

/* "quando" da lista, como no WhatsApp: hora (hoje) · Ontem · dia da semana · dd/mm (dd/mm/aa se outro ano) */
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function quandoLista(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dias = Math.round((inicioDia(new Date()) - inicioDia(d)) / 864e5);
  if (dias <= 0) return horaDe(iso);
  if (dias === 1) return 'Ontem';
  if (dias < 7) return DIAS_SEMANA[d.getDay()];
  return d.getFullYear() === new Date().getFullYear()
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
/* mídia sem texto, nas palavras do WhatsApp (prévia da lista, citação, bolha sem arquivo) */
const ROT_TIPO: Record<string, string> = { audio: 'Mensagem de voz', imagem: 'Foto', video: 'Vídeo', documento: 'Documento', sticker: 'Figurinha' };
const ALIAS_PREVIA: Record<string, string> = { audio: 'audio', 'áudio': 'audio', imagem: 'imagem', image: 'imagem', video: 'video', 'vídeo': 'video', documento: 'documento', document: 'documento', sticker: 'sticker' };
/** prévia de mídia como o servidor grava: "[audio]", "[imagem] legenda", "[documento] arquivo.pdf" */
const RE_PREVIA_MIDIA = /^\[(audio|áudio|imagem|image|video|vídeo|documento|document|sticker)\]\s*(.*)$/i;
/* a mesma prévia em palavras do WhatsApp onde não cabe o ícone da lista (painel ao lado do aparelho,
   Envios): "[audio]" → "Mensagem de voz", "[imagem] Segue" → "Foto · Segue", "[documento] x.pdf" → "x.pdf".
   `midia` = era mídia (aí não vai entre aspas, não é fala do cliente) */
export function textoPreviaWa(previa: string | null | undefined): { texto: string; midia: boolean } {
  const t = (previa ?? '').trim();
  const m = t.match(RE_PREVIA_MIDIA);
  if (!m) return { texto: t, midia: false };
  const tipo = ALIAS_PREVIA[m[1].toLowerCase()] ?? 'documento';
  const resto = m[2].trim();
  return { texto: !resto ? ROT_TIPO[tipo] : tipo === 'documento' ? resto : `${ROT_TIPO[tipo]} · ${resto}`, midia: true };
}
/* bolha sem texto e sem arquivo (sticker não baixado, localização/contato, download que falhou):
   rótulo amigável no lugar do literal cru "[outro]" — sticker vira "Figurinha", desconhecido vira "Mensagem não suportada" */
const rotuloTipoMsg = (tipo: string) => ROT_TIPO[ALIAS_PREVIA[tipo] ?? ''] ?? 'Mensagem não suportada';
/* prévia da última mensagem (desenho da lista do WhatsApp do iPhone): mídia vira ícone + rótulo;
   o microfone fica verde quando o áudio é do cliente e ainda não foi lido */
function PreviaZap({ previa, naoLida }: { previa: string | null; naoLida: boolean }) {
  const t = (previa ?? '').trim();
  const m = t.match(RE_PREVIA_MIDIA);
  if (!m) return <span className="zp-prev"><span className="zp-prev-t">{t || 'Sem mensagens'}</span></span>;
  const tipo = ALIAS_PREVIA[m[1].toLowerCase()] ?? 'documento';
  const ic = tipo === 'audio' ? <IcMic /> : tipo === 'imagem' ? <IcFotoMini /> : tipo === 'video' ? <IcVideoMini /> : tipo === 'sticker' ? <IcFigurinhaMini /> : <IcDocMini />;
  return (
    <span className="zp-prev">
      <span className={tipo === 'audio' && naoLida ? 'zp-prev-ic zp-prev-ic-verde' : 'zp-prev-ic'} aria-hidden>{ic}</span>
      <span className="zp-prev-t">{m[2].trim() || ROT_TIPO[tipo]}</span>
    </span>
  );
}
/* uma conversa da lista (linha do WhatsApp do iPhone): foto, nome como na agenda, horário, prévia e,
   à direita, o selo de não lidas — e nada mais (como no Painel da Equipe: um ponto verde ali é
   "cliente esperando resposta"; a situação de pagamento fica no topo da conversa e na ficha ao lado) */
function LinhaZap({ c, nome, agora, aoAbrir }: {
  c: ConversaWA; nome: string; agora: number; aoAbrir: (id: string) => void;
}) {
  const exibido = nomeAgenda(nome, c.telefone);
  const ini = iniciaisDe(exibido);
  const digitando = !!c.digitando_ate && new Date(c.digitando_ate).getTime() > Date.now();
  const nova = c.nao_lidas > 0;
  return (
    <button type="button" data-id={c.id} className="zp-linha" onClick={() => aoAbrir(c.id)}>
      <span className="zp-av" style={{ background: ini ? corDe(c.id) : undefined }} aria-hidden>{ini || <IcContatoMini />}<FotoCliente ilustrativa nome={exibido} id={c.lead_id ?? c.id} tam={54} /></span>
      <span className="zp-linha-tx">
        <span className="zp-l1">
          <b>{exibido}</b>
          <time className={nova ? 'zp-hora zp-hora-on' : 'zp-hora'} dateTime={c.ultima_em ?? undefined}>{c.ultima_em ? rotuloHoraLista(Date.parse(c.ultima_em), agora) : ''}</time>
        </span>
        <span className="zp-l2">
          {digitando ? <span className="zp-prev zp-prev-dig">digitando…</span> : <PreviaZap previa={c.ultima_previa} naoLida={nova} />}
          <span className="zp-l2-dir">
            {nova ? <span className="zp-badge" aria-label={`${c.nao_lidas} não lida${c.nao_lidas === 1 ? '' : 's'}`}>{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span> : null}
          </span>
        </span>
      </span>
    </button>
  );
}


/* checks do WhatsApp: relógio (pendente) → 1 check (enviada) → 2 cinza (entregue) → 2 azuis (lida) */
export function Checks({ status }: { status: string }) {
  if (status === 'pendente') {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" aria-hidden style={{ verticalAlign: '-1px' }}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;
  }
  const dois = status === 'entregue' || status === 'lida';
  const cor = status === 'lida' ? '#53bdeb' : '#8696a0';
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="none" aria-hidden style={{ verticalAlign: '-1px' }}>
      <path d="M11 1.2 4.9 8.6 1.6 5.4" stroke={cor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {dois && <path d="M15.6 1.2 9.5 8.6l-1.1-1.05" stroke={cor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/* Safari antigo (< 17.4) não decodifica ogg/opus — e TODO áudio daqui é ogg.
   Detectado UMA vez, no primeiro áudio da sessão. */
let cacheTocaOgg: boolean | null = null;
const navegadorTocaOgg = () => {
  if (cacheTocaOgg === null) {
    try { const a = new Audio(); cacheTocaOgg = !!(a.canPlayType('audio/ogg;codecs=opus') || a.canPlayType('audio/ogg')); }
    catch { cacheTocaOgg = true; }    // sem como testar: deixa o player tentar (onError segura a falha)
  }
  return cacheTocaOgg;
};

/* mensagem de voz no desenho do WhatsApp do iPhone (o ZapAudio do Painel da Equipe): play/pausa, onda
   com o progresso e a bolinha, duração embaixo e, à direita, o avatar de quem falou com o microfone —
   que vira o botão de velocidade (1× · 1,5× · 2×) enquanto toca. url null = a URL assinada ainda vem. */
function AudioZap({ url, falhou, saida, autor, lida, chave }: {
  url: string | null; falhou: boolean; saida: boolean; autor: string; lida: boolean; chave: string;
}) {
  // navegador sem ogg/opus: no lugar do player, aviso curto + download pela mesma URL assinada
  if (url && !navegadorTocaOgg()) {
    return <span className="zp-audio-fb">Este navegador não toca este áudio<a href={url} target="_blank" rel="noreferrer" download>Baixar</a></span>;
  }
  return <AudioZapPlayer url={url} falhouUrl={falhou} saida={saida} autor={autor} lida={lida} chave={chave} />;
}
/** um áudio por vez (como no WhatsApp): tocar um pausa o outro */
let audioTocando: HTMLAudioElement | null = null;
function AudioZapPlayer({ url, falhouUrl, saida, autor, lida, chave }: {
  url: string | null; falhouUrl: boolean; saida: boolean; autor: string; lida: boolean; chave: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [falhou, setFalhou] = useState(false);
  const [vel, setVel] = useState(1);
  const [ouvido, setOuvido] = useState(false);
  const barras = useMemo(() => ondaDe(chave), [chave]);
  // o <audio> é do React, que zera `ref` ANTES deste cleanup rodar: o elemento que tocou fica guardado
  // à parte — ao sair (voltar pra lista, trocar de conversa) ele para e solta o "um áudio por vez"
  const tocouRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    const a = tocouRef.current;
    if (a) { a.pause(); if (audioTocando === a) audioTocando = null; }
  }, []);
  const alternar = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) {
      if (audioTocando && audioTocando !== a) audioTocando.pause();
      audioTocando = a;
      tocouRef.current = a;
      a.playbackRate = vel;
      setOuvido(true);
      // play() seguido de pause() rejeita com AbortError — isso NÃO é falha do áudio
      void a.play().catch((e) => { if ((e as DOMException)?.name !== 'AbortError') setFalhou(true); });
    } else a.pause();
  };
  const irPara = (t: number) => { const a = ref.current; if (!a || !dur) return; a.currentTime = Math.max(0, Math.min(dur, t)); setPos(a.currentTime); };
  const indisponivel = falhou || falhouUrl;
  const carregando = !url && !indisponivel;
  const frac = dur > 0 ? Math.min(1, pos / dur) : 0;
  const usavel = !!url && dur > 0 && !indisponivel;
  const ativo = tocando || pos > 0;
  // microfone: do cliente = verde até ouvir aqui; nosso = azul quando o cliente já leu, cinza antes
  const micTom = saida ? (lida ? 'zp-mic-azul' : 'zp-mic-cinza') : (ouvido ? 'zp-mic-azul' : 'zp-mic-verde');
  const velTxt = `${String(vel).replace('.', ',')}×`;
  return (
    <div className="zp-audio">
      <button type="button" className="zp-audio-play" onClick={alternar} disabled={carregando || indisponivel}
        aria-label={indisponivel ? 'Áudio indisponível' : carregando ? 'Carregando o áudio' : tocando ? 'Pausar áudio' : 'Tocar áudio'}>
        {carregando ? <span className="zp-giro" aria-hidden /> : tocando ? <IcPausa /> : <IcPlay />}
      </button>
      <div className="zp-audio-meio">
        <div className="zp-onda" role="slider" tabIndex={usavel ? 0 : -1} aria-disabled={!usavel} aria-label="Posição do áudio"
          aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)}
          aria-valuetext={dur > 0 ? `${mmss(pos)} de ${mmss(dur)}` : 'Duração indisponível'}
          onKeyDown={(e) => {
            const a = ref.current; if (!a || !dur) return;
            const passo: Record<string, number> = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 15, PageDown: -15 };
            if (e.key in passo) { e.preventDefault(); irPara(a.currentTime + passo[e.key]); }
            else if (e.key === 'Home') { e.preventDefault(); irPara(0); }
            else if (e.key === 'End') { e.preventDefault(); irPara(dur); }
          }}
          onClick={(e) => { if (!dur) return; const r = e.currentTarget.getBoundingClientRect(); irPara(((e.clientX - r.left) / r.width) * dur); }}>
          {barras.map((h, i) => <i key={i} className={ativo && (i + 0.5) / barras.length <= frac ? 'zp-onda-on' : undefined} style={{ height: `${Math.round(h * 100)}%` }} />)}
          <span className="zp-onda-ponto" style={{ left: `${frac * 100}%` }} aria-hidden />
        </div>
        <span className="zp-audio-dur">{indisponivel ? 'Áudio indisponível' : ativo ? mmss(pos) : dur ? mmss(dur) : ''}</span>
      </div>
      {ativo ? (
        <button type="button" className="zp-audio-vel" aria-label={`Velocidade do áudio: ${velTxt}`} onClick={() => {
          const nx = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1;
          setVel(nx);
          if (ref.current) ref.current.playbackRate = nx;
        }}>{velTxt}</button>
      ) : (
        <span className="zp-audio-av" style={{ background: corDe(autor) }} aria-hidden>
          {iniciaisDe(autor)}
          <i className={`zp-audio-mic ${micTom}`}><IcMic w={12} /></i>
        </span>
      )}
      {url && (
        <audio ref={ref} src={url} preload="metadata"
          onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
          onEnded={() => { setTocando(false); setPos(0); }}
          onError={() => setFalhou(true)}
          onTimeUpdate={(e) => setPos((e.target as HTMLAudioElement).currentTime)}
          onLoadedMetadata={(e) => { const d = (e.target as HTMLAudioElement).duration; if (isFinite(d)) setDur(d); }} />
      )}
    </div>
  );
}

/* nome de arquivo x legenda: o servidor grava o NOME do arquivo como conteúdo quando a mídia vai sem legenda.
   Só é "nome de arquivo" se terminar com a MESMA extensão do arquivo guardado (evita confundir "pago dia 05.10"). */
const basenameMidia = (path: string) => (path.split('/').pop() ?? 'arquivo').replace(/^[a-z0-9]+-[0-9a-f]{8}-/, '');
function legendaEhNomeDoArquivo(legenda: string | null, path: string): boolean {
  const l = (legenda ?? '').trim(); if (!l || l.includes('\n')) return false;
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  if (!ext || !/[a-z]/.test(ext) || ext.length > 5) return false;
  if (l.toLowerCase().endsWith(`.${ext}`)) return true;
  return l.replace(/[^A-Za-z0-9._-]/g, '_') === basenameMidia(path);
}

/* foto ampliada: portal na raiz v2 (fora do celular), Esc fecha, foco vai e volta */
function ZoomFoto({ url, legenda, aoFechar }: { url: string; legenda: string | null; aoFechar: () => void }) {
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => { aoFecharRef.current = aoFechar; });
  useEffect(() => {
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    const antes = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFecharRef.current(); };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); el.remove(); antes?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => { fecharRef.current?.focus(); }, [raiz]);
  if (!raiz) return null;
  return createPortal(
    <div className="fz-zoom" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={aoFechar}>
      <img src={url} alt={legenda ?? 'Foto'} onClick={(e) => e.stopPropagation()} />
      <button type="button" ref={fecharRef} className="fz-zoom-x" onClick={aoFechar} aria-label="Fechar foto">×</button>
    </div>,
    raiz,
  );
}

/* mídia da bolha (desenho do Painel da Equipe): resolve a URL assinada e desenha pelo tipo — foto
   (amplia no clique), vídeo, mensagem de voz e documento; a legenda de verdade vem embaixo.
   `horaSobre` = hora + tiques por cima da foto sem legenda (como no WhatsApp) */
function MidiaZap({ m, saida, autor, horaSobre }: { m: MensagemWA; saida: boolean; autor: string; horaSobre: ReactNode }) {
  const path = m.midia_path ?? '';
  const tipo = m.tipo;
  const legenda = m.conteudo;
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let vivo = true;
    setUrl(null); setFalhou(false);
    // falha na RENOVAÇÃO não derruba o que já está na tela: fica a URL antiga e tenta no próximo ciclo
    const buscar = (primeira: boolean) => {
      void urlMidiaWA(path)
        .then((u) => { if (!vivo) return; if (u) { setUrl(u); setFalhou(false); } else if (primeira) setFalhou(true); })
        .catch(() => { if (vivo && primeira) setFalhou(true); });
    };
    buscar(true);
    // a URL assinada vale 1h e ficaria congelada numa conversa deixada aberta: renova sozinha antes de vencer
    // (foto e documento; áudio/vídeo ficam de fora — trocar o src no meio reiniciaria a reprodução)
    const renovar = tipo === 'audio' || tipo === 'video' ? null : window.setInterval(() => buscar(false), 45 * 60 * 1000);
    return () => { vivo = false; if (renovar != null) window.clearInterval(renovar); };
  }, [path, tipo]);
  const legendaReal = legendaEhNomeDoArquivo(legenda, path) ? null : legenda;
  const legendaNode = legendaReal
    ? <div className="zp-txt"><WaTexto texto={legendaReal} /><span className={saida ? 'zp-folga zp-folga-out' : 'zp-folga'} aria-hidden /></div>
    : null;
  const ok = !!url && !falhou;

  if (tipo === 'imagem') return (
    <>
      <button type="button" className="zp-img" onClick={() => { if (ok) setZoom(true); }} disabled={!ok} aria-label="Ampliar foto">
        {ok ? <img src={url ?? undefined} alt={legendaReal ?? 'Foto'} onError={() => setFalhou(true)} />
          : <span className="zp-img-vazia">{falhou ? 'Foto indisponível' : 'Carregando foto…'}</span>}
        {!legendaReal && horaSobre}
      </button>
      {legendaNode}
      {zoom && url && <ZoomFoto url={url} legenda={legendaReal} aoFechar={() => setZoom(false)} />}
    </>
  );
  if (tipo === 'video') return (
    <>
      <div className="zp-img zp-img-video">
        {ok ? <video src={url ?? undefined} controls preload="metadata" onError={() => setFalhou(true)} />
          : <span className="zp-img-vazia">{falhou ? 'Vídeo indisponível' : 'Carregando vídeo…'}</span>}
      </div>
      {legendaNode}
    </>
  );
  if (tipo === 'audio') return <AudioZap url={url} falhou={falhou} saida={saida} autor={autor} lida={m.status === 'lida'} chave={m.id} />;

  // documento: ícone com a extensão (vermelho no PDF), nome, tipo e o círculo de baixar
  const nome = legenda && !legendaReal ? legenda.trim() : basenameMidia(path);
  const ext = ((nome.includes('.') ? nome.split('.').pop() : path.split('.').pop()) ?? '').slice(0, 4).toUpperCase();
  const temExt = /^[A-Z0-9]{2,4}$/.test(ext) && /[A-Z]/.test(ext);
  const cls = legendaReal ? 'zp-doc zp-doc-leg' : 'zp-doc';
  const miolo = (
    <>
      <span className={ext === 'PDF' ? 'zp-doc-ic zp-doc-pdf' : 'zp-doc-ic'} aria-hidden>{temExt ? ext : 'DOC'}</span>
      <span className="zp-doc-tx">
        <span className="zp-doc-nm">{nome}</span>
        <span className="zp-doc-mt">{falhou ? 'Documento indisponível' : !url ? 'Carregando…' : temExt ? ext : 'Documento'}</span>
      </span>
      {ok && <span className="zp-doc-dl" aria-hidden><IcBaixar /></span>}
    </>
  );
  return (
    <>
      {ok ? <a href={url ?? undefined} target="_blank" rel="noreferrer" className={cls} aria-label={`Abrir ${nome}`}>{miolo}</a>
        : <div className={cls}>{miolo}</div>}
      {legendaNode}
    </>
  );
}

const EMOJIS_RAPIDOS = ['😀', '😂', '😊', '😍', '🙏', '👍', '👏', '💪', '🙌', '🤝', '❤️', '🔥', '🎉', '✅', '❌', '⚠️', '😅', '😉', '🤔', '😢', '😔', '🤷', '📅', '💰', '💵', '📄', '☀️', '🌙', '🙂', '😃', '🥳', '🫡'];
const ROT_STATUS_MSG: Record<string, string> = { pendente: 'pendente', enviada: 'enviada', entregue: 'entregue', lida: 'lida' };
const semMovimento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* o fio da conversa no desenho do WhatsApp do iPhone (o montarFio do Painel da Equipe): separador de dia,
   a faixa "Aguardando resposta" onde o cliente começou a esperar e, em cada sequência do mesmo lado, o
   respiro antes da 1ª bolha e a cauda na ÚLTIMA */
type ItemFio = { k: 'dia'; id: string; rotulo: string } | { k: 'espera'; id: string; desde: number }
  | { k: 'msg'; id: string; m: MensagemWA; nova: boolean; cauda: boolean };
function montarFioReviza(msgs: readonly MensagemWA[], agora: number, aguardando: boolean): ItemFio[] {
  // onde a espera começa: a 1ª mensagem do cliente depois da nossa última (só se a última é dele)
  let inicioEspera = -1;
  if (aguardando) {
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].direcao === 'entrada') inicioEspera = i; else break; }
  }
  const out: ItemFio[] = [];
  let diaAnt = '';
  let ladoAnt: string | null = null;
  msgs.forEach((m, i) => {
    const ms = Date.parse(m.created_at);
    const dia = Number.isFinite(ms) ? diaSP(ms) : '';
    if (dia && dia !== diaAnt) { out.push({ k: 'dia', id: `dia-${dia}`, rotulo: rotuloDiaFio(dia, agora) }); diaAnt = dia; ladoAnt = null; }
    if (i === inicioEspera && Number.isFinite(ms)) { out.push({ k: 'espera', id: `espera-${m.id}`, desde: ms }); ladoAnt = null; }
    out.push({ k: 'msg', id: m.id, m, nova: ladoAnt !== m.direcao, cauda: true });
    ladoAnt = m.direcao;
  });
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    if (a.k === 'msg' && b.k === 'msg' && !b.nova) a.cauda = false;
  }
  return out;
}

function ChatReviza({ conversa, titulo, estado, aoVoltar, inserirTexto, aoConsumirInsercao, leadId, naoLidasOutras = 0, canal = null, dadosProntos = true }: {
  conversa: ConversaWA; titulo: string; estado: { estado: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' };
  aoVoltar: () => void; inserirTexto?: string | null; aoConsumirInsercao?: () => void; leadId?: string | null;
  /** outras conversas esperando resposta (contador ao lado do "voltar", como no iPhone) */
  naoLidasOutras?: number;
  /** número por onde esta conversa sai (aviso no topo da conversa) */
  canal?: CanalWA | null;
  /** a Gestão já carregou? antes disso não dá pra afirmar "Fora da base" */
  dadosProntos?: boolean;
}) {
  const navigate = useNavigate();
  const q = useMensagensWA(conversa.id);
  const enviar = useEnviarWA();
  const marcarLida = useMarcarLidaWA();
  const lerWA = useLerWA();
  const apagarMsg = useApagarMsgWA();
  const criarEnvio = useCriarEnvioWA();
  const [respondendo, setRespondendo] = useState<MensagemWA | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [gravar, setGravar] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [buscaMsg, setBuscaMsg] = useState('');
  const [prog, setProg] = useState(false);            // programar mensagem
  const [progTexto, setProgTexto] = useState('');
  const [progData, setProgData] = useState('');
  const [progHora, setProgHora] = useState('09:00');
  const [progFile, setProgFile] = useState<File | null>(null);
  const [progSubindo, setProgSubindo] = useState(false);
  const [progErro, setProgErro] = useState('');
  const [ativa, setAtiva] = useState<string | null>(null);   // bolha com a parada de Tab (foco itinerante)
  const [anuncio, setAnuncio] = useState({ n: 0, t: '' });  // leitor de tela: mensagem nova (n muda o nó → anuncia de novo)
  const progFileRef = useRef<HTMLInputElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const internoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuBtRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const emojiBtRef = useRef<HTMLButtonElement>(null);
  const emojisRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // nome como na agenda do celular ("MARIA DA SILVA" → "Maria da Silva"); `titulo` segue cru nos envios
  const nomeTela = nomeAgenda(titulo, conversa.telefone);
  // faixa "Aguardando resposta" (Painel da Equipe): a conversa abriu com mensagem não lida = o cliente
  // esperava. Guardado na abertura — marcar como lida não apaga a faixa; responder apaga (a última
  // mensagem deixa de ser dele)
  const [esperavaAoAbrir] = useState(() => conversa.nao_lidas > 0);
  const todas = q.data ?? [];
  const filtro = buscaMsg.trim().toLowerCase();
  const msgs = filtro ? todas.filter((m) => (m.conteudo ?? '').toLowerCase().includes(filtro)) : todas;

  useEffect(() => {
    if (conversa.nao_lidas > 0) { marcarLida.mutate(conversa.id); lerWA.mutate(conversa.id); }   // local + visto azul no celular do cliente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id, conversa.nao_lidas]);

  /* ---- rolagem: acompanha o fim só quando o usuário ESTÁ no fim (ou acabou de mandar daqui) ---- */
  const [longe, setLonge] = useState(false);          // rolou pra cima: aparece o botão de descer
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const noFimRef = useRef(true);
  const ultimaIdRef = useRef<string | null>(null);
  const acabeiDeEnviarRef = useRef(false);
  const descer = (suave = false) => {
    const el = corpoRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave && !semMovimento() ? 'smooth' : 'auto' });
    noFimRef.current = true; setNovasAbaixo(0);
  };
  const ultima = todas[todas.length - 1];
  useEffect(() => {
    if (!ultima) return;
    const anterior = ultimaIdRef.current;
    if (anterior === ultima.id) return;
    ultimaIdRef.current = ultima.id;
    const el = corpoRef.current;
    if (anterior === null) { if (el) el.scrollTop = el.scrollHeight; return; }     // abriu a conversa: começa no fim
    const idx = todas.findIndex((m) => m.id === anterior);
    const novas = idx >= 0 ? todas.length - 1 - idx : 1;
    const minha = acabeiDeEnviarRef.current && ultima.direcao === 'saida';
    if (minha) acabeiDeEnviarRef.current = false;
    if (noFimRef.current || minha) { if (el) el.scrollTop = el.scrollHeight; }
    else setNovasAbaixo((n) => n + novas);
    if (ultima.direcao === 'entrada') setAnuncio((a) => ({ n: a.n + 1, t: `Nova mensagem de ${nomeTela}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultima?.id]);
  // foto/áudio que carrega depois, barra de resposta, faixa de erro: se estava no fim, continua no fim
  useEffect(() => {
    const el = corpoRef.current, dentro = internoRef.current;
    if (!el || !dentro || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (noFimRef.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el); ro.observe(dentro);
    return () => ro.disconnect();
  }, []);
  // buscar dentro da conversa não é "mensagem nova": só volta pro fim
  useEffect(() => { const el = corpoRef.current; if (el) el.scrollTop = el.scrollHeight; noFimRef.current = true; setNovasAbaixo(0); }, [filtro]);
  const aoRolar = () => {
    const el = corpoRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    noFimRef.current = dist < 60;
    setLonge(dist > 220);
    if (dist < 60) setNovasAbaixo(0);
  };
  /* rola SÓ a conversa (scrollIntoView arrastaria a página inteira) e dá foco à bolha */
  const irParaMsg = (id: string) => {
    const c = corpoRef.current, alvo = document.getElementById(`msg-${id}`);
    if (!c || !alvo) return;
    c.scrollTo({ top: alvo.offsetTop - c.clientHeight / 2 + alvo.offsetHeight / 2, behavior: semMovimento() ? 'auto' : 'smooth' });
    setAtiva(id);
    alvo.focus({ preventScroll: true });
  };

  /* ---- foco ---- */
  const tituloRef = useRef<HTMLElement>(null);
  useEffect(() => {                                   // abriu a conversa: mouse → pronto pra digitar; toque → não abre o teclado
    const fino = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    if (fino) inputRef.current?.focus({ preventScroll: true }); else tituloRef.current?.focus({ preventScroll: true });
  }, []);
  const gravouRef = useRef(false);
  useEffect(() => {                                   // fechou o gravador: foco volta pro campo
    if (gravar) { gravouRef.current = true; return; }
    if (gravouRef.current) { gravouRef.current = false; inputRef.current?.focus({ preventScroll: true }); }
  }, [gravar]);
  const progAbertoRef = useRef(false);
  useEffect(() => {                                   // fechou o Programar: foco volta pro campo
    if (prog) { progAbertoRef.current = true; return; }
    if (progAbertoRef.current) { progAbertoRef.current = false; inputRef.current?.focus({ preventScroll: true }); }
  }, [prog]);
  // menu e emojis: ao abrir, foco no 1º item; Esc fecha e devolve o foco a quem abriu
  useEffect(() => { if (menu) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [menu]);
  useEffect(() => { if (emoji) emojisRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [emoji]);
  useEffect(() => {
    if (!menu && !emoji) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) { setMenu(false); menuBtRef.current?.focus(); }
      if (emoji) { setEmoji(false); emojiBtRef.current?.focus(); }
    };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [menu, emoji]);
  const fecharBusca = () => { setBuscando(false); setBuscaMsg(''); menuBtRef.current?.focus({ preventScroll: true }); };

  // texto de script: com o gravador aberto o campo não existe — espera ele voltar
  useEffect(() => {
    if (!inserirTexto || gravar) return;
    setTexto((t) => (t ? `${t} ` : '') + inserirTexto);
    aoConsumirInsercao?.();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inserirTexto, gravar]);

  // campo de mensagem: 1 linha que cresce com o texto até o teto do CSS (~5 linhas), como no WhatsApp Web.
  // Layout effect pra medir e ajustar ANTES da pintura (sem pulo visível ao digitar);
  // "gravar" na dependência: o campo remonta quando o gravador fecha e precisa recalcular a altura.
  useLayoutEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [texto, gravar]);

  const mandar = () => {
    const t = texto.trim(); if (!t || enviar.isPending || subindo) return;
    setErro(''); setEmoji(false);
    acabeiDeEnviarRef.current = true;
    enviar.mutate({ conversa_id: conversa.id, texto: t, resposta_a: respondendo?.id }, {
      onSuccess: () => { setTexto(''); setRespondendo(null); inputRef.current?.focus({ preventScroll: true }); },
      onError: (e) => { acabeiDeEnviarRef.current = false; setErro((e as Error).message); inputRef.current?.focus({ preventScroll: true }); },
    });
  };
  const mandarArquivo = async (f: File) => {
    // HEIC/HEIF (foto de iPhone) não abre no aparelho do cliente: barra ANTES do upload
    if (/^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) { setErro('Foto do iPhone em HEIC não abre no WhatsApp — converta para JPG antes de enviar.'); return; }
    if (f.size > 16 * 1024 * 1024) { setErro('Arquivo acima de 16MB — o WhatsApp não aceita.'); return; }
    setErro(''); setSubindo(true);
    try {
      const path = await subirMidiaWA(f, f.name);
      acabeiDeEnviarRef.current = true;
      await new Promise<void>((res, rej) => enviar.mutate(
        { conversa_id: conversa.id, texto: texto.trim(), midia_path: path, midia_tipo: tipoDaMidia(f.type), midia_nome: f.name, resposta_a: respondendo?.id },
        { onSuccess: () => { setTexto(''); setRespondendo(null); res(); }, onError: (e) => rej(e) },
      ));
      inputRef.current?.focus({ preventScroll: true });
    } catch (e) { acabeiDeEnviarRef.current = false; setErro((e as Error).message); }
    finally { setSubindo(false); }
  };
  /* o erro NÃO é engolido: volta pro gravador, que mostra o motivo e guarda o áudio pra tentar de novo */
  const mandarAudio = async (blob: Blob, mime: string, ext: string) => {
    setErro(''); setSubindo(true);
    try {
      const nome = `voz-${Date.now().toString(36)}.${ext}`;
      const path = await subirMidiaWA(new File([blob], nome, { type: mime }), nome);
      acabeiDeEnviarRef.current = true;
      await new Promise<void>((res, rej) => enviar.mutate(
        { conversa_id: conversa.id, texto: '', midia_path: path, midia_tipo: 'audio', midia_nome: nome, resposta_a: respondendo?.id },
        { onSuccess: () => { setRespondendo(null); res(); }, onError: (e) => { acabeiDeEnviarRef.current = false; rej(e); } },
      ));
      setGravar(false);
    } finally { setSubindo(false); }
  };
  // o texto do campo vai pro Programar; programado com sucesso, ele SAI do campo (senão um Enter mandava
  // a mesma mensagem agora, em dobro com a programada)
  const progDoCampoRef = useRef('');
  const abrirProgramar = () => { setMenu(false); setProgErro(''); setProgTexto(texto); progDoCampoRef.current = texto; setProg(true); };
  const programar = async () => {
    const t = progTexto.trim();
    if (!t && !progFile) { setProgErro('Escreva a mensagem ou anexe um arquivo (áudio, foto, vídeo, documento).'); return; }
    if (!progData || !progHora) { setProgErro('Escolha o dia e o horário.'); return; }
    const dt = new Date(`${progData}T${progHora}`);
    if (!(dt.getTime() > Date.now())) { setProgErro('O agendamento precisa ser no futuro.'); return; }
    if (progFile && progFile.size > 16 * 1024 * 1024) { setProgErro('Arquivo acima de 16MB — o WhatsApp não aceita.'); return; }
    setProgErro(''); setProgSubindo(true);
    try {
      let midia: { path: string; tipo: TipoMidiaWA; nome: string } | null = null;
      if (progFile) {
        const path = await subirMidiaWA(progFile, progFile.name);
        midia = { path, tipo: tipoDaMidia(progFile.type), nome: progFile.name };
      }
      await new Promise<void>((res, rej) => criarEnvio.mutate({
        nome: `Programada · ${titulo}`.slice(0, 60), canal_id: conversa.canal_id, texto: t,
        agendado_para: dt.toISOString(), midia,
        alvos: [{ telefone: conversa.telefone, nome: titulo, lead_id: leadId ?? conversa.lead_id ?? null }],
        presenca: true, delay_min: 3, delay_max: 6,
      }, { onSuccess: () => res(), onError: (e) => rej(e) }));
      setProg(false); setProgTexto(''); setProgFile(null); setProgErro('');
      const doCampo = progDoCampoRef.current; progDoCampoRef.current = '';
      if (doCampo.trim()) setTexto((tx) => (tx === doCampo ? '' : tx));
    } catch (e) { setProgErro((e as Error).message); }
    finally { setProgSubindo(false); }
  };

  const digitando = !!conversa.digitando_ate && new Date(conversa.digitando_ate).getTime() > Date.now();
  const tituloEhNumero = soDigitos(titulo).length >= 8 && !/\p{L}/u.test(titulo);
  const rotEstado = estado.estado === 'Contato' ? (dadosProntos ? 'Fora da base' : '') : estado.estado;
  const subtitulo = [rotEstado, tituloEhNumero ? '' : fmtTel(conversa.telefone)].filter(Boolean).join(' · ');
  const canalNome = nomeGente(canal?.nome);
  const autorDe = (m: MensagemWA | undefined) => (m?.direcao === 'saida' ? 'Você' : nomeTela);
  // quem fala no áudio nosso: o dono do número por onde a conversa sai
  const autorAudio = (m: MensagemWA) => (m.direcao === 'saida' ? canalNome || 'Você' : nomeTela);
  const resumoMsg = (m: MensagemWA) => (m.conteudo && !(m.midia_path && legendaEhNomeDoArquivo(m.conteudo, m.midia_path)) ? m.conteudo : ROT_TIPO[ALIAS_PREVIA[m.tipo] ?? ''] ?? 'Mídia');
  const idAtiva = ativa && msgs.some((m) => m.id === ativa) ? ativa : msgs[msgs.length - 1]?.id ?? null;
  const moverFoco = (de: HTMLElement, passo: number) => {
    const bolhas = Array.from(corpoRef.current?.querySelectorAll<HTMLElement>('.zp-b[data-id]') ?? []);
    const i = bolhas.indexOf(de); const alvo = bolhas[i + passo];
    if (alvo) { alvo.focus(); setAtiva(alvo.dataset.id ?? null); }
  };
  // o fio pronto pra desenhar: separador de dia + respiro antes da 1ª bolha e cauda na ÚLTIMA de cada sequência
  const hojeSP = diaSP(Date.now());
  const itens = useMemo(() => montarFioReviza(msgs, Date.now(), esperavaAoAbrir && !filtro), [msgs, hojeSP, esperavaAoAbrir, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="zp-conv">
      <span className="fz-sr" role="status" aria-live="polite"><span key={anuncio.n}>{anuncio.t}</span></span>
      <header className="zp-conv-topo">
        <button type="button" className="zp-voltar" onClick={aoVoltar} aria-label={`Voltar para as conversas${naoLidasOutras > 0 ? `, ${naoLidasOutras} com mensagem não lida` : ''}`}>
          <IcVoltar />{naoLidasOutras > 0 && <span className="zp-voltar-n" aria-hidden>{naoLidasOutras > 99 ? '99+' : naoLidasOutras}</span>}
        </button>
        <span className="zp-av zp-av-p" style={{ background: corDe(conversa.id) }} aria-hidden>
          {iniciaisDe(nomeTela) || <IcContatoMini />}<FotoCliente ilustrativa nome={nomeTela} id={conversa.lead_id ?? conversa.id} tam={38} />
        </span>
        <span className="zp-conv-quem">
          <b ref={tituloRef} tabIndex={-1}>{nomeTela}</b>
          {digitando ? <span className="zp-sub-neutro">digitando…</span> : subtitulo ? <span>{subtitulo}</span> : null}
        </span>
        <span className="zp-conv-icones">
          <button type="button" className="zp-conv-bt zp-bt-relogio" title="Programar mensagem (dia e horário)" aria-label="Programar mensagem"
            onClick={abrirProgramar} disabled={subindo}><IcRelogio /></button>
          <span className="zp-menu-ancora">
            <button type="button" ref={menuBtRef} className={menu ? 'zp-conv-bt on' : 'zp-conv-bt'} title="Mais opções" aria-label="Mais opções"
              aria-haspopup="true" aria-expanded={menu} aria-controls={menu ? `zp-menu-${conversa.id}` : undefined} onClick={() => setMenu((v) => !v)}>
              <IcMaisOpcoes />
            </button>
            {menu && (
              <>
                <div className="zp-cortina" onClick={() => setMenu(false)} aria-hidden />
                <div className="zp-menu" id={`zp-menu-${conversa.id}`} ref={menuRef}>
                  <button type="button" onClick={abrirProgramar}><span>Programar mensagem</span><IcRelogio /></button>
                  <button type="button" onClick={() => { setMenu(false); setBuscando(true); setBuscaMsg(''); }}><span>Buscar na conversa</span><IcBusca /></button>
                  <button type="button" onClick={() => { setMenu(false); navigate('/cobrancas/planilha'); }}><span>Abrir na Gestão</span><IcGestao /></button>
                </div>
              </>
            )}
          </span>
        </span>
      </header>
      {buscando && (
        <div className="zp-buscachat">
          <label className="zp-busca">
            <IcBusca />
            <input autoFocus placeholder="Buscar nesta conversa" value={buscaMsg} onChange={(e) => setBuscaMsg(e.target.value)} aria-label="Buscar nesta conversa"
              onKeyDown={(e) => { if (e.key === 'Escape') fecharBusca(); }} />
          </label>
          {filtro ? <span className="zp-buscachat-n" role="status">{msgs.length} resultado{msgs.length === 1 ? '' : 's'}</span> : null}
          <button type="button" className="zp-acao-txt" onClick={fecharBusca}>Fechar</button>
        </div>
      )}
      {erro && (
        <div className="zp-erro" role="alert">
          <IcAlerta />
          <span>{erro}</span>
          <button type="button" onClick={() => setErro('')} aria-label="Fechar aviso"><IcFechar w={16} /></button>
        </div>
      )}
      <div className="zp-fio-caixa">
        <div className="zp-fio" ref={corpoRef} onScroll={aoRolar}>
          <div className="zp-fio-in" ref={internoRef}>
            {!filtro && canalNome && (
              <div className="zp-aviso-sup">
                <IcCadeado />
                {/* o "·" vai junto do número (nowrap): quebrando, os dois descem juntos — nunca sobra "·" no fim da linha */}
                <span>Conversa pelo número de <b>{canalNome}</b>{canal?.numero ? <> <span className="zp-nowrap">· {fmtTel(canal.numero)}</span></> : null}</span>
              </div>
            )}
            {q.isLoading ? (
              <div className="zp-esq-msgs" role="status" aria-label="Carregando mensagens"><i className="in" /><i className="out" /><i className="in curta" /><i className="out longa" /></div>
            ) : q.isError && !q.data ? (
              <div className="zp-evento zp-falha">
                <span><b>Não foi possível carregar as mensagens agora.</b><button type="button" className="zp-acao-txt" onClick={() => { void q.refetch(); }}>Tentar de novo</button></span>
              </div>
            ) : msgs.length === 0 ? (
              <div className="zp-evento"><span>{filtro ? 'Nada encontrado' : 'Sem mensagens ainda'}</span></div>
            ) : itens.map((it) => {
              if (it.k === 'dia') return <div key={it.id} className="zp-dia"><span>{it.rotulo}</span></div>;
              if (it.k === 'espera') {
                const agoraMs = Date.now();
                return <div key={it.id} className={`zp-espera zp-espera-${tomEspera(it.desde, agoraMs)}`}><span>Aguardando resposta {fmtHa(it.desde, agoraMs)}</span></div>;
              }
              const m = it.m;
              const saida = m.direcao === 'saida';
              const falhou = m.status === 'erro';
              const semLegenda = !m.conteudo || (!!m.midia_path && legendaEhNomeDoArquivo(m.conteudo, m.midia_path));
              const midia = !!m.midia_path && !m.apagada;
              const fotoOuVideo = midia && (m.tipo === 'imagem' || m.tipo === 'video');
              const fotoNua = midia && m.tipo === 'imagem' && semLegenda;     // hora por cima da foto
              const videoNu = midia && m.tipo === 'video' && semLegenda;      // hora numa faixa embaixo (não cobre os controles)
              const hora = horaSP(Date.parse(m.created_at));
              const foco = idAtiva === m.id ? 0 : -1;
              const folga = <span className={saida ? 'zp-folga zp-folga-out' : 'zp-folga'} aria-hidden />;
              const tiques = !saida || m.apagada ? null
                : falhou ? <span role="img" aria-label="Falha no envio" title="Falha no envio"><Tiques status="falhou" /></span>
                : <><span aria-hidden><Tiques status={m.status} /></span><span className="fz-sr">{ROT_STATUS_MSG[m.status] ?? m.status}</span></>;
              const cls = ['zp-b', saida ? 'zp-b-out' : 'zp-b-in', it.cauda ? 'zp-cauda' : '', fotoOuVideo ? 'zp-b-midia' : '',
                midia && m.tipo === 'audio' ? 'zp-b-audio' : '', videoNu ? 'zp-b-vid' : '', falhou && saida ? 'zp-b-falha' : ''].filter(Boolean).join(' ');
              return (
                <div key={it.id} className={`zp-linha-b ${saida ? 'zp-lb-out' : 'zp-lb-in'}${it.nova ? ' zp-lb-nova' : ''}`}>
                  <div id={`msg-${m.id}`} data-id={m.id} tabIndex={foco} role="article" className={cls}
                    aria-label={`${autorDe(m)}, ${hora}${falhou ? ', não enviada' : ''}`} title={falhou && saida ? 'Falha no envio' : undefined}
                    onFocus={(e) => { if (e.target === e.currentTarget) setAtiva(m.id); }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'ArrowUp') { e.preventDefault(); moverFoco(e.currentTarget, -1); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); moverFoco(e.currentTarget, 1); }
                    }}>
                    {!m.apagada && (
                      <span className="zp-b-acoes">
                        <button type="button" tabIndex={foco} title="Responder" aria-label="Responder" onClick={() => { setRespondendo(m); inputRef.current?.focus(); }}><IcResponder /></button>
                        {saida && (
                          <button type="button" tabIndex={foco} title="Apagar para todos" aria-label="Apagar para todos" onClick={() => { if (window.confirm('Apagar esta mensagem para todos?')) apagarMsg.mutate({ mensagem_id: m.id, conversa_id: conversa.id }, { onError: (er) => setErro((er as Error).message) }); }}>
                            <IcLixo />
                          </button>
                        )}
                      </span>
                    )}
                    {m.resposta_a && !m.apagada && (() => {
                      const orig = todas.find((x) => x.id === m.resposta_a);
                      return (
                        <button type="button" tabIndex={foco} className={orig?.direcao === 'saida' ? 'zp-cit zp-cit-eu' : 'zp-cit'} onClick={() => { if (m.resposta_a) irParaMsg(m.resposta_a); }}>
                          <b>{orig ? autorDe(orig) : 'Mensagem'}</b>
                          <span>{orig ? resumoMsg(orig).slice(0, 90) : 'Mensagem original não carregada'}</span>
                        </button>
                      );
                    })()}
                    {m.apagada
                      ? <div className="zp-txt"><span className="zp-apagada"><IcApagada />{saida ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}</span>{folga}</div>
                      : m.midia_path
                        ? <MidiaZap m={m} saida={saida} autor={autorAudio(m)} horaSobre={<span className="zp-hh zp-hh-sobre">{hora}{tiques}</span>} />
                        : m.conteudo != null
                          ? <div className="zp-txt"><WaTexto texto={m.conteudo} />{folga}</div>
                          : <div className="zp-txt"><span className="zp-tipo-rot">{rotuloTipoMsg(m.tipo)}</span>{folga}</div>}
                    {!fotoNua && <span className="zp-hh">{hora}{tiques}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(longe || novasAbaixo > 0) && !emoji && (
          <button type="button" className="zp-descer" onClick={() => descer(true)} aria-label={novasAbaixo > 0 ? `${novasAbaixo} mensagens novas — ir para o fim` : 'Ir para o fim da conversa'}>
            {novasAbaixo > 0 && <span className="zp-badge zp-descer-n" aria-hidden>{novasAbaixo > 99 ? '99+' : novasAbaixo}</span>}
            <IcDescer />
          </button>
        )}
      </div>
      {respondendo && (
        <div className="zp-resp">
          <div className={respondendo.direcao === 'saida' ? 'zp-cit zp-cit-eu' : 'zp-cit'}>
            <b>{autorDe(respondendo)}</b>
            <span>{resumoMsg(respondendo).slice(0, 110)}</span>
          </div>
          <button type="button" className="zp-resp-x" aria-label="Cancelar resposta" onClick={() => { setRespondendo(null); inputRef.current?.focus(); }}><IcFechar /></button>
        </div>
      )}
      <footer className="zp-conv-pe zp-pe-edita">
        <input ref={arquivoRef} type="file" hidden
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void mandarArquivo(f); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" hidden accept="image/*,video/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void mandarArquivo(f); e.target.value = ''; }} />
        {gravar ? (
          <AudioRecorderV2 pele="zap" autoIniciar rotuloEnviar="Enviar áudio" disabled={subindo}
            aoFechar={() => setGravar(false)}
            onEnviar={async (blob, mime, ext) => { await mandarAudio(blob, mime, ext); }} />
        ) : (
          <>
            <button type="button" className="zp-pe-bt" title="Anexar foto, vídeo, áudio ou documento" aria-label="Anexar arquivo"
              onClick={() => arquivoRef.current?.click()} disabled={subindo || enviar.isPending}>
              <IcMais />
            </button>
            <div className="zp-pe-campo zp-pe-edita">
              {/* readOnly (e não disabled) durante o envio: disabled joga o foco pro nada e a próxima digitação se perde.
                  Enter envia; Shift+Enter quebra a linha (padrão WhatsApp Web) */}
              <textarea ref={inputRef} rows={1} placeholder={subindo ? 'Enviando mídia…' : 'Mensagem'} value={texto} readOnly={enviar.isPending || subindo}
                aria-busy={enviar.isPending || subindo} aria-label="Mensagem"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); } }} />
              <button type="button" ref={emojiBtRef} className={emoji ? 'zp-pe-emoji on' : 'zp-pe-emoji'} title="Emoji" aria-label="Emoji"
                aria-haspopup="true" aria-expanded={emoji} aria-controls={emoji ? `zp-emojis-${conversa.id}` : undefined} onClick={() => setEmoji((v) => !v)} disabled={subindo}>
                <IcEmoji />
              </button>
              {emoji && (
                <>
                  <div className="zp-cortina" onClick={() => setEmoji(false)} aria-hidden />
                  <div className="zp-emojis" id={`zp-emojis-${conversa.id}`} ref={emojisRef} role="group" aria-label="Emojis">
                    {EMOJIS_RAPIDOS.map((e) => (
                      <button type="button" key={e} onClick={() => { setTexto((t) => t + e); inputRef.current?.focus(); }}>{e}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button type="button" className="zp-pe-bt zp-bt-camera" title="Anexar foto ou vídeo" aria-label="Anexar foto ou vídeo"
              onClick={() => cameraRef.current?.click()} disabled={subindo || enviar.isPending}>
              <IcCamera />
            </button>
            {texto.trim() ? (
              <button type="button" className="zp-pe-abrir" onClick={mandar} disabled={enviar.isPending || subindo} aria-label="Enviar mensagem" title="Enviar">
                <IcEnviar />
              </button>
            ) : (
              <button type="button" className="zp-pe-abrir" title="Gravar áudio" aria-label="Gravar áudio"
                onClick={() => { setEmoji(false); setGravar(true); }} disabled={subindo || enviar.isPending}>
                <IcMic w={18} />
              </button>
            )}
          </>
        )}
      </footer>

      {prog && (
        <ModalV2 aberto aoFechar={() => setProg(false)} largura={440}
          titulo={<div>Programar mensagem<div className="mod-sub">{nomeTela} · sai pelo mesmo número desta conversa</div></div>}
          rodape={<><BotaoSec onClick={() => setProg(false)}>Cancelar</BotaoSec><BotaoPrimario onClick={() => { void programar(); }} disabled={criarEnvio.isPending || progSubindo}>{criarEnvio.isPending || progSubindo ? 'Programando…' : 'Programar'}</BotaoPrimario></>}>
          <div className="gs-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="campo gs-col2"><label>Mensagem</label>
              <textarea className="inp" rows={3} value={progTexto} placeholder="O que vai ser enviado…"
                style={{ resize: 'vertical', minHeight: 64, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 1.45, padding: '9px 12px' }}
                onChange={(e) => setProgTexto(e.target.value)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {VARS_MSG.map((v) => (
                  <button type="button" key={v} className="cm-cli-filtro-btn cc-var-btn" title={`${DICA_VAR[v]}. Clique para inserir ${v}`}
                    onClick={() => setProgTexto((tx) => (tx.trim() ? `${tx.replace(/\s+$/, '')} ${v}` : v))}><span className="cc-var">{v.slice(1, -1)}</span></button>
                ))}
              </div>
            </div>
            <div className="campo gs-col2"><label>Arquivo <span className="gs-lab-nota">(áudio, foto, vídeo ou documento — opcional)</span></label>
              <input ref={progFileRef} type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setProgFile(f); e.target.value = ''; }} />
              {progFile ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="cm-hint" style={{ margin: 0 }}>{progFile.name} · {(progFile.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}MB</span>
                  <BotaoSec mini onClick={() => setProgFile(null)}>Remover</BotaoSec>
                </div>
              ) : <BotaoSec mini onClick={() => progFileRef.current?.click()}>Escolher arquivo</BotaoSec>}
            </div>
            <div className="campo"><label>Dia</label><Input type="date" value={progData} onChange={(e) => setProgData(e.target.value)} /></div>
            <div className="campo"><label>Horário</label><Input type="time" value={progHora} onChange={(e) => setProgHora(e.target.value)} /></div>
            {progErro && <div className="gs-aviso erro gs-col2" role="alert" style={{ margin: 0 }}><span>{progErro}</span></div>}
            <p className="cm-hint gs-col2" style={{ margin: 0 }}>A mensagem programada aparece em Envios, onde é possível cancelá-la até a hora do disparo. Se faltar no cadastro o dado de uma variável, a mensagem não sai errada: vira um erro explicado na fila.</p>
          </div>
        </ModalV2>
      )}
    </div>
  );
}


/* =================== RÉGUA (modelo da demo, persistida) ===================
   24/09 (dono: "configura a régua, tudo tem que funcionar"): população = carteira
   EM COBRANÇA; cada cliente sai pelo número do PRÓPRIO comercial (reserva opcional);
   dias de envio, teto por número, pausa quando o cliente responde e intervalo
   configuráveis; prévia real do motor (hoje/amanhã) antes de ligar; passos pausáveis. */
const isoLocalR = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function ReguaReviza({ gestor, aoAvisar }: { gestor: boolean; aoAvisar: (t: string, tom?: 'ok' | 'erro') => void }) {
  const navigate = useNavigate();
  const { data } = useDadosCobranca();
  const dados = data ?? VAZIO;
  const clientes = useMemo(() => clientesReais(dados), [dados]);
  // quem a régua cobra = carteira EM COBRANÇA (ClienteAnalise.ativo = situacao 'cancelado')
  const carteira = useMemo(() => clientes.filter((c) => c.ativo !== false), [clientes]);
  // "mensagem pra um cliente": quem está nos Cancelados não recebe a régua (o motor ignora) — não é sugerido
  const clientesOrd = useMemo(() => clientes.filter((c) => !c.cancelado).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes]);
  /** nome de um cliente já escolhido (mesmo se hoje está nos Cancelados; senão o nome gravado na mensagem) */
  const nomeCliMsg = (id: string | null | undefined) => (id ? clientes.find((c) => c.id === id)?.nome ?? rows.find((r) => r.cli_id === id)?.cli_nome ?? 'Cliente' : 'Cliente');
  const atendentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of carteira) { const a = (c.atendente || '').trim(); if (a && a !== '—' && !m.has(a.toUpperCase())) m.set(a.toUpperCase(), a); }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [carteira]);
  const contaMembros = (criterio: string): { total: number; zap: number } => {
    const alvo = criterio === 'todos' ? carteira
      : criterio.startsWith('comp:') ? carteira.filter((c) => c.comportamento === criterio.slice(5))
      : criterio.startsWith('atend:') ? carteira.filter((c) => c.atendente.trim().toUpperCase() === criterio.slice(6).trim().toUpperCase())
      : [];
    return { total: alvo.length, zap: alvo.filter((c) => !!c.whatsapp).length };
  };

  const q = useReguaWA();
  const salvarMsg = useSalvarReguaMsg();
  const excluirMsg = useExcluirReguaMsg();
  const cfgQ = useReguaConfigWA();
  const salvarCfg = useSalvarReguaConfigWA();
  const canaisQ = useCanaisWA();
  const hoje = isoLocalR(new Date());
  const amanha = isoLocalR(new Date(Date.now() + 864e5));
  const previaQ = usePreviaReguaWA({ de: hoje, ate: amanha });
  const [subaba, setSubaba] = useState<'padrao' | 'grupos' | 'cliente'>('padrao');
  // RÉGUA DE CADA COMERCIAL (dono 26/10): o comercial vê e edita só a DELE; admin/gestor escolhem
  // de quem é a régua aberta ('' = a padrão). Só a mensagem muda — os dias são os da padrão.
  const papelQ = usePapel();
  const sessao = papelQ.data;
  const papelCarregando = !gestor && papelQ.isLoading;   // sem isso o comercial vê as abas da gestão por um instante
  const souComercial = !gestor && sessao?.papel === 'comercial';
  const minhaChave = chaveComercial(sessao?.nome);
  const versoesQ = useReguaVersoesWA();
  const salvarVersao = useSalvarVersaoWA();
  const excluirVersao = useExcluirVersaoWA();
  const [reguaDe, setReguaDe] = useState('');
  const reguaAberta = souComercial ? minhaChave : reguaDe;
  const [usarPadrao, setUsarPadrao] = useState<ReguaVersaoWA | null>(null);
  const [excluirDoCom, setExcluirDoCom] = useState<{ passo: MsgDef; com: string } | null>(null);
  const [ed, setEd] = useState<EdReg | null>(null);
  const [confirmaLigar, setConfirmaLigar] = useState(false);
  const [confirmaDesligar, setConfirmaDesligar] = useState(false);
  const [excluir, setExcluir] = useState<ReguaMsgWA | null>(null);
  const [buscaCliEd, setBuscaCliEd] = useState('');
  const cfg = cfgQ.data;
  const ligada = cfg?.ativa === true;
  const horaCfg = cfg?.hora_envio ?? 9;
  const fimCfg = cfg?.hora_fim ?? 20;
  const conectados = (canaisQ.data ?? []).filter((c) => c.estado === 'conectado');
  const salvar = (c: Partial<ReguaConfigWA>, ok?: string) => salvarCfg.mutate(c, { onSuccess: () => { if (ok) aoAvisar(ok); }, onError: (er) => aoAvisar((er as Error).message) });
  /* horário de início de UM comercial (mig 83): o próprio comercial ou o gestor — só essa chave muda */
  const horarioMut = useHorarioComercialWA();
  const mudarHorario = (chave: string, nome: string, hora: number | null) => horarioMut.mutate({ comercial: chave, hora, nome }, {
    onSuccess: (r) => aoAvisar(r.depois != null
      ? `As mensagens ${chave === minhaChave && souComercial ? 'dos seus clientes' : `dos clientes de ${nome}`} começam às ${String(r.depois).padStart(2, '0')}:00 (até ${String(r.fim).padStart(2, '0')}:00). É possível voltar pelo botão Desfazer.`
      : `${chave === minhaChave && souComercial ? 'Seus clientes voltam' : `Os clientes de ${nome} voltam`} para o início geral (${String(r.inicio_geral).padStart(2, '0')}:00). É possível voltar pelo botão Desfazer.`),
    onError: (er) => aoAvisar((er as Error).message, 'erro'),
  });

  const rows = (q.data ?? []).filter((r) => r.alvo !== 'script');
  const ativas = rows.filter((r) => r.ativo);
  const pausadas = rows.filter((r) => !r.ativo);
  const msgDe = (r: ReguaMsgWA): MsgDef => ({ id: r.id, nome: r.nome, quando: r.quando, blocos: (r.blocos ?? []) as Bloco[] });
  const padrao: MsgDef[] = ativas.filter((r) => r.alvo === 'padrao').map(msgDe);
  const grupos: GrupoMsg[] = ativas.filter((r) => r.alvo === 'grupo').map((r) => ({ id: r.id, nome: r.grupo_nome ?? 'Grupo', criterio: r.criterio ?? 'todos', msg: msgDe(r) }));
  const porCli: CliMsg[] = ativas.filter((r) => r.alvo === 'cliente').map((r) => ({ id: r.id, cliId: r.cli_id ?? '', cliNome: r.cli_nome ?? 'Cliente', data: r.data_envio ?? '', msg: msgDe(r) }));
  const rowDe = (id: string) => rows.find((r) => r.id === id);
  const versoes = versoesQ.data ?? [];
  const versaoDe = (passoId: string, com: string) => versoes.find((v) => v.passo_id === passoId && v.comercial === com) ?? null;
  const versaoCom = (passoId: string, com: string): VersaoCom | null => {
    const v = versaoDe(passoId, com);
    return v ? { blocos: (v.blocos ?? []) as Bloco[], excluida: !!v.excluida, quando: v.quando ?? null } : null;
  };
  const padraoAtivos = rows.filter((r) => r.alvo === 'padrao' && r.ativo).map((r) => ({ id: r.id, nome: r.nome, quando: r.quando, blocos: (r.blocos ?? []) as Bloco[] }));
  // comerciais da carteira + quem já tem mensagem própria (mesmo sem cliente hoje)
  const idsAtivos = useMemo(() => new Set(rows.filter((r) => r.alvo === 'padrao' && r.ativo).map((r) => r.id)), [rows]);
  const opcoesDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of atendentes) { const k = chaveComercial(a); if (k && !m.has(k)) m.set(k, nomeComercial(a)); }
    for (const v of versoesQ.data ?? []) if (!m.has(v.comercial)) m.set(v.comercial, nomeComercial(v.comercial));
    if (reguaDe && !m.has(reguaDe)) m.set(reguaDe, nomeComercial(reguaDe));   // não some da lista depois de voltar pra padrão
    // contagem = mensagens próprias de passos ATIVOS (as de passo pausado não aparecem nos cartões)
    return [...m.entries()].map(([chave, nome]) => ({ chave, nome, proprias: (versoesQ.data ?? []).filter((v) => v.comercial === chave && idsAtivos.has(v.passo_id)).length }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [atendentes, versoesQ.data, reguaDe, idsAtivos]);
  const nomeDe = (k: string) => opcoesDe.find((o) => o.chave === k)?.nome ?? nomeComercial(k);
  const propriasDoPasso = (passoId: string) => versoes.filter((v) => v.passo_id === passoId && !v.excluida && ((v.blocos ?? []).length > 0 || v.quando != null)).map((v) => nomeDe(v.comercial)).sort();
  const excluidasDoPasso = (passoId: string) => versoes.filter((v) => v.passo_id === passoId && v.excluida).map((v) => nomeDe(v.comercial)).sort();
  /** excluir o passo só da régua do comercial (guarda a mensagem própria, se houver) / voltar a usar */
  const marcarExcluida = (passo: MsgDef, com: string, excluida: boolean) => {
    const v = versaoDe(passo.id, com);
    const blocos = ((v?.blocos ?? []) as Bloco[]);
    // o dia próprio fica guardado junto com a exclusão — se ainda valer (a padrão pode ter mudado de lado)
    const quando = diaProprioValido(passo, versaoCom(passo.id, com));
    const fim = (txt: string) => ({ onSuccess: () => { setExcluirDoCom(null); aoAvisar(txt); }, onError: (e: unknown) => aoAvisar((e as Error).message) });
    if (excluida) {
      salvarVersao.mutate({ passo_id: passo.id, comercial: com, blocos, excluida: true, quando, nome: nomeDe(com) },
        fim(`“${passo.nome}” excluída da régua de ${nomeDe(com)}: ${souComercial ? 'seus clientes' : `os clientes de ${nomeDe(com)}`} não recebem mais essa mensagem.`));
    } else if (v && (blocos.length || quando != null)) {
      if (diaVaiColidir(padraoAtivos, (pid) => versaoCom(pid, com), passo, quando ?? passo.quando, true)) {
        aoAvisar('Outra mensagem dessa régua já sai no dia dela. Mude o dia de uma delas antes de voltar a usar.'); return;
      }
      salvarVersao.mutate({ passo_id: passo.id, comercial: com, blocos, excluida: false, quando, nome: nomeDe(com) }, fim(`“${passo.nome}” volta a sair na régua de ${nomeDe(com)} (com o que tinha sido personalizado).`));
    } else if (v) {
      if (diaVaiColidir(padraoAtivos, (pid) => versaoCom(pid, com), passo, passo.quando, true)) {
        aoAvisar('Outra mensagem dessa régua já sai no dia dela. Mude o dia de uma delas antes de voltar a usar.'); return;
      }
      excluirVersao.mutate({ ...v, nome: nomeDe(com) }, fim(`“${passo.nome}” volta a sair na régua de ${nomeDe(com)}.`));
    }
  };
  const alternar = (r: ReguaMsgWA) => salvarMsg.mutate(
    { id: r.id, alvo: r.alvo, nome: r.nome, quando: r.quando, blocos: r.blocos, grupo_nome: r.grupo_nome, criterio: r.criterio, cli_id: r.cli_id, cli_nome: r.cli_nome, data_envio: r.data_envio, ativo: !r.ativo },
    { onSuccess: () => aoAvisar(r.ativo ? `"${r.nome}" pausada: não sai mais até ser reativada.` : `"${r.nome}" reativada.`), onError: (e) => aoAvisar((e as Error).message) });

  // prévia REAL do motor (hoje e amanhã): o que sai, o que aguarda número, o que não sai
  const resumoDia = (d: string, chave?: string) => {
    const xs = (previaQ.data?.itens ?? []).filter((i) => i.data === d && (!chave || chaveComercial(i.comercial) === chave));
    // "aguardando" tem 4 causas no motor — separa pelo começo do motivo que ele grava
    const ag = xs.filter((i) => i.status === 'aguardando');
    const por = (pref: string) => ag.filter((i) => (i.motivo ?? '').startsWith(pref)).length;
    // "depois das {hora_fim}h (fim da janela)" — o motor escreve com a hora configurada
    const falta = por('falta dado'), limite = por('limite diário'), tarde = por('depois das ');
    return {
      vai: xs.filter((i) => i.status === 'vai_receber' || i.status === 'gerado').length, ger: xs.filter((i) => i.status === 'gerado').length,
      numero: ag.length - falta - limite - tarde, falta, limite, tarde, nao: xs.filter((i) => i.status === 'pulado').length,
    };
  };
  const previaFalhou = previaQ.isError && !previaQ.data;
  const detalheDia = (r: ReturnType<typeof resumoDia>) => [
    r.ger ? `${r.ger} já na fila ou enviadas` : '', r.numero ? `${r.numero} aguardando número` : '', r.falta ? `${r.falta} com dado faltando na Gestão` : '',
    r.limite ? `${r.limite} no limite diário` : '', r.tarde ? `${r.tarde} depois das ${fimCfg}h` : '', `${r.nao} não recebem`,
  ].filter(Boolean).join(' · ');
  const rH = resumoDia(hoje), rA = resumoDia(amanha);
  const cobertura = previaQ.data?.cobertura ?? [];
  const tot = cobertura.reduce((s, c) => ({ cli: s.cli + c.clientes, tel: s.tel + c.com_telefone, cob: s.cob + (c.numero?.conectado ? c.com_telefone : 0) }), { cli: 0, tel: 0, cob: 0 });

  /* ---- TELA ORGANIZADA (dono 29/10): o comercial vê "Minha régua"; o gestor, abas ---- */
  const [abaRg, setAbaRg] = useState<AbaRegua>('mensagens');
  const pausaMut = usePausaReguaWA();
  const [confirmaPausa, setConfirmaPausa] = useState<{ chave: string; nome: string } | null>(null);
  const pausadaDe = (k: string) => !!cfg?.regua_pausada?.[k];
  const cobDe = (k: string) => cobertura.find((c) => chaveComercial(c.comercial) === k) ?? null;
  const numeroDe = (k: string): NumeroDoComercial => {
    if (previaQ.isLoading) return null;
    if (previaFalhou) return { conectado: false, rotulo: 'Indisponível', detalhe: 'não foi possível conferir agora' };
    const c = cobDe(k);
    if (!c?.numero) return { conectado: false, rotulo: 'Sem número', detalhe: c?.motivo ?? 'nenhum WhatsApp com esse comercial como dono' };
    const ok = !!c.numero.conectado;
    return { conectado: ok, rotulo: ok ? (c.numero.reserva ? 'Número reserva' : 'Conectado') : 'Desconectado', detalhe: [nomeComercial(c.numero.nome), c.numero.numero ? fmtTel(c.numero.numero) : ''].filter(Boolean).join(' · ') };
  };
  const tilesDe = (k: string) => {
    const t = (r: ReturnType<typeof resumoDia>) => ({
      valor: previaQ.isLoading ? '…' : previaFalhou ? '—' : String(r.vai),
      unidade: ligada ? (r.vai === 1 ? 'mensagem' : 'mensagens') : (r.vai === 1 ? 'sairia' : 'sairiam'),
      sub: previaFalhou ? 'prévia indisponível agora' : previaQ.isLoading ? 'calculando…' : detalheDia(r),
    });
    const c = cobDe(k);
    return {
      hoje: t(resumoDia(hoje, k)), amanha: t(resumoDia(amanha, k)),
      clientes: previaFalhou ? { valor: '—', unidade: 'em cobrança', sub: 'prévia indisponível agora' } : c
        ? { valor: String(c.clientes), unidade: 'em cobrança', sub: `${c.com_telefone} com telefone${c.numero?.conectado ? '' : ' · esperando o número'}` }
        : { valor: previaQ.isLoading ? '…' : '0', unidade: 'em cobrança', sub: previaQ.isLoading ? 'calculando…' : 'nenhum cliente com esse nome na coluna Comercial da Gestão' },
    };
  };
  /** pausar pede confirmação; retomar faz na hora */
  const pedirPausa = (chave: string, nome: string, pausar: boolean) => {
    if (pausar) { setConfirmaPausa({ chave, nome }); return; }
    pausaMut.mutate({ comercial: chave, pausar: false, nome }, {
      onSuccess: () => aoAvisar(`${chave === minhaChave && souComercial ? 'Sua régua voltou' : `A régua de ${nome} voltou`} a funcionar: as mensagens saem no próximo horário da janela. É possível voltar pelo botão Desfazer.`),
      onError: (er) => aoAvisar((er as Error).message, 'erro'),
    });
  };
  const confirmarPausa = () => {
    if (!confirmaPausa) return;
    const { chave, nome } = confirmaPausa;
    pausaMut.mutate({ comercial: chave, pausar: true, nome }, {
      onSuccess: () => { setConfirmaPausa(null); aoAvisar(`${chave === minhaChave && souComercial ? 'Sua régua foi pausada' : `A régua de ${nome} foi pausada`}: nenhuma mensagem automática sai para esses clientes até ser retomada. É possível voltar pelo botão Desfazer.`); },
      onError: (er) => aoAvisar((er as Error).message, 'erro'),
    });
  };
  const linhasCom: LinhaComercialRegua[] = opcoesDe.map((o) => {
    const c = cobDe(o.chave);
    return {
      chave: o.chave, nome: o.nome, clientes: c?.clientes ?? carteira.filter((x) => chaveComercial(x.atendente) === o.chave).length,
      comTelefone: c?.com_telefone ?? 0, numero: numeroDe(o.chave), inicio: cfg?.horario_comercial?.[o.chave] ?? null,
      pausada: pausadaDe(o.chave), proprias: o.proprias,
    };
  });
  /** a régua de um comercial (o próprio, ou o gestor olhando a dele) */
  const cabecalhoDe = (chave: string, minha: boolean) => (
    <CabecalhoReguaComercial nome={nomeDe(chave)} minha={minha} empresaLigada={ligada} inicioEmpresa={horaCfg}
      numero={numeroDe(chave)} pausada={pausadaDe(chave)} podeEditar={gestor || (souComercial && chave === minhaChave)}
      pausando={pausaMut.isPending} aoPausar={(p) => pedirPausa(chave, nomeDe(chave), p)} tiles={tilesDe(chave)}
      horario={{ inicioGeral: horaCfg, fim: fimCfg, valor: cfg?.horario_comercial?.[chave] ?? null, salvando: horarioMut.isPending, aoMudar: (h) => mudarHorario(chave, nomeDe(chave), h) }} />
  );

  const salvarEd = () => {
    if (!ed) return;
    if (ed.alvo === 'versao') {
      const com = ed.comercial, pid = ed.passoId;
      const atual = versaoDe(pid, com);
      const d = decidirVersao({ blocos: ed.msg.blocos, blocosPadrao: (rowDe(pid)?.blocos ?? []) as Bloco[], quando: ed.msg.quando, q0: ed.q0, existe: !!atual });
      if (d.erro) { aoAvisar(d.erro); return; }
      if (d.acao === 'nada') { aoAvisar('Igual à padrão (mensagem e dia): nada foi salvo.'); setEd(null); return; }
      const passoBase = padraoAtivos.find((x) => x.id === pid);
      if (passoBase && diaVaiColidir(padraoAtivos, (x) => versaoCom(x, com), passoBase, d.acao === 'apagar' ? ed.q0 : d.quando ?? ed.q0)) {
        aoAvisar('Já existe outra mensagem nessa régua nesse dia. Escolha outro dia.'); return;
      }
      if (d.acao === 'apagar' && atual) {
        excluirVersao.mutate({ ...atual, nome: nomeDe(com) }, { onSuccess: () => { aoAvisar(`Ficou igual à padrão: ${nomeDe(com)} volta a usar a padrão neste passo.`); setEd(null); }, onError: (e) => aoAvisar((e as Error).message) });
        return;
      }
      const semArq = d.blocos.filter((b) => b.tipo !== 'texto' && !b.path);
      salvarVersao.mutate({ passo_id: pid, comercial: com, blocos: d.blocos, excluida: false, quando: d.quando, nome: nomeDe(com) }, {
        onSuccess: () => {
          aoAvisar(semArq.length
            ? `Salvo na régua de ${nomeDe(com)}. Atenção: ${semArq.map((b) => ROTULO_BLOCO[b.tipo]).join(', ')} sem arquivo salvo não sai no envio.`
            : `Salvo na régua de ${nomeDe(com)}.`);
          setEd(null);
        },
        onError: (e) => aoAvisar((e as Error).message),
      });
      return;
    }
    if (!ed.msg.nome.trim()) { aoAvisar('Dê um nome à mensagem.'); return; }
    if (ed.msg.blocos.length === 0) { aoAvisar('Adicione ao menos um conteúdo (texto, foto, vídeo ou áudio).'); return; }
    if (ed.alvo === 'cliente') {
      if (!ed.cliId) { aoAvisar('Escolha o cliente.'); return; }
      if (!ed.data || ed.data < hoje) { aoAvisar('Escolha a data do envio (hoje ou depois).'); return; }
    }
    const anterior = ed.novo ? undefined : rowDe(ed.msg.id);
    const base = { id: ed.novo ? undefined : ed.msg.id, nome: ed.msg.nome, quando: ed.msg.quando, blocos: ed.msg.blocos, ativo: anterior?.ativo ?? true };
    const payload = ed.alvo === 'padrao'
      ? { ...base, alvo: 'padrao' as const }
      : ed.alvo === 'grupo'
      ? { ...base, alvo: 'grupo' as const, grupo_nome: ed.nome.trim() || 'Grupo', criterio: ed.criterio }
      : { ...base, alvo: 'cliente' as const, cli_id: ed.cliId || null, cli_nome: nomeCliMsg(ed.cliId), data_envio: ed.data || null };
    const enviavel = ed.msg.blocos.some((b) => (b.tipo === 'texto' ? !!(b.corpo ?? '').trim() : !!b.path));
    const semArquivo = ed.msg.blocos.filter((b) => b.tipo !== 'texto' && !b.path);
    salvarMsg.mutate(payload, {
      onSuccess: () => {
        aoAvisar(!enviavel
          ? 'Mensagem salva. Atenção: nenhuma parte tem texto escrito nem arquivo salvo, então ela não sai no disparo automático.'
          : semArquivo.length
          ? `Mensagem salva. Atenção: ${semArquivo.map((b) => ROTULO_BLOCO[b.tipo]).join(', ')} sem arquivo salvo; ${semArquivo.length === 1 ? 'essa parte não sai' : 'essas partes não saem'} no envio.`
          : 'Mensagem salva.');
        setEd(null);
      },
      onError: (e) => aoAvisar((e as Error).message),
    });
  };
  const cliSugestoes = useMemo(() => {
    const s = buscaCliEd.trim().toLowerCase();
    return s.length < 2 ? [] : clientesOrd.filter((c) => c.nome.toLowerCase().includes(s)).slice(0, 8);
  }, [buscaCliEd, clientesOrd]);
  const [comoAberto, setComoAberto] = useState(false);
  const h2 = (n: number) => String(n).padStart(2, '0');
  const diasTxt = cfg?.dias_envio === 'uteis' ? 'só em dias úteis (vencimento em fim de semana ou feriado passa para o próximo dia útil, como no Calendário)' : cfg?.dias_envio === 'uteis_sabado' ? 'em dias úteis e sábados' : 'todos os dias, na data exata do ciclo (ou na data marcada à mão no Calendário)';

  const comoBloco = (
    <div className="rg-como">
      <div><b>Quem recebe</b><p>Cada cliente <b>em cobrança</b> recebe cada passo {diasTxt}, pelo número do comercial dele{cfg?.canal_reserva_id ? ' (ou pelo número reserva)' : ''}.</p></div>
      <div><b>Quem não recebe</b><p>Quem já pagou o mês, mandou comprovante (aguardando o financeiro), foi marcado “fora” na Gestão ou pediu para sair{cfg?.pausar_se_respondeu !== false ? '; e quem respondeu uma mensagem da régua no mês (vira atendimento humano)' : ''}.</p></div>
      <div><b>Limites</b><p>Cada passo sai no máximo 1 vez por mês por cliente, só dentro do horário de envio. O que não sair no dia não sai atrasado no dia seguinte.</p></div>
    </div>
  );

  return (
    <>
      {souComercial ? cabecalhoDe(minhaChave, true) : gestor && (
      <CardVidro spot sobe className="rg-auto">
        <div className="rg-auto-cab">
          <span className={`ev-st-ic ${ligada ? 'ok' : 'neutro'}`}><IcT d={IC_PATH.relogio} s={16} mr={0} /></span>
          <div className="rg-auto-tt">
            <div className="rg-auto-nm"><b>Régua automática</b></div>
            <span className="ev-sub">{ligada
              ? `Envia todo dia entre ${h2(horaCfg)}:00 e ${h2(fimCfg)}:00, cada passo pelo número do comercial do cliente.`
              : 'Nada sai sozinho enquanto estiver desligada. Revise a configuração e o alcance abaixo e ligue quando tudo estiver pronto.'}</span>
          </div>
          <div className="rg-acoes">
            <BotaoSec mini onClick={() => navigate('/cobrancas/envios?aba=proximos')}>Ver quem recebe</BotaoSec>
            {/* ligar/desligar = interruptor com confirmação nos dois sentidos (desligar não é mais um botão igual aos outros) */}
            {gestor && (
              <span className={ligada ? 'rg-liga on' : 'rg-liga'}
                title={cfgQ.isError ? 'Não foi possível ler a configuração. Atualize a página.' : !ligada && previaQ.isError ? 'A prévia falhou. Confira antes de ligar.' : undefined}>
                <span aria-hidden>{cfgQ.isLoading ? '…' : ligada ? 'Ligada' : 'Desligada'}</span>
                <Toggle ligado={ligada} rotulo={ligada ? 'Régua automática ligada (clique para desligar)' : 'Régua automática desligada (clique para ligar)'}
                  disabled={salvarCfg.isPending || cfgQ.isLoading || cfgQ.isError || (!ligada && (previaQ.isLoading || previaQ.isError))}
                  aoMudar={(x) => (x ? setConfirmaLigar(true) : setConfirmaDesligar(true))} />
              </span>
            )}
          </div>
        </div>

        <div className="rg-tiles">
          {([['Hoje', rH], ['Amanhã', rA]] as [string, typeof rH][]).map(([t, r]) => (
            <div className="rg-tile" key={t}>
              <span className="ev-rot">{t}</span>
              <div className="rg-tile-v"><b className="num">{previaQ.isLoading ? '…' : previaFalhou ? '—' : r.vai}</b><span>{ligada ? (r.vai === 1 ? 'mensagem no dia' : 'mensagens no dia') : (r.vai === 1 ? 'sairia' : 'sairiam')}</span></div>
              <span className="ev-sub">{previaFalhou ? 'prévia indisponível agora' : previaQ.isLoading ? 'calculando…' : detalheDia(r)}</span>
            </div>
          ))}
          <div className="rg-tile">
            <span className="ev-rot">Alcance</span>
            <div className="rg-tile-v"><b className="num">{previaQ.isLoading ? '…' : previaFalhou ? '—' : tot.cob}</b><span>{previaFalhou ? 'não foi possível calcular' : `de ${tot.cli} em cobrança`}</span></div>
            <span className="ev-sub">com telefone e número do comercial conectado</span>
          </div>
        </div>

        <button type="button" className="rg-como-btn" onClick={() => setComoAberto((v) => !v)} aria-expanded={comoAberto}>
          <span>Como a régua decide quem recebe</span>
          <span className={comoAberto ? 'ev-chev on' : 'ev-chev'}><IcT d="m6 9 6 6 6-6" s={14} mr={0} /></span>
        </button>
        {comoAberto && comoBloco}

      </CardVidro>
      )}

      {confirmaLigar && (
        <ModalV2 aberto aoFechar={() => setConfirmaLigar(false)} largura={500}
          titulo={<div>Ligar a régua automática?<div className="mod-sub">As mensagens começam a sair de verdade, pelos números conectados</div></div>}
          rodape={<><BotaoSec onClick={() => setConfirmaLigar(false)}>Agora não</BotaoSec>
            <BotaoPrimario onClick={() => salvarCfg.mutate({ ativa: true }, {
              onSuccess: () => { setConfirmaLigar(false); aoAvisar(`Régua automática ligada: a fila de cada dia é montada a partir das ${String(horaCfg).padStart(2, '0')}:00. Acompanhe em Envios.`); },
              onError: (er) => aoAvisar((er as Error).message),
            })} disabled={salvarCfg.isPending}>{salvarCfg.isPending ? 'Ligando…' : 'Ligar agora'}</BotaoPrimario></>}>
          <div className="rg-ligar">
            <div><span className="ev-rot">Hoje</span><b className="num">{rH.vai}</b><span className="ev-sub">mensagens saem{horaBrasilia() >= fimCfg ? ` (depois das ${fimCfg}h: nada sai hoje)` : ''}</span></div>
            <div><span className="ev-rot">Amanhã</span><b className="num">{rA.vai}</b><span className="ev-sub">mensagens previstas</span></div>
            <div><span className="ev-rot">Aguardando número</span><b className="num">{rH.numero + rA.numero}</b><span className="ev-sub">comercial sem número conectado (ou sem dono)</span></div>
          </div>
          <p style={{ margin: '12px 0 8px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--txt-2)' }}>
            Passos ativos: {[...padrao].sort((a, b) => a.quando - b.quando).map((m) => `${m.nome} (${quandoCurto(m.quando)})`).join(', ') || 'nenhum'}. Sai só entre {h2(horaCfg)}:00 e {h2(fimCfg)}:00. Cada cliente recebe pelo número do comercial dele{cfg?.canal_reserva_id ? ' (ou pelo número reserva)' : ''}, com intervalo de {cfg?.delay_min ?? 20}–{cfg?.delay_max ?? 45}s entre clientes{cfg?.pausa_cada ? `, pausa de ${cfg.pausa_min} min a cada ${cfg.pausa_cada} mensagens` : ''}{cfg?.teto_diario ? ` e no máximo ${cfg.teto_diario} por número por dia` : ''}.
          </p>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--txt-2)' }}>
            Antes de cada envio o sistema confere de novo se o cliente pagou, mandou comprovante ou pediu para sair, e valida se o número tem WhatsApp. Tudo aparece em <b>Envios</b> (número usado, horário, texto, entrega, leitura e resposta) e na conversa do cliente. É possível desligar aqui a qualquer momento.
          </p>
          {(rH.falta + rA.falta) > 0 && <p className="cm-hint" style={{ margin: '8px 0 0', color: 'var(--cor-alerta-txt, var(--ambar))' }}>{rH.falta + rA.falta === 1 ? '1 cliente está' : `${rH.falta + rA.falta} clientes estão`} sem algum dado usado na mensagem (valor, vencimento…). Esses aguardam até a Gestão ser completada; nunca sai mensagem quebrada.</p>}
        </ModalV2>
      )}

      {confirmaDesligar && (
        <ModalV2 aberto aoFechar={() => { if (!salvarCfg.isPending) setConfirmaDesligar(false); }} largura={460}
          titulo={<div>Desligar a régua automática?<div className="mod-sub">Nada mais entra na fila sozinho</div></div>}
          rodape={<><BotaoSec onClick={() => setConfirmaDesligar(false)} disabled={salvarCfg.isPending}>Cancelar</BotaoSec>
            <button type="button" className="p-btn btn-perigo" disabled={salvarCfg.isPending}
              onClick={() => salvarCfg.mutate({ ativa: false }, {
                onSuccess: () => { setConfirmaDesligar(false); aoAvisar('Régua automática desligada: nada mais entra na fila sozinho (o que já estava na fila de hoje também para).'); },
                onError: (er) => aoAvisar((er as Error).message, 'erro'),
              })}>{salvarCfg.isPending ? 'Desligando…' : 'Desligar a régua'}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>Vale para todos os comerciais. O que ainda estava na fila de hoje também deixa de sair. As mensagens, os dias e a configuração ficam guardados, e é possível ligar de novo a qualquer momento.</p>
        </ModalV2>
      )}

      {papelCarregando ? (
        <div className="cm-exc-vazio">Carregando a régua…</div>
      ) : !gestor && !souComercial ? (
        <div className="rt-vazio">Não foi possível identificar o seu perfil agora. Atualize a página; se continuar, fale com o administrador.</div>
      ) : souComercial ? (
        <>
          <div className="rt-sec-tit"><h3>Minhas mensagens</h3></div>
          {data && carteira.filter((c) => chaveComercial(c.atendente) === minhaChave).length === 0 && (
            <div className="ev-aviso" style={{ margin: '0 0 10px' }}><span className="ev-aviso-t">Nenhum cliente em cobrança está com o comercial <b>{nomeComercial(sessao?.nome ?? '')}</b> na Gestão. A sua régua só vale para os clientes com o seu nome na coluna Comercial.</span></div>
          )}
        </>
      ) : (
      <>
      <AbasRegua aba={abaRg} aoMudar={setAbaRg} nComerciais={linhasCom.length} />
      {abaRg === 'mensagens' && (
      <div className="rg-controles">
        <div className="cm-seg rg-seg" role="tablist" aria-label="Tipo de mensagem">
          <button type="button" role="tab" aria-selected={subaba === 'padrao'} className={subaba === 'padrao' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('padrao')}>Sequência padrão</button>
          <button type="button" role="tab" aria-selected={subaba === 'grupos'} className={subaba === 'grupos' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('grupos')}>Grupos</button>
          <button type="button" role="tab" aria-selected={subaba === 'cliente'} className={subaba === 'cliente' ? 'cm-seg-btn on' : 'cm-seg-btn'} onClick={() => setSubaba('cliente')}>Cliente específico</button>
        </div>
        {subaba === 'padrao' && (
          <label className="rg-de-sel">
            <span>Régua de</span>
            <select className="inp" value={reguaDe} onChange={(e) => setReguaDe(e.target.value)} aria-label="De quem é a régua">
              <option value="">Padrão (todos)</option>
              {opcoesDe.map((o) => <option key={o.chave} value={o.chave}>{o.nome}{o.proprias > 0 ? ` · ${o.proprias} ${o.proprias > 1 ? 'alterações' : 'alteração'}` : ''}</option>)}
            </select>
          </label>
        )}
        <span className="rg-controles-esp" />
        {(() => {
          // a ação principal da aba fica à vista (antes: botão fantasma no fim da lista, fora da dobra);
          // dourado só com a régua ligada — desligada, o destaque é o interruptor do cabeçalho
          const Botao = ligada ? BotaoPrimario : BotaoSec;
          if (subaba === 'padrao' && !reguaDe) return <Botao onClick={() => setEd({ alvo: 'padrao', novo: true, msg: { id: rid('p'), nome: '', quando: -3, blocos: [{ tipo: 'texto', corpo: '' }] } })}>＋ Nova mensagem</Botao>;
          if (subaba === 'grupos') return <Botao onClick={() => setEd({ alvo: 'grupo', novo: true, nome: '', criterio: 'todos', msg: { id: rid('g'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] } })}>＋ Novo grupo</Botao>;
          if (subaba === 'cliente') return <Botao onClick={() => { setBuscaCliEd(''); setEd({ alvo: 'cliente', novo: true, cliId: '', data: hoje, msg: { id: rid('c'), nome: '', quando: 0, blocos: [{ tipo: 'texto', corpo: '' }] } }); }}>＋ Mensagem para um cliente</Botao>;
          return null;
        })()}
      </div>
      )}
      </>
      )}

      {!papelCarregando && (souComercial || (gestor && abaRg === 'mensagens' && subaba === 'padrao')) && (() => {
        const passos = [...padrao].sort((a, b) => a.quando - b.quando);
        return (
        <>
          {gestor && reguaAberta && cabecalhoDe(reguaAberta, false)}
          {/* a faixa "3d → Dia D → +3d" repetia os cartões: saiu — os cartões viram uma linha do tempo (CSS) */}
          {reguaAberta ? (
            <CartoesReguaComercial passos={passos} nome={nomeDe(reguaAberta)} podeEditar={gestor || souComercial} minha={souComercial}
              carregando={q.isLoading || versoesQ.isLoading}
              erro={q.isError && !q.data ? (q.error as Error).message : versoesQ.isError && !versoesQ.data ? (versoesQ.error as Error).message : null}
              versaoDe={(pid) => versaoCom(pid, reguaAberta)}
              grupoNoDia={(m) => gruposNoDia(grupos, m, reguaAberta)}
              aoEditar={(m, blocos, novo, q) => setEd({ alvo: 'versao', novo, comercial: reguaAberta, passoId: m.id, q0: m.quando, msg: { id: m.id, nome: m.nome, quando: q, blocos } })}
              aoUsarPadrao={(m) => { const v = versaoDe(m.id, reguaAberta); if (v) setUsarPadrao(v); }}
              aoExcluir={(m) => setExcluirDoCom({ passo: m, com: reguaAberta })}
              aoVoltar={(m) => { if (!salvarVersao.isPending && !excluirVersao.isPending) marcarExcluida(m, reguaAberta, false); }} />
          ) : (<>
          <div className="rg-cards">
            {passos.map((m) => (
              <div className="rg-card" key={m.id}>
                <div className="rg-quando"><b className="num">{quandoCurto(m.quando)}</b><i>{quandoSub(m.quando)}</i></div>
                <div className="rg-corpo">
                  <div className="rg-topo"><span className="rg-nm">{m.nome}</span><span className="rg-pub">Clientes em cobrança</span></div>
                  {gestor && propriasDoPasso(m.id).length > 0 && <div className="rg-donos">Personalizada na régua de: {propriasDoPasso(m.id).join(', ')}</div>}
                  {gestor && excluidasDoPasso(m.id).length > 0 && <div className="rg-donos">Excluída na régua de: {excluidasDoPasso(m.id).join(', ')}</div>}
                  <div className="rg-tipos">{tiposUnicos(m.blocos).map((t) => <span className="rg-tipo" key={t}><IconeBloco tipo={t} /> {ROTULO_BLOCO[t]}</span>)}</div>
                  <div className="rg-prev"><TextoComVariaveis texto={previewMsg(m)} /></div>
                </div>
                {gestor && (
                  <div className="rg-acoes">
                    <BotaoSec mini onClick={() => setEd({ alvo: 'padrao', novo: false, msg: JSON.parse(JSON.stringify(m)) })}>Editar</BotaoSec>
                    <MenuMais rotulo={`Mais ações para ${m.nome}`} itens={[
                      { rotulo: 'Pausar', dica: 'Para de sair até ser reativada', onClick: () => { const r = rowDe(m.id); if (r) alternar(r); } },
                      'sep',
                      { rotulo: 'Excluir', perigo: true, dica: 'Pede confirmação', onClick: () => { const r = rowDe(m.id); if (r) setExcluir(r); } },
                    ]} />
                  </div>
                )}
              </div>
            ))}
            {passos.length === 0 && !q.isLoading && <div className="cm-exc-vazio">Nenhuma mensagem ativa na sequência.</div>}
          </div>
          </>)}
        </>
        );
      })()}

      {souComercial && (
        <div className="rt-como">
          <button type="button" className="rg-como-btn" onClick={() => setComoAberto((v) => !v)} aria-expanded={comoAberto}>
            <span>Como a régua decide quem recebe</span>
            <span className={comoAberto ? 'ev-chev on' : 'ev-chev'}><IcT d="m6 9 6 6 6-6" s={14} mr={0} /></span>
          </button>
          {comoAberto && comoBloco}
        </div>
      )}

      {!papelCarregando && gestor && abaRg === 'mensagens' && subaba === 'grupos' && (
        <>
          <p className="cm-hint" style={{ margin: '0 0 10px' }}>Para quem está no grupo, a mensagem do grupo <b>substitui</b> a da sequência padrão do mesmo dia (ex.: inadimplentes recebem um texto mais firme no Dia D).</p>
          <div className="cm-msg-lista">
            {grupos.map((g) => { const n = contaMembros(g.criterio); return (
              <div className="cm-msg-lin" key={g.id}>
                <div className="cm-msg-info">
                  <div className="cm-msg-nm">{g.nome} <span className="cm-cli-badge">{n.total} em cobrança · {n.zap} com WhatsApp</span></div>
                  <div className="cm-msg-meta num">{rotuloCriterio(g.criterio)} · {quandoCurto(g.msg.quando)} {quandoSub(g.msg.quando)} · {resumoBlocos(g.msg.blocos)}</div>
                </div>
                {gestor && <div className="rg-acoes">
                  <BotaoSec mini onClick={() => setEd({ alvo: 'grupo', novo: false, nome: g.nome, criterio: g.criterio, msg: JSON.parse(JSON.stringify(g.msg)) })}>Editar</BotaoSec>
                  <MenuMais rotulo={`Mais ações para ${g.nome}`} itens={[
                    { rotulo: 'Pausar', dica: 'Para de sair até ser reativada', onClick: () => { const r = rowDe(g.id); if (r) alternar(r); } },
                    'sep',
                    { rotulo: 'Excluir', perigo: true, dica: 'Pede confirmação', onClick: () => { const r = rowDe(g.id); if (r) setExcluir(r); } },
                  ]} />
                </div>}
              </div>
            ); })}
            {grupos.length === 0 && <div className="cm-exc-vazio">Nenhum grupo ainda.</div>}
          </div>
        </>
      )}

      {!papelCarregando && gestor && abaRg === 'mensagens' && subaba === 'cliente' && (
        <>
          <p className="cm-hint" style={{ margin: '0 0 10px' }}>Uma mensagem para um cliente em um dia marcado (ex.: acordo, aviso pontual). Sai uma vez, a partir do horário da régua, pelo número do comercial do cliente.</p>
          <div className="cm-msg-lista">
            {porCli.map((c) => (
              <div className="cm-msg-lin" key={c.id}>
                <div className="cm-msg-info">
                  <div className="cm-msg-nm">{c.cliNome}</div>
                  <div className="cm-msg-meta num">{c.data ? `envia ${c.data.split('-').reverse().join('/')}${c.data < hoje ? ' (já passou)' : ''}` : 'sem data'} · {resumoBlocos(c.msg.blocos)}</div>
                </div>
                {gestor && <div className="rg-acoes">
                  <BotaoSec mini onClick={() => { setBuscaCliEd(''); setEd({ alvo: 'cliente', novo: false, cliId: c.cliId, data: c.data, msg: JSON.parse(JSON.stringify(c.msg)) }); }}>Editar</BotaoSec>
                  <MenuMais rotulo={`Mais ações para ${c.cliNome}`} itens={[{ rotulo: 'Excluir', perigo: true, dica: 'Pede confirmação', onClick: () => { const r = rowDe(c.id); if (r) setExcluir(r); } }]} />
                </div>}
              </div>
            ))}
            {porCli.length === 0 && <div className="cm-exc-vazio">Nenhuma mensagem por cliente ainda.</div>}
          </div>
        </>
      )}

      {!papelCarregando && gestor && abaRg === 'mensagens' && pausadas.length > 0 && (
        <div className="rg-pausadas">
          <span className="ev-rot">Pausadas (não saem)</span>
          {pausadas.map((r) => (
            <div className="cm-msg-lin" key={r.id}>
              <div className="cm-msg-info">
                <div className="cm-msg-nm">{r.alvo === 'grupo' ? r.grupo_nome ?? r.nome : r.nome}</div>
                <div className="cm-msg-meta num">{r.alvo === 'padrao' ? 'Sequência padrão' : r.alvo === 'grupo' ? 'Grupo' : 'Cliente específico'} · {r.alvo === 'cliente' ? (r.cli_nome ?? '') : `${quandoCurto(r.quando)} ${quandoSub(r.quando)}`}</div>
              </div>
              {gestor && <div className="rg-acoes">
                <BotaoSec mini onClick={() => alternar(r)}>Reativar</BotaoSec>
                <MenuMais rotulo={`Mais ações para ${r.alvo === 'grupo' ? r.grupo_nome ?? r.nome : r.nome}`} itens={[{ rotulo: 'Excluir', perigo: true, dica: 'Pede confirmação', onClick: () => setExcluir(r) }]} />
              </div>}
            </div>
          ))}
        </div>
      )}

      {!papelCarregando && gestor && abaRg === 'comerciais' && (
        <>
          <div className="rt-sec-tit"><h3>Régua de cada comercial</h3><span>{tot.cli} em cobrança · {tot.cob} alcançáveis hoje</span></div>
          <TabelaComerciaisRegua linhas={linhasCom} inicioGeral={horaCfg} fim={fimCfg} salvandoHorario={horarioMut.isPending} pausando={pausaMut.isPending}
            carregando={previaQ.isLoading} erro={previaFalhou ? (previaQ.error?.message ?? 'falhou') : null}
            aoHorario={(l, h) => mudarHorario(l.chave, l.nome, h)} aoPausar={(l, p) => pedirPausa(l.chave, l.nome, p)}
            aoAbrir={(l) => { setReguaDe(l.chave); setSubaba('padrao'); setAbaRg('mensagens'); }} />
          {(() => {
            // linhas do alcance que não são de um comercial da lista (ex.: cliente com a coluna Comercial vazia)
            const fora = cobertura.filter((c) => !linhasCom.some((l) => l.chave === chaveComercial(c.comercial)));
            return fora.length > 0 && (
              <div className="rt-fora">
                {fora.map((c) => (
                  <div key={c.comercial}><b>{c.comercial}</b> · <span className="num">{c.clientes}</span> em cobrança — {c.numero?.conectado ? `sai pelo ${c.numero.reserva ? 'número reserva' : 'número'} ${nomeComercial(c.numero.nome)}` : (c.motivo ?? 'não recebem a régua (sem número)')}</div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {!papelCarregando && gestor && abaRg === 'configuracao' && !cfg && (
        <div className="rt-vazio">{cfgQ.isError ? `Não foi possível ler a configuração agora: ${(cfgQ.error as Error)?.message ?? ''}. Atualize a página.` : 'Carregando a configuração…'}</div>
      )}

      {!papelCarregando && gestor && abaRg === 'configuracao' && cfg && (
        <ConfigReguaLista salvando={salvarCfg.isPending}
          v={{ hora_envio: horaCfg, hora_fim: fimCfg, dias_envio: cfg.dias_envio, teto_diario: cfg.teto_diario, delay_min: cfg.delay_min, delay_max: cfg.delay_max,
            pausa_cada: cfg.pausa_cada ?? 0, pausa_min: cfg.pausa_min ?? 0, canal_reserva_id: cfg.canal_reserva_id, pausar_se_respondeu: cfg.pausar_se_respondeu }}
          numeros={conectados.map((c) => ({ id: c.id, rotulo: `${nomeComercial(c.nome)}${c.numero ? ` · ${fmtTel(c.numero)}` : ''}` }))}
          aoSalvar={(patch, ok) => salvar(patch, ok)} />
      )}

      {confirmaPausa && (
        <ConfirmarPausaRegua nome={confirmaPausa.nome} minha={souComercial && confirmaPausa.chave === minhaChave} pausando={pausaMut.isPending}
          aoConfirmar={confirmarPausa} aoFechar={() => setConfirmaPausa(null)} />
      )}

      {excluir && (
        <ModalV2 aberto aoFechar={() => setExcluir(null)} largura={420}
          titulo={<div>Excluir “{excluir.alvo === 'grupo' ? excluir.grupo_nome ?? excluir.nome : excluir.alvo === 'cliente' ? `${excluir.cli_nome ?? 'Cliente'} · ${excluir.nome}` : excluir.nome}”?<div className="mod-sub">A mensagem sai da régua de vez</div></div>}
          rodape={<><BotaoSec onClick={() => setExcluir(null)}>Cancelar</BotaoSec>
            <button type="button" className="p-btn btn-perigo" disabled={excluirMsg.isPending} onClick={() => excluirMsg.mutate(excluir.id, { onSuccess: (r) => { setExcluir(null); aoAvisar(r.cancelados > 0 ? `Mensagem excluída da régua. ${r.cancelados === 1 ? '1 envio dela que ainda esperava na fila de hoje foi cancelado' : `${r.cancelados} envios dela que ainda esperavam na fila de hoje foram cancelados`}.` : 'Mensagem excluída da régua.'); }, onError: (e) => aoAvisar((e as Error).message) })}>{excluirMsg.isPending ? 'Excluindo…' : 'Excluir'}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>O que ela ainda tiver na fila de hoje é cancelado junto. O histórico do que já foi enviado continua em Envios. Para parar só por um tempo, use <b>Pausar</b>.
            {excluir.alvo === 'padrao' && propriasDoPasso(excluir.id).length + excluidasDoPasso(excluir.id).length > 0 && <> <b>O que {[...propriasDoPasso(excluir.id), ...excluidasDoPasso(excluir.id)].join(', ')} {propriasDoPasso(excluir.id).length + excluidasDoPasso(excluir.id).length > 1 ? 'fizeram' : 'fez'} neste passo na régua própria também é apagado.</b></>}</p>
        </ModalV2>
      )}

      {excluirDoCom && (
        <ModalV2 aberto aoFechar={() => setExcluirDoCom(null)} largura={440}
          titulo={<div>Excluir “{excluirDoCom.passo.nome}”?<div className="mod-sub">Só da régua de {nomeDe(excluirDoCom.com)}</div></div>}
          rodape={<><BotaoSec onClick={() => setExcluirDoCom(null)}>Cancelar</BotaoSec>
            <button type="button" className="p-btn btn-perigo" disabled={salvarVersao.isPending} onClick={() => marcarExcluida(excluirDoCom.passo, excluirDoCom.com, true)}>{salvarVersao.isPending ? 'Excluindo…' : 'Excluir'}</button></>}>
          <p className="cm-hint" style={{ margin: 0 }}>{souComercial ? 'Seus clientes' : `Os clientes de ${nomeDe(excluirDoCom.com)}`} deixam de receber esta mensagem. A sequência padrão e a régua dos outros comerciais não mudam. É possível voltar a usar quando quiser (e pelo botão Desfazer).</p>
        </ModalV2>
      )}

      {usarPadrao && (
        <ModalV2 aberto aoFechar={() => setUsarPadrao(null)} largura={440}
          titulo={<div>Usar a mensagem padrão?<div className="mod-sub">{nomeDe(usarPadrao.comercial)} · {rowDe(usarPadrao.passo_id)?.nome ?? 'mensagem'}</div></div>}
          rodape={<><BotaoSec onClick={() => setUsarPadrao(null)}>Cancelar</BotaoSec>
            <BotaoPrimario disabled={excluirVersao.isPending} onClick={() => { const v = usarPadrao;
              const passo = padraoAtivos.find((x) => x.id === v.passo_id);
              if (passo && diaVaiColidir(padraoAtivos, (x) => versaoCom(x, v.comercial), passo, passo.quando)) {
                aoAvisar(`No dia da padrão (${quandoExtenso(passo.quando)}) já sai outra mensagem dessa régua — mude o dia dela antes.`); setUsarPadrao(null); return;
              }
              excluirVersao.mutate({ ...v, nome: nomeDe(v.comercial) }, { onSuccess: () => { setUsarPadrao(null); aoAvisar(`${nomeDe(v.comercial)} volta a usar a mensagem padrão em “${rowDe(v.passo_id)?.nome ?? 'mensagem'}”.`); }, onError: (e) => aoAvisar((e as Error).message) }); }}>
              {excluirVersao.isPending ? 'Voltando…' : 'Usar a padrão'}</BotaoPrimario></>}>
          <p className="cm-hint" style={{ margin: 0 }}>A mensagem própria de {nomeDe(usarPadrao.comercial)} neste passo é apagada e os clientes dele voltam a receber a mensagem padrão. É possível desfazer pelo botão Desfazer.</p>
        </ModalV2>
      )}

      {ed && (
        <ModalV2 aberto aoFechar={() => setEd(null)} largura={620}
          titulo={ed.alvo === 'versao'
            ? <div>{nomeDe(ed.comercial)} · {ed.msg.nome}<div className="mod-sub">Régua de {nomeDe(ed.comercial)}: mensagem e dia só para os clientes dele (na padrão sai {quandoExtenso(ed.q0)})</div></div>
            : <div>{ed.novo ? 'Nova mensagem' : 'Editar mensagem'}<div className="mod-sub">{ed.alvo === 'padrao' ? 'Sequência padrão' : ed.alvo === 'grupo' ? 'Mensagem de grupo (substitui a padrão do mesmo dia)' : 'Mensagem por cliente'}</div></div>}
          rodape={<><BotaoSec onClick={() => setEd(null)}>Cancelar</BotaoSec><BotaoPrimario onClick={salvarEd} disabled={salvarMsg.isPending || salvarVersao.isPending || excluirVersao.isPending}>{salvarMsg.isPending || salvarVersao.isPending || excluirVersao.isPending ? 'Salvando…' : 'Salvar mensagem'}</BotaoPrimario></>}>
          {ed.alvo === 'grupo' && (
            <div className="form-2col" style={{ marginBottom: 4 }}>
              <div className="campo"><label>Nome do grupo</label><Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ex.: Inadimplentes" /></div>
              <div className="campo"><label>Quem entra ({contaMembros(ed.criterio).total} em cobrança · {contaMembros(ed.criterio).zap} com WhatsApp)</label>
                <select className="inp" value={ed.criterio} onChange={(e) => setEd({ ...ed, criterio: e.target.value })}>
                  <option value="todos">Todos os clientes em cobrança</option>
                  {(['inadimplente', 'faltou', 'voltou', 'em_dia'] as Comportamento[]).map((c) => <option key={c} value={`comp:${c}`}>{ROTULO_COMP[c]}</option>)}
                  {atendentes.map((a) => <option key={a} value={`atend:${a}`}>Comercial {a}</option>)}
                </select>
              </div>
            </div>
          )}
          {ed.alvo === 'cliente' && (
            <div className="form-2col" style={{ marginBottom: 4 }}>
              <div className="campo"><label>Cliente</label>
                {ed.cliId
                  ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 13 }}>{nomeCliMsg(ed.cliId)}</b><BotaoSec mini onClick={() => setEd({ ...ed, cliId: '' })}>Trocar</BotaoSec></div>
                  : <>
                      <Input value={buscaCliEd} placeholder="Digite o nome do cliente…" autoFocus onChange={(e) => setBuscaCliEd(e.target.value)} />
                      {cliSugestoes.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                        {cliSugestoes.map((c) => <button type="button" key={c.id} className="cm-cli-filtro-btn" style={{ justifyContent: 'space-between' }} onClick={() => { setEd({ ...ed, cliId: c.id }); setBuscaCliEd(''); }}>{c.nome}<span className="num" style={{ color: c.whatsapp ? 'var(--txt-3)' : 'var(--ambar)' }}>{c.whatsapp ?? 'sem telefone'}</span></button>)}
                      </div>}
                    </>}
              </div>
              <div className="campo"><label>Data do envio</label><Input type="date" min={hoje} value={ed.data} onChange={(e) => setEd({ ...ed, data: e.target.value })} /></div>
            </div>
          )}
          <p className="cm-hint rg-vars-dica" style={{ margin: '0 0 8px' }}>As variáveis usam os dados da Gestão: <span className="cc-var">meia parcela</span> é o valor que o cliente paga (o único que se cobra) · <span className="cc-var">vencimento</span> é o dia do vencimento · <span className="cc-var">nome do atendente</span> é o comercial dono do número que envia.</p>
          {ed.alvo === 'versao' && <div className="form-grid" style={{ marginBottom: 6 }}><DiaDaVersao q0={ed.q0} valor={ed.msg.quando} aoMudar={(q) => setEd((prev) => (prev && prev.alvo === 'versao' ? { ...prev, msg: { ...prev.msg, quando: q } } : prev))} /></div>}
          <EditorMsg msg={ed.msg} setMsg={(m) => setEd((prev) => (prev ? { ...prev, msg: m } : prev))} comQuando={ed.alvo !== 'cliente' && ed.alvo !== 'versao'} semNome={ed.alvo === 'versao'} setAviso={aoAvisar} aoSubirMidia={subirMidiaWA} />
        </ModalV2>
      )}
    </>
  );
}
