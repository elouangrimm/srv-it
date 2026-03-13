const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readJsonIfExists(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to parse config at ${filePath}: ${error.message}`);
  }
}

function loadConfig({ cwd, explicitConfigPath }) {
  const globalPath = path.join(os.homedir(), '.srvrc.json');
  const localPath = path.join(cwd, 'srv.config.json');

  const globalConfig = readJsonIfExists(globalPath);
  const localConfig = readJsonIfExists(localPath);
  const explicitConfig = explicitConfigPath
    ? readJsonIfExists(path.resolve(explicitConfigPath))
    : {};

  return {
    globalPath,
    localPath,
    config: {
      ...globalConfig,
      ...localConfig,
      ...explicitConfig,
    },
  };
}

module.exports = {
  loadConfig,
};
