/* "Novo mês" da Gestão de cobranças (dono 28/09: "precisa ter a opção de adicionar novo mês,
   aí adiciona o mês seguinte"). Antes existia só escondido no clique direito da letra da coluna.

   Abre a coluna do PRÓXIMO mês em TODOS os ciclos de uma vez (planilha_coluna_criar tipo 'mes',
   que já puxa os pagamentos que existirem). Cada ciclo tem o próprio mês (fim do mês × início do
   mês) e a própria data no cabeçalho — calculada pelo calendário do INSS (dias úteis, feriados),
   mas editável aqui antes de criar. Coluna de mês NÃO se exclui depois (alimenta o sistema),
   por isso a confirmação. */
import { useId, useRef, useState } from 'react';
import { BotaoPrimario, BotaoSec, ModalV2 } from '../../components';
import { btrim, compSoma, type PlColuna, type PlColunaOp, type PlDados } from '../../data/cobranca/planilha';
import { cabecalhosNovoMes } from './PlanilhaExcel';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const curto = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]}/${String(y).slice(2)}`; };
const longo = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MESES_LONGOS[m - 1]} de ${y}`; };
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface PlanoNovoMes {
  /** posição do mês novo (mes_pos) e título da coluna */
  k: number; titulo: string;
  /** coluna depois da qual entra (a última de mês; sem meses, a última da folha) */
  ref: string | null;
  /** ciclos com mês-base, na ordem do calendário (fim do mês, depois início) */
  ciclos: { id: string; dia: number; fim: boolean; comp: string; cab: string }[];
  /** meses distintos que a coluna abre (ex.: ['2026-10', '2026-11']) */
  comps: string[];
  temNovos: boolean;
}

/** o que "Novo mês" vai fazer, sem gravar nada (também usado no rótulo do botão) */
export function planoNovoMes(dados: PlDados): PlanoNovoMes {
  const colunas: PlColuna[] = dados.colunas;
  const meses = colunas.filter((c) => c.tipo === 'mes' && c.mesPos != null);
  const k = meses.length ? Math.max(...meses.map((c) => c.mesPos as number)) + 1 : 0;
  const ultimaMes = meses.length ? meses.reduce((a, c) => (c.ordem > a.ordem ? c : a)) : null;
  const ultimaFolha = colunas.length ? colunas.reduce((a, c) => (c.ordem > a.ordem ? c : a)) : null;
  const cab = cabecalhosNovoMes(dados, colunas, k);
  const ciclos = dados.blocos
    .filter((b) => b.compBase && b.dia != null)
    .map((b) => {
      const comp = compSoma(b.compBase as string, k);
      return { id: b.id, dia: b.dia as number, fim: (b.dia as number) >= 15, comp, cab: cab[b.id] ?? curto(comp) };
    })
    // mesma ordem do seletor de ciclos: fim do mês (D24…D30) e depois início (D01…D07)
    .sort((a, b) => (a.fim === b.fim ? a.dia - b.dia : a.fim ? -1 : 1));
  const comps = [...new Set(ciclos.map((c) => c.comp))].sort();
  return {
    k, titulo: `Mês ${k + 1}`, ref: (ultimaMes ?? ultimaFolha)?.id ?? null, ciclos, comps,
    temNovos: dados.blocos.some((b) => !b.compBase),
  };
}

/** "out/26 · nov/26" */
export function rotuloNovoMes(p: PlanoNovoMes): string {
  return p.comps.map(curto).join(' · ');
}

const maxMesPos = (d: PlDados) => d.colunas.reduce((mx, c) => (c.tipo === 'mes' && c.mesPos != null && c.mesPos > mx ? c.mesPos : mx), -1);
const msgAmigavel = (e: unknown) => {
  const m = String((e as Error)?.message ?? '');
  if (/fetch|network|rede|timeout/i.test(m)) return 'Sem resposta do servidor — confira a internet. Se o mês chegou a ser criado, ele já aparece na planilha.';
  return m || 'Não deu pra adicionar o mês agora. Tente de novo.';
};

export function NovoMesModal({ dados, aoFechar, criar, conferir, aoCriado }: {
  dados: PlDados;
  aoFechar: () => void;
  criar: (op: PlColunaOp) => Promise<unknown>;
  /** relê a planilha do banco e devolve a versão nova (confere antes de criar e atualiza a tela depois) */
  conferir: () => Promise<PlDados | undefined>;
  aoCriado: (msg: string) => void;
}) {
  /* o plano é TRAVADO quando a janela abre: se a planilha mudar com ela aberta (outra pessoa,
     um pagamento aprovado que abre mês sozinho, um clique duplo), a janela avisa em vez de
     gravar o título e os cabeçalhos deste mês numa coluna de outro mês */
  const [plano] = useState(() => planoNovoMes(dados));
  const [cabs, setCabs] = useState<Record<string, string>>(() => Object.fromEntries(plano.ciclos.map((c) => [c.id, c.cab])));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const jaCriado = maxMesPos(dados) >= plano.k;
  const avisoId = useId();
  const btRef = useRef<HTMLDivElement>(null);
  const grupos = [
    { rot: 'Fim do mês', itens: plano.ciclos.filter((c) => c.fim) },
    { rot: 'Início do mês', itens: plano.ciclos.filter((c) => !c.fim) },
  ].filter((g) => g.itens.length > 0);

  const confirmar = async () => {
    if (enviando || !plano.ref || jaCriado) return;
    setEnviando(true); setErro('');
    try {
      const atual = await conferir();
      if (atual && maxMesPos(atual) >= plano.k) {
        setErro(`O ${plano.titulo} já foi criado (por você ou por outra pessoa) — confira a planilha antes de adicionar outro.`);
        setEnviando(false);
        return;
      }
      const cab: Record<string, string> = {};
      for (const c of plano.ciclos) cab[c.id] = btrim(cabs[c.id]) || c.cab;
      await criar({ op: 'criar', ref: plano.ref, lado: 'dir', tipo: 'mes', titulo: plano.titulo, cab });
      await conferir().catch(() => undefined);   // a tela já abre com a coluna nova (e o próximo "Novo mês" parte dela)
      const partes = grupos.map((g) => `${g.rot.toLowerCase()}: ${[...new Set(g.itens.map((c) => curto(c.comp)))].join(', ')}`);
      aoCriado(`${plano.titulo} adicionado — ${partes.join(' · ')}.`);
      aoFechar();
    } catch (e) {
      setErro(msgAmigavel(e));
      setEnviando(false);
    }
  };
  // Enter num cabeçalho vai pro próximo (como na planilha); no último, vai pro botão — criar é sempre um clique
  const proximo = (el: HTMLInputElement) => {
    const campos = Array.from(el.closest('.gp-nm')?.querySelectorAll<HTMLInputElement>('.gp-nm-inp') ?? []);
    const i = campos.indexOf(el);
    if (i >= 0 && i < campos.length - 1) campos[i + 1].focus();
    else btRef.current?.closest('.p-modal')?.querySelector<HTMLButtonElement>('.p-modal-rodape .btn-pri, .p-modal-rodape button:last-child')?.focus();
  };

  return (
    <ModalV2 aberto aoFechar={() => { if (!enviando) aoFechar(); }} largura={560} descricaoId={avisoId}
      titulo={<div>Adicionar o mês seguinte<div className="mod-sub">Uma coluna nova depois do último mês, em todos os ciclos de uma vez</div></div>}
      rodape={<>
        <BotaoSec onClick={aoFechar} disabled={enviando}>Cancelar</BotaoSec>
        <BotaoPrimario onClick={() => { void confirmar(); }} disabled={enviando || !plano.ref || jaCriado}>
          {enviando ? 'Adicionando…' : `Adicionar mês (${rotuloNovoMes(plano) || plano.titulo})`}
        </BotaoPrimario>
      </>}>
      <div className="gp-nm" ref={btRef}>
        <p className="gp-nm-alerta" id={avisoId}>
          <b>Não dá pra desfazer:</b> coluna de mês não pode ser excluída depois — ela alimenta o painel, a régua e as comissões.
        </p>
        {jaCriado && (
          <div className="gs-aviso erro" role="alert"><span>O {plano.titulo} já foi criado enquanto esta janela estava aberta. Feche e confira a planilha.</span></div>
        )}
        {plano.ciclos.length === 0 ? (
          <p className="gp-nm-nota">Nenhum ciclo com mês de cobrança na planilha — a coluna entra em branco.</p>
        ) : grupos.map((g) => {
          const compsG = [...new Set(g.itens.map((c) => c.comp))];
          return (
            <section key={g.rot} className="gp-nm-grupo" aria-label={`${g.rot}: ${compsG.map(longo).join(', ')}`}>
              <header className="gp-nm-cab">
                <span className="gp-nm-rot">{g.rot}</span>
                <b className="gp-nm-mes">{compsG.map((c) => maiuscula(longo(c))).join(' · ')}</b>
              </header>
              <div className="gp-nm-lista">
                {g.itens.map((c) => (
                  <label key={c.id} className="gp-nm-item">
                    <span className="gp-nm-ciclo num">{c.id}</span>
                    <span className="gp-nm-lbl">Cabeçalho</span>
                    <input className="inp gp-nm-inp num" value={cabs[c.id] ?? ''} maxLength={20} disabled={enviando || jaCriado}
                      aria-label={`Cabeçalho do ciclo ${c.id} em ${longo(c.comp)}`}
                      onChange={(e) => setCabs((x) => ({ ...x, [c.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); proximo(e.currentTarget); } }} />
                  </label>
                ))}
              </div>
            </section>
          );
        })}
        <ul className="gp-nm-regras">
          <li>A data de cada cabeçalho segue o calendário de pagamento do INSS (dias úteis bancários). Confira e ajuste se o pagamento cair em outro dia.</li>
          <li>A coluna nasce vazia. Pagamentos que já estiverem lançados para esses meses aparecem sozinhos.</li>
          {plano.temNovos && <li>No bloco Novos a coluna fica em branco — lá o mês ainda não conta como cobrança.</li>}
        </ul>
        {erro && <div className="gs-aviso erro" role="alert"><span>{erro}</span></div>}
      </div>
    </ModalV2>
  );
}
