'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const difference = require('lodash.difference');
const crypto = require('crypto');
const groups = require('./groups');

AWS.config.setPromisesDependency(Promise);
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

const log = bunyan.createLogger({ name: 'users' });

async function createUser(UserName, iam, accountName) {
  log.info({ UserName }, 'Creating new user...');
  const Password = crypto.randomBytes(16).toString('hex');

  await iam.createUser({
    UserName,
    Path: process.env.USERS_PATH,
  }).promise();

  await iam.createLoginProfile({
    Password,
    PasswordResetRequired: true,
    UserName,
  }).promise();

  const recipent = `${UserName}@${process.env.EMAIL_DOMAIN}`;

  log.info({
    Source: process.env.MAIL_SENDER,
    To: recipent,
  },'User created, sending email');

  return await ses.sendEmail({
    Source: process.env.MAIL_SENDER,
    Destination: {
      ToAddresses: [
        process.env.MAIL_SENDER,
        recipent,
      ],
    },
    Message: {
      Subject: {
        Data: '[AWS-IAM-Manager] Your AWS account is ready.',
      },
      Body: {
        Text: {
          Data: `Your IAM User has been created.\n\n Account: ${accountName}\nCredentials: ${UserName} / ${Password}`,
        },
      },
    },
  }).promise();
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
