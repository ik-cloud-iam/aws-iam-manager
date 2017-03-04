'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const _ = require('lodash');
const groups = require('./groups');

AWS.config.setPromisesDependency(Promise);

const log = bunyan.createLogger({ name: 'users' });

const createUser = (UserName, iam) => {
  log.info({ UserName }, 'Creating new user...');

  return iam.createUser({
    UserName,
    Path: process.env.USERS_PATH,
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

const update = (json, iam) => new Promise((resolve, reject) => {
  log.info({ newData: json }, 'Updating users');

  iam.listUsers({
    PathPrefix: process.env.USERS_PATH,
  }).promise().then(data => {
    const newUsers = json.users;
    const oldUsers = data.Users.map(u => u.UserName);

    const usersToAdd = _.difference(newUsers, oldUsers);
    const usersToDelete = _.difference(oldUsers, newUsers);

    log.info({
      newUsers,
      oldUsers,
      usersToAdd,
      usersToDelete,
    });

    return Promise.all(usersToAdd.map(user => createUser(user, iam))
      .concat(usersToDelete.map(user => deleteUser(user, iam))))
      .then(result => {
        log.info('Updating users finished');
        return resolve(result);
      })
      .catch(reject);
  }).catch(error => {
    log.error(error, 'Error while updating users');
    return reject(error);
  });
});

module.exports = {
  update,
};
