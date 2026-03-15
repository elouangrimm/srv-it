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

const srvLogger = {
  http: (...message) => console.info(chalk.bgBlue.bold(' HTTP '), ...message),
  info: (...message) => console.info(chalk.bgMagenta.bold(' INFO '), ...message),
  warn: (...message) => console.error(chalk.bgYellow.bold(' WARN '), ...message),
  error: (...message) => console.error(chalk.bgRed.bold(' ERRR '), ...message),
  log: console.log,
};

const BASE_WATCH_IGNORES = ['**/.git/**', '**/node_modules/**'];

const DIRECTORY_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0c0a09" d="M3 5.5A2.5 2.5 0 0 1 5.5 3H10l2 2h6.5A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><path fill="#3b82f6" d="M3 8h18v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>';
const DIRECTORY_FAVICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(DIRECTORY_FAVICON_SVG)}`;

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
    accentSoft: 'rgba(59, 130, 246, 0.16)',
    bg: '#0c0a09',
    bgRaised: '#1c1917',
    bgSurface: '#292524',
    border: '#292524',
    borderStrong: '#78716c',
    text: '#e7e5e4',
    textMuted: '#a8a29e',
    textFaint: '#78716c',
    textBright: '#f5f5f4',
  },
  paper: {
    accent: '#d97706',
    accentSoft: 'rgba(217, 119, 6, 0.16)',
    bg: '#f5f5f4',
    bgRaised: '#fafaf9',
    bgSurface: '#e7e5e4',
    border: '#d6d3d1',
    borderStrong: '#a8a29e',
    text: '#292524',
    textMuted: '#57534e',
    textFaint: '#78716c',
    textBright: '#1c1917',
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
  <link rel="icon" href="${DIRECTORY_FAVICON_DATA_URL}" />
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

      --bg: ${palette.bg};
      --bg-raised: ${palette.bgRaised};
      --bg-surface: ${palette.bgSurface};
      --border: ${palette.border};
      --border-strong: ${palette.borderStrong};
      --text: ${palette.text};
      --text-muted: ${palette.textMuted};
      --text-faint: ${palette.textFaint};
      --text-bright: ${palette.textBright};
      --accent: ${palette.accent};
      --accent-soft: ${palette.accentSoft};
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
      color: var(--accent);
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
      border-left: 2px solid var(--accent);
      padding-left: 0.6rem;
    }

    .up {
      display: inline-block;
      margin-bottom: 0.75rem;
      color: var(--accent);
      text-decoration: none;
      border: 1px solid var(--accent);
      padding: 0.3rem 0.55rem;
      font-family: var(--font-mono);
      transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease;
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
      transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    }

    li:last-child a {
      border-bottom: 0;
    }

    li a:hover {
      background-color: var(--bg-surface);
      color: var(--text-bright);
      box-shadow: inset 3px 0 0 var(--accent);
    }

    .name {
      max-width: 80%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type {
      color: var(--accent);
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.07em;
      padding: 0.12rem 0.35rem;
      border: 1px solid var(--accent-soft);
      background-color: var(--accent-soft);
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
  const sockets = new Set();

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
        if (pathnameValue === '/sw.js' && error && error.code === 'ENOENT') {
          // Browsers often probe /sw.js by default; treat missing file as a silent no-op.
          res.statusCode = 204;
          res.end();
          return;
        }
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
        srvLogger.error('[srv-it] request error:', error.message);
      }
    } finally {
      if (!options.noRequestLogging) {
        const statusCode = res.statusCode;
        const suppressRequestLog = pathnameValue === '/sw.js' && statusCode === 204;
        if (suppressRequestLog) {
          return;
        }
        const elapsed = Date.now() - start;
        const sourceIp = (req.socket.remoteAddress || '-').replace('::ffff:', '');
        const now = new Date();
        const formattedTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        const methodColor = method === 'GET' ? 'cyan' : 'magenta';

        srvLogger.http(
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
          srvLogger.error('[srv-it] handler error:', error.message);
        }
      });
    });
  } else {
    server = http.createServer((req, res) => {
      requestHandler(req, res).catch((error) => {
        res.statusCode = 500;
        res.end('Internal server error');
        if (options.logLevel >= 1) {
          srvLogger.error('[srv-it] handler error:', error.message);
        }
      });
    });
  }

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

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
      srvLogger.info(`[srv-it] ${isCss ? 'css refresh' : 'reload'}: ${changePath}`);
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
      srvLogger.error('[srv-it] live reload disabled: file watcher limit reached (ENOSPC).');
      srvLogger.warn('[srv-it] use --ignore to exclude noisy paths, or raise inotify limits on Linux.');
      return;
    }

    if (options.logLevel >= 1) {
      srvLogger.error(`[srv-it] watcher error: ${error.message}`);
    }
  });

  let closingPromise;
  const closeAll = async () => {
    if (closingPromise) {
      return closingPromise;
    }

    closingPromise = (async () => {
      await closeWatcher();

      for (const client of clients) {
        try {
          client.terminate();
        } catch (_error) {
          // Ignore client termination errors during shutdown.
        }
      }

      await new Promise((resolve) => wss.close(resolve));

      for (const socket of sockets) {
        socket.destroy();
      }

      await new Promise((resolve) => server.close(resolve));
    })();

    return closingPromise;
  };

  let shuttingDown = false;
  const onSigint = async () => {
    if (shuttingDown) {
      process.exit(130);
      return;
    }

    shuttingDown = true;
    process.stdout.write('\u001B[2K\r');
    console.log(chalk.bgWhite.bold('\n[srv-it]') + ' shutting down...');

    try {
      await closeAll();
      process.exit(0);
    } catch (error) {
      srvLogger.error('[srv-it] shutdown error:', error.message);
      process.exit(1);
    }
  };

  process.once('SIGINT', onSigint);

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
