'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const difference = require('lodash.difference');
const getPolicyArn = require('./polices').getPolicyArn;

AWS.config.setPromisesDependency(Promise);

const log = bunyan.createLogger({ name: 'groups' });

const addUserToGroup = (UserName, GroupName, iam) => new Promise((resolve, reject) => {
  log.info({ UserName, GroupName }, 'Assigning user to group');

  iam.addUserToGroup({
    UserName,
    GroupName,
  }).promise().then(resolve).catch(reject);
});

const removeUserFromGroup = (UserName, GroupName, iam) => new Promise((resolve, reject) => {
  iam.removeUserFromGroup({
    UserName,
    GroupName
  }).promise().then(resolve).catch(reject);
});

const createGroup = (GroupName, iam) => new Promise((resolve, reject) => {
  log.info({ GroupName }, 'Creating new group...');
  iam.createGroup({
    GroupName,
    Path: process.env.USERS_PATH,
  }).promise().then(resolve).catch(reject);
});

async function attachGroupPolicy (GroupName, PolicyName, iam) {
  log.info({ GroupName, PolicyName }, 'Attaching policy to group');

  const policies = await getPolicyArn(PolicyName, iam);
  if (policies.length === 0) {
    log.error({ PolicyName }, 'Requested policy not found!');
  }

  const PolicyArn = policies[0].Arn;
  log.info({ PolicyArn, PolicyName, GroupName }, 'Policy ARN attached');

  return iam.attachGroupPolicy({
    GroupName,
    PolicyArn,
  }).promise();
};

const reassignUsers = (data, group, iam) => new Promise((resolve, reject) => {
  const oldGroupUsers = data.Users.map(u => u.UserName);
  const newGroupUsers = group.users;

  const usersToAdd = difference(newGroupUsers, oldGroupUsers);
  const usersToDelete = difference(oldGroupUsers, newGroupUsers);

  log.info({
    oldGroupUsers,
    newGroupUsers,
    usersToAdd,
    usersToDelete,
  });

  return Promise.all(
      usersToAdd.map(user => addUserToGroup(user, group.name, iam))
      .concat(usersToDelete.map(user => removeUserFromGroup(user, group.name, iam)))
  ).then(result => {
      log.info(result, 'Updating users-groups relations finished');
      return resolve(result);
    }).catch(error => {
      log.error({ error }, 'Error while assigning user to group');
      return reject(error);
    });
});

const forgeNewGroup = (group, error, iam) => new Promise((resolve, reject) => {
  if (error.code === 'NoSuchEntity') {
    log.info({ name: group.name }, 'Group not found, creating...');

    return createGroup(group.name, iam).then(() => {
      reassignUsers({ Users: [] }, group, iam)
        .then(resolve)
        .catch(reject);
    }).catch(reject);
  }

  return reject(error);
});

const update = (json, iam) => new Promise((resolve, reject) => {
  log.info({ newData: json}, 'Updating groups...');

  const promises = json.groups.map(group =>
    iam.getGroup({ GroupName: group.name }).promise().then(data => {
      log.info({ data }, 'Group info');

      return reassignUsers(data, group, iam).then(resolve).catch(reject);
    }).catch(error => {
      log.warn({ error }, 'Error while updating group');

      return forgeNewGroup(group, error, iam).then(resolve).catch(reject);
    })
  );

  return Promise.all(promises).then(resolve).catch(reject);
});

const updatePolicies = (json, iam) => {
  log.info({ newData: json}, 'Updating group policies...');

  const attachPolicyRequests = json.groups.map(group =>
    attachGroupPolicy(group.name, group.policy, iam));

  return Promise.all(attachPolicyRequests);
};

module.exports = {
  update,
  updatePolicies,
  removeUserFromGroup,
};
