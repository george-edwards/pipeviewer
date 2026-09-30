import http from 'node:http';
import { readFile } from 'node:fs/promises';
const args = process.argv.slice(2);
const port = Number(process.env.PORT || args[args.indexOf('--port') + 1]) || 5173;
const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/parser.js': 'parser.js' };
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
http.createServer(async (req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${types[file.split('.').pop()]}; charset=utf-8` });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to read file'); }
}).listen(port, '0.0.0.0', () => console.log(`Pipeviewer running at http://localhost:${port}`));
