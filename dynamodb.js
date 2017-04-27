'use strict';

const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const dynamodb = new AWS.DynamoDB();

const log = bunyan.createLogger({ name: 'dynamodb' });

const dynamoDbQueryParams = (accountName) => ({
  TableName: 'aim_roles',
  Key: {
    account_name: {
      S: accountName
    },
  },
});

async function getItem(accountName) {
  return await dynamodb.getItem(dynamoDbQueryParams(accountName)).promise();
}

module.exports = {
  getItem,
};
