const bunyan = require('bunyan');
const difference = require('lodash.difference');

class Groups {
  constructor (iam, policies) {
    this.iam = iam;
    this.policies = policies;
    this.log = bunyan.createLogger({ name: 'groups' });
  }

  /**
   * Adds user to a group.
   *
   * @param {String} UserName - name of user
   * @param {String} GroupName - name of group
   * @returns {Promise<D>}
   */
  addUserToGroup (UserName, GroupName) {
    this.log.info({ UserName, GroupName }, 'Assigning user to group');

    return this.iam.addUserToGroup({
      UserName,
      GroupName,
    }).promise();
  }

  /**
   * Removes user from a group.
   *
   * @param {String} UserName - name of user
   * @param {String} GroupName - name of group
   * @returns {Promise<D>}
   */
  removeUserFromGroup (UserName, GroupName) {
    return this.iam.removeUserFromGroup({
      UserName,
      GroupName,
    }).promise();
  }

  createGroup (GroupName) {
    this.log.info({ GroupName }, 'Creating new group...');
    return this.iam.createGroup({
      GroupName,
      Path: process.env.USERS_PATH,
    }).promise();
  }

  async attachGroupPolicy (GroupName, PolicyName) {
    this.log.info({ GroupName, PolicyName }, 'Attaching policy to group');

    const policies = await this.policies.getPolicy(PolicyName);

    if (policies.length === 0) {
      this.log.error({ PolicyName }, 'Requested policy not found!');
    }

    const PolicyArn = policies[0].Arn;

    this.log.info({ PolicyArn, PolicyName, GroupName }, 'Policy ARN attached');

    return this.iam.attachGroupPolicy({
      GroupName,
      PolicyArn,
    }).promise();
  }

  reassignUsers (data, group) {
    const oldGroupUsers = data.Users.map(u => u.UserName);
    const newGroupUsers = group.users;

    const usersToAdd = difference(newGroupUsers, oldGroupUsers);
    const usersToDelete = difference(oldGroupUsers, newGroupUsers);

    this.log.info({
      oldGroupUsers,
      newGroupUsers,
      usersToAdd,
      usersToDelete,
    });

    const resultPromise = Promise.all(
      usersToAdd.map(user => this.addUserToGroup(user, group.name))
        .concat(usersToDelete.map(user => this.removeUserFromGroup(user, group.name)))
    );

    resultPromise
      .then(result => this.log.info({ result }, 'Updating users-groups relations finished'))
      .catch(error => this.log.error({ error }, 'Error while assigning user to group'));

    return resultPromise;
  }

  /**
   * Checks whether group exists. If not, it creates one and assigns users to it.
   *
   * @param group
   * @param error
   * @returns {Promise}
   */
  forgeNewGroup (group, error) {
    return new Promise((resolve, reject) => {
      if (error.code === 'NoSuchEntity') {
        this.log.info({ name: group.name }, 'Group not found, creating...');

        return this.createGroup(group.name, this.iam).then(() => {
          this.reassignUsers({ Users: [] }, group, this.iam)
            .then(resolve)
        }).catch(reject);
      }

      return reject(error);
    });
  }

  update (json) {
    this.log.info({ newData: json }, 'Updating groups...');

    const promises = json.groups.map(group =>
      this.iam.getGroup({ GroupName: group.name }).promise().then(data => {
        this.log.info({ data }, 'Group info');

        return this.reassignUsers(data, group);
      }).catch(error => {
        this.log.warn({ error }, 'Error while updating group');

        return this.forgeNewGroup(group, error);
      })
    );

    return Promise.all(promises);
  }

  updatePolicies (json) {
    this.log.info({ newData: json }, 'Updating group policies...');

    const attachPolicyRequests = json.groups.map(group =>
      this.attachGroupPolicy(group.name, group.policy, this.iam));

    return Promise.all(attachPolicyRequests);
  }
}

module.exports = Groups;
