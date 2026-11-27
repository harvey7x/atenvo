/* Fotos REAIS dos clientes (dono 24/11: "quero que apareça as fotos reais dos clientes lá no Reviza").
   A foto de perfil do WhatsApp é buscada no servidor (função contato-foto) e guardada no depósito fechado
   contato-fotos; contatos.foto_url tem o link. Aqui:
   - useFotoReal(contatoId): a foto do contato (ou null = sem foto: o cliente esconde ou não tem → iniciais).
     Os ids que aparecem na tela juntos viram UMA consulta (lotes de 100), e cada contato é lido uma vez só.
   - atualizarFoto(contatoId): pede ao servidor para buscar agora, se a foto nunca foi buscada ou tem mais
     de 7 dias. Só a conversa ABERTA pede (o resto o agendador do servidor preenche aos poucos, sem pressa).
   Na prévia (dados fictícios) os retratos livres de lib/fotoIlustrativa fazem o papel da foto real, e um em
   cada cinco clientes fica sem foto, como acontece de verdade com quem esconde a foto no WhatsApp. */

import { useEffect, useSyncExternalStore } from 'react';
import { isPrevia, supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { fotoIlustrativa } from './fotoIlustrativa';

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ficticio = isPrevia || DEMO_MODE || !supabase;

const fotos = new Map<string, string | null>();   // contato → link da foto (null = sem foto)
const vencidas = new Set<string>();                // nunca buscada ou com mais de 7 dias
const pedidas = new Set<string>();                 // já pedida ao servidor nesta sessão
const naFila = new Set<string>();
let espera: ReturnType<typeof setTimeout> | null = null;
let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = () => { versao++; ouvintes.forEach((f) => f()); };

async function lerLote(ids: string[]) {
  try {
    const { data, error } = await supabase!.from('contatos').select('id, foto_url, foto_sync_em').in('id', ids);
    if (error) throw error;
    const porId = new Map((data ?? []).map((r) => [String(r.id), r as { foto_url: string | null; foto_sync_em: string | null }]));
    for (const id of ids) {
      const r = porId.get(id);
      fotos.set(id, r?.foto_url ?? null);
      if (r && (!r.foto_sync_em || Date.now() - new Date(r.foto_sync_em).getTime() > SETE_DIAS)) vencidas.add(id);
    }
  } catch {
    for (const id of ids) fotos.set(id, null);   // sem foto agora; as iniciais ficam
  }
  avisar();
}

function enfileirar(id: string) {
  if (fotos.has(id) || naFila.has(id)) return;
  naFila.add(id);
  if (espera) return;
  espera = setTimeout(() => {
    espera = null;
    const ids = [...naFila]; naFila.clear();
    for (let i = 0; i < ids.length; i += 100) void lerLote(ids.slice(i, i + 100));
  }, 40);
}

function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }

/** Um em cada cinco clientes da prévia fica sem foto (como quem esconde a foto no WhatsApp). */
function fotoDaPrevia(nome: string, id: string): string | null {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 5 === 0 ? null : fotoIlustrativa(nome, id);
}

/** A foto real do cliente pelo id do CONTATO; null enquanto carrega ou quando ele não tem foto visível. */
export function useFotoReal(contatoId: string | null | undefined, nome = ''): string | null {
  const id = contatoId ?? '';
  const valido = !ficticio && UUID.test(id);
  useSyncExternalStore(assinar, () => versao);
  useEffect(() => { if (valido) enfileirar(id); }, [id, valido]);
  if (!id) return null;
  if (ficticio) return fotoDaPrevia(nome, id);
  return valido ? fotos.get(id) ?? null : null;
}

/** Pede ao servidor a foto de agora (só quando a guardada tem mais de 7 dias ou nunca foi buscada). */
export function atualizarFoto(contatoId: string | null | undefined): void {
  const id = contatoId ?? '';
  if (ficticio || !UUID.test(id) || pedidas.has(id)) return;
  const pedir = () => {
    if (!vencidas.has(id) || pedidas.has(id)) return;
    pedidas.add(id);
    void supabase!.functions.invoke('contato-foto', { body: { contato_id: id } }).then(({ data }) => {
      const r = data as { ok?: boolean; foto_url?: string | null } | null;
      if (r?.ok && r.foto_url !== undefined) { fotos.set(id, r.foto_url); vencidas.delete(id); avisar(); }
    }).catch(() => { /* fica a que já tinha */ });
  };
  if (fotos.has(id)) { pedir(); return; }
  enfileirar(id);
  const sair = assinar(() => { if (fotos.has(id)) { sair(); pedir(); } });
}
