import { useEffect, useState } from 'react';
import { ModalV2 } from './ModalV2';
import { BotaoPrimario } from './Botao';
import { LogoAtenvo } from './LogoAtenvo';
import { Toggle } from './Toggle';
import { assinarAcento, lerAcento, salvarAcento, type Acento } from '../lib/acento';
import { assinarModoPerf, lerModoPerf, salvarModoPerf, type ModoPerf } from '../lib/perf';
import { saudacaoPorHora } from '../lib/introDia';
import { BRIEF_REAL, seedBriefingDia, useBriefingDia, type BriefingDia } from '@/data/introDia';

/* ------------------------------------------------------------------
   Intro do dia (dono 28/08): recepção na primeira entrada de cada dia.
   Saudação pelo primeiro nome, escolha de cor (aplica AO VIVO — o app
   atrás do vidro troca junto), modo Leve e o briefing de atendimentos.
   Fechar por qualquer via (CTA, X, véu, Esc) marca o dia como visto.
   ------------------------------------------------------------------ */

/* amostras fixas dos acentos (tom do dark — são identidade do seletor,
   não interação, então não seguem o token) */
const CORES: { valor: Acento; rotulo: string; cor: string }[] = [
  { valor: 'azul', rotulo: 'Azul', cor: '#4C8DFF' },
  { valor: 'verde', rotulo: 'Verde', cor: '#3BD689' },
  { valor: 'dourado', rotulo: 'Dourado', cor: '#F0BC4E' },
];

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

export function IntroDia({ aberta, aoConcluir, nome }: {
  aberta: boolean;
  aoConcluir: () => void;
  nome: string;
}) {
  const [acento, setAcento] = useState<Acento>(() => lerAcento());
  useEffect(() => assinarAcento(setAcento), []);
  const [modoPerf, setModoPerf] = useState<ModoPerf>(() => lerModoPerf());
  useEffect(() => assinarModoPerf(setModoPerf), []);

  const briefQ = useBriefingDia(aberta);
  const brief: BriefingDia | undefined = BRIEF_REAL ? briefQ.data : seedBriefingDia();

  if (!aberta) return null;

  const primeiroNome = nome.trim().split(/\s+/)[0] || 'Equipe';
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ModalV2
      aberto={aberta}
      aoFechar={aoConcluir}
      largura={520}
      rodape={<BotaoPrimario onClick={aoConcluir}>Começar o dia</BotaoPrimario>}
    >
      <div className="intro-dia">
        <div className="id-cab">
          <LogoAtenvo className="id-marca" />
          <div className="id-quem">
            <div className="id-ola">{saudacaoPorHora()}, {primeiroNome}!</div>
            <div className="id-data">{dataLonga}</div>
          </div>
        </div>

        <div className="id-brief">
          {brief ? (
            <>
              <div className="id-num">
                <b>{brief.paraAtender}</b>
                <span>{plural(brief.paraAtender, 'cliente novo pra atender', 'clientes novos pra atender')}</span>
              </div>
              <div className="id-num">
                <b>{brief.naoLidas}</b>
                <span>{plural(brief.naoLidas, 'conversa não lida', 'conversas não lidas')}</span>
              </div>
            </>
          ) : (
            <div className="id-carregando">Contando os atendimentos…</div>
          )}
        </div>

        <div className="id-sec">
          <div className="id-rot">Qual cor você quer usar hoje?</div>
          <div className="id-cores" role="radiogroup" aria-label="Cor do sistema">
            {CORES.map((c) => (
              <button
                key={c.valor}
                type="button"
                role="radio"
                aria-checked={acento === c.valor}
                className={acento === c.valor ? 'id-cor on' : 'id-cor'}
                onClick={() => salvarAcento(c.valor)}
              >
                <span className="id-sw" style={{ background: c.cor }} aria-hidden />
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="id-linha">
          <div>
            <div className="id-rot" id="id-rot-leve">Modo Leve</div>
            <div className="id-sub">visual sólido, mais rápido em qualquer máquina</div>
          </div>
          <Toggle
            ligado={modoPerf === 'lite'}
            aoMudar={(v) => salvarModoPerf(v ? 'lite' : 'full')}
            rotuladoPor="id-rot-leve"
          />
        </div>
      </div>
    </ModalV2>
  );
}
