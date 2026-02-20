const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
const SERVER_MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const SERVER_MINIMAX_API_BASE = process.env.MINIMAX_API_BASE || '';
let cachedIndexHtml = null;

try {
  cachedIndexHtml = fs.readFileSync(INDEX_PATH);
} catch (err) {
  // Keep startup resilient for health checks; fallback response is handled below.
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 25 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function postJson(urlString, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data || '{}');
          } catch (err) {
            // Keep raw payload for debugging-style error messages.
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            data: parsed,
            raw: data,
          });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractImageDataUrl(responseJson) {
  const data = responseJson?.data;
  if (!data) return null;

  if (Array.isArray(data.image_base64) && data.image_base64.length > 0) {
    return `data:image/png;base64,${data.image_base64[0]}`;
  }

  if (typeof data.image_base64 === 'string' && data.image_base64.length > 0) {
    return `data:image/png;base64,${data.image_base64}`;
  }

  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/') {
    if (cachedIndexHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(cachedIndexHtml);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        app: 'professional-avatar-creator',
        serverKeyConfigured: Boolean(SERVER_MINIMAX_API_KEY),
      })
    );
    return;
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    readJsonBody(req)
      .then(async (body) => {
        const { apiKey, apiBase, prompt, imageReference } = body;
        const effectiveApiKey = SERVER_MINIMAX_API_KEY || apiKey;
        const effectiveApiBase = SERVER_MINIMAX_API_BASE || apiBase;

        if (!effectiveApiKey || !effectiveApiBase || !prompt || !imageReference) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              error:
                'Missing required fields. Provide prompt/image reference, plus API base and key (or set MINIMAX_API_KEY/MINIMAX_API_BASE on server).',
            })
          );
          return;
        }

        const endpoint = `${effectiveApiBase.replace(/\/$/, '')}/image_generation`;
        const upstream = await postJson(
          endpoint,
          {
            model: 'image-01',
            prompt,
            aspect_ratio: '1:1',
            response_format: 'base64',
            subject_reference: [
              {
                type: 'character',
                image_file: imageReference,
              },
            ],
          },
          {
            Authorization: `Bearer ${effectiveApiKey}`,
          }
        );

        if (!upstream.ok) {
          const msg =
            upstream.data?.base_resp?.status_msg ||
            upstream.data?.message ||
            upstream.raw ||
            `Upstream error ${upstream.statusCode}`;
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: msg }));
          return;
        }

        const imageDataUrl = extractImageDataUrl(upstream.data);
        if (!imageDataUrl) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'MiniMax response missing image_base64 output' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ imageDataUrl }));
      })
      .catch((err) => {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
      });
    return;
  }

  const requestedPath = url.pathname.replace(/^\/+/, '');
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.resolve(PUBLIC_DIR, normalizedPath);

  if (!(filePath === PUBLIC_DIR || filePath.startsWith(`${PUBLIC_DIR}${path.sep}`))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Professional Avatar Creator running at http://${HOST}:${PORT}`);
});
