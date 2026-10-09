/* Pendências — "Nova pendência" em tela cheia, 3 etapas:
   1 Cliente (clientes FECHADOS, ou "Cadastrar número" para quem não está no Atenvo)
   · 2 O que o juiz pediu · 3 Mensagem e lembretes.
   Demo: grava no store em memória. Real: RPC pendencia_criar / pendencia_criar_numero (o tick despacha). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BotaoPrimario, BotaoSec, ConfirmDialogV2, Segmentado } from '../../components';
import {
  MAX_ENVIOS, ROTULO_TIPO, apagarSinal, celularSemNove, clonarPassos, contatoElegivel, contatoSemNome, diasAte, digitosAntes, digitosLocais,
  editarTelefone, iniciais, instanteLembrete, limparNome, mascaraTelefone, nomeBonito, nomeClienteValido, normalizarTelefone,
  posAposDigitos, previsaoSaida, problemaNome, proximaJanela, quandoCurto, telefoneEstrangeiro, telefoneTela, variavelSemDado,
  type ChecagemNumero, type ClienteFechado, type Passo, type TipoPendencia,
} from '@/data/pendencias';
import { EditorRegua, reguaPronta, useEscFecha } from './EditorRegua';
import { useBuscaClientes } from './fonte';
import { Falta, usePend } from './PendenciasTela';
import { IcAlerta, IcBusca, IcCheck, IcEnviar, IcMais, IcPedido, IcPessoa, IcRelogio, IcSeta, IcVoltar } from './icones';

const DICA_TIPO: Record<TipoPendencia, string> = {
  reassinatura: 'Procuração, contrato…',
  documento: 'RG, comprovante, extrato…',
  informacao: 'Endereço, conta…',
  outro: 'Qualquer outro pedido do juiz',
};
const ETAPAS = ['Cliente', 'O que precisa', 'Mensagens'];

/** data local "AAAA-MM-DD" (toISOString daria a data de Greenwich: depois das 21h viraria amanhã) */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function useAtrasado<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** nome no título: as duas primeiras palavras sem "da/de/dos…" ("José da Silva" → "José Silva", nunca "José da") */
const nomeCurto = (n: string) => nomeBonito(n).split(' ').filter((p, i) => i === 0 || !/^(da|de|do|das|dos|e)$/.test(p)).slice(0, 2).join(' ');

/** cliente escolhido pelo número (fora da lista): vai por pendencia_criar_numero.
 *  novo = o número não é de ninguém (o cliente é cadastrado junto com a pendência). */
interface PorNumero { novo: boolean; nome: string; telefone: string }

/** confere o número ~300ms depois de parar de digitar (pendencias_checar_numero). Resposta velha
 *  (de um número que já mudou) é descartada. 'espera' = ainda no intervalo; nada vai ao servidor. */
type Conferencia = { estado: 'espera' | 'conferindo' | 'ok' | 'erro'; r?: ChecagemNumero };
function useConferirNumero(tel: string | null, checar: (t: string) => Promise<ChecagemNumero>) {
  const checarRef = useRef(checar);
  useEffect(() => { checarRef.current = checar; });
  const [st, setSt] = useState<(Conferencia & { tel: string }) | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!tel) return;
    let vivo = true;
    const t = setTimeout(() => {
      setSt({ tel, estado: 'conferindo' });
      checarRef.current(tel).then(
        (r) => { if (vivo) setSt({ tel, estado: 'ok', r }); },
        () => { if (vivo) setSt({ tel, estado: 'erro' }); },
      );
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [tel, tentativa]);
  const conf: Conferencia | null = !tel ? null : st && st.tel === tel ? st : { estado: 'espera' };
  return { conf, deNovo: () => { setSt(null); setTentativa((n) => n + 1); } };
}

/** campo do nome: só aparece DEPOIS de o número ser conferido (número novo ou contato sem nome), então
 *  nunca some debaixo de quem está digitando. Ao aparecer, só pega o foco se foi pedido (atalho da busca,
 *  "Está certo"): o que foi digitado antes de ele existir não vira um pedaço de nome. Se sumir com o foco
 *  nele (o número mudou), o foco volta para o WhatsApp, nunca para um botão (espaço/Enter em "Continuar"
 *  levaria a pessoa adiante sem ela decidir). */
function CampoNome({ valor, aoMudar, foco, aoFocar }: { valor: string; aoMudar: (v: string) => void; foco: boolean; aoFocar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (foco) { ref.current?.focus(); aoFocar(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco]);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el || document.activeElement !== el) return;
      /* saiu de verdade da tela (no StrictMode o React desmonta e remonta de mentira: aí o campo continua lá) */
      requestAnimationFrame(() => {
        if (!el.isConnected && (!document.activeElement || document.activeElement === document.body)) document.getElementById('pd-cli-fone')?.focus();
      });
    };
  }, []);
  return (
    <div className="pd-campo">
      <label htmlFor="pd-cli-nome">Nome do cliente</label>
      <input id="pd-cli-nome" ref={ref} className="inp pd-inp" value={valor} maxLength={80} autoComplete="off" autoCapitalize="words"
        spellCheck={false} onChange={(e) => aoMudar(e.target.value)} placeholder="Nome completo" />
    </div>
  );
}

export function NovaPendencia({ clienteInicial, clienteInicialDados, aoFechar, aoCriar }: {
  clienteInicial?: string; clienteInicialDados?: ClienteFechado; aoFechar: () => void; aoCriar: (id: string) => void;
}) {
  const { f, avisar, rodar } = usePend();
  const [etapa, setEtapa] = useState(clienteInicial ? 2 : 1);
  const [cliente, setCliente] = useState<ClienteFechado | undefined>(clienteInicialDados);
  const [busca, setBusca] = useState('');
  const buscaAtrasada = useAtrasado(busca, 250);
  const { lista, carregando } = useBuscaClientes(buscaAtrasada);
  const [tipo, setTipo] = useState<TipoPendencia | ''>('');
  const [oQue, setOQue] = useState('');
  const [prazo, setPrazo] = useState('');
  const [processo, setProcesso] = useState(clienteInicialDados?.processo ?? '');
  const [modeloId, setModeloId] = useState('');
  const [passos, setPassos] = useState<Passo[]>([]);
  /* o que veio do modelo: se `passos` é outro array, a pessoa mexeu (o editor só cria array novo quando muda algo) */
  const [passosBase, setPassosBase] = useState<Passo[]>([]);
  const [trocarPara, setTrocarPara] = useState<string | null>(null);
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora');
  const [dataAg, setDataAg] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); });
  const [horaAg, setHoraAg] = useState('09:00');
  const [sair, setSair] = useState(false);
  const [enviando, setEnviando] = useState(false);

  /* etapa 1, "Cadastrar número": cliente que não está no Atenvo */
  const [modo1, setModo1] = useState<'buscar' | 'numero'>('buscar');
  const [foneNovo, setFoneNovo] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  /* foco pedido para o nome: vale quando o campo APARECER (depois da conferência) e só para este número */
  const [focoNomeEm, setFocoNomeEm] = useState<string | null>(null);
  /* celular de 10 dígitos (sem o nono) que a pessoa confirmou que está certo */
  const [ok10, setOk10] = useState<string | null>(null);
  const [porNumero, setPorNumero] = useState<PorNumero | null>(null);
  const foneRef = useRef<HTMLInputElement>(null);
  /* cursor do campo com máscara: volta para o mesmo dígito depois de formatar (corrigir no meio não pula para o fim) */
  const [cursor, setCursor] = useState<{ pos: number; n: number } | null>(null);
  useLayoutEffect(() => {
    const el = foneRef.current;
    if (cursor && el && document.activeElement === el) el.setSelectionRange(cursor.pos, cursor.pos);
  }, [cursor]);
  const estrangeiro = telefoneEstrangeiro(foneNovo);
  const dgFone = digitosLocais(foneNovo);
  const tel = estrangeiro ? null : normalizarTelefone(dgFone);
  const { conf, deNovo } = useConferirNumero(tel, f.checarNumero);
  const dddRuim = dgFone.length >= 2 && Number(dgFone.slice(0, 2)) < 11;
  const foneInvalido = estrangeiro || dddRuim || (dgFone.length >= 10 && !tel) || (conf?.estado === 'ok' && !conf.r?.valido);
  const confOk = !foneInvalido && conf?.estado === 'ok';
  const dono = confOk ? conf?.r?.contato ?? null : null;
  /* número de ninguém com 10 dígitos e cara de celular: "Faltou um?" até completar ou confirmar */
  const semNove = confOk && !dono && celularSemNove(dgFone) && ok10 !== tel;
  const numeroNovo = confOk && !dono && !semNove;
  /* contato sem nome (o "nome" é o telefone): pede o nome, que o cadastro grava nele */
  const donoSemNome = !!dono && contatoSemNome(dono);
  /* raro: contato que não fechou com nome que o servidor recusa (1 letra, 80+): o nome digitado só valida */
  const donoNomeRuim = !!dono && !donoSemNome && !contatoElegivel(dono) && !nomeClienteValido(dono.nome);
  /* uma coisa por vez: número → (só se for preciso) nome. Nada de nome antes de o número ser conferido. */
  const mostrarNome = numeroNovo || donoSemNome || donoNomeRuim;
  const probNome = mostrarNome ? problemaNome(nomeNovo) : '';
  const podeContinuar = !!tel && confOk && !semNove && !probNome;
  /* rodapé: só o que o campo NÃO diz (inválido, conferindo, erro e "faltou um?" já estão ao lado do campo) */
  const faltaNumero = (() => {
    if (!foneNovo.trim()) return 'Digite o WhatsApp do cliente.';
    if (foneInvalido) return '';
    if (!tel) return 'Número incompleto.';
    if (!confOk || semNove) return '';
    if (probNome === 'vazio') return 'Escreva o nome do cliente.';
    if (probNome === 'sem_letra') return 'O nome precisa ter letras.';
    if (probNome === 'curto') return 'Nome muito curto.';
    if (probNome === 'longo') return 'Nome muito longo.';
    return '';
  })();
  const aplicarFone = (v: string, pos: number) => {
    setFoneNovo(v); setFocoNomeEm(null); setOk10(null); setCursor({ pos, n: (cursor?.n ?? 0) + 1 });
  };
  /* busca da etapa 1: é um telefone? (sem letra e com 4+ dígitos; o número inteiro: o 55 da frente sai) */
  const dgBusca = buscaAtrasada.replace(/\D/g, '');
  const buscaEhFone = !/\p{L}/u.test(buscaAtrasada) && dgBusca.length >= 4;
  const foneBusca = buscaEhFone && !telefoneEstrangeiro(buscaAtrasada) ? mascaraTelefone(buscaAtrasada, true) : '';
  const foneDaBusca = foneBusca && normalizarTelefone(foneBusca.replace(/\D/g, '')) ? foneBusca : '';
  const atalhoCadastro = !!foneDaBusca && !lista.length && !carregando;
  const abrirCadastro = (fone?: string) => {
    const b = busca.trim();
    const comLetra = /\p{L}/u.test(b);
    /* busca com letra é um NOME: ele vai para o nome e o número começa vazio (nunca o de antes, de outra pessoa) */
    const f1 = fone ?? (comLetra ? '' : b.replace(/\D/g, '').length >= 4 ? editarTelefone(b, true) ?? '' : foneNovo);
    setFoneNovo(f1);
    if (comLetra) setNomeNovo(b);
    setFocoNomeEm(normalizarTelefone(digitosLocais(f1)) ? f1 : null);
    setModo1('numero');
  };
  /* escolher o cliente: só zera o nº do processo quando o cliente muda */
  const escolher = (c: ClienteFechado, pn: PorNumero | null) => {
    const chave = (x?: ClienteFechado, p?: PorNumero | null) => (x ? x.id || `novo:${p?.telefone ?? ''}` : '');
    if (chave(c, pn) !== chave(cliente, porNumero)) setProcesso('');
    setCliente(c); setPorNumero(pn); setEtapa(2);
  };
  const continuarNumero = () => {
    if (!podeContinuar || !tel) return;
    if (dono) {
      const digitado = limparNome(nomeNovo);
      /* contato sem nome: a tela, a prévia e o cadastro usam o nome digitado (pendencia_criar_numero grava) */
      const c: ClienteFechado = { id: dono.id, nome: donoSemNome ? digitado.toUpperCase() : dono.nome, telefone: dono.telefone, processo: '', acao: '', responsavel: dono.responsavel, fechadoEm: '' };
      /* fechou ou já tem pendência (e tem nome): o jeito normal (pendencia_criar). Senão o cadastro por
         número usa ESSE contato (só o contato sem nome ganha o nome digitado) */
      escolher(c, contatoElegivel(dono) && !donoSemNome ? null
        : { novo: false, nome: donoSemNome || donoNomeRuim ? digitado : limparNome(dono.nome), telefone: tel });
      return;
    }
    const nome = limparNome(nomeNovo);
    escolher({ id: '', nome: nome.toUpperCase(), telefone: telefoneTela(tel), processo: '', acao: '', responsavel: f.usuario.nome, fechadoEm: '' },
      { novo: true, nome, telefone: tel });
  };

  const escolherModelo = (id: string) => {
    setModeloId(id);
    const m = f.modelos.find((x) => x.id === id);
    const ps = m ? clonarPassos(m.passos) : [{ id: 'p0', dia: 0, hora: 'agora', blocos: [{ id: 'b0', tipo: 'texto' as const, texto: '' }] }];
    setPassos(ps); setPassosBase(ps);
  };
  const editado = passos.length > 0 && passos !== passosBase;
  /* chegou na etapa 2 vindo da 1: o foco vai para o título dela (quem usa teclado segue dali, não do topo) */
  const tituloEtapa2 = useRef<HTMLHeadingElement>(null);
  const etapaAntes = useRef(etapa);
  useEffect(() => {
    if (etapa === 2 && etapaAntes.current === 1) tituloEtapa2.current?.focus({ preventScroll: true });
    etapaAntes.current = etapa;
  }, [etapa]);
  const irPara3 = () => {
    if (!passos.length) escolherModelo(f.modelos.find((m) => m.tipo === tipo)?.id ?? '');
    setEtapa(3);
  };
  /* com cliente já escolhido (veio do painel), a etapa 1 fica travada */
  const minEtapa = clienteInicial ? 2 : 1;
  const voltar = () => (etapa > minEtapa ? setEtapa(etapa - 1) : etapa === 1 && modo1 === 'numero' ? setModo1('buscar') : fechar());

  /* sujo = a pessoa preencheu algo (escolher o cliente da lista sozinho não conta; digitar nome/número conta) */
  const sujo = !!tipo || !!oQue.trim() || !!prazo || processo.trim() !== (clienteInicialDados?.processo ?? '')
    || (modo1 === 'numero' && (!!foneNovo.trim() || !!nomeNovo.trim()));
  const fechar = () => (sujo ? setSair(true) : aoFechar());
  useEscFecha(fechar, !enviando);

  const ctx = cliente ? { cliente, oQue, prazo: prazo ? `${prazo}T12:00:00` : undefined, processo, atendente: f.usuario.nome, remetente: f.ajustes.numero.nome, telefone: f.ajustes.numero.telefone } : null;
  const faltando = (() => {
    if (!passos.length || !passos[0].blocos.length) return 'A primeira mensagem está vazia.';
    if (passos.length > MAX_ENVIOS) return `Máximo de ${MAX_ENVIOS} envios.`;
    const x = reguaPronta(passos, ctx ?? undefined); if (x) return x;
    if (quando === 'depois' && (!dataAg || !horaAg)) return 'Escolha a data e a hora do envio.';
    if (quando === 'depois' && new Date(`${dataAg}T${horaAg}:00`).getTime() <= Date.now()) return 'Escolha um horário no futuro.';
    return '';
  })();

  /* quando a 1ª sai DE VERDADE: o motor só manda dentro do horário de envio (Ajustes) */
  const aj = f.ajustes;
  const alvo = quando === 'depois' && dataAg && horaAg ? new Date(`${dataAg}T${horaAg}:00`) : new Date();
  const saiEm = proximaJanela(alvo, aj);
  const foraJanela = saiEm.getTime() - alvo.getTime() > 60_000;
  const inicio = quando === 'depois' || foraJanela ? saiEm.toISOString() : undefined;
  const l1 = passos[1] ? proximaJanela(new Date(instanteLembrete(alvo, Math.max(1, passos[1].dia), passos[1].hora, aj.diasUteis)), aj) : undefined;
  const juntoL1 = foraJanela && !!l1 && l1.getTime() <= saiEm.getTime() + 5 * 60_000;
  /* um aviso só, o mais importante primeiro: curto no rodapé (uma linha), inteiro no title.
     Nada sai (desligado / número caído) vem antes de tudo: nunca esconder que a mensagem não sai */
  const nomeNum = nomeBonito(aj.numero.nome);
  const semDado = etapa === 3 && ctx ? variavelSemDado(passos, ctx) : '';
  const qSai = quandoCurto(saiEm.toISOString());
  const aviso = etapa !== 3 ? null
    : !aj.ativo ? { curto: 'Envios desligados: sai quando ligarem.', longo: 'Envios desligados: a pendência fica aberta e a mensagem sai quando ligarem os envios.' }
      : !aj.numero.conectado ? { curto: 'Número desconectado: sai quando voltar.', longo: `O número ${nomeNum} está desconectado: a mensagem sai quando ele voltar.` }
        : semDado ? { curto: semDado.startsWith('Sem prazo') ? 'Sem prazo: “Prazo” fica em branco.' : 'Sem nº do processo: fica em branco.', longo: semDado }
          : foraJanela ? {
            curto: juntoL1 ? `Sai ${qSai}, junto com o Lembrete 1.` : `Fora do horário: sai ${qSai}.`,
            longo: `Fora do horário de envio (${aj.janelaIni} às ${aj.janelaFim}${aj.diasUteis && [0, 6].includes(alvo.getDay()) ? ', de segunda a sexta' : ''}): a primeira mensagem sai ${qSai}${juntoL1 ? ', junto com o Lembrete 1. Mude o Lembrete 1 para outro dia' : ''}.`,
          } : null;
  const enviar = async () => {
    if (!cliente || !tipo || faltando || enviando) return;
    setEnviando(true);
    let id = '';
    const prev = previsaoSaida(alvo.toISOString(), aj);
    const msgOk = !f.real
      ? (quando === 'depois' ? 'Demonstração: envio agendado (nada sai de verdade).'
        : prev === 'em instantes' ? `Demonstração: a mensagem iria agora para ${nomeBonito(cliente.nome).split(' ')[0]} pelo número ${nomeNum}.`
          : `Demonstração: a mensagem sairia ${prev} (nada sai de verdade).`)
      : quando === 'depois' && aj.ativo ? 'Pendência aberta e agendada.'
        : `Pendência aberta. A mensagem sai ${prev}${prev.startsWith('quando') ? '' : ` pelo número ${nomeNum}`}.`;
    const dados = {
      tipo, oQue: oQue.trim(), prazo: prazo ? `${prazo}T12:00:00` : undefined, processo: processo.trim() || undefined,
      passos, agendarPara: quando === 'depois' ? new Date(`${dataAg}T${horaAg}:00`).toISOString() : undefined,
    };
    const ok = await rodar(async () => {
      id = porNumero
        ? await f.acoes.criarNumero({ nome: porNumero.nome, telefone: porNumero.telefone, ...dados })
        : await f.acoes.criar({ clienteId: cliente.id, ...dados });
    }, msgOk);
    setEnviando(false);
    if (ok) aoCriar(id);
  };

  return (
    <div className="pd-ed" role="dialog" aria-modal="true" aria-label="Nova pendência">
      <div className="pd-ed-topo">
        <div className="pd-ed-esq">
          <button type="button" className="pd-ed-voltar" onClick={voltar} aria-label="Voltar" title="Voltar"><IcVoltar /></button>
          <h2 className="pd-ed-tit">Nova pendência{cliente && etapa > 1 ? <small> · {nomeCurto(cliente.nome)}</small> : null}</h2>
        </div>
        <ol className="pd-etapas" aria-label="Etapas">
          {ETAPAS.map((r, i) => {
            const e = etapa === i + 1 ? 'atual' : etapa > i + 1 ? 'feita' : 'futura';
            const travada = e === 'feita' && i + 1 < minEtapa;
            return (
              <li key={r} className="pd-etapa" data-e={travada ? 'travada' : e}>
                {i > 0 && <i className="pd-etapa-linha" data-feita={etapa > i ? '' : undefined} aria-hidden />}
                <button type="button" disabled={e !== 'feita' || travada} onClick={() => setEtapa(i + 1)} aria-current={e === 'atual' ? 'step' : undefined}>
                  <span className="pd-etapa-n">{e === 'feita' ? <IcCheck t={12} /> : i + 1}</span>{r}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="pd-ed-dir"><BotaoSec onClick={fechar}>Cancelar</BotaoSec></div>
      </div>

      <div className="pd-ed-corpo">
        {etapa === 1 && modo1 === 'buscar' && (
          <div className="pd-etapa-corpo">
            <h3 className="pd-h">Para qual cliente?</h3>
            <p className="pd-h-sub">Clientes que já fecharam ou que já têm pendência.</p>
            <label className="pd-busca">
              <IcBusca />
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone" aria-label="Buscar cliente" />
            </label>
            {/* com o atalho "Cadastrar (51) …" na tela, ele é a única chamada */}
            {!atalhoCadastro && <p className="pd-cad">Cliente não está no Atenvo?<button type="button" className="pd-link-acao" onClick={() => abrirCadastro()}>Cadastrar número</button></p>}
            <div className="vidro pd-cands" role="list">
              {lista.map((c) => {
                const escolhido = c.id === cliente?.id;
                return (
                  <button key={c.id} type="button" role="listitem" className="pd-cand" aria-pressed={escolhido}
                    onClick={() => escolher(c, null)}>
                    <span className="pd-av">{iniciais(c.nome)}</span>
                    <span className="pd-cand-tx">
                      <span className="pd-cand-n">{nomeBonito(c.nome)}</span>
                      <span className="pd-cand-s">{[c.telefone, c.acao, c.responsavel].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="pd-cand-dir">
                      {c.abertas > 0 && <span className="pd-cand-ab num" data-varias={c.abertas >= 2 ? '' : undefined}>{c.abertas} {c.abertas === 1 ? 'aberta' : 'abertas'}</span>}
                      {escolhido && <span className="pd-cand-ok"><IcCheck /></span>}
                    </span>
                  </button>
                );
              })}
              {!lista.length && !carregando && (atalhoCadastro ? (
                <div className="pd-cands-vz pd-cands-vz-acao">
                  <span>Nenhum cliente com esse número.</span>
                  <BotaoSec onClick={() => abrirCadastro(foneDaBusca)}><IcMais /><span>Cadastrar <span className="num">{foneDaBusca}</span></span></BotaoSec>
                </div>
              ) : <p className="pd-cands-vz">{buscaEhFone ? 'Nenhum cliente com esse número.' : 'Nenhum cliente com esse nome.'}</p>)}
              {!lista.length && carregando && <p className="pd-cands-vz">Procurando…</p>}
            </div>
          </div>
        )}

        {etapa === 1 && modo1 === 'numero' && (
          <div className="pd-etapa-corpo"
            onKeyDown={(e) => {
              /* Enter num CAMPO = "Continuar" (num botão/link, faz o que o botão faz). No WhatsApp com o nome
                 ainda por preencher, Enter leva ao nome. */
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              const alvo = e.target as HTMLElement;
              if (alvo.tagName !== 'INPUT') return;
              e.preventDefault();
              if (alvo.id === 'pd-cli-fone' && mostrarNome && probNome) { document.getElementById('pd-cli-nome')?.focus(); return; }
              continuarNumero();
            }}>
            <h3 className="pd-h">Cadastrar número</h3>
            <p className="pd-h-sub">
              {/* com dono, o cartão fala (nada vai ser cadastrado): o subtítulo não contradiz */}
              {!dono && <>Para cliente que ainda não está no Atenvo. </>}
              <button type="button" className="pd-link-acao" onClick={() => setModo1('buscar')}>Procurar na lista</button>
            </p>
            <div className="pd-campo pd-campo-1">
              <label htmlFor="pd-cli-fone">WhatsApp<span className="pd-campo-dica">com DDD</span></label>
              <div className="pd-fone">
                <input id="pd-cli-fone" ref={foneRef} className="inp pd-inp num" value={foneNovo} inputMode="tel" autoComplete="off" spellCheck={false}
                  autoFocus aria-invalid={foneInvalido || undefined} aria-describedby="pd-cli-fone-st"
                  onPaste={(e) => {
                    /* número inteiro colado (com +55, do WhatsApp, do banco): troca o campo todo */
                    const t = e.clipboardData.getData('text');
                    if (!t.trim().startsWith('+') && t.replace(/\D/g, '').length < 10) return;
                    e.preventDefault();
                    const v = editarTelefone(t, true) ?? '';
                    aplicarFone(v, v.length);
                  }}
                  onChange={(e) => {
                    const bruto = e.target.value; const car = e.target.selectionStart ?? bruto.length;
                    /* Backspace/Delete em cima do hífen/parêntese apaga o dígito vizinho (teclado do celular também) */
                    const tipo = (e.nativeEvent as InputEvent).inputType ?? '';
                    const ap = tipo.startsWith('delete') ? apagarSinal(foneNovo, bruto, car, tipo.endsWith('Forward')) : null;
                    if (ap) { aplicarFone(ap.valor, ap.pos); return; }
                    const prox = editarTelefone(bruto);
                    if (prox === null) {
                      /* dígito a mais com o número cheio: fica como estava, com o cursor onde estava */
                      const extra = bruto.replace(/\D/g, '').length - foneNovo.replace(/\D/g, '').length;
                      setCursor({ pos: posAposDigitos(foneNovo, Math.max(0, digitosAntes(bruto, car) - extra)), n: (cursor?.n ?? 0) + 1 });
                      return;
                    }
                    aplicarFone(prox, posAposDigitos(prox, digitosAntes(bruto, car)));
                  }} placeholder="(51) 99999-9999" />
                <span id="pd-cli-fone-st" className="pd-fone-st" aria-live="polite"
                  data-tom={foneInvalido || conf?.estado === 'erro' ? 'erro' : numeroNovo ? 'ok' : undefined}>
                  {estrangeiro ? <><IcAlerta t={13} />Só números do Brasil (+55).</>
                    : foneInvalido ? <><IcAlerta t={13} />Número inválido. Confira o DDD.</>
                      : conf?.estado === 'conferindo' ? 'Conferindo…'
                        : conf?.estado === 'erro' ? <><IcAlerta t={13} />Não deu para conferir.<button type="button" className="pd-link-sutil" onClick={deNovo}>Tentar de novo</button></>
                          : numeroNovo ? <><IcCheck t={14} /><b>Número novo</b><span className="pd-fone-st-dica">o cliente fica salvo no Atenvo</span></>
                            : null}
                </span>
              </div>
              {semNove && (
                <p className="pd-campo-aviso" role="status">
                  <IcAlerta t={13} /><span>Celular tem 9 dígitos depois do DDD. Faltou um?</span>
                  <button type="button" className="pd-link-acao" onClick={() => { setOk10(tel); setFocoNomeEm(foneNovo); }}>Está certo</button>
                </p>
              )}
            </div>
            {dono && (
              <div className="vidro pd-fone-dono" role="status">
                <span className="pd-av">{donoSemNome ? <IcPessoa t={16} /> : iniciais(dono.nome)}</span>
                <span className="pd-cand-tx">
                  <span className="pd-fone-dono-t">{donoSemNome ? <>Este número é de um contato <b>sem nome</b></> : <>Este número é de <b>{nomeBonito(dono.nome)}</b></>}</span>
                  <span className="pd-cand-s">{[dono.fechado ? 'Cliente fechado' : dono.temPendencia ? 'Já tem pendência' : 'Está no Atenvo, ainda não fechou', dono.responsavel].filter(Boolean).join(' · ')}</span>
                </span>
                {/* o mesmo sinal de "escolhido" da lista: é este cliente que vai ser usado */}
                <span className="pd-cand-ok"><IcCheck /></span>
              </div>
            )}
            {mostrarNome && <CampoNome valor={nomeNovo} aoMudar={setNomeNovo} foco={focoNomeEm !== null && focoNomeEm === foneNovo} aoFocar={() => setFocoNomeEm(null)} />}
          </div>
        )}

        {etapa === 2 && cliente && (
          <div className="pd-etapa-corpo">
            <div className="vidro pd-cli-min">
              <span className="pd-av">{iniciais(cliente.nome)}</span>
              <span className="pd-cand-tx">
                <span className="pd-cli-min-n">
                  <span className="pd-cand-n">{nomeBonito(cliente.nome)}</span>
                  {porNumero?.novo && <span className="pd-selo" data-tom="azul">Número novo</span>}
                </span>
                <span className="pd-cand-s">{[cliente.telefone, cliente.acao].filter(Boolean).join(' · ')}</span>
              </span>
              {!clienteInicial && <BotaoSec mini onClick={() => setEtapa(1)}>Trocar</BotaoSec>}
            </div>
            <h3 className="pd-h pd-h-2" ref={tituloEtapa2} tabIndex={-1}>O que o juiz pediu?</h3>
            <div className="pd-tipos" role="group" aria-label="Tipo de pendência">
              {(Object.keys(ROTULO_TIPO) as TipoPendencia[]).map((t) => (
                <button key={t} type="button" className="pd-tipo" aria-pressed={tipo === t}
                  onClick={() => { if (t === tipo) return; setTipo(t); if (!editado) { setPassos([]); setModeloId(''); setPassosBase([]); } }}>
                  <span className="pd-tipo-ic"><IcPedido t={t} tam={18} /></span>
                  <span className="pd-tipo-tx"><b>{ROTULO_TIPO[t]}</b><span title={DICA_TIPO[t]}>{DICA_TIPO[t]}</span></span>
                </button>
              ))}
            </div>
            <div className="pd-campo">
              <label htmlFor="pd-oque">Em poucas palavras<span className="pd-campo-dica">entra na mensagem no lugar de “O que precisa”</span></label>
              <input id="pd-oque" className="inp pd-inp" value={oQue} maxLength={160} onChange={(e) => setOQue(e.target.value)}
                placeholder={tipo === 'documento' ? 'ex.: comprovante de residência atualizado' : tipo === 'informacao' ? 'ex.: se o endereço continua o mesmo' : 'ex.: reassinar a procuração'} />
            </div>
            <div className="pd-campo-par">
              <div className="pd-campo">
                <label htmlFor="pd-prazo">Prazo do juiz<span className="pd-campo-dica">se tiver</span></label>
                <input id="pd-prazo" type="date" className="inp pd-inp" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                {prazo && diasAte(`${prazo}T12:00:00`) < 0 && <span className="pd-campo-erro"><IcAlerta t={13} />Essa data já passou. Confira o ano.</span>}
              </div>
              <div className="pd-campo">
                <label htmlFor="pd-proc">Nº do processo<span className="pd-campo-dica">se quiser</span></label>
                <input id="pd-proc" className="inp pd-inp num" value={processo} maxLength={40} onChange={(e) => setProcesso(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
              </div>
            </div>
          </div>
        )}

        {etapa === 3 && ctx && (
          <EditorRegua passos={passos} aoMudar={setPassos} ctx={ctx} avisar={avisar} subir={f.subir} inicio={inicio}
            saiTexto={!aj.ativo ? 'Sai quando ligarem os envios' : !aj.numero.conectado ? 'Sai quando o número voltar' : foraJanela ? `Sai ${qSai}` : undefined}
            notaPe={`Sai pelo número ${nomeNum}. Os lembretes param sozinhos quando o cliente responde.`}
            extraEsquerda={(
              <label className="pd-trilho-campo">
                <span className="pd-trilho-rot">Mensagem pronta</span>
                <select className="inp" value={modeloId} onChange={(e) => (editado ? setTrocarPara(e.target.value) : escolherModelo(e.target.value))}>
                  {f.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  <option value="">Em branco</option>
                </select>
              </label>
            )} />
        )}
      </div>

      {/* rodapé só existe quando tem conteúdo (a busca da etapa 1 não tem; o cadastro por número tem) */}
      {etapa === 1 && modo1 === 'numero' && (
        <div className="pd-ed-rodape">
          <div className="pd-ed-rodape-in">
            <span className="pd-esp" />
            <Falta t={faltaNumero} />
            <BotaoPrimario disabled={!podeContinuar} onClick={continuarNumero}>Continuar<IcSeta /></BotaoPrimario>
          </div>
        </div>
      )}
      {etapa === 2 && (
        <div className="pd-ed-rodape">
          {/* no eixo do formulário: "Continuar" alinha com a borda direita dos campos */}
          <div className="pd-ed-rodape-in">
            <span className="pd-esp" />
            <Falta t={!tipo ? 'Escolha o tipo de pedido.' : !oQue.trim() ? 'Escreva o que precisa.' : ''} />
            <BotaoPrimario disabled={!tipo || !oQue.trim()} onClick={irPara3}>Continuar<IcSeta /></BotaoPrimario>
          </div>
        </div>
      )}
      {etapa === 3 && (
        <div className="pd-ed-rodape">
          <div className="pd-envio">
            <Segmentado rotulo="Quando enviar" valor={quando} aoMudar={setQuando}
              opcoes={[{ valor: 'agora', rotulo: 'Agora' }, { valor: 'depois', rotulo: 'Em outro dia' }]} />
            {quando === 'depois' && (
              <>
                <input type="date" className="inp pd-envio-data" value={dataAg} min={isoLocal(new Date())} onChange={(e) => setDataAg(e.target.value)} aria-label="Data do envio" />
                <input type="time" className="inp pd-envio-hora" value={horaAg} onChange={(e) => setHoraAg(e.target.value || horaAg)} aria-label="Hora do envio" />
              </>
            )}
          </div>
          <span className="pd-esp" />
          {faltando ? <Falta t={faltando} /> : aviso ? <Falta t={aviso.curto} titulo={aviso.longo} /> : null}
          <BotaoPrimario disabled={!!faltando || enviando} onClick={enviar}>{quando === 'agora' ? <><IcEnviar />Enviar agora</> : <><IcRelogio />Agendar</>}</BotaoPrimario>
        </div>
      )}

      <ConfirmDialogV2 aberto={trocarPara !== null} titulo="Trocar a mensagem pronta?"
        mensagem={<span className="pd-dlg-tx">As mensagens que você mudou vão ser substituídas.</span>}
        rotuloConfirmar="Trocar" destrutivo aoConfirmar={() => { escolherModelo(trocarPara ?? ''); setTrocarPara(null); }} aoCancelar={() => setTrocarPara(null)} />
      <ConfirmDialogV2 aberto={sair} titulo="Descartar esta pendência?" mensagem={<span className="pd-dlg-tx">O que você preencheu vai se perder.</span>}
        rotuloConfirmar="Descartar" destrutivo aoConfirmar={() => { setSair(false); aoFechar(); }} aoCancelar={() => setSair(false)} />
    </div>
  );
}
