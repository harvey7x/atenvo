/* CONFIGURAÇÕES → INTEGRAÇÕES → ASAAS (dono 22/11): "tem que ter a configuração para integrar o
   Asaas de pagamento".
   Sem conta conectada: a chave de API (e o ambiente — produção ou testes) e o passo a passo de onde
   pegar a chave. Com a conta conectada: a ficha da conexão (testar, trocar a chave, desconectar) e as
   regras — como o cliente paga, o que acontece quando ele paga, atraso e os avisos do próprio Asaas.
   As regras são um rascunho na tela até "Salvar alterações" (a faixa que aparece no pé quando algo muda). Os dados e as chamadas vêm de
   data/config/integracoes.ts; a chave de API nunca volta do servidor (só os 4 últimos caracteres). */
import { useEffect, useState } from 'react';
import { isPrevia } from '@/lib/supabase';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, LinhaToggle, ModalV2, Segmentado } from '../../components';
import {
  FORMAS, ROTULO_AMBIENTE_ASAAS, ambienteDaChave, chaveInvalida, useAsaas, useConectarAsaas, useDesconectarAsaas, useSalvarAsaas, useTestarAsaas,
  type AmbienteAsaas, type ConfigAsaas, type FormaPagamento, type IntegracaoAsaas,
} from '../../data/config/integracoes';
import { IcPagamentos } from './ConfigIntegracoes';
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
          <li>Abra <b>Integrações</b> e depois <b>Chaves de API</b>, e gere uma chave.</li>
          <li>Copie a chave inteira, com o cifrão do começo, e cole no campo ao lado.</li>
        </ol>
        <div className="cfgi-sep" />
        <div className="pn-card-cab"><div><h3>O que passa a funcionar</h3></div></div>
        <ul className="cfgi-lista">
          <li>A cobrança de cada parcela nasce no Asaas, com Pix, boleto ou cartão.</li>
          <li>Quando o cliente paga, a parcela recebe baixa sozinha no Financeiro.</li>
          <li>O comercial dono do cliente é avisado na hora.</li>
        </ul>
      </CardVidro>
    </div>
  );
}

/* ---------------- conta conectada: ficha + regras ---------------- */
const pctTexto = (n: number) => String(n).replace('.', ',');
const lerPct = (t: string) => { const n = Number(t.replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 100) / 100)) : 0; };

function Conectado({ dados, aoAvisar }: { dados: IntegracaoAsaas; aoAvisar: Avisar }) {
  const salvar = useSalvarAsaas();
  const testar = useTestarAsaas();
  const desconectar = useDesconectarAsaas();
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
  const alternar = (f: FormaPagamento) => set('formas', FORMAS.map((x) => x.id).filter((x) => (x === f ? !cfg.formas.includes(f) : cfg.formas.includes(x))));
  const semForma = cfg.formas.length === 0;

  const gravar = async () => {
    if (semForma) return;
    try { await salvar.mutateAsync(cfg); aoAvisar('Regras de pagamento salvas.'); }
    catch (x) { aoAvisar((x as Error)?.message || 'Não foi possível salvar. Tente de novo.', 'erro'); }
  };
  const conferir = async () => {
    try { const r = await testar.mutateAsync(); const c = r.conta as { nome?: string } | undefined; aoAvisar(`Conexão com o Asaas funcionando${c?.nome ? ` · ${c.nome}` : ''}.`); }
    catch (x) { aoAvisar((x as Error)?.message || 'O Asaas não respondeu. Tente de novo.', 'erro'); }
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
          <div className="cfgi-conta-nm"><b>{dados.conta?.nome || 'Conta do Asaas'}</b><span>{dados.conta?.email ?? 'Conta conectada'}</span></div>
          <BadgeStatus tom="ok">Conectado</BadgeStatus>
        </div>
        {dados.ambiente === 'testes' && <p className="cfgi-nota" role="note">Ambiente de testes: as cobranças são de mentira e nenhum dinheiro circula. Para valer, troque a chave pela de produção.</p>}
        <dl className="cfgw-ficha">
          <div><dt>Ambiente</dt><dd>{ROTULO_AMBIENTE_ASAAS[dados.ambiente ?? 'producao']}</dd></div>
          <div><dt>CNPJ ou CPF da conta</dt><dd className="num">{dados.conta?.documento ?? '—'}</dd></div>
          <div><dt>Chave de API</dt><dd className="num">{dados.chaveFinal ? `termina em ••••${dados.chaveFinal}` : 'guardada no servidor'}</dd></div>
          <div><dt>Conectada em</dt><dd className="num">{quando(dados.conectadoEm)}{dados.conectadoPor ? ` · por ${dados.conectadoPor}` : ''}</dd></div>
          <div><dt>Retorno dos pagamentos</dt><dd>{dados.retornoAtivo ? 'Ativo: o Asaas avisa o sistema a cada pagamento' : 'Parado: os pagamentos não estão chegando'}</dd></div>
          <div><dt>Último pagamento avisado</dt><dd className="num">{dados.ultimoRetorno ? quando(dados.ultimoRetorno) : 'Nenhum ainda'}</dd></div>
        </dl>
        <div className="cfgi-acoes">
          <BotaoSec disabled={testar.isPending} onClick={() => void conferir()}>{testar.isPending ? 'Testando…' : 'Testar conexão'}</BotaoSec>
          <BotaoSec onClick={() => setJanela('chave')}>Trocar a chave</BotaoSec>
          <span className="cfgi-esp" />
          <button type="button" className="cfgi-link perigo" onClick={() => setJanela('desconectar')}>Desconectar</button>
        </div>
      </CardVidro>

      <div className="cfgi-duas">
        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.04s' }}>
          <div className="pn-card-cab"><div><h3>Como o cliente paga</h3><p>As formas que aparecem para o cliente na cobrança.</p></div></div>
          <div className="cfgi-formas" role="group" aria-label="Formas de pagamento">
            {FORMAS.map((f) => {
              const on = cfg.formas.includes(f.id);
              return (
                <label key={f.id} className={`cfgi-forma${on ? ' on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => alternar(f.id)} />
                  <span><b>{f.rotulo}</b><small>{f.dica}</small></span>
                </label>
              );
            })}
          </div>
          {semForma && <span className="pn-us-erro" role="alert">Deixe pelo menos uma forma de pagamento marcada.</span>}
          <div className="cfgi-sep" />
          <LinhaToggle ligado={cfg.gerarSozinho} aoMudar={(v) => set('gerarSozinho', v)} titulo="Gerar a cobrança de cada parcela sozinho"
            descricao="Quando a régua vai avisar o cliente, o sistema cria a cobrança no Asaas com o valor e o vencimento da parcela. O link entra na mensagem onde você colocar a variável {link de pagamento}. Desligado, a cobrança é gerada à mão, cliente por cliente." />
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.08s' }}>
          <div className="pn-card-cab"><div><h3>Quando o cliente paga</h3><p>O que o sistema faz ao receber o aviso de pagamento do Asaas.</p></div></div>
          <LinhaToggle ligado={cfg.baixaAutomatica} aoMudar={(v) => set('baixaAutomatica', v)} titulo="Dar baixa na parcela sozinho"
            descricao="O pagamento entra no Financeiro já confirmado, na parcela certa, sem comprovante nem conferência. Desligado, ele chega como pendente para o financeiro confirmar." />
          {cfg.baixaAutomatica && cfg.formas.includes('cartao') && (
            <div className="pn-us-campo cfgi-recuo">
              <span className="pn-us-rot">No cartão, dar baixa</span>
              <Segmentado rotulo="No cartão, dar baixa" valor={cfg.baixaQuando} aoMudar={(v) => set('baixaQuando', v)}
                opcoes={[{ valor: 'confirmado', rotulo: 'Quando o Asaas confirmar' }, { valor: 'disponivel', rotulo: 'Quando o dinheiro estiver disponível' }]} />
              <span className="pn-us-dica">No cartão o Asaas confirma o pagamento na hora, mas o dinheiro só fica disponível na conta cerca de um mês depois.</span>
            </div>
          )}
          <div className="cfgi-sep" />
          <LinhaToggle ligado={cfg.avisarComercial} aoMudar={(v) => set('avisarComercial', v)} titulo="Avisar o comercial dono do cliente"
            descricao="Ele recebe um aviso no sino quando o pagamento de um cliente dele entra." />
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.12s' }}>
          <div className="pn-card-cab"><div><h3>Atraso</h3><p>O que é somado à cobrança paga depois do vencimento. Zero deixa sem acréscimo.</p></div></div>
          <div className="pn-us-duas">
            <div className="pn-us-campo">
              <label htmlFor="asaas-multa">Multa por atraso</label>
              <span className="cfgi-pct"><input id="asaas-multa" className="inp" inputMode="decimal" value={multaTx} maxLength={5}
                onChange={(e) => { setMultaTx(e.target.value); set('multa', lerPct(e.target.value)); }} onBlur={() => setMultaTx(pctTexto(cfg.multa))} /><i aria-hidden>%</i></span>
              <span className="pn-us-dica">Cobrada uma vez, sobre o valor da parcela.</span>
            </div>
            <div className="pn-us-campo">
              <label htmlFor="asaas-juros">Juros ao mês</label>
              <span className="cfgi-pct"><input id="asaas-juros" className="inp" inputMode="decimal" value={jurosTx} maxLength={5}
                onChange={(e) => { setJurosTx(e.target.value); set('juros', lerPct(e.target.value)); }} onBlur={() => setJurosTx(pctTexto(cfg.juros))} /><i aria-hidden>%</i></span>
              <span className="pn-us-dica">Proporcional aos dias de atraso.</span>
            </div>
          </div>
        </CardVidro>

        <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.16s' }}>
          <div className="pn-card-cab"><div><h3>Avisos do Asaas</h3><p>Quem fala com o cliente sobre a cobrança.</p></div></div>
          <LinhaToggle ligado={cfg.avisosAsaas} aoMudar={(v) => set('avisosAsaas', v)} titulo="Deixar o Asaas avisar o cliente por e-mail e SMS"
            descricao="Desligado, só a régua do sistema fala com o cliente, pelo WhatsApp. Ligado, o Asaas também manda os avisos dele, e alguns podem ter custo à parte na sua conta do Asaas." />
        </CardVidro>
      </div>

      {/* as regras mudaram: a faixa de salvar fica presa ao pé da tela, à vista em qualquer altura da página */}
      {mudou && (
        <div className="cfgi-salvar" role="region" aria-label="Alterações não salvas">
          <span>{semForma ? 'Marque pelo menos uma forma de pagamento para salvar.' : 'Você mudou as regras de pagamento. Elas só valem depois de salvar.'}</span>
          <BotaoSec disabled={salvar.isPending} onClick={repor}>Descartar</BotaoSec>
          <BotaoPrimario disabled={semForma || salvar.isPending} onClick={() => void gravar()}>{salvar.isPending ? 'Salvando…' : 'Salvar alterações'}</BotaoPrimario>
        </div>
      )}

      {janela === 'chave' && <JanelaChave ambiente={dados.ambiente ?? 'producao'} aoFechar={() => setJanela(null)} aoAvisar={aoAvisar} />}
      <ConfirmDialogV2 aberto={janela === 'desconectar'} titulo="Desconectar o Asaas?" rotuloConfirmar="Desconectar" destrutivo carregando={desconectar.isPending}
        mensagem="O sistema para de gerar cobranças e de receber os avisos de pagamento. As cobranças que já existem continuam no Asaas, e as regras ficam guardadas para quando você conectar de novo."
        aoConfirmar={() => void sair()} aoCancelar={() => setJanela(null)} />
    </>
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
