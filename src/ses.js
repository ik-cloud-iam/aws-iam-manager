'use strict';

class SES {
  constructor(AWS, bunyan) {
    this.ses = new AWS.SES({ apiVersion: '2010-12-01' });
    this.log = bunyan.createLogger({ name: 'ses' });
  }

  async sendUserCredentialsEmail(UserName, Password, accountName) {
    const recipent = `${UserName}@${process.env.EMAIL_DOMAIN}`;
    const subject = '[AWS-IAM-Manager] Your AWS account is ready.';
    const body = `Your IAM User has been created.\n\nAccount: ${accountName}\nCredentials: ${UserName} / ${Password}`;

    this.log.info({
      Source: process.env.MAIL_SENDER,
      To: recipent,
    },'User created, sending email');

    return await this.ses.sendEmail({
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
};

module.exports = SES;