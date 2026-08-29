/* Importador de planilha do Modo Cobrança (Fase C, 29/08).
   Modelo = a planilha do legado "Gestão Mensal" que o dono mandou:
   colunas cadastrais rotuladas + colunas de pagamento cujo CABEÇALHO é
   uma DATA (o vencimento daquele mês). Lemos pelos cabeçalhos, não por
   posição — imune ao bug dos "11 meses fixos" do importador antigo
   (a 12ª coluna corrompia o banco recebedor).
   O CICLO do cliente = dia da PRIMEIRA data de pagamento (turma D##).
   Senha do INSS NÃO é importada nesta versão (nunca em claro).
   A planilha não tem coluna de WhatsApp — todo importado nasce ⚠ sem
   número, para cadastrar depois (fluxo já existente). */
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useCriarCobranca } from '@/data/cobrancas';
import { criarContatoCobranca, vincularCiclo, type CicloReal } from '@/data/cobrancaCiclos';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../components';

interface LinhaImport {
  nome: string;
  comercial: string | null;
  nb: string | null;
  cpf: string | null;
  bancoOrigem: string | null;
  bancoRecebe: string | null;
  parcelaOriginal: string | null;
  situacaoDebito: string | null;
  reclame: string | null;
  mensalidade: number;      // moda dos valores pagos na linha (0 = não detectada)
}
interface Leitura {
  linhas: LinhaImport[];
  ignoradas: number;
  dia: number | null;       // dia do 1º mês de pagamento → ciclo D##
  meses: number;
  semMensalidade: number;
}

const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

function lerPlanilha(buf: ArrayBuffer): Leitura {
  const wb = XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  if (!rows.length) throw new Error('Planilha vazia.');
  const header = rows[0];

  const colData = (rotulo: string) => header.findIndex((h) => norm(h).includes(rotulo));
  const iCliente = colData('CLIENTE');
  if (iCliente < 0) throw new Error('Não achei a coluna CLIENTE — confira se é o modelo padrão.');
  const iComercial = colData('COMERCIAL');
  const iNb = header.findIndex((h) => norm(h) === 'NB');
  const iCpf = colData('CPF');
  const iBanco = header.findIndex((h) => norm(h) === 'BANCO');
  const iBancoRecebe = colData('BANCO QUE RECEBE');
  const iParcela = colData('PARCELA');
  const iDebito = colData('PAROU O DEBITO');
  const iReclame = colData('RECLAME');
  // colunas de pagamento: cabeçalho é DATA
  const colsPag = header.map((h, i) => ({ h, i })).filter((x) => x.h instanceof Date).map((x) => ({ i: x.i, data: x.h as Date }));
  if (!colsPag.length) throw new Error('Não achei colunas de pagamento (cabeçalhos com data).');

  const txt = (r: unknown[], i: number) => (i >= 0 && r[i] != null && String(r[i]).trim() !== '' ? String(r[i]).trim() : null);
  const linhas: LinhaImport[] = [];
  let ignoradas = 0, semMensalidade = 0;
  for (const r of rows.slice(1)) {
    const nome = txt(r, iCliente);
    if (!nome) { ignoradas++; continue; }
    // moda dos valores numéricos > 0 nas células de pagamento
    const valores = colsPag.map((c) => r[c.i]).filter((v): v is number => typeof v === 'number' && v > 0);
    const freq = new Map<number, number>();
    for (const v of valores) freq.set(v, (freq.get(v) ?? 0) + 1);
    const mensalidade = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    if (mensalidade === 0) semMensalidade++;
    linhas.push({
      nome,
      comercial: txt(r, iComercial),
      nb: txt(r, iNb),
      cpf: txt(r, iCpf),
      bancoOrigem: txt(r, iBanco),
      bancoRecebe: txt(r, iBancoRecebe),
      parcelaOriginal: txt(r, iParcela),
      situacaoDebito: txt(r, iDebito),
      reclame: txt(r, iReclame),
      mensalidade,
    });
  }
  return { linhas, ignoradas, dia: colsPag[0]?.data.getDate() ?? null, meses: colsPag.length, semMensalidade };
}

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const proximaDataDoDia = (dia: number) => {
  const h = new Date();
  let m = h.getMonth();
  if (h.getDate() > dia) m += 1;
  const last = new Date(h.getFullYear(), m + 1, 0).getDate();
  return new Date(h.getFullYear(), m, Math.min(dia, last)).toISOString().slice(0, 10);
};

export function ImportarPlanilha({ orgId, ciclos, aoFechar, aoConcluir }: {
  orgId: string;
  ciclos: CicloReal[];
  aoFechar: () => void;
  aoConcluir: (msg: string) => void;
}) {
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const criar = useCriarCobranca();
  const fileRef = useRef<HTMLInputElement>(null);

  async function escolher(f: File) {
    setErro(null); setLeitura(null);
    try { setLeitura(lerPlanilha(await f.arrayBuffer())); }
    catch (e) { setErro((e as Error).message); }
  }

  const codigoCiclo = leitura?.dia != null ? `D${String(leitura.dia).padStart(2, '0')}` : null;
  const ciclo = ciclos.find((c) => c.codigo === codigoCiclo) ?? null;

  async function efetivar() {
    if (!leitura || progresso) return;
    if (!ciclo) { setErro(`O ciclo ${codigoCiclo ?? '?'} não existe — crie na aba Ciclos antes de importar.`); return; }
    // reimportação não pode duplicar a base (revisão 29/08): quem já tem
    // cobrança não-cancelada com o MESMO nome é pulado
    const { data: exist } = await supabase!
      .from('cobrancas').select('contato:contatos(nome)')
      .eq('organizacao_id', orgId).neq('status', 'cancelado');
    const nomesExistentes = new Set((exist ?? [])
      .map((r) => ((r.contato as unknown as { nome: string | null } | null)?.nome ?? '').trim().toUpperCase())
      .filter(Boolean));
    const jaExistem = leitura.linhas.filter((l) => nomesExistentes.has(l.nome.trim().toUpperCase())).length;
    const validas = leitura.linhas.filter((l) => l.mensalidade > 0 && !nomesExistentes.has(l.nome.trim().toUpperCase()));
    setProgresso({ feito: 0, total: validas.length });
    const falhas: string[] = [];
    for (const [k, l] of validas.entries()) {
      let contatoOrfao: string | null = null;
      try {
        const contatoId = await criarContatoCobranca(orgId, l.nome, '');
        contatoOrfao = contatoId;
        const cobId = await criar.mutateAsync({
          contatoId, valor: l.mensalidade, dataPrimeira: proximaDataDoDia(leitura.dia!), ciclos: 6,
          responsavelId: null, servico: 'Mensalidade (importado)',
          observacoes: [l.comercial && `comercial: ${l.comercial}`, l.situacaoDebito && `débito: ${l.situacaoDebito}`, l.reclame && `reclame: ${l.reclame}`].filter(Boolean).join(' · ') || null,
        });
        await vincularCiclo(cobId, ciclo.id);
        await supabase!.from('cobrancas').update({
          nb: l.nb, banco_origem: l.bancoOrigem, banco_recebimento: l.bancoRecebe,
          parcela_texto_original: l.parcelaOriginal,
          flags_importacao: { origem: 'planilha_gestao_mensal', cpf_informado: !!l.cpf },
        }).eq('id', cobId);
        contatoOrfao = null; // cobrança criada — contato não é mais órfão
      } catch (e) {
        falhas.push(`${l.nome}: ${(e as Error).message}`);
        // best-effort: não deixa contato órfão se a cobrança não nasceu
        if (contatoOrfao) await supabase!.from('contatos').delete().eq('id', contatoOrfao).then(() => undefined, () => undefined);
      }
      setProgresso({ feito: k + 1, total: validas.length });
    }
    const semValor = leitura.linhas.filter((l) => l.mensalidade <= 0).length;
    aoConcluir(`Importados ${validas.length - falhas.length} clientes no ciclo ${ciclo.codigo}.` +
      (jaExistem ? ` ${jaExistem} já existiam (pulados).` : '') +
      (semValor ? ` ${semValor} sem mensalidade detectável ficaram de fora.` : '') +
      (falhas.length ? ` ${falhas.length} falharam: ${falhas.slice(0, 3).join(' | ')}` : ''));
    aoFechar();
  }

  return (
    <ModalV2 aberto aoFechar={() => { if (!progresso) aoFechar(); }} largura={560}
      titulo={<div>Importar planilha<div className="mod-sub">Modelo Gestão Mensal — colunas de pagamento com data no cabeçalho.</div></div>}
      rodape={
        <>
          <BotaoSec onClick={aoFechar} disabled={!!progresso}>Cancelar</BotaoSec>
          <BotaoPrimario onClick={efetivar} disabled={!leitura || !!progresso || leitura.linhas.length === 0}>
            {progresso ? `Importando ${progresso.feito}/${progresso.total}…` : leitura ? `Importar ${leitura.linhas.filter((l) => l.mensalidade > 0).length} clientes` : 'Importar'}
          </BotaoPrimario>
        </>
      }>
      <div className="form-grid">
        <div className="campo">
          <label>Arquivo (.xlsx) *</label>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="inp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); }} disabled={!!progresso} />
        </div>
        {leitura && (
          <div className="cm-imp-preview">
            <div><span>Clientes lidos</span><strong className="num">{leitura.linhas.length}</strong></div>
            <div><span>Ciclo detectado</span><strong className="num">{codigoCiclo}{ciclo ? '' : ' (não existe — crie antes)'}</strong></div>
            <div><span>Meses na planilha</span><strong className="num">{leitura.meses}</strong></div>
            <div><span>Mensalidade (1º cliente)</span><strong className="num">{leitura.linhas[0] ? fmtBRL(leitura.linhas[0].mensalidade) : '—'}</strong></div>
            {leitura.semMensalidade > 0 && <div><span>Sem mensalidade detectável</span><strong className="num" style={{ color: 'var(--ambar)' }}>{leitura.semMensalidade} (ficam de fora)</strong></div>}
            {leitura.ignoradas > 0 && <div><span>Linhas sem nome (ignoradas)</span><strong className="num">{leitura.ignoradas}</strong></div>}
          </div>
        )}
        {leitura && (
          <p className="cm-hint">
            A planilha não traz WhatsApp — todos os importados nascem com o alerta <b>⚠ cadastrar número</b>.
            Senha do INSS e histórico de pagamento <b>não</b> são importados nesta versão.
          </p>
        )}
        {erro && <div className="aviso-inline erro" role="alert">{erro}</div>}
      </div>
    </ModalV2>
  );
}
