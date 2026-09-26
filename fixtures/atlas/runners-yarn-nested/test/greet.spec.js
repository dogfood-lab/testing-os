const assert = require('node:assert');
const { greet } = require('../lib/greet');

it('greets', () => {
  assert.equal(greet('atlas'), 'hello, atlas');
});
