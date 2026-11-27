// Reviza Cobranças — servidor estático mínimo (Node stdlib, sem dependências).
// Serve dist/ e faz fallback para index.html (SPA com react-router BrowserRouter).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'dist'), PORT = process.env.PORT || 80;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const SEM_CACHE = 'no-cache, no-store, must-revalidate';
http.createServer((req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
    const temExt = path.extname(f) !== '';
    if (!temExt) f = path.join(ROOT, 'index.html'); // fallback SPA (rotas do react-router)
    else if (!fs.existsSync(f)) {
      // Arquivo com extensão que não existe = 404 DE VERDADE (não index.html):
      // chunk velho em 404 aciona o vite:preloadError do app e recarrega a página.
      // (404 NÃO desregistra SW — w3c/ServiceWorker#204; o resgate do /sw.js legado
      // é o kill-switch que o build.sh copia pra dist/sw.js. NUNCA deixar 404 lá.)
      res.writeHead(404, { 'Cache-Control': SEM_CACHE }); return res.end('404');
    }
    const ext = path.extname(f).toLowerCase();
    const rel = f.slice(ROOT.length).split(path.sep).join('/');
    // Cache: SÓ /assets/* é hasheado → pode ser imutável. TODO o resto é no-store:
    // o squareweb.app fica atrás do Cloudflare, que OBEDECE estes headers — sw.js
    // velho preso no edge = app instalado preso numa versão antiga (bug real de
    // 11/09: cf-cache-status HIT com age de 26h; o pessoal não recebia deploy).
    // ATENÇÃO: o server antigo mandou immutable de 1 ano pra TUDO, então o edge
    // ainda guarda favicon.svg/icons/*/opus/* velhos por até 1 ano e não dá pra
    // purgar (domínio da Square) — mudar um desses arquivos = RENOMEAR o arquivo.
    const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : SEM_CACHE;
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(500); return res.end('500'); }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
      res.end(b);
    });
  } catch (_) { res.writeHead(500); res.end('500'); }
}).listen(PORT, '0.0.0.0', () => console.log('Reviza Cobranças :' + PORT));
