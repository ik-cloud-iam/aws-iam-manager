const getAuth = (joinChar = '?') => {
  if (process.env.hasOwnProperty('GITHUB_ACCESS_TOKEN')) {
    return `${joinChar}access_token=${process.env.GITHUB_ACCESS_TOKEN}`;
  }

  return '';
}

async function getJson(url) {
  const authedUrl = `${url}${getAuth()}`;
  log.info({ authedUrl }, 'Downloading...');

  const { data } = await axios.get(authedUrl);
  const formattedData = new Buffer(data.content, data.encoding).toString('ascii');

  log.info({ formattedData, url }, 'Decoded blob');
  return YAML.safeLoad(formattedData);
};

module.exports = {
  getAuth,
  getJson,
};
