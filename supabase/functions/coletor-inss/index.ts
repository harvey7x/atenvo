// coletor-inss — ponte entre o coletor local (o Mac do escritório) e o Atenvo.
//
// O coletor NÃO tem chave do banco: ele chama esta função com o header
// x-coletor-chave, comparado com webhook_config.secret (chave='coletor-inss'),
// mesmo padrão do mensagens-agendadas-processar. Deploy --no-verify-jwt.
//
// Ações (POST JSON { acao, ... }):
//   fila     -> pedidos aberto/em_andamento, mais antigo primeiro. O CPF sai
//               MASCARADO (•••.XXX.XXX-••): o completo só vem no assumir — quem
//               vazar a chave não monta base de CPFs só lendo a fila.
//   assumir  -> { pedido_id, coletor_id } aberto -> em_andamento. Grava QUEM
//               assumiu; repetir é ok só para o MESMO coletor (dois coletores no
//               mesmo pedido = 409, um sobrescreveria os PDFs do outro).
//               Devolve o pedido completo (com CPF inteiro).
//   reabrir  -> { pedido_id } em_andamento -> aberto (qualquer coletor pode:
//               é a válvula para pedido preso em máquina que morreu)
//   enviar   -> { pedido_id, titulo, conteudo_base64 } grava o PDF no bucket
//               inss-docs e registra em inss_documentos (repetir substitui).
//               SÓ com o pedido em_andamento: concluído não aceita mais upload
//               (senão a chave vazada reescreveria documentos antigos).
//   concluir -> { pedido_id, resultado: 'pronto'|'falhou', erro?, bancos? }
//               bancos = o que o consignado revelou ("Banco BMG (318)", ...),
//               gravado no pedido e mostrado na ficha do cliente
//   apagar   -> { pedido_id, caminho } remove UM arquivo do pedido em_andamento
//               (storage + linha) — manutenção de recoleta
//   enviar/concluir/apagar aceitam coletor_id OPCIONAL: se vier e o pedido estiver
//   com outro computador (assumido_por diferente), 409. Sem ele, como antes.
//   O caminho no bucket é ASCII (o Storage recusa acento); o título com acento
//   fica só em inss_documentos.titulo. Ver chaveSegura/tituloLimpo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'inss-docs';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-coletor-chave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// comparação de secret em tempo constante (não vaza tamanho/prefixo por timing)
function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// O título tem DOIS destinos com regras diferentes, por isso duas funções:
//  - tituloLimpo: o que a ficha mostra (coluna inss_documentos.titulo). Mantém
//    acento — "EXTRATO_COMPLETO_João_da_Conceição.pdf" é o que o atendente
//    reconhece. Só tira caractere de controle e normaliza para NFC (o Mac manda
//    nome de arquivo em NFD, letra + acento solto, que aparece torto na tela).
//  - chaveSegura: o caminho no bucket. O Storage só aceita chave ASCII
//    (isValidKey do storage-api); com 'ã' o upload volta "Invalid key" e o
//    reenvio falha igual para sempre, deixando o pedido preso em em_andamento.
function tituloLimpo(n: string): string {
  const so = n.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return (so || 'documento.pdf').slice(0, 200);
}

// limpeza antiga (até v2.5.0). Continua sendo a chave quando o resultado já é
// ASCII aceito pelo Storage: assim um título que SEMPRE funcionou cai no MESMO
// caminho de antes e o reenvio de um pedido já em andamento substitui o arquivo
// (upsert por caminho) em vez de duplicar a linha na ficha.
function chaveLegada(n: string): string {
  const so = n.replace(/[\\/:*?"<>|#%{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return (so || 'documento.pdf').slice(0, 120);
}

async function sha256Hex8(s: string): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(dig).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Só quando a limpeza precisou MEXER no nome (acento, ’, º, NBSP...) a chave
// ganha 8 hex do SHA-256 do título: "João.pdf" e "Joao.pdf" virariam a mesma
// chave ASCII e um sobrescreveria o outro pelo upsert — documento de um no lugar
// do outro, sem erro nenhum. O hash é do título já em NFC, então o mesmo nome
// vindo em NFD (Mac) ou NFC (Windows) cai na mesma chave e o reenvio substitui.
async function chaveSegura(titulo: string): Promise<string> {
  const legada = chaveLegada(titulo);
  if (/^[A-Za-z0-9_!.'() &$=@;+,-]+$/.test(legada)) return legada;
  const ascii = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .trim();
  // a extensão fica de fora do corte de tamanho: sem o .pdf o arquivo baixado
  // da ficha não abre com dois cliques
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(ascii);
  const ext = m ? m[0] : '.pdf';
  const base = (m ? ascii.slice(0, -ext.length) : ascii).replace(/[ ._]+$/, '') || 'documento';
  return `${base.slice(0, 100)}_${await sha256Hex8(titulo)}${ext}`;
}

// #83: só o assumir conferia QUEM é o coletor; enviar/concluir/apagar aceitavam
// qualquer um enquanto o pedido estivesse em_andamento. Cenário real: o painel A
// "devolve à fila" no meio da coleta, a extensão B assume, e A termina subindo
// PDFs por cima dos de B e concluindo 'pronto' com B ainda coletando. Agora,
// quando o chamador manda coletor_id e o pedido está com OUTRO (ou com ninguém,
// porque foi devolvido à fila), é 409. Sem coletor_id segue como antes: a
// extensão do Chrome antiga e o pacote portátil antigo não mandam, e exigir de
// cara faria TODO envio deles levar 409.
function coletorDoCorpo(corpo: Record<string, unknown> | null): string {
  return typeof corpo?.coletor_id === 'string' ? corpo.coletor_id.slice(0, 80) : '';
}
function outroComputador(assumidoPor: unknown): Response {
  const quem = assumidoPor ? ` (${assumidoPor})` : ' (foi devolvido à fila)';
  return json({ erro: `pedido está com outro computador${quem}` }, 409);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const chave = req.headers.get('x-coletor-chave') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'coletor-inss').maybeSingle();
    if (!wc?.secret || !seguroIgual(chave, wc.secret as string)) return json({ erro: 'não autorizado' }, 401);

    const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const acao = corpo?.acao;

    if (acao === 'fila') {
      const { data, error } = await admin
        .from('inss_pedidos')
        .select('id, organizacao_id, nome, cpf, documentos, status, criado_em, assumido_por')
        .in('status', ['aberto', 'em_andamento'])
        .order('criado_em', { ascending: true })
        .limit(50);
      if (error) return json({ erro: error.message }, 500);
      const mascarado = (data ?? []).map((r) => {
        const d = String(r.cpf || '').replace(/\D/g, '');
        return { ...r, cpf: d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : '' };
      });
      return json({ ok: true, pedidos: mascarado });
    }

    const pedidoId = typeof corpo?.pedido_id === 'string' ? corpo.pedido_id : '';
    if (!pedidoId) return json({ erro: 'pedido_id obrigatório' }, 400);
    const { data: p, error: eP } = await admin
      .from('inss_pedidos')
      .select('id, organizacao_id, contato_id, nome, cpf, documentos, status, criado_em, assumido_por')
      .eq('id', pedidoId)
      .maybeSingle();
    if (eP) return json({ erro: eP.message }, 500);
    if (!p) return json({ erro: 'pedido não existe' }, 404);

    if (acao === 'assumir') {
      const coletorId = typeof corpo?.coletor_id === 'string' ? corpo.coletor_id.slice(0, 80) : '';
      if (!coletorId) return json({ erro: 'coletor_id obrigatório' }, 400);
      const { data: upd, error } = await admin
        .from('inss_pedidos')
        .update({ status: 'em_andamento', assumido_por: coletorId })
        .eq('id', pedidoId)
        .eq('status', 'aberto')
        .select('id');
      if (error) return json({ erro: error.message }, 500);
      if (!upd?.length) {
        // retomar o PRÓPRIO pedido (Chrome fechou etc.) é ok; o de outro coletor, não
        const meu = p.status === 'em_andamento' && p.assumido_por === coletorId;
        if (!meu) {
          const quem = p.status === 'em_andamento' ? ` por outro computador (${p.assumido_por || '?'})` : '';
          return json({ erro: `pedido está '${p.status}'${quem}` }, 409);
        }
      }
      const { assumido_por: _ap, ...pedido } = p;
      return json({ ok: true, pedido: { ...pedido, status: 'em_andamento' } });
    }

    if (acao === 'reabrir') {
      const { data: upd, error } = await admin
        .from('inss_pedidos')
        .update({ status: 'aberto', assumido_por: null })
        .eq('id', pedidoId)
        .eq('status', 'em_andamento')
        .select('id');
      if (error) return json({ erro: error.message }, 500);
      if (!upd?.length && p.status !== 'aberto') return json({ erro: `pedido está '${p.status}'` }, 409);
      return json({ ok: true });
    }

    if (acao === 'enviar') {
      if (p.status !== 'em_andamento') return json({ erro: `pedido está '${p.status}' — assuma antes de enviar` }, 409);
      const coletorId = coletorDoCorpo(corpo);
      if (coletorId && p.assumido_por !== coletorId) return outroComputador(p.assumido_por);
      const titulo = tituloLimpo(String(corpo?.titulo ?? ''));
      const b64 = typeof corpo?.conteudo_base64 === 'string' ? corpo.conteudo_base64 : '';
      if (!b64) return json({ erro: 'conteudo_base64 obrigatório' }, 400);
      if (b64.length * 0.75 > MAX_PDF_BYTES) return json({ erro: 'arquivo acima de 25MB' }, 413);
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        return json({ erro: 'conteudo_base64 inválido' }, 400);
      }

      const caminho = `${p.organizacao_id}/${p.contato_id}/${p.id}/${await chaveSegura(titulo)}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (up.error) return json({ erro: up.error.message }, 500);

      const { error: eDoc } = await admin.from('inss_documentos').upsert(
        {
          organizacao_id: p.organizacao_id,
          pedido_id: p.id,
          contato_id: p.contato_id,
          titulo,
          caminho,
          tamanho_bytes: bytes.length,
        },
        { onConflict: 'caminho' },
      );
      if (eDoc) {
        // sem a linha o atendente nunca veria o arquivo: desfaz o upload
        await admin.storage.from(BUCKET).remove([caminho]);
        return json({ erro: eDoc.message }, 500);
      }
      return json({ ok: true, caminho });
    }

    if (acao === 'apagar') {
      if (p.status !== 'em_andamento') return json({ erro: `pedido está '${p.status}'` }, 409);
      const coletorId = coletorDoCorpo(corpo);
      if (coletorId && p.assumido_por !== coletorId) return outroComputador(p.assumido_por);
      const caminho = typeof corpo?.caminho === 'string' ? corpo.caminho : '';
      const prefixo = `${p.organizacao_id}/${p.contato_id}/${p.id}/`;
      if (!caminho.startsWith(prefixo)) return json({ erro: 'caminho não é deste pedido' }, 400);
      const rm = await admin.storage.from(BUCKET).remove([caminho]);
      if (rm.error) return json({ erro: rm.error.message }, 500);
      const { error: eDel } = await admin.from('inss_documentos').delete().eq('caminho', caminho);
      if (eDel) return json({ erro: eDel.message }, 500);
      return json({ ok: true });
    }

    if (acao === 'concluir') {
      const resultado = corpo?.resultado;
      if (resultado !== 'pronto' && resultado !== 'falhou') {
        return json({ erro: "resultado deve ser 'pronto' ou 'falhou'" }, 400);
      }
      const erro = resultado === 'falhou' && typeof corpo?.erro === 'string' ? corpo.erro.slice(0, 2000) : null;
      const bancos = Array.isArray(corpo?.bancos)
        ? (corpo.bancos as unknown[]).filter((b) => typeof b === 'string' && b.trim()).map((b) => String(b).slice(0, 120)).slice(0, 40)
        : null;
      const coletorId = coletorDoCorpo(corpo);
      // vale também para o pedido já concluído: se outro computador concluiu,
      // este não deve receber "ok" como se a entrega fosse dele
      if (coletorId && p.assumido_por !== coletorId) return outroComputador(p.assumido_por);
      // [] = "lido e sem contrato" — diferente de "não lido" (bancos ausente =
      // null no banco, a ficha não diz nada). Só o coletor 3.0+ (o que manda
      // coletor_id no concluir) distingue os dois; o 2.5 manda [] também quando
      // NÃO leu, e isso não pode virar "nenhum contrato" na ficha.
      const gravaBancos = bancos !== null && (bancos.length > 0 || !!coletorId);
      let q = admin
        .from('inss_pedidos')
        .update({ status: resultado, erro, ...(gravaBancos ? { bancos } : {}) })
        .eq('id', pedidoId)
        .in('status', ['aberto', 'em_andamento']);
      // o filtro no próprio UPDATE fecha a janela entre o SELECT lá de cima e
      // aqui: se alguém reabriu/assumiu nesse meio-tempo, nada é atualizado
      if (coletorId) q = q.eq('assumido_por', coletorId);
      const { data: upd, error } = await q.select('id');
      if (error) return json({ erro: error.message }, 500);
      if (!upd?.length) {
        if (coletorId) {
          // a corrida perdida: relê para dizer a verdade em vez de um 'ok' falso
          const { data: agora } = await admin.from('inss_pedidos').select('status, assumido_por').eq('id', pedidoId).maybeSingle();
          if (!agora) return json({ erro: 'pedido não existe' }, 404);
          if (agora.assumido_por !== coletorId) return outroComputador(agora.assumido_por);
          if (agora.status !== resultado) return json({ erro: `pedido está '${agora.status}'` }, 409);
        } else if (p.status !== resultado) {
          return json({ erro: `pedido está '${p.status}'` }, 409);
        }
      }
      return json({ ok: true });
    }

    return json({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
