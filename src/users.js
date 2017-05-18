'use strict';

const bunyan = require('bunyan');
const difference = require('lodash.difference');
const crypto = require('crypto');
const SES = require('./ses');

/**
 * High level wrapper for AWS IAM Users
 */
class Users {
  constructor (iam, groups, assumedAWS) {
    this.iam = iam;
    this.groups = groups;
    this.ses = new SES(assumedAWS);
    this.log = bunyan.createLogger({ name: 'users' });
  }

  /**
   * Creates login profile for IAM User - generates and sets password
   *
   * @param {String} UserName - name of the user
   * @returns {String} - Password
   */
  async generateUserLoginProfile (UserName) {
    const Password = crypto.randomBytes(16).toString('base64');

    await this.iam.createLoginProfile({
      Password,
      PasswordResetRequired: true,
      UserName,
    }).promise();

    return Password;
  }

  /**
   * Generates programatic access to IAM User - Access Key and Secret Key.
   *
   * @param {String} UserName - name of the user
   * @returns {Promise<IAM.CreateAccessKeyResponse>} - Promise resolving with Access Key and Secret Key
   */
  generateProgrammaticAccessKeys (UserName) {
    return this.iam.createAccessKey({
      UserName,
    }).promise();
  }

  /**
   * Creates an IAM user.
   *
   * If UserName ends with '_keys' suffix then AIM assumes that this account purpose is programatic
   * access and instead of generating password it generates Access Key and Secret Key which are
   * send to project email.
   *
   * @param {String} UserName - name of the user
   * @param {String} accountName - name of the account
   * @returns {Promise.<SES.Types.SendEmailResponse>}
   */
  async createUser (UserName, accountName) {
    this.log.info({ UserName }, 'Creating new user...');

    await this.iam.createUser({
      UserName,
      Path: process.env.USERS_PATH,
    }).promise();

    // If UserName ends with keys we want to only create programatic access
    if (UserName.substr(-5) === '_keys') {
      const credentials = await this.generateProgrammaticAccessKeys(UserName);

      return this.ses.sendProgrammaticAccessKeys(UserName, credentials, accountName);
    }

    const password = await this.generateUserLoginProfile(UserName);

    return this.ses.sendUserCredentialsEmail(UserName, password, accountName);
  }

  listUserAccessKeys (UserName) {
    return this.iam.listAccessKeys({ UserName }).promise();
  }

  /**
   * Deletes IAM User login profile
   * @param UserName
   * @returns {Promise<D>}
   */
  deleteLoginProfile (UserName) {
    return this.iam.deleteLoginProfile({ UserName }).promise();
  }

  async deleteAccessKeys (UserName) {
    const accessKeys = await this.listUserAccessKeys(UserName);
    const promises = accessKeys.AccessKeyMetadata.map(item => this.iam.deleteAccessKey({
        AccessKeyId: item.AccessKeyId,
        UserName,
      }).promise());

    return Promise.all(promises);
  }

  /**
   * Does two things:
   *
   * - Removes user from all groups where he or she belongs to
   * - After that, removes user
   *
   * @param {String} UserName - name of the user
   */
  async deleteUser (UserName) {
    this.log.info({ UserName }, 'Deleting old user...');
    const userGroups = await this.iam.listGroupsForUser({ UserName }).promise();

    const groupRemovalPromises = userGroups.Groups.map(group => {
      this.log.info({ name: group.GroupName }, 'Removing user from group...');

      return this.groups.removeUserFromGroup(UserName, group.GroupName, this.iam);
    });

    if (UserName.substr(-5) === '_keys') {
      await this.deleteAccessKeys(UserName);
    } else {
      await this.deleteLoginProfile(UserName);
    }

    await Promise.all(groupRemovalPromises);
    return this.iam.deleteUser({ UserName }).promise();
  }

  /**
   * Updates AWS account IAM Users.
   *
   * @param {Object} json - users.yml parsed data
   * @param {String} accountName - name of the account
   * @returns {Promise<*>|Promise.<T>} - returns report of actions
   */
  async update (json, accountName) {
    this.log.info({ newData: json }, 'Updating users');

    const data = await this.iam.listUsers({
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

    return Promise.all(usersToAdd.map(user => this.createUser(user, accountName))
      .concat(usersToDelete.map(user => this.deleteUser(user))))
      .then(result => {
        this.log.info('Updating users finished');
        return result;
      })
      .catch(err => Promise.reject(err));
  }
}

module.exports = Users;
