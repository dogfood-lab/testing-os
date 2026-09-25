const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const PACKAGE_JSON = join(ROOT, 'package.json');
const pkg = require(PACKAGE_JSON);

if (!pkg.name) process.exit(1);
