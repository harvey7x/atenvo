/* ============================================================================
   A conversa COMPLETA com o cliente na ficha da Fila da Iris (dono 12/11: "aqui eu quero que apareça a conversa
   com o cliente" + "preciso das imagens e áudios, cvs completas"). Só o REAL usa (a prévia/demonstração mostram a
   conversa de exemplo da FilaIrisTela): as mensagens mais recentes do WhatsApp (useWaConversaFicha — até 1000, 15 s
   de frescor) na MESMA bolha do inbox (BolhaWa) — foto (clique abre em outra aba, com o link renovado), vídeo,
   áudio que toca com a transcrição (e "tentar carregar novamente" como no inbox), documento com Baixar/Abrir, selo
   da IA, enviada pelo celular. Somente leitura: responder/reenviar/identificar ficam no WhatsApp ("Abrir conversa").
   Sem as notas internas e as mensagens de sistema.
   ============================================================================ */
import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import { LIMITE_CONVERSA_FICHA, urlAssinadaMidiaWa, useWaConversaFicha, waRecarregarAudio } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';
import type { WaMessage } from '@/data/whatsappDemo';
import { Bolha } from '../../components/BolhaWa';
import '../whatsapp.css';
import type { Lead } from './lead';

const nada = () => undefined;
const pad2 = (n: number) => String(n).padStart(2, '0');
function diaDe(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (t >= hoje.getTime()) return 'Hoje';
  if (t >= hoje.getTime() - 86_400_000) return 'Ontem';
  const d = new Date(t);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}${d.getFullYear() !== hoje.getFullYear() ? `/${d.getFullYear()}` : ''}`;
}

export default function ConversaWa({ l }: { l: Lead }) {
  const { currentOrg } = useOrg();
  const q = useWaConversaFicha(l.conversaId ?? null);
  const msgs: WaMessage[] = useMemo(() => q.data ?? [], [q.data]);
  /* uma falha de rede numa releitura NÃO apaga o que já está na tela (o React Query guarda o último dado) */
  const semDado = !q.data;
  const temLista = msgs.length > 0;

  /* rolagem: abre no fim (o mais recente); a pessoa no fim acompanha o que chega (mensagem nova, foto/vídeo que
     termina de carregar); lendo lá em cima, fica onde está */
  const rolo = useRef<HTMLDivElement | null>(null);
  const miolo = useRef<HTMLDivElement | null>(null);
  const noFim = useRef(true);
  const montarRolo = useCallback((el: HTMLDivElement | null) => {
    rolo.current = el;
    if (el) { el.scrollTop = el.scrollHeight; noFim.current = true; }
  }, []);
  const aoRolar = () => {
    const el = rolo.current;
    if (el) noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    const el = rolo.current;
    const dentro = miolo.current;
    if (!el || !dentro || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (noFim.current) el.scrollTop = el.scrollHeight; });
    ro.observe(dentro);
    return () => ro.disconnect();
  }, [temLista]);

  /* a foto abre em outra aba com o link RENOVADO (a URL assinada da bolha vale 10 min) — a aba abre na hora do clique
     (sem bloqueio de pop-up) e recebe o endereço quando ele chega */
  const abrirFoto = (url: string, _nome?: string, mensagemId?: string) => {
    const aba = window.open('', '_blank');
    const m = mensagemId ? msgs.find((x) => x.id === mensagemId) : undefined;
    const ir = (u: string) => {
      if (aba) { try { aba.opener = null; } catch { /* segue */ } aba.location.href = u; } else window.open(u, '_blank', 'noopener');
    };
    if (m?.anexoPath) urlAssinadaMidiaWa(m.anexoPath).then(ir).catch(() => ir(url));
    else ir(url);
  };
  /* áudio que não baixou: "tentar carregar novamente" faz o mesmo que no WhatsApp */
  const recarregarAudio = async (m: WaMessage) => {
    if (!m.id || !currentOrg?.id) return;
    try { await waRecarregarAudio(currentOrg.id, m.id); } catch { /* a releitura mostra o estado de agora */ }
    await q.refetch();
  };

  let diaAntes = '';
  return (
    <section className="fi-bloco fi-bloco-fim fi-conversa">
      <h3 className="fi-bloco-t">Conversa com o cliente{temLista ? <span className="fi-bloco-n">{msgs.length === 1 ? '1 mensagem' : `${msgs.length} mensagens`}</span> : null}</h3>
      {!l.conversaId ? <p className="fi-conv-nota">Este cliente ainda não tem conversa no WhatsApp.</p>
        : semDado && q.isError ? <p className="fi-conv-nota" role="alert">Não deu para carregar a conversa agora.</p>
          : semDado ? <p className="fi-conv-nota">Carregando a conversa…</p>
            : !temLista ? <p className="fi-conv-nota">Ainda não há mensagens nesta conversa.</p>
              : (
                <div className="fi-conversa-rolo fi-conversa-wa" ref={montarRolo} onScroll={aoRolar} tabIndex={0} role="region" aria-label={`Conversa com ${l.nome}`}>
                  <div className="fi-conv-miolo" ref={miolo}>
                    {msgs.length >= LIMITE_CONVERSA_FICHA && <p className="fi-conv-antes">As mensagens mais antigas estão no WhatsApp.</p>}
                    {msgs.map((m, i) => {
                      const dia = diaDe(m.tsISO);
                      const sep = dia && dia !== diaAntes ? <span className="fi-conv-dia">{dia}</span> : null;
                      if (dia) diaAntes = dia;
                      return (
                        <Fragment key={m.id ?? `m${i}`}>
                          {sep}
                          <Bolha m={m} demo={false} nomeCliente={l.nome} retryId={null} removendoId={null} semDestino optout={false}
                            aoResponder={nada} aoVerErro={nada} aoRetry={nada} aoRemover={nada}
                            aoRecarregarAudio={(x) => { void recarregarAudio(x); }} aoLightbox={abrirFoto} />
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
      {temLista && q.isError ? <p className="fi-conv-nota" role="status">Sem conexão agora — mostrando a última leitura; tenta de novo sozinho.</p> : null}
      <p className="fi-conv-nota">Para responder ao cliente, use “Abrir conversa”.</p>
    </section>
  );
}
