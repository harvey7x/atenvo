import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/Modal';
import { criarRaizPortalV2 } from '@/v2/components/portal';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/context/AuthContext';
import { useEnviarFichaPlanilha, useCanalPlanilha, type FichaJudicial, type CorPlanilha } from '@/data/fichaJudicial';
import { TRAFEGO_OPCOES, trafegoDoCanal, semAcento } from '@/lib/planilhaTrafego';
import './FichaJudicialModal.css';

/* Link de LEITURA da planilha CONTROLE CLIENTES AGENDADOS (aba CLIENTES EM ANDAMENTO),
   usado só no toast "Abrir planilha". A escrita passa exclusivamente pela edge function
   enviar-planilha (URL do Web App e token ficam em secrets, nunca no código). */
const PLANILHA_VIEW_URL = 'https://docs.google.com/spreadsheets/d/1Obi1VmELX6bJJafYRdTvKcYomBrJbjKzoPs5o5W7kWQ/edit?gid=2039002047';

const somenteDigitos = (s: string) => s.replace(/\D+/g, '');
const primeiroNomeMaiusculo = (nome?: string) => ((nome ?? '').trim().split(/\s+/)[0] ?? '').toUpperCase();

/* Cores VIVAS da paleta padrão do Sheets — exatamente as que a equipe pinta na coluna
   CLIENTE (e as mesmas do Apps Script da ponte). Mudar aqui = mudar lá também. */
const CORES_LINHA: { valor: CorPlanilha; rotulo: string; hex: string | null }[] = [
  { valor: '', rotulo: 'Sem cor', hex: null },
  { valor: 'verde', rotulo: 'Verde', hex: '#00ff00' },
  { valor: 'amarelo', rotulo: 'Amarelo', hex: '#ffff00' },
  { valor: 'vermelho', rotulo: 'Vermelho', hex: '#ff0000' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  ficha: FichaJudicial;
  /** canal ATUAL do atendimento (o número em que o cliente fala) — sugere o Tráfego. */
  canalId?: string | null;
}

/** Conferência antes de enviar a ficha à planilha da equipe. Campos editáveis;
 *  a ponte deduplica pelo CPF (atualiza a linha existente ou cria no fim). */
export function EnviarPlanilhaModal({ open, onClose, ficha, canalId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const enviar = useEnviarFichaPlanilha();
  // canal do atendimento (o número integrado em que o cliente fala) → sugestão de Tráfego
  const canalQ = useCanalPlanilha(canalId ?? ficha.canalId);
  const sugerido = useMemo(
    () => trafegoDoCanal(canalQ.data?.nomeInterno, canalQ.data?.fonteNome),
    [canalQ.data],
  );

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
  const [cor, setCor] = useState<CorPlanilha>('');
  const [erro, setErro] = useState<string | null>(null);
  const busy = enviar.isPending;
  const corHex = CORES_LINHA.find((o) => o.valor === cor)?.hex ?? null;

  // pré-preenche o Tráfego pelo canal assim que a consulta resolve — mas nunca por
  // cima de algo que o atendente já digitou ou escolheu (tocado).
  const trafegoTocado = useRef(false);
  useEffect(() => {
    if (sugerido && !trafegoTocado.current) setTrafego(sugerido);
  }, [sugerido]);
  const veioDoCanal = !!sugerido && trafego === sugerido;

  async function confirmar() {
    if (busy) return;
    setErro(null);
    if (!cliente.trim()) { setErro('Informe o nome do cliente.'); return; }
    if (somenteDigitos(cpf).length !== 11) { setErro('CPF precisa ter 11 dígitos.'); return; }
    try {
      const res = await enviar.mutateAsync({
        ficha, cliente: cliente.trim(), cpf, senhaInss: senhaInss.trim(),
        numero, trafego: trafego.trim(), responsavel: responsavel.trim(), cor,
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
          {campo(
            'Tráfego',
            <ComboTrafego
              valor={trafego}
              aoMudar={(v) => { trafegoTocado.current = true; setTrafego(v); }}
              sugerido={sugerido}
              raiz={raiz}
              disabled={busy}
            />,
            veioDoCanal ? <span className="fj-ind ok">Canal: {canalQ.data?.nomeInterno}</span> : undefined,
          )}
          {campo('Responsável', <input className="atv-input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} disabled={busy} />)}
          <div className="fj-field full">
            <label className="fj-label">Cor na planilha</label>
            <div className="fj-cores" role="radiogroup" aria-label="Cor da linha na planilha">
              <div className="fj-cor-opcoes">
                {CORES_LINHA.map((o) => (
                  <button
                    type="button"
                    key={o.rotulo}
                    className={'fj-cor-op' + (o.valor ? ' ' + o.valor : ' neutra') + (cor === o.valor ? ' sel' : '')}
                    role="radio"
                    aria-checked={cor === o.valor}
                    onClick={() => setCor(o.valor)}
                    disabled={busy}
                  >
                    <span className="fj-cor-bola" aria-hidden="true">
                      {o.valor === '' ? (
                        <span className="fj-cor-risco" />
                      ) : cor === o.valor ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      ) : null}
                    </span>
                    <span className="fj-cor-nome">{o.rotulo}</span>
                  </button>
                ))}
              </div>
              <div className="fj-cor-preview">
                <div className="fj-cor-celula" aria-hidden="true">
                  <span className="num">{ficha.planilhaLinha ?? '+'}</span>
                  <span className="nome" style={corHex ? { background: corHex } : undefined}>
                    {(cliente.trim() || 'NOME DO CLIENTE').toUpperCase()}
                  </span>
                </div>
                <span className="fj-cor-hint">
                  {corHex
                    ? 'É assim que a célula do cliente vai ficar na planilha.'
                    : 'Sem cor selecionada — a pintura atual da planilha não muda.'}
                </span>
              </div>
            </div>
          </div>
        </div>
        {erro && <div className="fj-erro">{erro}</div>}
      </div>
    </Modal>
  );

  return <><span ref={ancora} style={{ display: 'none' }} />{raiz && createPortal(modal, raiz)}</>;
}

function campo(label: string, input: React.ReactNode, indicador?: React.ReactNode) {
  return <div className="fj-field"><label className="fj-label">{label} {indicador}</label>{input}</div>;
}

/* Combobox do Tráfego — seletor Platina com valor livre: dropdown estilizado nos
   tokens do tema (no lugar do datalist nativo), teclado (↑ ↓ Enter Esc) e a opção
   sugerida pelo canal marcada. A lista abre em portal `position:fixed` (medida do
   campo) porque o .atv-modal tem overflow hidden e clipparia um dropdown absoluto. */
function ComboTrafego({ valor, aoMudar, sugerido, raiz, disabled }: {
  valor: string; aoMudar: (v: string) => void; sugerido: string;
  raiz: HTMLElement | null; disabled?: boolean;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<{ top: number; left: number; width: number } | null>(null);
  const [ativo, setAtivo] = useState(-1);
  const aberto = !!pop;

  const alvo = semAcento(valor.trim().toUpperCase());
  const ehOpcao = TRAFEGO_OPCOES.some((o) => semAcento(o) === alvo);
  // digitou texto parcial → filtra; campo vazio ou valor já é uma opção → lista completa
  const visiveis = !alvo || ehOpcao ? TRAFEGO_OPCOES : TRAFEGO_OPCOES.filter((o) => semAcento(o).includes(alvo));

  function abrir() {
    const r = caixaRef.current?.getBoundingClientRect();
    if (!r) return;
    setPop({ top: r.bottom + 4, left: r.left, width: r.width });
    setAtivo(-1);
  }
  const fechar = () => { setPop(null); setAtivo(-1); };
  const escolher = (o: string) => { aoMudar(o); fechar(); };

  // fecha ao clicar fora (campo e lista vivem em subtrees diferentes por causa do portal)
  useEffect(() => {
    if (!aberto) return;
    const aoMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!caixaRef.current?.contains(t) && !popRef.current?.contains(t)) fechar();
    };
    const aoRolar = () => fechar();
    document.addEventListener('mousedown', aoMouseDown);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      document.removeEventListener('mousedown', aoMouseDown);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [aberto]);

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) abrir();
      else setAtivo((i) => Math.min(visiveis.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      if (aberto) { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
    } else if (e.key === 'Enter') {
      if (aberto && ativo >= 0 && visiveis[ativo]) { e.preventDefault(); escolher(visiveis[ativo]); }
      else if (aberto) fechar();
    } else if (e.key === 'Escape') {
      // fecha SÓ a lista — sem propagar, senão o Esc fecharia o modal junto
      if (aberto) { e.stopPropagation(); fechar(); }
    }
  }

  return (
    <div className="fj-combo" ref={caixaRef}>
      <input
        className="atv-input"
        value={valor}
        onChange={(e) => { aoMudar(e.target.value); if (!aberto) abrir(); else setAtivo(-1); }}
        onClick={() => { if (!aberto) abrir(); }}
        onKeyDown={aoTeclar}
        placeholder="Selecione ou digite…"
        disabled={disabled}
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
      />
      <button
        type="button"
        className={'fj-combo-seta' + (aberto ? ' aberta' : '')}
        onMouseDown={(e) => { e.preventDefault(); if (aberto) fechar(); else abrir(); }}
        aria-label={aberto ? 'Fechar opções de tráfego' : 'Abrir opções de tráfego'}
        tabIndex={-1}
        disabled={disabled}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {pop && raiz && createPortal(
        <div className="fj-combo-pop" ref={popRef} role="listbox" style={{ top: pop.top, left: pop.left, width: pop.width }}>
          {visiveis.map((o, i) => (
            <button
              type="button"
              key={o}
              className={'fj-combo-op' + (i === ativo ? ' ativo' : '')}
              role="option"
              aria-selected={o === valor}
              onMouseDown={(e) => { e.preventDefault(); escolher(o); }}
              onMouseEnter={() => setAtivo(i)}
            >
              <span>{o}</span>
              {o === valor ? <span className="ck">✓</span> : o === sugerido ? <span className="fj-combo-tag">canal</span> : null}
            </button>
          ))}
          {visiveis.length === 0 && <div className="fj-combo-vazio">Sem opção correspondente — o texto digitado vale como valor livre.</div>}
        </div>,
        raiz,
      )}
    </div>
  );
}
