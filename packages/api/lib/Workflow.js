'use strict';

const privates = new WeakMap();

// Workflow instance private method
function messageTemplateKey() {
  const { stackName, name } = privates.get(this);

  return `${stackName}/workflows/${name}.json`;
}

class Workflow {
  /**
   * @param {Object} params
   * @param {string} params.bucket - the name of the Cumulus system bucket
   * @param {string} params.name - the workflow name
   * @param {Object} params.s3 - an S3 Service Object
   * @param {string} params.stackName - the name of the Cumulus stack
   */
  constructor(params = {}) {
    if (!params.bucket) throw new TypeError('bucket is required');
    if (!params.name) throw new TypeError('name is required');
    if (!params.s3) throw new TypeError('s3 is required');
    if (!params.stackName) throw new TypeError('stackName is required');

    privates.set(
      this,
      {
        bucket: params.bucket,
        name: params.name,
        s3: params.s3,
        stackName: params.stackName
      }
    );
  }

  /**
   * The s3:// URL of the workflow's message template
   */
  get messageTemplateUrl() {
    const { bucket } = privates.get(this);
    return `s3://${bucket}/${messageTemplateKey.call(this)}`;
  }

  /**
   * Store the workflow's message template
   *
   * @param {string} messageTemplate - the message template
   */
  async saveMessageTemplate(messageTemplate) {
    const { bucket, s3 } = privates.get(this);

    await s3.putObject({
      Bucket: bucket,
      Key: messageTemplateKey.call(this),
      Body: messageTemplate
    }).promise();
  }

  /**
   * Test if the workflow exists
   *
   * @returns {Promise<boolean>}
   */
  async exists() {
    const { bucket, s3 } = privates.get(this);

    try {
      await s3.headObject({
        Bucket: bucket,
        Key: messageTemplateKey.call(this)
      }).promise();

      return true;
    }
    catch (err) {
      if (err.code === 'NotFound') return false;

      throw err;
    }
  }
}
module.exports = Workflow;
