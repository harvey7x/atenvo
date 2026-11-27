/* =====================================================================
   Implementação DEMO da CobrancaRepo: 100% localStorage (chave
   alfa_gestao_v4), espelhando o gsCarregar/gsSalvar de cobrancaMotor.
   Nada sobe pra rede. O seed inicial continua sendo semeado pela tela
   (cobrancaMotor) na primeira carga; aqui só lemos/gravamos o blob.
   ===================================================================== */
import type { CobrancaRepo, CicloDataRow, MoverTurmaResultado, EsvaziarResultado } from './cobrancaRepo';
import { gsCarregar as ler, gsSalvar as gravar, garantirComp, decididaRegistrar } from './demoStore';
import type {
  Dados, GLinha, Entrada, MovFin, NovoLead, PatchLead, SitDebito,
  LancarPagamentoInput, MarcarCelulaInput, CampoSenha, StatusCancelamento, EstadoCancelamento, ResultadoCancelamento,
} from './types';

function novoId() {
  try { return crypto.randomUUID(); } catch { return `demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}
const idxComp = (d: Dados, comp: string) => d.comps.indexOf(comp);
const setCelula = (l: GLinha, i: number, v: string) => { if (i >= 0) { const c = [...l.celulas]; c[i] = v; l.celulas = c; } };

/* import (demo) fiel ao real: os meses da planilha entram na grade por UNIÃO
   ordenada e as células são casadas por NOME do mês — a RPC real grava
   pagamentos chaveados por comp, nunca por posição. Antes, uma planilha com
   meses diferentes da base desalinhava as células (a de julho caía na coluna
   de abril). Também normaliza como o real: número = pago, "não pagou" marca,
   qualquer outro texto é IGNORADO e contado; e regenera os ids (reimportar a
   mesma planilha não pode duplicar id). MUTA `d`; o caller grava. */
function fundirImport(d: Dados, comps: string[], linhas: GLinha[], situacao: SitDebito, dia: number): { leads: number; celulasIgnoradas: number } {
  const uniao = [...new Set([...d.comps, ...comps])].sort(); // 'YYYY-MM' ordena cronológico
  if (uniao.length !== d.comps.length) {
    // a grade cresceu: reindexa as células de quem JÁ estava na base (por nome)
    const antigos = d.comps;
    d.linhas = d.linhas.map((l) => ({ ...l, celulas: uniao.map((c) => { const k = antigos.indexOf(c); return k >= 0 ? (l.celulas[k] ?? '-') : '-'; }) }));
  }
  let ignoradas = 0;
  const marca = Date.now().toString(36);
  const novos = linhas.map((l, n) => ({
    ...l, id: `imp-${marca}-${n}`, situacao, dia,
    celulas: uniao.map((c) => {
      const k = comps.indexOf(c); const s = k >= 0 ? String(l.celulas[k] ?? '').trim() : '';
      if (!s || s === '-') return '-';
      if (/n[aã]o\s*pagou/i.test(s)) return 'NÃO PAGOU';
      if (/^\d{1,6}([.,]\d{1,2})?$/.test(s)) return s;
      ignoradas++; return '-';
    }),
  }));
  d.comps = uniao;
  d.linhas = [...novos, ...d.linhas];
  return { leads: novos.length, celulasIgnoradas: ignoradas };
}

const estadoCanc = (l: GLinha): EstadoCancelamento => ({
  id: l.id, cancelamento: l.cancelamento ?? null, cancelado_em: l.canceladoEm ?? null, cancelado_por_nome: l.canceladoPorNome ?? null,
  cancelamento_motivo: l.cancelamentoMotivo ?? null, cancelamento_em: l.cancelamentoEm ?? null, cancelamento_por_nome: l.cancelamentoPorNome ?? null,
});
const semCancelamento = {
  cancelamento: null, canceladoEm: undefined, canceladoPorNome: undefined, cancelamentoMotivo: undefined, cancelamentoEm: undefined, cancelamentoPorNome: undefined,
} as const;

export function criarRepoDemo(): CobrancaRepo {
  return {
    // os Cancelados ficam no MESMO blob (com `cancelamento`); a tela recebe separado, como o real
    async carregar() {
      const d = ler();
      return { ...d, linhas: d.linhas.filter((l) => !l.cancelamento), cancelados: d.linhas.filter((l) => !!l.cancelamento) };
    },

    async criarLead(input: NovoLead) {
      const d = ler();
      const lead: GLinha = { ...input, id: novoId(), celulas: input.celulas ?? d.comps.map(() => '-') };
      d.linhas = [lead, ...d.linhas]; gravar(d); return lead; // prepend: novo aparece no topo (paridade)
    },
    async editarLead(id: string, patch: PatchLead) {
      const d = ler();
      d.linhas = d.linhas.map((l) => (l.id === id ? { ...l, ...patch } : l));
      gravar(d);
    },
    async excluirLead(id: string) {
      const d = ler(); d.linhas = d.linhas.filter((l) => l.id !== id); gravar(d);
    },
    async restaurarExcluido(cap: GLinha) {
      const d = ler();
      if (d.linhas.some((l) => l.id === cap.id)) return; // já está lá
      d.linhas = [cap, ...d.linhas]; gravar(d);
    },
    async removerNovos(): Promise<{ removidos: string[] }> {
      const d = ler();
      // quem está aguardando aprovação fica (igual ao real, mig 53)
      const sai = (l: GLinha) => l.situacao === 'ativo' && !l.paradoPendente && !l.cancelamento;
      const removidos = d.linhas.filter(sai).map((l) => l.id);
      d.linhas = d.linhas.filter((l) => !sai(l)); gravar(d);
      return { removidos };
    },
    async restaurarNovos(caps: GLinha[], _ids: string[]) {
      // demo: os dados vivem no blob capturado (caps); ids não são usados aqui
      const d = ler();
      const tem = new Set(d.linhas.map((l) => l.id));
      const voltam = caps.filter((l) => !tem.has(l.id)); // não duplica quem já está
      d.linhas = [...voltam, ...d.linhas]; gravar(d);
    },

    // CANCELADOS — espelha as RPCs das migs 79–81 (mesmos efeitos, contagens e Desfazer)
    async cancelarLeads(ids: string[], motivo?: string): Promise<ResultadoCancelamento> {
      const d = ler(); const alvo = new Set(ids); const agora = new Date().toISOString(); const antes: EstadoCancelamento[] = [];
      const mot = (motivo ?? '').trim().slice(0, 500) || undefined;
      d.linhas = d.linhas.map((l) => {
        if (!alvo.has(l.id) || l.cancelamento) return l;
        antes.push(estadoCanc(l));
        return { ...l, cancelamento: 'cancelado' as const, canceladoEm: agora, canceladoPorNome: 'Você', cancelamentoMotivo: mot, cancelamentoEm: agora, cancelamentoPorNome: 'Você' };
      });
      gravar(d); return { n: antes.length, demo: { tipo: 'cancelar', marca: agora, antes } };
    },
    async statusCancelamento(ids: string[], status: StatusCancelamento): Promise<ResultadoCancelamento> {
      const d = ler(); const alvo = new Set(ids); const agora = new Date().toISOString(); const antes: EstadoCancelamento[] = [];
      d.linhas = d.linhas.map((l) => {
        if (!alvo.has(l.id) || !l.cancelamento || l.cancelamento === status) return l;
        antes.push(estadoCanc(l));
        return { ...l, cancelamento: status, cancelamentoEm: agora, cancelamentoPorNome: 'Você' };
      });
      gravar(d); return { n: antes.length, demo: { tipo: 'status', marca: agora, antes } };
    },
    async voltarDosCancelados(ids: string[]): Promise<ResultadoCancelamento> {
      const d = ler(); const alvo = new Set(ids); const antes: EstadoCancelamento[] = [];
      d.linhas = d.linhas.map((l) => {
        if (!alvo.has(l.id) || !l.cancelamento) return l;
        antes.push(estadoCanc(l));
        return { ...l, ...semCancelamento };
      });
      gravar(d); return { n: antes.length, demo: { tipo: 'voltar', marca: new Date().toISOString(), antes } };
    },
    async desfazerCancelamento(r: ResultadoCancelamento) {
      const x = r.demo; if (!x) return { n: 0, total: 0 };
      const d = ler(); const por = new Map(x.antes.map((a) => [a.id, a])); let n = 0;
      d.linhas = d.linhas.map((l) => {
        const a = por.get(l.id); if (!a) return l;
        // só quem AINDA está como a ação deixou (o que mudou depois fica)
        const igual = x.tipo === 'voltar' ? !l.cancelamento : l.cancelamentoEm === x.marca && l.cancelamentoPorNome === 'Você';
        if (!igual) return l;
        n++;
        return a.cancelamento ? {
          ...l, cancelamento: a.cancelamento, canceladoEm: a.cancelado_em ?? undefined, canceladoPorNome: a.cancelado_por_nome ?? undefined,
          cancelamentoMotivo: a.cancelamento_motivo ?? undefined, cancelamentoEm: a.cancelamento_em ?? undefined, cancelamentoPorNome: a.cancelamento_por_nome ?? undefined,
        } : { ...l, ...semCancelamento };
      });
      gravar(d); return { n, total: x.antes.length };
    },

    async lancarPagamento({ leadId, comp, valor, comprovante }: LancarPagamentoInput) {
      const d = ler();
      const lead = d.linhas.find((l) => l.id === leadId);
      const ent: Entrada = {
        id: novoId(), leadId, leadNome: lead?.nome ?? '—', comp, valor,
        por: 'Você (comercial)', quando: new Date().toISOString(), comprovante,
      };
      d.pendentes = [ent, ...d.pendentes]; gravar(d); return ent;
    },
    async confirmarEntrada(entradaId: string) {
      const d = ler();
      const e = d.pendentes.find((x) => x.id === entradaId); if (!e) return;
      const lead = d.linhas.find((l) => l.id === e.leadId);
      // mês ainda fora da grade (coluna criada na planilha): entra, como o insert em
      // competencias do confirmar_entrada; centavos preservados (paridade c/ o real)
      if (lead) setCelula(lead, garantirComp(d, e.comp), String(Math.round(e.valor * 100) / 100));
      const agora = new Date().toISOString();
      const mov: MovFin = {
        id: novoId(), leadNome: e.leadNome, comercial: e.por.replace(/\s*\(comercial\)/i, '').trim() || '—',
        comp: e.comp, valor: e.valor, status: 'confirmada', quando: agora, comprovante: e.comprovante,
      };
      d.historico = [mov, ...d.historico];
      d.pendentes = d.pendentes.filter((x) => x.id !== entradaId);
      gravar(d);
      decididaRegistrar({
        id: e.id, leadId: e.leadId, leadNome: e.leadNome, comp: e.comp, valor: e.valor, por: e.por, quando: e.quando,
        estado: 'confirmada', resolvidoEm: agora, temComprovante: !!e.comprovante,
      });
    },
    async recusarEntrada(entradaId: string, motivo?: string) {
      const d = ler();
      const e = d.pendentes.find((x) => x.id === entradaId); if (!e) return;
      const lead = d.linhas.find((l) => l.id === e.leadId);
      const agora = new Date().toISOString();
      const mov: MovFin = {
        id: novoId(), leadNome: e.leadNome, comercial: e.por.replace(/\s*\(comercial\)/i, '').trim() || '—',
        comp: e.comp, valor: e.valor, status: 'recusada', quando: agora, comprovante: e.comprovante,
      };
      d.historico = [mov, ...d.historico];
      d.pendentes = d.pendentes.filter((x) => x.id !== entradaId);
      gravar(d);
      // a decisão (motivo + célula do store agora) fica FORA do histórico: a planilha pinta
      // (lead, comp) de vermelho enquanto o pagamento daquele mês não mudar
      decididaRegistrar({
        id: e.id, leadId: e.leadId, leadNome: e.leadNome, comp: e.comp, valor: e.valor, por: e.por, quando: e.quando,
        estado: 'recusada', resolvidoEm: agora, motivo: motivo?.trim() || undefined, temComprovante: !!e.comprovante,
        celula: lead?.celulas[idxComp(d, e.comp)] ?? '-',
      });
    },
    async excluirMov(movId: string) {
      const d = ler();
      d.historico = d.historico.filter((m) => m.id !== movId);
      gravar(d);
    },

    async marcarCelula({ leadId, comp, valor, comprovante }: MarcarCelulaInput) {
      const d = ler();
      const lead = d.linhas.find((l) => l.id === leadId); if (!lead) return;
      setCelula(lead, garantirComp(d, comp), String(Math.round(valor * 100) / 100)); // centavos preservados (paridade c/ o real)
      if (comprovante) {
        d.historico = [{
          id: novoId(), leadNome: lead.nome, comercial: lead.comercial || '—', comp, valor,
          status: 'confirmada', quando: new Date().toISOString(), comprovante,
        }, ...d.historico];
      }
      gravar(d);
    },
    async marcarNaoPagou(leadId: string, comp: string) {
      const d = ler(); const lead = d.linhas.find((l) => l.id === leadId); if (!lead) return;
      setCelula(lead, garantirComp(d, comp), 'NÃO PAGOU'); gravar(d);
    },
    async limparCelula(leadId: string, comp: string) {
      const d = ler(); const lead = d.linhas.find((l) => l.id === leadId); if (!lead) return;
      setCelula(lead, idxComp(d, comp), '-'); gravar(d);
    },
    async adicionarMes(comp: string) {
      const d = ler();
      if (d.comps.includes(comp)) return;
      d.comps = [...d.comps, comp]; // coluna nova no fim; alinha as células de cada lead
      d.linhas = d.linhas.map((l) => ({ ...l, celulas: [...l.celulas, '-'] }));
      gravar(d);
    },

    async editarCiclo(dia: number, comp: string, campo: 'inicio' | 'fim' | 'cobranca', valor: string, padrao: { inicio: string; fim: string }) {
      const d = ler(); // estado FRESCO na hora (anti-corrida entre edições rápidas de início/fim)
      const cd = d.ciclosDatas ?? {};
      const win = { ...(cd[String(dia)]?.[comp] ?? padrao), [campo]: valor };
      d.ciclosDatas = { ...cd, [String(dia)]: { ...(cd[String(dia)] ?? {}), [comp]: win } };
      gravar(d);
    },
    async moverTurma(diaDe: number, diaPara: number): Promise<MoverTurmaResultado> {
      // espelha a RPC mover_turma do real: move leads + limpa datas manuais órfãs
      const d = ler();
      const compCorrente = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; })();
      const fusao = d.linhas.some((l) => l.dia === diaPara);
      const movidos = d.linhas.filter((l) => l.dia === diaDe).map((l) => l.id);
      d.linhas = d.linhas.map((l) => (l.dia === diaDe ? { ...l, dia: diaPara } : l));
      const cd = d.ciclosDatas ?? {};
      const origemDatas: CicloDataRow[] = [];
      const deK = String(diaDe), paraK = String(diaPara);
      if (cd[deK]) {
        const resto: Record<string, { inicio: string; fim: string; cobranca?: string }> = {};
        for (const [comp, win] of Object.entries(cd[deK])) {
          if (comp >= compCorrente) origemDatas.push({ dia: diaDe, comp, inicio: win.inicio ?? null, fim: win.fim ?? null, cobranca: win.cobranca ?? null });
          else resto[comp] = win;
        }
        cd[deK] = resto;
      }
      let destinoLimpas = 0;
      if (!fusao && cd[paraK]) {
        const resto: Record<string, { inicio: string; fim: string; cobranca?: string }> = {};
        for (const [comp, win] of Object.entries(cd[paraK])) {
          if (comp >= compCorrente) destinoLimpas += 1; else resto[comp] = win;
        }
        cd[paraK] = resto;
      }
      d.ciclosDatas = cd;
      gravar(d);
      return { movidos, origemDatas, destinoLimpas, fusao };
    },
    async reporCiclosDatas(rows: CicloDataRow[]) {
      if (!rows.length) return;
      const d = ler();
      const cd = d.ciclosDatas ?? {};
      for (const r of rows) {
        const k = String(r.dia);
        cd[k] = { ...(cd[k] ?? {}), [r.comp]: { inicio: r.inicio ?? '', fim: r.fim ?? '', cobranca: r.cobranca ?? undefined } };
      }
      d.ciclosDatas = cd;
      gravar(d);
    },
    async moverLeadsPorId(ids: string[], dia: number, deDia?: number) {
      if (!ids.length) return;
      const set = new Set(ids);
      const d = ler();
      d.linhas = d.linhas.map((l) => (set.has(l.id) && (deDia == null || l.dia === deDia) ? { ...l, dia } : l));
      gravar(d);
    },
    async salvarOrdemCiclos(dias: number[]) {
      const d = ler(); d.ciclosOrdem = [...dias]; gravar(d);
    },
    async abrirCiclo(dia: number) {
      const d = ler();
      const ab = new Set(d.ciclosAbertos ?? []);
      ab.add(dia);
      d.ciclosAbertos = [...ab].sort((a, b) => a - b);
      gravar(d);
    },
    async fecharCiclo(dia: number) {
      const d = ler();
      d.ciclosAbertos = (d.ciclosAbertos ?? []).filter((x) => x !== dia);
      gravar(d);
    },
    async esvaziarCiclos(): Promise<EsvaziarResultado> {
      // espelha a RPC: todo lead com dia vira "aguardando" (0 no demo ≡ NULL no
      // real) e as datas manuais do mês corrente em diante saem (ficariam órfãs)
      const d = ler();
      const compCorrente = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; })();
      const afetados = d.linhas.filter((l) => l.dia > 0).map((l) => ({ id: l.id, dia: l.dia }));
      d.linhas = d.linhas.map((l) => (l.dia > 0 ? { ...l, dia: 0 } : l));
      const cd = d.ciclosDatas ?? {};
      const datasRemovidas: CicloDataRow[] = [];
      for (const [k, porComp] of Object.entries(cd)) {
        const resto: Record<string, { inicio: string; fim: string; cobranca?: string }> = {};
        for (const [comp, win] of Object.entries(porComp)) {
          if (comp >= compCorrente) datasRemovidas.push({ dia: Number(k), comp, inicio: win.inicio ?? null, fim: win.fim ?? null, cobranca: win.cobranca ?? null });
          else resto[comp] = win;
        }
        cd[k] = resto;
      }
      d.ciclosDatas = cd;
      gravar(d);
      return { afetados, datasRemovidas };
    },
    async esvaziarCiclo(dia: number): Promise<{ afetados: string[] }> {
      // espelha a RPC: pessoas saem, dia continua ABERTO, datas manuais FICAM
      const d = ler();
      const afetados = d.linhas.filter((l) => l.dia === dia).map((l) => l.id);
      d.linhas = d.linhas.map((l) => (l.dia === dia ? { ...l, dia: 0 } : l));
      const ab = new Set(d.ciclosAbertos ?? []); ab.add(dia);
      d.ciclosAbertos = [...ab].sort((a, b) => a - b);
      gravar(d);
      return { afetados };
    },
    async senhasGrade() {
      const d = ler();
      return d.linhas
        .filter((l) => l.senha || l.reclameSenha)
        .map((l) => ({ leadId: l.id, inss: l.senha ?? '', reclame: l.reclameSenha ?? '' }));
    },
    async marcarParado(leadId: string, dataParou: string) {
      const d = ler();
      // dia = 0 → "aguardando ciclo": o direcionamento é um comando separado na Gestão
      d.linhas = d.linhas.map((l) => (l.id === leadId ? { ...l, situacao: 'cancelado', dataParou, dia: 0 } : l));
      gravar(d);
    },
    // aprovação do débito parado — espelha as RPCs da mig 52 (mesmas regras e erros)
    async solicitarParado(leadId: string, dataParou: string, quem?: string) {
      const d = ler(); const l = d.linhas.find((x) => x.id === leadId);
      if (!l) throw new Error('cliente não encontrado');
      if (l.situacao !== 'ativo') throw new Error('este cliente já está em cobrança');
      if (l.paradoPendente) throw new Error('este cliente já está aguardando aprovação');
      d.linhas = d.linhas.map((x) => (x.id === leadId ? {
        ...x, paradoPendente: true, dataParou: dataParou || '',
        paradoSolicitadoNome: quem || 'Você', paradoSolicitadoEm: new Date().toISOString(),
        paradoAprovadoNome: undefined, paradoAprovadoEm: undefined,
      } : x));
      gravar(d);
    },
    async aprovarParado(leadId: string, a: { dia: number; valor: number | null; dataParou: string }, quem?: string) {
      if (!(a.dia >= 1 && a.dia <= 31)) throw new Error('escolha o ciclo (dia de 1 a 31)');
      if (a.valor != null && a.valor < 0) throw new Error('valor inválido');
      const d = ler(); const l = d.linhas.find((x) => x.id === leadId);
      if (!l) throw new Error('cliente não encontrado');
      if (!l.paradoPendente || l.situacao !== 'ativo') throw new Error('este cliente não está aguardando aprovação');
      d.linhas = d.linhas.map((x) => (x.id === leadId ? {
        ...x, situacao: 'cancelado', dia: a.dia, valor: a.valor ?? x.valor, dataParou: a.dataParou || x.dataParou,
        paradoPendente: false, paradoAprovadoNome: quem || 'Você', paradoAprovadoEm: new Date().toISOString(),
      } : x));
      gravar(d);
    },
    async recusarParado(leadId: string) {
      const d = ler(); const l = d.linhas.find((x) => x.id === leadId);
      if (!l) throw new Error('cliente não encontrado');
      if (!l.paradoPendente) throw new Error('este cliente não está aguardando aprovação');
      d.linhas = d.linhas.map((x) => (x.id === leadId ? { ...x, paradoPendente: false, dataParou: '' } : x));
      gravar(d);
    },
    async cancelarParado(leadId: string, dataParouAnterior?: string) {
      const d = ler(); const l = d.linhas.find((x) => x.id === leadId);
      if (!l) throw new Error('cliente não encontrado');
      // já decidido (aprovado/recusado): erro, igual ao real (mig 53) — o Desfazer não finge sucesso
      if (!l.paradoPendente) throw new Error('este pedido já foi decidido (aprovado ou recusado) — peça ao financeiro para reverter');
      d.linhas = d.linhas.map((x) => (x.id === leadId ? { ...x, paradoPendente: false, dataParou: dataParouAnterior ?? '' } : x));
      gravar(d);
    },
    async reabrirParado(leadId: string, a: { dia: number; valor: number; dataParou: string }) {
      const d = ler(); const l = d.linhas.find((x) => x.id === leadId);
      if (!l) throw new Error('cliente não encontrado');
      // só de um estado que veio de aprovar/recusar (igual ao real, mig 53)
      if (!((l.situacao === 'cancelado' && l.paradoAprovadoEm) || (l.situacao === 'ativo' && !l.paradoPendente))) throw new Error('nada para desfazer: o cliente mudou depois da decisão');
      d.linhas = d.linhas.map((x) => (x.id === leadId ? {
        ...x, situacao: 'ativo', paradoPendente: true, dia: a.dia >= 1 && a.dia <= 31 ? a.dia : 0,
        valor: a.valor, dataParou: a.dataParou || '', paradoAprovadoNome: undefined, paradoAprovadoEm: undefined,
      } : x));
      gravar(d);
    },
    async contarPendentesParado() {
      return ler().linhas.filter((l) => l.paradoPendente && l.situacao === 'ativo' && !l.cancelamento).length;
    },

    async importarComCiclo({ linhas, comps, situacao, dataCobranca }: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; cicloNome: string; dataCobranca: string }) {
      const d = ler();
      const dia = Number(dataCobranca.slice(8, 10)) || 1;
      const res = fundirImport(d, comps, linhas, situacao, dia);
      gravar(d);
      return { ...res, dia };
    },
    // dentro de um ciclo existente: dia fixo; ciclosDatas e ciclosAbertos ficam como estão
    async importarNoCiclo({ linhas, comps, situacao, dia }: { linhas: GLinha[]; comps: string[]; situacao: SitDebito; dia: number }) {
      const d = ler();
      const res = fundirImport(d, comps, linhas, situacao, dia);
      gravar(d);
      return res;
    },

    async assinarComprovante(comp: { url?: string; path?: string }) { return comp.url ?? comp.path ?? ''; },
    async revelarSenha(leadId: string, campo: CampoSenha) {
      const d = ler(); const lead = d.linhas.find((l) => l.id === leadId);
      return (campo === 'inss' ? lead?.senha : lead?.reclameSenha) ?? '';
    },
  };
}
