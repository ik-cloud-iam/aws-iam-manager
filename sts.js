const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const sts = new AWS.STS();
const dynamodb = require('./dynamodb');

const log = bunyan.createLogger({ name: 'sts' });

async function assumeRole(accountName) {
  log.info({ accountName }, 'Getting RoleARN');

  const dynamoDbItem = await dynamodb.getItem(accountName);
  if (dynamoDbItem && dynamoDbItem.Item) {
    const RoleArn = dynamoDbItem.Item.RoleArn.S;
    log.info({ accountName, dynamoDbItem, RoleArn }, 'Assuming role...');

    const TemporaryCredentials = new AWS.TemporaryCredentials({
      RoleArn,
    });

    AWS.config.credentials = new AWS.EnvironmentCredentials('AWS');
    AWS.config.credentials = TemporaryCredentials;
  } else {
    log.warn({ dynamoDbItem }, 'Requested document not found in DynamoDB, using default credentials');
  }

  return new AWS.IAM();
};

module.exports = {
  assumeRole,
};

