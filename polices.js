'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');

const iam = new AWS.IAM();
const log = bunyan.createLogger({ name: 'polices' });

const createPolicy = (PolicyName, PolicyDocument) => new Promise((resolve, reject) => {
  log.info({ PolicyName, PolicyDocument }, 'Creating new policy...');

  iam.createPolicy({
    PolicyName,
    PolicyDocument,
    Path: process.env.USERS_PATH,
  }).promise().then(resolve).catch(reject);
});

async function getPolicyArn(PolicyName) {
  log.info({ PolicyName }, 'Getting policy...');

  const payload = await iam.listPolicies({
    PathPrefix: process.env.USERS_PATH,
  }).promise();

  return payload.Policies.filter(policy => policy.PolicyName === PolicyName);
};

async function detachFromAllEntities(PolicyArn) {
  const entitiesWithAttachedPolicy = await iam.listEntitiesForPolicy({
    PolicyArn,
    PathPrefix: process.env.USERS_PATH,
  }).promise();

  const detachRequests = entitiesWithAttachedPolicy.PolicyGroups.map(group =>
    iam.detachGroupPolicy({
      GroupName: group.GroupName,
      PolicyArn
    }).promise());

  log.info({ entitiesWithAttachedPolicy, PolicyArn }, 'Policy detached from requested entities');

  return await Promise.all(detachRequests);
}

async function removePolicy (PolicyArn) {
  log.info({ PolicyArn }, 'Deleting old policy...');
  await detachFromAllEntities(PolicyArn);
  return iam.deletePolicy({ PolicyArn }).promise();
};

const update = json => new Promise((resolve, reject) => {
  log.info({ newData: json }, 'Updating policies');

  iam.listPolicies({
    PathPrefix: process.env.USERS_PATH,
  }).promise().then(data => {
    log.info(data, 'Old Policies');

    const rejectError = error => {
      log.error({ error }, 'Error while re-creating policies');

      return reject(error);
    };

    // Because we have not power to get current policies document and compare them
    // We have to remove all policies and re-create them from scratch.
    // Policies are also immutable, it's possible to version them but AWS limits version count to 5.
    Promise.all(data.Policies.map(policy => removePolicy(policy.Arn))).then(deleteResult => {
      log.info({ deleteResult }, 'Old policies removed, creating new...');

      Promise.all(json.policies.map(policy => createPolicy(policy.name, JSON.stringify(policy.document))))
        .then(createResult => {
          log.info({ createResult }, 'New policies created');

          return resolve({ createResult, deleteResult });
      }).catch(rejectError);
    }).catch(rejectError);

  }).catch(error => {
    log.error(error, 'Error while updating policies');
    return reject(error);
  });
});

module.exports = {
  update,
  getPolicyArn,
};
