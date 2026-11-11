// Kill-switch dos SW LEGADOS da Reviza. O SW de verdade agora é /sw-r3.js.
// O build.sh copia este arquivo pra dist/sw.js E dist/sw-r2.js — ambos ficaram
// presos no edge-cache do Cloudflare (sw.js em 11/09, sw-r2.js em 17/09), servindo
// versão velha. Máquina presa tem o workbox velho registrado numa dessas URLs e
// serve TUDO do precache — nunca busca o index novo. Pela spec, 404 aqui NÃO
// desregistra (w3c/ServiceWorker#204, fechado em 2017): o único resgate garantido
// é publicar OUTRO SW nesta MESMA URL — byte-diff → instala → limpa caches, se
// auto-remove e recarrega as abas, que carregam o index novo e registram o sw-r3.js.
// NUNCA remover; NUNCA deixar essas URLs em 404.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) { /* segue */ }
    try { await self.registration.unregister(); } catch (_) { /* segue */ }
    const abas = await self.clients.matchAll({ type: 'window' });
    for (const aba of abas) { try { aba.navigate(aba.url); } catch (_) { /* segue */ } }
  })());
});
