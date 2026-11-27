/* Confere um arquivo de configuração da Iris ANTES de ele ir para o cliente.
   Usa o MESMO código da tela (src/data/iaArquivo.ts): se passa aqui, importa igual lá.
     npx vite-node tools/iris/conferir.ts caminho/do/arquivo.json
   Sai com erro (código 1) quando o arquivo não importaria ou traz algo que não pode sair (uma chave). */
import { readFileSync } from 'node:fs';
import { LIMITES_ARQUIVO, parseAgenteImportado, resumoDoArquivo } from '../../src/data/iaArquivo';

const CAMPOS = new Set(['tipo', 'versao', 'nome', 'provedor', 'modelo', 'personaPrompt', 'conhecimento', 'comportamentos', 'para', 'feitoEm', 'nota']);
const COMPORTAMENTOS = new Set(['horario', 'janela', 'nudges_ativos', 'max_chamadas_dia', 'proibidos', 'permitir_emojis', 'simular_digitacao', 'modelo_docs', 'modelo_pro']);
const MODELOS = new Set(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-pro-latest']);

const caminho = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!caminho) { console.error('Uso: npx vite-node tools/iris/conferir.ts <arquivo.json>'); process.exit(2); }
const texto = readFileSync(caminho, 'utf8');
const erros: string[] = [], avisos: string[] = [];

let bruto: Record<string, unknown> = {};
try { bruto = JSON.parse(texto) as Record<string, unknown>; } catch (e) { console.error(`ERRO  o arquivo não é um JSON válido: ${(e as Error).message}`); process.exit(1); }

// nada que pareça uma chave pode sair no arquivo (a chave é de quem usa e fica no cofre)
if (/AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|\$aact_|EAA[A-Za-z0-9]{30,}/.test(texto)) erros.push('o arquivo contém algo com cara de CHAVE de acesso. Tire antes de enviar.');
for (const k of Object.keys(bruto)) if (!CAMPOS.has(k)) avisos.push(`campo desconhecido "${k}" (a tela ignora; confira se não é erro de digitação)`);
const comp = (bruto.comportamentos && typeof bruto.comportamentos === 'object' ? bruto.comportamentos : {}) as Record<string, unknown>;
for (const k of Object.keys(comp)) if (!COMPORTAMENTOS.has(k)) avisos.push(`comportamento desconhecido "${k}" (a tela ignora)`);
if (bruto.tipo !== 'atendente-atenvo') avisos.push('falta "tipo": "atendente-atenvo"');
if (typeof bruto.modelo === 'string' && bruto.modelo && !MODELOS.has(bruto.modelo)) avisos.push(`modelo "${bruto.modelo}" não está na lista da tela (${[...MODELOS].join(', ')})`);
if (/\[[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ,:/-]{4,}\]/.test(texto)) erros.push('ainda há trecho do modelo entre colchetes (ex.: [NOME DO CLIENTE]): preencha ou apague.');

try {
  const a = parseAgenteImportado(texto);
  if (!a.personaPrompt.trim()) erros.push('a personalidade e instruções está vazia: a Iris não saberia como atender.');
  if (a.nome === 'Atendente importado') avisos.push('sem nome: entraria como "Atendente importado"');
  for (const c of a.cortes) erros.push(c);
  console.log(`\n${caminho}`);
  for (const l of resumoDoArquivo(a)) console.log(`  ${l.rotulo.padEnd(28)} ${l.valor}`);
  if (a.info.para || a.info.feitoEm || a.info.nota) console.log(`  ${'Para quem / nota'.padEnd(28)} ${[a.info.para, a.info.feitoEm, a.info.nota].filter(Boolean).join(' · ')}`);
  console.log(`  ${'Folga na personalidade'.padEnd(28)} ${(LIMITES_ARQUIVO.persona - a.personaPrompt.length).toLocaleString('pt-BR')} caracteres até o limite`);
} catch (e) { erros.push((e as Error).message); }

for (const a of avisos) console.log(`AVISO ${a}`);
for (const e of erros) console.error(`ERRO  ${e}`);
console.log(erros.length ? '\nNÃO ENVIAR: corrija os erros acima.' : avisos.length ? '\nPode enviar, mas leia os avisos.' : '\nPode enviar: a tela importa este arquivo sem cortar nada.');
process.exit(erros.length ? 1 : 0);
