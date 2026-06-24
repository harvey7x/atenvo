// meta-webhook — webhook do Facebook Messenger. PÚBLICO (verify_jwt=false).
// ETAPA 1 (fundação): verificação GET + validação de assinatura POST. Sem persistir.
// Segurança: nunca registra verify_token, App Secret nem payload.

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
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---------- GET: verificação do webhook (Meta) ----------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const expected = (Deno.env.get('META_VERIFY_TOKEN') ?? '').trim();
    const received = (url.searchParams.get('hub.verify_token') ?? '').trim();
    const challenge = url.searchParams.get('hub.challenge') ?? '';

    if (mode === 'subscribe' && expected.length > 0 && received.length > 0 && safeEqual(received, expected)) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // ---------- POST: eventos (apenas valida assinatura nesta etapa) ----------
  if (req.method === 'POST') {
    const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
    const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
    const raw = await req.text(); // corpo BRUTO — necessário para conferir a assinatura

    if (appSecret.length === 0 || !sigHeader.startsWith('sha256=')) {
      return new Response('Invalid signature', { status: 403 });
    }
    const expectedSig = 'sha256=' + await hmacSha256Hex(appSecret, raw);
    if (!safeEqual(sigHeader, expectedSig)) {
      return new Response('Invalid signature', { status: 403 });
    }
    // Assinatura válida. Persistência de mensagens será adicionada na próxima etapa.
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});
