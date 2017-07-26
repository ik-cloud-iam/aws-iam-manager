const { getAuth } = require('../utils');

describe('getAuth(joinChar = \'?\')', () => {
  test('returns empty string if env variable is not set', () => {
    process.env.GITHUB_ACCESS_TOKEN = '';
    expect(getAuth()).toBe('');
  });

  test('returns query with default joinChar', () => {
    process.env.GITHUB_ACCESS_TOKEN = 'abc';
    expect(getAuth()).toBe('?access_token=abc');
  });

  test('respects custom joinchar', () => {
    process.env.GITHUB_ACCESS_TOKEN = 'abc';
    expect(getAuth('&')).toBe('&access_token=abc');
  });
});

