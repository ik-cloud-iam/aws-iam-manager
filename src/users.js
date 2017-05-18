'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const difference = require('lodash.difference');
const crypto = require('crypto');
const SES = require('./ses');

AWS.config.setPromisesDependency(Promise);

class Users {
  constructor (iam, groups) {
    this.iam = iam;
    this.groups = groups;
    this.ses = new SES(AWS);
    this.log = bunyan.createLogger({ name: 'users' });
  }

  async generateUserLoginProfile (UserName) {
    const Password = crypto.randomBytes(16).toString('base64');

    await this.iam.createLoginProfile({
      Password,
      PasswordResetRequired: true,
      UserName,
    }).promise();

    return Password;
  }

  async generateProgrammaticAccessKeys (UserName) {
    const data = await this.iam.createAccessKey({
      UserName,
    }).promise();

    return data.AccessKey;
  }

  async createUser (UserName, accountName) {
    this.log.info({ UserName }, 'Creating new user...');

    await this.iam.createUser({
      UserName,
      Path: process.env.USERS_PATH,
    }).promise();

    // If UserName ends with keys we want to only create programatic access
    if (UserName.substr(-5) === '_keys') {
      const credentials = await this.generateProgrammaticAccessKeys(UserName, this.iam);

      return this.ses.sendProgrammaticAccessKeys(UserName, credentials, accountName);
    }
      const password = await this.generateUserLoginProfile(UserName, this.iam);

      return this.ses.sendUserCredentialsEmail(UserName, password, accountName);

  }

  // TODO: Refactor to async func
  deleteUser (UserName) {
    return new Promise((resolve, reject) => {
      this.log.info({ UserName }, 'Deleting old user...');

      this.iam.listGroupsForUser({ UserName }).promise().then(userGroups => {
        this.log.info({ userGroups }, 'Removing user from groups...');

        const groupRemovalPromises = userGroups.Groups.map(group => {
          this.log.info({ name: group.GroupName }, 'Removing user from group...');

          return this.groups.removeUserFromGroup(UserName, group.GroupName, this.iam);
        });

        Promise.all(groupRemovalPromises).then(() =>
          this.iam.deleteUser({ UserName }).promise().then(resolve).catch(reject)
        ).catch(reject);
      }).catch(error => reject(error));
    });
  }

  async update (json, iam, accountName) {
    this.log.info({ newData: json }, 'Updating users');

    const data = await iam.listUsers({
      PathPrefix: process.env.USERS_PATH,
    }).promise();

    const newUsers = json.users;
    const oldUsers = data.Users.map(u => u.UserName);

    const usersToAdd = difference(newUsers, oldUsers);
    const usersToDelete = difference(oldUsers, newUsers);

    this.log.info({
      newUsers,
      oldUsers,
      usersToAdd,
      usersToDelete,
    });

    return Promise.all(usersToAdd.map(user => this.createUser(user, iam, accountName))
      .concat(usersToDelete.map(user => this.deleteUser(user, iam))))
      .then(result => {
        this.log.info('Updating users finished');
        return result;
      })
      .catch(err => Promise.reject(err));
  }
}

module.exports = Users;
