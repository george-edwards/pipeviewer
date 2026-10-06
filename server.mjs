import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
const args = process.argv.slice(2);
const port = Number(process.env.PORT || args[args.indexOf('--port') + 1]) || 5173;
const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/toolbox.html': 'toolbox.html', '/favicon.svg': 'favicon.svg', '/apple-touch-icon.png': 'apple-touch-icon.png', ...Object.fromEntries(['app.js', 'parser.js', 'usage.js', 'training.js', 'lessons.js', 'intro.js', 'reference.js', 'sandbox.js', 'cases.js', 'toolbox.js', 'why.js', 'whyscenes.js', 'tape.js', 'welcome.js'].map(file => [`/${file}`, file])) };
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webm: 'video/webm', mp4: 'video/mp4' };
// Videos are streamed with byte ranges so the player can seek without loading the whole file.
async function sendVideo(req, res, name) {
  const url = new URL(`video/${name}`, import.meta.url);
  const { size } = await stat(url);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  const headers = { 'Content-Type': types[name.split('.').pop()], 'Accept-Ranges': 'bytes' };
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(url).pipe(res);
    return;
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  createReadStream(url, { start, end }).pipe(res);
}
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const video = /^\/video\/([\w.-]+\.(?:webm|mp4))$/.exec(pathname);
  if (video) {
    try { await sendVideo(req, res, video[1]); } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  const file = files[pathname] ?? /^\/(commands\/[\w-]+\.js)$/.exec(pathname)?.[1];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[file.split('.').pop()] });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to read file'); }
}).listen(port, '0.0.0.0', () => console.log(`Pipeviewer running at http://localhost:${port}`));
