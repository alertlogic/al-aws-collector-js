/* -----------------------------------------------------------------------------
 * @copyright (C) 2017, Alert Logic, Inc
 * @doc
 *
 * Helper class for lambda function utility and helper methods.
 *
 * @end
 * -----------------------------------------------------------------------------
 */
'use strict';

const AWS = require('aws-sdk');
const moment = require('moment');
const async = require('async');

const AWS_STATISTICS_PERIOD_MINUTES = 15;
const MAX_ERROR_MSG_LEN = 1024;

var selfUpdate = function (callback) {
    var params = {
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      S3Bucket: process.env.aws_lambda_s3_bucket,
      S3Key: process.env.aws_lambda_zipfile_name
    };
    var lambda = new AWS.Lambda();
    console.info('Performing lambda self-update with params: ', JSON.stringify(params));
    lambda.updateFunctionCode(params, function(err, data) {
        if (err) {
            console.info('Lambda self-update error: ', err);
        } else {
            console.info('Lambda self-update successful.  Data: ' + data);
        }
        return callback(err);
    });
};

var getS3ConfigChanges = function(callback) {
    var s3 = new AWS.S3();

    var params = {
        Bucket: process.env.aws_lambda_s3_bucket,
        Key: process.env.aws_lambda_update_config_name
    };
    s3.getObject(params, function(err, object) {
        if (err) {
            return callback(err);
        } else {
            try  {
                let config = JSON.parse(object.Body.toString());
                return callback(null, config);
            } catch(ex) {
                return callback('Unable to parse config changes.')
            }
        }
    });
};

var getLambdaConfig = function(callback) {
    var lambda = new AWS.Lambda();
    var params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };

    lambda.getFunctionConfiguration(params, callback);
};

var updateLambdaConfig = function(config, callback) {
    var lambda = new AWS.Lambda();
    lambda.updateFunctionConfiguration(config, callback);
};

//DEPRECATED FUNCTION
//please use statistics_templates.js instead
var getMetricStatistics = function (params, statistics, callback) {
    var cloudwatch = new AWS.CloudWatch({apiVersion: '2010-08-01'});
    cloudwatch.getMetricStatistics(params, function(err, data) {
        if (err) {
            statistics.push({
                Label: params.MetricName,
                StatisticsError: JSON.stringify(err).slice(0, MAX_ERROR_MSG_LEN)
            });
        } else {
            statistics.push({
                Label: data.Label,
                Datapoints: data.Datapoints
            });
        }
        return callback(null, statistics);
    });
};

//DEPRECATED FUNCTION
//please use statistics_templates.js instead
var getLambdaMetrics = function (functionName, metricName, statistics, callback) {
    var params = {
        Dimensions: [
              {
                  Name: 'FunctionName',
                  Value: functionName
              }
        ],
        MetricName: metricName,
        Namespace: 'AWS/Lambda',
        Statistics: ['Sum'],
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toISOString(),
        EndTime: new Date(),
        Period: 60*AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return getMetricStatistics(params, statistics, callback);
};

//DEPRECATED FUNCTION
//please use statistics_templates.js instead
var getKinesisMetrics = function (streamName, metricName, statistics, callback) {
    var params = {
        Dimensions: [
              {
                  Name: 'StreamName',
                  Value: streamName
              }
        ],
        MetricName: metricName,
        Namespace: 'AWS/Kinesis',
        Statistics: ['Sum'],
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toISOString(),
        EndTime: new Date(),
        Period: 60*AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return getMetricStatistics(params, statistics, callback);
};

var arnToName = function (arn) {
    const parsedArn = arn.split(':');
    if (parsedArn.length > 3) {
        const parsedId = parsedArn[parsedArn.length-1].split('/');
        return parsedId[parsedId.length-1];
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

var setEnv = function(vars, callback) {
    const lambda = new AWS.Lambda();

    const getConfigParams = {
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };

    lambda.getFunctionConfiguration(getConfigParams, (err, config) => {
        if(err){
            console.error('Error getting function config, environment variables were not updated', err);
            return callback(err);
        }
        var params = {
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
            Environment : {
                Variables : {
                    ...config.Environment.Variables,
                    ...vars
                }
            }
        };
        return lambda.updateFunctionConfiguration(params, callback);
    });
};

module.exports = {
    selfUpdate : selfUpdate,
    getS3ConfigChanges : getS3ConfigChanges,
    updateLambdaConfig : updateLambdaConfig,
    getLambdaConfig : getLambdaConfig,
    arnToName : arnToName,
    arnToAccId : arnToAccId,
    setEnv : setEnv,
    
    //DEPRECATED FUNCTIONS
    //please use statistics_templates.js instead
    getMetricStatistics : getMetricStatistics,
    getLambdaMetrics : getLambdaMetrics,
    getKinesisMetrics : getKinesisMetrics,
};
