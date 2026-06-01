// wx-server-sdk mock
const mockDatabase = jest.fn();
const mockGetWXContext = jest.fn().mockReturnValue({ OPENID: 'test_openid' });

module.exports = {
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'mock-env',
  database: mockDatabase,
  getWXContext: mockGetWXContext
};
