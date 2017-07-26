const AWS = require('aws-sdk');
const AWS_MOCK = require('aws-sdk-mock');
const Policies = require('../Policies');

describe('Policies Service', () => {
  const groupsWithPolicy = [{
    GroupName: 'g_first',
  }, {
    GroupName: 'g_second',
  }];

  AWS_MOCK.mock('IAM', 'createPolicy', (params, callback) => callback(null, params));
  AWS_MOCK.mock('IAM', 'deletePolicy', (params, callback) => callback(null, params));
  AWS_MOCK.mock('IAM', 'detachGroupPolicy', (params, callback) => callback(null, params));
  AWS_MOCK.mock('IAM', 'listEntitiesForPolicy', (params, callback) => callback(null, {
    PolicyGroups: groupsWithPolicy
  }));
  AWS_MOCK.mock('IAM', 'listPolicies', (params, callback) => callback(null, {
    Policies: [{
      PolicyName: 'first',
      data: 1,
    }, {
      PolicyName: 'second',
    }]
  }));
  AWS_MOCK.setSDKInstance(AWS);

  const iam = new AWS.IAM({ region: 'us-east-1' });
  const service = new Policies(iam);

  beforeEach(() => {
    process.env.USERS_PATH = '';
  });

   describe('#createPolicy', () => {
    it('creates correct policy', done => {
      const policyName = 'policyName';
      const policyDocument = 'doc';
      const path = '/path';

      process.env.USERS_PATH = path;

      service.createPolicy(policyName, policyDocument).then(data => {
        expect(data.Path).toBe(path);
        expect(data.PolicyName).toBe(policyName);
        expect(data.PolicyDocument).toBe(policyDocument);
        done();
      });
    });
  });

  describe('#getPolicy', () => {
    it('gets correct policy', done => {
      const policyName = 'first';

      service.getPolicy(policyName).then(data => {
        expect(data[0]).toEqual({
          PolicyName: 'first',
          data: 1,
        });
        done();
      });
    });
  });

  describe('#detachFromAllEntities', () => {
    it('detaches all attached entities', done => {
      const policyArn = 'ARN';

      service.detachFromAllEntities(policyArn).then(data => {
        expect(data).toEqual(groupsWithPolicy.map(group => ({
          GroupName: group.GroupName,
          PolicyArn: policyArn,
        })));
        done();
      });
    });
  });
});
