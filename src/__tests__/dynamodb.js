const AWS = require('mock-aws');
const DynamoDB = require('../dynamodb');
const dynamo = new AWS.DynamoDB();

describe('DynamoDB Service', () => {
  describe('#getDynamoDbQueryParams', () => {
    it('return correct DynamoDB query', () => {
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
});
