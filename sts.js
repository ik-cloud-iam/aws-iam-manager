const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const STS = new AWS.STS();
const dynamodb = new AWS.DynamoDB();

const dynamoDbQueryParams = (accountName) => ({
  TableName: 'aim_roles',
  Key: {
    'account_name': accountName,
  },
});

const getAssumeRoleParamsFromDynamoDB = (accountName) =>
  dynamodb.getItem(dynamoDbQueryParams(accountName)).promise();

const assumeRole = accountName => new Promise((resolve, reject) => {
  getAssumeRoleParamsFromDynamoDB.then(data => {

  }).catch(reject);
});

module.exports = {
  assumeRole,
};
