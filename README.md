# srv-it

[![NPM Last Update](https://img.shields.io/npm/last-update/srv-it)](https://www.npmjs.com/package/srv-it?activeTab=versions) [![NPM Downloads](https://img.shields.io/npm/dm/srv-it?logo=npm)](https://www.npmjs.com/package/srv-it) [![install size](https://packagephobia.com/badge?p=srv-it)](https://packagephobia.com/result?p=srv-it) [![NPM Version](https://img.shields.io/npm/v/srv-it)](https://www.npmjs.com/package/srv-it)

[![elouan.xyz](https://img.shields.io/badge/elouan-dot%20xyz-3b82f6)](https://elouan.xyz)

`srv-it` is a simple cli that merges the best parts of [live-server](https://www.npmjs.com/package/live-server) and [serve](https://www.npmjs.com/package/serve):

- one-command static server from any folder
- polished terminal UX
- live DOM reload and CSS refresh
- directory listing with customizable page style
- simple defaults via config files

## Quick start

```bash
npm install -g srv-it
```

Then run:

```bash
cd your-project
srv-it
```

This serves the current directory on port `3000`.

## Common usage

```bash
srv-it
srv-it 3000
srv-it 8080 ./public
srv-it ./public --open
srv-it --style neon --style-css ./srv-listing.css
```

## Config defaults

You can set defaults globally and per-project:

- global: `~/.srvrc.json`
- project: `./srv.config.json`
- override file: `srv --config ./my-srv.json`
- template: `./srv.config.example.json`

Example `srv.config.json`:

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "open": false,
  "single": true,
  "cors": true,
  "style": "midnight",
  "directoryListing": true,
  "noCssInject": false,
  "logLevel": 2,
  "noRequestLogging": false,
  "ignore": ["**/.git/**", "**/node_modules/**"]
}
```

CLI flags always override config files.

## CLI options

Run:

```bash
srv-it --help
```

### Supported Arguments

- **`-p, --port <number>`**: set a custom port to serve the site
- **`--host <host>`**: set the bind host (default: `0.0.0.0`)
- **`--open [path]`**, **`--no-open`**: open a browser at `/` (or the given path), or disable opening
- **`--watch <path>`** (repeat): add extra file/folder paths to watch for live reload
- **`--ignore <glob>`** (repeat): ignore matching files/folders from watcher reload triggers
- **`--single`**: enable SPA fallback by serving `index.html` for unknown routes
- **`--cors`**: enable CORS headers on responses
- **`--no-css-inject`**: disable hot CSS injection and force full page reload on CSS changes
- **`--no-dir-listing`**: disable generated directory listing pages
- **`--style <midnight|paper|neon>`**: choose the directory listing preset theme
- **`--style-css <file>`**: load a custom CSS file for directory listing pages
- **`-c`**: create `srv.config.json` in served root if missing
- **`--config <path>`**: Provide a custom config file
- **`--log-level <0-3>`**: set startup log verbosity (`0` silent, `3` most verbose)
- **`--no-request-logging`**: disable per-request logging output
- **`--ssl-cert <file> --ssl-key <file> [--ssl-pass <file>]`**: enable HTTPS with cert/key and optional passphrase file

## Notes

- HTML pages get an auto-injected websocket client for live reload.
- CSS changes refresh styles without full page reload unless `--no-css-inject` is enabled.
- If a folder has `index.html`, that file is served; otherwise a styled directory listing is shown.
- Watch mode always ignores `.git` and `node_modules`, and also skips common home cache/config paths (`~/.cache`, `~/.local/share`).
- If the OS watcher limit is reached (`ENOSPC`), srv-it keeps serving files and disables live reload instead of crashing.
