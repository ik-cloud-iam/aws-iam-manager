const bunyan = require('bunyan');

/**
 * High level wrapper for AWS DynamoDB service
 */
class DynamoDB {
  constructor (dynamoDB) {
    this.dynamodb = dynamoDB;
    this.log = bunyan.createLogger({ name: 'dynamodb' });
  }

  /**
   * Returns DynamoDB query-like object basing on accountName for fetching items from 'iam-roles table.
   *
   * @param accountName - name of the account
   * @returns {{TableName: string, Key: {account_name: {S: *}}}} - DynamoDb.getItem query request object
   */
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

  /**
   * Gets account item from DynamoDB table basing on account name.
   *
   * @param accountName - name of the account
   * @returns {Promise<D>} - DynamoDB.getItem(...).promise()
   */
  getItem (accountName) {
    return this.dynamodb.getItem(this.getDynamoDbQueryParams(accountName)).promise();
  }
}

module.exports = DynamoDB;
