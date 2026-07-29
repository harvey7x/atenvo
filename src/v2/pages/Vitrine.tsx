import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './Vitrine.css';
import { instalarSpotlight } from '../lib/spotlight';
import { aplicarTema, lerTema, salvarTema, type Tema } from '../lib/tema';
import {
  BadgeStatus,
  BotaoMini,
  BotaoPrimario,
  BotaoSec,
  Campo,
  CardCab,
  CardVidro,
  Chip,
  Chips,
  DefsSpark,
  EstadoErro,
  EstadoVazio,
  Kpi,
  LinhaToggle,
  Segmentado,
  Skeleton,
  SkeletonTexto,
  StatusBar,
  TabelaPadrao,
  TrilhoHora,
  TrilhoItem,
  type Coluna,
} from '../components';

/* Dados de exemplo — mesmos nomes/valores do mockup. */
type LinhaCobranca = {
  id: string;
  cliente: string;
  parcela: string;
  valor: string;
  status: 'ok' | 'atencao' | 'erro';
  statusRotulo: string;
  venc: string;
};

const COBRANCAS: LinhaCobranca[] = [
  { id: '1', cliente: 'Maria Aparecida Souza', parcela: '3/12', valor: 'R$ 320', status: 'ok', statusRotulo: 'Pago', venc: '25 jul' },
  { id: '2', cliente: 'José Carlos Ferreira', parcela: '5/12', valor: 'R$ 280', status: 'erro', statusRotulo: 'Vencido', venc: '25 jul' },
  { id: '3', cliente: 'Antônio Pereira Lima', parcela: '1/10', valor: 'R$ 450', status: 'atencao', statusRotulo: 'Pendente', venc: '29 jul' },
  { id: '4', cliente: 'Terezinha M. Alves', parcela: '8/24', valor: 'R$ 190', status: 'ok', statusRotulo: 'Pago', venc: '26 jul' },
];

const COLUNAS: Coluna<LinhaCobranca>[] = [
  { chave: 'cliente', titulo: 'Cliente', classe: 'nome', render: (l) => l.cliente },
  { chave: 'parcela', titulo: 'Parcela', classe: 'num', render: (l) => l.parcela },
  { chave: 'valor', titulo: 'Valor', dir: true, classe: 'val-t num', render: (l) => <>{l.valor}<span className="cent">,00</span></> },
  { chave: 'status', titulo: 'Status', render: (l) => <BadgeStatus tom={l.status}>{l.statusRotulo}</BadgeStatus> },
  { chave: 'venc', titulo: 'Venc.', dir: true, classe: 'num', render: (l) => l.venc },
];

function Secao({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <section className="vit-sec">
      <span className="caps">{rotulo}</span>
      {children}
    </section>
  );
}

export default function Vitrine() {
  useEffect(() => instalarSpotlight(), []);

  const [tema, setTema] = useState<Tema>(() => lerTema('vitrine'));
  useEffect(() => { aplicarTema(tema); }, [tema]);
  const [fx, setFx] = useState<'1' | '0.5'>('1');
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set(['1', '2']));
  const [pagina, setPagina] = useState(1);
  const [aba, setAba] = useState<'todas' | 'minhas' | 'sem'>('todas');
  const [filtroVencidas, setFiltroVencidas] = useState(true);
  const [avisar, setAvisar] = useState(true);
  const [alerta, setAlerta] = useState(true);
  const [resumo, setResumo] = useState(false);

  const estiloFx = useMemo(() => ({ '--fx': fx }) as CSSProperties, [fx]);

  function alternar(id: string) {
    setSelecionadas((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="v2 vitrine pg-entra" style={estiloFx}>
      <div className="luz" />
      <div className="grao" />
      <DefsSpark />
      <div className="miolo">
        <header className="vit-topo">
          <div>
            <span className="caps">Atenvo · Platina — fundação</span>
            {/* Título em Instrument Sans — a amostra de display fica na seção Tipografia. */}
            <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-.02em', margin: '7px 0 0' }}>
              Vitrine dos componentes
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--txt-2)', marginTop: 6 }}>
              Todos os componentes base da sessão 1a, com dados de exemplo. Nenhuma página do app ainda.
            </p>
          </div>
          <div className="acoes">
            <span className="caps" style={{ letterSpacing: '.1em' }}>tema</span>
            <Segmentado
              opcoes={[
                { valor: 'dark', rotulo: 'Escuro' },
                { valor: 'light', rotulo: 'Claro' },
              ]}
              valor={tema}
              aoMudar={(t) => { setTema(t); salvarTema(t, 'vitrine'); }}
            />
            <span className="caps" style={{ letterSpacing: '.1em' }}>--fx</span>
            <Segmentado
              opcoes={[
                { valor: '1', rotulo: '1 · demo' },
                { valor: '0.5', rotulo: '0.5 · operação' },
              ]}
              valor={fx}
              aoMudar={setFx}
            />
          </div>
        </header>

        <Secao rotulo="Tipografia">
          <CardVidro className="tipo-linha">
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.02em' }}>Instrument Sans 600 — títulos de página</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Instrument Sans 500 — rótulos, nomes e botões</div>
            <div style={{ fontSize: 12.5, color: 'var(--txt-2)' }}>Instrument Sans 400 — corpo e subtítulos</div>
            <div className="num" style={{ fontSize: 13 }}>0123456789 · tabular-nums em qualquer número (classe .num)</div>
            <div className="p-display" style={{ marginTop: 4 }}>
              Display platina — saudações e títulos de auth (.p-display).
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>
              Família única: Instrument Sans (Adendo nº 1). O destaque vem de peso e luz, não de outra fonte.
            </div>
          </CardVidro>
        </Secao>

        <Secao rotulo="Cor — semântica apenas">
          <div className="paleta">
            <span className="cor"><i style={{ background: 'var(--base)', border: '1px solid var(--linha)' }} /><b>--base</b>#0A0B0D</span>
            <span className="cor"><i style={{ background: 'linear-gradient(180deg,var(--vidro-a),var(--vidro-b))' }} /><b>vidro</b>a/b</span>
            <span className="cor"><i style={{ background: 'var(--txt)' }} /><b>--txt</b>#F4F5F7</span>
            <span className="cor"><i style={{ background: 'var(--verde)' }} /><b>--verde</b>ok</span>
            <span className="cor"><i style={{ background: 'var(--ambar)' }} /><b>--ambar</b>atenção</span>
            <span className="cor"><i style={{ background: 'var(--rubro)' }} /><b>--rubro</b>erro</span>
          </div>
          <p className="nota">Cor existe apenas como semântica (verde/âmbar/rubro) e no pulso do canal. Todo o resto é branco sobre a base, em camadas de opacidade.</p>
        </Secao>

        <Secao rotulo="Botões">
          <div className="lado-a-lado">
            <BotaoPrimario>＋ Novo contato</BotaoPrimario>
            <BotaoSec>Últimos 7 dias</BotaoSec>
            <BotaoPrimario mini>Abrir ficha</BotaoPrimario>
            <BotaoMini>Assumir</BotaoMini>
            <BotaoSec disabled>Desabilitado</BotaoSec>
          </div>
          <p className="nota">Ação primária é o botão platina — no máximo um por tela. O sheen atravessa no hover.</p>
        </Secao>

        <Secao rotulo="KPIs — contador animado + sparkline">
          <div className="kpis">
            <Kpi sobe atraso={0.05} rotulo="Conversas aguardando" valor={14} delta={{ tom: 'atencao', texto: '3 há mais de 30 min' }} spark={[26, 22, 25, 17, 20, 12, 15]} />
            <Kpi sobe atraso={0.12} rotulo="Novos leads hoje" valor={27} delta={{ tom: 'ok', texto: '↑ 18% vs. semana passada' }} spark={[28, 26, 21, 23, 15, 10, 6]} />
            <Kpi sobe atraso={0.19} rotulo="A receber na semana" valor={18640} formato="mil" prefixo="R$ " sufixo=",00" delta={{ tom: 'neutro', texto: '23 parcelas' }} spark={[22, 24, 18, 20, 14, 16, 11]} />
            <Kpi sobe atraso={0.26} rotulo="Taxa de resposta" valor={96} sufixo="%" delta={{ tom: 'ok', texto: '↑ 2 p.p. este mês' }} spark={[18, 16, 17, 13, 14, 10, 9]} />
          </div>
        </Secao>

        <Secao rotulo="Badges de status">
          <div className="lado-a-lado">
            <BadgeStatus tom="ok">Pago</BadgeStatus>
            <BadgeStatus tom="atencao">Pendente</BadgeStatus>
            <BadgeStatus tom="erro">Vencido</BadgeStatus>
            <BadgeStatus tom="neutro">—</BadgeStatus>
          </div>
        </Secao>

        <Secao rotulo="Itens com trilho — precisa de ação">
          <CardVidro spot>
            <CardCab titulo="Precisa de ação" contador={3} />
            <TrilhoItem tom="crit" titulo="Cobrança vencida — José Carlos F." sub="Parcela 5/12 · R$ 280,00 · há 2 dias" direita={<TrilhoHora>25 jul</TrilhoHora>} />
            <TrilhoItem tom="aten" titulo="Sem resposta — Maria Aparecida" sub="Aguardando a equipe há 42 min" direita={<TrilhoHora>14:38</TrilhoHora>} />
            <TrilhoItem
              tom="info"
              titulo="Ligação agendada — Sr. Antônio"
              sub="Meu INSS · consultora Giovana"
              direita={<BotaoMini style={{ alignSelf: 'center' }}>Abrir conversa</BotaoMini>}
            />
          </CardVidro>
        </Secao>

        <Secao rotulo="Filtros — chips e segmentado">
          <Chips>
            <Chip ativo={filtroVencidas} removivel onClick={() => setFiltroVencidas(!filtroVencidas)}>Com cobrança vencida</Chip>
            <Chip>+ Etapa</Chip>
            <Chip>+ Consultor</Chip>
            <Chip>+ Origem</Chip>
            <Chip limpar onClick={() => setFiltroVencidas(false)}>Limpar</Chip>
          </Chips>
          <Segmentado
            opcoes={[
              { valor: 'todas', rotulo: 'Todas 12' },
              { valor: 'minhas', rotulo: 'Minhas 4' },
              { valor: 'sem', rotulo: 'Sem resp. 3' },
            ]}
            valor={aba}
            aoMudar={setAba}
          />
        </Secao>

        <Secao rotulo="Tabela padrão — seleção, bulk platina e paginação">
          <CardVidro spot style={{ borderRadius: 12 }}>
            <TabelaPadrao
              colunas={COLUNAS}
              linhas={COBRANCAS}
              chave={(l) => l.id}
              selecao={{
                selecionadas,
                aoAlternar: alternar,
                aoLimpar: () => setSelecionadas(new Set()),
                acoes: [
                  { rotulo: 'Marcar como paga', onClick: () => undefined },
                  { rotulo: 'Enviar lembrete', onClick: () => undefined },
                  { rotulo: 'Exportar', onClick: () => undefined },
                ],
                rotuloContagem: (n) => (n === 1 ? '1 selecionada' : `${n} selecionadas`),
              }}
              rodape={{
                texto: '4 de 128 parcelas',
                paginacao: { pagina, totalPaginas: 26, aoIr: setPagina },
              }}
            />
          </CardVidro>
          <p className="nota">Dado é calmo: nenhum efeito interno além do hover; sem backdrop-filter em células. O vidro é do contêiner.</p>
        </Secao>

        <Secao rotulo="Formulário — campo, input e toggle">
          <CardVidro spot style={{ padding: '18px 20px' }}>
            <div className="grade g2" style={{ gap: 13 }}>
              <Campo rotulo="Nome completo" defaultValue="Gums" />
              <Campo rotulo="E-mail" type="email" placeholder="voce@empresa.com.br" />
            </div>
            <div style={{ borderTop: '1px solid var(--linha)', margin: '16px 0 10px' }} />
            <LinhaToggle ligado={avisar} aoMudar={setAvisar} titulo="Avisar quando um cliente responder" descricao="notificação no canto, como o WhatsApp" />
            <LinhaToggle ligado={alerta} aoMudar={setAlerta} titulo="Alerta de cobrança vencendo" descricao="na véspera do vencimento" />
            <LinhaToggle ligado={resumo} aoMudar={setResumo} titulo="Resumo diário por e-mail" descricao="todo dia às 18h" />
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 14 }}>
              <BotaoSec>Cancelar</BotaoSec>
              <BotaoPrimario>Salvar alterações</BotaoPrimario>
            </div>
          </CardVidro>
        </Secao>

        <Secao rotulo="Barra de status">
          <StatusBar
            segmentos={[
              { cor: 'verde', brilho: true, texto: 'Canal 1390 · operante' },
              { cor: 'verde', texto: 'Bot Matheo · fila 0' },
              { cor: 'neutro', texto: 'Sincronizado 14:39' },
            ]}
            fim="ATENVO · CAF ASSESSORIA"
          />
        </Secao>

        <Secao rotulo="Estados — o mesmo card em carregando, vazio e erro">
          <div className="grade g3">
            <CardVidro>
              <CardCab titulo="Carregando" />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                  <Skeleton largura={33} altura={33} raio={99} />
                  <div style={{ flex: 1 }}><Skeleton largura="55%" /></div>
                </div>
                <SkeletonTexto linhas={3} />
              </div>
            </CardVidro>
            <CardVidro>
              <CardCab titulo="Vazio" />
              <EstadoVazio
                titulo="Nenhuma cobrança por aqui"
                descricao="Quando você criar a primeira, ela aparece nesta lista."
                acao={{ rotulo: '＋ Nova cobrança', onClick: () => undefined }}
              />
            </CardVidro>
            <CardVidro>
              <CardCab titulo="Erro" />
              <EstadoErro
                descricao="Não conseguimos carregar as cobranças. Verifique a conexão."
                aoTentarDeNovo={() => undefined}
              />
            </CardVidro>
          </div>
        </Secao>
      </div>
    </div>
  );
}
