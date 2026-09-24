import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { shutdown } from './shutdown.js';
import { handleAnswer } from './tools/answer.js';
import { handleSearch } from './tools/search.js';
import { printVersion } from './version.js';

async function main() {
  if (process.argv.includes('--version')) {
    printVersion();
    return;
  }
  const config = loadConfig();
  const server = createServer(config);
  server.tool('search', (args) => handleSearch(args, config));
  server.tool('answer', (args) => handleAnswer(args, config));
  server.on('close', () => shutdown(config));
  server.listen();
}

main();
