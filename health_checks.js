/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Halth check functions common for all collectors
 *
 * @end
 * -----------------------------------------------------------------------------
 */

const AWS = require('aws-sdk');
const async = require('async');


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
    var cloudformation = new AWS.CloudFormation();
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

function getHealthStatus(context, customChecks, callback) {
    async.parallel([
        function(asyncCallback) {
            checkCloudFormationStatus(process.env.stack_name, asyncCallback);
        }
    ].concat(customChecks),
    function(errMsg) {
        var status = {};
        if (errMsg) {
            console.warn('ALAWS00001 Health check failed with',  errMsg);
            status = {
                status: errMsg.status,
                error_code: errMsg.code,
                details: [errMsg.details]
            };
        } else {
            status = {
                status: 'ok',
                details: []
            };
        }
        return callback(null, status);
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

module.exports = {
    getHealthStatus : getHealthStatus,
    errorMsg : errorMsg
};