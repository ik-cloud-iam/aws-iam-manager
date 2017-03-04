'use strict';

const YAML = require('js-yaml');
const axios = require('axios');
const bunyan = require('bunyan');
const Promise = require('bluebird');

const log = bunyan.createLogger({
  name: 'aws-iam-manager',
});

const Elasticsearch = require('bunyan-elasticsearch');
const esStream = new Elasticsearch({
  indexPattern: '[logstash-]YYYY.MM.DD',
  type: 'logs',
  host: 'localhost:9200'
});

const users = require('./users');
const groups = require('./groups');
const policies = require('./polices');
const sts = require('./sts');

const getAuth = () => process.env.GITHUB_ACCESS_TOKEN &&
  `?access_token=${process.env.GITHUB_ACCESS_TOKEN}`;

async function getJson(url) {
  log.info({ url }, 'Downloading...');

  const { data } = await axios.get(`${url}${getAuth()}`);
  const formattedData = new Buffer(data.content, data.encoding).toString('ascii');
  return YAML.load(formattedData);
}

async function processAccount(contentsUrl) {
  log.info({ contentsUrl }, 'Processing account...');

  try {
    const { data } = await axios.get(contentsUrl);
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

    await users.update(usersData);
    await policies.update(policiesData);
    await groups.update(groupsData);
    await groups.updatePolicies(groupsData);

  } catch(err) {
    console.log(err);
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

  axios.get(contentsUrl).then(payload => {
    log.info({ data: payload.data }, 'Processing accounts...');

    const promises = payload.data.map(accountFolder => ({
      fn: processAccount,
      url: accountFolder.url,
    }));

    return Promise.map(promises, promise => promise.fn(promise.url), {
        concurrency: 1
      })
      .then(returnSuccess)
      .catch(returnError);
  });
};


