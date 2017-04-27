'use strict';

const AWS = require('aws-sdk');
const YAML = require('js-yaml');
const axios = require('axios');
const bunyan = require('bunyan');
const Promise = require('bluebird');
const users = require('./users');
const groups = require('./groups');
const policies = require('./polices');
const sts = require('./sts');

const log = bunyan.createLogger({ name: 'aws-iam-manager' });

// Serverless Framework always returns something under `process.env.GITHUB_ACCESS_TOKEN`, probably object
// TODO: Find a solution
const getAuth = (joinChar = '?') => process.env.hasOwnProperty('GITHUB_ACCESS_TOKEN')
  ? `${joinChar}access_token=${process.env.GITHUB_ACCESS_TOKEN}` : '';

async function getJson(url) {
  const authedUrl = `${url}${getAuth()}`;
  log.info({ authedUrl }, 'Downloading...');

  const { data } = await axios.get(authedUrl);
  const formattedData = new Buffer(data.content, data.encoding).toString('ascii');

  log.info({ formattedData, url }, 'Decoded blob');
  return YAML.safeLoad(formattedData);
};

async function processAccount(contentsUrl, sts) {
  const accountName = contentsUrl.split('/').slice(-1)[0].split('?')[0];
  const authedContentsUrl = `${contentsUrl}${getAuth('&')}`

  // Check if file has extension === is not a folder
  if (accountName.includes('.')) {
    log.info({ accountName }, 'Skipping... Probably not a directory');
    return;
  }

  log.info({ contentsUrl, accountName }, 'Processing account...');

  try {
    const assumedIam = await sts.assumeRole(accountName);

    const { data } = await axios.get(authedContentsUrl);
    log.info({ data }, 'Contents data');

    const usersBlobUrl = data.filter(f => f.name === 'users.yml')[0].git_url;
    const groupsBlobUrl = data.filter(f => f.name === 'groups.yml')[0].git_url;
    const policiesBlobUrl = data.filter(f => f.name === 'policies.yml')[0].git_url;

    const usersData = await getJson(usersBlobUrl);
    const groupsData = await getJson(groupsBlobUrl);
    const policiesData = await getJson(policiesBlobUrl);

    log.info({
      data,
      usersData,
      groupsData,
      policiesData,
    }, 'Blobs downloaded');

    await users.update(usersData, assumedIam, accountName);
    await policies.update(policiesData, assumedIam);
    await groups.update(groupsData, assumedIam);
    await groups.updatePolicies(groupsData, assumedIam);

  } catch(err) {
    log.error({
      err,
      accountName,
      authedContentsUrl,
    }, 'Error while processing account');
  }
};

module.exports.handler = (event, context, callback) => {
  const returnError = error => {
    log.fatal({ error }, 'Internal error');
    return callback(null, { statusCode: 400, error });
  };

  const returnSuccess = data => {
    log.info({ data }, 'Finish');
    return callback(null, { statusCode: 200, data });
  };

  log.info(event, 'SNS event received');
  const githubMessage = JSON.parse(event.Records[0].Sns.Message);
  const contentsUrl = `${githubMessage.repository.contents_url.replace('{+path}', '')}${getAuth()}`;

  log.info({ contentsUrl }, 'Getting repo contents...');

  const sts = new STS(AWS, bunyan, new AWS.DynamoDB());

  axios.get(contentsUrl).then((payload) => {
    log.info({ data: payload.data }, 'Processing accounts...');

    const promises = payload.data.map(accountFolder => ({
      fn: processAccount,
      url: accountFolder.url,
    }));

    return Promise.map(promises, promise => promise.fn(promise.url, sts), {
        concurrency: 1
      })
      .then(returnSuccess)
      .catch(returnError);
  }).catch((err) => {
    returnError(err);
  });
};