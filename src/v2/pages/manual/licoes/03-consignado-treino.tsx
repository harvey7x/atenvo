/* Lição 3 — atividade "Consignado ou pessoal?" (prefixo mv-csg-jogo-): dez
   situações, uma por vez, para classificar como consignado, empréstimo pessoal
   ou "precisa perguntar". Explicação depois de cada resposta e placar no fim.
   Estado local, nada é salvo. Pessoas e falas são EXEMPLO. */
import { useState } from 'react';
import { IcCheck, IcX } from '../pecas';
import './03-consignado.css';

type Resposta = 'cons' | 'pes' | 'perg';
const ROTULO: Record<Resposta, string> = {
  cons: 'Consignado',
  pes: 'Empréstimo pessoal',
  perg: 'Precisa perguntar',
};

type Caso = { tag: 'Fala do cliente' | 'Situação' | 'Documento'; texto: string; certa: Resposta; porque: string };
const CASOS: Caso[] = [
  {
    tag: 'Fala do cliente',
    texto: '“O INSS já tira a parcela do banco antes de a aposentadoria cair na minha conta.”',
    certa: 'cons',
    porque: 'Desconto feito pelo INSS, antes de o dinheiro cair na conta: é a marca do consignado.',
  },
  {
    tag: 'Fala do cliente',
    texto: '“Todo mês, depois que o benefício cai, sai um débito da financeira na minha conta.”',
    certa: 'pes',
    porque: 'O benefício caiu inteiro e a financeira cobrou depois, na conta: é o jeito do empréstimo pessoal. É desse tipo de empréstimo que o processo revisa os juros.',
  },
  {
    tag: 'Situação',
    texto: 'A cliente já está sem margem, mas uma financeira emprestou mesmo assim, e ela paga por carnê.',
    certa: 'pes',
    porque: 'O empréstimo pessoal não usa a margem: por isso sai até para quem está sem margem. E boleto ou carnê é uma das formas de cobrança do pessoal.',
  },
  {
    tag: 'Documento',
    texto: 'No Extrato de Empréstimo Consignado, no Meu INSS, aparece um contrato do BMG.',
    certa: 'cons',
    porque: 'Esse extrato mostra os consignados. O BMG também tem consignado e cartão consignado: quem decide o tipo é o jeito de pagar, não o nome do banco.',
  },
  {
    tag: 'Fala do cliente',
    texto: '“Tenho um cartão do BMG, e o INSS desconta uma parte da fatura do meu benefício.”',
    certa: 'cons',
    porque: 'É um cartão consignado (RMC): descontado pelo INSS, na gaveta de 5% da margem. Faz parte do consignado; não é o empréstimo pessoal.',
  },
  {
    tag: 'Fala do cliente',
    texto: '“Peguei um dinheiro direto com a financeira. O INSS não desconta nada: eu pago um boleto todo mês.”',
    certa: 'pes',
    porque: 'Contrato direto com a financeira e boleto pago pelo cliente, fora do INSS: empréstimo pessoal. Agora pergunte com qual das 5 financeiras é.',
  },
  {
    tag: 'Situação',
    texto: 'O banco disse ao cliente que um empréstimo novo não cabe porque ele está sem margem.',
    certa: 'cons',
    porque: 'Só o consignado depende da margem. Se o problema é falta de margem, o assunto é consignado.',
  },
  {
    tag: 'Fala do cliente',
    texto: '“Tenho empréstimo no Mercantil.” E não diz mais nada.',
    certa: 'perg',
    porque: 'Só o nome do banco não diz o tipo. Pergunte como a parcela é paga: o INSS desconta do benefício, ou a financeira cobra na conta ou por boleto/carnê?',
  },
  {
    tag: 'Situação',
    texto: 'Um empréstimo com juros livres, sem o teto do consignado, bem mais caro que os outros.',
    certa: 'pes',
    porque: 'Juros livres, sem teto e mais altos: é o empréstimo pessoal. O consignado do INSS tem teto de juros.',
  },
  {
    tag: 'Fala do cliente',
    texto: '“Não sei, pra mim é tudo empréstimo.”',
    certa: 'perg',
    porque: 'Tudo bem: o cliente não precisa saber os nomes. Explique a diferença com uma frase simples e pergunte de novo uma vez. Se ele continuar sem saber, siga em frente (lição 4).',
  },
];

export function ConsignadoOuPessoal() {
  const [resp, setResp] = useState<(Resposta | null)[]>(() => CASOS.map(() => null));
  const [i, setI] = useState(0);
  const fim = i >= CASOS.length;
  const acertos = CASOS.filter((c, k) => resp[k] === c.certa).length;
  const c = fim ? null : CASOS[i];
  const r = fim ? null : resp[i];

  function responder(x: Resposta) { setResp((a) => a.map((v, k) => (k === i ? x : v))); }
  function reiniciar() { setResp(CASOS.map(() => null)); setI(0); }

  return (
    <div className="mv-csg-jogo">
      <div className="vidro mv-csg-jogo-topo">
        <span className="num">{fim ? 'Fim do treino' : `Situação ${i + 1} de ${CASOS.length}`}</span>
        <div className="mv-csg-jogo-pontos" aria-hidden>
          {CASOS.map((cc, k) => (
            <i key={cc.texto} data-estado={k === i ? 'atual' : resp[k] === null ? undefined : resp[k] === cc.certa ? 'certo' : 'errado'} />
          ))}
        </div>
        <span className="num">{acertos} acerto{acertos === 1 ? '' : 's'}</span>
      </div>

      {c && (
        <div className="vidro mv-csg-jogo-caso">
          <span className="mv-tag">{c.tag}</span>
          <p className="mv-csg-jogo-tx">{c.texto}</p>
          {r === null ? (
            <div className="mv-csg-jogo-bts" role="group" aria-label="Que empréstimo é este?">
              <button type="button" className="mv-csg-jogo-bt" data-tom="azul" onClick={() => responder('cons')}>
                <b>Consignado</b><small>o INSS desconta</small>
              </button>
              <button type="button" className="mv-csg-jogo-bt" data-tom="ambar" onClick={() => responder('pes')}>
                <b>Empréstimo pessoal</b><small>a financeira cobra</small>
              </button>
              <button type="button" className="mv-csg-jogo-bt" onClick={() => responder('perg')}>
                <b>Precisa perguntar</b><small>ainda não dá para saber</small>
              </button>
            </div>
          ) : (
            <div className="mv-csg-jogo-r" data-ok={r === c.certa ? '' : undefined} role="status">
              <b className="mv-csg-jogo-veredito">
                <span aria-hidden>{r === c.certa ? <IcCheck /> : <IcX />}</span>
                {r === c.certa ? `Isso mesmo: ${ROTULO[c.certa]}.` : `Não foi dessa vez. Resposta certa: ${ROTULO[c.certa]}.`}
              </b>
              <p>{c.porque}</p>
              <button type="button" className="mv-csg-bt" data-cheio="" onClick={() => setI(i + 1)}>
                {i === CASOS.length - 1 ? 'Ver o resultado' : 'Próxima situação'}
              </button>
            </div>
          )}
        </div>
      )}

      {fim && (
        <div className="vidro mv-csg-jogo-fim" role="status">
          <div className="mv-csg-jogo-placar">
            <b className="num">{acertos} de {CASOS.length}</b>
            <span>
              {acertos === CASOS.length
                ? 'Perfeito: você separa bem o consignado do empréstimo pessoal.'
                : acertos >= 8
                  ? 'Muito bom. Releia as situações abaixo antes de seguir.'
                  : 'Vale reler a tabela da seção 2 e jogar de novo.'}
            </span>
          </div>
          {acertos < CASOS.length && (
            <ul className="mv-csg-jogo-erros">
              {CASOS.map((cc, k) => (resp[k] !== null && resp[k] !== cc.certa ? (
                <li key={cc.texto}><b>{ROTULO[cc.certa]}:</b> {cc.texto} <span>{cc.porque}</span></li>
              ) : null))}
            </ul>
          )}
          <div><button type="button" className="mv-csg-bt" data-cheio="" onClick={reiniciar}>Jogar de novo</button></div>
        </div>
      )}
    </div>
  );
}
