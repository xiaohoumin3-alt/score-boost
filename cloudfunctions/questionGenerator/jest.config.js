module.exports = {
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '!**/__tests__/helpers/**'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/helpers/'
  ]
};
