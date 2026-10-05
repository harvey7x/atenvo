// coletor-inss — ponte entre o coletor local (o Mac do escritório) e o Atenvo.
//
// O coletor NÃO tem chave do banco: ele chama esta função com o header
// x-coletor-chave, comparado com webhook_config.secret (chave='coletor-inss'),
// mesmo padrão do mensagens-agendadas-processar. Deploy --no-verify-jwt.
//
// Ações (POST JSON { acao, ... }):
//   fila     -> pedidos aberto/em_andamento, mais antigo primeiro
//   assumir  -> { pedido_id } aberto -> em_andamento (quem vai atender)
//   reabrir  -> { pedido_id } em_andamento -> aberto (desistiu, volta pra fila)
//   enviar   -> { pedido_id, titulo, conteudo_base64 } grava o PDF no bucket
//               inss-docs e registra em inss_documentos (repetir substitui)
//   concluir -> { pedido_id, resultado: 'pronto'|'falhou', erro? }
//   apagar   -> { pedido_id, caminho } remove UM arquivo do pedido (storage +
//               linha) — manutenção de recoleta; o caminho tem que ser do pedido
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

// o título vira parte do caminho no storage: sem separadores nem caracteres de caminho
function nomeArquivoSeguro(n: string): string {
  const so = n.replace(/[\\/:*?"<>|#%{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return (so || 'documento.pdf').slice(0, 120);
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
        .select('id, organizacao_id, nome, cpf, documentos, status, criado_em')
        .in('status', ['aberto', 'em_andamento'])
        .order('criado_em', { ascending: true })
        .limit(50);
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, pedidos: data ?? [] });
    }

    const pedidoId = typeof corpo?.pedido_id === 'string' ? corpo.pedido_id : '';
    if (!pedidoId) return json({ erro: 'pedido_id obrigatório' }, 400);
    const { data: p, error: eP } = await admin
      .from('inss_pedidos')
      .select('id, organizacao_id, contato_id, status')
      .eq('id', pedidoId)
      .maybeSingle();
    if (eP) return json({ erro: eP.message }, 500);
    if (!p) return json({ erro: 'pedido não existe' }, 404);

    if (acao === 'assumir' || acao === 'reabrir') {
      const de = acao === 'assumir' ? 'aberto' : 'em_andamento';
      const para = acao === 'assumir' ? 'em_andamento' : 'aberto';
      const { data: upd, error } = await admin
        .from('inss_pedidos')
        .update({ status: para })
        .eq('id', pedidoId)
        .eq('status', de)
        .select('id');
      if (error) return json({ erro: error.message }, 500);
      // já estava no destino (reenvio) não é erro; qualquer outro estado é conflito
      if (!upd?.length && p.status !== para) return json({ erro: `pedido está '${p.status}'` }, 409);
      return json({ ok: true });
    }

    if (acao === 'enviar') {
      if (p.status === 'cancelado') return json({ erro: 'pedido cancelado' }, 409);
      const titulo = nomeArquivoSeguro(String(corpo?.titulo ?? ''));
      const b64 = typeof corpo?.conteudo_base64 === 'string' ? corpo.conteudo_base64 : '';
      if (!b64) return json({ erro: 'conteudo_base64 obrigatório' }, 400);
      if (b64.length * 0.75 > MAX_PDF_BYTES) return json({ erro: 'arquivo acima de 25MB' }, 413);
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        return json({ erro: 'conteudo_base64 inválido' }, 400);
      }

      const caminho = `${p.organizacao_id}/${p.contato_id}/${p.id}/${titulo}`;
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
      const { data: upd, error } = await admin
        .from('inss_pedidos')
        .update({ status: resultado, erro })
        .eq('id', pedidoId)
        .in('status', ['aberto', 'em_andamento'])
        .select('id');
      if (error) return json({ erro: error.message }, 500);
      if (!upd?.length && p.status !== resultado) return json({ erro: `pedido está '${p.status}'` }, 409);
      return json({ ok: true });
    }

    return json({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
