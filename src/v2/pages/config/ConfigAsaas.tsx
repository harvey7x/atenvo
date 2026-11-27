/* CONFIGURAÇÕES → INTEGRAÇÕES → ASAAS (dono 22/11): "tem que ter a configuração para integrar o
   Asaas de pagamento".
   Sem conta conectada: a chave de API (e o ambiente — produção ou testes) e o passo a passo de onde
   pegar a chave. Com a conta conectada: a ficha da conexão (testar, trocar a chave, desconectar) e as
   regras — como o cliente paga, o que acontece quando ele paga, multa e juros e os avisos do próprio Asaas.
   Cada regra espelha como o Asaas funciona (conferido na documentação em 22/11 — ver data/config/integracoes.ts).
   As regras são um rascunho na tela até "Salvar alterações" (a faixa que aparece no pé quando algo muda). Os dados e as chamadas vêm de
   data/config/integracoes.ts; a chave de API nunca volta do servidor (só os 4 últimos caracteres). */
import { useEffect, useState } from 'react';
import { isPrevia } from '@/lib/supabase';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, LinhaToggle, ModalV2, Segmentado } from '../../components';
import {
  FORMAS, ROTULO_AMBIENTE_ASAAS, ambienteDaChave, chaveInvalida, useAsaas, useConectarAsaas, useDesconectarAsaas, useGerarCobrancaAsaas, useReativarRetornoAsaas, useSalvarAsaas, useTestarAsaas,
  type AmbienteAsaas, type ConfigAsaas, type IntegracaoAsaas,
} from '../../data/config/integracoes';
import { IcPagamentos } from './ConfigIntegracoes';
import { useDadosCobranca } from '../../data/cobranca/hooks';
import '../painel/painel.css';

const DESC_AMBIENTE: Record<AmbienteAsaas, string> = {
  producao: 'A conta de verdade: os clientes pagam e o dinheiro cai no Asaas.',
  testes: 'A conta de testes do Asaas, separada da de verdade. Nenhum dinheiro circula.',
};
/** "22/11/2026 14:32" no horário de Brasília */
function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
type Avisar = (texto: string, tom?: 'ok' | 'erro') => void;

export function ConfigAsaas() {
  const q = useAsaas();
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const avisar: Avisar = (texto, tom = 'ok') => setAviso({ texto, tom });
  return (
    <div className="pn cfgi">
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      {q.carregando ? <p className="pn-vazio">Consultando a conexão com o Asaas…</p>
        : q.falhou ? <EstadoErro titulo="Não foi possível consultar a integração" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={q.recarregar} />
        : q.dados.conectado ? <Conectado dados={q.dados} aoAvisar={avisar} />
        : <Conectar aoAvisar={avisar} />}
    </div>
  );
}

/* ---------------- a chave de API (conectar e trocar usam os mesmos campos) ---------------- */
function CamposChave({ ambiente, aoAmbiente, chave, aoChave, erro }: {
  ambiente: AmbienteAsaas; aoAmbiente: (a: AmbienteAsaas) => void; chave: string; aoChave: (c: string) => void; erro: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="pn-us-form">
      <div className="pn-us-campo">
        <span className="pn-us-rot">Ambiente</span>
        <div className="pn-us-opcoes" role="radiogroup" aria-label="Ambiente do Asaas">
          {(['producao', 'testes'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={ambiente === a} className={ambiente === a ? 'on' : undefined} onClick={() => aoAmbiente(a)}>
              <b>{ROTULO_AMBIENTE_ASAAS[a]}</b><span>{DESC_AMBIENTE[a]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pn-us-campo">
        <label htmlFor="asaas-chave">Chave de API</label>
        <div className="pn-us-senha-in">
          <input id="asaas-chave" className="inp" type={ver ? 'text' : 'password'} value={chave} placeholder="$aact_…" autoComplete="off" spellCheck={false} data-1p-ignore
            onChange={(e) => { const v = e.target.value; aoChave(v); const dela = ambienteDaChave(v); if (dela) aoAmbiente(dela); }} />
          <BotaoSec onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Mostrar'}</BotaoSec>
        </div>
        <span className="pn-us-dica">A chave fica guardada só no servidor. Depois de conectar, a tela mostra apenas os 4 últimos caracteres.</span>
      </div>
      {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
    </div>
  );
}
function useChave(inicial: AmbienteAsaas, aoConectar: () => void) {
  const conectar = useConectarAsaas();
  const [ambiente, setAmbiente] = useState<AmbienteAsaas>(inicial);
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const enviar = async () => {
    const e = chaveInvalida(chave, ambiente);
    if (e) { setErro(e); return; }
    setErro('');
    try { await conectar.mutateAsync({ ambiente, chave }); aoConectar(); }
    catch (x) { setErro((x as Error)?.message || 'Não foi possível conectar. Tente de novo.'); }
  };
  return {
    ocupado: conectar.isPending, enviar,
    campos: { ambiente, aoAmbiente: (a: AmbienteAsaas) => { setAmbiente(a); setErro(''); }, chave, aoChave: (c: string) => { setChave(c); setErro(''); }, erro },
  };
}

/* ---------------- sem conta conectada ---------------- */
function Conectar({ aoAvisar }: { aoAvisar: Avisar }) {
  const f = useChave('producao', () => aoAvisar('Asaas conectado. Confira abaixo as regras de pagamento.'));
  return (
    <div className="cfgi-duas">
      <CardVidro spot className="pn-card sobe">
        <div className="pn-card-cab"><div><h3>Conectar a conta do Asaas</h3><p>A conta que vai receber os pagamentos dos clientes.</p></div></div>
        <CamposChave {...f.campos} />
        <div className="cfgi-acoes">
          <BotaoPrimario disabled={f.ocupado} onClick={() => void f.enviar()}>{f.ocupado ? 'Testando a chave…' : 'Testar e conectar'}</BotaoPrimario>
          {isPrevia && <button type="button" className="cfgi-link" onClick={() => { f.campos.aoChave('$aact_hmlg_chave-de-exemplo-da-previa-0000'); f.campos.aoAmbiente('testes'); }}>Usar uma chave de exemplo</button>}
        </div>
      </CardVidro>
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.05s' }}>
        <div className="pn-card-cab"><div><h3>Onde pegar a chave</h3><p>É feito uma vez, no site do Asaas.</p></div></div>
        <ol className="cfgw-passos">
          <li>Entre no <b>Asaas pelo computador</b>, com um usuário administrador. Pelo aplicativo não dá para gerar a chave.</li>
          <li>Abra <b>Integrações</b> e depois <b>Chaves de API</b>, e gere uma chave só para este sistema. Se colocar data de validade, a integração para nesse dia.</li>
          <li>Copie a chave inteira, com o cifrão do começo, e cole no campo ao lado.</li>
        </ol>
        <div className="cfgi-sep" />
        <div className="pn-card-cab"><div><h3>O que precisa estar pronto</h3></div></div>
        <ul className="cfgi-lista">
          <li>Uma <b>chave Pix cadastrada</b> na conta do Asaas, se for cobrar por Pix.</li>
          <li>As formas de pagamento que você quer oferecer <b>ligadas na conta</b> do Asaas.</li>
          <li>O <b>CPF dos clientes</b> preenchido na Gestão: o Asaas não gera cobrança sem CPF.</li>
        </ul>
      </CardVidro>
    </div>
  );
}

/* ---------------- conta conectada: ficha + regras ---------------- */
const pctTexto = (n: number) => String(n).replace('.', ',');
const lerPct = (t: string) => { const n = Number(t.replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 100) / 100)) : 0; };
const ATRASO: readonly { id: ConfigAsaas['atraso']; rotulo: string; dica: string }[] = [
  { id: 'asaas', rotulo: 'Usar o que está no Asaas', dica: 'Vale a multa e os juros configurados na sua conta do Asaas. O sistema não manda nada por cima.' },
  { id: 'aqui', rotulo: 'Definir aqui', dica: 'O sistema manda a multa e os juros abaixo em cada cobrança que gerar.' },
];

function Conectado({ dados, aoAvisar }: { dados: IntegracaoAsaas; aoAvisar: Avisar }) {
  const salvar = useSalvarAsaas();
  const testar = useTestarAsaas();
  const desconectar = useDesconectarAsaas();
  const reativar = useReativarRetornoAsaas();
  const [cfg, setCfg] = useState<ConfigAsaas>(dados.config);
  const [multaTx, setMultaTx] = useState(pctTexto(dados.config.multa));
  const [jurosTx, setJurosTx] = useState(pctTexto(dados.config.juros));
  const [janela, setJanela] = useState<'chave' | 'desconectar' | null>(null);
  // o que está gravado mudou (salvou, ou outra pessoa mexeu): o rascunho acompanha
  const gravado = JSON.stringify(dados.config);
  const repor = () => { setCfg(dados.config); setMultaTx(pctTexto(dados.config.multa)); setJurosTx(pctTexto(dados.config.juros)); };
  useEffect(repor, [gravado]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudou = JSON.stringify(cfg) !== gravado;
  const set = <K extends keyof ConfigAsaas>(k: K, v: ConfigAsaas[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const temCartao = cfg.forma === 'cartao' || cfg.forma === 'escolhe';
  const pix = dados.conta?.chavePix ?? null;

  const gravar = async () => {
    try { await salvar.mutateAsync(cfg); aoAvisar('Regras de pagamento salvas.'); }
    catch (x) { aoAvisar((x as Error)?.message || 'Não foi possível salvar. Tente de novo.', 'erro'); }
  };
  const conferir = async () => {
    try { const r = await testar.mutateAsync(); const c = r.conta as { nome?: string } | undefined; aoAvisar(`Conexão com o Asaas funcionando${c?.nome ? ` · ${c.nome}` : ''}.`); }
    catch (x) { aoAvisar((x as Error)?.message || 'O Asaas não respondeu. Tente de novo.', 'erro'); }
  };
  const religar = async () => {
    try { await reativar.mutateAsync(); aoAvisar('Retorno dos pagamentos religado. Os avisos pendentes voltam a chegar.'); }
    catch (x) { aoAvisar((x as Error)?.message || 'Não foi possível religar o retorno.', 'erro'); }
  };
  const sair = async () => {
    try { await desconectar.mutateAsync(); setJanela(null); aoAvisar('Asaas desconectado.'); }
    catch (x) { setJanela(null); aoAvisar((x as Error)?.message || 'Não foi possível desconectar.', 'erro'); }
  };

  return (
    <>
      <CardVidro spot className="pn-card sobe">
        <div className="cfgi-conta">
          <span className="cfgi-ic on"><IcPagamentos /></span>
          <div className="cfgi-conta-nm">
            <b>{dados.conta?.nome || 'Conta do Asaas'}</b>
            <span>{[dados.conta?.email, `Ambiente de ${dados.ambiente === 'testes' ? 'testes' : 'produção'}`].filter(Boolean).join(' · ')}</span>
          </div>
          <BadgeStatus tom="ok">Conectado</BadgeStatus>
        </div>
        {dados.ambiente === 'testes' && <p className="cfgi-nota" role="note">Ambiente de testes: as cobranças são de mentira e nenhum dinheiro circula. Para valer, troque a chave pela de produção.</p>}
        {!dados.retornoAtivo && (
          <p className="cfgi-nota cfgi-nota-acao" role="alert">
            <span>O Asaas pausou o retorno dos pagamentos depois de várias falhas seguidas. Enquanto estiver pausado, as baixas não chegam.</span>
            <BotaoSec mini disabled={reativar.isPending} onClick={() => void religar()}>{reativar.isPending ? 'Religando…' : 'Religar o retorno'}</BotaoSec>
          </p>
        )}
        <dl className="cfgw-ficha">
          <div><dt>CNPJ ou CPF da conta</dt><dd className="num">{dados.conta?.documento ?? '—'}</dd></div>
          <div><dt>Chave de API</dt><dd className="num">{dados.chaveFinal ? `termina em ••••${dados.chaveFinal}` : 'guardada no servidor'}</dd></div>
          <div><dt>Conectada em</dt><dd className="num">{quando(dados.conectadoEm)}{dados.conectadoPor ? ` · por ${dados.conectadoPor}` : ''}</dd></div>
          <div><dt>Chave Pix da conta</dt><dd>{pix === true ? 'Cadastrada' : pix === false ? 'Não encontrada: cadastre uma no Asaas para cobrar por Pix' : 'Não conferida'}</dd></div>
          <div><dt>Retorno dos pagamentos</dt><dd>{dados.retornoAtivo ? 'Ativo: o Asaas avisa o sistema a cada pagamento' : 'Pausado pelo Asaas'}</dd></div>
          <div><dt>Último pagamento avisado</dt><dd className="num">{dados.ultimoRetorno ? quando(dados.ultimoRetorno) : 'Nenhum ainda'}</dd></div>
        </dl>
        <div className="cfgi-acoes">
          <BotaoSec disabled={testar.isPending} onClick={() => void conferir()}>{testar.isPending ? 'Testando…' : 'Testar conexão'}</BotaoSec>
          <BotaoSec onClick={() => setJanela('chave')}>Trocar a chave</BotaoSec>
          <span className="cfgi-esp" />
          <button type="button" className="cfgi-link perigo" onClick={() => setJanela('desconectar')}>Desconectar</button>
        </div>
      </CardVidro>

      <GerarCobranca aoAvisar={aoAvisar} mudou={mudou} />

      <div className="cfgi-duas">
        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.04s' }}>
          <div className="pn-card-cab"><div><h3>Como o cliente paga</h3><p>Cada cobrança sai com uma forma de pagamento.</p></div></div>
          <div className="pn-us-opcoes cfgi-formas" role="radiogroup" aria-label="Forma de pagamento">
            {FORMAS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={cfg.forma === f.id} className={cfg.forma === f.id ? 'on' : undefined} onClick={() => set('forma', f.id)}>
                <b>{f.rotulo}</b><span>{f.dica}</span>
              </button>
            ))}
          </div>
          <div className="cfgi-sep" />
{/* a régua ainda não gera a cobrança sozinha (próxima etapa): o controle fica travado para não prometer o que não faz */}
          <LinhaToggle ligado={false} aoMudar={() => undefined} disabled titulo="Gerar a cobrança de cada parcela sozinho"
            descricao="Ainda não disponível. Nesta versão a cobrança é gerada no botão Gerar cobrança, acima, e o link é copiado para o cliente. Na próxima etapa a régua cria a cobrança sozinha e põe o link na mensagem onde você colocar a variável {link de pagamento}." />
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.08s' }}>
          <div className="pn-card-cab"><div><h3>Quando o cliente paga</h3><p>O que o sistema faz ao receber o aviso de pagamento do Asaas.</p></div></div>
          <LinhaToggle ligado={cfg.baixaAutomatica} aoMudar={(v) => set('baixaAutomatica', v)} titulo="Dar baixa na parcela sozinho"
            descricao="O pagamento entra no Financeiro já confirmado, na parcela certa, sem comprovante nem conferência. Desligado, ele chega como pendente para o financeiro confirmar." />
          {cfg.baixaAutomatica && temCartao && (
            <div className="pn-us-campo cfgi-recuo">
              <span className="pn-us-rot">No cartão, dar baixa</span>
              <Segmentado rotulo="No cartão, dar baixa" valor={cfg.baixaQuando} aoMudar={(v) => set('baixaQuando', v)}
                opcoes={[{ valor: 'confirmado', rotulo: 'Quando o Asaas confirmar' }, { valor: 'disponivel', rotulo: 'Quando o dinheiro estiver disponível' }]} />
              <span className="pn-us-dica">No cartão o Asaas confirma o pagamento na hora, mas o dinheiro só fica disponível na conta 32 dias depois. Pix e boleto não têm essa espera.</span>
            </div>
          )}
          <div className="cfgi-sep" />
          <LinhaToggle ligado={cfg.avisarComercial} aoMudar={(v) => set('avisarComercial', v)} titulo="Avisar o comercial dono do cliente"
            descricao="Ele recebe um aviso no sino quando o pagamento de um cliente dele entra." />
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.12s' }}>
          <div className="pn-card-cab"><div><h3>Multa e juros por atraso</h3><p>O que é somado à cobrança paga depois do vencimento.</p></div></div>
          <div className="pn-us-opcoes" role="radiogroup" aria-label="De onde vêm a multa e os juros">
            {ATRASO.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={cfg.atraso === a.id} className={cfg.atraso === a.id ? 'on' : undefined} onClick={() => set('atraso', a.id)}>
                <b>{a.rotulo}</b><span>{a.dica}</span>
              </button>
            ))}
          </div>
          {cfg.atraso === 'aqui' && (
            <div className="pn-us-duas">
              <div className="pn-us-campo">
                <label htmlFor="asaas-multa">Multa por atraso</label>
                <span className="cfgi-pct"><input id="asaas-multa" className="inp" inputMode="decimal" value={multaTx} maxLength={5}
                  onChange={(e) => { setMultaTx(e.target.value); set('multa', lerPct(e.target.value)); }} onBlur={() => setMultaTx(pctTexto(cfg.multa))} /><i aria-hidden>%</i></span>
                <span className="pn-us-dica">Cobrada uma vez, sobre o valor da parcela. Zero deixa sem multa.</span>
              </div>
              <div className="pn-us-campo">
                <label htmlFor="asaas-juros">Juros ao mês</label>
                <span className="cfgi-pct"><input id="asaas-juros" className="inp" inputMode="decimal" value={jurosTx} maxLength={5}
                  onChange={(e) => { setJurosTx(e.target.value); set('juros', lerPct(e.target.value)); }} onBlur={() => setJurosTx(pctTexto(cfg.juros))} /><i aria-hidden>%</i></span>
                <span className="pn-us-dica">Proporcional aos dias de atraso. Zero deixa sem juros.</span>
              </div>
            </div>
          )}
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.16s' }}>
          <div className="pn-card-cab"><div><h3>Avisos do Asaas</h3><p>Quem fala com o cliente sobre a cobrança.</p></div></div>
          <LinhaToggle ligado={cfg.avisosAsaas} aoMudar={(v) => set('avisosAsaas', v)} titulo="Deixar o Asaas mandar os avisos dele ao cliente"
            descricao="Desligado, só a régua do sistema fala com o cliente, pelo WhatsApp. Ligado, o Asaas também manda e-mail, SMS e outros avisos, e cobra uma taxa por isso. O valor está em Taxas, na sua conta do Asaas." />
        </CardVidro>
      </div>

      {/* as regras mudaram: a faixa de salvar fica presa ao pé da tela, à vista em qualquer altura da página */}
      {mudou && (
        <div className="cfgi-salvar" role="region" aria-label="Alterações não salvas">
          <span>Você mudou as regras de pagamento. Elas só valem depois de salvar.</span>
          <BotaoSec disabled={salvar.isPending} onClick={repor}>Descartar</BotaoSec>
          <BotaoPrimario disabled={salvar.isPending} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar alterações'}</BotaoPrimario>
        </div>
      )}

      {janela === 'chave' && <JanelaChave ambiente={dados.ambiente ?? 'producao'} aoFechar={() => setJanela(null)} aoAvisar={aoAvisar} />}
      <ConfirmDialogV2 aberto={janela === 'desconectar'} titulo="Desconectar o Asaas?" rotuloConfirmar="Desconectar" destrutivo carregando={desconectar.isPending}
        mensagem="O sistema para de gerar cobranças e de receber os avisos de pagamento. As cobranças que já existem continuam no Asaas, e as regras ficam guardadas para quando você conectar de novo."
        aoConfirmar={() => void sair()} aoCancelar={() => setJanela(null)} />
    </>
  );
}

/* ---------------- gerar a cobrança de uma parcela ---------------- */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloComp = (c: string) => { const [a, m] = c.split('-'); return `${MES[Number(m) - 1] ?? m}/${a}`; };
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');
function compsProximos(): string[] {
  const d = new Date(); const l: string[] = [];
  for (let k = -1; k <= 2; k++) { const x = new Date(d.getFullYear(), d.getMonth() + k, 1); l.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
  return l;
}

function GerarCobranca({ aoAvisar, mudou }: { aoAvisar: Avisar; mudou: boolean }) {
  const dados = useDadosCobranca();
  const gerar = useGerarCobrancaAsaas();
  const comps = compsProximos();
  const [busca, setBusca] = useState('');
  const [leadId, setLeadId] = useState('');
  const [comp, setComp] = useState(comps[1]);
  const [feita, setFeita] = useState<{ nome: string; link: string | null; valor: number; vencimento: string; jaExistia: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const termo = busca.trim().toLowerCase();
  const clientes = (dados.data?.linhas ?? []).filter((l) => !termo || l.nome.toLowerCase().includes(termo)).slice(0, 40);
  const escolhido = (dados.data?.linhas ?? []).find((l) => l.id === leadId);
  const fazer = async () => {
    if (!escolhido) { setErro('Escolha o cliente.'); return; }
    setErro(''); setFeita(null);
    try {
      const r = await gerar.mutateAsync({ leadId: escolhido.id, comp, previa: { nome: escolhido.nome, valor: escolhido.valor } });
      setFeita({ nome: escolhido.nome, ...r });
    } catch (x) { setErro((x as Error)?.message || 'O Asaas não gerou a cobrança. Tente de novo.'); }
  };
  const copiar = async () => {
    if (!feita?.link) return;
    try { await navigator.clipboard.writeText(feita.link); aoAvisar('Link de pagamento copiado.'); }
    catch { aoAvisar('Não consegui copiar sozinho. Selecione o link e copie.', 'erro'); }
  };
  return (
    <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.02s' }} data-gerar-cobranca>
      <div className="pn-card-cab"><div><h3>Gerar uma cobrança</h3><p>Cria no Asaas a cobrança de uma parcela e devolve o link de pagamento. O valor é a meia parcela do cliente.</p></div></div>
      <div className="cfgi-gerar">
        <div className="pn-us-campo">
          <label htmlFor="asaas-busca">Cliente</label>
          <input id="asaas-busca" className="inp" value={busca} placeholder="Digite o nome para filtrar" onChange={(e) => { setBusca(e.target.value); setErro(''); }} />
          <select id="asaas-cliente" className="inp" aria-label="Cliente" value={leadId} onChange={(e) => { setLeadId(e.target.value); setErro(''); setFeita(null); }}>
            <option value="">{dados.isLoading ? 'Carregando os clientes…' : clientes.length ? 'Escolha o cliente' : 'Nenhum cliente com esse nome'}</option>
            {clientes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div className="pn-us-campo">
          <label htmlFor="asaas-comp">Parcela de</label>
          <select id="asaas-comp" className="inp" value={comp} onChange={(e) => { setComp(e.target.value); setFeita(null); }}>
            {comps.map((c) => <option key={c} value={c}>{rotuloComp(c)}</option>)}
          </select>
          <span className="pn-us-dica">{escolhido ? `Vai cobrar ${reais((escolhido.valor || 0) / 2)}, a meia parcela de ${escolhido.nome}.` : 'O vencimento é o do ciclo do cliente nesse mês.'}</span>
        </div>
        <div className="cfgi-gerar-acao">
          <BotaoPrimario disabled={gerar.isPending || mudou} onClick={() => void fazer()}>{gerar.isPending ? 'Gerando…' : 'Gerar cobrança'}</BotaoPrimario>
        </div>
      </div>
      {mudou && <span className="pn-us-dica">Salve as regras antes de gerar: a cobrança sai com as regras salvas.</span>}
      {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      {feita && (
        <div className="cfgi-feita" role="status">
          <div><b>{feita.jaExistia ? 'Este cliente já tinha uma cobrança aberta nesse mês' : 'Cobrança gerada'}</b>
            <span className="num">{feita.nome} · {reais(feita.valor)} · vence em {dataBr(feita.vencimento)}</span></div>
          {feita.link ? <><code className="cfgi-link-pg">{feita.link}</code><BotaoSec onClick={() => void copiar()}>Copiar link</BotaoSec></> : <span className="pn-us-dica">O Asaas não devolveu o link. Veja a cobrança no painel do Asaas.</span>}
        </div>
      )}
    </CardVidro>
  );
}

function JanelaChave({ ambiente, aoFechar, aoAvisar }: { ambiente: AmbienteAsaas; aoFechar: () => void; aoAvisar: Avisar }) {
  const f = useChave(ambiente, () => { aoAvisar('Chave de API trocada. A conexão foi testada com a chave nova.'); aoFechar(); });
  return (
    <ModalV2 aberto aoFechar={() => { if (!f.ocupado) aoFechar(); }} largura={560} fecharNoVeu={!f.ocupado}
      titulo={<div>Trocar a chave de API<div className="mod-sub">A chave antiga deixa de ser usada assim que a nova for aceita</div></div>}
      rodape={<><BotaoSec disabled={f.ocupado} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={f.ocupado} onClick={() => void f.enviar()}>{f.ocupado ? 'Testando a chave…' : 'Testar e trocar'}</BotaoPrimario></>}>
      <CamposChave {...f.campos} />
    </ModalV2>
  );
}
