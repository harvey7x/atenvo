import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type RelFiltros, useResumo, useAtendimento, useFinanceiro, useConexoes, useEquipe,
  montaLinhasEquipe, melhorConexao, type ConexaoLinha, type LinhaEquipe,
} from '@/data/relatorios';
import { criarRaizPortalV2 } from '../components/portal';

/* ------------------------------------------------------------------
   Modo Apresentação de Relatórios (v2.1): takeover fullscreen com
   slides derivados dos MESMOS agregados da página (mesmos hooks →
   mesmas queryKeys → cache compartilhado; zero query nova, leitura
   pura). Auto-avanço ~8s; ←/→/espaço navegam; Esc sai; clique
   avança BLOCO (não pula o slide); slide sem dados é pulado.
   prefers-reduced-motion: navegação manual, sem animações.
   ------------------------------------------------------------------ */

const DUR_SLIDE_MS = 8000;

const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtMin = (n: number | null) => { if (n == null) return '—'; if (n < 60) return `${Math.round(n)} min`; const h = Math.floor(n / 60); return `${h}h ${Math.round(n % 60)}min`; };

/** Contador grande do modo (rAF local; reduced-motion mostra direto). */
function NumAnimado({ alvo, fmt, ativo }: { alvo: number; fmt: (n: number) => string; ativo: boolean }) {
  const [v, setV] = useState(0);
  const reduz = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    if (!ativo) return;
    if (reduz) { setV(alvo); return; }
    let raf = 0; let t0: number | null = null;
    const passo = (ts: number) => {
      if (t0 == null) t0 = ts;
      const p = Math.min((ts - t0) / 1100, 1);
      setV(alvo * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [ativo, alvo, reduz]);
  return <>{fmt(v)}</>;
}

interface DadosApres {
  pessoas: number; clientes: number; conversao: number | null; receita: number;
  semResposta: number; primeiraRespostaMin: number | null;
  funil: { r: string; v: number }[];
  competidores: LinhaEquipe[];
  melhor: ConexaoLinha | null;
  inadimplencia: { taxa: number; parcelas: number } | null;
}

interface Slide { id: string; blocos: number; }

export default function RelatoriosApresentacao({ f, demo, dadosDemo, orgNome, periodoLabel, aoFechar }: {
  f: RelFiltros; demo: boolean; dadosDemo: DadosApres | null; orgNome: string; periodoLabel: string; aoFechar: () => void;
}) {
  // MESMOS hooks/queryKeys da página — cache compartilhado; leitura pura
  const resumo = useResumo(f);
  const at = useAtendimento(f, !demo);
  const fin = useFinanceiro(f, !demo);
  const cx = useConexoes(f, !demo);
  const eq = useEquipe(f, !demo);
  const reduz = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const dados: DadosApres | null = useMemo(() => {
    if (demo) return dadosDemo;
    if (!cx.data) return null;
    const linhas = cx.data;
    const soma = (k: keyof ConexaoLinha) => linhas.reduce((s, l) => s + ((l[k] as number) || 0), 0);
    const equipe = eq.data ? montaLinhasEquipe(eq.data) : [];
    const competidores = equipe.filter((l) => l.id !== 'nao' && l.nome !== 'Não atribuído' && !/bot|matheo/i.test(l.nome))
      .slice().sort((a, b) => b.clientesFechados - a.clientesFechados || b.negociosFechados - a.negociosFechados);
    const pessoas = soma('pessoasQueChamaram');
    const clientes = resumo.data?.oportunidadesFechadas.atual ?? soma('fechados');
    return {
      pessoas,
      clientes,
      conversao: pessoas > 0 ? (clientes / pessoas) * 100 : null,
      receita: resumo.data?.receitaRecebida.atual ?? 0,
      semResposta: at.data?.semResposta ?? 0,
      primeiraRespostaMin: at.data?.primeiraRespostaMin ?? null,
      funil: [
        { r: 'Pessoas que chamaram', v: pessoas },
        { r: 'Conversas atendidas', v: soma('conversasAtendidas') },
        { r: 'Oportunidades', v: soma('oportunidades') },
        { r: 'Qualificados', v: soma('qualificados') },
        { r: 'Clientes fechados', v: soma('fechados') },
      ],
      competidores,
      melhor: melhorConexao(linhas),
      inadimplencia: fin.data && fin.data.vencTotalQtd > 0 ? { taxa: fin.data.inadimplencia, parcelas: fin.data.vencTotalQtd } : null,
    };
  }, [demo, dadosDemo, cx.data, eq.data, resumo.data, at.data, fin.data]);

  // slides com dados (sem dados no período → slide pulado)
  const slides: Slide[] = useMemo(() => {
    if (!dados) return [{ id: 'abertura', blocos: 1 }];
    const s: Slide[] = [{ id: 'abertura', blocos: 1 }];
    const nums = [dados.pessoas > 0, dados.clientes > 0, dados.conversao != null, dados.receita > 0].filter(Boolean).length;
    if (nums > 0) s.push({ id: 'numeros', blocos: 4 });
    if (dados.funil[0].v > 0) s.push({ id: 'funil', blocos: dados.funil.length });
    if (dados.competidores.length > 0) s.push({ id: 'ranking', blocos: Math.min(3, dados.competidores.length) + (dados.competidores.length > 3 ? 1 : 0) });
    const ins = [dados.primeiraRespostaMin != null, true, dados.melhor != null, dados.inadimplencia != null].filter(Boolean).length;
    if (ins > 0) s.push({ id: 'insights', blocos: Math.min(4, ins) });
    s.push({ id: 'fim', blocos: 1 });
    return s;
  }, [dados]);

  const [idx, setIdx] = useState(0);
  const [bloco, setBloco] = useState(1);
  const slide = slides[Math.min(idx, slides.length - 1)];
  const timerRef = useRef<number | null>(null);

  const irPara = useCallback((novo: number) => {
    const alvo = Math.max(0, Math.min(novo, slides.length - 1));
    setIdx(alvo);
    setBloco(slides[alvo].blocos <= 1 ? 1 : 1);
  }, [slides]);

  const avancaBloco = useCallback(() => {
    if (bloco < slide.blocos) { setBloco((b) => b + 1); return; }
    if (idx < slides.length - 1) irPara(idx + 1);
    else aoFechar();
  }, [bloco, slide.blocos, idx, slides.length, irPara, aoFechar]);

  // auto-avanço: revela blocos ao longo do slide e troca ao fim (~8s por slide)
  useEffect(() => {
    if (reduz) return; // reduced-motion: navegação manual
    const passo = DUR_SLIDE_MS / (slide.blocos + 1);
    timerRef.current = window.setInterval(() => {
      setBloco((b) => {
        if (b < slide.blocos) return b + 1;
        if (idx < slides.length - 1) { setIdx(idx + 1); return 1; }
        return b; // último slide: para no fim
      });
    }, passo);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idx, slide.blocos, slides.length, reduz]);

  // teclado: ←/→/espaço navegam; Esc sai
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { aoFechar(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); avancaBloco(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(idx - 1); }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [avancaBloco, irPara, idx, aoFechar]);

  // portal raiz (regra 10)
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => el.remove();
  }, []);
  if (!raiz) return null;

  const B = ({ n, children, style }: { n: number; children: React.ReactNode; style?: React.CSSProperties }) => (
    <div className={'apres-bloco' + (bloco >= n ? ' on' : '')} style={style}>{children}</div>
  );

  return createPortal(
    <div className="apres" onClick={avancaBloco} role="presentation" style={{ ['--apres-dur' as string]: `${DUR_SLIDE_MS}ms` }}>
      <div className="luz" aria-hidden />
      <div className="grao" aria-hidden />
      <div className="apres-prog" aria-hidden>
        {slides.map((s, i) => <i key={s.id} className={i < idx ? 'feito' : i === idx ? 'atual' : ''} style={i === idx ? { animationDelay: '0s' } : undefined} />)}
      </div>
      <button type="button" className="apres-sair" onClick={(e) => { e.stopPropagation(); aoFechar(); }}>Sair (Esc)</button>

      <div className="apres-palco">
        {slide.id === 'abertura' && (
          <div className="apres-slide" key="abertura">
            <B n={1}>
              <div className="apres-eyebrow">Relatório do período</div>
              <div className="apres-display">{orgNome}</div>
              <div className="apres-sub num">{periodoLabel}{demo ? ' · modo demonstração' : ''}</div>
            </B>
          </div>
        )}

        {slide.id === 'numeros' && dados && (
          <div className="apres-slide" key="numeros">
            <div className="apres-eyebrow">Números do período</div>
            <div className="apres-nums">
              <B n={1}><div className="apres-num"><div className="r">Pessoas que chamaram</div><div className="v num"><NumAnimado alvo={dados.pessoas} fmt={fmtInt} ativo={bloco >= 1} /></div><div className="s">inbound · pessoa única por telefone</div></div></B>
              <B n={2}><div className="apres-num"><div className="r">Clientes fechados</div><div className="v num"><NumAnimado alvo={dados.clientes} fmt={fmtInt} ativo={bloco >= 2} /></div><div className="s">ganho no período, por fechado_em</div></div></B>
              <B n={3}><div className="apres-num"><div className="r">Conversão</div><div className="v num">{dados.conversao == null ? '—' : <NumAnimado alvo={dados.conversao} fmt={fmtPct} ativo={bloco >= 3} />}</div><div className="s">clientes ÷ pessoas</div></div></B>
              <B n={4}><div className="apres-num"><div className="r">Receita recebida</div><div className="v num"><NumAnimado alvo={dados.receita} fmt={fmtBRL} ativo={bloco >= 4} /></div><div className="s">parcelas pagas no período</div></div></B>
            </div>
          </div>
        )}

        {slide.id === 'funil' && dados && (
          <div className="apres-slide" key="funil">
            <div className="apres-eyebrow">Funil do tráfego</div>
            <div className="apres-funil">
              {dados.funil.map((e, i) => {
                const max = Math.max(1, ...dados.funil.map((x) => x.v));
                return (
                  <B n={i + 1} key={e.r}>
                    <div className="et">
                      <span className="en">{e.r}</span>
                      <div className="eb"><i style={{ width: `${Math.max(3, (e.v / max) * 100)}%` }} /></div>
                      <span className="ev num">{fmtInt(e.v)}</span>
                    </div>
                  </B>
                );
              })}
            </div>
          </div>
        )}

        {slide.id === 'ranking' && dados && (
          <div className="apres-slide" key="ranking">
            <div className="apres-eyebrow">Ranking do período · clientes fechados</div>
            <div className="apres-podio">
              {dados.competidores.slice(0, 3).map((l, i) => (
                <B n={i + 1} key={l.id}>
                  <div className={'apres-pod' + (i === 0 ? ' ouro' : '')}>
                    <span className="pos">{i + 1}º</span>
                    <div className="nm">{l.nome}</div>
                    <div className="mv num">{fmtInt(l.clientesFechados)}</div>
                    <div className="ml">clientes fechados · {fmtBRL(l.receitaRecebida)} recebidos</div>
                  </div>
                </B>
              ))}
            </div>
            {dados.competidores.length > 3 && (
              <B n={Math.min(3, dados.competidores.length) + 1} style={{ marginTop: 14 }}>
                <div className="apres-sub">{dados.competidores.slice(3).map((l) => `${l.nome} (${fmtInt(l.clientesFechados)})`).join(' · ')}</div>
              </B>
            )}
          </div>
        )}

        {slide.id === 'insights' && dados && (
          <div className="apres-slide" key="insights">
            <div className="apres-eyebrow">Leituras do período</div>
            <div className="apres-ins">
              {dados.primeiraRespostaMin != null && (
                <B n={1}><div className="apres-in"><div className="t">Tempo até 1ª resposta</div><div className="v num">{fmtMin(dados.primeiraRespostaMin)}</div><div className="f">média entre a 1ª mensagem recebida e a 1ª resposta de operador</div></div></B>
              )}
              <B n={2}><div className="apres-in"><div className="t">Conversas sem resposta</div><div className="v num">{fmtInt(dados.semResposta)}</div><div className="f">conversas com entrada e nenhuma resposta de operador no período</div></div></B>
              {dados.melhor && (
                <B n={3}><div className="apres-in"><div className="t">Melhor conexão</div><div className="v">{dados.melhor.nome}</div><div className="f num">{fmtInt(dados.melhor.pessoasQueChamaram)} pessoas · {fmtInt(dados.melhor.fechados)} fechados · {fmtPct(dados.melhor.taxaConversao)}</div></div></B>
              )}
              {dados.inadimplencia && (
                <B n={4}><div className="apres-in"><div className="t">Inadimplência</div><div className="v num">{fmtPct(dados.inadimplencia.taxa)}</div><div className="f num">sobre {fmtInt(dados.inadimplencia.parcelas)} parcelas vencidas no período</div></div></B>
              )}
            </div>
          </div>
        )}

        {slide.id === 'fim' && (
          <div className="apres-slide" style={{ textAlign: 'center' }} key="fim">
            <B n={1}>
              <div className="apres-display" style={{ fontSize: 40 }}>Atenvo</div>
              <div className="apres-sub">{orgNome} · {periodoLabel}</div>
            </B>
          </div>
        )}
      </div>

      <div className="apres-dica">clique ou espaço avançam · ← volta · Esc sai</div>
    </div>,
    raiz,
  );
}
