import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const indexPath = path.join(rootDir, 'index.html');
const port = Number(process.env.PORT || 3000);

let clients = new Set();
let version = 0;

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function broadcastReload() {
  version += 1;
  const payload = `event: reload\ndata: ${version}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function injectLiveReload(html) {
  const snippet = `
<script>
(function () {
  var es = new EventSource('/__livereload');
  es.addEventListener('reload', function () {
    window.location.reload();
  });
  es.onerror = function () {
    es.close();
  };
})();
</script>`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}

function serveFile(res, filePath, isHtml = false) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const body = isHtml ? injectLiveReload(data) : data;
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  let filePath = path.join(rootDir, pathname === '/' ? 'index.html' : pathname.slice(1));

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (pathname === '/' || pathname === '/index.html') {
        serveFile(res, indexPath, true);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    serveFile(res, filePath, pathname === '/' || pathname === '/index.html');
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Live preview running at http://127.0.0.1:${port}`);
});

fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (filename.startsWith('.git')) return;
  if (filename === 'package.json' || filename === 'server.js' || filename.endsWith('.html') || filename.endsWith('.css') || filename.endsWith('.js')) {
    broadcastReload();
  }
});
