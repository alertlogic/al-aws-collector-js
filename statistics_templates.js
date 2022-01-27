/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Statistics functions - to be used from the collectors code,
 * as base for custom statistics funs
 *
 * @end
 * -----------------------------------------------------------------------------
 */

const AWS = require('aws-sdk');
const async = require('async');
const moment = require('moment');

const m_alAws = require('./al_aws');

const AWS_STATISTICS_PERIOD_MINUTES = 15;
const MAX_ERROR_MSG_LEN = 1024;

/**
 * @typedef {Object} Stat
 * @property {string} Label - status of healtcheck (ok, warning, error).
 * @property {array} Datapoints - array of datapoints.
 *
*/

/**
 * @typedef {Object} StatError
 * @property {string} Label - status of healtcheck (ok, warning, error).
 * @property {string} StatisticsError - description of error happened during getting statistic
 *
*/


/**
 * All custom statistic funs should follow the same interface as this function.
 *
 * @function
 *
 * @param {function} callback - callback, which is called by health check when it's done.
 *
 * @returns {function} callback(err, result)
 *
 *     {Error}  err             - The Error object if an error occurred, null otherwise
 *     {Stat|StatError}  result - The Stat object, or StatError if error occured
 *
 */

// function customStatFunExample(callback) {
//     return callback(null, {
//         Label : 'CustomLabel',
//         Datapoints : [
//             {'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}
//         ]
//     });
// }

var getMetricStatistics = function (params, callback) {
    var cloudwatch = new AWS.CloudWatch({apiVersion: '2010-08-01'});
    cloudwatch.getMetricStatistics(params, function(err, data) {
        if (err) {
            return callback(null, {
                Label: params.MetricName,
                StatisticsError: JSON.stringify(err).slice(0, MAX_ERROR_MSG_LEN)
            });
        } else {
            return callback(null, {
                Label: data.Label,
                Datapoints: data.Datapoints
            });
        }
    });
};

var getLambdaMetrics = function (functionName, metricName, callback) {
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
    return getMetricStatistics(params, callback);
};
/**
 * 
 * @param {*} functionName - Lambda function name
 * @param {*} metricName -Custom metrics name
 * @param {*} namespace - Custom namespace 
 * @param {*} customDimesions - Extra dimentions object other than function name if you added while creating the custom metrics
 * @param {*} callback 
 * @returns 
 */
var getCustomMetrics = function (functionName, metricName, namespace, customDimesions, callback) {
    let dimensions =
        [
            {
                Name: 'FunctionName',
                Value: functionName
            }
        ]
    if (customDimesions) {
        dimensions.push(customDimesions);
    }
    var params = {
        Dimensions: dimensions,
        MetricName: metricName,
        Namespace: namespace,
        Statistics: ['Sum'],
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toISOString(),
        EndTime: new Date(),
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return getMetricStatistics(params, callback);
};

var getKinesisMetrics = function (streamName, metricName, callback) {
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
    return getMetricStatistics(params, callback);
};

var getAllKinesisMetricsFuns = function(streamName) {
    [
        function(callback) {
            return getKinesisMetrics(streamName, 'IncomingRecords', callback);
        },
        function(callback) {
            return getKinesisMetrics(streamName, 'IncomingBytes', callback);
        },
        function(callback) {
            return getKinesisMetrics(streamName, 'ReadProvisionedThroughputExceeded', callback);
        },
        function(callback) {
            return getKinesisMetrics(streamName, 'WriteProvisionedThroughputExceeded', callback);
        }
    ]
}

/**
 * 
 * @param {*} metricName - custom metric name 
 * @param {*} collectorType - Collector type 
 * @param {*} functionName - Lambda function name
 * @param {*} namespace - Custom namespace 
 * @param {*} StandardUnit - can be any value from this or string "Seconds"|"Microseconds"|"Milliseconds"|"Bytes"|"Kilobytes"|"Megabytes"|"Gigabytes"|"Terabytes"|"Bits"|"Kilobits"|"Megabits"|"Gigabits"|"Terabits"|"Percent"|"Count"|"Bytes/Second"|"Kilobytes/Second"|"Megabytes/Second"|"Gigabytes/Second"|"Terabytes/Second"|"Bits/Second"|"Kilobits/Second"|"Megabits/Second"|"Gigabits/Second"|"Terabits/Second"|"Count/Second"|"None"|string;
 * @param {*} unitValue -value as per StandardUnit selected
 * @param {*} callback 
 * @returns 
 */
var reportCWMetric = function (metricName, collectorType, functionName, namespace, standardUnit, unitValue, callback) {
    let cloudwatch = new AWS.CloudWatch({ apiVersion: '2010-08-01' });
    const params = {
        MetricData: [
            {
                MetricName: metricName,
                Dimensions: [
                    {
                        Name: 'CollectorType',
                        Value: collectorType
                    },
                    {
                        Name: 'FunctionName',
                        Value: functionName
                    }
                ],
                Timestamp: new Date(),
                Unit: standardUnit,
                Value: unitValue
            }
        ],
        Namespace: namespace
    };
    return cloudwatch.putMetricData(params, callback);
}

module.exports = {
    getMetricStatistics : getMetricStatistics,
    getLambdaMetrics : getLambdaMetrics,
    getKinesisMetrics : getKinesisMetrics,

    // functions which return funs:
    getAllKinesisMetricsFuns : getAllKinesisMetricsFuns,
    getCustomMetrics: getCustomMetrics,
    reportCWMetric: reportCWMetric
};