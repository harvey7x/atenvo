import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import '../fontes';
import '../tokens.css';
import '../base.css';
import './shell.css';
import { instalarSpotlight } from '../lib/spotlight';
import { ICONES } from './icones';
import { NotificacaoResposta, type DadosNotificacao } from './NotificacaoResposta';

/* Navegação real do app (INVENTARIO.md + decisões aprovadas):
   Relacionamento fica fora (adiada); Facebook, Scripts e Maturação são
   órfãs do mockup e entram nos grupos pela função. Badges chegam com as
   páginas reais — por ora ficam zerados (nada de número inventado). */
type ItemNav = { slug: string; rotulo: string; admin?: boolean };
const GRUPOS: { rotulo: string; itens: ItemNav[] }[] = [
  {
    rotulo: 'Operação',
    itens: [
      { slug: 'dashboard', rotulo: 'Dashboard' },
      { slug: 'whatsapp', rotulo: 'WhatsApp' },
      { slug: 'facebook', rotulo: 'Facebook' },
      { slug: 'kanban', rotulo: 'Kanban' },
      { slug: 'agendamentos', rotulo: 'Agendamentos' },
    ],
  },
  {
    rotulo: 'Gestão',
    itens: [
      { slug: 'contatos', rotulo: 'Contatos' },
      { slug: 'scripts', rotulo: 'Scripts' },
      { slug: 'cobrancas', rotulo: 'Cobranças' },
      { slug: 'relatorios', rotulo: 'Relatórios' },
    ],
  },
  {
    rotulo: 'Sistema',
    itens: [
      { slug: 'integracoes', rotulo: 'Integrações' },
      { slug: 'maturacao', rotulo: 'Maturação', admin: true },
      // paridade: /configuracoes NÃO tem RequireRole no app antigo (as abas variam por papel)
      { slug: 'configuracoes', rotulo: 'Configurações' },
      { slug: 'plano-uso', rotulo: 'Plano e uso', admin: true },
    ],
  },
];

const PAPEL_ROTULO: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  atendente: 'Atendente',
};

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'A';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

const NOTIF_DEMO: DadosNotificacao = {
  iniciais: 'MA',
  quem: 'Maria Aparecida Souza',
  mensagem: '"Consegui a foto do documento, meu filho. Pode conferir se está boa assim?"',
  fonte: 'WhatsApp · Canal 1390',
};

/** Shell autenticado v2: sidebar em overlay (64→242 no hover), topbar e palco. */
export default function AppShellV2() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => instalarSpotlight(), []);

  const [notif, setNotif] = useState<DadosNotificacao | null>(null);
  const [sinoOn, setSinoOn] = useState(false);
  const [badgePop, setBadgePop] = useState(0);
  const fecharNotif = useCallback(() => setNotif(null), []);


  // Botão interno de simulação (decisão aprovada, item 8): só o visual,
  // disparado à mão — a fiação realtime entra na sessão do WhatsApp.
  // seq nova a cada disparo: reinicia o timer e a barra de progresso.
  function simularResposta() {
    setBadgePop((n) => {
      setNotif({ ...NOTIF_DEMO, seq: n + 1 });
      return n + 1;
    });
    setSinoOn(true);
  }

  const nome = user?.name?.trim() || 'Equipe';
  const papel = currentOrg ? (PAPEL_ROTULO[currentOrg.role] ?? currentOrg.role) : '—';
  const org = currentOrg?.name ?? 'Atenvo';
  const admin = !currentOrg || currentOrg.role === 'admin';

  return (
    <div className="v2 app-v2">
      <div className="luz" />
      <div className="grao" />
      <div className="p-app">
        <aside className="p-sidebar">
          <div className="p-logo">
            <div className="marca">A</div>
            <span className="word lab">atenvo</span>
          </div>
          <div className="tenant" title={org}>
            <b>{org}</b>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9BA1AB" strokeWidth="2" aria-hidden>
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </div>
          <nav aria-label="Navegação principal">
            {GRUPOS.map((g) => {
              const itens = g.itens.filter((i) => admin || !i.admin);
              if (!itens.length) return null;
              return (
                <div className="grupo" key={g.rotulo}>
                  <div className="glabel caps lab">{g.rotulo}</div>
                  {itens.map((i) => (
                    <NavLink
                      key={i.slug}
                      to={`/v2/${i.slug}`}
                      className={({ isActive }) => (isActive ? 'item on' : 'item')}
                      title={i.rotulo}
                    >
                      {ICONES[i.slug]}
                      <span className="lab">{i.rotulo}</span>
                      {i.slug === 'whatsapp' && badgePop > 0 && (
                        <span key={badgePop} className="badge-n lab pop num">{badgePop}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="canal"><i aria-hidden /><span>Canal · operante</span></div>
          {import.meta.env.DEV && (
            <div className="dev-ferramentas">
              <button type="button" className="p-btn btn-sec btn-mini" onClick={simularResposta}>
                Simular resposta
              </button>
            </div>
          )}
          <div className="rodape-sb">
            <div className="avatar">{iniciaisDe(nome)}</div>
            <div className="lab">
              <div className="nome">{nome}</div>
              <div className="cargo">{papel}</div>
            </div>
          </div>
        </aside>

        <main className="principal">
          <div className="p-topbar">
            <div className="busca">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="busca-texto">Buscar contatos, conversas, cobranças…</span><kbd>⌘K</kbd>
            </div>
            <div className="top-dir">
              <button type="button" className="ib" aria-label="Notificações">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 004 0" />
                </svg>
                <span className={sinoOn ? 'pt on' : 'pt'} aria-hidden />
              </button>
              <div className="avatar" style={{ width: 33, height: 33 }}>{iniciaisDe(nome)}</div>
            </div>
          </div>

          <div className="palco">
            {/* key por caminho + geração: re-executa a entrada (pg-entra + cascata)
                a cada troca de rota e quando a intro abre o palco */}
            <div className="pagina pg-entra" key={location.pathname}>
              <Outlet />
            </div>
          </div>

          <NotificacaoResposta
            dados={notif}
            aoFechar={fecharNotif}
            aoVerConversa={() => {
              fecharNotif();
              navigate('/v2/whatsapp');
            }}
          />
        </main>
      </div>

    </div>
  );
}
