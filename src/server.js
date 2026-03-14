const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');
const chokidar = require('chokidar');
const compression = require('compression');
const mime = require('mime-types');
const os = require('node:os');
const chalk = require('chalk');
const { WebSocketServer } = require('ws');

const BASE_WATCH_IGNORES = ['**/.git/**', '**/node_modules/**'];

function toGlobPath(value) {
  return value.replace(/\\/g, '/');
}

function getDefaultWatchIgnores() {
  const home = toGlobPath(os.homedir());
  return [
    ...BASE_WATCH_IGNORES,
    `${home}/.cache/**`,
    `${home}/.local/share/**`,
  ];
}

const LIVE_RELOAD_SNIPPET = `\n<script>\n(function(){\n  if(!('WebSocket' in window)) return;\n  function refreshCSS(){\n    var links=[].slice.call(document.querySelectorAll('link[rel="stylesheet"],link:not([rel])'));\n    links.forEach(function(link){\n      var href=link.getAttribute('href');\n      if(!href) return;\n      var u=href.replace(/([?&])_srv=\\d+/,'').replace(/[?&]$/,'');\n      var join=u.indexOf('?')>-1?'&':'?';\n      link.setAttribute('href',u+join+'_srv='+Date.now());\n    });\n  }\n  var proto=location.protocol==='https:'?'wss':'ws';\n  var socket=new WebSocket(proto+'://'+location.host+'/__srv_ws');\n  socket.onmessage=function(event){\n    if(event.data==='refreshcss') refreshCSS();\n    if(event.data==='reload') location.reload();\n  };\n})();\n</script>\n`;

const STYLE_PRESETS = {
  midnight: {
    accent: '#3b82f6',
    borderStrong: '#78716c',
  },
  paper: {
    accent: '#f59e0b',
    borderStrong: '#a8a29e',
  },
  neon: {
    accent: '#22c55e',
    borderStrong: '#a8a29e',
  },
};

function getNetworkAddress() {
  const interfaces = os.networkInterfaces();
  for (const networkInterface of Object.values(interfaces)) {
    if (!networkInterface) {
      continue;
    }
    for (const details of networkInterface) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return undefined;
}

function toSafePathname(urlValue) {
  try {
    return decodeURIComponent(new URL(urlValue, 'http://srv.local').pathname);
  } catch (_error) {
    return '/';
  }
}

function resolvePath(root, pathnameValue) {
  const cleaned = pathnameValue.replace(/\\0/g, '');
  const absolute = path.resolve(root, `.${cleaned}`);
  if (!absolute.startsWith(root)) {
    return null;
  }
  return absolute;
}

function injectReload(html) {
  const candidates = ['</body>', '</head>', '</svg>'];
  for (const tag of candidates) {
    const index = html.toLowerCase().lastIndexOf(tag);
    if (index !== -1) {
      return html.slice(0, index) + LIVE_RELOAD_SNIPPET + html.slice(index);
    }
  }
  return html + LIVE_RELOAD_SNIPPET;
}

function renderDirListing({ pathnameValue, entries, style, customCss }) {
  const palette = STYLE_PRESETS[style] || STYLE_PRESETS.midnight;
  const base = pathnameValue.endsWith('/') ? pathnameValue : `${pathnameValue}/`;

  const list = entries
    .map((entry) => {
      const suffix = entry.isDirectory() ? '/' : '';
      const href = encodeURIComponent(entry.name).replace(/%2F/g, '/') + suffix;
      return `<li><a href="${href}"><span class="name">${entry.name}${suffix}</span><span class="type">${entry.isDirectory() ? 'dir' : 'file'}</span></a></li>`;
    })
    .join('');

  const up = pathnameValue !== '/' ? '<a class="up" href="..">Go up</a>' : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Index of ${pathnameValue}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" zoomAndPan="magnify" viewBox="0 0 810 809.999993" height="1080" preserveAspectRatio="xMidYMid meet" version="1.0"><defs><clipPath id="6d45cc4b35"><path d="M 405 0 C 181.324219 0 0 181.324219 0 405 C 0 628.675781 181.324219 810 405 810 C 628.675781 810 810 628.675781 810 405 C 810 181.324219 628.675781 0 405 0 Z M 405 0 " clip-rule="nonzero"/></clipPath><clipPath id="8ebe5bb7c0"><path d="M 0 0 L 810 0 L 810 810 L 0 810 Z M 0 0 " clip-rule="nonzero"/></clipPath><clipPath id="10f4dc80d2"><path d="M 405 0 C 181.324219 0 0 181.324219 0 405 C 0 628.675781 181.324219 810 405 810 C 628.675781 810 810 628.675781 810 405 C 810 181.324219 628.675781 0 405 0 Z M 405 0 " clip-rule="nonzero"/></clipPath><clipPath id="538173821f"><rect x="0" width="810" y="0" height="810"/></clipPath></defs><g clip-path="url(#6d45cc4b35)"><g transform="matrix(1, 0, 0, 1, 0, 0.000000000000039746)"><g clip-path="url(#538173821f)"><g clip-path="url(#8ebe5bb7c0)"><g clip-path="url(#10f4dc80d2)"><rect x="-178.2" width="1166.4" fill="#ffffff" height="1166.39999" y="-178.199998" fill-opacity="1"/></g></g></g></g></g><path fill="#000000" d="M 198.976562 612.375 C 180.839844 612.375 165.28125 605.882812 152.300781 592.898438 C 139.316406 579.917969 132.828125 564.359375 132.828125 546.222656 L 132.828125 263.777344 C 132.828125 245.328125 139.316406 229.6875 152.300781 216.863281 C 165.28125 204.039062 180.839844 197.625 198.976562 197.625 L 334.476562 197.625 L 405 268.152344 L 611.023438 268.152344 C 629.472656 268.152344 645.109375 274.5625 657.9375 287.386719 C 670.761719 300.214844 677.171875 315.851562 677.171875 334.300781 L 677.171875 546.222656 C 677.171875 564.359375 670.761719 579.917969 657.9375 592.898438 C 645.109375 605.882812 629.472656 612.375 611.023438 612.375 Z M 198.976562 546.222656 L 611.023438 546.222656 L 611.023438 334.300781 L 377.5 334.300781 L 306.976562 263.777344 L 198.976562 263.777344 Z M 198.976562 546.222656 L 198.976562 263.777344 Z M 198.976562 546.222656 " fill-opacity="1" fill-rule="nonzero"/></svg>">
  <style>
    :root {
      --stone-050: #fafaf9;
      --stone-100: #f5f5f4;
      --stone-200: #e7e5e4;
      --stone-300: #d6d3d1;
      --stone-400: #a8a29e;
      --stone-500: #78716c;
      --stone-600: #57534e;
      --stone-700: #44403c;
      --stone-800: #292524;
      --stone-900: #1c1917;
      --stone-950: #0c0a09;

      --bg: var(--stone-950);
      --bg-raised: var(--stone-900);
      --bg-surface: var(--stone-800);
      --border: var(--stone-800);
      --border-strong: ${palette.borderStrong};
      --text: var(--stone-200);
      --text-muted: var(--stone-400);
      --text-faint: var(--stone-500);
      --text-bright: var(--stone-100);
      --accent: ${palette.accent};
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", "Roboto Mono", "Cascadia Code", monospace;
      --line-height: 1.6;
      --line-height-tight: 1.2;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      border-radius: 0 !important;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: var(--line-height);
      min-height: 100vh;
      padding: 2rem;
    }

    main {
      display: block;
      max-width: 900px;
      margin: 0 auto;
      padding: 1rem;
      background-color: var(--bg-raised);
      border: 1px solid var(--border);
    }

    h1 {
      margin-bottom: 0.25rem;
      color: var(--text-bright);
      font-family: var(--font-mono);
      font-size: 1.1rem;
      line-height: var(--line-height-tight);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .path {
      margin-bottom: 0.75rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 0.9rem;
    }

    .up {
      display: inline-block;
      margin-bottom: 0.75rem;
      color: var(--accent);
      text-decoration: none;
      border: 1px solid var(--border-strong);
      padding: 0.3rem 0.55rem;
      font-family: var(--font-mono);
      transition: background-color 0.18s ease, color 0.18s ease;
    }

    .up:hover {
      background-color: var(--accent);
      color: var(--bg);
    }

    ul {
      list-style: none;
      border: 1px solid var(--border);
    }

    li a {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 0.65rem 0.75rem;
      text-decoration: none;
      color: var(--text);
      border-bottom: 1px solid var(--border);
      font-family: var(--font-mono);
      transition: background-color 0.18s ease, color 0.18s ease;
    }

    li:last-child a {
      border-bottom: 0;
    }

    li a:hover {
      background-color: var(--bg-surface);
      color: var(--text-bright);
    }

    .name {
      max-width: 80%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type {
      color: var(--text-faint);
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.07em;
    }

    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }

      main {
        padding: 0.8rem;
      }

      li a {
        padding: 0.55rem 0.6rem;
      }
    }

    ${customCss || ''}
  </style>
</head>
<body>
  <main>
    <h1>srv-it</h1>
    <div class="path">Index of ${base}</div>
    ${up}
    <ul>${list}</ul>
  </main>
</body>
</html>`;
}

function getCompressionMiddleware() {
  const middleware = compression();
  return (req, res) =>
    new Promise((resolve, reject) => {
      middleware(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
}

async function createSrvServer(options) {
  const root = path.resolve(options.root);
  const compress = getCompressionMiddleware();
  const clients = new Set();

  let customCss = '';
  if (options.styleCss) {
    customCss = await fsp.readFile(path.resolve(options.styleCss), 'utf8');
  }

  const requestHandler = async (req, res) => {
    const start = Date.now();
    const method = req.method || 'GET';
    const pathnameValue = toSafePathname(req.url || '/');

    try {
      if (options.cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      await compress(req, res);

      let filePath = resolvePath(root, pathnameValue);
      if (!filePath) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = await fsp.stat(filePath);
      } catch (error) {
        if (options.single) {
          filePath = path.join(root, 'index.html');
          stat = await fsp.stat(filePath);
        } else {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
      }

      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        try {
          const indexStat = await fsp.stat(indexPath);
          if (indexStat.isFile()) {
            filePath = indexPath;
            stat = indexStat;
          }
        } catch (_error) {
          if (!options.directoryListing) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }

          const entries = await fsp.readdir(filePath, { withFileTypes: true });
          entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });

          const html = renderDirListing({
            pathnameValue,
            entries,
            style: options.style,
            customCss,
          });
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.statusCode = 200;
          res.end(injectReload(html));
          return;
        }
      }

      if (!stat.isFile()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mime.contentType(ext) || 'application/octet-stream';
      res.setHeader('content-type', contentType);
      res.setHeader('cache-control', 'no-cache');

      if (['.html', '.htm', '.xhtml', '.php', '.svg'].includes(ext)) {
        const raw = await fsp.readFile(filePath, 'utf8');
        const html = injectReload(raw);
        res.statusCode = 200;
        res.end(html);
        return;
      }

      res.statusCode = 200;
      await pipeline(fs.createReadStream(filePath), res);
    } catch (error) {
      res.statusCode = 500;
      res.end('Internal server error');
      if (options.logLevel >= 1) {
        console.error('[srv] request error:', error.message);
      }
    } finally {
      if (!options.noRequestLogging) {
        const statusCode = res.statusCode;
        const elapsed = Date.now() - start;
        const sourceIp = (req.socket.remoteAddress || '-').replace('::ffff:', '');
        const now = new Date();
        const formattedTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        const methodColor = method === 'GET' ? 'cyan' : 'magenta';

        console.log(
          chalk.dim(formattedTime),
          chalk.yellow(sourceIp),
          chalk[methodColor](`${method} ${pathnameValue}`),
          chalk[statusCode < 400 ? 'green' : 'red'](`-> ${statusCode} (${elapsed}ms)`),
        );
      }
    }
  };

  const useSsl = options.sslCert && options.sslKey;
  let server;

  if (useSsl) {
    const cert = await fsp.readFile(path.resolve(options.sslCert));
    const key = await fsp.readFile(path.resolve(options.sslKey));
    const passphrase = options.sslPass
      ? await fsp.readFile(path.resolve(options.sslPass), 'utf8')
      : undefined;
    server = https.createServer({ cert, key, passphrase }, (req, res) => {
      requestHandler(req, res).catch((error) => {
        res.statusCode = 500;
        res.end('Internal server error');
        if (options.logLevel >= 1) {
          console.error('[srv] handler error:', error.message);
        }
      });
    });
  } else {
    server = http.createServer((req, res) => {
      requestHandler(req, res).catch((error) => {
        res.statusCode = 500;
        res.end('Internal server error');
        if (options.logLevel >= 1) {
          console.error('[srv] handler error:', error.message);
        }
      });
    });
  }

  const wss = new WebSocketServer({ server, path: '/__srv_ws' });
  wss.on('connection', (socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
  });

  const watchPaths = [root, ...(options.watch || []).map((x) => path.resolve(x))];
  const ignore = [...getDefaultWatchIgnores(), ...((options.ignore || []).filter(Boolean))];
  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    ignored: Array.from(new Set(ignore)),
    ignorePermissionErrors: true,
  });

  let liveReloadEnabled = true;
  let watcherClosed = false;

  const closeWatcher = async () => {
    if (watcherClosed) {
      return;
    }
    watcherClosed = true;
    await watcher.close();
  };

  const sendReload = (changePath) => {
    if (!liveReloadEnabled) {
      return;
    }

    const isCss = path.extname(changePath).toLowerCase() === '.css' && !options.noCssInject;
    const message = isCss ? 'refreshcss' : 'reload';
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
    if (options.logLevel >= 2) {
      console.log(`[srv] ${isCss ? 'css refresh' : 'reload'}: ${changePath}`);
    }
  };

  watcher.on('change', sendReload);
  watcher.on('add', sendReload);
  watcher.on('unlink', sendReload);
  watcher.on('addDir', sendReload);
  watcher.on('unlinkDir', sendReload);
  watcher.on('error', async (error) => {
    if (error && error.code === 'ENOSPC') {
      liveReloadEnabled = false;
      await closeWatcher();
      console.error('[srv] live reload disabled: file watcher limit reached (ENOSPC).');
      console.error('[srv] use --ignore to exclude noisy paths, or raise inotify limits on Linux.');
      return;
    }

    if (options.logLevel >= 1) {
      console.error(`[srv] watcher error: ${error.message}`);
    }
  });

  const closeAll = async () => {
    await closeWatcher();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  };

  process.on('SIGINT', async () => {
    console.log('\n[srv] shutting down...');
    await closeAll();
    process.exit(0);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const networkIp = getNetworkAddress();
  const protocol = useSsl ? 'https' : 'http';
  const network = networkIp ? `${protocol}://${networkIp}:${port}` : undefined;

  return { server, port, closeAll, network };
}

module.exports = {
  createSrvServer,
};
