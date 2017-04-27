'use strict';

class DynamoDB {
  constructor(AWS, bunyan) {
    this.dynamodb = new AWS.DynamoDB();
    this.log = bunyan.createLogger({ name: 'dynamodb' });
  }

  getDynamoDbQueryParams(accountName) {
    return {
      TableName: 'aim_roles',
      Key: {
        account_name: {
          S: accountName,
        },
      },
    };
  }

  async getItem(accountName) {
    return this.dynamodb.getItem(this.getDynamoDbQueryParams(accountName)).promise();
  }
}

module.exports = DynamoDB;
