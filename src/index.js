const AWS = require('aws-sdk');
const axios = require('axios');
const bunyan = require('bunyan');
const Users = require('./users')
const Groups = require('./groups');
const Policies = require('./policies');
const STS = require('./sts');
const SES = require('./ses');
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
 * Reverts IAM role back to original one and sends mails.
 *
 * @param {STS} sts - STS Class instance
 * @param {SES} ses - SES Class instance
 * @returns {*}
 */
function sendMails (sts, ses) {
  log.info('Sending emails from queue...');

  sts.revertToOriginRole();
  return ses.sendEnqueuedEmails();
}

/**
 * Downloads all data related to that account basing on unauthorized contentsUrl
 *
 * @param {String} contentsUrl - URL pointing to Github directory
 * @param {String} accountName - name of account
 *
 * @returns {{accountName: *, usersData: *, groupsData: *, policiesData: *, sts: *}} - account name,
 * parsed users, groups and policies JSON documents.
 */
async function downloadAccountData (contentsUrl, accountName) {
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
  };
}

/**
 * Performs IAM mutations on selected AWS account.
 *
 * @param {any} data - structure wrapper for accountName, usersDasta, policiesData, groupsData
 * and sts context
 * @returns {{usersUpdateResult: *, policiesUpdateResult: ({createResult, deleteResult}|*), groupsUpdateResult: *, policiesAssociationsUpdateResult: *}} - returns report of mutations
 */
async function processAccount (data) {
  const {
    accountName, usersData, policiesData, groupsData, sts, ses
  } = data;

  log.info({ accountName }, 'Processing account...');

  const assumedAWSContext = await sts.assumeRole(accountName);
  const assumedIam = new assumedAWSContext.IAM();

  const policies = new Policies(assumedIam);
  const groups = new Groups(assumedIam, policies);
  const users = new Users(assumedIam, ses, groups);

  const usersUpdateResult = await users.update(usersData, accountName);
  const policiesUpdateResult = await policies.update(policiesData);
  const groupsUpdateResult = await groups.update(groupsData);
  const policiesAssociationsUpdateResult = await groups.updatePolicies(groupsData);

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
 * @param {SES} ses - AWS-SDK SES wrapper
 * @returns {Array} - array of processing results
 */
async function processAccountsSequentially (accounts, sts, ses) {
  const results = [];

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];

    try {
      const data = await downloadAccountData(account.url, account.name);
      const result = await processAccount(Object.assign({}, data, { ses, sts }));

      results.push({
        account,
        result,
      });
    } catch (err) {
      log.warn({
        err,
        message: err.message,
        stack: err.stack,
        account,
      }, 'Error while processing one of the accounts');

      results.push({
        account,
        error: {
          err,
          message: err.message,
          stack: err.stack,
        },
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
  const ses = new SES(AWS);

  axios.get(contentsUrl).then(payload => {
    const accounts = getProcessableAccountNames(payload);

    log.info({ accounts }, 'Processing accounts...');

    processAccountsSequentially(accounts, sts, ses).then(data => {
      sendMails(sts, ses).then(sendEmailData => {
        callback(null, { data, sendEmailData });
      });
    });

  }).catch(err => callback(null, { err }));
};
