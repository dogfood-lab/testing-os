import { program } from 'commander';
import { init } from './init.js';
import { add } from './add.js';
import { build } from './build.js';

program.command('init').action(() => init());
program.command('add').action(() => add());
program.command('build').action(() => build());
program.parse();
