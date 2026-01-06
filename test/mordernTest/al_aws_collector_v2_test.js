const AlAwsCollectorV2 = require('../../modern/al_aws_collector_v2');
const assert = require('assert');
const sinon = require('sinon');
const m_response = require('cfn-response');
const colMock = require('../collector_mock');
const alAwsCommon = require('../../modern/al_aws_common');
const m_alCollector = require('@alertlogic/al-collector-js');
var alStub = require('../al_stub');
const { CloudFormation } = require("@aws-sdk/client-cloudformation"),
    { CloudWatch } = require("@aws-sdk/client-cloudwatch"),
    { KMS } = require("@aws-sdk/client-kms"),
    { Lambda } = require("@aws-sdk/client-lambda"),
    { S3 } = require("@aws-sdk/client-s3");
const context = {
    invokedFunctionArn: colMock.FUNCTION_ARN
};

var alserviceStub = {};
var responseStub = {};
var setEnvStub = {};

function setAlServiceStub() {
    alserviceStub.get = alStub.mock(m_alCollector.AlServiceC, 'get',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                var ret = null;
                switch (path) {
                    case '/residency/default/services/ingest/endpoint':
                        ret = {
                            ingest: 'new-ingest-endpoint'
                        };
                        break;
                    case '/residency/default/services/azcollect/endpoint':
                        ret = {
                            azcollect: 'new-azcollect-endpoint'
                        };
                        break;
                    case '/residency/default/services/collector_status/endpoint':
                        ret = {
                            collector_status: 'new-collector-status-endpoint'
                        };
                        break;
                    default:
                        break;
                }
                return resolve(ret);
            });
        });
    alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return resolve({ collector: { id: '12345' } });
            });
        });
    alserviceStub.put = alStub.mock(m_alCollector.AlServiceC, 'put',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return resolve();
            });
        });
    alserviceStub.del = alStub.mock(m_alCollector.AlServiceC, 'deleteRequest',
        function fakeFn(path) {
            return new Promise(function (resolve, reject) {
                return resolve();
            });
        });
}

function setAlServiceErrorStub() {
    alserviceStub.get = alStub.mock(m_alCollector.AlServiceC, 'get',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject(new Error('get error'));
            });
        });
    alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject(new Error('post error'));
            });
        });
    alserviceStub.put = alStub.mock(m_alCollector.AlServiceC, 'put',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject(new Error('put error'));
            });
        });
    alserviceStub.del = alStub.mock(m_alCollector.AlServiceC, 'deleteRequest',
        function fakeFn(path) {
            return new Promise(function (resolve, reject) {
                return reject(new Error('delete error'));
            });
        });
}

function restoreAlServiceStub() {
    alserviceStub.get.restore();
    alserviceStub.post.restore();
    alserviceStub.put.restore();
    alserviceStub.del.restore();
}

function mockSetEnvStub() {
    setEnvStub = sinon.stub(alAwsCommon, 'setEnvAsync').callsFake((vars) => {
        const {
            ingest_api,
            azcollect_api,
            collector_status_api
        } = vars;
        process.env.ingest_api = ingest_api ? ingest_api : process.env.ingest_api;
        process.env.azcollect_api = azcollect_api ? azcollect_api : process.env.azcollect_api;
        process.env.collector_status_api = collector_status_api ? collector_status_api : process.env.collector_status_api;
        const returnBody = {
            Environment: {
                Variables: vars
            }
        };
        return Promise.resolve(returnBody);
    });
}

describe('AlAwsCollectorV2 tests', function () {
    beforeEach(() => {
        colMock.initProcessEnv();
        alStub.mock(KMS, 'decrypt', (params) => {
            return Promise.resolve({
                Plaintext: Buffer.from('decryptedSecretKey')
            });
        });
        responseStub = sinon.stub(m_response, 'send').callsFake((event, mockContext, responseStatus, responseData, physicalResourceId) => {
            return mockContext.succeed();
        });
        setAlServiceStub();
        mockSetEnvStub();

    });

    afterEach(() => {
        restoreAlServiceStub()
        alStub.restore(KMS, 'decrypt');
        responseStub.restore();
        setEnvStub.restore();
    })

    describe('getRegistration', function () {

        it('register success with env vars set', async function () {
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    //sinon.assert.calledOnce(registrationResponse);
                    sinon.assert.called(responseStub);
                    sinon.assert.calledWith(alserviceStub.post);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.handleEvent(colMock.REGISTRATION_TEST_EVENT);

        });
        it('register success with env vars not set', async function () {
            alStub.mock(Lambda, 'updateFunctionConfiguration', () => {
                return Promise.resolve({
                    FunctionName: params.FunctionName,
                    MemorySize: params.MemorySize,
                    Timeout: params.Timeout
                });
            })

            const envIngestApi = process.env.ingest_api;
            const envAzcollectApi = process.env.ingest_api;
            const envCollectorStatusApi = process.env_collector_status_api;
            process.env.ingest_api = undefined;
            process.env.azcollect_api = undefined;
            process.env.collector_status_api = undefined;
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                    sinon.assert.calledThrice(alserviceStub.get);

                }
            };
            const creds = AlAwsCollectorV2.load();
            let collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            let updateEnpointsSpy = sinon.spy(collector, 'updateApiEndpoints')
            await collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS)

            sinon.assert.calledOnce(updateEnpointsSpy);
            assert.ok(process.env.ingest_api);
            assert.ok(process.env.azcollect_api);
            assert.ok(process.env.collector_status_api);
            assert.equal(process.env.ingest_api, "new-ingest-endpoint");
            assert.equal(process.env.azcollect_api, "new-azcollect-endpoint");
            process.env.ingest_api = envIngestApi;
            process.env.azcollect_api = envAzcollectApi;
            process.env.collector_status_api = envCollectorStatusApi;
            alStub.restore(Lambda, 'updateFunctionConfiguration');
        });

        it('register fail', async function () {
            const registrationResponse = alStub.mock(m_alCollector.AzcollectC, 'register', (param) => {
                return Promise.reject(new Error("Servcer error"));
            });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.called(registrationResponse);
                }
            };
            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);

        });
    });
    describe('checkin event', function () {

        before(function () {
            let callCount = 0;
            alStub.mock(CloudWatch, 'getMetricStatistics', async (param) => {

                let ret;
                if (param.MetricName === 'Invocations') {
                    ret = { ...colMock.CLOUDWATCH_GET_METRIC_STATS_OK };
                    ret.Label = param.MetricName;
                } else if (param.MetricName === 'Errors') {
                    ret = { ...colMock.CLOUDWATCH_GET_METRIC_STATS_ERROR };
                    ret.Label = param.MetricName;
                } else {
                    ret = { ...colMock.CLOUDWATCH_GET_METRIC_STATS_OK };
                    ret.Label = param.MetricName;
                }
                return Promise.resolve(ret);
            });

            alStub.mock(CloudFormation, 'describeStacks', async (param) => {
                return Promise.resolve(colMock.CF_DESCRIBE_STACKS_RESPONSE);
            });
        });
        after(function () {
            alStub.restore(CloudFormation, 'describeStacks');
            alStub.restore(CloudWatch, 'getMetricStatistics');
        });
        it('should send checkin event register succesfully', async function () {
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,

                succeed: function () {
                    sinon.assert.calledOnce(alserviceStub.post);
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                }
            };

            const creds = await AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], []);
            sinon.stub(collector, 'sendCollectorStatus').callsFake(async (collectorStatusStream, status) => {
                return Promise.resolve(null);
            });

            const testEvent = {
                RequestType: 'ScheduledEvent',
                Type: 'Checkin'
            };
            await collector.handleEvent(testEvent);

        });
        it('checkin via SNS success registered', async function () {
            var mockCtx = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: function (error) {
                    assert.fail(error);
                },
                succeed: function () {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                }
            };
            const creds = await AlAwsCollectorV2.load();
            let collector = new AlAwsCollectorV2(
                mockCtx, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], [], ['Audit.Sharepoint', 'Audit.Exchanges']);
            var setCollectorStatusHealthySpy = sinon.spy(collector, 'setCollectorStatus');
            var sendCollectorStatusSpy = sinon.spy(collector, 'sendCollectorStatus');
            const testEvent = colMock.CHECKIN_SNS_TRIGGER;
            await collector.handleEvent(testEvent);
            sinon.assert.calledTwice(setCollectorStatusHealthySpy);
            sinon.assert.calledTwice(sendCollectorStatusSpy);
        });
        it('checkin forced update success', async function () {
            var mockCtx = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: function (error) {
                    assert.fail(error);
                },
                succeed: function () {
                    sinon.assert.calledOnce(alserviceStub.post);
                }
            };
            alserviceStub.post.restore();
            alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
                function fakeFn(path, extraOptions) {
                    return Promise.resolve({ force_update: true });
                });
            let fakeSelfUpdate = alStub.mock(AlAwsCollectorV2, 'selfUpdate', () => {
                return Promise.resolve();
            });
            let fakeSelfConfigUpdate = alStub.mock(AlAwsCollectorV2, 'selfConfigUpdate',
                () => {
                    return Promise.resolve();
                });
            const creds = await AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(
                mockCtx, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], []);
            await collector.checkin();
            sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL);
            sinon.assert.called(fakeSelfConfigUpdate);
            sinon.assert.called(fakeSelfUpdate);
            fakeSelfUpdate.restore();
            fakeSelfConfigUpdate.restore();
        });
    });
    describe('selfUpdate', function () {
        it('should update lambda function successfully', async function () {
            alStub.restore(Lambda, 'updateFunctionCode');
            const updateLambdaFunctionCodeStub = alStub.mock(Lambda, 'updateFunctionCode', () => {
                return Promise.resolve({
                    FunctionName: 'TestFunction',
                    MemorySize: 128,
                    Timeout: 3
                });
            });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledOnce(updateLambdaFunctionCodeStub);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.selfUpdate();
            updateLambdaFunctionCodeStub.restore();
        });
        it('should handle error during lambda function update', async function () {
            const updateLambdaFunctionCodeStub = alStub.mock(Lambda, 'updateFunctionCode', () => {
                return Promise.reject(new Error('Update error'));
            });
            let failCalled = false;
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                fail: (error) => {
                    failCalled = true;
                    sinon.assert.calledOnce(updateLambdaFunctionCodeStub);
                    assert.ok(error);
                },
                succeed: function () {
                    sinon.assert.calledOnce(updateLambdaFunctionCodeStub);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], []);
            const testEvent = {
                "RequestType": "ScheduledEvent",
                "Type": "SelfUpdate"
            };
            await collector.handleEvent(testEvent);

            assert.ok(failCalled, 'mockContext.fail should be called on update error');
            updateLambdaFunctionCodeStub.restore();
        });

    });
    describe('deregister', function () {
        it('deregister success', async function () {
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledOnce(alserviceStub.del);
                    sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.handleEvent(colMock.DEREGISTRATION_TEST_EVENT);
        });
        it('deregister fail', async function () {
            restoreAlServiceStub();
            setAlServiceErrorStub();
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,

                succeed: () => {
                    sinon.assert.calledOnce(alserviceStub.del);
                    sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.deregisterSync(colMock.DEREGISTRATION_TEST_EVENT, colMock.DEREG_PARAMS);

        });
    });
    describe('Process method tests', function () {
        var sendStub;
        before(function () {
            sendStub = sinon.spy(AlAwsCollectorV2.prototype, 'send');
        });

        after(function () {
            sendStub.restore();
        });
        it('process success', async function () {
            var formatFun = function (event, context, callback) {
                return callback(null, event);
            };
            const creds = await AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(
                context, 'cwe', AlAwsCollectorV2.IngestTypes.LOGMSGS, '1.0.0', creds, formatFun);
            var data = 'some-data';
            await collector.process(data);
            sinon.assert.calledOnce(sendStub);
            sinon.assert.calledWith(sendStub, data);
        });
    })
    describe('send method tests', function () {

        it('send LMCSTATS successfully', async function () {
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledOnce(alserviceStub.post);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.LOGMSGS, '1.0.0', creds, function () { });
            var data = 'some-data-to-send';
            await collector.send(data, false, AlAwsCollectorV2.IngestTypes.LMCSTATS);
        });
        it('Send LMCSTATS fail', async function () {
            let logmsgErr = { "errorType": "StatusCodeError", "errorMessage": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "name": "StatusCodeError", "message": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "error": "{\"error\":\"body encoding invalid\"}", "response": { "status": 400 }, "options": { "method": "POST", "url": "https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs" } };
            let ingestCLogmsgsStub = alStub.mock(m_alCollector.IngestC, 'sendLmcstats',
                function fakeFn(data, callback) {
                    return Promise.reject(logmsgErr);
                });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                fail: (error) => {
                    assert.ok(error);
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.LMCSTATS, '1.0.0', creds, function () { });
            var data = 'some-data-to-send';
            await collector.send(data, true, AlAwsCollectorV2.IngestTypes.LMCSTATS);
        });
        it('send vpcflow success', async function () {
            const creds = await AlAwsCollectorV2.load();
            let collector = new AlAwsCollectorV2(
                context, 'cwe', AlAwsCollectorV2.IngestTypes.VPCFLOW, '1.0.0', creds);

            let ingestCVpcFlowStub = alStub.mock(m_alCollector.IngestC, 'sendVpcFlow',
                function fakeFn(data, callback) {
                    return Promise.resolve(data);
                });
            var data = 'some-data-to-send';
            await collector.send(data, true, AlAwsCollectorV2.IngestTypes.VPCFLOW);

            sinon.assert.calledOnce(ingestCVpcFlowStub);
        });
    });
    describe('sendCollectorStatus method tests', function () {
        it('sendCollectorStatus success', async function () {
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledOnce(alserviceStub.post);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.LOGMSGS, '1.0.0', creds, function () { });
            var status = {
                status: 'healthy',
                statistics: []
            };
            await collector.sendCollectorStatus('collector-status-stream', status);
        });
        it('sendCollectorStatus return success if collector status service return 304', async function () {
            let sendCollectorStatusStub = sinon.stub(m_alCollector.CollectorStatusC.prototype, 'sendStatus').callsFake(
                function fakeFn(statusId, stream, data) {
                    return Promise.reject({ message: "Not modified", response: { status: 304 } });
                });

            const creds = await AlAwsCollectorV2.load();
            const collector = new AlAwsCollectorV2(context, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, () => { });
            let updateEnpointsSpy = sinon.spy(collector, 'updateApiEndpoints');
            var data = {
                status: 'healthy',
                statistics: []
            };
            await collector.sendCollectorStatus('o365_audit', data);
            sinon.assert.calledOnce(updateEnpointsSpy);
            sinon.assert.calledOnce(sendCollectorStatusStub);
            sendCollectorStatusStub.restore();
        });

        it('sendCollectorStatus return error if collector status service fail', async function () {
            const expectedError = { message: "not able to connect", response: { status: 503 } };
            let sendCollectorStatusStub = sinon.stub(m_alCollector.CollectorStatusC.prototype, 'sendStatus').callsFake(
                function fakeFn(statusId, stream, data) {
                    return Promise.reject(expectedError);
                });

            const creds = await AlAwsCollectorV2.load();
            const collector = new AlAwsCollectorV2(context, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, () => { });
            var data = {
                status: 'healthy',
                statistics: []
            };

            // Use assert.rejects to test that the function throws the expected error
            await assert.rejects(
                async () => {
                    await collector.sendCollectorStatus('o365_audit', data);
                },
                (error) => {
                    assert.equal(error.message, expectedError.message);
                    return true;
                }
            );

            sinon.assert.calledOnce(sendCollectorStatusStub);
            sendCollectorStatusStub.restore();
        });
    });
    describe('selfConfigUpdate() function tests', function () {
        var collector;
        var selfConfigUpdateContext = {
            invokedFunctionArn: colMock.FUNCTION_ARN,
            functionName: colMock.FUNCTION_NAME
        };

        beforeEach(() => {
            collector = new AlAwsCollectorV2(selfConfigUpdateContext, 'cwe',
                AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
        });

        afterEach(() => {
            alStub.restore(S3, 'getObject');
            alStub.restore(Lambda, 'getFunctionConfiguration');
            alStub.restore(Lambda, 'updateFunctionConfiguration');
        });
        it('should update lambda function configuration successfully', async function () {
            const getLambdaFunctionConfigStub = alStub.mock(Lambda, 'getFunctionConfiguration', (params) => {
                return Promise.resolve(colMock.LAMBDA_FUNCTION_CONFIGURATION);
            });
            const s3GetObjectStub = alStub.mock(S3, 'getObject', (params) => {
                return Promise.resolve({
                    Body: {
                        transformToString: () => {
                            return Promise.resolve(JSON.stringify(colMock.S3_CONFIGURATION_FILE_CHANGE));
                        }
                    }
                });
            });
            var updateConfig = collector._filterDisallowedConfigParams(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
            alStub.mock(Lambda, 'updateFunctionConfiguration', (params) => {
                assert.deepEqual(updateConfig, params);
                return Promise.resolve(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
            });
            await collector.selfConfigUpdate();
            sinon.assert.calledOnce(s3GetObjectStub);
            sinon.assert.calledTwice(getLambdaFunctionConfigStub);
        });
    });
    describe('reportCWMetric method tests', function () {
        it('reportCWMetric success', async function () {
            let param = {
                metricName: 'custom metrics',
                nameSpace: 'PAWSCollector',
                standardUnit: 'Count',
                unitValue: 1
            }
            const putMetricDataStub = alStub.mock(CloudWatch, 'putMetricData', (param) => {
                assert.equal(param.MetricData[0].MetricName, 'custom metrics');
                assert.equal(param.MetricData[0].Unit, 'Count');
                assert.equal(param.MetricData[0].Value, 1);
                assert.equal(param.Namespace, 'PAWSCollector');
                return Promise.resolve({
                    httpStatusCode: 200,
                    requestId: '12345'
                });
            });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledOnce(putMetricDataStub);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.LOGMSGS, '1.0.0', creds, function () { });
            await collector.reportCWMetric(param);
            putMetricDataStub.restore();
        });
    });
});
