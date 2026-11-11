/* NOVO CLIENTE (dono 25/09): "quando eu for adicionar um novo cliente… eu preciso
   preencher todos os dados para aparecerem lá no gestão" e "o ciclo… quem vai fazer
   não vai ser o comercial… só o financeiro, o administrativo… quando aparecer para
   ele aprovar". Regras puras do formulário (o que é obrigatório, as máscaras no
   formato da planilha MENSAIS) e a SUGESTÃO de ciclo que quem aprova vê.

   Formatos = os que dominam a planilha do cliente (banco, 25/09):
     CPF 000.000.000-00 · NB 000.000.000-0 · telefone (51) 99999-9999 ·
     RECLAME AQUI "reclame aqui DD/MM - <senha>" (749 de 789). */

export type FaixaBeneficio = 'ate_1sm' | 'acima_1sm';

export interface CamposNovo {
  fechamento: string;   // ISO yyyy-mm-dd
  comercial: string;
  nome: string;
  nb: string;
  banco: string;
  cpf: string;
  telefone: string;
  senha: string;        // senha do INSS
  valor: number;        // parcela total (R$)
  reclameData: string;  // ISO yyyy-mm-dd — vira o "DD/MM" do texto
  reclameSenha: string; // só a senha; o texto da planilha é montado por textoReclame
}

export type CampoNovo = keyof CamposNovo;

/** ordem = ordem das colunas da planilha (é a ordem do formulário e dos avisos) */
export const ORDEM_CAMPOS: CampoNovo[] = [
  'fechamento', 'comercial', 'nome', 'nb', 'banco', 'cpf', 'telefone', 'senha', 'valor', 'reclameData', 'reclameSenha',
];

export const ROTULO_CAMPO: Record<CampoNovo, string> = {
  fechamento: 'Fechamento', comercial: 'Comercial', nome: 'Cliente', nb: 'NB', banco: 'Banco', cpf: 'CPF',
  telefone: 'Telefone', senha: 'Senha INSS', valor: 'Parcela total', reclameData: 'Data da reclamação',
  reclameSenha: 'Senha do Reclame Aqui',
};

export const soDig = (s: string) => (s || '').replace(/\D/g, '');

/** 000.000.000-00 enquanto digita (até 11 algarismos) */
export function mascaraCPF(s: string): string {
  const d = soDig(s).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** 000.000.000-0 enquanto digita (até 10 algarismos — NB com dígito verificador) */
export function mascaraNB(s: string): string {
  const d = soDig(s).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** (51) 99999-9999 / (51) 3333-4444 enquanto digita (DDD + 8 ou 9) */
export function mascaraTelefone(s: string): string {
  const d = soDig(s).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2); const n = d.slice(2);
  if (n.length <= 4) return `(${ddd}) ${n}`;
  const corte = n.length === 9 ? 5 : 4;
  return `(${ddd}) ${n.slice(0, corte)}-${n.slice(corte)}`;
}

/** dígitos verificadores do CPF (rejeita 000.000.000-00 e afins) */
export function cpfValido(s: string): boolean {
  const d = soDig(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

/** "reclame aqui DD/MM - senha" — o formato da coluna RECLAME AQUI da planilha */
export function textoReclame(dataIso: string, senha: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dataIso || '');
  const s = (senha || '').trim();
  if (!m) return s ? `reclame aqui - ${s}` : '';
  return `reclame aqui ${m[2]}/${m[1]}${s ? ` - ${s}` : ''}`;
}

/** o que falta ou está errado — { campo: mensagem }. Vazio = pode cadastrar. */
export function problemasNovo(c: CamposNovo): Partial<Record<CampoNovo, string>> {
  const p: Partial<Record<CampoNovo, string>> = {};
  const vazio = (s: string) => !(s || '').trim();
  for (const k of ORDEM_CAMPOS) {
    if (k === 'valor') continue;
    if (vazio(c[k] as string)) p[k] = 'Obrigatório';
  }
  if (!(c.valor > 0)) p.valor = 'Obrigatório';
  if (!p.fechamento && !/^\d{4}-\d{2}-\d{2}$/.test(c.fechamento)) p.fechamento = 'Data inválida';
  if (!p.reclameData && !/^\d{4}-\d{2}-\d{2}$/.test(c.reclameData)) p.reclameData = 'Data inválida';
  if (!p.cpf && !cpfValido(c.cpf)) p.cpf = soDig(c.cpf).length === 11 ? 'CPF inválido' : 'CPF tem 11 números';
  if (!p.nb && soDig(c.nb).length < 9) p.nb = 'NB incompleto';
  if (!p.telefone) { const n = soDig(c.telefone).length; if (n < 10 || n > 11) p.telefone = 'DDD + número'; }
  if (!p.nome && (c.nome || '').trim().length < 3) p.nome = 'Nome completo';
  return p;
}

/* ---------------- sugestão de ciclo (para quem APROVA) ----------------
   Os ciclos da planilha são POSIÇÕES no calendário de pagamento do INSS (análise
   da MENSAIS, 25/09 — o final do NB bate com o bloco em 87%):
     fim do mês  (dia ≥ 15, em ordem: D24 D25 D28 D29 D30) = 1º…5º dos últimos
                 dias úteis → finais 1…5 de quem ganha ATÉ 1 salário mínimo;
     início do mês (dia < 15, em ordem: D01 D02 D05 D06 D07) = 1º…5º dia útil
                 do mês seguinte → finais 6…9,0 de até 1 SM e, acima de 1 SM,
                 os pares 1/6, 2/7, 3/8, 4/9, 5/0.
   Sem a faixa, finais 6–0 já decidem (mesma posição nas duas faixas); finais 1–5
   dão DUAS opções (uma por faixa). É só sugestão: quem aprova escolhe. */

/** final do benefício: com dígito verificador (10+ algarismos) é o penúltimo; sem, é o último */
export const finalNB = (nb: string): string => {
  const digs = soDig(nb);
  if (!digs.length) return '';
  return digs.length >= 10 ? digs[digs.length - 2] : digs[digs.length - 1];
};

export interface SugestaoCiclo { dia: number; motivo: string }

export function sugerirCiclos(nb: string, faixa: FaixaBeneficio | null | undefined, ciclos: number[]): SugestaoCiclo[] {
  const f = finalNB(nb);
  if (!f) return [];
  const fin = Number(f);
  const unicos = [...new Set(ciclos.filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b);
  const fim = unicos.filter((d) => d >= 15);
  const ini = unicos.filter((d) => d < 15);
  const out: SugestaoCiclo[] = [];
  const por = (lista: number[], pos: number, motivo: string) => {
    const dia = lista[pos - 1];
    if (dia != null && !out.some((s) => s.dia === dia)) out.push({ dia, motivo });
  };
  if (fin === 0 || fin >= 6) {
    const pos = fin === 0 ? 5 : fin - 5;
    por(ini, pos, `final ${f} do NB`);
    return out;
  }
  // finais 1–5
  if (faixa !== 'acima_1sm') por(fim, fin, `final ${f} · até 1 salário mínimo`);
  if (faixa !== 'ate_1sm') por(ini, fin, `final ${f} · acima de 1 salário mínimo`);
  return out;
}
