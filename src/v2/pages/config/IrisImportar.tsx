/* IMPORTAR A CONFIGURAÇÃO DA IRIS (dono 22/11): "eu vou configurar aqui, vou dar um arquivo pra eles e
   eles vão colar lá e vai ficar certinho — quem vai fazer a configuração provavelmente vou ser eu".
   Quem recebe o arquivo não precisa entender nada: escolhe o arquivo (ou cola o texto que recebeu), o
   sistema CONFERE e mostra o que veio, e a importação ATUALIZA a atendente que já existe — a chave do
   Google e os números continuam como estão. No fim, a lista do que ainda falta para ela atender.
   As regras do arquivo (o que entra e o que é cortado) são as de data/iaArquivo.ts — as mesmas da
   ferramenta que confere o arquivo antes de ele sair (tools/iris/conferir.ts). */
import { useRef, useState, type DragEvent } from 'react';
import { BotaoPrimario, BotaoSec, CardVidro, ModalV2 } from '../../components';
import { parseAgenteImportado, resumoDoArquivo, type ArquivoAgente } from '@/data/iaArquivo';
import { lerArquivoTexto } from '@/v2/lib/arquivo';

export type ModoImportar = 'atualizar' | 'criar';
export type SecaoIris = 'identidade' | 'chave' | 'canais';
export interface SituacaoIris { chave: boolean; canais: number; ligada: boolean }

const IcCerto = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>;
const IcFalta = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 8v5" /><path d="M12 16.5h.01" /></svg>;
const IcArquivo = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" /></svg>;

/** os quatro passos para a Iris atender, com o que já está pronto e onde resolver o que falta */
function passos(sit: SituacaoIris, temConfig: boolean): { rotulo: string; ok: boolean; nota: string; secao?: SecaoIris }[] {
  return [
    { rotulo: 'Configuração', ok: temConfig, nota: temConfig ? 'No sistema' : 'Importe o arquivo que você recebeu' },
    { rotulo: 'Chave do Google', ok: sit.chave, nota: sit.chave ? 'Guardada no cofre' : 'Cole a chave e guarde no cofre', secao: 'chave' },
    { rotulo: 'Números de WhatsApp', ok: sit.canais > 0, nota: sit.canais > 0 ? `${sit.canais} ${sit.canais === 1 ? 'número escolhido' : 'números escolhidos'}` : 'Escolha em quais números ela atende', secao: 'canais' },
    { rotulo: 'Iris ligada', ok: sit.ligada, nota: sit.ligada ? 'Atendendo' : 'Ligue quando a chave e os números estiverem prontos', secao: 'identidade' },
  ];
}

/* ---------------- a faixa no alto da tela: o que falta para ela atender ---------------- */
export function PassosIris({ sit, temConfig, aoIr }: { sit: SituacaoIris; temConfig: boolean; aoIr: (s: SecaoIris) => void }) {
  const lista = passos(sit, temConfig);
  const faltam = lista.filter((p) => !p.ok).length;
  return (
    <CardVidro sobe className="ia-card cfgr-passos" data-passos-iris>
      <div className="cfgr-passos-cab">
        <h3>Para a Iris atender</h3>
        <span>{faltam ? `${faltam === 1 ? 'Falta 1 passo' : `Faltam ${faltam} passos`}` : 'Tudo pronto'}</span>
      </div>
      <ol className="cfgr-passos-lista">
        {lista.map((p) => (
          <li key={p.rotulo} className={p.ok ? 'ok' : 'falta'}>
            <i aria-hidden>{p.ok ? <IcCerto /> : <IcFalta />}</i>
            <span><b>{p.rotulo}</b><small>{p.nota}</small></span>
            {!p.ok && p.secao && <button type="button" className="cfgi-link" onClick={() => aoIr(p.secao!)}>Resolver</button>}
          </li>
        ))}
      </ol>
    </CardVidro>
  );
}

/* ---------------- a janela: escolher (ou colar) → conferir → pronto ---------------- */
export function JanelaImportarIris({ atual, edicaoNaoSalva, aoAplicar, aoFechar, aoIr }: {
  atual: { nome: string } | null;
  edicaoNaoSalva: boolean;
  aoAplicar: (dados: ArquivoAgente, modo: ModoImportar) => Promise<SituacaoIris>;
  aoFechar: () => void;
  aoIr: (s: SecaoIris) => void;
}) {
  const [fase, setFase] = useState<'escolher' | 'conferir' | 'pronto'>('escolher');
  const [colado, setColado] = useState('');
  const [dados, setDados] = useState<ArquivoAgente | null>(null);
  const [origem, setOrigem] = useState('');
  const [modo, setModo] = useState<ModoImportar>(atual ? 'atualizar' : 'criar');
  const [sit, setSit] = useState<SituacaoIris | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [sobre, setSobre] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const conferir = (texto: string, de: string) => {
    try { setDados(parseAgenteImportado(texto)); setOrigem(de); setErro(''); setFase('conferir'); }
    catch { setErro('Este não é um arquivo de configuração da Iris. Confira se é o arquivo que você recebeu, sem alterações.'); }
  };
  const doArquivo = async (f: File | undefined) => {
    if (!f) return;
    try { conferir(await lerArquivoTexto(f), f.name); }
    catch (x) { setErro((x as Error)?.message || 'Não consegui ler o arquivo.'); }
  };
  const soltar = (e: DragEvent) => { e.preventDefault(); setSobre(false); void doArquivo(e.dataTransfer.files?.[0]); };
  const importar = async () => {
    if (!dados) return;
    setOcupado(true); setErro('');
    try { setSit(await aoAplicar(dados, modo)); setFase('pronto'); }
    catch (x) { setErro((x as Error)?.message || 'Não foi possível importar. Tente de novo.'); }
    finally { setOcupado(false); }
  };
  const fechar = () => { if (!ocupado) aoFechar(); };
  const ir = (s: SecaoIris) => { aoFechar(); window.setTimeout(() => aoIr(s), 80); };

  const falta = sit ? passos(sit, true).find((p) => !p.ok) : undefined;
  const titulo = fase === 'pronto' ? 'Configuração importada' : 'Importar configuração da Iris';
  const sub = fase === 'escolher' ? 'O arquivo que você recebeu de quem configurou a Iris'
    : fase === 'conferir' ? `Confira o que veio${origem ? ` · ${origem}` : ''}`
    : falta ? 'Entrou certinho. Veja o que ainda falta para ela atender' : 'Entrou certinho e a Iris está pronta para atender';

  return (
    <ModalV2 aberto aoFechar={fechar} largura={560} fecharNoVeu={fase !== 'conferir' && !ocupado}
      titulo={<div>{titulo}<div className="mod-sub">{sub}</div></div>}
      rodape={fase === 'escolher'
        ? <BotaoSec onClick={fechar}>Cancelar</BotaoSec>
        : fase === 'conferir'
          ? <><BotaoSec disabled={ocupado} onClick={() => { setFase('escolher'); setErro(''); }}>Voltar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={() => void importar()}>{ocupado ? 'Importando…' : modo === 'atualizar' ? 'Atualizar a Iris' : 'Importar'}</BotaoPrimario></>
          : <>{falta?.secao && <BotaoSec onClick={() => ir(falta.secao!)}>{falta.secao === 'chave' ? 'Ir para a chave' : falta.secao === 'canais' ? 'Ir para os números' : 'Ir para ligar'}</BotaoSec>}<BotaoPrimario onClick={fechar}>Concluir</BotaoPrimario></>}>
      {fase === 'escolher' && (
        <div className="pn-us-form">
          <button type="button" className={`cfgr-solta${sobre ? ' sobre' : ''}`} onClick={() => campo.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
            <i aria-hidden><IcArquivo /></i>
            <b>Escolher o arquivo</b>
            <span>ou arraste o arquivo para cá</span>
          </button>
          <input ref={campo} type="file" accept=".json,application/json,text/plain" hidden data-iris-arquivo onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void doArquivo(f); }} />
          <div className="pn-us-campo">
            <label htmlFor="iris-colar">Ou cole aqui o texto que você recebeu</label>
            <textarea id="iris-colar" className="inp cfgo-texto" rows={4} value={colado} spellCheck={false} onChange={(e) => { setColado(e.target.value); setErro(''); }} />
            <BotaoSec disabled={!colado.trim()} onClick={() => conferir(colado, 'texto colado')}>Conferir o texto</BotaoSec>
          </div>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
      {fase === 'conferir' && dados && (
        <div className="pn-us-form">
          {(dados.info.para || dados.info.feitoEm || dados.info.nota) && (
            <p className="cfgi-nota" role="note">
              {[dados.info.para && `Configuração de ${dados.info.para}`, dados.info.feitoEm && `feita em ${dados.info.feitoEm}`].filter(Boolean).join(', ')}
              {dados.info.nota && <>{(dados.info.para || dados.info.feitoEm) ? '. ' : ''}{dados.info.nota}</>}
            </p>
          )}
          <dl className="cfgr-resumo">
            {resumoDoArquivo(dados).map((l) => <div key={l.rotulo} className={l.vazio ? 'vazio' : undefined}><dt>{l.rotulo}</dt><dd className="num">{l.valor}</dd></div>)}
          </dl>
          {dados.cortes.map((c) => <p key={c} className="cfgi-nota" role="alert">{c}</p>)}
          {atual && (
            <div className="pn-us-campo">
              <span className="pn-us-rot">O que fazer com este arquivo?</span>
              <div className="pn-us-opcoes" role="radiogroup" aria-label="O que fazer com o arquivo">
                <button type="button" role="radio" aria-checked={modo === 'atualizar'} className={modo === 'atualizar' ? 'on' : undefined} onClick={() => setModo('atualizar')}>
                  <b>Atualizar a {atual.nome}</b><span>Troca a configuração pela do arquivo. A chave do Google e os números continuam como estão.</span>
                </button>
                <button type="button" role="radio" aria-checked={modo === 'criar'} className={modo === 'criar' ? 'on' : undefined} onClick={() => setModo('criar')}>
                  <b>Criar outra atendente</b><span>Entra ao lado da atual, desligada e sem chave.</span>
                </button>
              </div>
              {edicaoNaoSalva && modo === 'atualizar' && <span className="pn-us-dica">Há mudanças não salvas na tela. Ao atualizar, vale o que está no arquivo.</span>}
            </div>
          )}
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
      {fase === 'pronto' && sit && (
        <ul className="cfgo-conf">
          {passos(sit, true).map((p) => (
            <li key={p.rotulo} className={p.ok ? 'ok' : 'falta'}>
              <i aria-hidden>{p.ok ? <IcCerto /> : <IcFalta />}</i>
              <span><b>{p.rotulo}</b><small>{p.rotulo === 'Configuração' ? `${dados?.nome ?? 'Iris'} ${modo === 'atualizar' ? 'atualizada' : 'criada'} com o arquivo` : p.nota}</small></span>
            </li>
          ))}
        </ul>
      )}
    </ModalV2>
  );
}
