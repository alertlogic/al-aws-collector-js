/* -----------------------------------------------------------------------------
 * @copyright (C) 2025, Alert Logic, Inc
 * @doc
 *
 * Statistics functions - to be used from the collectors code,
 * as base for custom statistics funs
 *
 * @end
 * -----------------------------------------------------------------------------
 */

const { CloudWatch } = require("@aws-sdk/client-cloudwatch");
const moment = require('moment');

const AWS_STATISTICS_PERIOD_MINUTES = 15;
const MAX_ERROR_MSG_LEN = 1024;



var getMetricStatisticsAsync = async function (params) {
    var cloudwatch = new CloudWatch({ apiVersion: '2010-08-01' });
    try {
        const data = await cloudwatch.getMetricStatistics(params);
        return {
            Label: data.Label,
            Datapoints: data.Datapoints
        };
    } catch (err) {
        return {
            Label: params.MetricName,
            StatisticsError: JSON.stringify(err).slice(0, MAX_ERROR_MSG_LEN)
        };
    }
};

var getLambdaMetrics = async function (functionName, metricName) {
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
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toDate(),
        EndTime: new Date(),
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return await getMetricStatisticsAsync(params);
};
/**
 * 
 * @param {*} functionName - Lambda function name
 * @param {*} metricName -Custom metrics name
 * @param {*} namespace - Custom namespace 
 * @param {*} customDimesions - Extra dimentions object other than function name if you added while creating the custom metrics
 * @returns 
 */
var getCustomMetrics = async function (functionName, metricName, namespace, customDimesions) {
    let dimensions =
        [
            {
                Name: 'FunctionName',
                Value: functionName
            }
        ];
    if (customDimesions) {
        dimensions.push(customDimesions);
    }
    var params = {
        Dimensions: dimensions,
        MetricName: metricName,
        Namespace: namespace,
        Statistics: ['Sum'],
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toDate(),
        EndTime: new Date(),
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return await getMetricStatisticsAsync(params);
};

var getKinesisMetrics = async function (streamName, metricName) {
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
        StartTime: moment().subtract(AWS_STATISTICS_PERIOD_MINUTES, 'minutes').toDate(),
        EndTime: new Date(),
        Period: 60 * AWS_STATISTICS_PERIOD_MINUTES   /* 15 mins as seconds */
    };
    return await getMetricStatisticsAsync(params);
};

var getAllKinesisMetricsFuns = function (streamName) {
    return [
        async function () {
            return await getKinesisMetrics(streamName, 'IncomingRecords');
        },
        async function () {
            return await getKinesisMetrics(streamName, 'IncomingBytes');
        },
        async function () {
            return await getKinesisMetrics(streamName, 'ReadProvisionedThroughputExceeded');
        },
        async function () {
            return await getKinesisMetrics(streamName, 'WriteProvisionedThroughputExceeded');
        }
    ];
};

module.exports = {
    getLambdaMetrics: getLambdaMetrics,
    getKinesisMetrics: getKinesisMetrics,
    getMetricStatisticsAsync: getMetricStatisticsAsync,

    // functions which return funs:
    getAllKinesisMetricsFuns: getAllKinesisMetricsFuns,
    getCustomMetrics: getCustomMetrics,
};