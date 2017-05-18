'use strict';

const bunyan = require('bunyan');

class DynamoDB {
  constructor (dynamoDB) {
    this.dynamodb = dynamoDB;
    this.log = bunyan.createLogger({ name: 'dynamodb' });
  }

  getDynamoDbQueryParams (accountName) {
    return {
      TableName: 'aim_roles',
      Key: {
        account_name: {
          S: accountName,
        },
      },
    };
  }

  getItem (accountName) {
    return this.dynamodb.getItem(this.getDynamoDbQueryParams(accountName)).promise();
  }
}

module.exports = DynamoDB;
