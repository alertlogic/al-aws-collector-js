
const {
    Lambda
} = require("@aws-sdk/client-lambda"),
    {
        S3
    } = require("@aws-sdk/client-s3"),
    {
        CloudFormation
    } = require("@aws-sdk/client-cloudformation");

const logger = require('../logger'); 
const alUtil = require('./util');


//Declare CONSTANTS here as needed
const INGEST_INVALID_ENCODING = {
    code: 400
};
const MIN_RANDOM_VALUE = 100;
const MAX_RANDOM_VALUE = 3000;
const LAMBDA_CONFIG = {
        maxAttempts: 10
};
const LAMBDA_UPDATE_RETRY = {
    times: 20,
    // intervals of 200, 400, 800, 1600, 3200, ... ms)
    interval: function (retryCount) {
        return Math.min(100 * Math.pow(2, retryCount), 5000);
    }
};

/**
 * 
 * @returns {Promise} Promise resolving to S3 config changes object
 */
var getS3ConfigChangesAsync = async function () {
    var s3 = new S3();

    var params = {
        Bucket: process.env.aws_lambda_s3_bucket,
        Key: process.env.aws_lambda_update_config_name
    };
    try {
        const response = await s3.getObject(params);
        return response.Body.transformToString().then(res => {
            let config = JSON.parse(res);
            return config;
        });
    } catch (error) {
        logger.error('AWSC0103 Unable to parse config changes');
        throw error;
    }
};

/**
 * 
 * @returns 
 */
var getLambdaConfigAsync = async function () {
    var lambda = new Lambda(LAMBDA_CONFIG);
    var params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };
    return await lambda.getFunctionConfiguration(params);
};

var updateLambdaConfigAsync = async function (config) {
    await waitForFunctionUpdateAsync();
    var lambda = new Lambda(LAMBDA_CONFIG);
    return await lambda.updateFunctionConfiguration(config);
};

var waitForFunctionUpdateAsync = async function () {
    let lambda = new Lambda(LAMBDA_CONFIG);
    const getConfigParams = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };
    return await retryAsync(async function () {
        const config = await lambda.getFunctionConfiguration(getConfigParams);
        if (config.LastUpdateStatus === 'InProgress') {
            const inProgressError = {
                message: 'Function update is in progress',
                code: 409
            };
            throw inProgressError;
        } else {
            return config;
        }
    }, LAMBDA_UPDATE_RETRY);
};

var selfUpdateAsync = async function () {
    var params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        S3Bucket: process.env.aws_lambda_s3_bucket,
        S3Key: process.env.aws_lambda_zipfile_name
    };
    var lambda = new Lambda(LAMBDA_CONFIG);
    logger.info(`AWSC0100 Performing lambda self-update with params: ${JSON.stringify(params)}`);
    try {
        const data = await lambda.updateFunctionCode(params);
        logger.info('AWSC0102 Lambda self-update successful.  Data: ' + JSON.stringify(data));
        return data;
    } catch (err) {
        logger.info(`AWSC0101 Lambda self-update error: ${JSON.stringify(err)}`);
        throw err;
    }
};
var setEnvAsync = async function (vars) {
    const lambda = new Lambda(LAMBDA_CONFIG);
    try {
        const config = await waitForFunctionUpdateAsync();
        const params = {
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
            Environment: {
                Variables: {
                    ...config.Environment.Variables,
                    ...vars
                }
            }
        };
        return await lambda.updateFunctionConfiguration(params);
    } catch (error) {
        logger.error('AWSC0104 Error getting function config, environment variables were not updated', error);
        throw error;
    }
};
var uploadS3ObjectAsync = async function ({ data, key, bucket }) {
    var s3 = new S3();
    // Setting up S3 putObject parameters
    const parseData = typeof data !== 'string' ? JSON.stringify(data) : data;
    if (bucket) {
        const params = {
            Bucket: bucket,
            Key: key,
            Body: parseData
        };
        try {
           return await s3.putObject(params);
        } catch (error) {
            throw new Error('AWSC0108 s3 bucketName can not be null or undefined');
        }
    }
};

/**
 * checks status of CF, returns error in case if it's in failed state, returns error.
 * All custom healthchecks should follow the same interface as this function.
 *
 * @function
 *
 * @param {string} stackName - CloudFormation stack name to check status for
 *
 * @returns {Promise<null|ErrorMsg>} returns null if stack is in good state, otherwise returns error message object
 */


async function checkCloudFormationStatusAsync(stackName) {
    var cloudformation = new CloudFormation({
        maxAttempts: 7,
        retryDelayOptions: {
            customBackoff: customBackoff
        }
    });
    try {
        const data = await cloudformation.describeStacks({ StackName: stackName });
        var stackStatus = data.Stacks[0].StackStatus;
        if (stackStatus === 'CREATE_COMPLETE' ||
            stackStatus === 'UPDATE_COMPLETE' ||
            stackStatus === 'UPDATE_IN_PROGRESS' ||
            stackStatus === 'UPDATE_ROLLBACK_COMPLETE' ||
            stackStatus === 'UPDATE_ROLLBACK_IN_PROGRESS' ||
            stackStatus === 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS' ||
            stackStatus === 'REVIEW_IN_PROGRESS') {
            return null;
        } else {
            throw alUtil.errorMsg('ALAWS00002', 'CF stack has wrong status: ' + stackStatus);
        }
    } catch (error) {
        throw alUtil.errorMsg('ALAWS00001', alUtil.stringify(error));
    }
}

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn - The async function to retry.
 * @param {Object} options - Retry options.
 * @param {number} options.times - Number of attempts.
 * @param {Function} options.interval - Function to calculate delay (ms) based on attempt number.
 * @returns {Promise<*>} - Resolves with the result of fn, or rejects after all attempts fail.
 */
async function retryAsync(fn, { times, interval }) {
    let lastError;
    for (let attempt = 0; attempt < times; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < times - 1) {
                const delay = interval(attempt);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

var arnToName = function (arn) {
    const parsedArn = arn.split(':');
    if (parsedArn.length > 3) {
        const parsedId = parsedArn[parsedArn.length - 1].split('/');
        return parsedId[parsedId.length - 1];
    } else {
        return undefined;
    }
};

var arnToAccId = function (arn) {
    const parsedArn = arn.split(':');
    if (parsedArn.length > 4) {
        return parsedArn[4];
    } else {
        return undefined;
    }
};

function getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
}


var customBackoff = function (retryCount, err) {
    if (err && err.code && err.code.indexOf('Throttling') > -1) {
        logger.debug(`AWSC00011 customBackoff:- retryCount:${retryCount} Error:${err} `);
        const randomValue = getRandomIntInclusive(MIN_RANDOM_VALUE, MAX_RANDOM_VALUE) + (Math.pow(2, retryCount) * 100);
        logger.debug(`AWSC00011 customBackoff:- delay: ${randomValue}`);
        return randomValue;
    } else {
        return 0;
    }
};

/**
 * 
 * @param {*} error 
 * @param {*} param1 - S3 putObject parameters
 * @param {*} callback 
 * @returns 
 */
async function handleIngestEncodingInvalidError(err, { data, key, bucketName }) {
    if (err.httpErrorCode === INGEST_INVALID_ENCODING.code) {
        let bucket = bucketName ? bucketName : process.env.dl_s3_bucket_name;
        if (bucket) {
            try { return await uploadS3ObjectAsync({ data, key, bucket }); } 
            catch (err) {
                logger.warn(`ALAWS00003 error while uploading the ${key} object in ${bucket} bucket : ${JSON.stringify(err)}`);
            }
        }
        else return null;
    }
    else throw err;
}
module.exports = {
    getS3ConfigChangesAsync: getS3ConfigChangesAsync,
    getLambdaConfigAsync: getLambdaConfigAsync,
    updateLambdaConfigAsync: updateLambdaConfigAsync,
    selfUpdateAsync: selfUpdateAsync,
    setEnvAsync: setEnvAsync,
    uploadS3ObjectAsync: uploadS3ObjectAsync,
    waitForFunctionUpdateAsync: waitForFunctionUpdateAsync,
    retryAsync: retryAsync,
    checkCloudFormationStatusAsync: checkCloudFormationStatusAsync,
    arnToName: arnToName,
    arnToAccId: arnToAccId,
    customBackoff: customBackoff,
    handleIngestEncodingInvalidError: handleIngestEncodingInvalidError
};