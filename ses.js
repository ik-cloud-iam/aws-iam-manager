'use strict';

const AWS = require('aws-sdk');
const bunyan = require('bunyan');
const dynamodb = require('./dynamodb');

AWS.config.setPromisesDependency(Promise);

const log = bunyan.createLogger({ name: 'ses' });
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

async function sendUserCredentialsEmail(UserName, Password, accountName) {
  const recipent = `${UserName}@${process.env.EMAIL_DOMAIN}`;

  log.info({
    Source: process.env.MAIL_SENDER,
    To: recipent,
  },'User created, sending email');

  return await ses.sendEmail({
    Source: process.env.MAIL_SENDER,
    Destination: {
      ToAddresses: [
        process.env.MAIL_SENDER,
        recipent,
      ],
    },
    Message: {
      Subject: {
        Data: '[AWS-IAM-Manager] Your AWS account is ready.',
      },
      Body: {
        Text: {
          Data: `Your IAM User has been created.\n\nAccount: ${accountName}\nCredentials: ${UserName} / ${Password}`,
        },
      },
    },
  }).promise();
}

async function sendProgrammaticAccessKeys(UserName, credentials, accountName) {
  return await ses.sendEmail({
    Source: process.env.MAIL_SENDER,
    Destination: {
      ToAddresses: [
        process.env.MAIL_SENDER,
      ],
    },
    Message: {
      Subject: {
        Data: '[AWS-IAM-Manager] Your AWS account is ready.',
      },
      Body: {
        Text: {
          Data: `Your IAM User has been created.\n\nAccount: ${accountName}\nCredentials: ${UserName} / ${Password}`,
        },
      },
    },
  }).promise();
}

module.exports = {
  sendUserCredentialsEmail,
  sendProgrammaticAccessKeys,
};
