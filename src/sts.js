const bunyan = require('bunyan');

/**
 * High-level wrapper for AWS STS service.
 */
class STS {
  constructor (AWS, dynamoDB) {
    this.AWS = AWS;
    this.sts = new AWS.STS();
    this.log = bunyan.createLogger({ name: 'sts' });
    this.dynamoDB = dynamoDB;
  }

  /**
   * Assumes IAM Role of other AWS Account and mutates current AWS SDK credentials to operate on
   * that behalf.
   *
   * If accountName supplied equals to ROOT_ACCOUNT then process of assuming role is skipped.
   *
   * @param {String} accountName - name of the account that should be fetched from DynamoDB and
   * impersonated
   * @returns {AWS|Promise} - returns AWS.IAM instance if succeed, rejected Promise when
   * requested object was not found.
   */
  async assumeRole (accountName) {
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
    } else if (accountName === process.env.ROOT_ACCOUNT) {
      this.log.info({ accountName }, 'Processing root account...');
      this.AWS.config.credentials = new this.AWS.EnvironmentCredentials('AWS');
    } else {
      this.log.warn({ dynamoDbItem }, 'Requested document not found in DynamoDB, skipping account...');
      return Promise.reject('SKIP');
    }

    return this.AWS;
  }

  /**
   * Reverts IAM Assume Role actions back to original IAM Role.
   */
  revertToOriginRole () {
    this.AWS.config.credentials = new this.AWS.EnvironmentCredentials('AWS');
  }
}

module.exports = STS;
