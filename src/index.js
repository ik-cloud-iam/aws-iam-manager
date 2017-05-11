'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const Users = require('./users');
const Groups = require('./groups');
const Policies = require('./policies');
const STS = require('./sts');
const utils = require('./utils');
const DynamoDB = require('./dynamodb');

const log = bunyan.createLogger({ name: 'index' });
AWS.config.update({ region:'us-east-1' });

function getProcessableAccountNames(payload) {
  return payload.data.map(accountData => ({
    url: accountData.url,
    name: accountData.url.split('/').slice(-1)[0].split('?')[0],
  })).filter(account => !account.name.includes('.'));
}

async function downloadAccountData(contentsUrl, accountName, sts) {
  const authedContentsUrl = `${contentsUrl}${utils.getAuth('&')}`;

  const { data } = await axios.get(authedContentsUrl);
  const usersBlobUrl = data.find(f => f.name === 'users.yml').git_url;
  const groupsBlobUrl = data.find(f => f.name === 'groups.yml').git_url;
  const policiesBlobUrl = data.find(f => f.name === 'policies.yml').git_url;

  const usersData = await utils.getJson(usersBlobUrl);
  const groupsData = await utils.getJson(groupsBlobUrl);
  const policiesData = await utils.getJson(policiesBlobUrl);

  log.info({
    accountName,
    usersData,
    groupsData,
    policiesData,
  }, 'Blobs downloaded');

  return Promise.resolve({
    accountName,
    usersData,
    groupsData,
    policiesData,
    sts,
  });
}

async function processAccount(data) {
  const {
    accountName, usersData, policiesData, groupsData, sts,
  } = data;

  log.info({ accountName }, 'Processing account...');

  try {
    const assumedIam = await sts.assumeRole(accountName);
    const policies = new Policies(assumedIam);
    const groups = new Groups(assumedIam, policies);
    const users = new Users(assumedIam, groups);

    await users.update(usersData, assumedIam, accountName);
    await policies.update(policiesData, assumedIam);
    await groups.update(groupsData, assumedIam);
    await groups.updatePolicies(groupsData, assumedIam);

  } catch(err) {
    log.error({
      err,
      accountName,
    }, 'Error while processing account');
  }
}

module.exports.handler = (event, context, callback) => {
  log.info(event, 'SNS event received');
  const githubMessage = JSON.parse(event.Records[0].Sns.Message);
  const contentsUrl = `${githubMessage.repository.contents_url.replace('{+path}', '')}${utils.getAuth()}`;

  log.info({ contentsUrl }, 'Getting repo contents...');

  const dynamoDb = new DynamoDB(new AWS.DynamoDB());
  const sts = new STS(AWS, dynamoDb);

  axios.get(contentsUrl).then((payload) => {
    const accounts = getProcessableAccountNames(payload);

    log.info({ accounts }, 'Processing accounts...');

    const promises = Promise.map(accounts, account => {
      return downloadAccountData(account.url, account.name, sts).then(processAccount)
    }, { concurrency: 1 });

    promises.then((data) => callback(null, { data }))
  }).catch((err) => callback(null, { err }));
};