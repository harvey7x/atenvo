/* Variáveis {…} das mensagens da régua mostradas como FICHAS, com o MESMO rótulo dos chips do editor
   (crítica 12/11: a lista mostrava {valor da parcela} e {atendente} e o editor oferecia {meia parcela} e
   {nome do atendente} — eram apelidos da mesma coisa, mas pareciam outra). O texto gravado (do dono) NÃO
   muda: só a apresentação. Variável que o motor não conhece fica em vermelho (a mensagem pode não sair). */
import { Fragment } from 'react';
import './comunicacao.css';

/** apelido → rótulo do chip do editor (VARS_MSG em cobrancaMotor.tsx) */
const CANONICA: Record<string, string> = {
  'nome': 'nome',
  'nome completo': 'nome completo',
  'meia parcela': 'meia parcela',
  'valor da parcela': 'meia parcela',
  'parcela mensal': 'meia parcela',
  'valor': 'meia parcela',
  'vencimento': 'vencimento',
  'nome do atendente': 'nome do atendente',
  'atendente': 'nome do atendente',
};
const DICA: Record<string, string> = {
  'nome': 'Primeiro nome do cliente',
  'nome completo': 'Nome completo como está na Gestão',
  'meia parcela': 'O valor que o cliente paga (a meia parcela)',
  'vencimento': 'Dia do vencimento',
  'nome do atendente': 'Nome do comercial dono do cliente',
};

export function rotuloVariavel(v: string): string | null {
  return CANONICA[v.replace(/[{}]/g, '').trim().toLowerCase()] ?? null;
}

/** o texto com as variáveis em fichas (sem mudar uma letra do resto) */
export function TextoComVariaveis({ texto }: { texto: string }) {
  const partes = texto.split(/(\{[^{}\n]{1,40}\})/g);
  return (
    <>
      {partes.map((p, i) => {
        if (!/^\{[^{}]+\}$/.test(p)) return <Fragment key={i}>{p}</Fragment>;
        const rot = rotuloVariavel(p);
        return rot
          ? <span key={i} className="cc-var" title={`${DICA[rot]} (${p})`}>{rot}</span>
          : <span key={i} className="cc-var desconhecida" title={`Variável desconhecida: ${p}. A mensagem deste cliente pode não sair.`}>{p.slice(1, -1)}</span>;
      })}
    </>
  );
}
