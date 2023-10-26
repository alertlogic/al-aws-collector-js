/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Halth check functions common for all collectors
 *
 * @end
 * -----------------------------------------------------------------------------
 */

const { CloudFormation } = require("@aws-sdk/client-cloudformation");

const m_alAws = require('./al_aws');
const logger = require('./logger');
const INGEST_INVALID_ENCODING = {
    code: 400
}
/**
 * checks status of CF, returns error in case if it's in failed state, returns error.
 * All custom healthchecks should follow the same interface as this function.
 *
 * @function
 *
 * @param {Object} event - checkin event for Lambda function, can be used to send needed parameters for health checks. Example: stackName.
 * @param {Object} context - context of Lambda's function.
 * @param {function} callback - callback, which is called by health check when it's done.
 *
 * @returns {function} callback(err)
 *
 *                      {ErrorMsg}  err        - The ErrorMsg object if an error occurred, null otherwise.
 *
 */

function checkCloudFormationStatus(stackName, callback) {
    var cloudformation = new CloudFormation({
        maxRetries:7,
        retryDelayOptions: {
            customBackoff: m_alAws.customBackoff
        }
    });
    cloudformation.describeStacks({StackName: stackName}, function(err, data) {
        if (err) {
           return callback(errorMsg('ALAWS00001', stringify(err)));
        } else {
            var stackStatus = data.Stacks[0].StackStatus;
            if (stackStatus === 'CREATE_COMPLETE' ||
                stackStatus === 'UPDATE_COMPLETE' ||
                stackStatus === 'UPDATE_IN_PROGRESS' ||
                stackStatus === 'UPDATE_ROLLBACK_COMPLETE' ||
                stackStatus === 'UPDATE_ROLLBACK_IN_PROGRESS' ||
                stackStatus === 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS' ||
                stackStatus === 'REVIEW_IN_PROGRESS') {
                return callback(null);
            } else {
                return callback(errorMsg('ALAWS00002', 'CF stack has wrong status: ' + stackStatus));
            }
        }
    });
}


function stringify(jsonObj) {
    return JSON.stringify(jsonObj, null, 0);
}


/**
 * @typedef {Object} ErrorMsg
 * @property {string} status - status of healtcheck (ok, warning, error).
 * @property {string} code - unique error code.
 * @property {string} details - description of particular error.
 *
*/

/**
 * @function
 *
 * @param {string} code - error code
 * @param {string} message - error message
 *
 * @returns {ErrorMsg} returns error message object
 */

function errorMsg(code, message) {
    return {
        status: 'error',
        code: code,
        details: message
    };
}
/**
 * 
 * @param {*} error 
 * @returns httpErrorCode
 */
function extractHttpErrorCode(error) {
    let httpErrorCode;
    if (typeof (error) === 'string') {
        httpErrorCode = parseInt(error.slice(0, 3));
        if (isNaN(httpErrorCode) && error.includes(':')) {
            const splitErrorMessage = error.split(':');
            httpErrorCode = parseInt(splitErrorMessage[1].replace(/ /, '').slice(0, 3));
        }
    } else {
        httpErrorCode = error.response.status;
    }
    return httpErrorCode;
}

/**
 * 
 * @param {*} code 
 * @param {*} message 
 * @param {*} httpErrorCode 
 * @returns errorObject
 */
function formatError(code, exception, type) {
    const httpCode = extractHttpErrorCode(exception);
    let errorObject = {
        errorCode: code,
        message: `${code} failed at ${type} : ${exception.message}`,
        httpErrorCode: httpCode
    }
    return errorObject;
}

/**
 * 
 * @param {*} error 
 * @param {*} param1 - S3 putObject parameters
 * @param {*} callback 
 * @returns 
 */
function handleIngestEncodingInvalidError(err, { data, key, bucketName }, callback) {
    if (err.httpErrorCode === INGEST_INVALID_ENCODING.code) {
        let bucket = bucketName ? bucketName : process.env.dl_s3_bucket_name;
        if (bucket) {
            m_alAws.uploadS3Object({ data, key, bucket }, (err) => {
                if (err) {
                    logger.warn(`ALAWS00003 error while uploading the ${key} object in ${bucket} bucket : ${JSON.stringify(err)}`);
                }
                return callback(null);
            });
        }
        else return callback(null);
    }
    else return callback(err);
}

module.exports = {
    errorMsg : errorMsg,
    checkCloudFormationStatus : checkCloudFormationStatus,
    extractHttpErrorCode: extractHttpErrorCode,
    formatError: formatError,
    handleIngestEncodingInvalidError: handleIngestEncodingInvalidError
};

