const AWS = require('aws-sdk');
const AWS_MOCK = require('aws-sdk-mock');
const STS = require('../sts');
const DynamoDB = require('../dynamodb');

describe('STS Service', () => {
  describe('#assumeRole', () => {
    const temporaryRoleArn = '123';

    AWS_MOCK.mock('DynamoDB', 'getItem', (params, callback) => {
      if (params.Key.account_name.S === 'notExistingAccount') {
        return callback(null, { notItem: {} });
      }
      return callback(null, { Item: { RoleArn: { S: temporaryRoleArn } } });
    });
    AWS_MOCK.setSDKInstance(AWS);

    const dynamo = new AWS.DynamoDB({ region: 'us-east-1' });
    const dynamoService = new DynamoDB(dynamo);

    beforeEach(() => {
      process.env.ROOT_ACCOUNT = '';
    });

    it('rejects when accountName does not exists in DynamoDB and its not root account', done => {
      const service = new STS(AWS, dynamoService);

      service.assumeRole('notExistingAccount').then(() => {
        throw new Error('Shouldn\'t resolve');
      }).catch(error => {
        expect(error).toBe('SKIP');
        done();
      });
    });

    it('sets temporary credentials when trying to assume existing account role', done => {
      const service = new STS(AWS, dynamoService);

      service.assumeRole('acc').then(() => {
        expect(AWS.config.credentials.params.RoleArn).toBe(temporaryRoleArn);
        done();
      });
    });

    it('doesn\'t assume any role when processing root account', done => {
      process.env.ROOT_ACCOUNT = 'notExistingAccount';
      const service = new STS(AWS, dynamoService);

      service.assumeRole('notExistingAccount').then(() => {
        done();
      });
    });
  });
});
