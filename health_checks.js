const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const logger = require("./logger");
const m_alAws = require('./al_aws');
const INGEST_INVALID_ENCODING = {
    code: 400
};

async function checkCloudFormationStatus(stackName) {
    const cloudformation = new CloudFormationClient({
        maxRetries: 7,
        customBackoff:  m_alAws.customBackoff
    });
    const command = new DescribeStacksCommand({ StackName: stackName });
    try {
        const data = await cloudformation.send(command);
        const stackStatus = data.Stacks[0].StackStatus;
        if (
          stackStatus === 'CREATE_COMPLETE' ||
          stackStatus === 'UPDATE_COMPLETE' ||
          stackStatus === 'UPDATE_IN_PROGRESS' ||
          stackStatus === 'UPDATE_ROLLBACK_COMPLETE' ||
          stackStatus === 'UPDATE_ROLLBACK_IN_PROGRESS' ||
          stackStatus === 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS' ||
          stackStatus === 'REVIEW_IN_PROGRESS'
        ) {
            return null;
        } else {
            return errorMsg(
              'ALAWS00002',
              'CF stack has wrong status: ' + stackStatus
            );
        }
    } catch (err) {
        return errorMsg('ALAWS00001', stringify(err));
    }
}

function stringify(jsonObj) {
    return JSON.stringify(jsonObj, null, 0);
}

function errorMsg(code, message) {
    return {
        status: 'error',
        code: code,
        details: message
    };
}

function extractHttpErrorCode(error) {
    let httpErrorCode;
    if (typeof error === 'string') {
        httpErrorCode = parseInt(error.slice(0, 3));
        if (isNaN(httpErrorCode) && error.includes(':')) {
           const splitErrorMessage = error.split(':');
           httpErrorCode = parseInt(splitErrorMessage[1].replace(/\s/g, '').slice(0, 3));
        }
    } else {
        httpErrorCode = error.response.status;
    }
    return httpErrorCode;
}

function formatError(code, exception, type) {
    const httpCode = extractHttpErrorCode(exception);
    return {
        errorCode: code,
        message: `${code} failed at ${type} : ${exception.message}`,
        httpErrorCode: httpCode
    };
}

async function handleIngestEncodingInvalidError(err, { data, key, bucketName }) {
    if (err.httpErrorCode === INGEST_INVALID_ENCODING.code) {
        let bucket = bucketName ? bucketName : process.env.dl_s3_bucket_name;
        if (bucket) {

            try {
               data = await  m_alAws.uploadS3Object({ data, key, bucket });
            } catch (error) {
                logger.warn(`ALAWS00003 error while uploading the ${key} object in ${bucket} bucket : ${JSON.stringify(err)}`);
                return error;
            }
          
        }
        else return null;
    }
    else return err;
}

module.exports = {
    errorMsg,
    checkCloudFormationStatus,
    extractHttpErrorCode,
    formatError,
    handleIngestEncodingInvalidError
};