// meta-webhook — webhook do Facebook Messenger. PÚBLICO (verify_jwt=false).
// ETAPA 1 (fundação): apenas verificação GET e validação de assinatura POST.
// NÃO persiste mensagens ainda — isso fica para a próxima etapa.
// Segurança: nunca registra verify_token, App Secret ou payload em logs.

/** Comparação de tempo constante (evita timing attacks). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** HMAC-SHA256(body) com o App Secret, em hex (formato do X-Hub-Signature-256 da Meta). */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---------- GET: verificação do webhook (Meta) ----------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    const expected = Deno.env.get('META_VERIFY_TOKEN') ?? '';

    // só aceita subscribe + token configurado + igual (sem logar o token)
    if (mode === 'subscribe' && expected.length > 0 && token.length > 0 && safeEqual(token, expected)) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ---------- POST: eventos (apenas valida assinatura nesta etapa) ----------
  if (req.method === 'POST') {
    const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
    const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
    const raw = await req.text(); // corpo BRUTO — necessário para conferir a assinatura

    // sem App Secret configurado, nenhum evento é considerado válido
    if (appSecret.length === 0 || !sigHeader.startsWith('sha256=')) {
      return new Response('Invalid signature', { status: 403 });
    }
    const expectedSig = 'sha256=' + await hmacSha256Hex(appSecret, raw);
    if (!safeEqual(sigHeader, expectedSig)) {
      return new Response('Invalid signature', { status: 403 });
    }

    // Assinatura válida. Responder rápido (a Meta exige 200 em poucos segundos).
    // O processamento/persistência de mensagens será adicionado na próxima etapa.
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});
