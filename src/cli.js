const path = require('node:path');
const fs = require('node:fs');
const arg = require('arg');
const chalk = require('chalk');
const boxenModule = require('boxen');
const openModule = require('open');
const { loadConfig } = require('./config');
const { createSrvServer } = require('./server');
const pkg = require('../package.json');

const boxen = boxenModule.default || boxenModule;
const open = openModule.default || openModule;

function isNumeric(value) {
  return /^\d+$/.test(String(value));
}

function getHelpText() {
  const repository =
    typeof pkg.repository === 'object' && pkg.repository && pkg.repository.url
      ? pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
      : pkg.homepage || 'https://github.com/elouan/srv-it';

  const title = `${chalk.bold.cyan('srv')} ${chalk.bold.white(`v${pkg.version}`)}`;

  return [
    title,
    chalk.dim('Static server + directory listing + live reload'),
    '',
    chalk.bold('USAGE'),
    `  ${chalk.cyan('srv')}                          Serve current directory on port 3000`,
    `  ${chalk.cyan('srv 4000')}                     Serve current directory on port 4000`,
    `  ${chalk.cyan('srv 4000 ./public')}            Serve ./public on port 4000`,
    `  ${chalk.cyan('srv ./public')}                 Serve ./public on port 3000`,
    '',
    chalk.bold('OPTIONS'),
    `  ${chalk.yellow('-h, --help')}                   Show help`,
    `  ${chalk.yellow('-v, --version')}                Show version`,
    `  ${chalk.yellow('-p, --port <number>')}          Port to listen on`,
    `  ${chalk.yellow('--host <host>')}                Host to bind to (default 0.0.0.0)`,
    `  ${chalk.yellow('--open [path]')}                Open browser (default /)`,
    `  ${chalk.yellow('--no-open')}                    Do not open browser`,
    `  ${chalk.yellow('--watch <path>')}               Extra watch path (can be repeated)`,
    `  ${chalk.yellow('--ignore <glob>')}              Ignore glob/path for watcher (repeatable)`,
    `  ${chalk.yellow('--no-css-inject')}              Reload page on css changes instead of hot css refresh`,
    `  ${chalk.yellow('--cors')}                       Enable CORS`,
    `  ${chalk.yellow('--single')}                     SPA fallback to /index.html`,
    `  ${chalk.yellow('--no-dir-listing')}             Disable directory listing`,
    `  ${chalk.yellow('--style <name>')}               Listing style preset: midnight | paper | neon`,
    `  ${chalk.yellow('--style-css <file>')}           Custom CSS file for listing page`,
    `  ${chalk.yellow('-c')}                           Create srv.config.json in served root if missing`,
    `  ${chalk.yellow('--config <file>')}              Read additional config JSON file`,
    `  ${chalk.yellow('--no-request-logging')}         Disable request logs`,
    `  ${chalk.yellow('--log-level <0-3>')}            Startup log verbosity`,
    `  ${chalk.yellow('--ssl-cert <file>')}            SSL certificate path`,
    `  ${chalk.yellow('--ssl-key <file>')}             SSL private key path`,
    `  ${chalk.yellow('--ssl-pass <file>')}            SSL passphrase file path`,
    '',
    chalk.bold('CONFIG FILES'),
    '  ~/.srvrc.json (global defaults)',
    '  ./srv.config.json (project defaults)',
    '',
    'CLI options always override config values.',
    '',
    `${chalk.bold('More config docs:')} ${chalk.underline(repository)}`,
  ].join('\n');
}

function parseCli() {
  const parsed = arg(
    {
      '--help': Boolean,
      '--version': Boolean,
      '--port': Number,
      '--host': String,
      '--open': String,
      '--no-open': Boolean,
      '--watch': [String],
      '--ignore': [String],
      '--no-css-inject': Boolean,
      '--cors': Boolean,
      '--single': Boolean,
      '--no-dir-listing': Boolean,
      '--style': String,
      '--style-css': String,
      '-c': Boolean,
      '--config': String,
      '--no-request-logging': Boolean,
      '--log-level': Number,
      '--ssl-cert': String,
      '--ssl-key': String,
      '--ssl-pass': String,
      '-h': '--help',
      '-v': '--version',
      '-p': '--port',
    },
    {
      permissive: true,
    },
  );

  return parsed;
}

function resolveOptions(parsed, mergedConfig) {
  const positional = parsed._.slice();

  let positionalPort;
  let positionalRoot;
  if (positional.length > 0) {
    if (isNumeric(positional[0])) {
      positionalPort = Number(positional.shift());
    }
    if (positional.length > 0) {
      positionalRoot = positional.shift();
    }
  }

  const options = {
    port:
      parsed['--port'] ?? positionalPort ?? mergedConfig.port ?? Number(process.env.PORT || 3000),
    host: parsed['--host'] ?? mergedConfig.host ?? '0.0.0.0',
    root: path.resolve(positionalRoot || mergedConfig.root || process.cwd()),
    open:
      parsed['--no-open']
        ? false
        : parsed['--open'] || mergedConfig.open === false
          ? parsed['--open'] || mergedConfig.open
          : '/',
    watch: parsed['--watch'] ?? mergedConfig.watch ?? [],
    ignore: parsed['--ignore'] ?? mergedConfig.ignore ?? [],
    noCssInject: parsed['--no-css-inject'] ?? Boolean(mergedConfig.noCssInject),
    cors: parsed['--cors'] ?? Boolean(mergedConfig.cors),
    single: parsed['--single'] ?? Boolean(mergedConfig.single),
    directoryListing:
      parsed['--no-dir-listing']
        ? false
        : mergedConfig.directoryListing !== undefined
          ? Boolean(mergedConfig.directoryListing)
          : true,
    style: parsed['--style'] ?? mergedConfig.style ?? 'midnight',
    styleCss: parsed['--style-css'] ?? mergedConfig.styleCss,
    noRequestLogging:
      parsed['--no-request-logging'] ?? Boolean(mergedConfig.noRequestLogging),
    logLevel: parsed['--log-level'] ?? mergedConfig.logLevel ?? 2,
    sslCert: parsed['--ssl-cert'] ?? mergedConfig.sslCert,
    sslKey: parsed['--ssl-key'] ?? mergedConfig.sslKey,
    sslPass: parsed['--ssl-pass'] ?? mergedConfig.sslPass,
    createConfig: Boolean(parsed['-c']),
  };

  return options;
}

async function run() {
  const parsed = parseCli();

  if (parsed['--help']) {
    console.log(getHelpText());
    return;
  }

  if (parsed['--version']) {
    console.log(pkg.version);
    return;
  }

  const { config } = loadConfig({
    cwd: process.cwd(),
    explicitConfigPath: parsed['--config'],
  });

  const options = resolveOptions(parsed, config);
  let configCreated = false;

  if (options.createConfig) {
    const configFilePath = path.join(options.root, 'srv.config.json');
    if (!fs.existsSync(configFilePath)) {
      const template = {
        port: 3000,
        host: '0.0.0.0',
        root: '.',
        open: false,
        watch: [],
        ignore: ['**/.git/**', '**/node_modules/**'],
        noCssInject: false,
        cors: false,
        single: false,
        directoryListing: true,
        style: 'midnight',
        styleCss: '',
        noRequestLogging: false,
        logLevel: 2,
        sslCert: '',
        sslKey: '',
        sslPass: '',
      };
      fs.writeFileSync(configFilePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
      configCreated = true;
    }
  }

  const server = await createSrvServer(options);
  const protocol = options.sslCert ? 'https' : 'http';
  const visibleHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
  const url = `${protocol}://${visibleHost}:${server.port}`;

  if (options.logLevel >= 1) {
    const lines = [
      `${chalk.green.bold('srv is running')}`,
      '',
      `${chalk.bold('- Local:')}    ${url}`,
      `${chalk.bold('- Root:')}     ${options.root}`,
      `${chalk.bold('- Reload:')}   ${options.noCssInject ? 'full page' : 'css + page'}`,
    ];

    if (server.network) {
      lines.splice(3, 0, `${chalk.bold('- Network:')}  ${server.network}`);
    }

    if (configCreated) {
      lines.push(`${chalk.bold('- Config:')}   ${path.join(options.root, 'srv.config.json')}`);
    }

    const content = [
      ...lines,
    ].join('\n');

    console.log(
      boxen(content, {
        padding: 1,
        borderStyle: 'single',
        borderColor: '#3b82f6',
        margin: 1,
      }),
    );
  }

  if (options.open !== false) {
    const openPath = typeof options.open === 'string' ? options.open : '/';
    await open(`${url}${openPath.startsWith('/') ? openPath : `/${openPath}`}`);
  }
}

module.exports = {
  run,
};
