/* =====================================================================
   Figuras de demonstração do tutorial da planilha (Google) — cfig-.

   Uma figura por momento do passo a passo da etapa "Planilha de
   clientes": cada uma mostra, em desenho vetorial (NUNCA captura real,
   NUNCA logotipo de terceiro, NUNCA dado real), a tela que a pessoa
   vai ver e o realce dourado no ponto exato do clique. Tudo dentro da
   MolduraNavegador (3 pontos + endereço fictício do serviço), com
   <title> acessível e cores só por token — nítidas no claro e escuro.

   A ordem segue a guia da etapa:
   (A) FigExcelBaixar → FigDriveUpload → FigSalvarComoSheets →
       FigLocalidade → FigAbas → FigLinkPlanilha
   (B) FigCloudProjeto → FigAtivarApi → FigContaServico → FigChaveJson
   (D) FigCompartilhar
   (F) FigAppsScript
   ===================================================================== */
import {
  BotaoFig, CampoFig, Cursor, Ghost, GradeFig, IC, IcFig, MenuFig,
  MolduraNavegador, Painel, RadioFig, Realce, Seta,
} from './MolduraNavegador';

export * from './MolduraNavegador';

/** e-mail fictício da conta de serviço (o mesmo da guia) */
export const EMAIL_CONTA_FIG = 'reviza-sync@reviza-planilha.iam.gserviceaccount.com';

/* chip de aba/menu com texto centralizado */
function Chip({ x, y, w, h = 22, t, forte = false }: { x: number; y: number; w: number; h?: number; t: string; forte?: boolean }) {
  return (
    <g>
      <rect className="cfig-chip" x={x} y={y} width={w} height={h} rx={6} />
      <text className={forte ? 'cfig-tx-f' : 'cfig-tx'} x={x + w / 2} y={y + h / 2 + 4.5} textAnchor="middle">{t}</text>
    </g>
  );
}

/* ================================================== 1 · Excel Online */

export function FigExcelBaixar() {
  return (
    <MolduraNavegador endereco="excel.office.com"
      titulo="Excel Online: menu Arquivo aberto, com Salvar como e Baixar uma cópia em destaque">
      <IcFig x={16} y={46} forte><path d={IC.grade} /></IcFig>
      <text className="cfig-tx-f" x={40} y={59}>CLIENTES MENSAL.xlsx</text>
      <Chip x={16} y={70} w={66} t="Arquivo" forte />
      <text className="cfig-rot" x={96} y={85}>Página Inicial</text>
      <text className="cfig-rot" x={172} y={85}>Inserir</text>
      <text className="cfig-rot" x={218} y={85}>Dados</text>
      <g className="cfig-fundo">
        <GradeFig x={228} y={104} w={276} h={172} colunas={5} linhas={6} />
      </g>
      <MenuFig x={16} y={98} w={150} itens={[
        { t: 'Novo' },
        { t: 'Abrir' },
        { sep: true },
        { t: 'Salvar como', on: true, seta: true },
        { t: 'Imprimir' },
      ]} />
      <MenuFig x={170} y={155} w={200} itens={[
        { t: 'Salvar uma cópia' },
        { t: 'Baixar uma cópia', alvo: true },
        { t: 'Baixar como ODS' },
      ]} />
      <Seta de={[438, 130]} a={[376, 194]} curva={0.25} />
      <Cursor x={322} y={193} />
    </MolduraNavegador>
  );
}

/* ================================================== 2 · Google Drive */

export function FigDriveUpload() {
  return (
    <MolduraNavegador endereco="drive.google.com"
      titulo="Google Drive: botão Novo aberto, com Upload de arquivo em destaque">
      <BotaoFig x={16} y={52} w={86} h={30} rotulo="+ Novo" />
      <text className="cfig-tit" x={236} y={66}>Meu Drive</text>
      {[0, 1, 2].map((i) => (
        <g key={i} className="cfig-fundo">
          <rect className="cfig-sup" x={236 + i * 94} y={84} width={84} height={58} rx={8} />
          <IcFig x={244 + i * 94} y={92} s={18}><path d={IC.doc} /></IcFig>
          <Ghost x={244 + i * 94} y={124} w={56} claro={i !== 0} />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} className="cfig-fundo">
          <rect className="cfig-sup" x={236 + i * 94} y={154} width={84} height={58} rx={8} />
          <IcFig x={244 + i * 94} y={162} s={18}><path d={IC.doc} /></IcFig>
          <Ghost x={244 + i * 94} y={194} w={48} claro />
        </g>
      ))}
      <MenuFig x={16} y={94} w={186} itens={[
        { t: 'Nova pasta' },
        { sep: true },
        { t: 'Upload de arquivo', alvo: true },
        { t: 'Upload de pasta' },
      ]} />
      <g className="cfig-fundo">
        <IcFig x={18} y={206} s={14}><path d={IC.doc} /></IcFig>
        <text className="cfig-rot" x={40} y={217}>Meu Drive</text>
        <IcFig x={18} y={230} s={14}><path d={IC.pessoa} /></IcFig>
        <text className="cfig-rot" x={40} y={241}>Compartilhados comigo</text>
      </g>
      <Seta de={[280, 248]} a={[208, 146]} curva={-0.25} />
      <Cursor x={146} y={140} />
    </MolduraNavegador>
  );
}

/* ================================================== 3 · Salvar como Planilhas Google */

export function FigSalvarComoSheets() {
  return (
    <MolduraNavegador endereco="docs.google.com/spreadsheets"
      titulo="Arquivo .xlsx aberto no Google Planilhas: menu Arquivo com Salvar como Planilhas Google em destaque">
      <IcFig x={16} y={46} forte><path d={IC.grade} /></IcFig>
      <text className="cfig-tx-f" x={40} y={59}>CLIENTES MENSAL</text>
      <Chip x={158} y={46} w={46} h={16} t="XLSX" />
      <Chip x={16} y={72} w={66} t="Arquivo" forte />
      <text className="cfig-rot" x={96} y={87}>Editar</text>
      <text className="cfig-rot" x={140} y={87}>Ver</text>
      <text className="cfig-rot" x={172} y={87}>Inserir</text>
      <text className="cfig-rot" x={218} y={87}>Formatar</text>
      <g className="cfig-fundo">
        <GradeFig x={282} y={104} w={222} h={172} colunas={4} linhas={6} />
      </g>
      <MenuFig x={16} y={100} w={246} itens={[
        { t: 'Salvar como Planilhas Google', alvo: true },
        { sep: true },
        { t: 'Fazer download', seta: true },
        { t: 'Configurações' },
        { t: 'Histórico de versões' },
      ]} />
      <Seta de={[392, 180]} a={[268, 120]} curva={0.25} />
      <Cursor x={214} y={116} />
    </MolduraNavegador>
  );
}

/* ================================================== 4 · Localidade e fuso */

export function FigLocalidade() {
  return (
    <MolduraNavegador endereco="docs.google.com/spreadsheets"
      titulo="Configurações da planilha: Localidade Brasil e fuso horário de São Paulo, com o botão Salvar configurações em destaque">
      <g className="cfig-fundo">
        <GradeFig x={16} y={52} w={488} h={228} colunas={8} linhas={7} cab />
      </g>
      <Painel x={110} y={62} w={300} h={214} rx={12}>
        <text className="cfig-tit" x={126} y={90}>Configurações</text>
        <text className="cfig-tx-f" x={126} y={114}>Geral</text>
        <rect className="cfig-sel" x={126} y={120} width={34} height={2} rx={1} aria-hidden />
        <text className="cfig-rot" x={176} y={114}>Cálculo</text>
        <CampoFig x={126} y={146} w={130} rotulo="Localidade" valor="Brasil" alvo />
        <CampoFig x={126} y={196} w={170} rotulo="Fuso horário" valor="(GMT-03:00) São Paulo" alvo />
        <BotaoFig x={250} y={238} w={144} rotulo="Salvar configurações" pri alvo />
      </Painel>
      <Seta de={[468, 166]} a={[400, 243]} curva={-0.25} />
    </MolduraNavegador>
  );
}

/* ================================================== 5 · abas do rodapé */

export function FigAbas() {
  return (
    <MolduraNavegador endereco="docs.google.com/spreadsheets"
      titulo="Rodapé do Google Planilhas com as abas CLIENTES MENSAL e cancelados em destaque">
      <GradeFig x={16} y={52} w={488} h={186} colunas={6} linhas={5} cab />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Ghost key={i} x={24 + i * 81.3} y={82} w={i === 0 ? 58 : 46} claro={i > 2} />
      ))}
      {[0, 1, 2].map((i) => (
        <Ghost key={i} x={24 + i * 81.3} y={116} w={i === 0 ? 50 : 40} claro />
      ))}
      <rect className="cfig-sup" x={16} y={252} width={488} height={34} rx={8} />
      <IcFig x={26} y={262} s={14}><path d={IC.mais} /></IcFig>
      <Chip x={52} y={258} w={136} h={23} t="CLIENTES MENSAL" forte />
      <Realce x={52} y={258} w={136} h={23} rx={6} />
      <Chip x={198} y={258} w={92} h={23} t="cancelados" />
      <Realce x={198} y={258} w={92} h={23} rx={6} />
      <text className="cfig-rot" x={310} y={273}>nomes exatos, letra por letra</text>
      <Seta de={[372, 222]} a={[296, 266]} curva={-0.2} />
    </MolduraNavegador>
  );
}

/* ================================================== 6 · link e ID da planilha */

export function FigLinkPlanilha() {
  return (
    <MolduraNavegador endereco="docs.google.com/spreadsheets/d/…/edit"
      titulo="Barra de endereço da planilha com o ID em destaque e o botão Copiar link da janela Compartilhar">
      {/* lupa: a barra de endereço ampliada */}
      <path className="cfig-sep" d="M70 32 48 66" strokeDasharray="3 3" aria-hidden />
      <path className="cfig-sep" d="M500 32 472 66" strokeDasharray="3 3" aria-hidden />
      <rect className="cfig-campo" x={40} y={66} width={440} height={34} rx={17} />
      <text className="cfig-mono" x={54} y={87}>
        docs.google.com/spreadsheets/d/<tspan className="cfig-mono-f">1qZ8xVbNw3cM5kP0aRtY</tspan><tspan dx={5}>/edit</tspan>
      </text>
      <Realce x={255} y={71} w={141} h={24} rx={6} />
      <text className="cfig-rot" x={54} y={120}>o ID da planilha fica entre /d/ e /edit — copie o endereço inteiro</text>
      <Painel x={150} y={140} w={330} h={126} rx={10}>
        <text className="cfig-tx-f" x={166} y={166}>Compartilhar</text>
        <IcFig x={166} y={176} s={14}><path d={IC.link} /></IcFig>
        <text className="cfig-rot" x={186} y={187}>Acesso restrito · só quem você adicionar</text>
        <BotaoFig x={166} y={212} w={104} rotulo="Copiar link" alvo />
        <BotaoFig x={380} y={212} w={84} rotulo="Concluído" pri />
      </Painel>
      <Cursor x={232} y={228} />
      <Seta de={[90, 258]} a={[160, 230]} curva={0.2} />
    </MolduraNavegador>
  );
}

/* ================================================== 7 · projeto no Google Cloud */

export function FigCloudProjeto() {
  return (
    <MolduraNavegador endereco="console.cloud.google.com"
      titulo="Google Cloud: seletor de projetos aberto, com Novo projeto e o nome reviza-planilha em destaque">
      <text className="cfig-tx-f" x={16} y={62}>Google Cloud</text>
      <Chip x={120} y={46} w={170} h={24} t="Selecionar um projeto" />
      <path className="cfig-ic" d="M272 54 l5 5 5-5" aria-hidden />
      <Painel x={50} y={84} w={420} h={196} rx={12}>
        <text className="cfig-tit" x={66} y={114}>Selecionar um projeto</text>
        <BotaoFig x={346} y={96} w={108} rotulo="Novo projeto" alvo />
        <rect className="cfig-campo" x={66} y={130} width={260} height={26} rx={7} />
        <IcFig x={74} y={135} s={14}><path d={IC.lupa} /></IcFig>
        <Ghost x={98} y={140} w={120} claro />
        <path className="cfig-sep" d="M66 172 H454" aria-hidden />
        <Ghost x={66} y={184} w={180} />
        <Ghost x={66} y={204} w={140} claro />
        <text className="cfig-rot" x={66} y={240}>Dê este nome ao projeto:</text>
        <CampoFig x={212} y={222} w={150} valor="reviza-planilha" mono alvo />
        <BotaoFig x={378} y={222} w={64} h={28} rotulo="Criar" pri />
      </Painel>
      <Seta de={[300, 66]} a={[342, 102]} curva={-0.2} />
      <Cursor x={420} y={112} />
    </MolduraNavegador>
  );
}

/* ================================================== 8 · ativar a Google Sheets API */

export function FigAtivarApi() {
  return (
    <MolduraNavegador endereco="console.cloud.google.com/apis"
      titulo="Página da Google Sheets API com o botão Ativar em destaque">
      <text className="cfig-rot" x={16} y={60}>Biblioteca de APIs</text>
      <path className="cfig-ic" d="M118 50 l4 5 -4 5" aria-hidden />
      <text className="cfig-tx" x={132} y={60}>Google Sheets API</text>
      <rect className="cfig-chip" x={16} y={84} width={56} height={56} rx={12} />
      <IcFig x={28} y={96} s={32} forte><path d={IC.grade} /></IcFig>
      <text className="cfig-tit" x={88} y={104}>Google Sheets API</text>
      <text className="cfig-rot" x={88} y={122}>leitura e escrita em planilhas, por aplicativos</text>
      <Ghost x={88} y={136} w={290} claro />
      <Ghost x={88} y={150} w={230} claro />
      <BotaoFig x={88} y={172} w={92} h={30} rotulo="Ativar" pri alvo />
      <text className="cfig-rot" x={88} y={236}>A ativação é gratuita e leva poucos segundos.</text>
      <g className="cfig-fundo">
        <rect className="cfig-sup" x={372} y={84} width={132} height={120} rx={10} />
        <Ghost x={384} y={98} w={76} claro />
        <Ghost x={384} y={120} w={100} />
        <Ghost x={384} y={140} w={88} claro />
        <Ghost x={384} y={160} w={96} claro />
      </g>
      <Seta de={[320, 214]} a={[186, 190]} curva={0.18} />
      <Cursor x={158} y={192} />
    </MolduraNavegador>
  );
}

/* ================================================== 9 · conta de serviço */

export function FigContaServico() {
  return (
    <MolduraNavegador endereco="console.cloud.google.com/iam-admin"
      titulo="Contas de serviço no Google Cloud: Criar conta de serviço em destaque e o nome reviza-sync preenchido">
      <Chip x={16} y={50} w={132} h={20} t="IAM e administrador" />
      <path className="cfig-ic" d="M154 55 l4 5 -4 5" aria-hidden />
      <Chip x={164} y={50} w={124} h={20} t="Contas de serviço" forte />
      <BotaoFig x={16} y={84} w={186} h={28} rotulo="+ Criar conta de serviço" alvo />
      <g className="cfig-fundo">
        <rect className="cfig-sup" x={16} y={130} width={200} height={130} rx={8} />
        <Ghost x={26} y={142} w={80} claro />
        <path className="cfig-linha" d="M16 156 H216" aria-hidden />
        <Ghost x={26} y={168} w={150} />
        <Ghost x={26} y={192} w={130} claro />
        <Ghost x={26} y={216} w={160} claro />
      </g>
      <Painel x={236} y={122} w={268} h={150} rx={10}>
        <text className="cfig-tx-f" x={252} y={148}>Criar conta de serviço</text>
        <CampoFig x={252} y={176} w={160} rotulo="Nome da conta de serviço" valor="reviza-sync" mono alvo />
        <text className="cfig-rot" x={252} y={228}>Em permissões, não escolha papel.</text>
        <BotaoFig x={418} y={238} w={70} h={24} rotulo="Concluir" pri />
      </Painel>
      <Seta de={[330, 74]} a={[210, 94]} curva={-0.2} />
      <Cursor x={160} y={104} />
    </MolduraNavegador>
  );
}

/* ================================================== 10 · chave JSON */

export function FigChaveJson() {
  return (
    <MolduraNavegador endereco="console.cloud.google.com/iam-admin"
      titulo="Aba Chaves da conta reviza-sync: Criar nova chave em JSON, com o botão Criar em destaque e o arquivo baixado">
      <text className="cfig-rot" x={16} y={58}>Conta de serviço</text>
      <text className="cfig-mono-f" x={112} y={58}>reviza-sync</text>
      <text className="cfig-rot" x={16} y={82}>Detalhes</text>
      <text className="cfig-rot" x={74} y={82}>Permissões</text>
      <text className="cfig-tx-f" x={146} y={82}>Chaves</text>
      <rect className="cfig-sel" x={146} y={88} width={44} height={2} rx={1} aria-hidden />
      <BotaoFig x={16} y={102} w={136} rotulo="Adicionar chave ▾" />
      <MenuFig x={16} y={134} w={164} itens={[
        { t: 'Criar nova chave', alvo: true },
        { t: 'Fazer upload de chave' },
      ]} />
      <Cursor x={118} y={156} />
      <Painel x={240} y={96} w={264} h={148} rx={10}>
        <text className="cfig-tx-f" x={256} y={122}>Criar chave privada</text>
        <text className="cfig-rot" x={256} y={142}>Tipo de chave</text>
        <RadioFig x={256} y={162} rotulo="JSON" nota="· recomendado" marcado />
        <RadioFig x={256} y={186} rotulo="P12" />
        <BotaoFig x={428} y={208} w={60} h={24} rotulo="Criar" pri alvo />
      </Painel>
      <Seta de={[384, 272]} a={[455, 238]} curva={0.2} />
      <rect className="cfig-sup" x={16} y={258} width={340} height={30} rx={8} />
      <IcFig x={24} y={265} s={16} forte><path d={IC.doc} /></IcFig>
      <text className="cfig-mono-f" x={46} y={277}>reviza-planilha-4f2a.json</text>
      <text className="cfig-rot" x={222} y={277}>baixado no computador</text>
    </MolduraNavegador>
  );
}

/* ================================================== 11 · compartilhar com a conta */

export function FigCompartilhar() {
  return (
    <MolduraNavegador endereco="docs.google.com/spreadsheets"
      titulo="Janela Compartilhar da planilha: e-mail da conta de serviço, papel Editor e botão Enviar em destaque">
      <g className="cfig-fundo">
        <GradeFig x={16} y={52} w={488} h={230} colunas={8} linhas={7} cab />
      </g>
      <Painel x={62} y={56} w={396} h={220} rx={12}>
        <text className="cfig-tit" x={78} y={84}>Compartilhar “CLIENTES MENSAL”</text>
        <rect className="cfig-campo" x={78} y={98} width={364} height={30} rx={8} />
        <text className="cfig-mono-f" x={88} y={117}>{EMAIL_CONTA_FIG}</text>
        <text className="cfig-rot" x={78} y={152}>Papel</text>
        <g>
          <Chip x={78} y={158} w={86} h={24} t="Editor ▾" forte />
          <Realce x={78} y={158} w={86} h={24} rx={6} />
        </g>
        <rect className="cfig-chk" x={190} y={164} width={12} height={12} rx={3} />
        <text className="cfig-rot" x={210} y={174}>Notificar pessoas — deixe desmarcado</text>
        <BotaoFig x={78} y={226} w={100} rotulo="Copiar link" />
        <BotaoFig x={372} y={226} w={70} rotulo="Enviar" pri alvo />
      </Painel>
      <Cursor x={426} y={244} />
      <Seta de={[300, 262]} a={[366, 240]} curva={-0.15} />
    </MolduraNavegador>
  );
}

/* ================================================== 12 · Apps Script e acionador */

export function FigAppsScript() {
  return (
    <MolduraNavegador endereco="script.google.com"
      titulo="Apps Script da planilha: editor aberto com Acionadores em destaque e o acionador Ao editar">
      <rect className="cfig-sup" x={16} y={52} width={36} height={228} rx={9} />
      <IcFig x={26} y={66} s={16}><path d={IC.info} /></IcFig>
      <IcFig x={26} y={106} s={16}><path d="M9 8 5 12l4 4M15 8l4 4-4 4" /></IcFig>
      <IcFig x={24} y={148} s={20} forte><path d={IC.relogio} /></IcFig>
      <Realce x={19} y={143} w={30} h={30} rx={9} />
      <IcFig x={26} y={196} s={16}><path d={IC.doc} /></IcFig>
      <Chip x={66} y={56} w={82} h={20} t="Código.gs" />
      <rect className="cfig-sup" x={66} y={84} width={270} height={152} rx={8} />
      <text className="cfig-mono-f" x={78} y={106}>{'function avisarSistema(e) {'}</text>
      <Ghost x={92} y={116} w={160} h={6} />
      <Ghost x={92} y={130} w={200} h={6} claro />
      <Ghost x={92} y={144} w={120} h={6} />
      <Ghost x={92} y={158} w={180} h={6} claro />
      <Ghost x={92} y={172} w={90} h={6} />
      <text className="cfig-mono-f" x={78} y={196}>{'}'}</text>
      <text className="cfig-rot" x={78} y={224}>cole o código da tela do sistema e salve</text>
      <text className="cfig-tx-f" x={66} y={262}>Acionadores</text>
      <text className="cfig-rot" x={148} y={262}>na barra lateral</text>
      <Seta de={[128, 244]} a={[56, 164]} curva={-0.25} />
      <Painel x={352} y={96} w={152} h={150} rx={10}>
        <text className="cfig-rot" x={364} y={118}>Acionador novo</text>
        <text className="cfig-rot" x={364} y={140}>Função</text>
        <text className="cfig-mono-f" x={364} y={156}>avisarSistema</text>
        <text className="cfig-rot" x={364} y={178}>Evento</text>
        <g>
          <Chip x={364} y={186} w={84} h={24} t="Ao editar" forte />
          <Realce x={364} y={186} w={84} h={24} rx={6} />
        </g>
        <BotaoFig x={432} y={216} w={60} h={22} rotulo="Salvar" pri />
      </Painel>
    </MolduraNavegador>
  );
}
