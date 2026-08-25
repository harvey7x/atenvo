// Presence ("digitando…") pela Evolution — espelho do maturacao-*/evolution.ts (duplicação
// deliberada: Edge Functions não compartilham módulo sem acoplar deploys; padrão da casa).
// Presence é COSMÉTICO: qualquer falha é engolida — nunca atrasa nem derruba um envio.

const base = () => (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const key = () => Deno.env.get('EVOLUTION_API_KEY') ?? '';

export async function sendPresenceComposing(instancia: string, numero: string, delayMs: number): Promise<void> {
  if (!base() || !key() || !instancia || !numero) return;
  try {
    await fetch(`${base()}/chat/sendPresence/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key() },
      body: JSON.stringify({ number: numero, presence: 'composing', delay: delayMs }),
    });
  } catch { /* cosmético */ }
}
