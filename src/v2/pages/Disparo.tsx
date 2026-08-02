import { useMemo, useState } from 'react';
import {
  useDisparoElegiveis, useCampanhas, useCriarCampanha, useAddAlvos, useAlvos,
  useProcessarLote, useOptoutLista, useOptoutManual, useOptoutRemover,
  type Elegivel, type Campanha, type Alvo, type OptoutRow, type ResultadoProcessar,
} from '@/data/disparo';
import { useWaTemplates, useCloudDiagnostico } from '@/data/cloudApi';
import { formatarNumero } from '@/data/maturacao';
import { tempoRelativo } from '../lib/tempo';
import {
  BadgeStatus, BotaoMini, BotaoPrimario, BotaoSec, CardVidro, Chip, Chips,
  ConfirmDialogV2, EstadoVazio, Input, Kpi, ModalV2, SkeletonTexto, TabelaPadrao,
  type Coluna, type TomStatus,
} from '../components';
import './disparo.css';

/* ------------------------------------------------------------------
   Disparo v2 — campanha de template pela Cloud API (Fase 1: tiro único).
   Fluxo: Público elegível (Kanban: REMARKETING + LEAD NOVO com conversa
   real) → seleciona → adiciona à campanha → Simular (dry-run SEMPRE
   disponível) → Disparar lote ("Enviar agora: X", teto 24h no servidor).
   Aba Excluídos = wa_optout em 1ª classe: marcar manual + desfazer.
   Nada aqui envia sem confirmação explícita; o default do backend é simular.
   ------------------------------------------------------------------ */

type AbaId = 'publico' | 'campanha' | 'excluidos';
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

export function Disparo() {
  const agoraMs = Date.now();
  const [aba, setAba] = useState<AbaId>('publico');
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

  /* ---------- mutações ---------- */
  const criar = useCriarCampanha();
  const addAlvos = useAddAlvos();
  const processar = useProcessarLote();
  const optManual = useOptoutManual();
  const optRemover = useOptoutRemover();

  const ok = (texto: string) => { setAviso({ tom: 'ok', texto }); setTimeout(() => setAviso(null), 6000); };
  const erro = (texto: string) => setAviso({ tom: 'erro', texto });

  /* ================================================================
     ABA PÚBLICO — lista elegível com seleção e ações em lote
     ================================================================ */
  const [busca, setBusca] = useState('');
  // Etapas do Kanban marcadas (multi-seleção; vazio = todas). Somam na contagem do rodapé.
  const [etapasSel, setEtapasSel] = useState<ReadonlySet<string>>(new Set());
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [confOptout, setConfOptout] = useState<string[] | null>(null);

  const elegiveis = elegQ.data ?? [];
  const etapas = useMemo(() => {
    const m = new Map<string, { ordem: number; total: number }>();
    for (const e of elegiveis) {
      const cur = m.get(e.etapa) ?? { ordem: e.etapa_ordem, total: 0 };
      cur.total += 1; m.set(e.etapa, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem).map(([nome, v]) => ({ nome, total: v.total }));
  }, [elegiveis]);
  const alternarEtapa = (nome: string) => setEtapasSel((s) => {
    const n = new Set(s); if (n.has(nome)) n.delete(nome); else n.add(nome); return n;
  });
  const listaPublico = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return elegiveis.filter((e) =>
      (etapasSel.size === 0 || etapasSel.has(e.etapa)) &&
      (!q || e.nome.toLowerCase().includes(q) || (e.telefone ?? '').includes(q)));
  }, [elegiveis, busca, etapasSel]);

  const alternarSel = (id: string) => setSel((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const selecionarVisiveis = () => setSel(new Set(listaPublico.filter((e) => !e.optout).map((e) => e.contato_id)));

  const adicionarSelecionados = async (ids: string[]) => {
    if (!campanha) { setAba('campanha'); erro('Crie a campanha primeiro (aba Campanha).'); return; }
    try {
      const r = await addAlvos.mutateAsync({ campanha_id: campanha.id, contatos: ids });
      setSel(new Set());
      ok(`Adicionados: ${r.pendentes} pendentes · ${r.optout} em opt-out · ${r.sem_whatsapp} sem WhatsApp · ${r.ja_existiam} já estavam.`);
      setAba('campanha');
    } catch (e) { erro((e as Error).message); }
  };

  const COLS_PUBLICO: Coluna<Elegivel>[] = [
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (e) => e.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (e) => fmtTel(e.telefone) },
    {
      chave: 'etapa', titulo: 'Etapa',
      render: (e) => <BadgeStatus tom={e.etapa === 'REMARKETING' ? 'atencao' : 'neutro'}>{e.etapa}</BadgeStatus>,
    },
    { chave: 'ult', titulo: 'Última mensagem', dir: true, classe: 'num', render: (e) => (e.ultima_msg_em ? tempoRelativo(e.ultima_msg_em, agoraMs) : '—') },
    {
      chave: 'st', titulo: 'Status',
      render: (e) => (e.optout ? <BadgeStatus tom="erro">Opt-out</BadgeStatus> : <BadgeStatus tom="ok">Elegível</BadgeStatus>),
    },
  ];

  /* ================================================================
     ABA CAMPANHA — criar, simular, disparar lote, acompanhar alvos
     ================================================================ */
  const [novaAberta, setNovaAberta] = useState(false);
  const [nvNome, setNvNome] = useState('');
  const [nvTemplate, setNvTemplate] = useState('');
  const [lote, setLote] = useState(12);
  const [previa, setPrevia] = useState<ResultadoProcessar | null>(null);
  const [confDisparo, setConfDisparo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProcessar | null>(null);

  const canalCloud = (diagQ.data?.canais ?? []).find((c) => c.status_integracao === 'conectado') ?? null;
  const alvos = alvosQ.data ?? [];
  const porStatus = useMemo(() => {
    const c: Record<string, number> = { pendente: 0, enviado: 0, falhou: 0, optout: 0, pulado: 0 };
    for (const a of alvos) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [alvos]);

  const criarCampanha = async () => {
    if (!canalCloud) { erro('Nenhum canal Cloud API conectado.'); return; }
    if (!nvTemplate) { erro('Escolha um template aprovado.'); return; }
    try {
      await criar.mutateAsync({ nome: nvNome || 'Retomada', template_id: nvTemplate, canal_id: canalCloud.id });
      setNovaAberta(false); setNvNome(''); setNvTemplate('');
      ok('Campanha criada. Agora selecione o público e adicione à campanha.');
    } catch (e) { erro((e as Error).message); }
  };

  const simular = async () => {
    if (!campanha) return;
    try {
      const r = await processar.mutateAsync({ campanha_id: campanha.id, lote, dry_run: true });
      setPrevia(r);
    } catch (e) { erro((e as Error).message); }
  };

  const disparar = async () => {
    if (!campanha) return;
    setConfDisparo(false);
    try {
      const r = await processar.mutateAsync({ campanha_id: campanha.id, lote, dry_run: false });
      setResultado(r);
      ok(`Lote concluído: ${r.enviados ?? 0} enviados · ${r.falhas ?? 0} falhas · ${r.optouts ?? 0} opt-out. Restam ${r.restante_teto ?? '—'} no teto de 24h.`);
    } catch (e) { erro((e as Error).message); }
  };

  const COLS_ALVOS: Coluna<Alvo>[] = [
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (a) => a.contatos?.nome ?? '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (a) => fmtTel(a.telefone) },
    {
      chave: 'st', titulo: 'Status',
      render: (a) => <BadgeStatus tom={ST_ALVO[a.status].tom}>{ST_ALVO[a.status].rotulo}</BadgeStatus>,
    },
    { chave: 'quando', titulo: 'Enviado', dir: true, classe: 'num', render: (a) => (a.enviado_em ? tempoRelativo(a.enviado_em, agoraMs) : '—') },
    { chave: 'erro', titulo: 'Detalhe', render: (a) => a.erro ?? '' },
  ];

  /* ================================================================
     ABA EXCLUÍDOS — wa_optout com desfazer
     ================================================================ */
  const [confDesfazer, setConfDesfazer] = useState<OptoutRow | null>(null);
  const COLS_OPTOUT: Coluna<OptoutRow>[] = [
    { chave: 'nome', titulo: 'Contato', classe: 'nome', render: (o) => o.nome || '—' },
    { chave: 'tel', titulo: 'WhatsApp', classe: 'num', render: (o) => fmtTel(o.telefone) },
    { chave: 'motivo', titulo: 'Motivo', render: (o) => <BadgeStatus tom={o.motivo === 'manual' ? 'neutro' : 'atencao'}>{MOTIVO_ROTULO[o.motivo] ?? o.motivo}</BadgeStatus> },
    { chave: 'detalhe', titulo: 'Detalhe', render: (o) => o.detalhe ?? '' },
    { chave: 'quando', titulo: 'Quando', dir: true, classe: 'num', render: (o) => tempoRelativo(o.criado_em, agoraMs) },
    { chave: 'acoes', titulo: '', dir: true, render: (o) => <BotaoMini onClick={() => setConfDesfazer(o)}>Desfazer</BotaoMini> },
  ];

  /* ================================================================ */
  const carregando = elegQ.isLoading || campQ.isLoading;

  return (
    <div className="pg-disparo">
      <header className="dsp-cab sobe">
        <div>
          <h1>Disparo</h1>
          <p className="sub">
            Campanha de template aprovado pelo canal oficial · opt-out respeitado sempre ·
            teto {campanha?.teto_24h ?? 200}/24h no servidor
          </p>
        </div>
        <Chips>
          <Chip ativo={aba === 'publico'} onClick={() => setAba('publico')}>Público {elegiveis.filter((e) => !e.optout).length}</Chip>
          <Chip ativo={aba === 'campanha'} onClick={() => setAba('campanha')}>Campanha {alvos.length ? `· ${porStatus.pendente} pend.` : ''}</Chip>
          <Chip ativo={aba === 'excluidos'} onClick={() => setAba('excluidos')}>Excluídos {optQ.data?.length ?? 0}</Chip>
        </Chips>
      </header>

      {aviso && <div className={aviso.tom === 'ok' ? 'dsp-aviso ok' : 'dsp-aviso erro'} role="status">{aviso.texto}</div>}

      {carregando ? (
        <CardVidro style={{ borderRadius: 12, padding: 16 }}><SkeletonTexto linhas={6} /></CardVidro>
      ) : (
        <>
          {/* ---------------- PÚBLICO ---------------- */}
          {aba === 'publico' && (
            <>
              <div className="dsp-filtros sobe" style={{ animationDelay: '.06s' }}>
                <div className="dsp-busca">
                  <Input placeholder="Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no público elegível" />
                </div>
                <Chips>
                  <Chip ativo={etapasSel.size === 0} onClick={() => setEtapasSel(new Set())}>Todas {elegiveis.length}</Chip>
                  {etapas.map((et) => (
                    <Chip key={et.nome} ativo={etapasSel.has(et.nome)} onClick={() => alternarEtapa(et.nome)}>
                      {et.nome} {et.total}
                    </Chip>
                  ))}
                </Chips>
                <BotaoSec onClick={selecionarVisiveis}>Selecionar visíveis</BotaoSec>
              </div>

              <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.12s' }}>
                {listaPublico.length === 0 ? (
                  <EstadoVazio titulo="Ninguém neste filtro" descricao="O público elegível vem do Kanban: coluna REMARKETING + LEAD NOVO com conversa real (a pessoa respondeu)." />
                ) : (
                  <TabelaPadrao
                    colunas={COLS_PUBLICO}
                    linhas={listaPublico}
                    chave={(e) => e.contato_id}
                    selecao={{
                      selecionadas: sel,
                      aoAlternar: alternarSel,
                      aoLimpar: () => setSel(new Set()),
                      acoes: [
                        { rotulo: campanha ? 'Adicionar à campanha' : 'Criar campanha…', onClick: (ids) => (campanha ? void adicionarSelecionados(ids) : (setAba('campanha'), setNovaAberta(true))) },
                        { rotulo: 'Marcar opt-out', onClick: (ids) => setConfOptout(ids) },
                      ],
                      rotuloContagem: (n) => `${n} selecionado${n === 1 ? '' : 's'}`,
                    }}
                    rodape={{
                      texto: `${listaPublico.length} elegíveis${etapasSel.size ? ` em ${etapasSel.size} etapa${etapasSel.size > 1 ? 's' : ''}` : ''} · ${elegiveis.filter((e) => e.optout).length} em opt-out ficam fora automaticamente`,
                    }}
                  />
                )}
              </CardVidro>
            </>
          )}

          {/* ---------------- CAMPANHA ---------------- */}
          {aba === 'campanha' && !campanha && (
            <CardVidro spot sobe style={{ borderRadius: 12 }}>
              <EstadoVazio
                titulo="Nenhuma campanha ativa"
                descricao={templatesAprovados.length
                  ? 'Crie a campanha, escolha o template aprovado e depois adicione o público.'
                  : 'Nenhum template APROVADO ainda. Sincronize os modelos na página Integrações quando a Meta aprovar.'}
                acao={templatesAprovados.length ? { rotulo: 'Nova campanha', onClick: () => setNovaAberta(true) } : undefined}
              />
            </CardVidro>
          )}

          {aba === 'campanha' && campanha && (
            <>
              <div className="dsp-kpis sobe" style={{ animationDelay: '.06s' }}>
                <Kpi rotulo="Pendentes" valor={porStatus.pendente} />
                <Kpi rotulo="Enviados" valor={porStatus.enviado} />
                <Kpi rotulo="Falhas" valor={porStatus.falhou} />
                <Kpi rotulo="Opt-out" valor={porStatus.optout + porStatus.pulado} />
              </div>

              <CardVidro spot sobe style={{ borderRadius: 12, padding: 16, animationDelay: '.1s' }}>
                <div className="dsp-painel">
                  <div className="dsp-info">
                    <strong>{campanha.nome}</strong>
                    <span className="num">
                      template {(tplQ.data ?? []).find((t) => t.id === campanha.template_id)?.nome ?? '—'} ·
                      canal {canalCloud?.nome_interno ?? '—'} · teto {campanha.teto_24h}/24h
                    </span>
                  </div>
                  <div className="dsp-acoes">
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
                {resultado && !resultado.dry_run && (
                  <p className="dsp-resultado num" role="status">
                    Último lote: {resultado.enviados ?? 0} enviados · {resultado.falhas ?? 0} falhas · {resultado.optouts ?? 0} opt-out
                    {typeof resultado.restante_teto === 'number' ? ` · restam ${resultado.restante_teto} no teto de 24h` : ''}
                  </p>
                )}
              </CardVidro>

              <CardVidro spot sobe style={{ borderRadius: 12, animationDelay: '.14s' }}>
                {alvos.length === 0 ? (
                  <EstadoVazio titulo="Campanha sem alvos" descricao="Volte à aba Público, selecione os contatos e use “Adicionar à campanha”." acao={{ rotulo: 'Ir para o público', onClick: () => setAba('publico') }} />
                ) : (
                  <TabelaPadrao colunas={COLS_ALVOS} linhas={alvos} chave={(a) => a.id} rodape={{ texto: `${alvos.length} alvos` }} />
                )}
              </CardVidro>
            </>
          )}

          {/* ---------------- EXCLUÍDOS ---------------- */}
          {aba === 'excluidos' && (
            <CardVidro spot sobe style={{ borderRadius: 12 }}>
              {(optQ.data ?? []).length === 0 ? (
                <EstadoVazio titulo="Ninguém em opt-out" descricao="Quem responder SAIR (ou for marcado manualmente) aparece aqui e nunca mais recebe disparo." />
              ) : (
                <TabelaPadrao colunas={COLS_OPTOUT} linhas={optQ.data ?? []} chave={(o) => o.contato_id} rodape={{ texto: `${optQ.data?.length ?? 0} contatos fora de qualquer disparo` }} />
              )}
            </CardVidro>
          )}
        </>
      )}

      {/* ---------- modal: nova campanha ---------- */}
      <ModalV2
        aberto={novaAberta}
        aoFechar={() => setNovaAberta(false)}
        titulo="Nova campanha de disparo"
        rodape={(
          <>
            <BotaoSec onClick={() => setNovaAberta(false)}>Cancelar</BotaoSec>
            <BotaoPrimario onClick={() => void criarCampanha()} disabled={criar.isPending}>{criar.isPending ? 'Criando…' : 'Criar campanha'}</BotaoPrimario>
          </>
        )}
      >
        <div className="dsp-form">
          <label className="dsp-campo">
            <span>Nome</span>
            <Input value={nvNome} onChange={(e) => setNvNome(e.target.value)} placeholder="Retomada agosto" />
          </label>
          <label className="dsp-campo">
            <span>Template (só aprovados)</span>
            <select className="inp" value={nvTemplate} onChange={(e) => setNvTemplate(e.target.value)} aria-label="Template aprovado">
              <option value="">Escolher…</option>
              {templatesAprovados.map((t) => <option key={t.id} value={t.id}>{t.nome} · {t.idioma}</option>)}
            </select>
          </label>
          <p className="dsp-nota">
            Canal: <strong>{canalCloud?.nome_interno ?? 'nenhum Cloud API conectado'}</strong> · teto fixo de 200/24h
            (o servidor conta as últimas 24h e recusa passar disso, some com o remarketing automático).
          </p>
        </div>
      </ModalV2>

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
        aberto={confDisparo}
        titulo={`Disparar ${Math.min(lote, porStatus.pendente)} mensagens agora?`}
        mensagem={`Template real pelo canal ${canalCloud?.nome_interno ?? 'Cloud API'} para os ${Math.min(lote, porStatus.pendente)} primeiros pendentes. Custa dinheiro e não tem desfazer.`}
        rotuloConfirmar="Disparar"
        destrutivo
        carregando={processar.isPending}
        aoConfirmar={() => void disparar()}
        aoCancelar={() => setConfDisparo(false)}
      />
      <ConfirmDialogV2
        aberto={!!confOptout}
        titulo={`Marcar ${confOptout?.length ?? 0} contato(s) como opt-out?`}
        mensagem="Eles saem de qualquer disparo e remarketing (o atendimento normal continua). Dá para desfazer na aba Excluídos."
        rotuloConfirmar="Marcar opt-out"
        carregando={optManual.isPending}
        aoConfirmar={async () => {
          const ids = confOptout ?? [];
          setConfOptout(null);
          try {
            for (const id of ids) await optManual.mutateAsync({ contato_id: id, detalhe: 'via painel (Disparo)' });
            setSel(new Set());
            ok(`${ids.length} contato(s) marcados como opt-out.`);
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
