'use strict';

const bunyan = require('bunyan');

class STS {
  constructor(AWS, dynamoDB) {
    this.AWS = AWS;
    this.sts = new AWS.STS();
    this.log = bunyan.createLogger({ name: 'sts' });
    this.dynamoDB = dynamoDB;
  }

  async assumeRole(accountName) {
    this.log.info({ accountName }, 'Getting RoleARN');

    const dynamoDbItem = await this.dynamoDB.getItem(accountName);

    if (dynamoDbItem && dynamoDbItem.Item) {
      const RoleArn = dynamoDbItem.Item.RoleArn.S;
      this.log.info({ accountName, dynamoDbItem, RoleArn }, 'Assuming role...');

      const TemporaryCredentials = new this.AWS.TemporaryCredentials({
        RoleArn,
      });

      this.AWS.config.credentials = new this.AWS.EnvironmentCredentials('AWS');
      this.AWS.config.credentials = TemporaryCredentials;
    } else {
      this.log.warn({ dynamoDbItem }, 'Requested document not found in DynamoDB, skipping account...');
      throw new Error('Requested document not found in DynamoDB, skipping account...');
    }

    return new this.AWS.IAM();
  };
}

module.exports = STS;
