const dir = process.argv.find((arg) => arg.startsWith('--dir='));
if (!dir) throw new Error('check needs --dir');
