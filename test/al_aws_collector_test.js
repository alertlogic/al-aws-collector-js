const assert = require('assert');
const rewire = require('rewire');
const sinon = require('sinon');
const m_response = require('cfn-response');
const deepEqual = require('deep-equal');

const AlAwsCollector = require('../al_aws_collector');
const m_al_aws = require('../al_aws');
var m_alCollector = require('@alertlogic/al-collector-js');
const m_healthChecks = require('../health_checks');

const colMock = require('./collector_mock');
const zlib = require('zlib');
const AlAwsStatsTempl = require('../statistics_templates');
const { CloudFormation } = require("@aws-sdk/client-cloudformation"),
    { CloudWatch } = require("@aws-sdk/client-cloudwatch"),
    { KMS } = require("@aws-sdk/client-kms"),
    { Lambda } = require("@aws-sdk/client-lambda"),
    { S3 } = require("@aws-sdk/client-s3");

var alStub = require('./al_stub');
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
                return resolve();
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
            return new Promise(function(resolve, reject) {
                return reject('get error');
            });
        });
    alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
            function fakeFn(path, extraOptions) {
                return new Promise(function(resolve, reject) {
                    return reject('post error');
                });
            });
    alserviceStub.put = alStub.mock(m_alCollector.AlServiceC, 'put',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject('put error');
            });
        });
    alserviceStub.del = alStub.mock(m_alCollector.AlServiceC, 'deleteRequest',
            function fakeFn(path) {
                return new Promise(function(resolve, reject) {
                    return reject('delete error');
                });
            });
}

function restoreAlServiceStub() {
    alserviceStub.get.restore();
    alserviceStub.post.restore();
    alserviceStub.put.restore();
    alserviceStub.del.restore();
}

function mockLambdaUpdateFunctionCode() {
    alStub.mock(Lambda, 'updateFunctionCode', function (params, callback) {
        assert.equal(params.FunctionName, colMock.FUNCTION_NAME);
        assert.equal(params.S3Bucket, colMock.S3_BUCKET);
        assert.equal(params.S3Key, colMock.S3_ZIPFILE);
        return callback(null, params);
    });
}

function mockS3GetObject(returnObject) {
    alStub.mock(S3, 'getObject', function (params, callback) {
        let s3Object = {  Body: {
            transformToString: () => {
              return new Promise((resolve, reject) => {
                try {
                  resolve(JSON.stringify(returnObject));
                } catch (error) {
                  reject(error);
                }
              });
            }
          }};
        return callback(null, s3Object);
    });
}

function mockLambdaGetFunctionConfiguration(returnObject) {
    alStub.mock(Lambda, 'getFunctionConfiguration', function (params, callback) {
        return callback(null, returnObject);
    });
}

 function mockDescribeStacks(cf,stackName,callback){
    cf.describeStacks({ StackName: stackName}, (err, data) => {
        if (err) {
            callback(err);
        }
        callback(data);
    });
 }

function mockLambdaEndpointsUpdateConfiguration() {
    alStub.mock(Lambda, 'updateFunctionConfiguration', function (params, callback) {
        assert.equal(params.FunctionName, colMock.FUNCTION_NAME);
        assert.deepEqual(params.Environment, {
            Variables: {
                ingest_api: 'new-ingest-endpoint',
                azcollect_api: 'new-azcollect-endpoint',
                collector_status_api: 'new-collector-status-endpoint'
            }
        });
        return callback(null, params);
    });
}

function mockSetEnvStub() {
    setEnvStub = sinon.stub(m_al_aws, 'setEnv').callsFake((vars, callback)=>{
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
                Varaibles: vars
            }
        };
        return callback(null, returnBody);
    });
}

function mockLambdaMetricStatistics() {
    alStub.mock(CloudWatch, 'getMetricStatistics', function (params, callback) {
        var ret = colMock.CLOUDWATCH_GET_METRIC_STATS_OK;
        ret.Label = params.MetricName;
        return callback(null, ret);
    });
}

var formatFun = function (event, context, callback) {
    return callback(null, event);
};

var parseLogmsgsFun = function (m) {
    let messagePayload = {
        messageTs: 1542138053,
        priority: 11,
        progName: 'o365webhook',
        pid: undefined,
        message: m,
        messageType: 'json/azure.o365',
        messageTypeId: 'AzureActiveDirectory',
        messageTsUs: undefined
    };
    
    return messagePayload;
};

describe('al_aws_collector tests', function () {

    beforeEach(function () {
        colMock.initProcessEnv();
        alStub.mock(KMS, 'decrypt', function (params, callback) {
            const data = { Plaintext: Buffer.from('decrypted-aims-sercret-key') };
            return callback(null, data);
        });

        responseStub = sinon.stub(m_response, 'send').callsFake(
            function fakeFn(event, mockContext, responseStatus, responseData, physicalResourceId) {
                mockContext.succeed();
            });

        setAlServiceStub();
        mockSetEnvStub();
    });

    afterEach(function () {
        restoreAlServiceStub();
        setEnvStub.restore();
        responseStub.restore();
        alStub.restore(KMS, 'decrypt');
    });

    it('register success with env vars set', function (done) {
        var mockContext = {
            invokedFunctionArn: colMock.FUNCTION_ARN,
            succeed: () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                sinon.assert.neverCalledWithMatch(alserviceStub.get, colMock.GET_INGEST_URL);
                sinon.assert.neverCalledWithMatch(alserviceStub.get, colMock.GET_AZCOLLECT_URL);
                done();
            }
        };
        AlAwsCollector.load().then(function (creds) {
            var collector = new AlAwsCollector(
                mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);
        });
    });

    it('register success with env vars not set', function (done) {
        mockLambdaEndpointsUpdateConfiguration();
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
                done();
            }
        };
        AlAwsCollector.load().then(function (creds) {
            var collector = new AlAwsCollector(
                mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            let spy = sinon.spy(collector, "updateEndpoints");
            let promise = new Promise(function (resolve, reject) {
                return resolve(collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS));
            });
            promise.then((result) => {
                sinon.assert.calledOnce(spy);
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
        });
    });

    describe('checkin success', function () {

        var mockContext = {
            invokedFunctionArn: colMock.FUNCTION_ARN,
            functionName: colMock.FUNCTION_NAME
        };

        before(function () {
            alStub.mock(CloudFormation, 'describeStacks', function (params, callback) {
                assert.equal(params.StackName, colMock.STACK_NAME);
                return callback(null, colMock.CF_DESCRIBE_STACKS_RESPONSE);
            });
            mockLambdaMetricStatistics();
            colMock.initProcessEnv();
        });

        after(function () {
            alStub.restore(CloudFormation, 'describeStacks');
            alStub.restore(CloudWatch, 'getMetricStatistics');
        });

        it('checkin success registered', function(done) {
            var mockCtx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                functionName : colMock.FUNCTION_NAME,
                fail : function(error) {
                    assert.fail(error);
                },
                succeed : function() {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                }
            };
            
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                        mockCtx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };
                collector.handleEvent(testEvent);
            });
        });

        it('checkin via SNS success registered', function(done) {
            var mockCtx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                functionName : colMock.FUNCTION_NAME,
                fail : function(error) {
                    assert.fail(error);
                },
                succeed : function() {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                }
            };

            AlAwsCollector.load().then(function(creds) {
                let collector = new AlAwsCollector(
                    mockCtx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], [], ['Audit.Sharepoint', 'Audit.Exchanges']);
                const testEvent = colMock.CHECKIN_SNS_TRIGGER;
                var setCollectorStatusHealthySpy = sinon.spy(collector, 'setCollectorStatus');
                var sendCollectorStatusSpy = sinon.spy(collector, 'sendCollectorStatus');
                let promise = new Promise(function (resolve, reject) {
                    return resolve(collector.handleEvent(testEvent));
                });
                promise.then((result) => {
                    sinon.assert.calledOnce(setCollectorStatusHealthySpy);
                    sinon.assert.calledOnce(sendCollectorStatusSpy);
                });
            });
        });

        it('checkin success registered with env vars not set', function (done) {
            const envIngestApi = process.env.ingest_api;
            const envAzcollectApi = process.env.ingest_api;
            process.env.ingest_api = undefined;
            process.env.azcollect_api = undefined;
            var mockCtx = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: function (error) {
                    assert.fail(error);
                },
                succeed: function () {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                }
            };

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    mockCtx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], []);
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };
                let spy = sinon.spy(collector, "updateEndpoints");
                let promise = new Promise(function (resolve, reject) {
                    return resolve(collector.handleEvent(testEvent));
                });
                promise.then((result) => {
                    sinon.assert.calledOnce(spy);
                    assert.ok(process.env.ingest_api);
                    assert.ok(process.env.azcollect_api);
                    assert.equal(process.env.ingest_api,"new-ingest-endpoint");
                    assert.equal(process.env.azcollect_api,"new-azcollect-endpoint");
                    process.env.ingest_api = envIngestApi;
                    process.env.azcollect_api = envAzcollectApi;
                });
            });
        });

        it('checkin forced update success', function (done) {
            alserviceStub.post.restore();
            alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
                    function fakeFn(path, extraOptions) {
                        return new Promise(function(resolve, reject) {
                            return resolve({force_update: true});
                        });
                    });
            let fakeSelfUpdate =alStub.mock(AlAwsCollector, 'selfUpdate',
                (callback) => { callback(); });
            let fakeSelfConfigUpdate = alStub.mock(AlAwsCollector, 'selfConfigUpdate',
                    (callback) => { callback(); });
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    sinon.assert.called(fakeSelfConfigUpdate);
                    sinon.assert.called(fakeSelfUpdate);
                    fakeSelfUpdate.restore();
                    fakeSelfConfigUpdate.restore();
                    done();
                });
            });
        });

        it('Do not post ok status if cheking errors metric sum value greater than 0', function(done) {
            var mockContextCheckin = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                functionName : colMock.FUNCTION_NAME,
                fail : false,
                succeed: function () {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                }
            };
            
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    mockContextCheckin, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], [], ['LoginHistory', 'EventLogFile', 'ApiEvent']);
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };

                let setCollectorStatusHealthySpy = sinon.spy(collector, 'setCollectorStatus');
                let sendCollectorStatusSpy = sinon.spy(collector, 'sendCollectorStatus');

                let promise = new Promise(function (resolve, reject) {
                    return resolve(collector.handleEvent(testEvent));
                });
                promise.then((result) => {
                    sinon.assert.notCalled(setCollectorStatusHealthySpy);
                    sinon.assert.notCalled(sendCollectorStatusSpy);
                });
            });
        });
        it('checkin with custom check success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var spyHealthCheck = sinon.spy(function(callback) {
                    return callback(null);
                });
                var collector = new AlAwsCollector(
                    mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0',
                    creds, undefined, [spyHealthCheck], []
                );
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledOnce(spyHealthCheck);
                    // sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                });
            });
        });

        it('Do not post ok status if cheking lambda errors metric and custom health check errors show errors', function (done) {
            var spyCustomMetrics = sinon.stub(AlAwsStatsTempl, 'getCustomMetrics').callsFake(
                function fakeFn(functionName, metricName, namespace, customDimesions, callback) {
                    return callback(null,{ 'Label': 'PawsClientError', 'Datapoints': [{ 'Timestamp': '2017-11-21T16:40:00Z', 'Sum': 1, 'Unit': 'Count' }] });
                });

            var customErrorHealthCheck = function (callback) {
                return AlAwsStatsTempl.getCustomMetrics(colMock.FUNCTION_NAME, 'PawsClientError', 'PawsCollectors', null, (err, res) => {
                    if (res.Datapoints[0].sum > 0) {
                        callback(m_healthChecks.errorMsg('MYCODE', 'error message'));
                    }
                    callback(null);
                });
            };
            var mockContextCheckin = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: false,
                succeed: function () {
                    sinon.assert.calledOnce(spyCustomMetrics);
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    spyCustomMetrics.restore();
                    done();
                }
            };
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    mockContextCheckin, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [customErrorHealthCheck], [], []);
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };
                const setCollectorStatusSpy = sinon.spy(collector, 'setCollectorStatus');
                const sendCollectorStatusSpy = sinon.spy(collector, 'sendCollectorStatus');

                let promise = new Promise(function (resolve, reject) {
                    return resolve(collector.handleEvent(testEvent));
                });
                promise.then((result) => {
                    sinon.assert.notCalled(setCollectorStatusSpy);
                    sinon.assert.notCalled(sendCollectorStatusSpy);
                });
            });
        });
        it('checkin with custom check error', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var spyHealthCheck = sinon.spy(function(callback) {
                    return callback(m_healthChecks.errorMsg('MYCODE', 'error message'));
                });
                var collector = new AlAwsCollector(
                    mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0',
                    creds, undefined, [spyHealthCheck], []
                );
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledOnce(spyHealthCheck);
                    sinon.assert.calledWith(
                        alserviceStub.post,
                        colMock.CHECKIN_URL,
                        colMock.CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR
                    );
                    done();
                });
            });
        });
    });

    describe('checkin error', function() {

        var checkinContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        before(function () {
            alStub.mock(CloudFormation, 'describeStacks', function (params, callback) {
                assert.equal(params.StackName, colMock.STACK_NAME);
                return callback(null, colMock.CF_DESCRIBE_STACKS_FAILED_RESPONSE);
            });
            mockLambdaMetricStatistics();
        });

        after(function () {
            alStub.restore(CloudFormation, 'describeStacks');
            alStub.restore(CloudWatch, 'getMetricStatistics');
        });

        it('checkin error with healthCheck', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    checkinContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, 
                undefined, [function (asyncCallback) {
                    m_healthChecks.checkCloudFormationStatus(colMock.STACK_NAME, asyncCallback);
                }], [],[]);
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledWith(
                        alserviceStub.post,
                        colMock.CHECKIN_URL,
                        colMock.CHECKIN_ERROR_AZCOLLECT_QUERY
                    );
                    done();
                });
            });
        });
    });

    describe('checkin error throttling', function () {
        var checkinContext = {
            invokedFunctionArn: colMock.FUNCTION_ARN,
            functionName: colMock.FUNCTION_NAME
        };
        const stub = sinon.stub();
        before(function () {
            stub.onCall(0).returns(colMock.CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR);
            stub.onCall(1).returns(colMock.CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR);
            stub.onCall(2).returns(colMock.CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR);
            stub.onCall(3).returns(colMock.CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR);
            stub.onCall(4).returns(null, colMock.CF_DESCRIBE_STACKS_RESPONSE);
            alStub.mock(CloudFormation, 'describeStacks', function (params, callback) {
                return callback(stub(), colMock.CF_DESCRIBE_STACKS_RESPONSE);
            });
            const cf = new CloudFormation({ region: 'us-east-1' });
            mockDescribeStacks(cf, colMock.STACK_NAME, function (data) { return data; });
            mockDescribeStacks(cf, colMock.STACK_NAME, function (data) { return data; });
            mockLambdaMetricStatistics();
        });

        after(function () {
            alStub.restore(CloudFormation, 'describeStacks');
            alStub.restore(CloudWatch, 'getMetricStatistics');
        });

        it('healthCheck with throttling', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    checkinContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [function (asyncCallback) {
                        m_healthChecks.checkCloudFormationStatus(colMock.STACK_NAME, asyncCallback);
                    }], [], []);
                collector.checkin(function (error) {
                    assert.equal(error, undefined);
                    assert.equal(stub().code, colMock.CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR.code);
                    done();
                });
            });
        });

    });

    it('deregister success', function(done) {
        var deregisterContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            deregisterContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.deregisterSync(colMock.DEREGISTRATION_TEST_EVENT, colMock.DEREG_PARAMS);
        });
    });

    it('self update success', function(done) {
        mockLambdaUpdateFunctionCode();
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.selfUpdate(function(error) {
                assert.equal(error, undefined);
                done();
            });
        });
    });

    it('updateEndpoints success', function(done) {
        mockLambdaEndpointsUpdateConfiguration();
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.updateEndpoints(function(error) {
                assert.equal(error, undefined);
                alStub.restore(Lambda, 'updateFunctionConfiguration');
                done();
            });
        });
    });
    describe('mocking collectorStatusC', function () {
        var sendCollectorStatusStub;
        beforeEach(function () {
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });
        });
        afterEach(function () {
            sendCollectorStatusStub.restore();
        });
        it('send error status successfully', function (done) {
            var mockCtx = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: function (error) {
                    sinon.assert.calledOnce(sendCollectorStatusStub);
                    done();
                },
                succeed: function () {
                    assert.fail();
                }
            };
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    mockCtx, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                collector.done({ message: 'some_error' }, null, true);
            });
        });

        it('fail invocation without status send', function (done) {
            var mockCtx = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                functionName: colMock.FUNCTION_NAME,
                fail: function (error) {
                    sinon.assert.notCalled(sendCollectorStatusStub);
                    done();
                },
                succeed: function () {
                    assert.fail();
                }
            };
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    mockCtx, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                collector.done({ message: 'some_error' }, null, false);
            });
        });
    });
    
    describe('mocking ingestC', function() {
        var ingestCSecmsgsStub;
        var ingestCVpcFlowStub;
        var ingestCLogmsgsStub;
        var ingestCLmcStatsStub;
        
        beforeEach(function() {
            ingestCSecmsgsStub = alStub.mock(m_alCollector.IngestC, 'sendSecmsgs',
                function fakeFn(data, callback) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });

            ingestCVpcFlowStub = alStub.mock(m_alCollector.IngestC, 'sendVpcFlow',
                function fakeFn(data, callback) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });
            
            ingestCLogmsgsStub = alStub.mock(m_alCollector.IngestC, 'sendLogmsgs',
                    function fakeFn(data, callback) {
                        return new Promise (function(resolve, reject) {
                            resolve(null);
                        });
                    });
            
            ingestCLmcStatsStub = alStub.mock(m_alCollector.IngestC, 'sendLmcstats',
                function fakeFn(data, callback) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });
        });
        afterEach(function () {
            ingestCSecmsgsStub.restore();
            ingestCVpcFlowStub.restore();
            ingestCLogmsgsStub.restore();
            ingestCLmcStatsStub.restore();
        });

        it('dont send if data is falsey', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
                var data = '';
                collector.send(data, true, AlAwsCollector.IngestTypes.SECMSGS, function(error) {
                    assert.ifError(error);
                    sinon.assert.notCalled(ingestCSecmsgsStub);
                    done();
                });
            });
        });
        
        it('send secmsgs success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, true,AlAwsCollector.IngestTypes.SECMSGS, function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCSecmsgsStub);
                    zlib.deflate(data, function(compressionErr, compressed) {
                        assert.ifError(compressionErr);
                        sinon.assert.calledWith(ingestCSecmsgsStub, compressed);
                        done();
                    });
                });
            });
        });
        
        it('send log success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, false, '', function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                    sinon.assert.calledWith(ingestCLogmsgsStub, data);
                    done();
                    
                });
            });
        });

        it('send logmsgs got failed', function(done) {
                ingestCLogmsgsStub.restore();
                let logmsgErr = {"errorType":"StatusCodeError","errorMessage":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","name":"StatusCodeError","message":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","error":"{\"error\":\"body encoding invalid\"}","response":{"status": 400 },"options":{"method":"POST","url":"https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs"}};
                ingestCLogmsgsStub = alStub.mock(m_alCollector.IngestC, 'sendLogmsgs',
                function fakeFn(data, callback) {
                    return new Promise (function(resolve, reject) {
                        reject(logmsgErr);
                    });
                });
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, false, '', function(error) {
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                    sinon.assert.calledWith(ingestCLogmsgsStub, data);
                    assert.equal(error.httpErrorCode, 400);
                    assert.equal(error.message, `AWSC0018 failed at logmsgs : ${logmsgErr.message}`);
                    done();   
                });
            });
        });
        
        it('send log success with env vars not set', function (done) {
            const envIngestApi = process.env.ingest_api;
            const envAzcollectApi = process.env.ingest_api;
            process.env.ingest_api = undefined;
            process.env.azcollect_api = undefined;
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                var data = 'some-data';
                let spy = sinon.spy(collector, "updateEndpoints");
                collector.send(data, false,'',function (error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                    sinon.assert.calledWith(ingestCLogmsgsStub, data);
                    sinon.assert.calledOnce(spy);
                    assert.ok(process.env.ingest_api);
                    assert.ok(process.env.azcollect_api);
                    assert.equal(process.env.ingest_api,"new-ingest-endpoint");
                    assert.equal(process.env.azcollect_api,"new-azcollect-endpoint");
                    process.env.ingest_api = envIngestApi;
                    process.env.azcollect_api = envAzcollectApi;
                    done();
                });
            });
        });

        it('send vpcflow success', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.VPCFLOW, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, true, AlAwsCollector.IngestTypes.VPCFLOW, function (error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCVpcFlowStub);
                    zlib.deflate(data, function(compressionErr, compressed) {
                        assert.ifError(compressionErr);
                        sinon.assert.calledWith(ingestCVpcFlowStub, compressed);
                        done();
                    });
                });
            });
        });

        it('send lmcstats success', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LMCSTATS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, true, AlAwsCollector.IngestTypes.LMCSTATS, function (error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCLmcStatsStub);
                    zlib.deflate(data, function (compressionErr, compressed) {
                        assert.ifError(compressionErr);
                        sinon.assert.calledWith(ingestCLmcStatsStub, compressed);
                        done();
                    });
                });
            });
        });

        it('processLog send the logmsgs and lmcstats successfully', function (done) {
            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.processLog(data, parseLogmsgsFun, null, (error) => {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                    sinon.assert.calledOnce(ingestCLmcStatsStub);
                    done();
                });
            });
        });    
    });
    
    describe('mocking send', function() {
        var sendStub;
        before(function() {
            sendStub = alStub.mock(AlAwsCollector, 'send',
                function fakeFn(data, compress, ingestType, callback) {
                    return callback(null, null);
                });
        });
        
        after(function() {
            sendStub.restore();
        });
        
        it('process success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                collector.process(data, function (error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(sendStub);
                    sinon.assert.calledWith(sendStub, data);
                    done();
                });
            });
        });
    });

    describe('mocking sendCollectorStatus', function () {
        var updateApiEndpoint;
        var sendCollectorStatusStub;
        beforeEach(function () {
            updateApiEndpoint = alStub.mock(AlAwsCollector, 'updateApiEndpoint',function fakeFun(callback) {
                return callback(null);
            });
        });

        afterEach(function () {
            updateApiEndpoint.restore();
            sendCollectorStatusStub.restore();
        });

        it('sendCollectorStatus success', function (done) {

            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });


            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, data, function (error) {
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.calledOnce(sendCollectorStatusStub);
                    done();
                });
            });
        });

        it('sendCollectorStatus return success if collector status service return 304', function (done) {

            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        reject({ message: "Not modified", response: { status: 304 } });
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, data, function (error) {
                    assert.equal(error, null);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.calledOnce(sendCollectorStatusStub);
                    done();
                });
            });
        });

        it('sendCollectorStatus return error if collector status service return error except 304(Not Modified)', function (done) {
            let err = { message: "not able to connect ", response: { status: 503 } };
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        reject(err);
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, data, function (error) {
                    assert.deepEqual(error, err.message);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.calledOnce(sendCollectorStatusStub);
                    done();
                });
            });
        });

        it('if collector not register, it should not send the status to Collector_status service', function (done) {
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                collector._collectorId = undefined;
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, data, function (error) {
                    assert.equal(error, null);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.notCalled(sendCollectorStatusStub);
                    done();
                });
            });
        });
        it('if status is undefined, it should not send the status to Collector_status service', function (done) {
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, undefined, function (error) {
                    assert.equal(error, null);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.notCalled(sendCollectorStatusStub);
                    done();
                });
            });
        });

        it('if collector register but collector_id is NA, it should not send the status to Collector_status service', function (done) {
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                collector._collectorId = 'NA';
                const stream = process.env.al_application_id;
                collector.sendCollectorStatus(stream, data, function (error) {
                    assert.equal(error, null);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.notCalled(sendCollectorStatusStub);
                    done();
                });
            });
        });

        it('if stream is undefined or empty, it should not send the status to Collector_status service', function (done) {
            sendCollectorStatusStub = alStub.mock(m_alCollector.CollectorStatusC, 'sendStatus',
                function fakeFn(statusId, stream, data) {
                    return new Promise(function (resolve, reject) {
                        resolve(null);
                    });
                });

            AlAwsCollector.load().then(function (creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                collector._collectorId = 'NA';
                const stream = '';
                collector.sendCollectorStatus(stream, data, function (error) {
                    assert.equal(error, null);
                    sinon.assert.calledOnce(updateApiEndpoint);
                    sinon.assert.notCalled(sendCollectorStatusStub);
                    done();
                });
            });
        });
    });
    
    describe('isConfigDifferent() method', () => {
        var collector;
        var isConfigDifferentContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(isConfigDifferentContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
        });
        
        it('same', () => {
            assert.equal(
                false, 
                collector._isConfigDifferent(
                    colMock.LAMBDA_FUNCTION_CONFIGURATION, 
                    colMock.LAMBDA_FUNCTION_CONFIGURATION
                )
            );
        });
        
        it('different', () => {
            assert.equal(
                true, 
                collector._isConfigDifferent(
                    colMock.LAMBDA_FUNCTION_CONFIGURATION, 
                    colMock.LAMBDA_FUNCTION_CONFIGURATION_CHANGED
                )
            );
        });
    });
    
    describe('changeObject() function', () => {
        var collector;
        var objectRef;
        var object;
        var changeObjectContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        beforeEach(() => {
            collector = new AlAwsCollector(changeObjectContext, 'cwe',
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
                
            object = {
                keyA: { keyAA: 'valueAA' },
                keyB: 'valueB'
            };
            objectRef = JSON.parse(JSON.stringify(object));
        });

        it('sunny single key', () => {
            collector._changeObject(object, 'keyB', 'newValueB');
            objectRef.keyB = 'newValueB';
            assert(deepEqual(objectRef, object));
        });

        it('sunny nested keys', () => {
            collector._changeObject(object, 'keyA.keyAA', 'newValueAA');
            objectRef.keyA.keyAA = 'newValueAA';
            assert(deepEqual(objectRef, object));
        });

        it('sunny add a new key', () => {
            collector._changeObject(object, 'keyC', 'newValueC');
            objectRef.keyC = 'newValueC';
            assert(deepEqual(objectRef, object));
        });

        it('sunny add a new nested key', () => {
            collector._changeObject(object, 'keyA.keyAB', 'newValueAB');
            objectRef.keyA.keyAB = 'newValueAB';
            assert(deepEqual(objectRef, object));
        });

        it('error in nested key', () => {
            assert.throws(() => {
                collector._changeObject(object, 'NON_EXISTING_KEY.keyX', 'value');
            });
        });
    });

    describe('done() function', () => {
        var collector;

        it('calls success when there is no error', () => {

            const testContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => true,
                fail: () => false
            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            const doneResult = collector.done();
            assert.ok(doneResult);
        });


        it('returns errors that can be stringified in their raw state', (done) => {
            const stringifialbleError = {
                foo: "bar"
            };
            const testContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => true,
                fail: (error) => {
                    assert.equal(error, JSON.stringify(stringifialbleError));
                    done();
                }

            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            collector.done(stringifialbleError);
        });

        it('Post stream specific error when streamType is send to Done method', (done) => {
            const stringifialbleError = {
                foo: "bar"
            };
           const testContext = {
               invokedFunctionArn: colMock.FUNCTION_ARN,
               succeed: () => true,
               fail: (error) => {
                assert.equal(error, JSON.stringify(stringifialbleError));
                done();
            }
           };

           collector = new AlAwsCollector(
               testContext,
               'cwe',
               AlAwsCollector.IngestTypes.SECMSGS,
               '1.0.0',
               colMock.AIMS_TEST_CREDS
           );
           let spy = sinon.spy(collector, "sendCollectorStatus");
           let promise = new Promise(function (resolve, reject) {
               return resolve(collector.done(stringifialbleError, 'salesforce_EventLogFile'));
           });

           promise.then((result) => {
               sinon.assert.calledOnce(spy);
           });
       });

        it('returns errors that can be stringified in their raw state with env vars not set', (done) => {
            const envIngestApi = process.env.ingest_api;
            const envAzcollectApi = process.env.ingest_api;
            process.env.ingest_api = undefined;
            process.env.azcollect_api = undefined;

            const stringifialbleError = {
                foo: "bar"
            };
            const testContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => true,
                fail: (error) => {
                    assert.equal(error, JSON.stringify(stringifialbleError));
                    done();
                }

            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );
            let spy = sinon.spy(collector, "updateEndpoints");
            let promise = new Promise(function (resolve, reject) {
                return resolve(collector.done(stringifialbleError));
            });
            promise.then((result) => {
                sinon.assert.calledOnce(spy);
                assert.ok(process.env.ingest_api);
                assert.ok(process.env.azcollect_api);
                assert.equal(process.env.ingest_api,"new-ingest-endpoint");
                assert.equal(process.env.azcollect_api,"new-azcollect-endpoint");
                process.env.ingest_api = envIngestApi;
                process.env.azcollect_api = envAzcollectApi;
            });
        });

        it('returns errors that cannot be JSON stringified as a string', () => {
            const circRefError = {};
            circRefError.foo = circRefError;
            const testContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => true,
                fail: (error) => {
                    assert.notEqual(error, circRefError);
                    assert.ok(typeof error === 'string');
                    assert.equal(error, '{ foo: [Circular] }');
                }
            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            collector.done(circRefError);
        });
    });

    describe('applyConfigChanges() function', () => {
        var object;
        var newValues;
        var collector;
        var applyConfigChangesContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        beforeEach(() => {
            colMock.initProcessEnv();
            collector = new AlAwsCollector(applyConfigChangesContext, 'cwe',
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
            object = JSON.parse(JSON.stringify(colMock.LAMBDA_FUNCTION_CONFIGURATION));
            newValues = colMock.S3_CONFIGURATION_FILE_CHANGE;
        });

        it('apply new changes', () => {
            collector._applyConfigChanges(newValues, object, (err, config) => {
                assert.equal(err, undefined);
                assert(deepEqual(config, colMock.LAMBDA_FUNCTION_CONFIGURATION_CHANGED));
            });
        });

        it('apply same values (no changes)', () => {
            newValues = {
                Runtime: {
                    path: "Runtime",
                    value: "nodejs6.10"
                },
                Timeout: {
                    path: "Timeout",
                    value: 3
                },
                ChangeVariableAlApi: {
                    path: "Environment.Variables.al_api",
                    value: process.env.al_api
                }
            };
            collector._applyConfigChanges(newValues, object, (err, config) => {
                assert.equal(err, undefined);
                assert(deepEqual(config, colMock.LAMBDA_FUNCTION_CONFIGURATION));
            });
        });
    });
    
    describe('selfConfigUpdate() function', () => {
        var collector;
        var selfConfigUpdateContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(selfConfigUpdateContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
        });
        
        afterEach(() => {
            alStub.restore(S3, 'getObject');
            alStub.restore(Lambda, 'getFunctionConfiguration');
            alStub.restore(Lambda, 'updateFunctionConfiguration');
        });
        
        it('sunny config update', () => {
           var updateConfig = collector._filterDisallowedConfigParams(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
    
            mockS3GetObject(colMock.S3_CONFIGURATION_FILE_CHANGE);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
    
            alStub.mock(Lambda, 'updateFunctionConfiguration', (params, callback) => {
                assert(deepEqual(updateConfig, params));
                callback(null, colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
            });

            collector.selfConfigUpdate((err, config) => {
                assert.equal(null, err);
                assert(deepEqual(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE, config));
            });
        });

        it('no config updates', () => {
            mockS3GetObject(colMock.S3_CONFIGURATION_FILE_NOCHANGE);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
        
            alStub.mock(Lambda, 'updateFunctionConfiguration', (params, callback) => {
                throw("should not be called");
            });

            collector.selfConfigUpdate((err, config) => {
                assert.equal(null, err);
                assert.equal(config, undefined);
            });
        });

        it('non-existing config attribute', () => {
            var fileChange = {
                "Name": {
                    path: "a.b.c.d",
                    value: "my value"
                }
            };
            mockS3GetObject(fileChange);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
        
            alStub.mock(Lambda, 'updateFunctionConfiguration', (params, callback) => {
                throw("should not be called");
            });
        
            collector.selfConfigUpdate((err, config) => {
                assert.equal(`AWSC0010 Unable to apply new config values TypeError: Cannot read properties of undefined (reading 'b')`, err);
                assert.equal(config, undefined);
            });
        });
    });
    
    describe('update() method', () => {
        var collector;
        var fakeSelfUpdate;
        var fakeSelfConfigUpdate;
        var updateContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME,
            fail : function(error) {
                assert.fail(error);
            },
            succeed : function() {
            }
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(updateContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
            fakeSelfUpdate = alStub.mock(AlAwsCollector, 'selfUpdate',
                (callback) => { callback(); });
            fakeSelfConfigUpdate = alStub.mock(AlAwsCollector, 'selfConfigUpdate',
                    (callback) => { callback(); });
        });
        
        afterEach(() => {
            fakeSelfUpdate.restore();
            fakeSelfConfigUpdate.restore();
            process.env.aws_lambda_update_config_name = colMock.S3_CONFIGURATION_FILE_NAME;
        });
        
        it('code and config update', (done) => {
            collector.update((err) => {
                assert.equal(err, undefined);
            });
            
            sinon.assert.calledOnce(fakeSelfUpdate);
            sinon.assert.calledOnce(fakeSelfConfigUpdate);
            done();
        });
        
        it('code update only', (done) => {
            delete(process.env.aws_lambda_update_config_name);
            
            const testEvent = {
                RequestType: 'ScheduledEvent',
                Type: 'SelfUpdate'
            };
            collector.handleEvent(testEvent);
            
            sinon.assert.calledOnce(fakeSelfUpdate);
            sinon.assert.notCalled(fakeSelfConfigUpdate);
            done();
        });
    });

});


describe('al_aws_collector tests for setDecryptedCredentials()', function() {
    var rewireGetDecryptedCredentials;
    var collectRewire;

    const ACCESS_KEY_ID = 'access_key_id';
    const ENCRYPTED_SECRET_KEY = 'encrypted_secret_key';
    const ENCRYPTED_SECRET_KEY_BASE64 = new Buffer(ENCRYPTED_SECRET_KEY).toString('base64');
    const DECRYPTED_SECRET_KEY = 'secret_key';

    before(function(done) {
        collectRewire = rewire('../al_aws_collector');
        rewireGetDecryptedCredentials = collectRewire.__get__('getDecryptedCredentials');
        done();
    });

    beforeEach(function () {
        colMock.initProcessEnv();
    });
    
    afterEach(function() {
        alStub.restore(KMS, 'decrypt');
    });

    it('if AIMS_DECRYPTED_CREDS are declared already it returns ok', function(done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', {
            access_key_id: ACCESS_KEY_ID,
            secret_key: DECRYPTED_SECRET_KEY
        });
        alStub.mock(KMS, 'decrypt', function (data, callback) {
            throw Error('don\'t call me');
        });
        rewireGetDecryptedCredentials(function (err) { if (err === null) done(); });
    });

    it('if AIMS_DECRYPTED_CREDS are not declared KMS decryption is called', function (done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', undefined);
        process.env.aims_access_key_id = ACCESS_KEY_ID;
        process.env.aims_secret_key = ENCRYPTED_SECRET_KEY_BASE64;

        alStub.mock(KMS, 'decrypt', function (data, callback) {
            return callback(null, { Plaintext: Buffer.from(DECRYPTED_SECRET_KEY) });
        });
        rewireGetDecryptedCredentials(function (err) {
            assert.equal(err, null);
            assert.deepEqual(collectRewire.__get__('AIMS_DECRYPTED_CREDS'), {
                access_key_id: ACCESS_KEY_ID,
                secret_key: DECRYPTED_SECRET_KEY
            });
            done();
        });
    });

    it('if some error during decryption, function fails', function (done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', undefined);
        process.env.aims_access_key_id = ACCESS_KEY_ID;
        process.env.aims_secret_key = new Buffer('wrong_key').toString('base64');
        alStub.mock(KMS, 'decrypt', function (data, callback) {
            assert.equal(data.CiphertextBlob, 'wrong_key');
            return callback('error', 'stack');
        });
        rewireGetDecryptedCredentials(function(err) {
            assert.equal(err, 'error');
            done();
        });
    });
});

describe('al_aws_collector error tests', function () {

    beforeEach(function () {
        colMock.initProcessEnv();
        alStub.mock(KMS, 'decrypt', function (params, callback) {
            const data = { Plaintext: Buffer.from('decrypted-aims-sercret-key') };
            return callback(null, data);
        });

        responseStub = sinon.stub(m_response, 'send').callsFake(
            function fakeFn(event, fakeContext, responseStatus, responseData, physicalResourceId) {
                fakeContext.done();
            });

        setAlServiceErrorStub();
        alStub.mock(CloudFormation, 'describeStacks', function (params, callback) {
            assert.equal(params.StackName, colMock.STACK_NAME);
            return callback(null, colMock.CF_DESCRIBE_STACKS_RESPONSE);
        });
        mockLambdaMetricStatistics();
        mockSetEnvStub();
    });

    afterEach(function () {
        restoreAlServiceStub();
        responseStub.restore();
        setEnvStub.restore();
        alStub.restore(CloudFormation, 'describeStacks');
        alStub.restore(CloudWatch, 'getMetricStatistics');
        alStub.restore(KMS, 'decrypt');
    });

    it('register error', function (done) {
        var registerContext = {
            invokedFunctionArn: colMock.FUNCTION_ARN,
            done: () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                sinon.assert.calledWith(responseStub, sinon.match.any, sinon.match.any, m_response.FAILED, { Error: 'AWSC0003 registration error: post error' });
                done();
            }
        };
        AlAwsCollector.load().then(function (creds) {
            var collector = new AlAwsCollector(
                registerContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);
        });
    });

    it('deregister error', function(done) {
        var deregisterContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            done : () => {
                sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                sinon.assert.calledWith(responseStub, sinon.match.any, sinon.match.any, m_response.SUCCESS);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            deregisterContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.deregisterSync(colMock.DEREGISTRATION_TEST_EVENT, colMock.DEREG_PARAMS);
        });
    });

    it('checkin error', function(done) {
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
                context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
            collector.checkin(function(error) {
                assert.equal(error, 'post error');
                done();
            });
        });
    });
    
    it('default scheduled event error', function(done) {
        AlAwsCollector.load().then(function(creds) {
            let ctx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                fail : function(error) {
                    assert.equal(error, 'AWSC0009 Unknown scheduled event detail type: Unknown');
                    done();
                },
                succeed : function() {
                    assert.fail('Should not be called');
                }
            };
            var collector = new AlAwsCollector(
                ctx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, undefined, [], []);
            const testEvent = {
                RequestType: 'ScheduledEvent',
                Type: 'Unknown'
            };
            collector.handleEvent(testEvent);
        });
    });
    
    it('test stringifyError', function(done) {
        AlAwsCollector.load().then(function(creds) {
            let ctx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                fail : function(error) {
                    assert.fail('Should not be called');
                },
                succeed : function() {
                    assert.fail('Should not be called');
                }
            };
            var collector = new AlAwsCollector(
                ctx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
            
            assert.equal(collector.stringifyError('test error'), 'test error');
            assert.equal(collector.stringifyError({message:'test error message'}), '{"message":"test error message"}');
            done();
        });
    });

});
