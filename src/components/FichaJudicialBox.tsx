import { useState } from 'react';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';
import { useFichasDaOportunidade, useCriarNovaVersaoFicha, type FichaJudicial } from '@/data/fichaJudicial';
import { FichaJudicialModal } from '@/components/FichaJudicialModal';
import './FichaJudicialModal.css';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const dataBR = (iso?: string | null) => { const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

interface Props {
  contatoId: string | null;
  oportunidadeId: string;
  conversaId?: string | null;
  canalId?: string | null;
  responsavelSugerido?: { id?: string | null; nome?: string };
  contatoAtual?: { nome?: string; cpf?: string; telefone?: string; email?: string };
  oportunidadeAtual?: { tipoBeneficio?: string | null; numeroBeneficio?: string | null; instituicao?: string | null };
}

export function FichaJudicialBox({ contatoId, oportunidadeId, conversaId, canalId, responsavelSugerido, contatoAtual, oportunidadeAtual }: Props) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const fichasQ = useFichasDaOportunidade(oportunidadeId);
  const novaVersao = useCriarNovaVersaoFicha();
  const [modal, setModal] = useState<{ modo: 'novo' | 'continuar' | 'visualizar'; ficha: FichaJudicial | null } | null>(null);

  if (!contatoId) {
    return <div className="fjb"><div className="fjb-h">Ficha judicial</div><div className="fjb-info">Vincule um contato à oportunidade para gerar a ficha.</div></div>;
  }

  const fichas = fichasQ.data ?? [];
  const rascunho = fichas.find((f) => f.status === 'rascunho') ?? null;
  const finalizada = fichas.find((f) => f.status === 'finalizada') ?? null;

  const vinculos = { organizacaoId: currentOrg.id, contatoId, oportunidadeId, conversaId: conversaId ?? null, canalId: canalId ?? null };

  async function copiar(f: FichaJudicial) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(f.textoFicha);
      else { const ta = document.createElement('textarea'); ta.value = f.textoFicha; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      toast('Ficha copiada para a área de transferência.');
    } catch { toast('Não foi possível copiar.', 'warn'); }
  }

  async function criarNova(f: FichaJudicial) {
    try {
      const nova = await novaVersao.mutateAsync({ anterior: f, criadoPor: user!.id });
      setModal({ modo: 'continuar', ficha: nova });
    } catch (e) { toast('Falha ao criar nova versão: ' + (e as Error).message, 'warn'); }
  }

  return (
    <div className="fjb">
      <div className="fjb-h">Ficha judicial</div>

      {fichasQ.isLoading ? (
        <div className="fjb-info">Carregando…</div>
      ) : !rascunho && !finalizada ? (
        <div className="fjb-card">
          <div><span className="fjb-tag vazia">Nenhuma ficha</span></div>
          <div className="fjb-info">Importe a consulta do Promosys/iCred e gere a ficha judicial.</div>
          <div className="fjb-acts"><button className="fjb-btn primary" onClick={() => setModal({ modo: 'novo', ficha: null })}>Criar ficha</button></div>
        </div>
      ) : rascunho ? (
        <div className="fjb-card">
          <div><span className="fjb-tag rascunho">Rascunho · v{rascunho.versao}</span></div>
          <div className="fjb-row"><span className="fjb-l">Atualizada</span><span className="fjb-v">{dataBR(rascunho.atualizadoEm) || '—'}</span></div>
          <div className="fjb-row"><span className="fjb-l">Gerente</span><span className="fjb-v">{rascunho.responsavelNome || 'Não atribuído'}</span></div>
          <div className="fjb-acts"><button className="fjb-btn primary" onClick={() => setModal({ modo: 'continuar', ficha: rascunho })}>Continuar ficha</button></div>
        </div>
      ) : finalizada ? (
        <div className="fjb-card">
          <div><span className="fjb-tag finalizada">Finalizada · v{finalizada.versao}</span></div>
          <div className="fjb-row"><span className="fjb-l">Data</span><span className="fjb-v">{dataBR(finalizada.dataConsulta) || dataBR(finalizada.finalizadaEm) || '—'}</span></div>
          {finalizada.beneficioNumero && <div className="fjb-row"><span className="fjb-l">Benefício</span><span className="fjb-v">{finalizada.beneficioNumero}</span></div>}
          {(finalizada.especieCodigo || finalizada.especieDescricao) && <div className="fjb-row"><span className="fjb-l">Espécie</span><span className="fjb-v">{[finalizada.especieCodigo, finalizada.especieDescricao].filter(Boolean).join(' - ')}</span></div>}
          {(finalizada.bancoCodigo || finalizada.bancoNome) && <div className="fjb-row"><span className="fjb-l">Banco</span><span className="fjb-v">{[finalizada.bancoCodigo, finalizada.bancoNome].filter(Boolean).join(' ')}</span></div>}
          {finalizada.valorBeneficio != null && finalizada.valorBeneficio > 0 && <div className="fjb-row"><span className="fjb-l">Valor</span><span className="fjb-v">{fmtBRL(finalizada.valorBeneficio)}</span></div>}
          <div className="fjb-row"><span className="fjb-l">Gerente</span><span className="fjb-v">{finalizada.responsavelNome || '—'}</span></div>
          <div className="fjb-acts">
            <button className="fjb-btn" onClick={() => setModal({ modo: 'visualizar', ficha: finalizada })}>Visualizar</button>
            <button className="fjb-btn" onClick={() => copiar(finalizada)}>Copiar</button>
            <button className="fjb-btn primary" onClick={() => criarNova(finalizada)} disabled={novaVersao.isPending}>Criar nova versão</button>
          </div>
        </div>
      ) : null}

      {fichas.length > 1 && (
        <div className="fjb-hist">
          {fichas.map((f) => (
            <div className="fjb-hist-row" key={f.id}><span className="v">v{f.versao}</span><span>{f.status === 'finalizada' ? 'Finalizada' : 'Rascunho'}</span><span>{dataBR(f.atualizadoEm)}</span><span>{f.criadoPorNome}</span></div>
          ))}
        </div>
      )}

      {modal && (
        <FichaJudicialModal
          open
          onClose={() => setModal(null)}
          vinculos={vinculos}
          fichaInicial={modal.ficha}
          modo={modal.modo}
          responsavelSugerido={responsavelSugerido}
          contatoAtual={contatoAtual}
          oportunidadeAtual={oportunidadeAtual}
        />
      )}
    </div>
  );
}
