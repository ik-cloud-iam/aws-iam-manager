const AWS = require('mock-aws');
const DynamoDB = require('../dynamodb');
const dynamo = new AWS.DynamoDB();

describe('DynamoDB Service', () => {
  test('#getDynamoDbQueryParams', () => {
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
