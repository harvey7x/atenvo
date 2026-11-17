/* ============================================================================
   O cartão da MARCAÇÃO VENCIDA no meio da tela (dono 16/11: "quando o prazo terminar tem que enviar uma
   notificação pro atendente" + "aviso tem que ser no meio da tela, obrigando a atualizar") — só a aparência
   (o shell, via AvisoMarcacao, e a prévia usam o mesmo). O cartão do recado do administrador (.rcd-*: vidro
   escuro, zero emoji) com o filete VERMELHO da marcação vencida (o mesmo vermelho da fila).
   - Uma marcação por vez ("1 de N"): o cliente, a marcação, quando foi marcada e a última atualização, o que fazer,
     "O que foi feito?" com os atalhos de um toque (os que servem para aquela marcação) e Salvar (o prazo recomeça);
     "Já resolvi: tirar a marcação"; "Ver na fila" e "Abrir a conversa" (o aviso espera enquanto estiverem abertas).
   - NÃO fecha: sem Ok, sem ×, o Esc não some com ele. Sai só quando a marcação é atualizada ou tirada. Nenhuma
     tecla apertada nele chega à página de trás.
   - Um cartão por aviso (o contêiner troca pela key): o que estava escrito volta pelo `rascunho`.
   ============================================================================ */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { atalhosDoTipo, EQUIPE, HORAS_MARCACAO } from '../pages/filaIris/dados';
import { TEXTO_VENCIDA, curtoDaVencida, type AvisoVencida, type ResultadoAviso } from '../pages/filaIris/avisosTexto';
import { haQuantoAviso } from './CartaoAvisoIris';
import './recado.css';
import './marcacaoVencida.css';

const IcRelogio = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
  </svg>
);

/** a frase de cada saída (o toast) */
export const FRASE_DO_RESULTADO: Record<ResultadoAviso, string> = {
  atualizada: `Marcação atualizada. O prazo recomeçou: ${HORAS_MARCACAO} horas.`,
  ligacao: `Ligação contada. O prazo recomeçou: ${HORAS_MARCACAO} horas.`,
  tirada: 'Marcação tirada da fila.',
  ja_tirada: 'Esta marcação já tinha sido tirada da fila.',
  outro_dono: 'Este cliente passou para outro atendente.',
};

/** o texto que o leitor de tela anuncia quando o cartão aparece ou troca (a região viva fica no contêiner) */
export function anuncioDaVencida(a: AvisoVencida | undefined, total: number): string {
  if (!a) return '';
  return `${TEXTO_VENCIDA.marca}${total > 1 ? `, 1 de ${total}` : ''}: ${a.nome}, ${curtoDaVencida(a)}. ${TEXTO_VENCIDA.faca}`;
}

/** "Marcada há 3 dias · última atualização há 1 dia: “Cobrei de novo”" (quem atualizou aparece quando foi outra pessoa) */
export function historicoDaVencida(a: AvisoVencida, agora = Date.now(), euId?: string): string {
  const partes: string[] = [];
  if (a.marcadaEm) partes.push(`marcada ${haQuantoAviso(a.marcadaEm, agora)}`);
  if (a.ult) {
    const outro = a.ult.por && a.ult.por !== euId
      ? (a.ult.porNome?.trim().split(/\s+/)[0] || EQUIPE.find((x) => x.uid === a.ult?.por)?.nome || 'outra pessoa') : null;
    partes.push(`última atualização ${haQuantoAviso(a.ult.em, agora)}${outro ? ` (${outro})` : ''}: “${a.ult.texto}”`);
  }
  const t = partes.join(' · ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

export interface PropsCartaoMarcacaoVencida {
  /** a da frente */
  aviso: AvisoVencida;
  /** quantas estão vencidas (o "1 de N") */
  total: number;
  agora?: number;
  /** quem está olhando (a última atualização feita por outra pessoa mostra o nome dela) */
  euId?: string;
  /** o que já estava escrito neste aviso (o cartão saiu e voltou) */
  rascunho?: string;
  aoMudarRascunho?: (texto: string) => void;
  aoSalvar: (texto: string) => Promise<void>;
  aoTirar: () => Promise<void>;
  /** a ficha do cliente na Fila (o aviso espera enquanto ela estiver aberta) */
  aoVerNaFila?: () => void;
  /** sem conversa no cliente, o botão não aparece */
  aoAbrirConversa?: () => void;
}

export function CartaoMarcacaoVencida({
  aviso, total, agora, euId, rascunho = '', aoMudarRascunho, aoSalvar, aoTirar, aoVerNaFila, aoAbrirConversa,
}: PropsCartaoMarcacaoVencida) {
  const id = useId();
  const [texto, setTextoLocal] = useState(rascunho);
  const [enviando, setEnviando] = useState<'salvar' | 'tirar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  /* o cartão pode sair no meio do salvar (cedeu a vez, a próxima vencida): o resultado não se perde */
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const setTexto = (t: string) => { setTextoLocal(t); aoMudarRascunho?.(t); };

  const curto = curtoDaVencida(aviso);
  const historico = historicoDaVencida(aviso, agora, euId);
  const fazer = async (qual: 'salvar' | 'tirar', f: () => Promise<void>) => {
    if (enviando) return;
    setEnviando(qual); setErro(null);
    try {
      await f();
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : 'Não deu para salvar agora. Tente de novo.');
    } finally {
      if (vivo.current) setEnviando(null);
    }
  };
  const salvar = () => { if (texto.trim().length >= 2) void fazer('salvar', () => aoSalvar(texto.trim())); };
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    /* nenhuma tecla daqui chega aos atalhos da página de trás (o Tab preso é do contêiner, na captura); o Esc não
       some com o aviso (sai só quando a marcação é atualizada ou tirada) */
    e.stopPropagation();
    if (e.key === 'Escape') e.preventDefault();
  };
  return (
    <>
      {total > 1 && <span className="rcd-camada" aria-hidden />}
      <section className="rcd-aviso" data-tipo="vencida" tabIndex={-1} aria-labelledby={`${id}-m ${id}-t`} aria-describedby={`${id}-f`} onKeyDown={tecla}>
        <header className="rcd-topo">
          <span className="rcd-marca" id={`${id}-m`}><IcRelogio />{TEXTO_VENCIDA.marca}</span>
          {total > 1 && <span className="rcd-conta">1 de {total}</span>}
          <span className="rcd-hora">venceu {haQuantoAviso(aviso.venceEm, agora)}</span>
        </header>
        <div className="rcd-miolo">
          <p className="rcd-cliente" id={`${id}-t`}>{aviso.nome}</p>
          <p className="mvc-marcacao"><i aria-hidden />{curto}</p>
          {historico && <p className="mvc-meta">{historico}</p>}
          <p className="mvc-faca" id={`${id}-f`}>{TEXTO_VENCIDA.faca}</p>
          <div className="mvc-form">
            <p className="rcd-rot" id={`${id}-r`}>O que foi feito?</p>
            <div className="mvc-atalhos" role="group" aria-labelledby={`${id}-r`}>
              {atalhosDoTipo(aviso.tipo).map((a) => (
                <button key={a} type="button" className="rcd-op" data-on={texto.trim() === a ? '' : undefined} aria-pressed={texto.trim() === a}
                  disabled={!!enviando} onClick={() => { setTexto(a); setErro(null); campo.current?.focus(); }}>{a}</button>
              ))}
            </div>
            <div className="mvc-linha">
              <div className="rcd-campo-caixa">
                <textarea ref={campo} className="rcd-campo" rows={2} maxLength={200} value={texto} readOnly={!!enviando}
                  placeholder="Ex.: cobrei o comprovante de novo" aria-label={`O que foi feito: ${curto}, ${aviso.nome}`}
                  aria-describedby={`${id}-d`}
                  onChange={(e) => { setTexto(e.target.value); setErro(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') return;
                    e.stopPropagation();
                    /* Enter segurado não salva de novo (nem no aviso seguinte) */
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!e.repeat) salvar(); }
                  }} />
                <span className="rcd-dica" id={`${id}-d`}>Enter salva · o prazo recomeça: mais {HORAS_MARCACAO} horas</span>
              </div>
              <button type="button" className="rcd-bt rcd-forte rcd-enviar" disabled={texto.trim().length < 2 || !!enviando} onClick={salvar}>
                {enviando === 'salvar' ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
          <div className="rcd-acoes">
            <button type="button" className="rcd-bt" disabled={!!enviando} onClick={() => void fazer('tirar', aoTirar)}
              title="A marcação sai da fila (o que ela pedia já foi feito)">
              {enviando === 'tirar' ? 'Tirando…' : 'Já resolvi: tirar a marcação'}
            </button>
            {aoVerNaFila && (
              <button type="button" className="rcd-bt rcd-fraco" disabled={!!enviando} onClick={aoVerNaFila}
                title="Abre a ficha do cliente na Fila da Iris; o aviso espera enquanto ela estiver aberta">Ver na fila</button>
            )}
            {aoAbrirConversa && (
              <button type="button" className="rcd-bt rcd-fraco" disabled={!!enviando} onClick={aoAbrirConversa}
                title="Abre a conversa do cliente; o aviso espera enquanto ela estiver aberta">Abrir a conversa</button>
            )}
          </div>
          {erro && <p className="rcd-erro" role="alert">{erro}</p>}
        </div>
      </section>
    </>
  );
}
