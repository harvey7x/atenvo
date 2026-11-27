/* Prévia de design: NADA sai pra rede. fetch/XHR/WebSocket/EventSource/sendBeacon só aceitam
   data: e blob: (mídia embutida no próprio arquivo); qualquer outra URL é recusada aqui. */
const local = (u: string) => /^(data|blob):/i.test(u);

export function bloquearRede(): void {
  if (typeof window === 'undefined') return;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (local(url)) return fetchOriginal(entrada, init);
    console.warn('[prévia] rede bloqueada:', url);
    return Promise.reject(new TypeError('Prévia offline: rede bloqueada'));
  };
  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metodo: string, url: string | URL, ...resto: unknown[]) {
    if (!local(String(url))) throw new Error('Prévia offline: rede bloqueada');
    return (abrir as (...a: unknown[]) => void).call(this, metodo, url, ...resto);
  } as typeof XMLHttpRequest.prototype.open;
  window.WebSocket = class { constructor() { throw new Error('Prévia offline: rede bloqueada'); } } as unknown as typeof WebSocket;
  window.EventSource = class { constructor() { throw new Error('Prévia offline: rede bloqueada'); } } as unknown as typeof EventSource;
  if (navigator.sendBeacon) navigator.sendBeacon = () => false;
}
