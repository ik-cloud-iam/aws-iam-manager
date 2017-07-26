const AWS = require('aws-sdk');
const AWS_MOCK = require('aws-sdk-mock');
const DynamoDB = require('../dynamodb');

describe('DynamoDB Service', () => {
  describe('#getDynamoDbQueryParams', () => {
    it('return correct DynamoDB query', () => {
      const dynamo = new AWS.DynamoDB({ region: 'us-east-1' });
      const service = new DynamoDB(dynamo);
      const accountName = 'account';

      expect(service.getDynamoDbQueryParams(accountName)).toEqual({
        Key: {
          account_name: {
            S: accountName,
          },
        },
        TableName: 'aim_roles',
      });
    });
  });

  describe('#getItem', () => {
    AWS_MOCK.mock('DynamoDB', 'getItem', (params, callback) => {
      callback(null, { item: 1 });
    });
    AWS_MOCK.setSDKInstance(AWS);

    const dynamo = new AWS.DynamoDB({ region: 'us-east-1' });
    const service = new DynamoDB(dynamo);

    it('returns DynamoDB item', done => {
      service.getItem('account').then(data => {
        expect(data).toEqual({ item: 1 });
        done();
      });
    });
  });
});
