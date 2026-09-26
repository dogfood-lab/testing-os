const { sum } = require('./sum');

test('sums', () => {
  expect(sum(2, 2)).toBe(4);
});
