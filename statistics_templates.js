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

const moment = require('moment');

// const { getMetricStatistics } = require('./awssdkv3_utils');
const MAX_ERROR_MSG_LEN = 1024;


const AWS_STATISTICS_PERIOD_MINUTES = 15;
const { CloudWatchClient, GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");

var getMetricStatistics = async function (params, callback) {
    var cloudwatch = new CloudWatchClient({apiVersion: '2010-08-01'}); 

    const command = new GetMetricStatisticsCommand(params);

    try {
        const data = await cloudwatch.send(command);
        return callback(null, {
            Label: data.Label,
            Datapoints: data.Datapoints
        });

    } catch (err) {
        return callback(null, {
            Label: params.MetricName,
            StatisticsError: JSON.stringify(err).slice(0, MAX_ERROR_MSG_LEN)
        });
    }
};

var getLambdaMetrics =  function (functionName, metricName, callback) {
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
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES
    };
    return  getMetricStatistics(params, callback);
};

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
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES
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
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES
    };
    return getMetricStatistics(params, callback);
};

var getAllKinesisMetricsFuns = function (streamName) {
    [
        function (callback) {
            return getKinesisMetrics(streamName, 'IncomingRecords', callback);
        },
        function (callback) {
            return getKinesisMetrics(streamName, 'IncomingBytes', callback);
        },
        function (callback) {
            return getKinesisMetrics(streamName, 'ReadProvisionedThroughputExceeded', callback);
        },
        function (callback) {
            return getKinesisMetrics(streamName, 'WriteProvisionedThroughputExceeded', callback);
        }
    ]
}

module.exports = {
    getMetricStatistics: getMetricStatistics,
    getLambdaMetrics: getLambdaMetrics,
    getKinesisMetrics: getKinesisMetrics,
    // functions which return funs:
    getAllKinesisMetricsFuns: getAllKinesisMetricsFuns,
    getCustomMetrics: getCustomMetrics,
};