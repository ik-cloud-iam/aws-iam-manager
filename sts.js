const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const sts = new AWS.STS();
const dynamodb = new AWS.DynamoDB();

const log = bunyan.createLogger({ name: 'sts' });

const dynamoDbQueryParams = (accountName) => ({
  TableName: 'aim_roles',
  Key: {
    account_name: {
      S: accountName
    },
  },
});

async function assumeRole(accountName) {
  log.info({ accountName }, 'Getting RoleARN');

  const dynamoDbItem = await dynamodb.getItem(dynamoDbQueryParams(accountName)).promise();
  const RoleArn = dynamoDbItem.Item.RoleArn.S;

  log.info({ accountName, dynamoDbItem, RoleArn }, 'Assuming role...');

  return await sts.assumeRole({
    RoleArn,
    RoleSessionName: 'AWS-IAM-Manager_Session',
  }).promise();
};

module.exports = {
  assumeRole,
};

