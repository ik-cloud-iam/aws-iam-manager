const moxios = require('moxios');
const { getAuth, getJson } = require('../utils');

describe('#getAuth', () => {
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

describe('#getJson', () => {
  beforeEach(() => {
    moxios.install();
  });

  afterEach(() => {
    moxios.uninstall();
  });

  it('returns correct JSON for corresponding encoded YAML', (done) => {
    moxios.stubRequest('/data', {
      status: 200,
      responseText: 'ZGF0YToNCiAgYXJyYXk6DQogICAgLSBpdGVtDQogICAgICA='
    });

    moxios.withMock(() => {
      getJson('/data').then(data => {
        expect(data).toEqual({
          data: {
            array: ['item'],
          },
        });
        done();
      });

      moxios.wait(() => {
        const request = moxios.requests.mostRecent();

        request.respondWith({
          status: 200,
          response: {
            content: 'ZGF0YToNCiAgYXJyYXk6DQogICAgLSBpdGVtDQogICAgICA=',
            encoding: 'base64',
          },
        });
      })
    });
  });
});
