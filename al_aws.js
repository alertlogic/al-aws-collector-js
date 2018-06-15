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
const DEFAULT_CONFIG_NAME = 'configs/lambda/common-collector.json';

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


var selfConfigUpdate = function (callback) {
    async.waterfall([
        function(callback) {
            getConfigChanges(function(err, config) {
                callback(err, config)
            });
        },
        function(newValues, callback) {
            getCurrentConfig(function(err, currentConfig) {
                callback(err, newValues, currentConfig)
            });
        },
        function(newValues, currentConfig, callback) {
            applyConfigChanges(newValues, currentConfig, function(err, newConfig) {
                callback(err, newConfig, currentConfig)
            })
        },
        function(newConfig, currentConfig, callback) {
            if (isConfigDifferent(newConfig, currentConfig)) {
                var lambda = new AWS.Lambda();
                var updateConfig = filterDisallowedConfigParams(newConfig);
                return lambda.updateFunctionConfiguration(updateConfig, callback);
            } else {
                callback(null);
            }
        }
    ],
    function(err, config) {
        if (err) {
            console.info('Lambda self-update config error: ', err);
        } else {
            if (config !== undefined) {
                console.info('Lambda self-update config successful. Config: ', config);
            } else {
                console.info('Lambda self-update config nothing to update');
            }
        }
        callback(err, config);
    });
};

function getConfigChanges(callback) {
    var s3 = new AWS.S3();
    var configName;
    
    // Use this default config in order to update old collectors
    configName = process.env.aws_lambda_update_config_name ? 
        process.env.aws_lambda_update_config_name : DEFAULT_CONFIG_NAME
    
    var params = {
        Bucket: process.env.aws_lambda_s3_bucket,
        Key: configName
    };
    s3.getObject(params, function(err, object) {
        if (err) {
            return callback(err);
        } else {
            try  {
                let config = JSON.parse(object.Body.toString());
                return callback(null, config);
            } catch(ex) {
                return callback('Unable to parse config cahnges.')
            }
        }
    });
}

function getCurrentConfig(callback) {
    var lambda = new AWS.Lambda();
    var params = {
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME
    };
    
    lambda.getFunctionConfiguration(params, callback);
}

function applyConfigChanges(newValues, config, callback) {
    var jsonConfig = JSON.stringify(config);
    var newConfig = JSON.parse(jsonConfig);

    try {
        Object.keys(newValues).forEach(
            function(item) {
                let path = newValues[item]['path'];
                let value = newValues[item]['value'];
                changeObject(newConfig, path, value);
            }
        );
        return callback(null, newConfig);
    }
    catch(ex) {
        return callback('Unable to apply new config values')
    }
}

function changeObject(obj, path, value) {
    if (typeof path == 'string') {
        return changeObject(obj, path.split('.'), value);
    }
    else if (path.length == 1) {
        return obj[path[0]] = value;
    } else {
        return changeObject(obj[path[0]], path.slice(1), value);
    }
}

function isConfigDifferent(config1, config2) {
    return JSON.stringify(config1) != JSON.stringify(config2);
}

function filterDisallowedConfigParams(config) {
    var newConfig = JSON.parse(JSON.stringify(config));
    // These are not either allowed to update or we don't have enough permission.
    delete(newConfig.FunctionArn);
    delete(newConfig.Role);
    delete(newConfig.CodeSize);
    delete(newConfig.LastModified);
    delete(newConfig.CodeSha256);
    delete(newConfig.Version);
    delete(newConfig.VpcConfig.VpcId);
    delete(newConfig.MasterArn);
    return newConfig;
}


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
    var params = {
        FunctionName : process.env.AWS_LAMBDA_FUNCTION_NAME,
        Environment : {
            Variables : vars
        }
    };
    return lambda.updateFunctionConfiguration(params, callback);
};

module.exports = {
    selfUpdate : selfUpdate,
    selfConfigUpdate : selfConfigUpdate,
    arnToName : arnToName,
    arnToAccId : arnToAccId,
    setEnv : setEnv,
    
    //DEPRECATED FUNCTIONS
    //please use statistics_templates.js instead
    getMetricStatistics : getMetricStatistics,
    getLambdaMetrics : getLambdaMetrics,
    getKinesisMetrics : getKinesisMetrics,
};
