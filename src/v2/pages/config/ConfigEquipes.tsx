/* CONFIGURAÇÕES → EQUIPES (dono 23/11): "criar uma equipe e colocar o gerente dessa equipe […] uma tela
   para que o administrador geral consiga colocar esses gerentes […] cada equipe vai ter um WhatsApp
   próprio na parte de atendimento."
   Lista das equipes e uma janela só para criar/editar: nome, gerente, pessoas e os números de WhatsApp
   do Atendimento que são da equipe. O gerente vê todas as conversas da equipe; as pessoas trabalham
   como sempre (cada uma vê as dela). A regra de quem vê o quê mora em data/config/equipes.ts e em
   lib/visibilidade.ts. Só o administrador entra aqui. */
import { useMemo, useState } from 'react';
import { BadgeStatus, BotaoPrimario, BotaoSec, CardVidro, EstadoErro, EstadoVazio, Kpi, ModalV2 } from '../../components';
import { IconeTile } from '../../components/CartaoMetrica';
import { AcoesNoTopo } from '../comunicacao/MenuMais';
import { formatarTelefone } from '../../lib/telefone';
import { ambientesDoPerfil } from '../../data/modulos';
import { useConexoesWA, type ConexaoWA } from '../../data/config/conexoes';
import { useEquipes, useExcluirEquipe, useSalvarEquipe, type Equipe } from '../../data/config/equipes';
import type { UsuarioRow } from '../../data/cobranca/usuarios';
import '../painel/painel.css';

const iniciais = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const fone = (n: string | null) => (n ? formatarTelefone(n) || n : null);
const ROT_PAPEL: Record<string, string> = { admin: 'administrador', gestor: 'gestor', comercial: 'comercial', financeiro: 'financeiro', cadastro: 'cadastro', atendente: 'atendente' };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function ConfigEquipes() {
  const eq = useEquipes();
  const con = useConexoesWA();
  const [janela, setJanela] = useState<{ equipe: Equipe | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const equipes = eq.data ?? [];
  // quem pode entrar numa equipe: as pessoas ativas que trabalham no Atendimento
  const pessoas = useMemo(() => con.usuarios.filter((u) => u.ativo && ambientesDoPerfil(u.papel, u.modulos).includes('atendimento')), [con.usuarios]);
  const numeros = useMemo(() => con.lista.filter((c) => c.ambiente === 'atendimento'), [con.lista]);
  const nomeDe = (id: string | null) => { const u = con.usuarios.find((x) => x.id === id); return u ? (u.nome || u.usuario) : null; };

  const emEquipe = new Set(equipes.flatMap((e) => [...e.membros, ...(e.gerenteId ? [e.gerenteId] : [])]));
  const atendem = pessoas.filter((u) => u.papel !== 'admin');
  const semEquipe = atendem.filter((u) => !emEquipe.has(u.id)).length;
  const numerosComEquipe = numeros.filter((n) => equipes.some((e) => e.canais.includes(n.id))).length;
  const equipesSemNumero = equipes.filter((e) => !e.canais.some((c) => numeros.some((n) => n.id === c))).length;
  const gerentes = new Set(equipes.map((e) => e.gerenteId).filter(Boolean)).size;
  const carregando = eq.isLoading || con.carregando;

  return (
    <div className="pn cfgw cfge">
      <AcoesNoTopo>
        <BotaoPrimario onClick={() => setJanela({ equipe: null })}>＋ Nova equipe</BotaoPrimario>
      </AcoesNoTopo>

      {aviso && <div className="gs-aviso ok" role="status"><span>{aviso}</span><button type="button" className="gs-aviso-x" onClick={() => setAviso(null)} aria-label="Fechar">×</button></div>}

      <div className="kpis sobe">
        <Kpi rotulo="Equipes" icone={<IconeTile nome="pessoas" />} valor={equipes.length} nota={equipes.length ? plural(gerentes, 'gerente', 'gerentes') : 'Nenhuma equipe ainda'} />
        <Kpi rotulo="Pessoas em equipe" icone={<IconeTile nome="entra" />} valor={atendem.length - semEquipe} nota={semEquipe ? `${plural(semEquipe, 'pessoa', 'pessoas')} do Atendimento sem equipe` : 'Todo o Atendimento em equipe'} />
        <Kpi rotulo="WhatsApp com equipe" icone={<IconeTile nome="telefone" />} valor={numerosComEquipe} nota={numeros.length ? `de ${plural(numeros.length, 'número', 'números')} do Atendimento` : 'Nenhum número do Atendimento ainda'} />
        <Kpi rotulo="Equipes sem WhatsApp" icone={<IconeTile nome="alerta" />} valor={equipesSemNumero} nota={equipesSemNumero ? 'Escolha o número de cada uma' : 'Toda equipe tem o seu número'} />
      </div>

      <CardVidro spot className="pn-card sobe" style={{ animationDelay: '.06s' }}>
        <div className="pn-card-cab pn-us-cab">
          <div><h3>Equipes do Atendimento</h3><p>Cada equipe tem um gerente, as pessoas dela e o seu WhatsApp.</p></div>
        </div>
        {carregando ? <p className="pn-vazio">Carregando as equipes…</p>
          : eq.isError ? <EstadoErro titulo="Não foi possível carregar as equipes" descricao="Houve uma falha na consulta. Tente de novo." aoTentarDeNovo={() => void eq.refetch()} />
          : equipes.length === 0 ? <EstadoVazio titulo="Nenhuma equipe criada" descricao="Crie a primeira equipe, escolha o gerente, as pessoas e o WhatsApp dela." acao={{ rotulo: '＋ Nova equipe', onClick: () => setJanela({ equipe: null }) }} />
          : (
            <div className="pn-mapa-rolo">
              <table className="pn-eq pn-fin-tab pn-us-tab cfgw-tab cfge-tab">
                <thead>
                  <tr>
                    <th scope="col">Equipe</th>
                    <th scope="col">Gerente</th>
                    <th scope="col">Pessoas</th>
                    <th scope="col">WhatsApp da equipe</th>
                    <th scope="col"><span className="pn-vh">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {equipes.map((e) => {
                    const gerente = nomeDe(e.gerenteId);
                    const nomes = e.membros.map(nomeDe).filter((n): n is string => !!n);
                    const nums = numeros.filter((n) => e.canais.includes(n.id));
                    return (
                      <tr key={e.id}>
                        <td>
                          <span className="pn-eq-nome estatico">
                            <span className="pn-av" aria-hidden>{iniciais(e.nome)}</span>
                            <span className="pn-eq-nm"><span>{e.nome}</span><small>{gerente ? plural(nomes.length + 1, 'pessoa', 'pessoas') : plural(nomes.length, 'pessoa', 'pessoas')}</small></span>
                          </span>
                        </td>
                        <td>{gerente ? <span className="pn-us-amb-tx">{gerente}</span> : <BadgeStatus tom="atencao">Sem gerente</BadgeStatus>}</td>
                        <td><span className="pn-us-amb-tx cfge-nomes">{nomes.length ? nomes.join(', ') : 'Só o gerente, por enquanto'}</span></td>
                        <td>
                          {nums.length
                            ? <span className="cfge-nums">{nums.map((n) => <span key={n.id} className="cfge-num"><span>{n.nome}</span><small className="num">{fone(n.numero) ?? 'aguardando o QR Code'}</small></span>)}</span>
                            : <BadgeStatus tom="atencao">Sem WhatsApp</BadgeStatus>}
                        </td>
                        <td className="pn-fin-acoes"><span className="pn-us-acoes"><BotaoSec mini onClick={() => setJanela({ equipe: e })}>Editar</BotaoSec></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </CardVidro>

      <CardVidro className="pn-card sobe" style={{ animationDelay: '.1s' }}>
        <div className="pn-card-cab"><div><h3>Como as equipes funcionam</h3><p>O administrador continua vendo tudo e é quem monta as equipes.</p></div></div>
        <div className="pn-us-papeis cfge-explica">
          <div className="pn-us-papel-card"><b>Gerente</b><span>Vê todas as conversas da equipe: as de cada pessoa e as que chegam no WhatsApp da equipe, mesmo as que ainda não têm dono.</span></div>
          <div className="pn-us-papel-card"><b>Pessoas da equipe</b><span>Trabalham como sempre: cada uma vê e responde só as conversas dela.</span></div>
          <div className="pn-us-papel-card"><b>WhatsApp da equipe</b><span>Cada número do Atendimento é de uma equipe só. O que chega nele é dessa equipe.</span></div>
        </div>
      </CardVidro>

      {janela && (
        <JanelaEquipe key={janela.equipe?.id ?? 'nova'} equipe={janela.equipe} equipes={equipes} pessoas={pessoas} numeros={numeros} nomeDe={nomeDe}
          aoFechar={() => setJanela(null)} aoAvisar={setAviso} />
      )}
    </div>
  );
}

function JanelaEquipe({ equipe, equipes, pessoas, numeros, nomeDe, aoFechar, aoAvisar }: {
  equipe: Equipe | null; equipes: Equipe[]; pessoas: UsuarioRow[]; numeros: ConexaoWA[]; nomeDe: (id: string | null) => string | null;
  aoFechar: () => void; aoAvisar: (t: string) => void;
}) {
  const salvar = useSalvarEquipe();
  const excluir = useExcluirEquipe();
  const [nome, setNome] = useState(equipe?.nome ?? '');
  const [gerente, setGerente] = useState(equipe?.gerenteId ?? '');
  const [membros, setMembros] = useState<string[]>(equipe?.membros ?? []);
  const [canais, setCanais] = useState<string[]>(equipe?.canais ?? []);
  const [erro, setErro] = useState('');
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const ocupado = salvar.isPending || excluir.isPending;

  const outras = equipes.filter((e) => e.id !== equipe?.id);
  const equipeDaPessoa = (id: string) => outras.find((e) => e.membros.includes(id)) ?? null;
  const equipeDoNumero = (id: string) => outras.find((e) => e.canais.includes(id)) ?? null;
  const naEquipe = membros.filter((m) => m !== gerente);
  // quem (ou qual número) sai de outra equipe ao salvar esta
  const mudancas = [
    ...[gerente, ...naEquipe].filter(Boolean).map((id) => ({ quem: nomeDe(id), de: equipeDaPessoa(id) })),
    ...canais.map((id) => ({ quem: numeros.find((n) => n.id === id)?.nome ?? null, de: equipeDoNumero(id) })),
  ].filter((m): m is { quem: string; de: Equipe } => !!m.quem && !!m.de);
  const alternar = (lista: string[], id: string, marcar: boolean) => (marcar ? [...new Set([...lista, id])] : lista.filter((x) => x !== id));

  const gravar = async () => {
    setErro('');
    try {
      const resumo = `gerente ${nomeDe(gerente) ?? '—'} · ${plural(naEquipe.length, 'pessoa', 'pessoas')} · ${plural(canais.length, 'número', 'números')} de WhatsApp`;
      const n = await salvar.mutateAsync({ id: equipe?.id, nome, gerenteId: gerente, membros: naEquipe, canais, resumo });
      aoAvisar(equipe ? `Equipe ${n} atualizada.` : `Equipe ${n} criada.`);
      aoFechar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.'); }
  };
  const apagar = async () => {
    if (!equipe) return;
    setErro('');
    try { await excluir.mutateAsync(equipe); aoAvisar(`Equipe ${equipe.nome} excluída.`); aoFechar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível excluir. Tente de novo.'); }
  };

  if (confirmaExcluir && equipe) {
    return (
      <ModalV2 aberto aoFechar={aoFechar} largura={440} titulo={<div>Excluir a equipe {equipe.nome}?<div className="mod-sub">Nenhuma conversa é apagada</div></div>}
        rodape={<><BotaoSec onClick={() => setConfirmaExcluir(false)} disabled={ocupado}>Voltar</BotaoSec><button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => void apagar()}>{ocupado ? 'Excluindo…' : 'Excluir equipe'}</button></>}>
        <div className="pn-us-form">
          <p className="cfge-texto">As pessoas e os números de WhatsApp desta equipe ficam sem equipe. O gerente deixa de ver as conversas das outras pessoas e volta a ver só as dele.</p>
          {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
        </div>
      </ModalV2>
    );
  }

  return (
    <ModalV2 aberto aoFechar={aoFechar} largura={600}
      titulo={<div>{equipe ? 'Editar equipe' : 'Nova equipe'}<div className="mod-sub">{equipe ? equipe.nome : 'O gerente, as pessoas e o WhatsApp da equipe'}</div></div>}
      rodape={<>
        {equipe && <button type="button" className="p-btn btn-perigo" disabled={ocupado} onClick={() => { setErro(''); setConfirmaExcluir(true); }}>Excluir equipe</button>}
        <span className="num-rodape-esp" />
        <BotaoSec onClick={aoFechar} disabled={ocupado}>Cancelar</BotaoSec>
        <BotaoPrimario disabled={ocupado} onClick={() => void gravar()}>{ocupado ? 'Salvando…' : equipe ? 'Salvar alterações' : 'Criar equipe'}</BotaoPrimario>
      </>}>
      <div className="pn-us-form">
        <div className="pn-us-campo">
          <label htmlFor="eq-nome">Nome da equipe</label>
          <input id="eq-nome" className="inp" value={nome} placeholder="ex.: Vendas" maxLength={40} autoFocus={!equipe} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
        </div>
        <div className="pn-us-campo">
          <label htmlFor="eq-gerente">Gerente</label>
          <select id="eq-gerente" className="inp" value={gerente} onChange={(e) => { setGerente(e.target.value); setErro(''); }}>
            <option value="">Escolha o gerente</option>
            {pessoas.map((u) => <option key={u.id} value={u.id}>{u.nome || u.usuario} ({ROT_PAPEL[u.papel] ?? u.papel})</option>)}
          </select>
          <span className="pn-us-dica">Vê todas as conversas da equipe: as de cada pessoa e as que chegam no WhatsApp da equipe.</span>
        </div>
        <div className="pn-us-campo">
          <span className="pn-us-rot">Pessoas da equipe</span>
          {pessoas.filter((u) => u.id !== gerente).length === 0
            ? <span className="pn-us-dica">Ninguém mais trabalha no Atendimento ainda. Libere o Atendimento para a pessoa em Usuários e acessos.</span>
            : (
              <div className="cfge-opcoes" role="group" aria-label="Pessoas da equipe">
                {pessoas.filter((u) => u.id !== gerente).map((u) => {
                  const de = equipeDaPessoa(u.id);
                  return (
                    <label key={u.id} className="cfge-op">
                      <input type="checkbox" checked={membros.includes(u.id)} onChange={(e) => setMembros((l) => alternar(l, u.id, e.target.checked))} />
                      <span>{u.nome || u.usuario}<small>{de ? `hoje na equipe ${de.nome}` : ROT_PAPEL[u.papel] ?? u.papel}</small></span>
                    </label>
                  );
                })}
              </div>
            )}
          <span className="pn-us-dica">Cada pessoa continua vendo só as conversas dela.</span>
        </div>
        <div className="pn-us-campo">
          <span className="pn-us-rot">WhatsApp da equipe</span>
          {numeros.length === 0
            ? <span className="pn-us-dica">Nenhum número do Atendimento conectado ainda. Conecte em WhatsApp e volte aqui para escolher.</span>
            : (
              <div className="cfge-opcoes" role="group" aria-label="WhatsApp da equipe">
                {numeros.map((n) => {
                  const de = equipeDoNumero(n.id);
                  return (
                    <label key={n.id} className="cfge-op">
                      <input type="checkbox" checked={canais.includes(n.id)} onChange={(e) => setCanais((l) => alternar(l, n.id, e.target.checked))} />
                      <span>{n.nome}<small>{de ? `hoje da equipe ${de.nome}` : fone(n.numero) ?? 'aguardando o QR Code'}</small></span>
                    </label>
                  );
                })}
              </div>
            )}
          <span className="pn-us-dica">As conversas que chegam nesses números são da equipe.</span>
        </div>
        {mudancas.length > 0 && (
          <div className="cfge-muda" role="note">
            Ao salvar: {mudancas.map((m, i) => <span key={i}>{i > 0 ? '; ' : ''}<b>{m.quem}</b> sai da equipe {m.de.nome}</span>)}.
          </div>
        )}
        {erro && <span className="pn-us-erro" role="alert">{erro}</span>}
      </div>
    </ModalV2>
  );
}
