import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/Modal';
import { criarRaizPortalV2 } from '@/v2/components/portal';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useEnviarFichaPlanilha, type FichaJudicial } from '@/data/fichaJudicial';
import './FichaJudicialModal.css';

/* Link de LEITURA da planilha CONTROLE CLIENTES AGENDADOS (aba CLIENTES EM ANDAMENTO),
   usado só no toast "Abrir planilha". A escrita passa exclusivamente pela edge function
   enviar-planilha (URL do Web App e token ficam em secrets, nunca no código). */
const PLANILHA_VIEW_URL = 'https://docs.google.com/spreadsheets/d/1Obi1VmELX6bJJafYRdTvKcYomBrJbjKzoPs5o5W7kWQ/edit?gid=2039002047';

const TRAFEGO_OPCOES = ['CAMPANHA', 'DISPARO', 'INDICAÇÃO', 'PRESENCIAL', 'RMKT CREFISA', 'RMKT BRUNO', 'ANDRIUS', 'SIMONE'];

const somenteDigitos = (s: string) => s.replace(/\D+/g, '');
const primeiroNomeMaiusculo = (nome?: string) => ((nome ?? '').trim().split(/\s+/)[0] ?? '').toUpperCase();

interface Props {
  open: boolean;
  onClose: () => void;
  ficha: FichaJudicial;
}

/** Conferência antes de enviar a ficha à planilha da equipe. Campos editáveis;
 *  a ponte deduplica pelo CPF (atualiza a linha existente ou cria no fim). */
export function EnviarPlanilhaModal({ open, onClose, ficha }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const enviar = useEnviarFichaPlanilha();

  // Portal para o body: dentro do DrawerV2 o backdrop-filter cria containing block
  // e prende o overlay fixed (modal clipado na coluna do drawer). No subtree .v2 a
  // raiz do portal carrega a classe v2 (regra 10 — tokens Platina vivem em .v2);
  // nas telas v1 a raiz fica sem classe e o modal segue o tema claro global.
  const ancora = useRef<HTMLSpanElement>(null);
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = ancora.current?.closest('.v2')
      ? criarRaizPortalV2(document) as HTMLElement
      : document.body.appendChild(document.createElement('div'));
    setRaiz(el);
    return () => { el.remove(); };
  }, []);

  const jaEnviada = !!ficha.planilhaEnviadaEm;
  const [cliente, setCliente] = useState(ficha.nome);
  const [cpf, setCpf] = useState(ficha.cpf);
  const [senhaInss, setSenhaInss] = useState(ficha.senhaInss);
  const [numero, setNumero] = useState(ficha.telefone);
  const [trafego, setTrafego] = useState('');
  const [responsavel, setResponsavel] = useState(primeiroNomeMaiusculo(user?.name));
  const [erro, setErro] = useState<string | null>(null);
  const busy = enviar.isPending;

  async function confirmar() {
    if (busy) return;
    setErro(null);
    if (!cliente.trim()) { setErro('Informe o nome do cliente.'); return; }
    if (somenteDigitos(cpf).length !== 11) { setErro('CPF precisa ter 11 dígitos.'); return; }
    try {
      const res = await enviar.mutateAsync({
        ficha, cliente: cliente.trim(), cpf, senhaInss: senhaInss.trim(),
        numero, trafego: trafego.trim(), responsavel: responsavel.trim(),
      });
      const linha = res.linha != null ? String(res.linha) : '—';
      toast(
        res.acao === 'atualizado' ? `Planilha atualizada — linha ${linha}` : `Adicionado à planilha — linha ${linha}`,
        'ok',
        { link: { href: PLANILHA_VIEW_URL, rotulo: 'Abrir planilha' } },
      );
      if (res.aviso) toast(res.aviso, 'warn');
      onClose();
    } catch (e) {
      const msg = (e as Error).message || 'Não foi possível enviar à planilha.';
      setErro(msg);
      toast(msg, 'warn');
    }
  }

  const titulo = (
    <div>
      <div>{jaEnviada ? 'Atualizar na planilha' : 'Enviar pra planilha'}</div>
      <div className="fj-sub">CONTROLE CLIENTES AGENDADOS · CLIENTES EM ANDAMENTO</div>
    </div>
  );

  const rodape = (
    <>
      <button className="atv-btn" onClick={onClose} disabled={busy}>Voltar</button>
      <button className="atv-btn primary" onClick={confirmar} disabled={busy}>
        {busy ? 'Aguarde…' : jaEnviada ? 'Atualizar na planilha' : 'Enviar pra planilha'}
      </button>
    </>
  );

  const modal = (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} width={520} title={titulo} footer={rodape}>
      <div className="fj-body">
        <p className="fj-desc">
          Confira os dados antes de enviar. A planilha identifica o cliente pelo CPF:
          {jaEnviada ? ' a linha existente será atualizada.' : ' se já existir, a linha é atualizada; senão, entra no fim.'}
        </p>
        <div className="fj-grid">
          {campo('Cliente', <input className="atv-input" value={cliente} onChange={(e) => setCliente(e.target.value)} disabled={busy} />)}
          {campo('CPF', <input className="atv-input" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={busy} />)}
          {campo('Senha Meu INSS', <input className="atv-input" value={senhaInss} onChange={(e) => setSenhaInss(e.target.value)} disabled={busy} autoComplete="off" />)}
          {campo('Número', <input className="atv-input" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={busy} />)}
          {campo('Tráfego', (
            <>
              <input className="atv-input" list="planilha-trafego-opcoes" value={trafego} onChange={(e) => setTrafego(e.target.value)} placeholder="Selecione ou digite…" disabled={busy} />
              <datalist id="planilha-trafego-opcoes">
                {TRAFEGO_OPCOES.map((o) => <option key={o} value={o} />)}
              </datalist>
            </>
          ))}
          {campo('Responsável', <input className="atv-input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} disabled={busy} />)}
        </div>
        {jaEnviada && <div className="fj-obs">Na planilha · linha {ficha.planilhaLinha ?? '—'}</div>}
        {erro && <div className="fj-erro">{erro}</div>}
      </div>
    </Modal>
  );

  return <><span ref={ancora} style={{ display: 'none' }} />{raiz && createPortal(modal, raiz)}</>;
}

function campo(label: string, input: React.ReactNode) {
  return <div className="fj-field"><label className="fj-label">{label}</label>{input}</div>;
}
