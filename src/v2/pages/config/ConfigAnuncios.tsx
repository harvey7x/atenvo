/* CONFIGURAÇÕES → INTEGRAÇÕES → ANÚNCIOS DO FACEBOOK (dono 25/11: "conectar o Facebook para ver qual
   campanha tá rodando melhor", como no sistema que a Reviza usava antes).
   Conectar em dois passos numa janela: (1) colar o código de acesso de um usuário do sistema da Meta
   com a permissão de ler anúncios; (2) escolher a conta de anúncios. Depois: a conta, a última
   atualização do gasto, "Atualizar agora" e "Desconectar". O sistema só LÊ (gasto, impressões, cliques,
   nomes de campanhas e anúncios): não cria, não pausa e não vê cartão. O código fica só no servidor.
   Dados: @/data/anuncios. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPrevia } from '@/lib/supabase';
import {
  useBuscarContasAnuncios, useConectarAnuncios, useContaAnuncios, useDesconectarAnuncios, useSincronizarAnuncios,
} from '@/data/anuncios';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, ConfirmDialogV2, EstadoErro, ModalV2 } from '../../components';
import '../painel/painel.css';

const IcFace = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const quando = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};
type Avisar = (texto: string, tom?: 'ok' | 'erro') => void;

export function ConfigAnuncios() {
  const q = useContaAnuncios();
  const ir = useNavigate();
  const [aviso, setAviso] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  const [janela, setJanela] = useState<'conectar' | 'desconectar' | null>(null);
  const avisar: Avisar = (texto, tom = 'ok') => setAviso({ texto, tom });
  const sync = useSincronizarAnuncios();
  const desconectar = useDesconectarAnuncios();
  const c = q.data;
  const atualizar = async () => {
    try { await sync.mutateAsync(); avisar('Gasto atualizado com a Meta.'); }
    catch (x) { avisar((x as Error)?.message || 'A Meta não respondeu. Tente de novo.', 'erro'); }
  };
  const sair = async () => {
    try { await desconectar.mutateAsync(); avisar('A conta de anúncios foi desconectada.'); }
    catch (x) { avisar((x as Error)?.message || 'Não foi possível desconectar.', 'erro'); }
    setJanela(null);
  };
  return (
    <div className="pn cfgi" data-config-anuncios>
      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}
      {q.isLoading ? <p className="pn-vazio">Consultando a conta de anúncios…</p>
        : q.isError ? <EstadoErro titulo="Não foi possível consultar a conta de anúncios" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void q.refetch()} />
        : !c?.conectada ? (
          <div className="cfgi-duas">
            <CardVidro spot className="pn-card sobe">
              <div className="pn-card-cab"><div><h3>Conectar a conta de anúncios</h3><p>São dois passos, na mesma janela.</p></div></div>
              <ol className="cfgw-passos">
                <li>Colar o <b>código de acesso da Meta</b> de um usuário do sistema que pode ler os anúncios.</li>
                <li>Escolher a <b>conta de anúncios</b> da empresa. Pronto: o Dashboard passa a mostrar o investido e o custo de cada lead.</li>
              </ol>
              <div className="cfgi-acoes"><BotaoPrimario onClick={() => setJanela('conectar')}>Conectar conta de anúncios</BotaoPrimario></div>
            </CardVidro>
            <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.05s' }}>
              <div className="pn-card-cab"><div><h3>O que aparece depois</h3></div></div>
              <ul className="cfgi-lista">
                <li>No <b>Dashboard › Anúncios</b>: quanto foi investido, quantos clientes cada campanha trouxe, o custo por lead e por fechado, e qual campanha está rodando melhor.</li>
                <li>O <b>rastreio</b> de cada cliente: de qual anúncio veio, em que etapa está e com quem.</li>
              </ul>
              <div className="cfgi-sep" />
              <div className="pn-card-cab"><div><h3>Como gerar o código</h3></div></div>
              <ul className="cfgi-lista">
                <li>No <b>Gerenciador de Negócios da Meta</b>, vá em Configurações do negócio › Usuários do sistema.</li>
                <li>Escolha (ou crie) um usuário do sistema, dê a ele acesso à <b>conta de anúncios</b> e toque em <b>Gerar token</b>.</li>
                <li>Marque a permissão <b>ads_read</b> (ler anúncios) e copie o código. Ele fica guardado só no servidor.</li>
              </ul>
              <div className="cfgi-sep" />
              <p className="cfgi-nota" role="note">O sistema só lê os números da conta. Não cria, não pausa e não muda anúncio nenhum, e não vê a forma de pagamento.</p>
            </CardVidro>
          </div>
        ) : (
          <CardVidro spot className="pn-card sobe">
            <div className="cfgi-conta">
              <span className="cfgi-ic on"><IcFace /></span>
              <div className="cfgi-conta-nm"><b>{c.nome ?? 'Conta de anúncios'}</b><span className="num">{c.contaId}{c.moeda ? ` · ${c.moeda}` : ''}</span></div>
              {c.erro ? <BadgeStatus tom="erro">Precisa de atenção</BadgeStatus> : <BadgeStatus tom="ok">Conectada</BadgeStatus>}
            </div>
            {c.erro && <p className="cfgi-nota" role="alert">{c.erro}</p>}
            <dl className="cfgw-ficha">
              <div><dt>Gasto atualizado em</dt><dd className="num">{quando(c.sincronizadoEm)}</dd></div>
              <div><dt>Atualiza sozinho</dt><dd>De hora em hora, os últimos 7 dias (a Meta ainda ajusta os números de dias recentes)</dd></div>
              <div><dt>O que o sistema lê</dt><dd>Investido, impressões, cliques e os nomes das campanhas e dos anúncios</dd></div>
              {c.conectadoPor && <div><dt>Conectada por</dt><dd>{c.conectadoPor}</dd></div>}
            </dl>
            <div className="cfgi-acoes">
              <BotaoPrimario onClick={() => ir('/dashboard?aba=anuncios')}>Ver no Dashboard</BotaoPrimario>
              <BotaoSec disabled={sync.isPending} onClick={() => void atualizar()}>{sync.isPending ? 'Atualizando…' : 'Atualizar agora'}</BotaoSec>
              <span className="cfgi-esp" />
              <button type="button" className="cfgi-link" onClick={() => setJanela('conectar')}>Trocar de conta</button>
              <button type="button" className="cfgi-link perigo" onClick={() => setJanela('desconectar')}>Desconectar</button>
            </div>
          </CardVidro>
        )}

      {janela === 'conectar' && <JanelaConectar aoFechar={() => setJanela(null)} aoAvisar={avisar} />}
      <ConfirmDialogV2 aberto={janela === 'desconectar'} titulo="Desconectar a conta de anúncios?" rotuloConfirmar="Desconectar" destrutivo carregando={desconectar.isPending}
        mensagem="O Dashboard para de mostrar o investido e o custo por lead. Os leads que vieram de anúncio continuam aparecendo, e os anúncios seguem rodando normalmente na Meta."
        aoConfirmar={() => void sair()} aoCancelar={() => setJanela(null)} />
    </div>
  );
}

function JanelaConectar({ aoFechar, aoAvisar }: { aoFechar: () => void; aoAvisar: Avisar }) {
  const buscar = useBuscarContasAnuncios();
  const conectar = useConectarAnuncios();
  const [fase, setFase] = useState<'codigo' | 'conta'>('codigo');
  const [token, setToken] = useState('');
  const [sessao, setSessao] = useState('');
  const [contas, setContas] = useState<{ id: string; nome: string; moeda: string }[]>([]);
  const [escolhida, setEscolhida] = useState('');
  const [erro, setErro] = useState('');
  const ocupado = buscar.isPending || conectar.isPending;
  const buscarContas = async () => {
    if (token.trim().length < 20) { setErro('Cole o código de acesso inteiro (ele é longo e começa com EAA).'); return; }
    setErro('');
    try {
      const r = await buscar.mutateAsync(token);
      if (!r.contas.length) { setErro('Este código não enxerga nenhuma conta de anúncios. Dê acesso à conta para o usuário do sistema.'); return; }
      setSessao(r.sessao); setContas(r.contas); setEscolhida(r.contas[0].id); setFase('conta');
    } catch (x) { setErro((x as Error)?.message || 'Não foi possível conferir o código. Tente de novo.'); }
  };
  const finalizar = async () => {
    if (!escolhida) { setErro('Escolha a conta de anúncios.'); return; }
    setErro('');
    try {
      await conectar.mutateAsync({ sessao, contaId: escolhida });
      aoAvisar(`${contas.find((x) => x.id === escolhida)?.nome ?? 'Conta'} conectada. O gasto dos últimos 30 dias já está no Dashboard.`);
      aoFechar();
    } catch (x) { setErro((x as Error)?.message || 'Não foi possível conectar a conta. Tente de novo.'); }
  };
  return (
    <ModalV2 aberto aoFechar={() => { if (!ocupado) aoFechar(); }} largura={540} fecharNoVeu={!ocupado}
      titulo={<div>Conectar a conta de anúncios<div className="mod-sub">{fase === 'codigo' ? 'Passo 1 de 2 · Código de acesso da Meta' : 'Passo 2 de 2 · Qual conta de anúncios?'}</div></div>}
      rodape={fase === 'codigo'
        ? <><BotaoSec disabled={ocupado} onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={() => void buscarContas()}>{buscar.isPending ? 'Conferindo…' : 'Buscar as contas'}</BotaoPrimario></>
        : <><BotaoSec disabled={ocupado} onClick={() => { setFase('codigo'); setErro(''); }}>Voltar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={() => void finalizar()}>{conectar.isPending ? 'Conectando e lendo o gasto…' : 'Conectar'}</BotaoPrimario></>}>
      {fase === 'codigo' ? (
        <div className="pn-us-form">
          <div className="pn-us-campo">
            <label htmlFor="an-token">Código de acesso da Meta</label>
            <input id="an-token" className="inp" type="password" value={token} placeholder="EAA…" autoComplete="off" spellCheck={false} data-1p-ignore
              onChange={(e) => { setToken(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') void buscarContas(); }} />
            <span className="pn-us-dica">O código permanente de um usuário do sistema, gerado no Gerenciador de Negócios da Meta com a permissão ads_read. Fica guardado só no servidor e não aparece de novo.</span>
            {isPrevia && <span className="cfgo-linha-links"><button type="button" className="cfgi-link" onClick={() => { setToken('EAAexemplo-da-previa-0000000000000000000000000000000000'); setErro(''); }}>Usar um código de exemplo</button></span>}
          </div>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      ) : (
        <div className="pn-us-form">
          <div className="pn-us-campo">
            <span className="pn-us-rot">{contas.length === 1 ? 'Conta encontrada' : 'Qual conta de anúncios conectar?'}</span>
            <div className="cfgo-numeros" role="radiogroup" aria-label="Conta de anúncios">
              {contas.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={escolhida === x.id} className={escolhida === x.id ? 'on' : undefined}
                  onClick={() => { setEscolhida(x.id); setErro(''); }}>
                  <b>{x.nome}</b>
                  <span className="num">{x.id} · {x.moeda}</span>
                </button>
              ))}
            </div>
            <span className="pn-us-dica">Ao conectar, o sistema lê o gasto dos últimos 30 dias para o Dashboard já abrir com histórico.</span>
          </div>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      )}
    </ModalV2>
  );
}
