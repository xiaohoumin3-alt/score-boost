module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'cloudfunctions/**/*.js',
    '!cloudfunctions/**/node_modules/**',
    '!cloudfunctions/**/__tests__/**',
    '!cloudfunctions/**/package.json'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  // 忽略云函数的package.json避免Haste冲突
  modulePathIgnorePatterns: ['<rootDir>/cloudfunctions/*/package.json'],
  // 使用 hasteImplOptions 配置
  haste: {
    enableSymlinks: false
  },
  // 只处理.js文件作为模块
  moduleFileExtensions: ['js']
};
