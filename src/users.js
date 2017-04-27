'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const difference = require('lodash.difference');
const crypto = require('crypto');
const groups = require('./groups');
const SES = require('./ses');

AWS.config.setPromisesDependency(Promise);

const log = bunyan.createLogger({ name: 'users' });

async function generateUserLoginProfile(UserName) {
  const Password = crypto.randomBytes(16).toString('base64');
  await iam.createLoginProfile({
    Password,
    PasswordResetRequired: true,
    UserName,
  }).promise();

  return Password;
}

async function generateProgrammaticAccessKeys(UserName) {
  const data = await iam.createAccessKey({
    UserName,
  }).promise();

  return data.AccessKey;
}

async function createUser(UserName, iam, accountName) {
  log.info({ UserName }, 'Creating new user...');

  await iam.createUser({
    UserName,
    Path: process.env.USERS_PATH,
  }).promise();

  const ses = new SES(AWS, bunyan);

  // If UserName ends with keys we want to only create programatic access
  if (UserName.includes('_keys')) {
    const credentials = await generateProgrammaticAccessKeys(UserName);
    return await ses.sendProgrammaticAccessKeys(UserName, credentials, accountName);
  } else {
    const password = await generateUserLoginProfile(Username);
    return await ses.sendUserCredentialsEmail(UserName, password, accountName);
  }
};

const deleteUser = (UserName, iam) => new Promise((resolve, reject) => {
  log.info({ UserName }, 'Deleting old user...');

  iam.listGroupsForUser({ UserName }).promise().then(userGroups => {
    log.info({ userGroups }, 'Removing user from groups...');

    const groupRemovalPromises = userGroups.Groups.map(group => {
      log.info({ name: group.GroupName }, 'Removing user from group...');

      return groups.removeUserFromGroup(UserName, group.GroupName, iam);
    });

    Promise.all(groupRemovalPromises).then(() =>
      iam.deleteUser({ UserName }).promise().then(resolve).catch(reject)
    ).catch(reject);

  }).catch(error => {
    reject();
  });
});

async function update(json, iam, accountName) {
  log.info({ newData: json }, 'Updating users');

  const data = await iam.listUsers({
    PathPrefix: process.env.USERS_PATH,
  }).promise();

  const newUsers = json.users;
  const oldUsers = data.Users.map(u => u.UserName);

  const usersToAdd = difference(newUsers, oldUsers);
  const usersToDelete = difference(oldUsers, newUsers);

  log.info({
    newUsers,
    oldUsers,
    usersToAdd,
    usersToDelete,
  });

  return Promise.all(usersToAdd.map(user => createUser(user, iam, accountName))
    .concat(usersToDelete.map(user => deleteUser(user, iam))))
    .then(result => {
      log.info('Updating users finished');
      return result;
    })
    .catch(err => { return Promise.reject(err); });
}

module.exports = {
  update,
};
