const async = require('async');
const logger = require('./logger');
const { 
    s3Client,
    lambdaClient,
    PutObjectCommand,
    UpdateFunctionCodeCommand,
    GetObjectCommand,
    GetFunctionConfigurationCommand,
    UpdateFunctionConfigurationCommand } = require('./awssdkv3_utils');

const MIN_RANDOM_VALUE = 100;
const MAX_RANDOM_VALUE = 3000;

const LAMBDA_CONFIG = {
    maxRetries: 10,
};

const LAMBDA_UPDATE_RETRY = {
    retries: 20,
    minTimeout: 200,
    maxTimeout: 5000,
};

const createS3Client = ()  => {
    return  new S3Client({});
}



const selfUpdate = async (callback) => {
    const params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        S3Bucket: process.env.aws_lambda_s3_bucket,
        S3Key: process.env.aws_lambda_zipfile_name,
    };
    try {
        logger.info(`AWSC0100 Performing lambda self-update with params: ${JSON.stringify(params)}`);
        const response = await lambdaClient.send(new UpdateFunctionCodeCommand(params));
        logger.info('AWSC0102 Lambda self-update successful. Data: ' + JSON.stringify(response));
       return callback(response);
    } catch (err) {
        logger.info(`AWSC0101 Lambda self-update error: ${JSON.stringify(err)}`);
        return callback(err);
    }
};

const getS3ConfigChanges = async (callback) => {
    const params = {
        Bucket: process.env.aws_lambda_s3_bucket,
        Key: process.env.aws_lambda_update_config_name,
    };
    try {
        const command = new GetObjectCommand(params);
        const data = await s3Client.send(command);
        const config = JSON.parse(data.Body.toString());
        return callback(config);
    } catch (err) {
        return callback(new Error(`AWSC0103 ${err.messsage}`));
    }
};

const getLambdaConfig = async (callback) => {
    const params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    };
    try {
        const command = new GetFunctionConfigurationCommand(params);
        const response = await lambdaClient.send(command);
        return callback(response);
    } catch (err) {
        return callback(err);
    }
};

const updateLambdaConfig = async (config) => {
    await waitForFunctionUpdate();
    const params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        ...config,
    };
    try {
        const command = new UpdateFunctionConfigurationCommand(params);
        const response = await lambdaClient.send(command);
        return response;
    } catch (err) {
        logger.error('AWSC0107 Error getting function config, lambda config was not updated', err);
        throw err;
    }
};

const arnToName = (arn) => {
    const parsedArn = arn.split(':');
    return parsedArn.length > 3 ? parsedArn[parsedArn.length - 1].split('/').pop() : undefined;
};

const arnToAccId = (arn) => {
    const parsedArn = arn.split(':');
    return parsedArn.length > 4 ? parsedArn[4] : undefined;
};

var waitForFunctionUpdate =  function (callback) {
    const getConfigParams = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };
    const command = new GetFunctionConfigurationCommand(getConfigParams);

     async.retry(LAMBDA_UPDATE_RETRY, async function(asyncCallback) {
        try {
            const config = await lambda.send(command);
            if (config.LastUpdateStatus === 'InProgress') {
                const inProgressError = {
                     message: 'Function update is in progress',
                     code: 409
                };
                throw inProgressError;
            } else {
                return asyncCallback(null,config);
            }
        } catch (err) {
            if (config.LastUpdateStatus === 'InProgress') {
                return asyncCallback(err);
            } else {
                logger.warn('AWSC0105 Error getting function config', err);
                return asyncCallback(err);
            }
           
        }
    },callback);
};



const setEnv =  (vars, callback) => {
    waitForFunctionUpdate(async (err, config) => {
        // const getConfigParams = {
        //     FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        // };
        try {
            // const config = await lambdaClient.send(new GetFunctionConfigurationCommand(getConfigParams));
            const params = {
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                Environment: {
                    Variables: {
                        ...config.Environment.Variables,
                        ...vars,
                    },
                },
            };
            const response = await lambdaClient.send(new UpdateFunctionConfigurationCommand(params));
            return callback(null, response);
        } catch (err) {
            logger.error('AWSC0104 Error getting function config, environment variables were not updated', err);
            return callback(err);
        }
    });

};

const uploadS3Object = async ({ data, key, bucket }) => {
    const s3Client = createS3Client();
    const parsedData = typeof data !== 'string' ? JSON.stringify(data) : data;
    if (bucket) {
        const params = {
            Bucket: bucket,
            Key: key,
            Body: parsedData,
        };
        try {
            return await s3Client.send(new PutObjectCommand(params));
        } catch (err) {
            return err;
        }
    } else {
        return new Error('AWSC0108 s3 bucketName can not be null or undefined');
    }
};

const getRandomIntInclusive = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
};

const customBackoff = (retryCount, err) => {
    if (err && err.code && err.code.indexOf('Throttling') > -1) {
        logger.debug(`AWSC00011 customBackoff:- retryCount:${retryCount} Error:${err} `);
        const randomValue = getRandomIntInclusive(MIN_RANDOM_VALUE, MAX_RANDOM_VALUE) + Math.pow(2, retryCount) * 100;
        logger.debug(`AWSC00011 customBackoff:- delay: ${randomValue}`);
        return randomValue;
    } else {
        return 0;
    }
};

module.exports = {
    selfUpdate,
    getS3ConfigChanges,
    updateLambdaConfig,
    getLambdaConfig,
    arnToName,
    arnToAccId,
    setEnv,
    waitForFunctionUpdate,
    customBackoff,
    uploadS3Object,
};
