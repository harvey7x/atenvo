/* =====================================================================
   RÉGUA DE MENSAGENS — peças da tela (dono 29/10: "essa tela tá muito bagunçada… deixe mais profissional,
   ainda mais pro comercial. Cada atendente tem que ter controle da sua própria régua").
   Só apresentação: a régua real (RevizaWhatsApp → ReguaReviza) e a demo (cobrancaMotor → AbaReguaDemo)
   montam a MESMA tela com estas peças — o comercial vê "Minha régua"; o gestor vê abas
   Mensagens · Comerciais · Configuração.
   ===================================================================== */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, Input, LinhaToggle, ModalV2 } from '../../components';
import './regua-tela.css';

const h2 = (n: number) => String(n).padStart(2, '0');
const iniciais = (n: string) => (n.trim().split(/\s+/).slice(0, 2).map((x) => x[0] ?? '').join('') || '·').toUpperCase();
type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';

/** abas do gestor (o comercial não vê abas: só a régua dele) */
export type AbaRegua = 'mensagens' | 'comerciais' | 'configuracao';
export function AbasRegua({ aba, aoMudar, nComerciais }: { aba: AbaRegua; aoMudar: (a: AbaRegua) => void; nComerciais?: number }) {
  const abas: { id: AbaRegua; rot: string; n?: number }[] = [
    { id: 'mensagens', rot: 'Mensagens' },
    { id: 'comerciais', rot: 'Comerciais', n: nComerciais },
    { id: 'configuracao', rot: 'Configuração' },
  ];
  return (
    <div className="rt-abas" role="tablist" aria-label="Régua de mensagens">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'on' : ''} onClick={() => aoMudar(a.id)}>
          {a.rot}{a.n != null && a.n > 0 && <span className="rt-abas-n num">{a.n}</span>}
        </button>
      ))}
    </div>
  );
}

/** um "estado" com rótulo pequeno em cima e o valor embaixo, com o ponto da cor do estado */
function Estado({ rot, valor, tom, detalhe }: { rot: string; valor: string; tom: Tom; detalhe?: string | null }) {
  return (
    <div className={`rt-estado ${tom}`}>
      <span className="rt-estado-rot">{rot}</span>
      <span className="rt-estado-v"><i aria-hidden /><span>{valor}</span></span>
      {detalhe && <span className="rt-estado-d num">{detalhe}</span>}
    </div>
  );
}

/** seletor do horário de início (entre o início geral e antes do fim da janela) */
export function SeletorInicio({ id, inicioGeral, fim, valor, disabled, rotulo, aoMudar }: {
  id?: string; inicioGeral: number; fim: number; valor: number | null; disabled?: boolean; rotulo: string; aoMudar: (h: number | null) => void;
}) {
  const atual = valor != null && valor > inicioGeral && valor < fim ? valor : null;
  return (
    <select id={id} className="inp rt-sel-hora" aria-label={rotulo} value={atual ?? ''} disabled={disabled}
      onChange={(e) => aoMudar(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{h2(inicioGeral)}:00 · início geral</option>
      {Array.from({ length: Math.max(0, fim - inicioGeral - 1) }, (_, i) => inicioGeral + 1 + i).map((h) => <option key={h} value={h}>{h2(h)}:00</option>)}
    </select>
  );
}

/** null = ainda verificando (a prévia não chegou) */
export type NumeroDoComercial = { conectado: boolean; rotulo: string; detalhe?: string | null } | null;
export type TileRegua = { valor: string; unidade: string; sub: string };

/** cabeçalho da régua de UM comercial: o que ele controla (pausar/retomar e horário) e o que vai sair.
    `minha` = o próprio comercial olhando ("Minha régua"); senão o gestor olhando a régua dele */
export function CabecalhoReguaComercial({ nome, minha, empresaLigada, inicioEmpresa, numero, pausada, podeEditar, pausando, aoPausar, tiles, horario }: {
  nome: string; minha: boolean; empresaLigada: boolean; inicioEmpresa: number;
  numero: NumeroDoComercial; pausada: boolean; podeEditar: boolean; pausando?: boolean;
  aoPausar: (pausar: boolean) => void;
  tiles: { hoje: TileRegua; amanha: TileRegua; clientes: TileRegua };
  horario: { inicioGeral: number; fim: number; valor: number | null; salvando?: boolean; aoMudar: (h: number | null) => void };
}) {
  // as três formas da frase (sem "de os", "pra os")
  const sujeito = minha ? 'os seus clientes' : `os clientes de ${nome}`;
  const dos = minha ? 'dos seus clientes' : `dos clientes de ${nome}`;
  const pros = minha ? 'pros seus clientes' : `pros clientes de ${nome}`;
  const inicio = horario.valor != null && horario.valor > horario.inicioGeral && horario.valor < horario.fim ? horario.valor : horario.inicioGeral;
  return (
    <section className={`rt-com${pausada ? ' pausada' : ''}`} aria-label={minha ? 'Minha régua' : `Régua de ${nome}`}>
      <header className="rt-com-cab">
        <span className="rt-av" aria-hidden>{iniciais(nome)}</span>
        <div className="rt-com-tt">
          <span className="rt-eyebrow">{minha ? 'Minha régua' : 'Régua do comercial'}</span>
          <h2>{nome}</h2>
        </div>
        {podeEditar && (
          <div className="rt-com-acao">
            {pausada
              ? <BotaoPrimario onClick={() => aoPausar(false)} disabled={pausando}>{pausando ? 'Retomando…' : minha ? 'Retomar minha régua' : 'Retomar régua'}</BotaoPrimario>
              : <BotaoSec mini onClick={() => aoPausar(true)} disabled={pausando}>{pausando ? 'Pausando…' : minha ? 'Pausar minha régua' : 'Pausar régua'}</BotaoSec>}
          </div>
        )}
      </header>

      <div className="rt-estados">
        <Estado rot="Régua da empresa" valor={empresaLigada ? 'Ligada' : 'Desligada'} tom={empresaLigada ? 'ok' : 'neutro'} />
        <Estado rot={minha ? 'Minha régua' : 'Situação da régua'} valor={pausada ? 'Pausada' : 'Ativa'} tom={pausada ? 'atencao' : 'ok'} />
        <Estado rot="WhatsApp que envia" valor={numero ? numero.rotulo : 'verificando…'} tom={numero ? (numero.conectado ? 'ok' : 'erro') : 'neutro'} detalhe={numero?.detalhe} />
        <Estado rot="Horário" valor={`${h2(inicio)}:00 às ${h2(horario.fim)}:00`} tom="neutro" />
      </div>

      {pausada && (
        <div className="rt-aviso atencao" role="status">
          <b>{minha ? 'Sua régua está pausada.' : `A régua de ${nome} está pausada.`}</b>
          <span>Nenhuma mensagem automática sai {pros} até {minha ? 'você retomar' : 'retomar'}. O resto da equipe continua normal.</span>
        </div>
      )}
      {!pausada && !empresaLigada && (
        <div className="rt-aviso neutro" role="status">
          <b>A régua da empresa está desligada.</b>
          <span>Nada sai sozinho até o administrador ligar — abaixo, o que sairia.</span>
        </div>
      )}
      {!pausada && empresaLigada && numero && !numero.conectado && (
        <div className="rt-aviso erro" role="status">
          <b>{minha ? 'Seu WhatsApp não está conectado.' : `O WhatsApp de ${nome} não está conectado.`}</b>
          <span>As mensagens {dos} ficam esperando até o número conectar (em Números).</span>
        </div>
      )}

      <div className="rt-tiles">
        {([['Hoje', tiles.hoje], ['Amanhã', tiles.amanha], [minha ? 'Meus clientes' : 'Clientes', tiles.clientes]] as [string, TileRegua][]).map(([rot, t]) => (
          <div className="rt-tile" key={rot}>
            <span className="rt-tile-rot">{rot}</span>
            <div className="rt-tile-v"><b className="num">{t.valor}</b><span>{t.unidade}</span></div>
            <span className="rt-tile-sub">{t.sub}</span>
          </div>
        ))}
      </div>

      <div className="rt-hor">
        <span className="rt-hor-ic" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
        </span>
        <div className="rt-hor-tx">
          <label htmlFor="rt-hor-sel">{minha ? 'Meu horário de envio' : 'Horário de envio'}</label>
          <div className="rt-hor-linha">
            <span>As mensagens {dos} começam às</span>
            {podeEditar
              ? <SeletorInicio id="rt-hor-sel" rotulo={minha ? 'Meu horário de início' : `Horário de início de ${nome}`} inicioGeral={horario.inicioGeral} fim={horario.fim}
                  valor={horario.valor} disabled={horario.salvando} aoMudar={horario.aoMudar} />
              : <b className="num">{h2(inicio)}:00</b>}
            <span>e vão até <b className="num">{h2(horario.fim)}:00</b>.</span>
            {horario.salvando && <span className="rt-salvando">salvando…</span>}
          </div>
          <span className="rt-hor-d">Até {minha ? 'o seu horário' : 'esse horário'}, {sujeito} esperam na fila. A janela da empresa é das {h2(inicioEmpresa)}:00 às {h2(horario.fim)}:00 (o administrador define).</span>
        </div>
      </div>
    </section>
  );
}

/** confirmação de pausar (retomar não pede: só faz voltar a sair) */
export function ConfirmarPausaRegua({ nome, minha, pausando, aoConfirmar, aoFechar }: {
  nome: string; minha: boolean; pausando?: boolean; aoConfirmar: () => void; aoFechar: () => void;
}) {
  return (
    <ModalV2 aberto aoFechar={() => { if (!pausando) aoFechar(); }} largura={460}
      titulo={<div>{minha ? 'Pausar a sua régua?' : `Pausar a régua de ${nome}?`}<div className="mod-sub">As mensagens automáticas param só {minha ? 'pros seus clientes' : `pros clientes de ${nome}`}</div></div>}
      rodape={<><BotaoSec onClick={aoFechar} disabled={pausando}>Cancelar</BotaoSec><BotaoPrimario onClick={aoConfirmar} disabled={pausando}>{pausando ? 'Pausando…' : 'Pausar'}</BotaoPrimario></>}>
      <div className="rt-modal-tx">
        <p>Enquanto estiver pausada, nenhum cliente {minha ? 'seu' : `de ${nome}`} recebe a cobrança nem o lembrete — o que já estava na fila de hoje também não sai.</p>
        <p>As mensagens, os dias e o horário ficam guardados. É só clicar em <b>Retomar</b> pra voltar a sair (no mesmo dia, se ainda estiver dentro da janela). Também dá pra voltar pelo botão Desfazer.</p>
      </div>
    </ModalV2>
  );
}

/* ---------------- aba Comerciais (gestor) ---------------- */
export type LinhaComercialRegua = {
  chave: string; nome: string; clientes: number; comTelefone: number;
  numero: NumeroDoComercial; inicio: number | null; pausada: boolean; proprias: number;
};
export function TabelaComerciaisRegua({ linhas, inicioGeral, fim, salvandoHorario, pausando, aoHorario, aoPausar, aoAbrir, carregando, erro }: {
  linhas: LinhaComercialRegua[]; inicioGeral: number; fim: number; salvandoHorario?: boolean; pausando?: boolean;
  aoHorario: (l: LinhaComercialRegua, h: number | null) => void; aoPausar: (l: LinhaComercialRegua, pausar: boolean) => void;
  aoAbrir: (l: LinhaComercialRegua) => void; carregando?: boolean; erro?: string | null;
}) {
  if (carregando && !linhas.length) return <div className="rt-vazio">Carregando os comerciais…</div>;
  if (!linhas.length) return <div className="rt-vazio">{erro ? `Não deu pra carregar: ${erro}` : 'Nenhum comercial com clientes em cobrança.'}</div>;
  return (
    <div className="rt-tab" role="table" aria-label="Régua de cada comercial">
      <div className="rt-tab-h" role="row">
        <span role="columnheader">Comercial</span>
        <span role="columnheader">Clientes</span>
        <span role="columnheader">WhatsApp</span>
        <span role="columnheader">Começa às</span>
        <span role="columnheader">Régua</span>
        <span role="columnheader" className="rt-tab-acao-h" aria-label="Ações" />
      </div>
      {linhas.map((l) => {
        const p = l.clientes ? Math.round((l.comTelefone / l.clientes) * 100) : 0;
        return (
          <div className={`rt-tab-l${l.pausada ? ' pausada' : ''}`} role="row" key={l.chave}>
            <div className="rt-tab-quem" role="cell">
              <span className="rt-av sm" aria-hidden>{iniciais(l.nome)}</span>
              <div><b>{l.nome}</b>{l.proprias > 0 && <span className="rt-tab-sub">{l.proprias} {l.proprias === 1 ? 'mensagem própria' : 'mensagens próprias'}</span>}</div>
            </div>
            <div className="rt-tab-cli" role="cell">
              <b className="num">{l.clientes}</b>
              <span className="rt-tab-sub num">{l.comTelefone} com telefone · {p}%</span>
            </div>
            <div className="rt-tab-num" role="cell">
              <BadgeStatus tom={l.numero ? (l.numero.conectado ? 'ok' : 'atencao') : 'neutro'}>{l.numero ? l.numero.rotulo : 'verificando…'}</BadgeStatus>
              {l.numero?.detalhe && <span className="rt-tab-sub num">{l.numero.detalhe}</span>}
            </div>
            <div role="cell">
              <SeletorInicio rotulo={`Horário de início de ${l.nome}`} inicioGeral={inicioGeral} fim={fim} valor={l.inicio} disabled={salvandoHorario}
                aoMudar={(h) => aoHorario(l, h)} />
            </div>
            <div role="cell">
              <button type="button" className={`rt-pill ${l.pausada ? 'pausada' : 'ativa'}`} disabled={pausando}
                onClick={() => aoPausar(l, !l.pausada)} title={l.pausada ? 'Pausada — clique pra retomar' : 'Ativa — clique pra pausar'}>
                <i aria-hidden />{l.pausada ? 'Pausada' : 'Ativa'}
              </button>
            </div>
            <div className="rt-tab-acao" role="cell">
              <button type="button" className="rt-link" onClick={() => aoAbrir(l)}>Abrir régua</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- aba Configuração (gestor) ---------------- */
export type ValoresConfigRegua = {
  hora_envio: number; hora_fim: number; dias_envio: 'todos' | 'uteis' | 'uteis_sabado';
  teto_diario: number; delay_min: number; delay_max: number; pausa_cada: number; pausa_min: number;
  canal_reserva_id: string | null; pausar_se_respondeu: boolean;
};
function Linha({ titulo, descricao, htmlFor, children }: { titulo: string; descricao: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="rt-cfg-l">
      <div className="rt-cfg-tx">
        {htmlFor ? <label htmlFor={htmlFor}>{titulo}</label> : <span className="rt-cfg-t">{titulo}</span>}
        <span className="rt-cfg-d">{descricao}</span>
      </div>
      <div className="rt-cfg-ctl">{children}</div>
    </div>
  );
}
/** número inteiro com rascunho local: grava no blur (e no Enter), nunca no meio da digitação */
function CampoNumero({ id, valor, min, max, rotulo, aoSalvar, largura = 72 }: {
  id?: string; valor: number; min: number; max: number; rotulo: string; aoSalvar: (n: number) => void; largura?: number;
}) {
  const [rasc, setRasc] = useState<string | null>(null);
  const focado = useRef(false);
  // valor novo vindo do servidor só limpa o rascunho se a pessoa NÃO está digitando no campo
  useEffect(() => { if (!focado.current) setRasc(null); }, [valor]);
  const fechar = (t: string) => {
    setRasc(null);
    const v = t.replace(/\D/g, '');
    if (!v) return;
    const n = Math.max(min, Math.min(max, Math.trunc(Number(v))));
    if (n !== valor) aoSalvar(n);
  };
  return (
    <Input id={id} inputMode="numeric" aria-label={rotulo} className="rt-num" style={{ width: largura }}
      value={rasc ?? String(valor)} onFocus={() => { focado.current = true; setRasc(String(valor)); }} onChange={(e) => setRasc(e.target.value)}
      onBlur={(e) => { focado.current = false; fechar(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
export function ConfigReguaLista({ v, numeros, salvando, aoSalvar }: {
  v: ValoresConfigRegua; numeros: { id: string; rotulo: string }[]; salvando?: boolean;
  aoSalvar: (patch: Partial<ValoresConfigRegua>, ok?: string) => void;
}) {
  return (
    <div className="rt-cfg">
      <section className="rt-cfg-g">
        <header><h3>Quando envia</h3><span>Vale pra toda a equipe. Cada comercial ainda pode começar mais tarde (aba Comerciais ou na régua dele).</span></header>
        <Linha titulo="Janela de envio" htmlFor="rt-cfg-ini" descricao={<>A régua só monta e manda dentro desta janela; o que não sair até {h2(v.hora_fim)}:00 não sai no dia. Recomendado: 05:00 às 10:00.</>}>
          <div className="rt-cfg-par">
            <select id="rt-cfg-ini" className="inp rt-sel-hora" aria-label="Começa às" value={v.hora_envio} disabled={salvando}
              onChange={(e) => { const h = Number(e.target.value); aoSalvar({ hora_envio: h, hora_fim: Math.max(v.hora_fim, h + 1) }); }}>
              {Array.from({ length: 17 }, (_, i) => 5 + i).map((h) => <option key={h} value={h}>{h2(h)}:00</option>)}
            </select>
            <span>às</span>
            <select className="inp rt-sel-hora" aria-label="Termina às" value={v.hora_fim} disabled={salvando} onChange={(e) => aoSalvar({ hora_fim: Number(e.target.value) })}>
              {Array.from({ length: 17 }, (_, i) => 6 + i).filter((h) => h > v.hora_envio).map((h) => <option key={h} value={h}>{h2(h)}:00</option>)}
            </select>
          </div>
        </Linha>
        <Linha titulo="Dias de envio" htmlFor="rt-cfg-dias" descricao={v.dias_envio === 'todos' ? 'Na data exata do ciclo, ou na data marcada à mão no Calendário.' : 'Vencimento em fim de semana ou feriado vai pro próximo dia útil.'}>
          <select id="rt-cfg-dias" className="inp rt-sel-larga" value={v.dias_envio} disabled={salvando} onChange={(e) => aoSalvar({ dias_envio: e.target.value as ValoresConfigRegua['dias_envio'] })}>
            <option value="todos">Todos os dias (data exata)</option>
            <option value="uteis">Só dias úteis (segue o Calendário)</option>
            <option value="uteis_sabado">Dias úteis + sábado</option>
          </select>
        </Linha>
      </section>

      <section className="rt-cfg-g">
        <header><h3>Proteção dos números</h3><span>O cuidado contra bloqueio do WhatsApp — vale pra todos os números.</span></header>
        <Linha titulo="Máximo por número, por dia" htmlFor="rt-cfg-teto" descricao="Quantas mensagens da régua cada número manda no dia. 0 = sem limite.">
          <div className="rt-cfg-par"><CampoNumero id="rt-cfg-teto" rotulo="Máximo por número por dia" valor={v.teto_diario} min={0} max={1000}
            aoSalvar={(n) => aoSalvar({ teto_diario: n }, n ? `Cada número manda no máximo ${n} mensagens da régua por dia.` : 'Sem limite diário por número (0) — cuidado com bloqueio do WhatsApp.')} /><span>mensagens</span></div>
        </Linha>
        <Linha titulo="Intervalo entre clientes" htmlFor="rt-cfg-dmin" descricao="Sorteado a cada cliente, pra parecer envio humano. Recomendado: 40 a 90 segundos.">
          <div className="rt-cfg-par">
            <CampoNumero id="rt-cfg-dmin" rotulo="Intervalo mínimo em segundos" valor={v.delay_min} min={5} max={300}
              aoSalvar={(n) => aoSalvar({ delay_min: n, delay_max: Math.max(n, v.delay_max) })} />
            <span>a</span>
            <CampoNumero rotulo="Intervalo máximo em segundos" valor={v.delay_max} min={v.delay_min} max={300} aoSalvar={(n) => aoSalvar({ delay_max: n })} />
            <span>segundos</span>
          </div>
        </Linha>
        <Linha titulo="Pausa longa do número" htmlFor="rt-cfg-pcada" descricao="Depois de algumas mensagens seguidas, o número descansa. Recomendado: a cada 15, 5 minutos. 0 = sem pausa.">
          <div className="rt-cfg-par">
            <span>a cada</span>
            <CampoNumero id="rt-cfg-pcada" rotulo="A cada quantas mensagens" valor={v.pausa_cada} min={0} max={200}
              aoSalvar={(n) => aoSalvar({ pausa_cada: n }, n ? `Pausa longa a cada ${n} mensagens.` : 'Sem pausa longa.')} />
            <span>descansa</span>
            <CampoNumero rotulo="Minutos de pausa" valor={v.pausa_min} min={0} max={120} aoSalvar={(n) => aoSalvar({ pausa_min: n })} />
            <span>min</span>
          </div>
        </Linha>
      </section>

      <section className="rt-cfg-g">
        <header><h3>Situações especiais</h3><span>O que fazer quando falta número ou o cliente responde.</span></header>
        <Linha titulo="Número reserva" htmlFor="rt-cfg-res" descricao="Só é usado pros clientes de comercial sem número conectado.">
          <select id="rt-cfg-res" className="inp rt-sel-larga" value={v.canal_reserva_id ?? ''} disabled={salvando}
            onChange={(e) => aoSalvar({ canal_reserva_id: e.target.value || null }, e.target.value ? 'Clientes de comercial sem número conectado passam a sair pelo número reserva.' : 'Sem reserva: cada cliente espera o número do próprio comercial.')}>
            <option value="">Nenhum — espera o número do comercial</option>
            {numeros.map((n) => <option key={n.id} value={n.id}>{n.rotulo}</option>)}
          </select>
        </Linha>
        <div className="rt-cfg-l rt-cfg-tgl">
          <LinhaToggle titulo="Pausar quando o cliente responder" descricao="Os próximos passos do mês param pra esse cliente e a conversa vira atendimento humano."
            ligado={v.pausar_se_respondeu} disabled={salvando} aoMudar={(x) => aoSalvar({ pausar_se_respondeu: x })} />
        </div>
      </section>
    </div>
  );
}
