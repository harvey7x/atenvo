import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBuscaContatos } from '@/data/contatos';
import {
  PRES_REAL, diaSP, diaTxt, horaTxt, instanteSP, textoPresencial, usePresenciais, useMarcarPresencial,
  useRemarcarPresencial, useDesmarcarPresencial, type Presencial, type StatusAviso,
} from '@/data/presenciais';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardCab, CardVidro, ConfirmDialogV2, EstadoErro, EstadoVazio,
  Input, ModalV2, Skeleton, type TomStatus,
} from '../components';
import './presenciais.css';

/* ------------------------------------------------------------------
   Presenciais (pedido do dono 29/10): calendário dos atendimentos
   presenciais. Marcar → mensagem no grupo DOCUMENTOS CLIENTES CAF + card em
   "Reunião Marcada"; no dia, às 8h, o lembrete. Remarcar e desmarcar também
   avisam. Os textos vêm do banco; a prévia daqui usa a mesma regra.
   ------------------------------------------------------------------ */

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const HORAS = Array.from({ length: (20 - 7) * 4 + 1 }, (_, i) => {
  const min = 7 * 60 + i * 15;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
});

const AVISO: Record<string, { rotulo: string; tom: TomStatus }> = {
  pendente: { rotulo: 'Avisando o grupo…', tom: 'atencao' },
  enviando: { rotulo: 'Avisando o grupo…', tom: 'atencao' },
  enviado: { rotulo: 'Grupo avisado', tom: 'ok' },
  incerto: { rotulo: 'Aviso pode não ter saído', tom: 'atencao' },
  falhou: { rotulo: 'Aviso não saiu', tom: 'erro' },
  bloqueado: { rotulo: 'Sem aviso no grupo', tom: 'neutro' },
};

const hojeSP = () => diaSP(new Date().toISOString());
const addDia = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
/** Grade do mês: começa no domingo antes do dia 1 e cobre 6 semanas. */
function grade(mes: string): string[] {
  const um = `${mes}-01`;
  const ini = addDia(um, -new Date(`${um}T12:00:00Z`).getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDia(ini, i));
}
const tituloDia = (dia: string) => {
  const t = diaTxt(`${dia}T15:00:00Z`);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- modo demonstração ---------- */
const CLIENTES_DEMO = [
  { id: 'demo-c1', nome: 'Hernani da Silva', telefone: '5551999990001' },
  { id: 'demo-c2', nome: 'Maria Souza', telefone: '5551999990002' },
  { id: 'demo-c3', nome: 'Dorvalino Severo', telefone: '5551999990003' },
  { id: 'demo-c4', nome: 'Rosangela Pereira', telefone: '5551999990004' },
];
function seedDemo(): Presencial[] {
  const hoje = hojeSP();
  const mk = (i: number, dia: string, hora: string, por: string, aviso: StatusAviso, status: Presencial['status'] = 'marcado'): Presencial => ({
    id: `demo-p${i}`, contatoId: CLIENTES_DEMO[i % 4].id, clienteNome: CLIENTES_DEMO[i % 4].nome, telefone: CLIENTES_DEMO[i % 4].telefone,
    quando: instanteSP(dia, hora), observacao: i === 0 ? 'Traz os extratos do banco' : null, status, marcadoPor: por, conversaId: null, aviso,
  });
  return [
    mk(0, hoje, '14:00', 'Isadora', 'enviado'),
    mk(1, hoje, '16:30', 'Juliana', 'enviado'),
    mk(2, addDia(hoje, 2), '10:00', 'Matheus', 'enviado'),
    mk(3, addDia(hoje, 5), '09:30', 'Isadora', 'enviado', 'desmarcado'),
  ];
}

type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;

export default function Presenciais() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demo = !PRES_REAL;
  const eu = user?.name?.trim() || 'Você';
  const hoje = hojeSP();

  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [diaSel, setDiaSel] = useState(hoje);
  const dias = useMemo(() => grade(mes), [mes]);
  const iniISO = instanteSP(dias[0], '00:00');
  const fimISO = instanteSP(addDia(dias[41], 1), '00:00');

  const q = usePresenciais(iniISO, fimISO);
  const [seed, setSeed] = useState<Presencial[]>(seedDemo);
  const lista = demo ? seed : (q.data ?? []);
  const porDia = useMemo(() => {
    const m = new Map<string, Presencial[]>();
    for (const p of lista) { const d = diaSP(p.quando); m.set(d, [...(m.get(d) ?? []), p]); }
    for (const v of m.values()) v.sort((a, b) => a.quando.localeCompare(b.quando));
    return m;
  }, [lista]);
  const doDia = porDia.get(diaSel) ?? [];

  const marcar = useMarcarPresencial();
  const remarcar = useRemarcarPresencial();
  const desmarcar = useDesmarcarPresencial();
  const [aviso, setAviso] = useState<Aviso>(null);

  /* ---- marcar ---- */
  const [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState('');
  const [cliente, setCliente] = useState<{ id: string; nome: string; telefone: string | null } | null>(null);
  const [dia, setDia] = useState(hoje);
  const [hora, setHora] = useState('14:00');
  const [obs, setObs] = useState('');
  const [erroModal, setErroModal] = useState<string | null>(null);
  const buscaQ = useBuscaContatos(busca);
  const achados = demo
    ? (busca.trim().length >= 2 ? CLIENTES_DEMO.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase())) : [])
    : (buscaQ.data ?? []).map((c) => ({ id: c.id, nome: c.nome || c.tel || 'Cliente', telefone: c.tel || null }));

  function abrirNovo(diaInicial = diaSel) {
    setNovo(true); setBusca(''); setCliente(null); setDia(diaInicial < hoje ? hoje : diaInicial); setHora('14:00'); setObs(''); setErroModal(null);
  }
  async function confirmarNovo() {
    if (!cliente) { setErroModal('Escolha o cliente.'); return; }
    const quando = instanteSP(dia, hora);
    if (new Date(quando).getTime() < Date.now()) { setErroModal('Escolha um dia e horário que ainda não passaram.'); return; }
    try {
      if (demo) {
        if (seed.some((p) => p.contatoId === cliente.id && p.status === 'marcado' && p.quando >= new Date().toISOString())) {
          throw new Error('Este cliente já tem um presencial marcado. Use "Remarcar" nele.');
        }
        setSeed((s) => [...s, { id: `demo-${Date.now()}`, contatoId: cliente.id, clienteNome: cliente.nome, telefone: cliente.telefone, quando, observacao: obs || null, status: 'marcado', marcadoPor: eu, conversaId: null, aviso: 'enviado' }]);
      } else {
        await marcar.mutateAsync({ contatoId: cliente.id, quando, observacao: obs });
      }
      setNovo(false); setDiaSel(dia); setMes(dia.slice(0, 7));
      setAviso({ tom: 'ok', texto: `Presencial de ${cliente.nome} marcado. O grupo recebe o aviso em instantes.` });
    } catch (e) {
      setErroModal((e as Error).message);
    }
  }

  /* ---- remarcar / desmarcar ---- */
  const [remarcando, setRemarcando] = useState<Presencial | null>(null);
  const [rDia, setRDia] = useState(hoje);
  const [rHora, setRHora] = useState('14:00');
  const [erroR, setErroR] = useState<string | null>(null);
  const [desmarcando, setDesmarcando] = useState<Presencial | null>(null);

  function abrirRemarcar(p: Presencial) {
    setRemarcando(p); setRDia(diaSP(p.quando)); setRHora(horaTxt(p.quando).replace(/h$/, ':00').replace('h', ':').padStart(5, '0')); setErroR(null);
  }
  async function confirmarRemarcar() {
    if (!remarcando) return;
    const quando = instanteSP(rDia, rHora);
    if (new Date(quando).getTime() < Date.now()) { setErroR('Escolha um dia e horário que ainda não passaram.'); return; }
    try {
      if (demo) setSeed((s) => s.map((p) => p.id === remarcando.id ? { ...p, quando } : p));
      else await remarcar.mutateAsync({ id: remarcando.id, quando });
      setAviso({ tom: 'ok', texto: `Presencial de ${remarcando.clienteNome} remarcado. O grupo recebe o aviso em instantes.` });
      setRemarcando(null); setDiaSel(rDia); setMes(rDia.slice(0, 7));
    } catch (e) {
      setErroR((e as Error).message);
    }
  }
  async function confirmarDesmarcar() {
    if (!desmarcando) return;
    try {
      if (demo) setSeed((s) => s.map((p) => p.id === desmarcando.id ? { ...p, status: 'desmarcado' } : p));
      else await desmarcar.mutateAsync(desmarcando.id);
      setAviso({ tom: 'ok', texto: `Presencial de ${desmarcando.clienteNome} desmarcado.` });
    } catch (e) {
      setAviso({ tom: 'erro', texto: (e as Error).message });
    }
    setDesmarcando(null);
  }

  const [a, m] = mes.split('-').map(Number);
  const mudarMes = (n: number) => { const d = new Date(Date.UTC(a, m - 1 + n, 1)); setMes(d.toISOString().slice(0, 7)); };
  const futuro = (p: Presencial) => p.status === 'marcado' && new Date(p.quando).getTime() > Date.now();

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Presenciais</h2>
          <p>Atendimentos presenciais marcados. Ao marcar, o grupo DOCUMENTOS CLIENTES CAF é avisado; no dia, às 8h, sai o lembrete.{demo ? ' · modo demonstração (nada é enviado)' : ''}</p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => abrirNovo()}>＋ Marcar presencial</BotaoPrimario>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {!demo && q.isError ? (
        <CardVidro sobe><EstadoErro descricao="Houve uma falha ao buscar os presenciais." aoTentarDeNovo={() => q.refetch()} /></CardVidro>
      ) : (
        <div className="pr-grade sobe" style={{ animationDelay: '.06s' }}>
          <CardVidro spot className="pr-cal">
            <div className="pr-cal-cab">
              <BotaoMini onClick={() => mudarMes(-1)} aria-label="Mês anterior">‹</BotaoMini>
              <h3>{MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} de {a}</h3>
              <BotaoMini onClick={() => mudarMes(1)} aria-label="Próximo mês">›</BotaoMini>
              <BotaoMini className="pr-hoje" onClick={() => { setMes(hoje.slice(0, 7)); setDiaSel(hoje); }}>Hoje</BotaoMini>
            </div>
            <div className="pr-semana">{SEMANA.map((s) => <span key={s}>{s}</span>)}</div>
            <div className="pr-dias" role="grid" aria-label="Calendário">
              {dias.map((d) => {
                const marcados = (porDia.get(d) ?? []).filter((p) => p.status === 'marcado').length;
                const cls = ['pr-dia', d.slice(0, 7) !== mes ? 'fora' : '', d === hoje ? 'hoje' : '', d === diaSel ? 'sel' : '', marcados ? 'tem' : ''].filter(Boolean).join(' ');
                return (
                  <button key={d} type="button" className={cls} onClick={() => setDiaSel(d)} onDoubleClick={() => abrirNovo(d)}
                    aria-label={`${tituloDia(d)}${marcados ? `, ${marcados} presencial${marcados > 1 ? 'is' : ''}` : ''}`} aria-pressed={d === diaSel}>
                    <span className="num">{Number(d.slice(8))}</span>
                    {marcados > 0 && <em className="num">{marcados}</em>}
                  </button>
                );
              })}
            </div>
          </CardVidro>

          <CardVidro className="pr-dia-lista">
            <CardCab titulo={diaSel === hoje ? `Hoje · ${tituloDia(diaSel)}` : tituloDia(diaSel)} contador={doDia.filter((p) => p.status === 'marcado').length} />
            {!demo && q.isLoading ? (
              <div style={{ padding: '6px 2px' }}><Skeleton largura="70%" /><Skeleton largura="50%" /></div>
            ) : doDia.length === 0 ? (
              <EstadoVazio titulo="Nenhum presencial neste dia"
                descricao="Marque um atendimento presencial e o grupo é avisado na hora."
                acao={diaSel >= hoje ? { rotulo: '＋ Marcar neste dia', onClick: () => abrirNovo(diaSel) } : undefined} />
            ) : (
              <ul className="pr-itens">
                {doDia.map((p) => {
                  const av = p.aviso ? AVISO[p.aviso] : null;
                  return (
                    <li key={p.id} className={p.status === 'desmarcado' ? 'desmarcado' : ''}>
                      <div className="pr-hora num">{horaTxt(p.quando)}</div>
                      <div className="pr-info">
                        <div className="nm">{p.clienteNome}</div>
                        <div className="sub">marcado por {p.marcadoPor ?? 'equipe'}{p.telefone ? ` · ${p.telefone}` : ''}</div>
                        {p.observacao && <div className="obs">{p.observacao}</div>}
                        <div className="pr-selos">
                          {p.status === 'desmarcado' ? <BadgeStatus tom="neutro">Desmarcado</BadgeStatus> : null}
                          {av && <BadgeStatus tom={av.tom}>{av.rotulo}</BadgeStatus>}
                        </div>
                      </div>
                      <div className="pr-acoes">
                        {p.conversaId && <BotaoMini onClick={() => navigate(`/whatsapp?conversa=${p.conversaId}`)}>Conversa</BotaoMini>}
                        {futuro(p) && <BotaoMini onClick={() => abrirRemarcar(p)}>Remarcar</BotaoMini>}
                        {futuro(p) && <BotaoMini onClick={() => setDesmarcando(p)}>Desmarcar</BotaoMini>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardVidro>
        </div>
      )}

      <ModalV2 aberto={novo} aoFechar={() => setNovo(false)} titulo="Marcar presencial" largura={480}
        rodape={<>
          <BotaoSec onClick={() => setNovo(false)}>Cancelar</BotaoSec>
          <BotaoPrimario onClick={confirmarNovo} disabled={marcar.isPending || !cliente}>{marcar.isPending ? 'Marcando…' : 'Marcar e avisar o grupo'}</BotaoPrimario>
        </>}>
        <div className="pr-form">
          <label className="pr-rot">Cliente</label>
          {cliente ? (
            <div className="pr-cliente">
              <span className="nm">{cliente.nome}</span>{cliente.telefone && <span className="tel num">{cliente.telefone}</span>}
              <BotaoMini onClick={() => { setCliente(null); setBusca(''); }}>Trocar</BotaoMini>
            </div>
          ) : (
            <>
              <Input autoFocus placeholder="Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
              {busca.trim().length >= 2 && (
                <ul className="pr-achados">
                  {achados.length === 0
                    ? <li className="vazio">{!demo && buscaQ.isFetching ? 'Buscando…' : 'Nenhum cliente encontrado.'}</li>
                    : achados.map((c) => (
                      <li key={c.id}><button type="button" onClick={() => setCliente(c)}>
                        <span className="nm">{c.nome}</span>{c.telefone && <span className="tel num">{c.telefone}</span>}
                      </button></li>
                    ))}
                </ul>
              )}
            </>
          )}
          <div className="pr-linha">
            <div><label className="pr-rot" htmlFor="pr-dia">Dia</label><Input id="pr-dia" type="date" min={hoje} value={dia} onChange={(e) => setDia(e.target.value)} /></div>
            <div><label className="pr-rot" htmlFor="pr-hora">Horário</label>
              <select id="pr-hora" className="inp" value={hora} onChange={(e) => setHora(e.target.value)}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
          <label className="pr-rot" htmlFor="pr-obs">Observação (só aqui no sistema)</label>
          <textarea id="pr-obs" className="inp" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: trazer os extratos do banco" />
          {cliente && (
            <>
              <label className="pr-rot">Mensagem que vai para o grupo</label>
              <pre className="pr-previa">{textoPresencial('marcado', cliente.nome, instanteSP(dia, hora), eu)}</pre>
            </>
          )}
          {erroModal && <div className="aviso-inline erro" role="alert">{erroModal}</div>}
        </div>
      </ModalV2>

      <ModalV2 aberto={!!remarcando} aoFechar={() => setRemarcando(null)} titulo="Remarcar presencial" largura={440}
        rodape={<>
          <BotaoSec onClick={() => setRemarcando(null)}>Cancelar</BotaoSec>
          <BotaoPrimario onClick={confirmarRemarcar} disabled={remarcar.isPending}>{remarcar.isPending ? 'Remarcando…' : 'Remarcar e avisar o grupo'}</BotaoPrimario>
        </>}>
        {remarcando && (
          <div className="pr-form">
            <div className="pr-cliente"><span className="nm">{remarcando.clienteNome}</span><span className="tel">hoje marcado para {diaTxt(remarcando.quando)}, às {horaTxt(remarcando.quando)}</span></div>
            <div className="pr-linha">
              <div><label className="pr-rot" htmlFor="pr-rdia">Novo dia</label><Input id="pr-rdia" type="date" min={hoje} value={rDia} onChange={(e) => setRDia(e.target.value)} /></div>
              <div><label className="pr-rot" htmlFor="pr-rhora">Novo horário</label>
                <select id="pr-rhora" className="inp" value={rHora} onChange={(e) => setRHora(e.target.value)}>
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <label className="pr-rot">Mensagem que vai para o grupo</label>
            <pre className="pr-previa">{textoPresencial('remarcado', remarcando.clienteNome, instanteSP(rDia, rHora), eu)}</pre>
            {erroR && <div className="aviso-inline erro" role="alert">{erroR}</div>}
          </div>
        )}
      </ModalV2>

      <ConfirmDialogV2
        aberto={!!desmarcando}
        titulo="Desmarcar presencial?"
        mensagem={desmarcando ? `O grupo recebe: "${textoPresencial('desmarcado', desmarcando.clienteNome, desmarcando.quando, eu).replace(/\n/g, ' ')}"` : ''}
        rotuloConfirmar="Desmarcar e avisar o grupo"
        destrutivo
        carregando={desmarcar.isPending}
        aoConfirmar={confirmarDesmarcar}
        aoCancelar={() => setDesmarcando(null)}
      />
    </>
  );
}
