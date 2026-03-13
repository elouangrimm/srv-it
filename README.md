# srv-it

`srv-it` installs a `srv` command and merges the best parts of `live-server` and `serve`:

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
srv
```

This serves the current directory on port `3000`.

## Common usage

```bash
srv
srv 3000
srv 8080 ./public
srv ./public --open
srv --style neon --style-css ./srv-listing.css
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
srv --help
```

Highlights:

- `-p, --port <number>`
- `--host <host>`
- `--open [path]`, `--no-open`
- `--watch <path>` (repeat)
- `--ignore <glob>` (repeat)
- `--single`
- `--cors`
- `--no-css-inject`
- `--no-dir-listing`
- `--style <midnight|paper|neon>`
- `--style-css <file>`
- `-c` (create `srv.config.json` in served root if missing)
- `--log-level <0-3>`
- `--no-request-logging`
- `--ssl-cert <file> --ssl-key <file> [--ssl-pass <file>]`

## Notes

- HTML pages get an auto-injected websocket client for live reload.
- CSS changes refresh styles without full page reload unless `--no-css-inject` is enabled.
- If a folder has `index.html`, that file is served; otherwise a styled directory listing is shown.
