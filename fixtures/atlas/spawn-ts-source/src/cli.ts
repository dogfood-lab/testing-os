const [command] = process.argv.slice(2);
if (command === '--help') console.log('usage: spawn-ts-source <file>');
else process.exitCode = 2;
