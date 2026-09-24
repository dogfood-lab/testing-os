import { run } from '@s/core';
import { log } from '@s/log';

log(run(process.argv[2] ?? ''));
