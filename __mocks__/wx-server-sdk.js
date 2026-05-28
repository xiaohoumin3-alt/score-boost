// wx-server-sdk mock
const mockDatabase = jest.fn();

module.exports = {
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: mockDatabase
};
