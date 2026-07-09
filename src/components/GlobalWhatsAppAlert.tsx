import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/context/OrgContext';
import {
  useWaAlertasGlobais,
  useSilenciarAlertaCanal,
  type WaAlertaGlobalItem,
  type WaAlertaSeveridade,
} from '@/data/whatsapp';

/* Aviso global de saúde dos canais WhatsApp. Aparece em todas as páginas internas (nunca no login).
   Só mostra problemas ATIVOS e NÃO silenciados (regra no backend). Silenciar/reativar = admin/supervisor. */

const SEV_RANK: Record<WaAlertaSeveridade, number> = { critico: 3, alto: 2, medio: 1 };

function sevClass(sev: WaAlertaSeveridade): string {
  return sev === 'critico' ? 'gwa-critico' : sev === 'alto' ? 'gwa-alto' : 'gwa-medio';
}

/** Presets de silenciamento (retornam ISO ou null = "até reconexão"). */
function presetAte(kind: '1h' | 'amanha' | 'reconexao'): string | null {
  if (kind === 'reconexao') return null;
  const d = new Date();
  if (kind === '1h') { d.setHours(d.getHours() + 1); return d.toISOString(); }
  // amanhã 08:00 local
  d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString();
}

function SilenciarBox({ canal, onDone }: { canal: WaAlertaGlobalItem; onDone: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [kind, setKind] = useState<'1h' | 'amanha' | 'reconexao'>('reconexao');
  const silenciar = useSilenciarAlertaCanal();
  const podeConfirmar = motivo.trim().length > 0 && !silenciar.isPending;
  return (
    <div className="gwa-silbox" role="group" aria-label={`Silenciar alerta de ${canal.nome_interno}`}>
      <div className="gwa-sil-durs">
        <button type="button" className={kind === '1h' ? 'on' : ''} onClick={() => setKind('1h')}>Por 1 hora</button>
        <button type="button" className={kind === 'amanha' ? 'on' : ''} onClick={() => setKind('amanha')}>Até amanhã</button>
        <button type="button" className={kind === 'reconexao' ? 'on' : ''} onClick={() => setKind('reconexao')}>Até reconexão</button>
      </div>
      <input
        className="gwa-sil-motivo"
        placeholder="Motivo (obrigatório)"
        value={motivo}
        maxLength={280}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <div className="gwa-sil-actions">
        <button type="button" className="gwa-btn-ghost" onClick={onDone} disabled={silenciar.isPending}>Cancelar</button>
        <button
          type="button"
          className="gwa-btn-solid"
          disabled={!podeConfirmar}
          onClick={() =>
            silenciar.mutate(
              { canalId: canal.canal_id, ate: presetAte(kind), motivo: motivo.trim() },
              { onSuccess: onDone },
            )
          }
        >
          {silenciar.isPending ? 'Silenciando…' : 'Silenciar'}
        </button>
      </div>
      {silenciar.isError && <div className="gwa-sil-erro">Não foi possível silenciar. Tente novamente.</div>}
    </div>
  );
}

function ItemRow({ item, podeGerir }: { item: WaAlertaGlobalItem; podeGerir: boolean }) {
  const [abrirSil, setAbrirSil] = useState(false);
  return (
    <li className={'gwa-item ' + sevClass(item.severidade)}>
      <div className="gwa-item-main">
        <span className="gwa-item-dot" aria-hidden="true" />
        <span className="gwa-item-titulo">{item.titulo}</span>
        {podeGerir && !abrirSil && (
          <button type="button" className="gwa-btn-ghost gwa-item-sil" onClick={() => setAbrirSil(true)}>
            Silenciar
          </button>
        )}
      </div>
      {podeGerir && abrirSil && <SilenciarBox canal={item} onDone={() => setAbrirSil(false)} />}
    </li>
  );
}

export function GlobalWhatsAppAlert() {
  const { currentOrg } = useOrg();
  const { data } = useWaAlertasGlobais();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [silUnico, setSilUnico] = useState(false);

  const podeGerir = currentOrg.role === 'admin' || currentOrg.role === 'gestor';

  if (!data || data.total === 0) return null;

  // Cor da barra = maior severidade presente.
  const sevMax: WaAlertaSeveridade =
    data.criticos > 0 ? 'critico' : data.altos > 0 ? 'alto' : 'medio';
  const itens = [...data.itens].sort((a, b) => SEV_RANK[b.severidade] - SEV_RANK[a.severidade]);
  const unico = data.total === 1;

  // Resumo textual para múltiplos canais.
  const partes: string[] = [];
  if (data.criticos > 0) partes.push(`${data.criticos} crítico${data.criticos > 1 ? 's' : ''}`);
  if (data.altos > 0) partes.push(`${data.altos} com falha`);
  if (data.medios > 0) partes.push(`${data.medios} desconectado${data.medios > 1 ? 's' : ''}/em atenção`);
  const resumo = `${data.total} canais WhatsApp precisam de atenção — ${partes.join(', ')}.`;

  return (
    <div className={'gwa ' + sevClass(unico ? itens[0].severidade : sevMax)} role="alert" aria-label="Alerta de canais WhatsApp">
      <div className="gwa-bar">
        <span className="gwa-bar-dot" aria-hidden="true" />
        <span className="gwa-bar-text">{unico ? itens[0].titulo : resumo}</span>
        <div className="gwa-bar-actions">
          {!unico && (
            <button type="button" className="gwa-btn-ghost" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
              {aberto ? 'Recolher' : `Ver ${data.total} canais`}
            </button>
          )}
          {unico && podeGerir && !silUnico && (
            <button type="button" className="gwa-btn-ghost" onClick={() => setSilUnico(true)}>Silenciar</button>
          )}
          <button type="button" className="gwa-btn-solid" onClick={() => navigate('/integracoes')}>
            Ver detalhes
          </button>
        </div>
      </div>

      {unico && podeGerir && silUnico && (
        <div className="gwa-list gwa-list-solo">
          <SilenciarBox canal={itens[0]} onDone={() => setSilUnico(false)} />
        </div>
      )}

      {!unico && aberto && (
        <ul className="gwa-list">
          {itens.map((it) => (
            <ItemRow key={it.canal_id} item={it} podeGerir={podeGerir} />
          ))}
        </ul>
      )}
    </div>
  );
}
