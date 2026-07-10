import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { initials, avatarColor } from '@/lib/avatar';
import { useSilenciarSlaAlerta, useResolverSlaAlerta, useSlaAlvos, type SlaAlvo } from '@/data/sla';
import { sevClass, sevIntensidade, sevRank, tipoLabel, fraseTipo, tempoRelativo, podeGerirAlerta, type SlaAlerta } from '@/data/slaView';

/* Card premium de alerta (estilo central de notificações): avatar do contato, tipo do alerta como
   título curto, "nome · canal", frase + tempo, "Abrir conversa" (verde discreto) e Silenciar/Resolver
   no menu "…". Navegação abre a conversa exata via /whatsapp?conversa=<id>. */

function presetAte(kind: '1h' | 'amanha'): string {
  const d = new Date();
  if (kind === '1h') { d.setHours(d.getHours() + 1); return d.toISOString(); }
  d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString();
}

function SilenciarBox({ alertaId, onDone }: { alertaId: string; onDone: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [kind, setKind] = useState<'1h' | 'amanha'>('1h');
  const silenciar = useSilenciarSlaAlerta();
  const podeConfirmar = motivo.trim().length > 0 && !silenciar.isPending;
  return (
    <div className="sla-silbox" role="group" aria-label="Silenciar alerta">
      <div className="sla-sil-durs">
        <button type="button" className={kind === '1h' ? 'on' : ''} onClick={() => setKind('1h')}>1 hora</button>
        <button type="button" className={kind === 'amanha' ? 'on' : ''} onClick={() => setKind('amanha')}>Até amanhã</button>
      </div>
      <input className="sla-sil-motivo" placeholder="Motivo (obrigatório)" value={motivo} maxLength={280}
        onChange={(e) => setMotivo(e.target.value)} />
      <div className="sla-sil-actions">
        <button type="button" className="sla-btn-ghost" onClick={onDone} disabled={silenciar.isPending}>Cancelar</button>
        <button type="button" className="sla-btn-solid" disabled={!podeConfirmar}
          onClick={() => silenciar.mutate({ alertaId, ate: presetAte(kind), motivo: motivo.trim() }, { onSuccess: onDone })}>
          {silenciar.isPending ? '…' : 'Silenciar'}
        </button>
      </div>
      {silenciar.isError && <div className="sla-sil-erro">Não foi possível silenciar.</div>}
    </div>
  );
}

function Item({ alerta, alvo, onNavigate, hideAbrir }: { alerta: SlaAlerta; alvo?: SlaAlvo; onNavigate?: () => void; hideAbrir?: boolean }) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const resolver = useResolverSlaAlerta();
  const [menu, setMenu] = useState(false);
  const [abrirSil, setAbrirSil] = useState(false);
  const podeGerir = podeGerirAlerta(currentOrg.role, alerta, user?.id);

  const nome = alvo?.nome ?? 'Cliente';
  const canal = alvo?.canal ?? null;
  const abrir = () => {
    onNavigate?.();
    navigate(alerta.conversa_id ? `/whatsapp?conversa=${alerta.conversa_id}` : '/kanban');
  };

  return (
    <li className={'sla-item ' + sevClass(alerta.severidade) + ' int-' + sevIntensidade(alerta.severidade)}>
      <span className="sla-item-av" aria-hidden="true" style={{ background: avatarColor(nome) }}>{initials(nome)}</span>
      <div className="sla-item-main">
        <div className="sla-item-top">
          <span className="sla-item-tipo">{tipoLabel(alerta.tipo)}</span>
        </div>
        <div className="sla-item-quem" title={nome + (canal ? ' · ' + canal : '')}>{nome}{canal && <span className="sla-item-canal"> · {canal}</span>}</div>
        <div className="sla-item-frase">{fraseTipo(alerta.tipo)} {tempoRelativo(alerta.criado_em)}</div>
        <div className="sla-item-acts">
          {!hideAbrir && <button type="button" className="sla-abrir" onClick={abrir}>{alerta.conversa_id ? 'Abrir conversa' : 'Abrir card'}</button>}
          {podeGerir && (
            <div className="sla-kebab-wrap">
              <button type="button" className="sla-kebab" aria-label="Ações" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
              {menu && (
                <div className="sla-kebab-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setAbrirSil(true); }}>Silenciar</button>
                  <button type="button" role="menuitem" disabled={resolver.isPending}
                    onClick={() => { setMenu(false); resolver.mutate(alerta.id); }}>Resolver</button>
                </div>
              )}
            </div>
          )}
        </div>
        {abrirSil && <SilenciarBox alertaId={alerta.id} onDone={() => setAbrirSil(false)} />}
      </div>
    </li>
  );
}

export function SlaAlertList({ itens, onNavigate, hideAbrir, agrupar }: {
  itens: SlaAlerta[]; onNavigate?: () => void; hideAbrir?: boolean; agrupar?: boolean;
}) {
  const alvos = useSlaAlvos(itens);
  if (!itens.length) return <div className="sla-empty">Tudo em dia — nenhum atendimento pendente. 🎉</div>;

  const render = (arr: SlaAlerta[]) => (
    <ul className="sla-list">{arr.map((a) => <Item key={a.id} alerta={a} alvo={alvos.get(a.id)} onNavigate={onNavigate} hideAbrir={hideAbrir} />)}</ul>
  );
  if (!agrupar) return render(itens);

  const atencao = itens.filter((a) => sevRank(a.severidade) >= 2);   // amarelo+
  const acomp = itens.filter((a) => sevRank(a.severidade) < 2);      // leve
  return (
    <div className="sla-secoes">
      {atencao.length > 0 && <><div className="sla-secao-h">Atenção agora</div>{render(atencao)}</>}
      {acomp.length > 0 && <><div className="sla-secao-h">Acompanhamento</div>{render(acomp)}</>}
    </div>
  );
}
