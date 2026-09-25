import { report } from '../lib/report.js';

const COMMANDS = {
  init: '../scripts/init.js',
  build: '../scripts/build.js',
  serve: '../scripts/serve.js',
};

const EXTRA = {
  show: '../scripts/show.js',
};

const namespaces = [{ head: 'db', table: {} }];

async function main() {
  const command = process.argv[2];
  report(command);
  for (const { head } of namespaces) {
    if (command === head) {
      report(head);
      return;
    }
  }
  if (EXTRA[command]) {
    const extra = await import(EXTRA[command]);
    return extra.run();
  }
  const modulePath = COMMANDS[command];
  const mod = await import(modulePath);
  await mod.run();
  report('done');
}

main();
