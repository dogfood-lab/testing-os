import { Command } from 'commander';

const program = new Command('acme');
program.command('serve').action(() => console.log('serving'));
await program.parseAsync(process.argv);
