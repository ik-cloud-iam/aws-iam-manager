'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const Users = require('./users');
const Groups = require('./groups');
const Policies = require('./policies');
const STS = require('./sts');
const DynamoDB = require('./dynamodb');
const utils = require('./utils');

const log = bunyan.createLogger({ name: 'index' });

AWS.config.update({ region: process.env.REGION });

/**
 * Returns a list of processable accounts from response payload. Basicly filters out files which
 * are not directories basing on presence of '.' character.
 *
 * @param {Array} payload - response from Github request containing list of files
 * @returns {Array.<String>} - returns list of account names that can be processed
 */
function getProcessableAccountNames (payload) {
  return payload.data.map(accountData => ({
    url: accountData.url,
    name: accountData.url.split('/').slice(-1)[0].split('?')[0],
  })).filter(account => !account.name.includes('.'));
}

/**
 * Downloads all data related to that account basing on unauthorized contentsUrl
 *
 * @param {String} contentsUrl - URL pointing to Github directory
 * @param {String} accountName - name of account
 * @param {STS} sts - AWS STS wrapper class
 *
 * @returns {{accountName: *, usersData: *, groupsData: *, policiesData: *, sts: *}} - account name,
 * parsed users, groups and policies JSON documents.
 */
async function downloadAccountData (contentsUrl, accountName, sts) {
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

  return {
    accountName,
    usersData,
    groupsData,
    policiesData,
    sts,
  };
}

/**
 * Performs IAM mutations on selected AWS account.
 *
 * @param {accountName, usersData, policiesData, groupsData, sts} data - structure wrapper for accountName, usersDasta, policiesData, groupsData
 * and sts context
 * @returns {{usersUpdateResult: *, policiesUpdateResult: ({createResult, deleteResult}|*), groupsUpdateResult: *, policiesAssociationsUpdateResult: *}} - returns report of mutations
 */
async function processAccount (data) {
  const {
    accountName, usersData, policiesData, groupsData, sts,
  } = data;

  log.info({ accountName }, 'Processing account...');

  const assumedIam = await sts.assumeRole(accountName);
  const policies = new Policies(assumedIam);
  const groups = new Groups(assumedIam, policies);
  const users = new Users(assumedIam, groups);

  const usersUpdateResult = await users.update(usersData, assumedIam, accountName);
  const policiesUpdateResult = await policies.update(policiesData, assumedIam);
  const groupsUpdateResult = await groups.update(groupsData, assumedIam);
  const policiesAssociationsUpdateResult = await groups.updatePolicies(groupsData, assumedIam);

  return {
    usersUpdateResult,
    policiesUpdateResult,
    groupsUpdateResult,
    policiesAssociationsUpdateResult,
  };
}

/**
 * Takes every account in accounts array, downloads data related to that account and performs
 * necessary mutations.
 *
 * @param {Array} accounts - list of account names taken from Github repository folders
 * @param {STS} sts - AWS-SDK STS wrapper
 *
 * @returns {Array} - array of processing results
 */
async function processAccountsSequentially (accounts, sts) {
  const results = [];

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];

    try {
      const data = await downloadAccountData(account.url, account.name, sts);
      const result = await processAccount(data);

      results.push({
        account,
        result,
      });
    } catch (err) {
      results.push({
        account,
        err
      });
    }
  }

  return results;
}

module.exports.handler = (event, context, callback) => {
  log.info(event, 'SNS event received');

  const githubMessage = JSON.parse(event.Records[0].Sns.Message);
  const contentsUrl = `${githubMessage.repository.contents_url.replace('{+path}', '')}${utils.getAuth()}`;

  log.info({ contentsUrl }, 'Getting repo contents...');

  const dynamoDb = new DynamoDB(new AWS.DynamoDB());
  const sts = new STS(AWS, dynamoDb);

  axios.get(contentsUrl).then(payload => {
    const accounts = getProcessableAccountNames(payload);

    log.info({ accounts }, 'Processing accounts...');

    processAccountsSequentially(accounts, sts).then(data => {
      callback(null, { data });
    });
  }).catch(err => callback(null, { err }));
};

module.exports.processAccount = processAccount;
