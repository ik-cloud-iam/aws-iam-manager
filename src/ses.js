const bunyan = require('bunyan');
const DynamoDB = require('./dynamodb');

/**
 * High-level wrapper for AWS SES Service
 */
class SES {
  constructor (AWS) {
    this.ses = new AWS.SES({ apiVersion: '2010-12-01' });
    this.log = bunyan.createLogger({ name: 'ses' });
    this.dynamoDb = new DynamoDB(new AWS.DynamoDB());
    this.mailsQueue = [];
  }

  /**
   * Enqueues send mail job. Mail will be sent to:
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
  enqueueSendUserCredentialsEmail (username, password, accountName) {
    const recipent = `${username}@${process.env.EMAIL_DOMAIN}`;
    const subject = '[AWS-IAM-Manager] Your AWS account is ready.';
    const body = `Your IAM User has been created.\n\nAccount: ${accountName}\nCredentials: ${username} / ${password}`;

    this.mailsQueue.push({
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
    });
  }

  /**
   * Enqueues send mail job. Mail will be sent to:
   * a) Team project mail - <project_name>@<domain_name> where domain name equals to env.EMAIL_DOMAIN
   * b) Service Administrator which is configured as env.MAIL_SENDER
   *
   * Containing IAM login credentials.
   *
   * If access keys relates to ROOT_ACCOUNT, then credentials are sent to administrator (MAIL_SENDER).
   *
   * @param {String} username - name of the user
   * @param {Object} credentials - access key and secret
   * @param {String} accountName - name of the account
   * @returns {boolean|Promise} - true or rejected promise
   */
   async enqueueSendProgrammaticAccessKeys (username, credentials, accountName) {
    const subject = '[AWS-IAM-Manager] Your AWS account is ready.';
    const body = `Your IAM User has been created.\n\nAccount: ${accountName}\nUsername: ${username}\nCredentials: ${JSON.stringify(credentials)}`;

    const dynamoDbItem = await this.dynamoDb.getItem(accountName);
    const mailObject = {
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
    };

    if (dynamoDbItem && dynamoDbItem.Item) {
      const recipent = dynamoDbItem.Item.ProjectMail.S;

      mailObject.Destination.ToAddresses.push(recipent);
      this.mailsQueue.push(mailObject);

      return true;
    } else if (accountName === process.env.ROOT_ACCOUNT) {
      this.mailsQueue.push(mailObject);

      return true;
    }

    return Promise.reject();
  }

  /**
   * Sends enqueued emails sequentially.
   */
  async sendEnqueuedEmails () {
    const report = [];

    this.log.info({
      count: this.mailsQueue.length,
    }, 'Processing emails from queue');

    await this.mailsQueue.forEach(async mailData => {
      const payload = await this.ses.sendEmail(mailData).promise();

      report.push(payload);
    });

    return report;
  }
}

module.exports = SES;
