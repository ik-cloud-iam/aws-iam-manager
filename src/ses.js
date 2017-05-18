'use strict';

const bunyan = require('bunyan');
const DynamoDB = require('./dynamodb');

/**
 * High-level wrapper for AWS SES Service
 */
class SES {
  constructor (AWS) {
    this.ses = new AWS.SES({ apiVersion: '2010-12-01' });
    this.log = bunyan.createLogger({ name: 'ses' });
    this.dynamoDb = new DynamoDB(new AWS.DynamoDB())
  }

  /**
   * Sends an email to:
   * a) Recipent - <username>@<domain_name> where domain name equals to env.EMAIL_DOMAIN
   * b) Service Administrator which is configured as env.MAIL_SENDER
   *
   * Containing IAM login credentials.
   *
   * @param {String} username - username of user
   * @param {String} password - password
   * @param {String} accountName - name of the account
   * @returns {Promise<SES.Types.SendEmailResponse>} - send email promise
   */
  sendUserCredentialsEmail (username, password, accountName) {
    const recipent = `${username}@${process.env.EMAIL_DOMAIN}`;
    const subject = '[AWS-IAM-Manager] Your AWS account is ready.';
    const body = `Your IAM User has been created.\n\nAccount: ${accountName}\nCredentials: ${username} / ${password}`;

    this.log.info({
      Source: process.env.MAIL_SENDER,
      To: recipent,
    }, 'User created, sending email');

    return this.ses.sendEmail({
      Source: process.env.MAIL_SENDER,
      Destination: {
        ToAddresses: [
          process.env.MAIL_SENDER,
          recipent,
        ],
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Text: {
            Data: body,
          },
        },
      },
    }).promise();
  }

  /**
   * Sends en email to:
   * a) Team project mail - <project_name>@<domain_name> where domain name equals to env.EMAIL_DOMAIN
   * b) Service Administrator which is configured as env.MAIL_SENDER
   *
   * Containing IAM login credentials.
   *
   * If access keys relates to ROOT_ACCOUNT, then credentials are sent to administrator (MAIL_SENDER).
   *
   * @param {String} username - name of the user
   * @param {String} credentials - access key and secret
   * @param {String} accountName - name of the account
   * @returns {Promise<SES.Types.SendEmailResponse>} - send email promise
   */
   async sendProgrammaticAccessKeys (username, credentials, accountName) {
    const subject = '[AWS-IAM-Manager] Your AWS account is ready.';
    const body = `Your IAM User has been created.\n\nAccount: ${accountName}\nUsername: ${username}\nCredentials: ${JSON.stringify(credentials)}`;

    const dynamoDbItem = await this.dynamoDb.getItem(accountName);

    if (dynamoDbItem && dynamoDbItem.Item) {
      const recipent = dynamoDbItem.Item.ProjectMail.S;

      this.log.info({
        Source: process.env.MAIL_SENDER,
        To: recipent,
      }, 'Programatic user created, sending email');

      return this.ses.sendEmail({
        Source: process.env.MAIL_SENDER,
        Destination: {
          ToAddresses: [
            process.env.MAIL_SENDER,
            recipent,
          ],
        },
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            Text: {
              Data: body,
            },
          },
        },
      }).promise();
    } else if (accountName === process.env.ROOT_ACCOUNT) {
      this.log.info({
        Source: process.env.MAIL_SENDER,
        To: process.env.MAIL_SENDER,
      }, 'Programatic user created, sending email to administrator');

      return this.ses.sendEmail({
        Source: process.env.MAIL_SENDER,
        Destination: {
          ToAddresses: [
            process.env.MAIL_SENDER,
          ],
        },
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            Text: {
              Data: body,
            },
          },
        },
      }).promise();
    }

    return Promise.reject();
  }
}

module.exports = SES;
