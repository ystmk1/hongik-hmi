// Local preview. Assembles pages on every request, so edits show up on reload.
// Same URL rules as vercel.json. No dependencies.
// Usage: npm run dev   (or: node scripts/dev-server.mjs 5173)
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {FOLDERS, GENERATED, ROOT, SERVED} from './build.mjs';

const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'};

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

async function resolve(path) {
  const rewrite = config.rewrites.find(r => r.source === path);
  if (rewrite) path = rewrite.destination;
  if (path === '/') path = '/index.html';
  for (const candidate of [path, path + '.html']) {
    if (GENERATED[candidate]) return {path: candidate, data: await GENERATED[candidate]()};
    if (SERVED[candidate]) return {path: candidate, data: await readFile(join(ROOT, SERVED[candidate]))};
  }
  for (const [prefix, folder] of Object.entries(FOLDERS)) {
    if (!path.startsWith(prefix)) continue;
    const base = join(ROOT, folder), file = normalize(join(base, path.slice(prefix.length)));
    if (file.startsWith(base) && await isFile(file)) return {path, data: await readFile(file)};
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const found = await resolve(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!found) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('404'); return; }
    res.writeHead(200, {'Content-Type': TYPES[extname(found.path)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(found.data);
  } catch (e) {
    res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'}).end(String(e));
  }
}).listen(PORT, () => console.log(`HMI UI demo: http://localhost:${PORT}/`));
