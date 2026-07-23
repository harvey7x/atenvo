import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/Modal';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useOrgUsuarios } from '@/data/atendimento';
import { supabase } from '@/lib/supabase';
import { parseFichaJudicial, PARSER_VERSION, type CampoOrigem, type FichaJudicialParseResult } from '@/lib/fichaJudicialParser';
import { formatarFichaJudicial } from '@/lib/fichaJudicialFormatter';
import { parseMoedaBRL, cpfValido, somenteDigitos, normalizaTelefone, formataTelefoneBR, calculaIdade, hojeISOSaoPaulo } from '@/lib/fichaJudicialNormalizers';
import { conferirFichaComBloco } from '@/lib/fichaJudicialValidacao';
import {
  useCriarFichaJudicial, useAtualizarFichaJudicial, useFinalizarFichaJudicial,
  type FichaJudicial, type FichaRevisao, type FichaSnapshot, type FichaTipoBeneficio,
} from '@/data/fichaJudicial';
import './FichaJudicialModal.css';

const TIPOS_BENEF: [FichaTipoBeneficio, string][] = [['aposentadoria', 'Aposentadoria'], ['pensao_por_morte', 'Pensão por morte'], ['bpc_loas', 'BPC/LOAS'], ['outro', 'Outro']];
const TIPOS_REV: FichaRevisao['tipo'][] = ['agibank', 'rmc', 'rcc', 'emprestimo', 'outro'];
// DATA da ficha = hoje em America/Sao_Paulo (toISOString() é UTC e viraria o dia depois das 21h).
const hojeISO = () => hojeISOSaoPaulo();
const isoParaInput = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '');

interface Vinculos { organizacaoId: string; contatoId: string; oportunidadeId?: string | null; conversaId?: string | null; canalId?: string | null; }
interface ContatoAtual { nome?: string; cpf?: string; telefone?: string; email?: string }
interface OportunidadeAtual { tipoBeneficio?: string | null; numeroBeneficio?: string | null; instituicao?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  vinculos: Vinculos;
  fichaInicial?: FichaJudicial | null;
  modo?: 'novo' | 'continuar' | 'visualizar';
  responsavelSugerido?: { id?: string | null; nome?: string };
  contatoAtual?: ContatoAtual;
  oportunidadeAtual?: OportunidadeAtual;
}

// IDADE não é campo de formulário: é sempre calculada (nascimento × data da ficha).
type Form = {
  nome: string; cpf: string; cidade: string; uf: string; telefone: string; email: string; rg: string; estadoCivil: string;
  nascimento: string;
  beneficioNumero: string; especieCodigo: string; especieDescricao: string; tipoBeneficio: '' | FichaTipoBeneficio;
  bancoCodigo: string; bancoNome: string; valorBeneficio: string; dataConsulta: string;
  responsavelId: string;
};
const FORM0: Form = { nome: '', cpf: '', cidade: '', uf: '', telefone: '', email: '', rg: '', estadoCivil: '', nascimento: '', beneficioNumero: '', especieCodigo: '', especieDescricao: '', tipoBeneficio: '', bancoCodigo: '', bancoNome: '', valorBeneficio: '', dataConsulta: '', responsavelId: '' };

function fichaParaForm(f: FichaJudicial): Form {
  return {
    nome: f.nome, cpf: f.cpf, cidade: f.cidade, uf: f.uf, telefone: f.telefone, email: f.email, rg: f.rg, estadoCivil: f.estadoCivil,
    nascimento: isoParaInput(f.nascimento),
    beneficioNumero: f.beneficioNumero, especieCodigo: f.especieCodigo, especieDescricao: f.especieDescricao, tipoBeneficio: f.tipoBeneficio ?? '',
    bancoCodigo: f.bancoCodigo, bancoNome: f.bancoNome, valorBeneficio: f.valorBeneficio != null ? String(f.valorBeneficio).replace('.', ',') : '',
    dataConsulta: isoParaInput(f.dataConsulta) || hojeISO(), responsavelId: f.responsavelId ?? '',
  };
}

const IND: Record<CampoOrigem | 'manual', { txt: string; cls: string }> = {
  parser: { txt: 'Encontrado', cls: 'ok' }, calculado: { txt: 'Calculado', cls: 'ok' },
  sugerido: { txt: 'Sugerido', cls: 'warn' }, manual: { txt: 'Manual', cls: 'man' }, nao_encontrado: { txt: 'Revisar', cls: 'warn' },
  revisao_necessaria: { txt: 'Revisar', cls: 'warn' },
};

export function FichaJudicialModal({ open, onClose, vinculos, fichaInicial, modo = 'novo', responsavelSugerido, contatoAtual, oportunidadeAtual }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: usuarios = [] } = useOrgUsuarios();
  const qc = useQueryClient();
  const criar = useCriarFichaJudicial();
  const atualizar = useAtualizarFichaJudicial();
  const finalizar = useFinalizarFichaJudicial();

  const readOnly = modo === 'visualizar' && fichaInicial?.status === 'finalizada';
  const [fichaId, setFichaId] = useState<string | null>(fichaInicial?.id ?? null);
  const [etapa, setEtapa] = useState<'importar' | 'revisar' | 'previa'>(fichaInicial ? (readOnly ? 'previa' : 'revisar') : 'importar');
  const [textoConsulta, setTextoConsulta] = useState(fichaInicial?.textoOriginal ?? '');
  const [textoOriginal, setTextoOriginal] = useState(fichaInicial?.textoOriginal ?? '');
  const [form, setForm] = useState<Form>(fichaInicial ? fichaParaForm(fichaInicial) : { ...FORM0, dataConsulta: hojeISO(), responsavelId: responsavelSugerido?.id ?? '', telefone: normalizaTelefone(contatoAtual?.telefone ?? '') });
  const [revisoes, setRevisoes] = useState<FichaRevisao[]>(fichaInicial?.revisoes ?? []);
  const [telImportado, setTelImportado] = useState(''); // telefone vindo do parser (só p/ divergência)
  const [origem, setOrigem] = useState<Record<string, CampoOrigem | 'manual'>>({});
  // último parse do bloco colado — base da conferência anti-contaminação
  const [parse, setParse] = useState<FichaJudicialParseResult | null>(null);
  // senha temporária — somente no estado local; nunca persistida
  const [senhaInssTemporaria, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [incluirSenhaAoCopiar, setIncluirSenha] = useState(false);
  const [atualizarContatoChk, setAtualizarContato] = useState(false);
  const [atualizarOportunidadeChk, setAtualizarOportunidade] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // limpa a senha ao fechar
  useEffect(() => { if (!open) { setSenha(''); setMostrarSenha(false); setIncluirSenha(false); } }, [open]);

  const setF = (patch: Partial<Form>, manual = true) => {
    setForm((f) => ({ ...f, ...patch }));
    if (manual) setOrigem((o) => { const n = { ...o }; for (const k of Object.keys(patch)) n[k] = 'manual'; return n; });
  };

  // RESET TOTAL a cada análise: a ficha nasce SÓ do bloco colado. Nada da ficha anterior sobrevive —
  // nem benefício, nem espécie, nem valor, nem banco, nem telefone, nem REV. Só permanecem os campos
  // que o Promosys não traz e que o escritório preenche à mão (RG, estado civil) e o gerente escolhido.
  function analisar() {
    setErro(null);
    if (!textoConsulta.trim()) { setErro('Cole o texto da consulta antes de analisar.'); return; }
    const dataFicha = hojeISO();
    const r = parseFichaJudicial(textoConsulta, { dataFicha });
    setParse(r);
    setTextoOriginal(r.textoSanitizado);
    const novo: Form = {
      ...FORM0,
      rg: form.rg, estadoCivil: form.estadoCivil,               // manuais: preservados
      responsavelId: form.responsavelId || (responsavelSugerido?.id ?? ''),
    };
    novo.nome = (r.nome ?? '').toUpperCase(); novo.cpf = r.cpf ?? ''; novo.cidade = r.cidade ?? ''; novo.uf = r.uf ?? '';
    // telefone: SEMPRE o da seção TELEFONES do bloco. Cadastro antigo não entra na ficha.
    novo.telefone = r.telefone ?? '';
    // e-mail: o Promosys não traz; usa o salvo no contato, se houver
    novo.email = r.email ?? contatoAtual?.email ?? '';
    setTelImportado(somenteDigitos(r.telefone ?? ''));
    novo.nascimento = isoParaInput(r.nascimento);
    novo.beneficioNumero = r.beneficioNumero ?? ''; novo.especieCodigo = r.especieCodigo ?? ''; novo.especieDescricao = r.especieDescricao ?? '';
    novo.tipoBeneficio = r.tipoBeneficio ?? ''; novo.bancoCodigo = r.bancoCodigo ?? ''; novo.bancoNome = r.bancoNome ?? '';
    novo.valorBeneficio = r.valorBeneficio != null ? String(r.valorBeneficio).replace('.', ',') : '';
    novo.dataConsulta = r.dataConsulta || dataFicha;
    setForm(novo);
    setRevisoes(r.revisoes.map((x) => ({ tipo: x.tipo, bancoCodigo: x.bancoCodigo, bancoNome: x.bancoNome, valor: x.valor, origem: 'parser', confianca: x.confianca, requerConfirmacao: x.requerConfirmacao })));
    setOrigem({ ...r.origemPorCampo, idade: r.idadeCalculada != null ? 'calculado' : 'nao_encontrado', dataConsulta: 'calculado' });
    setEtapa('revisar');
  }

  function iniciarManual() {
    setParse(null);
    setForm({ ...FORM0, dataConsulta: hojeISO(), responsavelId: responsavelSugerido?.id ?? '' });
    setRevisoes([]); setOrigem({}); setTextoOriginal(''); setTelImportado('');
    setEtapa('revisar');
  }

  // Idade SEMPRE recalculada: nascimento × data da ficha (não a idade que veio colada do Promosys).
  const idadeCalc = useMemo(
    () => (form.nascimento ? calculaIdade(form.nascimento, form.dataConsulta || hojeISO()) : undefined),
    [form.nascimento, form.dataConsulta],
  );

  const dadosFmt = useMemo(() => ({
    gerenteNome: usuarios.find((u) => u.id === form.responsavelId)?.nome || responsavelSugerido?.nome || '',
    cidade: form.cidade, uf: form.uf, nome: form.nome, beneficioNumero: form.beneficioNumero,
    especieCodigo: form.especieCodigo, especieDescricao: form.especieDescricao,
    bancoCodigo: form.bancoCodigo, bancoNome: form.bancoNome, valorBeneficio: parseMoedaBRL(form.valorBeneficio) ?? null,
    cpf: form.cpf, rg: form.rg, nascimento: form.nascimento || undefined, idade: idadeCalc ?? null,
    telefone: formataTelefoneBR(form.telefone), estadoCivil: form.estadoCivil, email: form.email, dataConsulta: form.dataConsulta || undefined, revisoes,
  }), [form, revisoes, usuarios, responsavelSugerido, idadeCalc]);

  const previa = useMemo(() => formatarFichaJudicial(dadosFmt, { incluirSenha: false }), [dadosFmt]);

  // Alertas do bloco colado (campo obrigatório não encontrado) — nunca inventamos o dado.
  const alertas = useMemo(() => (parse?.avisos ?? []).filter((a) => a.mensagem.startsWith('ALERTA')), [parse]);
  const observacoes = useMemo(() => (parse?.avisos ?? []).filter((a) => !a.mensagem.startsWith('ALERTA')), [parse]);
  // Conferência final: tudo que estiver na ficha e não no bloco colado aparece aqui (anti-ficha-antiga).
  const divergencias = useMemo(() => (parse ? conferirFichaComBloco(parse, {
    nome: form.nome, cpf: form.cpf, beneficioNumero: form.beneficioNumero,
    especieCodigo: form.especieCodigo, especieDescricao: form.especieDescricao,
    valorBeneficio: parseMoedaBRL(form.valorBeneficio) ?? null,
    bancoCodigo: form.bancoCodigo, bancoNome: form.bancoNome,
    telefone: form.telefone, nascimento: form.nascimento,
    revisoes,
  }) : []), [parse, form, revisoes]);

  function montarSnapshot(): FichaSnapshot {
    return {
      nome: form.nome, cpf: form.cpf, cidade: form.cidade, uf: form.uf, telefone: somenteDigitos(form.telefone), email: form.email, rg: form.rg, estadoCivil: form.estadoCivil,
      nascimento: form.nascimento || null, idadeInformada: idadeCalc ?? null,
      beneficioNumero: form.beneficioNumero, especieCodigo: form.especieCodigo, especieDescricao: form.especieDescricao, tipoBeneficio: form.tipoBeneficio || null,
      bancoCodigo: form.bancoCodigo, bancoNome: form.bancoNome, valorBeneficio: parseMoedaBRL(form.valorBeneficio) ?? null, dataConsulta: form.dataConsulta || null,
      textoOriginal, textoFicha: formatarFichaJudicial(dadosFmt, { incluirSenha: false }), revisoes,
      parserVersion: parse?.parserVersion || fichaInicial?.parserVersion || PARSER_VERSION,
    };
  }

  async function aplicarConflitos() {
    if (!supabase) return;
    try {
      if (atualizarContatoChk) {
        const patch: Record<string, unknown> = {};
        if (form.nome) patch.nome = form.nome;
        if (form.cpf) patch.cpf = form.cpf;
        // telefone: ao atualizar o contato, aplica o IMPORTADO (decisão explícita do operador)
        if (normalizaTelefone(telImportado)) patch.telefone = normalizaTelefone(telImportado);
        if (form.email) patch.email = form.email;
        if (Object.keys(patch).length) await supabase.from('contatos').update(patch).eq('id', vinculos.contatoId);
        qc.invalidateQueries({ queryKey: ['contatos'] });
        qc.invalidateQueries({ queryKey: ['busca-contatos'] });
      }
      if (atualizarOportunidadeChk && vinculos.oportunidadeId) {
        const patch: Record<string, unknown> = {};
        if (form.tipoBeneficio) patch.tipo_beneficio = form.tipoBeneficio;
        if (form.beneficioNumero) patch.numero_beneficio = form.beneficioNumero;
        if (form.bancoNome) patch.instituicao = [form.bancoCodigo, form.bancoNome].filter(Boolean).join(' ');
        if (Object.keys(patch).length) await supabase.from('oportunidades').update(patch).eq('id', vinculos.oportunidadeId);
        qc.invalidateQueries({ queryKey: ['kanban-leads'] });
        qc.invalidateQueries({ queryKey: ['opp-do-contato'] });
      }
    } catch { /* conflito best-effort: não bloqueia a ficha */ }
  }

  async function salvarRascunho() {
    if (busy) return; setBusy(true); setErro(null);
    try {
      const snapshot = montarSnapshot();
      let f: FichaJudicial;
      if (fichaId) f = await atualizar.mutateAsync({ id: fichaId, snapshot, responsavelId: form.responsavelId || null });
      else f = await criar.mutateAsync({ vinculos, snapshot, criadoPor: user!.id });
      setFichaId(f.id);
      await aplicarConflitos();
      toast('Rascunho salvo');
    } catch (e) { setErro(traduz((e as Error).message)); }
    finally { setBusy(false); }
  }

  function validarFinalizacao(): string | null {
    if (!form.responsavelId) return 'Selecione o gerente/responsável.';
    if (!form.nome.trim()) return 'Informe o nome.';
    if (!cpfValido(form.cpf)) return 'CPF inválido.';
    if (!form.beneficioNumero.trim()) return 'Informe o número do benefício.';
    if (!form.especieCodigo.trim() && !form.especieDescricao.trim()) return 'Informe a espécie.';
    if (!form.tipoBeneficio) return 'Selecione o tipo de benefício.';
    if (!form.telefone.trim()) return 'Informe o telefone.';
    if (!form.dataConsulta) return 'Informe a data da ficha.';
    if (bancoPagadorPendente()) return 'Revisar banco de recebimento. PAN/FACTA não devem ser usados como banco pagador do benefício.';
    return null;
  }

  // Banco pagador bloqueado (PAN/FACTA) e ainda não preenchido manualmente → exige revisão antes de gerar/copiar.
  function bancoPagadorPendente(): boolean {
    return origem.bancoCodigo === 'revisao_necessaria' && !form.bancoNome.trim() && !form.bancoCodigo.trim();
  }

  async function finalizarFicha() {
    if (busy) return;
    const v = validarFinalizacao();
    if (v) { setErro(v); return; }
    setBusy(true); setErro(null);
    try {
      const snapshot = montarSnapshot();
      let id = fichaId;
      if (!id) { const f = await criar.mutateAsync({ vinculos, snapshot, criadoPor: user!.id }); id = f.id; setFichaId(id); }
      await finalizar.mutateAsync({ id: id!, snapshot, responsavelId: form.responsavelId || null });
      await aplicarConflitos();
      setSenha('');
      toast('Ficha finalizada');
      onClose();
    } catch (e) { setErro(traduz((e as Error).message)); }
    finally { setBusy(false); }
  }

  async function copiar() {
    if (bancoPagadorPendente()) { setErro('Revisar banco de recebimento. PAN/FACTA não devem ser usados como banco pagador do benefício.'); setEtapa('revisar'); return; }
    const texto = formatarFichaJudicial(dadosFmt, { incluirSenha: incluirSenhaAoCopiar, senha: senhaInssTemporaria });
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
      else { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      toast('Ficha copiada para a área de transferência.');
    } catch { setErro('Não foi possível copiar. Copie manualmente da prévia.'); }
  }

  // conflitos com contato/oportunidade
  const conflitos = useMemo(() => {
    const c: { campo: string; atual: string; importado: string }[] = [];
    const add = (campo: string, atual?: string | null, imp?: string) => { if (atual && imp && atual.trim() && imp.trim() && atual.trim() !== imp.trim()) c.push({ campo, atual, importado: imp }); };
    add('Nome', contatoAtual?.nome, form.nome);
    add('CPF', contatoAtual?.cpf, form.cpf);
    add('E-mail', contatoAtual?.email, form.email);
    add('Nº benefício', oportunidadeAtual?.numeroBeneficio, form.beneficioNumero);
    // telefone: compara cadastro × importado (não o valor já resolvido no form); vazio/inválido não gera divergência
    const telA = normalizaTelefone(contatoAtual?.telefone || '');
    const telB = normalizaTelefone(telImportado || form.telefone || '');
    if (telA && telB && telA !== telB) c.push({ campo: 'Telefone', atual: formataTelefoneBR(telA), importado: formataTelefoneBR(telB) });
    return c;
  }, [contatoAtual, oportunidadeAtual, form, telImportado]);

  const titulo = (
    <div>
      <div>{readOnly ? 'Ficha judicial' : fichaInicial ? `Editar ficha (v${fichaInicial.versao})` : 'Nova ficha judicial'}</div>
      <div className="fj-sub">{etapa === 'importar' ? 'Importar dados da consulta' : etapa === 'revisar' ? 'Revisar e completar' : 'Prévia da ficha'}</div>
    </div>
  );

  const ind = (campo: string) => { const o = origem[campo]; if (!o) return null; const v = IND[o]; return v ? <span className={'fj-ind ' + v.cls}>{v.txt}</span> : null; };

  const rodape = etapa === 'importar'
    ? <>{(fichaInicial || textoOriginal || form.nome)
        ? <button className="atv-btn" onClick={() => setEtapa('revisar')} disabled={busy}>Voltar</button>
        : <button className="atv-btn" onClick={onClose} disabled={busy}>Cancelar</button>}
      <button className="atv-btn" onClick={iniciarManual} disabled={busy}>Preencher manual</button><button className="atv-btn primary" onClick={analisar} disabled={busy}>Analisar dados</button></>
    : etapa === 'revisar'
      ? <><button className="atv-btn" onClick={() => setEtapa(readOnly ? 'previa' : 'importar')} disabled={busy}>{readOnly ? 'Voltar' : 'Colar novo bloco'}</button><button className="atv-btn" onClick={salvarRascunho} disabled={busy || readOnly}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button><button className="atv-btn primary" onClick={() => setEtapa('previa')} disabled={busy}>Ver prévia</button></>
      : <><button className="atv-btn" onClick={() => setEtapa('revisar')} disabled={busy}>Voltar e editar</button><button className="atv-btn" onClick={copiar} disabled={busy}>Copiar ficha</button>{!readOnly && <button className="atv-btn" onClick={salvarRascunho} disabled={busy}>Salvar rascunho</button>}{!readOnly && <button className="atv-btn primary" onClick={finalizarFicha} disabled={busy}>{busy ? 'Finalizando…' : 'Finalizar ficha'}</button>}</>;

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={640} title={titulo} footer={rodape}>
      <div className="fj-body">
        {etapa === 'importar' && (
          <div className="fj-importar">
            <p className="fj-desc">Copie todo o conteúdo da consulta no Promosys ou iCred e cole abaixo. A análise é local; nada é enviado antes de você revisar. <strong>Analisar substitui todos os dados da ficha pelos do bloco colado</strong> — nada da ficha anterior é reaproveitado.</p>
            <label className="fj-label">Texto da consulta</label>
            <textarea className="atv-input fj-textarea" rows={10} value={textoConsulta} onChange={(e) => setTextoConsulta(e.target.value)} placeholder="Cole aqui o texto da consulta…" autoFocus />
          </div>
        )}

        {etapa === 'revisar' && (
          <div className="fj-rev">
            {alertas.length > 0 && (
              <div className="fj-alertas">
                {alertas.map((a) => <div className="fj-alerta" key={a.codigo}>{a.mensagem}</div>)}
              </div>
            )}
            {observacoes.length > 0 && (
              <div className="fj-obs">{observacoes.map((a) => <div key={a.codigo + (a.campo ?? '')}>{a.mensagem}</div>)}</div>
            )}
            {divergencias.length > 0 && (
              <div className="fj-alertas">
                <div className="fj-alerta"><strong>Divergência com o bloco colado</strong> — confira antes de gerar:</div>
                {divergencias.map((d, i) => <div className="fj-obs" key={i}>{d.campo}: ficha “{d.ficha}” × bloco “{d.bloco}”</div>)}
              </div>
            )}
            <div className="fj-sec">Dados do cliente</div>
            <div className="fj-grid">
              {campo('Nome', <input className="atv-input" value={form.nome} onChange={(e) => setF({ nome: e.target.value })} disabled={readOnly} />, ind('nome'))}
              {campo('CPF', <input className="atv-input" value={form.cpf} onChange={(e) => setF({ cpf: e.target.value })} disabled={readOnly} />, ind('cpf'))}
              {campo('Nascimento', <input className="atv-input" type="date" value={form.nascimento} onChange={(e) => setF({ nascimento: e.target.value })} disabled={readOnly} />, ind('nascimento'))}
              {campo('Idade', <input className="atv-input" value={idadeCalc != null ? `${idadeCalc} anos` : ''} readOnly disabled title="Calculada a partir do nascimento e da data da ficha" />, <span className="fj-ind ok">Calculada</span>)}
              {campo('Cidade', <input className="atv-input" value={form.cidade} onChange={(e) => setF({ cidade: e.target.value })} disabled={readOnly} />, ind('cidade'))}
              {campo('UF', <input className="atv-input" maxLength={2} value={form.uf} onChange={(e) => setF({ uf: e.target.value.toUpperCase() })} disabled={readOnly} />, ind('uf'))}
              {campo('Telefone', <input className="atv-input" value={form.telefone} onChange={(e) => setF({ telefone: e.target.value })} disabled={readOnly} />, ind('telefone'))}
              {campo('E-mail', <input className="atv-input" value={form.email} onChange={(e) => setF({ email: e.target.value })} disabled={readOnly} />, ind('email'))}
              {campo('RG', <input className="atv-input" value={form.rg} onChange={(e) => setF({ rg: e.target.value })} disabled={readOnly} />)}
              {campo('Estado civil', <input className="atv-input" value={form.estadoCivil} onChange={(e) => setF({ estadoCivil: e.target.value })} disabled={readOnly} />)}
            </div>

            <div className="fj-sec">Benefício</div>
            <div className="fj-grid">
              {campo('Nº benefício', <input className="atv-input" value={form.beneficioNumero} onChange={(e) => setF({ beneficioNumero: e.target.value })} disabled={readOnly} />, ind('beneficioNumero'))}
              {campo('Cód. espécie', <input className="atv-input" value={form.especieCodigo} onChange={(e) => setF({ especieCodigo: e.target.value })} disabled={readOnly} />, ind('especieCodigo'))}
              {campoFull('Descrição da espécie', <input className="atv-input" value={form.especieDescricao} onChange={(e) => setF({ especieDescricao: e.target.value })} disabled={readOnly} />, ind('especieDescricao'))}
              {campo('Tipo de benefício', <select className="atv-input" value={form.tipoBeneficio} onChange={(e) => setF({ tipoBeneficio: e.target.value as Form['tipoBeneficio'] })} disabled={readOnly}><option value="">Selecione…</option>{TIPOS_BENEF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>, ind('tipoBeneficio'))}
              {campo('Cód. COMPE', <input className="atv-input" value={form.bancoCodigo} onChange={(e) => setF({ bancoCodigo: e.target.value })} disabled={readOnly} />, ind('bancoCodigo'))}
              {campo('Banco pagador', <input className="atv-input" value={form.bancoNome} onChange={(e) => setF({ bancoNome: e.target.value })} disabled={readOnly} />, ind('bancoNome'))}
              {origem.bancoCodigo === 'revisao_necessaria' && <div className="fj-ind warn" style={{ gridColumn: '1 / -1' }}>Revisar banco de recebimento. PAN/FACTA não devem ser usados como banco pagador do benefício.</div>}
              {campo('Valor do benefício', <input className="atv-input" inputMode="decimal" placeholder="0,00" value={form.valorBeneficio} onChange={(e) => setF({ valorBeneficio: e.target.value })} disabled={readOnly} />, ind('valorBeneficio'))}
              {campo('Data da ficha', <input className="atv-input" type="date" value={form.dataConsulta} onChange={(e) => setF({ dataConsulta: e.target.value })} disabled={readOnly} />, ind('dataConsulta'))}
            </div>

            <div className="fj-sec">Atendimento</div>
            <div className="fj-grid">
              {campo('Gerente / responsável', <select className="atv-input" value={form.responsavelId} onChange={(e) => setF({ responsavelId: e.target.value }, false)} disabled={readOnly}><option value="">Não atribuído</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>)}
            </div>

            <div className="fj-sec">Revisões</div>
            <div className="fj-revs">
              {revisoes.length === 0 && <div className="fj-empty">Nenhuma revisão. Adicione se necessário.</div>}
              {revisoes.map((r, i) => (
                <div className={'fj-revrow' + (r.requerConfirmacao ? ' confirmar' : '')} key={i}>
                  <select className="atv-input" value={r.tipo} onChange={(e) => editRev(i, { tipo: e.target.value as FichaRevisao['tipo'] })} disabled={readOnly}>{TIPOS_REV.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select>
                  <input className="atv-input" placeholder="Banco" value={r.bancoNome ?? ''} onChange={(e) => editRev(i, { bancoNome: e.target.value })} disabled={readOnly} />
                  <input className="atv-input" placeholder="Cód." value={r.bancoCodigo ?? ''} onChange={(e) => editRev(i, { bancoCodigo: e.target.value })} disabled={readOnly} />
                  <input className="atv-input" placeholder="Valor" value={r.valor != null ? String(r.valor).replace('.', ',') : ''} onChange={(e) => editRev(i, { valor: parseMoedaBRL(e.target.value) })} disabled={readOnly} />
                  {!readOnly && <button className="fj-x" onClick={() => setRevisoes((rs) => rs.filter((_, j) => j !== i))} aria-label="Remover revisão">✕</button>}
                  {r.requerConfirmacao && <span className="fj-ind warn">Confirmar</span>}
                </div>
              ))}
              {!readOnly && <button className="atv-btn fj-addrev" onClick={() => setRevisoes((rs) => [...rs, { tipo: 'outro', origem: 'manual' }])}>+ Adicionar revisão</button>}
            </div>

            <div className="fj-sec">Dados complementares</div>
            <div className="fj-grid">
              {campo('INSS — senha (temporária)', <div className="fj-senha"><input className="atv-input" type={mostrarSenha ? 'text' : 'password'} value={senhaInssTemporaria} onChange={(e) => setSenha(e.target.value)} placeholder="Não é salva" disabled={readOnly} /><button type="button" className="fj-eye" onClick={() => setMostrarSenha((s) => !s)}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</button></div>, <span className="fj-ind man">Só nesta sessão</span>)}
            </div>

            {conflitos.length > 0 && !readOnly && (
              <div className="fj-conflitos">
                <div className="fj-sec">Divergências com o cadastro</div>
                {conflitos.map((c) => <div className="fj-confrow" key={c.campo}><strong>{c.campo}</strong><span>atual: {c.atual}</span><span>importado: {c.importado}</span></div>)}
                <label className="fj-chk"><input type="checkbox" checked={atualizarContatoChk} onChange={(e) => setAtualizarContato(e.target.checked)} /> Atualizar dados do contato (nome/CPF/telefone/e-mail)</label>
                <label className="fj-chk"><input type="checkbox" checked={atualizarOportunidadeChk} onChange={(e) => setAtualizarOportunidade(e.target.checked)} /> Atualizar dados da oportunidade (benefício/instituição)</label>
              </div>
            )}
          </div>
        )}

        {etapa === 'previa' && (
          <div className="fj-previa">
            {alertas.length > 0 && (
              <div className="fj-alertas">{alertas.map((a) => <div className="fj-alerta" key={a.codigo}>{a.mensagem}</div>)}</div>
            )}
            <pre className="fj-doc">{previa}</pre>
            {!readOnly && (
              <label className="fj-chk fj-copychk"><input type="checkbox" checked={incluirSenhaAoCopiar} onChange={(e) => setIncluirSenha(e.target.checked)} disabled={!senhaInssTemporaria} /> Incluir senha do INSS nesta cópia</label>
            )}
          </div>
        )}

        {erro && <div className="fj-erro">{erro}</div>}
      </div>
    </Modal>
  );

  function editRev(i: number, patch: Partial<FichaRevisao>) { setRevisoes((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, requerConfirmacao: false } : r))); }
}

function campo(label: string, input: React.ReactNode, indicador?: React.ReactNode) {
  return <div className="fj-field"><label className="fj-label">{label} {indicador}</label>{input}</div>;
}
function campoFull(label: string, input: React.ReactNode, indicador?: React.ReactNode) {
  return <div className="fj-field full"><label className="fj-label">{label} {indicador}</label>{input}</div>;
}

function traduz(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('ficha_finalizada_imutavel')) return 'Esta ficha foi finalizada e não pode ser editada. Crie uma nova versão.';
  if (m.includes('finalizar:')) return 'Preencha os campos obrigatórios para finalizar.';
  if (m.includes('senha_em_estrutura')) return 'Remova credenciais das revisões/observações.';
  if (m.includes('row-level security') || m.includes('permission')) return 'Você não tem permissão para esta ação.';
  if (m.includes('uq_ficha') || m.includes('duplicate')) return 'Já existe uma versão com esse número para esta oportunidade.';
  return 'Não foi possível concluir: ' + msg;
}
