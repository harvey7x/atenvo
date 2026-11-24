/* As partes da configuração de uma versão da Iris (cada uma é um pedaço de IrisConfig — ver data/config/iris.ts). */
import { useMemo, useState, type ReactNode } from 'react';
import { BadgeStatus, BotaoSec, Toggle } from '../../../components';
import {
  ESTADOS, GRUPOS_TEXTO, ROTULO_TURNO, VARIAVEIS, exemplo, textosDaVersao,
  type AtendenteIris, type DocumentoIris, type GrupoTexto, type IrisConfig, type PerguntaIris, type TextoIris, type TipoPergunta, type Turno,
} from '../../../data/config/iris';
import { Bloco, Escolha, Etiquetas, Faixa, Liga, Numero, Texto, TextoLongo } from './campos';

export type Mudar = (fn: (c: IrisConfig) => IrisConfig) => void;
interface P { c: IrisConfig; set: Mudar }
const novoId = (pre: string) => `${pre}-${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------ quem ela é ------------------------------ */
export function SecQuem({ c, set }: P) {
  const i = c.identidade;
  const mud = (k: keyof IrisConfig['identidade']) => (v: string) => set((x) => ({ ...x, identidade: { ...x.identidade, [k]: v } }));
  const apresentacao = c.textos.find((t) => t.id === 'T02')?.texto ?? 'Oi, tudo bem? Aqui é a {assistente}, sou {rotulo} da {empresa}.';
  return (
    <>
      <Bloco titulo="Identidade" desc="Como ela se chama e de qual empresa ela fala.">
        <div className="irs-grade3">
          <Texto rotulo="Nome dela" valor={i.assistente} aoMudar={mud('assistente')} max={40} />
          <Texto rotulo="Como ela se descreve" valor={i.rotulo} aoMudar={mud('rotulo')} placeholder="atendente virtual" max={60} />
          <Texto rotulo="Nome da empresa" valor={i.empresa} aoMudar={mud('empresa')} falta max={60} />
        </div>
        <div className="irs-fala" aria-label="Exemplo da apresentação">
          <span className="irs-fala-de">Assim ela se apresenta</span>
          <p>{exemplo(apresentacao, c)}</p>
        </div>
      </Bloco>
      <Bloco titulo="O trabalho dela" desc="O que ela faz nesta versão e como ela fala. Vai para o motor junto com as regras de fábrica, que não mudam.">
        <TextoLongo rotulo="O que ela faz" valor={i.papel} aoMudar={mud('papel')} linhas={3} max={1500}
          dica="Ex.: faz o primeiro atendimento, a análise inicial e pede os documentos; quem conclui é o atendente." />
        <TextoLongo rotulo="Como ela fala" valor={i.instrucoes} aoMudar={mud('instrucoes')} linhas={4} max={4000}
          dica="O jeito dela: educada, calma, frases curtas. Escreva como explicaria para uma atendente nova." />
        <Texto rotulo="Se perguntarem se ela é um robô" valor={i.respostaRobo} aoMudar={mud('respostaRobo')} largo max={300}
          dica={<>Ela sempre diz que é virtual. Pode usar {'{assistente}'}, {'{rotulo}'} e {'{empresa}'}.</>} />
      </Bloco>
      <Bloco titulo="Tom" desc="O formato das mensagens dela.">
        <div className="irs-grade2">
          <Escolha rotulo="Como ela trata o cliente" valor={c.tom.tratamento} aoMudar={(v) => set((x) => ({ ...x, tom: { ...x.tom, tratamento: v } }))}
            opcoes={[{ valor: 'senhor', rotulo: 'O senhor, a senhora', desc: 'No texto. No áudio ela usa "você", mais natural.' }, { valor: 'voce', rotulo: 'Você', desc: 'Em tudo.' }]} />
          <div className="irs-col">
            <Numero rotulo="Mensagens por resposta, no máximo" valor={c.tom.maxBolhas} min={1} max={4} aoMudar={(n) => set((x) => ({ ...x, tom: { ...x.tom, maxBolhas: n } }))} />
            <Numero rotulo="Letras por mensagem, no máximo" valor={c.tom.maxCaracteres} min={60} max={600} aoMudar={(n) => set((x) => ({ ...x, tom: { ...x.tom, maxCaracteres: n } }))} />
          </div>
        </div>
        <Liga titulo="Emoji só na saudação" desc='Como no Atenvo: "Oi, Maria! Tudo bem? 😊". No resto, nenhum emoji.' ligado={c.tom.emojiNaSaudacao} aoMudar={(v) => set((x) => ({ ...x, tom: { ...x.tom, emojiNaSaudacao: v } }))} />
        <Liga titulo="Responde também por áudio" desc="Nos momentos certos ela manda nota de voz (com a voz dela, que é sempre a mesma)." ligado={c.tom.audio} aoMudar={(v) => set((x) => ({ ...x, tom: { ...x.tom, audio: v } }))} />
        {c.tom.audio && (
          <div className="irs-sub">
            <Liga titulo="Apresentação em áudio" desc="Quem chega recebe a apresentação dela por voz." ligado={c.tom.apresentacaoEmAudio} aoMudar={(v) => set((x) => ({ ...x, tom: { ...x.tom, apresentacaoEmAudio: v } }))} />
            <Liga titulo="Risada leve no áudio" desc="Só no áudio, nunca no texto." ligado={c.tom.risadaNoAudio} aoMudar={(v) => set((x) => ({ ...x, tom: { ...x.tom, risadaNoAudio: v } }))} />
            <Numero rotulo="Áudios por etapa, no máximo" valor={c.tom.maxAudiosPorEtapa} min={0} max={4} aoMudar={(n) => set((x) => ({ ...x, tom: { ...x.tom, maxAudiosPorEtapa: n } }))} />
          </div>
        )}
      </Bloco>
    </>
  );
}

/* ------------------------------ a empresa ------------------------------ */
export function SecEmpresa({ c, set }: P) {
  const e = c.empresa;
  const mud = (k: 'razaoSocial' | 'cnpj' | 'endereco' | 'cidade' | 'advogado' | 'oab' | 'honorarios' | 'prazoProcesso') => (v: string) => set((x) => ({ ...x, empresa: { ...x.empresa, [k]: v } }));
  return (
    <>
      <div className="irs-nota">
        <b>Ela só fala o que está aqui.</b> Quando o cliente desconfia, ela manda o endereço e o CNPJ; quando pergunta quanto custa ou quanto tempo leva, ela responde com o que está cadastrado. Nada disso é inventado: o que estiver vazio ela não diz, e a Iris não liga sem os campos marcados.
      </div>
      <Bloco titulo="Dados da empresa" desc="Os dados que ela manda quando o cliente quer conferir se é de verdade.">
        <div className="irs-grade2">
          <Texto rotulo="Razão social" valor={e.razaoSocial} aoMudar={mud('razaoSocial')} falta />
          <Texto rotulo="CNPJ" valor={e.cnpj} aoMudar={mud('cnpj')} falta placeholder="00.000.000/0000-00" max={20} />
          <Texto rotulo="Endereço" valor={e.endereco} aoMudar={mud('endereco')} placeholder="Rua, número, bairro" />
          <Texto rotulo="Cidade" valor={e.cidade} aoMudar={mud('cidade')} falta placeholder="Cidade / UF" />
          <Texto rotulo="Advogado responsável" valor={e.advogado} aoMudar={mud('advogado')} falta />
          <Texto rotulo="OAB" valor={e.oab} aoMudar={mud('oab')} falta placeholder="OAB/UF 00.000" max={30} />
        </div>
      </Bloco>
      <Bloco titulo="Valores e prazos que ela pode dizer" desc="Exatamente como a empresa quer que o cliente ouça.">
        <TextoLongo rotulo={<>Quanto e quando o cliente paga{!e.honorarios.trim() && <span className="irs-falta">falta preencher</span>}</>} valor={e.honorarios} aoMudar={mud('honorarios')} linhas={2} max={600}
          placeholder="Ex.: Não paga nada para começar. Só no final, um percentual do que for ressarcido." dica="No Atenvo: 30% do que for ressarcido, só no final. Escreva o da sua empresa." />
        <Texto rotulo={<>Prazo médio do processo{!e.prazoProcesso.trim() && <span className="irs-falta">falta preencher</span>}</>} valor={e.prazoProcesso} aoMudar={mud('prazoProcesso')} largo
          placeholder="Ex.: de 6 a 12 meses" dica={'Entra no lugar de {prazo_processo}. Ela sempre diz que é uma média e que depende do juiz.'} />
      </Bloco>
      <Bloco titulo="Perguntas que ela sabe responder" desc="Outras perguntas comuns e a resposta certa. Ela usa a resposta do jeito dela, sem mudar o fato."
        acao={<BotaoSec mini onClick={() => set((x) => ({ ...x, empresa: { ...x.empresa, fatos: [...x.empresa.fatos, { id: novoId('f'), pergunta: '', resposta: '' }] } }))}>＋ Pergunta</BotaoSec>}>
        {e.fatos.length === 0 && <p className="irs-vazio">Nenhuma pergunta cadastrada.</p>}
        {e.fatos.map((f, n) => (
          <div key={f.id} className="irs-fato">
            <input className="inp" aria-label="Pergunta" value={f.pergunta} placeholder="A pergunta do cliente" maxLength={200}
              onChange={(ev) => set((x) => ({ ...x, empresa: { ...x.empresa, fatos: x.empresa.fatos.map((y, k) => (k === n ? { ...y, pergunta: ev.target.value } : y)) } }))} />
            <textarea className={'inp irs-area' + (!f.resposta.trim() ? ' irs-inp-falta' : '')} aria-label="Resposta" rows={2} value={f.resposta} placeholder="A resposta certa (vazia: ela não responde isso e passa para a equipe)" maxLength={800}
              onChange={(ev) => set((x) => ({ ...x, empresa: { ...x.empresa, fatos: x.empresa.fatos.map((y, k) => (k === n ? { ...y, resposta: ev.target.value } : y)) } }))} />
            <button type="button" className="irs-x" aria-label="Tirar a pergunta" onClick={() => set((x) => ({ ...x, empresa: { ...x.empresa, fatos: x.empresa.fatos.filter((_, k) => k !== n) } }))}>×</button>
          </div>
        ))}
      </Bloco>
      <Bloco titulo="De onde ela atende" desc="No Atenvo a Iris só atende o Rio Grande do Sul. Aqui a empresa escolhe.">
        <Escolha rotulo="Clientes de" valor={e.regioes.modo} aoMudar={(v) => set((x) => ({ ...x, empresa: { ...x.empresa, regioes: { ...x.empresa.regioes, modo: v } } }))}
          opcoes={[{ valor: 'brasil', rotulo: 'Todo o Brasil' }, { valor: 'estados', rotulo: 'Só alguns estados', desc: 'Pelo DDD do número. Os de fora ela passa para a equipe.' }]} />
        {e.regioes.modo === 'estados' && (
          <div className="irs-ufs" role="group" aria-label="Estados atendidos">
            {ESTADOS.map((uf) => {
              const on = e.regioes.estados.includes(uf);
              return <button key={uf} type="button" aria-pressed={on} className={'irs-uf' + (on ? ' on' : '')}
                onClick={() => set((x) => ({ ...x, empresa: { ...x.empresa, regioes: { ...x.empresa.regioes, estados: on ? x.empresa.regioes.estados.filter((u) => u !== uf) : [...x.empresa.regioes.estados, uf] } } }))}>{uf}</button>;
            })}
          </div>
        )}
      </Bloco>
    </>
  );
}

/* ------------------------------ o que oferece ------------------------------ */
export function SecOferece({ c, set }: P) {
  const mudar = (id: string, fn: (p: IrisConfig['produtos'][number]) => IrisConfig['produtos'][number]) => set((x) => ({ ...x, produtos: x.produtos.map((p) => (p.id === id ? fn(p) : p)) }));
  return (
    <>
      <div className="irs-nota">Ligue só o que a empresa faz. Cada assunto traz as perguntas, as explicações e os textos dele; o que estiver desligado ela não oferece e passa para a equipe se o cliente pedir.</div>
      {c.produtos.map((p) => (
        <Bloco key={p.id} titulo={p.nome} desc={p.ativo ? 'Ligado: ela oferece e explica.' : 'Desligado: ela não oferece.'}
          acao={<Toggle ligado={p.ativo} rotulo={`${p.nome}: ${p.ativo ? 'ligado' : 'desligado'}`} aoMudar={(v) => mudar(p.id, (q) => ({ ...q, ativo: v }))} />}>
          {p.ativo && (
            <>
              <TextoLongo rotulo="Como ela explica" valor={p.descricao} aoMudar={(v) => mudar(p.id, (q) => ({ ...q, descricao: v }))} linhas={2} max={1500} />
              {p.financeiras && (
                <Etiquetas rotulo="Financeiras que entram na análise" valores={p.financeiras} aoMudar={(v) => mudar(p.id, (q) => ({ ...q, financeiras: v }))}
                  dica="Ela pergunta por estas e cita só estas. No Atenvo são Agibank, BMG, Facta, Mercantil e Crefisa: confira a lista da sua empresa." />
              )}
              <div className="irs-grade2">
                <TextoLongo rotulo="Pode dizer" valor={p.podeDizer} aoMudar={(v) => mudar(p.id, (q) => ({ ...q, podeDizer: v }))} linhas={3} max={1200} />
                <TextoLongo rotulo="Nunca diz" valor={p.naoPodeDizer} aoMudar={(v) => mudar(p.id, (q) => ({ ...q, naoPodeDizer: v }))} linhas={3} max={1200} />
              </div>
            </>
          )}
        </Bloco>
      ))}
    </>
  );
}

/* ------------------------------ qualificação ------------------------------ */
const ROT_TIPO: Record<TipoPergunta, string> = { sim_nao: 'Sim ou não', lista: 'Escolha numa lista', nome: 'Nome', cpf: 'CPF', livre: 'Resposta livre' };
export function SecQualificacao({ c, set }: P) {
  const q = c.qualificacao;
  const mudarP = (n: number, fn: (p: PerguntaIris) => PerguntaIris) => set((x) => ({ ...x, qualificacao: { ...x.qualificacao, perguntas: x.qualificacao.perguntas.map((p, k) => (k === n ? fn(p) : p)) } }));
  const mover = (n: number, d: -1 | 1) => set((x) => {
    const ps = [...x.qualificacao.perguntas]; const m = n + d; if (m < 0 || m >= ps.length) return x;
    [ps[n], ps[m]] = [ps[m], ps[n]]; return { ...x, qualificacao: { ...x.qualificacao, perguntas: ps } };
  });
  return (
    <>
      <Bloco titulo="A análise inicial" desc="As perguntas que ela faz, nesta ordem, uma de cada vez. Ela adapta as palavras ao que o cliente já contou e não pergunta de novo o que ele já respondeu."
        acao={<BotaoSec mini onClick={() => set((x) => ({ ...x, qualificacao: { ...x.qualificacao, perguntas: [...x.qualificacao.perguntas, { id: novoId('p'), texto: '', tipo: 'sim_nao', seNao: 'segue', ativa: true }] } }))}>＋ Pergunta</BotaoSec>}>
        {q.perguntas.length === 0 && <p className="irs-vazio">Nenhuma pergunta: ela conversa e passa para a equipe.</p>}
        <ol className="irs-perg">
          {q.perguntas.map((p, n) => (
            <li key={p.id} className={p.ativa ? '' : 'off'}>
              <span className="irs-perg-n">{n + 1}</span>
              <div className="irs-perg-corpo">
                <input className="inp" aria-label={`Pergunta ${n + 1}`} value={p.texto} maxLength={300} placeholder="Como ela pergunta"
                  onChange={(e) => mudarP(n, (x) => ({ ...x, texto: e.target.value }))} />
                <div className="irs-perg-linha">
                  <select className="inp" aria-label="Tipo de resposta" value={p.tipo} onChange={(e) => mudarP(n, (x) => ({ ...x, tipo: e.target.value as TipoPergunta }))}>
                    {Object.entries(ROT_TIPO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                  </select>
                  {(p.tipo === 'sim_nao' || p.tipo === 'lista') && (
                    <select className="inp" aria-label="Se a resposta for não" value={p.seNao} onChange={(e) => mudarP(n, (x) => ({ ...x, seNao: e.target.value as PerguntaIris['seNao'] }))}>
                      <option value="segue">Se for "não": segue a conversa</option>
                      <option value="nao_elegivel">Se for "não": não pode ser atendido</option>
                    </select>
                  )}
                  {p.texto.includes('{') && <span className="irs-perg-ex">O cliente lê: {exemplo(p.texto, c)}</span>}
                </div>
              </div>
              <div className="irs-perg-acoes">
                <button type="button" className="irs-ic" aria-label="Subir" disabled={n === 0} onClick={() => mover(n, -1)}>↑</button>
                <button type="button" className="irs-ic" aria-label="Descer" disabled={n === q.perguntas.length - 1} onClick={() => mover(n, 1)}>↓</button>
                <Toggle ligado={p.ativa} rotulo={p.ativa ? 'Pergunta ligada' : 'Pergunta desligada'} aoMudar={(v) => mudarP(n, (x) => ({ ...x, ativa: v }))} />
                <button type="button" className="irs-x" aria-label="Tirar a pergunta" onClick={() => set((x) => ({ ...x, qualificacao: { ...x.qualificacao, perguntas: x.qualificacao.perguntas.filter((_, k) => k !== n) } }))}>×</button>
              </div>
            </li>
          ))}
        </ol>
      </Bloco>
      <Bloco titulo="Quando o cliente não pode ser atendido" desc='Quando a resposta de uma pergunta marcada "não pode ser atendido" for não.'>
        <TextoLongo rotulo="O que ela diz" valor={q.naoElegivel} aoMudar={(v) => set((x) => ({ ...x, qualificacao: { ...x.qualificacao, naoElegivel: v } }))} linhas={2} max={600} />
        <Liga titulo="Arquivar a conversa como perdida" desc="Sai da fila e vai para o Kanban em Perdido, com o motivo." ligado={q.arquivarNaoElegivel} aoMudar={(v) => set((x) => ({ ...x, qualificacao: { ...x.qualificacao, arquivarNaoElegivel: v } }))} />
      </Bloco>
    </>
  );
}

/* ------------------------------ documentos ------------------------------ */
export function SecDocumentos({ c, set }: P) {
  const d = c.documentos;
  const mudarD = (n: number, fn: (x: DocumentoIris) => DocumentoIris) => set((x) => ({ ...x, documentos: { ...x.documentos, itens: x.documentos.itens.map((y, k) => (k === n ? fn(y) : y)) } }));
  return (
    <>
      <Bloco titulo="Pedir os documentos" desc="Depois da análise ela manda a lista, confere cada foto que chega e avisa o que falta."
        acao={<Toggle ligado={d.ativo} rotulo={d.ativo ? 'Pedido de documentos ligado' : 'Pedido de documentos desligado'} aoMudar={(v) => set((x) => ({ ...x, documentos: { ...x.documentos, ativo: v } }))} />}>
        {!d.ativo ? <p className="irs-vazio">Desligado: ela não pede documentos; quem pede é o atendente.</p> : (
          <>
            <div className="irs-docs">
              {d.itens.map((it, n) => (
                <div key={it.id} className={'irs-doc' + (it.ativo ? '' : ' off')}>
                  <Toggle ligado={it.ativo} rotulo={`${it.rotulo}: ${it.ativo ? 'pede' : 'não pede'}`} aoMudar={(v) => mudarD(n, (x) => ({ ...x, ativo: v }))} />
                  <div className="irs-doc-corpo">
                    <input className="inp" aria-label="Documento" value={it.rotulo} maxLength={120} onChange={(e) => mudarD(n, (x) => ({ ...x, rotulo: e.target.value }))} />
                    <input className="inp" aria-label="Dica para o cliente" value={it.dica} maxLength={300} placeholder="Dica para o cliente" onChange={(e) => mudarD(n, (x) => ({ ...x, dica: e.target.value }))} />
                  </div>
                  <label className="irs-check"><input type="checkbox" checked={it.obrigatorio} onChange={(e) => mudarD(n, (x) => ({ ...x, obrigatorio: e.target.checked }))} /> obrigatório</label>
                  <button type="button" className="irs-x" aria-label="Tirar o documento" onClick={() => set((x) => ({ ...x, documentos: { ...x.documentos, itens: x.documentos.itens.filter((_, k) => k !== n) } }))}>×</button>
                </div>
              ))}
            </div>
            <BotaoSec mini onClick={() => set((x) => ({ ...x, documentos: { ...x.documentos, itens: [...x.documentos.itens, { id: novoId('d'), rotulo: '', ativo: true, obrigatorio: true, dica: '' }] } }))}>＋ Documento</BotaoSec>
          </>
        )}
      </Bloco>
      {d.ativo && (
        <Bloco titulo="Regras da conferência">
          <Numero rotulo="Comprovante de residência de até" valor={d.mesesComprovante} min={1} max={12} sufixo="meses" aoMudar={(n) => set((x) => ({ ...x, documentos: { ...x.documentos, mesesComprovante: n } }))} />
          <Liga titulo="Aceita comprovante no nome de outra pessoa da casa" desc="Ela avisa que a empresa faz uma declaração." ligado={d.aceitaTerceiro} aoMudar={(v) => set((x) => ({ ...x, documentos: { ...x.documentos, aceitaTerceiro: v } }))} />
          <Liga titulo="Quem não sabe tirar o extrato do INSS: o atendente ajuda por ligação" desc="Ela oferece a ajuda e marca o período. Nunca pede senha." ligado={d.ajudaInssPorLigacao} aoMudar={(v) => set((x) => ({ ...x, documentos: { ...x.documentos, ajudaInssPorLigacao: v } }))} />
        </Bloco>
      )}
    </>
  );
}

/* ------------------------------ equipe ------------------------------ */
export function SecEquipe({ c, set, pessoas }: P & { pessoas: { id: string; nome: string }[] }) {
  const e = c.equipe;
  const mud = <K extends keyof IrisConfig['equipe']>(k: K, v: IrisConfig['equipe'][K]) => set((x) => ({ ...x, equipe: { ...x.equipe, [k]: v } }));
  // a lista de atendentes acompanha as pessoas do Atendimento: quem não está na lista entra desligado
  const linhas: AtendenteIris[] = useMemo(() => pessoas.map((p) => e.atendentes.find((a) => a.usuarioId === p.id) ?? { usuarioId: p.id, nome: p.nome, turno: 'dia' as Turno, recebe: false }), [pessoas, e.atendentes]);
  const mudarA = (id: string, fn: (a: AtendenteIris) => AtendenteIris) => mud('atendentes', linhas.map((a) => (a.usuarioId === id ? fn(a) : a)));
  return (
    <>
      <div className="irs-nota"><b>Ela nunca confirma uma ligação sozinha.</b> Pergunta se o cliente prefere ligação ou mensagem e o período, deixa avisado quem cuida do caso e diz que a pessoa vai retornar no horário dela. Essa regra é de fábrica e não desliga.</div>
      <Bloco titulo="Como ela passa o cliente">
        <Liga titulo="Oferece ligação" desc="Um atendente liga para concluir." ligado={e.ligacao} aoMudar={(v) => mud('ligacao', v)} />
        <Liga titulo="Oferece mensagem pelo WhatsApp" ligado={e.mensagem} aoMudar={(v) => mud('mensagem', v)} />
        <Liga titulo={'Pergunta "de manhã ou de tarde?"'} desc="E só oferece o período em que quem cuida do caso trabalha." ligado={e.perguntaPeriodo} aoMudar={(v) => mud('perguntaPeriodo', v)} />
        <Escolha rotulo="Se o cliente pedir para falar com uma pessoa" valor={e.pediuPessoa} aoMudar={(v) => mud('pediuPessoa', v)}
          opcoes={[{ valor: 'passa', rotulo: 'Passa na hora', desc: 'Deixa avisado e para de responder.' }, { valor: 'continua', rotulo: 'Continua ajudando', desc: 'Avisa a equipe, mas segue respondendo até a pessoa assumir.' }]} />
        <Numero rotulo="Passa para a equipe quando o cliente perguntar o valor" valor={e.valorPerguntadoVezes} min={1} max={5} sufixo="vezes" aoMudar={(n) => mud('valorPerguntadoVezes', n)} />
      </Bloco>
      <Bloco titulo="Quem recebe os clientes prontos" desc="Quando a análise e os documentos estão completos, a conversa vai para uma pessoa.">
        <Escolha rotulo="O cliente vai para" valor={e.distribuicao} aoMudar={(v) => mud('distribuicao', v)}
          opcoes={[
            { valor: 'equipe_do_numero', rotulo: 'A equipe do número', desc: 'Quem é da equipe dona do WhatsApp em que o cliente chegou (Configurações → Equipes).' },
            { valor: 'rodizio', rotulo: 'Rodízio', desc: 'Um para cada pessoa marcada abaixo, em ordem.' },
            { valor: 'mesma_pessoa', rotulo: 'Sempre a mesma pessoa' },
          ]} />
        {e.distribuicao === 'mesma_pessoa' && (
          <label className="irs-campo"><span className="irs-rot">Quem</span>
            <select className="inp" value={e.responsavelFixo ?? ''} onChange={(ev) => mud('responsavelFixo', ev.target.value || null)}>
              <option value="">Escolha a pessoa</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <div className="irs-tab-rolo">
          <table className="irs-tab">
            <thead><tr><th scope="col">Atendente</th><th scope="col">Turno</th><th scope="col">Recebe clientes</th><th scope="col">Avisar quando ficar pronto</th></tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={4} className="irs-vazio">Ninguém no Atendimento ainda. Cadastre em Usuários e acessos.</td></tr>}
              {linhas.map((a) => (
                <tr key={a.usuarioId}>
                  <td>{a.nome}</td>
                  <td><select className="inp" aria-label={`Turno de ${a.nome}`} value={a.turno} onChange={(ev) => mudarA(a.usuarioId, (x) => ({ ...x, turno: ev.target.value as Turno }))}>
                    {(Object.keys(ROTULO_TURNO) as Turno[]).map((t) => <option key={t} value={t}>{ROTULO_TURNO[t]}</option>)}
                  </select></td>
                  <td><Toggle ligado={a.recebe} rotulo={`${a.nome} recebe clientes`} aoMudar={(v) => mudarA(a.usuarioId, (x) => ({ ...x, recebe: v }))} /></td>
                  <td><Toggle ligado={e.avisar.includes(a.usuarioId)} rotulo={`Avisar ${a.nome}`} aoMudar={(v) => mud('avisar', v ? [...e.avisar, a.usuarioId] : e.avisar.filter((x) => x !== a.usuarioId))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="irs-dica">O turno diz quando ela oferece a ligação de cada pessoa: manhã ({c.horarios.manha.join(' às ')}), tarde ({c.horarios.tarde.join(' às ')}). Os horários ficam em Horários.</p>
      </Bloco>
    </>
  );
}

/* ------------------------------ textos e áudios ------------------------------ */
export function SecTextos({ c, set }: P) {
  const usados = useMemo(() => new Set(textosDaVersao(c).map((t) => t.id)), [c]);
  const [grupo, setGrupo] = useState<GrupoTexto | 'pendentes'>('pendentes');
  const pendentes = c.textos.filter((t) => usados.has(t.id) && !t.aprovado);
  const lista = grupo === 'pendentes' ? pendentes : c.textos.filter((t) => t.grupo === grupo);
  const mudarT = (id: string, fn: (t: TextoIris) => TextoIris) => set((x) => ({ ...x, textos: x.textos.map((t) => (t.id === id ? fn(t) : t)) }));
  const contar = (g: GrupoTexto) => c.textos.filter((t) => t.grupo === g).length;
  const pendDe = (g: GrupoTexto) => c.textos.filter((t) => t.grupo === g && usados.has(t.id) && !t.aprovado).length;
  const grupoInfo = GRUPOS_TEXTO.find((g) => g.id === grupo);
  return (
    <>
      <div className="irs-nota">
        <b>Os textos fixos dela.</b> Vieram da Iris do Atenvo com o nome da empresa no lugar de "CAF". Ela só usa um texto depois de aprovado. Os de áudio viram nota de voz com a voz dela quando são aprovados.
        <span className="irs-vars">Pode usar: {VARIAVEIS.map((v) => <code key={v.chave} title={v.desc}>{`{${v.chave}}`}</code>)}</span>
      </div>
      <div className="irs-textos">
        <nav className="irs-grupos" aria-label="Grupos de textos">
          <button type="button" className={'irs-grupo' + (grupo === 'pendentes' ? ' on' : '')} onClick={() => setGrupo('pendentes')}>
            Falta aprovar <span className={pendentes.length ? 'irs-cont alerta' : 'irs-cont'}>{pendentes.length}</span>
          </button>
          {GRUPOS_TEXTO.filter((g) => contar(g.id) > 0 || g.id === 'outros').map((g) => (
            <button key={g.id} type="button" className={'irs-grupo' + (grupo === g.id ? ' on' : '')} onClick={() => setGrupo(g.id)}>
              {g.rotulo} <span className={pendDe(g.id) ? 'irs-cont alerta' : 'irs-cont'}>{pendDe(g.id) || contar(g.id)}</span>
            </button>
          ))}
        </nav>
        <div className="irs-textos-lista">
          <div className="irs-textos-cab">
            <div><h3>{grupo === 'pendentes' ? 'Falta aprovar' : grupoInfo?.rotulo}</h3><p>{grupo === 'pendentes' ? 'Os textos que esta versão usa e ainda não foram aprovados.' : grupoInfo?.desc}</p></div>
            <div className="irs-textos-acoes">
              {lista.some((t) => !t.aprovado) && <BotaoSec mini onClick={() => set((x) => ({ ...x, textos: x.textos.map((t) => (lista.some((l) => l.id === t.id) ? { ...t, aprovado: true } : t)) }))}>Aprovar {lista.filter((t) => !t.aprovado).length} daqui</BotaoSec>}
              {grupo !== 'pendentes' && <BotaoSec mini onClick={() => set((x) => ({ ...x, textos: [...x.textos, { id: novoId('X').toUpperCase(), grupo: grupo as GrupoTexto, quando: 'Texto novo', tipo: 'texto', texto: '', aprovado: false, origem: 'novo' }] }))}>＋ Texto</BotaoSec>}
            </div>
          </div>
          {lista.length === 0 && <p className="irs-vazio">{grupo === 'pendentes' ? 'Tudo aprovado.' : 'Nenhum texto neste grupo.'}</p>}
          {lista.map((t) => (
            <article key={t.id} className={'irs-texto' + (usados.has(t.id) ? '' : ' fora')}>
              <header>
                <span className="irs-texto-id">{t.id}</span>
                <input className="irs-texto-quando" aria-label="Quando é usado" value={t.quando} maxLength={120} onChange={(e) => mudarT(t.id, (x) => ({ ...x, quando: e.target.value }))} />
                <button type="button" className={'irs-tipo ' + t.tipo} onClick={() => mudarT(t.id, (x) => ({ ...x, tipo: x.tipo === 'texto' ? 'audio' : 'texto', aprovado: false }))} title="Trocar entre texto e áudio">{t.tipo === 'audio' ? 'Áudio' : 'Texto'}</button>
                {t.aprovado ? <BadgeStatus tom="ok">Aprovado</BadgeStatus> : <BadgeStatus tom="atencao">{t.origem === 'atenvo' ? 'Adaptado do Atenvo' : 'Novo'}</BadgeStatus>}
                {!usados.has(t.id) && <span className="irs-fora">fora desta versão</span>}
              </header>
              <textarea className="inp irs-area" aria-label={`Texto ${t.id}`} rows={Math.min(5, Math.max(2, Math.ceil(t.texto.length / 90)))} value={t.texto} maxLength={1200}
                onChange={(e) => mudarT(t.id, (x) => ({ ...x, texto: e.target.value, aprovado: false, origem: x.origem === 'novo' ? 'novo' : 'editado' }))} />
              <div className="irs-texto-pe">
                <p className="irs-texto-ex">{t.texto.includes('{') ? <><span>O cliente lê:</span> {exemplo(t.texto, c)}</> : null}</p>
                {!t.aprovado
                  ? <BotaoSec mini onClick={() => mudarT(t.id, (x) => ({ ...x, aprovado: true }))} disabled={!t.texto.trim()}>Aprovar</BotaoSec>
                  : <button type="button" className="irs-link" onClick={() => mudarT(t.id, (x) => ({ ...x, aprovado: false }))}>Tirar a aprovação</button>}
                {t.origem !== 'atenvo' && <button type="button" className="irs-link perigo" onClick={() => set((x) => ({ ...x, textos: x.textos.filter((y) => y.id !== t.id) }))}>Apagar</button>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ retomadas ------------------------------ */
export function SecRetomadas({ c, set }: P) {
  const r = c.retomadas;
  const mud = <K extends keyof IrisConfig['retomadas']>(k: K, v: IrisConfig['retomadas'][K]) => set((x) => ({ ...x, retomadas: { ...x.retomadas, [k]: v } }));
  return (
    <>
      <Bloco titulo="Voltar a chamar quem parou" desc="Sem insistir: no máximo um toque por dia e três por semana, sempre dentro do horário."
        acao={<Toggle ligado={r.ativo} rotulo={r.ativo ? 'Retomadas ligadas' : 'Retomadas desligadas'} aoMudar={(v) => mud('ativo', v)} />}>
        {!r.ativo ? <p className="irs-vazio">Desligado: ela não volta a chamar ninguém sozinha.</p> : (
          <>
            <div className="irs-grade2">
              <Numero rotulo="Parou no meio: ela volta depois de" valor={r.parouNoMeioHoras} min={1} max={72} sufixo="horas" aoMudar={(n) => mud('parouNoMeioHoras', n)} />
              <Numero rotulo="Se não responder, tenta de novo depois de" valor={r.segundaTentativaHoras} min={4} max={168} sufixo="horas" aoMudar={(n) => mud('segundaTentativaHoras', n)} />
              <Numero rotulo="Toques por dia, no máximo" valor={r.tetoDia} min={1} max={3} aoMudar={(n) => mud('tetoDia', n)} />
              <Numero rotulo="Toques por semana, no máximo" valor={r.tetoSemana} min={1} max={7} aoMudar={(n) => mud('tetoSemana', n)} />
            </div>
            <Liga titulo="Acompanhamento de quem sumiu" desc="Três toques (saudação + áudio) e, no fim, pergunta se pode encerrar." ligado={r.toques} aoMudar={(v) => mud('toques', v)} />
            {r.toques && (
              <Campo3 rotulo="Nos dias" dica="Contados desde a última mensagem do cliente.">
                {r.diasDosToques.map((d, n) => (
                  <Numero key={n} rotulo={`${n + 1}º toque`} valor={d} min={1} max={30} sufixo="º dia" aoMudar={(v) => mud('diasDosToques', r.diasDosToques.map((x, k) => (k === n ? v : x)))} />
                ))}
              </Campo3>
            )}
            <Liga titulo={'Uma tentativa depois do "não"'} desc="Um áudio perguntando se ficou alguma dúvida. Se o cliente mantiver, ela respeita e não volta mais." ligado={r.tentarDepoisDoNao} aoMudar={(v) => mud('tentarDepoisDoNao', v)} />
          </>
        )}
      </Bloco>
    </>
  );
}
function Campo3({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return <div className="irs-campo largo"><span className="irs-rot">{rotulo}</span><div className="irs-grade3">{children}</div>{dica && <span className="irs-dica">{dica}</span>}</div>;
}

/* ------------------------------ horários ------------------------------ */
const DIAS = [{ n: 1, r: 'seg' }, { n: 2, r: 'ter' }, { n: 3, r: 'qua' }, { n: 4, r: 'qui' }, { n: 5, r: 'sex' }, { n: 6, r: 'sáb' }, { n: 0, r: 'dom' }];
export function SecHorarios({ c, set }: P) {
  const h = c.horarios;
  const mud = <K extends keyof IrisConfig['horarios']>(k: K, v: IrisConfig['horarios'][K]) => set((x) => ({ ...x, horarios: { ...x.horarios, [k]: v } }));
  return (
    <>
      <Bloco titulo="Horário de atendimento" desc="Ela responde a qualquer hora; o horário diz quando a equipe atende e quando ela pode chamar o cliente.">
        <div className="irs-campo largo">
          <span className="irs-rot">Dias</span>
          <div className="irs-ufs" role="group" aria-label="Dias de atendimento">
            {DIAS.map((d) => { const on = h.dias.includes(d.n); return <button key={d.n} type="button" aria-pressed={on} className={'irs-uf' + (on ? ' on' : '')} onClick={() => mud('dias', on ? h.dias.filter((x) => x !== d.n) : [...h.dias, d.n].sort())}>{d.r}</button>; })}
          </div>
        </div>
        <div className="irs-grade2">
          <Faixa rotulo="Atendimento" valor={[h.inicio, h.fim]} aoMudar={([a, b]) => set((x) => ({ ...x, horarios: { ...x.horarios, inicio: a, fim: b } }))} />
          <Faixa rotulo="Ela pode chamar o cliente" dica="Retomadas e acompanhamento só saem nesta faixa." valor={h.janelaEnvio} aoMudar={(v) => mud('janelaEnvio', v)} />
          <Faixa rotulo="Turno da manhã" valor={h.manha} aoMudar={(v) => mud('manha', v)} />
          <Faixa rotulo="Turno da tarde" valor={h.tarde} aoMudar={(v) => mud('tarde', v)} />
        </div>
        <Liga titulo="Respeita os feriados nacionais" desc="Nos feriados ela não chama ninguém e avisa que a equipe volta no próximo dia útil." ligado={h.feriados} aoMudar={(v) => mud('feriados', v)} />
        <Escolha rotulo="Fora do horário" valor={h.foraDoHorario} aoMudar={(v) => mud('foraDoHorario', v)}
          opcoes={[{ valor: 'responde_e_avisa', rotulo: 'Responde e avisa', desc: 'Segue a análise e diz que a equipe retorna no próximo horário.' }, { valor: 'espera', rotulo: 'Espera o horário', desc: 'Só responde quando a equipe estiver trabalhando.' }]} />
      </Bloco>
    </>
  );
}

/* ------------------------------ o que ela nunca diz ------------------------------ */
export function SecNunca({ c, set }: P) {
  const p = c.proibido;
  const mud = <K extends keyof IrisConfig['proibido']>(k: K, v: IrisConfig['proibido'][K]) => set((x) => ({ ...x, proibido: { ...x.proibido, [k]: v } }));
  return (
    <>
      <div className="irs-nota">Além disso, o motor tem travas de fábrica: tudo o que ela vai mandar passa por uma conferência antes de sair. O que bater numa trava não vai para o cliente: ela tenta de novo ou passa para a equipe.</div>
      <Bloco titulo="Regras">
        <Liga titulo="Nunca fala valor do que o cliente vai receber" desc="Só o que está em Empresa (quanto e quando paga)." ligado={p.valores} aoMudar={(v) => mud('valores', v)} />
        <Liga titulo="Nunca dá prazo exato" desc="Só o prazo médio cadastrado, sempre como média." ligado={p.prazosExatos} aoMudar={(v) => mud('prazosExatos', v)} />
        <Liga titulo="Nunca promete aprovação ou resultado" ligado={p.prometerAprovacao} aoMudar={(v) => mud('prometerAprovacao', v)} />
        <Liga titulo="Nunca pressiona" desc={'Nada de "última chance", "é rapidinho", "só hoje".'} ligado={p.urgencia} aoMudar={(v) => mud('urgencia', v)} />
        <Liga titulo="Nunca pede nem aceita senha" desc="Do gov.br, do banco ou de qualquer coisa. Se o cliente mandar, ela não guarda e avisa." ligado={p.pedirSenha} aoMudar={(v) => mud('pedirSenha', v)} travado="Regra de segurança: sempre ligada" />
      </Bloco>
      <Bloco titulo="Palavras e frases">
        <Etiquetas rotulo="Frases que ela nunca usa" valores={p.frases} aoMudar={(v) => mud('frases', v)} />
        <Etiquetas rotulo="Assuntos que ela não toca" valores={p.termos} aoMudar={(v) => mud('termos', v)} dica="Se o cliente falar disso, ela passa para a equipe." />
      </Bloco>
    </>
  );
}
