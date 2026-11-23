/* Tela "Usuários" — só ADMIN (dono 28/09: "o administrador consegue ter a tela de
   configuração/adm para remover usuários, adicionar, alterar senha, excluir do sistema?").
   Adicionar · editar nome e login · senha (gerar temporária OU definir) · papel ·
   desativar/reativar (reversível) · EXCLUIR do sistema (definitivo, digitando o login;
   nunca a si mesmo nem o último admin). Mesma linguagem do Painel (painel.css, pn-*).
   Real: profiles + Edge Function reviza-admin. Demo: store local (usuarios.ts).
   AMBIENTES (11/11): a mesma tela vale para os dois ambientes — fica em Cobranças → Usuários e em
   Atendimento → Configurações → Usuários. Cada pessoa tem os ambientes que enxerga (data/modulos.ts). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoVazio, ModalV2 } from '../components';
import {
  bloqueioDesativar, bloqueioExclusao, loginValido, senhaFraca,
  useCriarUsuario, useDefinirAmbientes, useDefinirAreas, useDefinirAtivo, useDefinirPapel, useDefinirSenha, useEditarUsuario, useExcluirUsuario,
  useMeuId, useResetarSenha, useUsuarios, type UsuarioRow,
} from '../data/cobranca/usuarios';
import type { Papel } from '../data/cobranca/types';
import { temRecurso, temCadastroAtendimento } from '../data/config/recursos';
import { AMBIENTES, ROTULO_AMBIENTE, alternarAmbiente, ambientesCadastrados as ambientesDoPerfil, ambientesFixos, type Ambiente } from '../data/modulos';
import { AREAS, areasPossiveis, resumoAreas } from '../data/config/areas';
import { lerDesfazer, useDesfazerEstado } from '../data/desfazer';
import { AcoesNoTopo, MenuMais } from './comunicacao/MenuMais';
import './painel/painel.css';

const PAPEL_ROTULO: Record<Papel, string> = { admin: 'Administrador', gestor: 'Gestor', comercial: 'Comercial', financeiro: 'Financeiro', cadastro: 'Cadastro', atendente: 'Atendente' };
// papéis por decisão do dono (11/09): comercial/financeiro/admin + cadastro; "gestor" só p/ exibir contas antigas
// + atendente (11/11): quem trabalha só no Atendimento
// o que esta instalação tem no servidor (config/recursos.ts): sem o Atendimento não há papel de atendente nem
// escolha de ambiente; sem as telas por pessoa não há a coluna nem o campo de telas
// (23/11) o Atendimento pode ser CADASTRADO antes de estar ligado (recurso "acessos"): papel, ambientes e equipes
const TEM_ATD = temCadastroAtendimento(), TEM_TELAS = temRecurso('telas');
const PAPEIS: Papel[] = TEM_ATD ? ['comercial', 'financeiro', 'cadastro', 'atendente', 'admin'] : ['comercial', 'financeiro', 'cadastro', 'admin'];
const PAPEL_DESC: Record<Papel, string> = {
  comercial: 'Painel com os clientes dele, Novos, Gestão, Calendário, Régua, Conversas, Números e Envios. Vê só a própria carteira.',
  financeiro: 'Painel geral, Novos, Financeiro, Gestão, Atendentes e Avisos. Confere pagamentos e aprova o ciclo.',
  cadastro: 'Novos, Gestão e Avisos. Acompanha reclamações, marca débito parado e aprova o ciclo — sem painel nem números.',
  atendente: 'Só o Atendimento: WhatsApp, Presenciais, Scripts, Kanban e as Ferramentas. Não vê as Cobranças.',
  admin: 'Vê e faz tudo nos dois ambientes, inclusive gerenciar os usuários.',
  gestor: 'Papel antigo — equivale a administrador sem a tela de usuários.',
};
const opcoesPapel = (atual?: Papel): Papel[] => (atual && !PAPEIS.includes(atual) ? [atual, ...PAPEIS] : PAPEIS);
const iniciais = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const desde = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', ''); };

/** ambientes como texto ("Cobranças · Atendimento") — na lista são informação; a troca fica em Editar */
const ambientesTexto = (papel: Papel, modulos: readonly Ambiente[] | null | undefined) => ambientesDoPerfil(papel, modulos).map((a) => ROTULO_AMBIENTE[a]).join(' · ');

/* ambientes da pessoa: chips Cobranças / Atendimento. Administrador e Atendente têm acesso fixo
   (chips travados, com o porquê na dica); os demais ligam/desligam (sempre fica pelo menos um). */
function Ambientes({ papel, modulos, aoMudar, travado, rotulo }: {
  papel: Papel; modulos: readonly Ambiente[] | null | undefined; aoMudar: (l: Ambiente[]) => void; travado?: string; rotulo: string;
}) {
  const fixos = ambientesFixos(papel);
  const atuais = ambientesDoPerfil(papel, modulos);
  const motivo = travado || (fixos ? (papel === 'admin' ? 'O administrador vê os dois ambientes.' : 'O atendente vê só o Atendimento.') : '');
  return (
    <span className="pn-us-amb" role="group" aria-label={rotulo}>
      {AMBIENTES.map((a) => {
        const on = atuais.includes(a);
        const unico = on && atuais.length === 1;
        return (
          <button key={a} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!!motivo || unico}
            title={motivo || (unico ? 'Pelo menos um ambiente fica marcado' : on ? `Tirar o acesso ao ${ROTULO_AMBIENTE[a]}` : `Dar acesso ao ${ROTULO_AMBIENTE[a]}`)}
            onClick={() => aoMudar(alternarAmbiente(atuais, a))}>
            {ROTULO_AMBIENTE[a]}
          </button>
        );
      })}
    </span>
  );
}

/* TELAS da pessoa (dono 22/11: "definir o que as pessoas vão poder fazer, quais áreas a pessoa vai
   poder acessar"). O papel é o teto; dentro dele, e dos ambientes dela, o administrador liga e
   desliga cada tela. Tudo marcado = sem restrição (grava null: as do papel, inclusive as que vierem). */
const TODAS_AS_TELAS = AREAS.map((a) => a.slug);
/** o que gravar: null quando nada foi tirado; senão só as marcadas que o papel alcança */
function telasParaGravar(papel: Papel, ambientes: readonly Ambiente[], marcadas: readonly string[]): string[] | null {
  if (papel === 'admin') return null;
  const possiveis = areasPossiveis(papel, ambientes).map((a) => a.slug);
  const ficam = possiveis.filter((sl) => marcadas.includes(sl));
  return ficam.length === possiveis.length ? null : ficam;
}
function Telas({ papel, ambientes, marcadas, aoMudar }: {
  papel: Papel; ambientes: readonly Ambiente[]; marcadas: readonly string[]; aoMudar: (l: string[]) => void;
}) {
  if (papel === 'admin') return <span className="pn-us-dica">O administrador vê todas as telas dos dois ambientes e as Configurações.</span>;
  const possiveis = areasPossiveis(papel, ambientes);
  return (
    <div className="pn-us-telas">
      {ambientes.map((amb) => {
        const doAmb = possiveis.filter((a) => a.ambiente === amb);
        if (!doAmb.length) return null;
        const todas = doAmb.every((a) => marcadas.includes(a.slug));
        return (
          <div key={amb} className="pn-us-telas-amb" role="group" aria-label={`Telas de ${ROTULO_AMBIENTE[amb]}`}>
            <div className="pn-us-telas-cab">
              <b>{ROTULO_AMBIENTE[amb]}</b>
              <span className="num">{doAmb.filter((a) => marcadas.includes(a.slug)).length} de {doAmb.length}</span>
              <button type="button" className="pn-link" onClick={() => aoMudar(todas ? marcadas.filter((sl) => !doAmb.some((a) => a.slug === sl)) : [...new Set([...marcadas, ...doAmb.map((a) => a.slug)])])}>{todas ? 'Desmarcar todas' : 'Marcar todas'}</button>
            </div>
            <div className="pn-us-telas-lista">
              {doAmb.map((a) => (
                <label key={a.slug} className="pn-us-check">
                  <input type="checkbox" checked={marcadas.includes(a.slug)} onChange={(e) => aoMudar(e.target.checked ? [...marcadas, a.slug] : marcadas.filter((sl) => sl !== a.slug))} /> {a.rotulo}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Janela =
  | { tipo: 'novo' }
  | { tipo: 'editar'; u: UsuarioRow }
  | { tipo: 'senha'; u: UsuarioRow }
  | { tipo: 'excluir'; u: UsuarioRow };

export function AbaUsuarios({ gestor }: { demo: boolean; gestor: boolean }) {
  const admin = gestor; // só admin chega aqui (menu/rota gated); prop reaproveitada
  const q = useUsuarios(admin);
  const eu = useMeuId().data ?? null;
  const criar = useCriarUsuario();
  const resetar = useResetarSenha();
  const definirSenha = useDefinirSenha();
  const editar = useEditarUsuario();
  const excluir = useExcluirUsuario();
  const setAtivo = useDefinirAtivo();
  const setPapel = useDefinirPapel();
  const setAmbientes = useDefinirAmbientes();
  const setAreas = useDefinirAreas();
  const navigate = useNavigate();

  const [aviso, setAvisoSt] = useState<{ texto: string; tom: 'ok' | 'erro' } | null>(null);
  // a faixa verde descreve a ÚLTIMA ação; se ela for desfeita (botão Desfazer do topo) ou o
  // desfazer trocar de ação, a faixa sai — senão ficava dizendo o estado que já não vale
  const acaoDoAviso = useRef<number | null>(null);
  const slotDesfazer = useDesfazerEstado();
  useEffect(() => {
    if (acaoDoAviso.current != null && slotDesfazer?.quando !== acaoDoAviso.current) { acaoDoAviso.current = null; setAvisoSt(null); }
  }, [slotDesfazer]);
  const ok = (texto: string) => { setAvisoSt({ texto, tom: 'ok' }); acaoDoAviso.current = lerDesfazer()?.quando ?? null; };
  const falha = (e: unknown) => setAvisoSt({ texto: (e as Error)?.message || String(e), tom: 'erro' });
  const [senhaMostrar, setSenhaMostrar] = useState<{ quem: string; senha: string; troca: boolean } | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [busca, setBusca] = useState('');

  const usuarios = useMemo(() => q.data ?? [], [q.data]);
  const ativos = usuarios.filter((u) => u.ativo).length;
  const primeiroAcesso = usuarios.filter((u) => u.ativo && u.deve_trocar_senha).length;
  const bq = busca.trim().toLowerCase();
  const lista = useMemo(() => usuarios
    .filter((u) => (filtro === 'todos' || (filtro === 'ativos' ? u.ativo : !u.ativo)))
    .filter((u) => !bq || u.nome.toLowerCase().includes(bq) || u.usuario.toLowerCase().includes(bq))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel) || a.nome.localeCompare(b.nome, 'pt-BR')),
  [usuarios, filtro, bq]);

  if (!admin) return <CardVidro spot><div className="fin-vazio">Área restrita aos administradores.</div></CardVidro>;

  const alternarAtivo = (u: UsuarioRow) => {
    const b = bloqueioDesativar(u, usuarios, eu); if (b) { falha(new Error(b)); return; }
    setAtivo.mutate({ id: u.id, ativo: !u.ativo }, {
      onSuccess: () => ok(u.ativo ? `${u.nome} não entra mais no sistema (é possível reativar a qualquer momento).` : `${u.nome} voltou a ter acesso.`),
      onError: falha,
    });
  };

  return (
    <div className="pn">
      {/* a ação da tela no cabeçalho da página (em Cobranças); dentro de Configurações, numa linha própria.
          A faixa de contadores saiu: o filtro (Todos · Ativos · Inativos) já mostra os números */}
      <AcoesNoTopo>
        <BotaoPrimario onClick={() => setJanela({ tipo: 'novo' })}>＋ Novo usuário</BotaoPrimario>
      </AcoesNoTopo>

      {aviso && <div className={`gs-aviso ${aviso.tom}`} role={aviso.tom === 'erro' ? 'alert' : 'status'}><span>{aviso.texto}</span><button type="button" className="gs-aviso-x" onClick={() => setAvisoSt(null)} aria-label="Fechar">×</button></div>}

      {/* senha gerada/definida: aparece UMA vez */}
      {senhaMostrar && (
        <CardVidro spot className="pn-card pn-us-senha sobe">
          <div className="pn-us-senha-tx">
            <b>Senha de {senhaMostrar.quem}</b>
            <span>Copie e entregue agora — ela <b>não aparece de novo</b>.{senhaMostrar.troca ? ' No primeiro acesso, a pessoa troca por uma senha própria.' : ''}</span>
          </div>
          <code className="pn-us-senha-cod num">{senhaMostrar.senha}</code>
          <span className="pn-us-senha-ac">
            <BotaoSec mini onClick={() => { void navigator.clipboard?.writeText(senhaMostrar.senha); ok('Senha copiada.'); }}>Copiar</BotaoSec>
            <BotaoSec mini onClick={() => setSenhaMostrar(null)}>Fechar</BotaoSec>
          </span>
        </CardVidro>
      )}

      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.04s' }}>
        {/* sem título repetido ("Usuários" já é o título da página): o cartão abre com os filtros */}
        <div className="pn-card-cab pn-us-cab">
          <div className="pn-us-filtros">
            <div className="pn-fin-seg" role="tablist" aria-label="Filtrar por situação">
              {([['todos', 'Todos', usuarios.length], ['ativos', 'Ativos', ativos], ['inativos', 'Inativos', usuarios.length - ativos]] as const).map(([id, rot, n]) => (
                <button key={id} type="button" role="tab" aria-selected={filtro === id} className={filtro === id ? 'on' : undefined} onClick={() => setFiltro(id)}>{rot}<span className="num">{n}</span></button>
              ))}
            </div>
            {primeiroAcesso > 0 && <span className="pn-us-1a-tot num">{primeiroAcesso} aguardando o primeiro acesso</span>}
          </div>
          <input className="inp pn-us-busca" type="search" placeholder="Buscar nome ou login…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
        </div>
        {q.isLoading ? <p className="pn-vazio">Carregando…</p> : q.isError ? <p className="pn-vazio">Não foi possível carregar os usuários.</p> : lista.length === 0 ? (
          usuarios.length === 0
            ? <EstadoVazio titulo="Nenhum usuário" descricao="Crie o primeiro usuário para a equipe entrar no sistema." acao={{ rotulo: '＋ Novo usuário', onClick: () => setJanela({ tipo: 'novo' }) }} />
            : <p className="pn-vazio">Ninguém neste filtro.</p>
        ) : (
          <div className="pn-mapa-rolo">
            <table className="pn-eq pn-fin-tab pn-us-tab">
              <thead>
                <tr>
                  <th scope="col">Pessoa</th>
                  <th scope="col">Papel</th>
                  {TEM_ATD && <th scope="col">Ambientes</th>}
                  {TEM_TELAS && <th scope="col">Telas</th>}
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="pn-vh">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => {
                  const souEu = u.id === eu;
                  const bDes = bloqueioDesativar(u, usuarios, eu);
                  const bExc = bloqueioExclusao(u, usuarios, eu);
                  return (
                    <tr key={u.id} className={u.ativo ? undefined : 'pn-us-inativo'}>
                      <td>
                        <span className="pn-eq-nome estatico">
                          <span className="pn-av" aria-hidden>{iniciais(u.nome || u.usuario)}</span>
                          <span className="pn-eq-nm"><span>{u.nome || '—'}{souEu && <em className="pn-us-voce">você</em>}</span><small className="num">login: {u.usuario} · desde {desde(u.created_at)}</small></span>
                        </span>
                      </td>
                      <td><span className="pn-us-papel-tx">{PAPEL_ROTULO[u.papel]}</span></td>
                      {TEM_ATD && <td><span className="pn-us-amb-tx">{ambientesTexto(u.papel, u.modulos)}</span></td>}
                      {TEM_TELAS && <td>{(() => { const r = resumoAreas(u.papel, ambientesDoPerfil(u.papel, u.modulos), u.areas); return <span className={r.restrito ? 'pn-us-amb-tx pn-us-telas-tx restrito' : 'pn-us-amb-tx pn-us-telas-tx'}>{r.texto}</span>; })()}</td>}
                      <td>
                        {u.ativo ? <BadgeStatus tom="ok">Ativo</BadgeStatus> : <BadgeStatus tom="neutro">Desativado</BadgeStatus>}
                        {u.ativo && u.deve_trocar_senha && <span className="pn-us-1a">Aguardando o primeiro acesso</span>}
                      </td>
                      <td className="pn-fin-acoes">
                        <span className="pn-us-acoes">
                          <BotaoSec mini onClick={() => setJanela({ tipo: 'editar', u })}>Editar</BotaoSec>
                          <MenuMais rotulo={`Mais ações para ${u.nome}`} itens={[
                            { rotulo: 'Alterar senha', onClick: () => setJanela({ tipo: 'senha', u }) },
                            { rotulo: 'Ver o que fez', onClick: () => navigate(`/config/registros?pessoa=${encodeURIComponent(u.nome)}`), dica: 'Abre os Registros só com as ações desta pessoa' },
                            { rotulo: u.ativo ? 'Desativar acesso' : 'Reativar acesso', onClick: () => alternarAtivo(u), desabilitado: !!bDes || setAtivo.isPending, dica: bDes || (u.ativo ? 'Tira o acesso; é possível reativar depois' : 'Devolve o acesso') },
                            'sep',
                            { rotulo: 'Excluir do sistema', perigo: true, onClick: () => setJanela({ tipo: 'excluir', u }), desabilitado: !!bExc, dica: bExc || 'Definitivo: pede confirmação' },
                          ]} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardVidro>

      {/* papéis: o que cada um vê (referência rápida) */}
      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.08s' }}>
        <div className="pn-card-cab"><div><h3>O que cada papel pode fazer</h3><p>O acesso muda na hora em que o papel é trocado.</p></div></div>
        <div className="pn-us-papeis">
          {PAPEIS.map((p) => (
            <div key={p} className="pn-us-papel-card">
              <b>{PAPEL_ROTULO[p]}<span className="num">{usuarios.filter((u) => u.papel === p && u.ativo).length}</span></b>
              <span>{PAPEL_DESC[p]}</span>
            </div>
          ))}
        </div>
      </CardVidro>

      {janela?.tipo === 'novo' && (
        <JanelaNovo ocupado={criar.isPending} aoFechar={() => setJanela(null)}
          aoCriar={(a) => criar.mutate(a, {
            onSuccess: (r) => { setJanela(null); setSenhaMostrar({ quem: r.usuario ?? a.usuario, senha: r.senha ?? a.senha ?? '', troca: a.senha ? a.exigirTroca !== false : true }); ok(`Usuário "${r.usuario ?? a.usuario}" criado.`); },
            onError: falha,
          })} />
      )}
      {janela?.tipo === 'editar' && (
        <JanelaEditar u={janela.u} souEu={janela.u.id === eu} ultimoAdmin={janela.u.papel === 'admin' && !usuarios.some((x) => x.id !== janela.u.id && x.papel === 'admin' && x.ativo)}
          ocupado={editar.isPending || setPapel.isPending || setAmbientes.isPending || setAreas.isPending} aoFechar={() => setJanela(null)}
          aoSalvar={async (a) => {
            const u = janela.u;
            try {
              if (a.nome !== undefined || a.usuario !== undefined) await editar.mutateAsync({ id: u.id, ...(a.nome !== undefined ? { nome: a.nome } : {}), ...(a.usuario !== undefined ? { usuario: a.usuario } : {}) });
              if (a.papel) await setPapel.mutateAsync({ id: u.id, papel: a.papel });
              if (a.modulos) await setAmbientes.mutateAsync({ id: u.id, modulos: a.modulos });
              if (a.areas !== undefined) await setAreas.mutateAsync({ id: u.id, areas: a.areas });
              setJanela(null);
              const nome = a.nome ?? u.nome;
              ok([
                a.usuario ? `o login de ${nome} agora é "${loginValido(a.usuario)}"` : '',
                a.papel ? `${nome} agora é ${PAPEL_ROTULO[a.papel]}` : '',
                a.modulos ? `entra em: ${a.modulos.map((x) => ROTULO_AMBIENTE[x]).join(' e ')}` : '',
                a.areas !== undefined ? (a.areas ? `vê ${a.areas.length} tela${a.areas.length === 1 ? '' : 's'}` : 'vê todas as telas do papel') : '',
              ].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase()) || 'Dados salvos.');
            } catch (e) { falha(e); }
          }} />
      )}
      {janela?.tipo === 'senha' && (
        <JanelaSenha u={janela.u} ocupado={resetar.isPending || definirSenha.isPending} aoFechar={() => setJanela(null)}
          aoGerar={() => resetar.mutate(janela.u.id, {
            onSuccess: (r) => { setJanela(null); setSenhaMostrar({ quem: janela.u.usuario, senha: r.senha ?? '', troca: true }); ok(`Senha de "${janela.u.usuario}" redefinida.`); },
            onError: falha,
          })}
          aoDefinir={(senha, exigirTroca) => definirSenha.mutate({ id: janela.u.id, senha, exigirTroca }, {
            onSuccess: () => { setJanela(null); ok(`Senha de "${janela.u.usuario}" alterada${exigirTroca ? ' — troca obrigatória no próximo acesso' : ''}.`); },
            onError: falha,
          })} />
      )}
      {janela?.tipo === 'excluir' && (
        <JanelaExcluir u={janela.u} bloqueio={bloqueioExclusao(janela.u, usuarios, eu)} ocupado={excluir.isPending} aoFechar={() => setJanela(null)}
          aoExcluir={(confirmar) => excluir.mutate({ id: janela.u.id, confirmar }, {
            onSuccess: () => { setJanela(null); ok(`${janela.u.nome} foi excluído do sistema.`); },
            onError: falha,
          })} />
      )}
    </div>
  );
}

/* ---------------- janelas ---------------- */

function CampoSenha({ valor, aoMudar, id }: { valor: string; aoMudar: (v: string) => void; id: string }) {
  const [ver, setVer] = useState(false);
  const f = valor ? senhaFraca(valor) : '';
  return (
    <div className="pn-us-campo">
      <label htmlFor={id}>Senha</label>
      <span className="pn-us-senha-in">
        <input id={id} className="inp" type={ver ? 'text' : 'password'} autoComplete="new-password" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder="mínimo 8, com letras e números" />
        <button type="button" className="pn-link" onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Mostrar'}</button>
      </span>
      {f ? <span className="pn-us-erro">{f}</span> : valor ? <span className="pn-us-ok">Senha válida</span> : null}
    </div>
  );
}

function JanelaNovo({ ocupado, aoCriar, aoFechar }: {
  ocupado: boolean; aoFechar: () => void;
  aoCriar: (a: { nome: string; usuario: string; papel: Papel; senha?: string; exigirTroca?: boolean; modulos?: Ambiente[]; areas?: string[] | null }) => void;
}) {
  const [telas, setTelas] = useState<string[]>(TODAS_AS_TELAS);
  const [escolherTelas, setEscolherTelas] = useState(false);
  const [nome, setNome] = useState('');
  const [usuario, setUsuario] = useState('');
  const [tocouLogin, setTocouLogin] = useState(false);
  const [papel, setPapel] = useState<Papel>('comercial');
  const [ambientes, setAmbientes] = useState<Ambiente[]>(['cobrancas']);
  const [modo, setModo] = useState<'gerar' | 'definir'>('gerar');
  const [senha, setSenha] = useState('');
  const [troca, setTroca] = useState(true);
  const loginSug = (n: string) => loginValido(n.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0] ?? '');
  const login = tocouLogin ? usuario : loginSug(nome);
  const ambNovo = ambientesDoPerfil(papel, ambientes);
  const areasNovo = telasParaGravar(papel, ambNovo, telas);
  const semTela = !!areasNovo && areasNovo.length === 0;
  const pode = !!nome.trim() && !!loginValido(login) && (modo === 'gerar' || !senhaFraca(senha)) && !semTela;
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={560}
      titulo={<div>Novo usuário<div className="mod-sub">A pessoa entra com o login e a senha que aparecem ao criar</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={!pode || ocupado} onClick={() => aoCriar({ nome: nome.trim(), usuario: loginValido(login), papel, modulos: ambNovo, areas: areasNovo, ...(modo === 'definir' ? { senha, exigirTroca: troca } : {}) })}>{ocupado ? 'Criando…' : 'Criar usuário'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-duas">
          <div className="pn-us-campo"><label htmlFor="us-nome">Nome</label><input id="us-nome" className="inp" value={nome} placeholder="Nome da pessoa" onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div className="pn-us-campo"><label htmlFor="us-login">Login</label><input id="us-login" className="inp" value={login} placeholder="ex.: joana" onChange={(e) => { setTocouLogin(true); setUsuario(loginValido(e.target.value)); }} /><span className="pn-us-dica">letras, números, ponto e hífen</span></div>
        </div>
        <div className="pn-us-campo">
          <span className="pn-us-rot">Papel</span>
          <div className="pn-us-opcoes" role="radiogroup" aria-label="Papel">
            {PAPEIS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={papel === p} className={papel === p ? 'on' : undefined} onClick={() => setPapel(p)}>
                <b>{PAPEL_ROTULO[p]}</b><span>{PAPEL_DESC[p]}</span>
              </button>
            ))}
          </div>
        </div>
        {TEM_ATD && <div className="pn-us-campo">
          <span className="pn-us-rot">Ambientes</span>
          <Ambientes papel={papel} modulos={ambientes} aoMudar={setAmbientes} rotulo="Ambientes do novo usuário" />
          <span className="pn-us-dica">{ambientesFixos(papel) ? (papel === 'admin' ? 'O administrador entra nos dois: Cobranças e Atendimento.' : 'O atendente entra só no Atendimento.') : 'Marque onde a pessoa vai trabalhar: Cobranças, Atendimento ou os dois. É possível mudar depois, em Editar.'}</span>
        </div>}
        {TEM_TELAS && <div className="pn-us-campo">
          <span className="pn-us-rot">Telas liberadas</span>
          {papel !== 'admin' && !escolherTelas
            ? <span className="pn-us-dica">Todas as telas do papel nos ambientes marcados. <button type="button" className="pn-link" onClick={() => setEscolherTelas(true)}>Escolher as telas</button></span>
            : <Telas papel={papel} ambientes={ambNovo} marcadas={telas} aoMudar={setTelas} />}
          {semTela && <span className="pn-us-erro">Marque pelo menos uma tela — sem nenhuma, a pessoa entra e não vê nada.</span>}
        </div>}
        <div className="pn-us-campo">
          <span className="pn-us-rot">Senha inicial</span>
          <div className="pn-fin-seg" role="tablist" aria-label="Senha inicial">
            <button type="button" role="tab" aria-selected={modo === 'gerar'} className={modo === 'gerar' ? 'on' : undefined} onClick={() => setModo('gerar')}>Gerar temporária</button>
            <button type="button" role="tab" aria-selected={modo === 'definir'} className={modo === 'definir' ? 'on' : undefined} onClick={() => setModo('definir')}>Definir agora</button>
          </div>
          {modo === 'gerar'
            ? <span className="pn-us-dica">O sistema cria uma senha forte; a pessoa troca no primeiro acesso.</span>
            : (<>
              <CampoSenha id="us-senha-novo" valor={senha} aoMudar={setSenha} />
              <label className="pn-us-check"><input type="checkbox" checked={troca} onChange={(e) => setTroca(e.target.checked)} /> Pedir para trocar no primeiro acesso</label>
            </>)}
        </div>
      </div>
    </ModalV2>
  );
}

function JanelaEditar({ u, souEu, ultimoAdmin, ocupado, aoSalvar, aoFechar }: {
  u: UsuarioRow; souEu: boolean; ultimoAdmin: boolean; ocupado: boolean; aoFechar: () => void;
  aoSalvar: (a: { nome?: string; usuario?: string; papel?: Papel; modulos?: Ambiente[]; areas?: string[] | null }) => void;
}) {
  // sem lista gravada = tudo marcado (as telas do papel, sem restrição)
  const [telas, setTelas] = useState<string[]>(() => u.areas ?? TODAS_AS_TELAS);
  const [nome, setNome] = useState(u.nome);
  const [login, setLogin] = useState(u.usuario);
  const [papel, setPapel] = useState<Papel>(u.papel);
  const [ambientes, setAmbientes] = useState<Ambiente[]>(() => ambientesDoPerfil(u.papel, u.modulos));
  // trocar o papel muda o acesso NA HORA: pede confirmação antes de salvar
  const [confirmar, setConfirmar] = useState(false);
  const mudouNome = nome.trim() !== u.nome;
  const mudouLogin = loginValido(login) !== u.usuario;
  const mudouPapel = papel !== u.papel;
  const ambFinal = ambientesDoPerfil(papel, ambientes);
  const ambAtual = ambientesDoPerfil(u.papel, u.modulos);
  const mudouAmb = !ambientesFixos(papel) && (ambFinal.length !== ambAtual.length || ambFinal.some((a) => !ambAtual.includes(a)));
  const bloqueioPapel = mudouPapel && ultimoAdmin && papel !== 'admin' ? 'É o último administrador ativo: o papel não pode mudar.' : '';
  const areasFinal = telasParaGravar(papel, ambFinal, telas);
  const areasAtual = telasParaGravar(u.papel, ambAtual, u.areas ?? TODAS_AS_TELAS);
  const mudouTelas = JSON.stringify(areasFinal) !== JSON.stringify(areasAtual);
  const semTela = !!areasFinal && areasFinal.length === 0;
  const pode = !!nome.trim() && !!loginValido(login) && (mudouNome || mudouLogin || mudouPapel || mudouAmb || mudouTelas) && !bloqueioPapel && !semTela;
  const salvar = () => aoSalvar({
    ...(mudouNome ? { nome: nome.trim() } : {}), ...(mudouLogin ? { usuario: loginValido(login) } : {}),
    ...(mudouPapel ? { papel } : {}), ...(mudouAmb ? { modulos: ambFinal } : {}), ...(mudouTelas ? { areas: areasFinal } : {}),
  });
  // papel novo = alcance novo: as telas voltam para "todas as do papel"; ambiente novo entra com as telas dele marcadas
  const trocarPapel = (p: Papel) => { setPapel(p); if (p !== papel) setTelas(TODAS_AS_TELAS); };
  const trocarAmbientes = (l: Ambiente[]) => {
    const novos = l.filter((a) => !ambFinal.includes(a));
    setAmbientes(l);
    if (novos.length) setTelas((t) => [...new Set([...t, ...AREAS.filter((a) => novos.includes(a.ambiente)).map((a) => a.slug)])]);
  };
  if (confirmar) {
    return (
      <ModalV2 aberto aoFechar={() => setConfirmar(false)} largura={460}
        titulo={<div>Trocar o papel de {u.nome}?<div className="mod-sub">{PAPEL_ROTULO[u.papel]} → {PAPEL_ROTULO[papel]}</div></div>}
        rodape={<><BotaoSec onClick={() => setConfirmar(false)} disabled={ocupado}>Voltar</BotaoSec><BotaoPrimario disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Confirmar a troca'}</BotaoPrimario></>}>
        <div className="pn-us-form">
          <p className="pn-us-dica" style={{ fontSize: 13, color: 'var(--txt-2)' }}>O acesso muda na hora. Como {PAPEL_ROTULO[papel].toLowerCase()}, {u.nome} passa a ter: {PAPEL_DESC[papel].charAt(0).toLowerCase() + PAPEL_DESC[papel].slice(1)}</p>
        </div>
      </ModalV2>
    );
  }
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={600}
      titulo={<div>Editar usuário<div className="mod-sub">{u.nome} · {PAPEL_ROTULO[u.papel]}</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={!pode || ocupado} onClick={() => (mudouPapel ? setConfirmar(true) : salvar())}>{ocupado ? 'Salvando…' : 'Salvar'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-us-duas">
          <div className="pn-us-campo"><label htmlFor="ed-nome">Nome</label><input id="ed-nome" className="inp" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="pn-us-campo"><label htmlFor="ed-login">Login</label><input id="ed-login" className="inp" value={login} onChange={(e) => setLogin(loginValido(e.target.value))} /><span className="pn-us-dica">{mudouLogin ? `A pessoa passa a entrar com "${loginValido(login)}". A senha não muda.` : 'Usado para entrar no sistema.'}</span></div>
        </div>
        {u.papel === 'comercial' && mudouNome && <p className="pn-us-alerta">Os clientes ficam ligados ao nome do comercial. Ao mudar o nome, confira o campo Comercial dos clientes na Gestão para que ele continue vendo a carteira.</p>}
        <div className="pn-us-campo">
          <span className="pn-us-rot">Papel</span>
          {souEu ? <span className="pn-us-dica">Você não pode mudar o seu próprio papel ({PAPEL_ROTULO[u.papel]}).</span> : (
            <div className="pn-us-opcoes" role="radiogroup" aria-label="Papel">
              {opcoesPapel(u.papel).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={papel === p} className={papel === p ? 'on' : undefined} onClick={() => trocarPapel(p)}>
                  <b>{PAPEL_ROTULO[p]}</b><span>{PAPEL_DESC[p]}</span>
                </button>
              ))}
            </div>
          )}
          {bloqueioPapel && <span className="pn-us-erro">{bloqueioPapel}</span>}
        </div>
        {TEM_ATD && <div className="pn-us-campo">
          <span className="pn-us-rot">Ambientes</span>
          <Ambientes papel={papel} modulos={ambientes} aoMudar={trocarAmbientes} rotulo={`Ambientes de ${u.nome}`}
            travado={souEu && !ambientesFixos(papel) ? 'Você não pode mudar os seus próprios ambientes' : undefined} />
          <span className="pn-us-dica">{ambientesFixos(papel) ? (papel === 'admin' ? 'O administrador entra nos dois: Cobranças e Atendimento.' : 'O atendente entra só no Atendimento.') : 'Onde a pessoa trabalha: Cobranças, Atendimento ou os dois.'}</span>
        </div>}
        {TEM_TELAS && <div className="pn-us-campo">
          <span className="pn-us-rot">Telas liberadas</span>
          <Telas papel={papel} ambientes={ambFinal} marcadas={telas} aoMudar={setTelas} />
          {papel !== 'admin' && <span className="pn-us-dica">O papel define até onde a pessoa pode ir; aqui você tira as telas que ela não precisa ver. Vale na hora.</span>}
          {semTela && <span className="pn-us-erro">Marque pelo menos uma tela — sem nenhuma, a pessoa entra e não vê nada.</span>}
        </div>}
      </div>
    </ModalV2>
  );
}

function JanelaSenha({ u, ocupado, aoGerar, aoDefinir, aoFechar }: {
  u: UsuarioRow; ocupado: boolean; aoFechar: () => void;
  aoGerar: () => void; aoDefinir: (senha: string, exigirTroca: boolean) => void;
}) {
  const [modo, setModo] = useState<'gerar' | 'definir'>('gerar');
  const [senha, setSenha] = useState('');
  const [troca, setTroca] = useState(true);
  const pode = modo === 'gerar' || !senhaFraca(senha);
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={480}
      titulo={<div>Alterar senha<div className="mod-sub">{u.nome} · login {u.usuario}</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><BotaoPrimario disabled={!pode || ocupado} onClick={() => (modo === 'gerar' ? aoGerar() : aoDefinir(senha, troca))}>{ocupado ? 'Salvando…' : modo === 'gerar' ? 'Gerar nova senha' : 'Salvar senha'}</BotaoPrimario></>}>
      <div className="pn-us-form">
        <div className="pn-fin-seg" role="tablist" aria-label="Como alterar">
          <button type="button" role="tab" aria-selected={modo === 'gerar'} className={modo === 'gerar' ? 'on' : undefined} onClick={() => setModo('gerar')}>Gerar temporária</button>
          <button type="button" role="tab" aria-selected={modo === 'definir'} className={modo === 'definir' ? 'on' : undefined} onClick={() => setModo('definir')}>Definir senha</button>
        </div>
        {modo === 'gerar'
          ? <p className="pn-us-dica">O sistema gera uma senha forte, mostrada uma única vez para você entregar. A pessoa troca no próximo acesso. A senha antiga para de funcionar na hora.</p>
          : (<>
            <CampoSenha id="us-senha-def" valor={senha} aoMudar={setSenha} />
            <label className="pn-us-check"><input type="checkbox" checked={troca} onChange={(e) => setTroca(e.target.checked)} /> Pedir para trocar no próximo acesso</label>
            <p className="pn-us-dica">A senha antiga para de funcionar na hora.</p>
          </>)}
      </div>
    </ModalV2>
  );
}

function JanelaExcluir({ u, bloqueio, ocupado, aoExcluir, aoFechar }: {
  u: UsuarioRow; bloqueio: string; ocupado: boolean; aoFechar: () => void; aoExcluir: (confirmar: string) => void;
}) {
  const [conf, setConf] = useState('');
  const confere = conf.trim().toLowerCase() === u.usuario.toLowerCase();
  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={500}
      titulo={<div>Excluir {u.nome} do sistema<div className="mod-sub">Definitivo: não é possível desfazer</div></div>}
      rodape={<><BotaoSec onClick={aoFechar}>Cancelar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={!!bloqueio || !confere || ocupado} onClick={() => aoExcluir(conf)}>{ocupado ? 'Excluindo…' : 'Excluir definitivamente'}</button></>}>
      <div className="pn-us-form">
        {bloqueio ? <p className="pn-us-alerta">{bloqueio}</p> : (<>
          <ul className="pn-us-conseq">
            <li><b>Some:</b> o login de <b>{u.usuario}</b>, as notificações e os recibos de leitura de avisos dessa pessoa.</li>
            <li><b>Fica:</b> clientes{u.papel === 'comercial' ? ` (continuam no nome "${u.nome}" na Gestão)` : ''}, pagamentos, conferências, avisos e o histórico em Registros.</li>
            <li>Para tirar o acesso só por um tempo, use <b>Desativar acesso</b>, que é reversível.</li>
          </ul>
          <div className="pn-us-campo">
            <label htmlFor="us-conf">Para confirmar, digite o login <b>{u.usuario}</b></label>
            <input id="us-conf" className="inp" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="off" autoFocus />
          </div>
        </>)}
      </div>
    </ModalV2>
  );
}
