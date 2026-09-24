const { version } = require('../package.json');
const { greet } = require('../lib/greet.js');

process.stdout.write(`${greet()} ${version}\n`);
