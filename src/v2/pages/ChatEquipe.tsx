import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LIMITE_TEXTO, agruparPorDia, chatEquipeLigado, conversasNoTexto, diaSP, filtrarSalas, horaSP, iniciais, nomeDaSala,
  partesDoTexto, previaDoTexto, quandoNaLista, situacaoDaMinhaUltima, traduzErroChat, useAbrirDireta, useChatMsgs,
  useChatSalas, useColegasChat, useCriarGrupo, useEnviarChat, useEuChat, useMarcarLidaChat, useNomesConversas,
  type MsgChat, type SalaChat,
} from '@/data/chatEquipe';
import { BotaoPrimario, BotaoSec, EstadoErro, EstadoVazio, ModalV2, Skeleton } from '../components';
import './chatEquipe.css';

/* ------------------------------------------------------------------
   CHAT DA EQUIPE (dono 25/11: o "Chat Interno" que a Reviza usava no sistema de antes). À esquerda as
   conversas (pessoas e grupos, a última mensagem, a hora e as não lidas); à direita a conversa aberta.
   Enter envia, Shift+Enter quebra a linha. Na conversa de pessoa para pessoa, "Visto" quando o colega leu.
   Link de conversa de cliente (/whatsapp?conversa=…) vira um cartão que abre a conversa no WhatsApp.
   Celular (até 760 px): um painel por vez, com o botão de voltar.
   ------------------------------------------------------------------ */

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const rascunhos = new Map<string, string>(); // o que ficou escrito em cada conversa (até recarregar a página)

const IcVoltar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
);
const IcEnviar = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
);
const IcGrupo = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const IcConversa = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
);
const IcBusca = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const IcCheck = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
);

function Avatar({ nome, grupo, pequeno }: { nome: string; grupo?: boolean; pequeno?: boolean }) {
  return <span className={pequeno ? 'ce-av peq' : 'ce-av'} aria-hidden>{grupo ? <IcGrupo /> : iniciais(nome)}</span>;
}

/** quem está no grupo, com "Você" na frente: "Você, Emillyn, Felipe e Raissa" */
function pessoasDoGrupo(s: SalaChat, eu: string | null): string {
  const nomes = ['Você', ...s.membros.filter((m) => m.id !== eu).map((m) => m.nome)];
  return nomes.length <= 1 ? 'Só você' : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export default function ChatEquipe() {
  if (!chatEquipeLigado()) return <Navigate to="/whatsapp" replace />;
  return <ChatEquipeTela />;
}

function ChatEquipeTela() {
  const eu = useEuChat();
  const salasQ = useChatSalas();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const salaId = params.get('sala');
  const [busca, setBusca] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);

  const salas = salasQ.data ?? [];
  const sala = salaId ? salas.find((s) => s.id === salaId) ?? null : null;
  const lista = useMemo(() => filtrarSalas(salas, busca, eu), [salas, busca, eu]);

  const abrir = (id: string) => { if (id !== salaId) setParams({ sala: id }, { state: { daLista: true } }); };
  const voltar = () => {
    if ((location.state as { daLista?: boolean } | null)?.daLista) navigate(-1);
    else setParams({}, { replace: true });
  };

  return (
    <div className="ce" data-chat-equipe data-painel={salaId ? 'conversa' : 'lista'}>
      <aside className="ce-lista" aria-label="Conversas da equipe">
        <div className="ce-lista-cab">
          <h2>Chat da equipe</h2>
          <BotaoPrimario mini onClick={() => setNovaAberta(true)}>＋ Nova conversa</BotaoPrimario>
        </div>
        {salas.length > 4 && (
          <label className="ce-busca">
            <IcBusca />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou grupo" aria-label="Buscar pessoa ou grupo" />
          </label>
        )}
        {salasQ.isError && !salasQ.data ? (
          <EstadoErro descricao="Não foi possível abrir as conversas agora." aoTentarDeNovo={() => salasQ.refetch()} />
        ) : salasQ.isPending ? (
          <div className="ce-carregando">{[0, 1, 2, 3].map((i) => <Skeleton key={i} altura={52} />)}</div>
        ) : !salas.length ? (
          <EstadoVazio titulo="Nenhuma conversa ainda" descricao="Comece uma conversa com um colega ou crie um grupo da equipe." acao={{ rotulo: 'Nova conversa', onClick: () => setNovaAberta(true) }} />
        ) : !lista.length ? (
          <p className="ce-nada">Nenhuma conversa com “{busca.trim()}”.</p>
        ) : (
          <ul className="ce-salas">
            {lista.map((s) => {
              const nome = nomeDaSala(s, eu);
              const u = s.ultima;
              const autor = !u ? '' : u.autorId === eu ? 'Você: ' : s.tipo === 'grupo' ? `${s.membros.find((m) => m.id === u.autorId)?.nome ?? 'Alguém'}: ` : '';
              const n = s.naoLidas;
              return (
                <li key={s.id}>
                  <button type="button" className={['ce-sala', s.id === salaId ? 'on' : '', n > 0 ? 'nl' : ''].filter(Boolean).join(' ')}
                    aria-current={s.id === salaId ? 'true' : undefined} onClick={() => abrir(s.id)}>
                    <Avatar nome={nome} grupo={s.tipo === 'grupo'} />
                    <span className="ce-sala-meio">
                      <span className="ce-sala-l1">
                        <span className="ce-sala-nome">{nome}</span>
                        <span className="ce-sala-hora num">{quandoNaLista(u?.criadoEm ?? s.criadoEm)}</span>
                      </span>
                      <span className="ce-sala-l2">
                        <span className="ce-sala-prev">{u ? autor + previaDoTexto(u.texto, u.apagada) : s.tipo === 'grupo' ? 'Grupo criado' : 'Conversa nova'}</span>
                        {n > 0 && <span className="ce-nl num" aria-label={n === 1 ? '1 mensagem não lida' : `${n} mensagens não lidas`}>{n > 99 ? '99+' : n}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="ce-painel" aria-label="Conversa aberta">
        {sala ? (
          <Conversa key={sala.id} sala={sala} eu={eu} aoVoltar={voltar} />
        ) : salaId && (salasQ.isPending || salasQ.isFetching) ? (
          <div className="ce-carregando ce-carregando-conv"><Skeleton altura={44} /><Skeleton altura={60} /><Skeleton altura={44} /></div>
        ) : salaId ? (
          <div className="ce-vazio-conv">
            <button type="button" className="ce-voltar" onClick={voltar} aria-label="Voltar para as conversas"><IcVoltar /></button>
            <EstadoVazio titulo="Conversa não encontrada" descricao="Ela pode ter sido apagada, ou você não está nela." />
          </div>
        ) : (
          <div className="ce-vazio-conv">
            <EstadoVazio titulo="Escolha uma conversa" descricao="Cada conversa fica só entre as pessoas que estão nela." />
          </div>
        )}
      </section>

      <NovaConversa aberto={novaAberta} aoFechar={() => setNovaAberta(false)} aoAbrir={(id) => { setNovaAberta(false); setBusca(''); abrir(id); }} />
    </div>
  );
}

/* ---------------- a conversa aberta ---------------- */
function Conversa({ sala, eu, aoVoltar }: { sala: SalaChat; eu: string | null; aoVoltar: () => void }) {
  const navigate = useNavigate();
  const msgsQ = useChatMsgs(sala.id);
  const enviar = useEnviarChat();
  const marcar = useMarcarLidaChat();
  const [texto, setTexto] = useState(() => rascunhos.get(sala.id) ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const noFim = useRef(true);
  const nome = nomeDaSala(sala, eu);
  const grupo = sala.tipo === 'grupo';

  const msgs = useMemo(() => msgsQ.data ?? [], [msgsQ.data]);
  const hoje = diaSP(new Date().toISOString());
  const dias = useMemo(() => agruparPorDia(msgs, hoje), [msgs, hoje]);
  const nomeDe = useMemo(() => new Map(sala.membros.map((m) => [m.id, m.nome])), [sala.membros]);
  const situacao = situacaoDaMinhaUltima(sala, msgs, eu);
  const citadas = useMemo(() => [...new Set(msgs.flatMap((m) => (m.apagada ? [] : conversasNoTexto(m.texto))))], [msgs]);
  const nomesConv = useNomesConversas(citadas).data ?? {};

  // li até aqui: com a conversa aberta e a janela à vista, o que chega já conta como lido
  const ultimaDeOutro = useMemo(() => [...msgs].reverse().find((m) => m.autorId !== eu && !m.pendente) ?? null, [msgs, eu]);
  const marcadoRef = useRef('');
  useEffect(() => {
    const tentar = () => {
      if (!msgsQ.data || document.visibilityState !== 'visible') return;
      const precisa = sala.naoLidas > 0 || (!!ultimaDeOutro && (!sala.lidoAte || ms(ultimaDeOutro.criadoEm) > ms(sala.lidoAte)));
      const chave = `${sala.id}|${ultimaDeOutro?.id ?? ''}|${sala.naoLidas}`;
      if (!precisa || marcadoRef.current === chave) return;
      marcadoRef.current = chave;
      marcar.mutate(sala.id);
    };
    tentar();
    document.addEventListener('visibilitychange', tentar);
    return () => document.removeEventListener('visibilitychange', tentar);
  }, [sala.id, sala.naoLidas, sala.lidoAte, ultimaDeOutro, msgsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // rolagem: abre no fim; mensagem nova desce sozinha se a pessoa já estava no fim (ou se foi ela que escreveu)
  const qtd = msgs.length;
  const ultimaMinha = msgs[qtd - 1]?.autorId === eu;
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (el && (noFim.current || ultimaMinha)) el.scrollTop = el.scrollHeight;
  }, [qtd, ultimaMinha, situacao?.visto]);
  useEffect(() => { if (window.matchMedia('(min-width: 761px)').matches) campo.current?.focus(); }, []);

  const ajustarAltura = () => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };
  useLayoutEffect(ajustarAltura, [texto]);

  const mudarTexto = (v: string) => { setTexto(v); if (v) rascunhos.set(sala.id, v); else rascunhos.delete(sala.id); if (erro) setErro(null); };
  const mandar = () => {
    const v = texto.trim();
    if (!v) return;
    mudarTexto('');
    noFim.current = true;
    enviar.mutate({ salaId: sala.id, texto: v }, {
      onError: (e) => { setErro(`A mensagem não saiu. ${traduzErroChat(e)}`); setTexto((atual) => atual || v); rascunhos.set(sala.id, v); },
    });
  };
  const aoTeclar = (e: RKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); mandar(); }
  };
  const abrirConversaCliente = (id: string) => navigate(`/whatsapp?conversa=${encodeURIComponent(id)}`);

  return (
    <div className="ce-conv">
      <header className="ce-cab">
        <button type="button" className="ce-voltar" onClick={aoVoltar} aria-label="Voltar para as conversas"><IcVoltar /></button>
        <Avatar nome={nome} grupo={grupo} />
        <div className="ce-cab-txt">
          <h3>{nome}</h3>
          <p>{grupo ? pessoasDoGrupo(sala, eu) : 'Só vocês dois veem esta conversa'}</p>
        </div>
      </header>

      <div className="ce-msgs" ref={rolagem} onScroll={(e) => { const el = e.currentTarget; noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        role="log" aria-live="polite" aria-label={`Mensagens com ${nome}`}>
        <div className="ce-msgs-dentro">
          {msgsQ.isError && !msgsQ.data ? (
            <EstadoErro descricao="Não foi possível abrir as mensagens agora." aoTentarDeNovo={() => msgsQ.refetch()} />
          ) : msgsQ.isPending ? (
            <div className="ce-carregando"><Skeleton altura={40} /><Skeleton altura={40} /></div>
          ) : !msgs.length ? (
            <p className="ce-primeira">{grupo ? 'Grupo criado. Escreva a primeira mensagem para todos.' : `Escreva a primeira mensagem para ${nome}.`}</p>
          ) : dias.map((d) => (
            <div key={d.dia} className="ce-dia-bloco">
              <div className="ce-dia"><span>{d.rotulo}</span></div>
              {d.msgs.map((m) => {
                const minha = m.autorId === eu;
                return (
                  <div key={m.id} className={['ce-msg', minha ? 'eu' : 'outro', m.continua ? 'ce-cont' : '', m.pendente ? 'pendente' : ''].filter(Boolean).join(' ')}>
                    {!minha && !m.continua && <div className="ce-autor">{m.autorId ? nomeDe.get(m.autorId) ?? 'Colega' : 'Pessoa que saiu da equipe'}</div>}
                    <div className="ce-bolha">
                      {m.apagada ? <span className="ce-apagada">Mensagem apagada</span>
                        : <TextoMsg msg={m} nomes={nomesConv} aoAbrir={abrirConversaCliente} />}
                      <span className="ce-hora num" title={new Date(m.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}>{m.pendente ? 'enviando' : horaSP(m.criadoEm)}</span>
                    </div>
                    {situacao?.msgId === m.id && <div className={situacao.visto ? 'ce-visto on' : 'ce-visto'}>{situacao.visto ? 'Visto' : 'Enviada'}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <form className="ce-compor" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
        {erro && <p className="ce-erro" role="alert">{erro}</p>}
        <div className="ce-compor-linha">
          <textarea ref={campo} rows={1} value={texto} maxLength={LIMITE_TEXTO} onChange={(e) => mudarTexto(e.target.value)} onKeyDown={aoTeclar}
            placeholder={grupo ? `Mensagem para o grupo ${nome}` : `Mensagem para ${nome}`} aria-label="Escrever mensagem" />
          <button type="submit" className="ce-enviar" disabled={!texto.trim()} aria-label="Enviar mensagem" title="Enviar (Enter)"><IcEnviar /></button>
        </div>
        <p className="ce-dica">
          <span>Enter envia · Shift+Enter pula linha</span>
          {texto.length > LIMITE_TEXTO - 500 && <span className="num">{texto.length.toLocaleString('pt-BR')}/{LIMITE_TEXTO.toLocaleString('pt-BR')}</span>}
        </p>
      </form>
    </div>
  );
}

/** o texto da mensagem; link de conversa de cliente vira o cartão "Conversa com …" */
function TextoMsg({ msg, nomes, aoAbrir }: { msg: MsgChat; nomes: Record<string, string>; aoAbrir: (id: string) => void }) {
  const partes = partesDoTexto(msg.texto);
  const temCartao = partes.some((p) => p.tipo === 'conversa');
  return (
    <span className="ce-texto">
      {partes.map((p, i) => {
        if (p.tipo === 'conversa') {
          const cliente = nomes[p.id];
          return (
            <button key={i} type="button" className="ce-cartao" onClick={() => aoAbrir(p.id)} title="Abrir a conversa no WhatsApp">
              <span className="ce-cartao-ic"><IcConversa /></span>
              <span className="ce-cartao-txt">
                <b>{cliente ? `Conversa com ${cliente}` : 'Conversa de cliente'}</b>
                <small>Abrir no WhatsApp</small>
              </span>
            </button>
          );
        }
        const v = temCartao ? p.texto.trim() : p.texto;
        return v ? <span key={i}>{v}</span> : null;
      })}
    </span>
  );
}

/* ---------------- nova conversa: uma pessoa = a dois; várias + um nome = grupo ---------------- */
function NovaConversa({ aberto, aoFechar, aoAbrir }: { aberto: boolean; aoFechar: () => void; aoAbrir: (salaId: string) => void }) {
  const colegasQ = useColegasChat(aberto);
  const abrirDireta = useAbrirDireta();
  const criarGrupo = useCriarGrupo();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setQ(''); setSel([]); setNomeGrupo(''); setErro(null); } }, [aberto]);

  const colegas = colegasQ.data ?? [];
  const semAc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visiveis = colegas.filter((c) => semAc(c.nome).includes(semAc(q.trim())));
  const grupo = sel.length > 1;
  const ocupado = abrirDireta.isPending || criarGrupo.isPending;
  const pronto = sel.length === 1 || (grupo && nomeGrupo.trim().length > 0);
  const alternar = (id: string) => { setErro(null); setSel((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); };
  const confirmar = () => {
    if (!pronto || ocupado) { if (grupo && !nomeGrupo.trim()) setErro('Dê um nome ao grupo.'); return; }
    const fim = { onSuccess: (id: string) => aoAbrir(id), onError: (e: unknown) => setErro(traduzErroChat(e)) };
    if (sel.length === 1) abrirDireta.mutate(sel[0], fim);
    else criarGrupo.mutate({ nome: nomeGrupo, membros: sel }, fim);
  };

  return (
    <ModalV2 aberto={aberto} aoFechar={aoFechar} titulo="Nova conversa" largura={440}
      rodape={<>
        <BotaoSec onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario onClick={confirmar} disabled={!sel.length || ocupado}>
          {ocupado ? 'Abrindo…' : grupo ? `Criar grupo com ${sel.length + 1} pessoas` : 'Abrir conversa'}
        </BotaoPrimario>
      </>}>
      <div className="ce-nova" data-chat-nova>
        <p className="ce-nova-dica">Escolha uma pessoa para conversar a sós, ou várias para criar um grupo.</p>
        <input className="inp" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colega" aria-label="Buscar colega" />
        {colegasQ.isError ? <p className="ce-erro">Não foi possível carregar a equipe agora.</p>
          : colegasQ.isPending ? <div className="ce-carregando"><Skeleton altura={36} /><Skeleton altura={36} /></div>
          : !visiveis.length ? <p className="ce-nada">{colegas.length ? 'Ninguém com esse nome.' : 'Ainda não há colegas no Atendimento.'}</p>
          : (
            <ul className="ce-pessoas">
              {visiveis.map((c) => {
                const marcado = sel.includes(c.id);
                return (
                  <li key={c.id}>
                    <button type="button" role="checkbox" aria-checked={marcado} className={marcado ? 'on' : ''} onClick={() => alternar(c.id)}>
                      <Avatar nome={c.nome} pequeno />
                      <span className="ce-pessoa-nome">{c.nome}</span>
                      <span className="ce-marca" aria-hidden>{marcado && <IcCheck />}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        {grupo && (
          <label className="ce-nova-nome">
            <span>Nome do grupo</span>
            <input className="inp" value={nomeGrupo} maxLength={80} onChange={(e) => { setNomeGrupo(e.target.value); setErro(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } }} placeholder="Ex.: Comercial" />
          </label>
        )}
        {erro && <p className="ce-erro" role="alert">{erro}</p>}
      </div>
    </ModalV2>
  );
}
