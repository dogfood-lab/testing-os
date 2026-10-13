const { gate } = require('../src/gate.cjs');

if (gate(-1) !== false) {
  console.error('gate accepted a negative number');
  process.exit(1);
}
