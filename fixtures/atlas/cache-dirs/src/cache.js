const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function defaultCacheDir() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'launcher') : path.join(os.homedir(), '.cache', 'launcher');
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'launcher');
}

function save() {
  fs.writeFileSync(path.join(defaultCacheDir(), 'state.json'), '{}\n');
}

module.exports = { save };
