// Local read-only preview when no development PostgreSQL database is configured.
// No cookies, credentials, or writes are ever forwarded to the public service.
import http from 'node:http';
import net from 'node:net';
const publicOrigin = 'https://hackathon.skystate.ch';
const localOrigin = 'http://127.0.0.1:3000';
const port = Number(process.env.PREVIEW_PORT ?? 3100);
const publicPaths = new Set(['/api/overview', '/api/options', '/api/suggestions', '/api/results']);
const server = http
  .createServer(async (req, res) => {
    const url = new URL(req.url, localOrigin);
    try {
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(
            JSON.stringify({
              error: 'This preview is read-only. Sign-in and changes are disabled.',
            }),
          );
        }
        if (url.pathname === '/api/account' || url.pathname === '/api/preferences') {
          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify(
              url.pathname === '/api/account'
                ? { account: null }
                : { districtIds: [], categoryIds: [], configured: false },
            ),
          );
        }
        if (
          !publicPaths.has(url.pathname) &&
          !/^\/api\/suggestions\/[a-f0-9-]+\/image$/.test(url.pathname)
        ) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'This preview only exposes public browsing.' }));
        }
        const result = await fetch(publicOrigin + url.pathname + url.search, {
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        });
        res.writeHead(result.status, {
          'Content-Type': result.headers.get('content-type') ?? 'application/json',
        });
        return res.end(Buffer.from(await result.arrayBuffer()));
      }
      const upstream = http.request(
        localOrigin + req.url,
        { method: req.method, headers: { ...req.headers, host: '127.0.0.1:3000' } },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end('Start the Next.js development server on port 3000 first.');
      });
      req.pipe(upstream);
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'The public site could not be reached. Please try again.' }));
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Read-only preview: http://127.0.0.1:${port}`));

// Forward only the local Next.js hot-reload socket; no public websocket access.
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/_next/')) return socket.destroy();
  const upstream = net.connect(3000, '127.0.0.1', () => {
    const headers = Object.entries({ ...req.headers, host: '127.0.0.1:3000' })
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});
