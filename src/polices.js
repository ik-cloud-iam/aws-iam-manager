class Polices {
  constructor(iam, bunyan) {
    this.iam = iam;
    this.log = bunyan.createLogger({ name: 'polices' });
  }

  async createPolicy(PolicyName, PolicyDocument) {
    this.log.info({ PolicyName, PolicyDocument }, 'Creating new policy...');

    return await this.iam.createPolicy({
      PolicyName,
      PolicyDocument,
      Path: process.env.USERS_PATH,
    }).promise();
  }

  async getPolicyArn(PolicyName) {
    this.log.info({ PolicyName }, 'Getting policy...');

    const payload = await this.iam.listPolicies({
      PathPrefix: process.env.USERS_PATH,
    }).promise();

    return payload.Policies.filter(policy => policy.PolicyName === PolicyName);
  }

  async detachFromAllEntities(PolicyArn) {
    const entitiesWithAttachedPolicy = await this.iam.listEntitiesForPolicy({
      PolicyArn,
      PathPrefix: process.env.USERS_PATH,
    }).promise();

    const detachRequests = entitiesWithAttachedPolicy.PolicyGroups.map(group =>
      this.iam.detachGroupPolicy({
        GroupName: group.GroupName,
        PolicyArn
      }).promise());

    this.log.info({ entitiesWithAttachedPolicy, PolicyArn }, 'Policy detached from requested entities');

    return await Promise.all(detachRequests);
  }

  async removePolicy (PolicyArn) {
    this.log.info({ PolicyArn }, 'Deleting old policy...');
    await detachFromAllEntities(PolicyArn);
    return this.iam.deletePolicy({ PolicyArn }).promise();
  };

  async update(json) {
    this.log.info({ newData: json }, 'Updating policies');

    const data = await this.iam.listPolicies({
      PathPrefix: process.env.USERS_PATH,
    }).promise();

    this.log.info(data, 'Old Policies list');

    // Because we have not power to get current policies document and compare them
    // We have to remove all policies and re-create them from scratch.
    // Policies are also immutable, it's possible to version them but AWS limits version count to 5.
    Promise.all(data.Policies.map(policy => this.removePolicy(policy.Arn))).then(deleteResult => {
      this.log.info({ deleteResult }, 'Old policies removed, creating new...');

      Promise.all(json.policies.map(policy => createPolicy(policy.name, JSON.stringify(policy.document))))
        .then(createResult => {
          this.log.info({ createResult }, 'New policies created');

          return resolve({ createResult, deleteResult });
      });
    });
  }
}

module.exports = Polices;
