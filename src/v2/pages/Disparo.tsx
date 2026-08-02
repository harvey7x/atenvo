import { useEffect, useMemo, useState } from 'react';
import {
  useDisparoElegiveis, useCampanhas, useCriarCampanha, useCancelarCampanha, useAddAlvos, useAlvos,
  useProcessarLote, useOptoutLista, useOptoutManual, useOptoutRemover,
  preencherTemplate, primeiroNomeApresentavel, inferirGenero, type Genero,
  type Elegivel, type Campanha, type Alvo, type OptoutRow, type ResultadoProcessar,
} from '@/data/disparo';
import { useWaTemplates, useCloudDiagnostico, type WaTemplate } from '@/data/cloudApi';
import { formatarNumero } from '@/data/maturacao';
import { tempoRelativo } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  ConfirmDialogV2, EstadoVazio, Input, Kpi, ModalV2, SkeletonTexto, TabelaPadrao,
  type Coluna, type TomStatus,
} from '../components';
import './disparo.css';

/* ------------------------------------------------------------------
   Disparo v2 (redesign) — cara de CAMPANHA, não lista de contatos.
   Fluxo em etapas: 1 Público → 2 Template → 3 Revisar → 4 Disparar,
   com resumo fixo no topo e cards por pessoa (prévia do {{1}} já
   preenchido, serviço de interesse, canal de origem).
   A mecânica é a MESMA da v1 (RPCs + disparo-processar intocados):
   dry-run por default, teto 24h no servidor, opt-out re-checado.
   ------------------------------------------------------------------ */

type AbaId = 'campanha' | 'excluidos';
type Etapa = 1 | 2 | 3 | 4;
const ROTULO_ETAPA: Record<Etapa, string> = { 1: 'Público', 2: 'Template', 3: 'Revisar', 4: 'Disparar' };

const ST_ALVO: Record<Alvo['status'], { rotulo: string; tom: TomStatus }> = {
  pendente: { rotulo: 'Pendente', tom: 'neutro' },
  enviado: { rotulo: 'Enviado', tom: 'ok' },
  falhou: { rotulo: 'Falhou', tom: 'erro' },
  optout: { rotulo: 'Opt-out', tom: 'atencao' },
  pulado: { rotulo: 'Pulado', tom: 'neutro' },
};
const MOTIVO_ROTULO: Record<string, string> = {
  sair_texto: 'Respondeu SAIR',
  erro_131050: 'Bloqueou na Meta',
  user_preferences: 'Descadastro Meta',
  manual: 'Manual (painel)',
};
const fmtTel = (t: string | null) => {
  const d = (t ?? '').replace(/\D/g, '');
  return /^\d{12,13}$/.test(d) ? formatarNumero(d) : (t || '—');
};
const iniciais = (n: string) => {
  const p = (n || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
};

export function Disparo() {
  const agoraMs = Date.now();
  const [aba, setAba] = useState<AbaId>('campanha');
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);

  /* ---------- dados ---------- */
  const elegQ = useDisparoElegiveis();
  const campQ = useCampanhas();
  const tplQ = useWaTemplates();
  const diagQ = useCloudDiagnostico();
  const optQ = useOptoutLista();

  const campanha: Campanha | null = useMemo(
    () => (campQ.data ?? []).find((c) => c.status === 'ativa') ?? null,
    [campQ.data],
  );
  const alvosQ = useAlvos(campanha?.id ?? null);
  const templatesAprovados = useMemo(
    () => (tplQ.data ?? []).filter((t) => t.status === 'aprovado'),
    [tplQ.data],
  );
  const canalCloud = (diagQ.data?.canais ?? []).find((c) => c.status_integracao === 'conectado') ?? null;

  /* campanha ativa já em andamento → entra direto no acompanhamento */
  const [pulouParaAtiva, setPulouParaAtiva] = useState(false);
  useEffect(() => {
    if (campanha && !pulouParaAtiva) { setEtapa(4); setPulouParaAtiva(true); }
  }, [campanha, pulouParaAtiva]);

  /* ---------- mutações ---------- */
  const criar = useCriarCampanha();
  const cancelar = useCancelarCampanha();
  const addAlvos = useAddAlvos();
  const processar = useProcessarLote();
  const optManual = useOptoutManual();
  const optRemover = useOptoutRemover();

  const ok = (texto: string) => { setAviso({ tom: 'ok', texto }); setTimeout(() => setAviso(null), 6000); };
  const erro = (texto: string) => setAviso({ tom: 'erro', texto });

  /* ================= etapa 1: público ================= */
  const [busca, setBusca] = useState('');
  const [etapasSel, setEtapasSel] = useState<ReadonlySet<string>>(new Set());
  // Filtro de gênero (régua conservadora pelo primeiro nome — mesma do bot). 'all' = sem filtro.
  // Para template com "o senhor"/"a senhora": os INCERTOS ficam fora do filtro de propósito.
  const [genero, setGenero] = useState<'all' | Genero>('all');
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [confOptout, setConfOptout] = useState<Elegivel | null>(null);

  const elegiveis = elegQ.data ?? [];
  const etapasKanban = useMemo(() => {
    const m = new Map<string, { ordem: number; total: number }>();
    for (const e of elegiveis) {
      const cur = m.get(e.etapa) ?? { ordem: e.etapa_ordem, total: 0 };
      cur.total += 1; m.set(e.etapa, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem).map(([nome, v]) => ({ nome, total: v.total }));
  }, [elegiveis]);
  const generoDe = useMemo(() => new Map(elegiveis.map((e) => [e.contato_id, inferirGenero(e.nome)])), [elegiveis]);
  const porGenero = useMemo(() => {
    const c = { homem: 0, mulher: 0, ambiguo: 0 };
    for (const g of generoDe.values()) c[g] += 1;
    return c;
  }, [generoDe]);
  const listaPublico = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return elegiveis.filter((e) =>
      (etapasSel.size === 0 || etapasSel.has(e.etapa)) &&
      (genero === 'all' || generoDe.get(e.contato_id) === genero) &&
      (!q || e.nome.toLowerCase().includes(q) || (e.telefone ?? '').includes(q)));
  }, [elegiveis, busca, etapasSel, genero, generoDe]);
  const selecionaveis = useMemo(() => listaPublico.filter((e) => !e.optout), [listaPublico]);
  const porContato = useMemo(() => new Map(elegiveis.map((e) => [e.contato_id, e])), [elegiveis]);
  const selecionados = useMemo(
    () => [...sel].map((id) => porContato.get(id)).filter(Boolean) as Elegivel[],
    [sel, porContato],
  );

  const alternarEtapaKanban = (nome: string) => setEtapasSel((s) => {
    const n = new Set(s); if (n.has(nome)) n.delete(nome); else n.add(nome); return n;
  });
  const alternarPessoa = (e: Elegivel) => {
    if (e.optout) return;
    setSel((s) => { const n = new Set(s); if (n.has(e.contato_id)) n.delete(e.contato_id); else n.add(e.contato_id); return n; });
  };
  const todosFiltradosMarcados = selecionaveis.length > 0 && selecionaveis.every((e) => sel.has(e.contato_id));

  /* ================= etapa 2: template ================= */
  const [templateId, setTemplateId] = useState('');
  const template: WaTemplate | null = useMemo(
    () => (tplQ.data ?? []).find((t) => t.id === templateId) ?? null,
    [tplQ.data, templateId],
  );
  /* campanha ativa → o template é o dela (trava a escolha) */
  const templateDaCampanha: WaTemplate | null = useMemo(
    () => (campanha ? (tplQ.data ?? []).find((t) => t.id === campanha.template_id) ?? null : null),
    [campanha, tplQ.data],
  );
  const tplEfetivo = campanha ? templateDaCampanha : template;

  /* ================= etapa 3: revisar ================= */
  const semNome = useMemo(
    () => selecionados.filter((e) => !primeiroNomeApresentavel(e.nome)).length,
    [selecionados],
  );

  /* ================= etapa 4: disparar ================= */
  const [lote, setLote] = useState(12);
  const [previa, setPrevia] = useState<ResultadoProcessar | null>(null);
  const [confDisparo, setConfDisparo] = useState(false);
  const [confEncerrar, setConfEncerrar] = useState(false);
  // Modo teste: ignora a janela seg–sáb 09–18 SÓ para lote ≤ 3 (o servidor impõe o cap).
  const [modoTeste, setModoTeste] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProcessar | null>(null);
  const [criandoCampanha, setCriandoCampanha] = useState(false);

  const alvos = alvosQ.data ?? [];
  const porStatus = useMemo(() => {
    const c: Record<string, number> = { pendente: 0, enviado: 0, falhou: 0, optout: 0, pulado: 0 };
    for (const a of alvos) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [alvos]);

  const criarCampanhaComPublico = async () => {
    if (!canalCloud) { erro('Nenhum canal Cloud API conectado.'); return; }
    if (!template) { erro('Escolha o template na etapa 2.'); return; }
    if (!selecionados.length) { erro('Selecione o público na etapa 1.'); return; }
    setCriandoCampanha(true);
    try {
      const nome = `${template.nome} · ${new Date().toLocaleDateString('pt-BR')}`;
      const id = await criar.mutateAsync({ nome, template_id: template.id, canal_id: canalCloud.id });
      const r = await addAlvos.mutateAsync({ campanha_id: id, contatos: selecionados.map((e) => e.contato_id) });
      setSel(new Set());
      ok(`Campanha criada: ${r.pendentes} na fila · ${r.optout} em opt-out · ${r.sem_whatsapp} sem WhatsApp.`);
    } catch (e) { erro((e as Error).message); } finally { setCriandoCampanha(false); }
  };

  const adicionarMaisNaCampanha = async () => {
    if (!campanha || !selecionados.length) return;
    try {
      const r = await addAlvos.mutateAsync({ campanha_id: campanha.id, contatos: selecionados.map((e) => e.contato_id) });
      setSel(new Set()); setEtapa(4);
      ok(`Adicionados: ${r.pendentes} novos · ${r.ja_existiam} já estavam na campanha.`);
    } catch (e) { erro((e as Error).message); }
  };

  const loteEfetivo = modoTeste ? Math.min(lote, 3) : lote;
  const simular = async () => {
    if (!campanha) return;
    try { setPrevia(await processar.mutateAsync({ campanha_id: campanha.id, lote: loteEfetivo, dry_run: true })); }
    catch (e) { erro((e as Error).message); }
  };
  const disparar = async () => {
    if (!campanha) return;
    setConfDisparo(false);
    try {
      const r = await processar.mutateAsync({ campanha_id: campanha.id, lote: loteEfetivo, dry_run: false, forcar_janela: modoTeste });
      setResultado(r);
      ok(`Lote concluído: ${r.enviados ?? 0} enviados · ${r.falhas ?? 0} falhas · ${r.optouts ?? 0} opt-out. Restam ${r.restante_teto ?? '—'} no teto de 24h.`);
    } catch (e) { erro((e as Error).message); }
  };

  /* ================= aba excluídos ================= */
  const [confDesfazer, setConfDesfazer] = useState<OptoutRow | null>(null);
  const COLS_OPTOUT: Coluna<OptoutRow>[] = [
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (o) => o.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (o) => fmtTel(o.telefone) },
    { chave: 'motivo', titulo: 'Motivo', render: (o) => <BadgeStatus tom={o.motivo === 'manual' ? 'neutro' : 'atencao'}>{MOTIVO_ROTULO[o.motivo] ?? o.motivo}</BadgeStatus> },
    { chave: 'detalhe', titulo: 'Detalhe', render: (o) => o.detalhe ?? '' },
    { chave: 'quando', titulo: 'Quando', dir: true, classe: 'num', render: (o) => tempoRelativo(o.criado_em, agoraMs) },
    { chave: 'acoes', titulo: '', dir: true, render: (o) => <BotaoMini onClick={() => setConfDesfazer(o)}>Desfazer</BotaoMini> },
  ];

  /* ================= render ================= */
  const carregando = elegQ.isLoading || campQ.isLoading;
  const podeIr = (alvo: Etapa): boolean => {
    if (campanha) return true;                             // acompanhamento livre
    if (alvo >= 2 && selecionados.length === 0) return false;
    if (alvo >= 3 && !template) return false;
    return true;
  };
  const irPara = (alvo: Etapa) => { if (podeIr(alvo)) setEtapa(alvo); };

  const previewGrande = (tpl: WaTemplate | null, nomeExemplo?: string) => (
    <div className="dsp-bolha" aria-label="Prévia da mensagem">
      {tpl
        ? <p>{preencherTemplate(tpl.corpo, tpl.variaveis, nomeExemplo ?? (selecionados[0]?.nome ?? ''))}</p>
        : <p className="dsp-nota">Escolha um template aprovado para ver a mensagem.</p>}
    </div>
  );

  const cardPessoa = (e: Elegivel, opts?: { comPrevia?: boolean }) => {
    const marcado = sel.has(e.contato_id);
    const previa = opts?.comPrevia && tplEfetivo
      ? preencherTemplate(tplEfetivo.corpo, tplEfetivo.variaveis, e.nome)
      : null;
    return (
      <button
        type="button"
        key={e.contato_id}
        className={['dsp-card', marcado ? 'on' : '', e.optout ? 'off' : ''].filter(Boolean).join(' ')}
        onClick={() => alternarPessoa(e)}
        aria-pressed={marcado}
        disabled={e.optout}
      >
        <div className="dsp-card-cab">
          <span className="dsp-av" aria-hidden>{iniciais(e.nome)}</span>
          <span className="dsp-card-id">
            <strong>{e.nome || '—'}</strong>
            <span className="num">{fmtTel(e.telefone)}</span>
          </span>
          <span className={marcado ? 'dsp-tick on' : 'dsp-tick'} aria-hidden>✓</span>
        </div>
        <div className="dsp-card-tags">
          <BadgeStatus tom={e.etapa === 'REMARKETING' ? 'atencao' : 'neutro'}>{e.etapa}</BadgeStatus>
          {e.tipo_servico && <BadgeStatus tom="neutro">{e.tipo_servico}</BadgeStatus>}
          {e.optout && <BadgeStatus tom="erro">Opt-out</BadgeStatus>}
        </div>
        <div className="dsp-card-meta num">
          {e.ultima_msg_em ? `falou ${tempoRelativo(e.ultima_msg_em, agoraMs)}` : 'sem mensagem'}
          {e.canal_origem ? ` · via ${e.canal_origem}` : ''}
        </div>
        {previa && <p className="dsp-card-previa">{previa}</p>}
        {!e.optout && (
          <span
            role="button"
            tabIndex={0}
            className="dsp-card-opt"
            onClick={(ev) => { ev.stopPropagation(); setConfOptout(e); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setConfOptout(e); } }}
          >
            marcar opt-out
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pg-disparo">
      <header className="dsp-cab sobe">
        <div>
          <h1>Disparo</h1>
          <p className="sub">Campanha de template aprovado pelo canal oficial · opt-out respeitado sempre · teto {campanha?.teto_24h ?? 200}/24h no servidor</p>
        </div>
        <Chips>
          <Chip ativo={aba === 'campanha'} onClick={() => setAba('campanha')}>Campanha</Chip>
          <Chip ativo={aba === 'excluidos'} onClick={() => setAba('excluidos')}>Excluídos {optQ.data?.length ?? 0}</Chip>
        </Chips>
      </header>

      {aviso && <div className={aviso.tom === 'ok' ? 'dsp-aviso ok' : 'dsp-aviso erro'} role="status">{aviso.texto}</div>}

      {carregando ? (
        <CardVidro style={{ borderRadius: 12, padding: 16 }}><SkeletonTexto linhas={6} /></CardVidro>
      ) : aba === 'excluidos' ? (
        <CardVidro spot sobe style={{ borderRadius: 12 }}>
          {(optQ.data ?? []).length === 0 ? (
            <EstadoVazio titulo="Ninguém em opt-out" descricao="Quem responder SAIR (ou for marcado manualmente) aparece aqui e nunca mais recebe disparo." />
          ) : (
            <TabelaPadrao colunas={COLS_OPTOUT} linhas={optQ.data ?? []} chave={(o) => o.contato_id} rodape={{ texto: `${optQ.data?.length ?? 0} contatos fora de qualquer disparo` }} />
          )}
        </CardVidro>
      ) : (
        <>
          {/* -------- resumo da campanha (sempre visível) -------- */}
          <CardVidro spot sobe className="dsp-resumo" style={{ borderRadius: 12, padding: '12px 16px' }}>
            <div className="dsp-resumo-linha">
              <span><strong className="num">{campanha ? alvos.length : selecionados.length}</strong> {campanha ? 'na campanha' : 'selecionados'}</span>
              <span aria-hidden>·</span>
              <span>template <strong>{tplEfetivo?.nome ?? '—'}</strong></span>
              <span aria-hidden>·</span>
              <span>lote de <strong className="num">{lote}</strong></span>
              <span aria-hidden>·</span>
              <span>canal <strong>{canalCloud?.nome_interno ?? '—'}</strong></span>
              {campanha && (
                <>
                  <span aria-hidden>·</span>
                  <BadgeStatus tom="ok">campanha ativa</BadgeStatus>
                </>
              )}
            </div>
            <nav className="dsp-passos" aria-label="Etapas do disparo">
              {([1, 2, 3, 4] as Etapa[]).map((n) => (
                <button
                  type="button"
                  key={n}
                  className={['dsp-passo', etapa === n ? 'on' : '', !podeIr(n) ? 'trava' : ''].filter(Boolean).join(' ')}
                  onClick={() => irPara(n)}
                  disabled={!podeIr(n)}
                >
                  <span className="num">{n}</span> {ROTULO_ETAPA[n]}
                </button>
              ))}
            </nav>
          </CardVidro>

          {/* ================= 1 · PÚBLICO ================= */}
          {etapa === 1 && (
            <>
              <div className="dsp-filtros sobe" style={{ animationDelay: '.05s' }}>
                <div className="dsp-busca">
                  <Input placeholder="Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no público elegível" />
                </div>
                <Chips>
                  <Chip ativo={etapasSel.size === 0} onClick={() => setEtapasSel(new Set())}>Todas {elegiveis.length}</Chip>
                  {etapasKanban.map((et) => (
                    <Chip key={et.nome} ativo={etapasSel.has(et.nome)} onClick={() => alternarEtapaKanban(et.nome)}>{et.nome} {et.total}</Chip>
                  ))}
                </Chips>
                <Chips>
                  <Chip ativo={genero === 'homem'} onClick={() => setGenero(genero === 'homem' ? 'all' : 'homem')}>♂ Homens {porGenero.homem}</Chip>
                  <Chip ativo={genero === 'mulher'} onClick={() => setGenero(genero === 'mulher' ? 'all' : 'mulher')}>♀ Mulheres {porGenero.mulher}</Chip>
                  <Chip ativo={genero === 'ambiguo'} onClick={() => setGenero(genero === 'ambiguo' ? 'all' : 'ambiguo')}>? Incertos {porGenero.ambiguo}</Chip>
                </Chips>
                <BotaoSec onClick={() => setSel(todosFiltradosMarcados ? new Set() : new Set(selecionaveis.map((e) => e.contato_id)))}>
                  {todosFiltradosMarcados ? 'Desmarcar todos' : `Selecionar ${selecionaveis.length} visíveis`}
                </BotaoSec>
              </div>
              {listaPublico.length === 0 ? (
                <CardVidro spot style={{ borderRadius: 12 }}>
                  <EstadoVazio titulo="Ninguém neste filtro" descricao="O público vem do Kanban: coluna REMARKETING + Lead Novo com conversa real (a pessoa respondeu)." />
                </CardVidro>
              ) : (
                <div className="dsp-grid sobe" style={{ animationDelay: '.1s' }}>
                  {listaPublico.map((e) => cardPessoa(e))}
                </div>
              )}
              <div className="dsp-rodape-etapa dsp-flutua">
                <span className="num">{selecionados.length} selecionado{selecionados.length === 1 ? '' : 's'}</span>
                <BotaoPrimario
                  onClick={() => irPara(campanha ? (selecionados.length ? 3 : 4) : 2)}
                  disabled={!selecionados.length && !campanha}
                >
                  {campanha
                    ? (selecionados.length ? `Adicionar ${selecionados.length} à campanha →` : 'Ir para o disparo →')
                    : `Avançar (${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'}) →`}
                </BotaoPrimario>
              </div>
            </>
          )}

          {/* ================= 2 · TEMPLATE ================= */}
          {etapa === 2 && (
            <div className="dsp-duas sobe">
              <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                <h2 className="dsp-h2">Template aprovado</h2>
                {campanha ? (
                  <p className="dsp-nota">A campanha ativa usa <strong>{templateDaCampanha?.nome ?? '—'}</strong>. Para trocar de template, conclua ou cancele a campanha atual.</p>
                ) : templatesAprovados.length === 0 ? (
                  <EstadoVazio titulo="Nenhum template aprovado" descricao="Quando a Meta aprovar, sincronize em Integrações → Modelos e ele aparece aqui." />
                ) : (
                  <div className="dsp-tpl-lista">
                    {templatesAprovados.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={templateId === t.id ? 'dsp-tpl on' : 'dsp-tpl'}
                        onClick={() => setTemplateId(t.id)}
                        aria-pressed={templateId === t.id}
                      >
                        <strong>{t.nome}</strong>
                        <span className="num">{t.idioma} · {t.categoria}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardVidro>
              <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                <h2 className="dsp-h2">Como o cliente recebe</h2>
                {previewGrande(tplEfetivo)}
                {tplEfetivo && (tplEfetivo.variaveis?.length ?? 0) > 0 && (
                  <p className="dsp-nota">A variável de nome é preenchida por pessoa; quem não tem nome cadastrado recebe “cliente”.</p>
                )}
                <div className="dsp-rodape-etapa">
                  <BotaoSec onClick={() => setEtapa(1)}>← Público</BotaoSec>
                  <BotaoPrimario onClick={() => irPara(3)} disabled={!tplEfetivo}>Revisar →</BotaoPrimario>
                </div>
              </CardVidro>
            </div>
          )}

          {/* ================= 3 · REVISAR ================= */}
          {etapa === 3 && (
            <>
              <div className="dsp-kpis sobe">
                <Kpi rotulo="Vão receber" valor={selecionados.length} />
                <Kpi rotulo="Com nome" valor={selecionados.length - semNome} />
                <Kpi rotulo="Sairá “cliente”" valor={semNome} />
                <Kpi rotulo="Teto 24h" valor={campanha?.teto_24h ?? 200} />
              </div>
              <div className="dsp-duas sobe" style={{ animationDelay: '.05s' }}>
                <CardVidro spot style={{ borderRadius: 12, padding: 16 }}>
                  <h2 className="dsp-h2">A mensagem</h2>
                  {previewGrande(tplEfetivo)}
                  {semNome > 0 && (
                    <p className="dsp-nota">⚠ {semNome} contato{semNome === 1 ? '' : 's'} sem nome cadastrado sai{semNome === 1 ? '' : 'em'} como “Olá, cliente”. Dá pra renomear na página Contatos antes de disparar.</p>
                  )}
                  <div className="dsp-rodape-etapa">
                    <BotaoSec onClick={() => setEtapa(2)}>← Template</BotaoSec>
                    {campanha ? (
                      <BotaoPrimario onClick={() => void adicionarMaisNaCampanha()} disabled={!selecionados.length || addAlvos.isPending}>
                        {addAlvos.isPending ? 'Adicionando…' : `Adicionar ${selecionados.length} à campanha →`}
                      </BotaoPrimario>
                    ) : (
                      <BotaoPrimario onClick={async () => { await criarCampanhaComPublico(); setEtapa(4); }} disabled={criandoCampanha || !selecionados.length}>
                        {criandoCampanha ? 'Criando…' : `Criar campanha com ${selecionados.length} →`}
                      </BotaoPrimario>
                    )}
                  </div>
                </CardVidro>
                <div>
                  <h2 className="dsp-h2 dsp-h2-solta">Como fica pra cada um</h2>
                  <div className="dsp-grid dsp-grid-revisao">
                    {selecionados.slice(0, 30).map((e) => cardPessoa(e, { comPrevia: true }))}
                  </div>
                  {selecionados.length > 30 && <p className="dsp-nota">…e mais {selecionados.length - 30} (mostrando os 30 primeiros).</p>}
                </div>
              </div>
            </>
          )}

          {/* ================= 4 · DISPARAR ================= */}
          {etapa === 4 && !campanha && (
            <CardVidro spot sobe style={{ borderRadius: 12 }}>
              <EstadoVazio titulo="Nenhuma campanha ativa" descricao="Monte o público (etapa 1), escolha o template (2) e crie a campanha na revisão (3)." acao={{ rotulo: 'Começar pelo público', onClick: () => setEtapa(1) }} />
            </CardVidro>
          )}
          {etapa === 4 && campanha && (
            <>
              <div className="dsp-kpis sobe">
                <Kpi rotulo="Pendentes" valor={porStatus.pendente} />
                <Kpi rotulo="Enviados" valor={porStatus.enviado} />
                <Kpi rotulo="Falhas" valor={porStatus.falhou} />
                <Kpi rotulo="Opt-out / pulados" valor={porStatus.optout + porStatus.pulado} />
              </div>
              <CardVidro spot sobe style={{ borderRadius: 12, padding: 16, animationDelay: '.05s' }}>
                <div className="dsp-painel">
                  <div className="dsp-info">
                    <strong>{campanha.nome}</strong>
                    <span className="num">canal {canalCloud?.nome_interno ?? '—'} · teto {campanha.teto_24h}/24h · quem já recebeu nunca recebe de novo</span>
                  </div>
                  <div className="dsp-acoes">
                    <BotaoSec onClick={() => setConfEncerrar(true)}>Encerrar</BotaoSec>
                    <BotaoSec onClick={() => setEtapa(1)}>+ pessoas</BotaoSec>
                    <label className="dsp-lote num" htmlFor="dsp-lote-inp">Enviar agora:</label>
                    <input
                      id="dsp-lote-inp" className="inp dsp-lote-inp num" type="number" min={1} max={50}
                      value={lote} onChange={(e) => setLote(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                      aria-label="Quantidade do lote"
                    />
                    <BotaoSec onClick={() => void simular()} disabled={processar.isPending || !porStatus.pendente}>
                      {processar.isPending ? 'Processando…' : 'Simular'}
                    </BotaoSec>
                    <BotaoPrimario onClick={() => setConfDisparo(true)} disabled={processar.isPending || !porStatus.pendente}>
                      Disparar lote
                    </BotaoPrimario>
                  </div>
                </div>
                <label className="dsp-modoteste">
                  <input type="checkbox" checked={modoTeste} onChange={(e) => setModoTeste(e.target.checked)} />
                  <span>Modo teste: ignora a janela de horário — <strong>máx. 3 mensagens</strong> (o servidor recusa mais). Envio real em volume: só seg–sáb, 09h–18h.</span>
                </label>
                {resultado && !resultado.dry_run && (
                  <p className="dsp-resultado num" role="status">
                    Último lote: {resultado.enviados ?? 0} enviados · {resultado.falhas ?? 0} falhas · {resultado.optouts ?? 0} opt-out
                    {typeof resultado.restante_teto === 'number' ? ` · restam ${resultado.restante_teto} no teto de 24h` : ''}
                  </p>
                )}
              </CardVidro>
              {alvos.length === 0 ? (
                <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.1s' }}>
                  <EstadoVazio titulo="Campanha sem alvos" descricao="Volte ao público e adicione as pessoas." acao={{ rotulo: 'Ir para o público', onClick: () => setEtapa(1) }} />
                </CardVidro>
              ) : (
                <div className="dsp-grid sobe" style={{ animationDelay: '.1s' }}>
                  {alvos.map((a) => (
                    <div key={a.id} className="dsp-card dsp-card-alvo">
                      <div className="dsp-card-cab">
                        <span className="dsp-av" aria-hidden>{iniciais(a.contatos?.nome ?? '')}</span>
                        <span className="dsp-card-id">
                          <strong>{a.contatos?.nome ?? '—'}</strong>
                          <span className="num">{fmtTel(a.telefone)}</span>
                        </span>
                        <BadgeStatus tom={ST_ALVO[a.status].tom}>{ST_ALVO[a.status].rotulo}</BadgeStatus>
                      </div>
                      <div className="dsp-card-meta num">
                        {a.enviado_em ? `enviado ${tempoRelativo(a.enviado_em, agoraMs)}` : (a.erro ?? 'aguardando lote')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------- modal: prévia da simulação ---------- */}
      <ModalV2
        aberto={!!previa}
        aoFechar={() => setPrevia(null)}
        titulo={`Simulação — ${previa?.processados ?? 0} no lote (nada foi enviado)`}
        largura={560}
        rodape={<BotaoSec onClick={() => setPrevia(null)}>Fechar</BotaoSec>}
      >
        <div className="dsp-previa">
          {(previa?.resultados ?? []).map((r, i) => (
            <div key={i} className="dsp-previa-item">
              <div className="dsp-previa-cab">
                <strong>{r.contato ?? '—'}</strong>
                <span className="num">{fmtTel(r.telefone ?? null)} · {r.status}</span>
              </div>
              {r.texto && <p className="dsp-previa-txt">{r.texto}</p>}
            </div>
          ))}
          {!previa?.resultados?.length && <p className="dsp-nota">{previa?.mensagem ?? 'Nenhum alvo pendente.'}</p>}
        </div>
      </ModalV2>

      {/* ---------- confirmações ---------- */}
      <ConfirmDialogV2
        aberto={confEncerrar}
        titulo={`Encerrar a campanha "${campanha?.nome ?? ''}"?`}
        mensagem={`${porStatus.pendente} pendente${porStatus.pendente === 1 ? '' : 's'} deixa${porStatus.pendente === 1 ? '' : 'm'} de ser enviados. O histórico fica guardado e você pode criar outra campanha em seguida.`}
        rotuloConfirmar="Encerrar campanha"
        destrutivo
        carregando={cancelar.isPending}
        aoConfirmar={async () => {
          const c = campanha; setConfEncerrar(false);
          if (!c) return;
          try { await cancelar.mutateAsync(c.id); setEtapa(1); ok(`Campanha "${c.nome}" encerrada.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfEncerrar(false)}
      />
      <ConfirmDialogV2
        aberto={confDisparo}
        titulo={`Disparar ${Math.min(loteEfetivo, porStatus.pendente)} mensagens agora?`}
        mensagem={`Template real pelo canal ${canalCloud?.nome_interno ?? 'Cloud API'} para os ${Math.min(loteEfetivo, porStatus.pendente)} primeiros pendentes.${modoTeste ? ' MODO TESTE (fora da janela, máx. 3).' : ''} Custa dinheiro e não tem desfazer.`}
        rotuloConfirmar="Disparar"
        destrutivo
        carregando={processar.isPending}
        aoConfirmar={() => void disparar()}
        aoCancelar={() => setConfDisparo(false)}
      />
      <ConfirmDialogV2
        aberto={!!confOptout}
        titulo={`Marcar ${confOptout?.nome ?? ''} como opt-out?`}
        mensagem="Sai de qualquer disparo e remarketing (o atendimento normal continua). Dá para desfazer na aba Excluídos."
        rotuloConfirmar="Marcar opt-out"
        carregando={optManual.isPending}
        aoConfirmar={async () => {
          const alvo = confOptout; setConfOptout(null);
          if (!alvo) return;
          try {
            await optManual.mutateAsync({ contato_id: alvo.contato_id, detalhe: 'via painel (Disparo)' });
            setSel((s) => { const n = new Set(s); n.delete(alvo.contato_id); return n; });
            ok(`${alvo.nome} marcado como opt-out.`);
          } catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfOptout(null)}
      />
      <ConfirmDialogV2
        aberto={!!confDesfazer}
        titulo={`Desfazer opt-out de ${confDesfazer?.nome ?? ''}?`}
        mensagem="O contato volta a ser elegível para disparos. Só faça isso se a exclusão foi um engano."
        rotuloConfirmar="Desfazer"
        carregando={optRemover.isPending}
        aoConfirmar={async () => {
          const alvo = confDesfazer; setConfDesfazer(null);
          if (!alvo) return;
          try { await optRemover.mutateAsync(alvo.contato_id); ok(`Opt-out de ${alvo.nome} desfeito.`); }
          catch (e) { erro((e as Error).message); }
        }}
        aoCancelar={() => setConfDesfazer(null)}
      />
    </div>
  );
}

export default Disparo;
