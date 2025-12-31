const assert = require('assert');
const alAwsStats = require('../../modern/al_aws_stats_templates');
const { CloudWatch } = require('@aws-sdk/client-cloudwatch');
const al_stub = require('../al_stub');

describe('al_aws_stats_templates tests', function () {
    describe('getMetricStatisticsAsync', function () {
        afterEach(() => {
            al_stub.restore(CloudWatch, 'getMetricStatistics');
        })
        it('should return the metric statistics', async function () {
            al_stub.mock(CloudWatch, 'getMetricStatistics', (param) => {
                return Promise.resolve({
                    Label: 'TestMetric',
                    Datapoints: [{ Timestamp: new Date(), Sum: 10 }]
                });
            });
            const params = {
                MetricName: 'TestMetric',
                Namespace: 'AWS/Lambda',
                Statistics: ['Sum'],
                StartTime: new Date(Date.now() - 15 * 60 * 1000),
                EndTime: new Date(),
                Period: 900
            }
            const result = await alAwsStats.getMetricStatisticsAsync(params);
            assert(result);
        });
        it('should handle error and return StatisticsError', async function () {
            al_stub.mock(CloudWatch, 'getMetricStatistics', async (param) => {
                return Promise.reject(new Error('Test error'));
            });
            const params = {
                MetricName: 'TestMetric',
                Namespace: 'AWS/Lambda',
                Statistics: ['Sum'],
                StartTime: new Date(Date.now() - 15 * 60 * 1000),
                EndTime: new Date(),
                Period: 900
            }
            const result = await alAwsStats.getMetricStatisticsAsync(params);
            assert(result);
            assert(result.StatisticsError);
        });
    });
    describe('getLambdaMetrics', function () {
        afterEach(() => {
            al_stub.restore(CloudWatch, 'getMetricStatistics');
        });

        it('should return the lambda metrics', async function () {
            al_stub.mock(CloudWatch, 'getMetricStatistics', async (param) => {
                return Promise.resolve({
                    FunctionName: 'TestFunction',
                    MemorySize: 128,
                    Timeout: 3
                });
            });

            const result = await alAwsStats.getLambdaMetrics('TestFunction', 'Invocations');
            assert(result);
        });
    });

    describe('getCustomMetrics', function () {
        afterEach(() => {
            al_stub.restore(CloudWatch, 'getMetricStatistics');
        });

        it('should return the custom metrics', async function () {
            al_stub.mock(CloudWatch, 'getMetricStatistics', async (param) => {
                return Promise.resolve({
                    FunctionName: 'TestFunction',
                    MemorySize: 128,
                    Timeout: 3
                });
            });

            const result = await alAwsStats.getCustomMetrics('TestFunction', 'CustomMetric', 'Custom/Namespace', [{ Name: 'Dimension1', Value: 'Value1' }]);
            assert(result);
        });
    });

    describe('getKinesisMetrics', function () {
        afterEach(() => {
            al_stub.restore(CloudWatch, 'getMetricStatistics');
        });
        it('should return the kinesis metrics', async function () {
            al_stub.mock(CloudWatch, 'getMetricStatistics', async (param) => {
                return Promise.resolve({
                    StreamName: 'TestStream',
                    ShardCount: 2
                });
            });
            const result = await alAwsStats.getKinesisMetrics('TestStream', 'GetRecords.Success');
            assert(result);
        });
    });
});
