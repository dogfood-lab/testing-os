module.exports = {
  collectCoverage: true,
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports' }]],
};
