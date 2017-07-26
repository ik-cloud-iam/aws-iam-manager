const AWS = require('aws-sdk');
const AWS_MOCK = require('aws-sdk-mock');
const STS = require('../sts');
const DynamoDB = require('../dynamodb');

describe('STS Service', () => {
  describe('#assumeRole', () => {
    AWS_MOCK.mock('DynamoDB', 'getItem', (params, callback) => {
      if (params.Key.account_name.S === 'notExistingAccount') {
        return callback(null, { notItem: {} });
      }
      return callback(null, { Item: { RoleArn: { S: '123' } } });
    });
    AWS_MOCK.setSDKInstance(AWS);

    const dynamo = new AWS.DynamoDB({ region: 'us-east-1' });
    const dynamoService = new DynamoDB(dynamo);

    it('rejects when accountName does not exists in DynamoDB and its not root account', done => {
      const service = new STS(AWS, dynamoService);

      service.assumeRole('notExistingAccount').then(() => {
        throw new Error('Shouldn\'t resolve');
      }).catch(error => {
        expect(error).toBe('SKIP');
        done();
      });
    });
  });
});
