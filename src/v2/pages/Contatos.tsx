import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import {
  useContatos, useCreateContato, useUpdateContato, useDeleteContato,
  telefoneValido, emailValido, type ContatoRow, type NovoContato,
} from '@/data/contatos';
import { WA_REAL, useAgendamentosOrg, conversaAtivaDoContato } from '@/data/whatsapp';
import { useCobrancas } from '@/data/cobrancas';
import { useOportunidadesDoContato, type OppDoContato } from '@/data/kanban';
import { useAtivacaoDoContato, useBloquear, useDesbloquear } from '@/data/relacionamento';
import { useEtiquetas, useOrgUsuarios } from '@/data/atendimento';
import { formatarNumero } from '@/data/maturacao';
import { useBloqueiosOrg } from '../hooks/bloqueiosOrg';
import { tempoCelula, tempoRelativo } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips, ConfirmDialogV2,
  DrawerV2, EstadoErro, EstadoVazio, Input, ModalV2, Skeleton, TabelaPadrao,
  type Coluna, type TomStatus,
} from '../components';
import './contatos.css';

/* ------------------------------------------------------------------
   Contatos v2 — página NOVA (sem rota v1; verdade visual = pg-contatos,
   verdade funcional = o que a camada já oferece). Lista completa da org
   (src/data/contatos.ts) com filtros/paginação client-side; coluna de
   cobrança e ficha agregam SOMENTE hooks existentes (useCobrancas,
   useAgendamentosOrg, useOportunidadesDoContato, useAtivacaoDoContato)
   + hook-espelho declarado useBloqueiosOrg (opt-out em 1ª classe).
   Sem bulk de mensagem/etapa (sem sustentação — precedente Cobranças:
   bulk é Exportar CSV client-side).
   ------------------------------------------------------------------ */

const POR_PAGINA = 25;
const ST_TOM: Record<string, TomStatus> = { Cliente: 'ok', Negociando: 'atencao', Lead: 'neutro', Inativo: 'neutro' };
const STATUS_OPCOES = ['Cliente', 'Lead', 'Negociando', 'Inativo'];
type Aviso = { tom: 'ok' | 'erro'; texto: string } | null;
type CobSituacao = 'vencida' | 'em_dia';

const iniciais = (n: string) => { const p = (n || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'; };
const fmtTel = (t: string) => (/^\d{12,13}$/.test(t.replace(/\D/g, '')) ? formatarNumero(t.replace(/\D/g, '')) : (t || '—'));

/* ---------- extras do modo demonstração (a lista em si vem do mock da camada) ---------- */
interface ExtrasDemo {
  bloqueados: Set<string>;
  cob: Map<string, CobSituacao>;
  conversas: Map<string, string>;
  opps: Map<string, OppDoContato[]>;
  ags: { contatoId: string; texto: string; executarEm: string; status: string }[];
  ativ: Map<string, { reguaNome: string; status: string; proximoEm: string | null }>;
}
function seedExtras(): ExtrasDemo {
  const h = 3_600_000; const agora = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const opp = (n: Partial<OppDoContato>): OppDoContato => ({
    id: 'op-' + Math.random().toString(36).slice(2), status: 'em_andamento', aberta: true, funilId: 'f1',
    funilNome: 'Funil comercial', colunaNome: 'Documentação', respNome: 'Henrique', tipoServico: 'Revisão de contrato',
    tipoBeneficio: null, valor: null, valorDescontoMensal: null, valorRessarcimentoEstimado: null, valorRessarcido: null,
    origem: 'whatsapp', criadoEm: iso(agora - 96 * h), atualizadoEm: iso(agora - 5 * h), ...n,
  });
  return {
    bloqueados: new Set(['m6']),
    cob: new Map([['m1', 'em_dia'], ['m3', 'vencida'], ['m8', 'vencida'], ['m4', 'em_dia']]),
    conversas: new Map([['m1', 'cv-demo-1'], ['m2', 'cv-demo-2'], ['m5', 'cv-demo-5'], ['m6', 'cv-demo-6']]),
    opps: new Map([
      ['m3', [opp({ colunaNome: 'Documentação' })]],
      ['m8', [opp({ colunaNome: 'Em negociação', tipoServico: 'Juros abusivos' })]],
      ['m1', [opp({ status: 'ganho', aberta: false, colunaNome: 'Fechado', atualizadoEm: iso(agora - 400 * h) })]],
    ]),
    ags: [
      { contatoId: 'm1', texto: 'Oi Ana! Passando para confirmar nosso retorno de amanhã.', executarEm: iso(agora + 26 * h), status: 'agendada' },
      { contatoId: 'm5', texto: 'Juliana, os documentos chegaram — te atualizo em seguida.', executarEm: iso(agora + 3 * h), status: 'agendada' },
    ],
    ativ: new Map([['m1', { reguaNome: 'Pós-venda · 30 dias', status: 'ativa', proximoEm: iso(agora + 48 * h) }]]),
  };
}

export default function ContatosV2() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const demo = !WA_REAL;

  const contatosQ = useContatos();
  const criar = useCreateContato();
  const atualizar = useUpdateContato();
  const excluirMut = useDeleteContato();
  const cobrancasQ = useCobrancas();
  const agsQ = useAgendamentosOrg();
  const bloqueiosQ = useBloqueiosOrg();
  const bloquear = useBloquear();
  const desbloquear = useDesbloquear();

  const [extras, setExtras] = useState<ExtrasDemo | null>(() => (demo ? seedExtras() : null));
  const [aviso, setAviso] = useState<Aviso>(null);

  const contatos = useMemo(() => contatosQ.data ?? [], [contatosQ.data]);
  const bloqueados = demo ? extras?.bloqueados ?? new Set<string>() : bloqueiosQ.data ?? new Set<string>();

  // situação de cobrança por contato — agregação client-side de useCobrancas (hook existente):
  // alguma cobrança ativa com próxima cobrança no passado → Vencida; alguma ativa → Em dia; senão —.
  const cobPorContato = useMemo(() => {
    if (demo) return extras?.cob ?? new Map<string, CobSituacao>();
    const hoje = new Date().toISOString().slice(0, 10);
    const m = new Map<string, CobSituacao>();
    for (const c of cobrancasQ.data ?? []) {
      if (c.status !== 'ativa') continue;
      const vencida = !!c.proximaCobranca && c.proximaCobranca.slice(0, 10) < hoje;
      const atual = m.get(c.contatoId);
      if (vencida || atual !== 'vencida') m.set(c.contatoId, vencida ? 'vencida' : (atual ?? 'em_dia'));
    }
    return m;
  }, [demo, extras?.cob, cobrancasQ.data]);

  /* ---- filtros (client-side: a camada traz a lista inteira da org) ---- */
  const [buscaRaw, setBuscaRaw] = useState('');
  const [busca, setBusca] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusca(buscaRaw.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [buscaRaw]);
  const [st, setSt] = useState('all');
  const [origem, setOrigem] = useState('');
  const [consultor, setConsultor] = useState('');
  const [soVencidas, setSoVencidas] = useState(false);
  const [soOptout, setSoOptout] = useState(false);

  const origens = useMemo(() => Array.from(new Set(contatos.map((c) => c.org).filter((o) => o && o !== '—'))).sort(), [contatos]);
  const consultores = useMemo(() => Array.from(new Set(contatos.map((c) => c.resp).filter((r) => r && r !== '—'))).sort(), [contatos]);

  const lista = useMemo(() => contatos.filter((c) => {
    if (st !== 'all' && c.st !== st) return false;
    if (origem && c.org !== origem) return false;
    if (consultor && c.resp !== consultor) return false;
    if (soVencidas && cobPorContato.get(c.id) !== 'vencida') return false;
    if (soOptout && !bloqueados.has(c.id)) return false;
    if (busca) {
      const alvo = `${c.nome} ${c.email} ${c.tel}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  }), [contatos, st, origem, consultor, soVencidas, soOptout, busca, cobPorContato, bloqueados]);

  function limpar() { setBuscaRaw(''); setBusca(''); setSt('all'); setOrigem(''); setConsultor(''); setSoVencidas(false); setSoOptout(false); }
  const filtrando = busca !== '' || st !== 'all' || origem !== '' || consultor !== '' || soVencidas || soOptout;

  /* ---- paginação client-side ---- */
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaVisivel = Math.min(pagina, totalPaginas);
  useEffect(() => { setPagina(1); }, [busca, st, origem, consultor, soVencidas, soOptout]);
  const paginaLinhas = lista.slice((paginaVisivel - 1) * POR_PAGINA, paginaVisivel * POR_PAGINA);

  /* ---- seleção + bulk (Exportar CSV client-side — precedente Cobranças) ---- */
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  function alternarSel(id: string) { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function exportarCsv(ids: string[]) {
    const alvo = contatos.filter((c) => ids.includes(c.id));
    const esc = (v: string) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const linhas = [
      ['nome', 'telefone', 'email', 'cpf', 'origem', 'responsavel', 'status', 'etiquetas', 'nao_incomodar'].join(';'),
      ...alvo.map((c) => [esc(c.nome), esc(c.tel), esc(c.email), esc(c.cpf ?? ''), esc(c.org), esc(c.resp), esc(c.st), esc(c.tags.join(', ')), bloqueados.has(c.id) ? 'sim' : 'nao'].join(';')),
    ];
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setAviso({ tom: 'ok', texto: `${alvo.length} contato${alvo.length === 1 ? '' : 's'} exportado${alvo.length === 1 ? '' : 's'} em CSV.` });
    setSel(new Set());
  }

  /* ---- ficha / modais ---- */
  const [detId, setDetId] = useState<string | null>(null);
  const det = contatos.find((c) => c.id === detId) ?? null;
  const [form, setForm] = useState<{ modo: 'novo' | 'editar'; alvo?: ContatoRow } | null>(null);
  const [excluir, setExcluir] = useState<ContatoRow | null>(null);
  const [busyExcluir, setBusyExcluir] = useState(false);

  async function confirmarExclusao() {
    if (!excluir) return;
    setBusyExcluir(true);
    try {
      await excluirMut.mutateAsync(excluir.id);
      if (detId === excluir.id) setDetId(null);
      setAviso({ tom: 'ok', texto: 'Contato excluído.' });
      setExcluir(null);
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha ao excluir.' }); }
    finally { setBusyExcluir(false); }
  }

  async function abrirConversa(c: ContatoRow) {
    if (demo) {
      const cv = extras?.conversas.get(c.id);
      if (cv) navigate(`/whatsapp?conversa=${encodeURIComponent(cv)}`);
      else setAviso({ tom: 'erro', texto: 'Este contato não tem conversa ativa.' });
      return;
    }
    try {
      const cv = await conversaAtivaDoContato(currentOrg.id, c.id);
      if (cv) navigate(`/whatsapp?conversa=${encodeURIComponent(cv.id)}`);
      else setAviso({ tom: 'erro', texto: 'Este contato não tem conversa ativa.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha ao localizar a conversa.' }); }
  }

  async function alternarBloqueio(c: ContatoRow, bloquearAgora: boolean) {
    try {
      if (demo) {
        setExtras((x) => {
          if (!x) return x;
          const n = new Set(x.bloqueados);
          if (bloquearAgora) n.add(c.id); else n.delete(c.id);
          return { ...x, bloqueados: n };
        });
      } else if (bloquearAgora) {
        await bloquear.mutateAsync({ contatoId: c.id, motivo: 'optout manual' });
      } else {
        await desbloquear.mutateAsync(c.id);
      }
      setAviso({ tom: 'ok', texto: bloquearAgora ? 'Contato marcado como não incomodar. Nenhuma mensagem será enviada.' : 'Bloqueio removido. O contato volta a poder receber mensagens.' });
    } catch (e) { setAviso({ tom: 'erro', texto: (e as Error).message || 'Falha na operação.' }); }
  }

  const clientes = contatos.filter((c) => c.st === 'Cliente').length;
  const carregando = contatosQ.isLoading;

  const COLUNAS: Coluna<ContatoRow>[] = [
    {
      chave: 'nome', titulo: 'Nome', render: (c) => (
        <div className="cnt-nome">
          <span className="nm">
            {c.nome}
            {bloqueados.has(c.id) && <BadgeStatus tom="erro">Não incomodar</BadgeStatus>}
          </span>
          {c.email && <span className="em">{c.email}</span>}
        </div>
      ),
    },
    { chave: 'tel', titulo: 'Telefone', render: (c) => <span className="num">{fmtTel(c.tel)}</span> },
    { chave: 'st', titulo: 'Status', render: (c) => <BadgeStatus tom={ST_TOM[c.st] ?? 'neutro'}>{c.st}</BadgeStatus> },
    { chave: 'resp', titulo: 'Consultor', render: (c) => c.resp === '—' ? <span style={{ color: 'var(--txt-3)' }}>—</span> : c.resp },
    {
      chave: 'ult', titulo: 'Último contato', render: (c) => {
        if (!c.atualizadoEm) return <span className="num" style={{ color: 'var(--txt-3)' }}>{c.ult}</span>;
        const t = tempoCelula(c.atualizadoEm, Date.now());
        return <span className="num" style={{ whiteSpace: 'nowrap' }}>{t.principal}<span style={{ display: 'block', fontSize: 10, color: 'var(--txt-3)' }}>{t.apoio}</span></span>;
      },
    },
    {
      chave: 'cob', titulo: 'Cobrança', render: (c) => {
        const s = cobPorContato.get(c.id);
        return s === 'vencida' ? <BadgeStatus tom="erro">Vencida</BadgeStatus>
          : s === 'em_dia' ? <BadgeStatus tom="ok">Em dia</BadgeStatus>
          : <span style={{ color: 'var(--txt-3)' }}>—</span>;
      },
    },
  ];

  return (
    <>
      <div className="ph sobe">
        <div>
          <h2>Contatos</h2>
          <p className="num">
            {carregando ? 'Carregando…' : `${contatos.length.toLocaleString('pt-BR')} contato${contatos.length === 1 ? '' : 's'} · ${clientes} cliente${clientes === 1 ? '' : 's'}`}
            {demo ? ' · modo demonstração (nada é gravado)' : ''}
          </p>
        </div>
        <div className="acoes">
          <BotaoPrimario onClick={() => setForm({ modo: 'novo' })}>＋ Novo contato</BotaoPrimario>
        </div>
      </div>

      {aviso && (
        <div className={aviso.tom === 'erro' ? 'aviso-inline erro' : 'aviso-inline'} role="status">
          {aviso.texto}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {contatosQ.isError ? (
        <CardVidro sobe>
          <EstadoErro descricao="Erro ao carregar os contatos. Verifique a conexão." aoTentarDeNovo={() => contatosQ.refetch()} />
        </CardVidro>
      ) : carregando ? (
        <CardVidro sobe style={{ borderRadius: 12, padding: '14px 16px' }} aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '9px 0' }}>
              <Skeleton largura="26%" /><Skeleton largura="16%" /><Skeleton largura="12%" raio={99} /><Skeleton largura="14%" /><Skeleton largura="10%" raio={99} />
            </div>
          ))}
        </CardVidro>
      ) : contatos.length === 0 ? (
        <CardVidro sobe style={{ borderRadius: 12 }}>
          <EstadoVazio
            titulo="Nenhum contato ainda"
            descricao="Os contatos nascem sozinhos quando alguém chama nos canais — ou crie o primeiro à mão."
            acao={{ rotulo: '＋ Criar primeiro contato', onClick: () => setForm({ modo: 'novo' }) }}
          />
        </CardVidro>
      ) : (
        <>
          <div className="cnt-filtros sobe" style={{ animationDelay: '.06s' }}>
            <div className="cnt-busca">
              <Input placeholder="Buscar por nome, e-mail ou telefone…" value={buscaRaw} onChange={(e) => setBuscaRaw(e.target.value)} aria-label="Buscar contatos" />
            </div>
            <Chips>
              <Chip ativo={st === 'all'} onClick={() => setSt('all')}>Todos {contatos.length}</Chip>
              {STATUS_OPCOES.map((s) => (
                <Chip key={s} ativo={st === s} onClick={() => setSt(st === s ? 'all' : s)}>{s} {contatos.filter((c) => c.st === s).length}</Chip>
              ))}
            </Chips>
            <select className="inp cnt-sel" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Filtrar por origem">
              <option value="">Origem</option>
              {origens.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="inp cnt-sel" value={consultor} onChange={(e) => setConsultor(e.target.value)} aria-label="Filtrar por consultor">
              <option value="">Consultor</option>
              {consultores.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Chip ativo={soVencidas} onClick={() => setSoVencidas((v) => !v)}>Cobrança vencida</Chip>
            <Chip ativo={soOptout} onClick={() => setSoOptout((v) => !v)}>Não incomodar</Chip>
            {filtrando && <Chip limpar onClick={limpar}>Limpar</Chip>}
          </div>

          <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.12s' }}>
            {lista.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum contato neste filtro"
                descricao="Ajuste a busca ou os filtros."
                acao={{ rotulo: 'Limpar filtros', onClick: limpar }}
              />
            ) : (
              <TabelaPadrao
                colunas={COLUNAS}
                linhas={paginaLinhas}
                chave={(c) => c.id}
                aoClicarLinha={(c) => setDetId(detId === c.id ? null : c.id)}
                selecao={{
                  selecionadas: sel,
                  aoAlternar: alternarSel,
                  aoLimpar: () => setSel(new Set()),
                  acoes: [{ rotulo: 'Exportar CSV', onClick: exportarCsv }],
                  rotuloContagem: (n) => `${n} selecionado${n === 1 ? '' : 's'}`,
                }}
                rodape={{
                  texto: `${paginaLinhas.length} de ${lista.length.toLocaleString('pt-BR')}`,
                  paginacao: { pagina: paginaVisivel, totalPaginas, aoIr: setPagina },
                }}
              />
            )}
          </CardVidro>
        </>
      )}

      {det && (
        <FichaContato
          contato={det}
          demo={demo}
          extras={extras}
          bloqueado={bloqueados.has(det.id)}
          cobSituacao={cobPorContato.get(det.id)}
          agsOrg={demo ? null : (agsQ.data ?? null)}
          aoFechar={() => setDetId(null)}
          aoAbrirConversa={() => abrirConversa(det)}
          aoAgendar={() => navigate('/agendamentos')}
          aoBloquear={(v) => alternarBloqueio(det, v)}
          aoEditar={() => setForm({ modo: 'editar', alvo: det })}
          aoExcluir={() => setExcluir(det)}
        />
      )}

      {form && (
        <ContatoModal
          modo={form.modo}
          alvo={form.alvo}
          demo={demo}
          aoFechar={() => setForm(null)}
          aoSalvar={async (dados) => {
            if (form.modo === 'novo') {
              await criar.mutateAsync(dados);
              setAviso({ tom: 'ok', texto: 'Contato criado.' });
            } else if (form.alvo) {
              await atualizar.mutateAsync({ id: form.alvo.id, nome: dados.nome, telefone: dados.telefone ?? null, email: dados.email ?? null, cpf: dados.cpf ?? null, origem: dados.origem ?? null, responsavelId: dados.responsavelId ?? null, etiquetas: dados.etiquetas, observacoes: dados.observacoes ?? null });
              setAviso({ tom: 'ok', texto: 'Contato salvo.' });
            }
            setForm(null);
          }}
        />
      )}

      <ConfirmDialogV2
        aberto={!!excluir}
        titulo="Excluir contato?"
        mensagem={excluir ? `O contato "${excluir.nome}" será excluído. Esta ação não pode ser desfeita.` : ''}
        destrutivo
        rotuloConfirmar="Excluir"
        carregando={busyExcluir}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => { if (!busyExcluir) setExcluir(null); }}
      />
    </>
  );
}

/* ===================== ficha do contato (drawer) ===================== */
function FichaContato({ contato, demo, extras, bloqueado, cobSituacao, agsOrg, aoFechar, aoAbrirConversa, aoAgendar, aoBloquear, aoEditar, aoExcluir }: {
  contato: ContatoRow; demo: boolean; extras: ExtrasDemo | null; bloqueado: boolean;
  cobSituacao: CobSituacao | undefined; agsOrg: { contatoId: string | null; texto: string | null; executarEm: string; status: string }[] | null;
  aoFechar: () => void; aoAbrirConversa: () => void; aoAgendar: () => void;
  aoBloquear: (bloquear: boolean) => void; aoEditar: () => void; aoExcluir: () => void;
}) {
  const navigate = useNavigate();
  const oppsQ = useOportunidadesDoContato(demo ? null : contato.id);
  const ativQ = useAtivacaoDoContato(demo ? null : contato.id);
  const cobrancasQ = useCobrancas();

  const opps = demo ? extras?.opps.get(contato.id) ?? [] : oppsQ.data ?? [];
  const ativ = demo
    ? extras?.ativ.get(contato.id) ?? null
    : (ativQ.data ? { reguaNome: ativQ.data.reguaNome ?? 'Régua', status: ativQ.data.status as string, proximoEm: ativQ.data.proximoEm } : null);
  const cobrancas = demo ? [] : (cobrancasQ.data ?? []).filter((c) => c.contatoId === contato.id);
  const ags = demo
    ? (extras?.ags ?? []).filter((a) => a.contatoId === contato.id)
    : (agsOrg ?? []).filter((a) => a.contatoId === contato.id && (a.status === 'agendada' || a.status === 'pausada'));

  const agora = Date.now();
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <DrawerV2 aberto aoFechar={aoFechar} largura={400}>
      <div className="cab">
        Ficha do contato
        <button type="button" className="fechar-p" aria-label="Fechar" onClick={aoFechar}>×</button>
      </div>
      <div className="corpo" style={{ padding: 0 }}>
        <div className="fx-topo">
          <div className="av2">{iniciais(contato.nome)}</div>
          <div className="n2">{contato.nome}</div>
          <div className="t2 num">{fmtTel(contato.tel)}{contato.org !== '—' ? ` · ${contato.org}` : ''}</div>
          <div style={{ marginTop: 7, display: 'flex', justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
            <BadgeStatus tom={ST_TOM[contato.st] ?? 'neutro'}>{contato.st}</BadgeStatus>
            {bloqueado && <BadgeStatus tom="erro">Não incomodar</BadgeStatus>}
            {cobSituacao === 'vencida' && <BadgeStatus tom="erro">Cobrança vencida</BadgeStatus>}
          </div>
          <div className="bb">
            <BotaoSec onClick={aoAbrirConversa}>Abrir conversa</BotaoSec>
            {/* affordance de MENSAGEM: bloqueada com motivo quando em opt-out — regra inviolável */}
            <BotaoSec disabled={bloqueado} title={bloqueado ? 'Contato marcado como não incomodar — mensagens bloqueadas.' : undefined} onClick={aoAgendar}>
              Agendar mensagem
            </BotaoSec>
          </div>
          {bloqueado && <div className="fx-hint">Mensagens bloqueadas: este contato pediu para não ser incomodado.</div>}
        </div>

        {/* opt-out — cidadão de primeira classe */}
        <div className="fx-b">
          {bloqueado ? (
            <div className="fx-optout">
              <div className="tx"><b>Não incomodar ativo.</b> Nenhuma mensagem (bot, régua ou agendamento) é enviada a este contato.</div>
              <BotaoMini onClick={() => aoBloquear(false)}>Remover</BotaoMini>
            </div>
          ) : (
            <div className="fx-optin">
              <span>Mensagens permitidas para este contato.</span>
              <BotaoMini onClick={() => aoBloquear(true)}>Marcar não incomodar</BotaoMini>
            </div>
          )}
        </div>

        <div className="fx-b">
          <div className="fx-t">Identidade</div>
          <div className="fx-kv"><span className="k">E-mail</span><span className="v">{contato.email || '—'}</span></div>
          <div className="fx-kv"><span className="k">CPF</span><span className="v num">{contato.cpf || '—'}</span></div>
          <div className="fx-kv"><span className="k">Origem</span><span className="v">{contato.org}</span></div>
          <div className="fx-kv"><span className="k">Consultor</span><span className="v">{contato.resp}</span></div>
          {contato.criadoEm && <div className="fx-kv"><span className="k">Desde</span><span className="v num">{tempoCelula(contato.criadoEm, agora).principal}</span></div>}
        </div>

        {contato.tags.length > 0 && (
          <div className="fx-b">
            <div className="fx-t">Etiquetas</div>
            <div className="fx-tags">{contato.tags.map((t) => <em className="ag-pill" key={t} style={{ fontStyle: 'normal' }}>{t}</em>)}</div>
          </div>
        )}

        <div className="fx-b">
          <div className="fx-t">Funil</div>
          {(!demo && oppsQ.isLoading) ? <Skeleton altura={26} raio={8} largura="72%" /> : opps.length === 0 ? (
            <div className="fx-vazio">Nenhuma oportunidade para este contato.</div>
          ) : (
            opps.map((o) => (
              <div className="fx-linha" key={o.id}>
                <div className="tx">
                  <b>{o.tipoServico || o.funilNome}</b>
                  <i>{o.colunaNome}{o.aberta ? '' : o.status === 'ganho' ? ' · ganho' : ' · perdido'}{o.respNome ? ` · ${o.respNome}` : ''}</i>
                </div>
                {o.aberta && <BotaoMini onClick={() => navigate(`/kanban?oportunidade=${encodeURIComponent(o.id)}`)}>Abrir no Kanban</BotaoMini>}
              </div>
            ))
          )}
        </div>

        <div className="fx-b">
          <div className="fx-t">
            Cobranças
            {(cobrancas.length > 0 || cobSituacao) && <BotaoMini onClick={() => navigate('/cobrancas')}>Ver todas</BotaoMini>}
          </div>
          {demo ? (
            cobSituacao
              ? <div className="fx-linha"><div className="tx"><b>Assinatura mensal</b><i>{cobSituacao === 'vencida' ? 'parcela vencida' : 'em dia'}</i></div><BadgeStatus tom={cobSituacao === 'vencida' ? 'erro' : 'ok'}>{cobSituacao === 'vencida' ? 'Vencida' : 'Em dia'}</BadgeStatus></div>
              : <div className="fx-vazio">Nenhuma cobrança para este contato.</div>
          ) : cobrancasQ.isLoading ? <Skeleton altura={26} raio={8} largura="64%" /> : cobrancas.length === 0 ? (
            <div className="fx-vazio">Nenhuma cobrança para este contato.</div>
          ) : (
            cobrancas.map((c) => (
              <div className="fx-linha" key={c.id}>
                <div className="tx">
                  <b>{c.servico || 'Cobrança'} · {brl(c.valorMensal)}</b>
                  <i className="num">{c.ciclosPagos}/{c.ciclosTotais} ciclos{c.proximaCobranca ? ` · próxima ${tempoCelula(c.proximaCobranca, agora).principal}` : ''}</i>
                </div>
                <BadgeStatus tom={c.status === 'ativa' ? (cobSituacao === 'vencida' ? 'erro' : 'ok') : 'neutro'}>{c.status}</BadgeStatus>
              </div>
            ))
          )}
        </div>

        <div className="fx-b">
          <div className="fx-t">Agendamentos</div>
          {ags.length === 0 ? (
            <div className="fx-vazio">Nenhuma mensagem agendada para este contato.</div>
          ) : (
            ags.map((a, i) => (
              <div className="fx-linha" key={i}>
                <div className="tx">
                  <b>{a.texto || '(mídia)'}</b>
                  <i className="num">{tempoRelativo(a.executarEm, agora)} · {a.status}</i>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="fx-b">
          <div className="fx-t">Relacionamento</div>
          {ativ ? (
            <div className="fx-linha">
              <div className="tx">
                <b>{ativ.reguaNome}</b>
                <i>{ativ.status}{ativ.proximoEm ? ` · próximo toque ${tempoRelativo(ativ.proximoEm, agora)}` : ''}</i>
              </div>
            </div>
          ) : (
            <div className="fx-vazio">Nenhuma régua ativa para este contato.</div>
          )}
        </div>

        {contato.obs && (
          <div className="fx-b">
            <div className="fx-t">Notas</div>
            <div className="fx-obs">{contato.obs}</div>
          </div>
        )}
      </div>
      <div className="fx-acoes">
        <BotaoMini onClick={aoEditar}>Editar</BotaoMini>
        <button type="button" className="p-btn btn-perigo btn-mini" onClick={aoExcluir}>Excluir</button>
      </div>
    </DrawerV2>
  );
}

/* ===================== criar / editar contato ===================== */
function ContatoModal({ modo, alvo, demo, aoFechar, aoSalvar }: {
  modo: 'novo' | 'editar'; alvo?: ContatoRow; demo: boolean;
  aoFechar: () => void; aoSalvar: (dados: NovoContato) => Promise<void>;
}) {
  const etiquetasQ = useEtiquetas();
  const usuariosQ = useOrgUsuarios();
  const [nome, setNome] = useState(alvo?.nome ?? '');
  const [telefone, setTelefone] = useState(alvo?.tel ?? '');
  const [email, setEmail] = useState(alvo?.email ?? '');
  const [cpf, setCpf] = useState(alvo?.cpf ?? '');
  const [origem, setOrigem] = useState(alvo?.org === '—' ? '' : alvo?.org ?? '');
  const [respId, setRespId] = useState(alvo?.respId ?? '');
  const [tags, setTags] = useState<string[]>(alvo?.tags ?? []);
  const [obs, setObs] = useState(alvo?.obs ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const catalogo = etiquetasQ.data ?? [];
  void demo;

  async function salvar() {
    if (!nome.trim()) { setErr('Informe o nome do contato.'); return; }
    if (telefone.trim() && !telefoneValido(telefone)) { setErr('Telefone inválido: informe DDD e número (mín. 10 dígitos).'); return; }
    if (email.trim() && !emailValido(email)) { setErr('E-mail inválido.'); return; }
    setErr(null); setBusy(true);
    try {
      await aoSalvar({
        nome: nome.trim(),
        telefone: telefone.trim() || undefined,
        email: email.trim() || undefined,
        cpf: cpf.trim() || undefined,
        origem: origem.trim() || undefined,
        responsavelId: respId || null,
        etiquetas: tags,
        observacoes: obs.trim() || undefined,
      });
    } catch (e) { setErr((e as Error).message || 'Falha ao salvar.'); setBusy(false); }
  }

  return (
    <ModalV2
      aberto
      aoFechar={() => { if (!busy) aoFechar(); }}
      fecharNoVeu={!busy}
      largura={480}
      titulo={modo === 'novo' ? 'Novo contato' : 'Editar contato'}
      rodape={<>
        <BotaoSec disabled={busy} onClick={aoFechar}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : (modo === 'novo' ? 'Criar contato' : 'Salvar')}</BotaoPrimario>
      </>}
    >
      <div className="form-grid">
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="cnt-nome">Nome *</label>
          <Input id="cnt-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" disabled={busy} />
        </div>
        <div className="form-2col">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cnt-tel">Telefone</label>
            <Input id="cnt-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(51) 99999-8888" disabled={busy} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cnt-email">E-mail</label>
            <Input id="cnt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" disabled={busy} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cnt-cpf">CPF</label>
            <Input id="cnt-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" disabled={busy} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="cnt-origem">Origem</label>
            <Input id="cnt-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Ex.: WhatsApp, Indicação" disabled={busy} />
          </div>
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="cnt-resp">Consultor responsável</label>
          <select id="cnt-resp" className="inp" value={respId ?? ''} onChange={(e) => setRespId(e.target.value)} disabled={busy}>
            <option value="">Sem responsável</option>
            {(usuariosQ.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        {catalogo.length > 0 && (
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Etiquetas</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {catalogo.map((e) => (
                <Chip key={e.id} ativo={tags.includes(e.nome)} onClick={() => setTags((t) => t.includes(e.nome) ? t.filter((x) => x !== e.nome) : [...t, e.nome])}>{e.nome}</Chip>
              ))}
            </div>
          </div>
        )}
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="cnt-obs">Observações</label>
          <textarea id="cnt-obs" className="inp" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} disabled={busy} style={{ height: 'auto', padding: '8px 11px', resize: 'vertical', fontFamily: 'var(--fonte)' }} />
        </div>
        {err && <div className="aviso-inline erro" role="alert" style={{ marginBottom: 0 }}>{err}</div>}
      </div>
    </ModalV2>
  );
}
