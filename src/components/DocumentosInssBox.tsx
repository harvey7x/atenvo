import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import {
  INSS_REAL, usePedidosInss, useDocumentosInss, usePedirInss, useCancelarPedidoInss, urlAssinadaDocInss,
} from '@/data/inssDocs';
import { formatarTamanho } from '@/data/scripts';
import './DocumentosInssBox.css';

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

/** Caixa reutilizável (Contatos / Kanban): pede e baixa os documentos do Meu INSS.
    O pedido entra na fila do coletor (o computador do escritório que faz o login
    gov.br); quando a coleta termina, os PDFs aparecem aqui para baixar. */
export function DocumentosInssBox({ contatoId }: { contatoId?: string | null }) {
  const { currentOrg } = useOrg();
  const pedidosQ = usePedidosInss(contatoId ?? null);
  const docsQ = useDocumentosInss(contatoId ?? null);
  const pedir = usePedirInss();
  const cancelar = useCancelarPedidoInss();
  const [cpfDigitado, setCpfDigitado] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // nome/cpf do contato: o pedido leva um retrato deles (pasta + trava de identidade no coletor)
  const contatoQ = useQuery({
    queryKey: ['inss-contato', currentOrg.id, contatoId],
    enabled: INSS_REAL && !!contatoId,
    queryFn: async () => {
      const { data, error } = await supabase!.from('contatos').select('nome,cpf')
        .eq('id', contatoId!).eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as { nome: string; cpf: string | null } | null;
    },
  });

  if (!INSS_REAL || !contatoId) return null;

  const pedidos = pedidosQ.data ?? [];
  const docs = docsQ.data ?? [];
  const atual = pedidos.find((p) => p.status === 'aberto' || p.status === 'em_andamento') ?? null;
  const ultimo = pedidos[0] ?? null;
  const cpfContato = (contatoQ.data?.cpf ?? '').replace(/\D/g, '');
  const precisaCpf = cpfContato.length !== 11;
  const cpfOk = !precisaCpf || cpfDigitado.replace(/\D/g, '').length === 11;

  async function abrirDoc(caminho: string) {
    setErro(null);
    const u = await urlAssinadaDocInss(caminho);
    if (u) window.open(u, '_blank', 'noopener');
    else setErro('Não consegui gerar o link do PDF — tente de novo.');
  }
  async function aoPedir() {
    if (busy) return;
    setErro(null); setBusy(true);
    try {
      await pedir.mutateAsync({
        contatoId: contatoId!, nome: contatoQ.data?.nome ?? '',
        cpf: precisaCpf ? cpfDigitado : cpfContato,
      });
      setCpfDigitado('');
    } catch (e) { setErro((e as Error).message); } finally { setBusy(false); }
  }
  async function aoCancelar() {
    if (busy || !atual) return;
    setErro(null); setBusy(true);
    try { await cancelar.mutateAsync({ id: atual.id, contatoId: contatoId! }); }
    catch (e) { setErro((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="dib">
      <div className="dib-h">Documentos do INSS</div>

      {docs.length > 0 && (
        <div className="dib-lista">
          {docs.map((d) => (
            <button key={d.id} type="button" className="dib-doc" onClick={() => abrirDoc(d.caminho)} title="Abrir o PDF">
              <span className="dib-doc-t">{d.titulo}</span>
              <span className="dib-doc-i">{d.tamanhoBytes ? `${formatarTamanho(d.tamanhoBytes)} · ` : ''}{fmtData(d.criadoEm)}</span>
            </button>
          ))}
        </div>
      )}

      {atual ? (
        <div className="dib-status">
          <span className="dib-info">
            {atual.status === 'aberto'
              ? 'Pedido na fila — ele aparece no computador da coleta.'
              : 'Sendo atendido agora. Os PDFs aparecem aqui quando terminar.'}
          </span>
          <button type="button" className="dib-btn" disabled={busy} onClick={aoCancelar}>Cancelar pedido</button>
        </div>
      ) : (
        <div className="dib-acao">
          {ultimo?.status === 'falhou' && (
            <div className="dib-erro">A última coleta falhou{ultimo.erro ? `: ${ultimo.erro}` : ''}.</div>
          )}
          {precisaCpf && (
            <input className="dib-cpf" placeholder="CPF do cliente (obrigatório para pedir)"
              value={cpfDigitado} onChange={(e) => setCpfDigitado(e.target.value)} disabled={busy} />
          )}
          <button type="button" className="dib-btn primary"
            disabled={busy || contatoQ.isLoading || !cpfOk} onClick={aoPedir}>
            {busy ? 'Pedindo…' : (docs.length || ultimo ? 'Pedir de novo' : 'Pedir documentos do INSS')}
          </button>
          <div className="dib-hint">Extratos, carta de concessão, consignado e IR do Meu INSS — coletados no computador do escritório e entregues aqui.</div>
        </div>
      )}

      {erro && <div className="dib-erro">{erro}</div>}
    </div>
  );
}
