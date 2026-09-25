import { loadConfig } from './config.js';
import { report } from './report.js';
import { run } from './run.js';

export function main(argv) {
  const config = loadConfig(argv);
  const result = run(config);
  return report(result);
}

main(process.argv.slice(2));
