import { appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_LOG_PATH = process.env.ROOTS_LOG_PATH || join(homedir(), '.roots', 'log.ndjson');

export class Logger {
  constructor(private path: string = DEFAULT_LOG_PATH) {}

  async log(line: string): Promise<void> {
    await appendFile(this.path, `${line}\n`, 'utf8');
  }
}
