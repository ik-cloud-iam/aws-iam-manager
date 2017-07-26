const axios = require('axios');
const YAML = require('js-yaml');

/**
 * Returns Github Access Token in a query format.
 *
 * @param {String} joinChar - char used to join query
 * @returns {String} Result of appending.
 */
function getAuth (joinChar = '?') {
  if (process.env.GITHUB_ACCESS_TOKEN) {
    return `${joinChar}access_token=${process.env.GITHUB_ACCESS_TOKEN}`;
  }

  return '';
}

/**
 * Returns YAML to JSON parsed data from URL.
 *
 * @param {String} url - URL of resource
 * @returns {Object} in JSON format, representation of YAML
 */
async function getJson (url) {
  const authedUrl = `${url}${getAuth()}`;
  const { data } = await axios.get(authedUrl);
  const formattedData = new Buffer(data.content, data.encoding).toString('ascii');

  return YAML.safeLoad(formattedData);
}

module.exports = {
  getAuth,
  getJson,
};
